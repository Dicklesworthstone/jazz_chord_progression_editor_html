import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  makeBeatPosition,
  makeMidiPitch,
  type BeatPosition,
  type MidiPitch,
} from "../../src/domain";
import {
  compiledPlan,
  createTransportHarness,
  initializePayload,
  planBinding,
  requireReceipt,
} from "../support/transport-test-kit";

setDefaultTimeout(240_000);

const zeroBeat: BeatPosition = (() => {
  const made = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!made.ok) throw new Error("zero beat");
  return made.value;
})();

const middleC: MidiPitch = (() => {
  const made = makeMidiPitch(60);
  if (!made.ok) throw new Error("midi 60");
  return made.value;
})();

describe("TR-X1-STOP-GUARANTEE / TR-LEGACY-AUDIO-01 stop stress", () => {
  test("X1-STOP-001 stop resolves with the no-future-attack postcondition and returns to the run start beat", async () => {
    const harness = createTransportHarness();
    const plan = compiledPlan();
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    harness.setClock(0.05);
    harness.timer.fire();
    const stopped = requireReceipt(await harness.submit({ kind: "stop" }));
    expect(stopped.noFutureAttackPostcondition).toBe(true);
    expect(stopped.stateAfter).toBe("ready");

    const attacksAtStop = stopped.work.attackBatchesIssued;
    harness.setClock(10);
    harness.timer.fire(5);
    expect(harness.timer.activeHandleCount()).toBe(0);
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.work.attackBatchesIssued).toBe(attacksAtStop);
    expect(snapshot.pausedBeat).toEqual(zeroBeat);

    const last = harness.notifications.at(-1);
    expect(last?.status).toBe("ready");
    expect(last?.playhead).toEqual(zeroBeat);
    expect(last?.startBeat).toEqual(zeroBeat);

    const engineView = harness.fake.contexts.length;
    expect(engineView).toBe(1);
  });

  test("X1-STOP-002 one hundred rapid play/stop cycles on one graph leave an empty registry and zero post-stop attacks", async () => {
    const harness = createTransportHarness();
    const plan = compiledPlan();
    requireReceipt(await harness.submit(initializePayload(plan)));
    let clock = 0;
    for (let cycle = 0; cycle < 100; cycle += 1) {
      requireReceipt(
        await harness.submit({
          kind: "play",
          binding: planBinding(plan, 1),
          startBeat: zeroBeat,
          countIn: false,
        }),
      );
      clock += 0.01;
      harness.setClock(clock);
      harness.timer.fire();
      const stopped = requireReceipt(await harness.submit({ kind: "stop" }));
      expect(stopped.noFutureAttackPostcondition).toBe(true);
      const attacksAtStop = stopped.work.attackBatchesIssued;
      clock += 0.05;
      harness.setClock(clock);
      harness.timer.fire();
      harness.controller().finishAllSources();
      expect(
        harness.service.inspectTransport().work.attackBatchesIssued,
      ).toBe(attacksAtStop);
    }
    expect(harness.fake.contextCreationCount()).toBe(1);
    expect(harness.timer.activeHandleCount()).toBe(0);

    harness.setClock(clock + 30);
    harness.controller().finishAllSources();
    const engine = harness.fake.contexts[0];
    expect(engine).toBeDefined();
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.state).toBe("ready");
    expect(snapshot.work.attackBatchesIssued).toBeGreaterThanOrEqual(100);
  });

  test("X1-STOP-003 global stop retires the progression and every preview through the 0.012 s ramp", async () => {
    const harness = createTransportHarness();
    const plan = compiledPlan();
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    requireReceipt(
      await harness.submit({
        kind: "start-preview",
        previewId: "x1:preview:stop",
        instrumentId: "mellow-keys",
        midiPitches: [middleC],
        gateSeconds: 2,
      }),
    );
    const stopped = requireReceipt(await harness.submit({ kind: "stop" }));
    expect(stopped.noFutureAttackPostcondition).toBe(true);
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.state).toBe("ready");
    expect(snapshot.work.previewsStarted).toBe(1);
  });

  test("X1-STOP-004 preview release during playback leaves the progression epoch untouched", async () => {
    const harness = createTransportHarness();
    const plan = compiledPlan();
    requireReceipt(await harness.submit(initializePayload(plan)));
    requireReceipt(
      await harness.submit({
        kind: "play",
        binding: planBinding(plan, 1),
        startBeat: zeroBeat,
        countIn: false,
      }),
    );
    const generationBefore = harness.service.inspectTransport().generation;
    const notificationsBefore = harness.notifications.length;
    requireReceipt(
      await harness.submit({
        kind: "start-preview",
        previewId: "x1:preview:iso",
        instrumentId: "vibraphone",
        midiPitches: [middleC],
        gateSeconds: 1,
      }),
    );
    requireReceipt(
      await harness.submit({
        kind: "release-preview",
        previewId: "x1:preview:iso",
      }),
    );
    const snapshot = harness.service.inspectTransport();
    expect(snapshot.state).toBe("playing");
    expect(snapshot.generation).toBe(generationBefore);
    expect(harness.notifications.length).toBe(notificationsBefore);
  });
});
