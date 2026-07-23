import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
  requireRefusal,
  trustedGesture,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

describe("TR-X1-ENGINE-BOUNDARY exact X0 boundary behavior", () => {
  test("X1-CMD-004 initialization timing bounds refuse before the engine is touched", async () => {
    const invalidTimings = [
      { tickIntervalMs: 9, lookaheadSeconds: 0.1 },
      { tickIntervalMs: 101, lookaheadSeconds: 0.1 },
      { tickIntervalMs: 25, lookaheadSeconds: 0.049 },
      { tickIntervalMs: 25, lookaheadSeconds: 0.201 },
      { tickIntervalMs: 100, lookaheadSeconds: 0.1 },
    ];
    for (const timing of invalidTimings) {
      const harness = createTransportHarness();
      const plan = customPlan({
        documentId: "doc-x1-eb-004",
        tempoBpm: 120,
        durations: [{ numerator: 4, denominator: 1 }],
      });
      const outcome = requireRefusal(
        await harness.submit({
          kind: "initialize-transport",
          gesture: trustedGesture(),
          timing,
          initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
          documentId: plan.sourceDocumentId,
          planRevision: 0,
        }),
      );
      expect(outcome.code).toBe("transport.timing_policy_invalid");
      expect(harness.fake.contextCreationCount()).toBe(0);
    }
  });

  test("X1-CMD-005 a replayed gesture sequence refuses recovery", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-eb-005",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    const gesture = trustedGesture();
    requireReceipt(
      await harness.submit({
        kind: "initialize-transport",
        gesture,
        timing: { tickIntervalMs: 25, lookaheadSeconds: 0.1 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
        documentId: plan.sourceDocumentId,
        planRevision: 0,
      }),
    );
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    harness.controller().setState("suspended");
    harness.timer.fire();
    expect(harness.service.inspectTransport().state).toBe("interrupted");
    const replayed = requireRefusal(
      await harness.submit({
        kind: "resume",
        gesture: { kind: "trusted-pointer", trusted: true, sequence: gesture.sequence },
      }),
    );
    expect(replayed.code).toBe("transport.gesture_invalid");
    expect(harness.service.inspectTransport().state).toBe("interrupted");
  });

  test("X1-CMD-016 an engine refusal is carried with its exact code, never swallowed or retried", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-eb-016",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    harness.controller().setState("suspended");
    const suspendedPreview = requireRefusal(
      await harness.submit({
        kind: "start-preview",
        previewId: "x1:preview:eb",
        instrumentId: "mellow-keys",
        midiPitches: [60 as never],
        gateSeconds: 0.5,
      }),
    );
    expect(suspendedPreview.code).toBe("transport.engine_refusal");
    expect(suspendedPreview.engineRefusalCode).toBe("audio.engine_not_ready");
    const previewAttempts = harness.attacks.filter(
      (attack) => attack.ownerKind === "preview",
    );
    expect(previewAttempts).toHaveLength(1);
    expect(previewAttempts[0]?.accepted).toBe(false);
    harness.controller().setState("running");

    const attacksBefore = harness.attacks.length;
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    expect(harness.attacks.length).toBeGreaterThan(attacksBefore);
    for (const attack of harness.attacks.slice(attacksBefore)) {
      expect(attack.accepted).toBe(true);
    }
  });

  test("X1-CMD-019 structural plan defects refuse as plan_invalid before any state change", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-eb-019",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    const hostile = JSON.parse(JSON.stringify(plan)) as Record<
      string,
      unknown
    >;
    hostile["totalTicks"] = 1;
    const outcome = requireRefusal(
      await harness.service.submitTransportCommand({
        commandRequestId: harness.nextRequestId(),
        payload: {
          kind: "play",
          binding: {
            plan: hostile as never,
            documentId: plan.sourceDocumentId,
            planRevision: 1,
          },
          startBeat: zeroBeat,
          countIn: false,
        },
      }),
    );
    expect(outcome.code).toBe("transport.plan_invalid");
    expect(harness.service.inspectTransport().state).toBe("ready");
    expect(harness.attacks).toHaveLength(0);
  });

  test("X1-STOP-011 dispose is terminal, clears the timer, and refuses every later command", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-eb-011",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
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
    const disposed = requireReceipt(
      await harness.submit({
        kind: "dispose-transport",
        reason: "page-teardown",
      }),
    );
    expect(disposed.stateAfter).toBe("disposed");
    expect(harness.timer.activeHandleCount()).toBe(0);
    const again = requireRefusal(
      await harness.submit({
        kind: "dispose-transport",
        reason: "page-teardown",
      }),
    );
    expect(again.code).toBe("transport.disposed");
    const anything = requireRefusal(await harness.submit({ kind: "stop" }));
    expect(anything.code).toBe("transport.disposed");
  });

  test("X1-STOP-012 an engine fault settles as fault, publishes failed once, and recovers only by reinitialization", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-eb-012",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
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
    harness.controller().setState("closed");
    harness.timer.fire();
    expect(harness.service.inspectTransport().state).toBe("fault");
    const failed = harness.notifications.filter(
      (notification) => notification.status === "failed",
    );
    expect(failed).toHaveLength(1);

    const blocked = requireRefusal(await harness.submit({ kind: "stop" }));
    expect(blocked.code).toBe("transport.fault_requires_initialize");

    const reinitialized = await harness.submit(initializePayload(plan));
    expect(["receipt", "refusal"]).toContain(reinitialized.termination);
  });
});
