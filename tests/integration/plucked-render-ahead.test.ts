import { expect, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
  type StudioAudioPort,
} from "../../src/application/runtime";
import { makeInstrumentId } from "../../src/domain";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

type PrepareCall = Readonly<{
  notes: Parameters<StudioAudioPort["prepareInstrument"]>[1];
  binding: Parameters<StudioAudioPort["prepareInstrument"]>[2];
}>;

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("PLUCKED_RENDER_AHEAD_TIMEOUT");
}

test("initialization ready cannot dispatch the tail and render-ahead preserves complete chronological events", async () => {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const mellowKeys = makeInstrumentId("mellow-keys");
  if (!mellowKeys.ok) throw new Error("MELLOW_KEYS_ID_REFUSED");
  const prepareCalls: PrepareCall[] = [];
  let releaseLeading = (): void => {
    throw new Error("LEADING_PREPARATION_GATE_UNINITIALIZED");
  };
  const leadingGate = new Promise<void>((resolve) => {
    releaseLeading = resolve;
  });
  const port: StudioAudioPort = Object.freeze({
    ...inner,
    prepareInstrument: async (_instrumentId, notes, binding) => {
      prepareCalls.push(Object.freeze({ notes, binding }));
      if (prepareCalls.length === 1) await leadingGate;
      return true;
    },
    /* The real transport supplies ordering, receipts, and initialization's
     * ready notification. It plays an oscillator recipe so this controller
     * lifecycle test does not depend on the physical renderer under test. */
    setInstrument: (commandRequestId) =>
      inner.setInstrument(commandRequestId, mellowKeys.value),
  });
  const created = createStudioController({ audio: port });
  if (!created.ok) throw new Error(created.refusal.code);
  const controller = created.controller;
  expect(seedStarterChart(controller)).toEqual({
    seeded: true,
    reason: "seeded",
  });
  expect(controller.setInstrument("dreadnought-guitar").ok).toBe(true);
  expect(controller.playProgression(GESTURE).ok).toBe(true);

  await until(() => prepareCalls.length === 1);
  /* initialize() has already published ready, but a transport-ready signal is
   * not permission to launch this run's tail. */
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(prepareCalls).toHaveLength(1);

  const leading = prepareCalls[0];
  const plan = leading?.binding?.plan;
  if (leading === undefined || plan === undefined) {
    throw new Error("LEADING_PREPARATION_BINDING_ABSENT");
  }
  expect(plan.events.slice(0, 4).map((event) =>
    event.midiPitches.length
  )).toEqual([1, 4, 1, 4]);
  const planVoiceCounts = new Map<string, number>(
    plan.events.map((event) => [String(event.eventId), event.midiPitches.length]),
  );
  const assertEventClosed = (call: PrepareCall): void => {
    const counts = new Map<string, number>();
    for (const note of call.notes) {
      if (note.eventId === undefined) {
        throw new Error("PREPARED_EVENT_ID_ABSENT");
      }
      counts.set(note.eventId, (counts.get(note.eventId) ?? 0) + 1);
    }
    for (const [eventId, count] of counts) {
      const expected = planVoiceCounts.get(eventId);
      if (expected === undefined) {
        throw new Error(`PREPARED_EVENT_NOT_IN_PLAN:${eventId}`);
      }
      expect(count).toBe(expected);
    }
  };
  assertEventClosed(leading);
  expect(leading.notes).toHaveLength(6);
  expect([...new Set(leading.notes.map((note) => note.eventId))]).toEqual(
    plan.events.slice(0, 3).map((event) => event.eventId),
  );

  releaseLeading();
  await until(() => prepareCalls.length === 2);
  const deferred = prepareCalls[1];
  if (deferred === undefined) throw new Error("DEFERRED_PREPARATION_ABSENT");
  assertEventClosed(deferred);
  const leadingEventIds = new Set(leading.notes.map((note) => note.eventId));
  expect(deferred.notes.every((note) =>
    !leadingEventIds.has(note.eventId)
  )).toBe(true);
  expect([...new Set(deferred.notes.map((note) => note.eventId))]).toEqual(
    plan.events.slice(3).map((event) => event.eventId),
  );

  expect(controller.stopProgression().ok).toBe(true);
});
