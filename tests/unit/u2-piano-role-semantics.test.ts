import { describe, expect, test } from "bun:test";
import type { SpelledPitch } from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";
import { projectChordInspectorViewModel } from "../../src/application/chord-inspector";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";

// Hand-written spellings and MIDI coordinates, including an enharmonic octave
// crossing and a double sharp. No production formatter supplies expectations.
const cases: readonly Readonly<{ symbol: string; notes: readonly SpelledPitch[];
  labels: readonly (readonly [number, string])[] }>[] = [
  { symbol: "G7(b9,#11)", notes: [
    { step: "G", alter: 0, octave: 3 }, { step: "B", alter: 0, octave: 3 },
    { step: "F", alter: 0, octave: 4 }, { step: "A", alter: -1, octave: 4 },
    { step: "C", alter: 1, octave: 5 },
  ], labels: [[68, "Ab4, Flat Ninth Tension"], [73, "C#5, Sharp Eleventh Tension"]] },
  { symbol: "Bb7(b9,#11)", notes: [
    { step: "B", alter: -1, octave: 3 }, { step: "D", alter: 0, octave: 4 },
    { step: "A", alter: -1, octave: 4 }, { step: "C", alter: -1, octave: 5 },
    { step: "E", alter: 0, octave: 5 },
  ], labels: [[71, "Cb5, Flat Ninth Tension"], [76, "E5, Sharp Eleventh Tension"]] },
  { symbol: "F#7#9", notes: [
    { step: "F", alter: 1, octave: 4 }, { step: "A", alter: 1, octave: 4 },
    { step: "E", alter: 0, octave: 5 }, { step: "G", alter: 2, octave: 5 },
  ], labels: [[81, "G##5, Sharp Ninth Tension"]] },
];

function piano(symbol: string, notes: readonly SpelledPitch[]) {
  const parsed = parseChordSymbol(symbol, "ascii");
  if (!parsed.ok) throw new Error("Invalid independently written symbol");
  const state = inspectorState(inspectorEvent({ id: "u2-piano-roles", chord: parsed.chord,
    annotation: "", voicing: { mode: "manual", bassPolicy: "included", pitches: notes } }));
  const before = JSON.stringify(state);
  const view = projectChordInspectorViewModel(state);
  expect(JSON.stringify(state)).toBe(before);
  expect(view.voicing.activePitches).toEqual(notes);
  return view.piano;
}

describe("U2 piano communicates the actual spelled degree", () => {
  for (const row of cases) test(row.symbol, () => {
    const view = piano(row.symbol, row.notes);
    for (const [midi, label] of row.labels) {
      expect(view.keys[midi]?.accessibleLabel).toBe(label);
      expect(view.keys[midi]?.role).toBe("tension");
      // The same pitch class in an unvoiced octave must not claim a role.
      expect(view.keys[midi - 24]?.role).toBeNull();
      expect(view.keys[midi - 24]?.accessibleLabel).not.toContain("Tension");
    }
  });

  test("an included slash bass outside the chord formula retains its spelling and bass role", () => {
    const view = piano("Cmaj7/Db", [
      { step: "D", alter: -1, octave: 3 }, { step: "C", alter: 0, octave: 4 },
      { step: "E", alter: 0, octave: 4 }, { step: "G", alter: 0, octave: 4 },
      { step: "B", alter: 0, octave: 4 },
    ]);
    expect(view.keys[49]).toMatchObject({ role: "bass", isBass: true,
      accessibleLabel: "Db3, Bass Note", spelling: { step: "D", alter: -1, octave: 3 } });
    expect(view.keys[61]?.role).toBeNull();
    expect(view.keys[67]?.accessibleLabel).toBe("G4, Perfect Fifth");
  });

  test("enharmonic bass and tension occurrences at one MIDI coordinate keep distinct spelled roles", () => {
    const view = piano("G7(b9,#11)/Db", [
      { step: "D", alter: -1, octave: 3 }, { step: "C", alter: 1, octave: 3 },
      { step: "G", alter: 0, octave: 3 },
      { step: "B", alter: 0, octave: 3 }, { step: "F", alter: 0, octave: 4 },
      { step: "A", alter: -1, octave: 4 }, { step: "C", alter: 1, octave: 5 },
    ]);
    expect(view.keys[49]?.accessibleLabel).toBe("Db3, Bass Note; C#3, Sharp Eleventh Tension");
    expect(view.keys[49]?.role).toBe("bass");
    expect(view.keys[73]?.accessibleLabel).toBe("C#5, Sharp Eleventh Tension");
    expect(view.keys[73]?.role).toBe("tension");
  });
});
