import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  advanceProgressionOptimization,
  cancelProgressionOptimization,
  initializeProgressionOptimization,
  PROGRESSION_WORK_COUNTER_NAMES,
  type ProgressionSearchState,
} from "../../src/theory";
import {
  buildRequest,
  buildStubOperations,
  cancelAfter,
  expectOutcomeMatchesFixture,
  requireCase,
  runFixtureCase,
  runToTerminal,
} from "../support/progression-optimizer-test-kit";

setDefaultTimeout(240_000);

describe("V2-TRACE-STEPPER the section-9 state machine", () => {
  test("V2-STP-001 initialize validates, seeds nothing, consumes no quanta", async () => {
    const fixture = await requireCase("V2-OPT-001");
    const result = initializeProgressionOptimization(
      buildRequest(fixture),
      buildStubOperations(fixture),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("running");
    expect(result.value.quantaConsumed).toBe(0);
    for (const name of PROGRESSION_WORK_COUNTER_NAMES) {
      expect(result.value.stats.counters[name]).toBe(0);
    }
  });

  test("V2-STP-002 quantum-by-quantum trajectory over a two-quantum search", async () => {
    const fixture = await requireCase("V2-LIM-002");
    const operations = buildStubOperations(fixture);
    const request = buildRequest(fixture);
    const initialized = initializeProgressionOptimization(request, operations);
    if (!initialized.ok) throw new Error("initialize refused");
    const first = advanceProgressionOptimization(initialized.value, operations);
    if (!first.ok) throw new Error("advance one refused");
    expect(first.value.status).toBe("running");
    expect(first.value.quantaConsumed).toBe(1);
    expect(first.value.stats.counters.workUnits).toBe(1152);
    const second = advanceProgressionOptimization(first.value, operations);
    if (!second.ok) throw new Error("advance two refused");
    expect(second.value.status).toBe("terminal");
    expect(second.value.quantaConsumed).toBe(2);
    expect(second.value.stats.counters.workUnits).toBe(1752);
    expect(second.value.outcome?.kind).toBe("optimized");
    expect(second.value.outcome?.termination).toBe("exhausted");
  });

  test("V2-STP-003 stepped execution matches the schedule-invariant fixture outcome", async () => {
    const { fixture, run } = await runFixtureCase("V2-LIM-002");
    expectOutcomeMatchesFixture(fixture, run.outcome);
    const again = runToTerminal(
      buildRequest(fixture),
      buildStubOperations(fixture),
    );
    expect(again.outcome).toEqual(run.outcome);
  });

  test("V2-STP-004 user cancellation freezes stats at the cut with no options", async () => {
    const fixture = await requireCase("V2-LIM-002");
    const cancelled = cancelAfter(
      buildRequest(fixture),
      buildStubOperations(fixture),
      1,
      "user-cancel",
    );
    expect(cancelled.status).toBe("terminal");
    expect(cancelled.quantaConsumed).toBe(1);
    expect(cancelled.stats.counters.workUnits).toBe(1152);
    expect(cancelled.outcome?.kind).toBe("cancelled");
    if (cancelled.outcome?.kind !== "cancelled") return;
    expect(cancelled.outcome.cancelReason).toBe("user-cancel");
    expect(cancelled.outcome.stats.memory.peakRealizationRecords).toBe(0);
  });

  test("V2-STP-005 stale-revision cancellation before any quantum", async () => {
    const fixture = await requireCase("V2-OPT-001");
    const cancelled = cancelAfter(
      buildRequest(fixture),
      buildStubOperations(fixture),
      0,
      "stale-revision",
    );
    expect(cancelled.quantaConsumed).toBe(0);
    expect(cancelled.stats.counters.workUnits).toBe(0);
    expect(cancelled.outcome?.kind).toBe("cancelled");
    if (cancelled.outcome?.kind !== "cancelled") return;
    expect(cancelled.outcome.cancelReason).toBe("stale-revision");
  });

  test("V2-STP-006 advancing a terminal state refuses", async () => {
    const { run, operations } = await runFixtureCase("V2-OPT-001");
    expect(run.terminal.quantaConsumed).toBe(1);
    const advanced = advanceProgressionOptimization(run.terminal, operations);
    expect(advanced.ok).toBe(false);
    if (advanced.ok) return;
    expect(advanced.refusal.code).toBe("progression.resume_invalid");
    expect(advanced.refusal.path).toEqual(["status"]);
  });

  test("V2-STP-007 cancelling a terminal state refuses", async () => {
    const { run } = await runFixtureCase("V2-OPT-001");
    const cancelled = cancelProgressionOptimization(run.terminal, "user-cancel");
    expect(cancelled.ok).toBe(false);
    if (cancelled.ok) return;
    expect(cancelled.refusal.code).toBe("progression.resume_invalid");
  });

  test("V2-STP-008 a tampered continuation version tag refuses as stale", async () => {
    const fixture = await requireCase("V2-OPT-001");
    const operations = buildStubOperations(fixture);
    const initialized = initializeProgressionOptimization(
      buildRequest(fixture),
      operations,
    );
    if (!initialized.ok) throw new Error("initialize refused");
    const tampered = {
      ...initialized.value,
      continuation: {
        ...(initialized.value.continuation ?? {
          schema: initialized.value.schema,
          engineVersionTag: "",
          payload: null,
        }),
        engineVersionTag: "changes.progression-optimizer.v2",
      },
    } as unknown as ProgressionSearchState;
    const advanced = advanceProgressionOptimization(tampered, operations);
    expect(advanced.ok).toBe(false);
    if (advanced.ok) return;
    expect(advanced.refusal.code).toBe("progression.resume_stale");
    expect(advanced.refusal.path).toEqual(["continuation", "engineVersionTag"]);
  });
});

describe("V2-TRACE-NO-PARTIAL cancelled and capped outcomes carry no options", () => {
  test("V2-LIM-005 and cancellations expose diagnostics only", async () => {
    const { run } = await runFixtureCase("V2-LIM-005");
    expect(run.outcome.kind).toBe("unfinished");
    expect("segments" in run.outcome).toBe(false);
  });
});
