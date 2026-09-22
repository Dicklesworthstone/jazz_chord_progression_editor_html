import type { TransposeProgressionResult } from "../../src/theory/spelled-transposition-contract";

/**
 * The transposed chords of a successful progression transposition. A refusal
 * throws, so a test that expects chords can never pass on a refused input.
 */
export function transposedChords(result: TransposeProgressionResult): readonly string[] {
  if (!result.ok) {
    throw new Error(`transposition refused: ${JSON.stringify(result.refusals)}`);
  }
  return result.transposedChords;
}
