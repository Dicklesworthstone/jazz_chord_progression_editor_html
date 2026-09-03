import {
  type BeatValue,
  type ChordEventId,
  addBeatValues,
  normalizeBeatValue,
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

function scaleBeat(dur: BeatValue, multNum: number, multDen: number): BeatValue {
  const num = dur.numerator * multNum;
  const den = dur.denominator * multDen;
  const res = normalizeBeatValue({ numerator: num, denominator: den });
  if (res.ok) return res.value;
  return dur;
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

  const transformedEvents: TransformedEvent[] = [];
  let currentOffset: BeatValue = beat(0);
  let workSteps = 0;
  const shiftDelta: BeatValue = options?.shiftDelta ?? beat(1);

  if (transformKind === "diminution") {
    // Halve duration of each chord
    for (let i = 0; i < events.length; i++) {
      workSteps++;
      const ev = events[i];
      if (!ev) continue;
      const newDuration = scaleBeat(ev.duration, 1, 2);

      transformedEvents.push({
        eventId: ev.eventId,
        chordSymbol: ev.chordSymbol,
        offsetBeat: currentOffset,
        duration: newDuration,
      });

      const addRes = addBeatValues(currentOffset, newDuration);
      currentOffset = addRes.ok ? addRes.value : currentOffset;
    }
  } else if (transformKind === "augmentation") {
    // Double duration of each chord
    for (let i = 0; i < events.length; i++) {
      workSteps++;
      const ev = events[i];
      if (!ev) continue;
      const newDuration = scaleBeat(ev.duration, 2, 1);

      transformedEvents.push({
        eventId: ev.eventId,
        chordSymbol: ev.chordSymbol,
        offsetBeat: currentOffset,
        duration: newDuration,
      });

      const addRes = addBeatValues(currentOffset, newDuration);
      currentOffset = addRes.ok ? addRes.value : currentOffset;
    }
  } else if (transformKind === "split") {
    // Split each event into 2 equal parts
    for (let i = 0; i < events.length; i++) {
      workSteps++;
      const ev = events[i];
      if (!ev) continue;
      const halfDur = scaleBeat(ev.duration, 1, 2);

      // Part 1
      transformedEvents.push({
        eventId: ev.eventId,
        chordSymbol: ev.chordSymbol,
        offsetBeat: currentOffset,
        duration: halfDur,
      });
      const add1 = addBeatValues(currentOffset, halfDur);
      currentOffset = add1.ok ? add1.value : currentOffset;

      // Part 2
      transformedEvents.push({
        eventId: eventIdOf(`split_${ev.eventId}_part2`),
        chordSymbol: ev.chordSymbol,
        offsetBeat: currentOffset,
        duration: halfDur,
      });
      const add2 = addBeatValues(currentOffset, halfDur);
      currentOffset = add2.ok ? add2.value : currentOffset;
    }
  } else if (transformKind === "anticipation" || transformKind === "metric-displacement") {
    for (const ev of events) {
      workSteps++;
      const shiftRes = addBeatValues(ev.offsetBeat, shiftDelta);
      const newOffset = shiftRes.ok ? shiftRes.value : ev.offsetBeat;
      transformedEvents.push({
        eventId: ev.eventId,
        chordSymbol: ev.chordSymbol,
        offsetBeat: newOffset,
        duration: ev.duration,
      });
    }
  } else {
    // Default pass-through
    for (const ev of events) {
      workSteps++;
      transformedEvents.push({
        eventId: ev.eventId,
        chordSymbol: ev.chordSymbol,
        offsetBeat: ev.offsetBeat,
        duration: ev.duration,
      });
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
