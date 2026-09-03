import { describe, expect, test } from "bun:test";
import { type ChordEventId, parseStableId } from "../../src/domain";
import {
  classifyGuideToneMotion,
  extractEventGuideTones,
  optimizeGuideTonePaths,
  spelledPitchClassToString,
} from "../../src/theory/guide-tones";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

describe("G6 Guide-Tone Engine", () => {
  describe("extractEventGuideTones", () => {
    test("extracts 3rd and 7th from major 7th chord (Cmaj7)", () => {
      const eventId = eventIdOf("event_1");
      const ext = extractEventGuideTones("Cmaj7", eventId);
      expect(ext.guideTones.length).toBe(2);
      expect(ext.hasThirdOrSuspension).toBe(true);
      expect(ext.hasSeventh).toBe(true);
      expect(ext.isCompleteGuidePair).toBe(true);

      const third = ext.guideTones.find((g) => g.role === "third");
      const seventh = ext.guideTones.find((g) => g.role === "seventh");
      expect(third).toBeDefined();
      expect(seventh).toBeDefined();
      if (third && seventh) {
        expect(spelledPitchClassToString(third.spelledPitchClass)).toBe("E");
        expect(third.degree).toEqual({ number: 3, alter: 0 });
        expect(spelledPitchClassToString(seventh.spelledPitchClass)).toBe("B");
        expect(seventh.degree).toEqual({ number: 7, alter: 0 });
      }
    });

    test("extracts b3 and b7 from minor 7th chord (Dm7)", () => {
      const eventId = eventIdOf("event_2");
      const ext = extractEventGuideTones("Dm7", eventId);
      expect(ext.guideTones.length).toBe(2);
      const third = ext.guideTones.find((g) => g.role === "third");
      const seventh = ext.guideTones.find((g) => g.role === "seventh");
      expect(third).toBeDefined();
      expect(seventh).toBeDefined();
      if (third && seventh) {
        expect(spelledPitchClassToString(third.spelledPitchClass)).toBe("F");
        expect(third.degree).toEqual({ number: 3, alter: -1 });
        expect(spelledPitchClassToString(seventh.spelledPitchClass)).toBe("C");
        expect(seventh.degree).toEqual({ number: 7, alter: -1 });
      }
    });

    test("extracts 3 and b7 from dominant 7th chord (G7) with tendency markers", () => {
      const eventId = eventIdOf("event_3");
      const ext = extractEventGuideTones("G7", eventId);
      const third = ext.guideTones.find((g) => g.role === "third");
      const seventh = ext.guideTones.find((g) => g.role === "seventh");
      expect(third).toBeDefined();
      expect(seventh).toBeDefined();
      if (third && seventh) {
        expect(spelledPitchClassToString(third.spelledPitchClass)).toBe("B");
        expect(third.isTendencyTone).toBe(true);
        expect(spelledPitchClassToString(seventh.spelledPitchClass)).toBe("F");
        expect(seventh.isTendencyTone).toBe(true);
      }
    });

    test("extracts 4 (suspension) and b7 from sus chord (G7sus4)", () => {
      const eventId = eventIdOf("event_4");
      const ext = extractEventGuideTones("G7sus4", eventId);
      const sus = ext.guideTones.find((g) => g.role === "suspension");
      const seventh = ext.guideTones.find((g) => g.role === "seventh");
      expect(sus).toBeDefined();
      expect(seventh).toBeDefined();
      if (sus && seventh) {
        expect(spelledPitchClassToString(sus.spelledPitchClass)).toBe("C");
        expect(sus.degree).toEqual({ number: 4, alter: 0 });
        expect(spelledPitchClassToString(seventh.spelledPitchClass)).toBe("F");
      }
    });

    test("extracts b3, b7, and b5 from half-diminished chord (Dm7b5)", () => {
      const eventId = eventIdOf("event_5");
      const ext = extractEventGuideTones("Dm7b5", eventId);
      expect(ext.guideTones.length).toBe(3);
      const essential = ext.guideTones.find((g) => g.role === "essential-color");
      expect(essential).toBeDefined();
      if (essential) {
        expect(spelledPitchClassToString(essential.spelledPitchClass)).toBe("Ab");
        expect(essential.degree).toEqual({ number: 5, alter: -1 });
      }
    });
  });

  describe("classifyGuideToneMotion", () => {
    test("detects common tone when pitch stays identical (F to F)", () => {
      const p1 = extractEventGuideTones("Dm7", eventIdOf("e1")).guideTones[0]?.spelledPitchClass;
      const p2 = extractEventGuideTones("G7", eventIdOf("e2")).guideTones[1]?.spelledPitchClass;
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      if (p1 && p2) {
        const motion = classifyGuideToneMotion(p1, p2, { number: 3, alter: -1 }, { number: 7, alter: -1 }, "third", "seventh");
        expect(motion.motion).toBe("common-tone");
        expect(motion.semitones).toBe(0);
      }
    });

    test("detects step resolution when 7th falls by half-step (F to E in G7 -> Cmaj7)", () => {
      const p1 = extractEventGuideTones("G7", eventIdOf("e1")).guideTones[1]?.spelledPitchClass;
      const p2 = extractEventGuideTones("Cmaj7", eventIdOf("e2")).guideTones[0]?.spelledPitchClass;
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      if (p1 && p2) {
        const motion = classifyGuideToneMotion(p1, p2, { number: 7, alter: -1 }, { number: 3, alter: 0 }, "seventh", "third");
        expect(motion.motion).toBe("step-resolution");
        expect(motion.semitones).toBe(-1);
        expect(motion.isTendencyResolution).toBe(true);
      }
    });
  });

  describe("optimizeGuideTonePaths", () => {
    test("finds optimal smooth 2-voice path through standard ii-V-I (Dm7 -> G7 -> Cmaj7)", () => {
      const events = [
        { eventId: eventIdOf("e1"), chordSymbol: "Dm7" },
        { eventId: eventIdOf("e2"), chordSymbol: "G7" },
        { eventId: eventIdOf("e3"), chordSymbol: "Cmaj7" },
      ];
      const result = optimizeGuideTonePaths(events);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.paths.length).toBeGreaterThanOrEqual(1);
        const best = result.paths[0];
        expect(best?.lines.length).toBe(2);
        expect(best?.totalMotionCost).toBeLessThanOrEqual(4);
        expect(best?.hasCrossings).toBe(false);
      }
    });

    test("refuses empty progression with typed refusal", () => {
      const result = optimizeGuideTonePaths([]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe("g6.empty_progression");
      }
    });
  });
});
