import { beatValueToMidiTicks, makeBeatDuration, makeBeatPosition, makeBeatRange, type BeatRange } from "../domain";
import { PLAYBACK_PLAN_MIDI_PPQ, PLAYBACK_PLAN_MINIMUM_GATE_TICKS, PLAYBACK_PLAN_RELEASE_GAP_TICKS,
  type PlaybackEvent, type PlaybackPlan } from "./playback-plan-contract";
import { MAX_PERFORMANCE_PLAN_EVENTS } from "./performance/performance-plan-contract";

export type PlaybackLoopProjectionEvidence = Readonly<{
  inputEventsVisited: number;
  projectedEvents: number;
  /** References to existing immutable pitches; no pitch is copied or repaired. */
  retainedPitchSlots: number;
}>;
export type PlaybackLoopProjectionResult = Readonly<{ evidence: PlaybackLoopProjectionEvidence }> & (
  Readonly<{ ok: true; plan: PlaybackPlan }> |
  Readonly<{ ok: false; refusal: Readonly<{ code:
    "playback.projection_requires_full_plan" | "playback.loop_invalid" |
    "playback.loop_out_of_range" | "limit.playback_projection_events" |
    "playback.projection_event_invalid" }> }>
);

/** Project an already compiled FULL chart (literal or performed). Preserve
 * absolute source time and the arrangement's original bar/cycle/voice context.
 * At most 65536 event visits and output records; immutable pitch arrays are
 * shared. This does not compile a groove or accept an already clipped plan. */
export function projectPlaybackPlanLoop(plan: PlaybackPlan, loop: BeatRange): PlaybackLoopProjectionResult {
  let inputEventsVisited = 0, retainedPitchSlots = 0;
  const events: PlaybackEvent[] = [];
  const evidence = (): PlaybackLoopProjectionEvidence => Object.freeze({ inputEventsVisited, projectedEvents: events.length, retainedPitchSlots });
  const refuse = (code: Extract<PlaybackLoopProjectionResult, { ok: false }>["refusal"]["code"]): PlaybackLoopProjectionResult =>
    Object.freeze({ ok: false, refusal: Object.freeze({ code }), evidence: evidence() });
  if (plan.loop !== null || plan.loopTicks !== null) return refuse("playback.projection_requires_full_plan");
  const left = makeBeatPosition(loop.start), right = makeBeatPosition(loop.end);
  if (!left.ok || !right.ok) return refuse("playback.loop_invalid");
  const range = makeBeatRange(left.value, right.value);
  if (!range.ok) return refuse("playback.loop_invalid");
  const start = beatValueToMidiTicks(left.value), end = beatValueToMidiTicks(right.value);
  if (end > plan.totalTicks) return refuse("playback.loop_out_of_range");
  if (plan.events.length > MAX_PERFORMANCE_PLAN_EVENTS) return refuse("limit.playback_projection_events");
  for (const event of plan.events) {
    inputEventsVisited += 1;
    const eventEnd = event.startTick + event.durationTicks;
    if (event.startTick >= end || eventEnd <= start) continue;
    const clippedStart = Math.max(start, event.startTick), clippedEnd = Math.min(end, eventEnd);
    const restarted = clippedStart > event.startTick, endClipped = clippedEnd < eventEnd;
    const ticks = clippedEnd - clippedStart;
    // Most arranged attacks are wholly inside the passage. Their compiled
    // rational mirrors and offsets already have the exact required values;
    // retain them instead of allocating and validating four equal values.
    if (!restarted && !endClipped && event.gateDurationTicks === Math.max(PLAYBACK_PLAN_MINIMUM_GATE_TICKS, ticks - PLAYBACK_PLAN_RELEASE_GAP_TICKS)) {
      events.push(Object.freeze({ ...event, ordinal: events.length, articulation: "ordinary" }));
      retainedPitchSlots += event.pitches.length;
      continue;
    }
    const startBeat = makeBeatPosition({ numerator: clippedStart, denominator: PLAYBACK_PLAN_MIDI_PPQ });
    const duration = makeBeatDuration({ numerator: ticks, denominator: PLAYBACK_PLAN_MIDI_PPQ });
    const gate = makeBeatDuration({ numerator: Math.max(PLAYBACK_PLAN_MINIMUM_GATE_TICKS, ticks - PLAYBACK_PLAN_RELEASE_GAP_TICKS), denominator: PLAYBACK_PLAN_MIDI_PPQ });
    const offsetTicks = (event.sourceOffsetTicks ?? 0) + clippedStart - event.startTick;
    const offset = offsetTicks === 0 ? null : makeBeatDuration({ numerator: offsetTicks, denominator: PLAYBACK_PLAN_MIDI_PPQ });
    if (!startBeat.ok || !duration.ok || !gate.ok || (offset !== null && !offset.ok)) return refuse("playback.projection_event_invalid");
    const sourceOffsetBeats = offset?.value ?? null;
    events.push(Object.freeze({ ...event, ordinal: events.length,
      startBeat: startBeat.value, startTick: beatValueToMidiTicks(startBeat.value),
      durationBeats: duration.value, durationTicks: beatValueToMidiTicks(duration.value),
      gateDurationBeats: gate.value, gateDurationTicks: beatValueToMidiTicks(gate.value),
      sourceOffsetBeats, sourceOffsetTicks: sourceOffsetBeats === null ? null : beatValueToMidiTicks(sourceOffsetBeats),
      articulation: restarted ? (endClipped ? "loop-restart-end-clipped" : "loop-restart") : (endClipped ? "loop-end-clipped" : "ordinary"),
    }));
    retainedPitchSlots += event.pitches.length;
  }
  return Object.freeze({ ok: true, plan: Object.freeze({ ...plan, events: Object.freeze(events),
    loop: range.value, loopTicks: Object.freeze({ start, end }) }), evidence: evidence() });
}
