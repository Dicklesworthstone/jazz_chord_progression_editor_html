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

function beat(numerator: number, denominator: number): BeatPosition {
  const made = makeBeatPosition({ numerator, denominator });
  if (!made.ok) throw new Error("beat");
  return made.value;
}

const zeroBeat = beat(0, 1);

describe("TR-X1-INTERRUPTION browser interruption and recovery", () => {
  test("X1-STOP-007 interruption freezes the playhead at the exact beat and publishes paused with the frozen code", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-int-007",
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
    const interruptionsBefore =
      harness.service.inspectTransport().work.interruptionsObserved;
    harness.timer.fire();
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.state).toBe("interrupted");
    expect(snapshot.work.interruptionsObserved).toBe(interruptionsBefore + 1);
    expect(snapshot.pausedBeat).toEqual(beat(5, 4));
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("paused");
    expect(last?.failureCode).toBe("transport.interrupted");

    harness.timer.fire(4);
    expect(
      harness.service.inspectTransport().work.interruptionsObserved,
    ).toBe(interruptionsBefore + 1);
  });

  test("suspended wall time never advances musical time", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-int-frozen",
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
    harness.setClock(0.5);
    harness.controller().setState("suspended");
    harness.timer.fire();
    const frozen = harness.service.inspectTransport().pausedBeat;
    expect(frozen).toEqual(beat(1, 1));
    harness.setClock(120);
    harness.timer.fire(3);
    expect(harness.service.inspectTransport().pausedBeat).toEqual(
      beat(1, 1),
    );
  });

  test("X1-STOP-008 recovery requires a trusted gesture and re-anchors at the stored exact beat", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-int-008",
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

    const withoutGesture = requireRefusal(
      await harness.submit({ kind: "resume", gesture: null }),
    );
    expect(withoutGesture.code).toBe("transport.gesture_invalid");

    harness.controller().setState("running");
    harness.setClock(30);
    const attacksBefore = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression" && attack.accepted,
    ).length;
    const recovered = requireReceipt(
      await harness.submit({ kind: "resume", gesture: trustedGesture() }),
    );
    expect(recovered.stateAfter).toBe("playing");
    const last = harness.notifications.at(-1);
    expect(last?.playhead).toEqual(beat(5, 4));

    harness.setClock(30 + (4 - 1.25) * 0.5 - 0.05);
    harness.timer.fire();
    const attacksAfter = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression" && attack.accepted,
    );
    expect(attacksAfter.length).toBe(attacksBefore + 1);
    const resumedAttack = attacksAfter.at(-1);
    expect(resumedAttack?.startTimeSeconds).toBe(30 + (4 - 1.25) * 0.5);
    expect(resumedAttack?.eventId).toBe(plan.events[1]?.eventId);
  });

  test("stop from interrupted returns to ready at the run start beat", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-int-stop",
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
    harness.setClock(0.25);
    harness.controller().setState("suspended");
    harness.timer.fire();
    const stopped = requireReceipt(await harness.submit({ kind: "stop" }));
    expect(stopped.stateAfter).toBe("ready");
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("ready");
    expect(last?.playhead).toEqual(zeroBeat);
  });
});
