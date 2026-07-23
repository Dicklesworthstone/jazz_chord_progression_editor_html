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

describe("TR-X1-CLICKS count-in and metronome", () => {
  test("X1-SCHED-007 count-in prepends exactly one accented bar of vibraphone clicks through the horizon", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-clicks-007",
      tempoBpm: 120,
      meter: { beatsPerBar: 4, beatUnit: 4 },
      durations: [
        { numerator: 1, denominator: 1 },
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
        countIn: true,
      }),
    );
    driveUntil(harness, 2.2);
    const clicks = harness.attacks.filter((attack) =>
      attack.eventId.startsWith("x1:click:"),
    );
    expect(clicks).toHaveLength(4);
    for (const click of clicks) {
      expect(click.instrumentId).toBe("vibraphone");
      expect(click.accepted).toBe(true);
      expect(click.releaseTimeSeconds - click.startTimeSeconds).toBeCloseTo(
        0.06,
        12,
      );
    }
    expect(clicks.map((click) => click.startTimeSeconds)).toEqual([
      0, 0.5, 1, 1.5,
    ]);
    const firstEvent = harness.attacks.find(
      (attack) =>
        attack.ownerKind === "progression" &&
        !attack.eventId.startsWith("x1:click:"),
    );
    expect(firstEvent).toBeDefined();
    expect(firstEvent?.startTimeSeconds).toBe(2);
    expect(
      harness.service.inspectTransport().work.clickEventsGenerated,
    ).toBe(4);
  });

  test("X1-SCHED-008 the metronome clicks every meter beat with a bar accent while playing", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-clicks-008",
      tempoBpm: 60,
      meter: { beatsPerBar: 3, beatUnit: 4 },
      durations: [
        { numerator: 1, denominator: 1 },
        { numerator: 1, denominator: 1 },
        { numerator: 1, denominator: 1 },
      ],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({ kind: "set-metronome", enabled: true }),
    );
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    driveUntil(harness, 3);
    const clicks = harness.attacks.filter((attack) =>
      attack.eventId.startsWith("x1:click:"),
    );
    expect(clicks).toHaveLength(3);
    expect(clicks.map((click) => click.startTimeSeconds)).toEqual([0, 1, 2]);
    expect(
      harness.service.inspectTransport().work.clickEventsGenerated,
    ).toBe(3);
  });

  test("X1-SCHED-009 every click ID uses the reserved prefix and cannot collide with document events", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-clicks-009",
      tempoBpm: 120,
      meter: { beatsPerBar: 4, beatUnit: 4 },
      durations: [{ numerator: 1, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({ kind: "set-metronome", enabled: true }),
    );
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: true,
      }),
    );
    driveUntil(harness, 2.5);
    const clickIds = harness.attacks
      .filter((attack) => attack.eventId.startsWith("x1:click:"))
      .map((attack) => attack.eventId);
    expect(clickIds.length).toBeGreaterThan(0);
    for (const id of clickIds) {
      expect(id.startsWith("x1:click:")).toBe(true);
    }
    const documentEventIds = plan.events.map((event) => event.eventId);
    for (const id of documentEventIds) {
      expect(id.includes(":")).toBe(false);
      expect(clickIds).not.toContain(id);
    }
  });

  test("X1-CMD-017 count-in and metronome toggles runtime-validate their booleans", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-clicks-017",
      tempoBpm: 120,
      durations: [{ numerator: 1, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    const hostileCountIn = requireRefusal(
      await harness.service.submitTransportCommand({
        commandRequestId: harness.nextRequestId(),
        payload: JSON.parse(
          '{"kind":"set-count-in","enabled":"yes"}',
        ) as never,
      }),
    );
    expect(hostileCountIn.code).toBe("transport.count_in_invalid");
    const hostileMetronome = requireRefusal(
      await harness.service.submitTransportCommand({
        commandRequestId: harness.nextRequestId(),
        payload: JSON.parse('{"kind":"set-metronome","enabled":1}') as never,
      }),
    );
    expect(hostileMetronome.code).toBe("transport.metronome_invalid");
    requireReceipt(
      await harness.submit({ kind: "set-count-in", enabled: true }),
    );
    requireReceipt(
      await harness.submit({ kind: "set-metronome", enabled: false }),
    );
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.countInEnabled).toBe(true);
    expect(snapshot.metronomeEnabled).toBe(false);
  });
});
