import { describe, expect, test } from "bun:test";

import { makeCustomChordSpec } from "../../src/domain";
import {
  parseChordSymbol,
  resolutionOperations,
  resolveChord,
  spellChordDegree,
} from "../../src/theory";

function expectDeeplyFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeeplyFrozen(child, seen);
}

function parseSource(sourceText: string) {
  const parsed = parseChordSymbol(sourceText, "ascii");
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(`fixture ${sourceText} did not parse`);
  return parsed.chord;
}

describe("T1 public theory package integration", () => {
  test("publishes one immutable operation surface with exact function identity", () => {
    expect(Object.isFrozen(resolutionOperations)).toBe(true);
    expect(Object.keys(resolutionOperations)).toEqual([
      "spellChordDegree",
      "resolveChord",
    ]);
    expect(resolutionOperations.spellChordDegree).toBe(spellChordDegree);
    expect(resolutionOperations.resolveChord).toBe(resolveChord);
  });

  test("keeps directed seventh spelling and slash bass separate from membership", () => {
    const source = parseSource("Db7/Ab");
    const sourceSnapshot = JSON.stringify(source);
    const resolved = resolveChord(source);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.realizations).toHaveLength(1);
    expect(resolved.value.realizations[0].spelledPitchNames).toEqual([
      { step: "D", alter: -1 },
      { step: "F", alter: 0 },
      { step: "A", alter: -1 },
      { step: "C", alter: -1 },
    ]);
    expect(resolved.value.realizations[0].pitchClasses).toEqual([1, 5, 8, 11]);
    expect(resolved.value.bass).toEqual({ step: "A", alter: -1 });
    // The slash bass may equal a chord member by value, but remains a separate
    // fact and must never be inserted as another realization record.
    expect(resolved.value.realizations[0].degrees).toHaveLength(4);
    expect(resolved.value.bass).not.toBe(
      resolved.value.realizations[0].spelledPitchNames[2],
    );
    expect(JSON.stringify(source)).toBe(sourceSnapshot);
    expectDeeplyFrozen(resolved);
  });

  test("exposes all four altered-dominant interpretations without choosing one", () => {
    const resolved = resolveChord(parseSource("C7alt"));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(resolved.value.realizations.map(({ id }) => id)).toEqual([
      "alt-b9-b5",
      "alt-b9-sharp5",
      "alt-sharp9-b5",
      "alt-sharp9-sharp5",
    ]);
    for (const realization of resolved.value.realizations) {
      expect(realization.degrees.some(({ number, alter }) =>
        (number === 5 || number === 9) && alter === 0,
      )).toBe(false);
      expect(realization.guideToneDegrees).toEqual([
        { number: 3, alter: 0 },
        { number: 7, alter: -1 },
      ]);
    }
  });

  test("projects custom pitches mechanically while preserving order and duplicates", () => {
    const source = makeCustomChordSpec({
      kind: "custom",
      sourceText: "C-G-C-Eb",
      label: "ordered custom",
      pitchNames: [
        { step: "C", alter: 0 },
        { step: "G", alter: 0 },
        { step: "C", alter: 0 },
        { step: "E", alter: -1 },
      ],
      bass: { step: "B", alter: -1 },
    });
    expect(source.ok).toBe(true);
    if (!source.ok) return;

    const resolved = resolveChord(source.value);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const realization = resolved.value.realizations[0];
    expect(realization.spelledPitchNames).toEqual(source.value.pitchNames);
    expect(realization.pitchClasses).toEqual([0, 7, 0, 3]);
    expect(realization.degrees).toBeNull();
    expect(realization.requiredDegrees).toBeNull();
    expect(realization.optionalDegrees).toBeNull();
    expect(realization.guideToneDegrees).toBeNull();
    expect(resolved.value.bass).toEqual({ step: "B", alter: -1 });
    expectDeeplyFrozen(resolved);
  });

  test("refuses a directed spelling that would require a triple accidental", () => {
    const result = spellChordDegree(
      { step: "E", alter: 2 },
      { number: 3, alter: 0 },
    );
    expect(result).toEqual({
      ok: false,
      refusal: {
        code: "theory.spelling_accidental_out_of_range",
        path: ["degree"],
        phase: "spelling",
        degreeSpellingPolicyId: "changes.degree-spelling",
        degreeSpellingPolicyVersion: 1,
        root: { step: "E", alter: 2 },
        degree: { number: 3, alter: 0 },
        requiredAlteration: 3,
        minimum: -2,
        maximum: 2,
      },
    });
    expectDeeplyFrozen(result);
  });
});
