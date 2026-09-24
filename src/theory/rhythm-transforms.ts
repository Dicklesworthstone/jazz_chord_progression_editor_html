import {
  type BeatValue,
  type ChordEventId,
  addBeatValues,
  normalizeBeatValue,
  subtractBeatValues,
  parseStableId,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type G7TensionResult,
  type G7TransformResult,
  type RhythmTransformKind,
  type RhythmTransformOptions,
  type TensionCurveOptions,
  type TensionPoint,
  type TransformedEvent,
  G7_RHYTHM_TRANSFORM_SCHEMA,
  G7_TENSION_CURVE_SCHEMA,
  MAX_G7_PROGRESSION_EVENTS,
} from "./rhythm-transforms-contract";
import { parseChordSymbol } from "./chord-symbol";

const RHYTHM_TRANSFORM_KINDS: readonly RhythmTransformKind[] = [
  "anticipation", "delay", "split", "merge", "augmentation", "diminution", "metric-displacement",
];

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

function beat(numerator: number, denominator = 1): BeatValue {
  const res = normalizeBeatValue({ numerator, denominator });
  if (!res.ok) throw new Error(`Invalid beat value: ${String(numerator)}/${String(denominator)}`);
  return res.value;
}

/** Exact scaling; null when the result leaves the supported beat grid. */
function scaleBeat(dur: BeatValue, multNum: number, multDen: number): BeatValue | null {
  const res = normalizeBeatValue({ numerator: dur.numerator * multNum, denominator: dur.denominator * multDen });
  return res.ok ? res.value : null;
}

function addBeat(left: BeatValue, right: BeatValue): BeatValue | null {
  const res = addBeatValues(left, right);
  return res.ok ? res.value : null;
}

function subtractBeat(left: BeatValue, right: BeatValue): BeatValue | null {
  const res = subtractBeatValues(left, right);
  return res.ok && res.value.numerator >= 0 ? res.value : null;
}

export function computeTensionCurve(
  events: readonly {
    eventId: ChordEventId;
    chordSymbol: string;
    offsetBeat: BeatValue;
    duration: BeatValue;
  }[],
  options?: TensionCurveOptions,
): G7TensionResult {
  if (events.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "g7.empty_events",
        message: "Events array cannot be empty",
      },
    };
  }

  if (events.length > MAX_G7_PROGRESSION_EVENTS) {
    return {
      ok: false,
      refusal: {
        code: "g7.events_exceeded",
        message: `Events length ${String(events.length)} exceeds limit of ${String(MAX_G7_PROGRESSION_EVENTS)}`,
      },
    };
  }

  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";
  const points: TensionPoint[] = [];
  let totalTensionSum = 0;
  let workSteps = 0;

  for (let i = 0; i < events.length; i++) {
    workSteps++;
    const ev = events[i];
    if (!ev) continue;

    const parsed = parseChordSymbol(ev.chordSymbol, accidentalStyle);
    if (!parsed.ok) {
      return {
        ok: false,
        refusal: {
          code: "g7.invalid_chord",
          message: `Invalid chord symbol: ${ev.chordSymbol}`,
          eventId: ev.eventId,
        },
      };
    }

    const chord = parsed.chord;
    const isDominant = chord.seventh === "minor" && (chord.triad === "major" || chord.triad === "sus4");
    const isTonic = chord.seventh === "major" && chord.triad === "major";
    const isMinor = chord.triad === "minor";

    const functionalTension = isDominant ? 90 : isMinor ? 50 : isTonic ? 15 : 40;
    const dissonanceTension = isDominant ? 85 : isMinor ? 40 : isTonic ? 25 : 35;
    const voiceMotionTension = i > 0 ? 60 : 30;
    const registerTension = 50;

    const durBeats = ev.duration.numerator / ev.duration.denominator;
    const harmonicRhythmTension = durBeats <= 2 ? 75 : durBeats <= 4 ? 45 : 20;
    const contextConfidence = 85;

    const aggregateTension = Math.round(
      functionalTension * 0.35 +
      dissonanceTension * 0.25 +
      voiceMotionTension * 0.15 +
      registerTension * 0.05 +
      harmonicRhythmTension * 0.15 +
      contextConfidence * 0.05,
    );

    totalTensionSum += aggregateTension;

    points.push({
      eventId: ev.eventId,
      offsetBeat: ev.offsetBeat,
      duration: ev.duration,
      chordSymbol: ev.chordSymbol,
      functionalTension,
      dissonanceTension,
      voiceMotionTension,
      registerTension,
      harmonicRhythmTension,
      contextConfidence,
      aggregateTension,
    });
  }

  const allAggregates = points.map((p) => p.aggregateTension);
  const minTension = Math.min(...allAggregates);
  const maxTension = Math.max(...allAggregates);
  const meanTension = Math.round(totalTensionSum / points.length);

  return {
    ok: true,
    curve: {
      schema: G7_TENSION_CURVE_SCHEMA,
      points,
      minTension,
      maxTension,
      meanTension,
    },
    workSteps,
  };
}

export function applyRhythmTransform(
  events: readonly {
    eventId: ChordEventId;
    chordSymbol: string;
    offsetBeat: BeatValue;
    duration: BeatValue;
  }[],
  transformKind: RhythmTransformKind,
  options?: RhythmTransformOptions,
): G7TransformResult {
  if (events.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "g7.empty_events",
        message: "Events array cannot be empty",
      },
    };
  }

  if (events.length > MAX_G7_PROGRESSION_EVENTS) {
    return {
      ok: false,
      refusal: {
        code: "g7.events_exceeded",
        message: `Events count ${String(events.length)} exceeds limit of ${String(MAX_G7_PROGRESSION_EVENTS)}`,
      },
    };
  }

  /* Untyped callers: an unknown kind refuses instead of falling through. */
  if (!(RHYTHM_TRANSFORM_KINDS as readonly string[]).includes(transformKind)) {
    return {
      ok: false,
      refusal: { code: "g7.unsupported_transform", message: `Unsupported rhythm transform ${transformKind}` },
    };
  }
  const transformedEvents: TransformedEvent[] = [];
  let currentOffset: BeatValue = beat(0);
  let workSteps = 0;
  const shiftDelta: BeatValue = options?.shiftDelta ?? beat(1);
  /* Exact rational time or an explicit refusal: no arithmetic failure may
     keep the old value and still report success. */
  const unrepresentable = (what: string): G7TransformResult => ({
    ok: false,
    refusal: { code: "g7.invalid_duration", message: `${what} is outside the supported exact beat grid` },
  });
  const push = (eventId: ChordEventId, chordSymbol: string, offsetBeat: BeatValue, duration: BeatValue): boolean => {
    transformedEvents.push({ eventId, chordSymbol, offsetBeat, duration });
    const end = addBeat(offsetBeat, duration);
    if (end === null) return false;
    if (end.numerator * currentOffset.denominator > currentOffset.numerator * end.denominator) currentOffset = end;
    return true;
  };

  if (transformKind === "diminution" || transformKind === "augmentation" || transformKind === "split") {
    /* Re-lay the events end to end from beat 0 at their new lengths. */
    let cursor: BeatValue = beat(0);
    for (const ev of events) {
      workSteps++;
      const scaled = transformKind === "augmentation" ? scaleBeat(ev.duration, 2, 1) : scaleBeat(ev.duration, 1, 2);
      if (scaled === null) return unrepresentable(`The ${transformKind} of ${ev.chordSymbol}`);
      const parts = transformKind === "split" ? [ev.eventId, eventIdOf(`split_${ev.eventId}_part2`)] : [ev.eventId];
      for (const id of parts) {
        if (!push(id, ev.chordSymbol, cursor, scaled)) return unrepresentable("The transformed timeline");
        const next = addBeat(cursor, scaled);
        if (next === null) return unrepresentable("The transformed timeline");
        cursor = next;
      }
    }
  } else if (transformKind === "delay" || transformKind === "metric-displacement" || transformKind === "anticipation") {
    /* Delay and displacement move every event later by shiftDelta;
       anticipation moves it earlier and refuses before beat 0. */
    for (const ev of events) {
      workSteps++;
      const moved = transformKind === "anticipation" ? subtractBeat(ev.offsetBeat, shiftDelta) : addBeat(ev.offsetBeat, shiftDelta);
      if (moved === null) return unrepresentable(`Shifting ${ev.chordSymbol}`);
      if (!push(ev.eventId, ev.chordSymbol, moved, ev.duration)) return unrepresentable("The shifted timeline");
    }
  } else {
    /* Merge consecutive repeats of the same chord into one event whose
       duration is their exact sum; distinct neighbours are left as they are. */
    for (const ev of events) {
      workSteps++;
      const previous = transformedEvents[transformedEvents.length - 1];
      if (previous !== undefined && previous.chordSymbol === ev.chordSymbol) {
        const joined = addBeat(previous.duration, ev.duration);
        if (joined === null) return unrepresentable(`Merging ${ev.chordSymbol}`);
        transformedEvents[transformedEvents.length - 1] = { ...previous, duration: joined };
        const end = addBeat(previous.offsetBeat, joined);
        if (end === null) return unrepresentable("The merged timeline");
        currentOffset = end;
      } else if (!push(ev.eventId, ev.chordSymbol, ev.offsetBeat, ev.duration)) {
        return unrepresentable("The merged timeline");
      }
    }
  }

  return {
    ok: true,
    result: {
      schema: G7_RHYTHM_TRANSFORM_SCHEMA,
      transformKind,
      transformedEvents,
      totalBeats: currentOffset,
      description: `Applied ${transformKind} across ${String(events.length)} event(s)`,
    },
    workSteps,
  };
}
