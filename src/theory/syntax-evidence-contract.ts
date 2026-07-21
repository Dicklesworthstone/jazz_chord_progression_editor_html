import type {
  ChartTextFormatResult,
  ChartTextParseRequest,
  ChartTextParseResult,
  ChordSymbolFormatResult,
  ChordSymbolParseResult,
  FormatChartText,
  FormatChordSymbol,
  ParseChordSymbol,
  SourceRange,
} from "./syntax-contract";

/** Deterministic work evidence for T0 conformance; never a wall-time cutoff. */
export type SyntaxWorkEvidence = Readonly<{
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
  termination:
    | "complete"
    | "symbol-code-points"
    | "symbol-tokens"
    | "symbol-modifiers"
    | "chart-bytes"
    | "chart-tokens"
    | "chart-text-code-points"
    | "chart-sections"
    | "chart-measures"
    | "chart-events";
}>;

export type SyntaxResultWithEvidence<Result> = Readonly<{
  result: Result;
  evidence: SyntaxWorkEvidence;
}>;

/** Exact symbol-parser work retained separately from chart-token evidence. */
export type DelegatedSymbolWorkEvidence = Readonly<{
  delegationOrdinal: number;
  symbolRange: SourceRange;
  evidence: SyntaxWorkEvidence;
}>;

export type ChartSyntaxResultWithEvidence<Result> = Readonly<{
  result: Result;
  evidence: SyntaxWorkEvidence;
  delegatedSymbols: readonly DelegatedSymbolWorkEvidence[];
}>;

export type ParseChordSymbolWithEvidence = (
  ...parameters: Parameters<ParseChordSymbol>
) => SyntaxResultWithEvidence<ChordSymbolParseResult>;

export type FormatChordSymbolWithEvidence = (
  ...parameters: Parameters<FormatChordSymbol>
) => SyntaxResultWithEvidence<ChordSymbolFormatResult>;

export type ParseChartTextWithEvidence = (
  sourceText: string,
  request: ChartTextParseRequest,
  accidentalStyle: "ascii" | "unicode",
) => ChartSyntaxResultWithEvidence<ChartTextParseResult>;

export type FormatChartTextWithEvidence = (
  ...parameters: Parameters<FormatChartText>
) => SyntaxResultWithEvidence<ChartTextFormatResult>;
