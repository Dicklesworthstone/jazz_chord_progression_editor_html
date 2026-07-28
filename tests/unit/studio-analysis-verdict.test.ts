/**
 * jcpe-7she evidence: the analyzer verdict is honest — it confirms only an
 * exact pitch-class agreement between what was heard and what the chart
 * claims, refuses to guess through silence, and names what is missing or
 * extra when the two disagree.
 */
import { describe, expect, test } from "bun:test";

import {
  computeAnalyzerVerdict,
  type StudioAnalysisFrame,
  type StudioDetectedNote,
} from "../../src/application/studio-analysis";

function frameWith(notes: readonly StudioDetectedNote[]): StudioAnalysisFrame {
  return Object.freeze({
    sampleRateHz: 48_000,
    fftSize: 4_096,
    samples: new Float32Array(4_096),
    magnitudes: new Float32Array(2_048),
    notes,
    chroma: new Float32Array(12),
  });
}

function note(midiPitch: number, strength: number): StudioDetectedNote {
  return Object.freeze({ midiPitch, centsDeviation: 0, strength });
}

describe("the analyzer verdict", () => {
  test("silence never claims a match", () => {
    expect(computeAnalyzerVerdict(null, null).kind).toBe("silent");
    expect(
      computeAnalyzerVerdict(frameWith([]), {
        chordLabel: "Dm7",
        pitchClasses: [2, 5, 9, 0],
      }).kind,
    ).toBe("silent");
  });

  test("sound without a chart chord reports listening, not judgment", () => {
    const verdict = computeAnalyzerVerdict(frameWith([note(60, 1)]), null);
    expect(verdict.kind).toBe("listening");
  });

  test("an exact pitch-class agreement is a match", () => {
    const verdict = computeAnalyzerVerdict(
      frameWith([note(50, 1), note(65, 0.8), note(69, 0.7), note(60, 0.6)]),
      { chordLabel: "Dm7", pitchClasses: [2, 5, 9, 0] },
    );
    expect(verdict.kind).toBe("match");
  });

  test("octave doublings cannot break a match", () => {
    const verdict = computeAnalyzerVerdict(
      frameWith([note(38, 1), note(50, 0.9), note(65, 0.8), note(69, 0.5), note(60, 0.5)]),
      { chordLabel: "Dm7", pitchClasses: [2, 5, 9, 0] },
    );
    expect(verdict.kind).toBe("match");
  });

  test("a missing chord tone is named", () => {
    const verdict = computeAnalyzerVerdict(
      frameWith([note(50, 1), note(65, 0.8), note(69, 0.7)]),
      { chordLabel: "Dm7", pitchClasses: [2, 5, 9, 0] },
    );
    expect(verdict.kind).toBe("mismatch");
    expect(verdict.missingClasses).toEqual([0]);
    expect(verdict.detail).toContain("missing C");
  });

  test("a strong wrong note is named as extra", () => {
    const verdict = computeAnalyzerVerdict(
      frameWith([note(50, 1), note(66, 0.9), note(69, 0.7), note(60, 0.6)]),
      { chordLabel: "Dm7", pitchClasses: [2, 5, 9, 0] },
    );
    expect(verdict.kind).toBe("mismatch");
    expect(verdict.unexpectedClasses).toEqual([6]);
    expect(verdict.detail).toContain("F♯");
  });

  test("weak spectral residue below the floor cannot flip a verdict", () => {
    const verdict = computeAnalyzerVerdict(
      frameWith([
        note(50, 1),
        note(65, 0.8),
        note(69, 0.7),
        note(60, 0.6),
        /* A faint non-chord ghost far below the strength floor. */
        note(78, 0.05),
      ]),
      { chordLabel: "Dm7", pitchClasses: [2, 5, 9, 0] },
    );
    expect(verdict.kind).toBe("match");
  });
});
