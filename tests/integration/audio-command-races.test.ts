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

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

describe("TR-X1-SERIALIZED-COMMANDS / TR-LEGACY-AUDIO-04 command races", () => {
  test("X1-CMD-001/X1-CMD-002 request IDs are strictly increasing positive safe integers, counting refused ones", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-race-ids",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    const first = await harness.service.submitTransportCommand({
      commandRequestId: 7,
      payload: initializePayload(plan),
    });
    expect(first.termination).toBe("receipt");
    const replay = requireRefusal(
      await harness.service.submitTransportCommand({
        commandRequestId: 7,
        payload: { kind: "stop" },
      }),
    );
    expect(replay.code).toBe("transport.command_request_id_invalid");
    for (const hostile of [0, -1, 0.5, 9007199254740992]) {
      const outcome = requireRefusal(
        await harness.service.submitTransportCommand({
          commandRequestId: hostile,
          payload: { kind: "stop" },
        }),
      );
      expect(outcome.code).toBe("transport.command_request_id_invalid");
    }
    const nextValid = await harness.service.submitTransportCommand({
      commandRequestId: 8,
      payload: { kind: "stop" },
    });
    expect(nextValid.termination).toBe("receipt");
  });

  test("X1-CMD-003 the thirty-third concurrent command refuses without perturbing the queue", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-race-queue",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    const submissions: Promise<unknown>[] = [];
    for (let index = 0; index < 32; index += 1) {
      submissions.push(harness.submit({ kind: "stop" }));
    }
    const overflowing = await harness.submit({ kind: "stop" });
    const settled = (await Promise.all(submissions)) as readonly {
      termination: string;
    }[];
    const refusals = settled.filter(
      (outcome) => outcome.termination === "refusal",
    );
    expect(refusals).toHaveLength(0);
    expect(overflowing.termination).toBe("refusal");
    if (overflowing.termination === "refusal") {
      expect(overflowing.code).toBe("transport.queue_overflow");
    }
    expect(harness.service.inspectTransport().state).toBe("ready");
    expect(harness.service.inspectTransport().queuedCommandCount).toBe(0);
  });

  test("X1-CMD-020 a synchronous burst executes strictly FIFO with no overlapping transition", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-race-fifo",
      tempoBpm: 120,
      durations: [{ numerator: 4, denominator: 1 }],
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    const order: string[] = [];
    const burst = [
      harness
        .submit({
          kind: "play",
          binding: planBinding(plan, 1),
          startBeat: zeroBeat,
          countIn: false,
        })
        .then((outcome) => {
          order.push("play");
          return outcome;
        }),
      harness.submit({ kind: "pause" }).then((outcome) => {
        order.push("pause");
        return outcome;
      }),
      harness.submit({ kind: "stop" }).then((outcome) => {
        order.push("stop");
        return outcome;
      }),
    ];
    const outcomes = await Promise.all(burst);
    expect(order).toEqual(["play", "pause", "stop"]);
    expect(outcomes.map((outcome) => outcome.termination)).toEqual([
      "receipt",
      "receipt",
      "receipt",
    ]);
    expect(harness.service.inspectTransport().state).toBe("ready");
    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("ready");
  });

  test("rapid alternating instrument changes while playing leave no stale attack and no stuck voice", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-race-instr",
      tempoBpm: 60,
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
        countIn: false,
      }),
    );
    const instruments = [
      "vibraphone",
      "warm-pad",
      "analog-poly",
      "fm-electric-piano",
      "mellow-keys",
    ] as const;
    let clock = 0;
    for (let round = 0; round < 10; round += 1) {
      const instrument = instruments[round % instruments.length];
      expect(instrument).toBeDefined();
      if (instrument === undefined) continue;
      requireReceipt(
        await harness.submit({ kind: "set-instrument", instrumentId: instrument }),
      );
      clock += 0.05;
      harness.setClock(clock);
      harness.timer.fire();
    }
    const rejected = harness.attacks.filter((attack) => !attack.accepted);
    expect(rejected).toHaveLength(0);
    const stopped = requireReceipt(await harness.submit({ kind: "stop" }));
    expect(stopped.noFutureAttackPostcondition).toBe(true);
    harness.setClock(clock + 10);
    harness.timer.fire(2);
    expect(
      harness.service.inspectTransport().work.attackBatchesIssued,
    ).toBe(stopped.work.attackBatchesIssued);
  });
});
