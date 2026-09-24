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
    /* not.toBeNull: toBeDefined() accepted null, so this test passed while
       the detector missed every deceptive cadence. */
    expect(cad).not.toBeNull();
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

  test("V7 to vi is deceptive in every key; the major-chord near-miss is not", () => {
    /* Hand-authored: vi sits a whole step above V (G7 -> Am, D7 -> Bm). */
    const roots = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    roots.forEach((root, index) => {
      const vi = roots[(index + 2) % 12] ?? "D";
      const cad = detectCadence(`${root}7`, `${vi}m`, eventIdOf("a"), eventIdOf("b"));
      expect(`${root}7->${vi}m: ${cad?.cadenceType ?? "none"}`).toBe(`${root}7->${vi}m: deceptive`);
      /* Near-miss: the same motion onto a major chord is not deceptive. */
      expect(detectCadence(`${root}7`, `${vi}maj7`, eventIdOf("a"), eventIdOf("b"))?.cadenceType).not.toBe("deceptive");
    });
    /* The old +9 motion (G7 -> Em) is not a deceptive cadence. */
    expect(detectCadence("G7", "Em", eventIdOf("a"), eventIdOf("b"))?.cadenceType ?? null).not.toBe("deceptive");
  });
});
