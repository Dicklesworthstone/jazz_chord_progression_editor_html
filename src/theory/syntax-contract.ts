import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_SECTION_MEASURES,
  MAX_SHORT_TEXT_CODE_POINTS,
  MAX_UTF8_IMPORT_BYTES,
  type BeatDuration,
  type ChordSpec,
  type KeyContext,
  type Meter,
} from "../domain";

/** Versioned public contract for T0 symbol and chart syntax. */
export const SYNTAX_CONTRACT_SCHEMA = "changes.theory.syntax-contract.v1";
export const CHORD_SYMBOL_GRAMMAR_ID = "changes.chord-symbol";
export const CHORD_SYMBOL_GRAMMAR_VERSION = 1;
export const CHART_TEXT_GRAMMAR_ID = "changes.chart-text";
export const CHART_TEXT_GRAMMAR_VERSION = 1;
export const CHART_TEXT_DRAFT_SCHEMA = "changes.theory.chart-text-draft.v1";

export const MAX_SYMBOL_CODE_POINTS = MAX_SHORT_TEXT_CODE_POINTS;
export const MAX_SYMBOL_TOKENS = 64;
export const MAX_SYMBOL_MODIFIERS = 32;
export const MAX_DID_YOU_MEAN = 3;
export const MAX_SUGGESTION_COMPARISONS = 64;
export const CHORD_SYMBOL_SUGGESTION_POLICY_ID =
  "changes.chord-symbol-suggestions";
export const CHORD_SYMBOL_SUGGESTION_POLICY_VERSION = 1;
export const CHORD_SYMBOL_SUGGESTION_REPLACEMENTS = Object.freeze([
  Object.freeze({
    grammarRegion: "quality",
    failedToken: "foo",
    replacementToken: "",
  }),
  Object.freeze({
    grammarRegion: "quality",
    failedToken: "dom7",
    replacementToken: "7",
  }),
  Object.freeze({
    grammarRegion: "quality",
    failedToken: "mi7",
    replacementToken: "m7",
  }),
  Object.freeze({
    grammarRegion: "quality",
    failedToken: "Maj7",
    replacementToken: "maj7",
  }),
  Object.freeze({
    grammarRegion: "sixth-family",
    failedToken: "/8",
    replacementToken: "/9",
  }),
  Object.freeze({
    grammarRegion: "quality",
    failedToken: "x",
    replacementToken: "",
  }),
  Object.freeze({
    grammarRegion: "quality",
    failedToken: "x",
    replacementToken: "m",
  }),
  Object.freeze({
    grammarRegion: "quality",
    failedToken: "x",
    replacementToken: "-",
  }),
  Object.freeze({
    grammarRegion: "quality",
    failedToken: "x",
    replacementToken: "dim",
  }),
] as const);
export type ChordSymbolSuggestionReplacement =
  (typeof CHORD_SYMBOL_SUGGESTION_REPLACEMENTS)[number];
export const MAX_CHART_UTF8_BYTES = MAX_UTF8_IMPORT_BYTES;
export const MAX_CHART_TOKENS = 65_536;
export const MAX_CHART_SECTIONS = MAX_DOCUMENT_SECTIONS;
export const MAX_CHART_MEASURES_PER_SECTION = MAX_SECTION_MEASURES;
export const MAX_CHART_EVENTS = MAX_DOCUMENT_CHORD_EVENTS;

export const ACCIDENTAL_STYLES = Object.freeze(["ascii", "unicode"] as const);
export type AccidentalStyle = (typeof ACCIDENTAL_STYLES)[number];

/** Zero-based, half-open JavaScript UTF-16 code-unit offsets. */
export type SourceRange = Readonly<{
  start: number;
  end: number;
}>;

export const SYMBOL_ERROR_CODES = Object.freeze([
  "symbol.root_missing",
  "symbol.root_invalid",
  "symbol.accidental_out_of_range",
  "symbol.quality_unknown",
  "symbol.extension_conflict",
  "symbol.modifier_duplicate",
  "symbol.modifier_conflict",
  "symbol.modifier_malformed",
  "symbol.modifier_unclosed",
  "symbol.modifier_unknown",
  "symbol.bass_invalid",
  "symbol.trailing_input",
  "symbol.ambiguous_slash",
  "symbol.whitespace_invalid",
  "symbol.invalid_unicode_scalar",
  "symbol.ast_unformattable",
  "limit.symbol_code_points_exceeded",
  "limit.symbol_tokens_exceeded",
  "limit.symbol_modifiers_exceeded",
] as const);

export type SymbolErrorCode = (typeof SYMBOL_ERROR_CODES)[number];

export const CHART_ERROR_CODES = Object.freeze([
  "chart.empty",
  "chart.document_section_required",
  "chart.header_invalid",
  "chart.header_duplicate",
  "chart.header_after_content",
  "chart.header_forbidden_in_fragment",
  "chart.meter_required",
  "chart.section_name_unclosed",
  "chart.section_name_escape_invalid",
  "chart.section_name_blank",
  "chart.annotation_unclosed",
  "chart.annotation_invalid_json",
  "chart.invalid_unicode_scalar",
  "chart.measure_unclosed",
  "chart.repeat_without_previous",
  "chart.duration_invalid",
  "chart.duration_not_representable",
  "chart.bar_underfilled",
  "chart.bar_overfilled",
  "chart.bar_division_not_representable",
  "chart.unsupported_notation",
  "chart.unexpected_token",
  "chart.draft_unformattable",
  "limit.chart_utf8_bytes_exceeded",
  "limit.chart_tokens_exceeded",
  "limit.chart_sections_exceeded",
  "limit.chart_measures_per_section_exceeded",
  "limit.chart_events_exceeded",
  "limit.chart_text_code_points_exceeded",
] as const);

export type ChartErrorCode = (typeof CHART_ERROR_CODES)[number];
export type ChartTextErrorCode = ChartErrorCode | SymbolErrorCode;

export const CHART_WARNING_CODES = Object.freeze([
  "chart.comments_not_round_tripped",
] as const);
export type ChartWarningCode = (typeof CHART_WARNING_CODES)[number];

/** Code and range are stable. Human-readable messages may improve over time. */
export type SyntaxDiagnostic<Code extends string> = Readonly<{
  code: Code;
  range: SourceRange;
  message: string;
}>;

export type SymbolDiagnostic = SyntaxDiagnostic<SymbolErrorCode>;
export type ChartDiagnostic = SyntaxDiagnostic<ChartTextErrorCode>;
export type ChartWarning = SyntaxDiagnostic<ChartWarningCode>;

export type ChordSymbolParseResult =
  | Readonly<{
      ok: true;
      chord: ChordSpec;
      canonicalText: string;
      warnings: readonly [];
    }>
  | Readonly<{
      ok: false;
      sourceText: string;
      diagnostics: readonly [SymbolDiagnostic, ...SymbolDiagnostic[]];
      didYouMean: readonly string[];
    }>;

export type ChordSymbolFormatResult =
  | Readonly<{ ok: true; canonicalText: string }>
  | Readonly<{
      ok: false;
      diagnostics: readonly [SymbolDiagnostic, ...SymbolDiagnostic[]];
    }>;

export type ChartTextHeaders = Readonly<{
  title: string | null;
  description: string | null;
  meter: Meter | null;
  tempoBpm: number | null;
  key: KeyContext | null;
}>;

export type ChartDraftEvent = Readonly<{
  ordinal: number;
  origin: "literal" | "repeat";
  repeatedFromOrdinal: number | null;
  chord: ChordSpec;
  duration: BeatDuration;
  annotation: string;
  range: SourceRange;
  symbolRange: SourceRange;
  durationRange: SourceRange | null;
  annotationRange: SourceRange | null;
}>;

export type ChartDraftMeasure = Readonly<{
  ordinal: number;
  kind: "barred" | "virtual";
  range: SourceRange;
  events: readonly ChartDraftEvent[];
}>;

export type ChartDraftSection = Readonly<{
  ordinal: number;
  kind: "implicit" | "named";
  name: string | null;
  annotation: string;
  range: SourceRange;
  measures: readonly ChartDraftMeasure[];
}>;

/**
 * A transient, immutable syntax draft. Persistent IDs, voicing, playback,
 * revision, validation brands, and publication are deliberately absent.
 */
export type ChartTextDraft = Readonly<{
  schema: typeof CHART_TEXT_DRAFT_SCHEMA;
  grammarId: typeof CHART_TEXT_GRAMMAR_ID;
  grammarVersion: typeof CHART_TEXT_GRAMMAR_VERSION;
  mode: "document" | "fragment";
  sourceText: string;
  headers: ChartTextHeaders;
  sections: readonly ChartDraftSection[];
}>;

export type InsertableChordDuration =
  | Readonly<{
      kind: "resolved";
      source: "explicit" | "allocated";
      value: BeatDuration;
    }>
  | Readonly<{
      kind: "requires-caller";
      reason: "chart.layout_invalid";
    }>;

/** Explicit recovery lane; it never authorizes a partial chart commit. */
export type InsertableChartChord = Readonly<{
  ordinal: number;
  chord: ChordSpec;
  annotation: string;
  range: SourceRange;
  symbolRange: SourceRange;
  duration: InsertableChordDuration;
  layoutContextPreserved: false;
}>;

export type ChartTextParseRequest =
  | Readonly<{ mode: "document" }>
  | Readonly<{ mode: "fragment"; meter: Meter }>;

export type ChartTextParseResult =
  | Readonly<{
      ok: true;
      draft: ChartTextDraft;
      canonicalText: string;
      warnings: readonly ChartWarning[];
    }>
  | Readonly<{
      ok: false;
      sourceText: string;
      diagnostics: readonly [ChartDiagnostic, ...ChartDiagnostic[]];
      insertableChords: readonly InsertableChartChord[];
    }>;

export type ChartTextFormatResult =
  | Readonly<{ ok: true; canonicalText: string }>
  | Readonly<{
      ok: false;
      diagnostics: readonly [ChartDiagnostic, ...ChartDiagnostic[]];
    }>;

export type ParseChordSymbol = (
  sourceText: string,
  accidentalStyle: AccidentalStyle,
) => ChordSymbolParseResult;

export type FormatChordSymbol = (
  chord: ChordSpec,
  accidentalStyle: AccidentalStyle,
) => ChordSymbolFormatResult;

export type ParseChartText = (
  sourceText: string,
  request: ChartTextParseRequest,
  accidentalStyle: AccidentalStyle,
) => ChartTextParseResult;

export type FormatChartText = (
  draft: ChartTextDraft,
  accidentalStyle: AccidentalStyle,
) => ChartTextFormatResult;

export interface SyntaxOperations {
  readonly parseChordSymbol: ParseChordSymbol;
  readonly formatChordSymbol: FormatChordSymbol;
  readonly parseChartText: ParseChartText;
  readonly formatChartText: FormatChartText;
}
