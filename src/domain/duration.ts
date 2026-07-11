export const MIDI_PPQ = 960;
export const MAX_NORMALIZED_BEAT_NUMERATOR = 2_147_483_647;
export const MAX_TIMELINE_QUARTER_NOTE_BEATS = 1_000_000;
export const MIN_TEMPO_BPM = 20;
export const MAX_TEMPO_BPM = 400;
export const MIN_BEATS_PER_BAR = 1;
export const MAX_BEATS_PER_BAR = 32;
export const BEAT_UNITS = [2, 4, 8] as const;

export const ALLOWED_BEAT_DENOMINATORS = [
  1,
  2,
  3,
  4,
  5,
  6,
  8,
  10,
  12,
  15,
  16,
  20,
  24,
  30,
  32,
  40,
  48,
  60,
  64,
  80,
  96,
  120,
  160,
  192,
  240,
  320,
  480,
  960,
] as const;

export type BeatDenominator = (typeof ALLOWED_BEAT_DENOMINATORS)[number];
export type BeatUnit = (typeof BEAT_UNITS)[number];
export type BeatsPerBar =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32;

declare const normalizedBeatValueBrand: unique symbol;

/** Canonical, reduced quarter-note units. The denominator divides MIDI_PPQ. */
export type BeatValue = Readonly<{
  numerator: number;
  denominator: BeatDenominator;
  [normalizedBeatValueBrand]: "NormalizedBeatValue";
}>;

export type BeatValueInput = Readonly<{
  numerator: number;
  denominator: number;
}>;

export type MeterInput = Readonly<{
  beatsPerBar: number;
  beatUnit: number;
}>;

export type BeatDuration = BeatValue;
export type BeatPosition = BeatValue;

export type BeatRange = Readonly<{
  start: BeatPosition;
  end: BeatPosition;
}>;

export type Meter = Readonly<{
  beatsPerBar: BeatsPerBar;
  beatUnit: BeatUnit;
}>;

export type BeatValueRefusal =
  | Readonly<{ code: "beat.numerator_not_safe_integer"; received: number }>
  | Readonly<{ code: "beat.denominator_not_safe_integer"; received: number }>
  | Readonly<{ code: "beat.denominator_not_positive"; received: number }>
  | Readonly<{
      code: "beat.denominator_not_ppq_divisor";
      normalizedDenominator: number;
      ppq: typeof MIDI_PPQ;
    }>
  | Readonly<{
      code: "beat.numerator_out_of_range";
      normalizedNumeratorDecimal: string;
      maximum: typeof MAX_NORMALIZED_BEAT_NUMERATOR;
    }>
  | Readonly<{ code: "beat.numerator_negative"; normalizedNumeratorDecimal: string }>
  | Readonly<{ code: "beat.negative_result" }>
  | Readonly<{ code: "beat.duration_not_positive" }>;

/** Raw inputs reduce with BigInt before normalized bounds are applied. */
export type BeatValueResult =
  | Readonly<{ ok: true; value: BeatValue }>
  | Readonly<{ ok: false; refusal: BeatValueRefusal }>;

export type BeatArithmeticOperation = "add" | "subtract";

export type BeatArithmeticResult =
  | Readonly<{
      ok: true;
      operation: BeatArithmeticOperation;
      value: BeatValue;
    }>
  | Readonly<{
      ok: false;
      operation: BeatArithmeticOperation;
      refusal: BeatValueRefusal;
    }>;

export type MeterRefusal =
  | Readonly<{
      code: "meter.beats_per_bar_out_of_range";
      received: number;
      minimum: typeof MIN_BEATS_PER_BAR;
      maximum: typeof MAX_BEATS_PER_BAR;
    }>
  | Readonly<{ code: "meter.beat_unit_invalid"; received: number }>;

export type MeterResult =
  | Readonly<{ ok: true; value: Meter }>
  | Readonly<{ ok: false; refusal: MeterRefusal }>;

export type TempoRefusal =
  | Readonly<{ code: "tempo.not_finite"; received: number }>
  | Readonly<{ code: "tempo.not_integer"; received: number }>
  | Readonly<{
      code: "tempo.out_of_range";
      received: number;
      minimum: typeof MIN_TEMPO_BPM;
      maximum: typeof MAX_TEMPO_BPM;
    }>;

export type TempoResult =
  | Readonly<{ ok: true; value: number }>
  | Readonly<{ ok: false; refusal: TempoRefusal }>;

export type BeatRangeRefusal = Readonly<{
  code: "beat.range_empty";
  start: BeatPosition;
  end: BeatPosition;
}> | Readonly<{
  code: "beat.range_reversed";
  start: BeatPosition;
  end: BeatPosition;
}>;

export type BeatRangeResult =
  | Readonly<{ ok: true; value: BeatRange }>
  | Readonly<{ ok: false; refusal: BeatRangeRefusal }>;

export type TimelineAccumulationResult =
  | Readonly<{ ok: true; value: BeatDuration }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{
        code: "timeline.total_exceeded";
        maximumQuarterNoteBeats: typeof MAX_TIMELINE_QUARTER_NOTE_BEATS;
      }>;
    }>;
