import type {
  ChordDegree,
  ChordEventId,
  KeyContext,
  PathRefusal,
  PitchClass,
  SpelledPitchClass,
} from "../domain";
import {
  MAX_THEORY_DEGREES_PER_REALIZATION,
  MAX_THEORY_REALIZATIONS,
  type IndexAlignedTuple,
  type ResolvedChord,
  type SemanticRealizationId,
} from "./resolution-contract";

/**
 * H0 is a pure, bounded interpretation layer over an explicitly selected T1
 * realization. Literal facts, contextual readings, and options are different
 * public value kinds and must remain visually and mechanically distinguishable.
 */
export const H0_ANALYSIS_CONTRACT_SCHEMA =
  "changes.theory.harmony-analysis-contract.v1";
export const H0_LITERAL_FACTS_RESULT_SCHEMA =
  "changes.theory.harmony-literal-facts-result.v1";
export const H0_ANALYSIS_RESULT_SCHEMA =
  "changes.theory.harmony-analysis-result.v1";

export const H0_ANALYSIS_RULE_TABLE_ID = "changes.harmony-analysis-rules";
export const H0_ANALYSIS_RULE_TABLE_VERSION = 1;
export const H0_ANALYSIS_EVIDENCE_POLICY_ID =
  "changes.harmony-evidence-tiers";
export const H0_ANALYSIS_EVIDENCE_POLICY_VERSION = 1;
export const H0_ANALYSIS_ORDER_POLICY_ID = "changes.harmony-analysis-order";
export const H0_ANALYSIS_ORDER_POLICY_VERSION = 1;
export const H0_EXACT_WEIGHT_POLICY_ID = "changes.harmony-exact-weight";
export const H0_EXACT_WEIGHT_POLICY_VERSION = 1;

export const H0_OPERATION_IDS = Object.freeze([
  "deriveLiteralFacts",
  "analyzeChordInContext",
  "enumerateChordScaleOptions",
] as const);
export type H0OperationId = (typeof H0_OPERATION_IDS)[number];

export const H0_EVIDENCE_TIERS = Object.freeze([
  "exact",
  "strong",
  "plausible",
  "speculative",
] as const);
export type H0EvidenceTier = (typeof H0_EVIDENCE_TIERS)[number];

export const H0_ANALYSIS_DISPOSITIONS = Object.freeze([
  "classified",
  "ambiguous",
  "unclassified",
  "not-applicable",
] as const);
export type H0AnalysisDisposition =
  (typeof H0_ANALYSIS_DISPOSITIONS)[number];

/** This vocabulary order is frozen by the public H0 contract. */
export const H0_ANALYSIS_CLASSIFICATIONS = Object.freeze([
  "diatonic",
  "chromatic-roman",
  "ordinary-dominant",
  "secondary-dominant",
  "secondary-leading-tone",
  "tritone-substitute",
  "backdoor-dominant",
  "modal-mixture",
  "passing-diminished",
  "modal",
  "nonfunctional",
  "unresolved",
] as const);
export type H0AnalysisClassification =
  (typeof H0_ANALYSIS_CLASSIFICATIONS)[number];

/** Reading-order rank is intentionally distinct from vocabulary declaration. */
export const H0_ANALYSIS_CLASSIFICATION_ORDER = Object.freeze([
  "diatonic",
  "ordinary-dominant",
  "secondary-dominant",
  "secondary-leading-tone",
  "tritone-substitute",
  "backdoor-dominant",
  "modal-mixture",
  "passing-diminished",
  "chromatic-roman",
  "modal",
  "nonfunctional",
  "unresolved",
] as const satisfies readonly H0AnalysisClassification[]);

export type H0ClassifiedAnalysisClassification = Exclude<
  H0AnalysisClassification,
  "unresolved"
>;
export type H0UnclassifiedAnalysisClassification = Extract<
  H0AnalysisClassification,
  "chromatic-roman" | "modal" | "nonfunctional" | "unresolved"
>;

export const H0_ANALYSIS_RULE_IDS = Object.freeze([
  "h0.literal-facts",
  "h0.roman.diatonic-major",
  "h0.roman.diatonic-natural-minor",
  "h0.roman.diatonic-harmonic-minor",
  "h0.roman.diatonic-melodic-minor",
  "h0.roman.chromatic",
  "h0.function.ordinary-dominant",
  "h0.function.secondary-dominant",
  "h0.function.secondary-leading-tone",
  "h0.function.tritone-substitute",
  "h0.function.backdoor-dominant",
  "h0.function.parallel-mixture",
  "h0.function.passing-diminished",
  "h0.outcome.modal",
  "h0.outcome.nonfunctional",
  "h0.outcome.unresolved",
] as const);
export type H0AnalysisRuleId = (typeof H0_ANALYSIS_RULE_IDS)[number];

/** Public collection and work bounds; exceeding one is always a refusal. */
export const MAX_H0_CONTEXT_EVENTS = 3;
export const MAX_H0_READINGS = 12;
export const MAX_H0_SCALE_OPTIONS = 12;
export const MAX_H0_DEGREES_PER_REALIZATION =
  MAX_THEORY_DEGREES_PER_REALIZATION;
export const MAX_H0_SCALE_DEGREES = 8;
export const MAX_H0_EVIDENCE_PER_READING = 16;
export const MAX_H0_COUNTEREVIDENCE_PER_READING = 8;
export const MAX_H0_MISSING_EVIDENCE_PER_READING = 8;
export const MAX_H0_LIMITATIONS_PER_RESULT = 8;
export const MAX_H0_RULE_IDS_PER_READING = 8;
export const MAX_H0_MATCH_COMPONENTS = 16;
export const MAX_H0_TENSIONS_PER_SCALE = 8;
export const MAX_H0_CLASHES_PER_SCALE = 8;
export const MAX_H0_EXCEPTIONS_PER_SCALE = 8;
export const MAX_H0_REQUEST_ID_ASCII_LENGTH = 64;
export const MAX_H0_T1_RESOLUTIONS = 3;
export const MAX_H0_AVAILABLE_REALIZATIONS = MAX_THEORY_REALIZATIONS;
export const MAX_H0_CONTEXT_EDGES = 2;
export const MAX_H0_ANALYSIS_RULE_EVALUATIONS = 16;
export const MAX_H0_SCALE_MAPPING_EVALUATIONS = 13;
export const MAX_H0_DEGREE_COMPARISONS = 4_096;
export const MAX_H0_EMITTED_RECORDS = 512;
export const MAX_H0_TRACKED_RECORDS = 1_024;
export const MIN_H0_BASE_REVISION = 0;
export const MAX_H0_BASE_REVISION = Number.MAX_SAFE_INTEGER;

/** A readonly tuple with every length from zero through Maximum. */
export type H0BoundedTuple<
  Value,
  Maximum extends number,
  Accumulator extends readonly Value[] = readonly [],
> = Accumulator["length"] extends Maximum
  ? Accumulator
  : Accumulator |
      H0BoundedTuple<Value, Maximum, readonly [...Accumulator, Value]>;

/** A readonly tuple with every length from one through Maximum. */
export type H0BoundedNonEmptyTuple<
  Value,
  Maximum extends number,
  Accumulator extends readonly Value[] = readonly [Value],
> = Accumulator["length"] extends Maximum
  ? Accumulator
  : Accumulator |
      H0BoundedNonEmptyTuple<Value, Maximum, readonly [...Accumulator, Value]>;

/** A readonly tuple with every length from two through Maximum. */
export type H0BoundedAtLeastTwoTuple<
  Value,
  Maximum extends number,
  Accumulator extends readonly Value[] = readonly [Value, Value],
> = Accumulator["length"] extends Maximum
  ? Accumulator
  : Accumulator |
      H0BoundedAtLeastTwoTuple<
        Value,
        Maximum,
        readonly [...Accumulator, Value]
      >;

export const H0_CONTEXT_POSITIONS = Object.freeze([
  "previous",
  "current",
  "next",
] as const);
export type H0ContextPosition = (typeof H0_CONTEXT_POSITIONS)[number];

export const H0_DECLARED_SPAN_KINDS = Object.freeze([
  "tonal",
  "modal",
  "nonfunctional",
  "unspecified",
] as const);
export type H0DeclaredSpanKind = (typeof H0_DECLARED_SPAN_KINDS)[number];

export type H0SelectedRealizationId = SemanticRealizationId | "custom";

/**
 * Selection is nullable at the request boundary. A multi-realization T1 result
 * with no selection is refused; a non-null ID absent from that T1 result is a
 * distinct refusal. H0 never merges altered realizations.
 */
export type H0ContextEvent = Readonly<{
  eventId: ChordEventId;
  resolved: ResolvedChord;
  selectedRealizationId: H0SelectedRealizationId | null;
}>;

export type H0RequestedRuleTable = Readonly<{
  id: string;
  version: number;
}>;

export type H0LiteralFactsRequest = Readonly<{
  requestId: string;
  baseRevision: number;
  source: ResolvedChord;
  selectedRealizationId: H0SelectedRealizationId | null;
}>;

export type H0AnalysisRequest = Readonly<{
  requestId: string;
  baseRevision: number;
  key: KeyContext | null;
  declaredSpan: H0DeclaredSpanKind;
  previous: H0ContextEvent | null;
  current: H0ContextEvent;
  next: H0ContextEvent | null;
  analysisRuleTable: H0RequestedRuleTable;
}>;

export const H0_ROMAN_SCALE_DEGREES = Object.freeze([
  1,
  2,
  3,
  4,
  5,
  6,
  7,
] as const);
export type H0RomanScaleDegree = (typeof H0_ROMAN_SCALE_DEGREES)[number];
export type H0RomanAlteration = -2 | -1 | 0 | 1 | 2;
export type H0RomanCase = "upper" | "lower";

type H0UpperRomanNumeral<Degree extends H0RomanScaleDegree> =
  Degree extends 1
    ? "I"
    : Degree extends 2
      ? "II"
      : Degree extends 3
        ? "III"
        : Degree extends 4
          ? "IV"
          : Degree extends 5
            ? "V"
            : Degree extends 6
              ? "VI"
              : "VII";

type H0RomanNumeralFor<
  Degree extends H0RomanScaleDegree,
  Case extends H0RomanCase,
> = Case extends "upper"
  ? H0UpperRomanNumeral<Degree>
  : Lowercase<H0UpperRomanNumeral<Degree>>;

/** Degree, accidental, case, and glyph remain structurally correlated. */
export type H0RomanDegreeSpelling = {
  [Degree in H0RomanScaleDegree]: {
    [Case in H0RomanCase]: Readonly<{
      degree: Degree;
      alteration: H0RomanAlteration;
      case: Case;
      numeral: H0RomanNumeralFor<Degree, Case>;
    }>;
  }[H0RomanCase];
}[H0RomanScaleDegree];

export const H0_ROMAN_QUALITY_MARKS = Object.freeze([
  "major",
  "minor",
  "diminished",
  "half-diminished",
  "augmented",
  "suspended",
  "power",
  "indeterminate",
] as const);
export type H0RomanQualityMark = (typeof H0_ROMAN_QUALITY_MARKS)[number];

export const H0_ROMAN_SEVENTH_MARKS = Object.freeze([
  "major",
  "minor",
  "diminished",
] as const);
export type H0RomanSeventhMark = (typeof H0_ROMAN_SEVENTH_MARKS)[number];

type H0RomanSeventhAlteration = -2 | -1 | 0;
type H0RomanSeventhMarkFor<Alteration extends H0RomanSeventhAlteration> =
  Alteration extends 0
    ? "major"
    : Alteration extends -1
      ? "minor"
      : "diminished";

/** Seventh name and spelled degree alteration cannot contradict one another. */
export type H0RomanSeventhIdentity = {
  [Alteration in H0RomanSeventhAlteration]: Readonly<{
    quality: H0RomanSeventhMarkFor<Alteration>;
    degree: Readonly<{ number: 7; alter: Alteration }>;
  }>;
}[H0RomanSeventhAlteration];
export type H0RomanExtensionIdentity = ChordDegree<9 | 11 | 13>;

/** canonicalText is display data; the correlated structure is authoritative. */
export type H0RomanSpelling = Readonly<{
  root: H0RomanDegreeSpelling;
  quality: H0RomanQualityMark;
  seventh: H0RomanSeventhIdentity | null;
  extension: H0RomanExtensionIdentity | null;
  appliedTo: H0RomanDegreeSpelling | null;
  sourceRoot: SpelledPitchClass;
  key: KeyContext;
  canonicalText: string;
}>;

/** Exact integer evidence, never a decimal score, confidence, or probability. */
export type H0ExactMatchWeight = Readonly<{
  numerator: number;
  denominator: number;
}>;

export const H0_MATCH_COMPONENT_KINDS = Object.freeze([
  "root",
  "third-or-suspension",
  "seventh",
  "fifth",
  "color",
] as const);
export type H0MatchComponentKind =
  (typeof H0_MATCH_COMPONENT_KINDS)[number];

export type H0MatchComponent = Readonly<{
  kind: H0MatchComponentKind;
  weight: 1 | 2;
  matchedWeight: 0 | 1 | 2;
  expectedDegree: ChordDegree | null;
  observedDegree: ChordDegree | null;
  expectedSpelling: SpelledPitchClass | null;
  observedSpelling: SpelledPitchClass | null;
  spellingAgreement: "exact" | "enharmonic-only" | "absent";
}>;

export const H0_EVIDENCE_FACT_KINDS = Object.freeze([
  "literal-degree",
  "literal-quality",
  "key-membership",
  "root-relation",
  "target-relation",
  "guide-tone",
  "bass-motion",
  "neighbor-context",
] as const);
export type H0EvidenceFactKind = (typeof H0_EVIDENCE_FACT_KINDS)[number];

export type H0EvidenceRecord = Readonly<{
  id: string;
  kind: H0EvidenceFactKind;
  ruleId: H0AnalysisRuleId;
  sourceEventIds: H0BoundedNonEmptyTuple<
    ChordEventId,
    typeof MAX_H0_CONTEXT_EVENTS
  >;
  expectedDegree: ChordDegree | null;
  observedDegree: ChordDegree | null;
  expectedSpelling: SpelledPitchClass | null;
  observedSpelling: SpelledPitchClass | null;
  detail: string;
}>;

export const H0_MISSING_EVIDENCE_CODES = Object.freeze([
  "key-absent",
  "previous-event-absent",
  "next-event-absent",
  "target-motion-absent",
  "guide-tone-evidence-absent",
  "bass-motion-evidence-absent",
  "spelling-agreement-absent",
  "declared-context-insufficient",
] as const);
export type H0MissingEvidenceCode =
  (typeof H0_MISSING_EVIDENCE_CODES)[number];

export type H0MissingEvidence = Readonly<{
  code: H0MissingEvidenceCode;
  requiredForRuleIds: H0BoundedNonEmptyTuple<
    H0AnalysisRuleId,
    typeof MAX_H0_RULE_IDS_PER_READING
  >;
  detail: string;
}>;

export const H0_LIMITATION_CODES = Object.freeze([
  "custom.no_degree_analysis",
  "custom.no_auto_voicing",
  "key-absent",
  "modal-key-not-representable",
  "nonfunctional-no-roman-claim",
  "neighbor-absent",
  "target-ambiguous",
  "no-rule-match",
] as const);
export type H0LimitationCode = (typeof H0_LIMITATION_CODES)[number];

export type H0Limitation = Readonly<{
  code: H0LimitationCode;
  detail: string;
}>;

export type H0SelectedDegreeTuple = H0BoundedNonEmptyTuple<
  ChordDegree,
  typeof MAX_H0_DEGREES_PER_REALIZATION
>;

type H0LiteralFactsBase = Readonly<{
  kind: "literal";
  ruleId: "h0.literal-facts";
  contextIndependent: true;
  selectedRealizationId: H0SelectedRealizationId;
}>;

export type H0ParsedLiteralFacts<
  Degrees extends H0SelectedDegreeTuple = H0SelectedDegreeTuple,
> = H0LiteralFactsBase &
  Readonly<{
    applicability: "applicable";
    selectedRealizationId: SemanticRealizationId;
    root: SpelledPitchClass;
    bass: SpelledPitchClass | null;
    degrees: Degrees;
    requiredDegrees: H0BoundedTuple<
      Degrees[number],
      typeof MAX_H0_DEGREES_PER_REALIZATION
    >;
    optionalDegrees: H0BoundedTuple<
      Degrees[number],
      typeof MAX_H0_DEGREES_PER_REALIZATION
    >;
    guideToneDegrees: H0BoundedTuple<
      Degrees[number],
      typeof MAX_H0_DEGREES_PER_REALIZATION
    >;
    spelledPitchNames: IndexAlignedTuple<Degrees, SpelledPitchClass>;
    pitchClasses: IndexAlignedTuple<Degrees, PitchClass>;
    match: H0ExactMatchWeight;
    matchComponents: H0BoundedNonEmptyTuple<
      H0MatchComponent,
      typeof MAX_H0_MATCH_COMPONENTS
    >;
    limitations: readonly [];
  }>;

export type H0CustomPitchTuple = H0BoundedNonEmptyTuple<
  SpelledPitchClass,
  typeof MAX_H0_DEGREES_PER_REALIZATION
>;

export type H0CustomLiteralFacts<
  Pitches extends H0CustomPitchTuple = H0CustomPitchTuple,
> = H0LiteralFactsBase &
  Readonly<{
    applicability: "not-applicable";
    selectedRealizationId: "custom";
    root: null;
    bass: SpelledPitchClass | null;
    degrees: null;
    requiredDegrees: null;
    optionalDegrees: null;
    guideToneDegrees: null;
    spelledPitchNames: Pitches;
    pitchClasses: IndexAlignedTuple<Pitches, PitchClass>;
    match: null;
    matchComponents: readonly [];
    limitations: readonly [
      Readonly<{
        code: "custom.no_degree_analysis";
        detail: string;
      }>,
      Readonly<{
        code: "custom.no_auto_voicing";
        detail: string;
      }>,
    ];
  }>;

export type H0LiteralFacts = H0ParsedLiteralFacts | H0CustomLiteralFacts;

export const H0_EVIDENCE_TIER_RANKS = Object.freeze({
  exact: 0,
  strong: 1,
  plausible: 2,
  speculative: 3,
} as const satisfies Readonly<Record<H0EvidenceTier, 0 | 1 | 2 | 3>>);
export type H0EvidenceTierRank<Strength extends H0EvidenceTier> =
  (typeof H0_EVIDENCE_TIER_RANKS)[Strength];

export const H0_ANALYSIS_CLASSIFICATION_RANKS = Object.freeze({
  diatonic: 0,
  "ordinary-dominant": 1,
  "secondary-dominant": 2,
  "secondary-leading-tone": 3,
  "tritone-substitute": 4,
  "backdoor-dominant": 5,
  "modal-mixture": 6,
  "passing-diminished": 7,
  "chromatic-roman": 8,
  modal: 9,
  nonfunctional: 10,
  unresolved: 11,
} as const satisfies Readonly<
  Record<
    H0AnalysisClassification,
    0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
  >
>);
export type H0AnalysisClassificationRank<
  Classification extends H0AnalysisClassification,
> = (typeof H0_ANALYSIS_CLASSIFICATION_RANKS)[Classification];

/**
 * Only derived ranks are stored. Remaining tie-breaks read
 * roman?.canonicalText ?? "", ruleIds[0], governingTargetEventId, and readingId
 * from the owning reading, so duplicated order fields cannot contradict them.
 */
export type H0AnalysisOrderKey<
  Strength extends H0EvidenceTier,
  Classification extends H0AnalysisClassification,
> = readonly [
  strengthRank: H0EvidenceTierRank<Strength>,
  classificationRank: H0AnalysisClassificationRank<Classification>,
];

type H0ContextReadingShape<
  Classification extends H0AnalysisClassification,
  Strength extends H0EvidenceTier,
> = Readonly<{
  kind: "reading";
  readingId: string;
  classification: Classification;
  strength: Strength;
  roman: H0RomanSpelling | null;
  governingTargetEventId: ChordEventId | null;
  ruleIds: H0BoundedNonEmptyTuple<
    H0AnalysisRuleId,
    typeof MAX_H0_RULE_IDS_PER_READING
  >;
  match: H0ExactMatchWeight;
  matchComponents: H0BoundedNonEmptyTuple<
    H0MatchComponent,
    typeof MAX_H0_MATCH_COMPONENTS
  >;
  evidence: H0BoundedNonEmptyTuple<
    H0EvidenceRecord,
    typeof MAX_H0_EVIDENCE_PER_READING
  >;
  counterevidence: H0BoundedTuple<
    H0EvidenceRecord,
    typeof MAX_H0_COUNTEREVIDENCE_PER_READING
  >;
  missingEvidence: H0BoundedTuple<
    H0MissingEvidence,
    typeof MAX_H0_MISSING_EVIDENCE_PER_READING
  >;
  limitations: H0BoundedTuple<
    H0Limitation,
    typeof MAX_H0_LIMITATIONS_PER_RESULT
  >;
  orderKey: H0AnalysisOrderKey<Strength, Classification>;
}>;

/**
 * A reading has evidence and classification, but never owns disposition. The
 * conditional product preserves rank correlation even when callers use the
 * default full public unions.
 */
export type H0ContextReading<
  Classification extends H0AnalysisClassification = H0AnalysisClassification,
  Strength extends H0EvidenceTier = H0EvidenceTier,
> = Classification extends H0AnalysisClassification
  ? Strength extends H0EvidenceTier
    ? H0ContextReadingShape<Classification, Strength>
    : never
  : never;

export type H0ClassifiedReading = H0ContextReading<
  H0ClassifiedAnalysisClassification
>;
export type H0UnclassifiedReading = H0ContextReading<
  H0UnclassifiedAnalysisClassification
>;

type H0LiteralFactsValueBase = Readonly<{
  schema: typeof H0_LITERAL_FACTS_RESULT_SCHEMA;
  analysisRuleTableId: typeof H0_ANALYSIS_RULE_TABLE_ID;
  analysisRuleTableVersion: typeof H0_ANALYSIS_RULE_TABLE_VERSION;
  evidencePolicyId: typeof H0_ANALYSIS_EVIDENCE_POLICY_ID;
  evidencePolicyVersion: typeof H0_ANALYSIS_EVIDENCE_POLICY_VERSION;
  exactWeightPolicyId: typeof H0_EXACT_WEIGHT_POLICY_ID;
  exactWeightPolicyVersion: typeof H0_EXACT_WEIGHT_POLICY_VERSION;
  requestId: string;
  baseRevision: number;
}>;

export type H0LiteralFactsValue =
  | (H0LiteralFactsValueBase &
      Readonly<{
        disposition: "classified";
        literalFacts: H0ParsedLiteralFacts;
        limitations: readonly [];
      }>)
  | (H0LiteralFactsValueBase &
      Readonly<{
        disposition: "not-applicable";
        literalFacts: H0CustomLiteralFacts;
        limitations: H0CustomLiteralFacts["limitations"];
      }>);

type H0AnalysisValueBase = Readonly<{
  schema: typeof H0_ANALYSIS_RESULT_SCHEMA;
  analysisRuleTableId: typeof H0_ANALYSIS_RULE_TABLE_ID;
  analysisRuleTableVersion: typeof H0_ANALYSIS_RULE_TABLE_VERSION;
  evidencePolicyId: typeof H0_ANALYSIS_EVIDENCE_POLICY_ID;
  evidencePolicyVersion: typeof H0_ANALYSIS_EVIDENCE_POLICY_VERSION;
  orderPolicyId: typeof H0_ANALYSIS_ORDER_POLICY_ID;
  orderPolicyVersion: typeof H0_ANALYSIS_ORDER_POLICY_VERSION;
  exactWeightPolicyId: typeof H0_EXACT_WEIGHT_POLICY_ID;
  exactWeightPolicyVersion: typeof H0_EXACT_WEIGHT_POLICY_VERSION;
  requestId: string;
  baseRevision: number;
  currentEventId: ChordEventId;
  keyUsed: KeyContext | null;
  declaredSpan: H0DeclaredSpanKind;
  selectedRealizationId: H0SelectedRealizationId;
  literalFacts: H0LiteralFacts;
}>;

export type H0ClassifiedAnalysis = H0AnalysisValueBase &
  Readonly<{
    disposition: "classified";
    selectedRealizationId: SemanticRealizationId;
    literalFacts: H0ParsedLiteralFacts;
    readings: H0BoundedNonEmptyTuple<
      H0ClassifiedReading,
      typeof MAX_H0_READINGS
    >;
    limitations: H0BoundedTuple<
      H0Limitation,
      typeof MAX_H0_LIMITATIONS_PER_RESULT
    >;
  }>;

export type H0AmbiguousAnalysis = H0AnalysisValueBase &
  Readonly<{
    disposition: "ambiguous";
    selectedRealizationId: SemanticRealizationId;
    literalFacts: H0ParsedLiteralFacts;
    readings: H0BoundedAtLeastTwoTuple<
      H0ContextReading,
      typeof MAX_H0_READINGS
    >;
    limitations: H0BoundedNonEmptyTuple<
      H0Limitation,
      typeof MAX_H0_LIMITATIONS_PER_RESULT
    >;
  }>;

/** Unclassified is successful and still carries its bounded reading evidence. */
export type H0UnclassifiedAnalysis = H0AnalysisValueBase &
  Readonly<{
    disposition: "unclassified";
    selectedRealizationId: SemanticRealizationId;
    literalFacts: H0ParsedLiteralFacts;
    readings: H0BoundedNonEmptyTuple<
      H0UnclassifiedReading,
      typeof MAX_H0_READINGS
    >;
    limitations: H0BoundedNonEmptyTuple<
      H0Limitation,
      typeof MAX_H0_LIMITATIONS_PER_RESULT
    >;
  }>;

/** Only an explicit not-applicable result has no contextual readings. */
export type H0NotApplicableAnalysis = H0AnalysisValueBase &
  Readonly<{
    disposition: "not-applicable";
    selectedRealizationId: "custom";
    literalFacts: H0CustomLiteralFacts;
    readings: readonly [];
    limitations: H0CustomLiteralFacts["limitations"];
  }>;

export type H0AnalysisValue =
  | H0ClassifiedAnalysis
  | H0AmbiguousAnalysis
  | H0UnclassifiedAnalysis
  | H0NotApplicableAnalysis;

export const H0_REQUEST_REFUSAL_CODES = Object.freeze([
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "harmony.upstream_contract_version_unsupported",
  "harmony.rule_version_unsupported",
  "harmony.duplicate_event_id",
] as const);
export type H0RequestRefusalCode = (typeof H0_REQUEST_REFUSAL_CODES)[number];

export type H0RequestIdInvalidRefusal = PathRefusal<{
  code: "harmony.request_id_invalid";
  reason: "empty" | "non-ascii" | "too-long";
  maximum: typeof MAX_H0_REQUEST_ID_ASCII_LENGTH;
}>;

export type H0BaseRevisionInvalidRefusal = PathRefusal<{
  code: "harmony.base_revision_invalid";
  received: number;
  minimum: typeof MIN_H0_BASE_REVISION;
  maximum: typeof MAX_H0_BASE_REVISION;
}>;

export type H0UpstreamContractVersionUnsupportedRefusal = PathRefusal<{
  code: "harmony.upstream_contract_version_unsupported";
  position: H0ContextPosition | "source";
  component:
    | "resolved-chord-schema"
    | "formula-table"
    | "degree-spelling-policy"
    | "degree-role-policy";
  expectedId: string;
  expectedVersion: number | null;
  receivedId: string;
  receivedVersion: number | null;
}>;

export type H0RuleVersionUnsupportedRefusal = PathRefusal<{
  code: "harmony.rule_version_unsupported";
  component: "analysis-rule-table" | "chord-scale-mapping-table";
  expectedId: string;
  expectedVersion: number;
  receivedId: string;
  receivedVersion: number;
}>;

export type H0SelectedRealizationRequiredRefusal = PathRefusal<{
  code: "harmony.selected_realization_required";
  position: H0ContextPosition | "source";
  received: null;
}>;

export type H0SelectedRealizationUnknownRefusal = PathRefusal<{
  code: "harmony.selected_realization_unknown";
  position: H0ContextPosition | "source";
  received: string;
  available: H0BoundedNonEmptyTuple<
    H0SelectedRealizationId,
    typeof MAX_H0_AVAILABLE_REALIZATIONS
  >;
}>;

export type H0DuplicateEventIdRefusal = PathRefusal<{
  code: "harmony.duplicate_event_id";
  eventId: ChordEventId;
  firstPosition: H0ContextPosition;
  duplicatePosition: H0ContextPosition;
}>;

export type H0RequestRefusal =
  | H0RequestIdInvalidRefusal
  | H0BaseRevisionInvalidRefusal
  | H0UpstreamContractVersionUnsupportedRefusal
  | H0RuleVersionUnsupportedRefusal
  | H0SelectedRealizationRequiredRefusal
  | H0SelectedRealizationUnknownRefusal
  | H0DuplicateEventIdRefusal;

export type H0AnalysisRuleVersionUnsupportedRefusal =
  H0RuleVersionUnsupportedRefusal &
  Readonly<{
    component: "analysis-rule-table";
    expectedId: typeof H0_ANALYSIS_RULE_TABLE_ID;
    expectedVersion: typeof H0_ANALYSIS_RULE_TABLE_VERSION;
  }>;

export type H0LiteralFactsUpstreamVersionUnsupportedRefusal =
  H0UpstreamContractVersionUnsupportedRefusal &
  Readonly<{ position: "source" }>;
export type H0ContextUpstreamVersionUnsupportedRefusal =
  H0UpstreamContractVersionUnsupportedRefusal &
  Readonly<{ position: H0ContextPosition }>;
export type H0LiteralFactsSelectedRealizationRequiredRefusal =
  H0SelectedRealizationRequiredRefusal &
  Readonly<{ position: "source" }>;
export type H0ContextSelectedRealizationRequiredRefusal =
  H0SelectedRealizationRequiredRefusal &
  Readonly<{ position: H0ContextPosition }>;
export type H0LiteralFactsSelectedRealizationUnknownRefusal =
  H0SelectedRealizationUnknownRefusal &
  Readonly<{ position: "source" }>;
export type H0ContextSelectedRealizationUnknownRefusal =
  H0SelectedRealizationUnknownRefusal &
  Readonly<{ position: H0ContextPosition }>;

/** Request refusals reachable from deriveLiteralFacts(request). */
export type H0LiteralFactsRequestRefusal =
  | H0RequestIdInvalidRefusal
  | H0BaseRevisionInvalidRefusal
  | H0LiteralFactsUpstreamVersionUnsupportedRefusal
  | H0LiteralFactsSelectedRealizationRequiredRefusal
  | H0LiteralFactsSelectedRealizationUnknownRefusal;

/** Request refusals reachable from analyzeChordInContext(request). */
export type H0AnalysisRequestRefusal =
  | H0RequestIdInvalidRefusal
  | H0BaseRevisionInvalidRefusal
  | H0ContextUpstreamVersionUnsupportedRefusal
  | H0AnalysisRuleVersionUnsupportedRefusal
  | H0ContextSelectedRealizationRequiredRefusal
  | H0ContextSelectedRealizationUnknownRefusal
  | H0DuplicateEventIdRefusal;

/** Five aggregate codes intentionally retain exact field/path diagnosis. */
export const H0_LIMIT_CODES = Object.freeze([
  "limit.harmony_context_events_exceeded",
  "limit.harmony_readings_exceeded",
  "limit.harmony_scale_options_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
] as const);
export type H0LimitCode = (typeof H0_LIMIT_CODES)[number];
export type H0AnalysisLimitCode = H0LimitCode;

type H0ContextLimitMaximum = Readonly<{
  contextEvents: typeof MAX_H0_CONTEXT_EVENTS;
  t1Resolutions: typeof MAX_H0_T1_RESOLUTIONS;
  contextEdges: typeof MAX_H0_CONTEXT_EDGES;
}>;

type H0EvidenceLimitMaximum = Readonly<{
  evidencePerReading: typeof MAX_H0_EVIDENCE_PER_READING;
  counterevidencePerReading: typeof MAX_H0_COUNTEREVIDENCE_PER_READING;
  missingEvidencePerReading: typeof MAX_H0_MISSING_EVIDENCE_PER_READING;
  limitations: typeof MAX_H0_LIMITATIONS_PER_RESULT;
  ruleIdsPerReading: typeof MAX_H0_RULE_IDS_PER_READING;
  matchComponents: typeof MAX_H0_MATCH_COMPONENTS;
  tensionsPerOption: typeof MAX_H0_TENSIONS_PER_SCALE;
  clashesPerOption: typeof MAX_H0_CLASHES_PER_SCALE;
  exceptionsPerOption: typeof MAX_H0_EXCEPTIONS_PER_SCALE;
}>;

type H0WorkLimitMaximum = Readonly<{
  selectedRealizationDegrees: typeof MAX_H0_DEGREES_PER_REALIZATION;
  scaleDegrees: typeof MAX_H0_SCALE_DEGREES;
  analysisRuleEvaluations: typeof MAX_H0_ANALYSIS_RULE_EVALUATIONS;
  scaleMappingEvaluations: typeof MAX_H0_SCALE_MAPPING_EVALUATIONS;
  degreeComparisons: typeof MAX_H0_DEGREE_COMPARISONS;
  emittedRecords: typeof MAX_H0_EMITTED_RECORDS;
  trackedRecords: typeof MAX_H0_TRACKED_RECORDS;
}>;

type H0MappedLimitRefusal<
  Code extends H0LimitCode,
  Maximums extends Readonly<Record<string, number>>,
> = {
  [Field in keyof Maximums & string]: PathRefusal<{
    code: Code;
    field: Field;
    received: number;
    maximum: Maximums[Field];
  }>;
}[keyof Maximums & string];

export type H0ContextEventsLimitRefusal = H0MappedLimitRefusal<
  "limit.harmony_context_events_exceeded",
  H0ContextLimitMaximum
>;
export type H0ReadingsLimitRefusal = PathRefusal<{
  code: "limit.harmony_readings_exceeded";
  field: "readings";
  received: number;
  maximum: typeof MAX_H0_READINGS;
}>;
export type H0ScaleOptionsLimitRefusal = PathRefusal<{
  code: "limit.harmony_scale_options_exceeded";
  field: "scaleOptions";
  received: number;
  maximum: typeof MAX_H0_SCALE_OPTIONS;
}>;
export type H0EvidenceRecordsLimitRefusal = H0MappedLimitRefusal<
  "limit.harmony_evidence_records_exceeded",
  H0EvidenceLimitMaximum
>;
export type H0WorkLimitRefusal = H0MappedLimitRefusal<
  "limit.harmony_work_exceeded",
  H0WorkLimitMaximum
>;

export type H0LimitRefusal =
  | H0ContextEventsLimitRefusal
  | H0ReadingsLimitRefusal
  | H0ScaleOptionsLimitRefusal
  | H0EvidenceRecordsLimitRefusal
  | H0WorkLimitRefusal;

type H0EvidenceLimitFor<Field extends H0EvidenceRecordsLimitRefusal["field"]> =
  Extract<H0EvidenceRecordsLimitRefusal, { field: Field }>;
type H0WorkLimitFor<Field extends H0WorkLimitRefusal["field"]> = Extract<
  H0WorkLimitRefusal,
  { field: Field }
>;

/** Limit refusals reachable from deriveLiteralFacts(request). */
export type H0LiteralFactsLimitRefusal =
  | H0EvidenceLimitFor<"matchComponents">
  | H0WorkLimitFor<
      | "selectedRealizationDegrees"
      | "degreeComparisons"
      | "emittedRecords"
      | "trackedRecords"
    >;

/** Limit refusals reachable from analyzeChordInContext(request). */
export type H0AnalysisLimitRefusal =
  | H0ContextEventsLimitRefusal
  | H0ReadingsLimitRefusal
  | H0EvidenceLimitFor<
      | "evidencePerReading"
      | "counterevidencePerReading"
      | "missingEvidencePerReading"
      | "limitations"
      | "ruleIdsPerReading"
      | "matchComponents"
    >
  | H0WorkLimitFor<
      | "selectedRealizationDegrees"
      | "analysisRuleEvaluations"
      | "degreeComparisons"
      | "emittedRecords"
      | "trackedRecords"
    >;

export const H0_LITERAL_FACTS_LIMIT_CODES = Object.freeze([
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
] as const satisfies readonly H0LiteralFactsLimitRefusal["code"][]);
export const H0_ANALYSIS_LIMIT_CODES = Object.freeze([
  "limit.harmony_context_events_exceeded",
  "limit.harmony_readings_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
] as const satisfies readonly H0AnalysisLimitRefusal["code"][]);

export type H0LiteralFactsRefusal =
  | H0LiteralFactsRequestRefusal
  | H0LiteralFactsLimitRefusal;
export type H0LiteralFactsRefusalCode = H0LiteralFactsRefusal["code"];
export type H0AnalysisRefusal =
  | H0AnalysisRequestRefusal
  | H0AnalysisLimitRefusal;
export type H0Refusal = H0RequestRefusal | H0LimitRefusal;
export type H0RefusalCode = H0Refusal["code"];
export type H0AnalysisRefusalCode = H0AnalysisRefusal["code"];

export const H0_REFUSAL_CODES = Object.freeze([
  ...H0_REQUEST_REFUSAL_CODES,
  ...H0_LIMIT_CODES,
] as const);

/** One rule-version code; analysis-table validation precedes scale-table validation. */
export const H0_REFUSAL_PRECEDENCE = Object.freeze([
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.upstream_contract_version_unsupported",
  "harmony.rule_version_unsupported",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "harmony.duplicate_event_id",
  "limit.harmony_context_events_exceeded",
  "limit.harmony_readings_exceeded",
  "limit.harmony_scale_options_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
] as const satisfies readonly H0RefusalCode[]);
export const H0_LITERAL_FACTS_REFUSAL_PRECEDENCE = Object.freeze([
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.upstream_contract_version_unsupported",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
] as const satisfies readonly H0LiteralFactsRefusal["code"][]);
export const H0_ANALYSIS_REFUSAL_PRECEDENCE = Object.freeze([
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.upstream_contract_version_unsupported",
  "harmony.rule_version_unsupported",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "harmony.duplicate_event_id",
  "limit.harmony_context_events_exceeded",
  "limit.harmony_readings_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
] as const satisfies readonly H0AnalysisRefusalCode[]);

export const H0_OPERATION_TERMINATIONS = Object.freeze([
  "complete",
  "input-refusal",
  "limit-refusal",
] as const);
export type H0OperationTermination =
  (typeof H0_OPERATION_TERMINATIONS)[number];

export type H0LiteralFactsWorkEvidence<
  Termination extends H0OperationTermination = H0OperationTermination,
> = Readonly<{
  t1ResolutionsVisited: number;
  selectedRealizationDegreesVisited: number;
  degreeComparisons: number;
  emittedRecords: number;
  peakTrackedRecords: number;
  termination: Termination;
}>;

export type H0AnalysisWorkEvidence<
  Termination extends H0OperationTermination = H0OperationTermination,
> = Readonly<{
  contextEventsVisited: number;
  t1ResolutionsVisited: number;
  contextEdgesVisited: number;
  analysisRuleEvaluations: number;
  degreeComparisons: number;
  readingsEmitted: number;
  emittedRecords: number;
  peakTrackedRecords: number;
  termination: Termination;
}>;

type H0OperationResult<
  Value,
  RequestRefusal extends H0RequestRefusal,
  LimitRefusal extends H0LimitRefusal,
  Evidence extends Readonly<{ termination: H0OperationTermination }>,
  CompleteEvidence extends Evidence,
  InputRefusalEvidence extends Evidence,
  LimitRefusalEvidence extends Evidence,
> =
  | Readonly<{ ok: true; value: Value; evidence: CompleteEvidence }>
  | Readonly<{
      ok: false;
      refusal: RequestRefusal;
      evidence: InputRefusalEvidence;
    }>
  | Readonly<{
      ok: false;
      refusal: LimitRefusal;
      evidence: LimitRefusalEvidence;
    }>;

export type H0LiteralFactsResult = H0OperationResult<
  H0LiteralFactsValue,
  H0LiteralFactsRequestRefusal,
  H0LiteralFactsLimitRefusal,
  H0LiteralFactsWorkEvidence,
  H0LiteralFactsWorkEvidence<"complete">,
  H0LiteralFactsWorkEvidence<"input-refusal">,
  H0LiteralFactsWorkEvidence<"limit-refusal">
>;

export type H0AnalysisResult = H0OperationResult<
  H0AnalysisValue,
  H0AnalysisRequestRefusal,
  H0AnalysisLimitRefusal,
  H0AnalysisWorkEvidence,
  H0AnalysisWorkEvidence<"complete">,
  H0AnalysisWorkEvidence<"input-refusal">,
  H0AnalysisWorkEvidence<"limit-refusal">
>;

export type DeriveLiteralFacts = (
  request: H0LiteralFactsRequest,
) => H0LiteralFactsResult;
export type AnalyzeChordInContext = (
  request: H0AnalysisRequest,
) => H0AnalysisResult;

export interface H0AnalysisOperations {
  readonly deriveLiteralFacts: DeriveLiteralFacts;
  readonly analyzeChordInContext: AnalyzeChordInContext;
}

/**
 * Base revision is provenance only. These synchronous pure operations do not
 * expose fake cancellation, resume, browser, audio, storage, or mutation state.
 */
export const H0_PURE_OPERATION_APPLICABILITY = Object.freeze([
  {
    id: "cancellation",
    applicability: "not-applicable",
    owner: "bounded-search-packages",
    reason: "H0 operations are finite synchronous table evaluations.",
  },
  {
    id: "resume",
    applicability: "not-applicable",
    owner: "bounded-search-packages",
    reason: "H0 has no resumable cursor or mutable continuation.",
  },
  {
    id: "browser",
    applicability: "not-applicable",
    owner: "ui-release-proof",
    reason: "Pure H0 contracts name no browser adapter.",
  },
  {
    id: "audio",
    applicability: "not-applicable",
    owner: "audio-transport-packages",
    reason: "H0 consumes literal theory facts and never constructs audio nodes.",
  },
  {
    id: "storage",
    applicability: "not-applicable",
    owner: "application-persistence-packages",
    reason: "H0 reads and writes no persisted state.",
  },
  {
    id: "stale-application-revision",
    applicability: "not-applicable",
    owner: "application",
    reason: "H0 echoes baseRevision; application revalidates it before Apply.",
  },
] as const);
