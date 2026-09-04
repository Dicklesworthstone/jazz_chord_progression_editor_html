import {
  VOICE_ASSIGNMENT_POLICY_ID, VOICE_ASSIGNMENT_POLICY_VERSION,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA, assignVoiceTransition, initializeVoiceFrame,
  type UnassignedVoiceFrame, type VoiceAssignmentCost,
  type ProgressionOptimizationRequest,
} from "../../src/theory";
import { buildRealChartRequest } from "./progression-optimizer-real-oracle";
import { buildFrame, eventIdOf } from "./progression-optimizer-test-kit";

export const realVoiceOperations = { initializeVoiceFrame, assignVoiceTransition };

export function required<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing test element ${String(index)}`);
  return value;
}

export function transitionCost(from: UnassignedVoiceFrame, to: UnassignedVoiceFrame): VoiceAssignmentCost {
  const initialized = initializeVoiceFrame({
    schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA, kind: "initialize", requestId: "continuity-test", frame: from,
  });
  if (!initialized.ok) throw new Error(initialized.refusal.code);
  const assigned = assignVoiceTransition({
    schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA, kind: "transition", requestId: "continuity-test",
    from: initialized.value.frame, to, locks: [],
    policyId: VOICE_ASSIGNMENT_POLICY_ID, policyVersion: VOICE_ASSIGNMENT_POLICY_VERSION,
  });
  if (!assigned.ok) throw new Error(assigned.refusal.code);
  return assigned.value.cost;
}

/** Enumerate every order-preserving edit path; deliberately no production DP. */
export function exhaustiveAlignment(from: readonly number[], to: readonly number[]): number {
  function visit(i: number, j: number): number {
    if (i === from.length) return (to.length - j) * 12;
    if (j === to.length) return (from.length - i) * 12;
    return Math.min(
      Math.abs(required(from, i) - required(to, j)) + visit(i + 1, j + 1),
      12 + visit(i + 1, j),
      12 + visit(i, j + 1),
    );
  }
  return visit(0, 0);
}

export function continuityRequest(
  midis: readonly (readonly (readonly number[])[])[],
  version: 1 | 2 = 2,
): ProgressionOptimizationRequest {
  const base = buildRealChartRequest(1, 1, "continuity-test");
  return {
    ...base, identity: { ...base.identity, costPolicyVersion: version },
    events: midis.map((candidates, index) => ({
      schema: "changes.theory.progression-event.v1", kind: "auto",
      eventId: eventIdOf(`event-continuity-${String(index)}`),
      chainBoundary: index === 0 ? "reset" : "continue",
      constraints: { families: null, range: null, bassRange: null, locks: [] },
      candidates: candidates.map((notes, ordinal) => buildFrame(
        `event-continuity-${String(index)}`, `candidate-${String(ordinal).padStart(3, "0")}`, "balanced", notes,
      )),
    })),
  };
}

/** Separate explicit nine-fact fold; does not import optimizer policy helpers. */
export function chainCost(frames: readonly UnassignedVoiceFrame[], loop = false): readonly number[] {
  const edges = frames.slice(1).map((to, i) => transitionCost(required(frames, i), to));
  if (loop && frames.length > 0) edges.push(transitionCost(required(frames, frames.length - 1), required(frames, 0)));
  const sum = (key: keyof VoiceAssignmentCost) => edges.reduce((total, cost) => total + cost[key], 0);
  const max = (key: keyof VoiceAssignmentCost) => Math.max(0, ...edges.map((cost) => cost[key]));
  return [sum("alignmentCost"), sum("gapCount"), max("totalSpan"), max("maximumAbsoluteLeap"),
    sum("totalAbsoluteMotion"), sum("commonTonesLost"), sum("crowdedLowIntervals"),
    sum("doubledGuideTones"), sum("omittedColors")];
}

export function compareCosts(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const difference = required(a, i) - required(b, i);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Actual comping can have 1–2 voices, outside V1's 3–7-voice input domain. */
export function soundedEdge(from: readonly number[], to: readonly number[]) {
  let best: readonly number[] | undefined;
  function visit(i: number, j: number, motion: number, gaps: number, leap: number): void {
    if (i === from.length && j === to.length) {
      const cost = [motion + 12 * gaps, gaps, leap, motion];
      if (best === undefined || compareCosts(cost, best) < 0) best = cost;
      return;
    }
    if (i < from.length && j < to.length) {
      const step = Math.abs(required(from, i) - required(to, j));
      visit(i + 1, j + 1, motion + step, gaps, Math.max(leap, step));
    }
    if (i < from.length) visit(i + 1, j, motion, gaps + 1, leap);
    if (j < to.length) visit(i, j + 1, motion, gaps + 1, leap);
  }
  visit(0, 0, 0, 0, 0);
  if (best === undefined) throw new Error("No independent sounded path");
  return { alignmentCost: required(best, 0), gapCount: required(best, 1),
    maximumAbsoluteLeap: required(best, 2), totalAbsoluteMotion: required(best, 3),
    totalSpan: required(to, to.length - 1) - required(to, 0) };
}

export function soundedChain(frames: readonly UnassignedVoiceFrame[]): readonly number[] {
  const edges = frames.slice(1).map((frame, i) => soundedEdge(
    required(frames, i).voices.map((v) => v.midi), frame.voices.map((v) => v.midi)));
  return [edges.reduce((n, e) => n + e.alignmentCost, 0), edges.reduce((n, e) => n + e.gapCount, 0),
    Math.max(0, ...edges.map((e) => e.totalSpan)), Math.max(0, ...edges.map((e) => e.maximumAbsoluteLeap)),
    edges.reduce((n, e) => n + e.totalAbsoluteMotion, 0)];
}
