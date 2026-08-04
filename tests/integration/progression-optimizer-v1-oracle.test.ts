import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  assignVoiceTransition,
  initializeVoiceFrame,
  runToTerminalWithRealOracle,
  type VoiceAssignmentOperations,
} from "../support/progression-optimizer-real-oracle";

setDefaultTimeout(240_000);

describe("V2-TRACE-V1-ORACLE-BINDING production optimizer over the real V1 engine", () => {
  const realOperations: VoiceAssignmentOperations = {
    initializeVoiceFrame,
    assignVoiceTransition,
  };

  test("a four-event chart optimizes with real transition costs and stays deterministic", () => {
    const first = runToTerminalWithRealOracle(realOperations, 4, 3, "v2-real-a");
    expect(first.outcome.kind).toBe("optimized");
    if (first.outcome.kind !== "optimized") return;
    expect(first.outcome.termination).toBe("complete");
    const selected = first.outcome.segments[0]?.realizations[0];
    expect(selected?.candidateIds).toHaveLength(4);
    expect(first.outcome.stats.counters.oracleTransitionCalls).toBeGreaterThan(0);
    expect(first.outcome.stats.counters.oracleRefusedTransitions).toBe(0);
    const second = runToTerminalWithRealOracle(realOperations, 4, 3, "v2-real-a");
    expect(second.outcome).toEqual(first.outcome);
  });

  test("the selected chain's aggregate equals the fold of real per-transition costs", () => {
    const run = runToTerminalWithRealOracle(realOperations, 3, 3, "v2-real-b");
    if (run.outcome.kind !== "optimized") throw new Error("expected optimized");
    const selected = run.outcome.segments[0]?.realizations[0];
    if (!selected) throw new Error("no selected realization");
    const refold = run.refoldSelected(selected.candidateIds);
    expect(selected.cost).toEqual(refold);
  });

  test("an impossible real lock produces a typed no-realization naming the lock", () => {
    const run = runToTerminalWithRealOracle(
      realOperations,
      2,
      2,
      "v2-real-lock",
      { impossibleLockOnLastEvent: true },
    );
    expect(run.outcome.kind).toBe("no-realization");
    if (run.outcome.kind !== "no-realization") return;
    expect(run.outcome.conflicts).toHaveLength(1);
    expect(run.outcome.conflicts[0]?.constraintRefs[0]?.kind).toBe("lock");
    expect(run.outcome.explanation.hardConstraintsRelaxed).toBe(false);
  });
});
