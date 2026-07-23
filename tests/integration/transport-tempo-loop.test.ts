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
const DURATIONS = [
  { numerator: 4, denominator: 1 },
  { numerator: 4, denominator: 1 },
];

describe("TR-X1-TEMPO-LOOP tempo and loop binding law", () => {
  test("X1-CMD-008 a tempo binding with an equal plan revision refuses as a mismatch", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-tempo-008",
      tempoBpm: 120,
      durations: DURATIONS,
    });
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 3),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const equalRevision = requireRefusal(
      await harness.submit({
        kind: "set-tempo",
        binding: planBinding(plan, 3),
      }),
    );
    expect(equalRevision.code).toBe("transport.plan_mismatch");
    const olderRevision = requireRefusal(
      await harness.submit({
        kind: "set-tempo",
        binding: planBinding(plan, 2),
      }),
    );
    expect(olderRevision.code).toBe("transport.plan_mismatch");
  });

  test("X1-CMD-009 the transport revalidates the plan tempo bounds itself", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-tempo-009",
      tempoBpm: 120,
      durations: DURATIONS,
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
    const hostile = JSON.parse(JSON.stringify(plan)) as Record<
      string,
      unknown
    >;
    hostile["tempoBpm"] = 401;
    const outcome = requireRefusal(
      await harness.service.submitTransportCommand({
        commandRequestId: harness.nextRequestId(),
        payload: {
          kind: "set-tempo",
          binding: {
            plan: hostile as never,
            documentId: plan.sourceDocumentId,
            planRevision: 2,
          },
        },
      }),
    );
    expect(outcome.code).toBe("transport.tempo_out_of_range");
  });

  test("X1-CMD-010 a loop binding must keep the plan revision", async () => {
    const harness = createTransportHarness();
    const plan = customPlan({
      documentId: "doc-x1-loop-010",
      tempoBpm: 120,
      durations: DURATIONS,
      loop: {
        start: { numerator: 0, denominator: 1 },
        end: { numerator: 4, denominator: 1 },
      },
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
    const newerRevision = requireRefusal(
      await harness.submit({
        kind: "set-loop",
        binding: planBinding(plan, 2),
        loop: plan.loop,
      }),
    );
    expect(newerRevision.code).toBe("transport.plan_mismatch");
  });

  test("X1-CMD-011 declared and embedded loops must agree exactly", async () => {
    const harness = createTransportHarness();
    const looped = customPlan({
      documentId: "doc-x1-loop-011",
      tempoBpm: 120,
      durations: DURATIONS,
      loop: {
        start: { numerator: 0, denominator: 1 },
        end: { numerator: 4, denominator: 1 },
      },
    });
    requireReceipt(await harness.submit(initializePayload(looped)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(looped, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const disagrees = requireRefusal(
      await harness.submit({
        kind: "set-loop",
        binding: planBinding(looped, 1),
        loop: Object.freeze({ start: beat(0, 1), end: beat(2, 1) }),
      }),
    );
    expect(disagrees.code).toBe("transport.loop_invalid");
    const nullDeclared = requireRefusal(
      await harness.submit({
        kind: "set-loop",
        binding: planBinding(looped, 1),
        loop: null,
      }),
    );
    expect(nullDeclared.code).toBe("transport.loop_invalid");
    const agrees = requireReceipt(
      await harness.submit({
        kind: "set-loop",
        binding: planBinding(looped, 1),
        loop: looped.loop,
      }),
    );
    expect(agrees.stateAfter).toBe("playing");
  });

  test("clearing a loop requires a plan compiled without one", async () => {
    const harness = createTransportHarness();
    const looped = customPlan({
      documentId: "doc-x1-loop-clear",
      tempoBpm: 120,
      durations: DURATIONS,
      loop: {
        start: { numerator: 0, denominator: 1 },
        end: { numerator: 4, denominator: 1 },
      },
    });
    const unlooped = customPlan({
      documentId: "doc-x1-loop-clear",
      tempoBpm: 120,
      durations: DURATIONS,
    });
    requireReceipt(await harness.submit(initializePayload(looped)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(looped, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const cleared = requireReceipt(
      await harness.submit({
        kind: "set-loop",
        binding: planBinding(unlooped, 1),
        loop: null,
      }),
    );
    expect(cleared.stateAfter).toBe("playing");
    expect(harness.service.inspectTransport().loop).toBeNull();
  });
});
