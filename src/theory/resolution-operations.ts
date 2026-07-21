import { resolveChord } from "./chord-resolution";
import { spellChordDegree } from "./degree-spelling";
import type { ResolutionOperations } from "./resolution-contract";

/** The complete, immutable public T1 resolution operation surface. */
export const resolutionOperations: ResolutionOperations = Object.freeze({
  spellChordDegree,
  resolveChord,
});
