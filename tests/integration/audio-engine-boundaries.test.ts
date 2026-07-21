import { describe, expect, test } from "bun:test";

import {
  MAX_AUDIO_DEBUG_EVENTS,
  MAX_AUDIO_INTERNAL_SEQUENCE,
  MAX_AUDIO_REGISTRY_INDEX_REFERENCES,
  MAX_AUDIO_RETAINED_VOICES,
  MAX_AUDIO_SCHEDULED_SOURCE_NODES,
  createAudioEngine,
  type AudioEngine,
  type AudioEngineSnapshot,
  type AudioRetireRequest,
} from "../../src/audio";
import { createAudioEngineWithSequenceSeedForTest } from "../../src/audio/audio-engine";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import {
  attackInBatches,
  attackRequest,
  previewOwner,
  progressionOwner,
  readyEngine,
  requireFailure,
  requireSuccess,
  voice,
  voices,
} from "../support/audio-engine-test-kit";

function expectVoiceAndGraphStateUnchanged(
  before: AudioEngineSnapshot,
  after: AudioEngineSnapshot,
): void {
  expect(after).toMatchObject({
    state: before.state,
    graphInstanceId: before.graphInstanceId,
    mix: before.mix,
    retainedVoiceCount: before.retainedVoiceCount,
    nonreleasingVoiceCount: before.nonreleasingVoiceCount,
    releasingVoiceCount: before.releasingVoiceCount,
    registryIndexCounts: before.registryIndexCounts,
    persistentCreatedNodeCount: before.persistentCreatedNodeCount,
    persistentEdgeCount: before.persistentEdgeCount,
  });
  expect(after.activeVoices).toEqual(before.activeVoices);
}

function fillGlobalCapacity(engine: AudioEngine): void {
  attackInBatches(engine, voices(48, "capacity-progression"), {
    owner: progressionOwner(1),
    eventPrefix: "capacity-progression",
    instrumentId: "mellow-keys",
  });
  attackInBatches(engine, voices(16, "capacity-preview", { midiStart: 72 }), {
    owner: previewOwner(2, "capacity-preview"),
    eventPrefix: "capacity-preview",
    instrumentId: "fm-electric-piano",
  });
}

describe("TR-X0-BOUNDS-OFFLINE exact executable boundaries", () => {
  test("X0-LIFE-017 refuses attack while uninitialized without creating context, graph, or voice", () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngine(fake.platform);

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("uninitialized")], {
          eventId: "uninitialized-event",
        }),
      ),
      "audio.engine_not_ready",
    );

    expect(fake.contextCreationCount()).toBe(0);
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "uninitialized",
      graphInstanceId: null,
      retainedVoiceCount: 0,
      registryIndexCounts: { totalReferences: 0 },
      persistentCreatedNodeCount: 0,
      persistentEdgeCount: 0,
    });
  });

  test("X0-LIFE-019 admits exactly sixteen Analog Poly voices and forty-eight bounded sources", async () => {
    const { engine, context } = await readyEngine();
    const sourceCountBefore = context.sourceIds().length;

    const receipt = requireSuccess(
      engine.attackAudioVoices(
        attackRequest(voices(16, "analog-limit"), {
          eventId: "analog-limit-event",
          instrumentId: "analog-poly",
        }),
      ),
    );

    expect(receipt.snapshot).toMatchObject({
      retainedVoiceCount: 16,
      nonreleasingVoiceCount: 16,
      registryIndexCounts: { totalReferences: 96 },
    });
    expect(context.sourceIds().length - sourceCountBefore).toBe(48);
    expect(
      receipt.snapshot.activeVoices.every(
        (entry) => entry.scheduledSourceCount === 3,
      ),
    ).toBe(true);
  });

  test("X0-LIFE-020 refuses an empty runtime batch atomically", async () => {
    const { engine, context } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const nodesBefore = context.nodeIds();

    requireFailure(
      engine.attackAudioVoices({
        ...attackRequest([voice("placeholder")]),
        voices: [],
      } as never),
      "audio.voice_batch_empty",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-021 refuses a seventeen-voice runtime batch atomically", async () => {
    const { engine, context } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const nodesBefore = context.nodeIds();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest(voices(17, "over-batch"), {
          eventId: "over-batch-event",
        }),
      ),
      "audio.voice_batch_limit",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-022 refuses a start one microsecond before current audio time", async () => {
    const { engine, context } = await readyEngine();
    context.setCurrentTime(10);
    const before = engine.inspectAudioEngine();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("past-start")], {
          eventId: "past-start-event",
          startTimeSeconds: 9.999_999,
          releaseTimeSeconds: 11,
        }),
      ),
      "audio.start_time_invalid",
    );

    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-023 admits the exact 0.25-second scheduling horizon", async () => {
    const { engine, context } = await readyEngine();
    context.setCurrentTime(10);

    const receipt = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("horizon-inclusive")], {
          eventId: "horizon-inclusive-event",
          startTimeSeconds: 10.25,
          releaseTimeSeconds: 11,
        }),
      ),
    );

    expect(receipt.snapshot.activeVoices[0]).toMatchObject({
      voiceId: "horizon-inclusive",
      attackTimeSeconds: 10.25,
    });
  });

  test("X0-LIFE-024 refuses a start one microsecond beyond the scheduling horizon", async () => {
    const { engine, context } = await readyEngine();
    context.setCurrentTime(10);
    const before = engine.inspectAudioEngine();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("horizon-over")], {
          eventId: "horizon-over-event",
          startTimeSeconds: 10.250_001,
          releaseTimeSeconds: 11,
        }),
      ),
      "audio.start_time_invalid",
    );

    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-025 refuses release equal to attack time", async () => {
    const { engine, context } = await readyEngine();
    context.setCurrentTime(10);
    const before = engine.inspectAudioEngine();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("zero-gate")], {
          eventId: "zero-gate-event",
          startTimeSeconds: 10,
          releaseTimeSeconds: 10,
        }),
      ),
      "audio.release_time_invalid",
    );

    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-026 refuses a gate one microsecond below 0.005 seconds", async () => {
    const { engine, context } = await readyEngine();
    context.setCurrentTime(10);
    const before = engine.inspectAudioEngine();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("short-gate")], {
          eventId: "short-gate-event",
          startTimeSeconds: 10,
          releaseTimeSeconds: 10.004_999,
        }),
      ),
      "audio.release_time_invalid",
    );

    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-027 admits the exact 0.005-second minimum gate", async () => {
    const { engine, context } = await readyEngine();
    context.setCurrentTime(10);

    const receipt = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("minimum-gate")], {
          eventId: "minimum-gate-event",
          startTimeSeconds: 10,
          releaseTimeSeconds: 10.005,
        }),
      ),
    );

    expect(receipt.snapshot.activeVoices[0]).toMatchObject({
      voiceId: "minimum-gate",
      attackTimeSeconds: 10,
      naturalReleaseTimeSeconds: 10.005,
    });
  });

  test("X0-LIFE-028 refuses a gate one microsecond beyond 600 seconds", async () => {
    const { engine, context } = await readyEngine();
    context.setCurrentTime(10);
    const before = engine.inspectAudioEngine();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("long-gate")], {
          eventId: "long-gate-event",
          startTimeSeconds: 10,
          releaseTimeSeconds: 610.000_001,
        }),
      ),
      "audio.gate_duration_limit",
    );

    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-034 faults and cleans every resource instead of wrapping a voice identity sequence", async () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngineWithSequenceSeedForTest(fake.platform, {
      lastGraphSequence: 0,
      lastVoiceSequence: MAX_AUDIO_INTERNAL_SEQUENCE,
      lastDebugSequence: 0,
    });
    requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
    );
    const context = fake.contexts[0];
    if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");

    const exhausted = engine.attackAudioVoices(
      attackRequest([voice("sequence-exhausted")], {
        eventId: "sequence-exhausted-event",
      }),
    );

    requireFailure(exhausted, "audio.internal_sequence_exhausted");
    expect(exhausted.termination).toBe("platform-fault");
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "fault",
      graphInstanceId: null,
      retainedVoiceCount: 0,
      registryIndexCounts: { totalReferences: 0 },
      persistentCreatedNodeCount: 0,
      persistentEdgeCount: 0,
    });
    expect(context.sourceIds()).toHaveLength(0);
    expect(context.closeCount()).toBe(1);
  });

  test("X0-LIFE-035 refuses progression generation zero before allocation", async () => {
    const { engine, context } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const nodesBefore = context.nodeIds();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("bad-owner")], {
          owner: { kind: "progression", generation: 0 } as never,
          eventId: "bad-owner-event",
        }),
      ),
      "audio.owner_invalid",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-036 refuses an event ID containing a space before allocation", async () => {
    const { engine, context } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const nodesBefore = context.nodeIds();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("bad-event")], { eventId: "bad event" }),
      ),
      "audio.event_id_invalid",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-037 refuses a sampled-grand-piano runtime instrument ID", async () => {
    const { engine, context } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const nodesBefore = context.nodeIds();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("bad-instrument")], {
          eventId: "bad-instrument-event",
          instrumentId: "sampled-grand-piano" as never,
        }),
      ),
      "audio.instrument_id_invalid",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-038 refuses a non-ASCII sharp sign in a voice ID", async () => {
    const { engine, context } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const nodesBefore = context.nodeIds();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("C♯4")], { eventId: "non-ascii-voice-event" }),
      ),
      "audio.voice_id_invalid",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-039 refuses runtime MIDI pitch 128 before allocation", async () => {
    const { engine, context } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const nodesBefore = context.nodeIds();
    const malformed = { ...voice("bad-pitch"), midiPitch: 128 } as never;

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([malformed], { eventId: "bad-pitch-event" }),
      ),
      "audio.midi_pitch_invalid",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-040 refuses runtime velocity zero before allocation", async () => {
    const { engine, context } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const nodesBefore = context.nodeIds();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("bad-velocity", 60, 0)], {
          eventId: "bad-velocity-event",
        }),
      ),
      "audio.velocity_invalid",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-041 refuses retained-tail overflow before victim mutation or incoming allocation", async () => {
    const { engine, context } = await readyEngine();
    fillGlobalCapacity(engine);
    for (let index = 0; index < 56; index += 1) {
      requireSuccess(
        engine.attackAudioVoices(
          attackRequest([voice(`retained-tail-${String(index)}`, 96)], {
            eventId: `retained-tail-event-${String(index)}`,
          }),
        ),
      );
    }
    const before = engine.inspectAudioEngine();
    expect(before).toMatchObject({
      retainedVoiceCount: 120,
      nonreleasingVoiceCount: 64,
      releasingVoiceCount: 56,
      registryIndexCounts: { totalReferences: 720 },
    });
    const nodesBefore = context.nodeIds();
    const sourcesBefore = context.sourceIds();

    requireFailure(
      engine.attackAudioVoices(
        attackRequest(voices(16, "retained-overflow", { midiStart: 24 }), {
          eventId: "retained-overflow-event",
          instrumentId: "analog-poly",
        }),
      ),
      "audio.retiring_voice_capacity",
    );

    expect(context.nodeIds()).toEqual(nodesBefore);
    expect(context.sourceIds()).toEqual(sourcesBefore);
    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-042 refuses an unknown retirement selector without changing the active voice", async () => {
    const { engine } = await readyEngine();
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("selector-alpha")], {
          eventId: "selector-alpha-event",
        }),
      ),
    );
    const before = engine.inspectAudioEngine();

    requireFailure(
      engine.retireAudioVoices({
        selector: { kind: "random" },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      } as unknown as AudioRetireRequest),
      "audio.retirement_selector_invalid",
    );

    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-043 refuses retirement one microsecond beyond the 0.25-second horizon", async () => {
    const { engine, context } = await readyEngine();
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("retirement-horizon")], {
          eventId: "retirement-horizon-event",
          releaseTimeSeconds: 20,
        }),
      ),
    );
    context.setCurrentTime(10);
    const before = engine.inspectAudioEngine();

    requireFailure(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "all-notes-off",
        atTimeSeconds: 10.250_001,
      }),
      "audio.retirement_time_invalid",
    );

    expectVoiceAndGraphStateUnchanged(before, engine.inspectAudioEngine());
  });

  test("X0-LIFE-044 keeps closed terminal for a later otherwise valid attack", async () => {
    const { engine, fake, context } = await readyEngine();
    requireSuccess(
      await engine.disposeAudioEngine({ reason: "page-teardown" }),
    );

    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("after-close")], { eventId: "after-close-event" }),
      ),
      "audio.engine_closed",
    );

    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "closed",
      graphInstanceId: null,
      retainedVoiceCount: 0,
      registryIndexCounts: { totalReferences: 0 },
    });
    expect(fake.contextCreationCount()).toBe(1);
    expect(context.closeCount()).toBe(1);
  });

  test("X0-REG-017 all-notes-off retains all sixty-four owned tails and six indexes until cleanup", async () => {
    const { engine } = await readyEngine();
    fillGlobalCapacity(engine);

    const receipt = requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );

    expect(receipt.newlyRetiredVoiceIds).toHaveLength(64);
    expect(receipt.newlyRetiredVoiceIds).toEqual(
      [...receipt.newlyRetiredVoiceIds].sort(),
    );
    expect(receipt.snapshot).toMatchObject({
      retainedVoiceCount: 64,
      nonreleasingVoiceCount: 0,
      releasingVoiceCount: 64,
      registryIndexCounts: { totalReferences: 384 },
    });
    expect(receipt.noFutureAttackPostcondition).toBe(true);
  });

  test("X0-REG-024 survives one hundred attack-retire-cleanup cycles on one bounded graph", async () => {
    const { engine, fake, context } = await readyEngine();
    const persistentNodeIds = new Set(context.nodeIds());
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const sourceOffset = context.sourceIds().length;
      requireSuccess(
        engine.attackAudioVoices(
          attackRequest([voice(`stress-${String(cycle)}`, 48 + (cycle % 36))], {
            eventId: `stress-event-${String(cycle)}`,
          }),
        ),
      );
      requireSuccess(
        engine.retireAudioVoices({
          selector: { kind: "all" },
          reason: "all-notes-off",
          atTimeSeconds: 0,
        }),
      );
      const cycleSources = context.sourceIds().slice(sourceOffset);
      expect(cycleSources).toHaveLength(3);
      for (const sourceId of cycleSources) context.finishSource(sourceId);
      expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(0);
    }
    const final = engine.inspectAudioEngine();
    const voiceNodeIds = context
      .nodeIds()
      .filter((nodeId) => !persistentNodeIds.has(nodeId));

    expect(final).toMatchObject({
      state: "ready",
      graphInstanceId: 1,
      retainedVoiceCount: 0,
      registryIndexCounts: { totalReferences: 0 },
      persistentCreatedNodeCount: 12,
      persistentEdgeCount: 13,
    });
    expect(fake.contextCreationCount()).toBe(1);
    expect(context.closeCount()).toBe(0);
    expect(final.debugEvents.length).toBeLessThanOrEqual(MAX_AUDIO_DEBUG_EVENTS);
    expect(
      voiceNodeIds.every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);
  });

  test("X0-REG-028 global admission retains sixty-four sounding voices plus one bounded tail", async () => {
    const { engine } = await readyEngine();
    fillGlobalCapacity(engine);

    const receipt = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("global-incoming", 100)], {
          eventId: "global-incoming-event",
          instrumentId: "vibraphone",
        }),
      ),
    );
    const scheduledSourceCount = receipt.snapshot.activeVoices.reduce(
      (total, entry) => total + entry.scheduledSourceCount,
      0,
    );

    expect(receipt.stolenVoiceIds).toEqual(["capacity-progression-000"]);
    expect(receipt.snapshot).toMatchObject({
      retainedVoiceCount: 65,
      nonreleasingVoiceCount: 64,
      releasingVoiceCount: 1,
      registryIndexCounts: { totalReferences: 390 },
    });
    expect(receipt.snapshot.retainedVoiceCount).toBeLessThanOrEqual(
      MAX_AUDIO_RETAINED_VOICES,
    );
    expect(receipt.snapshot.registryIndexCounts.totalReferences).toBeLessThanOrEqual(
      MAX_AUDIO_REGISTRY_INDEX_REFERENCES,
    );
    expect(scheduledSourceCount).toBeLessThanOrEqual(
      MAX_AUDIO_SCHEDULED_SOURCE_NODES,
    );
  });

  test("X0-ROUTE-014 page teardown closes once, drains indexes, and disconnects all owned nodes once", async () => {
    const { engine, context } = await readyEngine();
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("route-teardown")], {
          eventId: "route-teardown-event",
        }),
      ),
    );
    const ownedNodeIds = context
      .nodeIds()
      .filter((nodeId) => !nodeId.includes("destination"));

    const receipt = requireSuccess(
      await engine.disposeAudioEngine({ reason: "page-teardown" }),
    );

    expect(receipt.snapshot).toMatchObject({
      state: "closed",
      graphInstanceId: null,
      retainedVoiceCount: 0,
      registryIndexCounts: { totalReferences: 0 },
      persistentCreatedNodeCount: 0,
      persistentEdgeCount: 0,
    });
    expect(context.closeCount()).toBe(1);
    expect(
      ownedNodeIds.every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);
  });
});
