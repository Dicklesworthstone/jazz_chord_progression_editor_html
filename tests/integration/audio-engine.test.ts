import { describe, expect, test } from "bun:test";

import {
  AUDIO_PERSISTENT_GRAPH_SETTINGS,
  createAudioEngine,
  type AudioAttackBatchRequest,
  type AudioEngine,
  type AudioEngineRefusalCode,
  type AudioEngineResult,
  type AudioRetireRequest,
  type AudioVoiceOwner,
  type AudioVoiceSpec,
} from "../../src/audio";
import {
  makeMidiPitch,
  type InstrumentId,
  type MidiPitch,
} from "../../src/domain";
import {
  createFakeAudioPlatform,
  type FakeAudioContextController,
  type FakeAudioPlatformHarness,
} from "../../src/test-support/fake-audio-platform";

const progressionOwner: AudioVoiceOwner = Object.freeze({
  kind: "progression",
  generation: 1,
});

function midi(value: number): MidiPitch {
  const result = makeMidiPitch(value);
  if (!result.ok) throw new Error(`TEST_MIDI_INVALID: ${String(value)}`);
  return result.value;
}

function voice(
  voiceId: string,
  midiPitch = 60,
  velocity = 100,
): AudioVoiceSpec {
  return Object.freeze({ voiceId, midiPitch: midi(midiPitch), velocity });
}

function attackRequest(
  voices: readonly AudioVoiceSpec[],
  options: Readonly<{
    owner?: AudioVoiceOwner;
    eventId?: string;
    instrumentId?: InstrumentId;
    startTimeSeconds?: number;
    releaseTimeSeconds?: number;
  }> = {},
): AudioAttackBatchRequest {
  const first = voices[0];
  if (first === undefined) throw new Error("TEST_ATTACK_REQUIRES_VOICE");
  const tuple: [AudioVoiceSpec, ...AudioVoiceSpec[]] = [
    first,
    ...voices.slice(1),
  ];
  return Object.freeze({
    owner: options.owner ?? progressionOwner,
    eventId: options.eventId ?? "event-1",
    instrumentId: options.instrumentId ?? "mellow-keys",
    startTimeSeconds: options.startTimeSeconds ?? 0,
    releaseTimeSeconds: options.releaseTimeSeconds ?? 1,
    voices: Object.freeze(tuple),
  });
}

function expectSuccess<Value>(result: AudioEngineResult<Value>): Value {
  if (!result.ok) {
    throw new Error(`TEST_EXPECTED_SUCCESS: ${result.refusal.code}`);
  }
  return result.value;
}

function expectFailure<Value>(
  result: AudioEngineResult<Value>,
  code: AudioEngineRefusalCode,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.refusal.code).toBe(code);
}

async function readyEngine(
  options: Parameters<typeof createFakeAudioPlatform>[0] = {},
): Promise<{
  engine: AudioEngine;
  fake: FakeAudioPlatformHarness;
  context: FakeAudioContextController;
}> {
  const fake = createFakeAudioPlatform(options);
  const engine = createAudioEngine(fake.platform);
  const initialized = await engine.initializeAudioEngine({
    gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
    initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
  });
  expectSuccess(initialized);
  const context = fake.contexts[0];
  if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
  return { engine, fake, context };
}

describe("X0 persistent production audio engine", () => {
  test("creates one exact persistent graph and reuses it", async () => {
    const { engine, fake } = await readyEngine();
    const first = engine.inspectAudioEngine();
    expect(first.state).toBe("ready");
    expect(first.graphInstanceId).toBe(1);
    expect(first.persistentCreatedNodeCount).toBe(12);
    expect(first.persistentEdgeCount).toBe(13);
    expect(first.work.graphNodesCreated).toBe(12);
    expect(first.work.graphEdgesConnected).toBe(13);
    expect(first.work.impulseSamplesWritten).toBe(384_000);
    expect(fake.contextCreationCount()).toBe(1);
    expect(
      fake.events.filter((event) => event.kind === "node-connect"),
    ).toHaveLength(13);

    const reused = expectSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-keyboard", trusted: true, sequence: 2 },
        initialMix: { masterVolume: 0.1, reverbAmount: 1 },
      }),
    );
    expect(reused.reusedExistingGraph).toBe(true);
    expect(reused.graphInstanceId).toBe(1);
    expect(reused.snapshot.mix).toEqual({
      masterVolume: 0.8,
      reverbAmount: 0.2,
    });
    expect(fake.contextCreationCount()).toBe(1);
  });

  test("coalesces initialization admitted before deferred resume settles", async () => {
    const fake = createFakeAudioPlatform({
      initialState: "suspended",
      resumeBehavior: "deferred",
    });
    const engine = createAudioEngine(fake.platform);
    const firstPromise = engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.7, reverbAmount: 0.3 },
    });
    const secondPromise = engine.initializeAudioEngine({
      gesture: { kind: "trusted-keyboard", trusted: true, sequence: 2 },
      initialMix: { masterVolume: 0.7, reverbAmount: 0.3 },
    });
    expect(fake.contextCreationCount()).toBe(1);
    await Promise.resolve();
    const context = fake.contexts[0];
    if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
    context.resolveDeferredResume("running");
    expect(engine.inspectAudioEngine().state).toBe("initializing");
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(expectSuccess(first).graphInstanceId).toBe(1);
    expect(expectSuccess(second).graphInstanceId).toBe(1);
    expect(engine.inspectAudioEngine().state).toBe("ready");
  });

  test("refuses resume during initialization and serializes page teardown", async () => {
    const fake = createFakeAudioPlatform({
      initialState: "suspended",
      resumeBehavior: "deferred",
    });
    const engine = createAudioEngine(fake.platform);
    const initialization = engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.7, reverbAmount: 0.3 },
    });
    expectFailure(
      await engine.resumeAudioEngine({
        gesture: { kind: "trusted-keyboard", trusted: true, sequence: 2 },
      }),
      "audio.engine_not_ready",
    );
    expect(
      fake.events.filter((event) => event.kind === "context-resume"),
    ).toHaveLength(1);

    const disposal = engine.disposeAudioEngine({ reason: "page-teardown" });
    await Promise.resolve();
    const context = fake.contexts[0];
    if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
    expect(context.closeCount()).toBe(0);
    context.resolveDeferredResume("running");
    expectSuccess(await initialization);
    const receipt = expectSuccess(await disposal);
    expect(receipt.contextClosed).toBe(true);
    expect(receipt.snapshot.state).toBe("closed");
    expect(context.closeCount()).toBe(1);
  });

  test("keeps invalid initialization and mix changes atomic", async () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngine(fake.platform);
    const untrusted = await engine.initializeAudioEngine({
      gesture: {
        kind: "trusted-pointer",
        trusted: false,
        sequence: 1,
      } as never,
      initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
    });
    expectFailure(untrusted, "audio.user_gesture_required");
    expect(fake.contextCreationCount()).toBe(0);

    const initialized = await engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
    });
    expectSuccess(initialized);
    const before = engine.inspectAudioEngine();
    const invalid = engine.setAudioMix({
      masterVolume: Number.NaN,
      reverbAmount: 0.7,
    });
    expectFailure(invalid, "audio.mix_invalid");
    expect(engine.inspectAudioEngine().mix).toEqual(before.mix);
  });

  test("ramps both mix parameters from one captured audio time", async () => {
    const { engine, context } = await readyEngine();
    context.setCurrentTime(5);
    const receipt = expectSuccess(
      engine.setAudioMix({ masterVolume: 0.6, reverbAmount: 0.5 }),
    );
    expect(receipt.previous).toEqual({ masterVolume: 0.8, reverbAmount: 0.2 });
    expect(receipt.current).toEqual({ masterVolume: 0.6, reverbAmount: 0.5 });
    expect(receipt.rampStartTimeSeconds).toBe(5);
    expect(receipt.rampEndTimeSeconds).toBe(
      5 + AUDIO_PERSISTENT_GRAPH_SETTINGS.mixRampSeconds,
    );
  });

  test("builds every honest recipe with its declared source count", async () => {
    const { engine } = await readyEngine();
    const cases: readonly [InstrumentId, string, number][] = [
      ["mellow-keys", "mellow", 3],
      ["fm-electric-piano", "fm", 2],
      ["vibraphone", "vibes", 4],
      ["warm-pad", "pad", 3],
      ["analog-poly", "analog", 3],
      /* Flute and guitar are rendered waveguides since §5.4: one buffer
       * source per voice, like every rendered recipe. */
      ["flute", "flute", 1],
      ["organ", "organ", 6],
      ["guitar", "guitar", 1],
      ["blues-guitar", "blues", 1],
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const entry = cases[index];
      if (entry === undefined) continue;
      const [instrumentId, voiceId, sourceCount] = entry;
      expectSuccess(
        engine.attackAudioVoices(
          attackRequest([voice(voiceId, 60 + index)], {
            eventId: `event-${voiceId}`,
            instrumentId,
          }),
        ),
      );
      const active = engine
        .inspectAudioEngine()
        .activeVoices.find((candidate) => candidate.voiceId === voiceId);
      expect(active?.scheduledSourceCount).toBe(sourceCount);
    }
  });

  test("installs the Analog Poly periodic wave without assigning native custom type", async () => {
    const { engine } = await readyEngine({
      rejectDirectCustomOscillatorType: true,
    });
    const receipt = expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("native-periodic-wave", 60)], {
          eventId: "native-periodic-wave-event",
          instrumentId: "analog-poly",
        }),
      ),
    );
    expect(receipt.snapshot.activeVoices).toHaveLength(1);
    expect(receipt.snapshot.activeVoices[0]?.scheduledSourceCount).toBe(3);
  });

  test("normalizes a dense analog batch once and creates exactly 48 sources", async () => {
    const { engine, context } = await readyEngine();
    const voices = Array.from({ length: 16 }, (_, index) =>
      voice(`analog-${String(index)}`, 48 + index, 127),
    );
    const beforeSources = context.sourceIds().length;
    const receipt = expectSuccess(
      engine.attackAudioVoices(
        attackRequest(voices, {
          eventId: "dense-analog",
          instrumentId: "analog-poly",
        }),
      ),
    );
    expect(receipt.normalizationGain).toBeCloseTo(0.34 / 4, 12);
    expect(receipt.velocityGains).toEqual(Array.from({ length: 16 }, () => 1));
    expect(context.sourceIds().length - beforeSources).toBe(48);
    expect(receipt.snapshot.nonreleasingVoiceCount).toBe(16);
  });

  test("refuses malformed and duplicate batches before creating a node", async () => {
    const { engine, context } = await readyEngine();
    const sourceCount = context.sourceIds().length;
    const duplicate = engine.attackAudioVoices(
      attackRequest([voice("same", 60), voice("same", 64)]),
    );
    expectFailure(duplicate, "audio.voice_id_duplicate");
    expect(context.sourceIds()).toHaveLength(sourceCount);
    expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(0);

    const malformed = engine.attackAudioVoices({
      ...attackRequest([voice("valid")]),
      eventId: "bad event",
    });
    expectFailure(malformed, "audio.event_id_invalid");
    const trailingLineBreak = engine.attackAudioVoices({
      ...attackRequest([voice("also-valid")]),
      eventId: "looks-valid\n",
    });
    expectFailure(trailingLineBreak, "audio.event_id_invalid");
    expect(context.sourceIds()).toHaveLength(sourceCount);
  });

  test("retires an exact retrigger before the replacement attack", async () => {
    const { engine, context } = await readyEngine();
    expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("shared")], { eventId: "event-shared" }),
      ),
    );
    const oldSourceIds = context.sourceIds();
    const retrigger = expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("shared")], { eventId: "event-shared" }),
      ),
    );
    expect(retrigger.retriggeredVoiceIds).toEqual(["shared"]);
    expect(retrigger.snapshot.retainedVoiceCount).toBe(2);
    expect(retrigger.snapshot.releasingVoiceCount).toBe(1);
    const relevantKinds = retrigger.snapshot.debugEvents
      .map((event) => event.kind)
      .filter(
        (kind) => kind === "voice-retrigger-retire" || kind === "voice-attack",
      );
    expect(relevantKinds.slice(-2)).toEqual([
      "voice-retrigger-retire",
      "voice-attack",
    ]);

    for (const sourceId of oldSourceIds) context.finishSource(sourceId);
    expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(1);
    context.finishSource(oldSourceIds[0] ?? "missing");
    expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(1);
  });

  test("keeps all six registry indexes and exact selectors aligned", async () => {
    const { engine } = await readyEngine();
    expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("alpha", 60), voice("beta", 64)], {
          eventId: "event-a",
        }),
      ),
    );
    expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("gamma", 60)], { eventId: "event-b" }),
      ),
    );
    const before = engine.inspectAudioEngine();
    expect(before.registryIndexCounts).toEqual({
      voice: 3,
      generation: 3,
      event: 3,
      pitch: 3,
      owner: 3,
      instrument: 3,
      totalReferences: 18,
    });
    expect(before.activeVoices.map((entry) => entry.voiceId)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);

    const retired = expectSuccess(
      engine.retireAudioVoices({
        selector: {
          kind: "pitch",
          owner: progressionOwner,
          midiPitch: midi(60),
        },
        reason: "generation-retire",
        atTimeSeconds: 0,
      }),
    );
    expect(retired.matchedVoiceIds).toEqual(["alpha", "gamma"]);
    expect(retired.newlyRetiredVoiceIds).toEqual(["alpha", "gamma"]);
    expect(retired.snapshot.retainedVoiceCount).toBe(3);
    expect(retired.snapshot.releasingVoiceCount).toBe(2);

    const repeated = expectSuccess(
      engine.retireAudioVoices({
        selector: {
          kind: "pitch",
          owner: progressionOwner,
          midiPitch: midi(60),
        },
        reason: "generation-retire",
        atTimeSeconds: 0,
      }),
    );
    expect(repeated.newlyRetiredVoiceIds).toEqual([]);
    expect(repeated.alreadyRetiringVoiceIds).toEqual(["alpha", "gamma"]);
  });

  test("keeps preview retirement isolated from progression ownership", async () => {
    const { engine } = await readyEngine();
    const previewOwner: AudioVoiceOwner = Object.freeze({
      kind: "preview",
      generation: 7,
      previewId: "preview-a",
    });
    expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("progression-note", 60)], {
          eventId: "progression-event",
        }),
      ),
    );
    expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("preview-note", 67)], {
          owner: previewOwner,
          eventId: "preview-event",
          instrumentId: "vibraphone",
        }),
      ),
    );
    const retired = expectSuccess(
      engine.retireAudioVoices({
        selector: { kind: "preview", generation: 7, previewId: "preview-a" },
        reason: "preview-release",
        atTimeSeconds: 0,
      }),
    );
    expect(retired.newlyRetiredVoiceIds).toEqual(["preview-note"]);
    expect(retired.snapshot.progressionNonreleasingVoiceCount).toBe(1);
    expect(retired.snapshot.previewNonreleasingVoiceCount).toBe(0);
    expect(
      retired.snapshot.activeVoices.find(
        (candidate) => candidate.voiceId === "progression-note",
      )?.phase,
    ).not.toBe("releasing");
    expect(retired.snapshot.graphInstanceId).toBe(1);
    expect(retired.snapshot.persistentCreatedNodeCount).toBe(12);
  });

  test("enforces progression polyphony with deterministic quiet/old/id stealing", async () => {
    const { engine } = await readyEngine();
    for (let batch = 0; batch < 3; batch += 1) {
      const voices = Array.from({ length: 16 }, (_, offset) => {
        const index = batch * 16 + offset;
        return voice(`p-${String(index).padStart(3, "0")}`, 36 + (index % 48));
      });
      expectSuccess(
        engine.attackAudioVoices(
          attackRequest(voices, { eventId: `poly-${String(batch)}` }),
        ),
      );
    }
    const receipt = expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("p-new", 90)], { eventId: "poly-new" }),
      ),
    );
    expect(receipt.stolenVoiceIds).toEqual(["p-000"]);
    expect(receipt.snapshot.retainedVoiceCount).toBe(49);
    expect(receipt.snapshot.progressionNonreleasingVoiceCount).toBe(48);
    expect(receipt.snapshot.releasingVoiceCount).toBe(1);
  });

  test("counts future retirements as live until their exact release boundary", async () => {
    const { engine, context } = await readyEngine();
    for (let batch = 0; batch < 3; batch += 1) {
      const voices = Array.from({ length: 16 }, (_, index) =>
        voice(`future-${String(batch)}-${String(index)}`, 48 + index),
      );
      expectSuccess(
        engine.attackAudioVoices(
          attackRequest(voices, { eventId: `future-event-${String(batch)}` }),
        ),
      );
    }
    expect(engine.inspectAudioEngine().progressionNonreleasingVoiceCount).toBe(
      48,
    );
    expectSuccess(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "all-notes-off",
        atTimeSeconds: 0.25,
      }),
    );
    const before = engine.inspectAudioEngine();
    expect(before.nonreleasingVoiceCount).toBe(48);
    expect(before.releasingVoiceCount).toBe(0);
    expect(before.activeVoices.every((item) => item.phase === "attacking")).toBe(
      true,
    );

    expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("future-new", 72)], {
          eventId: "future-event-new",
        }),
      ),
    );
    const admitted = engine.inspectAudioEngine();
    expect(admitted.retainedVoiceCount).toBe(49);
    expect(admitted.nonreleasingVoiceCount).toBe(48);
    expect(admitted.releasingVoiceCount).toBe(1);
    expect(
      admitted.activeVoices.filter((item) => item.phase === "releasing"),
    ).toHaveLength(1);

    context.setCurrentTime(0.25);
    const atBoundary = engine.inspectAudioEngine();
    expect(atBoundary.nonreleasingVoiceCount).toBe(1);
    expect(atBoundary.releasingVoiceCount).toBe(48);
    expect(
      atBoundary.activeVoices.filter((item) => item.phase === "releasing"),
    ).toHaveLength(48);

    context.setCurrentTime(0.250_001);
    const afterBoundary = engine.inspectAudioEngine();
    expect(afterBoundary.nonreleasingVoiceCount).toBe(1);
    expect(afterBoundary.releasingVoiceCount).toBe(48);
  });

  test("refuses retained-tail overflow without mutating a victim or creating nodes", async () => {
    const { engine, context } = await readyEngine();
    for (let batch = 0; batch < 8; batch += 1) {
      const voices = Array.from({ length: 16 }, (_, offset) => {
        const index = batch * 16 + offset;
        return voice(`tail-${String(index)}`, 24 + (index % 80));
      });
      expectSuccess(
        engine.attackAudioVoices(
          attackRequest(voices, { eventId: `tail-event-${String(batch)}` }),
        ),
      );
    }
    expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(128);
    const sourcesBefore = context.sourceIds().length;
    const phasesBefore = engine
      .inspectAudioEngine()
      .activeVoices.map((entry) => [entry.voiceId, entry.phase]);
    const refused = engine.attackAudioVoices(
      attackRequest([voice("overflow", 100)], { eventId: "overflow-event" }),
    );
    expectFailure(refused, "audio.retiring_voice_capacity");
    expect(context.sourceIds()).toHaveLength(sourcesBefore);
    expect(
      engine
        .inspectAudioEngine()
        .activeVoices.map((entry) => [entry.voiceId, entry.phase]),
    ).toEqual(phasesBefore);
  });

  test("stops future attacks on retirement and empties registry after exact ended callbacks", async () => {
    const { engine, fake, context } = await readyEngine();
    context.setCurrentTime(10);
    expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("future")], {
          eventId: "future-event",
          startTimeSeconds: 10.2,
          releaseTimeSeconds: 11,
        }),
      ),
    );
    const retired = expectSuccess(
      engine.retireAudioVoices({
        selector: { kind: "generation", ownerKind: "progression", generation: 1 },
        reason: "generation-retire",
        atTimeSeconds: 10.1,
      }),
    );
    expect(retired.noFutureAttackPostcondition).toBe(true);
    const futureStops = fake.events.filter(
      (event) =>
        event.kind === "source-stop" &&
        event.atTimeSeconds !== null &&
        event.atTimeSeconds <= 10.2,
    );
    expect(futureStops).toHaveLength(3);
    context.finishAllSources();
    expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(0);
    expect(engine.inspectAudioEngine().registryIndexCounts.totalReferences).toBe(0);
  });

  test("an earlier retirement safely supersedes a previously scheduled later one", async () => {
    const { engine, fake, context } = await readyEngine();
    expectSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("rescheduled")], {
          eventId: "rescheduled-event",
          startTimeSeconds: 0.1,
          releaseTimeSeconds: 1,
        }),
      ),
    );
    expectSuccess(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "generation-retire",
        atTimeSeconds: 0.2,
      }),
    );
    const advanced = expectSuccess(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );
    expect(advanced.newlyRetiredVoiceIds).toEqual(["rescheduled"]);
    const latestStops = fake.events
      .filter((event) => event.kind === "source-stop")
      .slice(-3);
    expect(latestStops).toHaveLength(3);
    expect(
      latestStops.every(
        (event) =>
          event.atTimeSeconds !== null && event.atTimeSeconds <= 0.1,
      ),
    ).toBe(true);
    const repeated = expectSuccess(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );
    expect(repeated.newlyRetiredVoiceIds).toEqual([]);
    expect(repeated.alreadyRetiringVoiceIds).toEqual(["rescheduled"]);
    context.finishAllSources();
    expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(0);
  });

  test("survives 100 attack-stop-cleanup cycles on one graph", async () => {
    const { engine, fake, context } = await readyEngine();
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const sourceStart = context.sourceIds().length;
      expectSuccess(
        engine.attackAudioVoices(
          attackRequest([voice(`cycle-${String(cycle)}`, 48 + (cycle % 36))], {
            eventId: `cycle-event-${String(cycle)}`,
          }),
        ),
      );
      expectSuccess(
        engine.retireAudioVoices({
          selector: { kind: "all" },
          reason: "all-notes-off",
          atTimeSeconds: 0,
        }),
      );
      const cycleSources = context.sourceIds().slice(sourceStart);
      expect(cycleSources).toHaveLength(3);
      for (const sourceId of cycleSources) context.finishSource(sourceId);
      expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(0);
    }
    const final = engine.inspectAudioEngine();
    expect(final.graphInstanceId).toBe(1);
    expect(final.registryIndexCounts.totalReferences).toBe(0);
    expect(final.persistentCreatedNodeCount).toBe(12);
    expect(fake.contextCreationCount()).toBe(1);
    expect(final.debugEvents.length).toBeLessThanOrEqual(4_096);
  });

  test("faults and replaces the graph after a rejected resume", async () => {
    const { engine, fake, context } = await readyEngine({
      resumeBehavior: "reject",
    });
    expectSuccess(engine.attackAudioVoices(attackRequest([voice("interrupt")])));
    context.setState("interrupted");
    const interrupted = engine.inspectAudioEngine();
    expect(interrupted.state).toBe("suspended");
    expect(interrupted.releasingVoiceCount).toBe(1);
    const resume = await engine.resumeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 2 },
    });
    expectFailure(resume, "audio.context_resume_failed");
    const faulted = engine.inspectAudioEngine();
    expect(faulted.state).toBe("fault");
    expect(faulted.graphInstanceId).toBeNull();
    expect(faulted.retainedVoiceCount).toBe(0);
    expect(context.closeCount()).toBe(1);

    const replacement = expectSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-keyboard", trusted: true, sequence: 3 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
    );
    expect(replacement.graphInstanceId).toBe(2);
    expect(fake.contextCreationCount()).toBe(2);
  });

  test("faults cleanly on context, sample-rate, and partial-graph failures", async () => {
    const createFailure = createFakeAudioPlatform({ failContextCreation: true });
    const createEngine = createAudioEngine(createFailure.platform);
    expectFailure(
      await createEngine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
      "audio.context_create_failed",
    );
    expect(createEngine.inspectAudioEngine().state).toBe("fault");

    const badRate = createFakeAudioPlatform({ sampleRate: 7_999 });
    const badRateEngine = createAudioEngine(badRate.platform);
    expectFailure(
      await badRateEngine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
      "audio.context_sample_rate_unsupported",
    );
    expect(badRate.contexts[0]?.closeCount()).toBe(1);

    const graphFailure = createFakeAudioPlatform({ failNodeCreationAt: 7 });
    const graphEngine = createAudioEngine(graphFailure.platform);
    expectFailure(
      await graphEngine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
      "audio.graph_create_failed",
    );
    expect(graphEngine.inspectAudioEngine().persistentCreatedNodeCount).toBe(0);
    expect(graphFailure.contexts[0]?.closeCount()).toBe(1);

    for (const options of [
      { failStateRead: true },
      { failStateReadAt: 2 },
      { failSampleRateRead: true },
      { failStateHandlerAssignment: true },
    ]) {
      const adoptionFailure = createFakeAudioPlatform(options);
      const adoptionEngine = createAudioEngine(adoptionFailure.platform);
      expectFailure(
        await adoptionEngine.initializeAudioEngine({
          gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
          initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
        }),
        "audio.context_unusable",
      );
      const failed = adoptionEngine.inspectAudioEngine();
      expect(failed.state).toBe("fault");
      expect(failed.graphInstanceId).toBeNull();
      expect(failed.persistentCreatedNodeCount).toBe(0);
      expect(adoptionFailure.contexts[0]?.closeCount()).toBe(1);
      expect(
        adoptionFailure.contexts[0]
          ?.nodeIds()
          .filter((nodeId) => !nodeId.includes("destination"))
          .every(
            (nodeId) =>
              adoptionFailure.contexts[0]?.disconnectCount(nodeId) === 1,
          ) ?? false,
      ).toBe(true);
    }

    const buildInspectionFailure = createFakeAudioPlatform({
      failSampleRateReadAt: 2,
    });
    const buildInspectionEngine = createAudioEngine(
      buildInspectionFailure.platform,
    );
    expectFailure(
      await buildInspectionEngine.initializeAudioEngine({
        gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
        initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
      }),
      "audio.graph_create_failed",
    );
    expect(buildInspectionEngine.inspectAudioEngine().graphInstanceId).toBeNull();
    expect(buildInspectionFailure.contexts[0]?.closeCount()).toBe(1);
    expect(
      buildInspectionFailure.contexts[0]
        ?.nodeIds()
        .filter((nodeId) => !nodeId.includes("destination"))
        .every(
          (nodeId) =>
            buildInspectionFailure.contexts[0]?.disconnectCount(nodeId) === 1,
        ) ?? false,
    ).toBe(true);
  });

  test("page teardown retires and disconnects once, closes once, and is terminal", async () => {
    const { engine, context } = await readyEngine();
    expectSuccess(engine.attackAudioVoices(attackRequest([voice("dispose")])));
    const receipt = expectSuccess(
      await engine.disposeAudioEngine({ reason: "page-teardown" }),
    );
    expect(receipt.retiredVoiceCount).toBe(1);
    expect(receipt.contextClosed).toBe(true);
    expect(receipt.snapshot.state).toBe("closed");
    expect(receipt.snapshot.retainedVoiceCount).toBe(0);
    expect(context.closeCount()).toBe(1);
    expect(
      context
        .nodeIds()
        .filter((nodeId) => !nodeId.includes("destination"))
        .every((nodeId) => context.disconnectCount(nodeId) === 1),
    ).toBe(true);

    expectFailure(
      engine.attackAudioVoices(attackRequest([voice("late")])),
      "audio.engine_closed",
    );
    expectFailure(
      await engine.disposeAudioEngine({ reason: "page-teardown" }),
      "audio.engine_closed",
    );
    expectFailure(
      await engine.disposeAudioEngine({ reason: "ordinary-stop" } as never),
      "audio.engine_closed",
    );
    expect(context.closeCount()).toBe(1);
  });

  test("keeps page teardown terminal when native close rejects or throws", async () => {
    for (const closeBehavior of ["reject", "throw"] as const) {
      const { engine, fake, context } = await readyEngine({ closeBehavior });
      expectSuccess(
        engine.attackAudioVoices(
          attackRequest([voice(`dispose-fail-${closeBehavior}`)]),
        ),
      );
      const disposal = await engine.disposeAudioEngine({
        reason: "page-teardown",
      });
      expectFailure(disposal, "audio.context_unusable");
      if (!disposal.ok) {
        expect(disposal.refusal.state).toBe("closed");
        expect(disposal.refusal.retryable).toBe(false);
      }
      const closed = engine.inspectAudioEngine();
      expect(closed.state).toBe("closed");
      expect(closed.graphInstanceId).toBeNull();
      expect(closed.retainedVoiceCount).toBe(0);
      expect(context.closeCount()).toBe(1);
      expect(
        context
          .nodeIds()
          .filter((nodeId) => !nodeId.includes("destination"))
          .every((nodeId) => context.disconnectCount(nodeId) === 1),
      ).toBe(true);
      expectFailure(
        await engine.initializeAudioEngine({
          gesture: { kind: "trusted-pointer", trusted: true, sequence: 2 },
          initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
        }),
        "audio.engine_closed",
      );
      expectFailure(
        engine.attackAudioVoices(
          attackRequest([voice(`after-dispose-${closeBehavior}`)]),
        ),
        "audio.engine_closed",
      );
      expectFailure(
        await engine.disposeAudioEngine({ reason: "page-teardown" }),
        "audio.engine_closed",
      );
      expectFailure(
        await engine.disposeAudioEngine({ reason: "ordinary-stop" } as never),
        "audio.engine_closed",
      );
      expect(fake.contextCreationCount()).toBe(1);
    }
  });

  test("unknown selectors are idempotent and malformed selectors refuse", async () => {
    const { engine } = await readyEngine();
    expectSuccess(engine.attackAudioVoices(attackRequest([voice("alpha")])));
    const empty = expectSuccess(
      engine.retireAudioVoices({
        selector: { kind: "voice-ids", voiceIds: ["missing"] },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );
    expect(empty.matchedVoiceIds).toEqual([]);
    expect(empty.snapshot.nonreleasingVoiceCount).toBe(1);

    const malformed = engine.retireAudioVoices({
      selector: { kind: "random" },
      reason: "all-notes-off",
      atTimeSeconds: 0,
    } as unknown as AudioRetireRequest);
    expectFailure(malformed, "audio.retirement_selector_invalid");
    expect(engine.inspectAudioEngine().nonreleasingVoiceCount).toBe(1);
  });
});
