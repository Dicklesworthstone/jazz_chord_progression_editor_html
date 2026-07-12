import type { Comparison, PathRefusal } from "./result";

export const SPELLING_STEP_ORDER = ["C", "D", "E", "F", "G", "A", "B"] as const;
export const MIN_ALTERATION = -2;
export const MAX_ALTERATION = 2;
export const MIN_MIDI_PITCH = 0;
export const MAX_MIDI_PITCH = 127;
export const MIDDLE_C_MIDI = 60;
export const CONCERT_A_MIDI = 69;
export const CONCERT_A_FREQUENCY_HZ = 440;

export type Step = (typeof SPELLING_STEP_ORDER)[number];
export type Alteration = -2 | -1 | 0 | 1 | 2;

export type SpelledPitchClass = Readonly<{
  step: Step;
  alter: Alteration;
}>;

/** A spelled pitch remains valid even when its projection lies outside MIDI. */
export type SpelledPitch = SpelledPitchClass &
  Readonly<{
    octave: number;
  }>;

export type SpelledPitchClassInput = Readonly<{
  step: string;
  alter: number;
}>;

export type SpelledPitchInput = SpelledPitchClassInput &
  Readonly<{
    octave: number;
  }>;

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

declare const midiPitchBrand: unique symbol;

export type MidiPitch = number & { readonly [midiPitchBrand]: "MidiPitch" };

export type MidiPitchRefusal =
  | PathRefusal<{ code: "pitch.midi_not_integer"; received: number }>
  | PathRefusal<{
      code: "pitch.midi_out_of_range";
      received: number;
      minimum: typeof MIN_MIDI_PITCH;
      maximum: typeof MAX_MIDI_PITCH;
    }>;

export type MidiPitchResult =
  | Readonly<{ ok: true; value: MidiPitch }>
  | Readonly<{ ok: false; refusal: MidiPitchRefusal }>;

export type EqualTemperamentProjection = Readonly<{
  spelled: SpelledPitch;
  pitchClass: PitchClass;
  midi: MidiPitch;
  frequencyHz: number;
}>;

export type PitchConstructionRefusal =
  | PathRefusal<{ code: "pitch.step_invalid"; received: string }>
  | PathRefusal<{
      code: "pitch.alter_out_of_range";
      received: number;
      minimum: typeof MIN_ALTERATION;
      maximum: typeof MAX_ALTERATION;
    }>
  | PathRefusal<{ code: "pitch.octave_not_integer"; received: number }>
  | PathRefusal<{ code: "pitch.octave_not_safe_integer"; received: number }>;

export type SpelledPitchClassResult =
  | Readonly<{ ok: true; value: SpelledPitchClass }>
  | Readonly<{
      ok: false;
      refusal: Exclude<
        PitchConstructionRefusal,
        { code: "pitch.octave_not_integer" | "pitch.octave_not_safe_integer" }
      >;
    }>;

export type SpelledPitchResult =
  | Readonly<{ ok: true; value: SpelledPitch }>
  | Readonly<{ ok: false; refusal: PitchConstructionRefusal }>;

export type PitchProjectionRefusal = PathRefusal<{
  code: "pitch.midi_out_of_range";
  spelled: SpelledPitch;
  projectedMidi: number;
  minimum: typeof MIN_MIDI_PITCH;
  maximum: typeof MAX_MIDI_PITCH;
}>;

export type PitchProjectionResult =
  | Readonly<{ ok: true; value: EqualTemperamentProjection }>
  | Readonly<{ ok: false; refusal: PitchProjectionRefusal }>;

export type SpelledPitchClassComparison = Comparison;
export type SpelledPitchComparison = Comparison;

function isStep(received: string): received is Step {
  return (
    received === "C" ||
    received === "D" ||
    received === "E" ||
    received === "F" ||
    received === "G" ||
    received === "A" ||
    received === "B"
  );
}

function isAlteration(received: number): received is Alteration {
  return (
    received === -2 ||
    received === -1 ||
    received === 0 ||
    received === 1 ||
    received === 2
  );
}

function naturalPitchClass(step: Step): PitchClass {
  switch (step) {
    case "C":
      return 0;
    case "D":
      return 2;
    case "E":
      return 4;
    case "F":
      return 5;
    case "G":
      return 7;
    case "A":
      return 9;
    case "B":
      return 11;
  }
}

function stepIndex(step: Step): number {
  switch (step) {
    case "C":
      return 0;
    case "D":
      return 1;
    case "E":
      return 2;
    case "F":
      return 3;
    case "G":
      return 4;
    case "A":
      return 5;
    case "B":
      return 6;
  }
}

function asPitchClass(received: number): PitchClass {
  // The only caller applies Euclidean modulo 12 immediately beforehand.
  return received as PitchClass;
}

function compareNumbers(left: number, right: number): Comparison {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function makeSpelledPitchClass(
  input: SpelledPitchClassInput,
): SpelledPitchClassResult {
  if (!isStep(input.step)) {
    return {
      ok: false,
      refusal: {
        code: "pitch.step_invalid",
        path: ["step"],
        received: input.step,
      },
    };
  }
  if (!isAlteration(input.alter)) {
    return {
      ok: false,
      refusal: {
        code: "pitch.alter_out_of_range",
        path: ["alter"],
        received: input.alter,
        minimum: MIN_ALTERATION,
        maximum: MAX_ALTERATION,
      },
    };
  }
  return {
    ok: true,
    value: Object.freeze({ step: input.step, alter: input.alter }),
  };
}

export function makeSpelledPitch(input: SpelledPitchInput): SpelledPitchResult {
  const pitchClass = makeSpelledPitchClass(input);
  if (!pitchClass.ok) return pitchClass;

  if (!Number.isInteger(input.octave)) {
    return {
      ok: false,
      refusal: {
        code: "pitch.octave_not_integer",
        path: ["octave"],
        received: input.octave,
      },
    };
  }
  if (!Number.isSafeInteger(input.octave)) {
    return {
      ok: false,
      refusal: {
        code: "pitch.octave_not_safe_integer",
        path: ["octave"],
        received: input.octave,
      },
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      step: pitchClass.value.step,
      alter: pitchClass.value.alter,
      octave: input.octave,
    }),
  };
}

export function makeMidiPitch(received: number): MidiPitchResult {
  if (!Number.isInteger(received)) {
    return {
      ok: false,
      refusal: {
        code: "pitch.midi_not_integer",
        path: ["midi"],
        received,
      },
    };
  }
  if (received < MIN_MIDI_PITCH || received > MAX_MIDI_PITCH) {
    return {
      ok: false,
      refusal: {
        code: "pitch.midi_out_of_range",
        path: ["midi"],
        received,
        minimum: MIN_MIDI_PITCH,
        maximum: MAX_MIDI_PITCH,
      },
    };
  }
  return { ok: true, value: received as MidiPitch };
}

export function pitchClassOf(pitch: SpelledPitchClass): PitchClass {
  const projected = naturalPitchClass(pitch.step) + pitch.alter;
  return asPitchClass(((projected % 12) + 12) % 12);
}

/** Exact SPN coordinate for comparisons that intentionally do not require MIDI. */
export function soundingSemitoneOf(pitch: SpelledPitch): bigint {
  return (
    12n * (BigInt(pitch.octave) + 1n) +
    BigInt(naturalPitchClass(pitch.step)) +
    BigInt(pitch.alter)
  );
}

export function projectSpelledPitch(
  pitch: SpelledPitch,
): PitchProjectionResult {
  const exactMidi = soundingSemitoneOf(pitch);
  const minimum = BigInt(MIN_MIDI_PITCH);
  const maximum = BigInt(MAX_MIDI_PITCH);
  if (exactMidi < minimum || exactMidi > maximum) {
    return {
      ok: false,
      refusal: {
        code: "pitch.midi_out_of_range",
        path: ["octave"],
        spelled: pitch,
        projectedMidi: Number(exactMidi),
        minimum: MIN_MIDI_PITCH,
        maximum: MAX_MIDI_PITCH,
      },
    };
  }

  // The exact BigInt bounds above establish the nominal MIDI invariant without
  // introducing an impossible exception branch into this total operation.
  const midi = Number(exactMidi) as MidiPitch;
  return {
    ok: true,
    value: Object.freeze({
      spelled: pitch,
      pitchClass: pitchClassOf(pitch),
      midi,
      frequencyHz: frequencyForMidi(midi),
    }),
  };
}

export function frequencyForMidi(midi: MidiPitch): number {
  return CONCERT_A_FREQUENCY_HZ * 2 ** ((midi - CONCERT_A_MIDI) / 12);
}

export function compareSpelledPitchClasses(
  left: SpelledPitchClass,
  right: SpelledPitchClass,
): SpelledPitchClassComparison {
  const stepComparison = compareNumbers(stepIndex(left.step), stepIndex(right.step));
  if (stepComparison !== 0) return stepComparison;
  return compareNumbers(left.alter, right.alter);
}

export function compareSpelledPitches(
  left: SpelledPitch,
  right: SpelledPitch,
): SpelledPitchComparison {
  const octaveComparison = compareNumbers(left.octave, right.octave);
  if (octaveComparison !== 0) return octaveComparison;
  return compareSpelledPitchClasses(left, right);
}
