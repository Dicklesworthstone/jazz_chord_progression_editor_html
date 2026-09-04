import { expect, test } from "bun:test";
import fixture from "../fixtures/progression-optimizer/continuity-policy-cases.json";
import {
  PROGRESSION_CONTINUITY_COST_AXES, assignVoiceTransition,
  initializeProgressionOptimization, advanceProgressionOptimization, cancelProgressionOptimization,
  type UnassignedVoiceFrame, type ProgressionCost, type ProgressionOptimizationRequest,
} from "../../src/theory";
import { buildFrame, runToTerminal } from "../support/progression-optimizer-test-kit";
import { buildRealChartRequest } from "../support/progression-optimizer-real-oracle";
import { required, transitionCost, exhaustiveAlignment, continuityRequest, realVoiceOperations,
  chainCost, compareCosts } from "../support/progression-continuity";

function tuple(cost: ProgressionCost): readonly number[] {
  if (!("alignmentCost" in cost)) throw new Error("Missing continuity facts");
  return PROGRESSION_CONTINUITY_COST_AXES.map((axis) => cost[axis]);
}

for (const row of fixture.transitions) {
  test(`real V1 and independent exhaustive edit paths: ${row.id}`, () => {
    for (const shift of [0, -12, 12, 1, -1]) {
      const from = row.from.map((midi) => midi + shift);
      const to = row.to.map((midi) => midi + shift);
      const cost = transitionCost(buildFrame("event-a", "candidate-000", "balanced", from),
        buildFrame("event-b", "candidate-000", "balanced", to));
      expect(exhaustiveAlignment(from, to)).toBe(row.alignmentCost);
      for (const key of ["alignmentCost", "gapCount", "totalAbsoluteMotion", "totalSpan"] as const) {
        expect(cost[key]).toBe(row[key]);
      }
      expect(from.map((midi) => midi - shift)).toEqual(row.from);
      expect(to.map((midi) => midi - shift)).toEqual(row.to);
    }
  });
}

for (const row of fixture.comparisons) {
  test(`production policy ordering from independent table oracle: ${row.id}`, () => {
    const request = continuityRequest([[[60, 64, 67]], [[61, 65, 68], [62, 66, 69]]]);
    const targets = required(request.events, 1);
    if (targets.kind !== "auto") throw new Error("Expected auto");
    const renamed: ProgressionOptimizationRequest = { ...request, events: [required(request.events, 0), {
      ...targets, candidates: targets.candidates.map((frame, index) => ({ ...frame,
        roles: { ...frame.roles, candidateId: required(required(row.paths, index), 0) as UnassignedVoiceFrame["roles"]["candidateId"] },
      })).sort((a, b) => a.roles.candidateId < b.roles.candidateId ? -1 : 1),
    }] };
    const operations = { ...realVoiceOperations, assignVoiceTransition: (input: Parameters<typeof assignVoiceTransition>[0]) => {
      const result = assignVoiceTransition(input);
      if (!result.ok) return result;
      const index = row.paths.findIndex((path) => path[0] === input.to.roles.candidateId);
      const values = required(row.costs, index);
      return { ...result, value: { ...result.value, cost: { ...result.value.cost,
        alignmentCost: required(values, 0), gapCount: required(values, 1), totalSpan: required(values, 2),
        maximumAbsoluteLeap: required(values, 3), totalAbsoluteMotion: required(values, 4),
        commonTonesLost: required(values, 5), crowdedLowIntervals: required(values, 6),
        doubledGuideTones: required(values, 7), omittedColors: required(values, 8),
      } } };
    } };
    const { outcome } = runToTerminal(renamed, operations);
    if (outcome.kind !== "optimized") throw new Error(outcome.kind);
    expect(String(required(required(outcome.segments, 0).realizations, 0).candidateIds.at(-1)))
      .toBe(required(required(row.paths, row.winner), 0));
    expect(tuple(outcome.aggregateSelectedCost)).toEqual(required(row.costs, row.winner));
    if (row.id === "dropped-voices-are-not-free") {
      const legacy = runToTerminal({ ...renamed, identity: { ...renamed.identity, costPolicyVersion: 1 } }, operations).outcome;
      if (legacy.kind !== "optimized") throw new Error(legacy.kind);
      expect(required(required(legacy.segments, 0).realizations, 0).candidateIds.at(-1)).toBe("candidate-000");
      expect(Object.keys(legacy.aggregateSelectedCost)).toHaveLength(7);
    }
  });
}

test("finite charts match exhaustive complete-chain enumeration, including loop closure and transposition", () => {
  const shapes = [[[60, 64, 67], [60, 67, 76]], [[59, 62, 67], [55, 62, 71]],
    [[60, 64, 69], [57, 64, 72]], [[59, 65, 69], [53, 62, 71]]];
  for (const shift of [0, 12, -12, 1]) for (const loopClosure of [false, true]) {
    const request = { ...continuityRequest(shapes.map((event) => event.map((notes) => notes.map((midi) => midi + shift)))), loopClosure };
    let paths: UnassignedVoiceFrame[][] = [[]];
    for (const event of request.events) {
      if (event.kind !== "auto") throw new Error("Expected auto");
      paths = paths.flatMap((path) => event.candidates.map((frame) => [...path, frame]));
    }
    const ranked = paths.map((frames) => ({ frames, cost: chainCost(frames, loopClosure) }));
    ranked.sort((a, b) => compareCosts(a.cost, b.cost) ||
      (a.frames.map((f) => f.roles.candidateId).join("/") < b.frames.map((f) => f.roles.candidateId).join("/") ? -1 : 1));
    const expected = required(ranked, 0);
    const { outcome } = runToTerminal(request, realVoiceOperations);
    if (outcome.kind !== "optimized") throw new Error(outcome.kind);
    expect(outcome.termination).toBe("complete");
    expect(required(required(outcome.segments, 0).realizations, 0).candidateIds).toEqual(expected.frames.map((f) => f.roles.candidateId));
    expect(tuple(outcome.aggregateSelectedCost)).toEqual(expected.cost);
    expect(outcome.stats.memory.peakFrontierStates).toBeLessThanOrEqual(48);
    expect(outcome.stats.counters.workUnits).toBeLessThanOrEqual(1152);
  }
});

test("policy identity survives quantum resume, refuses edits, cancels and respects work cap", () => {
  const base = buildRealChartRequest(8, 24, "continuity-resume");
  const request: ProgressionOptimizationRequest = { ...base, identity: { ...base.identity, costPolicyVersion: 2 } };
  const initialized = initializeProgressionOptimization(request, realVoiceOperations);
  if (!initialized.ok) throw new Error(initialized.refusal.code);
  const first = advanceProgressionOptimization(initialized.value, realVoiceOperations);
  if (!first.ok) throw new Error(first.refusal.code);
  expect(first.value.status).toBe("running");
  for (const identity of [{ ...first.value.identity, costPolicyVersion: 1 as const },
    { ...first.value.identity, sourceRevision: 2 }]) {
    const stale = advanceProgressionOptimization({ ...first.value, identity }, realVoiceOperations);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.refusal.code).toBe("progression.resume_stale");
  }
  const cancelled = cancelProgressionOptimization(first.value, "stale-revision");
  if (!cancelled.ok) throw new Error(cancelled.refusal.code);
  expect(cancelled.value.outcome?.kind).toBe("cancelled");
  expect(cancelled.value.continuation).toBeNull();
  const capped = runToTerminal({ ...request, maxWorkQuanta: 1 }, realVoiceOperations);
  expect(capped.outcome.kind).toBe("unfinished");
  expect(capped.outcome.stats.counters.workUnits).toBe(1152);
  const complete = runToTerminal(request, realVoiceOperations);
  expect(complete.outcome.kind).toBe("optimized");
  expect(complete.outcome.identity.costPolicyVersion).toBe(2);
});

test("initialization snapshots policy identity and rejects unknown policies", () => {
  const request = continuityRequest([[[60,64,67]], [[61,65,68]]]);
  const identity = { ...request.identity };
  const initialized = initializeProgressionOptimization({ ...request, identity }, realVoiceOperations);
  if (!initialized.ok) throw new Error(initialized.refusal.code);
  identity.costPolicyVersion = 1;
  const next = advanceProgressionOptimization(initialized.value, realVoiceOperations);
  if (!next.ok) throw new Error(next.refusal.code);
  expect(next.value.identity.costPolicyVersion).toBe(2);
  const invalid = initializeProgressionOptimization({ ...request,
    identity: { ...identity, costPolicyVersion: 3 as 2 } }, realVoiceOperations);
  expect(invalid.ok).toBe(false);
  if (!invalid.ok) expect(invalid.refusal.code).toBe("progression.policy_invalid");
});

test("reset excludes a cross-section transition and fixed anchors survive both policies", () => {
  const base = continuityRequest([[[48,52,55]], [[60,64,67]], [[61,65,68],[73,77,80]]]);
  for (const version of [1, 2] as const) for (const fixedReason of ["manual", "frozen"] as const) {
    const middle = required(base.events, 1);
    if (middle.kind !== "auto") throw new Error("Expected candidate");
    const request: ProgressionOptimizationRequest = { ...base, identity: { ...base.identity, costPolicyVersion: version },
      events: [required(base.events, 0), { ...middle, kind: "fixed", chainBoundary: "reset", reason: fixedReason,
        candidate: required(middle.candidates, 0) }, required(base.events, 2)] };
    const result = runToTerminal(request, realVoiceOperations).outcome;
    if (result.kind !== "optimized") throw new Error(result.kind);
    expect(result.segments).toHaveLength(2);
    expect(required(required(result.segments, 1).realizations, 0).candidateIds).toEqual(["candidate-000", "candidate-000"]);
    expect(result.aggregateSelectedCost.totalAbsoluteMotion).toBe(3);
    if ("alignmentCost" in result.aggregateSelectedCost) expect(result.aggregateSelectedCost.alignmentCost).toBe(3);
  }
});
