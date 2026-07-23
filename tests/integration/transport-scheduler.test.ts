import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

function beat(numerator: number, denominator: number): BeatPosition {
  const made = makeBeatPosition({ numerator, denominator });
  if (!made.ok) throw new Error(`beat ${String(numerator)}/${String(denominator)}`);
  return made.value;
}

const zeroBeat = beat(0, 1);

describe("TR-X1-LOOKAHEAD-SCHEDULER production scheduler", () => {
  test("X1-SCHED-001 one schedule per event across overlapping ticks", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-sched-001",
      tempoBpm: 120,
      durations: [
        { numerator: 1, denominator: 1 },
        { numerator: 1, denominator: 1 },
        { numerator: 1, denominator: 1 },
      ],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    for (const clock of [0, 0.025, 0.05, 0.075, 0.1]) {
      harness.setClock(clock);
      harness.timer.fire();
    }
    const progression = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression",
    );
    expect(progression).toHaveLength(1);
    expect(progression[0]?.startTimeSeconds).toBe(0);
  });

  test("X1-SCHED-002 events inside one horizon are issued in ascending exact start order", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-sched-002",
      tempoBpm: 240,
      durations: [
        { numerator: 1, denominator: 4 },
        { numerator: 1, denominator: 8 },
        { numerator: 1, denominator: 8 },
      ],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    harness.timer.fire();
    const starts = harness.attacks
      .filter((attack) => attack.ownerKind === "progression")
      .map((attack) => attack.startTimeSeconds);
    expect(starts).toEqual([0, 0.0625, 0.09375]);
  });

  test("X1-SCHED-003 a stale tick after a generation boundary schedules nothing", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-sched-003",
      tempoBpm: 120,
      durations: [
        { numerator: 4, denominator: 1 },
        { numerator: 4, denominator: 1 },
      ],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    requireReceipt(await harness.submit({ kind: "stop" }));
    const staleBefore =
      harness.service.inspectTransport().work.staleCallbacksIgnored;
    const attacksBefore =
      harness.service.inspectTransport().work.attackBatchesIssued;
    harness.setClock(1.5);
    harness.timer.fire(3);
    const after = harness.service.inspectTransport();
    expect(after.work.attackBatchesIssued).toBe(attacksBefore);
    expect(after.work.staleCallbacksIgnored).toBe(staleBefore);
    expect(harness.timer.activeHandleCount()).toBe(0);
  });

  test("X1-SCHED-004 a loop wrap crosses one generation boundary and re-anchors without recreating the graph", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-sched-004",
      tempoBpm: 120,
      durations: [
        { numerator: 1, denominator: 1 },
        { numerator: 1, denominator: 1 },
      ],
      loop: {
        start: { numerator: 0, denominator: 1 },
        end: { numerator: 2, denominator: 1 },
      },
    });
    expect(plan.loop).not.toBeNull();
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const generationBefore = harness.service.inspectTransport().generation;
    const wrapsBefore = harness.service.inspectTransport().work.loopWraps;
    let clock = 0;
    let guard = 0;
    while (
      harness.service.inspectTransport().work.loopWraps === wrapsBefore
    ) {
      clock += 0.025;
      harness.setClock(clock);
      harness.timer.fire();
      guard += 1;
      if (guard > 200) throw new Error("loop wrap never happened");
    }
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.work.loopWraps).toBe(wrapsBefore + 1);
    expect(snapshot.generation).toBe(generationBefore + 1);
    expect(snapshot.state).toBe("playing");
    expect(harness.fake.contextCreationCount()).toBe(1);
    const wrapRetirement = harness.retirements.at(-1);
    expect(wrapRetirement?.selectorKind).toBe("generation");
  });

  test("X1-SCHED-005 no attack ever leads the clock by more than the frozen lookahead ceiling", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-sched-005",
      tempoBpm: 20,
      durations: [
        { numerator: 1, denominator: 1 },
        { numerator: 1, denominator: 1 },
        { numerator: 1, denominator: 1 },
      ],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const observedLeads: number[] = [];
    let clock = 0;
    const seen = new Set<number>();
    while (clock < 10) {
      clock += 0.1;
      harness.setClock(clock);
      const before = harness.attacks.length;
      harness.timer.fire();
      for (const attack of harness.attacks.slice(before)) {
        if (!seen.has(attack.startTimeSeconds)) {
          seen.add(attack.startTimeSeconds);
          observedLeads.push(attack.startTimeSeconds - clock);
        }
      }
    }
    expect(observedLeads.length).toBeGreaterThan(0);
    for (const lead of observedLeads) {
      expect(lead).toBeLessThanOrEqual(0.2);
      expect(lead).toBeLessThanOrEqual(0.25 - 0.05);
    }
  });

  test("X1-SCHED-010 the control timer is cleared once no unscheduled work remains without a loop", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-sched-010",
      tempoBpm: 120,
      durations: [{ numerator: 1, denominator: 2 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    expect(harness.timer.activeHandleCount()).toBe(1);
    harness.setClock(0.3);
    harness.timer.fire();
    expect(harness.timer.activeHandleCount()).toBe(0);
    expect(harness.service.inspectTransport().state).toBe("ready");
  });

  test("X1-SCHED-011 an empty timeline publishes an immediate natural end at ready", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-sched-011a",
      tempoBpm: 120,
      durations: [{ numerator: 1, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    const endsBefore =
      harness.service.inspectTransport().work.naturalEndsPublished;
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: beat(1, 1),
        countIn: false,
      }),
    );
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.work.naturalEndsPublished).toBe(endsBefore + 1);
    expect(snapshot.state).toBe("ready");
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("ready");
    expect(last?.playhead).toEqual(beat(1, 1));
  });

  test("X1-SCHED-013 no animation frame exists in the platform port and ticks alone drive scheduling", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-sched-013",
      tempoBpm: 120,
      durations: [{ numerator: 1, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const attacksAfterPlay = harness.attacks.length;
    expect(attacksAfterPlay).toBeGreaterThan(0);
    harness.setClock(0.05);
    const before = harness.service.inspectTransport().work.schedulerTicks;
    harness.timer.fire();
    expect(harness.service.inspectTransport().work.schedulerTicks).toBe(
      before + 1,
    );
  });

  test("X1-SCHED-014 a frozen audio clock advances no beats and schedules nothing new", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-sched-014",
      tempoBpm: 120,
      durations: [
        { numerator: 1, denominator: 1 },
        { numerator: 4, denominator: 1 },
      ],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const attacksBefore = harness.attacks.length;
    harness.timer.fire(3);
    expect(harness.attacks.length).toBe(attacksBefore);
    const paused = requireReceipt(await harness.submit({ kind: "pause" }));
    expect(paused.stateAfter).toBe("paused");
    const last = harness.notifications.at(-1);
    expect(last?.playhead).toEqual(zeroBeat);
  });
});
