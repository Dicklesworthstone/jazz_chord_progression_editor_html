import {
  pitchClassOf,
  type Alteration,
  type ChordDegree,
  type DegreeNumber,
  type SpelledPitchClass,
  type Step,
} from "../domain";
import {
  DEGREE_SPELLING_POLICY_ID,
  DEGREE_SPELLING_POLICY_VERSION,
  MAX_DEGREE_SPELLING_ALTERATION,
  MIN_DEGREE_SPELLING_ALTERATION,
  type DegreeSpellingResult,
  type SpellChordDegree,
} from "./resolution-contract";
import type { SpellChordDegreeWithEvidence } from "./resolution-evidence-contract";

const NATURAL_SEMITONE = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} satisfies Readonly<Record<Step, number>>);

const COMPOUND_MAJOR_DEGREE_SEMITONES = Object.freeze({
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
  9: 14,
  11: 17,
  13: 21,
} satisfies Readonly<Record<DegreeNumber, number>>);

function standaloneRefusalPath(): readonly ["degree"] {
  return Object.freeze(["degree"] as const);
}

function stepIndex(step: Step): number {
  switch (step) {
    case "C":
      return 0;
    case "D":
      return 1;
    case "E":
      return 2;
    case "F":
      return 3;
    case "G":
      return 4;
    case "A":
      return 5;
    case "B":
      return 6;
  }
}

function stepForIndex(index: number): Step {
  switch (index) {
    case 0:
      return "C";
    case 1:
      return "D";
    case 2:
      return "E";
    case 3:
      return "F";
    case 4:
      return "G";
    case 5:
      return "A";
    case 6:
      return "B";
    default:
      throw new RangeError(
        `invalid directed spelling step index: ${index.toString()}`,
      );
  }
}

function isSupportedAlteration(value: number): value is Alteration {
  return (
    value === -2 ||
    value === -1 ||
    value === 0 ||
    value === 1 ||
    value === 2
  );
}

function copyPitchClass(pitch: SpelledPitchClass): SpelledPitchClass {
  return Object.freeze({ step: pitch.step, alter: pitch.alter });
}

function copyDegree(degree: ChordDegree): ChordDegree {
  return Object.freeze({ number: degree.number, alter: degree.alter });
}

function spellChordDegreeCore(
  root: SpelledPitchClass,
  degree: ChordDegree,
): DegreeSpellingResult {
  const rootCopy = copyPitchClass(root);
  const degreeCopy = copyDegree(degree);
  const directedLetterIndex = stepIndex(root.step) + degree.number - 1;
  const targetStep = stepForIndex(directedLetterIndex % 7);
  const targetNaturalSemitone =
    NATURAL_SEMITONE[targetStep] + 12 * Math.floor(directedLetterIndex / 7);
  const targetSoundingSemitone =
    NATURAL_SEMITONE[root.step] +
    root.alter +
    COMPOUND_MAJOR_DEGREE_SEMITONES[degree.number] +
    degree.alter;
  const requiredAlteration = targetSoundingSemitone - targetNaturalSemitone;

  if (!isSupportedAlteration(requiredAlteration)) {
    const refusal = Object.freeze({
      code: "theory.spelling_accidental_out_of_range" as const,
      path: standaloneRefusalPath(),
      phase: "spelling" as const,
      degreeSpellingPolicyId: DEGREE_SPELLING_POLICY_ID,
      degreeSpellingPolicyVersion: DEGREE_SPELLING_POLICY_VERSION,
      root: rootCopy,
      degree: degreeCopy,
      requiredAlteration,
      minimum: MIN_DEGREE_SPELLING_ALTERATION,
      maximum: MAX_DEGREE_SPELLING_ALTERATION,
    });
    return Object.freeze({ ok: false, refusal });
  }

  const spelled = Object.freeze({
    step: targetStep,
    alter: requiredAlteration,
  });
  const value = Object.freeze({
    policyId: DEGREE_SPELLING_POLICY_ID,
    policyVersion: DEGREE_SPELLING_POLICY_VERSION,
    root: rootCopy,
    degree: degreeCopy,
    spelled,
    pitchClass: pitchClassOf(spelled),
  });
  return Object.freeze({ ok: true, value });
}

/** Spell one degree from its written root without enharmonic substitution. */
export const spellChordDegree: SpellChordDegree = spellChordDegreeCore;

/** Package-private deterministic work evidence used by the T1 proof adapter. */
export const spellChordDegreeWithEvidence: SpellChordDegreeWithEvidence = (
  root,
  degree,
) => {
  const result = spellChordDegreeCore(root, degree);
  if (result.ok) {
    const evidence = Object.freeze({
      inputDegreeRecordsVisited: 0,
      formulaPhaseTransitions: 0,
      candidateDegreesObserved: 0,
      duplicateDegreesCanonicalized: 0,
      realizationsProduced: 0,
      spellingAttempts: 1,
      degreesProduced: 1,
      warningsProduced: 0,
      peakCandidateDegreeRecords: 0,
      termination: "complete" as const,
    });
    return Object.freeze({ result, evidence });
  }

  const evidence = Object.freeze({
    inputDegreeRecordsVisited: 0,
    formulaPhaseTransitions: 0,
    candidateDegreesObserved: 0,
    duplicateDegreesCanonicalized: 0,
    realizationsProduced: 0,
    spellingAttempts: 1,
    degreesProduced: 0,
    warningsProduced: 0,
    peakCandidateDegreeRecords: 0,
    termination: "spelling-refusal" as const,
  });
  return Object.freeze({ result, evidence });
};
