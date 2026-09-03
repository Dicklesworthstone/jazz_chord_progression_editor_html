import { describe, expect, test } from "bun:test";
import {
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import { analyzeTonalJourney } from "../../src/theory/tonal-journey";
import { spelledPitchClassToString } from "../../src/theory/guide-tones";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

function beat(numerator: number, denominator = 1) {
  const res = normalizeBeatValue({ numerator, denominator });
  if (!res.ok) throw new Error(`Invalid beat: ${String(numerator)}/${String(denominator)}`);
  return res.value;
}

describe("G0 Tonal Journey Engine", () => {
  test("analyzes monotonal diatonic ii-V-I in C major", () => {
    const events = [
      { eventId: eventIdOf("e1"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e2"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
      { eventId: eventIdOf("e3"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
    ];

    const result = analyzeTonalJourney(events);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.paths.length).toBeGreaterThanOrEqual(1);
      const path = result.paths[0];
      expect(path).toBeDefined();
      if (path) {
        expect(path.isDiatonicThroughout).toBe(true);
        expect(path.modulationsCount).toBe(0);
        expect(path.keyAreas.length).toBe(1);
        const area = path.keyAreas[0];
        expect(area).toBeDefined();
        if (area) {
          expect(spelledPitchClassToString(area.keyContext.tonic)).toBe("C");
          expect(area.keyContext.mode).toBe("major");
        }
      }
    }
  });

  test("analyzes direct modulation from C major to F major", () => {
    const events = [
      { eventId: eventIdOf("e1"), chordSymbol: "Dm7", offsetBeat: beat(0), duration: beat(4) },
      { eventId: eventIdOf("e2"), chordSymbol: "G7", offsetBeat: beat(4), duration: beat(4) },
      { eventId: eventIdOf("e3"), chordSymbol: "Cmaj7", offsetBeat: beat(8), duration: beat(4) },
      { eventId: eventIdOf("e4"), chordSymbol: "Gm7", offsetBeat: beat(12), duration: beat(4) },
      { eventId: eventIdOf("e5"), chordSymbol: "C7", offsetBeat: beat(16), duration: beat(4) },
      { eventId: eventIdOf("e6"), chordSymbol: "Fmaj7", offsetBeat: beat(20), duration: beat(4) },
    ];

    const result = analyzeTonalJourney(events);
    expect(result.ok).toBe(true);

    if (result.ok) {
      const path = result.paths[0];
      expect(path).toBeDefined();
      if (path) {
        expect(path.modulationsCount).toBeGreaterThanOrEqual(1);
        expect(path.keyAreas.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("refuses empty progression with typed refusal", () => {
    const result = analyzeTonalJourney([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g0.empty_progression");
    }
  });

  test("refuses invalid chord with typed refusal", () => {
    const events = [
      { eventId: eventIdOf("e1"), chordSymbol: "CorruptedChord!!@#", offsetBeat: beat(0), duration: beat(4) },
    ];
    const result = analyzeTonalJourney(events);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g0.invalid_chord");
    }
  });
});
