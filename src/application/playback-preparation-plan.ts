import type { MidiPitch } from "../domain";

export type PlaybackPreparationEvent = Readonly<{
  eventId: string;
  midiPitches: readonly MidiPitch[];
  velocity: number;
  gateSeconds: number;
}>;

export type PlaybackPreparationVoice = Readonly<{
  midiPitch: MidiPitch;
  velocity: number;
  gateSeconds: number;
  eventId: string;
  voiceOrdinal: number;
}>;

export type PlaybackPreparationGroup = Readonly<{
  eventId: string;
  eventOrdinal: number;
  voices: readonly PlaybackPreparationVoice[];
}>;

export type PlaybackPreparationPlan = Readonly<{
  leadingGroups: readonly PlaybackPreparationGroup[];
  deferredGroups: readonly PlaybackPreparationGroup[];
  leadingVoices: readonly PlaybackPreparationVoice[];
}>;

export type PlaybackPreparationPlanResult =
  | Readonly<{ ok: true; plan: PlaybackPreparationPlan }>
  | Readonly<{
      ok: false;
      code: "preparation.event_too_wide";
      eventId: string;
      voiceCount: number;
      maximumVoicesPerEvent: number;
    }>;

export type PlaybackPreparationLimits = Readonly<{
  leadingVoiceBudget: number;
  maximumVoicesPerEvent: number;
}>;

function frozenVoices(
  event: PlaybackPreparationEvent,
): readonly PlaybackPreparationVoice[] {
  return Object.freeze(
    event.midiPitches.map((midiPitch, voiceOrdinal) =>
      Object.freeze({
        midiPitch,
        velocity: event.velocity,
        gateSeconds: event.gateSeconds,
        eventId: event.eventId,
        voiceOrdinal,
      }),
    ),
  );
}

/**
 * Builds the renderer warmup plan without ever splitting a playback event.
 *
 * Composite physical renderers key one PCM buffer by the complete set of
 * voices in an event. A flat note-count slice can therefore warm two partial
 * buffers that can satisfy neither the later full-chord attack nor each other.
 * The leading budget remains a latency bound, but event closure outranks
 * filling it: once a non-empty prefix exists, the next whole group is deferred
 * if adding it would exceed the budget.
 */
export function buildPlaybackPreparationPlan(
  events: readonly PlaybackPreparationEvent[],
  limits: PlaybackPreparationLimits,
): PlaybackPreparationPlanResult {
  const groups: PlaybackPreparationGroup[] = [];
  for (const [eventOrdinal, event] of events.entries()) {
    if (event.midiPitches.length > limits.maximumVoicesPerEvent) {
      return Object.freeze({
        ok: false,
        code: "preparation.event_too_wide",
        eventId: event.eventId,
        voiceCount: event.midiPitches.length,
        maximumVoicesPerEvent: limits.maximumVoicesPerEvent,
      });
    }
    groups.push(
      Object.freeze({
        eventId: event.eventId,
        eventOrdinal,
        voices: frozenVoices(event),
      }),
    );
  }

  let leadingGroupCount = 0;
  let leadingVoiceCount = 0;
  for (const group of groups) {
    const nextVoiceCount = leadingVoiceCount + group.voices.length;
    if (
      leadingGroupCount > 0 &&
      nextVoiceCount > limits.leadingVoiceBudget
    ) {
      break;
    }
    leadingVoiceCount = nextVoiceCount;
    leadingGroupCount += 1;
  }

  const leadingGroups = Object.freeze(groups.slice(0, leadingGroupCount));
  const deferredGroups = Object.freeze(groups.slice(leadingGroupCount));
  const leadingVoices = Object.freeze(
    leadingGroups.flatMap((group) => group.voices),
  );
  return Object.freeze({
    ok: true,
    plan: Object.freeze({ leadingGroups, deferredGroups, leadingVoices }),
  });
}

export type RenderFrontierInput = Readonly<{
  /** Music seconds from the run's start covered by rendered groups. */
  frontierSeconds: number;
  /** Music seconds of one pass: start position to plan end (or loop end). */
  runSeconds: number;
  /** Measured render cost: wall seconds spent per music second rendered. */
  wallSecondsPerMusicSecond: number;
  /** Multiplier (>= 1) on the measured cost for playback-time contention. */
  safetyFactor: number;
  /** Music seconds the frontier must always stay ahead of the playhead. */
  marginSeconds: number;
}>;

/**
 * jcpe-70yb: may a cache-only run start now and never overtake its own
 * chronological render? After the start the playhead is at `t` and the render
 * frontier at `f + t / k` (k = cost with safety). The frontier must stay at
 * least `margin` ahead until it reaches the end, which happens at
 * `t = k (T - f)`; the binding point is that last instant, so the condition is
 * `f >= ((k - 1) T + margin) / k`, and never less than `margin`. A fully
 * rendered pass always may start. Invalid measurements never permit a start.
 */
export function renderFrontierAllowsStart(input: RenderFrontierInput): boolean {
  const { frontierSeconds: f, runSeconds: total, marginSeconds: margin } = input;
  if (f >= total) return true;
  const cost = input.wallSecondsPerMusicSecond * input.safetyFactor;
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(f) || !Number.isFinite(total)) return false;
  const required = Math.max(margin, ((cost - 1) * total + margin) / cost);
  return f >= required;
}
