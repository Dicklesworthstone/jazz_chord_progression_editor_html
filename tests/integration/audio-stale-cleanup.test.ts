import { describe, expect, test } from "bun:test";

import {
  attackRequest,
  readyEngine,
  requireFailure,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

const STALE_CASE_IDS = [
  "X0-REG-019",
  "X0-REG-020",
  "X0-REG-021",
  "X0-REG-022",
  "X0-REG-023",
] as const;

describe("TR-X0-STALE-CLEANUP audio stale cleanup", () => {
  test("X0-REG-019/X0-REG-020/X0-REG-021 repeats neither stop nor disconnect", async () => {
    const { engine, fake, context } = await readyEngine();
    const nodeOffset = context.nodeIds().length;
    const sourceOffset = context.sourceIds().length;
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("alpha")], { eventId: "alpha-event" }),
      ),
    );
    const firstRetirement = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "voice-ids", voiceIds: ["alpha"] },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );
    expect(firstRetirement.newlyRetiredVoiceIds).toEqual(["alpha"]);
    const stopsAfterFirst = fake.events.filter(
      (event) => event.kind === "source-stop",
    ).length;
    const repeated = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "voice-ids", voiceIds: ["alpha"] },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );
    expect(repeated.newlyRetiredVoiceIds).toEqual([]);
    expect(repeated.alreadyRetiringVoiceIds).toEqual(["alpha"]);
    expect(
      fake.events.filter((event) => event.kind === "source-stop"),
    ).toHaveLength(stopsAfterFirst);

    const sourceIds = context.sourceIds().slice(sourceOffset);
    const ownedNodeIds = context.nodeIds().slice(nodeOffset);
    for (const sourceId of sourceIds) context.finishSource(sourceId);
    expect(engine.inspectAudioEngine().registryIndexCounts.totalReferences).toBe(0);
    expect(
      ownedNodeIds.every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);

    const duplicate = sourceIds[sourceIds.length - 1];
    if (duplicate === undefined) throw new Error("TEST_SOURCE_MISSING");
    context.finishSource(duplicate);
    expect(
      ownedNodeIds.every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);
    expect(
      engine
        .inspectAudioEngine()
        .debugEvents.some((event) => event.detailCode === "audio.voice.cleanup.stale"),
    ).toBe(true);
  });

  test("X0-REG-022 late token-one callbacks cannot remove token two", async () => {
    const { engine, context } = await readyEngine();
    const oldSourceOffset = context.sourceIds().length;
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("shared", 60)], { eventId: "shared-event" }),
      ),
    );
    const oldSourceIds = context.sourceIds().slice(oldSourceOffset);
    const replacement = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("shared", 60)], { eventId: "shared-event" }),
      ),
    );
    const replacementVoice = replacement.snapshot.activeVoices.find(
      (entry) => entry.phase !== "releasing",
    );
    expect(replacementVoice?.instanceToken).toBe(2);
    expect(replacement.snapshot.registryIndexCounts.totalReferences).toBe(12);

    for (const sourceId of oldSourceIds) context.finishSource(sourceId);
    const afterOldCleanup = engine.inspectAudioEngine();
    expect(afterOldCleanup.retainedVoiceCount).toBe(1);
    expect(afterOldCleanup.activeVoices[0]?.instanceToken).toBe(2);
    expect(afterOldCleanup.registryIndexCounts.totalReferences).toBe(6);
    const lateOld = oldSourceIds[0];
    if (lateOld === undefined) throw new Error("TEST_SOURCE_MISSING");
    context.finishSource(lateOld);
    expect(engine.inspectAudioEngine().activeVoices[0]?.instanceToken).toBe(2);
  });

  test("X0-REG-023 a captured graph-one callback is stale after fault recovery to graph two", async () => {
    const { engine, fake, context } = await readyEngine({
      resumeBehavior: "reject",
    });
    const staleCallback = context.port.onstatechange;
    if (staleCallback === null) throw new Error("TEST_STATE_CALLBACK_MISSING");
    context.setState("interrupted");
    requireFailure(
      await engine.resumeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 2 },
      }),
      "audio.context_resume_failed",
    );
    const replacement = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-keyboard", trusted: true, sequence: 3 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
    );
    expect(replacement.graphInstanceId).toBe(2);

    staleCallback();
    const afterStale = engine.inspectAudioEngine();
    expect(afterStale.graphInstanceId).toBe(2);
    expect(afterStale.state).toBe("ready");
    expect(afterStale.registryIndexCounts.totalReferences).toBe(0);
    expect(
      afterStale.debugEvents.some(
        (event) => event.detailCode === "audio.context_state.stale",
      ),
    ).toBe(true);
    expect(fake.contextCreationCount()).toBe(2);
    expect(STALE_CASE_IDS).toHaveLength(5);
  });
});
