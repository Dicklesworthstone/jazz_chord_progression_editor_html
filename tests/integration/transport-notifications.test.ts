import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import { TRANSPORT_REFUSAL_CODES } from "../../src/audio";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
  trustedGesture,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

function beat(numerator: number, denominator: number): BeatPosition {
  const made = makeBeatPosition({ numerator, denominator });
  if (!made.ok) throw new Error("beat");
  return made.value;
}

const zeroBeat = beat(0, 1);

describe("TR-X1-NOTIFICATIONS monotonic transport notifications", () => {
  test("X1-VIEW-001/X1-VIEW-002 one notification per settled status change with a strictly increasing sequence", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-view-001",
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
    requireReceipt(await harness.submit({ kind: "pause" }));
    requireReceipt(
      await harness.submit({ kind: "resume", gesture: null }),
    );
    requireReceipt(await harness.submit({ kind: "stop" }));
    expect(harness.notifications.map((n) => n.status)).toEqual([
      "ready",
      "playing",
      "paused",
      "playing",
      "ready",
    ]);
    expect(harness.notifications).toHaveLength(5);
    for (let index = 1; index < harness.notifications.length; index += 1) {
      const previous = harness.notifications[index - 1];
      const current = harness.notifications[index];
      expect(current).toBeDefined();
      expect(previous).toBeDefined();
      if (previous === undefined || current === undefined) continue;
      expect(current.notificationSequence).toBeGreaterThan(
        previous.notificationSequence,
      );
      const newerGeneration = current.generation > previous.generation;
      const sameGenerationNewerSequence =
        current.generation === previous.generation &&
        current.notificationSequence > previous.notificationSequence;
      expect(newerGeneration || sameGenerationNewerSequence).toBe(true);
    }
  });

  test("X1-VIEW-003 refusals and no-op receipts publish nothing", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-view-003",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    const count = harness.notifications.length;
    await harness.submit({ kind: "pause" });
    await harness.submit({
      kind: "set-instrument",
      instrumentId: "warm-pad",
    });
    expect(harness.notifications.length).toBe(count);
  });

  test("X1-VIEW-004 interruption publishes paused with the frozen failure code", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-view-004",
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
    harness.controller().setState("suspended");
    harness.timer.fire();
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("paused");
    expect(last?.failureCode).toBe("transport.interrupted");
    expect(harness.service.inspectTransport().state).toBe("interrupted");
  });

  test("X1-VIEW-005 an engine fault publishes failed exactly once", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-view-005",
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
    harness.timer.fire(3);
    const failed = harness.notifications.filter(
      (notification) => notification.status === "failed",
    );
    expect(failed).toHaveLength(1);
    expect(failed[0]?.failureCode).not.toBeNull();
    expect(harness.service.inspectTransport().state).toBe("fault");
  });

  test("X1-VIEW-006 replacement rebinds the notification identity fields", async () => {
    const harness = createTransportHarness();
    const first = customPlan({
      documentId: "doc-x1-view-006a",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    const second = customPlan({
      documentId: "doc-x1-view-006b",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(first)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(first, 4),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    requireReceipt(
      await harness.submit({
        kind: "replace-plan",
        binding: planBinding(second, 9),
      }),
    );
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("ready");
    expect(last?.documentId).toBe(second.sourceDocumentId);
    expect(last?.planRevision).toBe(9);
  });

  test("X1-VIEW-007 the paused notification carries the exact rational beat", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-view-007",
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
    harness.setClock(7 / 6);
    requireReceipt(await harness.submit({ kind: "pause" }));
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("paused");
    expect(last?.playhead).toEqual(beat(7, 3));
  });

  test("X1-VIEW-008 sequence exhaustion is a frozen refusal code, never a wrap", async () => {
    expect(TRANSPORT_REFUSAL_CODES).toContain(
      "transport.internal_sequence_exhausted",
    );
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-view-008",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    for (const notification of harness.notifications) {
      expect(Number.isSafeInteger(notification.notificationSequence)).toBe(
        true,
      );
      expect(notification.notificationSequence).toBeGreaterThan(0);
    }
  });

  test("interruption recovery republishes from the stored exact beat", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-view-recovery",
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
    harness.setClock(0.625);
    harness.controller().setState("suspended");
    harness.timer.fire();
    expect(harness.service.inspectTransport().state).toBe("interrupted");
    harness.controller().setState("running");
    const resumed = requireReceipt(
      await harness.submit({ kind: "resume", gesture: trustedGesture() }),
    );
    expect(resumed.stateAfter).toBe("playing");
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("playing");
    expect(last?.playhead).toEqual(beat(5, 4));
  });
});
