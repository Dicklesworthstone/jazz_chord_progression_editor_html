import { expect, test } from "bun:test";

import {
  compilePlaybackPlan,
  type PlaybackPlan,
} from "../../src/playback";
import {
  canonicalP0Json,
  observeP0Case,
  p0FixtureCase,
  requireP0Record,
} from "../support/p0-conformance";
import { materializeP0TimelineCase } from
  "../support/p0-playback-fixtures";

type TestConsumer = Readonly<{
  consume: (plan: PlaybackPlan) => void;
  received: () => PlaybackPlan | null;
}>;

function captureConsumer(): TestConsumer {
  let captured: PlaybackPlan | null = null;
  return Object.freeze({
    consume(plan: PlaybackPlan): void {
      if (captured !== null) throw new Error("P0_CONSUMER_DUPLICATE_HANDOFF");
      captured = plan;
    },
    received(): PlaybackPlan | null {
      return captured;
    },
  });
}

test("P0-LAW-012 hands the same frozen plan object to Audio and MIDI consumers", () => {
  const result = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!result.ok) throw new Error(`P0_LAW_012:${result.refusal.code}`);
  const before = canonicalP0Json(result.plan);
  const audio = captureConsumer();
  const midi = captureConsumer();

  audio.consume(result.plan);
  midi.consume(result.plan);
  const audioPlan = audio.received();
  const midiPlan = midi.received();

  expect(audioPlan).toBe(result.plan);
  expect(midiPlan).toBe(result.plan);
  expect(audioPlan).toBe(midiPlan);
  expect(Object.isFrozen(result.plan)).toBe(true);
  expect(Object.isFrozen(result.plan.events)).toBe(true);
  expect(canonicalP0Json(result.plan)).toBe(before);

  const manual = result.plan.events.find(
    ({ eventId }) => eventId === "event-p0-a1-2",
  );
  if (manual === undefined) throw new Error("P0_LAW_012_MANUAL_MISSING");
  expect(audioPlan?.events[1]?.pitches).toBe(manual.pitches);
  expect(midiPlan?.events[1]?.midiPitches).toBe(manual.midiPitches);
  expect(audioPlan?.events[1]?.midiPitches.map(Number)).toEqual([
    71, 64, 67, 60, 64,
  ]);
  expect(midiPlan?.events[1]?.midiPitches.map(Number)).toEqual([
    71, 64, 67, 60, 64,
  ]);
  expect(audioPlan?.events.map(({ startTick }) => startTick)).toEqual(
    midiPlan?.events.map(({ startTick }) => startTick),
  );
});

test("P0-LAW-012 kills a rebuilt MIDI plan that normalizes Manual order", () => {
  const result = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!result.ok) throw new Error("P0_LAW_012_NEAR_MISS_REFUSAL");
  const nearMissPlan = Object.freeze({
    ...result.plan,
    events: Object.freeze(result.plan.events.map((event) =>
      event.eventId === "event-p0-a1-2"
        ? Object.freeze({
            ...event,
            midiPitches: Object.freeze(
              [...event.midiPitches].sort((left, right) => left - right),
            ),
          })
        : event
    )),
  });
  const law = p0FixtureCase("P0-LAW-012").row;
  const nearMiss = requireP0Record(law["nearMiss"], "P0-LAW-012.nearMiss");

  expect(nearMiss["wrongBehavior"]).toBe(
    "MIDI sorts manual midiPitches ascending",
  );
  expect(nearMissPlan).not.toBe(result.plan);
  expect(canonicalP0Json(nearMissPlan)).not.toBe(
    canonicalP0Json(result.plan),
  );
});

test("P0-LAW-012 literal law observation is digest-equal to its fixture", () => {
  const observation = observeP0Case("P0-LAW-012");
  expect(observation.actualProjectionSha256).toBe(
    observation.expectedProjectionSha256,
  );
});
