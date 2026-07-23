import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { makeBeatPosition, type BeatPosition } from "../../src/domain";
import {
  createTransportHarness,
  customPlan,
  initializePayload,
  planBinding,
  requireReceipt,
  requireRefusal,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

function beat(numerator: number, denominator: number): BeatPosition {
  const made = makeBeatPosition({ numerator, denominator });
  if (!made.ok) throw new Error("beat");
  return made.value;
}

const zeroBeat = beat(0, 1);

describe("TR-X1-PAUSE-RESUME-SEEK exact pause, resume, and seek", () => {
  test("pause records the exact old-epoch beat and resume re-anchors there", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-pause",
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
    harness.setClock(1.25);
    const paused = requireReceipt(await harness.submit({ kind: "pause" }));
    expect(paused.noFutureAttackPostcondition).toBe(true);
    expect(harness.service.inspectTransport().pausedBeat).toEqual(
      beat(5, 2),
    );

    harness.setClock(60);
    const resumed = requireReceipt(
      await harness.submit({ kind: "resume", gesture: null }),
    );
    expect(resumed.stateAfter).toBe("playing");
    const playing = harness.notifications.at(-1);
    expect(playing?.playhead).toEqual(beat(5, 2));

    harness.setClock(60.7);
    harness.timer.fire();
    const nextAttack = harness.attacks
      .filter((attack) => attack.ownerKind === "progression")
      .at(-1);
    expect(nextAttack).toBeDefined();
    expect(nextAttack?.startTimeSeconds).toBe(60.75);
  });

  test("X1-CMD-007 a paused seek stays paused, a playing seek resumes at the target, and out-of-range refuses", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-seek",
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

    const playingSeek = requireReceipt(
      await harness.submit({ kind: "seek", targetBeat: beat(4, 1) }),
    );
    expect(playingSeek.stateAfter).toBe("playing");
    expect(playingSeek.noFutureAttackPostcondition).toBe(true);
    const seekNotification = harness.notifications.at(-1);
    expect(seekNotification?.status).toBe("playing");
    expect(seekNotification?.playhead).toEqual(beat(4, 1));

    requireReceipt(await harness.submit({ kind: "pause" }));
    const pausedSeek = requireReceipt(
      await harness.submit({ kind: "seek", targetBeat: beat(1, 2) }),
    );
    expect(pausedSeek.stateAfter).toBe("paused");
    const pausedNotification = harness.notifications.at(-1);
    expect(pausedNotification?.status).toBe("paused");
    expect(pausedNotification?.playhead).toEqual(beat(1, 2));

    const outOfRange = requireRefusal(
      await harness.submit({ kind: "seek", targetBeat: beat(9, 1) }),
    );
    expect(outOfRange.code).toBe("transport.seek_out_of_range");
    expect(harness.service.inspectTransport().pausedBeat).toEqual(
      beat(1, 2),
    );
  });

  test("a seek retires the outgoing epoch before rescheduling from the target", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-seek-retire",
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
    const retirementsBefore = harness.retirements.length;
    requireReceipt(
      await harness.submit({ kind: "seek", targetBeat: beat(4, 1) }),
    );
    const seekRetirements = harness.retirements.slice(retirementsBefore);
    expect(seekRetirements.length).toBeGreaterThan(0);
    expect(seekRetirements[0]?.selectorKind).toBe("generation");
    expect(seekRetirements[0]?.reason).toBe("generation-retire");
    const attacked = harness.attacks
      .filter((attack) => attack.ownerKind === "progression")
      .at(-1);
    expect(attacked?.eventId).toBe(plan.events[1]?.eventId);
  });
});
