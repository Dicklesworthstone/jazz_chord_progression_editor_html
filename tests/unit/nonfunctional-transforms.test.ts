import { describe, expect, test } from "bun:test";
import {
  applyNeoRiemannianTransform,
  generateHarmonicSequence,
} from "../../src/theory";

describe("G8 Nonfunctional Transforms and Sequences", () => {
  test("performs Neo-Riemannian P, L, R transforms on C major and verifies truth tables", () => {
    // C major -> P: Cm, L: Em, R: Am
    const pRes = applyNeoRiemannianTransform("C", "P");
    expect(pRes.ok).toBe(true);
    if (pRes.ok) {
      expect(pRes.result.outputChord).toBe("Cm");
      expect(pRes.result.shiftedVoice.semitoneDelta).toBe(-1);
    }

    const lRes = applyNeoRiemannianTransform("C", "L");
    expect(lRes.ok).toBe(true);
    if (lRes.ok) {
      expect(lRes.result.outputChord).toBe("Em");
      expect(lRes.result.shiftedVoice.semitoneDelta).toBe(-1);
    }

    const rRes = applyNeoRiemannianTransform("C", "R");
    expect(rRes.ok).toBe(true);
    if (rRes.ok) {
      expect(rRes.result.outputChord).toBe("Am");
      expect(rRes.result.shiftedVoice.semitoneDelta).toBe(2);
    }
  });

  test("proves Neo-Riemannian involution identity P(P(T)) = T, L(L(T)) = T, R(R(T)) = T", () => {
    const triads = ["C", "F", "G", "Cm", "Am", "Em"];

    for (const t of triads) {
      // P(P(t)) === t
      const p1 = applyNeoRiemannianTransform(t, "P");
      expect(p1.ok).toBe(true);
      if (p1.ok) {
        const p2 = applyNeoRiemannianTransform(p1.result.outputChord, "P");
        expect(p2.ok).toBe(true);
        if (p2.ok) {
          expect(p2.result.outputChord).toBe(t);
        }
      }

      // L(L(t)) === t
      const l1 = applyNeoRiemannianTransform(t, "L");
      expect(l1.ok).toBe(true);
      if (l1.ok) {
        const l2 = applyNeoRiemannianTransform(l1.result.outputChord, "L");
        expect(l2.ok).toBe(true);
        if (l2.ok) {
          expect(l2.result.outputChord).toBe(t);
        }
      }

      // R(R(t)) === t
      const r1 = applyNeoRiemannianTransform(t, "R");
      expect(r1.ok).toBe(true);
      if (r1.ok) {
        const r2 = applyNeoRiemannianTransform(r1.result.outputChord, "R");
        expect(r2.ok).toBe(true);
        if (r2.ok) {
          expect(r2.result.outputChord).toBe(t);
        }
      }
    }
  });

  test("generates descending circle of fifths harmonic sequence", () => {
    const res = generateHarmonicSequence(["Dm7", "G7"], -2, 2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sequence.generatedProgression).toEqual(["Dm7", "G7", "Cm7", "F7", "Bbm7", "Eb7"]);
    }
  });

  test("refuses non-triad chords with typed refusal for P/L/R", () => {
    const res = applyNeoRiemannianTransform("Cmaj7", "P");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal.code).toBe("g8.ineligible_sonority");
    }
  });

  test("refuses sequence exceeding limit of 16 repetitions", () => {
    const res = generateHarmonicSequence(["C"], 2, 17);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal.code).toBe("g8.sequence_exceeded");
    }
  });

  test("every step size within an octave is spelled; zero repeats and wider steps refuse", () => {
    /* Hand-derived: 0 keeps C; a tritone up reads as an augmented 4th (C -> F#);
     * a minor 3rd down moves Dm7 to Bm7. */
    const zero = generateHarmonicSequence(["C"], 0, 1);
    expect(zero.ok && zero.sequence.generatedProgression).toEqual(["C", "C"]);
    const tritone = generateHarmonicSequence(["C"], 6, 1);
    expect(tritone.ok && tritone.sequence.generatedProgression).toEqual(["C", "F#"]);
    const third = generateHarmonicSequence(["Dm7"], -3, 1);
    expect(third.ok && third.sequence.generatedProgression).toEqual(["Dm7", "Bm7"]);
    for (const step of [12, -12, 1.5]) {
      const refused = generateHarmonicSequence(["C"], step, 1);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.refusal.code).toBe("g8.unsupported_op");
    }
  });

  test("P/L/R apply only to pure triads; coloured chords refuse instead of losing notes", () => {
    /* Hand-authored near-misses: each carries a note P/L/R would delete. */
    for (const symbol of ["Cadd9", "C6", "C/E", "Cm(add9)", "Csus4", "C7"]) {
      const result = applyNeoRiemannianTransform(symbol, "P");
      expect(`${symbol}: ${result.ok ? "applied" : result.refusal.code}`).toBe(`${symbol}: g8.ineligible_sonority`);
    }
    /* Positive controls: plain triads still transform. */
    expect(applyNeoRiemannianTransform("C", "P").ok).toBe(true);
    expect(applyNeoRiemannianTransform("Am", "R").ok).toBe(true);
  });
});

