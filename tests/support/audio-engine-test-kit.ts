import type {
  AudioAttackBatchRequest,
  AudioEngine,
  AudioEngineRefusal,
  AudioEngineRefusalCode,
  AudioEngineResult,
  AudioVoiceOwner,
  AudioVoiceSpec,
} from "../../src/audio";
import { createAudioEngine } from "../../src/audio";
import {
  makeMidiPitch,
  type InstrumentId,
  type MidiPitch,
} from "../../src/domain";
import {
  createFakeAudioPlatform,
  type FakeAudioContextController,
  type FakeAudioPlatformHarness,
  type FakeAudioPlatformOptions,
} from "../../src/test-support/fake-audio-platform";

export function progressionOwner(generation = 1): AudioVoiceOwner {
  return Object.freeze({ kind: "progression", generation });
}

export function previewOwner(
  generation = 1,
  previewId = "preview-1",
): AudioVoiceOwner {
  return Object.freeze({ kind: "preview", generation, previewId });
}

export function midi(value: number): MidiPitch {
  const result = makeMidiPitch(value);
  if (!result.ok) throw new Error(`TEST_MIDI_INVALID: ${String(value)}`);
  return result.value;
}

export function voice(
  voiceId: string,
  midiPitch = 60,
  velocity = 100,
): AudioVoiceSpec {
  return Object.freeze({ voiceId, midiPitch: midi(midiPitch), velocity });
}

export function voices(
  count: number,
  prefix: string,
  options: Readonly<{
    midiStart?: number;
    velocity?: number;
  }> = {},
): readonly AudioVoiceSpec[] {
  const midiStart = options.midiStart ?? 36;
  const velocity = options.velocity ?? 100;
  return Object.freeze(
    Array.from({ length: count }, (_, index) =>
      voice(
        `${prefix}-${String(index).padStart(3, "0")}`,
        midiStart + (index % 72),
        velocity,
      ),
    ),
  );
}

export function attackRequest(
  requestedVoices: readonly AudioVoiceSpec[],
  options: Readonly<{
    owner?: AudioVoiceOwner | undefined;
    eventId?: string | undefined;
    instrumentId?: InstrumentId | undefined;
    startTimeSeconds?: number | undefined;
    releaseTimeSeconds?: number | undefined;
  }> = {},
): AudioAttackBatchRequest {
  const first = requestedVoices[0];
  if (first === undefined) throw new Error("TEST_ATTACK_REQUIRES_VOICE");
  const tuple: [AudioVoiceSpec, ...AudioVoiceSpec[]] = [
    first,
    ...requestedVoices.slice(1),
  ];
  return Object.freeze({
    owner: options.owner ?? progressionOwner(),
    eventId: options.eventId ?? "event-1",
    instrumentId: options.instrumentId ?? "mellow-keys",
    startTimeSeconds: options.startTimeSeconds ?? 0,
    releaseTimeSeconds: options.releaseTimeSeconds ?? 1,
    voices: Object.freeze(tuple),
  });
}

export function requireSuccess<Value>(
  result: AudioEngineResult<Value>,
): Value {
  if (!result.ok) {
    throw new Error(`TEST_EXPECTED_SUCCESS: ${result.refusal.code}`);
  }
  return result.value;
}

export function requireFailure<Value>(
  result: AudioEngineResult<Value>,
  code: AudioEngineRefusalCode,
): AudioEngineRefusal {
  if (result.ok) throw new Error(`TEST_EXPECTED_FAILURE: ${code}`);
  if (result.refusal.code !== code) {
    throw new Error(
      `TEST_EXPECTED_FAILURE_CODE: ${code}; received ${result.refusal.code}`,
    );
  }
  return result.refusal;
}

export async function readyEngine(
  options: FakeAudioPlatformOptions = {},
): Promise<{
  engine: AudioEngine;
  fake: FakeAudioPlatformHarness;
  context: FakeAudioContextController;
}> {
  const fake = createFakeAudioPlatform(options);
  const engine = createAudioEngine(fake.platform);
  requireSuccess(
    await engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
    }),
  );
  const context = fake.contexts[0];
  if (context === undefined) throw new Error("TEST_CONTEXT_MISSING");
  return { engine, fake, context };
}

export function attackInBatches(
  engine: AudioEngine,
  requestedVoices: readonly AudioVoiceSpec[],
  options: Readonly<{
    owner?: AudioVoiceOwner | undefined;
    eventPrefix?: string | undefined;
    instrumentId?: InstrumentId | undefined;
    startTimeSeconds?: number | undefined;
    releaseTimeSeconds?: number | undefined;
  }> = {},
): void {
  for (let offset = 0; offset < requestedVoices.length; offset += 16) {
    const batch = requestedVoices.slice(offset, offset + 16);
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest(batch, {
          owner: options.owner,
          eventId: `${options.eventPrefix ?? "event"}-${String(offset / 16)}`,
          instrumentId: options.instrumentId,
          startTimeSeconds: options.startTimeSeconds,
          releaseTimeSeconds: options.releaseTimeSeconds,
        }),
      ),
    );
  }
}
