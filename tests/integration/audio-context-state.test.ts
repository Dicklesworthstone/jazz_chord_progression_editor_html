import { describe, expect, test } from "bun:test";

import * as publicAudio from "../../src/audio";
import {
  MAX_AUDIO_INTERNAL_SEQUENCE,
  createAudioEngine,
  type AudioPlatform,
} from "../../src/audio";
import { createAudioEngineWithSequenceSeedForTest } from "../../src/audio/audio-engine";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import {
  attackRequest,
  readyEngine,
  requireFailure,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

const CONTEXT_CASE_IDS = [
  "X0-LIFE-005",
  "X0-LIFE-006",
  "X0-LIFE-007",
  "X0-LIFE-008",
  "X0-LIFE-010",
  "X0-LIFE-011",
  "X0-LIFE-012",
  "X0-LIFE-013",
  "X0-LIFE-031",
  "X0-LIFE-032",
  "X0-LIFE-033",
  "X0-LIFE-034",
  "X0-ROUTE-013",
  "X0-ROUTE-014",
  "X0-REG-023",
] as const;

const INITIAL_MIX = Object.freeze({ masterVolume: 0.8, reverbAmount: 0.2 });

describe("TR-X0-FAULT-RESUME audio context state", () => {
  test("X0-LIFE-005/X0-LIFE-008 retries a failed factory only under a fresh trusted gesture", async () => {
    const fallback = createFakeAudioPlatform();
    let attempts = 0;
    const failOnce: AudioPlatform = Object.freeze({
      createContext(options) {
        attempts += 1;
        if (attempts === 1) throw new Error("TEST_FIRST_CONTEXT_FAILURE");
        return fallback.platform.createContext(options);
      },
    });
    const engine = createAudioEngine(failOnce);
    const failed = await engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: INITIAL_MIX,
    });
    requireFailure(failed, "audio.context_create_failed");
    expect(failed.termination).toBe("platform-fault");
    expect(engine.inspectAudioEngine().state).toBe("fault");
    expect(fallback.contextCreationCount()).toBe(0);

    const retried = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-keyboard", trusted: true, sequence: 2 },
        initialMix: INITIAL_MIX,
      }),
    );
    expect(retried).toMatchObject({ state: "ready", graphInstanceId: 1 });
    expect(attempts).toBe(2);
    expect(fallback.contextCreationCount()).toBe(1);
  });

  test("X0-LIFE-006/X0-LIFE-007 rejects an unsupported rate and disconnects a partial graph", async () => {
    const badRate = createFakeAudioPlatform({ sampleRate: 7_999 });
    const badRateEngine = createAudioEngine(badRate.platform);
    const unsupported = await badRateEngine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: INITIAL_MIX,
    });
    requireFailure(unsupported, "audio.context_sample_rate_unsupported");
    expect(unsupported.termination).toBe("platform-fault");
    expect(badRate.contexts[0]?.closeCount()).toBe(1);
    expect(badRateEngine.inspectAudioEngine().graphInstanceId).toBeNull();

    const partial = createFakeAudioPlatform({ failNodeCreationAt: 6 });
    const partialEngine = createAudioEngine(partial.platform);
    const failedGraph = await partialEngine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: INITIAL_MIX,
    });
    requireFailure(failedGraph, "audio.graph_create_failed");
    const context = partial.contexts[0];
    if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
    expect(context.closeCount()).toBe(1);
    expect(
      context
        .nodeIds()
        .filter((nodeId) => !nodeId.includes("destination"))
        .every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);
    expect(partialEngine.inspectAudioEngine()).toMatchObject({
      state: "fault",
      graphInstanceId: null,
      persistentCreatedNodeCount: 0,
    });
  });

  test("X0-LIFE-010/X0-LIFE-011/X0-LIFE-013/X0-ROUTE-013 resumes suspension and interruption on the same graph", async () => {
    const { engine, fake, context } = await readyEngine();
    context.setState("suspended");
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "suspended",
      graphInstanceId: 1,
    });
    requireFailure(
      await engine.resumeAudioEngine({
        gesture: {
          kind: "trusted-keyboard",
          trusted: false,
          sequence: 2,
        } as never,
      }),
      "audio.user_gesture_required",
    );
    const resumed = requireSuccess(
      await engine.resumeAudioEngine({
        gesture: { kind: "trusted-keyboard", trusted: true, sequence: 2 },
      }),
    );
    expect(resumed).toMatchObject({ state: "ready", graphInstanceId: 1 });

    context.setState("interrupted");
    expect(engine.inspectAudioEngine().state).toBe("suspended");
    const resumedAgain = requireSuccess(
      await engine.resumeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 3 },
      }),
    );
    expect(resumedAgain.graphInstanceId).toBe(1);
    expect(fake.contextCreationCount()).toBe(1);
    expect(context.closeCount()).toBe(0);
  });

  test("X0-LIFE-012/X0-REG-023 faults an unexpected close and ignores its callback after graph-two recovery", async () => {
    const { engine, fake, context } = await readyEngine();
    const staleCallback = context.port.onstatechange;
    if (staleCallback === null) throw new Error("TEST_STATE_CALLBACK_MISSING");
    context.setState("closed");
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "fault",
      graphInstanceId: null,
    });
    expect(fake.contextCreationCount()).toBe(1);

    const replacement = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 2 },
        initialMix: INITIAL_MIX,
      }),
    );
    expect(replacement.graphInstanceId).toBe(2);
    staleCallback();
    const afterStale = engine.inspectAudioEngine();
    expect(afterStale).toMatchObject({ state: "ready", graphInstanceId: 2 });
    expect(
      afterStale.debugEvents.some(
        (event) => event.detailCode === "audio.context_state.stale",
      ),
    ).toBe(true);
  });

  test("X0-LIFE-033 discards owned voices and replaces the graph after rejected resume", async () => {
    const { engine, fake, context } = await readyEngine({
      resumeBehavior: "reject",
    });
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("resume-fault")], { eventId: "resume-fault-event" }),
      ),
    );
    context.setState("interrupted");
    const failedResume = await engine.resumeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 2 },
    });
    requireFailure(failedResume, "audio.context_resume_failed");
    expect(failedResume.termination).toBe("platform-fault");
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "fault",
      graphInstanceId: null,
      retainedVoiceCount: 0,
    });
    expect(context.closeCount()).toBe(1);

    const replacement = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-keyboard", trusted: true, sequence: 3 },
        initialMix: INITIAL_MIX,
      }),
    );
    expect(replacement.graphInstanceId).toBe(2);
    expect(fake.contextCreationCount()).toBe(2);
  });

  test("X0-LIFE-031 refuses ordinary-stop disposal without closing or disconnecting the ready graph", async () => {
    const { engine, context } = await readyEngine();
    const before = engine.inspectAudioEngine();

    requireFailure(
      await engine.disposeAudioEngine({ reason: "ordinary-stop" } as never),
      "audio.dispose_reason_invalid",
    );

    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "ready",
      graphInstanceId: before.graphInstanceId,
      persistentCreatedNodeCount: 12,
      persistentEdgeCount: 13,
    });
    expect(context.closeCount()).toBe(0);
    expect(
      context
        .nodeIds()
        .filter((nodeId) => !nodeId.includes("destination"))
        .every((nodeId) => context.disconnectCount(nodeId) === 0),
    ).toBe(true);
  });

  test("X0-LIFE-032 page teardown retires voices, closes once, and makes later operations terminal", async () => {
    const { engine, fake, context } = await readyEngine();
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("teardown-voice")], {
          eventId: "teardown-event",
        }),
      ),
    );

    const receipt = requireSuccess(
      await engine.disposeAudioEngine({ reason: "page-teardown" }),
    );

    expect(receipt).toMatchObject({
      graphInstanceId: 1,
      retiredVoiceCount: 1,
      contextClosed: true,
      snapshot: {
        state: "closed",
        retainedVoiceCount: 0,
        persistentCreatedNodeCount: 0,
        persistentEdgeCount: 0,
      },
    });
    expect(context.closeCount()).toBe(1);
    requireFailure(
      engine.attackAudioVoices(
        attackRequest([voice("late-voice")], { eventId: "late-event" }),
      ),
      "audio.engine_closed",
    );
    requireFailure(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 2 },
        initialMix: INITIAL_MIX,
      }),
      "audio.engine_closed",
    );
    expect(fake.contextCreationCount()).toBe(1);
    expect(context.closeCount()).toBe(1);
  });

  test("X0-ROUTE-014 page teardown disconnects each persistent node exactly once and closes exactly once", async () => {
    const { engine, context } = await readyEngine();
    const persistentNodeIds = context
      .nodeIds()
      .filter((nodeId) => !nodeId.includes("destination"));
    expect(persistentNodeIds).toHaveLength(12);

    requireSuccess(
      await engine.disposeAudioEngine({ reason: "page-teardown" }),
    );

    expect(context.closeCount()).toBe(1);
    expect(
      persistentNodeIds.every(
        (nodeId) => context.disconnectCount(nodeId) === 1,
      ),
    ).toBe(true);
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "closed",
      graphInstanceId: null,
      persistentCreatedNodeCount: 0,
      persistentEdgeCount: 0,
    });
  });

  test("X0-LIFE-034 faults instead of wrapping an exhausted graph sequence", async () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngineWithSequenceSeedForTest(fake.platform, {
      lastGraphSequence: MAX_AUDIO_INTERNAL_SEQUENCE - 1,
      lastVoiceSequence: 0,
      lastDebugSequence: 0,
    });
    const initialized = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: INITIAL_MIX,
      }),
    );
    expect(initialized.graphInstanceId).toBe(MAX_AUDIO_INTERNAL_SEQUENCE);
    const firstContext = fake.contexts[0];
    if (firstContext === undefined) throw new Error("TEST_CONTEXT_MISSING");
    const firstGraphNodeIds = firstContext
      .nodeIds()
      .filter((nodeId) => !nodeId.includes("destination"));
    firstContext.setState("closed");
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "fault",
      graphInstanceId: null,
    });

    const exhausted = await engine.initializeAudioEngine({
      gesture: { kind: "trusted-keyboard", trusted: true, sequence: 2 },
      initialMix: INITIAL_MIX,
    });
    requireFailure(exhausted, "audio.internal_sequence_exhausted");
    expect(exhausted.termination).toBe("platform-fault");
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "fault",
      graphInstanceId: null,
      retainedVoiceCount: 0,
      registryIndexCounts: { totalReferences: 0 },
    });
    expect(
      firstGraphNodeIds.every(
        (nodeId) => firstContext.disconnectCount(nodeId) === 1,
      ),
    ).toBe(true);
    expect(fake.contextCreationCount()).toBe(2);
    expect(fake.contexts[1]?.closeCount()).toBe(1);
  });

  test("X0-LIFE-034 faults and cleans the graph instead of wrapping an exhausted voice sequence", async () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngineWithSequenceSeedForTest(fake.platform, {
      lastGraphSequence: 0,
      lastVoiceSequence: MAX_AUDIO_INTERNAL_SEQUENCE,
      lastDebugSequence: 0,
    });
    requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: INITIAL_MIX,
      }),
    );
    const context = fake.contexts[0];
    if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
    const nodesBefore = context.nodeIds();

    const exhausted = engine.attackAudioVoices(
      attackRequest([voice("never-tokenized")], {
        eventId: "never-tokenized-event",
      }),
    );
    requireFailure(exhausted, "audio.internal_sequence_exhausted");
    expect(exhausted.termination).toBe("platform-fault");
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "fault",
      graphInstanceId: null,
      retainedVoiceCount: 0,
      registryIndexCounts: { totalReferences: 0 },
    });
    expect(context.sourceIds()).toHaveLength(0);
    expect(context.closeCount()).toBe(1);
    expect(
      nodesBefore
        .filter((nodeId) => !nodeId.includes("destination"))
        .every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);
  });

  test("X0-LIFE-034 faults without wrapping when the ready graph has exhausted its debug sequence", async () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngineWithSequenceSeedForTest(fake.platform, {
      lastGraphSequence: 0,
      lastVoiceSequence: 0,
      lastDebugSequence: MAX_AUDIO_INTERNAL_SEQUENCE - 15,
    });
    const initialized = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: INITIAL_MIX,
      }),
    );
    expect(initialized.state).toBe("ready");
    expect(initialized.snapshot.debugEvents.at(-1)?.sequence).toBe(
      MAX_AUDIO_INTERNAL_SEQUENCE,
    );
    const context = fake.contexts[0];
    if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
    const graphNodeIds = context
      .nodeIds()
      .filter((nodeId) => !nodeId.includes("destination"));

    const exhausted = engine.attackAudioVoices({
      ...attackRequest([voice("unused")]),
      voices: [],
    } as never);
    requireFailure(exhausted, "audio.internal_sequence_exhausted");
    expect(exhausted.termination).toBe("platform-fault");
    const snapshot = engine.inspectAudioEngine();
    expect(snapshot).toMatchObject({
      state: "fault",
      graphInstanceId: null,
      retainedVoiceCount: 0,
      registryIndexCounts: { totalReferences: 0 },
    });
    expect(snapshot.debugEvents.at(-1)?.sequence).toBe(
      MAX_AUDIO_INTERNAL_SEQUENCE,
    );
    expect(context.closeCount()).toBe(1);
    expect(
      graphNodeIds.every(
        (nodeId) => context.disconnectCount(nodeId) === 1,
      ),
    ).toBe(true);
    expect(CONTEXT_CASE_IDS).toHaveLength(15);
    expect("createAudioEngineWithSequenceSeedForTest" in publicAudio).toBe(
      false,
    );
  });

  test("test-only sequence seeds reject invalid values synchronously", () => {
    const fake = createFakeAudioPlatform();
    expect(() =>
      createAudioEngineWithSequenceSeedForTest(
        fake.platform,
        undefined as never,
      ),
    ).toThrow("AUDIO_TEST_SEQUENCE_SEED_INVALID");
    for (const invalidSeed of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        createAudioEngineWithSequenceSeedForTest(fake.platform, {
          lastGraphSequence: invalidSeed,
          lastVoiceSequence: 0,
          lastDebugSequence: 0,
        }),
      ).toThrow("AUDIO_TEST_SEQUENCE_SEED_INVALID");
    }
    expect(fake.contextCreationCount()).toBe(0);
  });
});
