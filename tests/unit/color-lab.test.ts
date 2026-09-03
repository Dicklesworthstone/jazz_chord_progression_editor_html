import { describe, expect, test } from "bun:test";
import { type ChordEventId, parseStableId } from "../../src/domain";
import { deriveContextualColor } from "../../src/theory/color-lab";
import { spelledPitchClassToString } from "../../src/theory/guide-tones";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

describe("G6 Color Laboratory Engine", () => {
  test("derives Mixolydian, Lydian Dominant, and Altered options for dominant 7th (C7)", () => {
    const eventId = eventIdOf("event_c7");
    const result = deriveContextualColor("C7", eventId);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.colorOptions.length).toBeGreaterThanOrEqual(3);

      const mixo = result.colorOptions.find((o) => o.family === "diatonic-extension");
      expect(mixo).toBeDefined();
      expect(mixo?.tensions).toEqual(["9", "13"]);

      const lydDom = result.colorOptions.find((o) => o.family === "lydian-dominant");
      expect(lydDom).toBeDefined();
      expect(lydDom?.tensions).toContain("#11");

      const alt = result.colorOptions.find((o) => o.family === "altered-dominant");
      expect(alt).toBeDefined();
      expect(alt?.tensions).toEqual(["b9", "#9", "#11", "b13"]);
      expect(alt?.omittedDegrees).toEqual([{ number: 5, alter: 0 }]);
    }
  });

  test("derives Upper Structure Triads for dominant 7th (C7)", () => {
    const eventId = eventIdOf("event_c7_ust");
    const result = deriveContextualColor("C7", eventId);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.upperStructureOptions.length).toBeGreaterThanOrEqual(5);

      const ustII = result.upperStructureOptions.find((u) => u.numeralRelation === "II");
      expect(ustII).toBeDefined();
      if (ustII) {
        expect(spelledPitchClassToString(ustII.triadRoot)).toBe("D");
        expect(ustII.resultingTensions).toEqual(["9", "#11", "13"]);
      }

      const ustbVI = result.upperStructureOptions.find((u) => u.numeralRelation === "bVI");
      expect(ustbVI).toBeDefined();
      if (ustbVI) {
        expect(spelledPitchClassToString(ustbVI.triadRoot)).toBe("Ab");
        expect(ustbVI.resultingTensions).toContain("b13");
      }
    }
  });

  test("derives Ionian and Lydian options for major 7th (Cmaj7)", () => {
    const eventId = eventIdOf("event_cmaj7");
    const result = deriveContextualColor("Cmaj7", eventId);
    expect(result.ok).toBe(true);

    if (result.ok) {
      const ionian = result.colorOptions.find((o) => o.compatibleScaleId === "scale.ionian");
      const lydian = result.colorOptions.find((o) => o.compatibleScaleId === "scale.lydian");
      expect(ionian).toBeDefined();
      expect(lydian).toBeDefined();
      expect(lydian?.tensions).toContain("#11");
    }
  });

  test("derives Dorian and Aeolian options for minor 7th (Cm7)", () => {
    const eventId = eventIdOf("event_cm7");
    const result = deriveContextualColor("Cm7", eventId);
    expect(result.ok).toBe(true);

    if (result.ok) {
      const dorian = result.colorOptions.find((o) => o.compatibleScaleId === "scale.dorian");
      expect(dorian).toBeDefined();
      expect(dorian?.tensions).toEqual(["9", "11", "13"]);
    }
  });

  test("refuses invalid chord with typed refusal", () => {
    const eventId = eventIdOf("event_invalid");
    const result = deriveContextualColor("InvalidChord!#$", eventId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g6.invalid_chord");
    }
  });
});
