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
