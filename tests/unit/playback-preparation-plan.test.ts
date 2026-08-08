import { expect, test } from "bun:test";

import { makeMidiPitch, type MidiPitch } from "../../src/domain";
import {
  buildPlaybackPreparationPlan,
  type PlaybackPreparationEvent,
} from "../../src/application/playback-preparation-plan";

function midi(value: number): MidiPitch {
  const result = makeMidiPitch(value);
  if (!result.ok) throw new Error(`INVALID_TEST_MIDI:${String(value)}`);
  return result.value;
}

function event(
  eventId: string,
  pitches: readonly number[],
): PlaybackPreparationEvent {
  return Object.freeze({
    eventId,
    midiPitches: Object.freeze(pitches.map(midi)),
    velocity: 96,
    gateSeconds: 1.5,
  });
}

const SEEDED_ONE_FOUR_ONE_FOUR = Object.freeze([
  event("pickup", [55]),
  event("chord-a", [48, 55, 60, 64]),
  event("passing", [57]),
  event("chord-b", [50, 57, 62, 65]),
]);

test("the leading budget never splits the seeded 1/4/1/4 event sequence", () => {
  /* Planted old-path negative: a flat eight-note slice bisects chord-b. */
  const flattened = SEEDED_ONE_FOUR_ONE_FOUR.flatMap((item) =>
    item.midiPitches.map((midiPitch) => ({
      eventId: item.eventId,
      midiPitch,
    }))
  );
  expect(flattened.slice(0, 8).filter((note) =>
    note.eventId === "chord-b"
  )).toHaveLength(2);
  expect(flattened.slice(8).filter((note) =>
    note.eventId === "chord-b"
  )).toHaveLength(2);

  const result = buildPlaybackPreparationPlan(SEEDED_ONE_FOUR_ONE_FOUR, {
    leadingVoiceBudget: 8,
    maximumVoicesPerEvent: 6,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.plan.leadingGroups.map((group) => group.eventId)).toEqual([
    "pickup",
    "chord-a",
    "passing",
  ]);
  expect(result.plan.leadingVoices).toHaveLength(6);
  expect(result.plan.deferredGroups.map((group) => group.eventId)).toEqual([
    "chord-b",
  ]);
  expect(result.plan.deferredGroups[0]?.voices.map((voice) =>
    voice.voiceOrdinal
  )).toEqual([0, 1, 2, 3]);
});

test("duplicate pitches remain distinct simultaneous physical courses", () => {
  const result = buildPlaybackPreparationPlan(
    [event("unison", [60, 60, 67])],
    { leadingVoiceBudget: 8, maximumVoicesPerEvent: 6 },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.plan.leadingVoices.map((voice) => voice.midiPitch)).toEqual([
    midi(60),
    midi(60),
    midi(67),
  ]);
  expect(result.plan.leadingVoices.map((voice) => voice.voiceOrdinal)).toEqual([
    0,
    1,
    2,
  ]);
});

test("a chord wider than the physical course count refuses as one event", () => {
  const result = buildPlaybackPreparationPlan(
    [event("impossible-uke", [60, 64, 67, 71, 74])],
    { leadingVoiceBudget: 8, maximumVoicesPerEvent: 4 },
  );
  expect(result).toEqual({
    ok: false,
    code: "preparation.event_too_wide",
    eventId: "impossible-uke",
    voiceCount: 5,
    maximumVoicesPerEvent: 4,
  });
});
