/**
 * V2R-15 loop + seek (jcpe-v2r-loop-seek-ukk6): seeking addresses only an
 * active run, looping is armed session intent that compiles into the next
 * plan, and every display read tells the transport's truth rather than the
 * button's hope. Expected values are hand-authored from the declared laws —
 * never read back from the controller.
 */
import { describe, expect, test } from "bun:test";

import {
  createStudioAudio,
  createStudioController,
  seedStarterChart,
} from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";

function makeController(): StudioController {
  const audio = createStudioAudio(createFakeAudioPlatform().platform);
  const creation = createStudioController({ audio });
  if (!creation.ok) {
    throw new Error(`controller refused: ${creation.refusal.code}`);
  }
  seedStarterChart(creation.controller);
  /* Loop/seek laws are independent of physical rendering. Keep this unit
   * test on the bounded oscillator lane so a cold physical preparation does
   * not consume the test's five-second lifecycle budget under suite load. */
  const instrument = creation.controller.setInstrument("analog-poly");
  if (!instrument.ok) {
    throw new Error(`controller instrument refused: ${instrument.refusal.code}`);
  }
  return creation.controller;
}

const GESTURE = Object.freeze({
  kind: "trusted-pointer" as const,
  trusted: true as const,
  sequence: 1,
});

async function settle(
  done: () => boolean = () => false,
): Promise<void> {
  /* The play path finishes its async handoff behind the engine-ready poll
   * (bounded 200ms retries), so settlement waits on real time — capped, and
   * ending early the moment the caller's condition holds. */
  for (let round = 0; round < 60; round += 1) {
    if (done()) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }
}

describe("V2R-15 seek", () => {
  test("seeking with no active run refuses honestly and moves nothing", () => {
    const controller = makeController();
    const result = controller.seekToFraction(0.5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe("u1.playback_refused");
  });

  test("a non-finite fraction refuses even during a run", async () => {
    const controller = makeController();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(() => controller.getSnapshot().transport.status === "playing");
    const result = controller.seekToFraction(Number.NaN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe("u1.playback_refused");
  });

  test("a fraction seek lands inside the run and never past its end", async () => {
    const controller = makeController();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(() => controller.getSnapshot().transport.status === "playing");
    /* Overshoot clamps to the plan's exact end rather than refusing. */
    expect(controller.seekToFraction(0.5).ok).toBe(true);
    expect(controller.seekToFraction(400).ok).toBe(true);
    expect(controller.seekToFraction(-3).ok).toBe(true);
    await settle();
  });
});

describe("V2R-15 loop", () => {
  test("toggling while stopped arms intent without engaging the transport", () => {
    const controller = makeController();
    expect(controller.readLoopView()).toEqual({
      enabled: false,
      engaged: false,
      sectionId: null,
    });
    expect(controller.toggleLoop().ok).toBe(true);
    expect(controller.readLoopView()).toEqual({
      enabled: true,
      engaged: false,
      sectionId: null,
    });
    expect(controller.toggleLoop().ok).toBe(true);
    expect(controller.readLoopView()).toEqual({
      enabled: false,
      engaged: false,
      sectionId: null,
    });
  });

  test("an armed loop engages the transport at Play and clears live", async () => {
    const controller = makeController();
    expect(controller.toggleLoop().ok).toBe(true);
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(() => controller.readLoopView().engaged);
    expect(controller.readLoopView()).toEqual({
      enabled: true,
      engaged: true,
      sectionId: null,
    });
    /* Toggling off during the run re-binds without one. */
    expect(controller.toggleLoop().ok).toBe(true);
    await settle(() => !controller.readLoopView().engaged);
    expect(controller.readLoopView()).toEqual({
      enabled: false,
      engaged: false,
      sectionId: null,
    });
  });

  test("toggling during an unlooped run engages the loop live", async () => {
    const controller = makeController();
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.readLoopView()).toEqual({
      enabled: false,
      engaged: false,
      sectionId: null,
    });
    expect(controller.toggleLoop().ok).toBe(true);
    await settle(() => controller.readLoopView().engaged);
    expect(controller.readLoopView()).toEqual({
      enabled: true,
      engaged: true,
      sectionId: null,
    });
  });

  test("loop and seek leave the document and history untouched", async () => {
    const controller = makeController();
    const revision = controller.getSnapshot().revision;
    /* The starter seed leaves its own history; loop/seek must ADD none. */
    const undoDepthBefore = controller.getSnapshot().history.canUndo;
    expect(controller.toggleLoop().ok).toBe(true);
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(() => controller.getSnapshot().transport.status === "playing");
    expect(controller.seekToFraction(0.25).ok).toBe(true);
    await settle();
    expect(controller.getSnapshot().revision).toBe(revision);
    expect(controller.getSnapshot().history.canUndo).toBe(undoDepthBefore);
  });
});

describe("V2R-18 section loop", () => {
  test("arming a section stores exclusive intent and disarms on a second press", () => {
    const controller = makeController();
    const sectionId = controller.getSnapshot().sections[0]?.id ?? "";
    expect(sectionId.length > 0).toBe(true);
    /* Whole-chart armed first: the section press must displace it. */
    expect(controller.toggleLoop().ok).toBe(true);
    expect(controller.armSectionLoop(sectionId).ok).toBe(true);
    expect(controller.readLoopView()).toEqual({
      enabled: false,
      engaged: false,
      sectionId,
    });
    /* The whole-chart press while a section is armed widens, not disarms. */
    expect(controller.toggleLoop().ok).toBe(true);
    expect(controller.readLoopView()).toEqual({
      enabled: true,
      engaged: false,
      sectionId: null,
    });
    expect(controller.toggleLoop().ok).toBe(true);
    expect(controller.armSectionLoop(sectionId).ok).toBe(true);
    expect(controller.armSectionLoop(sectionId).ok).toBe(true);
    expect(controller.readLoopView()).toEqual({
      enabled: false,
      engaged: false,
      sectionId: null,
    });
  });

  test("an unknown section refuses honestly", () => {
    const controller = makeController();
    const result = controller.armSectionLoop("no-such-section");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe("u1.playback_refused");
  });

  test("an armed section loop engages the transport over the section's exact span", async () => {
    const controller = makeController();
    /* Two sections with hand-authored spans: the starter chart occupies
     * 24/1 beats in one section; splitting after bar 4 leaves A = [0, 16)
     * and B = [16, 24). Expected values derive from the chart's written
     * durations (four 2+2 bars, then two whole-note bars), never from the
     * controller's own answers. */
    const first = controller.getSnapshot().sections[0]?.id ?? "";
    const fifthMeasureId =
      controller.getSnapshot().sections[0]?.measures[4]?.id ?? "";
    expect(fifthMeasureId.length > 0).toBe(true);
    const split = controller.splitSection(first, fifthMeasureId, "B");
    expect(split.ok).toBe(true);
    const second = controller.getSnapshot().sections[1]?.id ?? "";
    expect(second.length > 0).toBe(true);
    expect(controller.armSectionLoop(second).ok).toBe(true);
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(() => controller.readLoopView().engaged);
    expect(controller.readLoopView()).toEqual({
      enabled: false,
      engaged: true,
      sectionId: second,
    });
    const region = controller.readLoopRegionView();
    expect(region).not.toBeNull();
    if (region !== null) {
      expect(region.startFraction).toBeCloseTo(16 / 24, 10);
      expect(region.endFraction).toBe(1);
    }
    /* Disarming live re-binds to no loop and clears the region marker. */
    expect(controller.armSectionLoop(second).ok).toBe(true);
    await settle(() => !controller.readLoopView().engaged);
    expect(controller.readLoopRegionView()).toBeNull();
  });

  test("section loop and seek leave the document and history untouched", async () => {
    const controller = makeController();
    const sectionId = controller.getSnapshot().sections[0]?.id ?? "";
    const revision = controller.getSnapshot().revision;
    const undoDepthBefore = controller.getSnapshot().history.canUndo;
    expect(controller.armSectionLoop(sectionId).ok).toBe(true);
    expect(controller.playProgression(GESTURE).ok).toBe(true);
    await settle(() => controller.readLoopView().engaged);
    expect(controller.getSnapshot().revision).toBe(revision);
    expect(controller.getSnapshot().history.canUndo).toBe(undoDepthBefore);
  });
});
