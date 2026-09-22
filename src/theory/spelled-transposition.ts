import {
  SPELLING_STEP_ORDER,
  makeSpelledPitchClass,
  pitchClassOf,
  type ChordSpec,
  type KeyContext,
  type SpelledPitchClass,
} from "../domain";
import type { AccidentalStyle } from "./syntax-contract";
import {
  type IntervalDirection,
  type IntervalQuality,
  type ChordTranspositionRefusalCode,
  type SpelledInterval,
  type TransposedChordResult,
  type TransposeProgressionOptions,
  type TransposeProgressionResult,
  H1_SPELLED_TRANSPOSITION_SCHEMA,
} from "./spelled-transposition-contract";
import { formatChordSymbol, parseChordSymbol } from "./chord-symbol";
import { transposeSpelledPitchClass } from "./guide-tones";

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

/**
 * Exact spelled transposition of one pitch class: the letter moves by the
 * interval's steps and the accidental is whatever makes the sounding pitch
 * exact. Beyond a double accidental no spelling exists; return null rather
 * than clamp to a different pitch.
 */
export function transposeSpelledPitchClassExact(
  pitch: SpelledPitchClass,
  interval: SpelledInterval,
): SpelledPitchClass | null {
  const steps =
    interval.direction === "down" ? (7 - interval.scaleSteps) % 7 : interval.scaleSteps;
  const letterIndex = SPELLING_STEP_ORDER.indexOf(pitch.step);
  const step = SPELLING_STEP_ORDER[(letterIndex + steps) % 7] ?? "C";
  const natural = pitchClassOf({ step, alter: 0 });
  const target = pitchClassOf(pitch) + interval.semitones;
  const alter = ((((target - natural) % 12) + 18) % 12) - 6;
  if (alter < -2 || alter > 2) return null;
  const made = makeSpelledPitchClass({ step, alter });
  return made.ok ? made.value : null;
}

/** Deterministic deep serialization with sorted keys at every level. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Structural identity of a parsed chord — every nested member — minus its text. */
function chordMeaning(chord: ChordSpec): string {
  return canonicalJson({ ...chord, sourceText: null });
}

function writtenPitchClass(pitch: SpelledPitchClass, unicode: boolean): string {
  const flat = unicode ? "♭" : "b";
  const sharp = unicode ? "♯" : "#";
  return `${pitch.step}${pitch.alter < 0 ? flat.repeat(-pitch.alter) : sharp.repeat(pitch.alter)}`;
}

/**
 * Transpose a parsed chord by a spelled interval. Root and slash bass move;
 * every quality, extension, alteration and omission is relative to the root
 * and so is unchanged. The result text is accepted only if the T0 parser reads
 * it back as exactly the transposed chord. The musician's own quality text is
 * tried first (so "C-7" becomes "D-7"), then the canonical print.
 */
export function transposeChordSpecByInterval(
  chord: ChordSpec,
  interval: SpelledInterval,
  accidentalStyle: AccidentalStyle = "ascii",
):
  | Readonly<{ ok: true; chord: ChordSpec; text: string }>
  | Readonly<{ ok: false; code: ChordTranspositionRefusalCode }> {
  const root = transposeSpelledPitchClassExact(chord.root, interval);
  const bass =
    chord.bass === null ? null : transposeSpelledPitchClassExact(chord.bass, interval);
  if (root === null || (chord.bass !== null && bass === null)) {
    return Object.freeze({ ok: false, code: "transpose.spelling-overflow" });
  }
  const moved: ChordSpec = Object.freeze({ ...chord, root, bass });
  const expected = chordMeaning(moved);
  const unicode = /[♭♯𝄫𝄪]/u.test(chord.sourceText);
  const candidates: string[] = [];
  const sourceRoot = writtenPitchClass(chord.root, unicode);
  if (chord.sourceText.startsWith(sourceRoot)) {
    let rest = chord.sourceText.slice(sourceRoot.length);
    let fits = true;
    if (chord.bass !== null && bass !== null) {
      const sourceBass = `/${writtenPitchClass(chord.bass, unicode)}`;
      if (rest.endsWith(sourceBass)) {
        rest = `${rest.slice(0, rest.length - sourceBass.length)}/${writtenPitchClass(bass, unicode)}`;
      } else {
        fits = false;
      }
    }
    if (fits) candidates.push(`${writtenPitchClass(root, unicode)}${rest}`);
  }
  const canonical = formatChordSymbol(moved, accidentalStyle);
  if (canonical.ok) candidates.push(canonical.canonicalText);
  for (const text of candidates) {
    const reparsed = parseChordSymbol(text, unicode ? "unicode" : accidentalStyle);
    if (reparsed.ok && chordMeaning(reparsed.chord) === expected) {
      return Object.freeze({ ok: true, chord: reparsed.chord, text });
    }
  }
  return Object.freeze({ ok: false, code: "transpose.unverified" });
}

export function transposeChordSymbolByInterval(
  symbol: string,
  interval: SpelledInterval,
  accidentalStyle: AccidentalStyle = "ascii",
): TransposedChordResult {
  const parsed = parseChordSymbol(symbol, accidentalStyle);
  if (!parsed.ok) {
    return Object.freeze({
      ok: false,
      originalSymbol: symbol,
      code: "transpose.unparseable",
      accidentalStyle,
    });
  }
  const moved = transposeChordSpecByInterval(parsed.chord, interval, accidentalStyle);
  if (!moved.ok) {
    return Object.freeze({
      ok: false,
      originalSymbol: symbol,
      code: moved.code,
      accidentalStyle,
    });
  }
  return Object.freeze({
    ok: true,
    originalSymbol: symbol,
    transposedSymbol: moved.text,
    transposedChord: moved.chord,
    originalRoot: parsed.chord.root,
    transposedRoot: moved.chord.root,
    originalBass: parsed.chord.bass,
    transposedBass: moved.chord.bass,
    accidentalStyle,
  });
}

export function transposeProgressionByInterval(
  chords: readonly string[],
  options: TransposeProgressionOptions,
): TransposeProgressionResult {
  const accidentalStyle: AccidentalStyle = options.accidentalStyle ?? "ascii";
  const transposedChords: string[] = [];
  const refusals: { index: number; code: ChordTranspositionRefusalCode }[] = [];

  chords.forEach((chord, index) => {
    const res = transposeChordSymbolByInterval(chord, options.interval, accidentalStyle);
    if (res.ok) transposedChords.push(res.transposedSymbol);
    else refusals.push(Object.freeze({ index, code: res.code }));
  });

  let transposedKey: KeyContext | undefined = undefined;
  if (options.sourceKeyContext) {
    const transTonic = transposeSpelledPitchClassExact(
      options.sourceKeyContext.tonic,
      options.interval,
    );
    if (transTonic === null) {
      refusals.push(Object.freeze({ index: -1, code: "transpose.spelling-overflow" }));
    } else {
      transposedKey = { tonic: transTonic, mode: options.sourceKeyContext.mode };
    }
  } else if (options.targetKeyContext) {
    transposedKey = options.targetKeyContext;
  }

  if (refusals.length > 0) {
    return Object.freeze({
      ok: false,
      schema: H1_SPELLED_TRANSPOSITION_SCHEMA,
      interval: options.interval,
      originalChords: chords,
      refusals: Object.freeze(refusals),
    });
  }
  return Object.freeze({
    ok: true,
    schema: H1_SPELLED_TRANSPOSITION_SCHEMA,
    interval: options.interval,
    originalChords: chords,
    transposedChords: Object.freeze(transposedChords),
    ...(options.sourceKeyContext ? { originalKey: options.sourceKeyContext } : {}),
    ...(transposedKey ? { transposedKey } : {}),
  });
}
