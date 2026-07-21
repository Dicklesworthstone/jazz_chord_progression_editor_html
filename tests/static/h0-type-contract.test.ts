import { describe, expect, test } from "bun:test";

import {
  H0_ANALYSIS_REFUSAL_PRECEDENCE,
  H0_ANALYSIS_LIMIT_CODES,
  H0_ANALYSIS_CLASSIFICATION_RANKS,
  H0_CHORD_SCALE_LIMIT_CODES,
  H0_CHORD_SCALE_FAMILY_RANKS,
  H0_CHORD_SCALE_REFUSAL_PRECEDENCE,
  H0_LITERAL_FACTS_REFUSAL_PRECEDENCE,
  H0_LITERAL_FACTS_LIMIT_CODES,
  H0_EVIDENCE_TIER_RANKS,
  H0_REFUSAL_CODES,
  H0_REFUSAL_PRECEDENCE,
  H0_REQUEST_REFUSAL_CODES,
  H0_SCALE_EXCEPTION_IDS,
  type AnalyzeChordInContext,
  type DeriveLiteralFacts,
  type EnumerateChordScaleOptions,
  type H0AmbiguousAnalysis,
  type H0AmbiguousChordScales,
  type H0AnalysisOperations,
  type H0AnalysisLimitRefusal,
  type H0AnalysisOrderKey,
  type H0AnalysisRefusalCode,
  type H0AnalysisRequest,
  type H0AnalysisRequestRefusal,
  type H0AnalysisResult,
  type H0AnalysisValue,
  type H0AnalysisWorkEvidence,
  type H0BoundedNonEmptyTuple,
  type H0ChordScaleOperations,
  type H0ChordScaleLimitRefusal,
  type H0ChordScaleMappingRuleId,
  type H0ChordScaleOption,
  type H0ChordScaleOrderKey,
  type H0ChordScaleRefusalCode,
  type H0ChordScaleRequest,
  type H0ChordScaleRequestRefusal,
  type H0ChordScaleResult,
  type H0ChordScaleValue,
  type H0ChordScaleWorkEvidence,
  type H0ClassifiedAnalysis,
  type H0ClassifiedChordScales,
  type H0ContextReading,
  type H0EvidenceRecord,
  type H0ExactMatchWeight,
  type H0LimitCode,
  type H0LiteralFacts,
  type H0LiteralFactsLimitRefusal,
  type H0LiteralFactsRequest,
  type H0LiteralFactsRequestRefusal,
  type H0LiteralFactsResult,
  type H0LiteralFactsWorkEvidence,
  type H0MinorNinthClash,
  type H0NotApplicableAnalysis,
  type H0NotApplicableChordScales,
  type H0RefusalCode,
  type H0RomanSpelling,
  type H0RequestRefusalCode,
  type H0ScaleDegreeTuple,
  type H0ScaleExceptionId,
  type H0UnclassifiedAnalysis,
  type H0UnclassifiedChordScales,
} from "../../src/theory";
import type { ChordDegree, KeyContext } from "../../src/domain";

type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type Not<Value extends boolean> = Value extends true ? false : true;
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value
  ? true
  : false;
type HasAnyKey<Value, Keys extends PropertyKey> = Extract<
  keyof Value,
  Keys
> extends never
  ? false
  : true;
type MustExtend<Constraint, Value extends Constraint> = Value;
type RefusalCodeOf<Value> = Value extends { code: infer Code } ? Code : never;
type RefusalFieldOf<Value> = Value extends { field: infer Field }
  ? Field
  : never;

function assertType<Constraint extends true>(proof?: Constraint): Constraint {
  return proof ?? (true as Constraint);
}

type TupleOfLength<
  Value,
  Length extends number,
  Accumulator extends readonly Value[] = readonly [],
> = Accumulator["length"] extends Length
  ? Accumulator
  : TupleOfLength<Value, Length, readonly [...Accumulator, Value]>;

type TwelveReadings = TupleOfLength<H0ContextReading, 12>;
type ThirteenReadings = TupleOfLength<H0ContextReading, 13>;
type TwelveOptions = TupleOfLength<H0ChordScaleOption, 12>;
type ThirteenOptions = TupleOfLength<H0ChordScaleOption, 13>;
type EightDegrees = TupleOfLength<ChordDegree, 8>;
type NineDegrees = TupleOfLength<ChordDegree, 9>;
type SixteenEvidence = TupleOfLength<H0EvidenceRecord, 16>;
type SeventeenEvidence = TupleOfLength<H0EvidenceRecord, 17>;
type EightMappingRuleIds = TupleOfLength<H0ChordScaleMappingRuleId, 8>;
type NineMappingRuleIds = TupleOfLength<H0ChordScaleMappingRuleId, 9>;

type ExpectedRequestRefusalInventory = readonly [
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "harmony.upstream_contract_version_unsupported",
  "harmony.rule_version_unsupported",
  "harmony.duplicate_event_id",
];
type ExpectedLimitInventory = readonly [
  "limit.harmony_context_events_exceeded",
  "limit.harmony_readings_exceeded",
  "limit.harmony_scale_options_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
];
type ExpectedLiteralLimitInventory = readonly [
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
];
type ExpectedAnalysisLimitInventory = readonly [
  "limit.harmony_context_events_exceeded",
  "limit.harmony_readings_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
];
type ExpectedScaleLimitInventory = readonly [
  "limit.harmony_context_events_exceeded",
  "limit.harmony_scale_options_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
];
type ExpectedRefusalInventory = readonly [
  ...ExpectedRequestRefusalInventory,
  ...ExpectedLimitInventory,
];
type ExpectedScaleExceptionInventory = readonly [
  "suspended-fourth-is-chord-tone",
  "altered-root-b9",
  "diminished-dominant-b9",
  "locrian-root-b9",
];
type ExpectedRefusalPrecedence = readonly [
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.upstream_contract_version_unsupported",
  "harmony.rule_version_unsupported",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "harmony.duplicate_event_id",
  ...ExpectedLimitInventory,
];
type ExpectedLiteralRefusalPrecedence = readonly [
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.upstream_contract_version_unsupported",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
];
type ExpectedAnalysisRefusalPrecedence = readonly [
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
];
type ExpectedScaleRefusalPrecedence = readonly [
  "harmony.request_id_invalid",
  "harmony.base_revision_invalid",
  "harmony.upstream_contract_version_unsupported",
  "harmony.rule_version_unsupported",
  "harmony.selected_realization_required",
  "harmony.selected_realization_unknown",
  "harmony.duplicate_event_id",
  "limit.harmony_context_events_exceeded",
  "limit.harmony_scale_options_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
];

type ExpectedRefusalCode = ExpectedRefusalInventory[number];
type ExpectedRequestRefusalCode = ExpectedRequestRefusalInventory[number];
type ExpectedLimitCode = ExpectedLimitInventory[number];
type ExpectedLiteralRequestRefusalCode = Exclude<
  ExpectedRequestRefusalCode,
  "harmony.rule_version_unsupported" | "harmony.duplicate_event_id"
>;
type ExpectedAnalysisLimitCode = Exclude<
  ExpectedLimitCode,
  "limit.harmony_scale_options_exceeded"
>;
type ExpectedScaleLimitCode = Exclude<
  ExpectedLimitCode,
  "limit.harmony_readings_exceeded"
>;
type ForbiddenChoiceKey =
  | "confidence"
  | "probability"
  | "chosenScale"
  | "best";

type AnalysisSuccess = Extract<H0AnalysisResult, { ok: true }>;
type AnalysisInputFailure = Extract<
  H0AnalysisResult,
  { ok: false; evidence: { termination: "input-refusal" } }
>;
type AnalysisLimitFailure = Extract<
  H0AnalysisResult,
  { ok: false; evidence: { termination: "limit-refusal" } }
>;
type LiteralSuccess = Extract<H0LiteralFactsResult, { ok: true }>;
type LiteralInputFailure = Extract<
  H0LiteralFactsResult,
  { ok: false; evidence: { termination: "input-refusal" } }
>;
type LiteralLimitFailure = Extract<
  H0LiteralFactsResult,
  { ok: false; evidence: { termination: "limit-refusal" } }
>;
type ScaleSuccess = Extract<H0ChordScaleResult, { ok: true }>;
type ScaleInputFailure = Extract<
  H0ChordScaleResult,
  { ok: false; evidence: { termination: "input-refusal" } }
>;
type ScaleLimitFailure = Extract<
  H0ChordScaleResult,
  { ok: false; evidence: { termination: "limit-refusal" } }
>;

type InvalidReadingKind = Omit<H0ContextReading, "kind"> &
  Readonly<{ kind: "literal" }>;
type InvalidOptionKind = Omit<H0ChordScaleOption, "kind"> &
  Readonly<{ kind: "reading" }>;
type ExactModalReading = H0ContextReading<"modal", "exact">;
type StrongNonfunctionalReading = H0ContextReading<
  "nonfunctional",
  "strong"
>;
type PlausibleAlteredOption = H0ChordScaleOption<
  H0ScaleDegreeTuple,
  "altered",
  "plausible"
>;
type InvalidModalOrder = Omit<ExactModalReading, "orderKey"> &
  Readonly<{ orderKey: readonly [0, 10] }>;
type InvalidAlteredOrder = Omit<PlausibleAlteredOption, "orderKey"> &
  Readonly<{ orderKey: readonly [2, 5] }>;
type InvalidMajorSeventh = Readonly<{
  quality: "major";
  degree: Readonly<{ number: 7; alter: -1 }>;
}>;

type NegativeCompileProofs = readonly [
  // @ts-expect-error: a thirteenth contextual reading exceeds the H0 cap
  MustExtend<H0BoundedNonEmptyTuple<H0ContextReading, 12>, ThirteenReadings>,
  // @ts-expect-error: a thirteenth scale option exceeds the H0 cap
  MustExtend<H0BoundedNonEmptyTuple<H0ChordScaleOption, 12>, ThirteenOptions>,
  // @ts-expect-error: a ninth scale degree exceeds the public option cap
  MustExtend<H0ScaleDegreeTuple, NineDegrees>,
  // @ts-expect-error: a seventeenth evidence row exceeds the per-reading cap
  MustExtend<H0ContextReading["evidence"], SeventeenEvidence>,
  // @ts-expect-error: an ambiguous result requires at least two readings
  MustExtend<H0AmbiguousAnalysis["readings"], readonly [H0ContextReading]>,
  // @ts-expect-error: an ambiguous scale result requires at least two options
  MustExtend<H0AmbiguousChordScales["options"], readonly [H0ChordScaleOption]>,
  // @ts-expect-error: unclassified is successful evidence, never an empty reading list
  MustExtend<H0UnclassifiedAnalysis["readings"], readonly []>,
  // @ts-expect-error: only not-applicable may expose an empty contextual reading list
  MustExtend<H0NotApplicableAnalysis["readings"], readonly [H0ContextReading]>,
  // @ts-expect-error: contextual evidence cannot masquerade as a literal fact
  MustExtend<H0ContextReading, InvalidReadingKind>,
  // @ts-expect-error: a scale option cannot masquerade as a contextual reading
  MustExtend<H0ChordScaleOption, InvalidOptionKind>,
  // @ts-expect-error: modal rank is derived from the reading classification
  MustExtend<H0ContextReading, InvalidModalOrder>,
  // @ts-expect-error: altered rank is derived from the option family
  MustExtend<H0ChordScaleOption, InvalidAlteredOrder>,
  // @ts-expect-error: a major seventh cannot carry the minor-seventh degree
  MustExtend<NonNullable<H0RomanSpelling["seventh"]>, InvalidMajorSeventh>,
  // @ts-expect-error: a ninth mapping-rule ID exceeds the option proof cap
  MustExtend<H0ChordScaleOption["mappingRuleIds"], NineMappingRuleIds>,
];

const positiveTypeProofs = [
  assertType<Equal<H0LiteralFacts["kind"], "literal">>(),
  assertType<Equal<H0ContextReading["kind"], "reading">>(),
  assertType<Equal<H0ChordScaleOption["kind"], "option">>(),
  assertType<Not<HasKey<H0ContextReading, "disposition">>>(),
  assertType<Equal<keyof H0AnalysisOperations,
    "analyzeChordInContext" | "deriveLiteralFacts"
  >>(),
  assertType<Equal<keyof H0ChordScaleOperations,
    "enumerateChordScaleOptions"
  >>(),
  assertType<Not<HasKey<H0ChordScaleOperations, "matchChordScales">>>(),
  assertType<Equal<ReturnType<DeriveLiteralFacts>, H0LiteralFactsResult>>(),
  assertType<Equal<ReturnType<AnalyzeChordInContext>, H0AnalysisResult>>(),
  assertType<Equal<ReturnType<EnumerateChordScaleOptions>, H0ChordScaleResult>>(),

  assertType<Equal<H0ClassifiedAnalysis["readings"]["length"],
    1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  >>(),
  assertType<Equal<H0AmbiguousAnalysis["readings"]["length"],
    2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  >>(),
  assertType<Equal<H0UnclassifiedAnalysis["readings"]["length"],
    1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  >>(),
  assertType<Equal<H0NotApplicableAnalysis["readings"], readonly []>>(),
  assertType<ExactModalReading extends H0ClassifiedAnalysis["readings"][number]
    ? true
    : false>(),
  assertType<StrongNonfunctionalReading extends H0ClassifiedAnalysis["readings"][number]
    ? true
    : false>(),
  assertType<Equal<H0ClassifiedChordScales["options"]["length"],
    1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  >>(),
  assertType<Equal<H0AmbiguousChordScales["options"]["length"],
    2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  >>(),
  assertType<Equal<H0UnclassifiedChordScales["options"], readonly []>>(),
  assertType<Equal<H0UnclassifiedChordScales["classification"],
    "modal" | "nonfunctional" | "unresolved"
  >>(),
  assertType<Not<HasKey<H0NotApplicableChordScales, "classification">>>(),
  assertType<Equal<H0NotApplicableChordScales["options"], readonly []>>(),
  assertType<TwelveReadings extends H0BoundedNonEmptyTuple<H0ContextReading, 12>
    ? true
    : false>(),
  assertType<Not<ThirteenReadings extends H0BoundedNonEmptyTuple<H0ContextReading, 12>
    ? true
    : false>>(),
  assertType<TwelveOptions extends H0BoundedNonEmptyTuple<H0ChordScaleOption, 12>
    ? true
    : false>(),
  assertType<Not<ThirteenOptions extends H0BoundedNonEmptyTuple<H0ChordScaleOption, 12>
    ? true
    : false>>(),
  assertType<EightDegrees extends H0ScaleDegreeTuple ? true : false>(),
  assertType<Not<NineDegrees extends H0ScaleDegreeTuple ? true : false>>(),
  assertType<SixteenEvidence extends H0ContextReading["evidence"] ? true : false>(),
  assertType<Not<SeventeenEvidence extends H0ContextReading["evidence"]
    ? true
    : false>>(),

  assertType<Equal<H0RomanSpelling["key"], KeyContext>>(),
  assertType<Not<HasKey<H0RomanSpelling, "keyTonic">>>(),
  assertType<Equal<keyof NonNullable<H0RomanSpelling["seventh"]>,
    "degree" | "quality"
  >>(),
  assertType<Equal<H0RomanSpelling["extension"],
    ChordDegree<9 | 11 | 13> | null
  >>(),
  assertType<Equal<H0ChordScaleValue["analysisRuleTableId"],
    "changes.harmony-analysis-rules"
  >>(),
  assertType<Equal<H0ChordScaleValue["analysisRuleTableVersion"], 1>>(),
  assertType<Equal<typeof H0_EVIDENCE_TIER_RANKS, Readonly<{
    exact: 0;
    strong: 1;
    plausible: 2;
    speculative: 3;
  }>>>(),
  assertType<Equal<typeof H0_ANALYSIS_CLASSIFICATION_RANKS, Readonly<{
    diatonic: 0;
    "ordinary-dominant": 1;
    "secondary-dominant": 2;
    "secondary-leading-tone": 3;
    "tritone-substitute": 4;
    "backdoor-dominant": 5;
    "modal-mixture": 6;
    "passing-diminished": 7;
    "chromatic-roman": 8;
    modal: 9;
    nonfunctional: 10;
    unresolved: 11;
  }>>>(),
  assertType<Equal<typeof H0_CHORD_SCALE_FAMILY_RANKS, Readonly<{
    ionian: 0;
    lydian: 1;
    mixolydian: 2;
    "lydian-dominant": 3;
    altered: 4;
    "whole-tone": 5;
    "half-whole-diminished": 6;
    "whole-half-diminished": 7;
    dorian: 8;
    "melodic-minor": 9;
    locrian: 10;
    "locrian-natural-2": 11;
  }>>>(),
  assertType<Equal<ExactModalReading["orderKey"], readonly [0, 9]>>(),
  assertType<Equal<StrongNonfunctionalReading["orderKey"], readonly [1, 10]>>(),
  assertType<Equal<PlausibleAlteredOption["orderKey"], readonly [2, 4]>>(),
  assertType<Not<HasKey<H0AnalysisOrderKey<"exact", "modal">, "ruleId">>>(),
  assertType<Not<HasKey<H0AnalysisOrderKey<"exact", "modal">, "readingId">>>(),
  assertType<HasKey<ExactModalReading, "ruleIds">>(),
  assertType<HasKey<ExactModalReading, "readingId">>(),
  assertType<Not<HasKey<H0ChordScaleOrderKey<"exact", "altered">,
    "mappingRuleId"
  >>>(),
  assertType<Not<HasKey<H0ChordScaleOrderKey<"exact", "altered">,
    "optionId"
  >>>(),
  assertType<HasKey<PlausibleAlteredOption, "mappingRuleId">>(),
  assertType<HasKey<PlausibleAlteredOption, "mappingRuleIds">>(),
  assertType<HasKey<PlausibleAlteredOption, "optionId">>(),
  assertType<EightMappingRuleIds extends H0ChordScaleOption["mappingRuleIds"]
    ? true
    : false>(),
  assertType<Equal<typeof H0_SCALE_EXCEPTION_IDS,
    ExpectedScaleExceptionInventory
  >>(),
  assertType<Equal<H0ScaleExceptionId,
    ExpectedScaleExceptionInventory[number]
  >>(),
  assertType<Equal<keyof H0MinorNinthClash,
    | "chordToneDegree"
    | "chordToneSpelling"
    | "directedSemitones"
    | "exceptionApplied"
    | "exceptionId"
    | "kind"
    | "mappingRuleId"
    | "tensionDegree"
    | "tensionSpelling"
  >>(),
  assertType<Equal<Extract<
    H0MinorNinthClash,
    { exceptionApplied: false }
  >["exceptionId"], null>>(),
  assertType<Equal<Extract<
    H0MinorNinthClash,
    { exceptionApplied: true }
  >["exceptionId"], H0ScaleExceptionId>>(),

  assertType<Equal<typeof H0_REQUEST_REFUSAL_CODES,
    ExpectedRequestRefusalInventory
  >>(),
  assertType<Equal<typeof H0_LITERAL_FACTS_LIMIT_CODES,
    ExpectedLiteralLimitInventory
  >>(),
  assertType<Equal<typeof H0_ANALYSIS_LIMIT_CODES,
    ExpectedAnalysisLimitInventory
  >>(),
  assertType<Equal<typeof H0_CHORD_SCALE_LIMIT_CODES,
    ExpectedScaleLimitInventory
  >>(),
  assertType<Equal<typeof H0_REFUSAL_CODES, ExpectedRefusalInventory>>(),
  assertType<Equal<typeof H0_REFUSAL_PRECEDENCE, ExpectedRefusalPrecedence>>(),
  assertType<Equal<typeof H0_LITERAL_FACTS_REFUSAL_PRECEDENCE,
    ExpectedLiteralRefusalPrecedence
  >>(),
  assertType<Equal<typeof H0_ANALYSIS_REFUSAL_PRECEDENCE,
    ExpectedAnalysisRefusalPrecedence
  >>(),
  assertType<Equal<typeof H0_CHORD_SCALE_REFUSAL_PRECEDENCE,
    ExpectedScaleRefusalPrecedence
  >>(),
  assertType<Equal<H0RequestRefusalCode, ExpectedRequestRefusalCode>>(),
  assertType<Equal<H0LimitCode, ExpectedLimitCode>>(),
  assertType<Equal<H0RefusalCode, ExpectedRefusalCode>>(),
  assertType<Equal<H0AnalysisRefusalCode,
    ExpectedRequestRefusalCode | ExpectedAnalysisLimitCode
  >>(),
  assertType<Equal<H0ChordScaleRefusalCode,
    ExpectedRequestRefusalCode | ExpectedScaleLimitCode
  >>(),
  assertType<Equal<RefusalCodeOf<H0LiteralFactsRequestRefusal>,
    ExpectedLiteralRequestRefusalCode
  >>(),
  assertType<Equal<RefusalCodeOf<H0LiteralFactsLimitRefusal>,
    | "limit.harmony_evidence_records_exceeded"
    | "limit.harmony_work_exceeded"
  >>(),
  assertType<Equal<RefusalCodeOf<H0AnalysisRequestRefusal>,
    ExpectedRequestRefusalCode
  >>(),
  assertType<Equal<RefusalCodeOf<H0AnalysisLimitRefusal>,
    ExpectedAnalysisLimitCode
  >>(),
  assertType<Equal<RefusalCodeOf<H0ChordScaleRequestRefusal>,
    ExpectedRequestRefusalCode
  >>(),
  assertType<Equal<RefusalCodeOf<H0ChordScaleLimitRefusal>,
    ExpectedScaleLimitCode
  >>(),
  assertType<Equal<AnalysisInputFailure["refusal"], H0AnalysisRequestRefusal>>(),
  assertType<Equal<AnalysisLimitFailure["refusal"], H0AnalysisLimitRefusal>>(),
  assertType<Equal<LiteralInputFailure["refusal"],
    H0LiteralFactsRequestRefusal
  >>(),
  assertType<Equal<LiteralLimitFailure["refusal"],
    H0LiteralFactsLimitRefusal
  >>(),
  assertType<Equal<ScaleInputFailure["refusal"],
    H0ChordScaleRequestRefusal
  >>(),
  assertType<Equal<ScaleLimitFailure["refusal"], H0ChordScaleLimitRefusal>>(),
  assertType<Not<HasKey<H0LiteralFactsRequest, "analysisRuleTable">>>(),
  assertType<HasKey<H0AnalysisRequest, "analysisRuleTable">>(),
  assertType<Not<HasKey<H0AnalysisRequest, "chordScaleMappingTable">>>(),
  assertType<HasKey<H0ChordScaleRequest, "analysisRuleTable">>(),
  assertType<HasKey<H0ChordScaleRequest, "chordScaleMappingTable">>(),
  assertType<Equal<Extract<
    H0LiteralFactsRequestRefusal,
    { code: "harmony.rule_version_unsupported" }
  >, never>>(),
  assertType<Equal<Extract<
    H0LiteralFactsRequestRefusal,
    { code: "harmony.duplicate_event_id" }
  >, never>>(),
  assertType<Equal<Extract<
    H0AnalysisRequestRefusal,
    { code: "harmony.rule_version_unsupported" }
  >["component"], "analysis-rule-table">>(),
  assertType<Equal<Extract<
    H0LiteralFactsRequestRefusal,
    { code: "harmony.upstream_contract_version_unsupported" }
  >["position"], "source">>(),
  assertType<Equal<Extract<
    H0LiteralFactsRequestRefusal,
    { code: "harmony.selected_realization_required" }
  >["position"], "source">>(),
  assertType<Equal<Extract<
    H0LiteralFactsRequestRefusal,
    { code: "harmony.request_id_invalid" }
  >["reason"], "empty" | "non-ascii" | "too-long">>(),
  assertType<Not<HasKey<Extract<
    H0LiteralFactsRequestRefusal,
    { code: "harmony.base_revision_invalid" }
  >, "reason">>>(),
  assertType<Equal<Extract<
    H0AnalysisRequestRefusal,
    { code: "harmony.upstream_contract_version_unsupported" }
  >["position"], "current" | "next" | "previous">>(),
  assertType<Equal<Extract<
    H0AnalysisRequestRefusal,
    { code: "harmony.selected_realization_unknown" }
  >["position"], "current" | "next" | "previous">>(),
  assertType<Equal<Extract<
    H0ChordScaleRequestRefusal,
    { code: "harmony.rule_version_unsupported" }
  >["component"], "analysis-rule-table" | "chord-scale-mapping-table">>(),
  assertType<Not<"contextEvents" extends RefusalFieldOf<H0LiteralFactsLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"readings" extends RefusalFieldOf<H0LiteralFactsLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"scaleOptions" extends RefusalFieldOf<H0LiteralFactsLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"analysisRuleEvaluations" extends RefusalFieldOf<H0LiteralFactsLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"scaleMappingEvaluations" extends RefusalFieldOf<H0LiteralFactsLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"scaleOptions" extends RefusalFieldOf<H0AnalysisLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"scaleDegrees" extends RefusalFieldOf<H0AnalysisLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"scaleMappingEvaluations" extends RefusalFieldOf<H0AnalysisLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"tensionsPerOption" extends RefusalFieldOf<H0AnalysisLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"clashesPerOption" extends RefusalFieldOf<H0AnalysisLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"exceptionsPerOption" extends RefusalFieldOf<H0AnalysisLimitRefusal>
    ? true
    : false>>(),
  assertType<Not<"readings" extends RefusalFieldOf<H0ChordScaleLimitRefusal>
    ? true
    : false>>(),
  assertType<"evidencePerReading" extends RefusalFieldOf<H0ChordScaleLimitRefusal>
    ? true
    : false>(),
  assertType<"counterevidencePerReading" extends RefusalFieldOf<H0ChordScaleLimitRefusal>
    ? true
    : false>(),
  assertType<"missingEvidencePerReading" extends RefusalFieldOf<H0ChordScaleLimitRefusal>
    ? true
    : false>(),
  assertType<"ruleIdsPerReading" extends RefusalFieldOf<H0ChordScaleLimitRefusal>
    ? true
    : false>(),
  assertType<Equal<AnalysisSuccess["evidence"]["termination"], "complete">>(),
  assertType<Equal<LiteralSuccess["evidence"]["termination"], "complete">>(),
  assertType<Equal<ScaleSuccess["evidence"]["termination"], "complete">>(),
  assertType<Equal<H0AnalysisWorkEvidence["termination"],
    "complete" | "input-refusal" | "limit-refusal"
  >>(),
  assertType<Equal<H0LiteralFactsWorkEvidence["termination"],
    "complete" | "input-refusal" | "limit-refusal"
  >>(),
  assertType<Equal<H0ChordScaleWorkEvidence["termination"],
    "complete" | "input-refusal" | "limit-refusal"
  >>(),
  assertType<Equal<keyof H0AnalysisWorkEvidence,
    | "analysisRuleEvaluations"
    | "contextEdgesVisited"
    | "contextEventsVisited"
    | "degreeComparisons"
    | "emittedRecords"
    | "peakTrackedRecords"
    | "readingsEmitted"
    | "t1ResolutionsVisited"
    | "termination"
  >>(),
  assertType<Equal<keyof H0ChordScaleWorkEvidence,
    | "analysisRuleEvaluations"
    | "contextEdgesVisited"
    | "contextEventsVisited"
    | "degreeComparisons"
    | "emittedRecords"
    | "optionsEmitted"
    | "peakTrackedRecords"
    | "scaleMappingEvaluations"
    | "t1ResolutionsVisited"
    | "termination"
  >>(),

  assertType<Equal<keyof H0ExactMatchWeight, "denominator" | "numerator">>(),
  assertType<Not<HasAnyKey<H0ExactMatchWeight, ForbiddenChoiceKey>>>(),
  assertType<Not<HasAnyKey<H0LiteralFacts, ForbiddenChoiceKey>>>(),
  assertType<Not<HasAnyKey<H0ContextReading, ForbiddenChoiceKey>>>(),
  assertType<Not<HasAnyKey<H0AnalysisValue, ForbiddenChoiceKey>>>(),
  assertType<Not<HasAnyKey<H0ChordScaleOption, ForbiddenChoiceKey>>>(),
  assertType<Not<HasAnyKey<H0ChordScaleValue, ForbiddenChoiceKey>>>(),
  assertType<Equal<NegativeCompileProofs["length"], 14>>(),
] as const;

describe("H0 hardened type contract", () => {
  test("rejects kind, cardinality, bound, refusal, termination, and choice drift", () => {
    expect(positiveTypeProofs.every(Boolean)).toBe(true);
  });
});
