import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  makeBeatPosition,
  makeMidiPitch,
  type BeatPosition,
  type MidiPitch,
} from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
  requireRefusal,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

function pitch(value: number): MidiPitch {
  const made = makeMidiPitch(value);
  if (!made.ok) throw new Error("pitch");
  return made.value;
}

describe("TR-X1-REPLACEMENT import/New replacement transaction", () => {
  test("X1-STOP-009 replacement while playing with a preview retires both owners before publishing", async () => {
    const harness = createTransportHarness();
    const first = customPlan({
      documentId: "doc-x1-repl-a",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    const second = customPlan({
      documentId: "doc-x1-repl-b",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(first)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(first, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    requireReceipt(
      await harness.submit({
        kind: "start-preview",
        previewId: "x1:preview:repl",
        instrumentId: "vibraphone",
        midiPitches: [pitch(60)],
        gateSeconds: 2,
      }),
    );
    const notificationsBefore = harness.notifications.length;
    const retirementsBefore = harness.retirements.length;
    const replaced = requireReceipt(
      await harness.submit({
        kind: "replace-plan",
        binding: planBinding(second, 7),
      }),
    );
    expect(replaced.noFutureAttackPostcondition).toBe(true);
    expect(replaced.stateAfter).toBe("ready");

    const retirement = harness.retirements[retirementsBefore];
    expect(retirement).toBeDefined();
    expect(retirement?.selectorKind).toBe("all");
    expect(retirement?.reason).toBe("all-notes-off");

    const notification = harness.notifications[notificationsBefore];
    expect(notification).toBeDefined();
    expect(notification?.status).toBe("ready");
    expect(notification?.documentId).toBe(second.sourceDocumentId);
    expect(notification?.planRevision).toBe(7);
    expect(notification?.playhead).toEqual(zeroBeat);

    harness.setClock(10);
    harness.timer.fire(3);
    const staleAttacks = harness.attacks.filter(
      (attack) => attack.eventId === first.events[0]?.eventId &&
        attack.startTimeSeconds > 0,
    );
    expect(staleAttacks).toHaveLength(0);
  });

  test("X1-STOP-010 a null binding empties the transport and a stale play refuses", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-repl-null",
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
    requireReceipt(await harness.submit({ kind: "pause" }));
    const emptied = requireReceipt(
      await harness.submit({ kind: "replace-plan", binding: null }),
    );
    expect(emptied.stateAfter).toBe("ready");
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.startBeat).toBeNull();
    expect(snapshot.pausedBeat).toBeNull();

    const staleContinuation = requireRefusal(
      await harness.submit({
        kind: "set-tempo",
        binding: planBinding(plan, 2),
      }),
    );
    expect(staleContinuation.code).toBe("transport.plan_mismatch");
  });

  test("X1-CMD-018 a binding cannot smuggle a plan compiled from a different document", async () => {
    const harness = createTransportHarness();
    const genuine = customPlan({
      documentId: "doc-x1-repl-genuine",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    const foreign = customPlan({
      documentId: "doc-x1-repl-foreign",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(genuine)));
    const smuggled = requireRefusal(
      await harness.service.submitTransportCommand({
        commandRequestId: harness.nextRequestId(),
        payload: {
          kind: "replace-plan",
          binding: {
            plan: foreign,
            documentId: genuine.sourceDocumentId,
            planRevision: 2,
          },
        },
      }),
    );
    expect(smuggled.code).toBe("transport.plan_mismatch");
    expect(harness.service.inspectTransport().documentId).toBe(
      genuine.sourceDocumentId,
    );
  });

  test("replacement from interrupted is legal and lands at ready", async () => {
    const harness = createTransportHarness();
    const first = customPlan({
      documentId: "doc-x1-repl-int",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    const second = customPlan({
      documentId: "doc-x1-repl-int2",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(first)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(first, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    harness.controller().setState("suspended");
    harness.timer.fire();
    expect(harness.service.inspectTransport().state).toBe("interrupted");
    const replaced = requireReceipt(
      await harness.submit({
        kind: "replace-plan",
        binding: planBinding(second, 3),
      }),
    );
    expect(replaced.stateAfter).toBe("ready");
    expect(harness.service.inspectTransport().documentId).toBe(
      second.sourceDocumentId,
    );
  });
});
