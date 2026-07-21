import {
  makeChordSpec,
  type ChordDegree,
  type ChordSpec,
  type DegreeNumber,
  type SpelledPitchClass,
  type Step,
} from "../domain";
import type {
  FormatChordSymbolWithEvidence,
  ParseChordSymbolWithEvidence,
  SyntaxWorkEvidence,
} from "./syntax-evidence-contract";
import {
  CHORD_SYMBOL_SUGGESTION_REPLACEMENTS,
  MAX_DID_YOU_MEAN,
  MAX_SYMBOL_CODE_POINTS,
  MAX_SYMBOL_MODIFIERS,
  MAX_SYMBOL_TOKENS,
  type AccidentalStyle,
  type ChordSymbolFormatResult,
  type ChordSymbolParseResult,
  type FormatChordSymbol,
  type ParseChordSymbol,
  type SourceRange,
  type SymbolDiagnostic,
  type SymbolErrorCode,
} from "./syntax-contract";

type SymbolTermination = Extract<
  SyntaxWorkEvidence["termination"],
  "complete" | "symbol-code-points" | "symbol-tokens" | "symbol-modifiers"
>;

type Preflight = Readonly<{
  codePoints: number;
  utf8Bytes: number;
  visitedEnd: number;
  invalidRange: SourceRange | null;
  excessRange: SourceRange | null;
}>;

type LexLimit = Readonly<{
  code: "limit.symbol_tokens_exceeded" | "limit.symbol_modifiers_exceeded";
  range: SourceRange;
  termination: "symbol-tokens" | "symbol-modifiers";
}>;

type LexToken = Readonly<{
  kind:
    | "root"
    | "root-accidental"
    | "family"
    | "lexeme"
    | "slash"
    | "bass-root"
    | "bass-accidental"
    | "open"
    | "close"
    | "comma";
  lexeme: string;
  range: SourceRange;
  gapBefore: SourceRange | null;
  modifierItem: boolean;
}>;

type LexEvidence = Readonly<{
  codePointsVisited: number;
  tokensProduced: number;
  modifierItemsObserved: number;
  peakTokenRecords: number;
  tokens: readonly LexToken[];
  firstUnclosedParenthesis: number | null;
  firstForbiddenWhitespace: SourceRange | null;
  limit: LexLimit | null;
}>;

type DegreeEntry = Readonly<{
  number: DegreeNumber;
  alter: -1 | 0 | 1;
  range: SourceRange;
}>;

type OmissionEntry = Readonly<{
  number: 3 | 5;
  range: SourceRange;
}>;

type ParsedPitch = Readonly<{
  value: SpelledPitchClass;
  end: number;
}>;

type FailedSuggestionSlot = Readonly<{
  grammarRegion: "quality" | "sixth-family";
  failedToken: string;
  tokenStart: number;
  tokenEnd: number;
}>;

type MutableParseState = {
  cursor: number;
  root: SpelledPitchClass;
  triad: ChordSpec["triad"];
  sixth: ChordSpec["sixth"];
  seventh: ChordSpec["seventh"];
  extensions: DegreeEntry[];
  additions: DegreeEntry[];
  alterations: DegreeEntry[];
  omissions: OmissionEntry[];
  bass: SpelledPitchClass | null;
  colorPolicy: ChordSpec["colorPolicy"];
  family:
    | "bare-major"
    | "major-marked"
    | "minor"
    | "diminished"
    | "augmented"
    | "half-diminished"
    | "power"
    | "dominant"
    | "sixth"
    | "minor-major"
    | "altered-dominant";
  restrictedTail: boolean;
  suspensionSeen: boolean;
  altSeen: boolean;
  sixthFamilyEnd: number | null;
  sixthFamilyIncludesNinth: boolean;
  diagnostics: SymbolDiagnostic[];
  suggestionSlot: FailedSuggestionSlot | null;
};

type Modifier =
  | Readonly<{
      kind: "alteration";
      degree: DegreeNumber;
      alter: -1 | 1;
      end: number;
    }>
  | Readonly<{
      kind: "addition";
      degree: DegreeNumber;
      end: number;
    }>
  | Readonly<{
      kind: "omission";
      degree: 3 | 5;
      end: number;
    }>
  | Readonly<{ kind: "major-seventh"; end: number }>
  | Readonly<{ kind: "alt"; end: number }>;

const EMPTY_WARNINGS: readonly [] = Object.freeze([]);
const EMPTY_LEX_TOKENS: readonly LexToken[] = Object.freeze([]);

const RECOGNIZED_LEXEMES = [
  "mMaj7",
  "m7b5",
  "maj13",
  "maj11",
  "add13",
  "add11",
  "omit5",
  "omit3",
  "maj9",
  "maj7",
  "sus4",
  "sus2",
  "add9",
  "add6",
  "add4",
  "add3",
  "add2",
  "no5",
  "no3",
  "M13",
  "M11",
  "Δ13",
  "Δ11",
  "m13",
  "m11",
  "6/9",
  "dim",
  "aug",
  "min",
  "maj",
  "sus",
  "alt",
  "M9",
  "M7",
  "Δ9",
  "Δ7",
  "b13",
  "#13",
  "♭13",
  "♯13",
  "b11",
  "#11",
  "♭11",
  "♯11",
  "b9",
  "#9",
  "♭9",
  "♯9",
  "b5",
  "#5",
  "♭5",
  "♯5",
  "dom7",
  "mi7",
  "Maj7",
  "foo",
  "m",
  "-",
  "o",
  "°",
  "+",
  "x",
] as const;

const QUALITY_HEAD_LEXEMES = [
  "maj",
  "min",
  "dim",
  "aug",
  "m",
  "-",
  "o",
  "°",
  "+",
] as const;

const FAMILY_TAIL_LEXEMES = [
  "6/9",
  "maj13",
  "maj11",
  "maj9",
  "maj7",
  "M13",
  "M11",
  "M9",
  "M7",
  "Δ13",
  "Δ11",
  "Δ9",
  "Δ7",
  "13",
  "11",
  "9",
  "7",
  "6",
] as const;

const INITIAL_FAMILY_LEXEMES: readonly string[] = Object.freeze(
  Array.from(
    new Set([
      "m7b5",
      "mMaj13",
      "mMaj11",
      "mMaj9",
      "mMaj7",
      "ø7",
      "ø",
      "5",
      "foo",
      "dom7",
      "mi7",
      "Maj7",
      "x",
      ...FAMILY_TAIL_LEXEMES,
      ...QUALITY_HEAD_LEXEMES,
      ...QUALITY_HEAD_LEXEMES.flatMap((quality) =>
        FAMILY_TAIL_LEXEMES.map((tail) => `${quality}${tail}`),
      ),
    ]),
  ).sort((left, right) => {
    if (left.length !== right.length) return right.length - left.length;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }),
);

const REVIEWED_FAILED_QUALITY_LEXEMES = Object.freeze([
  "dom7",
  "Maj7",
  "foo",
  "mi7",
  "x",
] as const);

type MutableLexemeTrieNode = {
  terminal: string | null;
  children: Map<string, MutableLexemeTrieNode>;
};

type LexemeTrieNode = Readonly<{
  terminal: string | null;
  children: ReadonlyMap<string, LexemeTrieNode>;
}>;

type LexemeMatch = Readonly<{
  lexeme: string;
  end: number;
  codePoints: number;
}>;

type LexScalar = Readonly<{
  codePoint: number;
  text: string;
  end: number;
}>;

type ScalarLookahead = Readonly<{
  length: number;
  read: (index: number) => LexScalar | null;
  pruneBefore: (index: number) => void;
}>;

type CachedLexemeMatch = Readonly<{
  match: LexemeMatch;
  family: boolean;
}>;

type InitialFamilyMatch = Readonly<{
  match: LexemeMatch;
  retainedSuffix: CachedLexemeMatch | null;
}>;

function buildLexemeTrie(lexemes: readonly string[]): LexemeTrieNode {
  const root: MutableLexemeTrieNode = {
    terminal: null,
    children: new Map(),
  };
  for (const lexeme of lexemes) {
    let node = root;
    for (const scalar of lexeme) {
      let child = node.children.get(scalar);
      if (child === undefined) {
        child = { terminal: null, children: new Map() };
        node.children.set(scalar, child);
      }
      node = child;
    }
    node.terminal = lexeme;
  }
  return root;
}

function longestLexemeAt(
  lookahead: ScalarLookahead,
  index: number,
  trie: LexemeTrieNode,
): LexemeMatch | null {
  let node = trie;
  let cursor = index;
  let codePoints = 0;
  let matchedLexeme: string | null = null;
  let matchedEnd = index;
  let matchedCodePoints = 0;
  while (cursor < lookahead.length) {
    const scalar = lookahead.read(cursor);
    if (scalar === null) break;
    const child = node.children.get(scalar.text);
    if (child === undefined) break;
    cursor = scalar.end;
    codePoints += 1;
    node = child;
    if (node.terminal !== null) {
      matchedLexeme = node.terminal;
      matchedEnd = cursor;
      matchedCodePoints = codePoints;
    }
  }
  return matchedLexeme === null
    ? null
    : Object.freeze({
        lexeme: matchedLexeme,
        end: matchedEnd,
        codePoints: matchedCodePoints,
      });
}

function isReviewedFailedQualityLexeme(lexeme: string): boolean {
  return (REVIEWED_FAILED_QUALITY_LEXEMES as readonly string[]).includes(lexeme);
}

const INITIAL_FAMILY_TRIE = buildLexemeTrie(INITIAL_FAMILY_LEXEMES);
const RECOGNIZED_LEXEME_TRIE = buildLexemeTrie(RECOGNIZED_LEXEMES);
const QUALITY_SUFFIX_BOUNDARY_TRIE = buildLexemeTrie([
  ...INITIAL_FAMILY_LEXEMES,
  ...RECOGNIZED_LEXEMES,
]);
const INITIAL_FAMILY_SET: ReadonlySet<string> = new Set(
  INITIAL_FAMILY_LEXEMES,
);

function createScalarLookahead(sourceText: string): ScalarLookahead {
  const cache = new Map<number, LexScalar>();
  return Object.freeze({
    length: sourceText.length,
    read: (index: number): LexScalar | null => {
      if (index < 0 || index >= sourceText.length) return null;
      const retained = cache.get(index);
      if (retained !== undefined) return retained;
      const codePoint = sourceText.codePointAt(index);
      if (codePoint === undefined) return null;
      const scalar = Object.freeze({
        codePoint,
        text: String.fromCodePoint(codePoint),
        end: index + (codePoint > 0xffff ? 2 : 1),
      });
      cache.set(index, scalar);
      return scalar;
    },
    pruneBefore: (index: number): void => {
      for (const retainedIndex of cache.keys()) {
        if (retainedIndex < index) cache.delete(retainedIndex);
      }
    },
  });
}

function isRetainedQualitySuffixLexeme(lexeme: string): boolean {
  return (
    !isReviewedFailedQualityLexeme(lexeme) &&
    (INITIAL_FAMILY_SET.has(lexeme) ||
      modifierLexeme(lexeme) ||
      lexeme === "sus" ||
      lexeme === "sus2" ||
      lexeme === "sus4")
  );
}

function range(start: number, end: number): SourceRange {
  return Object.freeze({ start, end });
}

function diagnostic(
  code: SymbolErrorCode,
  start: number,
  end: number,
): SymbolDiagnostic {
  return Object.freeze({
    code,
    range: range(start, end),
    message: messageFor(code),
  });
}

function messageFor(code: SymbolErrorCode): string {
  switch (code) {
    case "symbol.root_missing":
      return "A chord root is required.";
    case "symbol.root_invalid":
      return "Chord roots use uppercase letters A through G.";
    case "symbol.accidental_out_of_range":
      return "A root accidental cannot exceed a double flat or double sharp.";
    case "symbol.quality_unknown":
      return "This chord quality is not in the version-1 grammar.";
    case "symbol.extension_conflict":
      return "These chord-family declarations cannot be combined.";
    case "symbol.modifier_duplicate":
      return "This modifier repeats an existing chord fact.";
    case "symbol.modifier_conflict":
      return "These chord modifiers conflict.";
    case "symbol.modifier_malformed":
      return "The parenthesized modifier list is malformed.";
    case "symbol.modifier_unclosed":
      return "The parenthesized modifier list is not closed.";
    case "symbol.modifier_unknown":
      return "This chord modifier is not in the version-1 grammar.";
    case "symbol.bass_invalid":
      return "A slash must be followed by one complete spelled bass root.";
    case "symbol.trailing_input":
      return "Unexpected input follows the complete chord symbol.";
    case "symbol.ambiguous_slash":
      return "This slash is neither the exact 6/9 family nor a spelled bass.";
    case "symbol.whitespace_invalid":
      return "Whitespace is allowed only between items in one modifier group.";
    case "symbol.invalid_unicode_scalar":
      return "The symbol contains a lone UTF-16 surrogate.";
    case "symbol.ast_unformattable":
      return "This chord AST has no lossless version-1 symbol spelling.";
    case "limit.symbol_code_points_exceeded":
      return "The chord symbol exceeds the 256-scalar limit.";
    case "limit.symbol_tokens_exceeded":
      return "The chord symbol exceeds the 64-token limit.";
    case "limit.symbol_modifiers_exceeded":
      return "The chord symbol exceeds the 32-modifier limit.";
  }
}

function utf8Width(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function preflightSource(sourceText: string): Preflight {
  let index = 0;
  let codePoints = 0;
  let utf8Bytes = 0;
  let excessRange: SourceRange | null = null;
  while (index < sourceText.length) {
    const first = sourceText.charCodeAt(index);
    let codePoint = first;
    let width = 1;
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = sourceText.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) {
        return Object.freeze({
          codePoints,
          utf8Bytes,
          visitedEnd: index,
          invalidRange: range(index, index + 1),
          excessRange: null,
        });
      }
      codePoint =
        0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
      width = 2;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return Object.freeze({
        codePoints,
        utf8Bytes,
        visitedEnd: index,
        invalidRange: range(index, index + 1),
        excessRange: null,
      });
    }

    codePoints += 1;
    utf8Bytes += utf8Width(codePoint);
    const scalarRange = range(index, index + width);
    index += width;
    if (codePoints > MAX_SYMBOL_CODE_POINTS && excessRange === null) {
      excessRange = scalarRange;
    }
  }
  return Object.freeze({
    codePoints,
    utf8Bytes,
    visitedEnd: index,
    invalidRange: null,
    excessRange,
  });
}

function isWhitespaceCodePoint(codePoint: number): boolean {
  return /\s/u.test(String.fromCodePoint(codePoint));
}

function modifierLexeme(lexeme: string): boolean {
  if (
    lexeme.startsWith("add") ||
    lexeme.startsWith("omit") ||
    lexeme === "no3" ||
    lexeme === "no5" ||
    lexeme === "alt"
  ) {
    return true;
  }
  if (/^[b#♭♯](?:5|9|11|13)$/u.test(lexeme)) return true;
  return lexeme === "maj7" || lexeme === "M7" || lexeme === "Δ7";
}

function matchedKnownLexeme(
  lookahead: ScalarLookahead,
  index: number,
): LexemeMatch | null {
  return longestLexemeAt(lookahead, index, RECOGNIZED_LEXEME_TRIE);
}

function matchedInitialFamilyLexeme(
  lookahead: ScalarLookahead,
  index: number,
): InitialFamilyMatch | null {
  const matched = longestLexemeAt(lookahead, index, INITIAL_FAMILY_TRIE);
  if (matched === null) return null;
  if (
    !isReviewedFailedQualityLexeme(matched.lexeme) ||
    matched.end === lookahead.length
  ) {
    return Object.freeze({ match: matched, retainedSuffix: null });
  }

  const firstSuffix = lookahead.read(matched.end);
  if (firstSuffix?.text === "/" || firstSuffix?.text === "(") {
    return Object.freeze({ match: matched, retainedSuffix: null });
  }
  const suffix = longestLexemeAt(
    lookahead,
    matched.end,
    QUALITY_SUFFIX_BOUNDARY_TRIE,
  );
  if (suffix === null || !isRetainedQualitySuffixLexeme(suffix.lexeme)) {
    return null;
  }
  return Object.freeze({
    match: matched,
    retainedSuffix: Object.freeze({
      match: suffix,
      family: INITIAL_FAMILY_SET.has(suffix.lexeme),
    }),
  });
}

function accidentalWidthAt(lookahead: ScalarLookahead, index: number): 0 | 1 | 2 {
  const codePoint = lookahead.read(index)?.codePoint;
  if (codePoint === 0x1d12b || codePoint === 0x1d12a) return 2;
  if (
    codePoint === 0x62 ||
    codePoint === 0x23 ||
    codePoint === 0x266d ||
    codePoint === 0x266f
  ) {
    return 1;
  }
  return 0;
}

function lexBounded(sourceText: string): LexEvidence {
  const lookahead = createScalarLookahead(sourceText);
  let index = 0;
  let codePointsVisited = 0;
  let tokensProduced = 0;
  let retainedTokens = 0;
  let modifierItemsObserved = 0;
  let groupDepth = 0;
  let expectingRoot = true;
  let expectingRootAccidental = false;
  let atBodyStart = false;
  let expectingBassRoot = false;
  let expectingBassAccidental = false;
  let pendingLexemeMatch: CachedLexemeMatch | null = null;
  let pendingGapStart: number | null = null;
  const tokens: LexToken[] = [];
  const openParentheses: number[] = [];
  let firstForbiddenWhitespace: SourceRange | null = null;

  const observeToken = (token: LexToken): LexLimit | null => {
    tokensProduced += 1;
    if (tokensProduced > MAX_SYMBOL_TOKENS) {
      return Object.freeze({
        code: "limit.symbol_tokens_exceeded",
        range: token.range,
        termination: "symbol-tokens",
      });
    }
    if (token.modifierItem) {
      modifierItemsObserved += 1;
      if (modifierItemsObserved > MAX_SYMBOL_MODIFIERS) {
        return Object.freeze({
          code: "limit.symbol_modifiers_exceeded",
          range: token.range,
          termination: "symbol-modifiers",
        });
      }
    }
    tokens.push(token);
    retainedTokens = tokens.length;
    return null;
  };

  while (index < sourceText.length) {
    const scalar = lookahead.read(index);
    if (scalar === null) break;
    const { codePoint } = scalar;
    const scalarWidth = scalar.end - index;
    if (codePoint === 0x20 || isWhitespaceCodePoint(codePoint)) {
      codePointsVisited += 1;
      pendingGapStart ??= index;
      if (
        firstForbiddenWhitespace === null &&
        (codePoint !== 0x20 || groupDepth === 0)
      ) {
        firstForbiddenWhitespace = range(index, index + scalarWidth);
      }
      index = scalar.end;
      lookahead.pruneBefore(index);
      continue;
    }

    const start = index;
    const gapBefore =
      pendingGapStart === null ? null : range(pendingGapStart, start);
    pendingGapStart = null;
    let end: number;
    let lexeme: string;
    let kind: LexToken["kind"];
    let tokenCodePoints = 0;

    if (expectingRoot) {
      end = scalar.end;
      lexeme = scalar.text;
      kind = "root";
      tokenCodePoints = 1;
      expectingRoot = false;
      expectingRootAccidental = true;
    } else if (expectingRootAccidental) {
      const firstAccidentalWidth = accidentalWidthAt(lookahead, index);
      if (firstAccidentalWidth === 0) {
        expectingRootAccidental = false;
        atBodyStart = true;
        continue;
      }
      end = index;
      let accidentalWidth: 0 | 1 | 2 = firstAccidentalWidth;
      while (accidentalWidth !== 0) {
        end += accidentalWidth;
        tokenCodePoints += 1;
        lookahead.pruneBefore(end);
        accidentalWidth = accidentalWidthAt(lookahead, end);
      }
      lexeme = sourceText.slice(index, end);
      kind = "root-accidental";
      expectingRootAccidental = false;
      atBodyStart = true;
    } else if (expectingBassRoot) {
      end = scalar.end;
      lexeme = scalar.text;
      kind = "bass-root";
      tokenCodePoints = 1;
      expectingBassRoot = false;
      expectingBassAccidental = true;
    } else if (expectingBassAccidental) {
      const firstAccidentalWidth = accidentalWidthAt(lookahead, index);
      if (firstAccidentalWidth === 0) {
        expectingBassAccidental = false;
        continue;
      }
      end = index;
      let accidentalWidth: 0 | 1 | 2 = firstAccidentalWidth;
      while (accidentalWidth !== 0) {
        end += accidentalWidth;
        tokenCodePoints += 1;
        lookahead.pruneBefore(end);
        accidentalWidth = accidentalWidthAt(lookahead, end);
      }
      lexeme = sourceText.slice(index, end);
      kind = "bass-accidental";
      expectingBassAccidental = false;
    } else if (
      scalar.text === "(" ||
      scalar.text === ")" ||
      scalar.text === "," ||
      scalar.text === "/"
    ) {
      end = scalar.end;
      lexeme = scalar.text;
      tokenCodePoints = 1;
      if (lexeme === "(") kind = "open";
      else if (lexeme === ")") kind = "close";
      else if (lexeme === ",") kind = "comma";
      else {
        kind = "slash";
        expectingBassRoot = true;
      }
      atBodyStart = false;
    } else {
      let initial: LexemeMatch | null;
      let known: LexemeMatch | null;
      if (pendingLexemeMatch !== null) {
        known = pendingLexemeMatch.match;
        initial = pendingLexemeMatch.family ? known : null;
        pendingLexemeMatch = null;
      } else {
        const familyMatch: InitialFamilyMatch | null = atBodyStart
          ? matchedInitialFamilyLexeme(lookahead, index)
          : null;
        initial = familyMatch?.match ?? null;
        pendingLexemeMatch = familyMatch?.retainedSuffix ?? null;
        known = initial ?? matchedKnownLexeme(lookahead, index);
      }
      if (known !== null) {
        lexeme = known.lexeme;
        end = known.end;
        kind = initial === null ? "lexeme" : "family";
        tokenCodePoints = known.codePoints;
      } else if (accidentalWidthAt(lookahead, index) !== 0) {
        end = index;
        let accidentalWidth = accidentalWidthAt(lookahead, end);
        while (accidentalWidth !== 0) {
          end += accidentalWidth;
          tokenCodePoints += 1;
          lookahead.pruneBefore(end);
          accidentalWidth = accidentalWidthAt(lookahead, end);
        }
        lexeme = sourceText.slice(index, end);
        kind = "lexeme";
      } else if (/^[A-G]$/u.test(scalar.text)) {
        end = scalar.end;
        lexeme = scalar.text;
        kind = "lexeme";
        tokenCodePoints = 1;
      } else if (/^[0-9]$/u.test(scalar.text)) {
        const first = scalar.text;
        const second = lookahead.read(scalar.end)?.text;
        const isTwoDigitFamily =
          (first === "1" && second === "3") ||
          (first === "1" && second === "1");
        end = isTwoDigitFamily
          ? (lookahead.read(scalar.end)?.end ?? scalar.end)
          : scalar.end;
        lexeme = sourceText.slice(index, end);
        kind = "lexeme";
        tokenCodePoints = isTwoDigitFamily ? 2 : 1;
      } else {
        end = scalar.end;
        tokenCodePoints = 1;
        lookahead.pruneBefore(end);
        while (end < sourceText.length) {
          const next = lookahead.read(end);
          if (next === null) break;
          if (
            next.text === "(" ||
            next.text === ")" ||
            next.text === "," ||
            next.text === "/" ||
            isWhitespaceCodePoint(next.codePoint) ||
            next.codePoint === 0x62 ||
            next.codePoint === 0x23 ||
            next.codePoint === 0x266d ||
            next.codePoint === 0x266f ||
            next.codePoint === 0x1d12b ||
            next.codePoint === 0x1d12a
          ) {
            break;
          }
          end = next.end;
          tokenCodePoints += 1;
          lookahead.pruneBefore(end);
        }
        lexeme = sourceText.slice(index, end);
        kind = "lexeme";
      }
      atBodyStart = kind === "family" && isReviewedFailedQualityLexeme(lexeme);
    }

    codePointsVisited += tokenCodePoints;
    const token = Object.freeze({
      kind,
      lexeme,
      range: range(start, end),
      gapBefore,
      modifierItem: kind !== "family" && modifierLexeme(lexeme),
    });
    const limit = observeToken(token);
    index = end;
    lookahead.pruneBefore(index);
    if (limit !== null) {
      return Object.freeze({
        codePointsVisited,
        tokensProduced,
        modifierItemsObserved,
        peakTokenRecords: retainedTokens,
        tokens: Object.freeze(tokens),
        firstUnclosedParenthesis: openParentheses[0] ?? null,
        firstForbiddenWhitespace,
        limit,
      });
    }
    if (kind === "open") {
      openParentheses.push(start);
      groupDepth += 1;
    }
    if (kind === "close" && groupDepth > 0) {
      openParentheses.pop();
      groupDepth -= 1;
    }
  }

  return Object.freeze({
    codePointsVisited,
    tokensProduced,
    modifierItemsObserved,
    peakTokenRecords: retainedTokens,
    tokens: Object.freeze(tokens),
    firstUnclosedParenthesis: openParentheses[0] ?? null,
    firstForbiddenWhitespace,
    limit: null,
  });
}

function evidence(
  sourceText: string,
  preflight: Preflight,
  lex: LexEvidence | null,
  diagnosticsProduced: number,
  suggestionsCompared: number,
  peakSuggestionRecords: number,
  termination: SymbolTermination,
  formatter: boolean,
): SyntaxWorkEvidence {
  return Object.freeze({
    sourceUtf16CodeUnits: sourceText.length,
    sourceCodePoints: preflight.codePoints,
    sourceUtf8Bytes: preflight.utf8Bytes,
    maxDecodedTextCodePointsObserved: 0,
    lexerCodePointsVisited: formatter ? 0 : (lex?.codePointsVisited ?? 0),
    tokensProduced: formatter ? 0 : (lex?.tokensProduced ?? 0),
    parserTransitions:
      formatter || termination !== "complete" ? 0 : (lex?.tokensProduced ?? 0),
    modifierItemsObserved: formatter ? 0 : (lex?.modifierItemsObserved ?? 0),
    headersObserved: 0,
    sectionsObserved: 0,
    measuresObserved: 0,
    slotsObserved: 0,
    chordDelegations: 0,
    allocationDivisions: 0,
    numericComponentsCompared: 0,
    maxSourceBigIntDigits: 0,
    suggestionsCompared: formatter ? 0 : suggestionsCompared,
    diagnosticsProduced,
    insertableCandidatesProduced: 0,
    peakTokenRecords: formatter ? 0 : (lex?.peakTokenRecords ?? 0),
    peakDraftNodes: 0,
    peakSuggestionRecords: formatter ? 0 : peakSuggestionRecords,
    termination,
  });
}

function frozenFailure(
  sourceText: string,
  diagnostics: readonly SymbolDiagnostic[],
  didYouMean: readonly string[],
): ChordSymbolParseResult {
  const sorted = sortDiagnostics(diagnostics);
  return Object.freeze({
    ok: false,
    sourceText,
    diagnostics: sorted as readonly [SymbolDiagnostic, ...SymbolDiagnostic[]],
    didYouMean: Object.freeze([...didYouMean]),
  });
}

function sortDiagnostics(
  diagnostics: readonly SymbolDiagnostic[],
): readonly SymbolDiagnostic[] {
  const unique = new Map<string, SymbolDiagnostic>();
  for (const item of diagnostics) {
    const key = `${item.code}\u0000${String(item.range.start)}\u0000${String(item.range.end)}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return Object.freeze(
    [...unique.values()].sort((left, right) => {
      if (left.range.start !== right.range.start) {
        return left.range.start - right.range.start;
      }
      if (left.range.end !== right.range.end) return left.range.end - right.range.end;
      if (left.code < right.code) return -1;
      if (left.code > right.code) return 1;
      return 0;
    }),
  );
}

function parseStep(text: string): Step | null {
  switch (text) {
    case "A":
    case "B":
    case "C":
    case "D":
    case "E":
    case "F":
    case "G":
      return text;
    default:
      return null;
  }
}

function degreeSort(left: DegreeEntry, right: DegreeEntry): number {
  if (left.number !== right.number) return left.number - right.number;
  return left.alter - right.alter;
}

function semanticDegree(entry: DegreeEntry): ChordDegree {
  return Object.freeze({ number: entry.number, alter: entry.alter });
}

function hasDegree(
  values: readonly DegreeEntry[],
  number: DegreeNumber,
  alter: number,
): boolean {
  return values.some((value) => value.number === number && value.alter === alter);
}

function addDiagnostic(
  state: MutableParseState,
  code: SymbolErrorCode,
  itemRange: SourceRange,
): void {
  state.diagnostics.push(diagnostic(code, itemRange.start, itemRange.end));
}

function startsWithOneOf(
  sourceText: string,
  index: number,
  values: readonly string[],
): string | null {
  for (const value of values) {
    if (sourceText.startsWith(value, index)) return value;
  }
  return null;
}

function matchExtensionFamily(
  sourceText: string,
  index: number,
): Readonly<{
  marker: "none" | "major";
  number: 7 | 9 | 11 | 13;
  end: number;
}> | null {
  for (const numberText of ["13", "11", "9", "7"] as const) {
    for (const marker of ["maj", "M", "Δ"] as const) {
      const lexeme = `${marker}${numberText}`;
      if (sourceText.startsWith(lexeme, index)) {
        return Object.freeze({
          marker: "major",
          number: Number(numberText) as 7 | 9 | 11 | 13,
          end: index + lexeme.length,
        });
      }
    }
    if (sourceText.startsWith(numberText, index)) {
      return Object.freeze({
        marker: "none",
        number: Number(numberText) as 7 | 9 | 11 | 13,
        end: index + numberText.length,
      });
    }
  }
  return null;
}

function matchModifier(sourceText: string, index: number): Modifier | null {
  const alteration = /^(b|#|♭|♯)(13|11|9|5)/u.exec(sourceText.slice(index));
  if (alteration !== null) {
    const glyph = alteration[1];
    const numberText = alteration[2];
    if (glyph !== undefined && numberText !== undefined) {
      return Object.freeze({
        kind: "alteration",
        degree: Number(numberText) as DegreeNumber,
        alter: glyph === "b" || glyph === "♭" ? -1 : 1,
        end: index + alteration[0].length,
      });
    }
  }
  const addition = /^(add)(13|11|9|6|4|3|2)/u.exec(sourceText.slice(index));
  if (addition !== null) {
    const numberText = addition[2];
    if (numberText !== undefined) {
      return Object.freeze({
        kind: "addition",
        degree: Number(numberText) as DegreeNumber,
        end: index + addition[0].length,
      });
    }
  }
  const omission = /^(?:omit|no)(5|3)/u.exec(sourceText.slice(index));
  if (omission !== null) {
    const numberText = omission[1];
    if (numberText === "3" || numberText === "5") {
      return Object.freeze({
        kind: "omission",
        degree: Number(numberText) as 3 | 5,
        end: index + omission[0].length,
      });
    }
  }
  const majorSeventh = startsWithOneOf(sourceText, index, ["maj7", "M7", "Δ7"]);
  if (majorSeventh !== null) {
    return Object.freeze({ kind: "major-seventh", end: index + majorSeventh.length });
  }
  if (sourceText.startsWith("alt", index)) {
    return Object.freeze({ kind: "alt", end: index + 3 });
  }
  return null;
}

function applyModifier(
  state: MutableParseState,
  modifier: Modifier,
  itemRange: SourceRange,
  parenthesized: boolean,
): void {
  switch (modifier.kind) {
    case "alteration": {
      if (hasDegree(state.alterations, modifier.degree, modifier.alter)) {
        addDiagnostic(state, "symbol.modifier_duplicate", itemRange);
      } else {
        const opposite = hasDegree(state.alterations, modifier.degree, -modifier.alter);
        if (modifier.degree === 5 && opposite) {
          addDiagnostic(state, "symbol.modifier_conflict", itemRange);
        }
        if (
          (modifier.degree === 5 || modifier.degree === 9) &&
          state.colorPolicy === "altered-dominant"
        ) {
          addDiagnostic(state, "symbol.modifier_conflict", itemRange);
        }
        if (
          modifier.degree === 5 &&
          state.omissions.some((entry) => entry.number === 5)
        ) {
          addDiagnostic(state, "symbol.modifier_conflict", itemRange);
        }
        state.alterations.push(
          Object.freeze({
            number: modifier.degree,
            alter: modifier.alter,
            range: itemRange,
          }),
        );
      }
      return;
    }
    case "addition": {
      if (
        hasDegree(state.additions, modifier.degree, 0) ||
        state.extensions.some((entry) => entry.number === modifier.degree) ||
        (modifier.degree === 6 && state.sixth !== null)
      ) {
        addDiagnostic(state, "symbol.modifier_duplicate", itemRange);
      } else {
        if (
          modifier.degree === 3 &&
          state.omissions.some((entry) => entry.number === 3)
        ) {
          addDiagnostic(state, "symbol.modifier_conflict", itemRange);
        }
        state.additions.push(
          Object.freeze({ number: modifier.degree, alter: 0, range: itemRange }),
        );
      }
      return;
    }
    case "omission": {
      if (state.omissions.some((entry) => entry.number === modifier.degree)) {
        addDiagnostic(state, "symbol.modifier_duplicate", itemRange);
      } else {
        if (
          (modifier.degree === 3 && hasDegree(state.additions, 3, 0)) ||
          (modifier.degree === 5 &&
            state.alterations.some((entry) => entry.number === 5))
        ) {
          addDiagnostic(state, "symbol.modifier_conflict", itemRange);
        }
        state.omissions.push(Object.freeze({ number: modifier.degree, range: itemRange }));
      }
      return;
    }
    case "major-seventh": {
      if (
        state.seventh !== null ||
        state.extensions.length > 0 ||
        state.sixth !== null
      ) {
        addDiagnostic(state, "symbol.extension_conflict", itemRange);
        return;
      }
      const allowed =
        state.triad === "major" ||
        state.triad === "minor" ||
        (state.triad === "augmented" && parenthesized);
      if (!allowed) {
        addDiagnostic(state, "symbol.extension_conflict", itemRange);
        return;
      }
      state.seventh = "major";
      state.family = state.triad === "minor" ? "minor-major" : "major-marked";
      return;
    }
    case "alt": {
      if (state.altSeen) {
        addDiagnostic(state, "symbol.modifier_duplicate", itemRange);
        return;
      }
      state.altSeen = true;
      if (
        state.triad !== "major" ||
        state.sixth !== null ||
        state.extensions.length > 0 ||
        (state.seventh !== null && state.seventh !== "minor")
      ) {
        addDiagnostic(state, "symbol.modifier_conflict", itemRange);
      }
      if (
        state.alterations.some(
          (entry) => entry.number === 5 || entry.number === 9,
        )
      ) {
        addDiagnostic(state, "symbol.modifier_conflict", itemRange);
      }
      state.seventh = "minor";
      state.colorPolicy = "altered-dominant";
      state.family = "altered-dominant";
    }
  }
}

function applySuspension(
  state: MutableParseState,
  triad: "sus2" | "sus4",
  itemRange: SourceRange,
): void {
  if (state.suspensionSeen || state.triad === "sus2" || state.triad === "sus4") {
    addDiagnostic(state, "symbol.extension_conflict", itemRange);
    state.suspensionSeen = true;
    return;
  }
  state.suspensionSeen = true;
  if (state.family !== "bare-major" && state.family !== "dominant") {
    addDiagnostic(state, "symbol.modifier_conflict", itemRange);
    return;
  }
  if (
    state.family === "dominant" &&
    state.extensions.some((entry) => entry.number === 11)
  ) {
    addDiagnostic(state, "symbol.modifier_conflict", itemRange);
    return;
  }
  state.triad = triad;
}

function initializeState(root: ParsedPitch): MutableParseState {
  return {
    cursor: root.end,
    root: root.value,
    triad: "major",
    sixth: null,
    seventh: null,
    extensions: [],
    additions: [],
    alterations: [],
    omissions: [],
    bass: null,
    colorPolicy: "none",
    family: "bare-major",
    restrictedTail: false,
    suspensionSeen: false,
    altSeen: false,
    sixthFamilyEnd: null,
    sixthFamilyIncludesNinth: false,
    diagnostics: [],
    suggestionSlot: null,
  };
}

function setExtension(
  state: MutableParseState,
  number: 7 | 9 | 11 | 13,
  seventh: "major" | "minor" | "diminished",
  itemRange: SourceRange,
): void {
  state.seventh = seventh;
  if (number > 7) {
    state.extensions.push(
      Object.freeze({ number, alter: 0, range: itemRange }),
    );
  }
}

function parseInitialFamily(sourceText: string, state: MutableParseState): void {
  const start = state.cursor;
  const failedQualityEnd = sourceText.length;
  const closedFailedQuality = sourceText.slice(start, failedQualityEnd);
  if (
    closedFailedQuality === "foo" ||
    closedFailedQuality === "dom7" ||
    closedFailedQuality === "mi7" ||
    closedFailedQuality === "Maj7" ||
    closedFailedQuality === "x"
  ) {
    addDiagnostic(
      state,
      "symbol.quality_unknown",
      range(start, failedQualityEnd),
    );
    state.suggestionSlot = Object.freeze({
      grammarRegion: "quality",
      failedToken: closedFailedQuality,
      tokenStart: start,
      tokenEnd: failedQualityEnd,
    });
    state.cursor = failedQualityEnd;
    return;
  }
  if (sourceText.startsWith("5", start)) {
    state.triad = "power";
    state.family = "power";
    state.restrictedTail = true;
    state.cursor += 1;
    return;
  }
  if (sourceText.startsWith("m7b5", start)) {
    state.triad = "diminished";
    state.seventh = "minor";
    state.family = "half-diminished";
    state.restrictedTail = true;
    state.cursor += 4;
    return;
  }
  if (sourceText.startsWith("ø7", start) || sourceText.startsWith("ø", start)) {
    const length = sourceText.startsWith("ø7", start) ? 2 : 1;
    state.triad = "diminished";
    state.seventh = "minor";
    state.family = "half-diminished";
    state.restrictedTail = true;
    state.cursor += length;
    return;
  }
  if (sourceText.startsWith("mMaj7", start)) {
    state.triad = "minor";
    state.seventh = "major";
    state.family = "minor-major";
    state.cursor += 5;
    return;
  }

  const leadingFamily = matchExtensionFamily(sourceText, start);
  if (leadingFamily !== null && leadingFamily.marker === "major") {
    const itemRange = range(start, leadingFamily.end);
    setExtension(state, leadingFamily.number, "major", itemRange);
    state.family = "major-marked";
    state.cursor = leadingFamily.end;
    return;
  }

  let explicitQuality:
    | "major"
    | "minor"
    | "diminished"
    | "augmented"
    | null = null;
  const quality = startsWithOneOf(sourceText, start, [
    "maj",
    "min",
    "dim",
    "aug",
    "m",
    "-",
    "o",
    "°",
    "+",
  ]);
  if (quality !== null) {
    state.cursor += quality.length;
    if (quality === "maj") {
      explicitQuality = "major";
      state.family = "major-marked";
    } else if (quality === "min" || quality === "m" || quality === "-") {
      explicitQuality = "minor";
      state.triad = "minor";
      state.family = "minor";
    } else if (quality === "dim" || quality === "o" || quality === "°") {
      explicitQuality = "diminished";
      state.triad = "diminished";
      state.family = "diminished";
    } else {
      explicitQuality = "augmented";
      state.triad = "augmented";
      state.family = "augmented";
    }
  }

  if (explicitQuality === "minor") {
    const conflictingMinorMajor = /^(?:Maj)(?:13|11|9|7)/u.exec(
      sourceText.slice(state.cursor),
    );
    if (conflictingMinorMajor !== null) {
      const end = state.cursor + conflictingMinorMajor[0].length;
      if (conflictingMinorMajor[0] === "Maj7") {
        state.seventh = "major";
        state.family = "minor-major";
      } else {
        addDiagnostic(
          state,
          "symbol.extension_conflict",
          range(state.cursor, end),
        );
      }
      state.cursor = end;
      return;
    }
  }

  if (sourceText.startsWith("6/9", state.cursor)) {
    const itemRange = range(state.cursor, state.cursor + 3);
    if (explicitQuality === "diminished" || explicitQuality === "augmented") {
      addDiagnostic(state, "symbol.extension_conflict", itemRange);
    } else {
      state.sixth = Object.freeze({ number: 6, alter: 0 });
      state.additions.push(Object.freeze({ number: 9, alter: 0, range: itemRange }));
      state.family = "sixth";
    }
    state.cursor += 3;
    return;
  }
  if (sourceText.startsWith("6", state.cursor)) {
    const itemRange = range(state.cursor, state.cursor + 1);
    if (explicitQuality === "diminished" || explicitQuality === "augmented") {
      addDiagnostic(state, "symbol.extension_conflict", itemRange);
    } else {
      state.sixth = Object.freeze({ number: 6, alter: 0 });
      state.family = "sixth";
    }
    state.cursor += 1;
    return;
  }

  const family = matchExtensionFamily(sourceText, state.cursor);
  if (family !== null) {
    const itemRange = range(state.cursor, family.end);
    if (explicitQuality === "diminished") {
      state.restrictedTail = true;
      if (family.marker === "none" && family.number === 7) {
        setExtension(state, 7, "diminished", itemRange);
      } else {
        addDiagnostic(state, "symbol.extension_conflict", itemRange);
      }
    } else if (explicitQuality === "augmented") {
      state.restrictedTail = true;
      addDiagnostic(state, "symbol.extension_conflict", itemRange);
    } else if (explicitQuality === "minor") {
      if (family.marker === "major") {
        if (family.number === 7) {
          setExtension(state, 7, "major", itemRange);
          state.family = "minor-major";
        } else {
          addDiagnostic(state, "symbol.extension_conflict", itemRange);
        }
      } else {
        setExtension(state, family.number, "minor", itemRange);
        state.family = "minor";
      }
    } else if (family.marker === "major") {
      setExtension(state, family.number, "major", itemRange);
      state.family = "major-marked";
    } else {
      setExtension(state, family.number, "minor", itemRange);
      state.family = "dominant";
    }
    state.cursor = family.end;
    return;
  }

  if (explicitQuality === "diminished" || explicitQuality === "augmented") {
    state.restrictedTail = true;
  }
}

type TokenReader = {
  tokens: readonly LexToken[];
  readonly sourceLength: number;
  index: number;
};

function releaseTokenTape(
  lex: LexEvidence,
  reader: TokenReader,
): LexEvidence {
  reader.tokens = EMPTY_LEX_TOKENS;
  return Object.freeze({ ...lex, tokens: EMPTY_LEX_TOKENS });
}

type TokenPitchResult =
  | Readonly<{ ok: true; pitch: ParsedPitch; nextIndex: number }>
  | Readonly<{ ok: false; kind: "root" | "accidental"; range: SourceRange }>;

function shiftedRange(itemRange: SourceRange, offset: number): SourceRange {
  return range(itemRange.start + offset, itemRange.end + offset);
}

function accidentalAlteration(
  lexeme: string,
): -2 | -1 | 0 | 1 | 2 | null {
  switch (lexeme) {
    case "":
      return 0;
    case "bb":
    case "𝄫":
      return -2;
    case "b":
    case "♭":
      return -1;
    case "#":
    case "♯":
      return 1;
    case "##":
    case "𝄪":
      return 2;
    default:
      return null;
  }
}

function parseTokenPitch(
  tokens: readonly LexToken[],
  tokenIndex: number,
  rootKind: "root" | "bass-root",
  accidentalKind: "root-accidental" | "bass-accidental",
): TokenPitchResult {
  const root = tokens[tokenIndex];
  if (root === undefined || root.kind !== rootKind) {
    const coordinate = root?.range.start ?? 0;
    return Object.freeze({
      ok: false,
      kind: "root",
      range: range(coordinate, coordinate),
    });
  }
  const step = parseStep(root.lexeme);
  if (step === null) {
    const firstCodePoint = root.lexeme.codePointAt(0);
    const width = firstCodePoint !== undefined && firstCodePoint > 0xffff ? 2 : 1;
    return Object.freeze({
      ok: false,
      kind: "root",
      range: range(root.range.start, Math.min(root.range.end, root.range.start + width)),
    });
  }

  const accidental = tokens[tokenIndex + 1];
  if (accidental?.kind !== accidentalKind) {
    return Object.freeze({
      ok: true,
      pitch: Object.freeze({
        value: Object.freeze({ step, alter: 0 }),
        end: root.range.end,
      }),
      nextIndex: tokenIndex + 1,
    });
  }
  const alter = accidentalAlteration(accidental.lexeme);
  if (alter === null) {
    return Object.freeze({
      ok: false,
      kind: "accidental",
      range: accidental.range,
    });
  }
  return Object.freeze({
    ok: true,
    pitch: Object.freeze({
      value: Object.freeze({ step, alter }),
      end: accidental.range.end,
    }),
    nextIndex: tokenIndex + 2,
  });
}

function translateInitialTokenState(
  state: MutableParseState,
  token: LexToken,
): boolean {
  const extensionStart = state.extensions.length;
  const additionStart = state.additions.length;
  const alterationStart = state.alterations.length;
  const omissionStart = state.omissions.length;
  const diagnosticStart = state.diagnostics.length;
  const previousSuggestion = state.suggestionSlot;

  state.cursor = 0;
  parseInitialFamily(token.lexeme, state);
  const consumed = state.cursor;
  const offset = token.range.start;
  state.extensions = state.extensions.map((entry, index) =>
    index < extensionStart
      ? entry
      : Object.freeze({ ...entry, range: shiftedRange(entry.range, offset) }),
  );
  state.additions = state.additions.map((entry, index) =>
    index < additionStart
      ? entry
      : Object.freeze({ ...entry, range: shiftedRange(entry.range, offset) }),
  );
  state.alterations = state.alterations.map((entry, index) =>
    index < alterationStart
      ? entry
      : Object.freeze({ ...entry, range: shiftedRange(entry.range, offset) }),
  );
  state.omissions = state.omissions.map((entry, index) =>
    index < omissionStart
      ? entry
      : Object.freeze({ ...entry, range: shiftedRange(entry.range, offset) }),
  );
  state.diagnostics = state.diagnostics.map((item, index) =>
    index < diagnosticStart
      ? item
      : diagnostic(
          item.code,
          item.range.start + offset,
          item.range.end + offset,
        ),
  );
  if (state.suggestionSlot !== previousSuggestion && state.suggestionSlot !== null) {
    state.suggestionSlot = Object.freeze({
      ...state.suggestionSlot,
      tokenStart: state.suggestionSlot.tokenStart + offset,
      tokenEnd: state.suggestionSlot.tokenEnd + offset,
    });
  }
  state.cursor = offset + consumed;
  return consumed === token.lexeme.length;
}

function exactModifier(lexeme: string): Modifier | null {
  const modifier = matchModifier(lexeme, 0);
  return modifier !== null && modifier.end === lexeme.length ? modifier : null;
}

function itemText(tokens: readonly LexToken[], start: number, end: number): string {
  let text = "";
  for (let index = start; index < end; index += 1) {
    text += tokens[index]?.lexeme ?? "";
  }
  return text;
}

function firstGapUnit(gap: SourceRange): SourceRange {
  return range(gap.start, Math.min(gap.end, gap.start + 1));
}

function skipToTokenGroupClose(
  reader: TokenReader,
  state: MutableParseState,
): void {
  while (reader.index < reader.tokens.length) {
    const token = reader.tokens[reader.index];
    reader.index += 1;
    if (token?.kind === "close") {
      state.cursor = token.range.end;
      return;
    }
  }
  state.cursor = reader.sourceLength;
}

function parseTokenModifierGroup(
  reader: TokenReader,
  state: MutableParseState,
): void {
  const open = reader.tokens[reader.index];
  if (open === undefined || open.kind !== "open") return;
  reader.index += 1;

  let itemStart: number | null = null;
  let itemEnd = open.range.end;
  let itemValue = "";
  let itemsObserved = 0;
  let pendingComma: LexToken | null = null;

  const finishItem = (): void => {
    if (itemStart === null) return;
    const itemRange = range(itemStart, itemEnd);
    const modifier = exactModifier(itemValue);
    if (modifier === null) {
      addDiagnostic(state, "symbol.modifier_unknown", itemRange);
    } else {
      applyModifier(state, modifier, itemRange, true);
    }
    itemStart = null;
    itemValue = "";
    itemsObserved += 1;
  };

  while (reader.index < reader.tokens.length) {
    const current = reader.tokens[reader.index];
    reader.index += 1;
    if (current === undefined) break;

    if (current.kind === "open") {
      addDiagnostic(state, "symbol.modifier_malformed", current.range);
      reader.index = reader.tokens.length;
      state.cursor = reader.sourceLength;
      return;
    }

    if (current.kind === "close") {
      if (current.gapBefore !== null) {
        if (itemStart !== null) {
          finishItem();
          addDiagnostic(
            state,
            "symbol.whitespace_invalid",
            firstGapUnit(current.gapBefore),
          );
        } else if (pendingComma !== null) {
          addDiagnostic(
            state,
            "symbol.modifier_malformed",
            range(pendingComma.range.start, current.range.start),
          );
        } else if (itemsObserved === 0) {
          addDiagnostic(
            state,
            "symbol.whitespace_invalid",
            firstGapUnit(current.gapBefore),
          );
        }
      } else if (itemStart !== null) {
        finishItem();
      } else if (pendingComma !== null) {
        addDiagnostic(
          state,
          "symbol.modifier_malformed",
          range(pendingComma.range.start, current.range.start),
        );
      } else if (itemsObserved === 0) {
        addDiagnostic(
          state,
          "symbol.modifier_malformed",
          range(open.range.start, current.range.end),
        );
      }
      state.cursor = current.range.end;
      return;
    }

    if (current.kind === "comma") {
      if (current.gapBefore !== null) {
        addDiagnostic(
          state,
          "symbol.whitespace_invalid",
          firstGapUnit(current.gapBefore),
        );
        skipToTokenGroupClose(reader, state);
        return;
      }
      if (itemStart === null) {
        addDiagnostic(state, "symbol.modifier_malformed", current.range);
        skipToTokenGroupClose(reader, state);
        return;
      }
      finishItem();
      pendingComma = current;
      continue;
    }

    if (current.gapBefore !== null) {
      if (itemStart !== null) {
        finishItem();
      } else if (pendingComma === null && itemsObserved === 0) {
        addDiagnostic(
          state,
          "symbol.whitespace_invalid",
          firstGapUnit(current.gapBefore),
        );
        skipToTokenGroupClose(reader, state);
        return;
      }
    }

    pendingComma = null;
    itemStart ??= current.range.start;
    itemEnd = current.range.end;
    itemValue += current.lexeme;
  }

  state.cursor = reader.sourceLength;
}

function validTokenBassSuffix(
  tokens: readonly LexToken[],
  slashIndex: number,
): boolean {
  if (tokens[slashIndex]?.kind !== "slash") return false;
  const parsed = parseTokenPitch(
    tokens,
    slashIndex + 1,
    "bass-root",
    "bass-accidental",
  );
  return parsed.ok && parsed.nextIndex === tokens.length;
}

function consumeTokenBass(reader: TokenReader, state: MutableParseState): void {
  const slashIndex = reader.index;
  const slash = reader.tokens[slashIndex];
  if (slash === undefined || slash.kind !== "slash") return;
  const candidate = reader.tokens[slashIndex + 1];
  if (candidate === undefined) {
    addDiagnostic(state, "symbol.bass_invalid", slash.range);
    reader.index = reader.tokens.length;
    state.cursor = reader.sourceLength;
    return;
  }

  const first = candidate.lexeme.codePointAt(0);
  if (first !== undefined && first >= 0x30 && first <= 0x39) {
    const adjacentSixEight =
      candidate.lexeme === "8" &&
      state.sixthFamilyEnd === slash.range.start &&
      !state.sixthFamilyIncludesNinth;
    if (candidate.lexeme === "9" || adjacentSixEight) {
      addDiagnostic(
        state,
        "symbol.ambiguous_slash",
        range(slash.range.start, candidate.range.end),
      );
    } else {
      addDiagnostic(state, "symbol.bass_invalid", candidate.range);
    }
    if (adjacentSixEight) {
      state.suggestionSlot = Object.freeze({
        grammarRegion: "sixth-family",
        failedToken: "/8",
        tokenStart: slash.range.start,
        tokenEnd: candidate.range.end,
      });
    }
    reader.index = reader.tokens.length;
    state.cursor = reader.sourceLength;
    return;
  }

  const parsed = parseTokenPitch(
    reader.tokens,
    slashIndex + 1,
    "bass-root",
    "bass-accidental",
  );
  if (!parsed.ok) {
    const invalidEnd =
      candidate.lexeme === "/" ? reader.sourceLength : parsed.range.end;
    addDiagnostic(
      state,
      "symbol.bass_invalid",
      range(candidate.range.start, invalidEnd),
    );
    reader.index = reader.tokens.length;
    state.cursor = reader.sourceLength;
    return;
  }
  state.bass = parsed.pitch.value;
  reader.index = parsed.nextIndex;
  state.cursor = parsed.pitch.end;
  if (reader.index < reader.tokens.length) {
    const trailing = reader.tokens[reader.index];
    addDiagnostic(
      state,
      "symbol.trailing_input",
      range(trailing?.range.start ?? state.cursor, reader.sourceLength),
    );
    reader.index = reader.tokens.length;
    state.cursor = reader.sourceLength;
  }
}

function exactMajorSeventhGroup(reader: TokenReader): boolean {
  const open = reader.tokens[reader.index];
  const item = reader.tokens[reader.index + 1];
  const close = reader.tokens[reader.index + 2];
  return (
    open?.kind === "open" &&
    item !== undefined &&
    (item.lexeme === "maj7" || item.lexeme === "M7" || item.lexeme === "Δ7") &&
    item.gapBefore === null &&
    close?.kind === "close" &&
    close.gapBefore === null
  );
}

function parseTokenPostFamily(reader: TokenReader, state: MutableParseState): void {
  while (reader.index < reader.tokens.length) {
    const token = reader.tokens[reader.index];
    if (token === undefined) break;
    if (
      state.suggestionSlot?.grammarRegion === "quality" &&
      token.kind === "family" &&
      !isReviewedFailedQualityLexeme(token.lexeme) &&
      translateInitialTokenState(state, token)
    ) {
      if (state.sixth !== null) {
        state.sixthFamilyEnd = token.range.end;
        state.sixthFamilyIncludesNinth = state.additions.some(
          (entry) => entry.number === 9 && entry.alter === 0,
        );
      }
      reader.index += 1;
      continue;
    }
    if (token.kind === "slash") {
      consumeTokenBass(reader, state);
      return;
    }
    if (state.restrictedTail && exactMajorSeventhGroup(reader)) {
      parseTokenModifierGroup(reader, state);
      continue;
    }
    if (
      token.lexeme === "sus4" ||
      token.lexeme === "sus2" ||
      token.lexeme === "sus"
    ) {
      applySuspension(
        state,
        token.lexeme === "sus2" ? "sus2" : "sus4",
        token.range,
      );
      reader.index += 1;
      state.cursor = token.range.end;
      continue;
    }
    if (state.restrictedTail) {
      const extension = matchExtensionFamily(token.lexeme, 0);
      if (
        state.family === "half-diminished" &&
        extension !== null &&
        extension.end === token.lexeme.length &&
        extension.marker === "none"
      ) {
        addDiagnostic(state, "symbol.extension_conflict", token.range);
      } else {
        addDiagnostic(
          state,
          "symbol.trailing_input",
          range(token.range.start, reader.sourceLength),
        );
      }
      reader.index = reader.tokens.length;
      state.cursor = reader.sourceLength;
      return;
    }
    if (token.kind === "open") {
      parseTokenModifierGroup(reader, state);
      continue;
    }

    const modifier = exactModifier(token.lexeme);
    if (modifier !== null) {
      applyModifier(state, modifier, token.range, false);
      reader.index += 1;
      state.cursor = token.range.end;
      continue;
    }

    const repeatedFamily = matchExtensionFamily(token.lexeme, 0);
    if (
      repeatedFamily !== null &&
      repeatedFamily.end === token.lexeme.length &&
      (state.seventh !== null ||
        state.sixth !== null ||
        state.extensions.length > 0)
    ) {
      addDiagnostic(state, "symbol.extension_conflict", token.range);
      reader.index += 1;
      state.cursor = token.range.end;
      continue;
    }

    let slashIndex = reader.index;
    while (
      slashIndex < reader.tokens.length &&
      !validTokenBassSuffix(reader.tokens, slashIndex)
    ) {
      slashIndex += 1;
    }
    const unknownEnd =
      slashIndex < reader.tokens.length
        ? (reader.tokens[slashIndex]?.range.start ?? reader.sourceLength)
        : reader.sourceLength;
    const noRecognizedBody =
      state.family === "bare-major" &&
      state.triad === "major" &&
      state.seventh === null &&
      state.sixth === null &&
      state.extensions.length === 0 &&
      state.additions.length === 0 &&
      state.alterations.length === 0 &&
      state.omissions.length === 0 &&
      state.colorPolicy === "none";
    if (noRecognizedBody) {
      const failedText = itemText(reader.tokens, reader.index, slashIndex);
      const firstCodePoint = token.lexeme.codePointAt(0);
      const first =
        firstCodePoint === undefined ? "" : String.fromCodePoint(firstCodePoint);
      const modifierShaped = /^(?:add|alt|no|omit|[b#♭♯𝄫𝄪])/u.test(
        failedText,
      );
      const code: SymbolErrorCode = modifierShaped
        ? "symbol.modifier_unknown"
        : /^[A-Za-z0-9]/u.test(first)
          ? "symbol.quality_unknown"
          : "symbol.trailing_input";
      addDiagnostic(
        state,
        code,
        range(
          token.range.start,
          code === "symbol.trailing_input" ? reader.sourceLength : unknownEnd,
        ),
      );
      if (code === "symbol.quality_unknown") {
        state.suggestionSlot = Object.freeze({
          grammarRegion: "quality",
          failedToken: failedText,
          tokenStart: token.range.start,
          tokenEnd: unknownEnd,
        });
      }
      reader.index = slashIndex;
      state.cursor = unknownEnd;
      if (
        code !== "symbol.trailing_input" &&
        reader.index < reader.tokens.length
      ) {
        consumeTokenBass(reader, state);
      }
      return;
    }

    const firstCodePoint = token.lexeme.codePointAt(0);
    const first =
      firstCodePoint === undefined ? "" : String.fromCodePoint(firstCodePoint);
    const code = /^[A-Za-z0-9b#♭♯𝄫𝄪]/u.test(first)
      ? "symbol.modifier_unknown"
      : "symbol.trailing_input";
    const diagnosticEnd =
      code === "symbol.modifier_unknown" ? unknownEnd : reader.sourceLength;
    addDiagnostic(
      state,
      code,
      range(token.range.start, diagnosticEnd),
    );
    if (
      code === "symbol.modifier_unknown" &&
      slashIndex < reader.tokens.length
    ) {
      reader.index = slashIndex;
      state.cursor = unknownEnd;
      consumeTokenBass(reader, state);
    } else {
      reader.index = reader.tokens.length;
      state.cursor = reader.sourceLength;
    }
    return;
  }
}

function buildChord(sourceText: string, state: MutableParseState): ChordSpec | null {
  const extensions = state.extensions.slice().sort(degreeSort).map(semanticDegree);
  const additions = state.additions.slice().sort(degreeSort).map(semanticDegree);
  const alterations = state.alterations.slice().sort(degreeSort).map(semanticDegree);
  const omissions = state.omissions
    .map((entry) => entry.number)
    .sort((left, right) => left - right);
  const result = makeChordSpec({
    kind: "parsed",
    sourceText,
    root: state.root,
    triad: state.triad,
    sixth: state.sixth,
    seventh: state.seventh,
    extensions,
    additions,
    alterations,
    omissions,
    bass: state.bass,
    colorPolicy: state.colorPolicy,
  });
  return result.ok ? result.value : null;
}

function levenshtein(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  let previous = Array.from({ length: rightPoints.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < leftPoints.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < rightPoints.length; rightIndex += 1) {
      const substitution =
        previous[rightIndex] ?? Number.MAX_SAFE_INTEGER;
      const insertion = current[rightIndex] ?? Number.MAX_SAFE_INTEGER;
      const deletion = previous[rightIndex + 1] ?? Number.MAX_SAFE_INTEGER;
      const same = leftPoints[leftIndex] === rightPoints[rightIndex];
      current.push(
        Math.min(insertion + 1, deletion + 1, substitution + (same ? 0 : 1)),
      );
    }
    previous = current;
  }
  return previous[rightPoints.length] ?? 0;
}

function suggestionsFor(
  sourceText: string,
  slot: FailedSuggestionSlot | null,
  retainedRoot: SpelledPitchClass,
  accidentalStyle: AccidentalStyle,
): Readonly<{
  values: readonly string[];
  compared: number;
  peakRecords: number;
}> {
  if (slot === null) {
    return Object.freeze({ values: Object.freeze([]), compared: 0, peakRecords: 0 });
  }
  const candidates: Array<Readonly<{
    value: string;
    distance: number;
    canonical: boolean;
  }>> = [];
  let compared = 0;
  let peakRecords = 0;
  for (const replacement of CHORD_SYMBOL_SUGGESTION_REPLACEMENTS) {
    if (
      replacement.grammarRegion !== slot.grammarRegion ||
      replacement.failedToken !== slot.failedToken
    ) {
      continue;
    }
    compared += 1;
    peakRecords = Math.max(peakRecords, candidates.length + 1);
    const value =
      sourceText.slice(0, slot.tokenStart) +
      replacement.replacementToken +
      sourceText.slice(slot.tokenEnd);
    const distance = levenshtein(slot.failedToken, replacement.replacementToken);
    if (distance > 3) continue;
    const parsedCandidate = parseChordSymbolOperation(
      value,
      accidentalStyle,
      false,
    ).result;
    if (
      !parsedCandidate.ok ||
      parsedCandidate.chord.root.step !== retainedRoot.step ||
      parsedCandidate.chord.root.alter !== retainedRoot.alter
    ) {
      continue;
    }
    candidates.push(
      Object.freeze({
        value,
        distance,
        canonical: parsedCandidate.canonicalText === value,
      }),
    );
  }
  candidates.sort((left, right) => {
    if (left.distance !== right.distance) return left.distance - right.distance;
    if (left.canonical !== right.canonical) return left.canonical ? -1 : 1;
    if (left.value < right.value) return -1;
    if (left.value > right.value) return 1;
    return 0;
  });
  const deduplicated: string[] = [];
  for (const candidate of candidates) {
    if (!deduplicated.includes(candidate.value)) deduplicated.push(candidate.value);
  }
  return Object.freeze({
    values: Object.freeze(deduplicated.slice(0, MAX_DID_YOU_MEAN)),
    compared,
    peakRecords,
  });
}

function accidentalText(alter: number, style: AccidentalStyle): string | null {
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
        return null;
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
      return null;
  }
}

function formatPitch(
  pitch: SpelledPitchClass,
  style: AccidentalStyle,
): string | null {
  const step = parseStep(pitch.step);
  const accidental = accidentalText(pitch.alter, style);
  return step === null || accidental === null ? null : `${step}${accidental}`;
}

function validOrderedDegrees(
  values: readonly ChordDegree[],
  allowedNumbers: readonly DegreeNumber[],
  allowedAlterations: readonly number[],
): boolean {
  let previousNumber = -1;
  let previousAlter = -3;
  for (const value of values) {
    if (
      !allowedNumbers.includes(value.number) ||
      !allowedAlterations.includes(value.alter)
    ) {
      return false;
    }
    if (
      value.number < previousNumber ||
      (value.number === previousNumber && value.alter <= previousAlter)
    ) {
      return false;
    }
    previousNumber = value.number;
    previousAlter = value.alter;
  }
  return true;
}

function degreeText(degree: ChordDegree, style: AccidentalStyle): string | null {
  const accidental = accidentalText(degree.alter, style);
  return accidental === null ? null : `${accidental}${String(degree.number)}`;
}

function formatChordSemantic(
  chord: ChordSpec,
  style: AccidentalStyle,
): string | null {
  const root = formatPitch(chord.root, style);
  const bass = chord.bass === null ? null : formatPitch(chord.bass, style);
  if (root === null || (chord.bass !== null && bass === null)) return null;
  if (
    !validOrderedDegrees(chord.extensions, [9, 11, 13], [0]) ||
    chord.extensions.length > 1 ||
    !validOrderedDegrees(chord.additions, [2, 3, 4, 6, 9, 11, 13], [0]) ||
    !validOrderedDegrees(chord.alterations, [5, 9, 11, 13], [-1, 1]) ||
    chord.omissions.some((value) => value !== 3 && value !== 5) ||
    chord.omissions.some((value, index) => index > 0 && value <= (chord.omissions[index - 1] ?? 0))
  ) {
    return null;
  }
  if (
    chord.sixth !== null &&
    chord.sixth.alter !== 0
  ) {
    return null;
  }
  if (
    chord.sixth !== null &&
    (chord.seventh !== null || chord.extensions.length > 0)
  ) {
    return null;
  }
  const extension = chord.extensions[0] ?? null;
  if (extension !== null && chord.seventh === null) return null;
  if (
    extension !== null &&
    chord.additions.some((degree) => degree.number === extension.number)
  ) {
    return null;
  }
  if (
    chord.sixth !== null &&
    chord.additions.some((degree) => degree.number === 6)
  ) {
    return null;
  }
  if (
    chord.alterations.some(
      (degree, index) =>
        degree.number === 5 &&
        chord.alterations.some(
          (other, otherIndex) =>
            otherIndex !== index && other.number === 5 && other.alter === -degree.alter,
        ),
    ) ||
    (chord.omissions.includes(3) && chord.additions.some((degree) => degree.number === 3)) ||
    (chord.omissions.includes(5) && chord.alterations.some((degree) => degree.number === 5))
  ) {
    return null;
  }

  let base = "";
  let majorSeventhGroup = false;
  const hasOrdinaryModifiers =
    chord.additions.length > 0 ||
    chord.alterations.length > 0 ||
    chord.omissions.length > 0;

  switch (chord.triad) {
    case "power":
      if (
        chord.sixth !== null ||
        chord.seventh !== null ||
        extension !== null ||
        hasOrdinaryModifiers ||
        chord.colorPolicy !== "none"
      ) {
        return null;
      }
      base = "5";
      break;
    case "diminished":
      if (
        chord.sixth !== null ||
        extension !== null ||
        hasOrdinaryModifiers ||
        chord.colorPolicy !== "none"
      ) {
        return null;
      }
      if (chord.seventh === null) base = "dim";
      else if (chord.seventh === "diminished") base = "dim7";
      else if (chord.seventh === "minor") base = "m7b5";
      else return null;
      break;
    case "augmented":
      if (
        chord.sixth !== null ||
        extension !== null ||
        hasOrdinaryModifiers ||
        chord.colorPolicy !== "none" ||
        chord.seventh === "minor" ||
        chord.seventh === "diminished"
      ) {
        return null;
      }
      base = "aug";
      majorSeventhGroup = chord.seventh === "major";
      break;
    case "minor":
      if (chord.colorPolicy !== "none" || chord.seventh === "diminished") return null;
      base = "m";
      if (chord.sixth !== null) base += "6";
      else if (extension !== null) {
        if (chord.seventh !== "minor") return null;
        base += String(extension.number);
      } else if (chord.seventh === "minor") base += "7";
      else if (chord.seventh === "major") majorSeventhGroup = true;
      break;
    case "sus2":
    case "sus4": {
      if (
        chord.sixth !== null ||
        chord.colorPolicy !== "none" ||
        chord.seventh === "major" ||
        chord.seventh === "diminished" ||
        extension?.number === 11
      ) {
        return null;
      }
      const suspension = chord.triad;
      if (extension !== null) {
        if (chord.seventh !== "minor") return null;
        base = `${String(extension.number)}${suspension}`;
      } else if (chord.seventh === "minor") {
        base = `7${suspension}`;
      } else {
        base = suspension;
      }
      break;
    }
    case "major":
      if (chord.seventh === "diminished") return null;
      if (chord.colorPolicy === "altered-dominant") {
        if (
          chord.sixth !== null ||
          extension !== null ||
          chord.seventh !== "minor" ||
          chord.alterations.some(
            (degree) => degree.number === 5 || degree.number === 9,
          )
        ) {
          return null;
        }
        base = "7alt";
      } else if (chord.sixth !== null) {
        base = "6";
      } else if (extension !== null) {
        if (chord.seventh === "major") base = `maj${String(extension.number)}`;
        else if (chord.seventh === "minor") base = String(extension.number);
        else return null;
      } else if (chord.seventh === "major") {
        base = "maj7";
      } else if (chord.seventh === "minor") {
        base = "7";
      }
      break;
  }

  const additions = [...chord.additions];
  if (
    chord.sixth !== null &&
    additions.length === 1 &&
    additions[0]?.number === 9 &&
    additions[0].alter === 0 &&
    !majorSeventhGroup
  ) {
    base = `${base}/9`;
    additions.length = 0;
  }

  const modifiers: string[] = [];
  if (majorSeventhGroup) modifiers.push("maj7");
  for (const degree of chord.alterations) {
    const text = degreeText(degree, style);
    if (text === null) return null;
    modifiers.push(text);
  }
  for (const degree of additions) modifiers.push(`add${String(degree.number)}`);
  for (const omission of chord.omissions) modifiers.push(`no${String(omission)}`);

  const dominantInline =
    (chord.triad === "major" || chord.triad === "sus2" || chord.triad === "sus4") &&
    chord.colorPolicy === "none" &&
    chord.seventh === "minor" &&
    modifiers.length === 1 &&
    chord.alterations.length === 1 &&
    additions.length === 0 &&
    chord.omissions.length === 0;
  const plainMajorAdditionInline =
    chord.triad === "major" &&
    chord.sixth === null &&
    chord.seventh === null &&
    extension === null &&
    chord.colorPolicy === "none" &&
    modifiers.length === 1 &&
    chord.alterations.length === 0 &&
    additions.length === 1 &&
    chord.omissions.length === 0;

  let body = base;
  if (dominantInline || plainMajorAdditionInline) {
    body += modifiers[0] ?? "";
  } else if (modifiers.length > 0) {
    body += `(${modifiers.join(",")})`;
  }
  return `${root}${body}${bass === null ? "" : `/${bass}`}`;
}

function astFailure(chord: ChordSpec): ChordSymbolFormatResult {
  const sourceLength = typeof chord.sourceText === "string" ? chord.sourceText.length : 0;
  const diagnostics: readonly [SymbolDiagnostic] = Object.freeze([
    diagnostic("symbol.ast_unformattable", 0, sourceLength),
  ]);
  return Object.freeze({
    ok: false,
    diagnostics,
  });
}

function parseChordSymbolOperation(
  sourceText: string,
  accidentalStyle: AccidentalStyle,
  allowSuggestions: boolean,
): ReturnType<ParseChordSymbolWithEvidence> {
  const preflight = preflightSource(sourceText);
  if (preflight.invalidRange !== null) {
    const result = frozenFailure(
      sourceText,
      [
        diagnostic(
          "symbol.invalid_unicode_scalar",
          preflight.invalidRange.start,
          preflight.invalidRange.end,
        ),
      ],
      [],
    );
    return Object.freeze({
      result,
      evidence: evidence(sourceText, preflight, null, 1, 0, 0, "complete", false),
    });
  }
  if (preflight.excessRange !== null) {
    const result = frozenFailure(
      sourceText,
      [
        diagnostic(
          "limit.symbol_code_points_exceeded",
          preflight.excessRange.start,
          preflight.excessRange.end,
        ),
      ],
      [],
    );
    return Object.freeze({
      result,
      evidence: evidence(
        sourceText,
        preflight,
        null,
        1,
        0,
        0,
        "symbol-code-points",
        false,
      ),
    });
  }

  let lex = lexBounded(sourceText);
  if (lex.limit !== null) {
    const result = frozenFailure(
      sourceText,
      [diagnostic(lex.limit.code, lex.limit.range.start, lex.limit.range.end)],
      [],
    );
    return Object.freeze({
      result,
      evidence: evidence(
        sourceText,
        preflight,
        lex,
        1,
        0,
        0,
        lex.limit.termination,
        false,
      ),
    });
  }

  const unclosed = lex.firstUnclosedParenthesis;
  if (unclosed !== null) {
    const result = frozenFailure(
      sourceText,
      [diagnostic("symbol.modifier_unclosed", unclosed, sourceText.length)],
      [],
    );
    return Object.freeze({
      result,
      evidence: evidence(sourceText, preflight, lex, 1, 0, 0, "complete", false),
    });
  }

  const whitespace = lex.firstForbiddenWhitespace;
  if (whitespace !== null) {
    const result = frozenFailure(
      sourceText,
      [diagnostic("symbol.whitespace_invalid", whitespace.start, whitespace.end)],
      [],
    );
    return Object.freeze({
      result,
      evidence: evidence(sourceText, preflight, lex, 1, 0, 0, "complete", false),
    });
  }

  if (sourceText.length === 0) {
    const result = frozenFailure(
      sourceText,
      [diagnostic("symbol.root_missing", 0, 0)],
      [],
    );
    return Object.freeze({
      result,
      evidence: evidence(sourceText, preflight, lex, 1, 0, 0, "complete", false),
    });
  }

  const parsedRoot = parseTokenPitch(
    lex.tokens,
    0,
    "root",
    "root-accidental",
  );
  if (!parsedRoot.ok) {
    const code =
      parsedRoot.kind === "accidental"
        ? "symbol.accidental_out_of_range"
        : "symbol.root_invalid";
    const result = frozenFailure(
      sourceText,
      [diagnostic(code, parsedRoot.range.start, parsedRoot.range.end)],
      [],
    );
    return Object.freeze({
      result,
      evidence: evidence(sourceText, preflight, lex, 1, 0, 0, "complete", false),
    });
  }

  const state = initializeState(parsedRoot.pitch);
  const reader: TokenReader = {
    tokens: lex.tokens,
    sourceLength: sourceText.length,
    index: parsedRoot.nextIndex,
  };
  let firstBodyToken = reader.tokens[reader.index];
  if (
    firstBodyToken !== undefined &&
    firstBodyToken.kind === "family" &&
    translateInitialTokenState(state, firstBodyToken)
  ) {
    if (state.sixth !== null) {
      state.sixthFamilyEnd = firstBodyToken.range.end;
      state.sixthFamilyIncludesNinth = state.additions.some(
        (entry) => entry.number === 9 && entry.alter === 0,
      );
    }
    reader.index += 1;
  }
  parseTokenPostFamily(reader, state);

  if (state.diagnostics.length > 0) {
    const suggestions = allowSuggestions
      ? (() => {
          firstBodyToken = undefined;
          lex = releaseTokenTape(lex, reader);
          return suggestionsFor(
            sourceText,
            state.suggestionSlot,
            state.root,
            accidentalStyle,
          );
        })()
      : Object.freeze({
          values: Object.freeze([]),
          compared: 0,
          peakRecords: 0,
        });
    const result = frozenFailure(sourceText, state.diagnostics, suggestions.values);
    return Object.freeze({
      result,
      evidence: evidence(
        sourceText,
        preflight,
        lex,
        result.ok ? 0 : result.diagnostics.length,
        suggestions.compared,
        suggestions.peakRecords,
        "complete",
        false,
      ),
    });
  }

  const chord = buildChord(sourceText, state);
  const canonicalText = chord === null ? null : formatChordSemantic(chord, accidentalStyle);
  if (chord === null || canonicalText === null) {
    const result = frozenFailure(
      sourceText,
      [diagnostic("symbol.ast_unformattable", 0, sourceText.length)],
      [],
    );
    return Object.freeze({
      result,
      evidence: evidence(sourceText, preflight, lex, 1, 0, 0, "complete", false),
    });
  }
  const result: ChordSymbolParseResult = Object.freeze({
    ok: true,
    chord,
    canonicalText,
    warnings: EMPTY_WARNINGS,
  });
  return Object.freeze({
    result,
    evidence: evidence(sourceText, preflight, lex, 0, 0, 0, "complete", false),
  });
}

export const parseChordSymbolWithEvidence: ParseChordSymbolWithEvidence = (
  sourceText,
  accidentalStyle,
) => parseChordSymbolOperation(sourceText, accidentalStyle, true);

export const parseChordSymbol: ParseChordSymbol = (sourceText, accidentalStyle) =>
  parseChordSymbolOperation(sourceText, accidentalStyle, true).result;

export const formatChordSymbolWithEvidence: FormatChordSymbolWithEvidence = (
  chord,
  accidentalStyle,
) => {
  const sourceText = chord.sourceText;
  const preflight = preflightSource(sourceText);
  if (preflight.invalidRange !== null) {
    const diagnostics: readonly [SymbolDiagnostic] = Object.freeze([
      diagnostic(
        "symbol.invalid_unicode_scalar",
        preflight.invalidRange.start,
        preflight.invalidRange.end,
      ),
    ]);
    const result: ChordSymbolFormatResult = Object.freeze({
      ok: false,
      diagnostics,
    });
    return Object.freeze({
      result,
      evidence: evidence(sourceText, preflight, null, 1, 0, 0, "complete", true),
    });
  }
  if (preflight.excessRange !== null) {
    const diagnostics: readonly [SymbolDiagnostic] = Object.freeze([
      diagnostic(
        "limit.symbol_code_points_exceeded",
        preflight.excessRange.start,
        preflight.excessRange.end,
      ),
    ]);
    const result: ChordSymbolFormatResult = Object.freeze({
      ok: false,
      diagnostics,
    });
    return Object.freeze({
      result,
      evidence: evidence(
        sourceText,
        preflight,
        null,
        1,
        0,
        0,
        "symbol-code-points",
        true,
      ),
    });
  }
  const canonicalText = formatChordSemantic(chord, accidentalStyle);
  const result: ChordSymbolFormatResult =
    canonicalText === null
      ? astFailure(chord)
      : Object.freeze({ ok: true, canonicalText });
  return Object.freeze({
    result,
    evidence: evidence(
      sourceText,
      preflight,
      null,
      result.ok ? 0 : result.diagnostics.length,
      0,
      0,
      "complete",
      true,
    ),
  });
};

export const formatChordSymbol: FormatChordSymbol = (chord, accidentalStyle) =>
  formatChordSymbolWithEvidence(chord, accidentalStyle).result;
