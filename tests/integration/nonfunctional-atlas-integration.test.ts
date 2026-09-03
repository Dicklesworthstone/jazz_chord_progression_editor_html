import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  applyNeoRiemannianTransform,
  generateHarmonicSequence,
} from "../../src/theory";

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/nonfunctional-atlas",
);

describe("G8 Comprehensive Conformance and Evidence", () => {
  test("satisfies all independent Neo-Riemannian truth tables", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "neo-riemannian-truth-tables.json"), "utf8");
    const data = JSON.parse(raw) as {
      truthTables: Array<{
        inputChord: string;
        transforms: {
          P: string;
          L: string;
          R: string;
        };
      }>;
    };

    for (const entry of data.truthTables) {
      const pRes = applyNeoRiemannianTransform(entry.inputChord, "P");
      expect(pRes.ok).toBe(true);
      if (pRes.ok) {
        expect(pRes.result.outputChord).toBe(entry.transforms.P);
      }

      const lRes = applyNeoRiemannianTransform(entry.inputChord, "L");
      expect(lRes.ok).toBe(true);
      if (lRes.ok) {
        expect(lRes.result.outputChord).toBe(entry.transforms.L);
      }

      const rRes = applyNeoRiemannianTransform(entry.inputChord, "R");
      expect(rRes.ok).toBe(true);
      if (rRes.ok) {
        expect(rRes.result.outputChord).toBe(entry.transforms.R);
      }
    }
  });

  test("satisfies all independent harmonic sequence cases", async () => {
    const raw = await readFile(resolve(FIXTURE_DIR, "harmonic-sequence-cases.json"), "utf8");
    const data = JSON.parse(raw) as {
      sequences: Array<{
        id: string;
        name: string;
        motifChords: string[];
        stepIntervalSemitones: number;
        repetitions: number;
        expectedProgression: string[];
      }>;
    };

    for (const seqCase of data.sequences) {
      const result = generateHarmonicSequence(
        seqCase.motifChords,
        seqCase.stepIntervalSemitones,
        seqCase.repetitions,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sequence.generatedProgression).toEqual(seqCase.expectedProgression);
      }
    }
  });

  test("deterministic byte-for-byte reproducibility across runs", () => {
    const run1 = applyNeoRiemannianTransform("C", "L");
    const run2 = applyNeoRiemannianTransform("C", "L");
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));

    const seq1 = generateHarmonicSequence(["Dm7", "G7"], -2, 3);
    const seq2 = generateHarmonicSequence(["Dm7", "G7"], -2, 3);
    expect(JSON.stringify(seq1)).toBe(JSON.stringify(seq2));
  });
});
