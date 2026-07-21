import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type T0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type T0ContractValidationReport = Readonly<{
  schema: "changes.validation.t0-contract.v1";
  package: "T0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    symbolCases: number;
    chartCases: number;
    metamorphicLaws: number;
    totalCases: number;
    traces: number;
    authorities: number;
    seeds: number;
    mutationControls: number;
  }>;
  findings: readonly T0ContractFinding[];
}>;

type ParsedFixture = Readonly<{
  filename: string;
  source: string;
  root: JsonObject;
  byteDigest: string;
  semanticDigest: string;
}>;

type CaseRecord = Readonly<{
  id: string;
  traceIds: readonly string[];
  authorityIds: readonly string[];
  record: JsonObject;
  path: string;
}>;

const CONTRACT_FILENAME = "t0-syntax-contract.json";

export const T0_REVIEWED_COMPANIONS = [
  "symbol-cases.json",
  "chart-cases.json",
  "roundtrip-cases.json",
  "trace-ledger.json",
  "provenance-ledger.json",
  "mutation-controls.json",
] as const;

const EXPECTED_FILES = [CONTRACT_FILENAME, ...T0_REVIEWED_COMPANIONS] as const;

const EXPECTED_SCHEMAS: Readonly<Record<(typeof EXPECTED_FILES)[number], string>> = {
  "t0-syntax-contract.json": "changes.fixtures.t0-syntax-contract.v1",
  "symbol-cases.json": "changes.fixtures.t0-symbol-cases.v1",
  "chart-cases.json": "changes.fixtures.t0-chart-cases.v1",
  "roundtrip-cases.json": "changes.fixtures.t0-roundtrip-cases.v1",
  "trace-ledger.json": "changes.fixtures.t0-trace-ledger.v1",
  "provenance-ledger.json": "changes.fixtures.t0-provenance-ledger.v1",
  "mutation-controls.json": "changes.fixtures.t0-mutation-controls.v1",
};

const EXPECTED_TOP_LEVEL_KEYS: Readonly<Record<(typeof EXPECTED_FILES)[number], readonly string[]>> = {
  "t0-syntax-contract.json": [
    "chartPolicy",
    "contractVersion",
    "expectedValuesGenerated",
    "fixtureFiles",
    "forbiddenShortcuts",
    "grammar",
    "limits",
    "productionOutputUsed",
    "publicContract",
    "requiredCaseKinds",
    "schema",
    "sourceRanges",
    "status",
    "suggestionPolicy",
    "symbolPolicy",
    "workEvidence",
  ],
  "symbol-cases.json": [
    "aliasCases",
    "boundaryCases",
    "canonicalCases",
    "expectedChordDefaults",
    "expectedValueEncoding",
    "failureCases",
    "fixtureVersion",
    "formatFailureCases",
    "productionOutputUsed",
    "schema",
  ],
  "chart-cases.json": [
    "boundaryCases",
    "defaultAccidentalStyle",
    "defaultHeaders",
    "draftDefaults",
    "eventDefaults",
    "expectedValueEncoding",
    "failureCases",
    "fixtureVersion",
    "productionOutputUsed",
    "rangePolicy",
    "schema",
    "successCases",
  ],
  "roundtrip-cases.json": [
    "fixtureVersion",
    "laws",
    "productionOutputUsed",
    "schema",
    "seedAlgorithm",
    "seeds",
  ],
  "trace-ledger.json": [
    "caseLinkPolicy",
    "expectedValuesGenerated",
    "ledgerVersion",
    "productionOutputUsed",
    "schema",
    "stableTraceIdsOnly",
    "traces",
  ],
  "provenance-ledger.json": [
    "authoringStatement",
    "authorities",
    "expectedValuesGenerated",
    "independenceRules",
    "ledgerVersion",
    "productionOutputUsed",
    "schema",
  ],
  "mutation-controls.json": [
    "controls",
    "ledgerVersion",
    "productionOutputUsed",
    "schema",
    "status",
  ],
};

export const T0_REVIEWED_PUBLIC_CONTRACT = {
  module: "src/theory/syntax-contract.ts",
  syntaxSchema: "changes.theory.syntax-contract.v1",
  symbolGrammarId: "changes.chord-symbol",
  symbolGrammarVersion: 1,
  chartGrammarId: "changes.chart-text",
  chartGrammarVersion: 1,
  chartDraftSchema: "changes.theory.chart-text-draft.v1",
  operationKeys: [
    "parseChordSymbol",
    "formatChordSymbol",
    "parseChartText",
    "formatChartText",
  ],
} as const;

export const T0_REVIEWED_SUGGESTION_POLICY = {
  id: "changes.chord-symbol-suggestions",
  version: 1,
  maximumComparisons: 64,
  maximumResults: 3,
  rootPreserving: true,
  candidateSource: "closed replacement table only",
  replacements: [
    { grammarRegion: "quality", failedToken: "foo", replacementToken: "" },
    { grammarRegion: "quality", failedToken: "dom7", replacementToken: "7" },
    { grammarRegion: "quality", failedToken: "mi7", replacementToken: "m7" },
    { grammarRegion: "quality", failedToken: "Maj7", replacementToken: "maj7" },
    {
      grammarRegion: "sixth-family",
      failedToken: "/8",
      replacementToken: "/9",
    },
    { grammarRegion: "quality", failedToken: "x", replacementToken: "" },
    { grammarRegion: "quality", failedToken: "x", replacementToken: "m" },
    { grammarRegion: "quality", failedToken: "x", replacementToken: "-" },
    { grammarRegion: "quality", failedToken: "x", replacementToken: "dim" },
  ],
} as const;

export const T0_REVIEWED_LIMITS = {
  symbolCodePoints: 256,
  symbolTokens: 64,
  symbolModifiers: 32,
  chartUtf8Bytes: 2_097_152,
  chartTokens: 65_536,
  chartSections: 64,
  chartMeasuresPerSection: 1_024,
  chartEvents: 8_192,
  titleAndSectionNameCodePoints: 256,
  descriptionAndAnnotationCodePoints: 2_000,
  tempoBpm: { minimum: 20, maximum: 400 },
  beatsPerBar: { minimum: 1, maximum: 32 },
  beatUnits: [2, 4, 8],
  durationNumeratorMaximum: 2_147_483_647,
  durationDenominatorDivides: 960,
  totalDraftQuarterNoteBeats: 1_000_000,
  totalDraftLimitReachability:
    "dominated: 8192 events times maximum 64 quarter-note measure capacity equals 524288, below 1000000",
} as const;

export const T0_REVIEWED_WORK_EVIDENCE = {
  counters: [
    "sourceUtf16CodeUnits",
    "sourceCodePoints",
    "sourceUtf8Bytes",
    "maxDecodedTextCodePointsObserved",
    "lexerCodePointsVisited",
    "tokensProduced",
    "parserTransitions",
    "modifierItemsObserved",
    "headersObserved",
    "sectionsObserved",
    "measuresObserved",
    "slotsObserved",
    "chordDelegations",
    "allocationDivisions",
    "numericComponentsCompared",
    "maxSourceBigIntDigits",
    "suggestionsCompared",
    "diagnosticsProduced",
    "insertableCandidatesProduced",
    "peakTokenRecords",
    "peakDraftNodes",
    "peakSuggestionRecords",
    "termination",
  ],
  terminationValues: [
    "complete",
    "symbol-code-points",
    "symbol-tokens",
    "symbol-modifiers",
    "chart-bytes",
    "chart-tokens",
    "chart-text-code-points",
    "chart-sections",
    "chart-measures",
    "chart-events",
  ],
  counterSemantics: {
    sourceUtf16CodeUnits: "input string length, observed without traversal",
    sourceCodePoints:
      "well-formed Unicode scalar values visited by preflight before completion or the first invalid scalar",
    sourceUtf8Bytes:
      "UTF-8 bytes visited through the same valid scalar prefix; full byte count for well-formed input",
    maxDecodedTextCodePointsObserved:
      "largest decoded header, section-name, or annotation scalar count reached",
    lexerCodePointsVisited:
      "well-formed scalar values consumed after preflight by this operation's own lexical layer",
    tokensProduced:
      "complete syntax tokens emitted by this operation's own grammar layer, including the first token beyond its token limit",
    parserTransitions:
      "own-layer produced tokens consumed or explicitly skipped by deterministic recovery, one transition per token",
    modifierItemsObserved:
      "complete normalized modifier items observed by a symbol operation, including the first item beyond the modifier limit; zero for chart operations",
    headersObserved: "complete header directives observed",
    sectionsObserved:
      "complete section records observed, including the first section beyond the section limit",
    measuresObserved:
      "complete measure records observed globally, including the first measure beyond a per-section limit",
    slotsObserved:
      "complete chord or repeat slots observed, including the first slot beyond the event limit",
    chordDelegations:
      "complete chord-symbol spans actually delegated to the symbol parser",
    allocationDivisions:
      "successful exact remainder-by-undurated-slot divisions performed",
    numericComponentsCompared:
      "explicit duration numerator and denominator significant slices checked for zero and bounded decimal magnitude; zero outside chart parsing",
    maxSourceBigIntDigits:
      "maximum significant decimal source digits passed to BigInt; zero when no source component is constructed and never greater than 13",
    suggestionsCompared:
      "versioned suggestion-table candidates actually compared by a symbol operation; zero for chart operations",
    diagnosticsProduced:
      "diagnostic records on the returned branch: errors on failure or warnings on success",
    insertableCandidatesProduced:
      "insertableChords entries present on the returned failure branch",
    peakTokenRecords:
      "maximum simultaneously retained operation-owned token records, including an active delegated symbol parser",
    peakDraftNodes:
      "maximum simultaneously retained draft root, section, measure, and event records allocated or copied by the operation; caller-owned input is excluded",
    peakSuggestionRecords:
      "maximum simultaneously retained suggestion candidates",
  },
  operationSemantics: {
    parseChordSymbol: {
      sourceTextOwner: "sourceText argument",
      evidenceMode: "lex and parse the bounded symbol source",
    },
    parseChartText: {
      sourceTextOwner: "sourceText argument",
      evidenceMode:
        "lex and parse the bounded chart source with chart-only lexical counters plus ordered per-delegation symbol evidence",
    },
    formatChordSymbol: {
      sourceTextOwner: "chord.sourceText",
      evidenceMode:
        "preflight chord.sourceText for well-formed Unicode, then validate and format the supplied AST without lexing or reparsing sourceText",
      zeroCounters: [
        "lexerCodePointsVisited",
        "tokensProduced",
        "parserTransitions",
        "modifierItemsObserved",
        "headersObserved",
        "sectionsObserved",
        "measuresObserved",
        "slotsObserved",
        "chordDelegations",
        "allocationDivisions",
        "numericComponentsCompared",
        "maxSourceBigIntDigits",
        "suggestionsCompared",
        "insertableCandidatesProduced",
        "peakTokenRecords",
        "peakDraftNodes",
        "peakSuggestionRecords",
      ],
    },
    formatChartText: {
      sourceTextOwner: "draft.sourceText",
      evidenceMode:
        "preflight draft.sourceText for well-formed Unicode, then validate draft records in the documented exact order and delegate each reached event chord to the symbol formatter without lexing or reparsing sourceText; structural and returned-diagnostic counters are exact",
      nestedSymbolDiagnosticRange:
        "replace every delegated formatter diagnostic range with the current chart event symbolRange for literal and repeat events; never offset chord.sourceText coordinates",
      unaddressableDecodedFieldRefusal:
        "never reparse sourceText or guess a component range: decoded header faults use chart.draft_unformattable at zero range, section name/annotation faults use the owning section range, event decoded-invalid-scalar faults use the event range, and only an event text-limit fault may use its stored complete annotationRange",
      zeroCounters: [
        "lexerCodePointsVisited",
        "tokensProduced",
        "parserTransitions",
        "modifierItemsObserved",
        "allocationDivisions",
        "numericComponentsCompared",
        "maxSourceBigIntDigits",
        "suggestionsCompared",
        "insertableCandidatesProduced",
        "peakTokenRecords",
        "peakDraftNodes",
        "peakSuggestionRecords",
      ],
    },
  },
  delegatedSymbolEvidence: {
    owner: "ParseChartTextWithEvidence.delegatedSymbols",
    order: "zero-based delegationOrdinal in ascending chart symbolRange source order",
    range: "chart-coordinate range of the complete delegated literal chord span",
    evidence:
      "byte-identical SyntaxWorkEvidence from parseChordSymbol over the parseChartText input sourceText.slice(symbolRange.start, symbolRange.end)",
    outerCounters:
      "outer source, lexer, token, parser, modifier, suggestion, and termination counters never sum delegated values; modifierItemsObserved and suggestionsCompared are zero",
    outerPeaks:
      "peakTokenRecords and peakSuggestionRecords remain operation-wide and include the one active delegated parser",
    recovery:
      "a localized delegated limit keeps its nested symbol termination while outer termination remains complete when chart recovery reaches end of source",
  },
  bounds: {
    preflightUtf16VisitsPerCodeUnit: 1,
    additionalLexerVisitsPerCodeUnit: 1,
    parserConsumesEachProducedTokenAtMost: 1,
    durationFoldVisitsPerSlotAtMost: 2,
    chordDelegationsAtMost: 8_192,
    delegatedSymbolSummariesAtMost: 8_192,
    tokensPerChordDelegationAtMost: 65,
    symbolTokensProducedAtMost: 65,
    chartTokensProducedAtMost: 65_537,
    symbolModifierItemsObservedAtMost: 33,
    numericComponentsComparedAtMost: 16_384,
    maxSourceBigIntDigitsAtMost: 13,
    allocationDivisions:
      "exactly one per nonempty measure with at least one undurated slot that reaches allocation",
    symbolSuggestionComparisonsAtMost: 64,
    suggestionsReturnedAtMost: 3,
    peakTokenRecordsAtMost: 65_600,
    peakDraftNodesAtMost: 73_793,
    peakSuggestionRecordsAtMost: 64,
  },
  boundaryEvidencePolicy:
    "Every parse-side limit recipe is independently materialized from an exact expression, pins the resulting source length, identifies the zero-based first-excess scalar, token, modifier item, decoded text field, section, measure, or event, and pins that diagnostic's literal half-open UTF-16 range plus the exact terminating counter projection and termination value. Other counters are checked against these independent semantic definitions and bounds rather than implementation-specific allocation totals.",
  hostileDurationDecimalPolicy:
    "Strip leading ASCII zeroes before bounds comparison while preserving raw source; an all-zero numerator or denominator is invalid and never reaches BigInt. Integer :p is bounded by 2147483647. Fraction :p/q first bounds q to a three-digit divisor of 960, then bounds p by 2147483647 multiplied by q before F1 reduction. Construct BigInt only from bounded significant slices. Reviewed exact maxima, max-plus-one, all-zero, near-2-MiB integer, rational-numerator, rational-denominator, and byte-max-plus-one recipes prove rejection and precedence with numeric work evidence.",
  scratchMemory:
    "bounded by source plus operation-owned peakTokenRecords, peakDraftNodes, and peakSuggestionRecords; caller-owned formatter input is excluded; wall time and process RSS are observations only",
  wallTimeSemanticCutoff: false,
  residentMemorySemanticCutoff: false,
} as const;

export const T0_REVIEWED_SYMBOL_ERROR_CODES = [
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
] as const;

export const T0_REVIEWED_CHART_ERROR_CODES = [
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
] as const;

export const T0_REVIEWED_CHART_WARNING_CODES = [
  "chart.comments_not_round_tripped",
] as const;

export const T0_REVIEWED_TRACE_IDS = [
  "T0-TRACE-SYMBOL-GRAMMAR",
  "T0-TRACE-LONGEST-TOKEN",
  "T0-TRACE-ALIASES",
  "T0-TRACE-UNICODE",
  "T0-TRACE-HIGHEST-EXTENSION",
  "T0-TRACE-MODIFIERS",
  "T0-TRACE-SLASH",
  "T0-TRACE-STRICT-WHITESPACE",
  "T0-TRACE-STRICT-REFUSAL",
  "T0-TRACE-FORMATTER",
  "T0-TRACE-RANGES",
  "T0-TRACE-DID-YOU-MEAN",
  "T0-TRACE-CHART-MODES",
  "T0-TRACE-HEADERS",
  "T0-TRACE-CHART-STRUCTURE",
  "T0-TRACE-ANNOTATIONS",
  "T0-TRACE-COMMENTS",
  "T0-TRACE-DURATION",
  "T0-TRACE-REPEAT",
  "T0-TRACE-TRANSACTION",
  "T0-TRACE-ROUNDTRIP",
  "T0-TRACE-DETERMINISM",
  "T0-TRACE-LIMITS",
  "T0-TRACE-LEGACY-REFUSAL",
  "L-THEORY-02",
] as const;

const ALLOWED_AUTHORITY_CLASSES = new Set([
  "definition",
  "published-reference",
  "expert-reviewed",
  "compatibility",
]);

const REQUIRED_CASE_KINDS = [
  "symbol-success",
  "symbol-alias",
  "symbol-failure",
  "symbol-format-failure",
  "chart-success",
  "chart-failure",
  "boundary-recipe",
  "metamorphic-law",
] as const;

const REQUIRED_CANONICAL_SYMBOLS = [
  "C",
  "Cm",
  "Cdim",
  "Caug",
  "Csus2",
  "Csus4",
  "C5",
  "C6",
  "Cm6",
  "C6/9",
  "Cm6/9",
  "Cmaj7",
  "C7",
  "Cm7",
  "Cm(maj7)",
  "Cm7b5",
  "Cdim7",
  "Caug(maj7)",
  "Cmaj9",
  "C9",
  "Cm9",
  "C11",
  "Cm11",
  "C13",
  "Cmaj13",
  "Cm13",
  "C7b5",
  "C7#5",
  "C7b9",
  "C7#9",
  "C7#11",
  "C7b13",
  "C7(b9,#9)",
  "C7(#9,#11)",
  "C13(b9,#11)",
  "C7alt",
  "C9sus4",
  "C13sus4",
  "C7b9sus4",
  "Cmaj7(#11)/G",
  "Db7/Cb",
  "F#m7b5/C",
  "Cadd9",
  "Cm(add9)",
  "C7(no5)",
  "Csus4(add3)",
  "C6/E",
  "C6/9/E",
  "C7add9b9",
] as const;

const EXPECTED_BYTE_DIGESTS: Readonly<Record<(typeof EXPECTED_FILES)[number], string>> = {
  "t0-syntax-contract.json": "798324de9b1ed3cb5dbf97bfc4d38315a5fbb43bd06c8eb4adcc10694b0dd2d1",
  "symbol-cases.json": "24cfdee1150691b82b7a7ac9c218d6d8b9de118292438c94dfc9acab86759a40",
  "chart-cases.json": "f8e7d629500aca1f8c3a7471e560fc8ff8f9eceaa5c5cf516ee6bbb499e1eb4e",
  "roundtrip-cases.json": "d7bfcfe5fa97b869a3b373a17d5ea0e5f531e9511454cfe885b85ac8fdab183d",
  "trace-ledger.json": "e2f24713e049a750118ba7aef781da2404a6d33d33b6b3d32a6e92af2b01e879",
  "provenance-ledger.json": "eff56ba358ac584d2d81e2c32fd39272bb478dd14c4c458561d9ec1da8c5cae2",
  "mutation-controls.json": "f4c484ad820aa6393119f7ea45774ea360e7193f6a1b448c6484b95994aa180c",
};

/** Sorted-object JSON digests distinguish semantic review from formatting bytes. */
const EXPECTED_SEMANTIC_DIGESTS: Readonly<Record<(typeof EXPECTED_FILES)[number], string>> = {
  "t0-syntax-contract.json": "724c4bb9cd51cdf7f0c76185f05d57f763c5b7fd583787a2c898bb6154826025",
  "symbol-cases.json": "a7af0c0b2a2670427482358d672fd6190c425ceddb48e9124e436bc1d631cd89",
  "chart-cases.json": "2fb800d997245d2e53a1a6ebaf1eab1ecfc4a7133721bd95a8d85cab8fb49b4f",
  "roundtrip-cases.json": "877a04dd3da6d0a857ab52f86632d5ec51ed37195c7e88143fc46e58a699cf08",
  "trace-ledger.json": "8b28d23fdd5f563db884fe5501f76ba1148e4bc1cf9f5bdb994f0288c3597dc6",
  "provenance-ledger.json": "566758a47a04ba1b2ac7e00ba85cc5c062ddee4659084cd06a7197d245ffa35a",
  "mutation-controls.json": "a2e182eaac7113977824b1246f26afdb0713faaf365ef539fa670ccdcb5d200f",
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function objectArray(value: unknown): JsonObject[] | null {
  return Array.isArray(value) && value.every(isObject) ? value : null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function idOf(record: JsonObject): string | null {
  return typeof record["id"] === "string" ? record["id"] : null;
}

/**
 * Parse enough JSON grammar to identify duplicate decoded keys before
 * `JSON.parse` applies last-key-wins semantics. String keys are decoded with
 * the native JSON string parser, so `"a"` and `"\u0061"` collide.
 */
function duplicateJsonKeys(source: string): readonly string[] {
  let cursor = 0;
  const duplicates: string[] = [];

  const whitespace = (): void => {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  };

  const stringToken = (): Readonly<{ decoded: string; start: number }> | null => {
    whitespace();
    if (source[cursor] !== '"') return null;
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const unit = source[cursor];
      if (unit === "\\") {
        cursor += 2;
        continue;
      }
      cursor += 1;
      if (unit === '"') {
        const raw = source.slice(start, cursor);
        try {
          return { decoded: JSON.parse(raw) as string, start };
        } catch {
          return null;
        }
      }
    }
    return null;
  };

  const value = (path: readonly (string | number)[]): void => {
    whitespace();
    const unit = source[cursor];
    if (unit === "{") {
      cursor += 1;
      const seen = new Set<string>();
      whitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        const key = stringToken();
        if (key === null) return;
        if (seen.has(key.decoded)) {
          duplicates.push(
            `${pathString(path)}.${JSON.stringify(key.decoded)}@${String(key.start)}`,
          );
        }
        seen.add(key.decoded);
        whitespace();
        if (source[cursor] !== ":") return;
        cursor += 1;
        value([...path, key.decoded]);
        whitespace();
        if (source[cursor] === "}") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === "[") {
      cursor += 1;
      let index = 0;
      whitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        value([...path, index]);
        index += 1;
        whitespace();
        if (source[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === '"') {
      stringToken();
      return;
    }
    while (cursor < source.length && !/[\s,\]}]/u.test(source[cursor] ?? "")) {
      cursor += 1;
    }
  };

  value([]);
  return duplicates.sort();
}

function pathString(path: readonly (string | number)[]): string {
  return path.length === 0
    ? "$"
    : `$${path.map((item) => `[${JSON.stringify(item)}]`).join("")}`;
}

function findingOrder(left: T0ContractFinding, right: T0ContractFinding): number {
  return (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function caseRecords(
  root: JsonObject,
  filename: string,
  collections: readonly string[],
  findings: T0ContractFinding[],
): CaseRecord[] {
  const result: CaseRecord[] = [];
  for (const collection of collections) {
    const records = objectArray(root[collection]);
    if (records === null) {
      findings.push({
        code: "T0_CONTRACT_CASE_SHAPE",
        path: `${filename}.${collection}`,
        message: "Case collection must be an array of objects.",
      });
      continue;
    }
    records.forEach((record, index) => {
      const id = idOf(record);
      const traceIds = stringArray(record["traceIds"]);
      const authorityIds = stringArray(record["authorityIds"]);
      const path = `${filename}.${collection}[${String(index)}]`;
      if (id === null || traceIds === null || authorityIds === null) {
        findings.push({
          code: "T0_CONTRACT_CASE_SHAPE",
          path,
          message: "Every case requires string id, traceIds, and authorityIds.",
        });
        return;
      }
      if (traceIds.length === 0 || authorityIds.length === 0) {
        findings.push({
          code: "T0_CONTRACT_CASE_REF",
          path,
          message: "Every case must cite at least one trace and authority.",
        });
      }
      result.push({ id, traceIds, authorityIds, record, path });
    });
  }
  return result;
}

function registerIds(
  records: readonly Readonly<{ id: string; path: string }>[],
  namespace: string,
  globalIds: Map<string, string>,
  findings: T0ContractFinding[],
): void {
  for (const record of records) {
    const prior = globalIds.get(record.id);
    if (prior !== undefined) {
      findings.push({
        code: "T0_CONTRACT_ID_DUPLICATE",
        path: record.path,
        message: `ID ${JSON.stringify(record.id)} duplicates ${prior}.`,
      });
    } else {
      globalIds.set(record.id, `${namespace}:${record.path}`);
    }
  }
}

function requireExact(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  message: string,
  findings: T0ContractFinding[],
): void {
  if (!sameJson(actual, expected)) findings.push({ code, path, message });
}

function validateManifest(root: JsonObject, findings: T0ContractFinding[]): void {
  requireExact(
    root["fixtureFiles"],
    [...T0_REVIEWED_COMPANIONS],
    "T0_CONTRACT_COMPANIONS",
    `${CONTRACT_FILENAME}.fixtureFiles`,
    "Companion inventory or reviewed order changed.",
    findings,
  );
  requireExact(
    root["publicContract"],
    T0_REVIEWED_PUBLIC_CONTRACT.module,
    "T0_CONTRACT_PUBLIC",
    `${CONTRACT_FILENAME}.publicContract`,
    "Public syntax contract owner changed.",
    findings,
  );
  requireExact(
    root["grammar"],
    {
      symbol: {
        id: T0_REVIEWED_PUBLIC_CONTRACT.symbolGrammarId,
        version: T0_REVIEWED_PUBLIC_CONTRACT.symbolGrammarVersion,
      },
      chart: {
        id: T0_REVIEWED_PUBLIC_CONTRACT.chartGrammarId,
        version: T0_REVIEWED_PUBLIC_CONTRACT.chartGrammarVersion,
      },
      draftSchema: T0_REVIEWED_PUBLIC_CONTRACT.chartDraftSchema,
    },
    "T0_CONTRACT_GRAMMAR",
    `${CONTRACT_FILENAME}.grammar`,
    "Grammar identities or versions changed.",
    findings,
  );
  requireExact(
    root["limits"],
    T0_REVIEWED_LIMITS,
    "T0_CONTRACT_LIMITS",
    `${CONTRACT_FILENAME}.limits`,
    "Normative syntax limits changed.",
    findings,
  );
  requireExact(
    root["requiredCaseKinds"],
    [...REQUIRED_CASE_KINDS],
    "T0_CONTRACT_REQUIRED_CASE",
    `${CONTRACT_FILENAME}.requiredCaseKinds`,
    "Required case-kind inventory changed.",
    findings,
  );
  requireExact(
    root["workEvidence"],
    T0_REVIEWED_WORK_EVIDENCE,
    "T0_CONTRACT_LIMITS",
    `${CONTRACT_FILENAME}.workEvidence`,
    "Deterministic work-counter or scratch-memory contract changed.",
    findings,
  );
  requireExact(
    root["sourceRanges"],
    {
      base: 0,
      end: "exclusive",
      unit: "ECMAScript UTF-16 code unit",
      diagnosticOrdering: ["range.start", "range.end", "code"],
      didYouMeanOrdering: [
        "case-sensitive Levenshtein distance over Unicode scalar values",
        "canonical spelling before accepted alias",
        "ECMAScript code-unit lexical order",
      ],
      didYouMeanMaximumEditDistance: 3,
      didYouMeanMaximumResults: 3,
      didYouMeanMaximumComparisons: 64,
      didYouMeanRootPreserving: true,
      didYouMeanSuggestionsMustParse: true,
      limitDiagnosticRanges:
        "first excess scalar, token, modifier item, or structured node in original UTF-16 coordinates; chart byte limit covers the scalar whose UTF-8 encoding crosses the budget",
    },
    "T0_CONTRACT_PUBLIC",
    `${CONTRACT_FILENAME}.sourceRanges`,
    "Source-range or suggestion-order contract changed.",
    findings,
  );
  requireExact(
    root["suggestionPolicy"],
    T0_REVIEWED_SUGGESTION_POLICY,
    "T0_CONTRACT_PUBLIC",
    `${CONTRACT_FILENAME}.suggestionPolicy`,
    "Versioned closed suggestion replacement policy changed.",
    findings,
  );
}

function validateRequiredCases(
  symbolRoot: JsonObject,
  chartRoot: JsonObject,
  findings: T0ContractFinding[],
): void {
  const canonical = objectArray(symbolRoot["canonicalCases"]) ?? [];
  const actualSymbols = canonical.map((record) => record["input"]);
  requireExact(
    actualSymbols,
    [...REQUIRED_CANONICAL_SYMBOLS],
    "T0_CONTRACT_REQUIRED_CASE",
    "symbol-cases.json.canonicalCases",
    "Mandatory canonical symbol inventory or order changed.",
    findings,
  );
  const expectedIds = REQUIRED_CANONICAL_SYMBOLS.map(
    (_, index) => `T0-SYM-${String(index + 1).padStart(3, "0")}`,
  );
  requireExact(
    canonical.map(idOf),
    expectedIds,
    "T0_CONTRACT_REQUIRED_CASE",
    "symbol-cases.json.canonicalCases",
    "Mandatory canonical symbol IDs changed.",
    findings,
  );
  for (const [index, record] of canonical.entries()) {
    const expected = isObject(record["expected"]) ? record["expected"] : null;
    if (
      expected?.["ok"] !== true ||
      typeof expected["canonicalText"] !== "string"
    ) {
      findings.push({
        code: "T0_CONTRACT_REQUIRED_CASE",
        path: `symbol-cases.json.canonicalCases[${String(index)}].expected`,
        message: "Canonical symbol row must be an explicit successful parse and format oracle.",
      });
    }
  }

  const chartSuccess = objectArray(chartRoot["successCases"]) ?? [];
  const modes = [...new Set(chartSuccess.map((record) => {
    const request = isObject(record["request"]) ? record["request"] : null;
    return request?.["mode"];
  }))].sort();
  requireExact(
    modes,
    ["document", "fragment"],
    "T0_CONTRACT_REQUIRED_CASE",
    "chart-cases.json.successCases",
    "Successful chart corpus must cover document and fragment modes.",
    findings,
  );
  const implicitCovered = chartSuccess.some((record) => {
    const input = typeof record["input"] === "string" ? record["input"] : "";
    return !input.includes("[");
  });
  const namedCovered = chartSuccess.some((record) => {
    const input = typeof record["input"] === "string" ? record["input"] : "";
    return input.includes("[") && input.includes("]");
  });
  if (!implicitCovered || !namedCovered) {
    findings.push({
      code: "T0_CONTRACT_REQUIRED_CASE",
      path: "chart-cases.json.successCases",
      message: "Successful chart corpus must cover implicit and named sections.",
    });
  }
}

function validateSuggestionCases(
  symbolRoot: JsonObject,
  roundtripRoot: JsonObject,
  findings: T0ContractFinding[],
): void {
  const suggestions = new Map<string, unknown>();
  for (const record of objectArray(symbolRoot["failureCases"]) ?? []) {
    const expected = isObject(record["expected"]) ? record["expected"] : null;
    if (
      typeof record["input"] === "string" &&
      expected !== null &&
      Array.isArray(expected["didYouMean"])
    ) {
      suggestions.set(record["input"], expected["didYouMean"]);
    }
    for (const row of objectArray(record["rows"]) ?? []) {
      if (
        typeof row["source"] === "string" &&
        Array.isArray(row["didYouMean"])
      ) {
        suggestions.set(row["source"], row["didYouMean"]);
      }
    }
  }
  const laws = objectArray(roundtripRoot["laws"]) ?? [];
  const suggestionLaw = laws.find((record) => idOf(record) === "T0-META-012");
  for (const row of suggestionLaw ? objectArray(suggestionLaw["rows"]) ?? [] : []) {
    if (
      typeof row["source"] === "string" &&
      Array.isArray(row["suggestions"])
    ) {
      suggestions.set(row["source"], row["suggestions"]);
    }
  }
  const required = {
    Cfoo: ["C"],
    Cdom7: ["C7"],
    Cmi7: ["Cm7"],
    CMaj7: ["Cmaj7"],
    "C6/8": ["C6/9"],
    Dbdom7: ["Db7"],
    "F#mi7": ["F#m7"],
  } as const;
  for (const [source, expected] of Object.entries(required)) {
    requireExact(
      suggestions.get(source),
      expected,
      "T0_CONTRACT_REQUIRED_CASE",
      `suggestions.${source}`,
      "Reviewed suggestion golden changed or is missing.",
      findings,
    );
  }
  for (const [source, values] of suggestions) {
    if (Array.isArray(values) && values.includes("Cdim7")) {
      findings.push({
        code: "T0_CONTRACT_REQUIRED_CASE",
        path: `suggestions.${source}`,
        message:
          "Cdim7 is not an authorized candidate in suggestion policy version 1.",
      });
    }
  }
}

function validateBoundaryPairs(
  roots: readonly Readonly<{ filename: string; records: readonly JsonObject[] }>[],
  findings: T0ContractFinding[],
): void {
  for (const { filename, records } of roots) {
    records.forEach((record, index) => {
      const expected = isObject(record["expected"]) ? record["expected"] : null;
      if (expected === null || typeof expected["limit"] !== "number") return;
      const received = expected["received"];
      const exactNext =
        typeof received === "number" && received === expected["limit"] + 1;
      const atomicScalarCrossing =
        expected["atomicScalarCrossing"] === true &&
        typeof received === "number" &&
        received > expected["limit"] &&
        received <= expected["limit"] + 3;
      if (!exactNext && !atomicScalarCrossing) {
        findings.push({
          code: "T0_CONTRACT_BOUNDARY",
          path: `${filename}.boundaryCases[${String(index)}].expected`,
          message:
            "Boundary refusal must observe maximum plus one, except an atomic UTF-8 scalar may cross by at most three bytes.",
        });
      }
      const near = isObject(record["nearBoundary"])
        ? record["nearBoundary"]
        : null;
      const maximumObserved = near && Object.entries(near).some(
        ([key, value]) => key !== "ok" && value === expected["limit"],
      );
      const maximumAccepted =
        near?.["ok"] === true ||
        near?.["preflightLimitAccepted"] === true ||
        near?.["limitTriggered"] === false;
      if (!maximumAccepted || !maximumObserved) {
        findings.push({
          code: "T0_CONTRACT_BOUNDARY",
          path: `${filename}.boundaryCases[${String(index)}].nearBoundary`,
          message: "Boundary row must pair the +1 refusal with an explicit accepted maximum.",
        });
      }
    });
  }
}

const LIMIT_EVIDENCE_BY_CODE: Readonly<
  Record<string, Readonly<{ counter: string; termination: string }>>
> = {
  "limit.symbol_code_points_exceeded": {
    counter: "sourceCodePoints",
    termination: "symbol-code-points",
  },
  "limit.symbol_tokens_exceeded": {
    counter: "tokensProduced",
    termination: "symbol-tokens",
  },
  "limit.symbol_modifiers_exceeded": {
    counter: "modifierItemsObserved",
    termination: "symbol-modifiers",
  },
  "limit.chart_utf8_bytes_exceeded": {
    counter: "sourceUtf8Bytes",
    termination: "chart-bytes",
  },
  "limit.chart_tokens_exceeded": {
    counter: "tokensProduced",
    termination: "chart-tokens",
  },
  "limit.chart_sections_exceeded": {
    counter: "sectionsObserved",
    termination: "chart-sections",
  },
  "limit.chart_measures_per_section_exceeded": {
    counter: "measuresObserved",
    termination: "chart-measures",
  },
  "limit.chart_events_exceeded": {
    counter: "slotsObserved",
    termination: "chart-events",
  },
  "limit.chart_text_code_points_exceeded": {
    counter: "maxDecodedTextCodePointsObserved",
    termination: "chart-text-code-points",
  },
};

function validateWorkEvidence(
  roots: readonly Readonly<{ filename: string; records: readonly JsonObject[] }>[],
  findings: T0ContractFinding[],
): void {
  const counterNames = new Set<string>(T0_REVIEWED_WORK_EVIDENCE.counters);
  const terminationValues = new Set<string>(
    T0_REVIEWED_WORK_EVIDENCE.terminationValues,
  );
  const numericBounds: Readonly<Record<string, number>> = {
    numericComponentsCompared:
      T0_REVIEWED_WORK_EVIDENCE.bounds.numericComponentsComparedAtMost,
    maxSourceBigIntDigits:
      T0_REVIEWED_WORK_EVIDENCE.bounds.maxSourceBigIntDigitsAtMost,
    suggestionsCompared:
      T0_REVIEWED_WORK_EVIDENCE.bounds.symbolSuggestionComparisonsAtMost,
    peakTokenRecords: T0_REVIEWED_WORK_EVIDENCE.bounds.peakTokenRecordsAtMost,
    peakDraftNodes: T0_REVIEWED_WORK_EVIDENCE.bounds.peakDraftNodesAtMost,
    peakSuggestionRecords:
      T0_REVIEWED_WORK_EVIDENCE.bounds.peakSuggestionRecordsAtMost,
  };
  for (const { filename, records } of roots) {
    records.forEach((record, index) => {
      const expected = isObject(record["expected"]) ? record["expected"] : null;
      if (expected === null || typeof expected["code"] !== "string") return;
      const evidence = isObject(expected["expectedEvidence"])
        ? expected["expectedEvidence"]
        : null;
      const path = `${filename}.boundaryCases[${String(index)}].expected.expectedEvidence`;
      if (evidence === null) {
        findings.push({
          code: "T0_CONTRACT_WORK_EVIDENCE",
          path,
          message: "Every executable boundary recipe requires deterministic expectedEvidence.",
        });
        return;
      }
      for (const key of Object.keys(evidence)) {
        if (!counterNames.has(key)) {
          findings.push({
            code: "T0_CONTRACT_WORK_EVIDENCE",
            path: `${path}.${key}`,
            message: "Boundary evidence contains a stale or unknown counter.",
          });
        }
      }
      const termination = evidence["termination"];
      if (
        typeof termination !== "string" ||
        !terminationValues.has(termination)
      ) {
        findings.push({
          code: "T0_CONTRACT_WORK_EVIDENCE",
          path: `${path}.termination`,
          message: "Boundary evidence requires one reviewed termination value.",
        });
      }
      for (const [key, value] of Object.entries(evidence)) {
        if (key === "termination") continue;
        if (
          typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < 0
        ) {
          findings.push({
            code: "T0_CONTRACT_WORK_EVIDENCE",
            path: `${path}.${key}`,
            message: "Work counters must be nonnegative safe integers.",
          });
          continue;
        }
        const maximum = numericBounds[key];
        if (maximum !== undefined && value > maximum) {
          findings.push({
            code: "T0_CONTRACT_WORK_EVIDENCE",
            path: `${path}.${key}`,
            message: `Work counter exceeds reviewed maximum ${String(maximum)}.`,
          });
        }
      }
      const required = LIMIT_EVIDENCE_BY_CODE[expected["code"]];
      if (required !== undefined) {
        if (
          evidence[required.counter] !== expected["received"] ||
          evidence["termination"] !== required.termination
        ) {
          findings.push({
            code: "T0_CONTRACT_WORK_EVIDENCE",
            path,
            message:
              "Limit evidence must pin the exact terminating counter to received and the matching termination value.",
          });
        }
      }
      if (expected["code"] === "chart.invalid_unicode_scalar") {
        requireExact(
          Object.keys(evidence).sort(),
          [...T0_REVIEWED_WORK_EVIDENCE.counters].sort(),
          "T0_CONTRACT_WORK_EVIDENCE",
          path,
          "Invalid-scalar preflight evidence must pin every reviewed counter.",
          findings,
        );
      }
    });
  }
}

function collectExpectedCodes(
  symbolRoot: JsonObject,
  chartRoot: JsonObject,
): Readonly<{ errors: readonly string[]; warnings: readonly string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const collect = (records: readonly JsonObject[], warning: boolean): void => {
    for (const record of records) {
      const expected = isObject(record["expected"]) ? record["expected"] : null;
      if (expected === null) continue;
      if (typeof expected["code"] === "string") errors.push(expected["code"]);
      const diagnostics = objectArray(expected["diagnostics"]) ?? [];
      for (const diagnostic of diagnostics) {
        if (typeof diagnostic["code"] === "string") {
          errors.push(diagnostic["code"]);
        }
      }
      if (warning) {
        const expectedWarnings = objectArray(expected["warnings"]) ?? [];
        for (const item of expectedWarnings) {
          if (typeof item["code"] === "string") warnings.push(item["code"]);
        }
      }
    }
  };
  collect(objectArray(symbolRoot["failureCases"]) ?? [], false);
  collect(objectArray(symbolRoot["formatFailureCases"]) ?? [], false);
  collect(objectArray(symbolRoot["boundaryCases"]) ?? [], false);
  collect(objectArray(chartRoot["failureCases"]) ?? [], false);
  collect(objectArray(chartRoot["boundaryCases"]) ?? [], false);
  collect(objectArray(chartRoot["successCases"]) ?? [], true);
  return {
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
  };
}

function validateCodeInventory(
  symbolRoot: JsonObject,
  chartRoot: JsonObject,
  findings: T0ContractFinding[],
): void {
  const observed = collectExpectedCodes(symbolRoot, chartRoot);
  const allowedErrors = new Set<string>([
    ...T0_REVIEWED_SYMBOL_ERROR_CODES,
    ...T0_REVIEWED_CHART_ERROR_CODES,
  ]);
  for (const code of observed.errors) {
    if (!allowedErrors.has(code)) {
      findings.push({
        code: "T0_CONTRACT_CODE_INVENTORY",
        path: "theory fixtures",
        message: `Unknown syntax diagnostic code ${JSON.stringify(code)}.`,
      });
    }
  }
  const allowedWarnings = new Set<string>(T0_REVIEWED_CHART_WARNING_CODES);
  for (const code of observed.warnings) {
    if (!allowedWarnings.has(code)) {
      findings.push({
        code: "T0_CONTRACT_CODE_INVENTORY",
        path: "chart-cases.json",
        message: `Unknown syntax warning code ${JSON.stringify(code)}.`,
      });
    }
  }
  for (const required of T0_REVIEWED_CHART_WARNING_CODES) {
    if (!observed.warnings.includes(required)) {
      findings.push({
        code: "T0_CONTRACT_CODE_INVENTORY",
        path: "chart-cases.json.successCases",
        message: `Required warning code ${JSON.stringify(required)} has no reviewed case.`,
      });
    }
  }
}

export async function validateT0Contract(
  fixtureRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../tests/fixtures/theory",
  ),
): Promise<T0ContractValidationReport> {
  const findings: T0ContractFinding[] = [];
  const fixtures = new Map<string, ParsedFixture>();

  let entries: string[] = [];
  try {
    entries = (await readdir(fixtureRoot)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    findings.push({
      code: "T0_CONTRACT_FILE_SET",
      path: fixtureRoot,
      message: `Unable to read fixture directory: ${String(error)}`,
    });
  }
  requireExact(
    entries,
    [...EXPECTED_FILES].sort(),
    "T0_CONTRACT_FILE_SET",
    fixtureRoot,
    "Theory fixture directory must contain exactly the seven reviewed JSON files.",
    findings,
  );

  for (const filename of EXPECTED_FILES) {
    const path = join(fixtureRoot, filename);
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch (error) {
      findings.push({
        code: "T0_CONTRACT_FILE_SET",
        path: filename,
        message: `Unable to read required fixture: ${String(error)}`,
      });
      continue;
    }
    for (const duplicate of duplicateJsonKeys(source)) {
      findings.push({
        code: "T0_CONTRACT_DUPLICATE_KEY",
        path: `${filename}:${duplicate}`,
        message: "Duplicate decoded JSON object key is forbidden.",
      });
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(source) as unknown;
    } catch (error) {
      findings.push({
        code: "T0_CONTRACT_JSON_PARSE",
        path: filename,
        message: `Invalid JSON: ${String(error)}`,
      });
      continue;
    }
    if (!isObject(decoded)) {
      findings.push({
        code: "T0_CONTRACT_JSON_PARSE",
        path: filename,
        message: "Fixture root must be a JSON object.",
      });
      continue;
    }
    const fixture: ParsedFixture = {
      filename,
      source,
      root: decoded,
      byteDigest: sha256(source),
      semanticDigest: sha256(stableJson(decoded)),
    };
    fixtures.set(filename, fixture);
    if (decoded["schema"] !== EXPECTED_SCHEMAS[filename]) {
      findings.push({
        code: "T0_CONTRACT_SCHEMA",
        path: `${filename}.schema`,
        message: `Expected schema ${JSON.stringify(EXPECTED_SCHEMAS[filename])}.`,
      });
    }
    requireExact(
      Object.keys(decoded).sort(),
      [...EXPECTED_TOP_LEVEL_KEYS[filename]].sort(),
      "T0_CONTRACT_SCHEMA",
      filename,
      "Top-level field inventory changed.",
      findings,
    );
    if (decoded["productionOutputUsed"] !== false) {
      findings.push({
        code: "T0_CONTRACT_INDEPENDENCE",
        path: `${filename}.productionOutputUsed`,
        message: "Production output cannot certify an independent T0 fixture.",
      });
    }
    if (
      Object.hasOwn(decoded, "expectedValuesGenerated") &&
      decoded["expectedValuesGenerated"] !== false
    ) {
      findings.push({
        code: "T0_CONTRACT_INDEPENDENCE",
        path: `${filename}.expectedValuesGenerated`,
        message: "Generated expected values cannot certify an independent T0 fixture.",
      });
    }
    if (fixture.byteDigest !== EXPECTED_BYTE_DIGESTS[filename]) {
      findings.push({
        code: "T0_CONTRACT_BYTE_DIGEST",
        path: filename,
        message: `Reviewed byte digest mismatch: ${fixture.byteDigest}.`,
      });
    }
    if (fixture.semanticDigest !== EXPECTED_SEMANTIC_DIGESTS[filename]) {
      findings.push({
        code: "T0_CONTRACT_SEMANTIC_DIGEST",
        path: filename,
        message: `Reviewed semantic digest mismatch: ${fixture.semanticDigest}.`,
      });
    }
  }

  const contract = fixtures.get(CONTRACT_FILENAME)?.root;
  const symbol = fixtures.get("symbol-cases.json")?.root;
  const chart = fixtures.get("chart-cases.json")?.root;
  const roundtrip = fixtures.get("roundtrip-cases.json")?.root;
  const traceLedger = fixtures.get("trace-ledger.json")?.root;
  const provenance = fixtures.get("provenance-ledger.json")?.root;
  const mutationLedger = fixtures.get("mutation-controls.json")?.root;

  if (contract) {
    validateManifest(contract, findings);
    if (
      contract["productionOutputUsed"] !== false ||
      contract["expectedValuesGenerated"] !== false
    ) {
      findings.push({
        code: "T0_CONTRACT_INDEPENDENCE",
        path: CONTRACT_FILENAME,
        message: "Contract must declare both production and generated authority false.",
      });
    }
  }
  if (provenance && (
    provenance["productionOutputUsed"] !== false ||
    provenance["expectedValuesGenerated"] !== false
  )) {
    findings.push({
      code: "T0_CONTRACT_INDEPENDENCE",
      path: "provenance-ledger.json",
      message: "Provenance must reject production output and generated expectations.",
    });
  }

  const symbolCases = symbol
    ? caseRecords(
        symbol,
        "symbol-cases.json",
        ["canonicalCases", "aliasCases", "failureCases", "formatFailureCases", "boundaryCases"],
        findings,
      )
    : [];
  const chartCases = chart
    ? caseRecords(
        chart,
        "chart-cases.json",
        ["successCases", "failureCases", "boundaryCases"],
        findings,
      )
    : [];
  const metamorphicCases = roundtrip
    ? caseRecords(roundtrip, "roundtrip-cases.json", ["laws"], findings)
    : [];
  const cases = [...symbolCases, ...chartCases, ...metamorphicCases];

  if (symbol && chart) {
    validateRequiredCases(symbol, chart, findings);
    validateCodeInventory(symbol, chart, findings);
    validateBoundaryPairs(
      [
        {
          filename: "symbol-cases.json",
          records: objectArray(symbol["boundaryCases"]) ?? [],
        },
        {
          filename: "chart-cases.json",
          records: objectArray(chart["boundaryCases"]) ?? [],
        },
      ],
      findings,
    );
    validateWorkEvidence(
      [
        {
          filename: "symbol-cases.json",
          records: objectArray(symbol["boundaryCases"]) ?? [],
        },
        {
          filename: "chart-cases.json",
          records: objectArray(chart["boundaryCases"]) ?? [],
        },
      ],
      findings,
    );
  }
  if (symbol && roundtrip) {
    validateSuggestionCases(symbol, roundtrip, findings);
  }

  const traces = traceLedger ? objectArray(traceLedger["traces"]) ?? [] : [];
  const authorities = provenance
    ? objectArray(provenance["authorities"]) ?? []
    : [];
  const controls = mutationLedger
    ? objectArray(mutationLedger["controls"]) ?? []
    : [];
  const seeds = roundtrip ? objectArray(roundtrip["seeds"]) ?? [] : [];

  const globalIds = new Map<string, string>();
  registerIds(cases, "case", globalIds, findings);
  registerIds(
    traces.flatMap((record, index) => {
      const id = idOf(record);
      return id
        ? [{ id, path: `trace-ledger.json.traces[${String(index)}]` }]
        : [];
    }),
    "trace",
    globalIds,
    findings,
  );
  registerIds(
    authorities.flatMap((record, index) => {
      const id = idOf(record);
      return id
        ? [{ id, path: `provenance-ledger.json.authorities[${String(index)}]` }]
        : [];
    }),
    "authority",
    globalIds,
    findings,
  );
  registerIds(
    controls.flatMap((record, index) => {
      const id = idOf(record);
      return id
        ? [{ id, path: `mutation-controls.json.controls[${String(index)}]` }]
        : [];
    }),
    "mutation",
    globalIds,
    findings,
  );

  const caseIds = new Set(cases.map((record) => record.id));
  const traceIds = new Set(traces.flatMap((record) => {
    const id = idOf(record);
    return id === null ? [] : [id];
  }));
  const authorityIds = new Set(authorities.flatMap((record) => {
    const id = idOf(record);
    return id === null ? [] : [id];
  }));
  const controlIds = new Set(controls.flatMap((record) => {
    const id = idOf(record);
    return id === null ? [] : [id];
  }));

  requireExact(
    traces.map(idOf),
    [...T0_REVIEWED_TRACE_IDS],
    "T0_CONTRACT_TRACE_INVENTORY",
    "trace-ledger.json.traces",
    "Stable trace inventory must match docs/T0_SYNTAX_CONTRACT.md section 11 exactly.",
    findings,
  );
  if (traceLedger?.["stableTraceIdsOnly"] !== true) {
    findings.push({
      code: "T0_CONTRACT_TRACE_INVENTORY",
      path: "trace-ledger.json.stableTraceIdsOnly",
      message: "Trace ledger must contain stable trace IDs only.",
    });
  }

  for (const record of cases) {
    for (const traceId of record.traceIds) {
      if (!traceIds.has(traceId)) {
        findings.push({
          code: "T0_CONTRACT_CASE_REF",
          path: `${record.path}.traceIds`,
          message: `Unknown trace reference ${JSON.stringify(traceId)}.`,
        });
        continue;
      }
      const trace = traces.find((candidate) => idOf(candidate) === traceId);
      const reciprocalCaseIds = trace ? stringArray(trace["caseIds"]) : null;
      if (reciprocalCaseIds === null || !reciprocalCaseIds.includes(record.id)) {
        findings.push({
          code: "T0_CONTRACT_TRACE_LINK",
          path: `${record.path}.traceIds`,
          message: `Trace ${JSON.stringify(traceId)} does not link back to case ${JSON.stringify(record.id)}.`,
        });
      }
    }
    for (const authorityId of record.authorityIds) {
      if (!authorityIds.has(authorityId)) {
        findings.push({
          code: "T0_CONTRACT_CASE_REF",
          path: `${record.path}.authorityIds`,
          message: `Unknown authority reference ${JSON.stringify(authorityId)}.`,
        });
      }
    }
  }

  traces.forEach((record, index) => {
    const path = `trace-ledger.json.traces[${String(index)}]`;
    const linkedCases = stringArray(record["caseIds"]);
    const linkedControls = stringArray(record["mutationControlIds"]);
    if (idOf(record) === null || linkedCases === null || linkedCases.length === 0) {
      findings.push({
        code: "T0_CONTRACT_TRACE",
        path,
        message: "Every trace requires an ID and at least one case.",
      });
    }
    for (const caseId of linkedCases ?? []) {
      if (!caseIds.has(caseId)) {
        findings.push({
          code: "T0_CONTRACT_TRACE",
          path: `${path}.caseIds`,
          message: `Unknown case reference ${JSON.stringify(caseId)}.`,
        });
        continue;
      }
      const linkedCase = cases.find((candidate) => candidate.id === caseId);
      const traceId = idOf(record);
      if (
        linkedCase === undefined ||
        traceId === null ||
        !linkedCase.traceIds.includes(traceId)
      ) {
        findings.push({
          code: "T0_CONTRACT_TRACE_LINK",
          path: `${path}.caseIds`,
          message: `Case ${JSON.stringify(caseId)} does not link back to trace ${JSON.stringify(traceId)}.`,
        });
      }
    }
    if (record["mutationControlIds"] !== undefined) {
      if (linkedControls === null || linkedControls.length === 0) {
        findings.push({
          code: "T0_CONTRACT_MUTATION",
          path: `${path}.mutationControlIds`,
          message: "Declared mutation-control list must be nonempty.",
        });
      }
      for (const controlId of linkedControls ?? []) {
        if (!controlIds.has(controlId)) {
          findings.push({
            code: "T0_CONTRACT_MUTATION",
            path: `${path}.mutationControlIds`,
            message: `Unknown mutation control ${JSON.stringify(controlId)}.`,
          });
        }
      }
    }
  });

  controls.forEach((record, index) => {
    const path = `mutation-controls.json.controls[${String(index)}]`;
    const killedBy = stringArray(record["killedByCaseIds"]);
    if (idOf(record) === null || killedBy === null || killedBy.length === 0) {
      findings.push({
        code: "T0_CONTRACT_MUTATION",
        path,
        message: "Every mutation control requires an ID and nonempty killedByCaseIds.",
      });
      return;
    }
    for (const caseId of killedBy) {
      if (!caseIds.has(caseId)) {
        findings.push({
          code: "T0_CONTRACT_MUTATION",
          path: `${path}.killedByCaseIds`,
          message: `Unknown killing case ${JSON.stringify(caseId)}.`,
        });
      }
    }
  });

  authorities.forEach((record, index) => {
    const expectationClass = record["authorityClass"];
    if (
      idOf(record) === null ||
      typeof expectationClass !== "string" ||
      !ALLOWED_AUTHORITY_CLASSES.has(expectationClass)
    ) {
      findings.push({
        code: "T0_CONTRACT_AUTHORITY",
        path: `provenance-ledger.json.authorities[${String(index)}]`,
        message:
          "Authority requires an ID and one allowed authorityClass: definition, published-reference, expert-reviewed, or compatibility.",
      });
    }
  });

  const seedIds = new Set<string>();
  seeds.forEach((record, index) => {
    const id = idOf(record);
    if (id === null || seedIds.has(id)) {
      findings.push({
        code: "T0_CONTRACT_ID_DUPLICATE",
        path: `roundtrip-cases.json.seeds[${String(index)}]`,
        message: "Every deterministic seed requires a unique string ID.",
      });
    } else {
      seedIds.add(id);
    }
  });
  for (const record of metamorphicCases) {
    const referenced = [
      ...(typeof record.record["seedId"] === "string"
        ? [record.record["seedId"]]
        : []),
      ...(stringArray(record.record["seedIds"]) ?? []),
    ];
    for (const seedId of referenced) {
      if (!seedIds.has(seedId)) {
        findings.push({
          code: "T0_CONTRACT_CASE_REF",
          path: record.path,
          message: `Unknown deterministic seed ${JSON.stringify(seedId)}.`,
        });
      }
    }
  }

  findings.sort(findingOrder);
  return {
    schema: "changes.validation.t0-contract.v1",
    package: "T0",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      companions: T0_REVIEWED_COMPANIONS.length,
      symbolCases: symbolCases.length,
      chartCases: chartCases.length,
      metamorphicLaws: metamorphicCases.length,
      totalCases: cases.length,
      traces: traces.length,
      authorities: authorities.length,
      seeds: seeds.length,
      mutationControls: controls.length,
    },
    findings,
  };
}

if (import.meta.main) {
  const report = await validateT0Contract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exit(1);
}
