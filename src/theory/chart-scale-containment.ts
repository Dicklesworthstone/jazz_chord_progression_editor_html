import { pitchClassOf, SPELLING_STEP_ORDER, type ChordSpec } from "../domain";
import type { ResolvedChord } from "./resolution-contract";

// Exact degree classes from the reviewed scale table (H0 section10), plus
// Aeolian already used by chart-annotation. This is only a containment guard
// for one existing suggestion, not H0 option enumeration or clash analysis.
// Compound degrees reduce by seven; their alteration is never respelled.
const SCALES = {
  Ionian: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]],
  Lydian: [[1, 0], [2, 0], [3, 0], [4, 1], [5, 0], [6, 0], [7, 0]],
  Mixolydian: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, -1]],
  "Lydian dominant": [[1, 0], [2, 0], [3, 0], [4, 1], [5, 0], [6, 0], [7, -1]],
  altered: [[1, 0], [2, -1], [2, 1], [3, 0], [5, -1], [5, 1], [7, -1]],
  "half–whole diminished": [[1, 0], [2, -1], [2, 1], [3, 0], [4, 1], [5, 0], [6, 0], [7, -1]],
  "whole–half diminished": [[1, 0], [2, 0], [3, -1], [4, 0], [5, -1], [6, -1], [7, -2], [7, 0]],
  Dorian: [[1, 0], [2, 0], [3, -1], [4, 0], [5, 0], [6, 0], [7, -1]],
  Aeolian: [[1, 0], [2, 0], [3, -1], [4, 0], [5, 0], [6, -1], [7, -1]],
  "melodic minor": [[1, 0], [2, 0], [3, -1], [4, 0], [5, 0], [6, 0], [7, 0]],
  Locrian: [[1, 0], [2, -1], [3, -1], [4, 0], [5, -1], [6, -1], [7, -1]],
  "Locrian natural 2": [[1, 0], [2, 0], [3, -1], [4, 0], [5, -1], [6, -1], [7, -1]],
} as const;

export type ChartScaleFamily = keyof typeof SCALES;

/** Fixed validation: at most four T1 realizations,16 degrees each,8 scale
 * degrees and one slash bass. No search, repair, sample or time cutoff. */
export function containedChartScale(spec: ChordSpec, resolved: ResolvedChord,
  family: ChartScaleFamily | null): string | null {
  if (family === null) return null;
  const degrees = SCALES[family];
  const contains = (number: number, alteration: number): boolean =>
    degrees.some(([degree, alter]) => degree === (number - 1) % 7 + 1 && alter === alteration);
  for (const realization of resolved.realizations) {
    if (realization.degrees === null || realization.degrees.some(degree => !contains(degree.number, degree.alter))) return null;
  }
  if (spec.bass !== null) {
    const degreeIndex = (SPELLING_STEP_ORDER.indexOf(spec.bass.step) - SPELLING_STEP_ORDER.indexOf(spec.root.step) + 7) % 7;
    const natural = [0, 2, 4, 5, 7, 9, 11][degreeIndex];
    if (natural === undefined) return null;
    const alteration = ((pitchClassOf(spec.bass) - pitchClassOf(spec.root) - natural + 30) % 12) - 6;
    if (!contains(degreeIndex + 1, alteration)) return null;
  }
  const root = `${spec.root.step}${spec.root.alter < 0 ? "♭".repeat(-spec.root.alter) : "♯".repeat(spec.root.alter)}`;
  return `${root} ${family}`;
}
