import type {
  ChordDegree,
  SpelledPitch,
} from "../../src/domain";
import type {
  AssignVoiceTransitionRequest,
  UnassignedVoice,
  VoiceAssignmentCost,
  VoiceAssignmentOperationPath,
  VoiceAssignmentOperationStep,
} from "../../src/theory/voice-assignment-contract";

export const V1_ORACLE_MINIMUM_VOICES = 3;
export const V1_ORACLE_MAXIMUM_VOICES = 4;
const REVIEWED_GAP_COST = 12;
const REVIEWED_PATH_COUNTS: Readonly<Record<string, number>> = Object.freeze({
  "3x3": 63,
  "3x4": 129,
  "4x3": 129,
  "4x4": 321,
});

type OracleVoice = Pick<
  UnassignedVoice,
  "degree" | "guideTone" | "midi" | "pitch"
>;

type OracleSelectionPrefix = readonly [
  alignmentCost: number,
  commonTonesLost: number,
  guideTonesLost: number,
  gapCount: number,
  negativeExactSustains: number,
  negativeSpelledPitchContinuities: number,
];

export type V1OracleCandidate = Readonly<{
  path: VoiceAssignmentOperationPath;
  selectionPrefix: OracleSelectionPrefix;
  cost: VoiceAssignmentCost;
}>;

const operationRank: Readonly<
  Record<VoiceAssignmentOperationStep["kind"], number>
> = Object.freeze({ match: 0, leave: 1, enter: 2 });

export function expectedV1OraclePathCount(
  sourceCount: number,
  targetCount: number,
): number {
  const key = `${String(sourceCount)}x${String(targetCount)}`;
  const count = REVIEWED_PATH_COUNTS[key];
  if (count === undefined) {
    throw new Error(`V1_ORACLE_UNREVIEWED_DIMENSIONS:${key}`);
  }
  return count;
}

function requiredMember<Value>(
  values: readonly Value[],
  index: number,
  label: string,
): Value {
  const value = values[index];
  if (value === undefined) throw new Error(`V1_ORACLE_REQUIRED:${label}`);
  return value;
}

/** Test-only exhaustive enumeration; it imports no production selector. */
function enumerateOrderPreservingPaths(
  sourceCount: number,
  targetCount: number,
): readonly VoiceAssignmentOperationPath[] {
  if (
    sourceCount < V1_ORACLE_MINIMUM_VOICES ||
    sourceCount > V1_ORACLE_MAXIMUM_VOICES ||
    targetCount < V1_ORACLE_MINIMUM_VOICES ||
    targetCount > V1_ORACLE_MAXIMUM_VOICES
  ) {
    throw new Error(
      `V1_ORACLE_BOUND:${String(sourceCount)}x${String(targetCount)}`,
    );
  }

  const paths: VoiceAssignmentOperationPath[] = [];
  const partial: VoiceAssignmentOperationStep[] = [];
  const visit = (sourceOrdinal: number, targetOrdinal: number): void => {
    if (sourceOrdinal === sourceCount && targetOrdinal === targetCount) {
      paths.push(Object.freeze([...partial]) as VoiceAssignmentOperationPath);
      return;
    }
    if (sourceOrdinal < sourceCount && targetOrdinal < targetCount) {
      partial.push({ kind: "match", sourceOrdinal, targetOrdinal });
      visit(sourceOrdinal + 1, targetOrdinal + 1);
      partial.pop();
    }
    if (sourceOrdinal < sourceCount) {
      partial.push({ kind: "leave", sourceOrdinal, targetOrdinal: null });
      visit(sourceOrdinal + 1, targetOrdinal);
      partial.pop();
    }
    if (targetOrdinal < targetCount) {
      partial.push({ kind: "enter", sourceOrdinal: null, targetOrdinal });
      visit(sourceOrdinal, targetOrdinal + 1);
      partial.pop();
    }
  };

  visit(0, 0);
  const expected = expectedV1OraclePathCount(sourceCount, targetCount);
  if (paths.length !== expected) {
    throw new Error(
      `V1_ORACLE_PATH_COUNT:${String(paths.length)}:${String(expected)}`,
    );
  }
  return Object.freeze(paths);
}

function modulo12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function sameDegree(
  left: ChordDegree | null,
  right: ChordDegree | null,
): boolean {
  return (
    (left === null && right === null) ||
    (left !== null &&
      right !== null &&
      left.number === right.number &&
      left.alter === right.alter)
  );
}

function sameSpelledPitchClass(
  left: SpelledPitch,
  right: SpelledPitch,
): boolean {
  return left.step === right.step && left.alter === right.alter;
}

function sameSpelledPitch(left: SpelledPitch, right: SpelledPitch): boolean {
  return sameSpelledPitchClass(left, right) && left.octave === right.octave;
}

function commonTonePool(
  source: readonly OracleVoice[],
  target: readonly OracleVoice[],
): number {
  const remaining = new Map<number, number>();
  for (const voice of target) {
    const pitchClass = modulo12(voice.midi);
    remaining.set(pitchClass, (remaining.get(pitchClass) ?? 0) + 1);
  }
  let intersection = 0;
  for (const voice of source) {
    const pitchClass = modulo12(voice.midi);
    const available = remaining.get(pitchClass) ?? 0;
    if (available > 0) {
      intersection += 1;
      remaining.set(pitchClass, available - 1);
    }
  }
  return intersection;
}

function minimumSpacing(lowerMidi: number): number {
  if (lowerMidi <= 35) return 10;
  if (lowerMidi <= 47) return 7;
  if (lowerMidi <= 59) return 4;
  return 1;
}

function targetLocalFacts(request: AssignVoiceTransitionRequest): Pick<
  VoiceAssignmentCost,
  "crowdedLowIntervals" | "doubledGuideTones" | "omittedColors" | "totalSpan"
> {
  let crowdedLowIntervals = 0;
  for (let index = 0; index + 1 < request.to.voices.length; index += 1) {
    const lower = request.to.voices[index];
    const upper = request.to.voices[index + 1];
    if (lower === undefined || upper === undefined) {
      throw new Error("V1_ORACLE_TARGET_PAIR");
    }
    if (upper.midi - lower.midi < minimumSpacing(lower.midi)) {
      crowdedLowIntervals += 1;
    }
  }

  let doubledGuideTones = 0;
  for (const guideDegree of request.to.roles.guideDegrees) {
    const occurrences = request.to.voices.filter(
      ({ degree }) => degree !== null && sameDegree(degree, guideDegree),
    ).length;
    doubledGuideTones += Math.max(0, occurrences - 1);
  }
  const omittedColors = request.to.roles.colorDegrees.filter(
    (colorDegree) =>
      !request.to.voices.some(
        ({ degree }) => degree !== null && sameDegree(degree, colorDegree),
      ),
  ).length;
  const lowest = requiredMember(request.to.voices, 0, "lowest-target");
  const highest = requiredMember(
    request.to.voices,
    request.to.voices.length - 1,
    "highest-target",
  );
  return {
    crowdedLowIntervals,
    doubledGuideTones,
    omittedColors,
    totalSpan: highest.midi - lowest.midi,
  };
}

function scorePath(
  request: AssignVoiceTransitionRequest,
  path: VoiceAssignmentOperationPath,
): V1OracleCandidate {
  let enteringVoices = 0;
  let leavingVoices = 0;
  let totalAbsoluteMotion = 0;
  let maximumAbsoluteLeap = 0;
  let pitchClassCommonTones = 0;
  let exactSustains = 0;
  let spelledPitchClassContinuities = 0;
  let spelledPitchContinuities = 0;
  let guideToneContinuities = 0;

  for (const step of path) {
    if (step.kind === "enter") {
      enteringVoices += 1;
      continue;
    }
    if (step.kind === "leave") {
      leavingVoices += 1;
      continue;
    }
    const source = request.from.voices[step.sourceOrdinal];
    const target = request.to.voices[step.targetOrdinal];
    if (source === undefined || target === undefined) {
      throw new Error("V1_ORACLE_MATCH_ORDINAL");
    }
    const absoluteMotion = Math.abs(target.midi - source.midi);
    totalAbsoluteMotion += absoluteMotion;
    maximumAbsoluteLeap = Math.max(maximumAbsoluteLeap, absoluteMotion);
    if (source.midi === target.midi) exactSustains += 1;
    if (modulo12(source.midi) === modulo12(target.midi)) {
      pitchClassCommonTones += 1;
    }
    if (sameSpelledPitchClass(source.pitch, target.pitch)) {
      spelledPitchClassContinuities += 1;
    }
    if (sameSpelledPitch(source.pitch, target.pitch)) {
      spelledPitchContinuities += 1;
    }
    if (
      source.guideTone &&
      target.guideTone &&
      source.degree !== null &&
      target.degree !== null &&
      sameDegree(source.degree, target.degree)
    ) {
      guideToneContinuities += 1;
    }
  }

  const gapCount = enteringVoices + leavingVoices;
  const commonTonesLost =
    commonTonePool(request.from.voices, request.to.voices) -
    pitchClassCommonTones;
  const guideTonesLost =
    request.from.voices.filter(({ guideTone }) => guideTone).length -
    guideToneContinuities;
  const alignmentCost =
    totalAbsoluteMotion + REVIEWED_GAP_COST * gapCount;
  const cost = Object.freeze({
    alignmentCost,
    gapCount,
    enteringVoices,
    leavingVoices,
    totalAbsoluteMotion,
    maximumAbsoluteLeap,
    pitchClassCommonTones,
    exactSustains,
    spelledPitchClassContinuities,
    spelledPitchContinuities,
    commonTonesLost,
    guideToneContinuities,
    guideTonesLost,
    ...targetLocalFacts(request),
  });
  const selectionPrefix: OracleSelectionPrefix = Object.freeze([
    alignmentCost,
    commonTonesLost,
    guideTonesLost,
    gapCount,
    -exactSustains,
    -spelledPitchContinuities,
  ]);
  return Object.freeze({ path, cost, selectionPrefix });
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePathStep(
  left: VoiceAssignmentOperationStep,
  right: VoiceAssignmentOperationStep,
): number {
  const rankComparison = compareNumber(
    operationRank[left.kind],
    operationRank[right.kind],
  );
  if (rankComparison !== 0) return rankComparison;
  const sourceComparison = compareNumber(
    left.sourceOrdinal ?? -1,
    right.sourceOrdinal ?? -1,
  );
  if (sourceComparison !== 0) return sourceComparison;
  return compareNumber(left.targetOrdinal ?? -1, right.targetOrdinal ?? -1);
}

export function compareV1OraclePaths(
  left: VoiceAssignmentOperationPath,
  right: VoiceAssignmentOperationPath,
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftStep = left[index];
    const rightStep = right[index];
    if (leftStep === undefined || rightStep === undefined) {
      throw new Error("V1_ORACLE_PATH_INDEX");
    }
    const comparison = comparePathStep(leftStep, rightStep);
    if (comparison !== 0) return comparison;
  }
  return compareNumber(left.length, right.length);
}

function comparePrefixes(
  left: OracleSelectionPrefix,
  right: OracleSelectionPrefix,
): number {
  for (let index = 0; index < left.length; index += 1) {
    const leftAxis = left[index];
    const rightAxis = right[index];
    if (leftAxis === undefined || rightAxis === undefined) {
      throw new Error("V1_ORACLE_PREFIX_INDEX");
    }
    const comparison = compareNumber(leftAxis, rightAxis);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function compareCandidates(
  left: V1OracleCandidate,
  right: V1OracleCandidate,
): number {
  const prefixComparison = comparePrefixes(
    left.selectionPrefix,
    right.selectionPrefix,
  );
  return prefixComparison === 0
    ? compareV1OraclePaths(left.path, right.path)
    : prefixComparison;
}

export function v1IndependentOracleResult(
  request: AssignVoiceTransitionRequest,
): Readonly<{
  candidates: readonly V1OracleCandidate[];
  pathCount: number;
  tiedBeforePath: number;
  winner: V1OracleCandidate;
}> {
  const paths = enumerateOrderPreservingPaths(
    request.from.voices.length,
    request.to.voices.length,
  );
  const candidates = Object.freeze(paths.map((path) => scorePath(request, path)));
  const winner = [...candidates].sort(compareCandidates)[0];
  if (winner === undefined) throw new Error("V1_ORACLE_NO_CANDIDATE");
  return Object.freeze({
    candidates,
    pathCount: paths.length,
    tiedBeforePath: candidates.filter(
      ({ selectionPrefix }) =>
        comparePrefixes(selectionPrefix, winner.selectionPrefix) === 0,
    ).length,
    winner,
  });
}
