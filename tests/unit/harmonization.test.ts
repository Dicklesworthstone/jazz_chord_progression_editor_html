import { describe, expect, test } from "bun:test";
import {
  type Alteration,
  type BeatValue,
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import { harmonizeConstraints } from "../../src/theory";

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

describe("G4 Constraint Harmonization Workbench", () => {
  test("harmonizes descending melody line E4 -> D4 -> C4", () => {
    const slots = [
      {
        slotIndex: 0,
        eventId: eventIdOf("slot_0"),
        offsetBeat: beat(0),
        duration: beat(4),
        melodyPitch: { step: "E" as const, alter: 0 as Alteration, octave: 4 },
      },
      {
        slotIndex: 1,
        eventId: eventIdOf("slot_1"),
        offsetBeat: beat(4),
        duration: beat(4),
        melodyPitch: { step: "D" as const, alter: 0 as Alteration, octave: 4 },
      },
      {
        slotIndex: 2,
        eventId: eventIdOf("slot_2"),
        offsetBeat: beat(8),
        duration: beat(4),
        melodyPitch: { step: "C" as const, alter: 0 as Alteration, octave: 4 },
      },
    ];

    const result = harmonizeConstraints(slots);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.solutions.length).toBeGreaterThanOrEqual(1);
      const sol = result.solutions[0];
      expect(sol).toBeDefined();
      if (sol) {
        expect(sol.slots.length).toBe(3);
        expect(sol.costs.totalWeightedCost).toBeGreaterThan(0);
      }
    }
  });

  test("harmonizes with pinned chord preservation", () => {
    const slots = [
      {
        slotIndex: 0,
        eventId: eventIdOf("slot_0"),
        offsetBeat: beat(0),
        duration: beat(4),
        melodyPitch: { step: "A" as const, alter: 0 as Alteration, octave: 4 },
      },
      {
        slotIndex: 1,
        eventId: eventIdOf("slot_1"),
        offsetBeat: beat(4),
        duration: beat(4),
        pinnedChordSymbol: "G7",
      },
    ];

    const result = harmonizeConstraints(slots);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.solutions.length).toBeGreaterThanOrEqual(1);
      const sol = result.solutions[0];
      expect(sol?.slots[1]?.chordSymbol).toBe("G7");
    }
  });

  test("refuses empty slots with typed refusal", () => {
    const result = harmonizeConstraints([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g4.empty_slots");
    }
  });

  test("refuses slots exceeding limit of 16", () => {
    const hugeSlots = Array.from({ length: 17 }, (_, i) => ({
      slotIndex: i,
      eventId: eventIdOf(`slot_${String(i)}`),
      offsetBeat: beat(i * 4),
      duration: beat(4),
      melodyPitch: { step: "C" as const, alter: 0, octave: 4 },
    }));

    const result = harmonizeConstraints(hugeSlots);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g4.slots_exceeded");
    }
  });
});
