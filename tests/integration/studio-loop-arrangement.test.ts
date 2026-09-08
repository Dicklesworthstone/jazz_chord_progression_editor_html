import { loopArrangementFixture } from "../support/loop-arrangement-fixture";
import { createStudioControllerOverState } from "../../src/application/studio-controller";
import { expect, test } from "bun:test";
import { createStudioAudio, createStudioController, seedStarterChart, type StudioAudioPort } from "../../src/application/runtime";
import type { PlaybackPlan } from "../../src/playback";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const gesture = { kind: "trusted-pointer", trusted: true, sequence: 1 } as const;
async function until(predicate: () => boolean): Promise<void> {
  for (let n = 0; n < 400 && !predicate(); n++) await new Promise(resolve => setTimeout(resolve, 5));
  expect(predicate()).toBe(true);
}

test("ordinary loop Play keeps separate bass and comp attacks instead of literal pads", async () => {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const plans: PlaybackPlan[] = [];
  const audio: StudioAudioPort = { ...inner, play: (...args) => { plans.push(args[1].plan); return inner.play(...args); } };
  const created = createStudioController({ audio });
  if (!created.ok) throw new Error(created.refusal.code);
  const controller = created.controller;
  seedStarterChart(controller);
  expect(controller.setInstrument("analog-poly").ok).toBe(true);
  const before = controller.getSnapshot();
  try {
    expect(controller.toggleLoop().ok).toBe(true);
    expect(controller.playProgression(gesture).ok).toBe(true);
    await until(() => plans.length === 1);
    const plan = plans[0];
    if (!plan) throw new Error("Missing actual plan handoff");
    expect(plan.loop).not.toBeNull();
    // The starter has 10 written chords. A ballad arrangement has independent
    // bass attacks and short comping stabs; ten full-chord pads cannot pass.
    expect(plan.events.length).toBeGreaterThan(10);
    expect(plan.events.some(event => event.midiPitches.length === 1)).toBe(true);
    expect(plan.events.some(event => event.midiPitches.length > 1 && event.durationTicks < 960)).toBe(true);
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(controller.getSnapshot().history).toEqual(before.history);
  } finally { await inner.transportService.submitTransportCommand({ commandRequestId: 999, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
}, 30_000);

test("a removed armed section refuses Play until Undo restores the exact section", async () => {
  const f = loopArrangementFixture(), fake = createFakeAudioPlatform();
  const audio = createStudioAudio(fake.platform);
  const controller = createStudioControllerOverState(f.state, f.dependencies, { audio });
  try {
    expect(controller.armSectionLoop("loop-section-1").ok).toBe(true);
    expect(controller.joinSections("loop-section-0").ok).toBe(true);
    const before = controller.getSnapshot();
    const refused = controller.playProgression(gesture);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("Removed passage silently became the whole chart");
    expect(refused.refusal.code).toBe("u1.playback_refused");
    expect(refused.refusal.message).toContain("Choose a section");
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(controller.getSnapshot().history).toEqual(before.history);
    expect(fake.contexts).toHaveLength(0);
    expect(controller.undo().ok).toBe(true);
    expect(controller.playProgression(gesture).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    const loop = audio.inspect().transport.loop;
    const bounds: readonly number[] | null = loop === null ? null : [
      loop.start.numerator, loop.start.denominator,
      loop.end.numerator, loop.end.denominator,
    ];
    expect(bounds).toEqual([4, 1, 8, 1]);
  } finally { await audio.transportService.submitTransportCommand({ commandRequestId: 999, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
}, 30_000);

test("live loop, section, groove and instrument paths receive arranged plans", async () => {
  const fixture = loopArrangementFixture();
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const bound: { action: string; plan: PlaybackPlan }[] = [];
  const warmed: PlaybackPlan[] = [];
  const audio: StudioAudioPort = { ...inner,
    play: (...args) => { bound.push({ action: "play", plan: args[1].plan }); return inner.play(...args); },
    setLoop: (...args) => { bound.push({ action: "loop", plan: args[1].plan }); return inner.setLoop(...args); },
    setPerformance: (...args) => { bound.push({ action: "groove", plan: args[1].plan }); return inner.setPerformance(...args); },
    prepareInstrument: (...args) => { if (args[2]) warmed.push(args[2].plan); return inner.prepareInstrument(...args); },
  };
  const controller = createStudioControllerOverState(fixture.state, fixture.dependencies, { audio });
  const before = controller.getSnapshot();
  const originalDocument = JSON.stringify(fixture.state.document);
  const hasBand = (plan: PlaybackPlan): void => {
    expect(plan.events.some(e => e.midiPitches.length === 1)).toBe(true);
    expect(plan.events.some(e => e.midiPitches.length > 1 && e.durationTicks < 960)).toBe(true);
  };
  try {
    expect(controller.playProgression(gesture).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing");
    const initial = bound[0]; if (!initial) throw new Error("Missing Play"); hasBand(initial.plan);
    expect(controller.toggleLoop().ok).toBe(true);
    await until(() => inner.inspect().transport.loop !== null);
    const whole = bound.at(-1); if (!whole) throw new Error("Missing live loop");
    hasBand(whole.plan); expect(whole.plan.events).toEqual(initial.plan.events);
    expect(controller.armSectionLoop("loop-section-1").ok).toBe(true);
    await until(() => inner.inspect().transport.loop?.start.numerator === 4);
    const section = bound.at(-1); if (!section) throw new Error("Missing section loop");
    hasBand(section.plan);
    expect(section.plan.events.every(e => e.sectionId === "loop-section-1")).toBe(true);
    expect(section.plan.events.map(e => e.eventId)).toEqual(initial.plan.events.filter(e => e.sectionId === "loop-section-1").map(e => e.eventId));
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(controller.getSnapshot().history).toEqual(before.history);
    const previousBindings = bound.length;
    expect(controller.setPerformanceStyle("bossa-nova@1").ok).toBe(true);
    await until(() => bound.length > previousBindings);
    const changed = bound.at(-1); if (!changed) throw new Error("Missing groove swap");
    expect(changed.action).toBe("groove"); hasBand(changed.plan);
    expect(changed.plan.loopTicks).toEqual(section.plan.loopTicks);
    expect(changed.plan.events).not.toEqual(section.plan.events);
    const previousWarming = warmed.length;
    expect(controller.setInstrument("vibraphone").ok).toBe(true);
    await until(() => warmed.length > previousWarming);
    const warm = warmed.at(-1); if (!warm) throw new Error("Missing instrument plan");
    expect(warm.events).toEqual(changed.plan.events); expect(warm.loop).toEqual(changed.plan.loop);
    expect(JSON.stringify(fixture.state.document)).toBe(originalDocument);
    const stop = await inner.stop(999);
    expect(stop.termination).toBe("receipt");
    if (stop.termination === "receipt") expect(stop.noFutureAttackPostcondition).toBe(true);
  } finally { await inner.transportService.submitTransportCommand({ commandRequestId: 1000, payload: { kind: "dispose-transport", reason: "page-teardown" } }); }
}, 30_000);
