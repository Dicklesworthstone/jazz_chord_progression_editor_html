import { expect, test } from "bun:test";

import { compilePhysicalRealization } from "../../src/audio";
import { selectPhysicalPhrasePreparationEntries } from "../../src/application/studio-audio";
import { compilePlaybackPlan } from "../../src/playback";
import { materializeP0TimelineCase } from "../support/p0-playback-fixtures";

function clarinetRealization() {
  const playback = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  if (!playback.ok) throw new Error(playback.refusal.code);
  const physical = compilePhysicalRealization({
    plan: playback.plan,
    sourcePlanRevision: 17,
    instrumentFamily: "clarinet",
    instrumentVersionId: "changes.physical.clarinet.v2",
    parameterPackSha256: "a".repeat(64),
    sampleRateHz: 48_000,
  });
  if (!physical.ok) throw new Error(physical.refusal.code);
  return physical.value;
}

test("clarinet warmup selects only the requested retained-voice prefix", () => {
  const physical = clarinetRealization();
  const firstGesture = physical.expressivePlan.gestures[0];
  if (firstGesture === undefined) throw new Error("GESTURE_ABSENT");
  const sameVoice = physical.expressivePlan.gestures.filter(
    (gesture) => gesture.voiceId === firstGesture.voiceId,
  );
  const requestedGesture = sameVoice[1];
  if (requestedGesture === undefined) throw new Error("SECOND_GESTURE_ABSENT");
  const eventGestures = physical.expressivePlan.gestures.filter(
    (gesture) => gesture.eventId === requestedGesture.eventId,
  );
  const voiceOrdinal = eventGestures.indexOf(requestedGesture);
  expect(voiceOrdinal).toBeGreaterThanOrEqual(0);

  const allEvents = physical.renderPlan.segments.flatMap(
    (segment) => segment.events,
  );
  const selected = selectPhysicalPhrasePreparationEntries(
    [{ eventId: requestedGesture.eventId, voiceOrdinal }],
    physical.expressivePlan.gestures,
    physical.renderPlan.segments,
  );

  /* A stateful second note needs the first note for continuity, but neither
   * later notes nor unrelated simultaneous voices belong in this warmup. */
  expect(selected.map(({ event }) => event.voiceId)).toEqual([
    firstGesture.voiceId,
    firstGesture.voiceId,
  ]);
  expect(selected.at(-1)?.event.eventId).toBe(requestedGesture.eventId);
  expect(selected.length).toBeLessThan(allEvents.length);
  expect(selected.every(({ event }) =>
    event.voiceId === firstGesture.voiceId
  )).toBe(true);
});

test("an unknown preparation identity cannot silently expand to the whole phrase", () => {
  const physical = clarinetRealization();
  expect(selectPhysicalPhrasePreparationEntries(
    [{ eventId: "event-not-in-plan", voiceOrdinal: 0 }],
    physical.expressivePlan.gestures,
    physical.renderPlan.segments,
  )).toEqual([]);
});
