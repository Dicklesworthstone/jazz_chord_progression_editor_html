import { describe, expect, test } from "bun:test";

import type { ChordDegree, ChordSpec, CustomChordSpec } from "../../src/domain";
import { resolveChordWithEvidence } from "../../src/theory/chord-resolution";
import { parseChordSymbol } from "../../src/theory/chord-symbol";
import type { ResolutionWorkEvidence } from "../../src/theory/resolution-evidence-contract";

function mustParse(sourceText: string): ChordSpec {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) throw new Error(`evidence fixture did not parse: ${sourceText}`);
  return parsed.chord;
}

function withFields(
  sourceText: string,
  fields: Partial<ChordSpec> = {},
): ChordSpec {
  return { ...mustParse(sourceText), ...fields };
}

function expectedEvidence(
  values: readonly [
    inputDegreeRecordsVisited: number,
    formulaPhaseTransitions: number,
    candidateDegreesObserved: number,
    duplicateDegreesCanonicalized: number,
    realizationsProduced: number,
    spellingAttempts: number,
    degreesProduced: number,
    warningsProduced: number,
    peakCandidateDegreeRecords: number,
  ],
  termination: ResolutionWorkEvidence["termination"],
): ResolutionWorkEvidence {
  const [
    inputDegreeRecordsVisited,
    formulaPhaseTransitions,
    candidateDegreesObserved,
    duplicateDegreesCanonicalized,
    realizationsProduced,
    spellingAttempts,
    degreesProduced,
    warningsProduced,
    peakCandidateDegreeRecords,
  ] = values;
  return {
    inputDegreeRecordsVisited,
    formulaPhaseTransitions,
    candidateDegreesObserved,
    duplicateDegreesCanonicalized,
    realizationsProduced,
    spellingAttempts,
    degreesProduced,
    warningsProduced,
    peakCandidateDegreeRecords,
    termination,
  };
}

const CUSTOM_SOURCE = {
  kind: "custom",
  sourceText: "ordered duplicates",
  label: "ordered duplicates",
  pitchNames: [
    { step: "C", alter: 0 },
    { step: "G", alter: 0 },
    { step: "C", alter: 0 },
    { step: "E", alter: -1 },
  ],
  bass: null,
} as const satisfies CustomChordSpec;

const OUTPUT_LIMIT_ADDITIONS = [2, 3, 4, 6, 9, 11, 13].map(
  (number) => ({ number, alter: 0 }) as ChordDegree,
);
const OUTPUT_LIMIT_ALTERATIONS = [
  { number: 5, alter: 1 },
  { number: 9, alter: -1 },
  { number: 9, alter: 1 },
  { number: 11, alter: -1 },
  { number: 11, alter: 1 },
  { number: 13, alter: -1 },
  { number: 13, alter: 1 },
] as const satisfies readonly ChordDegree[];

describe("T1 exact resolver work evidence", () => {
  test("matches every successful parsed/custom evidence row", () => {
    const rows = [
      {
        source: mustParse("C"),
        evidence: expectedEvidence([0, 8, 3, 0, 1, 3, 3, 0, 3], "complete"),
      },
      {
        source: withFields("C11", {
          additions: [{ number: 9, alter: 0 }],
        }),
        evidence: expectedEvidence([2, 8, 7, 1, 1, 6, 6, 0, 7], "complete"),
      },
      {
        source: withFields("Csus4", { omissions: [3] }),
        evidence: expectedEvidence([1, 8, 4, 0, 1, 3, 3, 1, 3], "complete"),
      },
      {
        source: CUSTOM_SOURCE,
        evidence: expectedEvidence([0, 0, 0, 0, 1, 0, 0, 0, 0], "complete"),
      },
      {
        source: mustParse("C7alt"),
        evidence: expectedEvidence([0, 32, 20, 0, 4, 20, 20, 0, 5], "complete"),
      },
      {
        source: withFields("C7alt", {
          additions: [{ number: 9, alter: 0 }],
        }),
        evidence: expectedEvidence([1, 32, 24, 0, 4, 24, 24, 0, 6], "complete"),
      },
    ] as const;

    for (const { source, evidence } of rows) {
      const actual = resolveChordWithEvidence(source);
      expect(actual.result.ok).toBe(true);
      expect(actual.evidence).toEqual(evidence);
      expect(Object.isFrozen(actual.evidence)).toBe(true);
    }
  });

  test("matches every refusal termination, provenance, and decisive-work row", () => {
    const rows = [
      {
        source: withFields("Cdim", { sixth: { number: 6, alter: 0 } }),
        path: ["sixth"],
        code: "theory.sixth_invalid",
        evidence: expectedEvidence(
          [1, 0, 0, 0, 0, 0, 0, 0, 0],
          "formula-refusal",
        ),
      },
      {
        source: withFields("E", {
          sourceText: "E##",
          root: { step: "E", alter: 2 },
        }),
        path: ["root"],
        code: "theory.spelling_accidental_out_of_range",
        evidence: expectedEvidence(
          [0, 8, 3, 0, 0, 2, 0, 0, 3],
          "spelling-refusal",
        ),
      },
      {
        source: withFields("Dm", {
          sourceText: "D##m(add3)",
          root: { step: "D", alter: 2 },
          additions: [{ number: 3, alter: 0 }],
        }),
        path: ["additions", 0],
        code: "theory.spelling_accidental_out_of_range",
        evidence: expectedEvidence(
          [1, 8, 4, 0, 0, 3, 0, 0, 4],
          "spelling-refusal",
        ),
      },
      {
        source: withFields("C7", {
          sourceText: "C##7#9",
          root: { step: "C", alter: 2 },
          alterations: [{ number: 9, alter: 1 }],
        }),
        path: ["alterations", 0],
        code: "theory.spelling_accidental_out_of_range",
        evidence: expectedEvidence(
          [1, 8, 5, 0, 0, 5, 0, 0, 5],
          "spelling-refusal",
        ),
      },
      {
        source: withFields("E7alt", {
          sourceText: "E##7alt",
          root: { step: "E", alter: 2 },
        }),
        path: ["root"],
        code: "theory.spelling_accidental_out_of_range",
        evidence: expectedEvidence(
          [0, 29, 20, 0, 0, 2, 0, 0, 5],
          "spelling-refusal",
        ),
      },
      {
        source: withFields("Cdim", {
          additions: OUTPUT_LIMIT_ADDITIONS,
          alterations: OUTPUT_LIMIT_ALTERATIONS,
        }),
        path: [],
        code: "limit.theory_realization_degrees_exceeded",
        evidence: expectedEvidence(
          [14, 7, 17, 0, 0, 0, 0, 0, 17],
          "output-limit-refusal",
        ),
      },
    ] as const;

    for (const { source, path, code, evidence } of rows) {
      const actual = resolveChordWithEvidence(source);
      expect(actual.result.ok).toBe(false);
      if (actual.result.ok) continue;
      expect(actual.result.refusal.code).toBe(code);
      expect(actual.result.refusal.path).toEqual(path);
      expect(Object.keys(actual.result)).toEqual(["ok", "refusal"]);
      expect(actual.evidence).toEqual(evidence);
      expect(Object.isFrozen(actual.result.refusal)).toBe(true);
      expect(Object.isFrozen(actual.evidence)).toBe(true);
    }
  });
});
