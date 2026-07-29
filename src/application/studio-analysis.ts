/**
 * Display-only analyzer projection (jcpe-7she).
 *
 * The analyzer panel is the studio's independent empirical check: it reads
 * what the master bus actually carried, detects notes spectrally in the
 * embedded DSP module, and compares them with what the chart claims is
 * sounding. Everything here is presentation data — no musical authority, no
 * state, no command path. The audio layer supplies frames; this module only
 * names their shape and computes the honest verdict.
 */

export type StudioDetectedNote = Readonly<{
  midiPitch: number;
  centsDeviation: number;
  strength: number;
}>;

export type StudioAnalysisFrame = Readonly<{
  sampleRateHz: number;
  fftSize: number;
  /** Raw time-domain window the spectrum was computed from (scope display). */
  samples: Float32Array;
  /** Hann-windowed magnitude spectrum, fftSize/2 bins. */
  magnitudes: Float32Array;
  /** Harmonically grouped fundamentals, strongest first. */
  notes: readonly StudioDetectedNote[];
  /** Pitch-class energy fold (C first), unit-maximum normalized. */
  chroma: Float32Array;
}>;

export type StudioAnalyzerExpectation = Readonly<{
  chordLabel: string;
  pitchClasses: readonly number[];
}>;

export type StudioAnalyzerVerdict = Readonly<{
  kind: "match" | "mismatch" | "listening" | "silent";
  detail: string;
  missingClasses: readonly number[];
  unexpectedClasses: readonly number[];
}>;

export const PITCH_CLASS_LABELS = Object.freeze([
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const);

/**
 * A detected note is load-bearing for the verdict only when it carries a
 * meaningful share of the strongest note's energy; weaker entries are
 * displayed but cannot flip a verdict. Piano partials leak energy into the
 * fifth of every strong tone, so the threshold is deliberately firm.
 */
const VERDICT_STRENGTH_FLOOR = 0.28;

export function computeAnalyzerVerdict(
  frame: StudioAnalysisFrame | null,
  expected: StudioAnalyzerExpectation | null,
): StudioAnalyzerVerdict {
  if (frame === null || frame.notes.length === 0) {
    return Object.freeze({
      kind: "silent",
      detail: "No signal on the master bus.",
      missingClasses: Object.freeze([]),
      unexpectedClasses: Object.freeze([]),
    });
  }
  if (expected === null) {
    return Object.freeze({
      kind: "listening",
      detail: "Listening — no chart chord to compare.",
      missingClasses: Object.freeze([]),
      unexpectedClasses: Object.freeze([]),
    });
  }
  const strongest = frame.notes[0]?.strength ?? 0;
  const detectedClasses = new Set<number>();
  for (const note of frame.notes) {
    if (note.strength >= strongest * VERDICT_STRENGTH_FLOOR) {
      detectedClasses.add(((Math.round(note.midiPitch) % 12) + 12) % 12);
    }
  }
  const expectedClasses = new Set(
    expected.pitchClasses.map((value) => ((value % 12) + 12) % 12),
  );
  const missing = [...expectedClasses]
    .filter((value) => !detectedClasses.has(value))
    .sort((a, b) => a - b);
  const unexpected = [...detectedClasses]
    .filter((value) => !expectedClasses.has(value))
    .sort((a, b) => a - b);
  /*
   * jcpe-1gao changed what an honest verdict can claim. The transport now
   * plays a band sketch: at any instant a bass note may sound alone between
   * comping stabs, and a comp voicing deliberately drops the voice the bass
   * is already carrying. An absent chord tone is therefore normal
   * performance, not an error, and flagging it would make the analyzer cry
   * wolf through correct playback.
   *
   * What the analyzer can still assert without qualification is that
   * everything it heard belongs to the sounding chord — a foreign pitch
   * class is a real defect, and that is what MISMATCH now means. Absent
   * classes remain reported as context so the panel can still show which
   * tones this window did not carry.
   */
  if (unexpected.length === 0) {
    return Object.freeze({
      kind: "match",
      detail:
        missing.length === 0
          ? `Heard exactly ${expected.chordLabel}.`
          : `All of it belongs to ${expected.chordLabel} (this window omits ${missing
              .map((value) => PITCH_CLASS_LABELS[value] ?? "?")
              .join(", ")}).`,
      missingClasses: Object.freeze(missing),
      unexpectedClasses: Object.freeze([]),
    });
  }
  return Object.freeze({
    kind: "mismatch",
    detail: `${expected.chordLabel}: heard ${unexpected
      .map((value) => PITCH_CLASS_LABELS[value] ?? "?")
      .join(", ")}, which ${unexpected.length === 1 ? "is not a chord tone" : "are not chord tones"}.`,
    missingClasses: Object.freeze(missing),
    unexpectedClasses: Object.freeze(unexpected),
  });
}
