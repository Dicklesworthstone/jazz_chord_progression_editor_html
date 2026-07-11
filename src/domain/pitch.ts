export const SPELLING_STEP_ORDER = ["C", "D", "E", "F", "G", "A", "B"] as const;
export const MIN_ALTERATION = -2;
export const MAX_ALTERATION = 2;
export const MIN_MIDI_PITCH = 0;
export const MAX_MIDI_PITCH = 127;
export const MIDDLE_C_MIDI = 60;
export const CONCERT_A_MIDI = 69;
export const CONCERT_A_FREQUENCY_HZ = 440;

export type Step = "A" | "B" | "C" | "D" | "E" | "F" | "G";
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
  | Readonly<{ code: "pitch.midi_not_integer"; received: number }>
  | Readonly<{
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
  | Readonly<{ code: "pitch.step_invalid"; received: string }>
  | Readonly<{
      code: "pitch.alter_out_of_range";
      received: number;
      minimum: typeof MIN_ALTERATION;
      maximum: typeof MAX_ALTERATION;
    }>
  | Readonly<{ code: "pitch.octave_not_integer"; received: number }>
  | Readonly<{ code: "pitch.octave_not_safe_integer"; received: number }>;

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

export type PitchProjectionRefusal = Readonly<{
  code: "pitch.midi_out_of_range";
  spelled: SpelledPitch;
  projectedMidi: number;
  minimum: typeof MIN_MIDI_PITCH;
  maximum: typeof MAX_MIDI_PITCH;
}>;

export type PitchProjectionResult =
  | Readonly<{ ok: true; value: EqualTemperamentProjection }>
  | Readonly<{ ok: false; refusal: PitchProjectionRefusal }>;
