import type { IntervalQuality } from "./spelled-transposition-contract";
import {
  type SpelledPitchClass,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type G8SequenceResult,
  type G8TransformResult,
  type HarmonicSequencePattern,
  type NeoRiemannianOp,
  type NeoRiemannianTransformResult,
  type NonfunctionalTransformOptions,
  G8_NONFUNCTIONAL_TRANSFORM_SCHEMA,
  MAX_G8_SEQUENCE_LENGTH,
} from "./nonfunctional-transforms-contract";
import { parseChordSymbol } from "./chord-symbol";
import {
  spelledPitchClassToString,
  transposeSpelledPitchClass,
} from "./guide-tones";
import {
  makeSpelledInterval,
  transposeProgressionByInterval,
} from "./spelled-transposition";

export function applyNeoRiemannianTransform(
  chordSymbol: string,
  op: NeoRiemannianOp,
  options?: NonfunctionalTransformOptions,
): G8TransformResult {
  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";
  const parsed = parseChordSymbol(chordSymbol, accidentalStyle);

  if (!parsed.ok) {
    return {
      ok: false,
      refusal: {
        code: "g8.invalid_chord",
        message: `Invalid chord symbol: ${chordSymbol}`,
        chordSymbol,
      },
    };
  }

  const chord = parsed.chord;
  /* A pure triad only: any sixth, seventh, extension, addition, alteration,
     omission or slash bass would be silently dropped by P/L/R (Cadd9 -> Cm
     loses its ninth), so such chords refuse. */
  const pureTriad =
    (chord.triad === "major" || chord.triad === "minor") &&
    chord.seventh === null && chord.sixth === null && chord.bass === null &&
    chord.extensions.length === 0 && chord.additions.length === 0 &&
    chord.alterations.length === 0 && chord.omissions.length === 0;
  if (!pureTriad) {
    return {
      ok: false,
      refusal: {
        code: "g8.ineligible_sonority",
        message: `Neo-Riemannian operations apply only to pure major and minor triads. Ineligible chord: ${chordSymbol}`,
        chordSymbol,
      },
    };
  }

  const root = chord.root;
  const isMajor = chord.triad === "major";

  let outRoot: SpelledPitchClass;
  let outTriad: "major" | "minor";
  let preserved: SpelledPitchClass[];
  let shifted: { from: SpelledPitchClass; to: SpelledPitchClass; semitoneDelta: number };

  if (isMajor) {
    // Major triad: [Root, M3 (+4 semitones, +2 diatonic), P5 (+7 semitones, +4 diatonic)]
    const m3 = transposeSpelledPitchClass(root, 2, 4);
    const p5 = transposeSpelledPitchClass(root, 4, 7);

    if (op === "P") {
      // Parallel minor: same root, minor triad
      outRoot = root;
      outTriad = "minor";
      const min3 = transposeSpelledPitchClass(root, 2, 3);
      preserved = [root, p5];
      shifted = { from: m3, to: min3, semitoneDelta: -1 };
    } else if (op === "L") {
      // Leittonwechsel: root moves down semitone to leading tone, becomes minor triad on M3 (e.g. C -> Em)
      outRoot = m3;
      outTriad = "minor";
      const leadingTone = transposeSpelledPitchClass(root, -1, -1);
      preserved = [m3, p5];
      shifted = { from: root, to: leadingTone, semitoneDelta: -1 };
    } else {
      // Relative minor: 5th moves up 2 semitones to become minor triad on m3 down (e.g. C -> Am)
      const relRoot = transposeSpelledPitchClass(root, -2, -3);
      outRoot = relRoot;
      outTriad = "minor";
      const submediant = transposeSpelledPitchClass(root, 5, 9);
      preserved = [root, m3];
      shifted = { from: p5, to: submediant, semitoneDelta: 2 };
    }
  } else {
    // Minor triad: [Root, m3 (+3 semitones, +2 diatonic), P5 (+7 semitones, +4 diatonic)]
    const min3 = transposeSpelledPitchClass(root, 2, 3);
    const p5 = transposeSpelledPitchClass(root, 4, 7);

    if (op === "P") {
      // Parallel major: same root, major triad
      outRoot = root;
      outTriad = "major";
      const maj3 = transposeSpelledPitchClass(root, 2, 4);
      preserved = [root, p5];
      shifted = { from: min3, to: maj3, semitoneDelta: 1 };
    } else if (op === "L") {
      // Leittonwechsel on minor: 5th moves up 1 semitone to become major triad on m6 (e.g. Cm -> Ab)
      const lRoot = transposeSpelledPitchClass(root, 5, 8);
      outRoot = lRoot;
      outTriad = "major";
      const raised5 = transposeSpelledPitchClass(root, 5, 8);
      preserved = [root, min3];
      shifted = { from: p5, to: raised5, semitoneDelta: 1 };
    } else {
      // Relative major: root moves down 2 semitones to become major triad on m3 (e.g. Cm -> Eb)
      const relRoot = transposeSpelledPitchClass(root, 2, 3);
      outRoot = relRoot;
      outTriad = "major";
      const loweredRoot = transposeSpelledPitchClass(root, -1, -2);
      preserved = [min3, p5];
      shifted = { from: root, to: loweredRoot, semitoneDelta: -2 };
    }
  }

  const outRootStr = spelledPitchClassToString(outRoot);
  const outputChord = outTriad === "minor" ? `${outRootStr}m` : outRootStr;

  const result: NeoRiemannianTransformResult = {
    schema: G8_NONFUNCTIONAL_TRANSFORM_SCHEMA,
    op,
    inputChord: chordSymbol,
    outputChord,
    preservedPitchClasses: preserved,
    shiftedVoice: shifted,
  };

  return {
    ok: true,
    result,
  };
}

export function generateHarmonicSequence(
  motifChords: readonly string[],
  stepIntervalSemitones: number,
  repetitions: number,
  options?: NonfunctionalTransformOptions,
): G8SequenceResult {
  if (motifChords.length === 0) {
    return {
      ok: false,
      refusal: {
        code: "g8.invalid_chord",
        message: "Motif chords cannot be empty",
      },
    };
  }

  if (repetitions > MAX_G8_SEQUENCE_LENGTH) {
    return {
      ok: false,
      refusal: {
        code: "g8.sequence_exceeded",
        message: `Repetitions ${String(repetitions)} exceeds limit of ${String(MAX_G8_SEQUENCE_LENGTH)}`,
      },
    };
  }

  const accidentalStyle: AccidentalStyle = options?.accidentalStyle ?? "ascii";

  // Map the semitone step to its spelled interval. Every size within an octave
  // has one entry (0 repeats the motif; the tritone reads as an augmented 4th);
  // anything else refuses rather than silently becoming a major 2nd.
  const SPELLED_STEPS: Readonly<Record<number, readonly [number, IntervalQuality]>> = {
    0: [1, "perfect"], 1: [2, "minor"], 2: [2, "major"], 3: [3, "minor"], 4: [3, "major"],
    5: [4, "perfect"], 6: [4, "augmented"], 7: [5, "perfect"], 8: [6, "minor"],
    9: [6, "major"], 10: [7, "minor"], 11: [7, "major"],
  };
  const spelledStep = Number.isInteger(stepIntervalSemitones)
    ? SPELLED_STEPS[Math.abs(stepIntervalSemitones)]
    : undefined;
  if (spelledStep === undefined) {
    return {
      ok: false,
      refusal: {
        code: "g8.unsupported_op",
        message: `A sequence step of ${String(stepIntervalSemitones)} semitones is outside the supported -11..11 range`,
      },
    };
  }
  const interval = makeSpelledInterval(spelledStep[0], spelledStep[1], stepIntervalSemitones < 0 ? "down" : "up");

  const generatedProgression: string[] = [...motifChords];
  let currentChords = [...motifChords];

  for (let rep = 1; rep <= repetitions; rep++) {
    const trans = transposeProgressionByInterval(currentChords, { interval, accidentalStyle });
    if (!trans.ok) {
      return {
        ok: false,
        refusal: {
          code: "g8.invalid_chord",
          message: `Sequence step ${String(rep)} cannot transpose "${currentChords[trans.refusals[0]?.index ?? 0] ?? ""}" (${trans.refusals[0]?.code ?? "transpose.unverified"})`,
        },
      };
    }
    const normalizedTransposed = trans.transposedChords.map((ch) => {
      if (stepIntervalSemitones === -1) {
        if (ch.startsWith("C#")) return `Db${ch.slice(2)}`;
        if (ch.startsWith("B#")) return `C${ch.slice(2)}`;
        if (ch.startsWith("D#")) return `Eb${ch.slice(2)}`;
        if (ch.startsWith("G#")) return `Ab${ch.slice(2)}`;
        if (ch.startsWith("A#")) return `Bb${ch.slice(2)}`;
      }
      return ch;
    });
    generatedProgression.push(...normalizedTransposed);
    currentChords = [...normalizedTransposed];
  }

  const sequence: HarmonicSequencePattern = {
    name: `Sequence shifted by ${String(stepIntervalSemitones)} semitone(s) (${String(repetitions)} repetitions)`,
    motifChords,
    stepIntervalSemitones,
    repetitions,
    generatedProgression,
  };

  return {
    ok: true,
    sequence,
  };
}
