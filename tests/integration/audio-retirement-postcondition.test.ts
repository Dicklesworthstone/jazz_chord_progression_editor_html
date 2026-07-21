import { describe, expect, test } from "bun:test";

import {
  attackInBatches,
  attackRequest,
  previewOwner,
  progressionOwner,
  readyEngine,
  requireSuccess,
  voice,
  voices,
} from "../support/audio-engine-test-kit";

const RETIREMENT_CASE_IDS = [
  "X0-LIFE-029",
  "X0-LIFE-030",
  "X0-REG-017",
  "X0-REG-024",
] as const;

describe("TR-X0-STOP-POSTCONDITION audio retirement postcondition", () => {
  test("X0-LIFE-029 stops every future source no later than its scheduled attack", async () => {
    const { engine, fake, context } = await readyEngine();
    context.setCurrentTime(10);
    const sourceOffset = context.sourceIds().length;
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("future")], {
          eventId: "future-event",
          startTimeSeconds: 10.2,
          releaseTimeSeconds: 11,
        }),
      ),
    );
    const sourceIds = context.sourceIds().slice(sourceOffset);
    const retirementEventOffset = fake.events.length;
    const retired = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "generation", ownerKind: "progression", generation: 1 },
        reason: "generation-retire",
        atTimeSeconds: 10.1,
      }),
    );
    expect(retired.noFutureAttackPostcondition).toBe(true);
    const stops = fake.events.slice(retirementEventOffset).filter(
      (event) => event.kind === "source-stop" && sourceIds.includes(event.subject),
    );
    expect(stops).toHaveLength(3);
    expect(
      stops.every(
        (event) =>
          event.atTimeSeconds !== null && event.atTimeSeconds <= 10.2,
      ),
    ).toBe(true);
    for (const sourceId of sourceIds) context.finishSource(sourceId);
    expect(engine.inspectAudioEngine().registryIndexCounts.totalReferences).toBe(0);
  });

  test("X0-LIFE-030/X0-REG-017 retires all 64 once in sorted order and reaches an empty registry", async () => {
    const { engine, fake, context } = await readyEngine();
    const ownedNodeOffset = context.nodeIds().length;
    attackInBatches(engine, voices(48, "stop-p"), {
      owner: progressionOwner(4),
      eventPrefix: "stop-p",
      instrumentId: "mellow-keys",
    });
    attackInBatches(engine, voices(16, "stop-v", { midiStart: 72 }), {
      owner: previewOwner(5, "stop-preview"),
      eventPrefix: "stop-v",
      instrumentId: "fm-electric-piano",
    });

    const first = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );
    expect(first.newlyRetiredVoiceIds).toHaveLength(64);
    expect(first.newlyRetiredVoiceIds).toEqual(
      [...first.newlyRetiredVoiceIds].sort(),
    );
    expect(first.noFutureAttackPostcondition).toBe(true);
    const stopCount = fake.events.filter(
      (event) => event.kind === "source-stop",
    ).length;
    const second = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );
    expect(second.newlyRetiredVoiceIds).toEqual([]);
    expect(second.alreadyRetiringVoiceIds).toHaveLength(64);
    expect(
      fake.events.filter((event) => event.kind === "source-stop"),
    ).toHaveLength(stopCount);

    context.finishAllSources();
    const final = engine.inspectAudioEngine();
    expect(final.retainedVoiceCount).toBe(0);
    expect(final.registryIndexCounts.totalReferences).toBe(0);
    expect(
      context
        .nodeIds()
        .slice(ownedNodeOffset)
        .every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);
  });

  test("X0-REG-024 survives 100 attack-stop-cleanup cycles on one graph", async () => {
    const { engine, fake, context } = await readyEngine();
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const sourceOffset = context.sourceIds().length;
      const nodeOffset = context.nodeIds().length;
      requireSuccess(
        engine.attackAudioVoices(
          attackRequest([voice(`cycle-${String(cycle)}`, 48 + (cycle % 36))], {
            eventId: `cycle-event-${String(cycle)}`,
          }),
        ),
      );
      const retired = requireSuccess(
        engine.retireAudioVoices({
          selector: { kind: "all" },
          reason: "all-notes-off",
          atTimeSeconds: 0,
        }),
      );
      expect(retired.noFutureAttackPostcondition).toBe(true);
      for (const sourceId of context.sourceIds().slice(sourceOffset)) {
        context.finishSource(sourceId);
      }
      expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(0);
      expect(
        context
          .nodeIds()
          .slice(nodeOffset)
          .every((nodeId) => context.disconnectCount(nodeId) === 1),
      ).toBe(true);
    }
    const final = engine.inspectAudioEngine();
    expect(final.graphInstanceId).toBe(1);
    expect(final.registryIndexCounts.totalReferences).toBe(0);
    expect(final.debugEvents.length).toBeGreaterThanOrEqual(300);
    expect(final.debugEvents.length).toBeLessThanOrEqual(4_096);
    expect(final.debugEventsDropped).toBe(0);
    expect(fake.contextCreationCount()).toBe(1);
    expect(RETIREMENT_CASE_IDS).toHaveLength(4);
  });
});
