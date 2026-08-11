import { describe, expect, test } from "bun:test";

import { createAudioEngineWithPhysicalPianoRendererForTest } from "../../src/audio/audio-engine";
import {
  CONCERT_GRAND_PHYSICAL_V2_ALGORITHM_ID,
  CONCERT_GRAND_RENDERER_ALGORITHM_ID,
  type ConcertGrandRenderer,
  type RenderedNotePcm,
} from "../../src/audio/dsp-renderer";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import {
  attackRequest,
  midi,
  requireFailure,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

type Calls = { sampled: number; physicalNote: number; physicalChord: number };

function pcm(sampleRateHz: number, marker: number): RenderedNotePcm {
  const frameCount = 256;
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  left[4] = marker;
  right[4] = -marker;
  return Object.freeze({ sampleRateHz, frameCount, left, right });
}

function fakePhysicalPiano(
  calls: Calls,
  complete = true,
): ConcertGrandRenderer {
  return Object.freeze({
    algorithmId: CONCERT_GRAND_RENDERER_ALGORITHM_ID,
    wasmSha256: "a39dc264".padEnd(64, "0"),
    attackSamplesSha256: "recorded-layer-must-not-run".padEnd(64, "0"),
    physicalAttackAlgorithmId: CONCERT_GRAND_PHYSICAL_V2_ALGORITHM_ID,
    renderNote: (_midi, _velocity, sampleRateHz) => {
      calls.sampled += 1;
      return pcm(sampleRateHz, 0.9);
    },
    renderSynthesizedNote: (_midi, _velocity, sampleRateHz) =>
      pcm(sampleRateHz, 0.1),
    ...(complete
      ? {
          renderPhysicalNoteCooperatively: async (
            _midi: number,
            _velocity: number,
            sampleRateHz: number,
          ) => {
            calls.physicalNote += 1;
            await Promise.resolve();
            return pcm(sampleRateHz, 0.2);
          },
          renderPhysicalChordCooperatively: async (
            midis: readonly number[],
            _velocities: readonly number[],
            sampleRateHz: number,
          ) => {
            calls.physicalChord += 1;
            await Promise.resolve();
            return pcm(sampleRateHz, midis.length / 10);
          },
        }
      : {}),
    attackSliceFor: () => null,
    analyzeWindow: () => null,
    validatePhysicalAbiV2: () => null,
    renderPhysicalModalV2: () => null,
    solvePhysicalReedV2: () => null,
    stepPhysicalClarinetReedV2: () => null,
  });
}

async function ready(calls: Calls, complete = true) {
  const fake = createFakeAudioPlatform({ sampleRate: 48_000 });
  const engine = createAudioEngineWithPhysicalPianoRendererForTest(
    fake.platform,
    fakePhysicalPiano(calls, complete),
  );
  requireSuccess(
    await engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
    }),
  );
  return { fake, engine };
}

describe("dark physical piano engine route", () => {
  test("prepares one sample-free physical chord and attacks cache-only", async () => {
    const calls: Calls = { sampled: 0, physicalNote: 0, physicalChord: 0 };
    const { fake, engine } = await ready(calls);
    const notes = [60, 64, 67] as const;
    const request = attackRequest(
      notes.map((pitch, index) => voice(`piano-${String(index)}`, pitch, 96)),
      {
        eventId: "event-physical-piano",
        instrumentId: "concert-grand",
        startTimeSeconds: 0.05,
        releaseTimeSeconds: 1.25,
      },
    );

    requireFailure(
      engine.attackAudioVoices(request),
      "audio.renderer_unavailable",
    );
    expect(calls).toEqual({ sampled: 0, physicalNote: 0, physicalChord: 0 });

    expect(
      requireSuccess(
        await engine.prepareRenderedAudioVoices({
          instrumentId: "concert-grand",
          notes: notes.map((pitch) => ({
            midiPitch: midi(pitch),
            velocity: 96,
          })),
        }),
      ),
    ).toMatchObject({ renderedCount: 1, cachedCount: 0, completed: true });
    expect(calls).toEqual({ sampled: 0, physicalNote: 0, physicalChord: 1 });

    const startsBefore = fake.events.filter(
      (event) => event.kind === "source-start",
    ).length;
    const attacked = requireSuccess(engine.attackAudioVoices(request));
    expect(calls).toEqual({ sampled: 0, physicalNote: 0, physicalChord: 1 });
    expect(attacked.velocityGains).toEqual([1, 1, 1]);
    expect(
      fake.events.filter((event) => event.kind === "source-start").length -
        startsBefore,
    ).toBe(1);

    expect(
      requireSuccess(
        await engine.prepareRenderedAudioVoices({
          instrumentId: "concert-grand",
          notes: [...notes].reverse().map((pitch) => ({
            midiPitch: midi(pitch),
            velocity: 96,
          })),
        }),
      ),
    ).toMatchObject({ renderedCount: 0, cachedCount: 1 });
    expect(calls).toEqual({ sampled: 0, physicalNote: 0, physicalChord: 1 });
  });

  test("a physical note owns velocity and never calls the recorded renderer", async () => {
    const calls: Calls = { sampled: 0, physicalNote: 0, physicalChord: 0 };
    const { engine } = await ready(calls);
    const request = attackRequest([voice("physical-note", 72, 25)], {
      eventId: "event-physical-note",
      instrumentId: "concert-grand",
      startTimeSeconds: 0.05,
      releaseTimeSeconds: 0.55,
    });
    requireFailure(
      engine.attackAudioVoices(request),
      "audio.renderer_unavailable",
    );
    expect(
      requireSuccess(
        await engine.prepareRenderedAudioVoices({
          instrumentId: "concert-grand",
          notes: [{ midiPitch: midi(72), velocity: 25, gateSeconds: 0.5 }],
        }),
      ),
    ).toMatchObject({ renderedCount: 1, cachedCount: 0 });
    const attacked = requireSuccess(engine.attackAudioVoices(request));
    expect(attacked.velocityGains).toEqual([1]);
    expect(calls).toEqual({ sampled: 0, physicalNote: 1, physicalChord: 0 });
  });

  test("missing physical completion refuses instead of falling back to samples", async () => {
    const calls: Calls = { sampled: 0, physicalNote: 0, physicalChord: 0 };
    const { engine } = await ready(calls, false);
    requireFailure(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "concert-grand",
        notes: [{ midiPitch: midi(60), velocity: 96 }],
      }),
      "audio.renderer_unavailable",
    );
    expect(calls).toEqual({ sampled: 0, physicalNote: 0, physicalChord: 0 });
  });

  test("invalid event identity refuses before physical work", async () => {
    const calls: Calls = { sampled: 0, physicalNote: 0, physicalChord: 0 };
    const { engine } = await ready(calls);
    requireFailure(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "concert-grand",
        notes: [
          {
            midiPitch: midi(60),
            velocity: 96,
            eventId: "event id with spaces",
          },
        ],
      }),
      "audio.voice_id_invalid",
    );
    expect(calls).toEqual({ sampled: 0, physicalNote: 0, physicalChord: 0 });
  });

  test("an omitted preview identity cannot merge with a real event named request", async () => {
    const calls: Calls = { sampled: 0, physicalNote: 0, physicalChord: 0 };
    const { engine } = await ready(calls);
    expect(
      requireSuccess(
        await engine.prepareRenderedAudioVoices({
          instrumentId: "concert-grand",
          notes: [
            { midiPitch: midi(60), velocity: 80 },
            { midiPitch: midi(64), velocity: 80, eventId: "request" },
          ],
        }),
      ),
    ).toMatchObject({ renderedCount: 2, cachedCount: 0, completed: true });
    expect(calls).toEqual({ sampled: 0, physicalNote: 2, physicalChord: 0 });
  });
});
