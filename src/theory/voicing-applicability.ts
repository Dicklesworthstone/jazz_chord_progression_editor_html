import {
  type AutoVoiceCount,
  type AutoVoicingFamily,
  type ChordDegree,
  type PitchClass,
  type TriadQuality,
} from "../domain";
import type { SemanticRealization } from "./resolution-contract";
import {
  type VoicingFamilyRegisterPolicy,
  type VoicingFamilyTemplate,
  type VoicingQualityClass,
  type VoicingTemplateAvailability,
  type VoicingTemplateUnavailableReason,
} from "./voicing-candidates-contract";
import {
  classifyVoicingQuality,
  getVoicingFamilyPlan,
  getVoicingIdentityDegrees,
  type VoicingFamilyPlan,
} from "./voicing-family-authority";
import {
  compareChordDegreesByVoicingPriority,
} from "./voicing-engine-primitives";

const ROOT_DEGREE = Object.freeze({ number: 1, alter: 0 } as const);
const NATURAL_FIFTH = Object.freeze({ number: 5, alter: 0 } as const);
const OPTIONAL_FILL_PRIORITY = Object.freeze([
  Object.freeze({ number: 13, alter: 0 }),
  Object.freeze({ number: 13, alter: -1 }),
  Object.freeze({ number: 11, alter: 1 }),
  Object.freeze({ number: 11, alter: 0 }),
  Object.freeze({ number: 9, alter: 1 }),
  Object.freeze({ number: 9, alter: -1 }),
  Object.freeze({ number: 9, alter: 0 }),
  Object.freeze({ number: 6, alter: 0 }),
  NATURAL_FIFTH,
] satisfies readonly ChordDegree[]);

export const VOICING_STATIC_CONSTRAINT_REASONS = Object.freeze([
  "template-degree-absent",
  "voice-count-below-template-minimum",
  "voice-count-unsupported",
  "required-degree-omitted",
  "guide-tone-omitted",
  "doubling-not-permitted",
  "family-transform-invalid",
] as const);

export type VoicingStaticConstraintReason =
  (typeof VOICING_STATIC_CONSTRAINT_REASONS)[number];

export type VoicingStaticFamilyUnavailableRefusal = Readonly<{
  code: "voicing.family_unavailable";
  termination: "family-unavailable";
  reason: VoicingTemplateUnavailableReason;
}>;

export type VoicingStaticConstraintsUnsatisfiedRefusal = Readonly<{
  code: "voicing.constraints_unsatisfied";
  termination: "constraints-unsatisfied";
  primaryReason: VoicingStaticConstraintReason;
  reasons: readonly [
    VoicingStaticConstraintReason,
    ...VoicingStaticConstraintReason[],
  ];
  absentTemplateDegrees?: readonly ChordDegree[];
}>;

export type VoicingStaticApplicabilityRefusal =
  | VoicingStaticFamilyUnavailableRefusal
  | VoicingStaticConstraintsUnsatisfiedRefusal;

export type VoicingApplicabilityPlan = VoicingFamilyPlan &
  Readonly<{
    qualityClass: VoicingQualityClass;
    identityDegrees: readonly ChordDegree[];
    templateId: VoicingFamilyTemplate["id"];
    templateAvailability: VoicingTemplateAvailability;
    refusal: VoicingStaticApplicabilityRefusal | null;
  }>;

function sameDegree(left: ChordDegree, right: ChordDegree): boolean {
  return left.number === right.number && left.alter === right.alter;
}

function hasDegree(
  degrees: readonly ChordDegree[],
  target: ChordDegree,
): boolean {
  return degrees.some((degree) => sameDegree(degree, target));
}

function degreeKey(degree: ChordDegree): string {
  return `${degree.number.toString()}:${degree.alter.toString()}`;
}

function distinctDegreeCount(degrees: readonly ChordDegree[]): number {
  return new Set(degrees.map(degreeKey)).size;
}

function optionalPriorityRank(degree: ChordDegree): number {
  if (degree.alter !== 0) return -1;
  const index = OPTIONAL_FILL_PRIORITY.findIndex((candidate) =>
    sameDegree(candidate, degree),
  );
  return index === -1 ? OPTIONAL_FILL_PRIORITY.length : index;
}

/** Shared adaptive optional-degree order for static planning and generation. */
export function compareAdaptiveOptionalDegrees(
  left: ChordDegree,
  right: ChordDegree,
): number {
  const leftRank = optionalPriorityRank(left);
  const rightRank = optionalPriorityRank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return compareChordDegreesByVoicingPriority(left, right);
}

/**
 * Prove the pitch-class-only part of the strict Drop-2 family law.
 *
 * Every possible closed-source inversion is enumerated. Register range and
 * low-register spacing deliberately remain request-time concerns.
 */
export function isDrop2PitchClassSetStructurallyFeasible(
  pitchClasses: readonly PitchClass[],
  voiceCount: AutoVoiceCount,
): boolean {
  if (pitchClasses.length !== voiceCount || voiceCount < 4) return false;
  const uniquePitchClasses = [...new Set(pitchClasses)];
  if (uniquePitchClasses.length !== pitchClasses.length) return false;

  for (const lowestPitchClass of uniquePitchClasses) {
    const closedSource = uniquePitchClasses
      .map((pitchClass) => (pitchClass - lowestPitchClass + 12) % 12)
      .sort((left, right) => left - right);
    const secondFromTopIndex = closedSource.length - 2;
    const transformed = closedSource
      .map((midi, index) =>
        index === secondFromTopIndex ? midi - 12 : midi,
      )
      .sort((left, right) => left - right);
    const lowest = transformed[0];
    const highest = transformed.at(-1);
    if (lowest === undefined || highest === undefined) continue;
    const span = highest - lowest;
    if (span < 12 || span > 36) continue;
    if (voiceCount === 4 || voiceCount === 5) {
      let hasWideGap = false;
      for (let index = 1; index < transformed.length; index += 1) {
        const lower = transformed[index - 1];
        const upper = transformed[index];
        if (lower !== undefined && upper !== undefined && upper - lower >= 7) {
          hasWideGap = true;
          break;
        }
      }
      if (!hasWideGap) continue;
    }
    return true;
  }
  return false;
}

function adaptiveMandatoryDegrees(
  realization: SemanticRealization,
): readonly ChordDegree[] {
  const seen = new Set<string>();
  const mandatory: ChordDegree[] = [];
  for (const degree of realization.degrees) {
    if (
      !hasDegree(realization.requiredDegrees, degree) &&
      !hasDegree(realization.guideToneDegrees, degree)
    ) {
      continue;
    }
    const key = degreeKey(degree);
    if (seen.has(key)) continue;
    seen.add(key);
    mandatory.push(degree);
  }
  return Object.freeze(mandatory);
}

function selectedAdaptiveDegrees(
  realization: SemanticRealization,
  voiceCount: AutoVoiceCount,
): readonly ChordDegree[] {
  const selected = [...adaptiveMandatoryDegrees(realization)];
  const selectedKeys = new Set(selected.map(degreeKey));
  const optional = realization.degrees
    .filter(
      (degree) =>
        hasDegree(realization.optionalDegrees, degree) &&
        !selectedKeys.has(degreeKey(degree)),
    )
    .sort(compareAdaptiveOptionalDegrees);
  for (const degree of optional) {
    if (selected.length >= voiceCount) break;
    const key = degreeKey(degree);
    if (selectedKeys.has(key)) continue;
    selected.push(degree);
    selectedKeys.add(key);
  }
  return Object.freeze(selected.slice(0, voiceCount));
}

function pitchClassesForDegrees(
  realization: SemanticRealization,
  degrees: readonly ChordDegree[],
): readonly PitchClass[] | null {
  const pitchClasses: PitchClass[] = [];
  for (const degree of degrees) {
    const index = realization.degrees.findIndex((candidate) =>
      sameDegree(candidate, degree),
    );
    const pitchClass = realization.pitchClasses[index];
    if (pitchClass === undefined) return null;
    pitchClasses.push(pitchClass);
  }
  return Object.freeze(pitchClasses);
}

function fixedTemplateAbsentDegrees(
  realization: SemanticRealization,
  template: Extract<
    VoicingFamilyTemplate,
    { selectionMode: "fixed-degree-sequence" }
  >,
): readonly ChordDegree[] {
  return Object.freeze(
    template.degreeSequence.flatMap((slot) =>
      hasDegree(realization.degrees, slot.degree) ? [] : [slot.degree],
    ),
  );
}

function templateCountReason(
  template: Exclude<VoicingFamilyTemplate, { availability: "unavailable" }>,
  voiceCount: AutoVoiceCount,
):
  | "voice-count-below-template-minimum"
  | "voice-count-unsupported"
  | null {
  if (voiceCount < template.minimumVoiceCount) {
    return "voice-count-below-template-minimum";
  }
  return template.permittedVoiceCounts.some((count) => count === voiceCount)
    ? null
    : "voice-count-unsupported";
}

function constraintsRefusal(
  reasons: readonly [
    VoicingStaticConstraintReason,
    ...VoicingStaticConstraintReason[],
  ],
  absentTemplateDegrees: readonly ChordDegree[] = Object.freeze([]),
): VoicingStaticConstraintsUnsatisfiedRefusal {
  const primaryReason = reasons[0];
  const frozenReasons = Object.freeze([primaryReason, ...reasons.slice(1)] as const);
  if (absentTemplateDegrees.length === 0) {
    return Object.freeze({
      code: "voicing.constraints_unsatisfied",
      termination: "constraints-unsatisfied",
      primaryReason,
      reasons: frozenReasons,
    });
  }
  return Object.freeze({
    code: "voicing.constraints_unsatisfied",
    termination: "constraints-unsatisfied",
    primaryReason,
    reasons: frozenReasons,
    absentTemplateDegrees: Object.freeze([...absentTemplateDegrees]),
  });
}

function fixedTemplateRefusal(
  realization: SemanticRealization,
  template: Extract<
    VoicingFamilyTemplate,
    {
      availability: "available";
      selectionMode: "fixed-degree-sequence";
    }
  >,
  voiceCount: AutoVoiceCount,
): VoicingStaticConstraintsUnsatisfiedRefusal | null {
  const absent = fixedTemplateAbsentDegrees(realization, template);
  const countReason = templateCountReason(template, voiceCount);
  const reasons: VoicingStaticConstraintReason[] = [];
  if (absent.length > 0) reasons.push("template-degree-absent");
  if (countReason !== null) reasons.push(countReason);
  const [first, ...rest] = reasons;
  return first === undefined
    ? null
    : constraintsRefusal(Object.freeze([first, ...rest]), absent);
}

function mayDouble(
  realization: SemanticRealization,
  degree: ChordDegree,
): boolean {
  return (
    hasDegree(realization.degrees, degree) &&
    !hasDegree(realization.guideToneDegrees, degree)
  );
}

function adaptiveTemplateRefusal(
  realization: SemanticRealization,
  template: Extract<
    VoicingFamilyTemplate,
    {
      availability: "available";
      selectionMode: "realization-roles";
    }
  >,
  voiceCount: AutoVoiceCount,
): VoicingStaticConstraintsUnsatisfiedRefusal | null {
  const countReason = templateCountReason(template, voiceCount);
  if (countReason !== null) {
    return constraintsRefusal(Object.freeze([countReason]));
  }

  const omittedMandatory = adaptiveMandatoryDegrees(realization).slice(
    voiceCount,
  );
  if (omittedMandatory.length > 0) {
    const reasons: VoicingStaticConstraintReason[] = [];
    if (
      omittedMandatory.some((degree) =>
        hasDegree(realization.requiredDegrees, degree),
      )
    ) {
      reasons.push("required-degree-omitted");
    }
    if (
      omittedMandatory.some((degree) =>
        hasDegree(realization.guideToneDegrees, degree),
      )
    ) {
      reasons.push("guide-tone-omitted");
    }
    const [first, ...rest] = reasons;
    if (first !== undefined) {
      return constraintsRefusal(Object.freeze([first, ...rest]));
    }
  }

  const realizationDegreeCount = distinctDegreeCount(realization.degrees);
  if (template.family === "drop2") {
    if (voiceCount > realizationDegreeCount) {
      return constraintsRefusal(Object.freeze(["doubling-not-permitted"]));
    }
    const selectedDegrees = selectedAdaptiveDegrees(realization, voiceCount);
    if (selectedDegrees.length < voiceCount) {
      return constraintsRefusal(Object.freeze(["doubling-not-permitted"]));
    }
    const pitchClasses = pitchClassesForDegrees(realization, selectedDegrees);
    return pitchClasses !== null &&
      isDrop2PitchClassSetStructurallyFeasible(pitchClasses, voiceCount)
      ? null
      : constraintsRefusal(Object.freeze(["family-transform-invalid"]));
  }

  const maximumVoiceCount = Math.min(
    7,
    realizationDegreeCount +
      Number(mayDouble(realization, ROOT_DEGREE)) +
      Number(mayDouble(realization, NATURAL_FIFTH)),
  );
  return voiceCount > maximumVoiceCount
    ? constraintsRefusal(Object.freeze(["voice-count-unsupported"]))
    : null;
}

function staticRefusal(
  realization: SemanticRealization,
  plan: VoicingFamilyPlan,
  voiceCount: AutoVoiceCount,
): VoicingStaticApplicabilityRefusal | null {
  const { template } = plan;
  if (template.availability === "unavailable") {
    return Object.freeze({
      code: "voicing.family_unavailable",
      termination: "family-unavailable",
      reason: template.reason,
    });
  }

  switch (template.selectionMode) {
    case "fixed-degree-sequence":
      return fixedTemplateRefusal(realization, template, voiceCount);
    case "realization-roles":
      return adaptiveTemplateRefusal(realization, template, voiceCount);
    case "quartal-context-sequence": {
      const reason = templateCountReason(template, voiceCount);
      return reason === null
        ? null
        : constraintsRefusal(Object.freeze([reason]));
    }
  }
}

/**
 * Materialize the non-bass, pre-register V0 decision for one exact T1
 * realization. This is intentionally narrower than candidate generation:
 * ranges, slash bass, external bass, Quartal adjacency, and placements remain
 * request-time checks.
 */
export function assessVoicingApplicability(
  realization: SemanticRealization,
  sourceTriad: TriadQuality,
  family: AutoVoicingFamily,
  voiceCount: AutoVoiceCount,
): VoicingApplicabilityPlan {
  const qualityClass = classifyVoicingQuality(realization.formulaRuleId);
  const plan = getVoicingFamilyPlan(qualityClass, family);
  return assessBoundVoicingApplicability(
    realization,
    sourceTriad,
    voiceCount,
    qualityClass,
    plan,
  );
}

/**
 * Internal production seam for a caller that already performed the metered
 * template-table lookup. Keeping the bound plan avoids a second, unmetered
 * scan of the 112-row authority during candidate generation.
 */
export function assessBoundVoicingApplicability(
  realization: SemanticRealization,
  sourceTriad: TriadQuality,
  voiceCount: AutoVoiceCount,
  qualityClass: VoicingQualityClass,
  plan: VoicingFamilyPlan,
): VoicingApplicabilityPlan {
  const identityDegrees = getVoicingIdentityDegrees(qualityClass, sourceTriad);
  return Object.freeze({
    ...plan,
    qualityClass,
    identityDegrees,
    templateId: plan.template.id,
    templateAvailability: plan.template.availability,
    refusal: staticRefusal(realization, plan, voiceCount),
  });
}

/** Narrow helper for consumers that need the bound register policy. */
export function hasVoicingRegisterPolicy(
  plan: VoicingApplicabilityPlan,
): plan is VoicingApplicabilityPlan &
  Readonly<{ registerPolicy: VoicingFamilyRegisterPolicy }> {
  return plan.registerPolicy !== null;
}
