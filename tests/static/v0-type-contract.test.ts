import { describe, expect, test } from "bun:test";

import type {
  AutoVoicing,
  ChordDegree,
  FrozenVoicing,
  ManualVoicing,
} from "../../src/domain";
import {
  VOICING_CANDIDATE_PAYLOAD_LIMITS as PUBLIC_VOICING_CANDIDATE_PAYLOAD_LIMITS,
  VOICING_CONSTRAINT_OBSERVATION_POLICY_ID as PUBLIC_VOICING_CONSTRAINT_OBSERVATION_POLICY_ID,
  VOICING_ENGINE_ID as PUBLIC_VOICING_ENGINE_ID,
  VOICING_FAMILY_REGISTER_POLICY_IDS as PUBLIC_VOICING_FAMILY_REGISTER_POLICY_IDS,
  VOICING_IDENTIFIER_LIMITS as PUBLIC_VOICING_IDENTIFIER_LIMITS,
  VOICING_TRACKED_RECORD_ACCOUNTING as PUBLIC_VOICING_TRACKED_RECORD_ACCOUNTING,
  VOICING_TRACKED_RECORD_POPULATION_LIMITS as PUBLIC_VOICING_TRACKED_RECORD_POPULATION_LIMITS,
  type QuartalDegreeSequence as PublicQuartalDegreeSequence,
  type SemanticRealizationId,
  type VoicingFamilyRegisterPolicy as PublicVoicingFamilyRegisterPolicy,
  type VoicingTemplateDegreeSequence as PublicVoicingTemplateDegreeSequence,
} from "../../src/theory";
import {
  MAX_VOICING_CONSTRAINT_OBSERVATION_COMPARISONS,
  MAX_VOICING_CONSTRAINT_OBSERVATIONS_PER_CANDIDATE,
  MAX_VOICING_EVIDENCE_ID_CODE_POINTS,
  MAX_VOICING_EVIDENCE_ID_UTF8_BYTES,
  MAX_VOICING_EVIDENCE_RECORDS_PER_CANDIDATE,
  MAX_VOICING_EXPLANATION_OMITTED_DEGREES,
  MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
  MAX_VOICING_RETAINED_CANDIDATES,
  MIN_VOICING_EVIDENCE_ID_CODE_POINTS,
  VOICING_CANDIDATE_PAYLOAD_LIMITS,
  VOICING_CONSTRAINT_CODES,
  VOICING_CONSTRAINT_OBSERVATION_POLICY_ID,
  VOICING_CONSTRAINT_OBSERVATION_POLICY_VERSION,
  VOICING_ENGINE_ID,
  VOICING_EVIDENCE_CODES,
  VOICING_FAMILY_REGISTER_POLICY_IDS,
  VOICING_IDENTIFIER_LIMITS,
  VOICING_MEMORY_COUNTER_NAMES,
  VOICING_OPERATION_NAMES,
  VOICING_REFUSAL_CODES,
  VOICING_REGISTER_OUTPUT_ORDERS,
  VOICING_REGISTER_SLOT_ORDER_POLICIES,
  VOICING_REGISTER_SOURCE_VOICE_SELECTIONS,
  VOICING_REGISTER_STRUCTURAL_TRANSFORMS,
  VOICING_TERMINATIONS,
  VOICING_REALIZATION_DEGREE_ROLE_SOURCES,
  VOICING_TEMPLATE_SELECTION_MODES,
  VOICING_TRACKED_RECORD_ACCOUNTING,
  VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_ID,
  VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_VERSION,
  VOICING_TRACKED_RECORD_POPULATION_LIMITS,
  VOICING_TRACKED_RECORD_POPULATIONS,
  VOICING_WORK_COUNTER_NAMES,
  type AvailableVoicingFamilyTemplate,
  type AutoVoicingRequest,
  type BalancedRegisterPolicy,
  type ContextGatedVoicingFamilyTemplate,
  type DoublingCandidateVoice,
  type Drop2RegisterPolicy,
  type Drop2TransformEvidence,
  type FixedDegreeSequenceVoicingFamilyTemplate,
  type GeneratedVoicingCandidates,
  type GeneratedVoicingResult,
  type NonQuartalVoicingCandidateEvidenceRecords,
  type NonQuartalAutoVoicingRequest,
  type OpenRegisterPolicy,
  type QuartalAutoVoicingRequest,
  type QuartalContext,
  type QuartalDegreeSequence,
  type RealizationCandidateVoice,
  type RealizationRoleVoicingFamilyTemplate,
  type RealizeVoicing,
  type RealizeVoicingRequest,
  type RealizationUnavailableRefusal,
  type SatisfiedVoicingConstraint,
  type SlashBassCandidateVoice,
  type StoredVoicingBypassEvidence,
  type StoredVoicingRequest,
  type StoredVoicingResult,
  type UnavailableVoicingFamilyTemplate,
  type UnsatisfiedVoicingConstraint,
  type VoicingCandidate,
  type VoicingCandidateEvidence,
  type VoicingCandidateEvidenceRecords,
  type VoicingCandidateExplanation,
  type VoicingCandidateHardConstraints,
  type VoicingCandidatePitches,
  type VoicingCandidateVoice,
  type VoicingCandidateVoices,
  type VoicingFamilyTemplate,
  type VoicingFamilyRegisterPolicy,
  type VoicingFailure,
  type VoicingConstraintsUnsatisfiedRefusal,
  type VoicingRefusalCode,
  type VoicingTemplateDegreeSequence,
  type VoicingTemplateDegreeSlot,
  type VoicingWorkEvidence,
} from "../../src/theory/voicing-candidates-contract";

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
type MustExtend<Constraint, Value extends Constraint> = Value;

function assertType<Constraint extends true>(proof?: Constraint): Constraint {
  return proof ?? (true as Constraint);
}

type QuartalRequestWithoutRealization = Omit<
  QuartalAutoVoicingRequest,
  "realizationId"
>;
type QuartalRequestWithNullContext = Omit<
  QuartalAutoVoicingRequest,
  "quartalContext"
> & Readonly<{ quartalContext: null }>;
type NonQuartalRequestWithContext = Omit<
  NonQuartalAutoVoicingRequest,
  "quartalContext"
> & Readonly<{ quartalContext: QuartalContext }>;
type AdaptiveTemplateWithFixedSelectionMode = Omit<
  RealizationRoleVoicingFamilyTemplate,
  "selectionMode"
> & Readonly<{ selectionMode: "fixed-degree-sequence" }>;

type VoiceTupleOfLength<
  Length extends number,
  Accumulator extends readonly VoicingCandidateVoice[] = readonly [],
> = Accumulator["length"] extends Length
  ? Accumulator
  : VoiceTupleOfLength<
      Length,
      readonly [...Accumulator, VoicingCandidateVoice]
    >;

type PitchTupleOfLength<
  Length extends number,
  Accumulator extends readonly VoicingCandidatePitches[number][] = readonly [],
> = Accumulator["length"] extends Length
  ? Accumulator
  : PitchTupleOfLength<
      Length,
      readonly [...Accumulator, VoicingCandidatePitches[number]]
    >;

type DegreeTupleOfLength<
  Length extends number,
  Accumulator extends readonly ChordDegree[] = readonly [],
> = Accumulator["length"] extends Length
  ? Accumulator
  : DegreeTupleOfLength<Length, readonly [...Accumulator, ChordDegree]>;

type TemplateSlotTupleOfLength<
  Length extends number,
  Accumulator extends readonly VoicingTemplateDegreeSlot[] = readonly [],
> = Accumulator["length"] extends Length
  ? Accumulator
  : TemplateSlotTupleOfLength<
      Length,
      readonly [...Accumulator, VoicingTemplateDegreeSlot]
    >;

type TupleOfLength<
  Value,
  Length extends number,
  Accumulator extends readonly Value[] = readonly [],
> = Accumulator["length"] extends Length
  ? Accumulator
  : TupleOfLength<Value, Length, readonly [...Accumulator, Value]>;

type ZeroThroughSeven = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type OneThroughTwentyFour =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
  | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;

type RootlessATemplate = Extract<
  FixedDegreeSequenceVoicingFamilyTemplate,
  { family: "rootless-a" }
>;
type Drop2Template = Extract<
  RealizationRoleVoicingFamilyTemplate,
  { family: "drop2" }
>;
type RootlessTemplateWithGeneratedBass = Omit<
  RootlessATemplate,
  "permittedBassPolicies"
> & Readonly<{ permittedBassPolicies: readonly ["generated"] }>;
type RootlessThreeVoiceTemplate = Omit<
  RootlessATemplate,
  "minimumVoiceCount" | "permittedVoiceCounts"
> &
  Readonly<{ minimumVoiceCount: 3; permittedVoiceCounts: readonly [3] }>;
type RootlessThreeSlotTemplate = Omit<
  RootlessATemplate,
  "degreeSequence"
> &
  Readonly<{ degreeSequence: TemplateSlotTupleOfLength<3> }>;
type Drop2ThreeVoiceTemplate = Omit<
  Drop2Template,
  "minimumVoiceCount" | "permittedVoiceCounts"
> &
  Readonly<{
    minimumVoiceCount: 3;
    permittedVoiceCounts: readonly [3, 4, 5, 6, 7];
  }>;
type QuartalSixVoiceTemplate = Omit<
  ContextGatedVoicingFamilyTemplate,
  "permittedVoiceCounts"
> & Readonly<{ permittedVoiceCounts: readonly [3, 4, 5, 6] }>;
type QuartalUnavailableWithQualityReason = Omit<
  Extract<UnavailableVoicingFamilyTemplate, { family: "quartal" }>,
  "reason"
> & Readonly<{ reason: "quality-family-unsupported" }>;
type ShellUnavailableWithQuartalReason = Omit<
  Extract<UnavailableVoicingFamilyTemplate, { family: "shell" }>,
  "reason"
> & Readonly<{ reason: "quartal-row-undeclared" }>;
type NonQuartalCandidateWithNineEvidence = Omit<
  Exclude<VoicingCandidate, { family: "quartal" }>,
  "family" | "evidence"
> &
  Readonly<{
    family: "balanced";
    evidence: TupleOfLength<VoicingCandidateEvidence, 9>;
  }>;
type MisorderedNonQuartalEvidence = readonly [
  NonQuartalVoicingCandidateEvidenceRecords[1],
  NonQuartalVoicingCandidateEvidenceRecords[0],
  NonQuartalVoicingCandidateEvidenceRecords[2],
  NonQuartalVoicingCandidateEvidenceRecords[3],
  NonQuartalVoicingCandidateEvidenceRecords[4],
  NonQuartalVoicingCandidateEvidenceRecords[5],
  NonQuartalVoicingCandidateEvidenceRecords[6],
  NonQuartalVoicingCandidateEvidenceRecords[7],
];
type MisorderedHardConstraints = readonly [
  VoicingCandidateHardConstraints[1],
  VoicingCandidateHardConstraints[0],
  VoicingCandidateHardConstraints[2],
  VoicingCandidateHardConstraints[3],
  VoicingCandidateHardConstraints[4],
  VoicingCandidateHardConstraints[5],
  VoicingCandidateHardConstraints[6],
  VoicingCandidateHardConstraints[7],
  VoicingCandidateHardConstraints[8],
  VoicingCandidateHardConstraints[9],
  VoicingCandidateHardConstraints[10],
  VoicingCandidateHardConstraints[11],
  VoicingCandidateHardConstraints[12],
  VoicingCandidateHardConstraints[13],
  VoicingCandidateHardConstraints[14],
  VoicingCandidateHardConstraints[15],
];
type BalancedUnavailableTemplate = Omit<
  Exclude<UnavailableVoicingFamilyTemplate, { family: "quartal" }>,
  "family"
> & Readonly<{ family: "balanced" }>;

type FailureFor<Code extends VoicingRefusalCode> = Extract<
  VoicingFailure,
  { refusal: { code: Code } }
>;
type TerminationFor<Code extends VoicingRefusalCode> =
  FailureFor<Code>["evidence"]["termination"];

type BypassCounterKey = Exclude<
  keyof StoredVoicingBypassEvidence,
  "termination"
>;
type NonzeroBypassCounter = {
  [Key in BypassCounterKey]: Equal<
    StoredVoicingBypassEvidence[Key],
    0
  > extends true
    ? never
    : Key;
}[BypassCounterKey];

type ManualOperation = (
  request: StoredVoicingRequest<ManualVoicing>,
) => StoredVoicingResult<ManualVoicing>;
type FrozenOperation = (
  request: StoredVoicingRequest<FrozenVoicing>,
) => StoredVoicingResult<FrozenVoicing>;
type AutoOperation = (
  request: AutoVoicingRequest,
) => GeneratedVoicingResult;

type NegativeCompileProofs = readonly [
  // @ts-expect-error: every Auto request must explicitly select a T1 realization
  MustExtend<AutoVoicingRequest, QuartalRequestWithoutRealization>,
  // @ts-expect-error: Quartal cannot enter V0 without its injected context gate
  MustExtend<AutoVoicingRequest, QuartalRequestWithNullContext>,
  // @ts-expect-error: non-Quartal generation cannot smuggle in Quartal context
  MustExtend<AutoVoicingRequest, NonQuartalRequestWithContext>,
  // @ts-expect-error: Auto policies cannot use the stored-bypass request branch
  StoredVoicingRequest<AutoVoicing>,
  // @ts-expect-error: an arbitrary slash bass never fabricates a chord degree
  MustExtend<SlashBassCandidateVoice["degree"], ChordDegree>,
  // @ts-expect-error: a slash bass has no selected-realization source index
  MustExtend<SlashBassCandidateVoice["sourceDegreeIndex"], number>,
  // @ts-expect-error: generated candidates cannot contain only two voices
  MustExtend<VoicingCandidateVoices, VoiceTupleOfLength<2>>,
  // @ts-expect-error: generated candidates cannot contain eight pitches
  MustExtend<VoicingCandidatePitches, PitchTupleOfLength<8>>,
  // @ts-expect-error: Quartal context cannot contain only one degree
  MustExtend<QuartalDegreeSequence, DegreeTupleOfLength<1>>,
  // @ts-expect-error: Quartal context is bounded to seven degrees
  MustExtend<QuartalDegreeSequence, DegreeTupleOfLength<8>>,
  // @ts-expect-error: an authority template row is bounded to seven slots
  MustExtend<VoicingTemplateDegreeSequence, TemplateSlotTupleOfLength<8>>,
  // @ts-expect-error: adaptive rows cannot masquerade as fixed sequences
  MustExtend<AvailableVoicingFamilyTemplate, AdaptiveTemplateWithFixedSelectionMode>,
  // @ts-expect-error: Rootless authority rows permit external bass only
  MustExtend<VoicingFamilyTemplate, RootlessTemplateWithGeneratedBass>,
  // @ts-expect-error: Rootless authority rows are exactly four voices
  MustExtend<VoicingFamilyTemplate, RootlessThreeVoiceTemplate>,
  // @ts-expect-error: Rootless authority rows own exactly four degree slots
  MustExtend<VoicingFamilyTemplate, RootlessThreeSlotTemplate>,
  // @ts-expect-error: Drop-2 authority rows begin at four voices
  MustExtend<VoicingFamilyTemplate, Drop2ThreeVoiceTemplate>,
  // @ts-expect-error: V0 Quartal authority rows expose at most five policy voices
  MustExtend<VoicingFamilyTemplate, QuartalSixVoiceTemplate>,
  // @ts-expect-error: Quartal unavailability has its own closed reason
  MustExtend<VoicingFamilyTemplate, QuartalUnavailableWithQualityReason>,
  // @ts-expect-error: non-Quartal unavailability cannot claim a missing Quartal row
  MustExtend<VoicingFamilyTemplate, ShellUnavailableWithQuartalReason>,
  // @ts-expect-error: adaptive Balanced rows exist for every V0 quality class
  MustExtend<VoicingFamilyTemplate, BalancedUnavailableTemplate>,
  // @ts-expect-error: one constraint observation cannot name eight voices
  MustExtend<SatisfiedVoicingConstraint["voiceOrdinals"], TupleOfLength<number, 8>>,
  // @ts-expect-error: one constraint observation cannot name eight degrees
  MustExtend<SatisfiedVoicingConstraint["degrees"], DegreeTupleOfLength<8>>,
  // @ts-expect-error: one constraint observation cannot name eight MIDI values
  MustExtend<SatisfiedVoicingConstraint["midiValues"], TupleOfLength<SatisfiedVoicingConstraint["midiValues"][number], 8>>,
  // @ts-expect-error: successful candidates expose exactly the 16 constraint laws
  MustExtend<VoicingCandidateHardConstraints, TupleOfLength<SatisfiedVoicingConstraint, 17>>,
  // @ts-expect-error: successful constraint observations use fixed law order
  MustExtend<VoicingCandidateHardConstraints, MisorderedHardConstraints>,
  // @ts-expect-error: even Quartal has only nine causal evidence records
  MustExtend<VoicingCandidateEvidenceRecords, TupleOfLength<VoicingCandidateEvidence, 10>>,
  // @ts-expect-error: the ninth Quartal evidence record cannot appear elsewhere
  MustExtend<VoicingCandidate, NonQuartalCandidateWithNineEvidence>,
  // @ts-expect-error: causal evidence cannot swap classification and selection
  MustExtend<NonQuartalVoicingCandidateEvidenceRecords, MisorderedNonQuartalEvidence>,
  // @ts-expect-error: one evidence observation cannot name eight voices
  MustExtend<VoicingCandidateEvidence["voiceOrdinals"], TupleOfLength<number, 8>>,
  // @ts-expect-error: one evidence observation cannot name eight degrees
  MustExtend<VoicingCandidateEvidence["degrees"], DegreeTupleOfLength<8>>,
  // @ts-expect-error: a successful explanation has at least two degree voices
  MustExtend<VoicingCandidateExplanation["orderedDegrees"], DegreeTupleOfLength<1>>,
  // @ts-expect-error: explanation omissions cannot exceed the T1 degree cap
  MustExtend<VoicingCandidateExplanation["omittedDegrees"], DegreeTupleOfLength<17>>,
  // @ts-expect-error: an explanation cannot declare three doubled degrees
  MustExtend<VoicingCandidateExplanation["doubledDegrees"], DegreeTupleOfLength<3>>,
  // @ts-expect-error: an explanation cannot carry five Quartal adjacencies
  MustExtend<VoicingCandidateExplanation["quartalAdjacencies"], TupleOfLength<VoicingCandidateExplanation["quartalAdjacencies"][number], 5>>,
  // @ts-expect-error: a Drop-2 transform cannot contain eight voices
  MustExtend<Drop2TransformEvidence["closedSourceMidi"], TupleOfLength<Drop2TransformEvidence["closedSourceMidi"][number], 8>>,
  // @ts-expect-error: a Drop-2 transform starts at four voices
  MustExtend<Drop2TransformEvidence["closedSourceMidi"], TupleOfLength<Drop2TransformEvidence["closedSourceMidi"][number], 3>>,
  // @ts-expect-error: generated results retain at most 24 candidates
  MustExtend<GeneratedVoicingCandidates["candidates"], TupleOfLength<VoicingCandidate, 25>>,
  // @ts-expect-error: a successful generated result must contain a candidate
  MustExtend<GeneratedVoicingCandidates["candidates"], TupleOfLength<VoicingCandidate, 0>>,
  // @ts-expect-error: realization refusal must name at least one available ID
  MustExtend<RealizationUnavailableRefusal["available"], TupleOfLength<SemanticRealizationId, 0>>,
  // @ts-expect-error: T1 can expose at most four realization IDs
  MustExtend<RealizationUnavailableRefusal["available"], TupleOfLength<SemanticRealizationId, 5>>,
  // @ts-expect-error: a refusal cannot report more than 16 distinct observations
  MustExtend<VoicingConstraintsUnsatisfiedRefusal["constraints"], TupleOfLength<UnsatisfiedVoicingConstraint, 17>>,
  // @ts-expect-error: constraints-unsatisfied must report at least one constraint
  MustExtend<VoicingConstraintsUnsatisfiedRefusal["constraints"], TupleOfLength<UnsatisfiedVoicingConstraint, 0>>,
  // @ts-expect-error: realization refusal cannot claim family-unavailable termination
  MustExtend<TerminationFor<"voicing.realization_unavailable">, "family-unavailable">,
  // @ts-expect-error: stored bypass performs no raw candidate work
  MustExtend<StoredVoicingBypassEvidence["rawCandidatesProduced"], 1>,
  // @ts-expect-error: stored bypass performs no constraint-observation comparisons
  MustExtend<StoredVoicingBypassEvidence["constraintObservationComparisons"], 1>,
  // @ts-expect-error: stored bypass produces no constraint observations
  MustExtend<StoredVoicingBypassEvidence["constraintObservationsProduced"], 1>,
  // @ts-expect-error: stored bypass retains no constraint-observation records
  MustExtend<StoredVoicingBypassEvidence["peakConstraintObservationRecords"], 1>,
  // @ts-expect-error: V0 requests intentionally expose no previous voicing
  AutoVoicingRequest["previous"],
  // @ts-expect-error: V0 requests intentionally expose no next realization
  AutoVoicingRequest["next"],
];

const positiveTypeProofs = [
  assertType<HasKey<AutoVoicingRequest, "realizationId">>(),
  assertType<
    Equal<AutoVoicingRequest["realizationId"], SemanticRealizationId>
  >(),
  assertType<Equal<QuartalAutoVoicingRequest["quartalContext"], QuartalContext>>(),
  assertType<Equal<NonQuartalAutoVoicingRequest["quartalContext"], null>>(),
  assertType<
    Equal<QuartalAutoVoicingRequest["policy"]["family"], "quartal">
  >(),
  assertType<
    Not<
      "quartal" extends NonQuartalAutoVoicingRequest["policy"]["family"]
        ? true
        : false
    >
  >(),
  assertType<RealizeVoicing extends ManualOperation ? true : false>(),
  assertType<RealizeVoicing extends FrozenOperation ? true : false>(),
  assertType<RealizeVoicing extends AutoOperation ? true : false>(),
  assertType<
    Equal<StoredVoicingRequest<ManualVoicing>["kind"], "stored">
  >(),
  assertType<
    Equal<StoredVoicingRequest<FrozenVoicing>["kind"], "stored">
  >(),
  assertType<
    Equal<
      StoredVoicingResult<ManualVoicing>["value"]["kind"],
      "stored-bypass"
    >
  >(),
  assertType<
    Equal<
      StoredVoicingResult<FrozenVoicing>["value"]["voicing"],
      FrozenVoicing
    >
  >(),
  assertType<
    Equal<
      Extract<GeneratedVoicingResult, { ok: true }>["value"]["kind"],
      "generated"
    >
  >(),
  assertType<
    Equal<
      Extract<RealizeVoicingRequest, { kind: "stored" }>["voicing"],
      ManualVoicing | FrozenVoicing
    >
  >(),
  assertType<Equal<SlashBassCandidateVoice["degree"], null>>(),
  assertType<Equal<SlashBassCandidateVoice["sourceDegreeIndex"], null>>(),
  assertType<Equal<RealizationCandidateVoice["degree"], ChordDegree>>(),
  assertType<Equal<RealizationCandidateVoice["sourceDegreeIndex"], number>>(),
  assertType<Equal<DoublingCandidateVoice["degree"], ChordDegree>>(),
  assertType<Equal<DoublingCandidateVoice["sourceDegreeIndex"], number>>(),
  assertType<Equal<VoicingCandidateVoices["length"], 3 | 4 | 5 | 6 | 7>>(),
  assertType<Equal<VoicingCandidatePitches["length"], 3 | 4 | 5 | 6 | 7>>(),
  assertType<
    Equal<
      BalancedRegisterPolicy["slotOrderPolicy"],
      "selected-degree-register-weave-v1"
    >
  >(),
  assertType<
    Equal<
      OpenRegisterPolicy["slotOrderPolicy"],
      "selected-degree-register-weave-v1"
    >
  >(),
  assertType<Equal<QuartalDegreeSequence["length"], 2 | 3 | 4 | 5 | 6 | 7>>(),
  assertType<DegreeTupleOfLength<2> extends QuartalDegreeSequence ? true : false>(),
  assertType<DegreeTupleOfLength<7> extends QuartalDegreeSequence ? true : false>(),
  assertType<
    Not<DegreeTupleOfLength<1> extends QuartalDegreeSequence ? true : false>
  >(),
  assertType<
    Not<DegreeTupleOfLength<8> extends QuartalDegreeSequence ? true : false>
  >(),
  assertType<
    Equal<VoicingTemplateDegreeSequence["length"], 1 | 2 | 3 | 4 | 5 | 6 | 7>
  >(),
  assertType<
    TemplateSlotTupleOfLength<1> extends VoicingTemplateDegreeSequence
      ? true
      : false
  >(),
  assertType<
    TemplateSlotTupleOfLength<7> extends VoicingTemplateDegreeSequence
      ? true
      : false
  >(),
  assertType<
    Not<
      TemplateSlotTupleOfLength<8> extends VoicingTemplateDegreeSequence
        ? true
        : false
    >
  >(),
  assertType<
    Not<VoiceTupleOfLength<2> extends VoicingCandidateVoices ? true : false>
  >(),
  assertType<
    Not<PitchTupleOfLength<8> extends VoicingCandidatePitches ? true : false>
  >(),
  assertType<
    Equal<
      TerminationFor<"voicing.realization_unavailable">,
      "realization-unavailable"
    >
  >(),
  assertType<
    Equal<
      TerminationFor<"voicing.quartal_context_unexpected">,
      "quartal-context-unexpected"
    >
  >(),
  assertType<
    Equal<
      TerminationFor<"voicing.quartal_context_required">,
      "quartal-context-required"
    >
  >(),
  assertType<
    Equal<
      TerminationFor<"voicing.quartal_context_invalid">,
      "quartal-context-invalid"
    >
  >(),
  assertType<
    Equal<
      TerminationFor<"voicing.family_unavailable">,
      "family-unavailable"
    >
  >(),
  assertType<
    Equal<
      TerminationFor<"voicing.constraints_unsatisfied">,
      "constraints-unsatisfied"
    >
  >(),
  assertType<
    Equal<
      TerminationFor<"limit.voicing_work_exceeded">,
      "work-limit-exceeded"
    >
  >(),
  assertType<Equal<keyof StoredVoicingBypassEvidence, keyof VoicingWorkEvidence>>(),
  assertType<Equal<NonzeroBypassCounter, never>>(),
  assertType<
    Equal<StoredVoicingBypassEvidence["termination"], "complete-bypass">
  >(),
  assertType<Not<HasKey<AutoVoicingRequest, "previous">>>(),
  assertType<Not<HasKey<AutoVoicingRequest, "next">>>(),
  assertType<Not<HasKey<AutoVoicingRequest, "eventId">>>(),
  assertType<Not<HasKey<AutoVoicingRequest, "documentRevision">>>(),
  assertType<Not<HasKey<AutoVoicingRequest, "voiceIds">>>(),
  assertType<Not<HasKey<AutoVoicingRequest, "wallTimeBudget">>>(),
  assertType<Not<HasKey<AutoVoicingRequest, "uiSelection">>>(),
  assertType<Not<HasKey<AutoVoicingRequest, "audioState">>>(),
  assertType<Not<HasKey<AutoVoicingRequest, "storageIdentity">>>(),
  assertType<Not<HasKey<VoicingCandidateVoice, "voiceId">>>(),
  assertType<
    Equal<
      RealizationRoleVoicingFamilyTemplate["selectionMode"],
      "realization-roles"
    >
  >(),
  assertType<
    Equal<
      RealizationRoleVoicingFamilyTemplate["family"],
      "balanced" | "open" | "drop2"
    >
  >(),
  assertType<
    Not<HasKey<RealizationRoleVoicingFamilyTemplate, "degreeSequence">>
  >(),
  assertType<
    Equal<
      FixedDegreeSequenceVoicingFamilyTemplate["selectionMode"],
      "fixed-degree-sequence"
    >
  >(),
  assertType<
    Equal<
      FixedDegreeSequenceVoicingFamilyTemplate["family"],
      "shell" | "rootless-a" | "rootless-b"
    >
  >(),
  assertType<
    HasKey<FixedDegreeSequenceVoicingFamilyTemplate, "degreeSequence">
  >(),
  assertType<
    Equal<
      ContextGatedVoicingFamilyTemplate["selectionMode"],
      "quartal-context-sequence"
    >
  >(),
  assertType<
    Equal<ContextGatedVoicingFamilyTemplate["family"], "quartal">
  >(),
  assertType<
    Equal<RootlessATemplate["permittedBassPolicies"], readonly ["external"]>
  >(),
  assertType<Equal<RootlessATemplate["minimumVoiceCount"], 4>>(),
  assertType<Equal<RootlessATemplate["permittedVoiceCounts"], readonly [4]>>(),
  assertType<Equal<RootlessATemplate["degreeSequence"]["length"], 4>>(),
  assertType<Equal<Drop2Template["minimumVoiceCount"], 4>>(),
  assertType<
    Equal<Drop2Template["permittedVoiceCounts"], readonly [4, 5, 6, 7]>
  >(),
  assertType<Equal<ContextGatedVoicingFamilyTemplate["minimumVoiceCount"], 3>>(),
  assertType<
    Equal<
      ContextGatedVoicingFamilyTemplate["permittedVoiceCounts"],
      readonly [3, 4, 5] | readonly [3, 4]
    >
  >(),
  assertType<
    Not<HasKey<ContextGatedVoicingFamilyTemplate, "degreeSequence">>
  >(),
  assertType<
    Equal<
      AvailableVoicingFamilyTemplate["selectionMode"],
      "realization-roles" | "fixed-degree-sequence"
    >
  >(),
  assertType<
    Equal<
      VoicingFamilyTemplate["availability"],
      "available" | "context-gated" | "unavailable"
    >
  >(),
  assertType<HasKey<AvailableVoicingFamilyTemplate, "registerPolicyId">>(),
  assertType<
    Not<HasKey<UnavailableVoicingFamilyTemplate, "registerPolicyId">>
  >(),
  assertType<
    Not<HasKey<UnavailableVoicingFamilyTemplate, "selectionMode">>
  >(),
  assertType<
    Equal<
      Extract<
        RealizationRoleVoicingFamilyTemplate,
        { family: "balanced" }
      >["registerPolicyId"],
      "balanced-register-v1"
    >
  >(),
  assertType<
    Equal<
      Extract<
        FixedDegreeSequenceVoicingFamilyTemplate,
        { family: "shell" }
      >["registerPolicyId"],
      "fixed-template-register-v1"
    >
  >(),
  assertType<
    Equal<
      ContextGatedVoicingFamilyTemplate["registerPolicyId"],
      "quartal-register-v1"
    >
  >(),
  assertType<Equal<Drop2RegisterPolicy["minimumSpanSemitones"], 12>>(),
  assertType<Equal<Drop2RegisterPolicy["maximumSpanSemitones"], 36>>(),
  assertType<Equal<Drop2RegisterPolicy["minimumWideGapSemitones"], 7>>(),
  assertType<
    Equal<Drop2RegisterPolicy["minimumWideGapVoiceCounts"], readonly [4, 5]>
  >(),
  assertType<
    Equal<Drop2RegisterPolicy["closedSourceMaximumSpanSemitones"], 11>
  >(),
  assertType<
    Equal<
      Drop2RegisterPolicy["structuralTransform"]["sourceVoiceSelection"],
      "second-from-top"
    >
  >(),
  assertType<
    Equal<
      Drop2RegisterPolicy["structuralTransform"]["lowerBySemitones"],
      12
    >
  >(),
  assertType<Equal<PublicQuartalDegreeSequence, QuartalDegreeSequence>>(),
  assertType<
    Equal<PublicVoicingTemplateDegreeSequence, VoicingTemplateDegreeSequence>
  >(),
  assertType<
    Equal<PublicVoicingFamilyRegisterPolicy, VoicingFamilyRegisterPolicy>
  >(),
  assertType<Equal<VoicingCandidateHardConstraints["length"], 16>>(),
  assertType<
    Equal<SatisfiedVoicingConstraint["voiceOrdinals"]["length"], ZeroThroughSeven>
  >(),
  assertType<
    Equal<SatisfiedVoicingConstraint["degrees"]["length"], ZeroThroughSeven>
  >(),
  assertType<
    Equal<SatisfiedVoicingConstraint["midiValues"]["length"], ZeroThroughSeven>
  >(),
  assertType<Equal<VoicingCandidateEvidenceRecords["length"], 8 | 9>>(),
  assertType<
    Equal<VoicingCandidateEvidence["voiceOrdinals"]["length"], ZeroThroughSeven>
  >(),
  assertType<
    Equal<VoicingCandidateEvidence["degrees"]["length"], ZeroThroughSeven>
  >(),
  assertType<
    Equal<
      Extract<VoicingCandidate, { family: "quartal" }>["evidence"]["length"],
      9
    >
  >(),
  assertType<
    Equal<
      Exclude<VoicingCandidate, { family: "quartal" }>["evidence"]["length"],
      8
    >
  >(),
  assertType<
    Equal<RealizationUnavailableRefusal["available"]["length"], 1 | 2 | 3 | 4>
  >(),
  assertType<
    Equal<VoicingCandidateExplanation["doubledDegrees"]["length"], 0 | 1 | 2>
  >(),
  assertType<
    Equal<
      VoicingCandidateExplanation["quartalAdjacencies"]["length"],
      0 | 1 | 2 | 3 | 4
    >
  >(),
  assertType<
    Equal<GeneratedVoicingCandidates["candidates"]["length"], OneThroughTwentyFour>
  >(),
  assertType<
    Equal<
      VoicingConstraintsUnsatisfiedRefusal["constraints"]["length"],
      1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
    >
  >(),
  assertType<Equal<NegativeCompileProofs["length"], 49>>(),
] as const;

describe("V0 public request and result type contract", () => {
  test("rejects impossible request, bypass, voice, cardinality, and evidence states", () => {
    expect(positiveTypeProofs.every(Boolean)).toBe(true);
  });

  test("keeps the operation synchronous and isolated from V1 context", async () => {
    const source = await Bun.file(
      new URL(
        "../../src/theory/voicing-candidates-contract.ts",
        import.meta.url,
      ),
    ).text();
    const importedModules = [...source.matchAll(/from\s+"([^"]+)"/gu)]
      .map((match) => match[1]);

    expect(importedModules).toEqual(["../domain", "./resolution-contract"]);
    expect(VOICING_OPERATION_NAMES).toEqual(["realizeVoicing"]);
    expect(VOICING_REFUSAL_CODES).toEqual([
      "voicing.realization_unavailable",
      "voicing.quartal_context_unexpected",
      "voicing.quartal_context_required",
      "voicing.quartal_context_invalid",
      "voicing.family_unavailable",
      "voicing.constraints_unsatisfied",
      "limit.voicing_work_exceeded",
    ]);
    expect(VOICING_TERMINATIONS).toEqual([
      "complete-generated",
      "complete-bypass",
      "realization-unavailable",
      "quartal-context-unexpected",
      "quartal-context-required",
      "quartal-context-invalid",
      "family-unavailable",
      "constraints-unsatisfied",
      "work-limit-exceeded",
    ]);
    expect(source).toContain("realizationId: SemanticRealizationId");
    expect(source).toContain("quartalContext: QuartalContext");
    expect(source).toContain("quartalContext: null");
    expect(source).toContain('kind: "stored-bypass"');
    expect(source).not.toMatch(
      /\b(?:previous|next|eventId|documentRevision|voiceIds|wallTimeBudget|uiSelection|audioState|storageIdentity)\??\s*:/u,
    );
    expect(source).not.toMatch(/\bvoiceId\s*:/u);
    expect(source).not.toContain("VoiceLeadingCost");
    expect(source).not.toContain("Promise<");
    expect(source).not.toMatch(/\basync\s+/u);
  });

  test("re-exports bounded register and candidate-payload authority", () => {
    expect(PUBLIC_VOICING_ENGINE_ID).toBe(VOICING_ENGINE_ID);
    expect(PUBLIC_VOICING_FAMILY_REGISTER_POLICY_IDS).toBe(
      VOICING_FAMILY_REGISTER_POLICY_IDS,
    );
    expect(PUBLIC_VOICING_IDENTIFIER_LIMITS).toBe(VOICING_IDENTIFIER_LIMITS);
    expect(PUBLIC_VOICING_CANDIDATE_PAYLOAD_LIMITS).toBe(
      VOICING_CANDIDATE_PAYLOAD_LIMITS,
    );
    expect(PUBLIC_VOICING_TRACKED_RECORD_ACCOUNTING).toBe(
      VOICING_TRACKED_RECORD_ACCOUNTING,
    );
    expect(PUBLIC_VOICING_TRACKED_RECORD_POPULATION_LIMITS).toBe(
      VOICING_TRACKED_RECORD_POPULATION_LIMITS,
    );
    expect(VOICING_FAMILY_REGISTER_POLICY_IDS).toEqual([
      "balanced-register-v1",
      "fixed-template-register-v1",
      "open-register-v1",
      "drop2-register-v1",
      "quartal-register-v1",
    ]);
    expect(VOICING_REGISTER_SLOT_ORDER_POLICIES).toEqual([
      "selected-degree-register-weave-v1",
      "template-low-to-high",
      "closed-source-low-to-high",
      "quartal-context-low-to-high",
    ]);
    expect(VOICING_REGISTER_STRUCTURAL_TRANSFORMS).toEqual(["drop2"]);
    expect(VOICING_REGISTER_SOURCE_VOICE_SELECTIONS).toEqual([
      "second-from-top",
    ]);
    expect(VOICING_REGISTER_OUTPUT_ORDERS).toEqual(["midi-ascending"]);
    expect(VOICING_TEMPLATE_SELECTION_MODES).toEqual([
      "realization-roles",
      "fixed-degree-sequence",
      "quartal-context-sequence",
    ]);
    expect(VOICING_REALIZATION_DEGREE_ROLE_SOURCES).toEqual([
      "selected-realization-required",
      "selected-realization-optional",
      "selected-realization-guide-tone",
    ]);
    expect(MIN_VOICING_EVIDENCE_ID_CODE_POINTS).toBe(1);
    expect(MAX_VOICING_EVIDENCE_ID_CODE_POINTS).toBe(256);
    expect(MAX_VOICING_EVIDENCE_ID_UTF8_BYTES).toBe(512);
    expect(MAX_VOICING_CONSTRAINT_OBSERVATIONS_PER_CANDIDATE).toBe(16);
    expect(MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS).toBe(16);
    expect(MAX_VOICING_CONSTRAINT_OBSERVATION_COMPARISONS).toBe(2_228_224);
    expect(MAX_VOICING_EVIDENCE_RECORDS_PER_CANDIDATE).toBe(9);
    expect(MAX_VOICING_EXPLANATION_OMITTED_DEGREES).toBe(16);
    expect(MAX_VOICING_RETAINED_CANDIDATES).toBe(24);
    expect(PUBLIC_VOICING_CONSTRAINT_OBSERVATION_POLICY_ID).toBe(
      VOICING_CONSTRAINT_OBSERVATION_POLICY_ID,
    );
    expect({
      policyId: VOICING_CONSTRAINT_OBSERVATION_POLICY_ID,
      policyVersion: VOICING_CONSTRAINT_OBSERVATION_POLICY_VERSION,
    }).toEqual({
      policyId: "changes.voicing-constraint-observation-collection",
      policyVersion: 1,
    });
    expect(VOICING_WORK_COUNTER_NAMES).toHaveLength(16);
    expect(VOICING_MEMORY_COUNTER_NAMES).toHaveLength(8);
    expect(VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_ID).toBe(
      "changes.voicing-tracked-record-accounting",
    );
    expect(VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_VERSION).toBe(2);
    expect(VOICING_IDENTIFIER_LIMITS).toEqual({
      minimumCodePoints: 1,
      maximumCodePoints: 256,
      maximumUtf8Bytes: 512,
      codePointMeasurement: "Array.from(value).length",
      utf8ByteMeasurement: "new TextEncoder().encode(value).byteLength",
      surfaces: [
        "quartalContext.evidenceId",
        "candidateEvidence.sourceId",
      ],
      quartalContextInvalidReason: "evidence-id-invalid",
      candidateEvidenceMayEmitInvalidSourceId: false,
    });
    expect(VOICING_CANDIDATE_PAYLOAD_LIMITS).toEqual({
      hardConstraintObservations: 16,
      hardConstraintCodeOrder: VOICING_CONSTRAINT_CODES,
      nonQuartalEvidenceRecords: 8,
      quartalEvidenceRecords: 9,
      evidenceCodeOrder: VOICING_EVIDENCE_CODES,
      constraintObservationVoiceOrdinals: 7,
      constraintObservationDegrees: 7,
      constraintObservationMidiValues: 7,
      evidenceObservationVoiceOrdinals: 7,
      evidenceObservationDegrees: 7,
      explanationOrderedDegreesMinimum: 2,
      explanationOrderedDegreesMaximum: 7,
      explanationOmittedDegreesMaximum: 16,
      explanationDoubledDegreesMaximum: 2,
      explanationQuartalAdjacenciesMaximum: 4,
      drop2TransformVoicesMinimum: 4,
      drop2TransformVoicesMaximum: 7,
      drop2SourceAndTransformedLengthsEqual: true,
      resultCandidatesMinimum: 1,
      resultCandidatesMaximum: 24,
      availableRealizationIdsMinimum: 1,
      availableRealizationIdsMaximum: 4,
      refusalConstraintsMinimum: 1,
      refusalConstraintsMaximum: 16,
    });
    expect(VOICING_TRACKED_RECORD_POPULATIONS).toEqual([
      "selected-realization-degree",
      "template-row",
      "register-placement",
      "search-state",
      "raw-candidate",
      "raw-voice",
      "retained-candidate",
      "output-voice",
      "constraint-observation",
    ]);
    expect(VOICING_TRACKED_RECORD_POPULATION_LIMITS).toEqual({
      "selected-realization-degree": 16,
      "template-row": 112,
      "register-placement": 176,
      "search-state": 512,
      "raw-candidate": 96,
      "raw-voice": 672,
      "retained-candidate": 24,
      "output-voice": 168,
      "constraint-observation": 16,
    });
    expect(VOICING_TRACKED_RECORD_ACCOUNTING).toEqual({
      policyId: VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_ID,
      policyVersion: VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_VERSION,
      populationOrder: VOICING_TRACKED_RECORD_POPULATIONS,
      populationLimits: VOICING_TRACKED_RECORD_POPULATION_LIMITS,
      aggregateMaximum: 1_792,
      sumOfPopulationLimits: 1_792,
      diagnosticPayloadOwnedByCandidateRecord: true,
      constraintObservationAccumulatorPopulation: "constraint-observation",
      independentDiagnosticSideCollectionsAllowed: false,
      ownershipLaw:
        "Successful constraint, evidence, score, and explanation projections are payload of their owning candidate. A no-result search may retain only the one declared operation-local constraint-observation population, transfer it into the refusal, and retain no parallel diagnostic side collection.",
    });
    expect(
      Object.values(VOICING_TRACKED_RECORD_POPULATION_LIMITS).reduce(
        (total, limit) => total + limit,
        0,
      ),
    ).toBe(VOICING_TRACKED_RECORD_ACCOUNTING.aggregateMaximum);
  });
});
