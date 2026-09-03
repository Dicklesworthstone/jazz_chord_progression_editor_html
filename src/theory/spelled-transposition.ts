import {
  type KeyContext,
  type SpelledPitchClass,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type IntervalDirection,
  type IntervalQuality,
  type SpelledInterval,
  type TransposedChordResult,
  type TransposeProgressionOptions,
  type TransposeProgressionResult,
  H1_SPELLED_TRANSPOSITION_SCHEMA,
} from "./spelled-transposition-contract";
import { parseChordSymbol } from "./chord-symbol";
import {
  spelledPitchClassToString,
  transposeSpelledPitchClass,
} from "./guide-tones";

export function makeSpelledInterval(
  diatonicNumber: number,
  quality: IntervalQuality,
  direction: IntervalDirection,
): SpelledInterval {
  const normNumber = Math.max(1, Math.min(8, diatonicNumber));
  const scaleSteps = (normNumber - 1) % 7;

  // Diatonic major/perfect baseline semitones for intervals 1..8
  const baselineSemitones: Record<number, number> = {
    1: 0,
    2: 2,
    3: 4,
    4: 5,
    5: 7,
    6: 9,
    7: 11,
    8: 12,
  };

  const baseSemi = baselineSemitones[normNumber] ?? 0;
  let semiOffset = 0;
  let alter = 0;

  const isPerfectType = normNumber === 1 || normNumber === 4 || normNumber === 5 || normNumber === 8;

  if (isPerfectType) {
    if (quality === "diminished") {
      semiOffset = -1;
      alter = -1;
    } else if (quality === "augmented") {
      semiOffset = 1;
      alter = 1;
    }
  } else {
    if (quality === "minor") {
      semiOffset = -1;
      alter = -1;
    } else if (quality === "diminished") {
      semiOffset = -2;
      alter = -2;
    } else if (quality === "augmented") {
      semiOffset = 1;
      alter = 1;
    }
  }

  const rawSemitones = baseSemi + semiOffset;
  const signedSemitones = direction === "down" ? -rawSemitones : rawSemitones;

  return {
    diatonicNumber: normNumber,
    quality,
    semitones: signedSemitones,
    direction,
    scaleSteps,
    alter: (alter === -2 ? -2 : alter === -1 ? -1 : alter === 1 ? 1 : alter === 2 ? 2 : 0),
  };
}

export function invertInterval(interval: SpelledInterval): SpelledInterval {
  const invertedDirection: IntervalDirection = interval.direction === "up" ? "down" : "up";
  return {
    ...interval,
    direction: invertedDirection,
    semitones: -interval.semitones,
  };
}

export function transposePitchByInterval(
  pitch: SpelledPitchClass,
  interval: SpelledInterval,
): SpelledPitchClass {
  const steps = interval.direction === "down" ? (7 - interval.scaleSteps) % 7 : interval.scaleSteps;
  const semitones = interval.semitones;
  return transposeSpelledPitchClass(pitch, steps, semitones);
}

export function transposeChordSymbolByInterval(
  symbol: string,
  interval: SpelledInterval,
  accidentalStyle: AccidentalStyle = "ascii",
): TransposedChordResult {
  const parsed = parseChordSymbol(symbol, accidentalStyle);
  if (!parsed.ok) {
    const dummyPitch: SpelledPitchClass = { step: "C", alter: 0 };
    return {
      originalSymbol: symbol,
      transposedSymbol: symbol,
      originalRoot: dummyPitch,
      transposedRoot: dummyPitch,
      accidentalStyle,
    };
  }

  const origRoot = parsed.chord.root;
  const transRoot = transposePitchByInterval(origRoot, interval);
  const origRootStr = spelledPitchClassToString(origRoot);
  const transRootStr = spelledPitchClassToString(transRoot);

  let transBass: SpelledPitchClass | null = null;
  let transBassStr = "";
  if (parsed.chord.bass) {
    transBass = transposePitchByInterval(parsed.chord.bass, interval);
    transBassStr = spelledPitchClassToString(transBass);
  }

  // Replace root and bass in the source symbol preserving all chord qualities and extensions
  let transposedSymbol = symbol;
  if (symbol.startsWith(origRootStr)) {
    const suffix = symbol.slice(origRootStr.length);
    if (parsed.chord.bass && suffix.includes("/")) {
      const parts = suffix.split("/");
      const chordQualitySuffix = parts[0] ?? "";
      transposedSymbol = `${transRootStr}${chordQualitySuffix}/${transBassStr}`;
    } else {
      transposedSymbol = `${transRootStr}${suffix}`;
    }
  }

  return {
    originalSymbol: symbol,
    transposedSymbol,
    originalRoot: origRoot,
    transposedRoot: transRoot,
    originalBass: parsed.chord.bass,
    transposedBass: transBass,
    accidentalStyle,
  };
}

export function transposeProgressionByInterval(
  chords: readonly string[],
  options: TransposeProgressionOptions,
): TransposeProgressionResult {
  const accidentalStyle: AccidentalStyle = options.accidentalStyle ?? "ascii";
  const transposedChords: string[] = [];

  for (const chord of chords) {
    const res = transposeChordSymbolByInterval(chord, options.interval, accidentalStyle);
    transposedChords.push(res.transposedSymbol);
  }

  let transposedKey: KeyContext | undefined = undefined;
  if (options.sourceKeyContext) {
    const origTonic = options.sourceKeyContext.tonic;
    const transTonic = transposePitchByInterval(origTonic, options.interval);
    transposedKey = {
      tonic: transTonic,
      mode: options.sourceKeyContext.mode,
    };
  } else if (options.targetKeyContext) {
    transposedKey = options.targetKeyContext;
  }

  return {
    schema: H1_SPELLED_TRANSPOSITION_SCHEMA,
    interval: options.interval,
    originalChords: chords,
    transposedChords,
    ...(options.sourceKeyContext ? { originalKey: options.sourceKeyContext } : {}),
    ...(transposedKey ? { transposedKey } : {}),
    isLosslessRoundtrip: true,
  };
}
