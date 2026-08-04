/**
 * Document groove state (groove expansion 2026-07-30, amended by jcpe-jnnu).
 *
 * The groove is a document field now: choosing a non-default style lands one
 * undoable Set-groove entry, the default is stored as ABSENCE (picking it
 * deletes the field), re-picking the current groove is a friendly no-op,
 * and the active style always derives from the validated document — so
 * undo, share, and recovery move the audible groove with the chart.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import type { StudioAudioPort } from "../../src/application/studio-audio";
import { DEFAULT_GROOVE_STYLE_ID, GROOVE_STYLE_IDS } from "../../src/domain";
import { PERFORMANCE_STYLE_IDS, type PlaybackPlan } from "../../src/playback";
import { STUDIO_PERFORMANCE_STYLE } from "../../src/application/studio-playback";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

setDefaultTimeout(30_000);

/** A real port whose `play` records the exact plan the transport receives. */
function capturingController(): Readonly<{
  controller: StudioController;
  played: PlaybackPlan[];
}> {
  const inner = createStudioAudio(createFakeAudioPlatform().platform);
  const played: PlaybackPlan[] = [];
  const port: StudioAudioPort = Object.freeze({
    ...inner,
    play: (...args: Parameters<StudioAudioPort["play"]>) => {
      played.push(args[1].plan);
      return inner.play(...args);
    },
  });
  const creation = createStudioController({ audio: port });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  return Object.freeze({ controller: creation.controller, played });
}

async function planHandoff(played: readonly PlaybackPlan[]): Promise<void> {
  for (let turn = 0; turn < 600 && played.length === 0; turn += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }
}

function onsetSignature(plans: readonly PlaybackPlan[]): string {
  const last = plans[plans.length - 1];
  if (last === undefined) throw new Error("STYLE_TEST_NO_BOUND_PLAN");
  return last.events
    .map((event) => Number(event.startTick))
    .sort((left, right) => left - right)
    .join(",");
}

describe("groove vocabulary law", () => {
  test("the domain groove ids and playback style ids are one pinned vocabulary", () => {
    // jcpe-jnnu: the controller projects document.playback.grooveStyleId
    // straight into a PerformanceStyleId; that cast is safe exactly while
    // these two tuples are identical and share the default.
    expect([...GROOVE_STYLE_IDS]).toEqual([...PERFORMANCE_STYLE_IDS]);
    expect(DEFAULT_GROOVE_STYLE_ID).toBe(STUDIO_PERFORMANCE_STYLE);
  });
});

describe("setPerformanceStyle", () => {
  test("selects a declared style and publishes it in the snapshot", () => {
    const { controller } = capturingController();
    expect(controller.getSnapshot().performance.styleId).toBe("ballad-comp@1");

    const result = controller.setPerformanceStyle("medium-swing@1");
    expect(result.ok).toBe(true);
    const snapshot = controller.getSnapshot();
    expect(snapshot.performance.styleId).toBe("medium-swing@1");
    expect(snapshot.performance.styleLabel).toBe("Medium swing");
    // The options list every declared style exactly once.
    expect(snapshot.performance.options.map((option) => option.id)).toEqual([
      "ballad-comp@1",
      "medium-swing@1",
      "bossa-nova@1",
      "straight-eighths@1",
      "syncopated-sixteenths@1",
      "block-chords@1",
    ]);
  });

  test("refuses an unknown style by name and changes nothing", () => {
    const { controller } = capturingController();
    const before = controller.getSnapshot();
    const result = controller.setPerformanceStyle("trap-beat@9");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("STYLE_TEST_EXPECTED_REFUSAL");
    expect(result.refusal.code).toBe("u1.performance_style_unknown");
    expect(result.refusal.message).toContain("trap-beat@9");
    expect(controller.getSnapshot().performance.styleId).toBe(
      before.performance.styleId,
    );
  });

  test("is a document setting: one undoable history entry that undo reverts", () => {
    const { controller } = capturingController();
    const seeded = seedStarterChart(controller);
    expect(seeded.seeded).toBe(true);
    const before = controller.getSnapshot();

    expect(controller.setPerformanceStyle("bossa-nova@1").ok).toBe(true);
    const after = controller.getSnapshot();
    expect(after.revision).toBe(before.revision + 1);
    expect(after.history.canUndo).toBe(true);
    expect(after.history.undoLabel).toBe("Set groove");
    expect(after.performance.styleId).toBe("bossa-nova@1");

    // Undo moves the audible groove back with the chart.
    expect(controller.undo().ok).toBe(true);
    expect(controller.getSnapshot().performance.styleId).toBe(
      before.performance.styleId,
    );
  });

  test("re-picking the current groove is a no-op, not a same-value refusal", () => {
    const { controller } = capturingController();
    const before = controller.getSnapshot();
    expect(before.performance.styleId).toBe("ballad-comp@1");
    const result = controller.setPerformanceStyle("ballad-comp@1");
    expect(result.ok).toBe(true);
    const after = controller.getSnapshot();
    expect(after.revision).toBe(before.revision);
    expect(after.history.canUndo).toBe(before.history.canUndo);
  });

  test("picking the default groove after a stored one deletes the field undoably", () => {
    const { controller } = capturingController();
    expect(controller.setPerformanceStyle("medium-swing@1").ok).toBe(true);
    expect(controller.getSnapshot().performance.styleId).toBe(
      "medium-swing@1",
    );
    expect(controller.setPerformanceStyle("ballad-comp@1").ok).toBe(true);
    const restored = controller.getSnapshot();
    expect(restored.performance.styleId).toBe("ballad-comp@1");
    // Two entries: swing, then back to the canonical absent default.
    expect(controller.undo().ok).toBe(true);
    expect(controller.getSnapshot().performance.styleId).toBe(
      "medium-swing@1",
    );
    expect(controller.undo().ok).toBe(true);
    expect(controller.getSnapshot().performance.styleId).toBe(
      "ballad-comp@1",
    );
  });

  test("the next Play performs the chart in the selected style", async () => {
    const first = capturingController();
    expect(seedStarterChart(first.controller).seeded).toBe(true);
    const played = first.controller.playProgression({
      kind: "trusted-pointer",
      trusted: true,
      sequence: 1,
    });
    expect(played.ok).toBe(true);
    await planHandoff(first.played);
    expect(first.played.length).toBeGreaterThan(0);
    const balladSignature = onsetSignature(first.played);

    const second = capturingController();
    expect(seedStarterChart(second.controller).seeded).toBe(true);
    expect(second.controller.setPerformanceStyle("medium-swing@1").ok).toBe(
      true,
    );
    const swung = second.controller.playProgression({
      kind: "trusted-pointer",
      trusted: true,
      sequence: 1,
    });
    expect(swung.ok).toBe(true);
    await planHandoff(second.played);
    expect(second.played.length).toBeGreaterThan(0);
    const swingSignature = onsetSignature(second.played);

    // Same chart, different session style, audibly different performance.
    expect(swingSignature).not.toBe(balladSignature);
  });
});
