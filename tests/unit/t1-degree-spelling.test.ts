import { describe, expect, test } from "bun:test";

import {
  type Alteration,
  type ChordDegree,
  type DegreeNumber,
  type PitchClass,
  type SpelledPitchClass,
  type Step,
} from "../../src/domain";
import {
  spellChordDegree,
  spellChordDegreeWithEvidence,
} from "../../src/theory/degree-spelling";

const ROOT_STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const ALTERATIONS = [-2, -1, 0, 1, 2] as const;
const DEGREE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 9, 11, 13] as const;
const NATURAL_SEMITONE = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} satisfies Readonly<Record<Step, number>>);
const DEGREE_SEMITONES = Object.freeze({
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

function pitch(step: Step, alter: Alteration): SpelledPitchClass {
  return { step, alter };
}

function degree(number: DegreeNumber, alter: Alteration): ChordDegree {
  return { number, alter };
}

function isAlteration(value: number): value is Alteration {
  return (
    value === -2 ||
    value === -1 ||
    value === 0 ||
    value === 1 ||
    value === 2
  );
}

function euclideanPitchClass(value: number): PitchClass {
  const normalized = ((value % 12) + 12) % 12;
  switch (normalized) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
    case 10:
    case 11:
      return normalized;
    default:
      throw new RangeError(
        `invalid pitch-class projection: ${normalized.toString()}`,
      );
  }
}

function independentExpected(
  root: SpelledPitchClass,
  chordDegree: ChordDegree,
) {
  const rootLetter = ROOT_STEPS.indexOf(root.step);
  const directedLetter = rootLetter + chordDegree.number - 1;
  const targetStep = ROOT_STEPS[directedLetter % ROOT_STEPS.length];
  if (targetStep === undefined) {
    throw new RangeError(
      `invalid independent target: ${directedLetter.toString()}`,
    );
  }
  const sounding =
    NATURAL_SEMITONE[root.step] +
    root.alter +
    DEGREE_SEMITONES[chordDegree.number] +
    chordDegree.alter;
  const naturalTarget =
    NATURAL_SEMITONE[targetStep] +
    12 * Math.floor(directedLetter / ROOT_STEPS.length);
  const requiredAlteration = sounding - naturalTarget;

  if (!isAlteration(requiredAlteration)) {
    return {
      ok: false as const,
      refusal: {
        code: "theory.spelling_accidental_out_of_range" as const,
        path: ["degree"] as const,
        phase: "spelling" as const,
        degreeSpellingPolicyId: "changes.degree-spelling" as const,
        degreeSpellingPolicyVersion: 1 as const,
        root,
        degree: chordDegree,
        requiredAlteration,
        minimum: -2 as const,
        maximum: 2 as const,
      },
    };
  }

  return {
    ok: true as const,
    value: {
      policyId: "changes.degree-spelling" as const,
      policyVersion: 1 as const,
      root,
      degree: chordDegree,
      spelled: { step: targetStep, alter: requiredAlteration },
      pitchClass: euclideanPitchClass(sounding),
    },
  };
}

describe("T1 directed degree spelling", () => {
  test("preserves degree-correct letters across enharmonic collisions", () => {
    expect(spellChordDegree(pitch("D", -1), degree(7, -1))).toEqual({
      ok: true,
      value: {
        policyId: "changes.degree-spelling",
        policyVersion: 1,
        root: pitch("D", -1),
        degree: degree(7, -1),
        spelled: pitch("C", -1),
        pitchClass: 11,
      },
    });

    const sharpNine = spellChordDegree(pitch("C", 0), degree(9, 1));
    const flatThree = spellChordDegree(pitch("C", 0), degree(3, -1));
    expect(sharpNine).toEqual({
      ok: true,
      value: {
        policyId: "changes.degree-spelling",
        policyVersion: 1,
        root: pitch("C", 0),
        degree: degree(9, 1),
        spelled: pitch("D", 1),
        pitchClass: 3,
      },
    });
    expect(flatThree).toEqual({
      ok: true,
      value: {
        policyId: "changes.degree-spelling",
        policyVersion: 1,
        root: pitch("C", 0),
        degree: degree(3, -1),
        spelled: pitch("E", -1),
        pitchClass: 3,
      },
    });
  });

  test("retains diminished-seventh identity and compound directed letters", () => {
    expect(spellChordDegree(pitch("G", 0), degree(7, -2))).toEqual(
      independentExpected(pitch("G", 0), degree(7, -2)),
    );
    expect(spellChordDegree(pitch("A", -1), degree(7, -2))).toEqual(
      independentExpected(pitch("A", -1), degree(7, -2)),
    );
    expect(spellChordDegree(pitch("F", 1), degree(11, -1))).toEqual(
      independentExpected(pitch("F", 1), degree(11, -1)),
    );

    const gDiminishedSeventh = spellChordDegree(
      pitch("G", 0),
      degree(7, -2),
    );
    const aFlatDiminishedSeventh = spellChordDegree(
      pitch("A", -1),
      degree(7, -2),
    );
    expect(gDiminishedSeventh.ok && gDiminishedSeventh.value.spelled).toEqual(
      pitch("F", -1),
    );
    expect(
      aFlatDiminishedSeventh.ok && aFlatDiminishedSeventh.value.spelled,
    ).toEqual(pitch("G", -2));
  });

  test("returns exact typed refusals at both triple-accidental boundaries", () => {
    expect(spellChordDegree(pitch("C", 2), degree(9, 1))).toEqual({
      ok: false,
      refusal: {
        code: "theory.spelling_accidental_out_of_range",
        path: ["degree"],
        phase: "spelling",
        degreeSpellingPolicyId: "changes.degree-spelling",
        degreeSpellingPolicyVersion: 1,
        root: pitch("C", 2),
        degree: degree(9, 1),
        requiredAlteration: 3,
        minimum: -2,
        maximum: 2,
      },
    });
    expect(spellChordDegree(pitch("C", -2), degree(9, -1))).toEqual({
      ok: false,
      refusal: {
        code: "theory.spelling_accidental_out_of_range",
        path: ["degree"],
        phase: "spelling",
        degreeSpellingPolicyId: "changes.degree-spelling",
        degreeSpellingPolicyVersion: 1,
        root: pitch("C", -2),
        degree: degree(9, -1),
        requiredAlteration: -3,
        minimum: -2,
        maximum: 2,
      },
    });
  });

  test("matches an independent oracle over all 1,750 public domain cells", () => {
    let successes = 0;
    let refusals = 0;
    let minimumRequiredAlteration = Number.POSITIVE_INFINITY;
    let maximumRequiredAlteration = Number.NEGATIVE_INFINITY;
    const byDegree = new Map<DegreeNumber, readonly [number, number]>();

    for (const number of DEGREE_NUMBERS) {
      let degreeSuccesses = 0;
      let degreeRefusals = 0;
      for (const rootStep of ROOT_STEPS) {
        for (const rootAlter of ALTERATIONS) {
          for (const degreeAlter of ALTERATIONS) {
            const root = pitch(rootStep, rootAlter);
            const chordDegree = degree(number, degreeAlter);
            const expected = independentExpected(root, chordDegree);
            const actual = spellChordDegree(root, chordDegree);
            expect(actual).toEqual(expected);

            if (expected.ok) {
              successes += 1;
              degreeSuccesses += 1;
            } else {
              refusals += 1;
              degreeRefusals += 1;
              minimumRequiredAlteration = Math.min(
                minimumRequiredAlteration,
                expected.refusal.requiredAlteration,
              );
              maximumRequiredAlteration = Math.max(
                maximumRequiredAlteration,
                expected.refusal.requiredAlteration,
              );
            }
          }
        }
      }
      byDegree.set(number, [degreeSuccesses, degreeRefusals]);
    }

    expect({ successes, refusals }).toEqual({ successes: 1308, refusals: 442 });
    expect({ minimumRequiredAlteration, maximumRequiredAlteration }).toEqual({
      minimumRequiredAlteration: -5,
      maximumRequiredAlteration: 5,
    });
    expect([...byDegree]).toEqual([
      [1, [133, 42]],
      [2, [131, 44]],
      [3, [129, 46]],
      [4, [132, 43]],
      [5, [132, 43]],
      [6, [130, 45]],
      [7, [128, 47]],
      [9, [131, 44]],
      [11, [132, 43]],
      [13, [130, 45]],
    ]);
  });

  test("deep-freezes copied output without mutating or freezing inputs", () => {
    const root = { step: "D", alter: -1 } satisfies SpelledPitchClass;
    const chordDegree = { number: 7, alter: -1 } satisfies ChordDegree;
    const before = structuredClone({ root, chordDegree });
    const result = spellChordDegree(root, chordDegree);

    expect({ root, chordDegree }).toEqual(before);
    expect(Object.isFrozen(root)).toBe(false);
    expect(Object.isFrozen(chordDegree)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected spelling success");
    expect(result.value.root).not.toBe(root);
    expect(result.value.degree).not.toBe(chordDegree);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.root)).toBe(true);
    expect(Object.isFrozen(result.value.degree)).toBe(true);
    expect(Object.isFrozen(result.value.spelled)).toBe(true);
  });

  test("reports exact single-attempt evidence on success and refusal", () => {
    const success = spellChordDegreeWithEvidence(
      pitch("D", -1),
      degree(7, -1),
    );
    expect(success.result).toEqual(
      independentExpected(pitch("D", -1), degree(7, -1)),
    );
    expect(success.evidence).toEqual({
      inputDegreeRecordsVisited: 0,
      formulaPhaseTransitions: 0,
      candidateDegreesObserved: 0,
      duplicateDegreesCanonicalized: 0,
      realizationsProduced: 0,
      spellingAttempts: 1,
      degreesProduced: 1,
      warningsProduced: 0,
      peakCandidateDegreeRecords: 0,
      termination: "complete",
    });
    const refusal = spellChordDegreeWithEvidence(
      pitch("C", 2),
      degree(9, 1),
    );
    expect(refusal.result).toEqual(
      independentExpected(pitch("C", 2), degree(9, 1)),
    );
    expect(refusal.evidence).toEqual({
      inputDegreeRecordsVisited: 0,
      formulaPhaseTransitions: 0,
      candidateDegreesObserved: 0,
      duplicateDegreesCanonicalized: 0,
      realizationsProduced: 0,
      spellingAttempts: 1,
      degreesProduced: 0,
      warningsProduced: 0,
      peakCandidateDegreeRecords: 0,
      termination: "spelling-refusal",
    });
    expect(Object.isFrozen(refusal)).toBe(true);
    expect(Object.isFrozen(refusal.evidence)).toBe(true);
  });
});
