import { expect, test } from "bun:test";

import { compilePhysicalRealization } from "../../src/audio";
import type { ExpressiveVoiceGesture } from "../../src/audio";
import { compilePlaybackPlan } from "../../src/playback";
import {
  attackRequest,
  midi,
  readyEngine,
  requireFailure,
  requireSuccess,
} from "../support/audio-engine-test-kit";
import { materializeP0TimelineCase } from "../support/p0-playback-fixtures";

type Fixture = Readonly<{
  gestures: readonly ExpressiveVoiceGesture[];
  midiPitches: readonly number[];
  eventId: string;
  velocity: number;
}>;

function clarinetFixture(instrumentVersionId: string): Fixture {
  const playback = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!playback.ok) {
    throw new Error(`GESTURE_BINDING_PLAN:${playback.refusal.code}`);
  }
  const realized = compilePhysicalRealization({
    plan: playback.plan,
    sourcePlanRevision: 1,
    instrumentFamily: "clarinet",
    instrumentVersionId,
    parameterPackSha256: "b".repeat(64),
    sampleRateHz: 48_000,
  });
  if (!realized.ok) {
    throw new Error(`GESTURE_BINDING_REALIZE:${realized.refusal.code}`);
  }
  const event = playback.plan.events[0];
  if (event === undefined || event.midiPitches.length < 2) {
    throw new Error("GESTURE_BINDING_FIXTURE_NEEDS_TWO_PITCHES");
  }
  const gestures = realized.value.expressivePlan.gestures.filter(
    (gesture) => gesture.eventId === event.eventId,
  );
  if (gestures.length < 2) {
    throw new Error("GESTURE_BINDING_FIXTURE_NEEDS_TWO_GESTURES");
  }
  return Object.freeze({
    gestures,
    midiPitches: event.midiPitches,
    eventId: event.eventId,
    velocity: event.velocity,
  });
}

function voiceWithGesture(
  fixture: Fixture,
  index: number,
  gesture: ExpressiveVoiceGesture,
) {
  const midiPitch = fixture.midiPitches[index];
  if (midiPitch === undefined) {
    throw new Error("GESTURE_BINDING_FIXTURE_PITCH_MISSING");
  }
  return {
    voiceId: `binding-voice-${String(index)}`,
    midiPitch: midi(midiPitch),
    velocity: fixture.velocity,
    physicalGesture: gesture,
  };
}

test("a compiled gesture with the active instrument version and canonical voice identity attaches", async () => {
  const fixture = clarinetFixture("changes.physical.clarinet.v2");
  const [first, second] = fixture.gestures;
  if (first === undefined || second === undefined) throw new Error("unreachable");
  const { engine } = await readyEngine();
  requireSuccess(
    engine.attackAudioVoices(
      attackRequest(
        [voiceWithGesture(fixture, 0, first), voiceWithGesture(fixture, 1, second)],
        { eventId: fixture.eventId, instrumentId: "clarinet" },
      ),
    ),
  );
});

test("a stale instrument version refuses at the physicalGesture path even when family and event match", async () => {
  const fixture = clarinetFixture("changes.physical.clarinet.v1");
  const [first] = fixture.gestures;
  if (first === undefined) throw new Error("unreachable");
  expect(first.instrumentVersionId).toBe("changes.physical.clarinet.v1");
  const { engine } = await readyEngine();
  const refusal = requireFailure(
    engine.attackAudioVoices(
      attackRequest([voiceWithGesture(fixture, 0, first)], {
        eventId: fixture.eventId,
        instrumentId: "clarinet",
      }),
    ),
    "audio.voice_id_invalid",
  );
  expect(refusal.path).toEqual(["voices", 0, "physicalGesture"]);
});

test("a tampered gesture voice identity refuses even with the correct version", async () => {
  const fixture = clarinetFixture("changes.physical.clarinet.v2");
  const [first] = fixture.gestures;
  if (first === undefined) throw new Error("unreachable");
  const tampered: ExpressiveVoiceGesture = Object.freeze({
    ...first,
    voiceId: "physical.clarinet.NOTLOWERHEX000000000000",
  });
  const { engine } = await readyEngine();
  const refusal = requireFailure(
    engine.attackAudioVoices(
      attackRequest([voiceWithGesture(fixture, 0, tampered)], {
        eventId: fixture.eventId,
        instrumentId: "clarinet",
      }),
    ),
    "audio.voice_id_invalid",
  );
  expect(refusal.path).toEqual(["voices", 0, "physicalGesture"]);
});

test("the same gesture attached to two voices of one attack batch refuses at the second voice", async () => {
  const fixture = clarinetFixture("changes.physical.clarinet.v2");
  const [first] = fixture.gestures;
  if (first === undefined) throw new Error("unreachable");
  const { engine } = await readyEngine();
  const refusal = requireFailure(
    engine.attackAudioVoices(
      attackRequest(
        [voiceWithGesture(fixture, 0, first), voiceWithGesture(fixture, 1, first)],
        { eventId: fixture.eventId, instrumentId: "clarinet" },
      ),
    ),
    "audio.voice_id_invalid",
  );
  expect(refusal.path).toEqual(["voices", 1, "physicalGesture"]);
});

test("mutation: a gesture wrong in both version and voice identity still reports the first gesture path deterministically", async () => {
  const fixture = clarinetFixture("changes.physical.clarinet.v1");
  const [first] = fixture.gestures;
  if (first === undefined) throw new Error("unreachable");
  const doublyWrong: ExpressiveVoiceGesture = Object.freeze({
    ...first,
    voiceId: "physical.clarinet.short",
  });
  const { engine } = await readyEngine();
  const refusal = requireFailure(
    engine.attackAudioVoices(
      attackRequest([voiceWithGesture(fixture, 0, doublyWrong)], {
        eventId: fixture.eventId,
        instrumentId: "clarinet",
      }),
    ),
    "audio.voice_id_invalid",
  );
  expect(refusal.path).toEqual(["voices", 0, "physicalGesture"]);
});
