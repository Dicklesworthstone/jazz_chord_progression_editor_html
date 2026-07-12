import type { Comparison, PathRefusal } from "./result";

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
declare const beatDurationBrand: unique symbol;
declare const beatPositionBrand: unique symbol;
declare const midiTickBrand: unique symbol;

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

/** Exact integer MIDI tick count at PPQ 960. */
export type MidiTick = number & { readonly [midiTickBrand]: "MidiTick" };

export type MeterInput = Readonly<{
  beatsPerBar: number;
  beatUnit: number;
}>;

/** Strict-positive canonical duration. It is not assignable from a position. */
export type BeatDuration = BeatValue & {
  readonly [beatDurationBrand]: "BeatDuration";
};

/** Nonnegative canonical position. Zero is valid and is not a duration. */
export type BeatPosition = BeatValue & {
  readonly [beatPositionBrand]: "BeatPosition";
};

export type BeatRange = Readonly<{
  start: BeatPosition;
  end: BeatPosition;
}>;

export type Meter = Readonly<{
  beatsPerBar: BeatsPerBar;
  beatUnit: BeatUnit;
}>;

export type BeatValueRefusal =
  | PathRefusal<{ code: "beat.numerator_not_safe_integer"; received: number }>
  | PathRefusal<{ code: "beat.denominator_not_safe_integer"; received: number }>
  | PathRefusal<{ code: "beat.denominator_not_positive"; received: number }>
  | PathRefusal<{
      code: "beat.denominator_not_ppq_divisor";
      normalizedDenominator: number;
      ppq: typeof MIDI_PPQ;
    }>
  | PathRefusal<{
      code: "beat.numerator_out_of_range";
      normalizedNumeratorDecimal: string;
      maximum: typeof MAX_NORMALIZED_BEAT_NUMERATOR;
    }>
  | PathRefusal<{ code: "beat.numerator_negative"; normalizedNumeratorDecimal: string }>
  | PathRefusal<{ code: "beat.negative_result" }>
  | PathRefusal<{ code: "beat.duration_not_positive" }>;

export type BeatNormalizationRefusal = Exclude<
  BeatValueRefusal,
  { code: "beat.negative_result" | "beat.duration_not_positive" }
>;
export type BeatDurationRefusal =
  | BeatNormalizationRefusal
  | Extract<BeatValueRefusal, { code: "beat.duration_not_positive" }>;
export type BeatSubtractionRefusal =
  | Extract<BeatValueRefusal, { code: "beat.negative_result" }>
  | Extract<BeatValueRefusal, { code: "beat.numerator_out_of_range" }>;

/** Raw inputs reduce with BigInt before normalized bounds are applied. */
export type BeatValueResult =
  | Readonly<{ ok: true; value: BeatValue }>
  | Readonly<{ ok: false; refusal: BeatNormalizationRefusal }>;

export type BeatPositionResult =
  | Readonly<{ ok: true; value: BeatPosition }>
  | Readonly<{ ok: false; refusal: BeatNormalizationRefusal }>;

export type BeatDurationResult =
  | Readonly<{ ok: true; value: BeatDuration }>
  | Readonly<{ ok: false; refusal: BeatDurationRefusal }>;

export type BeatArithmeticOperation = "add" | "subtract";

export type BeatAdditionResult =
  | Readonly<{ ok: true; value: BeatValue }>
  | Readonly<{
      ok: false;
      refusal: Extract<BeatValueRefusal, { code: "beat.numerator_out_of_range" }>;
    }>;

export type BeatSubtractionResult =
  | Readonly<{ ok: true; value: BeatValue }>
  | Readonly<{ ok: false; refusal: BeatSubtractionRefusal }>;

export type BeatArithmeticResult =
  | (BeatAdditionResult & Readonly<{ operation: "add" }>)
  | (BeatSubtractionResult & Readonly<{ operation: "subtract" }>);

export type BeatComparison = Comparison;

export type MeterRefusal =
  | PathRefusal<{
      code: "meter.beats_per_bar_out_of_range";
      received: number;
      minimum: typeof MIN_BEATS_PER_BAR;
      maximum: typeof MAX_BEATS_PER_BAR;
    }>
  | PathRefusal<{ code: "meter.beat_unit_invalid"; received: number }>;

export type MeterResult =
  | Readonly<{ ok: true; value: Meter }>
  | Readonly<{ ok: false; refusal: MeterRefusal }>;

export type TempoRefusal =
  | PathRefusal<{ code: "tempo.not_finite"; received: number }>
  | PathRefusal<{ code: "tempo.not_integer"; received: number }>
  | PathRefusal<{
      code: "tempo.out_of_range";
      received: number;
      minimum: typeof MIN_TEMPO_BPM;
      maximum: typeof MAX_TEMPO_BPM;
    }>;

export type TempoResult =
  | Readonly<{ ok: true; value: number }>
  | Readonly<{ ok: false; refusal: TempoRefusal }>;

export type BeatRangeRefusal = PathRefusal<{
  code: "beat.range_empty";
  start: BeatPosition;
  end: BeatPosition;
}> | PathRefusal<{
  code: "beat.range_reversed";
  start: BeatPosition;
  end: BeatPosition;
}>;

export type BeatRangeResult =
  | Readonly<{ ok: true; value: BeatRange }>
  | Readonly<{ ok: false; refusal: BeatRangeRefusal }>;

export type TimelineAccumulationResult =
  | Readonly<{ ok: true; value: BeatPosition }>
  | Readonly<{
      ok: false;
      refusal: PathRefusal<{
        code: "timeline.total_exceeded";
        maximumQuarterNoteBeats: typeof MAX_TIMELINE_QUARTER_NOTE_BEATS;
      }>;
    }>;

const EMPTY_PATH: readonly [] = Object.freeze([]);
const NUMERATOR_PATH: readonly ["numerator"] = Object.freeze(["numerator"]);
const DENOMINATOR_PATH: readonly ["denominator"] = Object.freeze([
  "denominator",
]);
const RANGE_END_PATH: readonly ["end"] = Object.freeze(["end"]);
const BEATS_PER_BAR_PATH: readonly ["beatsPerBar"] = Object.freeze([
  "beatsPerBar",
]);
const BEAT_UNIT_PATH: readonly ["beatUnit"] = Object.freeze(["beatUnit"]);

const MAX_NORMALIZED_BEAT_NUMERATOR_BIGINT = BigInt(
  MAX_NORMALIZED_BEAT_NUMERATOR,
);
const MIDI_PPQ_BIGINT = BigInt(MIDI_PPQ);
const MAX_TIMELINE_TICKS =
  BigInt(MAX_TIMELINE_QUARTER_NOTE_BEATS) * MIDI_PPQ_BIGINT;

function success<Value>(value: Value): Readonly<{ ok: true; value: Value }> {
  return Object.freeze({ ok: true, value });
}

function failure<Refusal>(
  refusal: Refusal,
): Readonly<{ ok: false; refusal: Refusal }> {
  return Object.freeze({ ok: false, refusal });
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let dividend = left < 0n ? -left : left;
  let divisor = right < 0n ? -right : right;

  while (divisor !== 0n) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }

  return dividend;
}

function reduceBeatFraction(
  numerator: bigint,
  denominator: bigint,
): readonly [numerator: bigint, denominator: bigint] {
  const divisor = greatestCommonDivisor(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
}

function canonicalBeatValue(
  numerator: bigint,
  denominator: bigint,
): BeatValue {
  return Object.freeze({
    numerator: Number(numerator),
    denominator: Number(denominator) as BeatDenominator,
  }) as BeatValue;
}

function canonicalBeatPosition(
  numerator: bigint,
  denominator: bigint,
): BeatPosition {
  return canonicalBeatValue(numerator, denominator) as BeatPosition;
}

function canonicalBeatDuration(
  numerator: bigint,
  denominator: bigint,
): BeatDuration {
  return canonicalBeatValue(numerator, denominator) as BeatDuration;
}

function arithmeticValue(
  numerator: bigint,
  denominator: bigint,
): BeatAdditionResult {
  const [reducedNumerator, reducedDenominator] = reduceBeatFraction(
    numerator,
    denominator,
  );

  if (reducedNumerator > MAX_NORMALIZED_BEAT_NUMERATOR_BIGINT) {
    return failure(
      Object.freeze({
        code: "beat.numerator_out_of_range" as const,
        path: EMPTY_PATH,
        normalizedNumeratorDecimal: reducedNumerator.toString(),
        maximum: MAX_NORMALIZED_BEAT_NUMERATOR,
      }),
    );
  }

  return success(canonicalBeatValue(reducedNumerator, reducedDenominator));
}

/** Normalize a raw quarter-note rational before applying canonical bounds. */
export function normalizeBeatValue(input: BeatValueInput): BeatValueResult {
  const { numerator, denominator } = input;

  if (!Number.isSafeInteger(numerator)) {
    return failure(
      Object.freeze({
        code: "beat.numerator_not_safe_integer" as const,
        path: NUMERATOR_PATH,
        received: numerator,
      }),
    );
  }

  if (!Number.isSafeInteger(denominator)) {
    return failure(
      Object.freeze({
        code: "beat.denominator_not_safe_integer" as const,
        path: DENOMINATOR_PATH,
        received: denominator,
      }),
    );
  }

  if (numerator < 0) {
    return failure(
      Object.freeze({
        code: "beat.numerator_negative" as const,
        path: NUMERATOR_PATH,
        normalizedNumeratorDecimal: BigInt(numerator).toString(),
      }),
    );
  }

  if (denominator <= 0) {
    return failure(
      Object.freeze({
        code: "beat.denominator_not_positive" as const,
        path: DENOMINATOR_PATH,
        received: denominator,
      }),
    );
  }

  const [reducedNumerator, reducedDenominator] = reduceBeatFraction(
    BigInt(numerator),
    BigInt(denominator),
  );

  if (reducedNumerator > MAX_NORMALIZED_BEAT_NUMERATOR_BIGINT) {
    return failure(
      Object.freeze({
        code: "beat.numerator_out_of_range" as const,
        path: NUMERATOR_PATH,
        normalizedNumeratorDecimal: reducedNumerator.toString(),
        maximum: MAX_NORMALIZED_BEAT_NUMERATOR,
      }),
    );
  }

  if (MIDI_PPQ_BIGINT % reducedDenominator !== 0n) {
    return failure(
      Object.freeze({
        code: "beat.denominator_not_ppq_divisor" as const,
        path: DENOMINATOR_PATH,
        normalizedDenominator: Number(reducedDenominator),
        ppq: MIDI_PPQ,
      }),
    );
  }

  return success(canonicalBeatValue(reducedNumerator, reducedDenominator));
}

/** Construct a nonnegative exact timeline position. */
export function makeBeatPosition(input: BeatValueInput): BeatPositionResult {
  const normalized = normalizeBeatValue(input);
  if (!normalized.ok) return normalized;

  return success(
    canonicalBeatPosition(
      BigInt(normalized.value.numerator),
      BigInt(normalized.value.denominator),
    ),
  );
}

/** Construct a strictly positive exact beat duration. */
export function makeBeatDuration(input: BeatValueInput): BeatDurationResult {
  const normalized = normalizeBeatValue(input);
  if (!normalized.ok) return normalized;

  if (normalized.value.numerator === 0) {
    return failure(
      Object.freeze({
        code: "beat.duration_not_positive" as const,
        path: NUMERATOR_PATH,
      }),
    );
  }

  return success(
    canonicalBeatDuration(
      BigInt(normalized.value.numerator),
      BigInt(normalized.value.denominator),
    ),
  );
}

/** Add two canonical values exactly, refusing only a normalized bound overflow. */
export function addBeatValues(
  left: BeatValue,
  right: BeatValue,
): BeatAdditionResult {
  const numerator =
    BigInt(left.numerator) * BigInt(right.denominator) +
    BigInt(right.numerator) * BigInt(left.denominator);
  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  return arithmeticValue(numerator, denominator);
}

/** Subtract two canonical values exactly without permitting underflow. */
export function subtractBeatValues(
  left: BeatValue,
  right: BeatValue,
): BeatSubtractionResult {
  const numerator =
    BigInt(left.numerator) * BigInt(right.denominator) -
    BigInt(right.numerator) * BigInt(left.denominator);

  if (numerator < 0n) {
    return failure(
      Object.freeze({
        code: "beat.negative_result" as const,
        path: EMPTY_PATH,
      }),
    );
  }

  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  return arithmeticValue(numerator, denominator);
}

/** Compare two canonical values by exact cross-products. */
export function compareBeatValues(
  left: BeatValue,
  right: BeatValue,
): BeatComparison {
  const leftProduct = BigInt(left.numerator) * BigInt(right.denominator);
  const rightProduct = BigInt(right.numerator) * BigInt(left.denominator);
  if (leftProduct < rightProduct) return -1;
  if (leftProduct > rightProduct) return 1;
  return 0;
}

/** Convert a canonical beat value to an exact integer tick at PPQ 960. */
export function beatValueToMidiTicks(value: BeatValue): MidiTick {
  const ticks =
    (BigInt(value.numerator) * MIDI_PPQ_BIGINT) /
    BigInt(value.denominator);
  return Number(ticks) as MidiTick;
}

/** Construct a nonempty, forward exact beat range. */
export function makeBeatRange(
  start: BeatPosition,
  end: BeatPosition,
): BeatRangeResult {
  const ordering = compareBeatValues(start, end);

  if (ordering === 0) {
    return failure(
      Object.freeze({
        code: "beat.range_empty" as const,
        path: RANGE_END_PATH,
        start,
        end,
      }),
    );
  }

  if (ordering > 0) {
    return failure(
      Object.freeze({
        code: "beat.range_reversed" as const,
        path: RANGE_END_PATH,
        start,
        end,
      }),
    );
  }

  return success(
    Object.freeze({ start, end }),
  );
}

/** Fold exact durations into a position under the document timeline ceiling. */
export function accumulateTimeline(
  durations: readonly BeatDuration[],
): TimelineAccumulationResult {
  let totalTicks = 0n;

  for (const duration of durations) {
    totalTicks +=
      (BigInt(duration.numerator) * MIDI_PPQ_BIGINT) /
      BigInt(duration.denominator);

    if (totalTicks > MAX_TIMELINE_TICKS) {
      return failure(
        Object.freeze({
          code: "timeline.total_exceeded" as const,
          path: EMPTY_PATH,
          maximumQuarterNoteBeats: MAX_TIMELINE_QUARTER_NOTE_BEATS,
        }),
      );
    }
  }

  const [numerator, denominator] = reduceBeatFraction(
    totalTicks,
    MIDI_PPQ_BIGINT,
  );
  return success(canonicalBeatPosition(numerator, denominator));
}

/** Validate the bounded meter values stored by the domain. */
export function makeMeter(input: MeterInput): MeterResult {
  const { beatsPerBar, beatUnit } = input;

  if (
    !Number.isInteger(beatsPerBar) ||
    beatsPerBar < MIN_BEATS_PER_BAR ||
    beatsPerBar > MAX_BEATS_PER_BAR
  ) {
    return failure(
      Object.freeze({
        code: "meter.beats_per_bar_out_of_range" as const,
        path: BEATS_PER_BAR_PATH,
        received: beatsPerBar,
        minimum: MIN_BEATS_PER_BAR,
        maximum: MAX_BEATS_PER_BAR,
      }),
    );
  }

  if (beatUnit !== 2 && beatUnit !== 4 && beatUnit !== 8) {
    return failure(
      Object.freeze({
        code: "meter.beat_unit_invalid" as const,
        path: BEAT_UNIT_PATH,
        received: beatUnit,
      }),
    );
  }

  return success(
    Object.freeze({
      beatsPerBar: beatsPerBar as BeatsPerBar,
      beatUnit,
    }),
  );
}

/** Validate quarter-note beats per minute without coercion or rounding. */
export function makeTempoBpm(received: number): TempoResult {
  if (!Number.isFinite(received)) {
    return failure(
      Object.freeze({
        code: "tempo.not_finite" as const,
        path: EMPTY_PATH,
        received,
      }),
    );
  }

  if (!Number.isInteger(received)) {
    return failure(
      Object.freeze({
        code: "tempo.not_integer" as const,
        path: EMPTY_PATH,
        received,
      }),
    );
  }

  if (received < MIN_TEMPO_BPM || received > MAX_TEMPO_BPM) {
    return failure(
      Object.freeze({
        code: "tempo.out_of_range" as const,
        path: EMPTY_PATH,
        received,
        minimum: MIN_TEMPO_BPM,
        maximum: MAX_TEMPO_BPM,
      }),
    );
  }

  return success(received);
}

/** Return exact quarter-note capacity for a validated meter. */
export function measureCapacity(meter: Meter): BeatDuration {
  const [numerator, denominator] = reduceBeatFraction(
    BigInt(meter.beatsPerBar) * 4n,
    BigInt(meter.beatUnit),
  );
  return canonicalBeatDuration(numerator, denominator);
}
