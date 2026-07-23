import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
  type TransportHarness,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

function driveUntil(harness: TransportHarness, endSeconds: number): void {
  let clock = harness.clock();
  while (clock < endSeconds) {
    clock = Math.min(clock + 0.025, endSeconds);
    harness.setClock(clock);
    harness.timer.fire();
  }
}

describe("TR-X1-NATURAL-END-REPLAY natural end and replay during a tail", () => {
  test("X1-STOP-005 natural end publishes ready at the run start beat without a forced ramp", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-end-005",
      tempoBpm: 120,
      durations: [
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
    const retirementsBefore = harness.retirements.length;
    const endsBefore =
      harness.service.inspectTransport().work.naturalEndsPublished;
    driveUntil(harness, 1.2);
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.state).toBe("ready");
    expect(snapshot.work.naturalEndsPublished).toBe(endsBefore + 1);
    expect(harness.retirements.length).toBe(retirementsBefore);
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("ready");
    expect(last?.playhead).toEqual(zeroBeat);
    expect(harness.timer.activeHandleCount()).toBe(0);

    harness.setClock(1.2 + 8);
    harness.controller().finishAllSources();
    expect(harness.fake.contextCreationCount()).toBe(1);
  });

  test("X1-STOP-006 replay during a residual tail retires the old generation before the new run's first attack", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-end-006",
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
    driveUntil(harness, 0.7);
    expect(harness.service.inspectTransport().state).toBe("ready");

    const retirementsBefore = harness.retirements.length;
    const attacksBefore = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression" && attack.accepted,
    ).length;
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const replayRetirement = harness.retirements[retirementsBefore];
    expect(replayRetirement).toBeDefined();
    expect(replayRetirement?.selectorKind).toBe("generation");
    expect(replayRetirement?.reason).toBe("generation-retire");
    const replayAttacks = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression" && attack.accepted,
    );
    expect(replayAttacks.length).toBe(attacksBefore + 1);
    expect(harness.fake.contextCreationCount()).toBe(1);
    expect(harness.service.inspectTransport().state).toBe("playing");
  });
});
