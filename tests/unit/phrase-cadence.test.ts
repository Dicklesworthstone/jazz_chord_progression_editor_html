import { describe, expect, test } from "bun:test";
import { type ChordEventId, parseStableId } from "../../src/domain";
import { detectCadence } from "../../src/theory/phrase-cadence";

function eventIdOf(wire: string): ChordEventId {
  const res = parseStableId("event", wire);
  if (!res.ok) throw new Error(`Invalid event id: ${wire}`);
  return res.value;
}

describe("G0 Phrase and Cadence Engine", () => {
  test("detects perfect authentic cadence (G7 -> Cmaj7)", () => {
    const e1 = eventIdOf("e1");
    const e2 = eventIdOf("e2");
    const cad = detectCadence("G7", "Cmaj7", e1, e2);
    expect(cad).toBeDefined();
    if (cad) {
      expect(cad.cadenceType).toBe("perfect-authentic");
      expect(cad.status).toBe("closed");
      expect(cad.harmonicStrength).toBe(100);
    }
  });

  test("detects backdoor cadence (Bb7 -> Cmaj7)", () => {
    const e1 = eventIdOf("e1");
    const e2 = eventIdOf("e2");
    const cad = detectCadence("Bb7", "Cmaj7", e1, e2);
    expect(cad).toBeDefined();
    if (cad) {
      expect(cad.cadenceType).toBe("backdoor");
      expect(cad.status).toBe("supported");
      expect(cad.harmonicStrength).toBe(90);
    }
  });

  test("detects deceptive cadence (G7 -> Am7)", () => {
    const e1 = eventIdOf("e1");
    const e2 = eventIdOf("e2");
    const cad = detectCadence("G7", "Am7", e1, e2);
    expect(cad).toBeDefined();
    if (cad) {
      expect(cad.cadenceType).toBe("deceptive");
      expect(cad.status).toBe("supported");
      expect(cad.harmonicStrength).toBe(85);
    }
  });

  test("detects half cadence (Dm7 -> G7)", () => {
    const e1 = eventIdOf("e1");
    const e2 = eventIdOf("e2");
    const cad = detectCadence("Dm7", "G7", e1, e2);
    expect(cad).toBeDefined();
    if (cad) {
      expect(cad.cadenceType).toBe("half");
      expect(cad.status).toBe("supported");
      expect(cad.harmonicStrength).toBe(80);
    }
  });

  test("detects plagal cadence (Fmaj7 -> Cmaj7)", () => {
    const e1 = eventIdOf("e1");
    const e2 = eventIdOf("e2");
    const cad = detectCadence("Fmaj7", "Cmaj7", e1, e2);
    expect(cad).toBeDefined();
    if (cad) {
      expect(cad.cadenceType).toBe("plagal");
      expect(cad.status).toBe("supported");
      expect(cad.harmonicStrength).toBe(70);
    }
  });

  test("rejects non-cadential sequential progressions", () => {
    const e1 = eventIdOf("e1");
    const e2 = eventIdOf("e2");
    const cad = detectCadence("Em7", "A7", e1, e2);
    expect(cad).toBeNull();
  });
});
