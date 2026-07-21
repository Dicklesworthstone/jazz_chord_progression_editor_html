import {
  type AutoVoicingFamily,
  type ChordDegree,
  type TriadQuality,
} from "../domain";
import type { ParsedChordFormulaRuleId } from "./resolution-contract";
import {
  MAX_VOICING_TEMPLATE_DEGREE_SLOTS,
  QUARTAL_CONTEXT_POLICY_ID,
  QUARTAL_CONTEXT_POLICY_VERSION,
  VOICING_FAMILIES,
  VOICING_FAMILY_REGISTER_POLICY_SCHEMA,
  VOICING_FAMILY_REGISTER_POLICY_VERSION,
  VOICING_QUALITY_CLASSES,
  VOICING_REALIZATION_ROLE_SELECTION_POLICY_ID,
  VOICING_REALIZATION_ROLE_SELECTION_POLICY_VERSION,
  VOICING_TEMPLATE_SCHEMA,
  VOICING_TEMPLATE_TABLE_ID,
  VOICING_TEMPLATE_TABLE_VERSION,
  type AvailableVoicingFamilyTemplate,
  type BalancedRegisterPolicy,
  type ContextGatedVoicingFamilyTemplate,
  type Drop2RegisterPolicy,
  type FixedDegreeSequenceVoicingFamilyTemplate,
  type FixedTemplateRegisterPolicy,
  type OpenRegisterPolicy,
  type QuartalRegisterPolicy,
  type RealizationRoleVoicingFamilyTemplate,
  type UnavailableVoicingFamilyTemplate,
  type VoicingFamilyRegisterPolicy,
  type VoicingFamilyTemplate,
  type VoicingQualityClass,
  type VoicingTemplateDegreeRole,
  type VoicingTemplateDegreeSlot,
} from "./voicing-candidates-contract";

type FormulaRuleTuple = readonly [
  ParsedChordFormulaRuleId,
  ...ParsedChordFormulaRuleId[],
];

type QualityClassification = Readonly<{
  qualityClass: VoicingQualityClass;
  formulaRuleIds: FormulaRuleTuple;
}>;

const freezeFormulaRules = <Rules extends FormulaRuleTuple>(
  rules: Rules,
): Rules => Object.freeze(rules);

/**
 * The source-owned formula-to-quality authority. It deliberately duplicates no
 * fixture or Atlas record: independent corpora compare against this value.
 */
export const VOICING_QUALITY_CLASSIFICATION: readonly QualityClassification[] =
  Object.freeze([
    Object.freeze({
      qualityClass: "major-triad",
      formulaRuleIds: freezeFormulaRules(["base-major"]),
    }),
    Object.freeze({
      qualityClass: "minor-triad",
      formulaRuleIds: freezeFormulaRules(["base-minor"]),
    }),
    Object.freeze({
      qualityClass: "diminished-triad",
      formulaRuleIds: freezeFormulaRules(["base-diminished"]),
    }),
    Object.freeze({
      qualityClass: "augmented-triad",
      formulaRuleIds: freezeFormulaRules(["base-augmented"]),
    }),
    Object.freeze({
      qualityClass: "suspended-triad",
      formulaRuleIds: freezeFormulaRules(["base-sus2", "base-sus4"]),
    }),
    Object.freeze({
      qualityClass: "power-triad",
      formulaRuleIds: freezeFormulaRules(["base-power"]),
    }),
    Object.freeze({
      qualityClass: "major-sixth",
      formulaRuleIds: freezeFormulaRules(["sixth-major"]),
    }),
    Object.freeze({
      qualityClass: "minor-sixth",
      formulaRuleIds: freezeFormulaRules(["sixth-minor"]),
    }),
    Object.freeze({
      qualityClass: "major-seventh",
      formulaRuleIds: freezeFormulaRules([
        "seventh-major",
        "extension-major",
      ]),
    }),
    Object.freeze({
      qualityClass: "dominant-seventh",
      formulaRuleIds: freezeFormulaRules([
        "seventh-dominant",
        "extension-dominant",
        "altered-dominant",
      ]),
    }),
    Object.freeze({
      qualityClass: "minor-seventh",
      formulaRuleIds: freezeFormulaRules([
        "seventh-minor",
        "extension-minor",
      ]),
    }),
    Object.freeze({
      qualityClass: "minor-major-seventh",
      formulaRuleIds: freezeFormulaRules(["seventh-minor-major"]),
    }),
    Object.freeze({
      qualityClass: "half-diminished-seventh",
      formulaRuleIds: freezeFormulaRules(["seventh-half-diminished"]),
    }),
    Object.freeze({
      qualityClass: "diminished-seventh",
      formulaRuleIds: freezeFormulaRules(["seventh-diminished"]),
    }),
    Object.freeze({
      qualityClass: "augmented-major-seventh",
      formulaRuleIds: freezeFormulaRules(["seventh-augmented-major"]),
    }),
    Object.freeze({
      qualityClass: "suspended-dominant",
      formulaRuleIds: freezeFormulaRules([
        "extension-suspended-dominant",
      ]),
    }),
  ]);

/** Structural classification uses only the selected T1 formula rule. */
export function classifyVoicingQuality(
  formulaRuleId: ParsedChordFormulaRuleId,
): VoicingQualityClass {
  switch (formulaRuleId) {
    case "base-major":
      return "major-triad";
    case "base-minor":
      return "minor-triad";
    case "base-diminished":
      return "diminished-triad";
    case "base-augmented":
      return "augmented-triad";
    case "base-sus2":
    case "base-sus4":
      return "suspended-triad";
    case "base-power":
      return "power-triad";
    case "sixth-major":
      return "major-sixth";
    case "sixth-minor":
      return "minor-sixth";
    case "seventh-major":
    case "extension-major":
      return "major-seventh";
    case "seventh-dominant":
    case "extension-dominant":
    case "altered-dominant":
      return "dominant-seventh";
    case "seventh-minor":
    case "extension-minor":
      return "minor-seventh";
    case "seventh-minor-major":
      return "minor-major-seventh";
    case "seventh-half-diminished":
      return "half-diminished-seventh";
    case "seventh-diminished":
      return "diminished-seventh";
    case "seventh-augmented-major":
      return "augmented-major-seventh";
    case "extension-suspended-dominant":
      return "suspended-dominant";
  }
}

function formulaRuleIdsForQuality(
  qualityClass: VoicingQualityClass,
): FormulaRuleTuple {
  for (const classification of VOICING_QUALITY_CLASSIFICATION) {
    if (classification.qualityClass === qualityClass) {
      return classification.formulaRuleIds;
    }
  }

  throw new Error(`Missing voicing quality classification: ${qualityClass}`);
}

const degree = (
  number: ChordDegree["number"],
  alter: ChordDegree["alter"],
): ChordDegree => Object.freeze({ number, alter });

const DEGREE_1 = degree(1, 0);
const DEGREE_2 = degree(2, 0);
const DEGREE_FLAT_3 = degree(3, -1);
const DEGREE_3 = degree(3, 0);
const DEGREE_4 = degree(4, 0);
const DEGREE_FLAT_5 = degree(5, -1);
const DEGREE_5 = degree(5, 0);
const DEGREE_SHARP_5 = degree(5, 1);
const DEGREE_6 = degree(6, 0);
const DEGREE_DOUBLE_FLAT_7 = degree(7, -2);
const DEGREE_FLAT_7 = degree(7, -1);
const DEGREE_7 = degree(7, 0);
const DEGREE_9 = degree(9, 0);
const DEGREE_11 = degree(11, 0);
const DEGREE_13 = degree(13, 0);

const IDENTITY_MAJOR = Object.freeze([DEGREE_1, DEGREE_3] as const);
const IDENTITY_MINOR = Object.freeze([DEGREE_1, DEGREE_FLAT_3] as const);
const IDENTITY_DIMINISHED = Object.freeze([
  DEGREE_1,
  DEGREE_FLAT_3,
  DEGREE_FLAT_5,
] as const);
const IDENTITY_AUGMENTED = Object.freeze([
  DEGREE_1,
  DEGREE_3,
  DEGREE_SHARP_5,
] as const);
const IDENTITY_SUS2 = Object.freeze([DEGREE_1, DEGREE_2] as const);
const IDENTITY_SUS4 = Object.freeze([DEGREE_1, DEGREE_4] as const);
const IDENTITY_POWER = Object.freeze([DEGREE_1, DEGREE_5] as const);

/** Exact source-triad identity members for candidate constraint checks. */
export function getVoicingIdentityDegrees(
  qualityClass: VoicingQualityClass,
  sourceTriad: TriadQuality,
): readonly ChordDegree[] {
  switch (qualityClass) {
    case "major-triad":
    case "major-sixth":
    case "major-seventh":
    case "dominant-seventh":
      return IDENTITY_MAJOR;
    case "minor-triad":
    case "minor-sixth":
    case "minor-seventh":
    case "minor-major-seventh":
      return IDENTITY_MINOR;
    case "diminished-triad":
    case "half-diminished-seventh":
    case "diminished-seventh":
      return IDENTITY_DIMINISHED;
    case "augmented-triad":
    case "augmented-major-seventh":
      return IDENTITY_AUGMENTED;
    case "power-triad":
      return IDENTITY_POWER;
    case "suspended-triad":
    case "suspended-dominant":
      if (sourceTriad === "sus2") return IDENTITY_SUS2;
      if (sourceTriad === "sus4") return IDENTITY_SUS4;
      throw new Error(
        `Suspended voicing class cannot use source triad ${sourceTriad}`,
      );
  }
}

const BALANCED_REGISTER_POLICY: BalancedRegisterPolicy = Object.freeze({
  schema: VOICING_FAMILY_REGISTER_POLICY_SCHEMA,
  id: "balanced-register-v1",
  version: VOICING_FAMILY_REGISTER_POLICY_VERSION,
  families: Object.freeze(["balanced"] as const),
  slotOrderPolicy: "selected-degree-register-weave-v1",
  minimumSpanSemitones: 0,
  maximumSpanSemitones: 36,
  targetSpanSemitones: 12,
  minimumWideGapSemitones: null,
  minimumWideGapVoiceCounts: null,
  closedSourceMaximumSpanSemitones: null,
  structuralTransform: null,
});

const FIXED_TEMPLATE_REGISTER_POLICY: FixedTemplateRegisterPolicy =
  Object.freeze({
    schema: VOICING_FAMILY_REGISTER_POLICY_SCHEMA,
    id: "fixed-template-register-v1",
    version: VOICING_FAMILY_REGISTER_POLICY_VERSION,
    families: Object.freeze([
      "shell",
      "rootless-a",
      "rootless-b",
    ] as const),
    slotOrderPolicy: "template-low-to-high",
    minimumSpanSemitones: 0,
    maximumSpanSemitones: 24,
    targetSpanSemitones: 12,
    minimumWideGapSemitones: null,
    minimumWideGapVoiceCounts: null,
    closedSourceMaximumSpanSemitones: null,
    structuralTransform: null,
  });

const OPEN_REGISTER_POLICY: OpenRegisterPolicy = Object.freeze({
  schema: VOICING_FAMILY_REGISTER_POLICY_SCHEMA,
  id: "open-register-v1",
  version: VOICING_FAMILY_REGISTER_POLICY_VERSION,
  families: Object.freeze(["open"] as const),
  slotOrderPolicy: "selected-degree-register-weave-v1",
  minimumSpanSemitones: 12,
  maximumSpanSemitones: 36,
  targetSpanSemitones: 19,
  minimumWideGapSemitones: 7,
  minimumWideGapVoiceCounts: Object.freeze([3, 4, 5, 6, 7] as const),
  closedSourceMaximumSpanSemitones: null,
  structuralTransform: null,
});

const DROP2_REGISTER_POLICY: Drop2RegisterPolicy = Object.freeze({
  schema: VOICING_FAMILY_REGISTER_POLICY_SCHEMA,
  id: "drop2-register-v1",
  version: VOICING_FAMILY_REGISTER_POLICY_VERSION,
  families: Object.freeze(["drop2"] as const),
  slotOrderPolicy: "closed-source-low-to-high",
  minimumSpanSemitones: 12,
  maximumSpanSemitones: 36,
  targetSpanSemitones: 19,
  minimumWideGapSemitones: 7,
  minimumWideGapVoiceCounts: Object.freeze([4, 5] as const),
  closedSourceMaximumSpanSemitones: 11,
  structuralTransform: Object.freeze({
    kind: "drop2",
    sourceVoiceSelection: "second-from-top",
    lowerBySemitones: 12,
    outputOrder: "midi-ascending",
  }),
});

const QUARTAL_REGISTER_POLICY: QuartalRegisterPolicy = Object.freeze({
  schema: VOICING_FAMILY_REGISTER_POLICY_SCHEMA,
  id: "quartal-register-v1",
  version: VOICING_FAMILY_REGISTER_POLICY_VERSION,
  families: Object.freeze(["quartal"] as const),
  slotOrderPolicy: "quartal-context-low-to-high",
  minimumSpanSemitones: 10,
  maximumSpanSemitones: 24,
  targetSpanSemitones: 15,
  minimumWideGapSemitones: null,
  minimumWideGapVoiceCounts: null,
  closedSourceMaximumSpanSemitones: null,
  structuralTransform: null,
});

/** Five exact source-owned register policies in stable public order. */
export const VOICING_REGISTER_POLICIES: readonly [
  BalancedRegisterPolicy,
  FixedTemplateRegisterPolicy,
  OpenRegisterPolicy,
  Drop2RegisterPolicy,
  QuartalRegisterPolicy,
] = Object.freeze([
  BALANCED_REGISTER_POLICY,
  FIXED_TEMPLATE_REGISTER_POLICY,
  OPEN_REGISTER_POLICY,
  DROP2_REGISTER_POLICY,
  QUARTAL_REGISTER_POLICY,
]);

const ALL_BASS_POLICIES = Object.freeze([
  "generated",
  "external",
  "none",
] as const);
const ALL_VOICE_COUNTS = Object.freeze([3, 4, 5, 6, 7] as const);
const DROP2_VOICE_COUNTS = Object.freeze([4, 5, 6, 7] as const);
const ROOTLESS_VOICE_COUNTS = Object.freeze([4] as const);
const ROOTLESS_BASS_POLICIES = Object.freeze(["external"] as const);
const SHELL_THREE_VOICE_COUNTS = Object.freeze([3] as const);
const SHELL_FOUR_VOICE_COUNTS = Object.freeze([4] as const);
const QUARTAL_FIVE_VOICE_COUNTS = Object.freeze([3, 4, 5] as const);
const QUARTAL_FOUR_VOICE_COUNTS = Object.freeze([3, 4] as const);

function templateIdentity<Family extends AutoVoicingFamily>(
  id: string,
  qualityClass: VoicingQualityClass,
  family: Family,
) {
  return Object.freeze({
    schema: VOICING_TEMPLATE_SCHEMA,
    templateTableId: VOICING_TEMPLATE_TABLE_ID,
    templateTableVersion: VOICING_TEMPLATE_TABLE_VERSION,
    id,
    qualityClass,
    formulaRuleIds: formulaRuleIdsForQuality(qualityClass),
    family,
  });
}

function makeAdaptiveTemplate(
  qualityClass: VoicingQualityClass,
  family: "balanced" | "open" | "drop2",
): RealizationRoleVoicingFamilyTemplate {
  const selection = Object.freeze({
    selectionMode: "realization-roles" as const,
    requiredDegreeSource: "selected-realization-required" as const,
    optionalDegreeSource: "selected-realization-optional" as const,
    guideToneSource: "selected-realization-guide-tone" as const,
    selectionPolicyId: VOICING_REALIZATION_ROLE_SELECTION_POLICY_ID,
    selectionPolicyVersion:
      VOICING_REALIZATION_ROLE_SELECTION_POLICY_VERSION,
    maximumSelectedDegreeSlots: MAX_VOICING_TEMPLATE_DEGREE_SLOTS,
  });

  switch (family) {
    case "balanced":
      return Object.freeze({
        ...templateIdentity(
          "balanced-adaptive-v1",
          qualityClass,
          family,
        ),
        ...selection,
        availability: "available",
        quartalContextPolicyId: null,
        quartalContextPolicyVersion: null,
        minimumVoiceCount: 3,
        permittedVoiceCounts: ALL_VOICE_COUNTS,
        permittedBassPolicies: ALL_BASS_POLICIES,
        registerPolicyId: "balanced-register-v1",
        registerPolicyVersion: VOICING_FAMILY_REGISTER_POLICY_VERSION,
        targetSpanSemitones: 12,
      });
    case "open":
      return Object.freeze({
        ...templateIdentity("open-adaptive-v1", qualityClass, family),
        ...selection,
        availability: "available",
        quartalContextPolicyId: null,
        quartalContextPolicyVersion: null,
        minimumVoiceCount: 3,
        permittedVoiceCounts: ALL_VOICE_COUNTS,
        permittedBassPolicies: ALL_BASS_POLICIES,
        registerPolicyId: "open-register-v1",
        registerPolicyVersion: VOICING_FAMILY_REGISTER_POLICY_VERSION,
        targetSpanSemitones: 19,
      });
    case "drop2":
      return Object.freeze({
        ...templateIdentity("drop2-adaptive-v1", qualityClass, family),
        ...selection,
        availability: "available",
        quartalContextPolicyId: null,
        quartalContextPolicyVersion: null,
        minimumVoiceCount: 4,
        permittedVoiceCounts: DROP2_VOICE_COUNTS,
        permittedBassPolicies: ALL_BASS_POLICIES,
        registerPolicyId: "drop2-register-v1",
        registerPolicyVersion: VOICING_FAMILY_REGISTER_POLICY_VERSION,
        targetSpanSemitones: 19,
      });
  }
}

function fixedSlot(
  slotDegree: ChordDegree,
  role: VoicingTemplateDegreeRole,
  guideTone: boolean,
  minimumOctaveLiftFromPrevious: 0 | 1,
): VoicingTemplateDegreeSlot {
  return Object.freeze({
    degree: slotDegree,
    role,
    required: true,
    guideTone,
    minimumOctaveLiftFromPrevious,
    preferredOctaveLiftFromPrevious: minimumOctaveLiftFromPrevious,
    mayOmit: false,
    mayDouble: false,
  });
}

const identitySlot = (
  slotDegree: ChordDegree,
  guideTone: boolean,
  lift: 0 | 1 = 0,
) => fixedSlot(slotDegree, "identity", guideTone, lift);
const guideSlot = (slotDegree: ChordDegree, lift: 0 | 1 = 0) =>
  fixedSlot(slotDegree, "guide", true, lift);
const colorSlot = (slotDegree: ChordDegree, lift: 0 | 1 = 0) =>
  fixedSlot(slotDegree, "color", false, lift);
const supportSlot = (slotDegree: ChordDegree, lift: 0 | 1 = 0) =>
  fixedSlot(slotDegree, "support", false, lift);

function makeShellThreeTemplate(
  id: string,
  qualityClass: VoicingQualityClass,
  degreeSequence: readonly [
    VoicingTemplateDegreeSlot,
    VoicingTemplateDegreeSlot,
    VoicingTemplateDegreeSlot,
  ],
): FixedDegreeSequenceVoicingFamilyTemplate {
  return Object.freeze({
    ...templateIdentity(id, qualityClass, "shell"),
    selectionMode: "fixed-degree-sequence",
    degreeSequence,
    availability: "available",
    quartalContextPolicyId: null,
    quartalContextPolicyVersion: null,
    minimumVoiceCount: 3,
    permittedVoiceCounts: SHELL_THREE_VOICE_COUNTS,
    permittedBassPolicies: ALL_BASS_POLICIES,
    registerPolicyId: "fixed-template-register-v1",
    registerPolicyVersion: VOICING_FAMILY_REGISTER_POLICY_VERSION,
    targetSpanSemitones: 12,
  });
}

function makeShellFourTemplate(
  id: string,
  qualityClass: VoicingQualityClass,
  degreeSequence: readonly [
    VoicingTemplateDegreeSlot,
    VoicingTemplateDegreeSlot,
    VoicingTemplateDegreeSlot,
    VoicingTemplateDegreeSlot,
  ],
): FixedDegreeSequenceVoicingFamilyTemplate {
  return Object.freeze({
    ...templateIdentity(id, qualityClass, "shell"),
    selectionMode: "fixed-degree-sequence",
    degreeSequence,
    availability: "available",
    quartalContextPolicyId: null,
    quartalContextPolicyVersion: null,
    minimumVoiceCount: 4,
    permittedVoiceCounts: SHELL_FOUR_VOICE_COUNTS,
    permittedBassPolicies: ALL_BASS_POLICIES,
    registerPolicyId: "fixed-template-register-v1",
    registerPolicyVersion: VOICING_FAMILY_REGISTER_POLICY_VERSION,
    targetSpanSemitones: 12,
  });
}

function makeRootlessTemplate(
  id: string,
  qualityClass: VoicingQualityClass,
  family: "rootless-a" | "rootless-b",
  degreeSequence: readonly [
    VoicingTemplateDegreeSlot,
    VoicingTemplateDegreeSlot,
    VoicingTemplateDegreeSlot,
    VoicingTemplateDegreeSlot,
  ],
): FixedDegreeSequenceVoicingFamilyTemplate {
  return Object.freeze({
    ...templateIdentity(id, qualityClass, family),
    selectionMode: "fixed-degree-sequence",
    degreeSequence,
    availability: "available",
    quartalContextPolicyId: null,
    quartalContextPolicyVersion: null,
    minimumVoiceCount: 4,
    permittedVoiceCounts: ROOTLESS_VOICE_COUNTS,
    permittedBassPolicies: ROOTLESS_BASS_POLICIES,
    registerPolicyId: "fixed-template-register-v1",
    registerPolicyVersion: VOICING_FAMILY_REGISTER_POLICY_VERSION,
    targetSpanSemitones: 12,
  });
}

const FIXED_TEMPLATES: readonly FixedDegreeSequenceVoicingFamilyTemplate[] =
  Object.freeze([
    makeShellThreeTemplate(
      "shell-major-v1",
      "major-seventh",
      Object.freeze([
        identitySlot(DEGREE_1, false),
        identitySlot(DEGREE_3, true),
        guideSlot(DEGREE_7),
      ]),
    ),
    makeShellThreeTemplate(
      "shell-dominant-v1",
      "dominant-seventh",
      Object.freeze([
        identitySlot(DEGREE_1, false),
        identitySlot(DEGREE_3, true),
        guideSlot(DEGREE_FLAT_7),
      ]),
    ),
    makeShellThreeTemplate(
      "shell-minor-v1",
      "minor-seventh",
      Object.freeze([
        identitySlot(DEGREE_1, false),
        identitySlot(DEGREE_FLAT_3, true),
        guideSlot(DEGREE_FLAT_7),
      ]),
    ),
    makeShellThreeTemplate(
      "shell-minor-major-v1",
      "minor-major-seventh",
      Object.freeze([
        identitySlot(DEGREE_1, false),
        identitySlot(DEGREE_FLAT_3, true),
        guideSlot(DEGREE_7),
      ]),
    ),
    makeShellFourTemplate(
      "shell-half-diminished-v1",
      "half-diminished-seventh",
      Object.freeze([
        identitySlot(DEGREE_1, false),
        identitySlot(DEGREE_FLAT_3, true),
        identitySlot(DEGREE_FLAT_5, false),
        guideSlot(DEGREE_FLAT_7),
      ]),
    ),
    makeShellFourTemplate(
      "shell-diminished-v1",
      "diminished-seventh",
      Object.freeze([
        identitySlot(DEGREE_1, false),
        identitySlot(DEGREE_FLAT_3, true),
        identitySlot(DEGREE_FLAT_5, false),
        guideSlot(DEGREE_DOUBLE_FLAT_7),
      ]),
    ),
    makeShellThreeTemplate(
      "shell-suspended-dominant-v1",
      "suspended-dominant",
      Object.freeze([
        identitySlot(DEGREE_1, false),
        identitySlot(DEGREE_4, true),
        guideSlot(DEGREE_FLAT_7),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-a-major-v1",
      "major-seventh",
      "rootless-a",
      Object.freeze([
        identitySlot(DEGREE_3, true),
        guideSlot(DEGREE_7),
        colorSlot(DEGREE_9, 1),
        supportSlot(DEGREE_5),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-b-major-v1",
      "major-seventh",
      "rootless-b",
      Object.freeze([
        guideSlot(DEGREE_7),
        colorSlot(DEGREE_9, 1),
        identitySlot(DEGREE_3, true),
        colorSlot(DEGREE_13),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-a-dominant-v1",
      "dominant-seventh",
      "rootless-a",
      Object.freeze([
        identitySlot(DEGREE_3, true),
        guideSlot(DEGREE_FLAT_7),
        colorSlot(DEGREE_9, 1),
        colorSlot(DEGREE_13),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-b-dominant-v1",
      "dominant-seventh",
      "rootless-b",
      Object.freeze([
        guideSlot(DEGREE_FLAT_7),
        colorSlot(DEGREE_9, 1),
        identitySlot(DEGREE_3, true),
        colorSlot(DEGREE_13),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-a-minor-v1",
      "minor-seventh",
      "rootless-a",
      Object.freeze([
        identitySlot(DEGREE_FLAT_3, true),
        guideSlot(DEGREE_FLAT_7),
        colorSlot(DEGREE_9, 1),
        supportSlot(DEGREE_5),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-b-minor-v1",
      "minor-seventh",
      "rootless-b",
      Object.freeze([
        guideSlot(DEGREE_FLAT_7),
        colorSlot(DEGREE_9, 1),
        identitySlot(DEGREE_FLAT_3, true),
        colorSlot(DEGREE_11),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-a-minor-major-v1",
      "minor-major-seventh",
      "rootless-a",
      Object.freeze([
        identitySlot(DEGREE_FLAT_3, true),
        guideSlot(DEGREE_7),
        colorSlot(DEGREE_9, 1),
        supportSlot(DEGREE_5),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-b-minor-major-v1",
      "minor-major-seventh",
      "rootless-b",
      Object.freeze([
        guideSlot(DEGREE_7),
        colorSlot(DEGREE_9, 1),
        identitySlot(DEGREE_FLAT_3, true),
        colorSlot(DEGREE_6),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-a-half-diminished-v1",
      "half-diminished-seventh",
      "rootless-a",
      Object.freeze([
        identitySlot(DEGREE_FLAT_3, true),
        identitySlot(DEGREE_FLAT_5, false),
        guideSlot(DEGREE_FLAT_7),
        colorSlot(DEGREE_11, 1),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-b-half-diminished-v1",
      "half-diminished-seventh",
      "rootless-b",
      Object.freeze([
        guideSlot(DEGREE_FLAT_7),
        colorSlot(DEGREE_11, 1),
        identitySlot(DEGREE_FLAT_3, true, 1),
        identitySlot(DEGREE_FLAT_5, false),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-a-suspended-v1",
      "suspended-dominant",
      "rootless-a",
      Object.freeze([
        identitySlot(DEGREE_4, true),
        guideSlot(DEGREE_FLAT_7),
        colorSlot(DEGREE_9, 1),
        colorSlot(DEGREE_13),
      ]),
    ),
    makeRootlessTemplate(
      "rootless-b-suspended-v1",
      "suspended-dominant",
      "rootless-b",
      Object.freeze([
        guideSlot(DEGREE_FLAT_7),
        colorSlot(DEGREE_9, 1),
        identitySlot(DEGREE_4, true),
        colorSlot(DEGREE_13),
      ]),
    ),
  ]);

function makeQuartalTemplate(
  id: string,
  qualityClass: VoicingQualityClass,
  permittedVoiceCounts:
    | typeof QUARTAL_FIVE_VOICE_COUNTS
    | typeof QUARTAL_FOUR_VOICE_COUNTS,
): ContextGatedVoicingFamilyTemplate {
  return Object.freeze({
    ...templateIdentity(id, qualityClass, "quartal"),
    selectionMode: "quartal-context-sequence",
    degreeSequenceSource: "quartal-context",
    minimumSelectedDegreeSlots: 2,
    maximumSelectedDegreeSlots: MAX_VOICING_TEMPLATE_DEGREE_SLOTS,
    availability: "context-gated",
    quartalContextPolicyId: QUARTAL_CONTEXT_POLICY_ID,
    quartalContextPolicyVersion: QUARTAL_CONTEXT_POLICY_VERSION,
    minimumVoiceCount: 3,
    permittedVoiceCounts,
    permittedBassPolicies: ALL_BASS_POLICIES,
    registerPolicyId: "quartal-register-v1",
    registerPolicyVersion: VOICING_FAMILY_REGISTER_POLICY_VERSION,
    targetSpanSemitones: 15,
  });
}

const QUARTAL_TEMPLATES: readonly ContextGatedVoicingFamilyTemplate[] =
  Object.freeze([
    makeQuartalTemplate(
      "quartal-major-lydian-v1",
      "major-seventh",
      QUARTAL_FIVE_VOICE_COUNTS,
    ),
    makeQuartalTemplate(
      "quartal-minor-dorian-v1",
      "minor-seventh",
      QUARTAL_FIVE_VOICE_COUNTS,
    ),
    makeQuartalTemplate(
      "quartal-suspended-modal-v1",
      "suspended-dominant",
      QUARTAL_FIVE_VOICE_COUNTS,
    ),
    makeQuartalTemplate(
      "quartal-half-diminished-locrian-v1",
      "half-diminished-seventh",
      QUARTAL_FIVE_VOICE_COUNTS,
    ),
    makeQuartalTemplate(
      "quartal-diminished-symmetric-v1",
      "diminished-seventh",
      QUARTAL_FOUR_VOICE_COUNTS,
    ),
  ]);

const SPECIALIZED_TEMPLATES: readonly (
  | FixedDegreeSequenceVoicingFamilyTemplate
  | ContextGatedVoicingFamilyTemplate
)[] = Object.freeze([...FIXED_TEMPLATES, ...QUARTAL_TEMPLATES]);

function findSpecializedTemplate(
  qualityClass: VoicingQualityClass,
  family: AutoVoicingFamily,
):
  | FixedDegreeSequenceVoicingFamilyTemplate
  | ContextGatedVoicingFamilyTemplate
  | undefined {
  return SPECIALIZED_TEMPLATES.find(
    (template) =>
      template.qualityClass === qualityClass && template.family === family,
  );
}

function makeUnavailableTemplate(
  qualityClass: VoicingQualityClass,
  family: "shell" | "rootless-a" | "rootless-b" | "quartal",
): UnavailableVoicingFamilyTemplate {
  if (family === "quartal") {
    return Object.freeze({
      ...templateIdentity("quartal-no-row-v1", qualityClass, family),
      availability: "unavailable",
      reason: "quartal-row-undeclared",
    });
  }

  return Object.freeze({
    ...templateIdentity(
      family === "shell" ? "shell-no-row-v1" : "rootless-no-row-v1",
      qualityClass,
      family,
    ),
    availability: "unavailable",
    reason: "quality-family-unsupported",
  });
}

function materializeTemplateRow(
  qualityClass: VoicingQualityClass,
  family: AutoVoicingFamily,
): VoicingFamilyTemplate {
  if (family === "balanced" || family === "open" || family === "drop2") {
    return makeAdaptiveTemplate(qualityClass, family);
  }

  const specialized = findSpecializedTemplate(qualityClass, family);
  if (specialized !== undefined) return specialized;

  return makeUnavailableTemplate(qualityClass, family);
}

function materializeTemplateRows(): readonly VoicingFamilyTemplate[] {
  const rows: VoicingFamilyTemplate[] = [];
  for (const qualityClass of VOICING_QUALITY_CLASSES) {
    for (const family of VOICING_FAMILIES) {
      rows.push(materializeTemplateRow(qualityClass, family));
    }
  }
  return Object.freeze(rows);
}

/** Complete 16-class by 7-family authority, class-major then family-major. */
export const VOICING_TEMPLATE_ROWS = materializeTemplateRows();

/** Deterministic total lookup over the materialized 112-row authority. */
export function findVoicingFamilyTemplate(
  qualityClass: VoicingQualityClass,
  family: AutoVoicingFamily,
): VoicingFamilyTemplate {
  const template = VOICING_TEMPLATE_ROWS.find(
    (row) => row.qualityClass === qualityClass && row.family === family,
  );
  if (template !== undefined) return template;

  throw new Error(
    `Missing voicing template row for ${qualityClass}/${family}`,
  );
}

export function findVoicingRegisterPolicy(
  policyId: VoicingFamilyRegisterPolicy["id"],
): VoicingFamilyRegisterPolicy {
  const policy = VOICING_REGISTER_POLICIES.find(
    (candidate) => candidate.id === policyId,
  );
  if (policy !== undefined) return policy;

  throw new Error(`Missing voicing register policy: ${policyId}`);
}

export type VoicingFamilyPlan =
  | Readonly<{
      template: AvailableVoicingFamilyTemplate | ContextGatedVoicingFamilyTemplate;
      registerPolicy: VoicingFamilyRegisterPolicy;
    }>
  | Readonly<{
      template: UnavailableVoicingFamilyTemplate;
      registerPolicy: null;
    }>;

/** Binds one semantic table position to its exact register policy, if any. */
export function getVoicingFamilyPlan(
  qualityClass: VoicingQualityClass,
  family: AutoVoicingFamily,
): VoicingFamilyPlan {
  const template = findVoicingFamilyTemplate(qualityClass, family);
  if (template.availability === "unavailable") {
    return Object.freeze({ template, registerPolicy: null });
  }

  const registerPolicy = findVoicingRegisterPolicy(template.registerPolicyId);
  return Object.freeze({ template, registerPolicy });
}
