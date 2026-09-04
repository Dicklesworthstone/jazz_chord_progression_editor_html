import { expect, setDefaultTimeout, test } from "bun:test";

setDefaultTimeout(30_000);

import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
  type StudioAudioPort,
} from "../../src/application/runtime";
import {
  compareBeatValues,
  makeBeatPosition,
  makeInstrumentId,
} from "../../src/domain";
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
  expect(leading.notes).toHaveLength(10);
  expect([...new Set(leading.notes.map((note) => note.eventId))]).toEqual(
    plan.events.slice(0, 4).map((event) => event.eventId),
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
    plan.events.slice(4).map((event) => event.eventId),
  );

  expect(controller.stopProgression().ok).toBe(true);
});

test("a refused leading preparation settles Play without submitting instrument or transport commands", async () => {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  let prepareCalls = 0;
  let instrumentCalls = 0;
  let playCalls = 0;
  const port: StudioAudioPort = Object.freeze({
    ...inner,
    prepareInstrument: () => {
      prepareCalls += 1;
      return Promise.resolve(false);
    },
    setInstrument: (commandRequestId, instrumentId) => {
      instrumentCalls += 1;
      return inner.setInstrument(commandRequestId, instrumentId);
    },
    play: (commandRequestId, binding, startBeat, countIn) => {
      playCalls += 1;
      return inner.play(commandRequestId, binding, startBeat, countIn);
    },
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

  await until(() =>
    controller.getSnapshot().transport.failureCode ===
      "audio.renderer_unavailable"
  );
  expect(prepareCalls).toBe(1);
  expect(instrumentCalls).toBe(0);
  expect(playCalls).toBe(0);
  expect(controller.getSnapshot().transport.statusLabel).toBe("Audio ready");
  expect(controller.getSnapshot().transport.failureDetail).toContain(
    "selected instrument",
  );
});

test("a stale Play failure cannot clear a newer run of the same document revision", async () => {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const mellowKeys = makeInstrumentId("mellow-keys");
  if (!mellowKeys.ok) throw new Error("MELLOW_KEYS_ID_REFUSED");
  let prepareCalls = 0;
  let releaseFirst: (completed: boolean) => void = () => {
    throw new Error("FIRST_PLAY_GATE_UNINITIALIZED");
  };
  const firstPreparation = new Promise<boolean>((resolve) => {
    releaseFirst = resolve;
  });
  const port: StudioAudioPort = Object.freeze({
    ...inner,
    prepareInstrument: () => {
      prepareCalls += 1;
      return prepareCalls === 1 ? firstPreparation : Promise.resolve(true);
    },
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
  await until(() => prepareCalls === 1);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await until(() => controller.getSnapshot().transport.status === "playing");

  releaseFirst(false);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(controller.getSnapshot().transport.status).toBe("playing");
  expect(controller.seekToFraction(0.5).ok).toBe(true);
  expect(controller.stopProgression().ok).toBe(true);
});

test("a live physical instrument switch warms complete future events and its deferred horizon", async () => {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const mellowKeys = makeInstrumentId("mellow-keys");
  const switchPlayhead = makeBeatPosition({ numerator: 4, denominator: 1 });
  if (!mellowKeys.ok || !switchPlayhead.ok) {
    throw new Error("LIVE_INSTRUMENT_FIXTURE_INVALID");
  }
  const prepareCalls: Array<Readonly<{
    instrumentId: string;
    notes: Parameters<StudioAudioPort["prepareInstrument"]>[1];
    binding: Parameters<StudioAudioPort["prepareInstrument"]>[2];
  }>> = [];
  const port: StudioAudioPort = Object.freeze({
    ...inner,
    readPlayheadBeat: () => switchPlayhead.value,
    prepareInstrument: (instrumentId, notes, binding) => {
      prepareCalls.push(Object.freeze({ instrumentId, notes, binding }));
      return Promise.resolve(true);
    },
    setInstrument: (commandRequestId) =>
      inner.setInstrument(commandRequestId, mellowKeys.value),
  });
  const created = createStudioController({ audio: port });
  if (!created.ok) throw new Error(created.refusal.code);
  const controller = created.controller;
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.playProgression(GESTURE).ok).toBe(true);
  await until(() => controller.getSnapshot().transport.status === "playing");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  prepareCalls.length = 0;

  expect(controller.setInstrument("dreadnought-guitar").ok).toBe(true);
  await until(() =>
    prepareCalls.filter(({ instrumentId }) =>
      instrumentId === "dreadnought-guitar"
    ).length === 2
  );
  const [leading, deferred] = prepareCalls.filter(({ instrumentId }) =>
    instrumentId === "dreadnought-guitar"
  );
  if (leading?.binding === undefined || deferred === undefined) {
    throw new Error("LIVE_INSTRUMENT_PREPARATION_MISSING");
  }
  const planEvents = new Map(
    leading.binding.plan.events.map((event) => [String(event.eventId), event]),
  );
  for (const call of [leading, deferred]) {
    const counts = new Map<string, number>();
    for (const note of call.notes) {
      if (note.eventId === undefined || note.gateSeconds === undefined) {
        throw new Error("LIVE_INSTRUMENT_NOTE_IDENTITY_INCOMPLETE");
      }
      counts.set(note.eventId, (counts.get(note.eventId) ?? 0) + 1);
    }
    for (const [eventId, count] of counts) {
      const event = planEvents.get(eventId);
      if (event === undefined) throw new Error("LIVE_INSTRUMENT_EVENT_ABSENT");
      expect(compareBeatValues(event.startBeat, switchPlayhead.value)).toBeGreaterThanOrEqual(0);
      expect(count).toBe(event.midiPitches.length);
    }
  }
  expect(leading.notes.length).toBeGreaterThan(0);
  expect(deferred.notes.length).toBeGreaterThan(0);
  expect(controller.stopProgression().ok).toBe(true);
});

test("a receipted initialization whose engine never becomes ready cannot start preparation or Play", async () => {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  let prepareCalls = 0;
  let instrumentCalls = 0;
  let playCalls = 0;
  const port: StudioAudioPort = Object.freeze({
    ...inner,
    isInitialized: () => false,
    prepareInstrument: (...args) => {
      prepareCalls += 1;
      return inner.prepareInstrument(...args);
    },
    setInstrument: (...args) => {
      instrumentCalls += 1;
      return inner.setInstrument(...args);
    },
    play: (...args) => {
      playCalls += 1;
      return inner.play(...args);
    },
  });
  const created = createStudioController({ audio: port });
  if (!created.ok) throw new Error(created.refusal.code);
  const controller = created.controller;
  expect(seedStarterChart(controller)).toEqual({
    seeded: true,
    reason: "seeded",
  });
  expect(controller.playProgression(GESTURE).ok).toBe(true);

  await until(() =>
    controller.getSnapshot().transport.failureCode === "audio.engine_not_ready"
  );
  expect(prepareCalls).toBe(0);
  expect(instrumentCalls).toBe(0);
  expect(playCalls).toBe(0);
});

test("a preview that supersedes render-ahead restarts the exact deferred event groups", async () => {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const mellowKeys = makeInstrumentId("mellow-keys");
  if (!mellowKeys.ok) throw new Error("MELLOW_KEYS_ID_REFUSED");
  const prepareCalls: PrepareCall[] = [];
  let releaseCanceledTail = (): void => {
    throw new Error("CANCELED_TAIL_GATE_UNINITIALIZED");
  };
  const canceledTail = new Promise<boolean>((resolve) => {
    releaseCanceledTail = () => { resolve(false); };
  });
  const previewPitches: number[][] = [];
  const port: StudioAudioPort = Object.freeze({
    ...inner,
    prepareInstrument: (_instrumentId, notes, binding) => {
      prepareCalls.push(Object.freeze({ notes, binding }));
      return prepareCalls.length === 2 ? canceledTail : Promise.resolve(true);
    },
    setInstrument: (commandRequestId) =>
      inner.setInstrument(commandRequestId, mellowKeys.value),
    startPreview: (requestId, previewId, _instrumentId, pitches, gateSeconds) => {
      previewPitches.push([...pitches]);
      return inner.startPreview(
        requestId,
        previewId,
        mellowKeys.value,
        pitches,
        gateSeconds,
      );
    },
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
  await until(() => prepareCalls.length === 2);

  expect(controller.previewPitch(61, GESTURE).ok).toBe(true);
  await until(() => previewPitches.length === 1);
  expect(prepareCalls).toHaveLength(3);
  releaseCanceledTail();
  await until(() => prepareCalls.length === 4);

  expect(previewPitches).toEqual([[61]]);
  expect(prepareCalls[3]?.notes).toEqual(prepareCalls[1]?.notes);
  expect(prepareCalls[3]?.binding).toBe(prepareCalls[1]?.binding);
  expect(controller.stopProgression().ok).toBe(true);
});
