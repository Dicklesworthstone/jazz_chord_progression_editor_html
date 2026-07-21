import { describe, expect, test } from "bun:test";

import {
  AUDIO_IMPULSE_POLICY,
  AUDIO_PERSISTENT_GRAPH_SETTINGS,
} from "../../src/audio";
import {
  attackRequest,
  previewOwner,
  progressionOwner,
  readyEngine,
  requireFailure,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

const TRACE_CASE_IDS = [
  "X0-ROUTE-001",
  "X0-ROUTE-002",
  "X0-ROUTE-003",
  "X0-ROUTE-004",
  "X0-ROUTE-005",
  "X0-ROUTE-006",
  "X0-ROUTE-009",
  "X0-ROUTE-010",
  "X0-ROUTE-011",
  "X0-ROUTE-012",
  "X0-LIFE-014",
  "X0-LIFE-015",
  "X0-LIFE-016",
] as const;

describe("audio/routing — TR-X0-PERSISTENT, TR-X0-TOPOLOGY, TR-LEGACY-AUDIO-02", () => {
  test("X0-ROUTE-001/X0-ROUTE-002/X0-ROUTE-003/X0-ROUTE-004/X0-ROUTE-009/X0-ROUTE-010 reuses one exact master graph", async () => {
    const { engine, fake, context } = await readyEngine();
    const first = engine.inspectAudioEngine();
    expect(first).toMatchObject({
      graphInstanceId: 1,
      persistentCreatedNodeCount: 12,
      persistentEdgeCount: 13,
    });
    expect(
      fake.events.filter((event) => event.kind === "node-connect"),
    ).toHaveLength(13);
    expect(
      fake.events
        .filter((event) =>
          [
            "param-value",
            "node-setting",
            "buffer-create",
            "wave-create",
          ].includes(event.kind),
        )
        .map(({ kind, subject, detail, value, atTimeSeconds }) => ({
          kind,
          subject,
          detail,
          value,
          atTimeSeconds,
        })),
    ).toEqual([
      { kind: "param-value", subject: "context-1:gain-2.gain", detail: "assign", value: 1, atTimeSeconds: null },
      { kind: "node-setting", subject: "context-1:filter-3", detail: "type", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.dcBlock.type, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:filter-3.frequency", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.dcBlock.frequencyHz, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:filter-3.q", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.dcBlock.q, atTimeSeconds: null },
      { kind: "node-setting", subject: "context-1:filter-4", detail: "type", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.lowShelf.type, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:filter-4.frequency", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.lowShelf.frequencyHz, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:filter-4.gain", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.lowShelf.gainDb, atTimeSeconds: null },
      { kind: "node-setting", subject: "context-1:filter-5", detail: "type", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.highShelf.type, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:filter-5.frequency", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.highShelf.frequencyHz, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:filter-5.gain", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.highShelf.gainDb, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:gain-6.gain", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.dryGain, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:gain-7.gain", detail: "assign", value: 0.2 * AUDIO_PERSISTENT_GRAPH_SETTINGS.maximumReverbSendGain, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:gain-9.gain", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.reverbReturnGain, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:compressor-10.threshold", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.thresholdDb, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:compressor-10.knee", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.kneeDb, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:compressor-10.ratio", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.ratio, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:compressor-10.attack", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.attackSeconds, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:compressor-10.release", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.releaseSeconds, atTimeSeconds: null },
      { kind: "node-setting", subject: "context-1:waveshaper-11", detail: "curve-length", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.softClip.curveLength, atTimeSeconds: null },
      { kind: "node-setting", subject: "context-1:waveshaper-11", detail: "oversample", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.softClip.oversample, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:gain-12.gain", detail: "assign", value: AUDIO_PERSISTENT_GRAPH_SETTINGS.safetyGain, atTimeSeconds: null },
      { kind: "param-value", subject: "context-1:gain-13.gain", detail: "assign", value: 0.8, atTimeSeconds: null },
      { kind: "buffer-create", subject: "context-1", detail: "buffer", value: 48_000 * AUDIO_IMPULSE_POLICY.durationSeconds, atTimeSeconds: null },
      { kind: "node-setting", subject: "context-1:convolver-8", detail: "buffer-length", value: 48_000 * AUDIO_IMPULSE_POLICY.durationSeconds, atTimeSeconds: null },
      { kind: "node-setting", subject: "context-1:convolver-8", detail: "normalize", value: String(AUDIO_IMPULSE_POLICY.convolverNormalize), atTimeSeconds: null },
      { kind: "wave-create", subject: "context-1", detail: "periodic-wave", value: 1, atTimeSeconds: null },
    ]);

    const secondPlay = requireSuccess(
      await engine.initializeAudioEngine({
        gesture: { kind: "trusted-keyboard", trusted: true, sequence: 2 },
        initialMix: { masterVolume: 0.1, reverbAmount: 1 },
      }),
    );
    expect(secondPlay.reusedExistingGraph).toBe(true);

    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("first", 60)], { eventId: "first-event" }),
      ),
    );
    requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "all" },
        reason: "all-notes-off",
        atTimeSeconds: 0,
      }),
    );
    context.finishAllSources();
    expect(engine.inspectAudioEngine().retainedVoiceCount).toBe(0);

    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("seek-replay", 62)], {
          owner: progressionOwner(2),
          eventId: "seek-event",
        }),
      ),
    );
    requireSuccess(
      engine.retireAudioVoices({
        selector: { kind: "generation", ownerKind: "progression", generation: 2 },
        reason: "generation-retire",
        atTimeSeconds: 0,
      }),
    );
    context.finishAllSources();

    const final = engine.inspectAudioEngine();
    expect(final.graphInstanceId).toBe(1);
    expect(final.persistentCreatedNodeCount).toBe(12);
    expect(final.persistentEdgeCount).toBe(13);
    expect(fake.contextCreationCount()).toBe(1);
    expect(context.closeCount()).toBe(0);
  });

  test("X0-ROUTE-005/X0-ROUTE-006 keeps selected section and future instrument voices on audio/routing", async () => {
    const { engine, fake, context } = await readyEngine();
    const eventOffset = fake.events.length;

    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("old-mellow", 60)], {
          eventId: "old-mellow-event",
          instrumentId: "mellow-keys",
        }),
      ),
    );
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("section-vibes", 67)], {
          owner: progressionOwner(2),
          eventId: "section-event",
          instrumentId: "vibraphone",
        }),
      ),
    );
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("preview-vibes", 71)], {
          owner: previewOwner(3, "routing-preview"),
          eventId: "preview-event",
          instrumentId: "vibraphone",
        }),
      ),
    );

    const snapshot = engine.inspectAudioEngine();
    expect(
      snapshot.activeVoices.find((entry) => entry.voiceId === "old-mellow")
        ?.scheduledSourceCount,
    ).toBe(3);
    expect(
      snapshot.activeVoices.find((entry) => entry.voiceId === "section-vibes")
        ?.scheduledSourceCount,
    ).toBe(4);
    expect(snapshot.graphInstanceId).toBe(1);

    const instrumentBusId = context
      .nodeIds()
      .find((nodeId) => nodeId.endsWith(":gain-2"));
    const destinationId = context
      .nodeIds()
      .find((nodeId) => nodeId.endsWith(":destination-1"));
    expect(instrumentBusId).toBeDefined();
    const voiceConnections = fake.events
      .slice(eventOffset)
      .filter((event) => event.kind === "node-connect");
    expect(
      voiceConnections.filter((event) => event.detail === instrumentBusId),
    ).toHaveLength(3);
    expect(
      voiceConnections.some((event) => event.detail === destinationId),
    ).toBe(false);
    expect(context.closeCount()).toBe(0);
  });

  test("X0-ROUTE-011/X0-ROUTE-012 preserves dry routing while ramping only the wet send through its cap", async () => {
    const { engine, fake } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const zero = requireSuccess(
      engine.setAudioMix({ masterVolume: 0.8, reverbAmount: 0 }),
    );
    const full = requireSuccess(
      engine.setAudioMix({ masterVolume: 0.8, reverbAmount: 1 }),
    );

    expect(zero.current.reverbAmount).toBe(0);
    expect(full.current.reverbAmount).toBe(1);
    expect(AUDIO_PERSISTENT_GRAPH_SETTINGS.maximumReverbSendGain).toBe(0.28);
    expect(
      fake.events.some(
        (event) =>
          event.kind === "param-event" &&
          event.detail === "linear" &&
          event.value === 0.28,
      ),
    ).toBe(true);
    expect(engine.inspectAudioEngine()).toMatchObject({
      graphInstanceId: before.graphInstanceId,
      persistentCreatedNodeCount: before.persistentCreatedNodeCount,
      persistentEdgeCount: before.persistentEdgeCount,
    });
    expect(TRACE_CASE_IDS).toHaveLength(13);
  });

  test("X0-LIFE-014 captures one audio time and ramps master 0.6 plus wet send 0.14 to time 5.015", async () => {
    const { engine, fake, context } = await readyEngine();
    context.setCurrentTime(5);
    const eventOffset = fake.events.length;

    const receipt = requireSuccess(
      engine.setAudioMix({ masterVolume: 0.6, reverbAmount: 0.5 }),
    );

    expect(receipt).toEqual({
      previous: { masterVolume: 0.8, reverbAmount: 0.2 },
      current: { masterVolume: 0.6, reverbAmount: 0.5 },
      rampStartTimeSeconds: 5,
      rampEndTimeSeconds: 5.015,
    });
    const mixEvents = fake.events
      .slice(eventOffset)
      .filter((event) => event.kind === "param-event");
    expect(
      mixEvents.filter(
        (event) =>
          event.detail === "linear" &&
          event.atTimeSeconds === 5.015 &&
          (event.value === 0.6 || event.value === 0.14),
      ),
    ).toHaveLength(2);
  });

  test("X0-LIFE-015 refuses a NaN master atomically before either mix parameter changes", async () => {
    const { engine, fake } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const eventOffset = fake.events.length;

    requireFailure(
      engine.setAudioMix({ masterVolume: Number.NaN, reverbAmount: 0.5 }),
      "audio.mix_invalid",
    );

    const after = engine.inspectAudioEngine();
    expect(after.mix).toEqual(before.mix);
    expect(after.graphInstanceId).toBe(before.graphInstanceId);
    expect(
      fake.events
        .slice(eventOffset)
        .filter((event) => event.kind === "param-event"),
    ).toHaveLength(0);
  });

  test("X0-LIFE-016 accepts the exact zero-master and full-reverb mix boundaries", async () => {
    const { engine, fake } = await readyEngine();
    const before = engine.inspectAudioEngine();
    const eventOffset = fake.events.length;

    const receipt = requireSuccess(
      engine.setAudioMix({ masterVolume: 0, reverbAmount: 1 }),
    );

    expect(receipt.current).toEqual({ masterVolume: 0, reverbAmount: 1 });
    expect(
      fake.events.slice(eventOffset).filter(
        (event) =>
          event.kind === "param-event" &&
          event.detail === "linear" &&
          (event.value === 0 || event.value === 0.28),
      ),
    ).toHaveLength(2);
    expect(engine.inspectAudioEngine()).toMatchObject({
      graphInstanceId: before.graphInstanceId,
      persistentCreatedNodeCount: 12,
      persistentEdgeCount: 13,
    });
  });
});
