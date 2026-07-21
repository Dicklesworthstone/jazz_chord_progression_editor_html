import type {
  ChordDegree,
  ChordEventId,
  KeyContext,
  PitchClass,
  SpelledPitchClass,
} from "../domain";
import {
  type H0_ANALYSIS_EVIDENCE_POLICY_ID,
  type H0_ANALYSIS_EVIDENCE_POLICY_VERSION,
  type H0_ANALYSIS_ORDER_POLICY_ID,
  type H0_ANALYSIS_ORDER_POLICY_VERSION,
  type H0_ANALYSIS_RULE_TABLE_ID,
  type H0_ANALYSIS_RULE_TABLE_VERSION,
  type H0_EXACT_WEIGHT_POLICY_ID,
  type H0_EXACT_WEIGHT_POLICY_VERSION,
  MAX_H0_ANALYSIS_RULE_EVALUATIONS,
  type MAX_H0_CLASHES_PER_SCALE,
  MAX_H0_CONTEXT_EDGES,
  MAX_H0_CONTEXT_EVENTS,
  type MAX_H0_COUNTEREVIDENCE_PER_READING,
  MAX_H0_DEGREE_COMPARISONS,
  type MAX_H0_DEGREES_PER_REALIZATION,
  MAX_H0_EMITTED_RECORDS,
  type MAX_H0_EVIDENCE_PER_READING,
  type MAX_H0_EXCEPTIONS_PER_SCALE,
  type MAX_H0_LIMITATIONS_PER_RESULT,
  type MAX_H0_MATCH_COMPONENTS,
  type MAX_H0_MISSING_EVIDENCE_PER_READING,
  type MAX_H0_RULE_IDS_PER_READING,
  type MAX_H0_SCALE_DEGREES,
  MAX_H0_SCALE_MAPPING_EVALUATIONS,
  type MAX_H0_SCALE_OPTIONS,
  MAX_H0_T1_RESOLUTIONS,
  type MAX_H0_TENSIONS_PER_SCALE,
  MAX_H0_TRACKED_RECORDS,
  type H0AnalysisRequest,
  type H0AnalysisRequestRefusal,
  type H0BoundedAtLeastTwoTuple,
  type H0BoundedNonEmptyTuple,
  type H0BoundedTuple,
  type H0DeclaredSpanKind,
  type H0EvidenceRecord,
  type H0EvidenceRecordsLimitRefusal,
  type H0EvidenceTier,
  type H0EvidenceTierRank,
  type H0ExactMatchWeight,
  type H0Limitation,
  type H0LiteralFacts,
  type H0MatchComponent,
  type H0MissingEvidence,
  type H0OperationTermination,
  type H0RuleVersionUnsupportedRefusal,
  type H0ScaleOptionsLimitRefusal,
  type H0SelectedRealizationId,
  type H0ContextEventsLimitRefusal,
  type H0WorkLimitRefusal,
} from "./analysis-contract";
import type { IndexAlignedTuple } from "./resolution-contract";

export const H0_CHORD_SCALE_CONTRACT_SCHEMA =
  "changes.theory.chord-scales-contract.v1";
export const H0_CHORD_SCALE_RESULT_SCHEMA =
  "changes.theory.chord-scales-result.v1";
export const H0_CHORD_SCALE_MAPPING_TABLE_ID =
  "changes.chord-scale-mappings";
export const H0_CHORD_SCALE_MAPPING_TABLE_VERSION = 1;
export const H0_CHORD_SCALE_CONTAINMENT_POLICY_ID =
  "changes.degree-class-containment";
export const H0_CHORD_SCALE_CONTAINMENT_POLICY_VERSION = 1;
export const H0_CONTAINMENT_POLICY_ID =
  H0_CHORD_SCALE_CONTAINMENT_POLICY_ID;
export const H0_CONTAINMENT_POLICY_VERSION =
  H0_CHORD_SCALE_CONTAINMENT_POLICY_VERSION;

export const H0_CHORD_SCALE_FAMILIES = Object.freeze([
  "ionian",
  "lydian",
  "mixolydian",
  "lydian-dominant",
  "altered",
  "whole-tone",
  "half-whole-diminished",
  "whole-half-diminished",
  "dorian",
  "melodic-minor",
  "locrian",
  "locrian-natural-2",
] as const);
export type H0ChordScaleFamily = (typeof H0_CHORD_SCALE_FAMILIES)[number];

export const H0_CHORD_SCALE_MAPPING_IDS = Object.freeze([
  "h0.scale.ionian",
  "h0.scale.lydian",
  "h0.scale.mixolydian",
  "h0.scale.lydian-dominant",
  "h0.scale.altered",
  "h0.scale.whole-tone",
  "h0.scale.half-whole-diminished",
  "h0.scale.whole-half-diminished",
  "h0.scale.dorian",
  "h0.scale.melodic-minor",
  "h0.scale.locrian",
  "h0.scale.locrian-natural-2",
  "h0.scale.suspended-dominant",
] as const);
export const H0_CHORD_SCALE_MAPPING_RULE_IDS = H0_CHORD_SCALE_MAPPING_IDS;
export type H0ChordScaleMappingId =
  (typeof H0_CHORD_SCALE_MAPPING_IDS)[number];
export type H0ChordScaleMappingRuleId = H0ChordScaleMappingId;

export type H0ChordScaleRequest = H0AnalysisRequest &
  Readonly<{
    chordScaleMappingTable: Readonly<{
      id: string;
      version: number;
    }>;
  }>;

export type H0ScaleDegreeTuple = H0BoundedNonEmptyTuple<
  ChordDegree,
  typeof MAX_H0_SCALE_DEGREES
>;

/** Degree identity includes number and alteration; pitch-class aliases do not. */
export type H0ChordScaleContainment = Readonly<{
  policyId: typeof H0_CHORD_SCALE_CONTAINMENT_POLICY_ID;
  policyVersion: typeof H0_CHORD_SCALE_CONTAINMENT_POLICY_VERSION;
  requiredChordDegrees: H0BoundedNonEmptyTuple<
    ChordDegree,
    typeof MAX_H0_DEGREES_PER_REALIZATION
  >;
  containedChordDegrees: H0BoundedTuple<
    ChordDegree,
    typeof MAX_H0_DEGREES_PER_REALIZATION
  >;
  missingRequiredChordDegrees: H0BoundedTuple<
    ChordDegree,
    typeof MAX_H0_DEGREES_PER_REALIZATION
  >;
  forbiddenScaleDegreesPresent: H0BoundedTuple<
    ChordDegree,
    typeof MAX_H0_SCALE_DEGREES
  >;
  match: H0ExactMatchWeight;
  matchComponents: H0BoundedNonEmptyTuple<
    H0MatchComponent,
    typeof MAX_H0_MATCH_COMPONENTS
  >;
}>;

export const H0_TENSION_AVAILABILITIES = Object.freeze([
  "available",
  "conditional",
  "unavailable",
] as const);
export type H0TensionAvailability =
  (typeof H0_TENSION_AVAILABILITIES)[number];

export type H0ChordScaleTension = Readonly<{
  degree: ChordDegree;
  spelling: SpelledPitchClass;
  availability: H0TensionAvailability;
  treatment: string;
}>;

type H0MinorNinthClashBase = Readonly<{
  kind: "minor-ninth";
  mappingRuleId: H0ChordScaleMappingRuleId;
  tensionDegree: ChordDegree;
  tensionSpelling: SpelledPitchClass;
  chordToneDegree: ChordDegree;
  chordToneSpelling: SpelledPitchClass;
  directedSemitones: 13;
}>;

export const H0_SCALE_EXCEPTION_IDS = Object.freeze([
  "suspended-fourth-is-chord-tone",
  "altered-root-b9",
  "diminished-dominant-b9",
  "locrian-root-b9",
] as const);
export type H0ScaleExceptionId = (typeof H0_SCALE_EXCEPTION_IDS)[number];

export type H0MinorNinthClash = H0MinorNinthClashBase &
  (
    | Readonly<{
        exceptionApplied: false;
        exceptionId: null;
      }>
    | Readonly<{
        exceptionApplied: true;
        exceptionId: H0ScaleExceptionId;
      }>
  );

export type H0ChordScaleException = Readonly<{
  id: H0ScaleExceptionId;
  degree: ChordDegree;
  detail: string;
}>;

export const H0_AUTHORITY_CLASSES = Object.freeze([
  "reviewed-project-contract",
  "upstream-reviewed-contract",
  "project-policy",
  "published-reference",
] as const);
export type H0AuthorityClass = (typeof H0_AUTHORITY_CLASSES)[number];

export type H0ChordScaleProvenance = Readonly<{
  authorityClass: H0AuthorityClass;
  authorityIds: H0BoundedNonEmptyTuple<
    string,
    typeof MAX_H0_RULE_IDS_PER_READING
  >;
  citationIds: H0BoundedNonEmptyTuple<
    string,
    typeof MAX_H0_RULE_IDS_PER_READING
  >;
}>;

export const H0_CHORD_SCALE_FAMILY_RANKS = Object.freeze({
  ionian: 0,
  lydian: 1,
  mixolydian: 2,
  "lydian-dominant": 3,
  altered: 4,
  "whole-tone": 5,
  "half-whole-diminished": 6,
  "whole-half-diminished": 7,
  dorian: 8,
  "melodic-minor": 9,
  locrian: 10,
  "locrian-natural-2": 11,
} as const satisfies Readonly<
  Record<
    H0ChordScaleFamily,
    0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
  >
>);
export type H0ChordScaleFamilyRank<Family extends H0ChordScaleFamily> =
  (typeof H0_CHORD_SCALE_FAMILY_RANKS)[Family];

/**
 * Only derived ranks are stored. The remaining mappingRuleId and optionId
 * tie-breaks come directly from the owning option and cannot drift from it.
 */
export type H0ChordScaleOrderKey<
  Strength extends H0EvidenceTier,
  Family extends H0ChordScaleFamily,
> = readonly [
  strengthRank: H0EvidenceTierRank<Strength>,
  familyRank: H0ChordScaleFamilyRank<Family>,
];

type H0ChordScaleOptionShape<
  Degrees extends H0ScaleDegreeTuple,
  Family extends H0ChordScaleFamily,
  Strength extends H0EvidenceTier,
> = Readonly<{
  kind: "option";
  optionId: string;
  family: Family;
  /** Primary deterministic tie-break; also appears in mappingRuleIds. */
  mappingRuleId: H0ChordScaleMappingRuleId;
  mappingRuleIds: H0BoundedNonEmptyTuple<
    H0ChordScaleMappingRuleId,
    typeof MAX_H0_RULE_IDS_PER_READING
  >;
  strength: Strength;
  selectedRealizationId: Exclude<H0SelectedRealizationId, "custom">;
  degrees: Degrees;
  spelledPitchNames: IndexAlignedTuple<Degrees, SpelledPitchClass>;
  pitchClasses: IndexAlignedTuple<Degrees, PitchClass>;
  containment: H0ChordScaleContainment;
  tensions: H0BoundedTuple<
    H0ChordScaleTension,
    typeof MAX_H0_TENSIONS_PER_SCALE
  >;
  minorNinthClashes: H0BoundedTuple<
    H0MinorNinthClash,
    typeof MAX_H0_CLASHES_PER_SCALE
  >;
  exceptions: H0BoundedTuple<
    H0ChordScaleException,
    typeof MAX_H0_EXCEPTIONS_PER_SCALE
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
  provenance: H0ChordScaleProvenance;
  orderKey: H0ChordScaleOrderKey<Strength, Family>;
}>;

/**
 * An option is a plural compatible candidate, never an automatic choice. The
 * conditional product preserves rank correlation for the default public union.
 */
export type H0ChordScaleOption<
  Degrees extends H0ScaleDegreeTuple = H0ScaleDegreeTuple,
  Family extends H0ChordScaleFamily = H0ChordScaleFamily,
  Strength extends H0EvidenceTier = H0EvidenceTier,
> = Family extends H0ChordScaleFamily
  ? Strength extends H0EvidenceTier
    ? H0ChordScaleOptionShape<Degrees, Family, Strength>
    : never
  : never;

type H0ChordScaleValueBase = Readonly<{
  schema: typeof H0_CHORD_SCALE_RESULT_SCHEMA;
  analysisRuleTableId: typeof H0_ANALYSIS_RULE_TABLE_ID;
  analysisRuleTableVersion: typeof H0_ANALYSIS_RULE_TABLE_VERSION;
  mappingTableId: typeof H0_CHORD_SCALE_MAPPING_TABLE_ID;
  mappingTableVersion: typeof H0_CHORD_SCALE_MAPPING_TABLE_VERSION;
  containmentPolicyId: typeof H0_CHORD_SCALE_CONTAINMENT_POLICY_ID;
  containmentPolicyVersion: typeof H0_CHORD_SCALE_CONTAINMENT_POLICY_VERSION;
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

export type H0ClassifiedChordScales = H0ChordScaleValueBase &
  Readonly<{
    disposition: "classified";
    selectedRealizationId: Exclude<H0SelectedRealizationId, "custom">;
    literalFacts: Extract<H0LiteralFacts, { applicability: "applicable" }>;
    options: H0BoundedNonEmptyTuple<
      H0ChordScaleOption,
      typeof MAX_H0_SCALE_OPTIONS
    >;
    limitations: H0BoundedTuple<
      H0Limitation,
      typeof MAX_H0_LIMITATIONS_PER_RESULT
    >;
  }>;

export type H0AmbiguousChordScales = H0ChordScaleValueBase &
  Readonly<{
    disposition: "ambiguous";
    selectedRealizationId: Exclude<H0SelectedRealizationId, "custom">;
    literalFacts: Extract<H0LiteralFacts, { applicability: "applicable" }>;
    options: H0BoundedAtLeastTwoTuple<
      H0ChordScaleOption,
      typeof MAX_H0_SCALE_OPTIONS
    >;
    limitations: H0BoundedNonEmptyTuple<
      H0Limitation,
      typeof MAX_H0_LIMITATIONS_PER_RESULT
    >;
  }>;

export type H0UnclassifiedChordScales = H0ChordScaleValueBase &
  Readonly<{
    disposition: "unclassified";
    selectedRealizationId: Exclude<H0SelectedRealizationId, "custom">;
    classification: "modal" | "nonfunctional" | "unresolved";
    literalFacts: Extract<H0LiteralFacts, { applicability: "applicable" }>;
    options: readonly [];
    limitations: H0BoundedNonEmptyTuple<
      H0Limitation,
      typeof MAX_H0_LIMITATIONS_PER_RESULT
    >;
  }>;

export type H0NotApplicableChordScales = H0ChordScaleValueBase &
  Readonly<{
    disposition: "not-applicable";
    selectedRealizationId: "custom";
    literalFacts: Extract<H0LiteralFacts, { applicability: "not-applicable" }>;
    options: readonly [];
    limitations: Extract<
      H0LiteralFacts,
      { applicability: "not-applicable" }
    >["limitations"];
  }>;

export type H0UnavailableChordScales =
  | H0UnclassifiedChordScales
  | H0NotApplicableChordScales;

export type H0ChordScaleValue =
  | H0ClassifiedChordScales
  | H0AmbiguousChordScales
  | H0UnclassifiedChordScales
  | H0NotApplicableChordScales;

/** Compatibility name for the shared one-code rule-table refusal. */
export type H0ChordScaleRuleVersionUnsupportedRefusal =
  H0RuleVersionUnsupportedRefusal &
  Readonly<{
    component: "chord-scale-mapping-table";
    expectedId: typeof H0_CHORD_SCALE_MAPPING_TABLE_ID;
    expectedVersion: typeof H0_CHORD_SCALE_MAPPING_TABLE_VERSION;
  }>;

/** Request refusals reachable from enumerateChordScaleOptions(request). */
export type H0ChordScaleRequestRefusal =
  | H0AnalysisRequestRefusal
  | H0ChordScaleRuleVersionUnsupportedRefusal;

type H0ChordScaleWorkLimitRefusal = Extract<
  H0WorkLimitRefusal,
  {
    field:
      | "selectedRealizationDegrees"
      | "scaleDegrees"
      | "analysisRuleEvaluations"
      | "scaleMappingEvaluations"
      | "degreeComparisons"
      | "emittedRecords"
      | "trackedRecords";
  }
>;
type H0ChordScaleEvidenceLimitRefusal = Extract<
  H0EvidenceRecordsLimitRefusal,
  {
    field:
      | "evidencePerReading"
      | "counterevidencePerReading"
      | "missingEvidencePerReading"
      | "limitations"
      | "ruleIdsPerReading"
      | "matchComponents"
      | "tensionsPerOption"
      | "clashesPerOption"
      | "exceptionsPerOption";
  }
>;

/** Limit refusals reachable from enumerateChordScaleOptions(request). */
export type H0ChordScaleLimitRefusal =
  | H0ContextEventsLimitRefusal
  | H0ScaleOptionsLimitRefusal
  | H0ChordScaleEvidenceLimitRefusal
  | H0ChordScaleWorkLimitRefusal;
export type H0ChordScaleRefusal =
  | H0ChordScaleRequestRefusal
  | H0ChordScaleLimitRefusal;
export type H0ChordScaleRefusalCode = H0ChordScaleRefusal["code"];
export const H0_CHORD_SCALE_LIMIT_CODES = Object.freeze([
  "limit.harmony_context_events_exceeded",
  "limit.harmony_scale_options_exceeded",
  "limit.harmony_evidence_records_exceeded",
  "limit.harmony_work_exceeded",
] as const satisfies readonly H0ChordScaleLimitRefusal["code"][]);

/** Analysis-table validation precedes mapping-table validation at the one code. */
export const H0_CHORD_SCALE_REFUSAL_PRECEDENCE = Object.freeze([
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
] as const satisfies readonly H0ChordScaleRefusalCode[]);

export type H0ChordScaleWorkEvidence<
  Termination extends H0OperationTermination = H0OperationTermination,
> = Readonly<{
  contextEventsVisited: number;
  t1ResolutionsVisited: number;
  contextEdgesVisited: number;
  analysisRuleEvaluations: number;
  scaleMappingEvaluations: number;
  degreeComparisons: number;
  optionsEmitted: number;
  emittedRecords: number;
  peakTrackedRecords: number;
  termination: Termination;
}>;

export type H0ChordScaleResult =
  | Readonly<{
      ok: true;
      value: H0ChordScaleValue;
      evidence: H0ChordScaleWorkEvidence<"complete">;
    }>
  | Readonly<{
      ok: false;
      refusal: H0ChordScaleRequestRefusal;
      evidence: H0ChordScaleWorkEvidence<"input-refusal">;
    }>
  | Readonly<{
      ok: false;
      refusal: H0ChordScaleLimitRefusal;
      evidence: H0ChordScaleWorkEvidence<"limit-refusal">;
    }>;

export type EnumerateChordScaleOptions = (
  request: H0ChordScaleRequest,
) => H0ChordScaleResult;

export interface H0ChordScaleOperations {
  readonly enumerateChordScaleOptions: EnumerateChordScaleOptions;
}

/** Keep these public counter maxima adjacent to the operation evidence shape. */
export const H0_CHORD_SCALE_WORK_LIMITS = Object.freeze({
  contextEvents: MAX_H0_CONTEXT_EVENTS,
  t1Resolutions: MAX_H0_T1_RESOLUTIONS,
  contextEdges: MAX_H0_CONTEXT_EDGES,
  analysisRuleEvaluations: MAX_H0_ANALYSIS_RULE_EVALUATIONS,
  scaleMappingEvaluations: MAX_H0_SCALE_MAPPING_EVALUATIONS,
  degreeComparisons: MAX_H0_DEGREE_COMPARISONS,
  emittedRecords: MAX_H0_EMITTED_RECORDS,
  trackedRecords: MAX_H0_TRACKED_RECORDS,
} as const);
