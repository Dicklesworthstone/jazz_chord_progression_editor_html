import { describe, expect, test } from "bun:test";
import {
  type BeatValue,
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import {
  applyRhythmTransform,
  computeTensionCurve,
} from "../../src/theory";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

function beat(numerator: number, denominator = 1): BeatValue {
  const res = normalizeBeatValue({ numerator, denominator });
  if (!res.ok) throw new Error(`Invalid beat: ${String(numerator)}/${String(denominator)}`);
  return res.value;
}

describe("G7 Rhythm Transforms and Tension Curve", () => {
  test("computes tension curve across ii-V-I (Dm7 -> G7 -> Cmaj7)", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e1"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
      { eventId: eventIdOf("e2"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
    ];

    const result = computeTensionCurve(events);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.curve.points.length).toBe(3);
      const dm7Point = result.curve.points[0];
      const g7Point = result.curve.points[1];
      const cmaj7Point = result.curve.points[2];

      expect(dm7Point).toBeDefined();
      expect(g7Point).toBeDefined();
      expect(cmaj7Point).toBeDefined();

      if (dm7Point && g7Point && cmaj7Point) {
        // G7 (dominant) has highest tension, Cmaj7 (tonic) has lowest tension
        expect(g7Point.aggregateTension).toBeGreaterThan(dm7Point.aggregateTension);
        expect(g7Point.aggregateTension).toBeGreaterThan(cmaj7Point.aggregateTension);
        expect(cmaj7Point.aggregateTension).toBeLessThan(dm7Point.aggregateTension);
      }
    }
  });

  test("applies diminution transform halving duration of each chord", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e1"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
    ];

    const result = applyRhythmTransform(events, "diminution");
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.result.transformedEvents.length).toBe(2);
      expect(result.result.transformedEvents[0]?.duration).toEqual(beat(2));
      expect(result.result.transformedEvents[1]?.duration).toEqual(beat(2));
      expect(result.result.totalBeats).toEqual(beat(4));
    }
  });

  test("applies augmentation transform doubling duration of each chord", () => {
    const events = [
      { eventId: eventIdOf("e0"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e1"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
    ];

    const result = applyRhythmTransform(events, "augmentation");
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.result.transformedEvents.length).toBe(2);
      expect(result.result.transformedEvents[0]?.duration).toEqual(beat(8));
      expect(result.result.transformedEvents[1]?.duration).toEqual(beat(8));
      expect(result.result.totalBeats).toEqual(beat(16));
    }
  });

  test("refuses empty events with typed refusal", () => {
    const res1 = computeTensionCurve([]);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.refusal.code).toBe("g7.empty_events");
    }

    const res2 = applyRhythmTransform([], "diminution");
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.refusal.code).toBe("g7.empty_events");
    }
  });
});
