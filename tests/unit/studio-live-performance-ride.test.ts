/**
 * jcpe-7ftl / jcpe-pd7g: a committed groove or instrument change reaches a
 * LIVE run immediately — no Stop, no lost playhead — through the serialized
 * command lane. Laws under test, hand-authored from the X1 amendment:
 *
 *  - setPerformanceStyle during a run swaps the running plan (the transport
 *    inspect shows a new generation, playback continues) and re-stamps the
 *    application's run identity so a later seek does NOT refuse as stale.
 *  - setInstrument during a run reaches the engine without a generation
 *    boundary and playback continues.
 *  - Neither ride adds a second history entry: one groove change is one
 *    Undo, exactly as before.
 *  - With no run, neither ride touches the transport.
 */
import { describe, expect, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

function makeRig(): {
  controller: StudioController;
  audio: ReturnType<typeof createStudioAudio>;
} {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const creation = createStudioController({ audio });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  seedStarterChart(creation.controller);
  return { controller: creation.controller, audio };
}

const GESTURE = Object.freeze({
  kind: "trusted-pointer" as const,
  trusted: true as const,
  sequence: 1,
});

async function settle(done: () => boolean): Promise<void> {
  for (let round = 0; round < 60; round += 1) {
    if (done()) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }
}

describe("live groove switch (jcpe-7ftl controller lane)", () => {
  test("a groove change mid-run swaps the plan, keeps playing, and later seeks still work", async () => {
    const { controller, audio } = makeRig();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(
      () => controller.getSnapshot().transport.status === "playing",
    );
    const generationBefore = audio.inspect().transport.generation;

    const changed = controller.setPerformanceStyle("medium-swing@1");
    expect(JSON.stringify(changed.ok ? "ok" : changed)).toBe('"ok"');
    await settle(
      () => audio.inspect().transport.generation > generationBefore,
    );

    const inspected = audio.inspect().transport;
    expect(
      JSON.stringify({
        generationGrew: inspected.generation > generationBefore,
        status: controller.getSnapshot().transport.status,
      }),
    ).toBe(JSON.stringify({ generationGrew: true, status: "playing" }));

    /* The re-stamped run identity keeps seek/loop rebinds alive. */
    const seek = controller.seekToFraction(0.25);
    expect(JSON.stringify(seek.ok ? "ok" : seek)).toBe('"ok"');
  });

  test("one groove change stays one undo press, ride or no ride", async () => {
    const { controller } = makeRig();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(
      () => controller.getSnapshot().transport.status === "playing",
    );
    const before = controller.getSnapshot();
    const canUndoBefore = before.history.canUndo;

    expect(controller.setPerformanceStyle("bossa-nova@1").ok).toBe(true);
    const after = controller.getSnapshot();
    expect(after.history.canUndo).toBe(true);
    const undone = controller.undo();
    expect(undone.ok).toBe(true);
    expect(controller.getSnapshot().history.canUndo).toBe(canUndoBefore);
  });

  test("with no run, a groove change never touches the transport", () => {
    const { controller, audio } = makeRig();
    const generationBefore = audio.inspect().transport.generation;
    expect(controller.setPerformanceStyle("medium-swing@1").ok).toBe(true);
    expect(audio.inspect().transport.generation).toBe(generationBefore);
  });
});

describe("live instrument switch (jcpe-pd7g controller lane)", () => {
  test("an instrument change mid-run reaches the engine and playback continues", async () => {
    const { controller, audio } = makeRig();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(
      () => controller.getSnapshot().transport.status === "playing",
    );
    const generationBefore = audio.inspect().transport.generation;

    const changed = controller.setInstrument("vibraphone");
    expect(JSON.stringify(changed.ok ? "ok" : changed)).toBe('"ok"');
    await settle(
      () => audio.inspect().transport.instrumentId === "vibraphone",
    );

    const inspected = audio.inspect().transport;
    expect(
      JSON.stringify({
        instrumentId: inspected.instrumentId,
        /* set-instrument is NOT a generation boundary (X1 law). */
        generation: inspected.generation,
        status: controller.getSnapshot().transport.status,
      }),
    ).toBe(
      JSON.stringify({
        instrumentId: "vibraphone",
        generation: generationBefore,
        status: "playing",
      }),
    );
  });

  test("an instrument change stays one undo press", async () => {
    const { controller } = makeRig();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(
      () => controller.getSnapshot().transport.status === "playing",
    );
    expect(controller.setInstrument("fm-electric-piano").ok).toBe(true);
    expect(controller.undo().ok).toBe(true);
    expect(controller.getSnapshot().instrumentId).toBe("concert-grand");
  });
});
