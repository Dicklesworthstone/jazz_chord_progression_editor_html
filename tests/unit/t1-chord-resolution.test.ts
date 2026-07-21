import { describe, expect, test } from "bun:test";

import type {
  ChordDegree,
  ChordSpec,
  CustomChordSpec,
  SpelledPitchClass,
} from "../../src/domain";
import {
  resolveChord,
  resolveChordWithEvidence,
} from "../../src/theory/chord-resolution";
import { parseChordSymbol } from "../../src/theory/chord-symbol";

function mustParse(sourceText: string): ChordSpec {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) throw new Error(`test symbol did not parse: ${sourceText}`);
  return parsed.chord;
}

function base(overrides: Partial<ChordSpec> = {}): ChordSpec {
  return {
    kind: "parsed",
    sourceText: "C",
    root: { step: "C", alter: 0 },
    triad: "major",
    sixth: null,
    seventh: null,
    extensions: [],
    additions: [],
    alterations: [],
    omissions: [],
    bass: null,
    colorPolicy: "none",
    ...overrides,
  };
}

type ModifierArrayField =
  | "extensions"
  | "additions"
  | "alterations"
  | "omissions";

type ModifierReadCounts = Record<ModifierArrayField, number>;

function emptyModifierReadCounts(): ModifierReadCounts {
  return { extensions: 0, additions: 0, alterations: 0, omissions: 0 };
}

function observedModifierArray<Value>(
  field: ModifierArrayField,
  values: readonly Value[],
  reads: ModifierReadCounts,
  firstForbiddenIndex = Number.POSITIVE_INFINITY,
): readonly Value[] {
  return new Proxy([...values], {
    get(target, property, receiver) {
      if (
        typeof property === "string" &&
        /^(?:0|[1-9][0-9]*)$/.test(property)
      ) {
        const index = Number(property);
        if (index >= firstForbiddenIndex) {
          throw new Error(
            `unexpected post-refusal ${field}[${index.toString()}] read`,
          );
        }
        reads[field] += 1;
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
}

function token(degree: ChordDegree): string {
  const accidental =
    degree.alter === -2
      ? "bb"
      : degree.alter === -1
        ? "b"
        : degree.alter === 1
          ? "#"
          : degree.alter === 2
            ? "##"
            : "";
  return `${accidental}${degree.number.toString()}`;
}

function literal(sourceText: string) {
  const result = resolveChord(mustParse(sourceText));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`resolution refused: ${sourceText}`);
  const realization = result.value.realizations[0];
  return { result, realization };
}

describe("T1 chord resolution", () => {
  test("selects exact formula families and Balanced roles", () => {
    const cases = [
      ["C", "base-major", ["1", "3", "5"], ["1", "3"], ["5"], ["3"]],
      ["Cdim7", "seventh-diminished", ["1", "b3", "b5", "bb7"], ["1", "b3", "b5", "bb7"], [], ["b3", "bb7"]],
      ["Cmaj11", "extension-major", ["1", "3", "5", "7", "9", "11"], ["1", "3", "7", "11"], ["5", "9"], ["3", "7"]],
      ["C13sus4", "extension-suspended-dominant", ["1", "4", "5", "b7", "9", "11", "13"], ["1", "4", "b7", "13"], ["5", "9", "11"], ["4", "b7"]],
    ] as const;

    for (const [symbol, rule, degrees, required, optional, guides] of cases) {
      const { realization } = literal(symbol);
      expect(realization.formulaRuleId).toBe(rule);
      expect(realization.degrees.map(token)).toEqual([...degrees]);
      expect(realization.requiredDegrees.map(token)).toEqual([...required]);
      expect(realization.optionalDegrees.map(token)).toEqual([...optional]);
      expect(realization.guideToneDegrees.map(token)).toEqual([...guides]);
    }
  });

  test("preserves all four altered variants and later natural ninths", () => {
    const { result } = literal("C7alt(add9)");
    expect(result.value.realizations.map(({ id }) => id)).toEqual([
      "alt-b9-b5",
      "alt-b9-sharp5",
      "alt-sharp9-b5",
      "alt-sharp9-sharp5",
    ]);
    expect(
      result.value.realizations.map((realization) =>
        realization.degrees.map(token),
      ),
    ).toEqual([
      ["1", "3", "b5", "b7", "b9", "9"],
      ["1", "3", "#5", "b7", "b9", "9"],
      ["1", "3", "b5", "b7", "9", "#9"],
      ["1", "3", "#5", "b7", "9", "#9"],
    ]);
  });

  test("applies suspension, alteration, addition, omission, and role merging in order", () => {
    expect(literal("Csus4(add3)").realization).toMatchObject({
      degrees: [
        { number: 1, alter: 0 },
        { number: 3, alter: 0 },
        { number: 4, alter: 0 },
        { number: 5, alter: 0 },
      ],
      guideToneDegrees: [{ number: 4, alter: 0 }],
    });
    expect(literal("C6/9(add2)").realization).toMatchObject({
      requiredDegrees: [
        { number: 1, alter: 0 },
        { number: 2, alter: 0 },
        { number: 3, alter: 0 },
        { number: 6, alter: 0 },
      ],
      optionalDegrees: [
        { number: 5, alter: 0 },
        { number: 9, alter: 0 },
      ],
    });
    const warning = resolveChord(mustParse("Csus4(no3)"));
    expect(warning).toMatchObject({
      ok: true,
      value: {
        warnings: [
          {
            code: "theory.omission_absent",
            path: ["omissions", 0],
            degreeNumber: 3,
          },
        ],
      },
    });
  });

  test("returns the exact first refusal and source-owned paths", () => {
    expect(
      resolveChord(
        base({
          sixth: { number: 6, alter: -1 },
          extensions: [{ number: 7, alter: 0 }],
        }),
      ),
    ).toEqual({
      ok: false,
      refusal: {
        code: "theory.sixth_invalid",
        path: ["sixth"],
        phase: "base",
        ruleId: "base-major",
        received: { number: 6, alter: -1 },
        reason: "alteration",
      },
    });
    expect(
      resolveChord(
        base({
          sourceText: "D##m(add3)",
          root: { step: "D", alter: 2 },
          triad: "minor",
          additions: [{ number: 3, alter: 0 }],
        }),
      ),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "theory.spelling_accidental_out_of_range",
        path: ["additions", 0],
        degree: { number: 3, alter: 0 },
        requiredAlteration: 3,
      },
    });
  });

  test("reports deterministic complete and limit evidence", () => {
    expect(resolveChordWithEvidence(mustParse("C7alt"))).toMatchObject({
      evidence: {
        inputDegreeRecordsVisited: 0,
        formulaPhaseTransitions: 32,
        candidateDegreesObserved: 20,
        realizationsProduced: 4,
        spellingAttempts: 20,
        degreesProduced: 20,
        peakCandidateDegreeRecords: 5,
        termination: "complete",
      },
    });

    const limit = resolveChordWithEvidence(
      base({
        triad: "diminished",
        additions: [2, 3, 4, 6, 9, 11, 13].map((number) => ({
          number,
          alter: 0,
        })) as readonly ChordDegree[],
        alterations: [
          { number: 5, alter: 1 },
          { number: 9, alter: -1 },
          { number: 9, alter: 1 },
          { number: 11, alter: -1 },
          { number: 11, alter: 1 },
          { number: 13, alter: -1 },
          { number: 13, alter: 1 },
        ],
      }),
    );
    expect(limit).toMatchObject({
      result: {
        ok: false,
        refusal: {
          code: "limit.theory_realization_degrees_exceeded",
          path: [],
          received: 17,
          maximum: 16,
        },
      },
      evidence: {
        inputDegreeRecordsVisited: 14,
        formulaPhaseTransitions: 7,
        candidateDegreesObserved: 17,
        spellingAttempts: 0,
        termination: "output-limit-refusal",
      },
    });
  });

  test("reads every valid modifier input record exactly once", () => {
    const reads = emptyModifierReadCounts();
    const source = base({
      sourceText: "C7alt-max-valid-modifiers",
      seventh: "minor",
      extensions: observedModifierArray("extensions", [], reads),
      additions: observedModifierArray(
        "additions",
        [2, 3, 4, 6, 9, 11, 13].map(
          (number) => ({ number, alter: 0 }) as ChordDegree,
        ),
        reads,
      ),
      alterations: observedModifierArray(
        "alterations",
        [
          { number: 11, alter: -1 },
          { number: 11, alter: 1 },
          { number: 13, alter: -1 },
          { number: 13, alter: 1 },
        ] as const satisfies readonly ChordDegree[],
        reads,
      ),
      omissions: observedModifierArray("omissions", [], reads),
      colorPolicy: "altered-dominant",
    });

    const envelope = resolveChordWithEvidence(source);

    expect(envelope.result.ok).toBe(true);
    expect(envelope.evidence.inputDegreeRecordsVisited).toBe(11);
    expect(reads).toEqual({
      extensions: 0,
      additions: 7,
      alterations: 4,
      omissions: 0,
    });
    expect(Object.values(reads).reduce((total, count) => total + count, 0)).toBe(
      envelope.evidence.inputDegreeRecordsVisited,
    );
    if (!envelope.result.ok) throw new Error("expected max-width success");
    expect(envelope.result.value.source.additions).not.toBe(source.additions);
    expect(envelope.result.value.source.alterations).not.toBe(
      source.alterations,
    );
    expect(Object.isFrozen(envelope.result.value.source.additions)).toBe(true);
    expect(Object.isFrozen(envelope.result.value.source.alterations)).toBe(true);
  });

  test("captures every scalar source fact once before resolution", () => {
    const topLevelReads: Record<string, number> = {};
    const rootReads: Record<string, number> = {};
    const bassReads: Record<string, number> = {};
    const observedPitch = (
      pitch: SpelledPitchClass,
      reads: Record<string, number>,
    ): SpelledPitchClass =>
      new Proxy(pitch, {
        get(target, property, receiver) {
          if (typeof property === "string") {
            reads[property] = (reads[property] ?? 0) + 1;
            if (reads[property] !== 1) {
              throw new Error(`re-read pitch scalar ${property}`);
            }
          }
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
    const target = base({
      sourceText: "getter-observed-source",
      root: observedPitch({ step: "F", alter: 1 }, rootReads),
      triad: "minor",
      seventh: "minor",
      bass: observedPitch({ step: "C", alter: 1 }, bassReads),
    });
    const source = new Proxy(target, {
      get(proxyTarget, property, receiver) {
        if (typeof property === "string") {
          topLevelReads[property] = (topLevelReads[property] ?? 0) + 1;
          if (topLevelReads[property] !== 1) {
            throw new Error(`re-read source scalar ${property}`);
          }
        }
        return Reflect.get(proxyTarget, property, receiver) as unknown;
      },
    });

    const envelope = resolveChordWithEvidence(source);

    expect(envelope.result.ok).toBe(true);
    expect(topLevelReads).toEqual({
      kind: 1,
      sourceText: 1,
      root: 1,
      triad: 1,
      sixth: 1,
      seventh: 1,
      extensions: 1,
      additions: 1,
      alterations: 1,
      omissions: 1,
      bass: 1,
      colorPolicy: 1,
    });
    expect(rootReads).toEqual({ step: 1, alter: 1 });
    expect(bassReads).toEqual({ step: 1, alter: 1 });
    if (!envelope.result.ok) throw new Error("expected observed-source success");
    expect(envelope.result.value.source).toMatchObject({
      sourceText: "getter-observed-source",
      root: { step: "F", alter: 1 },
      triad: "minor",
      seventh: "minor",
      bass: { step: "C", alter: 1 },
    });
  });

  test("stops original-array reads at the first excess record", () => {
    const reads = emptyModifierReadCounts();
    const additions = [2, 3, 4, 6, 9, 11, 13, 2, 3].map(
      (number) => ({ number, alter: 0 }) as ChordDegree,
    );
    const source = base({
      extensions: observedModifierArray("extensions", [], reads),
      additions: observedModifierArray("additions", additions, reads, 8),
      alterations: observedModifierArray(
        "alterations",
        [{ number: 11, alter: -1 }] as const satisfies readonly ChordDegree[],
        reads,
        0,
      ),
      omissions: observedModifierArray("omissions", [3] as const, reads, 0),
    });

    const envelope = resolveChordWithEvidence(source);

    expect(envelope.result).toMatchObject({
      ok: false,
      refusal: {
        code: "theory.addition_invalid",
        path: ["additions", 7],
        reason: "count",
      },
    });
    expect(envelope.evidence).toMatchObject({
      inputDegreeRecordsVisited: 8,
      formulaPhaseTransitions: 0,
      termination: "formula-refusal",
    });
    expect(reads).toEqual({
      extensions: 0,
      additions: 8,
      alterations: 0,
      omissions: 0,
    });
    expect(Object.values(reads).reduce((total, count) => total + count, 0)).toBe(
      envelope.evidence.inputDegreeRecordsVisited,
    );
  });

  test("projects custom pitches exactly and deep-freezes copies without freezing input", () => {
    const input: CustomChordSpec = {
      kind: "custom",
      sourceText: "cluster",
      label: "Cluster",
      pitchNames: [
        { step: "C", alter: 0 },
        { step: "D", alter: 1 },
        { step: "E", alter: -1 },
        { step: "C", alter: 0 },
      ],
      bass: { step: "G", alter: -1 },
    };
    const result = resolveChord(input);
    expect(result).toMatchObject({
      ok: true,
      value: {
        source: input,
        bass: { step: "G", alter: -1 },
        warnings: [],
        realizations: [
          {
            kind: "custom",
            degrees: null,
            spelledPitchNames: input.pitchNames,
            pitchClasses: [0, 3, 3, 0],
            limitations: [
              "custom.no_degree_analysis",
              "custom.no_auto_voicing",
            ],
          },
        ],
      },
    });
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.pitchNames)).toBe(false);
    if (!result.ok || result.value.source.kind !== "custom") {
      throw new Error("expected a custom resolution");
    }
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.source.pitchNames)).toBe(true);
    expect(result.value.source).not.toBe(input);
  });

  test("ignores misleading source text and keeps slash bass separate", () => {
    const root: SpelledPitchClass = { step: "F", alter: 1 };
    const result = resolveChord(
      base({
        sourceText: "Cmaj7",
        root,
        triad: "minor",
        seventh: "minor",
        bass: { step: "C", alter: 0 },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        source: { sourceText: "Cmaj7", root, triad: "minor" },
        bass: { step: "C", alter: 0 },
        realizations: [
          {
            formulaRuleId: "seventh-minor",
            spelledPitchNames: [
              { step: "F", alter: 1 },
              { step: "A", alter: 0 },
              { step: "C", alter: 1 },
              { step: "E", alter: 0 },
            ],
          },
        ],
      },
    });
  });
});
