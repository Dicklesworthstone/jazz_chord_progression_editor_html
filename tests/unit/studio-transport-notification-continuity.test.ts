/** Independent jcpe-7tgc regressions through the real application and X1.
 * This fake-clock layer proves identity/state behavior, not native audio. */
import { expect, test } from "bun:test";
import { createStudioAudio, createStudioComposition, seedStarterChart } from "../../src/application/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

const gesture = { kind: "trusted-pointer", trusted: true, sequence: 1 } as const;
async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await Bun.sleep(5);
  }
  throw new Error(`CONTINUITY_TIMEOUT:${label}`);
}

for (const action of ["none", "metronome", "count-in", "mute", "mix-preview", "volume", "instrument", "seek", "groove"] as const) {
  for (const ending of ["interruption", "natural-end"] as const) {
  test(`actual ${ending} reaches the studio after ${action}`, async () => {
    const fake = createFakeAudioPlatform();
    const audio = createStudioAudio(fake.platform);
    const created = createStudioComposition({ audio });
    if (!created.ok) throw new Error(created.refusal.code);
    const controller = created.composition.controller;
    expect(seedStarterChart(controller).seeded).toBe(true);
    expect(controller.playProgression(gesture).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing", "initial play");
    const originalRevision = audio.inspect().transport.planRevision;
    try {
      if (action === "metronome") {
        expect(controller.setMetronomeEnabled(true).ok).toBe(true);
        await until(() => controller.readClickToggles().metronomeEnabled, "metronome receipt");
      } else if (action === "count-in") {
        expect(controller.setCountInEnabled(true).ok).toBe(true);
        await until(() => controller.readClickToggles().countInEnabled, "count-in receipt");
      } else if (action === "mute") {
        expect(controller.toggleMute().ok).toBe(true);
      } else if (action === "mix-preview") {
        expect(controller.previewMasterVolume(0.3).ok).toBe(true);
      } else if (action === "volume") {
        expect(controller.setMasterVolume(0.3).ok).toBe(true);
        expect(audio.inspect().transport.planRevision).toBe(originalRevision);
      } else if (action === "seek") {
        expect(controller.seekToFraction(0.25).ok).toBe(true);
      } else if (action === "groove") {
        expect(controller.setPerformanceStyle("medium-swing@1").ok).toBe(true);
        await until(() => controller.readInstrumentBoundaryNotice() !== null, "groove receipt");
      } else if (action === "instrument") {
        const next = audio.inspect().transport.instrumentId === "concert-grand" ? "mellow-keys" : "concert-grand";
        expect(controller.setInstrument(next).ok).toBe(true);
        await until(() => controller.readInstrumentBoundaryNotice() !== null, "instrument receipt");
        // The instrument command must keep the exact already-bound plan.
        expect(audio.inspect().transport.planRevision).toBe(originalRevision);
      }
      const context = fake.contexts[0];
      if (context === undefined) throw new Error("Missing actual engine context");
      await until(() => audio.inspect().transport.queuedCommandCount === 0, "setting admission");
      const beforeEnd = created.composition.readApplicationState();
      if (ending === "interruption") {
        context.setState("suspended");
        await until(() => audio.inspect().transport.state === "interrupted", "X1 interruption");
        expect(controller.getSnapshot().transport.status).toBe("paused");
        expect(controller.getSnapshot().transport.statusLabel).toBe("Interrupted");
        expect(controller.getSnapshot().transport.failureCode).toBe("transport.interrupted");
      } else {
        expect(controller.seekToFraction(1).ok).toBe(true);
        await until(() => audio.inspect().transport.state === "ready", "X1 natural end");
        expect(audio.inspect().transport.work.naturalEndsPublished).toBe(1);
        expect(controller.getSnapshot().transport.status).toBe("ready");
        expect(controller.getSnapshot().transport.playheadBeatLabel).toBe("0/1");
      }
      const afterEnd = created.composition.readApplicationState();
      expect(afterEnd.document).toBe(beforeEnd.document);
      expect(afterEnd.revision).toBe(beforeEnd.revision);
      expect(afterEnd.history).toBe(beforeEnd.history);
    } finally {
      controller.stopProgression();
      await until(() => audio.inspect().transport.state === "ready", "cleanup stop");
      fake.contexts[0]?.finishAllSources();
    }
  });
  }
}

for (const action of ["instrument", "volume"] as const) {
  test(`a prior tempo edit cannot gain projection authority through ${action}`, async () => {
    const fake = createFakeAudioPlatform();
    const audio = createStudioAudio(fake.platform);
    const created = createStudioComposition({ audio });
    if (!created.ok) throw new Error(created.refusal.code);
    const controller = created.composition.controller;
    expect(seedStarterChart(controller).seeded).toBe(true);
    expect(controller.playProgression(gesture).ok).toBe(true);
    await until(() => controller.getSnapshot().transport.status === "playing", "initial play");
    try {
      expect(controller.setTempo(180).ok).toBe(true);
      const changed = action === "volume" ? controller.setMasterVolume(0.3)
        : controller.setInstrument("mellow-keys");
      expect(changed.ok).toBe(true);
      if (action === "instrument") await until(() => controller.readInstrumentBoundaryNotice() !== null, "instrument receipt");
      await until(() => audio.inspect().transport.queuedCommandCount === 0, "setting admission");
      const before = created.composition.readApplicationState();
      const context = fake.contexts[0];
      if (context === undefined) throw new Error("Missing engine context");
      context.setState("suspended");
      await until(() => audio.inspect().transport.state === "interrupted", "X1 interruption");
      expect(created.composition.readApplicationState()).toBe(before);
    } finally {
      controller.stopProgression();
      await until(() => audio.inspect().transport.state === "ready", "cleanup stop");
      fake.contexts[0]?.finishAllSources();
    }
  });
}
