import { expect, test } from "bun:test";

import {
  compilePhysicalRealization,
  physicalGestureExcitationVelocity,
} from "../../src/audio";
import {
  WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID,
  loadConcertGrandRenderer,
  loadWaveguideRenderers,
} from "../../src/audio/dsp-renderer";
import { velocityGainForVelocity } from "../../src/audio/synth-voice";
import { compilePlaybackPlan } from "../../src/playback";
import {
  attackRequest,
  midi,
  readyEngine,
  requireFailure,
  requireSuccess,
} from "../support/audio-engine-test-kit";
import { materializeP0TimelineCase } from "../support/p0-playback-fixtures";

function rms(samples: Float32Array): number {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  return Math.sqrt(energy / Math.max(1, samples.length));
}

function spectralCentroid(
  magnitudes: Float32Array,
  sampleRateHz: number,
  fftSize: number,
): number {
  let weighted = 0;
  let total = 0;
  for (let bin = 1; bin < magnitudes.length; bin += 1) {
    const magnitude = magnitudes[bin] ?? 0;
    weighted += magnitude * bin * sampleRateHz / fftSize;
    total += magnitude;
  }
  return weighted / Math.max(Number.EPSILON, total);
}

test("the production audio engine requires the prepared stateful clarinet segment instead of a stateless fallback", async () => {
  const playback = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!playback.ok) throw new Error(`PHYSICAL_AUDIO_PLAN:${playback.refusal.code}`);
  const realized = compilePhysicalRealization({
    plan: playback.plan,
    sourcePlanRevision: 1,
    instrumentFamily: "clarinet",
    instrumentVersionId: "changes.physical.clarinet.v2",
    parameterPackSha256: "b".repeat(64),
    sampleRateHz: 48_000,
  });
  if (!realized.ok) throw new Error(`PHYSICAL_AUDIO_REALIZE:${realized.refusal.code}`);
  const gesture = realized.value.expressivePlan.gestures[1];
  const event = playback.plan.events[0];
  const midiPitch = event?.midiPitches[1];
  if (gesture === undefined || event === undefined || midiPitch === undefined) {
    throw new Error("PHYSICAL_AUDIO_FIXTURE_EMPTY");
  }
  expect(physicalGestureExcitationVelocity(gesture, event.velocity)).toBe(
    event.velocity,
  );

  const { engine, context } = await readyEngine();
  requireSuccess(
    engine.attackAudioVoices(
      attackRequest(
        [{ voiceId: "legacy-clarinet", midiPitch: midi(midiPitch), velocity: event.velocity }],
        { eventId: "legacy-clarinet-event", instrumentId: "clarinet" },
      ),
    ),
  );
  const legacySourceId = context.sourceIds().at(-1);
  const legacyBuffer = legacySourceId === undefined
    ? null
    : context.sourceBuffer(legacySourceId);

  requireFailure(
    engine.attackAudioVoices(
      attackRequest(
        [{
          voiceId: "unprepared-physical-clarinet",
          midiPitch: midi(midiPitch),
          velocity: event.velocity,
          physicalGesture: gesture,
        }],
        { eventId: event.eventId, instrumentId: "clarinet" },
      ),
    ),
    "audio.renderer_unavailable",
  );
  requireFailure(await engine.prepareRenderedAudioVoices({
    instrumentId: "clarinet",
    notes: [{
      midiPitch: midi(midiPitch),
      velocity: event.velocity,
      physicalGesture: gesture,
    }],
  }), "audio.voice_id_invalid");
  requireSuccess(await engine.prepareRenderedAudioVoices({
    instrumentId: "clarinet",
    notes: [{
      midiPitch: midi(midiPitch),
      velocity: event.velocity,
      physicalGesture: gesture,
      physicalFrameCount: 2_400,
      physicalCacheFingerprint: "f".repeat(64),
      physicalStateReset: true,
    }],
  }));
  requireSuccess(
    engine.attackAudioVoices(
      attackRequest(
        [{
          voiceId: "physical-clarinet",
          midiPitch: midi(midiPitch),
          velocity: event.velocity,
          physicalGesture: gesture,
        }],
        { eventId: event.eventId, instrumentId: "clarinet" },
      ),
    ),
  );
  const physicalSourceId = context.sourceIds().at(-1);
  const physicalBuffer = physicalSourceId === undefined
    ? null
    : context.sourceBuffer(physicalSourceId);
  if (legacyBuffer === null || physicalBuffer === null) {
    throw new Error("PHYSICAL_AUDIO_BUFFER_MISSING");
  }

  expect(physicalBuffer).not.toBe(legacyBuffer);
  expect(physicalBuffer.length).toBe(2_400);
  expect(legacyBuffer.length).toBeGreaterThan(physicalBuffer.length);
  const legacy = legacyBuffer.getChannelData(0);
  const physical = physicalBuffer.getChannelData(0);
  let absoluteDifference = 0;
  for (let index = 0; index < Math.min(24_000, legacy.length); index += 1) {
    absoluteDifference += Math.abs((legacy[index] ?? 0) - (physical[index] ?? 0));
  }
  expect(absoluteDifference).toBeGreaterThan(1);
});

test("soft and loud physical excitation retain the unquantized dynamic and spectral contrast", async () => {
  const [analyzer, renderers] = await Promise.all([
    loadConcertGrandRenderer(),
    loadWaveguideRenderers(),
  ]);
  const instrument = renderers.get(WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID);
  if (instrument === undefined) throw new Error("PHYSICAL_DYNAMICS_RENDERER_MISSING");
  const render = (renderVelocity: number, sourceVelocity: number) => {
    const pcm = instrument.renderNote(60, renderVelocity, 48_000, 1);
    if (pcm === null) throw new Error("PHYSICAL_DYNAMICS_RENDER_REFUSED");
    const frame = analyzer.analyzeWindow(pcm.left.slice(4_096, 12_288), 48_000);
    if (frame === null) throw new Error("PHYSICAL_DYNAMICS_ANALYSIS_REFUSED");
    const outputGain = velocityGainForVelocity(sourceVelocity);
    return {
      rms: rms(pcm.left) * outputGain,
      centroidHz: spectralCentroid(frame.magnitudes, 48_000, frame.fftSize),
    };
  };
  const soft = render(20, 20);
  const loud = render(110, 110);
  const legacySoftBand = render(22, 20);
  const legacyLoudBand = render(106, 110);
  expect(Math.abs(loud.rms - soft.rms)).toBeGreaterThanOrEqual(
    Math.abs(legacyLoudBand.rms - legacySoftBand.rms),
  );
  expect(Math.abs(loud.centroidHz - soft.centroidHz)).toBeGreaterThanOrEqual(
    Math.abs(legacyLoudBand.centroidHz - legacySoftBand.centroidHz),
  );
});

test("physical preparation warms the exact v1 render identity consumed by attack", async () => {
  const playback = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!playback.ok) throw new Error("PHYSICAL_PREPARE_PLAN");
  const realized = compilePhysicalRealization({
    plan: playback.plan,
    sourcePlanRevision: 2,
    instrumentFamily: "flute",
    instrumentVersionId: "changes.physical.flute.v2",
    parameterPackSha256: "c".repeat(64),
    sampleRateHz: 48_000,
  });
  if (!realized.ok) throw new Error("PHYSICAL_PREPARE_REALIZE");
  const gesture = realized.value.expressivePlan.gestures[0];
  const event = playback.plan.events[0];
  const midiPitch = event?.midiPitches[0];
  if (gesture === undefined || event === undefined || midiPitch === undefined) {
    throw new Error("PHYSICAL_PREPARE_FIXTURE");
  }
  const { engine, fake } = await readyEngine();
  const bufferCreates = () => fake.events.filter(({ kind }) => kind === "buffer-create").length;
  const before = bufferCreates();
  const prepared = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "flute",
      notes: [{ midiPitch: midi(midiPitch), velocity: event.velocity, physicalGesture: gesture }],
    }),
  );
  expect(prepared.renderedCount).toBe(1);
  expect(bufferCreates()).toBe(before + 1);

  requireSuccess(
    engine.attackAudioVoices(
      attackRequest(
        [{
          voiceId: "prepared-physical-flute",
          midiPitch: midi(midiPitch),
          velocity: event.velocity,
          physicalGesture: gesture,
        }],
        { eventId: event.eventId, instrumentId: "flute" },
      ),
    ),
  );
  expect(bufferCreates()).toBe(before + 1);
  const repeated = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "flute",
      notes: [{ midiPitch: midi(midiPitch), velocity: event.velocity, physicalGesture: gesture }],
    }),
  );
  expect(repeated.cachedCount).toBe(1);
  expect(repeated.renderedCount).toBe(0);
});

test("clarinet-v2 phrase preparation chains exact stateful segments and replays their cache identities", async () => {
  const playback = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!playback.ok) throw new Error("PHYSICAL_PHRASE_PLAN");
  const realized = compilePhysicalRealization({
    plan: playback.plan,
    sourcePlanRevision: 27,
    instrumentFamily: "clarinet",
    instrumentVersionId: "changes.physical.clarinet.v2",
    parameterPackSha256: "d".repeat(64),
    sampleRateHz: 48_000,
  });
  if (!realized.ok) throw new Error("PHYSICAL_PHRASE_REALIZE");
  const base = realized.value.expressivePlan.gestures[0];
  const pitch = playback.plan.events[0]?.midiPitches[0];
  if (base === undefined || pitch === undefined) {
    throw new Error("PHYSICAL_PHRASE_FIXTURE");
  }
  const second = Object.freeze({
    ...base,
    eventId: `${base.eventId}.legato`,
    articulation: "legato" as const,
  });
  const notes = [
    {
      midiPitch: midi(pitch),
      velocity: 91,
      physicalGesture: base,
      physicalFrameCount: 2_400,
      physicalCacheFingerprint: "1".repeat(64),
      physicalStateReset: true,
    },
    {
      midiPitch: midi(pitch + 2),
      velocity: 91,
      physicalGesture: second,
      physicalFrameCount: 1_200,
      physicalCacheFingerprint: "2".repeat(64),
      physicalStateReset: false,
    },
  ] as const;
  const { engine, fake } = await readyEngine();
  const before = fake.events.filter(({ kind }) => kind === "buffer-create").length;
  const first = requireSuccess(
    await engine.prepareRenderedAudioVoices({ instrumentId: "clarinet", notes }),
  );
  expect(first).toMatchObject({ renderedCount: 2, cachedCount: 0 });
  expect(fake.events.filter(({ kind }) => kind === "buffer-create").length).toBe(
    before + 2,
  );
  const replay = requireSuccess(
    await engine.prepareRenderedAudioVoices({ instrumentId: "clarinet", notes }),
  );
  expect(replay).toMatchObject({ renderedCount: 0, cachedCount: 2 });
  expect(fake.events.filter(({ kind }) => kind === "buffer-create").length).toBe(
    before + 2,
  );

  const fillers = Array.from({ length: 64 }, (_, index) => {
    const physicalGesture = Object.freeze({
      ...base,
      eventId: `phrase-cache-filler-${String(index)}`,
      deterministicSeedUint32: (base.deterministicSeedUint32 + index + 1) >>> 0,
    });
    return Object.freeze({
      midiPitch: midi(pitch),
      velocity: 91,
      physicalGesture,
      physicalFrameCount: 1,
      physicalCacheFingerprint: (index + 16).toString(16).padStart(64, "0"),
      physicalStateReset: true,
    });
  });
  requireSuccess(await engine.prepareRenderedAudioVoices({
    instrumentId: "clarinet",
    notes: fillers,
  }));
  const beforeRefusal = fake.events.filter(
    ({ kind }) => kind === "buffer-create",
  ).length;
  requireFailure(engine.attackAudioVoices(attackRequest([{
    voiceId: "evicted-physical-clarinet",
    midiPitch: midi(pitch),
    velocity: 91,
    physicalGesture: base,
  }], {
    eventId: base.eventId,
    instrumentId: "clarinet",
  })), "audio.renderer_unavailable");
  expect(fake.events.filter(({ kind }) => kind === "buffer-create")).toHaveLength(
    beforeRefusal,
  );
});

test("stateful clarinet preparation refuses a stateless gesture batch before doing cache work", async () => {
  const playback = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!playback.ok) throw new Error("PHYSICAL_CACHE_PLAN");
  const realized = compilePhysicalRealization({
    plan: playback.plan,
    sourcePlanRevision: 3,
    instrumentFamily: "clarinet",
    instrumentVersionId: "changes.physical.clarinet.v2",
    parameterPackSha256: "e".repeat(64),
    sampleRateHz: 48_000,
  });
  if (!realized.ok) throw new Error("PHYSICAL_CACHE_REALIZE");
  const base = realized.value.expressivePlan.gestures[1];
  const midiPitch = playback.plan.events[0]?.midiPitches[1];
  if (base === undefined || midiPitch === undefined) throw new Error("PHYSICAL_CACHE_FIXTURE");
  const gestures = Object.freeze(
    Array.from({ length: 65 }, (_, index) =>
      Object.freeze({
        ...base,
        eventId: `physical-cache-event-${String(index)}`,
        deterministicSeedUint32: (base.deterministicSeedUint32 + index) >>> 0,
      }),
    ),
  );
  const { engine, fake } = await readyEngine();
  const before = fake.events.filter(({ kind }) => kind === "buffer-create").length;
  requireFailure(await engine.prepareRenderedAudioVoices({
    instrumentId: "clarinet",
    notes: gestures.map((physicalGesture) => ({
      midiPitch: midi(midiPitch),
      velocity: 96,
      physicalGesture,
    })),
  }), "audio.voice_id_invalid");
  expect(fake.events.filter(({ kind }) => kind === "buffer-create")).toHaveLength(
    before,
  );
}, 10_000);

test("legato and tongued winds own distinct bounded cache entries", async () => {
  const playback = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!playback.ok) throw new Error("PHYSICAL_ARTICULATION_CACHE_PLAN");
  const realized = compilePhysicalRealization({
    plan: playback.plan,
    sourcePlanRevision: 31,
    instrumentFamily: "clarinet",
    instrumentVersionId: "changes.physical.clarinet.v2",
    parameterPackSha256: "a".repeat(64),
    sampleRateHz: 48_000,
  });
  if (!realized.ok) throw new Error("PHYSICAL_ARTICULATION_CACHE_REALIZE");
  const base = realized.value.expressivePlan.gestures[1];
  const midiPitch = playback.plan.events[0]?.midiPitches[1];
  if (base === undefined || midiPitch === undefined) {
    throw new Error("PHYSICAL_ARTICULATION_CACHE_FIXTURE");
  }
  const tongued = Object.freeze({ ...base, articulation: "tongued" as const });
  const legato = Object.freeze({ ...base, articulation: "legato" as const });
  const { engine } = await readyEngine();
  const first = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "clarinet",
      notes: [
        {
          midiPitch: midi(midiPitch),
          velocity: 96,
          physicalGesture: tongued,
          physicalFrameCount: 1_200,
          physicalCacheFingerprint: "3".repeat(64),
          physicalStateReset: true,
        },
        {
          midiPitch: midi(midiPitch),
          velocity: 96,
          physicalGesture: legato,
          physicalFrameCount: 1_200,
          physicalCacheFingerprint: "4".repeat(64),
          physicalStateReset: true,
        },
        {
          midiPitch: midi(midiPitch),
          velocity: 96,
          physicalGesture: tongued,
          physicalFrameCount: 1_200,
          physicalCacheFingerprint: "3".repeat(64),
          physicalStateReset: true,
        },
      ],
    }),
  );
  expect(first.renderedCount).toBe(2);
  expect(first.cachedCount).toBe(1);
});

test("sixteen repeated comp attacks reduce to four honest v1 PCM renders", async () => {
  const playback = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!playback.ok) throw new Error("PHYSICAL_COMP_CACHE_PLAN");
  const realized = compilePhysicalRealization({
    plan: playback.plan,
    sourcePlanRevision: 4,
    instrumentFamily: "guitar",
    instrumentVersionId: "changes.physical.guitar.v2",
    parameterPackSha256: "f".repeat(64),
    sampleRateHz: 48_000,
  });
  if (!realized.ok) throw new Error("PHYSICAL_COMP_CACHE_REALIZE");
  const base = realized.value.expressivePlan.gestures[0];
  if (base === undefined) throw new Error("PHYSICAL_COMP_CACHE_GESTURE");
  const pairs = [
    { midiPitch: midi(48), velocity: 72 },
    { midiPitch: midi(55), velocity: 72 },
    { midiPitch: midi(60), velocity: 88 },
    { midiPitch: midi(64), velocity: 88 },
  ] as const;
  const { engine } = await readyEngine();
  const result = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "guitar",
      notes: Array.from({ length: 16 }, (_, index) => {
        const pair = pairs[index % pairs.length];
        if (pair === undefined) throw new Error("PHYSICAL_COMP_CACHE_PAIR");
        return {
          ...pair,
          physicalGesture: Object.freeze({
            ...base,
            eventId: `physical-comp-event-${String(index)}`,
            deterministicSeedUint32:
              (base.deterministicSeedUint32 + index) >>> 0,
          }),
        };
      }),
    }),
  );
  expect(result.renderedCount).toBe(4);
  expect(result.cachedCount).toBe(12);
});
