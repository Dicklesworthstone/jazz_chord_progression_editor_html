import { describe, expect, test } from "bun:test";

import {
  makeMidiPitch,
  makeSpelledPitch,
  type Alteration,
  type MidiPitch,
  type SpelledPitch,
  type Step,
} from "../../src/domain";
import {
  assignVoiceTransition,
  type AssignedVoice,
  type AssignVoiceTransitionRequest,
  type UnassignedVoice,
} from "../../src/theory";
import {
  V1_TRANSITION_CASES,
  buildV1TransitionRequest,
  v1VoiceSet,
} from "../support/v1-assignment-fixtures";
import {
  V1_ORACLE_MAXIMUM_VOICES as ORACLE_MAXIMUM_VOICES,
  V1_ORACLE_MINIMUM_VOICES as ORACLE_MINIMUM_VOICES,
  compareV1OraclePaths as comparePaths,
  expectedV1OraclePathCount as expectedPathCount,
  v1IndependentOracleResult as oracleResult,
  type V1OracleCandidate as OracleCandidate,
} from "../support/v1-independent-oracle";

type PitchRecipe = readonly [
  step: Step,
  alter: Alteration,
  octave: number,
  midi: number,
];

function diagnostic(
  caseId: string,
  request: AssignVoiceTransitionRequest,
  oracle: ReturnType<typeof oracleResult>,
): string {
  const rows = request.from.voices.length + 1;
  const columns = request.to.voices.length + 1;
  const matrix: number[][] = Array.from(
    { length: rows },
    () => Array.from({ length: columns }, () => 0),
  );
  for (let sourcePrefix = 0; sourcePrefix < rows; sourcePrefix += 1) {
    for (let targetPrefix = 0; targetPrefix < columns; targetPrefix += 1) {
      if (sourcePrefix === 0 && targetPrefix === 0) {
        matrix[sourcePrefix]?.splice(targetPrefix, 1, 1);
        continue;
      }
      const diagonal = sourcePrefix > 0 && targetPrefix > 0
        ? matrix[sourcePrefix - 1]?.[targetPrefix - 1] ?? 0
        : 0;
      const leave = sourcePrefix > 0
        ? matrix[sourcePrefix - 1]?.[targetPrefix] ?? 0
        : 0;
      const enter = targetPrefix > 0
        ? matrix[sourcePrefix]?.[targetPrefix - 1] ?? 0
        : 0;
      matrix[sourcePrefix]?.splice(
        targetPrefix,
        1,
        diagonal + leave + enter,
      );
    }
  }
  let sourceCursor = request.from.voices.length;
  let targetCursor = request.to.voices.length;
  const backtrace = [...oracle.winner.path].reverse().map((step) => {
    const from = Object.freeze([sourceCursor, targetCursor] as const);
    if (step.kind === "match") {
      sourceCursor -= 1;
      targetCursor -= 1;
    } else if (step.kind === "leave") {
      sourceCursor -= 1;
    } else {
      targetCursor -= 1;
    }
    return Object.freeze({
      from,
      step,
      to: Object.freeze([sourceCursor, targetCursor] as const),
    });
  });
  return JSON.stringify({
    caseId,
    bounds: {
      maximumSourceVoices: ORACLE_MAXIMUM_VOICES,
      maximumTargetVoices: ORACLE_MAXIMUM_VOICES,
    },
    pathCount: oracle.pathCount,
    matrix,
    tiedBeforePath: oracle.tiedBeforePath,
    winningPath: oracle.winner.path,
    backtrace,
    backtraceOrigin: [sourceCursor, targetCursor],
    winningCost: oracle.winner.cost,
    winningSelectionPrefix: oracle.winner.selectionPrefix,
  });
}

const REVIEWED_UNLOCKED_SMALL_CASES = V1_TRANSITION_CASES.filter((recipe) => {
  const sourceCount = v1VoiceSet(recipe.sourceVoiceSetId, recipe.id).voices.length;
  const targetCount = v1VoiceSet(recipe.targetVoiceSetId, recipe.id).voices.length;
  return (
    (recipe.locks ?? []).length === 0 &&
    recipe.expected.termination === "complete-assigned" &&
    sourceCount >= ORACLE_MINIMUM_VOICES &&
    sourceCount <= ORACLE_MAXIMUM_VOICES &&
    targetCount >= ORACLE_MINIMUM_VOICES &&
    targetCount <= ORACLE_MAXIMUM_VOICES
  );
});

function builtPitch(recipe: PitchRecipe): Readonly<{
  midi: MidiPitch;
  pitch: SpelledPitch;
}> {
  const [step, alter, octave, midiValue] = recipe;
  const pitch = makeSpelledPitch({ step, alter, octave });
  const midi = makeMidiPitch(midiValue);
  if (!pitch.ok) throw new Error(`V1_ORACLE_PITCH:${pitch.refusal.code}`);
  if (!midi.ok) throw new Error(`V1_ORACLE_MIDI:${midi.refusal.code}`);
  return Object.freeze({ pitch: pitch.value, midi: midi.value });
}

function repitchVoice<T extends AssignedVoice | UnassignedVoice>(
  voice: T,
  recipe: PitchRecipe,
): T {
  return Object.freeze({ ...voice, ...builtPitch(recipe) }) as T;
}

function maximumLeapRegressionRequest(): AssignVoiceTransitionRequest {
  const fixture = V1_TRANSITION_CASES.find(({ id }) => id === "V1-ASN-002");
  if (fixture === undefined) throw new Error("V1_ORACLE_REGRESSION_FIXTURE");
  const request = buildV1TransitionRequest(fixture);
  const sourceRecipes = Object.freeze([
    ["C", 0, 2, 36],
    ["A", -1, 2, 44],
    ["A", -1, 3, 56],
  ] as const satisfies readonly PitchRecipe[]);
  const targetRecipes = Object.freeze([
    ["B", 0, 2, 47],
    ["B", 0, 3, 59],
    ["C", 0, 4, 60],
  ] as const satisfies readonly PitchRecipe[]);
  const fromVoices = Object.freeze(
    request.from.voices.map((voice, index) => {
      const recipe = sourceRecipes[index];
      if (recipe === undefined) throw new Error("V1_ORACLE_SOURCE_RECIPE");
      return repitchVoice(voice, recipe);
    }),
  ) as unknown as typeof request.from.voices;
  const toVoices = Object.freeze(
    request.to.voices.map((voice, index) => {
      const recipe = targetRecipes[index];
      if (recipe === undefined) throw new Error("V1_ORACLE_TARGET_RECIPE");
      return repitchVoice(voice, recipe);
    }),
  ) as unknown as typeof request.to.voices;
  return Object.freeze({
    ...request,
    from: Object.freeze({ ...request.from, voices: fromVoices }),
    to: Object.freeze({ ...request.to, voices: toVoices }),
  });
}

function compareWithMaximumLeap(
  left: OracleCandidate,
  right: OracleCandidate,
): number {
  const axes = (candidate: OracleCandidate): readonly number[] => [
    candidate.cost.alignmentCost,
    candidate.cost.commonTonesLost,
    candidate.cost.guideTonesLost,
    candidate.cost.maximumAbsoluteLeap,
    candidate.cost.gapCount,
    -candidate.cost.exactSustains,
    -candidate.cost.spelledPitchContinuities,
  ];
  const leftAxes = axes(left);
  const rightAxes = axes(right);
  for (let index = 0; index < leftAxes.length; index += 1) {
    const leftAxis = leftAxes[index];
    const rightAxis = rightAxes[index];
    if (leftAxis === undefined || rightAxis === undefined) {
      throw new Error("V1_ORACLE_LEAP_AXIS_INDEX");
    }
    const comparison = leftAxis < rightAxis ? -1 : leftAxis > rightAxis ? 1 : 0;
    if (comparison !== 0) return comparison;
  }
  return comparePaths(left.path, right.path);
}

describe("V1 independent exhaustive assignment oracle", () => {
  test("reviewed small-case coverage exercises every declared dimension", () => {
    const dimensions = new Set(
      REVIEWED_UNLOCKED_SMALL_CASES.map((recipe) => {
        const sourceCount = v1VoiceSet(recipe.sourceVoiceSetId, recipe.id).voices.length;
        const targetCount = v1VoiceSet(recipe.targetVoiceSetId, recipe.id).voices.length;
        return `${String(sourceCount)}x${String(targetCount)}`;
      }),
    );
    expect(dimensions).toEqual(new Set(["3x3", "3x4", "4x3", "4x4"]));
  });

  for (const recipe of REVIEWED_UNLOCKED_SMALL_CASES) {
    test(`${recipe.id} production winner equals all-path oracle`, () => {
      const request = buildV1TransitionRequest(recipe);
      const oracle = oracleResult(request);
      const detail = diagnostic(recipe.id, request, oracle);
      const result = assignVoiceTransition(request);
      expect(result.ok, detail).toBe(true);
      if (!result.ok) throw new Error(`${detail}:${result.refusal.code}`);
      expect(result.value.explanation.operationPath, detail).toEqual(
        oracle.winner.path,
      );
      expect(result.value.cost, detail).toEqual(oracle.winner.cost);
      expect(result.value.orderKey, detail).toEqual([
        ...oracle.winner.selectionPrefix,
        oracle.winner.path,
      ]);
      expect(oracle.pathCount, detail).toBe(
        expectedPathCount(
          request.from.voices.length,
          request.to.voices.length,
        ),
      );
    });
  }

  test("failure diagnostics include the bounded path-count matrix and exact winning backtrace", () => {
    const recipe = REVIEWED_UNLOCKED_SMALL_CASES[0];
    if (recipe === undefined) throw new Error("V1_ORACLE_DIAGNOSTIC_CASE");
    const request = buildV1TransitionRequest(recipe);
    const oracle = oracleResult(request);
    const detail = JSON.parse(diagnostic(recipe.id, request, oracle)) as {
      matrix: number[][];
      pathCount: number;
      backtrace: readonly unknown[];
      backtraceOrigin: readonly number[];
    };
    expect(detail.matrix).toHaveLength(request.from.voices.length + 1);
    expect(detail.matrix.every((row) =>
      row.length === request.to.voices.length + 1
    )).toBe(true);
    expect(detail.matrix.at(-1)?.at(-1)).toBe(detail.pathCount);
    expect(detail.backtrace).toHaveLength(oracle.winner.path.length);
    expect(detail.backtraceOrigin).toEqual([0, 0]);
  });

  test("maximum leap is reported but cannot outrank canonical gap count", () => {
    const request = maximumLeapRegressionRequest();
    const oracle = oracleResult(request);
    const maximumLeapWinner = [...oracle.candidates].sort(
      compareWithMaximumLeap,
    )[0];
    if (maximumLeapWinner === undefined) {
      throw new Error("V1_ORACLE_NO_LEAP_WINNER");
    }

    expect(oracle.winner.cost).toMatchObject({
      alignmentCost: 30,
      commonTonesLost: 1,
      guideTonesLost: 0,
      gapCount: 0,
      maximumAbsoluteLeap: 15,
    });
    expect(maximumLeapWinner.cost).toMatchObject({
      alignmentCost: 30,
      commonTonesLost: 1,
      guideTonesLost: 0,
      gapCount: 2,
      maximumAbsoluteLeap: 3,
    });
    expect(maximumLeapWinner.path).not.toEqual(oracle.winner.path);

    const result = assignVoiceTransition(request);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.refusal.code);
    expect(result.value.explanation.operationPath).toEqual(oracle.winner.path);
    expect(result.value.cost.maximumAbsoluteLeap).toBe(15);
    expect(result.value.orderKey).toEqual([
      ...oracle.winner.selectionPrefix,
      oracle.winner.path,
    ]);
  });
});
