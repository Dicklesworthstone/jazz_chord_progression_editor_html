import { describe, expect, test } from "bun:test";

import {
  attackRequest,
  readyEngine,
  requireSuccess,
  voice,
  voices,
} from "../support/audio-engine-test-kit";

const LIFECYCLE_CASE_IDS = [
  "X0-LIFE-018",
  "X0-LIFE-019",
  "X0-LIFE-027",
  "X0-REG-020",
  "X0-REG-021",
] as const;

describe("TR-X0-VOICE-LIFECYCLE synth voice lifecycle", () => {
  test("X0-LIFE-018/X0-LIFE-027 owns exact audio-clock automation and bounded stop times", async () => {
    const { engine, fake, context } = await readyEngine();
    context.setCurrentTime(10);
    const sourceOffset = context.sourceIds().length;
    const attacked = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("mellow-life", 69, 100)], {
          eventId: "mellow-life-event",
          startTimeSeconds: 10,
          releaseTimeSeconds: 10.005,
        }),
      ),
    );

    const active = attacked.snapshot.activeVoices[0];
    expect(active).toMatchObject({
      voiceId: "mellow-life",
      originalBatchVoiceCount: 1,
      normalizationGain: 0.62,
      attackTimeSeconds: 10,
      naturalReleaseTimeSeconds: 10.005,
      effectiveReleaseTimeSeconds: 10.005,
      releaseDurationSeconds: 0.55,
      scheduledSourceCount: 3,
    });
    expect(active?.cleanupDeadlineSeconds).toBeCloseTo(10.575, 12);
    const sourceIds = context.sourceIds().slice(sourceOffset);
    expect(sourceIds).toHaveLength(3);
    expect(
      fake.events.filter(
        (event) =>
          event.kind === "source-start" && sourceIds.includes(event.subject),
      ).map((event) => event.atTimeSeconds),
    ).toEqual([10, 10, 10]);
    const stopTimes = fake.events
      .filter(
        (event) =>
          event.kind === "source-stop" && sourceIds.includes(event.subject),
      )
      .map((event) => event.atTimeSeconds);
    expect(stopTimes).toHaveLength(3);
    expect(
      stopTimes.every(
        (time) => time !== null && Math.abs(time - 10.575) < 1e-12,
      ),
    ).toBe(true);
    expect(attacked.snapshot.work.parameterEventsScheduled).toBeGreaterThan(0);
  });

  test("X0-LIFE-019 creates and owns every source in the maximum legal batch", async () => {
    const { engine, context } = await readyEngine();
    const beforeSources = context.sourceIds().length;
    const attacked = requireSuccess(
      engine.attackAudioVoices(
        attackRequest(voices(16, "life-analog", { velocity: 127 }), {
          eventId: "life-analog-event",
          instrumentId: "analog-poly",
        }),
      ),
    );
    expect(attacked.snapshot.activeVoices).toHaveLength(16);
    expect(context.sourceIds().length - beforeSources).toBe(48);
    expect(
      attacked.snapshot.activeVoices.every(
        (entry) => entry.scheduledSourceCount === 3,
      ),
    ).toBe(true);
  });

  test("X0-REG-020/X0-REG-021 removes six indexes once and makes duplicate ended callbacks inert", async () => {
    const { engine, context } = await readyEngine();
    const nodeOffset = context.nodeIds().length;
    const sourceOffset = context.sourceIds().length;
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("cleanup-alpha")], {
          eventId: "cleanup-event",
        }),
      ),
    );
    const ownedNodeIds = context.nodeIds().slice(nodeOffset);
    const sourceIds = context.sourceIds().slice(sourceOffset);
    expect(engine.inspectAudioEngine().registryIndexCounts.totalReferences).toBe(6);

    const first = sourceIds[0];
    const second = sourceIds[1];
    const third = sourceIds[2];
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("TEST_SOURCE_MATRIX_MISMATCH");
    }
    context.finishSource(first);
    context.finishSource(second);
    expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(1);
    context.finishSource(third);

    const cleaned = engine.inspectAudioEngine();
    expect(cleaned.retainedVoiceCount).toBe(0);
    expect(cleaned.registryIndexCounts.totalReferences).toBe(0);
    expect(
      ownedNodeIds.every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);

    context.finishSource(third);
    const duplicate = engine.inspectAudioEngine();
    expect(duplicate.retainedVoiceCount).toBe(0);
    expect(
      ownedNodeIds.every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);
    expect(
      duplicate.debugEvents.some((event) => event.kind === "voice-cleanup-stale"),
    ).toBe(true);
    expect(LIFECYCLE_CASE_IDS).toHaveLength(5);
  });
});
