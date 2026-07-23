import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
  requireRefusal,
  type TransportHarness,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

function beat(numerator: number, denominator: number): BeatPosition {
  const made = makeBeatPosition({ numerator, denominator });
  if (!made.ok) throw new Error("beat");
  return made.value;
}

const zeroBeat = beat(0, 1);

function driveUntil(harness: TransportHarness, endSeconds: number): void {
  let clock = harness.clock();
  while (clock < endSeconds) {
    clock = Math.min(clock + 0.025, endSeconds);
    harness.setClock(clock);
    harness.timer.fire();
  }
}

describe("TR-X1-PLAY-WHOLE-CHART / TR-LEGACY-RUNTIME-01 play schedules every event", () => {
  test("every plan event is attacked exactly once across a full run", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-play-whole",
      tempoBpm: 120,
      durations: [
        { numerator: 1, denominator: 2 },
        { numerator: 1, denominator: 1 },
        { numerator: 3, denominator: 2 },
        { numerator: 1, denominator: 1 },
        { numerator: 2, denominator: 1 },
        { numerator: 2, denominator: 1 },
      ],
    });
    expect(plan.events).toHaveLength(6);
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    driveUntil(harness, 5);
    const attacked = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression" && attack.accepted,
    );
    expect(attacked).toHaveLength(6);
    const attackedIds = attacked.map((attack) => attack.eventId);
    expect(attackedIds).toEqual(plan.events.map((event) => event.eventId));
    expect(new Set(attackedIds).size).toBe(6);
    expect(harness.service.inspectTransport().state).toBe("ready");
  });

  test("X1-CMD-006 the start beat is inclusive at both ends and refuses one tick past the end", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-play-bounds",
      tempoBpm: 120,
      durations: [
        { numerator: 4, denominator: 1 },
        { numerator: 4, denominator: 1 },
      ],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    const pastEnd = requireRefusal(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: beat(7681, 960),
        countIn: false,
      }),
    );
    expect(pastEnd.code).toBe("transport.start_beat_out_of_range");

    const atEnd = requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: beat(8, 1),
        countIn: false,
      }),
    );
    expect(atEnd.stateAfter).toBe("ready");
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("ready");

    const midStart = requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: beat(4, 1),
        countIn: false,
      }),
    );
    expect(midStart.stateAfter).toBe("playing");
    harness.timer.fire();
    const attacked = harness.attacks.filter(
      (attack) => attack.ownerKind === "progression" && attack.accepted,
    );
    expect(attacked).toHaveLength(1);
    expect(attacked[0]?.eventId).toBe(plan.events[1]?.eventId);
  });

  test("silence requires an exactly empty remaining timeline, never a scheduling defect", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-play-silence",
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
    expect(
      harness.service.inspectTransport().work.naturalEndsPublished,
    ).toBe(endsBefore + 1);
    expect(
      harness.attacks.filter((attack) => attack.ownerKind === "progression"),
    ).toHaveLength(0);
  });
});
