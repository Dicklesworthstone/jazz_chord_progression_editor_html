/**
 * jcpe-r7f7 evidence: the Concert Grand travels the engine as a rendered
 * buffer voice — prepare warms the cache, attacks consume it atomically,
 * the voice topology stays source → filter → gain → bus with exactly one
 * scheduled source, and the batch refusal law holds when the renderer
 * cannot serve a note.
 */
import { describe, expect, test } from "bun:test";

import { createAudioEngine } from "../../src/audio";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import {
  attackRequest,
  midi,
  progressionOwner,
  requireFailure,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

async function readyEngine() {
  const fake = createFakeAudioPlatform();
  const engine = createAudioEngine(fake.platform);
  requireSuccess(
    await engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
    }),
  );
  return { fake, engine };
}

describe("jcpe-r7f7 rendered piano voices", () => {
  test("prepare renders once and reports cache hits afterwards", async () => {
    const { engine } = await readyEngine();
    const first = requireSuccess(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "concert-grand",
        notes: [
          { midiPitch: midi(60), velocity: 96 },
          { midiPitch: midi(64), velocity: 96 },
        ],
      }),
    );
    expect(first.renderedCount).toBe(2);
    expect(first.cachedCount).toBe(0);
    const second = requireSuccess(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "concert-grand",
        notes: [
          { midiPitch: midi(60), velocity: 96 },
          { midiPitch: midi(64), velocity: 96 },
        ],
      }),
    );
    expect(second.renderedCount).toBe(0);
    expect(second.cachedCount).toBe(2);
  });

  test("an oscillator instrument prepares as a no-op receipt", async () => {
    const { engine } = await readyEngine();
    const receipt = requireSuccess(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "mellow-keys",
        notes: [{ midiPitch: midi(60), velocity: 96 }],
      }),
    );
    expect(receipt.renderedCount).toBe(0);
    expect(receipt.cachedCount).toBe(0);
  });

  test("a rendered attack creates one buffer source per voice with its PCM bound", async () => {
    const { fake, engine } = await readyEngine();
    requireSuccess(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "concert-grand",
        notes: [
          { midiPitch: midi(60), velocity: 96 },
          { midiPitch: midi(64), velocity: 96 },
          { midiPitch: midi(67), velocity: 96 },
        ],
      }),
    );
    const eventsBefore = fake.events.length;
    const receipt = requireSuccess(
      engine.attackAudioVoices(
        attackRequest(
          [voice("cg-1", 60, 96), voice("cg-2", 64, 96), voice("cg-3", 67, 96)],
          { owner: progressionOwner(), instrumentId: "concert-grand" },
        ),
      ),
    );
    expect(receipt.attackedVoiceIds).toHaveLength(3);
    const fresh = fake.events.slice(eventsBefore);
    const bufferSources = fresh.filter(
      (event) =>
        event.kind === "node-create" && event.detail === "buffer-source",
    );
    expect(bufferSources).toHaveLength(3);
    const bufferAssignments = fresh.filter(
      (event) => event.kind === "node-setting" && event.detail === "buffer",
    );
    expect(bufferAssignments).toHaveLength(3);
    /* One scheduled source per rendered voice — start recorded exactly once each. */
    const starts = fresh.filter((event) => event.kind === "source-start");
    expect(starts).toHaveLength(3);
    const snapshot = engine.inspectAudioEngine();
    expect(snapshot.nonreleasingVoiceCount).toBe(3);
    /* The persistent graph is untouched by rendered voices. */
    expect(snapshot.persistentCreatedNodeCount).toBe(12);
    expect(snapshot.persistentEdgeCount).toBe(13);
  });

  test("an unprepared rendered attack still succeeds by rendering synchronously", async () => {
    const { engine } = await readyEngine();
    const receipt = requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("cg-cold", 57, 96)], {
          owner: progressionOwner(),
          instrumentId: "concert-grand",
        }),
      ),
    );
    expect(receipt.attackedVoiceIds).toEqual(["cg-cold"]);
  });

  test("prepare refuses invalid notes without partial cache writes", async () => {
    const { engine } = await readyEngine();
    requireFailure(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "concert-grand",
        notes: [{ midiPitch: 300 as never, velocity: 96 }],
      }),
      "audio.midi_pitch_invalid",
    );
    requireFailure(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "concert-grand",
        notes: [{ midiPitch: midi(60), velocity: 0 }],
      }),
      "audio.velocity_invalid",
    );
  });

  test("prepare before initialization refuses engine_not_ready", async () => {
    const fake = createFakeAudioPlatform();
    const engine = createAudioEngine(fake.platform);
    requireFailure(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "concert-grand",
        notes: [{ midiPitch: midi(60), velocity: 96 }],
      }),
      "audio.engine_not_ready",
    );
  });
});
