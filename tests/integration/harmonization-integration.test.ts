import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type Alteration,
  type BeatValue,
  type ChordEventId,
  normalizeBeatValue,
  parseStableId,
} from "../../src/domain";
import {
  harmonizeConstraints,
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

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/harmonization",
);

describe("G4 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent harmonization fixture cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "harmonization-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      cases: Array<{
        id: string;
        name: string;
        slots: Array<{
          slotIndex: number;
          melodyPitch?: { step: "C" | "D" | "E" | "F" | "G" | "A" | "B"; alter: number; octave: number };
          bassPitchClass?: number;
          pinnedChordSymbol?: string;
          expectedChords?: string[];
        }>;
        expectedSolutionProgression?: string[];
      }>;
    };

    for (const testCase of data.cases) {
      const slots = testCase.slots.map((s, idx) => ({
        slotIndex: s.slotIndex,
        eventId: eventIdOf(`evt_${testCase.id}_${String(idx)}`),
        offsetBeat: beat(idx * 4),
        duration: beat(4),
        ...(s.melodyPitch
          ? {
              melodyPitch: {
                step: s.melodyPitch.step,
                alter: s.melodyPitch.alter as Alteration,
                octave: s.melodyPitch.octave,
              },
            }
          : {}),
        ...(s.bassPitchClass !== undefined ? { bassPitchClass: s.bassPitchClass } : {}),
        ...(s.pinnedChordSymbol ? { pinnedChordSymbol: s.pinnedChordSymbol } : {}),
      }));

      const result = harmonizeConstraints(slots);
      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.solutions.length).toBeGreaterThanOrEqual(1);
        const sol = result.solutions[0];
        expect(sol).toBeDefined();
        if (sol && testCase.expectedSolutionProgression) {
          expect(sol.progression).toEqual(testCase.expectedSolutionProgression);
        }
      }
    }
  });

  test("deterministic byte-for-byte reproducibility across runs", () => {
    const slots = [
      {
        slotIndex: 0,
        eventId: eventIdOf("s0"),
        offsetBeat: beat(0),
        duration: beat(4),
        melodyPitch: { step: "E" as const, alter: 0 as Alteration, octave: 4 },
      },
      {
        slotIndex: 1,
        eventId: eventIdOf("s1"),
        offsetBeat: beat(4),
        duration: beat(4),
        melodyPitch: { step: "D" as const, alter: 0 as Alteration, octave: 4 },
      },
    ];

    const run1 = harmonizeConstraints(slots);
    const run2 = harmonizeConstraints(slots);

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  test("correctly identifies unsatisfiable conflicts", () => {
    const slots = [
      {
        slotIndex: 0,
        eventId: eventIdOf("slot_impossible"),
        offsetBeat: beat(0),
        duration: beat(4),
        melodyPitch: { step: "E" as const, alter: 0 as Alteration, octave: 4 },
        bassPitchClass: 6, // F# / Gb bass with E melody -> filtered set empty
      },
    ];

    const result = harmonizeConstraints(slots);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe("g4.unsatisfiable_constraints");
      expect(result.refusal.conflicts?.length).toBeGreaterThanOrEqual(1);
      expect(result.refusal.conflicts?.[0]?.slotIndex).toBe(0);
    }
  });
});
