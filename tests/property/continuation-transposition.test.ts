/**
 * Transposition metamorphic law: transposing the context transposes every
 * option with it. Pitch classes must match exactly under rotation; spelling
 * follows the engine's frozen key-evidence preference, so the invariant is
 * asserted on pitch-class content plus quality plus category, never on the
 * accidental a different key legitimately respells.
 */
import { describe, expect, test } from "bun:test";

import { pitchClassOf, type ChordSpec } from "../../src/domain";
import {
  deriveContinuationSuggestions,
  parseChordSymbol,
  resolutionOperations,
} from "../../src/theory";

const FLAT_NAMES = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
] as const;

/** The reference context, spelled at pitch class 0: a plain major ii–V. */
const REFERENCE_ROOT_OFFSETS = [2, 7] as const;
const REFERENCE_QUALITIES = ["m7", "7"] as const;

function mustParse(sourceText: string): ChordSpec {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) throw new Error(`test symbol did not parse: ${sourceText}`);
  return parsed.chord;
}

function contextAt(transposition: number): readonly ChordSpec[] {
  return REFERENCE_ROOT_OFFSETS.map((offset, index) => {
    const pc = (offset + transposition) % 12;
    const quality = REFERENCE_QUALITIES[index] ?? "7";
    return mustParse(`${FLAT_NAMES[pc] ?? "C"}${quality}`);
  });
}

type Signature = Readonly<{
  relativePc: number;
  quality: string;
  category: string;
  providerId: string;
}>;

function signatures(
  context: readonly ChordSpec[],
  transposition: number,
): readonly Signature[] {
  const result = deriveContinuationSuggestions(
    { context },
    resolutionOperations,
  );
  return result.suggestions.map((entry) => {
    const spec = mustParse(entry.symbolText);
    const rootPc = pitchClassOf(spec.root);
    const quality = entry.symbolText.replace(/^[A-G][b#]?/, "");
    return Object.freeze({
      relativePc: ((rootPc - transposition) % 12 + 12) % 12,
      quality,
      category: entry.category,
      providerId: entry.explanation.providerId,
    });
  });
}

describe("continuation transposition laws", () => {
  const reference = signatures(contextAt(0), 0);

  test("the reference ii–V yields options at all", () => {
    expect(reference.length).toBeGreaterThan(0);
  });

  for (let transposition = 1; transposition < 12; transposition += 1) {
    test(`transposing the context by ${String(transposition)} semitones transposes every option`, () => {
      const transposed = signatures(
        contextAt(transposition),
        transposition,
      );
      expect(transposed).toEqual(reference);
    });
  }
});
