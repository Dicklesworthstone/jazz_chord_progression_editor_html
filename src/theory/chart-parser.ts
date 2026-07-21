import {
  MAX_NORMALIZED_BEAT_NUMERATOR,
  MIDI_PPQ,
  makeBeatDuration,
  makeMeter,
  makeSpelledPitchClass,
  measureCapacity,
  type BeatDuration,
  type ChordSpec,
  type KeyContext,
  type Meter,
} from "../domain";
import { parseChordSymbolWithEvidence } from "./chord-symbol";
import { emitCanonicalChartFromValidatedDraft } from "./chart-formatter";
import {
  CHART_TEXT_DRAFT_SCHEMA,
  CHART_TEXT_GRAMMAR_ID,
  CHART_TEXT_GRAMMAR_VERSION,
  MAX_CHART_EVENTS,
  MAX_CHART_MEASURES_PER_SECTION,
  MAX_CHART_SECTIONS,
  MAX_CHART_TOKENS,
  MAX_CHART_UTF8_BYTES,
  MAX_SYMBOL_CODE_POINTS,
  type AccidentalStyle,
  type ChartDiagnostic,
  type ChartDraftSection,
  type ChartTextDraft,
  type ChartTextHeaders,
  type ChartTextParseRequest,
  type ChartTextParseResult,
  type ChartWarning,
  type InsertableChartChord,
  type SourceRange,
} from "./syntax-contract";
import type {
  DelegatedSymbolWorkEvidence,
  ParseChartTextWithEvidence,
  SyntaxWorkEvidence,
} from "./syntax-evidence-contract";

const EMPTY_FROZEN_ARRAY: readonly never[] = Object.freeze([]);
const TITLE_AND_SECTION_LIMIT = 256;
const DESCRIPTION_AND_ANNOTATION_LIMIT = 2_000;

type Termination = SyntaxWorkEvidence["termination"];

type MutableEvidence = {
  sourceUtf16CodeUnits: number;
  sourceCodePoints: number;
  sourceUtf8Bytes: number;
  maxDecodedTextCodePointsObserved: number;
  lexerCodePointsVisited: number;
  tokensProduced: number;
  parserTransitions: number;
  modifierItemsObserved: number;
  headersObserved: number;
  sectionsObserved: number;
  measuresObserved: number;
  slotsObserved: number;
  chordDelegations: number;
  allocationDivisions: number;
  numericComponentsCompared: number;
  maxSourceBigIntDigits: number;
  suggestionsCompared: number;
  diagnosticsProduced: number;
  insertableCandidatesProduced: number;
  peakTokenRecords: number;
  peakDraftNodes: number;
  peakSuggestionRecords: number;
  termination: Termination;
};

type HeaderAtom = Readonly<{
  kind: "header";
  range: SourceRange;
  directiveRange: SourceRange;
  operandRanges: readonly SourceRange[];
  operandCount: number;
  slashCount: number;
  firstOperandJsonClosed: boolean;
}>;

type SectionAtom = Readonly<{
  kind: "section";
  range: SourceRange;
  openRange: SourceRange;
  closeRange: SourceRange | null;
  markerRange: SourceRange;
  nameRange: SourceRange;
  closed: boolean;
  gapValid: boolean;
  annotationRange: SourceRange | null;
  annotationClosed: boolean;
  annotationLexicalDiagnostic: ChartDiagnostic | null;
}>;

type BarAtom = Readonly<{ kind: "bar"; range: SourceRange }>;

type SlotAtom = Readonly<{
  kind: "slot";
  range: SourceRange;
  origin: "literal" | "repeat";
  symbolRange: SourceRange;
  durationRange: SourceRange | null;
  annotationRange: SourceRange | null;
  annotationClosed: boolean;
  annotationLexicalDiagnostic: ChartDiagnostic | null;
  boundaryDestroyed: boolean;
  unclosedModifierRange: SourceRange | null;
  attachedWithoutSpacing: boolean;
  symbolCodePoints: number;
  symbolUtf8Bytes: number;
  symbolExcessRange: SourceRange | null;
}>;

type CommentAtom = Readonly<{ kind: "comment"; range: SourceRange }>;

type UnexpectedAtom = Readonly<{
  kind: "unexpected";
  range: SourceRange;
  unsupported: boolean;
}>;

type ChartAtom =
  | HeaderAtom
  | SectionAtom
  | BarAtom
  | SlotAtom
  | CommentAtom
  | UnexpectedAtom;

type LexResult =
  | Readonly<{
      ok: true;
      atoms: readonly Exclude<ChartAtom, HeaderAtom>[];
      headers: readonly HeaderAtom[];
      firstContentRange: SourceRange | null;
      retainedTokenRecords: number;
    }>
  | Readonly<{
      ok: false;
      kind: "local" | "token-limit";
      range: SourceRange;
      diagnostic: ChartDiagnostic | null;
      retainedTokenRecords: number;
      visitedEnd: number;
    }>;

type CandidateEvent = {
  ordinal: number;
  origin: "literal" | "repeat";
  repeatedFromOrdinal: number | null;
  chord: ChordSpec | null;
  duration: BeatDuration | null;
  annotation: string;
  range: SourceRange;
  symbolRange: SourceRange;
  durationRange: SourceRange | null;
  annotationRange: SourceRange | null;
  atom?: SlotAtom;
  annotationValid?: boolean;
  explicitDuration?: BeatDuration | null;
  durationValid?: boolean;
  durationSource?: "explicit" | "allocated" | null;
  canonicalChordText?: string | null;
};

type CandidateMeasure = {
  ordinal: number;
  kind: "barred" | "virtual";
  range: SourceRange;
  events: CandidateEvent[];
  slotAtoms?: readonly SlotAtom[];
  closed?: boolean;
  structurallyInvalid?: boolean;
};

type CandidateSection = {
  ordinal: number;
  kind: "implicit" | "named";
  name: string | null;
  annotation: string;
  range: SourceRange;
  measures: CandidateMeasure[];
  marker?: SectionAtom | null;
  structurallyInvalid?: boolean;
};

type ParsedDuration =
  | Readonly<{ ok: true; value: BeatDuration }>
  | Readonly<{ ok: false; diagnostic: ChartDiagnostic }>;

type DecodedString =
  | Readonly<{ ok: true; value: string; codePoints: number }>
  | Readonly<{
      ok: false;
      diagnostic: ChartDiagnostic;
      codePoints: number;
    }>;

type JsonScanResult = Readonly<{
  end: number;
  closed: boolean;
  lexicalDiagnostic: ChartDiagnostic | null;
  scalarsVisited: number;
}>;

type Preflight =
  | Readonly<{
      ok: true;
      codePoints: number;
      utf8Bytes: number;
      byteLimitRange: SourceRange | null;
    }>
  | Readonly<{
      ok: false;
      codePoints: number;
      utf8Bytes: number;
      invalidRange: SourceRange;
    }>;

function range(start: number, end: number): SourceRange {
  return Object.freeze({ start, end });
}

function messageFor(code: ChartDiagnostic["code"]): string {
  return `Chart text does not satisfy ${code}.`;
}

function diagnostic(
  code: ChartDiagnostic["code"],
  diagnosticRange: SourceRange,
): ChartDiagnostic {
  return Object.freeze({
    code,
    range: diagnosticRange,
    message: messageFor(code),
  });
}

function warning(
  code: ChartWarning["code"],
  warningRange: SourceRange,
): ChartWarning {
  return Object.freeze({
    code,
    range: warningRange,
    message: "Comments are omitted by canonical chart formatting.",
  });
}

function initialEvidence(sourceText: string): MutableEvidence {
  return {
    sourceUtf16CodeUnits: sourceText.length,
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

function utf8Width(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function preflightUnicode(sourceText: string): Preflight {
  let codePoints = 0;
  let utf8Bytes = 0;
  let byteLimitRange: SourceRange | null = null;

  for (let offset = 0; offset < sourceText.length; ) {
    const first = sourceText.charCodeAt(offset);
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = sourceText.charCodeAt(offset + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) {
        return Object.freeze({
          ok: false,
          codePoints,
          utf8Bytes,
          invalidRange: range(offset, offset + 1),
        });
      }
      codePoints += 1;
      utf8Bytes += 4;
      if (byteLimitRange === null && utf8Bytes > MAX_CHART_UTF8_BYTES) {
        byteLimitRange = range(offset, offset + 2);
      }
      offset += 2;
      continue;
    }
    if (first >= 0xdc00 && first <= 0xdfff) {
      return Object.freeze({
        ok: false,
        codePoints,
        utf8Bytes,
        invalidRange: range(offset, offset + 1),
      });
    }
    codePoints += 1;
    utf8Bytes += utf8Width(first);
    if (byteLimitRange === null && utf8Bytes > MAX_CHART_UTF8_BYTES) {
      byteLimitRange = range(offset, offset + 1);
    }
    offset += 1;
  }

  return Object.freeze({ ok: true, codePoints, utf8Bytes, byteLimitRange });
}

function isHorizontalSpace(codeUnit: string): boolean {
  return codeUnit === " " || codeUnit === "\t";
}

function isLineEndAt(sourceText: string, offset: number): boolean {
  return (
    sourceText[offset] === "\n" ||
    (sourceText[offset] === "\r" && sourceText[offset + 1] === "\n")
  );
}

function scanJsonEnd(
  sourceText: string,
  quoteStart: number,
  stopAtLineEnd: boolean,
): JsonScanResult {
  let cursor = quoteStart;
  let scalarsVisited = 0;
  let invalidJson = false;
  let invalidScalarRange: SourceRange | null = null;

  const consumeScalar = (): number | null => {
    const codePoint = sourceText.codePointAt(cursor);
    if (codePoint === undefined) return null;
    cursor += codePoint > 0xffff ? 2 : 1;
    scalarsVisited += 1;
    return codePoint;
  };

  const consumeUnicodeEscape = (): Readonly<{
    complete: boolean;
    start: number;
    value: number;
  }> => {
    const start = cursor;
    consumeScalar();
    consumeScalar();
    let value = 0;
    for (let index = 0; index < 4; index += 1) {
      const digit = hexadecimalDigitValue(sourceText[cursor]);
      if (digit === null) {
        return Object.freeze({ complete: false, start, value: 0 });
      }
      consumeScalar();
      value = value * 16 + digit;
    }
    return Object.freeze({ complete: true, start, value });
  };

  consumeScalar();
  while (cursor < sourceText.length) {
    if (stopAtLineEnd && isLineEndAt(sourceText, cursor)) {
      const encodedRange = range(quoteStart, cursor);
      return Object.freeze({
        end: cursor,
        closed: false,
        lexicalDiagnostic: diagnostic(
          "chart.annotation_unclosed",
          encodedRange,
        ),
        scalarsVisited,
      });
    }
    const codeUnit = sourceText.charCodeAt(cursor);
    if (codeUnit === 0x22) {
      consumeScalar();
      const end = cursor;
      const encodedRange = range(quoteStart, end);
      return Object.freeze({
        end,
        closed: true,
        lexicalDiagnostic:
          invalidScalarRange === null
            ? invalidJson
              ? diagnostic("chart.annotation_invalid_json", encodedRange)
              : null
            : diagnostic("chart.invalid_unicode_scalar", invalidScalarRange),
        scalarsVisited,
      });
    }
    if (codeUnit <= 0x1f) {
      invalidJson = true;
      consumeScalar();
      continue;
    }
    if (codeUnit !== 0x5c) {
      consumeScalar();
      continue;
    }

    const escaped = sourceText[cursor + 1];
    if (
      escaped === '"' ||
      escaped === "\\" ||
      escaped === "/" ||
      escaped === "b" ||
      escaped === "f" ||
      escaped === "n" ||
      escaped === "r" ||
      escaped === "t"
    ) {
      consumeScalar();
      consumeScalar();
      continue;
    }
    if (escaped !== "u") {
      invalidJson = true;
      consumeScalar();
      if (
        cursor < sourceText.length &&
        !(stopAtLineEnd && isLineEndAt(sourceText, cursor))
      ) {
        consumeScalar();
      }
      continue;
    }

    const first = consumeUnicodeEscape();
    if (!first.complete) {
      invalidJson = true;
      continue;
    }
    if (first.value >= 0xd800 && first.value <= 0xdbff) {
      if (sourceText[cursor] === "\\" && sourceText[cursor + 1] === "u") {
        const second = consumeUnicodeEscape();
        if (
          second.complete &&
          second.value >= 0xdc00 &&
          second.value <= 0xdfff
        ) {
          continue;
        }
      }
      invalidScalarRange ??= range(first.start, first.start + 6);
      continue;
    }
    if (first.value >= 0xdc00 && first.value <= 0xdfff) {
      invalidScalarRange ??= range(first.start, first.start + 6);
    }
  }
  const encodedRange = range(quoteStart, sourceText.length);
  return Object.freeze({
    end: sourceText.length,
    closed: false,
    lexicalDiagnostic: diagnostic("chart.annotation_unclosed", encodedRange),
    scalarsVisited,
  });
}

function recordToken(
  evidence: MutableEvidence,
  tokenRange: SourceRange,
): SourceRange | null {
  evidence.tokensProduced += 1;
  if (evidence.tokensProduced === MAX_CHART_TOKENS + 1) return tokenRange;
  return null;
}

function lexChart(sourceText: string, evidence: MutableEvidence): LexResult {
  const atoms: Exclude<ChartAtom, HeaderAtom>[] = [];
  const headers: HeaderAtom[] = [];
  let firstContentRange: SourceRange | null = null;
  let retainedTokenRecords = 0;
  let cursor = 0;
  let lastSlotEnd: number | null = null;

  const consumeScalar = (): number | null => {
    const codePoint = sourceText.codePointAt(cursor);
    if (codePoint === undefined) return null;
    cursor += codePoint > 0xffff ? 2 : 1;
    evidence.lexerCodePointsVisited += 1;
    return codePoint;
  };

  const consumeLineEnd = (): void => {
    if (sourceText[cursor] === "\r" && sourceText[cursor + 1] === "\n") {
      consumeScalar();
      consumeScalar();
    } else if (sourceText[cursor] === "\n") {
      consumeScalar();
    }
  };

  const pushAtom = (atom: Exclude<ChartAtom, HeaderAtom>): void => {
    atoms.push(atom);
    if (atom.kind !== "comment") firstContentRange ??= atom.range;
  };

  const countToken = (tokenRange: SourceRange): SourceRange | null => {
    const exceeded = recordToken(evidence, tokenRange);
    if (exceeded === null) retainedTokenRecords += 1;
    return exceeded;
  };

  const tokenLimit = (tokenRange: SourceRange): LexResult =>
    Object.freeze({
      ok: false,
      kind: "token-limit",
      range: tokenRange,
      diagnostic: null,
      retainedTokenRecords,
      visitedEnd: cursor,
    });

  const localStop = (
    localDiagnostic: ChartDiagnostic,
    stoppedAt: number,
  ): LexResult => {
    return Object.freeze({
      ok: false,
      kind: "local",
      range: localDiagnostic.range,
      diagnostic: localDiagnostic,
      retainedTokenRecords,
      visitedEnd: stoppedAt,
    });
  };

  while (cursor < sourceText.length) {
    if (isHorizontalSpace(sourceText[cursor] ?? "")) {
      lastSlotEnd = null;
      consumeScalar();
      continue;
    }
    if (isLineEndAt(sourceText, cursor)) {
      lastSlotEnd = null;
      consumeLineEnd();
      continue;
    }

    if (sourceText[cursor] === ";") {
      lastSlotEnd = null;
      const start = cursor;
      while (cursor < sourceText.length && !isLineEndAt(sourceText, cursor)) {
        consumeScalar();
      }
      const end = cursor;
      const commentRange = range(start, end);
      const exceeded = countToken(commentRange);
      if (exceeded !== null) return tokenLimit(exceeded);
      pushAtom(Object.freeze({ kind: "comment", range: commentRange }));
      continue;
    }

    if (sourceText[cursor] === "@") {
      lastSlotEnd = null;
      const headerStart = cursor;
      let tokenStart: number | null = null;
      let standaloneJsonToken = false;
      let jsonTokenClosed = false;
      let jsonTokenLexicalDiagnostic: ChartDiagnostic | null = null;
      let commentStart: number | null = null;
      let rawEnd = headerStart;
      let directiveRange = range(headerStart, headerStart);
      const operandRanges: SourceRange[] = [];
      let operandCount = 0;
      let slashCount = 0;
      let firstOperandJsonClosed = false;
      let tokenOrdinal = 0;
      let jsonExcessDiagnostic: ChartDiagnostic | null = null;
      const finishToken = (end: number): SourceRange | null => {
        if (tokenStart === null || tokenStart === end) {
          tokenStart = null;
          return null;
        }
        const tokenRange = range(tokenStart, end);
        const exceeded = countToken(tokenRange);
        if (
          exceeded !== null &&
          standaloneJsonToken &&
          jsonTokenLexicalDiagnostic !== null
        ) {
          jsonExcessDiagnostic = jsonTokenLexicalDiagnostic;
        }
        if (exceeded === null) {
          if (tokenOrdinal === 0) {
            directiveRange = tokenRange;
          } else {
            operandCount += 1;
            operandRanges.push(tokenRange);
            if (tokenOrdinal === 1) {
              firstOperandJsonClosed =
                standaloneJsonToken && jsonTokenClosed;
            }
          }
          tokenOrdinal += 1;
        }
        tokenStart = null;
        standaloneJsonToken = false;
        jsonTokenClosed = false;
        jsonTokenLexicalDiagnostic = null;
        return exceeded;
      };
      const stopForHeaderExcess = (
        exceeded: SourceRange | null,
      ): LexResult | null => {
        if (exceeded === null) return null;
        return jsonExcessDiagnostic === null
          ? tokenLimit(exceeded)
          : localStop(jsonExcessDiagnostic, cursor);
      };

      while (cursor < sourceText.length && !isLineEndAt(sourceText, cursor)) {
        const current = sourceText[cursor];
        if (current === ";") {
          const stopped = stopForHeaderExcess(finishToken(cursor));
          if (stopped !== null) return stopped;
          commentStart = cursor;
          break;
        }
        if (isHorizontalSpace(current ?? "")) {
          const stopped = stopForHeaderExcess(finishToken(cursor));
          if (stopped !== null) return stopped;
          consumeScalar();
          continue;
        }
        if (current === "/") {
          const stopped = stopForHeaderExcess(finishToken(cursor));
          if (stopped !== null) return stopped;
          slashCount += 1;
          consumeScalar();
          rawEnd = cursor;
          continue;
        }
        if (current === '"') {
          const quoteStart = cursor;
          if (tokenStart === null) tokenStart = quoteStart;
          standaloneJsonToken = tokenStart === quoteStart;
          const scanned = scanJsonEnd(sourceText, quoteStart, true);
          cursor = scanned.end;
          evidence.lexerCodePointsVisited += scanned.scalarsVisited;
          rawEnd = cursor;
          jsonTokenClosed = scanned.closed;
          jsonTokenLexicalDiagnostic =
            !standaloneJsonToken || scanned.lexicalDiagnostic === null
              ? null
              : scanned.lexicalDiagnostic.code ===
                  "chart.invalid_unicode_scalar"
                ? scanned.lexicalDiagnostic
                : diagnostic("chart.header_invalid", scanned.lexicalDiagnostic.range);
          if (scanned.closed && standaloneJsonToken) {
            const stopped = stopForHeaderExcess(finishToken(cursor));
            if (stopped !== null) return stopped;
          }
          continue;
        }
        if (tokenStart === null) tokenStart = cursor;
        consumeScalar();
        rawEnd = cursor;
      }
      const stopped = stopForHeaderExcess(finishToken(cursor));
      if (stopped !== null) return stopped;

      const atomRange = range(headerStart, rawEnd);
      headers.push(
        Object.freeze({
          kind: "header",
          range: atomRange,
          directiveRange,
          operandRanges: Object.freeze(operandRanges),
          operandCount,
          slashCount,
          firstOperandJsonClosed,
        }),
      );
      if (commentStart !== null) {
        while (cursor < sourceText.length && !isLineEndAt(sourceText, cursor)) {
          consumeScalar();
        }
        const commentRange = range(commentStart, cursor);
        const exceeded = countToken(commentRange);
        if (exceeded !== null) return tokenLimit(exceeded);
        pushAtom(Object.freeze({ kind: "comment", range: commentRange }));
      }
      consumeLineEnd();
      continue;
    }

    if (sourceText[cursor] === "[") {
      lastSlotEnd = null;
      const markerStart = cursor;
      const openRange = range(cursor, cursor + 1);
      const openIsPendingExcess =
        evidence.tokensProduced === MAX_CHART_TOKENS;
      let exceeded: SourceRange | null;
      consumeScalar();
      if (!openIsPendingExcess) {
        exceeded = countToken(openRange);
        if (exceeded !== null) return tokenLimit(exceeded);
      }
      const nameStart = cursor;
      let escaped = false;
      let closed = false;
      let invalidEscapeRange: SourceRange | null = null;
      while (cursor < sourceText.length && !isLineEndAt(sourceText, cursor)) {
        const current = sourceText[cursor];
        if (escaped) {
          const escapeEndStart = cursor;
          consumeScalar();
          if (current !== "]" && current !== "\\") {
            invalidEscapeRange ??= range(
              escapeEndStart - 1,
              cursor,
            );
          }
          escaped = false;
          continue;
        }
        if (current === "\\") {
          escaped = true;
          consumeScalar();
          continue;
        }
        if (current === "]") {
          closed = true;
          break;
        }
        consumeScalar();
      }
      const nameRange = range(nameStart, cursor);
      const markerRange = range(markerStart, cursor);
      if (openIsPendingExcess) {
        const pendingExcess = countToken(openRange);
        if (!closed) {
          return localStop(
            diagnostic("chart.section_name_unclosed", markerRange),
            cursor,
          );
        }
        if (invalidEscapeRange !== null) {
          return localStop(
            diagnostic("chart.section_name_escape_invalid", invalidEscapeRange),
            cursor,
          );
        }
        if (pendingExcess !== null) return tokenLimit(pendingExcess);
      }
      exceeded = countToken(nameRange);
      if (exceeded !== null) {
        if (!closed) {
          return localStop(
            diagnostic("chart.section_name_unclosed", markerRange),
            cursor,
          );
        }
        if (invalidEscapeRange !== null) {
          return localStop(
            diagnostic("chart.section_name_escape_invalid", invalidEscapeRange),
            cursor,
          );
        }
        return tokenLimit(exceeded);
      }
      if (!closed) {
        pushAtom(
          Object.freeze({
            kind: "section",
            range: markerRange,
            openRange,
            closeRange: null,
            markerRange,
            nameRange,
            closed: false,
            gapValid: isLineEndAt(sourceText, cursor),
            annotationRange: null,
            annotationClosed: true,
            annotationLexicalDiagnostic: null,
          }),
        );
        continue;
      }

      const closeStart = cursor;
      consumeScalar();
      const closeRange = range(closeStart, cursor);
      exceeded = countToken(closeRange);
      if (exceeded !== null) {
        if (invalidEscapeRange !== null) {
          return localStop(
            diagnostic("chart.section_name_escape_invalid", invalidEscapeRange),
            cursor,
          );
        }
        return tokenLimit(exceeded);
      }
      const markerEnd = cursor;
      const spacingStart = cursor;
      while (isHorizontalSpace(sourceText[cursor] ?? "")) consumeScalar();
      const hadHorizontalGap = cursor > spacingStart;
      let annotationRange: SourceRange | null = null;
      let annotationClosed = true;
      let annotationLexicalDiagnostic: ChartDiagnostic | null = null;
      if (hadHorizontalGap && sourceText[cursor] === '"') {
        const scanned = scanJsonEnd(sourceText, cursor, true);
        annotationRange = range(cursor, scanned.end);
        annotationClosed = scanned.closed;
        annotationLexicalDiagnostic = scanned.lexicalDiagnostic;
        cursor = scanned.end;
        evidence.lexerCodePointsVisited += scanned.scalarsVisited;
        exceeded = countToken(annotationRange);
        if (exceeded !== null) {
          if (annotationLexicalDiagnostic !== null) {
            return localStop(annotationLexicalDiagnostic, scanned.end);
          }
          return tokenLimit(exceeded);
        }
      }
      const completeMarkerRange = range(markerStart, markerEnd);
      const gapAnchor = annotationRange?.end ?? markerEnd;
      const gapValid =
        annotationRange === null
          ? hadHorizontalGap ||
            isLineEndAt(sourceText, markerEnd) ||
            markerEnd === sourceText.length
          : !annotationClosed ||
            isHorizontalSpace(sourceText[gapAnchor] ?? "") ||
            isLineEndAt(sourceText, gapAnchor);
      pushAtom(
        Object.freeze({
          kind: "section",
          range: range(markerStart, annotationRange?.end ?? markerEnd),
          openRange,
          closeRange,
          markerRange: completeMarkerRange,
          nameRange,
          closed: true,
          gapValid,
          annotationRange,
          annotationClosed,
          annotationLexicalDiagnostic,
        }),
      );
      continue;
    }

    if (sourceText[cursor] === "|") {
      lastSlotEnd = null;
      const barRange = range(cursor, cursor + 1);
      consumeScalar();
      const exceeded = countToken(barRange);
      if (exceeded !== null) return tokenLimit(exceeded);
      pushAtom(Object.freeze({ kind: "bar", range: barRange }));
      continue;
    }

    if (
      sourceText[cursor] === "]" ||
      sourceText[cursor] === '"' ||
      sourceText[cursor] === ":" ||
      sourceText[cursor] === "{" ||
      sourceText[cursor] === "}"
    ) {
      const start = cursor;
      const unsupported = sourceText[cursor] === ":";
      if (sourceText[cursor] === '"') {
        const scanned = scanJsonEnd(sourceText, cursor, true);
        cursor = scanned.end;
        evidence.lexerCodePointsVisited += scanned.scalarsVisited;
      } else {
        consumeScalar();
        while (
          cursor < sourceText.length &&
          !isHorizontalSpace(sourceText[cursor] ?? "") &&
          !isLineEndAt(sourceText, cursor) &&
          sourceText[cursor] !== "|" &&
          sourceText[cursor] !== ";"
        ) {
          consumeScalar();
        }
      }
      const unexpectedRange = range(start, cursor);
      const exceeded = countToken(unexpectedRange);
      if (exceeded !== null) return tokenLimit(exceeded);
      pushAtom(
        Object.freeze({
          kind: "unexpected",
          range: unexpectedRange,
          unsupported,
        }),
      );
      lastSlotEnd = null;
      continue;
    }

    if (/^[0-9.]$/u.test(sourceText[cursor] ?? "")) {
      const start = cursor;
      while (
        cursor < sourceText.length &&
        !isHorizontalSpace(sourceText[cursor] ?? "") &&
        !isLineEndAt(sourceText, cursor) &&
        sourceText[cursor] !== "|" &&
        sourceText[cursor] !== ";"
      ) {
        consumeScalar();
      }
      const unsupportedRange = range(start, cursor);
      const exceeded = countToken(unsupportedRange);
      if (exceeded !== null) return tokenLimit(exceeded);
      pushAtom(
        Object.freeze({
          kind: "unexpected",
          range: unsupportedRange,
          unsupported: true,
        }),
      );
      lastSlotEnd = null;
      continue;
    }

    const eventStart = cursor;
    const isRepeat = sourceText[cursor] === "/";
    let boundaryDestroyed = false;
    let unclosedModifierStart: number | null = null;
    let symbolCodePoints = 0;
    let symbolUtf8Bytes = 0;
    let symbolExcessRange: SourceRange | null = null;
    const consumeSymbolScalar = (): void => {
      const scalarStart = cursor;
      const codePoint = consumeScalar();
      if (codePoint === null) return;
      const width = cursor - scalarStart;
      symbolCodePoints += 1;
      symbolUtf8Bytes += utf8Width(codePoint);
      if (symbolCodePoints === MAX_SYMBOL_CODE_POINTS + 1) {
        symbolExcessRange = range(scalarStart, scalarStart + width);
      }
    };
    if (isRepeat) {
      consumeSymbolScalar();
    } else {
      let parenthesisDepth = 0;
      while (cursor < sourceText.length) {
        const current = sourceText[cursor];
        if (current === "(") {
          if (parenthesisDepth === 0) unclosedModifierStart = cursor;
          parenthesisDepth += 1;
          consumeSymbolScalar();
          continue;
        }
        if (current === ")") {
          if (parenthesisDepth > 0) parenthesisDepth -= 1;
          consumeSymbolScalar();
          if (parenthesisDepth === 0) unclosedModifierStart = null;
          continue;
        }
        if (parenthesisDepth > 0) {
          if (isLineEndAt(sourceText, cursor)) {
            boundaryDestroyed = true;
            break;
          }
          consumeSymbolScalar();
          continue;
        }
        if (
          isHorizontalSpace(current ?? "") ||
          isLineEndAt(sourceText, cursor) ||
          current === "|" ||
          current === ";" ||
          current === '"' ||
          current === ":" ||
          current === "[" ||
          current === "]" ||
          current === "@"
        ) {
          break;
        }
        consumeSymbolScalar();
      }
      if (parenthesisDepth > 0) boundaryDestroyed = true;
    }

    const symbolRange = range(eventStart, cursor);
    const unclosedModifierRange =
      unclosedModifierStart === null
        ? null
        : range(unclosedModifierStart, symbolRange.end);
    let exceeded = countToken(symbolRange);
    if (exceeded !== null) {
      if (unclosedModifierRange !== null) {
        return localStop(
          diagnostic("symbol.modifier_unclosed", unclosedModifierRange),
          symbolRange.end,
        );
      }
      return tokenLimit(exceeded);
    }
    let durationRange: SourceRange | null = null;
    if (!boundaryDestroyed && sourceText[cursor] === ":") {
      const durationStart = cursor;
      consumeScalar();
      while (
        cursor < sourceText.length &&
        !isHorizontalSpace(sourceText[cursor] ?? "") &&
        !isLineEndAt(sourceText, cursor) &&
        sourceText[cursor] !== "|" &&
        sourceText[cursor] !== ";" &&
        sourceText[cursor] !== '"' &&
        sourceText[cursor] !== "[" &&
        sourceText[cursor] !== "]" &&
        sourceText[cursor] !== "@"
      ) {
        consumeScalar();
      }
      durationRange = range(durationStart, cursor);
      exceeded = countToken(durationRange);
      if (exceeded !== null) return tokenLimit(exceeded);
    }

    const beforeSpacing = cursor;
    while (isHorizontalSpace(sourceText[cursor] ?? "")) consumeScalar();
    let annotationRange: SourceRange | null = null;
    let annotationClosed = true;
    let annotationLexicalDiagnostic: ChartDiagnostic | null = null;
    if (cursor > beforeSpacing && sourceText[cursor] === '"') {
      const scanned = scanJsonEnd(sourceText, cursor, true);
      annotationRange = range(cursor, scanned.end);
      annotationClosed = scanned.closed;
      annotationLexicalDiagnostic = scanned.lexicalDiagnostic;
      if (!scanned.closed) boundaryDestroyed = true;
      cursor = scanned.end;
      evidence.lexerCodePointsVisited += scanned.scalarsVisited;
      exceeded = countToken(annotationRange);
      if (exceeded !== null) {
        if (annotationLexicalDiagnostic !== null) {
          return localStop(annotationLexicalDiagnostic, scanned.end);
        }
        return tokenLimit(exceeded);
      }
    }
    const eventEnd = annotationRange?.end ?? durationRange?.end ?? symbolRange.end;
    pushAtom(
      Object.freeze({
        kind: "slot",
        range: range(eventStart, eventEnd),
        origin: isRepeat ? "repeat" : "literal",
        symbolRange,
        durationRange,
        annotationRange,
        annotationClosed,
        annotationLexicalDiagnostic,
        boundaryDestroyed,
        unclosedModifierRange,
        attachedWithoutSpacing: lastSlotEnd === eventStart,
        symbolCodePoints,
        symbolUtf8Bytes,
        symbolExcessRange,
      }),
    );
    lastSlotEnd = eventEnd;
  }

  evidence.parserTransitions = evidence.tokensProduced;
  return Object.freeze({
    ok: true,
    atoms: Object.freeze(atoms),
    headers: Object.freeze(headers),
    firstContentRange,
    retainedTokenRecords,
  });
}

function hexadecimalDigitValue(codeUnit: string | undefined): number | null {
  if (codeUnit === undefined) return null;
  const value = codeUnit.charCodeAt(0);
  if (value >= 0x30 && value <= 0x39) return value - 0x30;
  if (value >= 0x41 && value <= 0x46) return value - 0x41 + 10;
  if (value >= 0x61 && value <= 0x66) return value - 0x61 + 10;
  return null;
}

function hexadecimalValueAt(sourceText: string, start: number): number | null {
  let value = 0;
  for (let offset = 0; offset < 4; offset += 1) {
    const digit = hexadecimalDigitValue(sourceText[start + offset]);
    if (digit === null) return null;
    value = value * 16 + digit;
  }
  return value;
}

function decodeJsonString(
  sourceText: string,
  encodedRange: SourceRange,
  closed: boolean,
  unclosedCode: "chart.annotation_unclosed" | "chart.header_invalid",
  invalidCode: "chart.annotation_invalid_json" | "chart.header_invalid",
  codePointLimit: number,
): DecodedString {
  if (!closed) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic(unclosedCode, encodedRange),
      codePoints: 0,
    });
  }
  if (
    sourceText[encodedRange.start] !== '"' ||
    sourceText[encodedRange.end - 1] !== '"'
  ) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic(invalidCode, encodedRange),
      codePoints: 0,
    });
  }

  let codePoints = 0;
  let ordinaryInvalid = false;
  const observeScalar = (): void => {
    if (codePoints <= codePointLimit) codePoints += 1;
  };
  for (
    let cursor = encodedRange.start + 1;
    cursor < encodedRange.end - 1;
  ) {
    const current = sourceText[cursor];
    if (current !== "\\") {
      const codeUnit = sourceText.charCodeAt(cursor);
      if (codeUnit <= 0x1f || current === '"') {
        ordinaryInvalid = true;
        cursor += 1;
        continue;
      }
      if (!ordinaryInvalid) observeScalar();
      cursor += codeUnit >= 0xd800 && codeUnit <= 0xdbff ? 2 : 1;
      continue;
    }

    const escaped = sourceText[cursor + 1];
    if (
      escaped === '"' ||
      escaped === "\\" ||
      escaped === "/" ||
      escaped === "b" ||
      escaped === "f" ||
      escaped === "n" ||
      escaped === "r" ||
      escaped === "t"
    ) {
      if (!ordinaryInvalid) observeScalar();
      cursor += 2;
      continue;
    }
    if (escaped !== "u") {
      ordinaryInvalid = true;
      cursor += Math.min(2, encodedRange.end - 1 - cursor);
      continue;
    }
    const first =
      cursor + 6 <= encodedRange.end - 1
        ? hexadecimalValueAt(sourceText, cursor + 2)
        : null;
    if (first === null) {
      ordinaryInvalid = true;
      cursor += Math.min(6, encodedRange.end - 1 - cursor);
      continue;
    }
    if (first >= 0xd800 && first <= 0xdbff) {
      const lowStart = cursor + 6;
      const second =
        sourceText[lowStart] === "\\" && sourceText[lowStart + 1] === "u"
          ? hexadecimalValueAt(sourceText, lowStart + 2)
          : null;
      if (
        second === null ||
        second < 0xdc00 ||
        second > 0xdfff ||
        lowStart + 6 > encodedRange.end - 1
      ) {
        return Object.freeze({
          ok: false,
          diagnostic: diagnostic(
            "chart.invalid_unicode_scalar",
            range(cursor, cursor + 6),
          ),
          codePoints,
        });
      }
      if (!ordinaryInvalid) observeScalar();
      cursor += 12;
      continue;
    }
    if (first >= 0xdc00 && first <= 0xdfff) {
      return Object.freeze({
        ok: false,
        diagnostic: diagnostic(
          "chart.invalid_unicode_scalar",
          range(cursor, cursor + 6),
        ),
        codePoints,
      });
    }
    if (!ordinaryInvalid) observeScalar();
    cursor += 6;
  }

  if (codePoints > codePointLimit) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic(
        "limit.chart_text_code_points_exceeded",
        encodedRange,
      ),
      codePoints,
    });
  }

  if (ordinaryInvalid) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic(invalidCode, encodedRange),
      codePoints,
    });
  }

  const boundedRaw = sourceText.slice(encodedRange.start, encodedRange.end);
  let decoded: unknown;
  try {
    decoded = JSON.parse(boundedRaw);
  } catch {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic(invalidCode, encodedRange),
      codePoints,
    });
  }
  if (typeof decoded !== "string") {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic(invalidCode, encodedRange),
      codePoints,
    });
  }
  return Object.freeze({
    ok: true,
    value: decoded,
    codePoints,
  });
}

function significantDecimalRange(
  sourceText: string,
  digitsRange: SourceRange,
): SourceRange | null {
  let start = digitsRange.start;
  while (start < digitsRange.end && sourceText[start] === "0") start += 1;
  return start === digitsRange.end ? null : range(start, digitsRange.end);
}

function compareDecimalRange(
  sourceText: string,
  digitsRange: SourceRange,
  maximum: string,
): number {
  const length = digitsRange.end - digitsRange.start;
  if (length < maximum.length) return -1;
  if (length > maximum.length) return 1;
  for (let offset = 0; offset < length; offset += 1) {
    const left = sourceText.charCodeAt(digitsRange.start + offset);
    const right = maximum.charCodeAt(offset);
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function beatDurationFromBigInts(
  numerator: bigint,
  denominator: bigint,
): BeatDuration | null {
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  if (
    reducedNumerator <= 0n ||
    reducedNumerator > BigInt(MAX_NORMALIZED_BEAT_NUMERATOR) ||
    reducedDenominator <= 0n ||
    BigInt(MIDI_PPQ) % reducedDenominator !== 0n
  ) {
    return null;
  }
  const made = makeBeatDuration({
    numerator: Number(reducedNumerator),
    denominator: Number(reducedDenominator),
  });
  return made.ok ? made.value : null;
}

function parseDuration(
  sourceText: string,
  durationRange: SourceRange,
  evidence: MutableEvidence,
): ParsedDuration {
  let cursor = durationRange.start;
  if (sourceText[cursor] !== ":") {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic("chart.duration_invalid", durationRange),
    });
  }
  cursor += 1;
  const numeratorStart = cursor;
  while (cursor < durationRange.end) {
    const code = sourceText.charCodeAt(cursor) - 0x30;
    if (code < 0 || code > 9) break;
    cursor += 1;
  }
  const numeratorRawRange = range(numeratorStart, cursor);
  let denominatorRawRange: SourceRange | null = null;
  if (sourceText[cursor] === "/") {
    cursor += 1;
    const denominatorStart = cursor;
    while (cursor < durationRange.end) {
      const code = sourceText.charCodeAt(cursor) - 0x30;
      if (code < 0 || code > 9) break;
      cursor += 1;
    }
    denominatorRawRange = range(denominatorStart, cursor);
  }
  if (
    cursor !== durationRange.end ||
    numeratorRawRange.start === numeratorRawRange.end ||
    (denominatorRawRange !== null &&
      denominatorRawRange.start === denominatorRawRange.end)
  ) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic("chart.duration_invalid", durationRange),
    });
  }
  evidence.numericComponentsCompared += denominatorRawRange === null ? 1 : 2;
  const numeratorDigits = significantDecimalRange(sourceText, numeratorRawRange);
  const denominatorDigits =
    denominatorRawRange === null
      ? null
      : significantDecimalRange(sourceText, denominatorRawRange);
  if (numeratorDigits === null || denominatorDigits === null && denominatorRawRange !== null) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic("chart.duration_invalid", durationRange),
    });
  }

  if (denominatorRawRange === null) {
    if (compareDecimalRange(sourceText, numeratorDigits, "2147483647") > 0) {
      return Object.freeze({
        ok: false,
        diagnostic: diagnostic("chart.duration_not_representable", durationRange),
      });
    }
    evidence.maxSourceBigIntDigits = Math.max(
      evidence.maxSourceBigIntDigits,
      numeratorDigits.end - numeratorDigits.start,
    );
    const boundedNumerator = sourceText.slice(
      numeratorDigits.start,
      numeratorDigits.end,
    );
    const value = beatDurationFromBigInts(BigInt(boundedNumerator), 1n);
    if (value === null) {
      return Object.freeze({
        ok: false,
        diagnostic: diagnostic("chart.duration_not_representable", durationRange),
      });
    }
    return Object.freeze({ ok: true, value });
  }

  if (denominatorDigits === null) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic("chart.duration_invalid", durationRange),
    });
  }
  if (compareDecimalRange(sourceText, denominatorDigits, "960") > 0) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic("chart.duration_not_representable", durationRange),
    });
  }
  const boundedDenominator = sourceText.slice(
    denominatorDigits.start,
    denominatorDigits.end,
  );
  const denominatorNumber = Number(boundedDenominator);
  if (denominatorNumber <= 0 || MIDI_PPQ % denominatorNumber !== 0) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic("chart.duration_not_representable", durationRange),
    });
  }
  const numeratorMaximum = (
    BigInt(MAX_NORMALIZED_BEAT_NUMERATOR) * BigInt(denominatorNumber)
  ).toString();
  if (compareDecimalRange(sourceText, numeratorDigits, numeratorMaximum) > 0) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic("chart.duration_not_representable", durationRange),
    });
  }
  evidence.maxSourceBigIntDigits = Math.max(
    evidence.maxSourceBigIntDigits,
    numeratorDigits.end - numeratorDigits.start,
    denominatorDigits.end - denominatorDigits.start,
  );
  const boundedNumerator = sourceText.slice(
    numeratorDigits.start,
    numeratorDigits.end,
  );
  const value = beatDurationFromBigInts(
    BigInt(boundedNumerator),
    BigInt(boundedDenominator),
  );
  if (value === null) {
    return Object.freeze({
      ok: false,
      diagnostic: diagnostic("chart.duration_not_representable", durationRange),
    });
  }
  return Object.freeze({ ok: true, value });
}

function parseSpelledRoot(sourceText: string): KeyContext["tonic"] | null {
  const match = /^([A-G])(bb|##|b|#|𝄫|♭|𝄪|♯)?$/u.exec(sourceText);
  if (match === null) return null;
  const step = match[1];
  if (step === undefined) return null;
  const accidental = match[2] ?? "";
  let alter: number;
  switch (accidental) {
    case "":
      alter = 0;
      break;
    case "bb":
    case "𝄫":
      alter = -2;
      break;
    case "b":
    case "♭":
      alter = -1;
      break;
    case "#":
    case "♯":
      alter = 1;
      break;
    case "##":
    case "𝄪":
      alter = 2;
      break;
    default:
      return null;
  }
  const made = makeSpelledPitchClass({ step, alter });
  return made.ok ? made.value : null;
}

function immutableMeter(meter: Meter): Meter {
  return Object.freeze({
    beatsPerBar: meter.beatsPerBar,
    beatUnit: meter.beatUnit,
  });
}

function fragmentMeterIsValid(request: ChartTextParseRequest): boolean {
  if (request.mode !== "fragment") return true;
  const meter: unknown = request.meter;
  if (typeof meter !== "object" || meter === null || Array.isArray(meter)) {
    return false;
  }
  if (
    !("beatsPerBar" in meter) ||
    !("beatUnit" in meter) ||
    typeof meter.beatsPerBar !== "number" ||
    typeof meter.beatUnit !== "number"
  ) {
    return false;
  }
  return makeMeter({
    beatsPerBar: meter.beatsPerBar,
    beatUnit: meter.beatUnit,
  }).ok;
}

function defaultHeaders(request: ChartTextParseRequest): ChartTextHeaders {
  return Object.freeze({
    title: null,
    description: null,
    meter: request.mode === "fragment" ? immutableMeter(request.meter) : null,
    tempoBpm: null,
    key: null,
  });
}

type MutableHeaders = {
  title: string | null;
  description: string | null;
  meter: Meter | null;
  tempoBpm: number | null;
  key: KeyContext | null;
};

type HeaderKind = "title" | "description" | "meter" | "tempo" | "key";

function sourceSpanEquals(
  sourceText: string,
  start: number,
  end: number,
  expected: string,
): boolean {
  if (end - start !== expected.length) return false;
  for (let offset = 0; offset < expected.length; offset += 1) {
    if (sourceText[start + offset] !== expected[offset]) return false;
  }
  return true;
}

function headerKind(sourceText: string, atom: HeaderAtom): HeaderKind | null {
  const candidates = [
    ["title", "@title"],
    ["description", "@description"],
    ["meter", "@meter"],
    ["tempo", "@tempo"],
    ["key", "@key"],
  ] as const;
  for (const [kind, directive] of candidates) {
    if (
      sourceSpanEquals(
        sourceText,
        atom.directiveRange.start,
        atom.directiveRange.end,
        directive,
      )
    ) {
      return kind;
    }
  }
  return null;
}

function boundedDecimalValue(
  sourceText: string,
  digitsRange: SourceRange,
  maximum: number,
): number | null {
  if (digitsRange.start === digitsRange.end) return null;
  let value = 0;
  for (let cursor = digitsRange.start; cursor < digitsRange.end; cursor += 1) {
    const code = sourceText.charCodeAt(cursor) - 0x30;
    if (code < 0 || code > 9) return null;
    if (value > Math.floor((maximum - code) / 10)) return null;
    value = value * 10 + code;
  }
  return value;
}

type HeaderParseOutcome = Readonly<{
  textLimitDiagnostic: ChartDiagnostic | null;
  valid: boolean;
}>;

function parseHeaderAtom(
  sourceText: string,
  atom: HeaderAtom,
  kind: HeaderKind,
  headers: MutableHeaders,
  diagnostics: ChartDiagnostic[],
  evidence: MutableEvidence,
): HeaderParseOutcome {
  const firstOperand = atom.operandRanges[0];
  const secondOperand = atom.operandRanges[1];

  if (kind === "title" || kind === "description") {
    if (
      atom.operandCount !== 1 ||
      atom.slashCount !== 0 ||
      firstOperand === undefined ||
      sourceText[firstOperand.start] !== '"'
    ) {
      diagnostics.push(diagnostic("chart.header_invalid", atom.range));
      return Object.freeze({ textLimitDiagnostic: null, valid: false });
    }
    const encodedRange = firstOperand;
    const limit =
      kind === "title"
        ? TITLE_AND_SECTION_LIMIT
        : DESCRIPTION_AND_ANNOTATION_LIMIT;
    const decoded = decodeJsonString(
      sourceText,
      encodedRange,
      atom.firstOperandJsonClosed,
      "chart.header_invalid",
      "chart.header_invalid",
      limit,
    );
    evidence.maxDecodedTextCodePointsObserved = Math.max(
      evidence.maxDecodedTextCodePointsObserved,
      decoded.codePoints,
    );
    if (!decoded.ok) {
      if (decoded.diagnostic.code === "limit.chart_text_code_points_exceeded") {
        return Object.freeze({
          textLimitDiagnostic: decoded.diagnostic,
          valid: false,
        });
      }
      diagnostics.push(decoded.diagnostic);
      return Object.freeze({ textLimitDiagnostic: null, valid: false });
    }
    if (kind === "title" && decoded.value.trim().length === 0) {
      diagnostics.push(diagnostic("chart.header_invalid", encodedRange));
      return Object.freeze({ textLimitDiagnostic: null, valid: false });
    }
    if (kind === "title") headers.title = decoded.value;
    else headers.description = decoded.value;
    return Object.freeze({ textLimitDiagnostic: null, valid: true });
  }

  if (kind === "meter") {
    if (
      atom.operandCount !== 2 ||
      atom.slashCount !== 1 ||
      firstOperand === undefined ||
      secondOperand === undefined ||
      firstOperand.end + 1 !== secondOperand.start ||
      sourceText[firstOperand.end] !== "/"
    ) {
      diagnostics.push(diagnostic("chart.header_invalid", atom.range));
      return Object.freeze({ textLimitDiagnostic: null, valid: false });
    }
    const numerator = boundedDecimalValue(
      sourceText,
      firstOperand,
      32,
    );
    const unit = boundedDecimalValue(sourceText, secondOperand, 8);
    if (numerator === null || unit === null) {
      diagnostics.push(diagnostic("chart.header_invalid", atom.range));
      return Object.freeze({ textLimitDiagnostic: null, valid: false });
    }
    const made = makeMeter({
      beatsPerBar: numerator,
      beatUnit: unit,
    });
    if (!made.ok) {
      diagnostics.push(diagnostic("chart.header_invalid", atom.range));
      return Object.freeze({ textLimitDiagnostic: null, valid: false });
    } else {
      headers.meter = made.value;
    }
    return Object.freeze({ textLimitDiagnostic: null, valid: true });
  }

  if (kind === "tempo") {
    if (
      atom.operandCount !== 1 ||
      atom.slashCount !== 0 ||
      firstOperand === undefined
    ) {
      diagnostics.push(diagnostic("chart.header_invalid", atom.range));
      return Object.freeze({ textLimitDiagnostic: null, valid: false });
    }
    const tempo = boundedDecimalValue(
      sourceText,
      firstOperand,
      400,
    );
    if (tempo === null || tempo < 20) {
      diagnostics.push(diagnostic("chart.header_invalid", atom.range));
      return Object.freeze({ textLimitDiagnostic: null, valid: false });
    } else {
      headers.tempoBpm = tempo;
    }
    return Object.freeze({ textLimitDiagnostic: null, valid: true });
  }

  if (
    atom.operandCount !== 2 ||
    atom.slashCount !== 0 ||
    firstOperand === undefined ||
    secondOperand === undefined ||
    secondOperand.start === firstOperand.end ||
    !isHorizontalSpace(sourceText[firstOperand.end] ?? "")
  ) {
    diagnostics.push(diagnostic("chart.header_invalid", atom.range));
    return Object.freeze({ textLimitDiagnostic: null, valid: false });
  }
  const rootRange = firstOperand;
  const modeRange = secondOperand;
  const rawRoot =
    rootRange.end - rootRange.start <= 3
      ? sourceText.slice(rootRange.start, rootRange.end)
      : null;
  const tonic = rawRoot === null ? null : parseSpelledRoot(rawRoot);
  const mode =
    (["major", "natural-minor", "harmonic-minor", "melodic-minor"] as const).find(
      (candidate) =>
        sourceSpanEquals(sourceText, modeRange.start, modeRange.end, candidate),
    ) ?? null;
  if (
    tonic === null ||
    mode === null
  ) {
    diagnostics.push(diagnostic("chart.header_invalid", atom.range));
    return Object.freeze({ textLimitDiagnostic: null, valid: false });
  } else {
    headers.key = Object.freeze({ tonic, mode });
  }
  return Object.freeze({ textLimitDiagnostic: null, valid: true });
}

function parseHeaders(
  sourceText: string,
  atoms: readonly HeaderAtom[],
  firstContentStart: number | null,
  request: ChartTextParseRequest,
  evidence: MutableEvidence,
  diagnostics: ChartDiagnostic[],
): Readonly<{
  headers: ChartTextHeaders;
  textLimitDiagnostic: ChartDiagnostic | null;
  seenKinds: ReadonlySet<HeaderKind>;
  meterContextValid: boolean;
}> {
  const defaults = defaultHeaders(request);
  const headers: MutableHeaders = {
    title: defaults.title,
    description: defaults.description,
    meter: defaults.meter,
    tempoBpm: defaults.tempoBpm,
    key: defaults.key,
  };
  const seenKinds = new Set<HeaderKind>();
  let meterContextValid = true;

  for (const atom of atoms) {
    evidence.headersObserved += 1;
    const kind = headerKind(sourceText, atom);
    if (kind === null) {
      diagnostics.push(diagnostic("chart.header_invalid", atom.range));
      continue;
    }
    const duplicate = seenKinds.has(kind);
    seenKinds.add(kind);
    const localHeaders: MutableHeaders = { ...headers };
    const localDiagnostics: ChartDiagnostic[] = [];
    const outcome = parseHeaderAtom(
      sourceText,
      atom,
      kind,
      localHeaders,
      localDiagnostics,
      evidence,
    );
    if (outcome.textLimitDiagnostic !== null) {
      return Object.freeze({
        headers: Object.freeze({ ...headers }),
        textLimitDiagnostic: outcome.textLimitDiagnostic,
        seenKinds,
        meterContextValid,
      });
    }
    if (!outcome.valid) {
      diagnostics.push(...localDiagnostics);
      if (kind === "meter" && request.mode === "document") {
        meterContextValid = false;
      }
      continue;
    }
    if (request.mode === "fragment") {
      diagnostics.push(
        diagnostic("chart.header_forbidden_in_fragment", atom.range),
      );
      continue;
    }
    if (firstContentStart !== null && atom.range.start > firstContentStart) {
      diagnostics.push(diagnostic("chart.header_after_content", atom.range));
      if (kind === "meter") meterContextValid = false;
      continue;
    }
    if (duplicate) {
      diagnostics.push(diagnostic("chart.header_duplicate", atom.range));
      if (kind === "meter") meterContextValid = false;
      continue;
    }
    headers.title = localHeaders.title;
    headers.description = localHeaders.description;
    headers.meter = localHeaders.meter;
    headers.tempoBpm = localHeaders.tempoBpm;
    headers.key = localHeaders.key;
  }

  return Object.freeze({
    headers: Object.freeze({ ...headers }),
    textLimitDiagnostic: null,
    seenKinds,
    meterContextValid,
  });
}

function hasLineEndBetween(sourceText: string, start: number, end: number): boolean {
  for (let cursor = start; cursor < end; cursor += 1) {
    if (isLineEndAt(sourceText, cursor)) return true;
  }
  return false;
}

function unclosedMeasureEnd(sourceText: string, contentEnd: number): number {
  let cursor = contentEnd;
  while (cursor < sourceText.length) {
    if (isHorizontalSpace(sourceText[cursor] ?? "")) {
      cursor += 1;
      continue;
    }
    if (isLineEndAt(sourceText, cursor)) {
      cursor += sourceText[cursor] === "\r" ? 2 : 1;
      continue;
    }
    if (sourceText[cursor] !== ";") break;
    while (cursor < sourceText.length && !isLineEndAt(sourceText, cursor)) {
      cursor += 1;
    }
  }
  return cursor;
}

type SectionBuildState = {
  candidate: CandidateSection;
  excessSection: boolean;
  excessSectionLastMeasureEnd: number | null;
  excessSectionHadMeasure: boolean;
  firstBodyAtom: ChartAtom | null;
  fallbackRange: SourceRange | null;
  mode: "virtual" | "barred" | null;
  virtualSlots: SlotAtom[];
  opening: BarAtom | null;
  openingIsPreviousClose: boolean;
  measureSlots: SlotAtom[];
  currentMeasureInvalid: boolean;
  unsupportedReported: boolean;
  markerGapDiagnosticReported: boolean;
  rejectedAttachedBody: boolean;
  previousStructural: BarAtom | SlotAtom | UnexpectedAtom | null;
};

function buildCandidateSections(
  sourceText: string,
  atoms: readonly Exclude<ChartAtom, HeaderAtom>[],
  request: ChartTextParseRequest,
  diagnostics: ChartDiagnostic[],
  evidence: MutableEvidence,
): Readonly<{
  sections: CandidateSection[];
  warnings: readonly ChartWarning[];
  namedSectionCount: number;
}> {
  const sections: CandidateSection[] = [];
  const warnings: ChartWarning[] = [];
  let namedSectionCount = 0;
  let retainedDraftNodes = 0;
  let retainedEventSlots = 0;
  const haltState = { reached: false };
  let state: SectionBuildState | null = null;

  const begin = (
    marker: SectionAtom | null,
    fallback: SourceRange,
    excessSection = false,
  ): SectionBuildState => {
    retainedDraftNodes += 1;
    evidence.peakDraftNodes = Math.max(
      evidence.peakDraftNodes,
      retainedDraftNodes,
    );
    return {
      candidate: {
        ordinal: sections.length,
        kind: marker === null ? "implicit" : "named",
        name: null,
        annotation: "",
        range: fallback,
        measures: [],
        marker,
        structurallyInvalid: false,
      },
      excessSection,
      excessSectionLastMeasureEnd: null,
      excessSectionHadMeasure: false,
      firstBodyAtom: null,
      fallbackRange: marker === null ? fallback : null,
      mode: null,
      virtualSlots: [],
      opening: null,
      openingIsPreviousClose: false,
      measureSlots: [],
      currentMeasureInvalid: false,
      unsupportedReported: false,
      markerGapDiagnosticReported: false,
      rejectedAttachedBody: false,
      previousStructural: null,
    };
  };

  const addMeasure = (
    active: SectionBuildState,
    kind: "barred" | "virtual",
    measureRange: SourceRange,
    slots: readonly SlotAtom[],
    closed: boolean,
    structurallyInvalid: boolean,
  ): void => {
    if (active.excessSection) {
      active.excessSectionHadMeasure = true;
      active.excessSectionLastMeasureEnd = measureRange.end;
      return;
    }
    const retainedSlots: SlotAtom[] = [];
    for (const slot of slots) {
      if (retainedEventSlots >= MAX_CHART_EVENTS + 1) break;
      retainedSlots.push(slot);
      retainedEventSlots += 1;
    }
    active.candidate.measures.push({
      ordinal: active.candidate.measures.length,
      kind,
      range: measureRange,
      events: [],
      slotAtoms: Object.freeze(retainedSlots),
      closed,
      structurallyInvalid,
    });
    retainedDraftNodes += 1;
    evidence.peakDraftNodes = Math.max(
      evidence.peakDraftNodes,
      retainedDraftNodes,
    );
    if (
      active.candidate.measures.length > MAX_CHART_MEASURES_PER_SECTION ||
      retainedEventSlots > MAX_CHART_EVENTS
    ) {
      haltState.reached = true;
    }
  };

  const finalize = (followedByNamedSection: boolean): void => {
    if (state === null) return;
    const active = state;
    if (active.mode === "virtual" && active.virtualSlots.length > 0) {
      const first = active.virtualSlots[0];
      const last = active.virtualSlots[active.virtualSlots.length - 1];
      if (first !== undefined && last !== undefined) {
        addMeasure(
          active,
          "virtual",
          range(first.range.start, last.range.end),
          active.virtualSlots,
          true,
          active.candidate.structurallyInvalid ?? false,
        );
      }
    } else if (active.mode === "barred" && active.opening !== null) {
      if (!active.openingIsPreviousClose) {
        const lastSlot = active.measureSlots[active.measureSlots.length - 1];
        const end = unclosedMeasureEnd(
          sourceText,
          lastSlot?.range.end ?? active.opening.range.end,
        );
        const partialRange = range(
          active.opening.range.start,
          Math.max(active.opening.range.end, end),
        );
        let boundaryDestroyed = active.currentMeasureInvalid;
        for (const slot of active.measureSlots) {
          if (slot.boundaryDestroyed) boundaryDestroyed = true;
        }
        if (!boundaryDestroyed) {
          diagnostics.push(diagnostic("chart.measure_unclosed", partialRange));
        }
        addMeasure(
          active,
          "barred",
          partialRange,
          active.measureSlots,
          false,
          true,
        );
        active.candidate.structurallyInvalid = true;
      }
    }

    const marker = active.candidate.marker ?? null;
    if (
      marker !== null &&
      !marker.gapValid &&
      !active.markerGapDiagnosticReported &&
      active.firstBodyAtom?.kind !== "unexpected"
    ) {
      const firstBodyRange =
        active.firstBodyAtom?.kind === "slot"
          ? active.firstBodyAtom.symbolRange
          : active.firstBodyAtom?.range;
      diagnostics.push(
        diagnostic(
          "chart.unexpected_token",
          firstBodyRange ?? marker.markerRange,
        ),
      );
    }
    const firstMeasure = active.candidate.measures[0];
    const lastMeasure =
      active.candidate.measures[active.candidate.measures.length - 1];
    if (marker !== null) {
      active.candidate.range = range(
        marker.range.start,
        active.excessSectionLastMeasureEnd ??
          lastMeasure?.range.end ??
          marker.range.end,
      );
      if (
        active.candidate.measures.length === 0 &&
        !active.excessSectionHadMeasure &&
        !active.rejectedAttachedBody
      ) {
        diagnostics.push(diagnostic("chart.unexpected_token", marker.markerRange));
      }
    } else {
      const fallback = active.fallbackRange ?? range(0, 0);
      active.candidate.range =
        firstMeasure === undefined || lastMeasure === undefined
          ? fallback
          : range(firstMeasure.range.start, lastMeasure.range.end);
      if (followedByNamedSection || request.mode === "document") {
        diagnostics.push(
          diagnostic(
            request.mode === "document"
              ? "chart.document_section_required"
              : "chart.unsupported_notation",
            fallback,
          ),
        );
      }
    }
    active.candidate.ordinal = sections.length;
    sections.push(active.candidate);
    if (active.excessSection) haltState.reached = true;
    state = null;
  };

  const ensureImplicit = (fallback: SourceRange): SectionBuildState => {
    state ??= begin(null, fallback);
    return state;
  };

  for (const atom of atoms) {
    if (atom.kind === "section") {
      finalize(true);
      if (haltState.reached) break;
      namedSectionCount += 1;
      state = begin(
        atom,
        atom.range,
        namedSectionCount > MAX_CHART_SECTIONS,
      );
      continue;
    }
    if (atom.kind === "comment") {
      warnings.push(warning("chart.comments_not_round_tripped", atom.range));
      const marker = state?.candidate.marker;
      if (state !== null && marker !== null && marker !== undefined) {
        const isFirstBodyAtom = state.firstBodyAtom === null;
        state.firstBodyAtom ??= atom;
        if (isFirstBodyAtom && !marker.gapValid) {
          diagnostics.push(diagnostic("chart.unexpected_token", atom.range));
          state.markerGapDiagnosticReported = true;
          state.candidate.structurallyInvalid = true;
          state.rejectedAttachedBody = true;
        }
      }
      continue;
    }

    const active = ensureImplicit(atom.range);
    const isFirstBodyAtom = active.firstBodyAtom === null;
    active.firstBodyAtom ??= atom;
    active.fallbackRange ??= atom.range;

    const marker = active.candidate.marker ?? null;
    if (isFirstBodyAtom && marker !== null && !marker.gapValid) {
      diagnostics.push(
        diagnostic(
          "chart.unexpected_token",
          atom.kind === "slot" ? atom.symbolRange : atom.range,
        ),
      );
      active.markerGapDiagnosticReported = true;
      active.candidate.structurallyInvalid = true;
      active.rejectedAttachedBody = true;
      continue;
    }
    if (active.rejectedAttachedBody) {
      const rejected = active.firstBodyAtom;
      if (!hasLineEndBetween(sourceText, rejected.range.end, atom.range.start)) {
        continue;
      }
      // The malformed token attached to the marker invalidates that layout,
      // but a later line is an explicit chart-token boundary. Resume there so
      // independently valid chords remain available through the recovery lane.
      active.rejectedAttachedBody = false;
      active.previousStructural = null;
    }

    if (active.excessSection) {
      if (atom.kind === "bar" || atom.kind === "slot") {
        active.excessSectionHadMeasure = true;
        active.excessSectionLastMeasureEnd = atom.range.end;
      }
      continue;
    }

    if (atom.kind === "slot" && atom.attachedWithoutSpacing) {
      active.candidate.structurallyInvalid = true;
      if (active.opening !== null) active.currentMeasureInvalid = true;
      diagnostics.push(
        diagnostic("chart.unexpected_token", atom.symbolRange),
      );
      continue;
    }

    if (atom.kind === "unexpected") {
      active.candidate.structurallyInvalid = true;
      if (active.opening !== null) active.currentMeasureInvalid = true;
      let diagnosticRange = atom.range;
      if (
        atom.unsupported &&
        sourceText[atom.range.start] === ":" &&
        active.previousStructural?.kind === "bar" &&
        active.previousStructural.range.end === atom.range.start
      ) {
        diagnosticRange = range(
          active.previousStructural.range.start,
          atom.range.end,
        );
      }
      if (atom.unsupported) {
        if (!active.unsupportedReported) {
          diagnostics.push(
            diagnostic("chart.unsupported_notation", diagnosticRange),
          );
          active.unsupportedReported = true;
        }
      } else {
        diagnostics.push(diagnostic("chart.unexpected_token", diagnosticRange));
      }
      active.previousStructural = atom;
      continue;
    }

    if (atom.kind === "bar") {
      if (active.mode === "virtual") {
        active.candidate.structurallyInvalid = true;
        diagnostics.push(diagnostic("chart.unsupported_notation", atom.range));
        const firstVirtualSlot = active.virtualSlots[0];
        const lastVirtualSlot =
          active.virtualSlots[active.virtualSlots.length - 1];
        if (firstVirtualSlot !== undefined && lastVirtualSlot !== undefined) {
          addMeasure(
            active,
            "virtual",
            range(firstVirtualSlot.range.start, lastVirtualSlot.range.end),
            active.virtualSlots,
            true,
            true,
          );
        }
        active.virtualSlots = [];
      }
      active.mode = "barred";
      if (active.opening === null) {
        active.opening = atom;
        active.openingIsPreviousClose = false;
      } else if (
        active.openingIsPreviousClose &&
        hasLineEndBetween(sourceText, active.opening.range.end, atom.range.start)
      ) {
        active.opening = atom;
        active.openingIsPreviousClose = false;
        active.measureSlots = [];
        active.currentMeasureInvalid = false;
      } else {
        addMeasure(
          active,
          "barred",
          range(active.opening.range.start, atom.range.end),
          active.measureSlots,
          true,
          active.currentMeasureInvalid,
        );
        active.opening = atom;
        active.openingIsPreviousClose = true;
        active.measureSlots = [];
        active.currentMeasureInvalid = false;
      }
      active.previousStructural = atom;
      if (haltState.reached) break;
      continue;
    }

    if (active.mode === null || active.mode === "virtual") {
      active.mode = "virtual";
      active.virtualSlots.push(atom);
      active.previousStructural = atom;
      continue;
    }
    if (active.opening === null) {
      active.candidate.structurallyInvalid = true;
      diagnostics.push(diagnostic("chart.unsupported_notation", atom.range));
      addMeasure(active, "virtual", atom.range, [atom], true, true);
      active.previousStructural = atom;
      continue;
    }
    if (
      active.openingIsPreviousClose &&
      hasLineEndBetween(sourceText, active.opening.range.end, atom.range.start)
    ) {
      active.candidate.structurallyInvalid = true;
      diagnostics.push(diagnostic("chart.unsupported_notation", atom.range));
      active.opening = null;
      active.openingIsPreviousClose = false;
      addMeasure(active, "virtual", atom.range, [atom], true, true);
      active.previousStructural = atom;
      continue;
    }
    active.openingIsPreviousClose = false;
    active.measureSlots.push(atom);
    active.previousStructural = atom;
  }

  finalize(false);
  return Object.freeze({
    sections,
    warnings: Object.freeze(warnings),
    namedSectionCount,
  });
}

type SectionMetadata = Readonly<{
  name: string | null;
  annotation: string;
  textLimitDiagnostic: ChartDiagnostic | null;
  lexicallyValid: boolean;
}>;

function parseSectionMetadata(
  sourceText: string,
  marker: SectionAtom | null,
  diagnostics: ChartDiagnostic[],
  evidence: MutableEvidence,
): SectionMetadata {
  if (marker === null) {
    return Object.freeze({
      name: null,
      annotation: "",
      textLimitDiagnostic: null,
      lexicallyValid: true,
    });
  }
  if (!marker.closed) {
    diagnostics.push(
      diagnostic("chart.section_name_unclosed", marker.markerRange),
    );
    return Object.freeze({
      name: "",
      annotation: "",
      textLimitDiagnostic: null,
      lexicallyValid: false,
    });
  }

  let nameCodePoints = 0;
  let invalidEscapeRange: SourceRange | null = null;
  for (let cursor = marker.nameRange.start; cursor < marker.nameRange.end; ) {
    const current = sourceText[cursor];
    if (current === "\\") {
      const escaped = sourceText[cursor + 1];
      if (escaped !== "]" && escaped !== "\\") {
        invalidEscapeRange ??= range(
          cursor,
          Math.min(cursor + 2, marker.nameRange.end),
        );
      }
      cursor += Math.min(2, marker.nameRange.end - cursor);
    } else {
      const codeUnit = sourceText.charCodeAt(cursor);
      cursor += codeUnit >= 0xd800 && codeUnit <= 0xdbff ? 2 : 1;
    }
    if (invalidEscapeRange === null && nameCodePoints <= TITLE_AND_SECTION_LIMIT) {
      nameCodePoints += 1;
    }
  }
  evidence.maxDecodedTextCodePointsObserved = Math.max(
    evidence.maxDecodedTextCodePointsObserved,
    nameCodePoints,
  );
  if (nameCodePoints > TITLE_AND_SECTION_LIMIT) {
    return Object.freeze({
      name: "",
      annotation: "",
      textLimitDiagnostic: diagnostic(
        "limit.chart_text_code_points_exceeded",
        marker.nameRange,
      ),
      lexicallyValid: true,
    });
  }
  if (invalidEscapeRange !== null) {
    diagnostics.push(
      diagnostic("chart.section_name_escape_invalid", invalidEscapeRange),
    );
  }
  const decodedNameParts: string[] = [];
  if (invalidEscapeRange === null) {
    for (let cursor = marker.nameRange.start; cursor < marker.nameRange.end; ) {
      const current = sourceText[cursor];
      if (current === "\\") {
        const escaped = sourceText[cursor + 1];
        if (escaped !== undefined) decodedNameParts.push(escaped);
        cursor += 2;
      } else {
        const codeUnit = sourceText.charCodeAt(cursor);
        const width = codeUnit >= 0xd800 && codeUnit <= 0xdbff ? 2 : 1;
        decodedNameParts.push(sourceText.slice(cursor, cursor + width));
        cursor += width;
      }
    }
  }
  const decodedName = decodedNameParts.join("");
  if (invalidEscapeRange === null && decodedName.trim().length === 0) {
    diagnostics.push(diagnostic("chart.section_name_blank", marker.nameRange));
  }
  let annotation = "";
  let annotationLexicallyValid = true;
  if (marker.annotationRange !== null) {
    const decoded = decodeJsonString(
      sourceText,
      marker.annotationRange,
      marker.annotationClosed,
      "chart.annotation_unclosed",
      "chart.annotation_invalid_json",
      DESCRIPTION_AND_ANNOTATION_LIMIT,
    );
    evidence.maxDecodedTextCodePointsObserved = Math.max(
      evidence.maxDecodedTextCodePointsObserved,
      decoded.codePoints,
    );
    if (!decoded.ok) {
      if (decoded.diagnostic.code === "limit.chart_text_code_points_exceeded") {
        return Object.freeze({
          name: decodedName,
          annotation: "",
          textLimitDiagnostic: decoded.diagnostic,
          lexicallyValid: invalidEscapeRange === null,
        });
      }
      diagnostics.push(decoded.diagnostic);
      annotationLexicallyValid = false;
    } else {
      annotation = decoded.value;
    }
  }

  return Object.freeze({
    name: decodedName,
    annotation,
    textLimitDiagnostic: null,
    lexicallyValid:
      invalidEscapeRange === null && annotationLexicallyValid,
  });
}

function translatedSymbolDiagnostic(
  nested: Readonly<{ code: ChartDiagnostic["code"]; range: SourceRange; message: string }>,
  offset: number,
): ChartDiagnostic {
  return Object.freeze({
    code: nested.code,
    range: range(nested.range.start + offset, nested.range.end + offset),
    message: nested.message,
  });
}

function symbolCodePointLimitEvidence(
  atom: SlotAtom,
): SyntaxWorkEvidence {
  return Object.freeze({
    sourceUtf16CodeUnits: atom.symbolRange.end - atom.symbolRange.start,
    sourceCodePoints: atom.symbolCodePoints,
    sourceUtf8Bytes: atom.symbolUtf8Bytes,
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
    diagnosticsProduced: 1,
    insertableCandidatesProduced: 0,
    peakTokenRecords: 0,
    peakDraftNodes: 0,
    peakSuggestionRecords: 0,
    termination: "symbol-code-points",
  });
}

function parseEventAnnotation(
  sourceText: string,
  atom: SlotAtom,
  diagnostics: ChartDiagnostic[],
  evidence: MutableEvidence,
): Readonly<{
  annotation: string;
  valid: boolean;
  lexicallyValid: boolean;
  textLimitDiagnostic: ChartDiagnostic | null;
}> {
  if (atom.annotationRange === null) {
    return Object.freeze({
      annotation: "",
      valid: true,
      lexicallyValid: true,
      textLimitDiagnostic: null,
    });
  }
  const decoded = decodeJsonString(
    sourceText,
    atom.annotationRange,
    atom.annotationClosed,
    "chart.annotation_unclosed",
    "chart.annotation_invalid_json",
    DESCRIPTION_AND_ANNOTATION_LIMIT,
  );
  evidence.maxDecodedTextCodePointsObserved = Math.max(
    evidence.maxDecodedTextCodePointsObserved,
    decoded.codePoints,
  );
  if (!decoded.ok) {
    if (decoded.diagnostic.code === "limit.chart_text_code_points_exceeded") {
      return Object.freeze({
        annotation: "",
        valid: false,
        lexicallyValid: true,
        textLimitDiagnostic: decoded.diagnostic,
      });
    }
    diagnostics.push(decoded.diagnostic);
    return Object.freeze({
      annotation: "",
      valid: false,
      lexicallyValid: false,
      textLimitDiagnostic: null,
    });
  }
  if (atom.origin === "repeat") {
    diagnostics.push(
      diagnostic("chart.unsupported_notation", atom.annotationRange),
    );
    return Object.freeze({
      annotation: "",
      valid: false,
      lexicallyValid: true,
      textLimitDiagnostic: null,
    });
  }
  return Object.freeze({
    annotation: decoded.value,
    valid: true,
    lexicallyValid: true,
    textLimitDiagnostic: null,
  });
}

function compareRationals(
  leftNumerator: bigint,
  leftDenominator: bigint,
  rightNumerator: bigint,
  rightDenominator: bigint,
): number {
  const left = leftNumerator * rightDenominator;
  const right = rightNumerator * leftDenominator;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function addDurationToFraction(
  numerator: bigint,
  denominator: bigint,
  duration: BeatDuration,
): readonly [bigint, bigint] {
  const combinedNumerator =
    numerator * BigInt(duration.denominator) +
    BigInt(duration.numerator) * denominator;
  const combinedDenominator = denominator * BigInt(duration.denominator);
  const divisor = greatestCommonDivisor(combinedNumerator, combinedDenominator);
  return Object.freeze([
    combinedNumerator / divisor,
    combinedDenominator / divisor,
  ]);
}

function allocateMeasureDurations(
  measure: CandidateMeasure,
  slots: readonly CandidateEvent[],
  meter: Meter | null,
  diagnostics: ChartDiagnostic[],
  evidence: MutableEvidence,
): void {
  if (
    !measure.closed ||
    measure.structurallyInvalid ||
    slots.length === 0 ||
    meter === null ||
    slots.some(
      (slot) =>
        slot.chord === null || !slot.annotationValid || !slot.durationValid,
    )
  ) {
    return;
  }

  let explicitNumerator = 0n;
  let explicitDenominator = 1n;
  const undurated: CandidateEvent[] = [];
  for (const slot of slots) {
    const explicitDuration = slot.explicitDuration ?? null;
    if (explicitDuration === null) {
      undurated.push(slot);
      continue;
    }
    const added = addDurationToFraction(
      explicitNumerator,
      explicitDenominator,
      explicitDuration,
    );
    const [addedNumerator, addedDenominator] = added;
    explicitNumerator = addedNumerator;
    explicitDenominator = addedDenominator;
    slot.duration = explicitDuration;
    slot.durationSource = "explicit";
  }

  const capacity = measureCapacity(meter);
  const capacityNumerator = BigInt(capacity.numerator);
  const capacityDenominator = BigInt(capacity.denominator);
  const comparison = compareRationals(
    explicitNumerator,
    explicitDenominator,
    capacityNumerator,
    capacityDenominator,
  );
  if (comparison > 0) {
      diagnostics.push(diagnostic("chart.bar_overfilled", measure.range));
    return;
  }
  if (undurated.length === 0) {
    if (comparison < 0) {
      diagnostics.push(diagnostic("chart.bar_underfilled", measure.range));
    }
    return;
  }
  if (comparison === 0) {
    diagnostics.push(diagnostic("chart.bar_overfilled", measure.range));
    return;
  }

  const remainderNumerator =
    capacityNumerator * explicitDenominator -
    explicitNumerator * capacityDenominator;
  const remainderDenominator = capacityDenominator * explicitDenominator;
  const allocatedDenominator =
    remainderDenominator * BigInt(undurated.length);
  const allocated = beatDurationFromBigInts(
    remainderNumerator,
    allocatedDenominator,
  );
  if (allocated === null) {
    diagnostics.push(
      diagnostic("chart.bar_division_not_representable", measure.range),
    );
    return;
  }
  evidence.allocationDivisions += 1;
  for (const slot of undurated) {
    slot.duration = allocated;
    slot.durationSource = "allocated";
  }
}

type SectionsParseOutcome =
  | Readonly<{
      ok: true;
      sections: readonly CandidateSection[];
      allEvents: readonly CandidateEvent[];
    }>
  | Readonly<{
      ok: false;
      diagnostic: ChartDiagnostic;
      termination: Exclude<Termination, "complete">;
      sections: readonly CandidateSection[];
      allEvents: readonly CandidateEvent[];
    }>;

function parseSections(
  sourceText: string,
  candidateSections: readonly CandidateSection[],
  request: ChartTextParseRequest,
  headers: ChartTextHeaders,
  meterContextValid: boolean,
  accidentalStyle: AccidentalStyle,
  diagnostics: ChartDiagnostic[],
  evidence: MutableEvidence,
  delegatedSymbols: DelegatedSymbolWorkEvidence[],
): SectionsParseOutcome {
  const draftSections: CandidateSection[] = [];
  const allEvents: CandidateEvent[] = [];
  let nextEventOrdinal = 0;

  const stopped = (
    stoppedDiagnostic: ChartDiagnostic,
    termination: Exclude<Termination, "complete">,
  ): SectionsParseOutcome =>
    Object.freeze({
      ok: false,
      diagnostic: stoppedDiagnostic,
      termination,
      sections: Object.freeze(draftSections),
      allEvents: Object.freeze(allEvents),
    });

  for (const candidateSection of candidateSections) {
    const metadata = parseSectionMetadata(
      sourceText,
      candidateSection.marker ?? null,
      diagnostics,
      evidence,
    );
    if (metadata.textLimitDiagnostic !== null) {
      return stopped(metadata.textLimitDiagnostic, "chart-text-code-points");
    }

    candidateSection.name =
      candidateSection.marker === null ? null : metadata.name;
    candidateSection.annotation = metadata.annotation;
    const isDraftSection =
      candidateSection.marker !== null || request.mode === "fragment";
    const malformedFirstExcessSection =
      isDraftSection &&
      (!metadata.lexicallyValid ||
        candidateSection.marker?.gapValid === false) &&
      evidence.sectionsObserved >= MAX_CHART_SECTIONS;
    if (isDraftSection && !malformedFirstExcessSection) {
      evidence.sectionsObserved += 1;
      if (evidence.sectionsObserved > MAX_CHART_SECTIONS) {
        return stopped(
          diagnostic("limit.chart_sections_exceeded", candidateSection.range),
          "chart-sections",
        );
      }
      candidateSection.ordinal = draftSections.length;
      draftSections.push(candidateSection);
    }

    let previousReusable:
      | Readonly<{
          ordinal: number;
          chord: ChordSpec;
          canonicalChordText: string;
        }>
      | null = null;
    for (const candidateMeasure of candidateSection.measures) {
      if (candidateMeasure.closed) {
        evidence.measuresObserved += 1;
        if (candidateMeasure.ordinal >= MAX_CHART_MEASURES_PER_SECTION) {
          return stopped(
            diagnostic(
              "limit.chart_measures_per_section_exceeded",
              candidateMeasure.range,
            ),
            "chart-measures",
          );
        }
      }

      const measureEvents = candidateMeasure.events;
      for (const atom of candidateMeasure.slotAtoms ?? EMPTY_FROZEN_ARRAY) {
        const localBoundaryDiagnostic =
          atom.unclosedModifierRange !== null
            ? diagnostic(
                "symbol.modifier_unclosed",
                atom.unclosedModifierRange,
              )
            : atom.annotationLexicalDiagnostic;
        if (
          evidence.slotsObserved >= MAX_CHART_EVENTS &&
          localBoundaryDiagnostic !== null
        ) {
          diagnostics.push(localBoundaryDiagnostic);
          candidateMeasure.structurallyInvalid = true;
          continue;
        }

        evidence.slotsObserved += 1;
        const ordinal = nextEventOrdinal;
        nextEventOrdinal += 1;
        if (evidence.slotsObserved > MAX_CHART_EVENTS) {
          return stopped(
            diagnostic("limit.chart_events_exceeded", atom.range),
            "chart-events",
          );
        }

        const parsedAnnotation = parseEventAnnotation(
          sourceText,
          atom,
          diagnostics,
          evidence,
        );
        if (parsedAnnotation.textLimitDiagnostic !== null) {
          return stopped(
            parsedAnnotation.textLimitDiagnostic,
            "chart-text-code-points",
          );
        }

        let chord: ChordSpec | null = null;
        let canonicalChordText: string | null = null;
        let repeatedFromOrdinal: number | null = null;
        if (atom.origin === "literal") {
          evidence.chordDelegations += 1;
          if (atom.symbolExcessRange !== null) {
            const delegatedEvidence = symbolCodePointLimitEvidence(atom);
            delegatedSymbols.push(
              Object.freeze({
                delegationOrdinal: delegatedSymbols.length,
                symbolRange: atom.symbolRange,
                evidence: delegatedEvidence,
              }),
            );
            diagnostics.push(
              Object.freeze({
                code: "limit.symbol_code_points_exceeded",
                range: atom.symbolExcessRange,
                message: "The chord symbol exceeds the 256-scalar limit.",
              }),
            );
          } else {
            const localSource = sourceText.slice(
              atom.symbolRange.start,
              atom.symbolRange.end,
            );
            const delegated = parseChordSymbolWithEvidence(
              localSource,
              accidentalStyle,
            );
            delegatedSymbols.push(
              Object.freeze({
                delegationOrdinal: delegatedSymbols.length,
                symbolRange: atom.symbolRange,
                evidence: delegated.evidence,
              }),
            );
            evidence.peakSuggestionRecords = Math.max(
              evidence.peakSuggestionRecords,
              delegated.evidence.peakSuggestionRecords,
            );
            if (delegated.result.ok) {
              chord = delegated.result.chord;
              canonicalChordText = delegated.result.canonicalText;
            } else {
              for (const nested of delegated.result.diagnostics) {
                diagnostics.push(
                  translatedSymbolDiagnostic(nested, atom.symbolRange.start),
                );
              }
            }
          }
        } else if (!parsedAnnotation.valid) {
          // Any annotation makes a repeat invalid in the version-1 grammar.
          // Let that notation fault own the event: do not manufacture repeat
          // linkage, copy a chord, or expose the invalid repeat as insertable.
        } else if (previousReusable === null) {
          diagnostics.push(
            diagnostic("chart.repeat_without_previous", atom.range),
          );
        } else {
          chord = previousReusable.chord;
          canonicalChordText = previousReusable.canonicalChordText;
          repeatedFromOrdinal = previousReusable.ordinal;
        }

        let explicitDuration: BeatDuration | null = null;
        let durationValid = true;
        if (atom.durationRange !== null) {
          const parsed = parseDuration(sourceText, atom.durationRange, evidence);
          if (parsed.ok) {
            explicitDuration = parsed.value;
          } else {
            durationValid = false;
            diagnostics.push(parsed.diagnostic);
          }
        }

        const parsedEvent: CandidateEvent = {
          ordinal,
          origin: atom.origin,
          chord,
          repeatedFromOrdinal,
          duration: explicitDuration,
          annotation: parsedAnnotation.annotation,
          range: atom.range,
          symbolRange: atom.symbolRange,
          durationRange: atom.durationRange,
          annotationRange: atom.annotationRange,
          atom,
          annotationValid: parsedAnnotation.valid,
          explicitDuration,
          durationValid,
          durationSource: explicitDuration === null ? null : "explicit",
          canonicalChordText,
        };
        measureEvents.push(parsedEvent);
        allEvents.push(parsedEvent);
        evidence.peakDraftNodes += 1;
        if (chord !== null) {
          const reusableCanonicalText: string | null = canonicalChordText;
          if (reusableCanonicalText !== null) {
            previousReusable = Object.freeze({
              ordinal,
              chord,
              canonicalChordText: reusableCanonicalText,
            });
          }
        }
      }

      allocateMeasureDurations(
        candidateMeasure,
        measureEvents,
        meterContextValid ? headers.meter : null,
        diagnostics,
        evidence,
      );
    }
  }

  return Object.freeze({
    ok: true,
    sections: Object.freeze(draftSections),
    allEvents: Object.freeze(allEvents),
  });
}

function compareDiagnostics(left: ChartDiagnostic, right: ChartDiagnostic): number {
  if (left.range.start !== right.range.start) {
    return left.range.start - right.range.start;
  }
  if (left.range.end !== right.range.end) return left.range.end - right.range.end;
  if (left.code < right.code) return -1;
  if (left.code > right.code) return 1;
  return 0;
}

function finalizedDiagnostics(
  diagnostics: readonly ChartDiagnostic[],
): readonly ChartDiagnostic[] {
  const sorted = Array.from(diagnostics).sort(compareDiagnostics);
  const unique: ChartDiagnostic[] = [];
  let previousKey: string | null = null;
  for (const item of sorted) {
    const key = `${item.code}\u0000${item.range.start.toString()}\u0000${item.range.end.toString()}`;
    if (key === previousKey) continue;
    unique.push(item);
    previousKey = key;
  }
  return Object.freeze(unique);
}

function nonemptyDiagnostics(
  diagnostics: readonly ChartDiagnostic[],
): readonly [ChartDiagnostic, ...ChartDiagnostic[]] {
  const first = diagnostics[0];
  if (first !== undefined) {
    return Object.freeze([first, ...diagnostics.slice(1)]);
  }
  return Object.freeze([
    diagnostic("chart.unexpected_token", range(0, 0)),
  ]);
}

function makeInsertables(
  events: readonly CandidateEvent[],
): readonly InsertableChartChord[] {
  const insertables: InsertableChartChord[] = [];
  for (const event of events) {
    if (event.chord === null) continue;
    const duration =
      event.duration !== null &&
      event.durationSource !== null &&
      event.durationSource !== undefined
        ? Object.freeze({
            kind: "resolved" as const,
            source: event.durationSource,
            value: event.duration,
          })
        : Object.freeze({
            kind: "requires-caller" as const,
            reason: "chart.layout_invalid" as const,
          });
    insertables.push(
      Object.freeze({
        ordinal: event.ordinal,
        chord: event.chord,
        annotation: event.annotationValid ? event.annotation : "",
        range: event.range,
        symbolRange: event.symbolRange,
        duration,
        layoutContextPreserved: false,
      }),
    );
  }
  return Object.freeze(insertables);
}

function collectCanonicalChordTexts(
  events: readonly CandidateEvent[],
): readonly string[] | null {
  const canonicalChordTexts: string[] = [];
  for (const event of events) {
    const canonicalChordText = event.canonicalChordText ?? null;
    if (canonicalChordText === null || event.ordinal !== canonicalChordTexts.length) {
      return null;
    }
    canonicalChordTexts.push(canonicalChordText);
  }
  return Object.freeze(canonicalChordTexts);
}

function makeDraft(
  sourceText: string,
  request: ChartTextParseRequest,
  headers: ChartTextHeaders,
  sections: readonly CandidateSection[],
  evidence: MutableEvidence,
): ChartTextDraft | null {
  let draftNodeCount = 1;
  for (const section of sections) {
    draftNodeCount += 1;
    for (const measure of section.measures) {
      if (!measure.closed) return null;
      draftNodeCount += 1;
      for (const event of measure.events) {
        if (
          event.chord === null ||
          event.duration === null ||
          (event.canonicalChordText === null ||
            event.canonicalChordText === undefined)
        ) {
          return null;
        }
        draftNodeCount += 1;
      }
    }
  }

  const draftSections: ChartDraftSection[] = [];
  for (const section of sections) {
    const draftMeasures: CandidateMeasure[] = [];
    for (const measure of section.measures) {
      const draftEvents: CandidateEvent[] = [];
      for (const event of measure.events) {
        if (event.chord === null || event.duration === null) return null;
        delete event.atom;
        delete event.annotationValid;
        delete event.explicitDuration;
        delete event.durationValid;
        delete event.durationSource;
        delete event.canonicalChordText;
        Object.freeze(event);
        draftEvents.push(event);
      }
      measure.events = draftEvents;
      Object.freeze(draftEvents);
      delete measure.slotAtoms;
      delete measure.closed;
      delete measure.structurallyInvalid;
      Object.freeze(measure);
      draftMeasures.push(measure);
    }
    section.measures = draftMeasures;
    Object.freeze(draftMeasures);
    delete section.marker;
    delete section.structurallyInvalid;
    Object.freeze(section);
    draftSections.push(section as CandidateSection & ChartDraftSection);
  }
  evidence.peakDraftNodes = Math.max(evidence.peakDraftNodes, draftNodeCount);
  return Object.freeze({
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: request.mode,
    sourceText,
    headers,
    sections: Object.freeze(draftSections),
  });
}

function updatePeakTokenEvidence(
  evidence: MutableEvidence,
  retainedOuterRecords: number,
  delegatedSymbols: readonly DelegatedSymbolWorkEvidence[],
): void {
  let delegatedPeak = 0;
  for (const delegated of delegatedSymbols) {
    delegatedPeak = Math.max(
      delegatedPeak,
      delegated.evidence.peakTokenRecords,
    );
  }
  evidence.peakTokenRecords = Math.max(
    evidence.peakTokenRecords,
    Math.min(MAX_CHART_TOKENS, retainedOuterRecords) + delegatedPeak,
  );
}

function failureResult(
  sourceText: string,
  diagnostics: readonly ChartDiagnostic[],
  insertableChords: readonly InsertableChartChord[],
): ChartTextParseResult {
  return Object.freeze({
    ok: false,
    sourceText,
    diagnostics: nonemptyDiagnostics(diagnostics),
    insertableChords,
  });
}

function resultWithEvidence(
  result: ChartTextParseResult,
  evidence: MutableEvidence,
  delegatedSymbols: readonly DelegatedSymbolWorkEvidence[],
): ReturnType<ParseChartTextWithEvidence> {
  return Object.freeze({
    result,
    evidence: freezeEvidence(evidence),
    delegatedSymbols: Object.freeze(Array.from(delegatedSymbols)),
  });
}

export const parseChartTextWithEvidence: ParseChartTextWithEvidence = (
  sourceText,
  request,
  accidentalStyle,
) => {
  const evidence = initialEvidence(sourceText);
  const delegatedSymbols: DelegatedSymbolWorkEvidence[] = [];
  const preflight = preflightUnicode(sourceText);
  evidence.sourceCodePoints = preflight.codePoints;
  evidence.sourceUtf8Bytes = preflight.utf8Bytes;

  if (!preflight.ok) {
    const only = diagnostic("chart.invalid_unicode_scalar", preflight.invalidRange);
    evidence.diagnosticsProduced = 1;
    return resultWithEvidence(
      failureResult(sourceText, Object.freeze([only]), EMPTY_FROZEN_ARRAY),
      evidence,
      delegatedSymbols,
    );
  }
  if (preflight.byteLimitRange !== null) {
    const only = diagnostic(
      "limit.chart_utf8_bytes_exceeded",
      preflight.byteLimitRange,
    );
    evidence.termination = "chart-bytes";
    evidence.diagnosticsProduced = 1;
    return resultWithEvidence(
      failureResult(sourceText, Object.freeze([only]), EMPTY_FROZEN_ARRAY),
      evidence,
      delegatedSymbols,
    );
  }

  if (!fragmentMeterIsValid(request)) {
    const only = diagnostic("chart.draft_unformattable", range(0, 0));
    evidence.diagnosticsProduced = 1;
    return resultWithEvidence(
      failureResult(sourceText, Object.freeze([only]), EMPTY_FROZEN_ARRAY),
      evidence,
      delegatedSymbols,
    );
  }

  const lexed = lexChart(sourceText, evidence);
  if (!lexed.ok) {
    evidence.parserTransitions = evidence.tokensProduced;
    evidence.peakTokenRecords = lexed.retainedTokenRecords;
    evidence.diagnosticsProduced = 1;
    const only =
      lexed.kind === "local" && lexed.diagnostic !== null
        ? lexed.diagnostic
        : diagnostic("limit.chart_tokens_exceeded", lexed.range);
    if (lexed.kind === "token-limit") {
      evidence.termination = "chart-tokens";
    }
    return resultWithEvidence(
      failureResult(sourceText, Object.freeze([only]), EMPTY_FROZEN_ARRAY),
      evidence,
      delegatedSymbols,
    );
  }

  const diagnostics: ChartDiagnostic[] = [];
  const hasNonCommentAtom =
    lexed.headers.length > 0 ||
    lexed.firstContentRange !== null;
  if (!hasNonCommentAtom) {
    const only = diagnostic("chart.empty", range(0, 0));
    evidence.diagnosticsProduced = 1;
    updatePeakTokenEvidence(
      evidence,
      lexed.retainedTokenRecords,
      delegatedSymbols,
    );
    return resultWithEvidence(
      failureResult(sourceText, Object.freeze([only]), EMPTY_FROZEN_ARRAY),
      evidence,
      delegatedSymbols,
    );
  }

  const parsedHeaders = parseHeaders(
    sourceText,
    lexed.headers,
    lexed.firstContentRange?.start ?? null,
    request,
    evidence,
    diagnostics,
  );
  if (parsedHeaders.textLimitDiagnostic !== null) {
    evidence.termination = "chart-text-code-points";
    evidence.diagnosticsProduced = 1;
    updatePeakTokenEvidence(
      evidence,
      lexed.retainedTokenRecords,
      delegatedSymbols,
    );
    return resultWithEvidence(
      failureResult(
        sourceText,
        Object.freeze([parsedHeaders.textLimitDiagnostic]),
        EMPTY_FROZEN_ARRAY,
      ),
      evidence,
      delegatedSymbols,
    );
  }

  const candidateBuild = buildCandidateSections(
    sourceText,
    lexed.atoms,
    request,
    diagnostics,
    evidence,
  );
  const parsedSections = parseSections(
    sourceText,
    candidateBuild.sections,
    request,
    parsedHeaders.headers,
    parsedHeaders.meterContextValid,
    accidentalStyle,
    diagnostics,
    evidence,
    delegatedSymbols,
  );
  updatePeakTokenEvidence(
    evidence,
    lexed.retainedTokenRecords,
    delegatedSymbols,
  );
  if (!parsedSections.ok) {
    evidence.termination = parsedSections.termination;
    evidence.diagnosticsProduced = 1;
    return resultWithEvidence(
      failureResult(
        sourceText,
        Object.freeze([parsedSections.diagnostic]),
        EMPTY_FROZEN_ARRAY,
      ),
      evidence,
      delegatedSymbols,
    );
  }

  if (request.mode === "document") {
    if (!parsedHeaders.seenKinds.has("meter")) {
      diagnostics.push(diagnostic("chart.meter_required", range(0, 0)));
    }
    if (candidateBuild.namedSectionCount === 0) {
      diagnostics.push(
        diagnostic(
          "chart.document_section_required",
          lexed.firstContentRange ?? range(sourceText.length, sourceText.length),
        ),
      );
    }
  }

  const finalized = finalizedDiagnostics(diagnostics);
  if (finalized.length > 0) {
    const insertables = makeInsertables(parsedSections.allEvents);
    evidence.diagnosticsProduced = finalized.length;
    evidence.insertableCandidatesProduced = insertables.length;
    return resultWithEvidence(
      failureResult(sourceText, finalized, insertables),
      evidence,
      delegatedSymbols,
    );
  }

  const canonicalChordTexts = collectCanonicalChordTexts(
    parsedSections.allEvents,
  );
  if (canonicalChordTexts === null) {
    const only = diagnostic("chart.unexpected_token", range(0, 0));
    const insertables = makeInsertables(parsedSections.allEvents);
    evidence.diagnosticsProduced = 1;
    evidence.insertableCandidatesProduced = insertables.length;
    return resultWithEvidence(
      failureResult(sourceText, Object.freeze([only]), insertables),
      evidence,
      delegatedSymbols,
    );
  }

  const draft = makeDraft(
    sourceText,
    request,
    parsedHeaders.headers,
    parsedSections.sections,
    evidence,
  );
  if (draft === null) {
    const only = diagnostic("chart.unexpected_token", range(0, 0));
    evidence.diagnosticsProduced = 1;
    const insertables = makeInsertables(parsedSections.allEvents);
    evidence.insertableCandidatesProduced = insertables.length;
    return resultWithEvidence(
      failureResult(sourceText, Object.freeze([only]), insertables),
      evidence,
      delegatedSymbols,
    );
  }

  const canonicalText = emitCanonicalChartFromValidatedDraft(
    draft,
    accidentalStyle,
    canonicalChordTexts,
  );
  if (canonicalText === null) {
    const only = diagnostic("chart.unexpected_token", range(0, 0));
    evidence.diagnosticsProduced = 1;
    return resultWithEvidence(
      failureResult(sourceText, Object.freeze([only]), EMPTY_FROZEN_ARRAY),
      evidence,
      delegatedSymbols,
    );
  }

  const warnings = candidateBuild.warnings;
  evidence.diagnosticsProduced = warnings.length;
  const result: ChartTextParseResult = Object.freeze({
    ok: true,
    draft,
    canonicalText,
    warnings,
  });
  return resultWithEvidence(result, evidence, delegatedSymbols);
};

export const parseChartText = (
  ...parameters: Parameters<ParseChartTextWithEvidence>
): ChartTextParseResult => parseChartTextWithEvidence(...parameters).result;
