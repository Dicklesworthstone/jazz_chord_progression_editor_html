/**
 * jcpe-j4hj: a mid-run instrument change is handed to the transport only after
 * every note the new instrument may still attack is rendered. Shared plucked
 * recipes refuse an unrendered chord at attack time and X1 latches any mid-run
 * engine refusal as a fault, so swapping after only the leading notes let the
 * playhead outrun the background render and killed the run (reproduced live:
 * `audio.renderer_unavailable` on a Blues Guitar comp chord).
 *
 * With a loop armed every looped note can recur, so the preparation that
 * precedes set-instrument must cover the whole performed plan, voice for voice.
 */
import { expect, test } from "bun:test";

import { createStudioAudio, createStudioController, seedStarterChart, type StudioAudioPort } from "../../src/application/runtime";
import type { PlaybackPlan } from "../../src/playback";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const gesture = { kind: "trusted-pointer", trusted: true, sequence: 1 } as const;
async function until(predicate: () => boolean): Promise<void> {
  for (let n = 0; n < 600 && !predicate(); n++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(predicate()).toBe(true);
}

test("a looped run renders every note of the plan before the new instrument takes over", async () => {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const log: { kind: "prepare" | "set"; instrumentId: string; notes?: number; plan?: PlaybackPlan }[] = [];
  const audio: StudioAudioPort = {
    ...inner,
    prepareInstrument: async (...args) => {
      const entry = { kind: "prepare" as const, instrumentId: args[0], notes: args[1].length, ...(args[2] ? { plan: args[2].plan } : {}) };
      const done = await inner.prepareInstrument(...args);
      log.push(entry);
      return done;
    },
    setInstrument: (...args) => {
      log.push({ kind: "set", instrumentId: args[1] });
      return inner.setInstrument(...args);
    },
  };
  const created = createStudioController({ audio });
  if (!created.ok) throw new Error(created.refusal.code);
  const controller = created.controller;
  try {
    expect(seedStarterChart(controller).seeded).toBe(true);
    expect(controller.playProgression(gesture).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.toggleLoop().ok).toBe(true);
    await until(() => inner.inspect().transport.loop !== null);

    const before = log.length;
    expect(controller.setInstrument("blues-guitar").ok).toBe(true);
    await until(() => log.slice(before).some((entry) => entry.kind === "set"));
    const swap = log.slice(before);
    const setIndex = swap.findIndex((entry) => entry.kind === "set");
    const prepared = swap.slice(0, setIndex).filter((entry) => entry.kind === "prepare" && entry.instrumentId === "blues-guitar");
    // Exactly one completed preparation precedes the swap, and it covers
    // every voice of every event in the looped plan.
    expect(prepared).toHaveLength(1);
    const plan = prepared[0]?.plan;
    if (plan === undefined) throw new Error("preparation carried no plan binding");
    const voices = plan.events.reduce((sum, event) => sum + event.midiPitches.length, 0);
    expect(prepared[0]?.notes).toBe(voices);
    expect(swap[setIndex]?.instrumentId).toBe("blues-guitar");
  } finally {
    await inner.transportService.submitTransportCommand({ commandRequestId: 1000, payload: { kind: "dispose-transport", reason: "page-teardown" } });
  }
}, 60_000);

test("Play with a cache-only plucked instrument starts on a safe prefix and never attacks an unrendered chord", async () => {
  const fake = createFakeAudioPlatform();
  const inner = createStudioAudio(fake.platform);
  const prepared: string[] = [];
  const run: { playAt: number | null } = { playAt: null };
  const statuses: string[] = [];
  inner.subscribe((notification) => statuses.push(notification.status));
  const audio: StudioAudioPort = {
    ...inner,
    prepareInstrument: async (...args) => {
      const done = await inner.prepareInstrument(...args);
      for (const note of args[1]) prepared.push(`${note.eventId ?? ""}:${String(note.voiceOrdinal ?? 0)}`);
      return done;
    },
    play: (...args) => {
      run.playAt = prepared.length;
      return inner.play(...args);
    },
  };
  const created = createStudioController({ audio });
  if (!created.ok) throw new Error(created.refusal.code);
  const controller = created.controller;
  try {
    expect(seedStarterChart(controller).seeded).toBe(true);
    expect(controller.setInstrument("ukulele").ok).toBe(true);
    expect(controller.playProgression(gesture).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    // Drive audio time through the whole run while render-ahead proceeds.
    const context = fake.contexts[0];
    if (context === undefined) throw new Error("no audio context");
    let seconds = 0;
    while (seconds < 120 && !(statuses.includes("playing") && statuses.at(-1) === "ready") && !statuses.includes("failed")) {
      seconds += 0.1;
      context.setCurrentTime(seconds);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    expect(statuses).not.toContain("failed");
    expect(statuses.at(-1)).toBe("ready");
    // Every voice was rendered exactly once; Play began on a prefix only.
    expect(new Set(prepared).size).toBe(prepared.length);
    expect(run.playAt).not.toBeNull();
    expect(run.playAt ?? 0).toBeGreaterThan(0);
    expect(run.playAt ?? 0).toBeLessThan(prepared.length);
  } finally {
    await inner.transportService.submitTransportCommand({ commandRequestId: 1000, payload: { kind: "dispose-transport", reason: "page-teardown" } });
  }
}, 120_000);
