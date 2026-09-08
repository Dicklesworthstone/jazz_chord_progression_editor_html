import { expect, test } from "bun:test";
import { createAudioEngine } from "../../src/audio/audio-engine";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { attackRequest, midi, requireSuccess, voice } from "../support/audio-engine-test-kit";

// Authored independently: 0.4 s gate + the reviewed 0.35 s release reaches
// the exact 0.75 s plucked bucket. A different valid clock origin must not
// turn that already-rendered physical response into an unavailable renderer.
const ORIGINS = [0.05, 0.3, 0.7, 1.01, 1.1, 2.1, 10.001] as const;
const PITCHES = [60, 64, 67, 71] as const;

for (const sourcePitches of [[60], PITCHES] as const) {
 for (const transposition of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const) {
  const pitches = sourcePitches.map(pitch => pitch + transposition);
  test(`real plucked PCM remains prepared at every clock origin (${String(pitches.length)} voices, transpose ${String(transposition)})`, async () => {
    const fake = createFakeAudioPlatform({ sampleRate: 48_000 });
    const engine = createAudioEngine(fake.platform);
    requireSuccess(await engine.initializeAudioEngine({
      gesture: { kind: "trusted-pointer", trusted: true, sequence: 1 },
      initialMix: { masterVolume: 0.8, reverbAmount: 0.2 },
    }));
    const context = fake.contexts[0];
    if (context === undefined) throw new Error("CLOCK_ORIGIN_CONTEXT_MISSING");
    requireSuccess(await engine.prepareRenderedAudioVoices({
      instrumentId: "dreadnought-guitar",
      notes: pitches.map(pitch => ({ midiPitch: midi(pitch), velocity: 96, gateSeconds: 0.4 })),
    }));
    const warmedBuffers = fake.events.filter(event => event.kind === "buffer-create").length;
    for (const [index, start] of ORIGINS.entries()) {
      context.setCurrentTime(start - 0.01);
      const result = engine.attackAudioVoices(attackRequest(
        pitches.map((pitch, ordinal) => voice(`clock-${String(index)}-${String(ordinal)}`, pitch, 96)),
        { eventId: `clock-origin-${String(index)}`, instrumentId: "dreadnought-guitar",
          startTimeSeconds: start, releaseTimeSeconds: start + 0.4 },
      ));
      expect({ start, ok: result.ok, refusal: result.ok ? null : result.refusal.code }).toEqual({ start, ok: true, refusal: null });
      if (result.ok) for (const active of result.value.snapshot.activeVoices) {
        expect(active.attackTimeSeconds).toBe(start);
        expect(active.naturalReleaseTimeSeconds).toBe(start + 0.4);
      }
      expect(fake.events.filter(event => event.kind === "buffer-create")).toHaveLength(warmedBuffers);
      context.finishAllSources();
    }
    // A materially longer response must still refuse until its own buffer
    // is prepared; this is not a nearest-bucket or synchronous-render fallback.
    context.setCurrentTime(20);
    const request = attackRequest(pitches.map((pitch, index) => voice(`longer-${String(index)}`, pitch, 96)), {
      eventId: "longer-clock-gate", instrumentId: "dreadnought-guitar",
      startTimeSeconds: 20.01, releaseTimeSeconds: 20.41025,
    });
    const cold = engine.attackAudioVoices(request);
    expect(cold.ok).toBe(false);
    if (!cold.ok) expect(cold.refusal.code).toBe("audio.renderer_unavailable");
    expect(fake.events.filter(event => event.kind === "buffer-create")).toHaveLength(warmedBuffers);
    requireSuccess(await engine.prepareRenderedAudioVoices({ instrumentId: "dreadnought-guitar",
      notes: pitches.map(pitch => ({ midiPitch: midi(pitch), velocity: 96, gateSeconds: 0.40025 })),
    }));
    expect(engine.attackAudioVoices(request).ok).toBe(true);
    requireSuccess(await engine.disposeAudioEngine({ reason: "page-teardown" }));
  });
}
}
