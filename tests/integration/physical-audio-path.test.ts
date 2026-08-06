import { expect, test } from "bun:test";

import {
  compilePhysicalRealization,
  physicalGestureExcitationVelocity,
} from "../../src/audio";
import { compilePlaybackPlan } from "../../src/playback";
import {
  attackRequest,
  midi,
  readyEngine,
  requireSuccess,
} from "../support/audio-engine-test-kit";
import { materializeP0TimelineCase } from "../support/p0-playback-fixtures";

test("the production audio engine renders physical excitation instead of the legacy velocity-only cache entry", async () => {
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
  expect(physicalGestureExcitationVelocity(gesture, event.velocity)).toBe(107);

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
  expect(physicalBuffer.length).toBe(legacyBuffer.length);
  const legacy = legacyBuffer.getChannelData(0);
  const physical = physicalBuffer.getChannelData(0);
  let absoluteDifference = 0;
  for (let index = 0; index < Math.min(24_000, legacy.length); index += 1) {
    absoluteDifference += Math.abs((legacy[index] ?? 0) - (physical[index] ?? 0));
  }
  expect(absoluteDifference).toBeGreaterThan(1);
});

test("physical preparation warms the exact gesture fingerprint consumed by attack", async () => {
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

test("gesture fingerprints cannot collide with one another and physical cache eviction is deterministic LRU", async () => {
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
  const gestures = Object.freeze(Array.from({ length: 65 }, (_, index) =>
    Object.freeze({
      ...base,
      eventId: `physical-cache-event-${String(index)}`,
      deterministicSeedUint32: (base.deterministicSeedUint32 + index) >>> 0,
    }))));
  const { engine } = await readyEngine();
  const initial = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "clarinet",
      notes: gestures.map((physicalGesture) => ({
        midiPitch: midi(midiPitch),
        velocity: 96,
        physicalGesture,
      })),
    }),
  );
  expect(initial.renderedCount).toBe(65);
  expect(initial.cachedCount).toBe(0);
  const newestGesture = gestures[64];
  const oldestGesture = gestures[0];
  if (newestGesture === undefined || oldestGesture === undefined) {
    throw new Error("PHYSICAL_CACHE_GESTURE_MISSING");
  }

  const newest = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "clarinet",
      notes: [{ midiPitch: midi(midiPitch), velocity: 96, physicalGesture: newestGesture }],
    }),
  );
  expect(newest.cachedCount).toBe(1);
  expect(newest.renderedCount).toBe(0);
  const oldest = requireSuccess(
    await engine.prepareRenderedAudioVoices({
      instrumentId: "clarinet",
      notes: [{ midiPitch: midi(midiPitch), velocity: 96, physicalGesture: oldestGesture }],
    }),
  );
  expect(oldest.cachedCount).toBe(0);
  expect(oldest.renderedCount).toBe(1);
});
