import {
  AUTO_VOICING_FAMILIES,
  type AutoBassPolicy,
  type AutoVoiceCount,
  type AutoVoicing,
  type AutoVoicingFamily,
  type ChordDegree,
  type FrozenVoicing,
  type ManualVoicing,
  type MidiPitch,
  type PathRefusal,
  type SpelledPitch,
  type SpelledPitchClass,
} from "../domain";
import {
  MAX_THEORY_DEGREES_PER_REALIZATION,
  MAX_THEORY_REALIZATIONS,
  type ParsedChordFormulaRuleId,
  type ParsedResolvedChord,
  type SemanticRealizationId,
} from "./resolution-contract";

/** Stable public identities for the first deterministic voicing package. */
export const VOICING_CANDIDATES_CONTRACT_SCHEMA =
  "changes.theory.voicing-candidates-contract.v1";
export const VOICING_REQUEST_SCHEMA =
  "changes.theory.voicing-request.v1";
export const VOICING_RESULT_SCHEMA =
  "changes.theory.voicing-result.v1";
export const VOICING_CANDIDATE_SCHEMA =
  "changes.theory.voicing-candidate.v1";
export const VOICING_TEMPLATE_SCHEMA =
  "changes.theory.voicing-family-template.v1";
export const QUARTAL_CONTEXT_SCHEMA =
  "changes.theory.quartal-context.v1";

export const VOICING_ENGINE_ID = "changes.voicing-candidates";
export const VOICING_ENGINE_VERSION = 1;
export const VOICING_ENGINE_VERSION_TAG =
  "changes.voicing-candidates.v1";
export const VOICING_TEMPLATE_TABLE_ID =
  "changes.voicing-family-templates";
export const VOICING_TEMPLATE_TABLE_VERSION = 1;
export const VOICING_LOCAL_SCORE_POLICY_ID =
  "changes.voicing-local-score";
export const VOICING_LOCAL_SCORE_POLICY_VERSION = 1;
export const VOICING_LOW_REGISTER_POLICY_ID =
  "changes.voicing-low-register-spacing";
export const VOICING_LOW_REGISTER_POLICY_VERSION = 1;
export const QUARTAL_CONTEXT_POLICY_ID =
  "changes.quartal-context-gate";
export const QUARTAL_CONTEXT_POLICY_VERSION = 1;
export const MIN_VOICING_EVIDENCE_ID_CODE_POINTS = 1;
export const MAX_VOICING_EVIDENCE_ID_CODE_POINTS = 256;
export const MAX_VOICING_EVIDENCE_ID_UTF8_BYTES = 512;
export const VOICING_BOUNDED_IDENTIFIER_SURFACES = Object.freeze([
  "quartalContext.evidenceId",
  "candidateEvidence.sourceId",
] as const);
export const VOICING_IDENTIFIER_LIMITS = Object.freeze({
  minimumCodePoints: MIN_VOICING_EVIDENCE_ID_CODE_POINTS,
  maximumCodePoints: MAX_VOICING_EVIDENCE_ID_CODE_POINTS,
  maximumUtf8Bytes: MAX_VOICING_EVIDENCE_ID_UTF8_BYTES,
  codePointMeasurement: "Array.from(value).length",
  utf8ByteMeasurement: "new TextEncoder().encode(value).byteLength",
  surfaces: VOICING_BOUNDED_IDENTIFIER_SURFACES,
  quartalContextInvalidReason: "evidence-id-invalid",
  candidateEvidenceMayEmitInvalidSourceId: false,
} as const);

/** V0 reuses the F1 family vocabulary rather than defining aliases by hand. */
export const VOICING_FAMILIES = Object.freeze([
  ...AUTO_VOICING_FAMILIES,
] as const);

/**
 * The sixteen V0 template classes. Extension formula rules fold into their
 * seventh-family class; sus2 and sus4 triads share the suspended-triad class
 * while the exact source triad and template slots preserve their distinction.
 */
export const VOICING_QUALITY_CLASSES = Object.freeze([
  "major-triad",
  "minor-triad",
  "diminished-triad",
  "augmented-triad",
  "suspended-triad",
  "power-triad",
  "major-sixth",
  "minor-sixth",
  "major-seventh",
  "dominant-seventh",
  "minor-seventh",
  "minor-major-seventh",
  "half-diminished-seventh",
  "diminished-seventh",
  "augmented-major-seventh",
  "suspended-dominant",
] as const);

export type VoicingQualityClass =
  (typeof VOICING_QUALITY_CLASSES)[number];

type ReadonlyTupleOfLength<
  Value,
  Length extends number,
  Accumulator extends readonly Value[] = readonly [],
> = Accumulator["length"] extends Length
  ? Accumulator
  : ReadonlyTupleOfLength<
      Value,
      Length,
      readonly [...Accumulator, Value]
    >;

type ReadonlyTupleUpTo<
  Value,
  Maximum extends number,
  Accumulator extends readonly Value[] = readonly [],
> = Accumulator["length"] extends Maximum
  ? Accumulator
  : Accumulator |
      ReadonlyTupleUpTo<
        Value,
        Maximum,
        readonly [...Accumulator, Value]
      >;

type NonEmptyReadonlyTupleUpTo<Value, Maximum extends number> = Exclude<
  ReadonlyTupleUpTo<Value, Maximum>,
  readonly []
>;

export const VOICING_TEMPLATE_AVAILABILITIES = Object.freeze([
  "available",
  "context-gated",
  "unavailable",
] as const);
export type VoicingTemplateAvailability =
  (typeof VOICING_TEMPLATE_AVAILABILITIES)[number];

export const VOICING_TEMPLATE_UNAVAILABLE_REASONS = Object.freeze([
  "quality-family-unsupported",
  "quartal-row-undeclared",
] as const);
export type VoicingTemplateUnavailableReason =
  (typeof VOICING_TEMPLATE_UNAVAILABLE_REASONS)[number];

export const VOICING_TEMPLATE_DEGREE_ROLES = Object.freeze([
  "identity",
  "guide",
  "color",
  "support",
] as const);
export type VoicingTemplateDegreeRole =
  (typeof VOICING_TEMPLATE_DEGREE_ROLES)[number];

export type VoicingTemplateId = string;

/**
 * One ordered degree/register slot. Register lifts encode the C-reference
 * directed interval from the preceding slot; runtime placement preserves that
 * interval through spelled transposition. The versioned authority table, not
 * production search, decides which degrees may be omitted or doubled.
 */
export type VoicingTemplateDegreeSlot = Readonly<{
  degree: ChordDegree;
  role: VoicingTemplateDegreeRole;
  required: boolean;
  guideTone: boolean;
  minimumOctaveLiftFromPrevious: 0 | 1;
  preferredOctaveLiftFromPrevious: 0 | 1 | 2;
  mayOmit: boolean;
  mayDouble: boolean;
}>;

export const MAX_VOICING_TEMPLATE_DEGREE_SLOTS = 7;

/**
 * A fixed authority sequence contains one through seven ordered slots. Keeping
 * the upper bound in the public type makes the 112-by-7 work cap structural
 * rather than a convention that authority-data validation must recover later.
 */
export type VoicingTemplateDegreeSequence =
  | readonly [VoicingTemplateDegreeSlot]
  | readonly [VoicingTemplateDegreeSlot, VoicingTemplateDegreeSlot]
  | readonly [
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
    ]
  | readonly [
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
    ]
  | readonly [
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
    ]
  | readonly [
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
    ]
  | readonly [
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
      VoicingTemplateDegreeSlot,
    ];

export const VOICING_TEMPLATE_SELECTION_MODES = Object.freeze([
  "realization-roles",
  "fixed-degree-sequence",
  "quartal-context-sequence",
] as const);
export type VoicingTemplateSelectionMode =
  (typeof VOICING_TEMPLATE_SELECTION_MODES)[number];

export const VOICING_REALIZATION_DEGREE_ROLE_SOURCES = Object.freeze([
  "selected-realization-required",
  "selected-realization-optional",
  "selected-realization-guide-tone",
] as const);
export type VoicingRealizationDegreeRoleSource =
  (typeof VOICING_REALIZATION_DEGREE_ROLE_SOURCES)[number];

export const VOICING_REALIZATION_ROLE_SELECTION_POLICY_ID =
  "changes.voicing-realization-role-selection";
export const VOICING_REALIZATION_ROLE_SELECTION_POLICY_VERSION = 1;

/**
 * Adaptive families select exact members from the requested T1 realization.
 * Its versioned policy owns optional-member and permitted-doubling priorities;
 * a folded quality row therefore never pretends to own one exact degree list.
 */
export type RealizationRoleTemplateSelection = Readonly<{
  selectionMode: "realization-roles";
  requiredDegreeSource: "selected-realization-required";
  optionalDegreeSource: "selected-realization-optional";
  guideToneSource: "selected-realization-guide-tone";
  selectionPolicyId: typeof VOICING_REALIZATION_ROLE_SELECTION_POLICY_ID;
  selectionPolicyVersion: typeof VOICING_REALIZATION_ROLE_SELECTION_POLICY_VERSION;
  maximumSelectedDegreeSlots: typeof MAX_VOICING_TEMPLATE_DEGREE_SLOTS;
}>;

/** Shell and Rootless rows alone own an exact static degree sequence. */
export type FixedDegreeSequenceTemplateSelection = Readonly<{
  selectionMode: "fixed-degree-sequence";
  degreeSequence: VoicingTemplateDegreeSequence;
}>;

/** Quartal ordering belongs to the correlated request context, never the row. */
export type QuartalContextSequenceTemplateSelection = Readonly<{
  selectionMode: "quartal-context-sequence";
  degreeSequenceSource: "quartal-context";
  minimumSelectedDegreeSlots: 2;
  maximumSelectedDegreeSlots: typeof MAX_VOICING_TEMPLATE_DEGREE_SLOTS;
}>;

/** Stable identities for the five versioned authority register policies. */
export const VOICING_FAMILY_REGISTER_POLICY_SCHEMA =
  "changes.theory.voicing-family-register-policy.v1";
export const VOICING_FAMILY_REGISTER_POLICY_VERSION = 1;
export const VOICING_FAMILY_REGISTER_POLICY_IDS = Object.freeze([
  "balanced-register-v1",
  "fixed-template-register-v1",
  "open-register-v1",
  "drop2-register-v1",
  "quartal-register-v1",
] as const);
export type VoicingFamilyRegisterPolicyId =
  (typeof VOICING_FAMILY_REGISTER_POLICY_IDS)[number];

export const VOICING_REGISTER_SLOT_ORDER_POLICIES = Object.freeze([
  "selected-degree-register-weave-v1",
  "template-low-to-high",
  "closed-source-low-to-high",
  "quartal-context-low-to-high",
] as const);
export type VoicingRegisterSlotOrderPolicy =
  (typeof VOICING_REGISTER_SLOT_ORDER_POLICIES)[number];

export const VOICING_REGISTER_STRUCTURAL_TRANSFORMS = Object.freeze([
  "drop2",
] as const);
export type VoicingRegisterStructuralTransformKind =
  (typeof VOICING_REGISTER_STRUCTURAL_TRANSFORMS)[number];

export const VOICING_REGISTER_SOURCE_VOICE_SELECTIONS = Object.freeze([
  "second-from-top",
] as const);
export type VoicingRegisterSourceVoiceSelection =
  (typeof VOICING_REGISTER_SOURCE_VOICE_SELECTIONS)[number];

export const VOICING_REGISTER_OUTPUT_ORDERS = Object.freeze([
  "midi-ascending",
] as const);
export type VoicingRegisterOutputOrder =
  (typeof VOICING_REGISTER_OUTPUT_ORDERS)[number];

/** Drop-2 is one exact structural transform, not a label for a wide voicing. */
export type Drop2RegisterStructuralTransform = Readonly<{
  kind: VoicingRegisterStructuralTransformKind;
  sourceVoiceSelection: VoicingRegisterSourceVoiceSelection;
  lowerBySemitones: 12;
  outputOrder: VoicingRegisterOutputOrder;
}>;

type VoicingFamilyRegisterPolicyIdentity<
  Id extends VoicingFamilyRegisterPolicyId,
  Families extends readonly [AutoVoicingFamily, ...AutoVoicingFamily[]],
> = Readonly<{
  schema: typeof VOICING_FAMILY_REGISTER_POLICY_SCHEMA;
  id: Id;
  version: typeof VOICING_FAMILY_REGISTER_POLICY_VERSION;
  families: Families;
}>;

export type BalancedRegisterPolicy = VoicingFamilyRegisterPolicyIdentity<
  "balanced-register-v1",
  readonly ["balanced"]
> &
  Readonly<{
    slotOrderPolicy: "selected-degree-register-weave-v1";
    minimumSpanSemitones: 0;
    maximumSpanSemitones: 36;
    targetSpanSemitones: 12;
    minimumWideGapSemitones: null;
    minimumWideGapVoiceCounts: null;
    closedSourceMaximumSpanSemitones: null;
    structuralTransform: null;
  }>;

export type FixedTemplateRegisterPolicy =
  VoicingFamilyRegisterPolicyIdentity<
    "fixed-template-register-v1",
    readonly ["shell", "rootless-a", "rootless-b"]
  > &
    Readonly<{
      slotOrderPolicy: "template-low-to-high";
      minimumSpanSemitones: 0;
      maximumSpanSemitones: 24;
      targetSpanSemitones: 12;
      minimumWideGapSemitones: null;
      minimumWideGapVoiceCounts: null;
      closedSourceMaximumSpanSemitones: null;
      structuralTransform: null;
    }>;

export type OpenRegisterPolicy = VoicingFamilyRegisterPolicyIdentity<
  "open-register-v1",
  readonly ["open"]
> &
  Readonly<{
    slotOrderPolicy: "selected-degree-register-weave-v1";
    minimumSpanSemitones: 12;
    maximumSpanSemitones: 36;
    targetSpanSemitones: 19;
    minimumWideGapSemitones: 7;
    minimumWideGapVoiceCounts: readonly [3, 4, 5, 6, 7];
    closedSourceMaximumSpanSemitones: null;
    structuralTransform: null;
  }>;

export type Drop2RegisterPolicy = VoicingFamilyRegisterPolicyIdentity<
  "drop2-register-v1",
  readonly ["drop2"]
> &
  Readonly<{
    slotOrderPolicy: "closed-source-low-to-high";
    minimumSpanSemitones: 12;
    maximumSpanSemitones: 36;
    targetSpanSemitones: 19;
    minimumWideGapSemitones: 7;
    minimumWideGapVoiceCounts: readonly [4, 5];
    closedSourceMaximumSpanSemitones: 11;
    structuralTransform: Drop2RegisterStructuralTransform;
  }>;

export type QuartalRegisterPolicy = VoicingFamilyRegisterPolicyIdentity<
  "quartal-register-v1",
  readonly ["quartal"]
> &
  Readonly<{
    slotOrderPolicy: "quartal-context-low-to-high";
    minimumSpanSemitones: 10;
    maximumSpanSemitones: 24;
    targetSpanSemitones: 15;
    minimumWideGapSemitones: null;
    minimumWideGapVoiceCounts: null;
    closedSourceMaximumSpanSemitones: null;
    structuralTransform: null;
  }>;

export type VoicingFamilyRegisterPolicy =
  | BalancedRegisterPolicy
  | FixedTemplateRegisterPolicy
  | OpenRegisterPolicy
  | Drop2RegisterPolicy
  | QuartalRegisterPolicy;

/** A template binds one family to its exact register policy and target span. */
export type VoicingFamilyRegisterPolicyBinding =
  | Readonly<{
      family: "balanced";
      registerPolicyId: "balanced-register-v1";
      registerPolicyVersion: typeof VOICING_FAMILY_REGISTER_POLICY_VERSION;
      targetSpanSemitones: 12;
    }>
  | Readonly<{
      family: "shell";
      registerPolicyId: "fixed-template-register-v1";
      registerPolicyVersion: typeof VOICING_FAMILY_REGISTER_POLICY_VERSION;
      targetSpanSemitones: 12;
    }>
  | Readonly<{
      family: "rootless-a";
      registerPolicyId: "fixed-template-register-v1";
      registerPolicyVersion: typeof VOICING_FAMILY_REGISTER_POLICY_VERSION;
      targetSpanSemitones: 12;
    }>
  | Readonly<{
      family: "rootless-b";
      registerPolicyId: "fixed-template-register-v1";
      registerPolicyVersion: typeof VOICING_FAMILY_REGISTER_POLICY_VERSION;
      targetSpanSemitones: 12;
    }>
  | Readonly<{
      family: "open";
      registerPolicyId: "open-register-v1";
      registerPolicyVersion: typeof VOICING_FAMILY_REGISTER_POLICY_VERSION;
      targetSpanSemitones: 19;
    }>
  | Readonly<{
      family: "drop2";
      registerPolicyId: "drop2-register-v1";
      registerPolicyVersion: typeof VOICING_FAMILY_REGISTER_POLICY_VERSION;
      targetSpanSemitones: 19;
    }>
  | Readonly<{
      family: "quartal";
      registerPolicyId: "quartal-register-v1";
      registerPolicyVersion: typeof VOICING_FAMILY_REGISTER_POLICY_VERSION;
      targetSpanSemitones: 15;
    }>;

type AvailableTemplateCardinality<
  MinimumVoiceCount extends AutoVoiceCount,
  PermittedVoiceCounts extends readonly AutoVoiceCount[],
  PermittedBassPolicies extends readonly AutoBassPolicy[],
> = Readonly<{
  minimumVoiceCount: MinimumVoiceCount;
  permittedVoiceCounts: PermittedVoiceCounts;
  permittedBassPolicies: PermittedBassPolicies;
}>;

type AllAutoBassPolicies = readonly ["generated", "external", "none"];
type AllAutoVoiceCounts = readonly [3, 4, 5, 6, 7];
type Drop2AutoVoiceCounts = readonly [4, 5, 6, 7];
type RootlessAutoVoiceCounts = readonly [4];
type QuartalAutoVoiceCounts = readonly [3, 4, 5] | readonly [3, 4];

type FixedDegreeSequenceOfLength<Length extends 3 | 4> = Extract<
  VoicingTemplateDegreeSequence,
  Readonly<{ length: Length }>
>;

type VoicingTemplateIdentity = Readonly<{
  schema: typeof VOICING_TEMPLATE_SCHEMA;
  templateTableId: typeof VOICING_TEMPLATE_TABLE_ID;
  templateTableVersion: typeof VOICING_TEMPLATE_TABLE_VERSION;
  id: VoicingTemplateId;
  qualityClass: VoicingQualityClass;
  formulaRuleIds: readonly [
    ParsedChordFormulaRuleId,
    ...ParsedChordFormulaRuleId[],
  ];
  family: AutoVoicingFamily;
}>;

type AvailableTemplateAvailability = Readonly<{
  availability: "available";
  quartalContextPolicyId: null;
  quartalContextPolicyVersion: null;
}>;

export type RealizationRoleVoicingFamilyTemplate =
  | (VoicingTemplateIdentity &
      AvailableTemplateAvailability &
      RealizationRoleTemplateSelection &
      AvailableTemplateCardinality<3, AllAutoVoiceCounts, AllAutoBassPolicies> &
      Extract<VoicingFamilyRegisterPolicyBinding, { family: "balanced" }>)
  | (VoicingTemplateIdentity &
      AvailableTemplateAvailability &
      RealizationRoleTemplateSelection &
      AvailableTemplateCardinality<3, AllAutoVoiceCounts, AllAutoBassPolicies> &
      Extract<VoicingFamilyRegisterPolicyBinding, { family: "open" }>)
  | (VoicingTemplateIdentity &
      AvailableTemplateAvailability &
      RealizationRoleTemplateSelection &
      AvailableTemplateCardinality<
        4,
        Drop2AutoVoiceCounts,
        AllAutoBassPolicies
      > &
      Extract<VoicingFamilyRegisterPolicyBinding, { family: "drop2" }>);

export type FixedDegreeSequenceVoicingFamilyTemplate =
  | (VoicingTemplateIdentity &
      AvailableTemplateAvailability &
      Omit<FixedDegreeSequenceTemplateSelection, "degreeSequence"> &
      Readonly<{ degreeSequence: FixedDegreeSequenceOfLength<3> }> &
      AvailableTemplateCardinality<3, readonly [3], AllAutoBassPolicies> &
      Extract<VoicingFamilyRegisterPolicyBinding, { family: "shell" }>)
  | (VoicingTemplateIdentity &
      AvailableTemplateAvailability &
      Omit<FixedDegreeSequenceTemplateSelection, "degreeSequence"> &
      Readonly<{ degreeSequence: FixedDegreeSequenceOfLength<4> }> &
      AvailableTemplateCardinality<4, readonly [4], AllAutoBassPolicies> &
      Extract<VoicingFamilyRegisterPolicyBinding, { family: "shell" }>)
  | (VoicingTemplateIdentity &
      AvailableTemplateAvailability &
      Omit<FixedDegreeSequenceTemplateSelection, "degreeSequence"> &
      Readonly<{ degreeSequence: FixedDegreeSequenceOfLength<4> }> &
      AvailableTemplateCardinality<
        4,
        RootlessAutoVoiceCounts,
        readonly ["external"]
      > &
      Extract<
        VoicingFamilyRegisterPolicyBinding,
        { family: "rootless-a" | "rootless-b" }
      >);

export type AvailableVoicingFamilyTemplate =
  | RealizationRoleVoicingFamilyTemplate
  | FixedDegreeSequenceVoicingFamilyTemplate;

export type ContextGatedVoicingFamilyTemplate = VoicingTemplateIdentity &
  AvailableTemplateCardinality<3, QuartalAutoVoiceCounts, AllAutoBassPolicies> &
  QuartalContextSequenceTemplateSelection &
  Readonly<{
    family: "quartal";
    availability: "context-gated";
    quartalContextPolicyId: typeof QUARTAL_CONTEXT_POLICY_ID;
    quartalContextPolicyVersion: typeof QUARTAL_CONTEXT_POLICY_VERSION;
  }> &
  Extract<VoicingFamilyRegisterPolicyBinding, { family: "quartal" }>;

/** An unavailable row carries identity and reason, never inert policy fields. */
export type UnavailableVoicingFamilyTemplate = VoicingTemplateIdentity &
  (
    | Readonly<{
        family: "shell" | "rootless-a" | "rootless-b";
        availability: "unavailable";
        reason: "quality-family-unsupported";
      }>
    | Readonly<{
        family: "quartal";
        availability: "unavailable";
        reason: "quartal-row-undeclared";
      }>
  );

export type VoicingFamilyTemplate =
  | AvailableVoicingFamilyTemplate
  | ContextGatedVoicingFamilyTemplate
  | UnavailableVoicingFamilyTemplate;

export const QUARTAL_CONTEXT_EVIDENCE_KINDS = Object.freeze([
  "compatible-chord-scale",
  "declared-modal-template",
  "declared-suspended-template",
] as const);
export type QuartalContextEvidenceKind =
  (typeof QUARTAL_CONTEXT_EVIDENCE_KINDS)[number];

export const QUARTAL_ADJACENCY_KINDS = Object.freeze([
  "perfect-fourth",
  "augmented-fourth",
] as const);
export type QuartalAdjacencyKind =
  (typeof QUARTAL_ADJACENCY_KINDS)[number];

export const QUARTAL_ALLOWED_ADJACENCY_SEMITONES = Object.freeze([
  5,
  6,
] as const);
export type QuartalAllowedAdjacencySemitones =
  (typeof QUARTAL_ALLOWED_ADJACENCY_SEMITONES)[number];

/**
 * Two through seven ordered members; every member must exist in T1 output.
 * The two-member form supplies the upper dyad of a three-voice generated
 * non-member slash-bass request; all other count coupling remains validated.
 */
export type QuartalDegreeSequence =
  | readonly [ChordDegree, ChordDegree]
  | readonly [ChordDegree, ChordDegree, ChordDegree]
  | readonly [ChordDegree, ChordDegree, ChordDegree, ChordDegree]
  | readonly [
      ChordDegree,
      ChordDegree,
      ChordDegree,
      ChordDegree,
      ChordDegree,
    ]
  | readonly [
      ChordDegree,
      ChordDegree,
      ChordDegree,
      ChordDegree,
      ChordDegree,
      ChordDegree,
    ]
  | readonly [
      ChordDegree,
      ChordDegree,
      ChordDegree,
      ChordDegree,
      ChordDegree,
      ChordDegree,
      ChordDegree,
    ];

/**
 * A data-only injected gate. V0 verifies membership, order, and adjacency; a
 * context ID or evidence label alone never authorizes a quartal candidate.
 */
export type QuartalContext = Readonly<{
  schema: typeof QUARTAL_CONTEXT_SCHEMA;
  policyId: typeof QUARTAL_CONTEXT_POLICY_ID;
  policyVersion: typeof QUARTAL_CONTEXT_POLICY_VERSION;
  evidenceKind: QuartalContextEvidenceKind;
  /** Validated as 1..256 code points and at most 512 UTF-8 bytes. */
  evidenceId: string;
  evidenceVersion: number;
  degreeSequence: QuartalDegreeSequence;
}>;

export type QuartalAdjacencyEvidence = Readonly<{
  lowerDegree: ChordDegree;
  upperDegree: ChordDegree;
  lowerPitch: SpelledPitch;
  upperPitch: SpelledPitch;
  semitones: QuartalAllowedAdjacencySemitones;
  kind: QuartalAdjacencyKind;
}>;

/** The lower voice of each adjacent pair selects exactly one spacing band. */
export const VOICING_LOW_REGISTER_SPACING_BANDS = Object.freeze([
  Object.freeze({ maximumLowerMidi: 35, minimumSemitones: 10 }),
  Object.freeze({ maximumLowerMidi: 47, minimumSemitones: 7 }),
  Object.freeze({ maximumLowerMidi: 59, minimumSemitones: 4 }),
  Object.freeze({ maximumLowerMidi: 127, minimumSemitones: 1 }),
] as const);

export type VoicingLowRegisterSpacingBand =
  (typeof VOICING_LOW_REGISTER_SPACING_BANDS)[number];

export const VOICING_CONSTRAINT_CODES = Object.freeze([
  "voicing.constraint.realization_membership",
  "voicing.constraint.template_degree_membership",
  "voicing.constraint.voice_count",
  "voicing.constraint.midi_range",
  "voicing.constraint.required_degrees",
  "voicing.constraint.guide_tones",
  "voicing.constraint.identity_tones",
  "voicing.constraint.bass_policy",
  "voicing.constraint.slash_bass_lowest",
  "voicing.constraint.external_bass_excluded",
  "voicing.constraint.rootless_root_omitted",
  "voicing.constraint.unique_midi",
  "voicing.constraint.permitted_doubling",
  "voicing.constraint.low_register_spacing",
  "voicing.constraint.family_structure",
  "voicing.constraint.quartal_context",
] as const);
export type VoicingConstraintCode =
  (typeof VOICING_CONSTRAINT_CODES)[number];

export const MAX_VOICING_CONSTRAINT_OBSERVATIONS_PER_CANDIDATE =
  VOICING_CONSTRAINT_CODES.length;
export const MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS =
  MAX_VOICING_CONSTRAINT_OBSERVATIONS_PER_CANDIDATE;
export const MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES = 7;

export const VOICING_CONSTRAINT_OBSERVATION_POLICY_ID =
  "changes.voicing-constraint-observation-collection";
export const VOICING_CONSTRAINT_OBSERVATION_POLICY_VERSION = 1;

/** Stable order for both reports and simultaneous unsatisfied constraints. */
export const VOICING_CONSTRAINT_PRECEDENCE = VOICING_CONSTRAINT_CODES;

export const VOICING_CONSTRAINT_UNSATISFIED_REASONS = Object.freeze([
  "selected-realization-mismatch",
  "template-degree-absent",
  "voice-count-below-template-minimum",
  "voice-count-unsupported",
  "bass-policy-unsupported",
  "required-degree-omitted",
  "guide-tone-omitted",
  "identity-tone-omitted",
  "slash-bass-unplaceable",
  "external-bass-present",
  "root-present-in-rootless",
  "range-insufficient",
  "duplicate-midi",
  "doubling-not-permitted",
  "low-register-spacing",
  "family-transform-invalid",
  "quartal-context-invalid",
  "no-legal-register-placement",
] as const);
export type VoicingConstraintUnsatisfiedReason =
  (typeof VOICING_CONSTRAINT_UNSATISFIED_REASONS)[number];

type VoicingConstraintObservation<
  Code extends VoicingConstraintCode = VoicingConstraintCode,
> = Readonly<{
  code: Code;
  voiceOrdinals: ReadonlyTupleUpTo<
    number,
    typeof MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES
  >;
  degrees: ReadonlyTupleUpTo<
    ChordDegree,
    typeof MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES
  >;
  midiValues: ReadonlyTupleUpTo<
    MidiPitch,
    typeof MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES
  >;
}>;

export type SatisfiedVoicingConstraint<
  Code extends VoicingConstraintCode = VoicingConstraintCode,
> = VoicingConstraintObservation<Code> &
  Readonly<{
    satisfied: true;
    reason: null;
  }>;

export type UnsatisfiedVoicingConstraint<
  Code extends VoicingConstraintCode = VoicingConstraintCode,
> = VoicingConstraintObservation<Code> &
  Readonly<{
    satisfied: false;
    reason: VoicingConstraintUnsatisfiedReason;
  }>;

export type VoicingConstraintResult =
  | SatisfiedVoicingConstraint
  | UnsatisfiedVoicingConstraint;

export const VOICING_EVIDENCE_CODES = Object.freeze([
  "voicing.evidence.quality_classified",
  "voicing.evidence.template_selected",
  "voicing.evidence.realization_bound",
  "voicing.evidence.register_enumerated",
  "voicing.evidence.family_transform",
  "voicing.evidence.constraints_checked",
  "voicing.evidence.local_score",
  "voicing.evidence.stable_retention",
  "voicing.evidence.quartal_context",
] as const);
export type VoicingEvidenceCode =
  (typeof VOICING_EVIDENCE_CODES)[number];

export const MAX_VOICING_EVIDENCE_RECORDS_PER_CANDIDATE =
  VOICING_EVIDENCE_CODES.length;
export const MAX_VOICING_NON_QUARTAL_EVIDENCE_RECORDS_PER_CANDIDATE = 8;
export const MAX_VOICING_EVIDENCE_OBSERVATION_VOICES = 7;

export type VoicingCandidateEvidence<
  Code extends VoicingEvidenceCode = VoicingEvidenceCode,
> = Readonly<{
  code: Code;
  /** Every source ID obeys the same 256-code-point/512-byte cap as context IDs. */
  sourceId: string;
  sourceVersion: number;
  voiceOrdinals: ReadonlyTupleUpTo<
    number,
    typeof MAX_VOICING_EVIDENCE_OBSERVATION_VOICES
  >;
  degrees: ReadonlyTupleUpTo<
    ChordDegree,
    typeof MAX_VOICING_EVIDENCE_OBSERVATION_VOICES
  >;
}>;

export type NonQuartalVoicingCandidateEvidenceRecords = readonly [
  VoicingCandidateEvidence<"voicing.evidence.quality_classified">,
  VoicingCandidateEvidence<"voicing.evidence.template_selected">,
  VoicingCandidateEvidence<"voicing.evidence.realization_bound">,
  VoicingCandidateEvidence<"voicing.evidence.register_enumerated">,
  VoicingCandidateEvidence<"voicing.evidence.family_transform">,
  VoicingCandidateEvidence<"voicing.evidence.constraints_checked">,
  VoicingCandidateEvidence<"voicing.evidence.local_score">,
  VoicingCandidateEvidence<"voicing.evidence.stable_retention">,
];
export type QuartalVoicingCandidateEvidenceRecords = readonly [
  ...NonQuartalVoicingCandidateEvidenceRecords,
  VoicingCandidateEvidence<"voicing.evidence.quartal_context">,
];
export type VoicingCandidateEvidenceRecords =
  | NonQuartalVoicingCandidateEvidenceRecords
  | QuartalVoicingCandidateEvidenceRecords;

/** All axes are finite, nonnegative safe integers and compare ascending. */
export const VOICING_LOCAL_SCORE_AXIS_ORDER = Object.freeze([
  "optionalDegreesOmitted",
  "nonPreferredDoublings",
  "guideToneDoublings",
  "templateOrderDisplacement",
  "targetSpanDistance",
  "rangeCenterDistanceTwice",
] as const);
export type VoicingLocalScoreAxis =
  (typeof VOICING_LOCAL_SCORE_AXIS_ORDER)[number];

export type VoicingLocalScore = Readonly<{
  optionalDegreesOmitted: number;
  nonPreferredDoublings: number;
  guideToneDoublings: number;
  templateOrderDisplacement: number;
  targetSpanDistance: number;
  rangeCenterDistanceTwice: number;
}>;

/**
 * Exact ascending candidate order. Numeric and degree comparisons are ordinary
 * integer comparisons. String comparisons use UTF-16 code units, never locale.
 */
export const VOICING_CANDIDATE_ORDER = Object.freeze([
  "local-score-axis-order",
  "midi-sequence-lexicographic",
  "degree-number-then-alter-lexicographic",
  "spelling-octave-then-domain-step-then-alter-lexicographic",
  "template-id-utf16-lexicographic",
  "raw-generation-ordinal",
] as const);
export type VoicingCandidateOrderKey =
  (typeof VOICING_CANDIDATE_ORDER)[number];

/**
 * Inclusive musical caps: producing exactly 96 raw candidates may complete and
 * retain up to 24. Before accepting a 97th raw candidate the operation refuses
 * with `limit.voicing_work_exceeded` (`received: 97`, `maximum: 96`) and returns
 * no partial candidate result.
 */
export const MAX_VOICING_RAW_CANDIDATES = 96;
export const MAX_VOICING_RETAINED_CANDIDATES = 24;
export const MAX_VOICING_REGISTER_PLACEMENTS =
  MAX_THEORY_DEGREES_PER_REALIZATION * 11;
export const MAX_VOICING_SEARCH_STATE_EXPANSIONS = 8_192;
export const MAX_VOICING_PEAK_SEARCH_STATES = 512;
export const MAX_VOICING_HARD_CONSTRAINT_CHECKS =
  MAX_VOICING_SEARCH_STATE_EXPANSIONS * VOICING_CONSTRAINT_CODES.length;
export const MAX_VOICING_CONSTRAINT_OBSERVATION_COMPARISONS =
  MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS *
  (MAX_VOICING_HARD_CONSTRAINT_CHECKS +
    MAX_VOICING_SEARCH_STATE_EXPANSIONS);
export const MAX_VOICING_PAIRWISE_CANDIDATE_COMPARISONS =
  (MAX_VOICING_RAW_CANDIDATES * (MAX_VOICING_RAW_CANDIDATES - 1)) / 2;
export const MAX_VOICING_RAW_VOICE_RECORDS =
  MAX_VOICING_RAW_CANDIDATES * 7;
export const MAX_VOICING_OUTPUT_VOICE_RECORDS =
  MAX_VOICING_RETAINED_CANDIDATES * 7;
export const MAX_VOICING_TEMPLATE_ROWS =
  VOICING_QUALITY_CLASSES.length * VOICING_FAMILIES.length;
export const MAX_VOICING_TRACKED_RECORDS = 1_792;
export const VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_ID =
  "changes.voicing-tracked-record-accounting";
export const VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_VERSION = 2;
export const VOICING_TRACKED_RECORD_POPULATIONS = Object.freeze([
  "selected-realization-degree",
  "template-row",
  "register-placement",
  "search-state",
  "raw-candidate",
  "raw-voice",
  "retained-candidate",
  "output-voice",
  "constraint-observation",
] as const);
export type VoicingTrackedRecordPopulation =
  (typeof VOICING_TRACKED_RECORD_POPULATIONS)[number];
export const VOICING_TRACKED_RECORD_POPULATION_LIMITS: Readonly<
  Record<VoicingTrackedRecordPopulation, number>
> = Object.freeze({
  "selected-realization-degree": MAX_THEORY_DEGREES_PER_REALIZATION,
  "template-row": MAX_VOICING_TEMPLATE_ROWS,
  "register-placement": MAX_VOICING_REGISTER_PLACEMENTS,
  "search-state": MAX_VOICING_PEAK_SEARCH_STATES,
  "raw-candidate": MAX_VOICING_RAW_CANDIDATES,
  "raw-voice": MAX_VOICING_RAW_VOICE_RECORDS,
  "retained-candidate": MAX_VOICING_RETAINED_CANDIDATES,
  "output-voice": MAX_VOICING_OUTPUT_VOICE_RECORDS,
  "constraint-observation":
    MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
});
export const VOICING_TRACKED_RECORD_ACCOUNTING = Object.freeze({
  policyId: VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_ID,
  policyVersion: VOICING_TRACKED_RECORD_ACCOUNTING_POLICY_VERSION,
  populationOrder: VOICING_TRACKED_RECORD_POPULATIONS,
  populationLimits: VOICING_TRACKED_RECORD_POPULATION_LIMITS,
  aggregateMaximum: MAX_VOICING_TRACKED_RECORDS,
  sumOfPopulationLimits: MAX_VOICING_TRACKED_RECORDS,
  diagnosticPayloadOwnedByCandidateRecord: true,
  constraintObservationAccumulatorPopulation: "constraint-observation",
  independentDiagnosticSideCollectionsAllowed: false,
  ownershipLaw:
    "Successful constraint, evidence, score, and explanation projections are payload of their owning candidate. A no-result search may retain only the one declared operation-local constraint-observation population, transfer it into the refusal, and retain no parallel diagnostic side collection.",
} as const);

export const VOICING_WORK_COUNTER_NAMES = Object.freeze([
  "realizationDegreeRecordsVisited",
  "templateRowsVisited",
  "templateDegreeSlotsVisited",
  "registerPlacementsVisited",
  "searchStatesExpanded",
  "structuralTransformsAttempted",
  "hardConstraintChecks",
  "rawCandidatesProduced",
  "candidateCanonicalizations",
  "duplicateCandidateComparisons",
  "localScoresComputed",
  "orderingComparisons",
  "retainedCandidatesProduced",
  "outputVoicesProduced",
  "constraintObservationComparisons",
  "constraintObservationsProduced",
] as const);
export type VoicingWorkCounterName =
  (typeof VOICING_WORK_COUNTER_NAMES)[number];

export const VOICING_MEMORY_COUNTER_NAMES = Object.freeze([
  "peakRegisterPlacementRecords",
  "peakSearchStateRecords",
  "peakRawCandidateRecords",
  "peakRawVoiceRecords",
  "peakRetainedCandidateRecords",
  "peakOutputVoiceRecords",
  "peakTrackedRecords",
  "peakConstraintObservationRecords",
] as const);
export type VoicingMemoryCounterName =
  (typeof VOICING_MEMORY_COUNTER_NAMES)[number];

export const VOICING_WORK_LIMITS: Readonly<
  Record<VoicingWorkCounterName, number>
> = Object.freeze({
  realizationDegreeRecordsVisited: MAX_THEORY_DEGREES_PER_REALIZATION,
  templateRowsVisited: MAX_VOICING_TEMPLATE_ROWS,
  templateDegreeSlotsVisited:
    MAX_VOICING_TEMPLATE_ROWS * MAX_VOICING_TEMPLATE_DEGREE_SLOTS,
  registerPlacementsVisited: MAX_VOICING_REGISTER_PLACEMENTS,
  searchStatesExpanded: MAX_VOICING_SEARCH_STATE_EXPANSIONS,
  structuralTransformsAttempted: MAX_VOICING_SEARCH_STATE_EXPANSIONS,
  hardConstraintChecks: MAX_VOICING_HARD_CONSTRAINT_CHECKS,
  rawCandidatesProduced: MAX_VOICING_RAW_CANDIDATES,
  candidateCanonicalizations: MAX_VOICING_RAW_CANDIDATES,
  duplicateCandidateComparisons:
    MAX_VOICING_PAIRWISE_CANDIDATE_COMPARISONS,
  localScoresComputed: MAX_VOICING_RAW_CANDIDATES,
  orderingComparisons: MAX_VOICING_PAIRWISE_CANDIDATE_COMPARISONS,
  retainedCandidatesProduced: MAX_VOICING_RETAINED_CANDIDATES,
  outputVoicesProduced: MAX_VOICING_OUTPUT_VOICE_RECORDS,
  constraintObservationComparisons:
    MAX_VOICING_CONSTRAINT_OBSERVATION_COMPARISONS,
  constraintObservationsProduced:
    MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
});

export const VOICING_MEMORY_LIMITS: Readonly<
  Record<VoicingMemoryCounterName, number>
> = Object.freeze({
  peakRegisterPlacementRecords: MAX_VOICING_REGISTER_PLACEMENTS,
  peakSearchStateRecords: MAX_VOICING_PEAK_SEARCH_STATES,
  peakRawCandidateRecords: MAX_VOICING_RAW_CANDIDATES,
  peakRawVoiceRecords: MAX_VOICING_RAW_VOICE_RECORDS,
  peakRetainedCandidateRecords: MAX_VOICING_RETAINED_CANDIDATES,
  peakOutputVoiceRecords: MAX_VOICING_OUTPUT_VOICE_RECORDS,
  peakTrackedRecords: MAX_VOICING_TRACKED_RECORDS,
  peakConstraintObservationRecords:
    MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
});

export const VOICING_TERMINATIONS = Object.freeze([
  "complete-generated",
  "complete-bypass",
  "realization-unavailable",
  "quartal-context-unexpected",
  "quartal-context-required",
  "quartal-context-invalid",
  "family-unavailable",
  "constraints-unsatisfied",
  "work-limit-exceeded",
] as const);
export type VoicingTermination =
  (typeof VOICING_TERMINATIONS)[number];

/** Every stored-bypass counter is exactly zero. */
export type VoicingWorkEvidence = Readonly<{
  realizationDegreeRecordsVisited: number;
  templateRowsVisited: number;
  templateDegreeSlotsVisited: number;
  registerPlacementsVisited: number;
  searchStatesExpanded: number;
  structuralTransformsAttempted: number;
  hardConstraintChecks: number;
  rawCandidatesProduced: number;
  candidateCanonicalizations: number;
  duplicateCandidateComparisons: number;
  localScoresComputed: number;
  orderingComparisons: number;
  retainedCandidatesProduced: number;
  outputVoicesProduced: number;
  constraintObservationComparisons: number;
  constraintObservationsProduced: number;
  peakRegisterPlacementRecords: number;
  peakSearchStateRecords: number;
  peakRawCandidateRecords: number;
  peakRawVoiceRecords: number;
  peakRetainedCandidateRecords: number;
  peakOutputVoiceRecords: number;
  peakTrackedRecords: number;
  peakConstraintObservationRecords: number;
  termination: VoicingTermination;
}>;

export const VOICING_REFUSAL_CODES = Object.freeze([
  "voicing.realization_unavailable",
  "voicing.quartal_context_unexpected",
  "voicing.quartal_context_required",
  "voicing.quartal_context_invalid",
  "voicing.family_unavailable",
  "voicing.constraints_unsatisfied",
  "limit.voicing_work_exceeded",
] as const);
export type VoicingRefusalCode =
  (typeof VOICING_REFUSAL_CODES)[number];

/** First independently discoverable code wins; no later fallback is attempted. */
export const VOICING_REFUSAL_PRECEDENCE = VOICING_REFUSAL_CODES;

export const QUARTAL_CONTEXT_INVALID_REASONS = Object.freeze([
  "schema-mismatch",
  "policy-id-mismatch",
  "policy-version-mismatch",
  "evidence-id-invalid",
  "evidence-version-invalid",
  "degree-count-mismatch",
  "degree-absent-from-realization",
  "adjacency-not-perfect-or-augmented-fourth",
] as const);
export type QuartalContextInvalidReason =
  (typeof QUARTAL_CONTEXT_INVALID_REASONS)[number];

export const VOICING_REFUSAL_REASON_PRECEDENCE = Object.freeze({
  "voicing.quartal_context_invalid": QUARTAL_CONTEXT_INVALID_REASONS,
  "voicing.constraints_unsatisfied": VOICING_CONSTRAINT_UNSATISFIED_REASONS,
} as const);

export type RealizationUnavailableRefusal = PathRefusal<{
  code: "voicing.realization_unavailable";
  path: readonly ["realizationId"];
  received: SemanticRealizationId;
  available: NonEmptyReadonlyTupleUpTo<
    SemanticRealizationId,
    typeof MAX_THEORY_REALIZATIONS
  >;
}>;

export type QuartalContextUnexpectedRefusal = PathRefusal<{
  code: "voicing.quartal_context_unexpected";
  path: readonly ["quartalContext"];
  family: Exclude<AutoVoicingFamily, "quartal">;
}>;

export type QuartalContextRequiredRefusal = PathRefusal<{
  code: "voicing.quartal_context_required";
  path: readonly ["quartalContext"];
  family: "quartal";
  policyId: typeof QUARTAL_CONTEXT_POLICY_ID;
  policyVersion: typeof QUARTAL_CONTEXT_POLICY_VERSION;
}>;

export type QuartalContextInvalidRefusal = PathRefusal<{
  code: "voicing.quartal_context_invalid";
  path: readonly ["quartalContext"] | readonly ["quartalContext", "degreeSequence", number];
  reason: QuartalContextInvalidReason;
}>;

type VoicingFamilyUnavailableCommon = Readonly<{
  code: "voicing.family_unavailable";
  path: readonly ["policy", "family"];
  qualityClass: VoicingQualityClass;
  formulaRuleId: ParsedChordFormulaRuleId;
}>;

export type VoicingFamilyUnavailableRefusal =
  | PathRefusal<
      VoicingFamilyUnavailableCommon &
        Readonly<{
          family: "shell" | "rootless-a" | "rootless-b";
          reason: "quality-family-unsupported";
        }>
    >
  | PathRefusal<
      VoicingFamilyUnavailableCommon &
        Readonly<{
          family: "quartal";
          reason: "quartal-row-undeclared";
        }>
    >;

export type VoicingConstraintsUnsatisfiedRefusal = PathRefusal<{
  code: "voicing.constraints_unsatisfied";
  path: readonly ["policy"];
  constraints: NonEmptyReadonlyTupleUpTo<
    UnsatisfiedVoicingConstraint,
    typeof MAX_VOICING_CONSTRAINT_OBSERVATIONS_PER_CANDIDATE
  >;
}>;

export type VoicingWorkLimitExceededRefusal = PathRefusal<{
  code: "limit.voicing_work_exceeded";
  path: readonly [];
  counter: VoicingWorkCounterName | VoicingMemoryCounterName;
  received: number;
  maximum: number;
  partialResult: false;
}>;

export type VoicingRefusal =
  | RealizationUnavailableRefusal
  | QuartalContextUnexpectedRefusal
  | QuartalContextRequiredRefusal
  | QuartalContextInvalidRefusal
  | VoicingFamilyUnavailableRefusal
  | VoicingConstraintsUnsatisfiedRefusal
  | VoicingWorkLimitExceededRefusal;

export const VOICING_CANDIDATE_IDS = Object.freeze([
  "candidate-000",
  "candidate-001",
  "candidate-002",
  "candidate-003",
  "candidate-004",
  "candidate-005",
  "candidate-006",
  "candidate-007",
  "candidate-008",
  "candidate-009",
  "candidate-010",
  "candidate-011",
  "candidate-012",
  "candidate-013",
  "candidate-014",
  "candidate-015",
  "candidate-016",
  "candidate-017",
  "candidate-018",
  "candidate-019",
  "candidate-020",
  "candidate-021",
  "candidate-022",
  "candidate-023",
] as const);
export type VoicingCandidateId =
  (typeof VOICING_CANDIDATE_IDS)[number];

type CandidateVoiceBase = Readonly<{
  ordinal: number;
  pitch: SpelledPitch;
  midi: MidiPitch;
}>;

export type RealizationCandidateVoice = CandidateVoiceBase &
  Readonly<{
    provenance: "realization";
    degree: ChordDegree;
    sourceDegreeIndex: number;
  }>;

export type DoublingCandidateVoice = CandidateVoiceBase &
  Readonly<{
    provenance: "doubling";
    degree: ChordDegree;
    sourceDegreeIndex: number;
  }>;

/** Slash bass is deliberately not assigned a fabricated chord degree. */
export type SlashBassCandidateVoice = CandidateVoiceBase &
  Readonly<{
    provenance: "slash-bass";
    degree: null;
    sourceDegreeIndex: null;
  }>;

export type VoicingCandidateVoice =
  | RealizationCandidateVoice
  | DoublingCandidateVoice
  | SlashBassCandidateVoice;

export type VoicingCandidateVoices =
  | readonly [VoicingCandidateVoice, VoicingCandidateVoice, VoicingCandidateVoice]
  | readonly [
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
    ]
  | readonly [
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
    ]
  | readonly [
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
    ]
  | readonly [
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
      VoicingCandidateVoice,
    ];

export type VoicingCandidatePitches =
  | readonly [SpelledPitch, SpelledPitch, SpelledPitch]
  | readonly [SpelledPitch, SpelledPitch, SpelledPitch, SpelledPitch]
  | readonly [
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
    ]
  | readonly [
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
    ]
  | readonly [
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
      SpelledPitch,
    ];

export const MAX_VOICING_DROP2_TRANSFORM_VOICES = 7;
export const MIN_VOICING_EXPLANATION_ORDERED_DEGREES = 2;
export const MAX_VOICING_EXPLANATION_ORDERED_DEGREES = 7;
export const MAX_VOICING_EXPLANATION_OMITTED_DEGREES =
  MAX_THEORY_DEGREES_PER_REALIZATION;
export const MAX_VOICING_EXPLANATION_DOUBLED_DEGREES = 2;
export const MAX_VOICING_EXPLANATION_QUARTAL_ADJACENCIES = 4;
export const MIN_VOICING_DROP2_TRANSFORM_VOICES = 4;
export const MIN_VOICING_RESULT_CANDIDATES = 1;
export const MIN_VOICING_AVAILABLE_REALIZATION_IDS = 1;
export const MAX_VOICING_AVAILABLE_REALIZATION_IDS = MAX_THEORY_REALIZATIONS;
export const MIN_VOICING_REFUSAL_CONSTRAINTS = 1;
export const MAX_VOICING_REFUSAL_CONSTRAINTS =
  MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS;
export const VOICING_CANDIDATE_PAYLOAD_LIMITS = Object.freeze({
  hardConstraintObservations:
    MAX_VOICING_CONSTRAINT_OBSERVATIONS_PER_CANDIDATE,
  hardConstraintCodeOrder: VOICING_CONSTRAINT_CODES,
  nonQuartalEvidenceRecords:
    MAX_VOICING_NON_QUARTAL_EVIDENCE_RECORDS_PER_CANDIDATE,
  quartalEvidenceRecords: MAX_VOICING_EVIDENCE_RECORDS_PER_CANDIDATE,
  evidenceCodeOrder: VOICING_EVIDENCE_CODES,
  constraintObservationVoiceOrdinals:
    MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES,
  constraintObservationDegrees:
    MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES,
  constraintObservationMidiValues:
    MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES,
  evidenceObservationVoiceOrdinals:
    MAX_VOICING_EVIDENCE_OBSERVATION_VOICES,
  evidenceObservationDegrees: MAX_VOICING_EVIDENCE_OBSERVATION_VOICES,
  explanationOrderedDegreesMinimum:
    MIN_VOICING_EXPLANATION_ORDERED_DEGREES,
  explanationOrderedDegreesMaximum:
    MAX_VOICING_EXPLANATION_ORDERED_DEGREES,
  explanationOmittedDegreesMaximum:
    MAX_VOICING_EXPLANATION_OMITTED_DEGREES,
  explanationDoubledDegreesMaximum:
    MAX_VOICING_EXPLANATION_DOUBLED_DEGREES,
  explanationQuartalAdjacenciesMaximum:
    MAX_VOICING_EXPLANATION_QUARTAL_ADJACENCIES,
  drop2TransformVoicesMinimum: MIN_VOICING_DROP2_TRANSFORM_VOICES,
  drop2TransformVoicesMaximum: MAX_VOICING_DROP2_TRANSFORM_VOICES,
  drop2SourceAndTransformedLengthsEqual: true,
  resultCandidatesMinimum: MIN_VOICING_RESULT_CANDIDATES,
  resultCandidatesMaximum: MAX_VOICING_RETAINED_CANDIDATES,
  availableRealizationIdsMinimum: MIN_VOICING_AVAILABLE_REALIZATION_IDS,
  availableRealizationIdsMaximum: MAX_VOICING_AVAILABLE_REALIZATION_IDS,
  refusalConstraintsMinimum: MIN_VOICING_REFUSAL_CONSTRAINTS,
  refusalConstraintsMaximum: MAX_VOICING_REFUSAL_CONSTRAINTS,
} as const);

type Drop2TransformEvidenceForLength<Length extends 4 | 5 | 6 | 7> = Readonly<{
  closedSourceMidi: ReadonlyTupleOfLength<MidiPitch, Length>;
  secondFromTopSourceOrdinal: number;
  loweredBySemitones: 12;
  transformedMidi: ReadonlyTupleOfLength<MidiPitch, Length>;
}>;

export type Drop2TransformEvidence =
  | Drop2TransformEvidenceForLength<4>
  | Drop2TransformEvidenceForLength<5>
  | Drop2TransformEvidenceForLength<6>
  | Drop2TransformEvidenceForLength<7>;

export type VoicingCandidateExplanation = Readonly<{
  qualityClass: VoicingQualityClass;
  templateId: VoicingTemplateId;
  orderedDegrees:
    | ReadonlyTupleOfLength<ChordDegree, 2>
    | ReadonlyTupleOfLength<ChordDegree, 3>
    | ReadonlyTupleOfLength<ChordDegree, 4>
    | ReadonlyTupleOfLength<ChordDegree, 5>
    | ReadonlyTupleOfLength<ChordDegree, 6>
    | ReadonlyTupleOfLength<ChordDegree, 7>;
  omittedDegrees: ReadonlyTupleUpTo<
    ChordDegree,
    typeof MAX_VOICING_EXPLANATION_OMITTED_DEGREES
  >;
  doubledDegrees: ReadonlyTupleUpTo<
    ChordDegree,
    typeof MAX_VOICING_EXPLANATION_DOUBLED_DEGREES
  >;
  externalBass: SpelledPitchClass | null;
  drop2: Drop2TransformEvidence | null;
  quartalAdjacencies: ReadonlyTupleUpTo<
    QuartalAdjacencyEvidence,
    typeof MAX_VOICING_EXPLANATION_QUARTAL_ADJACENCIES
  >;
}>;

export type VoicingCandidateHardConstraints = readonly [
  SatisfiedVoicingConstraint<"voicing.constraint.realization_membership">,
  SatisfiedVoicingConstraint<"voicing.constraint.template_degree_membership">,
  SatisfiedVoicingConstraint<"voicing.constraint.voice_count">,
  SatisfiedVoicingConstraint<"voicing.constraint.midi_range">,
  SatisfiedVoicingConstraint<"voicing.constraint.required_degrees">,
  SatisfiedVoicingConstraint<"voicing.constraint.guide_tones">,
  SatisfiedVoicingConstraint<"voicing.constraint.identity_tones">,
  SatisfiedVoicingConstraint<"voicing.constraint.bass_policy">,
  SatisfiedVoicingConstraint<"voicing.constraint.slash_bass_lowest">,
  SatisfiedVoicingConstraint<"voicing.constraint.external_bass_excluded">,
  SatisfiedVoicingConstraint<"voicing.constraint.rootless_root_omitted">,
  SatisfiedVoicingConstraint<"voicing.constraint.unique_midi">,
  SatisfiedVoicingConstraint<"voicing.constraint.permitted_doubling">,
  SatisfiedVoicingConstraint<"voicing.constraint.low_register_spacing">,
  SatisfiedVoicingConstraint<"voicing.constraint.family_structure">,
  SatisfiedVoicingConstraint<"voicing.constraint.quartal_context">,
];

type VoicingCandidateCommonFields = Readonly<{
  schema: typeof VOICING_CANDIDATE_SCHEMA;
  id: VoicingCandidateId;
  engineId: typeof VOICING_ENGINE_ID;
  engineVersion: typeof VOICING_ENGINE_VERSION;
  templateTableId: typeof VOICING_TEMPLATE_TABLE_ID;
  templateTableVersion: typeof VOICING_TEMPLATE_TABLE_VERSION;
  realizationId: SemanticRealizationId;
  rawGenerationOrdinal: number;
  retainedOrdinal: number;
  voices: VoicingCandidateVoices;
  pitches: VoicingCandidatePitches;
  hardConstraints: VoicingCandidateHardConstraints;
  localScorePolicyId: typeof VOICING_LOCAL_SCORE_POLICY_ID;
  localScorePolicyVersion: typeof VOICING_LOCAL_SCORE_POLICY_VERSION;
  localScore: VoicingLocalScore;
  explanation: VoicingCandidateExplanation;
}>;

export type VoicingCandidate =
  | (VoicingCandidateCommonFields &
      Readonly<{
        family: Exclude<AutoVoicingFamily, "quartal">;
        evidence: NonQuartalVoicingCandidateEvidenceRecords;
      }>)
  | (VoicingCandidateCommonFields &
      Readonly<{
        family: "quartal";
        evidence: QuartalVoicingCandidateEvidenceRecords;
      }>);

export type GeneratedVoicingCandidates = Readonly<{
  schema: typeof VOICING_RESULT_SCHEMA;
  kind: "generated";
  engineId: typeof VOICING_ENGINE_ID;
  engineVersion: typeof VOICING_ENGINE_VERSION;
  realizationId: SemanticRealizationId;
  policy: AutoVoicing;
  rawCandidateCount: number;
  candidates: NonEmptyReadonlyTupleUpTo<
    VoicingCandidate,
    typeof MAX_VOICING_RETAINED_CANDIDATES
  >;
}>;

export type StoredVoicing = ManualVoicing | FrozenVoicing;

/** No candidate, degree, register, score, or transform is synthesized here. */
export type StoredVoicingBypass<
  Source extends StoredVoicing = StoredVoicing,
> = Readonly<{
  schema: typeof VOICING_RESULT_SCHEMA;
  kind: "stored-bypass";
  voicing: Source;
  candidateGenerationPerformed: false;
  rawCandidateCount: 0;
  retainedCandidateCount: 0;
}>;

type AutoVoicingRequestIdentity = Readonly<{
  schema: typeof VOICING_REQUEST_SCHEMA;
  kind: "auto";
  resolved: ParsedResolvedChord;
  realizationId: SemanticRealizationId;
}>;

export type QuartalAutoVoicingRequest = AutoVoicingRequestIdentity &
  Readonly<{
    policy: AutoVoicing & Readonly<{ family: "quartal" }>;
    quartalContext: QuartalContext;
  }>;

export type NonQuartalAutoVoicingRequest = AutoVoicingRequestIdentity &
  Readonly<{
    policy: AutoVoicing &
      Readonly<{ family: Exclude<AutoVoicingFamily, "quartal"> }>;
    quartalContext: null;
  }>;

export type AutoVoicingRequest =
  | QuartalAutoVoicingRequest
  | NonQuartalAutoVoicingRequest;

export type StoredVoicingRequest<
  Source extends StoredVoicing = StoredVoicing,
> = Readonly<{
  schema: typeof VOICING_REQUEST_SCHEMA;
  kind: "stored";
  voicing: Source;
}>;

export type RealizeVoicingRequest =
  | AutoVoicingRequest
  | StoredVoicingRequest;

type VoicingFailureCase<
  Refusal extends VoicingRefusal,
  Termination extends Exclude<
    VoicingTermination,
    "complete-generated" | "complete-bypass"
  >,
> = Readonly<{
  ok: false;
  refusal: Refusal;
  evidence: VoicingWorkEvidence & Readonly<{ termination: Termination }>;
}>;

export type VoicingFailure =
  | VoicingFailureCase<
      RealizationUnavailableRefusal,
      "realization-unavailable"
    >
  | VoicingFailureCase<
      QuartalContextUnexpectedRefusal,
      "quartal-context-unexpected"
    >
  | VoicingFailureCase<
      QuartalContextRequiredRefusal,
      "quartal-context-required"
    >
  | VoicingFailureCase<
      QuartalContextInvalidRefusal,
      "quartal-context-invalid"
    >
  | VoicingFailureCase<
      VoicingFamilyUnavailableRefusal,
      "family-unavailable"
    >
  | VoicingFailureCase<
      VoicingConstraintsUnsatisfiedRefusal,
      "constraints-unsatisfied"
    >
  | VoicingFailureCase<
      VoicingWorkLimitExceededRefusal,
      "work-limit-exceeded"
    >;

/** The stored route is statically incapable of reporting generation work. */
export type StoredVoicingBypassEvidence = Readonly<{
  realizationDegreeRecordsVisited: 0;
  templateRowsVisited: 0;
  templateDegreeSlotsVisited: 0;
  registerPlacementsVisited: 0;
  searchStatesExpanded: 0;
  structuralTransformsAttempted: 0;
  hardConstraintChecks: 0;
  rawCandidatesProduced: 0;
  candidateCanonicalizations: 0;
  duplicateCandidateComparisons: 0;
  localScoresComputed: 0;
  orderingComparisons: 0;
  retainedCandidatesProduced: 0;
  outputVoicesProduced: 0;
  constraintObservationComparisons: 0;
  constraintObservationsProduced: 0;
  peakRegisterPlacementRecords: 0;
  peakSearchStateRecords: 0;
  peakRawCandidateRecords: 0;
  peakRawVoiceRecords: 0;
  peakRetainedCandidateRecords: 0;
  peakOutputVoiceRecords: 0;
  peakTrackedRecords: 0;
  peakConstraintObservationRecords: 0;
  termination: "complete-bypass";
}>;

export type GeneratedVoicingResult =
  | Readonly<{
      ok: true;
      value: GeneratedVoicingCandidates;
      evidence: VoicingWorkEvidence &
        Readonly<{ termination: "complete-generated" }>;
    }>
  | VoicingFailure;

export type StoredVoicingResult<
  Source extends StoredVoicing = StoredVoicing,
> = Readonly<{
  ok: true;
  value: StoredVoicingBypass<Source>;
  evidence: StoredVoicingBypassEvidence;
}>;

export type RealizeVoicingResult =
  | GeneratedVoicingResult
  | StoredVoicingResult;

/** One pure, synchronous V0 operation; wall time is never an input or cutoff. */
export interface RealizeVoicing {
  <Source extends StoredVoicing>(
    request: StoredVoicingRequest<Source>,
  ): StoredVoicingResult<Source>;
  (request: AutoVoicingRequest): GeneratedVoicingResult;
  (request: RealizeVoicingRequest): RealizeVoicingResult;
}

export const VOICING_OPERATION_NAMES = Object.freeze([
  "realizeVoicing",
] as const);
export type VoicingOperationName =
  (typeof VOICING_OPERATION_NAMES)[number];

export interface VoicingCandidateOperations {
  readonly realizeVoicing: RealizeVoicing;
}
