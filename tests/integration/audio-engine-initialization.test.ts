import { describe, expect, test } from "bun:test";

import { createAudioEngine } from "../../src/audio";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import {
  requireFailure,
  requireSuccess,
} from "../support/audio-engine-test-kit";

const TRACE_CASE_IDS = [
  "X0-LIFE-001",
  "X0-LIFE-002",
  "X0-LIFE-003",
  "X0-LIFE-004",
  "X0-LIFE-009",
  "X0-LIFE-045",
] as const;

describe("TR-X0-LAZY-CONTEXT audio engine initialization", () => {
  test("X0-LIFE-001/X0-LIFE-003/X0-LIFE-004 creates only for a trusted positive gesture", async () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngine(fake.platform);
    expect(engine.inspectAudioEngine().state).toBe("uninitialized");
    expect(fake.contextCreationCount()).toBe(0);

    requireFailure(
      await engine.initializeAudioEngine({
        gesture: {
          kind: "trusted-pointer",
          trusted: false,
          sequence: 1,
        } as never,
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
      "audio.user_gesture_required",
    );
    requireFailure(
      await engine.initializeAudioEngine({
        gesture: {
          kind: "trusted-keyboard",
          trusted: true,
          sequence: 0,
        },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
      "audio.gesture_sequence_invalid",
    );
    expect(fake.contextCreationCount()).toBe(0);
    expect(engine.inspectAudioEngine().persistentCreatedNodeCount).toBe(0);

    const initialized = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
    );
    expect(initialized.state).toBe("ready");
    expect(initialized.graphInstanceId).toBe(1);
    expect(initialized.snapshot.persistentCreatedNodeCount).toBe(12);
    expect(initialized.snapshot.persistentEdgeCount).toBe(13);
    expect(fake.contextCreationCount()).toBe(1);
  });

  test("X0-LIFE-002/X0-LIFE-045 coalesces and completes an admitted uncancellable initialization", async () => {
    const fake = createFakeAudioPlatform({
      initialState: "suspended",
      resumeBehavior: "deferred",
    });
    const engine = createAudioEngine(fake.platform);

    const abandonedByCaller = engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.7, reverbAmount: 0.3 },
    });
    const coalesced = engine.initializeAudioEngine({
      gesture: { kind: "trusted-keyboard", trusted: true, sequence: 2 },
      initialMix: { masterVolume: 0.7, reverbAmount: 0.3 },
    });

    expect(fake.contextCreationCount()).toBe(1);
    expect(engine.inspectAudioEngine().state).toBe("initializing");
    await Promise.resolve();
    const context = fake.contexts[0];
    if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
    context.resolveDeferredResume("running");

    const [first, second] = await Promise.all([abandonedByCaller, coalesced]);
    expect(requireSuccess(first).graphInstanceId).toBe(1);
    expect(requireSuccess(second).graphInstanceId).toBe(1);
    expect(engine.inspectAudioEngine()).toMatchObject({
      state: "ready",
      graphInstanceId: 1,
      persistentCreatedNodeCount: 12,
      persistentEdgeCount: 13,
    });
    expect(TRACE_CASE_IDS).toHaveLength(6);
  });

  test("X0-LIFE-009 reinitialization reuses the ready graph without applying a second initial mix", async () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngine(fake.platform);
    const first = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
    );

    const reused = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-keyboard", trusted: true, sequence: 2 },
        initialMix: { masterVolume: 0.1, reverbAmount: 1 },
      }),
    );

    expect(reused).toMatchObject({
      reusedExistingGraph: true,
      graphInstanceId: first.graphInstanceId,
      state: "ready",
    });
    expect(reused.snapshot).toMatchObject({
      mix: { masterVolume: 0.8, reverbAmount: 0.2 },
      persistentCreatedNodeCount: 12,
      persistentEdgeCount: 13,
    });
    expect(fake.contextCreationCount()).toBe(1);
  });
});
