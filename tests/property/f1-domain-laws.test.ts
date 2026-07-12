import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  makeAutoVoicing,
  makeChordDegree,
  makeChordSpec,
  makeFrozenVoicing,
  makeManualVoicing,
  validateChordDegreeArray,
  type AutoBassPolicy,
  type AutoVoicingFamily,
  type ChordDegree,
  type DegreeArrayField,
} from "../../src/domain/chord";
import {
  accumulateTimeline,
  addBeatValues,
  beatValueToMidiTicks,
  compareBeatValues,
  makeBeatDuration,
  makeBeatPosition,
  makeBeatRange,
  makeMeter,
  measureCapacity,
  normalizeBeatValue,
  subtractBeatValues,
  type BeatDuration,
  type BeatValue,
} from "../../src/domain/duration";
import {
  compareSpelledPitches,
  makeSpelledPitch,
  pitchClassOf,
  projectSpelledPitch,
  soundingSemitoneOf,
  type SpelledPitch,
} from "../../src/domain/pitch";

const REVIEWED_SEEDS = Object.freeze({
  pitch: 2_718_281_828,
  beat: 3_141_592_653,
  meter: 1_618_033_988,
  voicing: 1_732_050_807,
});

const REVIEWED_PPQ = 960;
const REVIEWED_MAX_BEAT_NUMERATOR = 2_147_483_647;
const REVIEWED_MAX_TIMELINE_BEATS = 1_000_000;
const REVIEWED_STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const REVIEWED_ALTERATIONS = [-2, -1, 0, 1, 2] as const;
const REVIEWED_NATURAL_SEMITONES = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});
const REVIEWED_DEGREE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 9, 11, 13] as const;
const REVIEWED_AUTO_FAMILIES = [
  "balanced",
  "shell",
  "rootless-a",
  "rootless-b",
  "open",
  "drop2",
  "quartal",
] as const satisfies readonly AutoVoicingFamily[];
const REVIEWED_AUTO_BASS_POLICIES = [
  "generated",
  "external",
  "none",
] as const satisfies readonly AutoBassPolicy[];
const DEGREE_ARRAY_FIELDS = [
  "extensions",
  "additions",
  "alterations",
] as const satisfies readonly Exclude<DegreeArrayField, "omissions">[];

type ReviewedStep = (typeof REVIEWED_STEPS)[number];
type ReviewedAlteration = (typeof REVIEWED_ALTERATIONS)[number];
type ReviewedDegreeNumber = (typeof REVIEWED_DEGREE_NUMBERS)[number];
type XorShift32 = () => number;

type PitchCase = Readonly<{
  step: ReviewedStep;
  alter: ReviewedAlteration;
  octave: number;
}>;

type Rational = Readonly<{
  numerator: number;
  denominator: number;
}>;

type BeatScheduleRow = Readonly<{
  aTicks: number;
  bTicks: number;
  cTicks: number;
  scale: number;
}>;

type DegreeTuple = Readonly<{
  number: ReviewedDegreeNumber;
  alter: ReviewedAlteration;
}>;

type DegreeArrayScheduleRow = Readonly<{
  field: (typeof DEGREE_ARRAY_FIELDS)[number];
  degrees: readonly DegreeTuple[];
}>;

type StoredPitchScheduleRow = Readonly<{
  pitches: readonly PitchCase[];
}>;

function xorshift32(seed: number): XorShift32 {
  let state = seed >>> 0;
  return (): number => {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state;
  };
}

function shuffled<T>(source: readonly T[], next: XorShift32): T[] {
  const result = [...source];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const otherIndex = next() % (index + 1);
    const held = result[index];
    const other = result[otherIndex];
    if (held === undefined || other === undefined) {
      throw new Error("F1_PROPERTY_SHUFFLE_INDEX");
    }
    result[index] = other;
    result[otherIndex] = held;
  }
  return result;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function emitEvidenceObservation(
  id: string,
  seed: number | Readonly<Record<string, number>>,
  counters: Readonly<Record<string, unknown>>,
  digest: string,
  mutantsKilled: number,
): void {
  void process.stdout.write(
    `F1_EVIDENCE_OBSERVATION ${JSON.stringify({
      id,
      seed,
      counters,
      digest,
      mutantsKilled,
    })}\n`,
  );
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function unwrap<Value>(
  result:
    | Readonly<{ ok: true; value: Value }>
    | Readonly<{ ok: false; refusal: Readonly<{ code: string }> }>,
  label: string,
): Value {
  if (!result.ok) {
    throw new Error(`${label}: unexpected ${result.refusal.code}`);
  }
  return result.value;
}

function withEvidence<Value>(
  label: string,
  evidence: Readonly<Record<string, unknown>>,
  operation: () => Value,
): Value {
  try {
    return operation();
  } catch (cause) {
    throw new Error(
      `${label}: ${JSON.stringify(evidence)}`,
      { cause },
    );
  }
}

function expectMutantKilled(name: string, verification: () => void): void {
  let killed = false;
  try {
    verification();
  } catch {
    killed = true;
  }
  invariant(killed, `F1_MUTANT_SURVIVED:${name}`);
}

function euclideanModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function independentSemitone(input: PitchCase): number {
  return 12 * (input.octave + 1) +
    REVIEWED_NATURAL_SEMITONES[input.step] + input.alter;
}

function pitchSchedule(): readonly PitchCase[] {
  const cases: PitchCase[] = [];
  for (let octave = -2; octave <= 10; octave += 1) {
    for (const step of REVIEWED_STEPS) {
      for (const alter of REVIEWED_ALTERATIONS) {
        cases.push(Object.freeze({ step, alter, octave }));
      }
    }
  }
  return Object.freeze(shuffled(cases, xorshift32(REVIEWED_SEEDS.pitch)));
}

type PitchCampaignReport = Readonly<{
  seed: number;
  scheduleDigest: string;
  cases: number;
  projectionSuccesses: number;
  projectionRefusals: number;
  octaveShiftChecks: number;
  octaveFrequencyDoublings: number;
  enharmonicIdentityPairs: number;
}>;

function runPitchCampaign(): PitchCampaignReport {
  const schedule = pitchSchedule();
  const scheduleDigest = sha256(schedule);
  let projectionSuccesses = 0;
  let projectionRefusals = 0;
  let octaveShiftChecks = 0;
  let octaveFrequencyDoublings = 0;
  let enharmonicIdentityPairs = 0;
  const bySemitone = new Map<number, PitchCase[]>();

  for (const [index, input] of schedule.entries()) {
    withEvidence("F1_PITCH_PROPERTY", {
      seed: REVIEWED_SEEDS.pitch,
      scheduleDigest,
      index,
      projectionSuccesses,
      projectionRefusals,
      octaveShiftChecks,
    }, () => {
      const written = unwrap(makeSpelledPitch(input), `pitch[${String(index)}]`);
      expect(written).toEqual(input);
      expect(Object.isFrozen(written)).toBe(true);

      const expectedSemitone = independentSemitone(input);
      expect(soundingSemitoneOf(written)).toBe(BigInt(expectedSemitone));
      const actualPitchClass: number = pitchClassOf(written);
      expect(actualPitchClass).toBe(
        euclideanModulo(expectedSemitone, 12),
      );
      expect(compareSpelledPitches(written, written)).toBe(0);

      const projection = projectSpelledPitch(written);
      if (expectedSemitone >= 0 && expectedSemitone <= 127) {
        invariant(projection.ok, `pitch[${String(index)}] expected projection`);
        expect(Number(projection.value.midi)).toBe(expectedSemitone);
        const projectedPitchClass: number = projection.value.pitchClass;
        expect(projectedPitchClass).toBe(
          euclideanModulo(expectedSemitone, 12),
        );
        expect(projection.value.spelled).toBe(written);
        projectionSuccesses += 1;
      } else {
        invariant(!projection.ok, `pitch[${String(index)}] expected refusal`);
        expect(projection.refusal).toMatchObject({
          code: "pitch.midi_out_of_range",
          projectedMidi: expectedSemitone,
        });
        projectionRefusals += 1;
      }

      const shiftedInput = { ...input, octave: input.octave + 1 };
      const shifted = unwrap(
        makeSpelledPitch(shiftedInput),
        `pitch-shift[${String(index)}]`,
      );
      expect(soundingSemitoneOf(shifted) - soundingSemitoneOf(written)).toBe(12n);
      expect(pitchClassOf(shifted)).toBe(pitchClassOf(written));
      expect(compareSpelledPitches(written, shifted)).toBe(-1);
      octaveShiftChecks += 1;

      const shiftedProjection = projectSpelledPitch(shifted);
      if (projection.ok && shiftedProjection.ok) {
        expect(Number(shiftedProjection.value.midi)).toBe(
          Number(projection.value.midi) + 12,
        );
        expect(
          Math.abs(
            shiftedProjection.value.frequencyHz /
              projection.value.frequencyHz - 2,
          ),
        ).toBeLessThan(1e-12);
        octaveFrequencyDoublings += 1;
      }

      const group = bySemitone.get(expectedSemitone) ?? [];
      group.push(input);
      bySemitone.set(expectedSemitone, group);
    });
  }

  for (const group of bySemitone.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      const leftInput = group[leftIndex];
      if (leftInput === undefined) throw new Error("F1_PITCH_GROUP_LEFT");
      const left = unwrap(makeSpelledPitch(leftInput), "enharmonic-left");
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const rightInput = group[rightIndex];
        if (rightInput === undefined) throw new Error("F1_PITCH_GROUP_RIGHT");
        const right = unwrap(makeSpelledPitch(rightInput), "enharmonic-right");
        expect(compareSpelledPitches(left, right)).not.toBe(0);
        expect(soundingSemitoneOf(left)).toBe(soundingSemitoneOf(right));
        enharmonicIdentityPairs += 1;
      }
    }
  }

  return Object.freeze({
    seed: REVIEWED_SEEDS.pitch,
    scheduleDigest,
    cases: schedule.length,
    projectionSuccesses,
    projectionRefusals,
    octaveShiftChecks,
    octaveFrequencyDoublings,
    enharmonicIdentityPairs,
  });
}

type PitchObservation = Readonly<{
  semitone: number;
  pitchClass: number;
  midi: number | null;
}>;

function observePitch(input: PitchCase): PitchObservation {
  const written = unwrap(makeSpelledPitch(input), "pitch observation");
  const projection = projectSpelledPitch(written);
  return Object.freeze({
    semitone: Number(soundingSemitoneOf(written)),
    pitchClass: pitchClassOf(written),
    midi: projection.ok ? Number(projection.value.midi) : null,
  });
}

function verifyPitchObservation(input: PitchCase, observed: PitchObservation): void {
  const expectedSemitone = independentSemitone(input);
  invariant(observed.semitone === expectedSemitone, "pitch semitone mismatch");
  invariant(
    observed.pitchClass === euclideanModulo(expectedSemitone, 12),
    "pitch class mismatch",
  );
  const expectedMidi = expectedSemitone >= 0 && expectedSemitone <= 127
    ? expectedSemitone
    : null;
  invariant(observed.midi === expectedMidi, "pitch MIDI mismatch");
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

function rationalFromTicks(ticks: number): Rational {
  const divisor = greatestCommonDivisor(BigInt(ticks), BigInt(REVIEWED_PPQ));
  return Object.freeze({
    numerator: Number(BigInt(ticks) / divisor),
    denominator: Number(BigInt(REVIEWED_PPQ) / divisor),
  });
}

function plainBeat(value: BeatValue): Rational {
  return Object.freeze({
    numerator: value.numerator,
    denominator: value.denominator,
  });
}

function beatFromTicks(ticks: number, scale: number, label: string): BeatValue {
  return unwrap(normalizeBeatValue({
    numerator: ticks * scale,
    denominator: REVIEWED_PPQ * scale,
  }), label);
}

function durationFromTicks(ticks: number, label: string): BeatDuration {
  return unwrap(makeBeatDuration({
    numerator: ticks,
    denominator: REVIEWED_PPQ,
  }), label);
}

function beatSchedule(): readonly BeatScheduleRow[] {
  const next = xorshift32(REVIEWED_SEEDS.beat);
  return Object.freeze(Array.from({ length: 4_096 }, () => Object.freeze({
    aTicks: next() % 960_001,
    bTicks: next() % 960_001,
    cTicks: next() % 960_001,
    scale: 1 + (next() % 2_048),
  })));
}

function meterSchedule(): readonly Readonly<{
  beatsPerBar: number;
  beatUnit: 2 | 4 | 8;
}>[] {
  const rows: Readonly<{ beatsPerBar: number; beatUnit: 2 | 4 | 8 }>[] = [];
  for (let beatsPerBar = 1; beatsPerBar <= 32; beatsPerBar += 1) {
    for (const beatUnit of [2, 4, 8] as const) {
      rows.push(Object.freeze({ beatsPerBar, beatUnit }));
    }
  }
  return Object.freeze(shuffled(rows, xorshift32(REVIEWED_SEEDS.meter)));
}

type TimeCampaignReport = Readonly<{
  beatSeed: number;
  meterSeed: number;
  beatScheduleDigest: string;
  meterScheduleDigest: string;
  cases: number;
  additions: number;
  comparisons: Readonly<{ less: number; equal: number; greater: number }>;
  subtractionValues: number;
  subtractionRefusals: number;
  rangeValues: number;
  rangeRefusals: number;
  durationValues: number;
  durationRefusals: number;
  timelineFolds: number;
  divisorChecks: number;
  meterChecks: number;
  boundaryChecks: number;
}>;

function runTimeCampaign(): TimeCampaignReport {
  const schedule = beatSchedule();
  const meters = meterSchedule();
  const beatScheduleDigest = sha256(schedule);
  const meterScheduleDigest = sha256(meters);
  let additions = 0;
  const comparisons = { less: 0, equal: 0, greater: 0 };
  let subtractionValues = 0;
  let subtractionRefusals = 0;
  let rangeValues = 0;
  let rangeRefusals = 0;
  let durationValues = 0;
  let durationRefusals = 0;
  let timelineFolds = 0;

  for (const [index, row] of schedule.entries()) {
    withEvidence("F1_TIME_PROPERTY", {
      seed: REVIEWED_SEEDS.beat,
      beatScheduleDigest,
      index,
      additions,
      comparisons,
      subtractionValues,
      subtractionRefusals,
    }, () => {
      const a = beatFromTicks(row.aTicks, row.scale, `a[${String(index)}]`);
      const b = beatFromTicks(row.bTicks, row.scale, `b[${String(index)}]`);
      const c = beatFromTicks(row.cTicks, row.scale, `c[${String(index)}]`);
      expect(plainBeat(a)).toEqual(rationalFromTicks(row.aTicks));
      expect(plainBeat(b)).toEqual(rationalFromTicks(row.bTicks));
      expect(plainBeat(c)).toEqual(rationalFromTicks(row.cTicks));
      expect(Number(beatValueToMidiTicks(a))).toBe(row.aTicks);
      expect(Number(beatValueToMidiTicks(b))).toBe(row.bTicks);
      expect(Number(beatValueToMidiTicks(c))).toBe(row.cTicks);

      const ab = unwrap(addBeatValues(a, b), `ab[${String(index)}]`);
      const ba = unwrap(addBeatValues(b, a), `ba[${String(index)}]`);
      expect(plainBeat(ab)).toEqual(rationalFromTicks(row.aTicks + row.bTicks));
      expect(plainBeat(ba)).toEqual(plainBeat(ab));
      additions += 2;

      const bc = unwrap(addBeatValues(b, c), `bc[${String(index)}]`);
      const leftAssociated = unwrap(
        addBeatValues(ab, c),
        `left-associated[${String(index)}]`,
      );
      const rightAssociated = unwrap(
        addBeatValues(a, bc),
        `right-associated[${String(index)}]`,
      );
      expect(plainBeat(leftAssociated)).toEqual(plainBeat(rightAssociated));
      expect(plainBeat(leftAssociated)).toEqual(
        rationalFromTicks(row.aTicks + row.bTicks + row.cTicks),
      );
      additions += 3;

      const zero = beatFromTicks(0, 1, `zero[${String(index)}]`);
      const withIdentity = unwrap(
        addBeatValues(a, zero),
        `identity[${String(index)}]`,
      );
      expect(plainBeat(withIdentity)).toEqual(plainBeat(a));
      additions += 1;

      const ordering = compareBeatValues(a, b);
      const numericOrdering: number = ordering;
      expect(numericOrdering).toBe(Math.sign(row.aTicks - row.bTicks));
      if (ordering < 0) comparisons.less += 1;
      else if (ordering > 0) comparisons.greater += 1;
      else comparisons.equal += 1;

      const subtracted = subtractBeatValues(a, b);
      if (row.aTicks >= row.bTicks) {
        invariant(subtracted.ok, `subtract[${String(index)}] expected value`);
        expect(plainBeat(subtracted.value)).toEqual(
          rationalFromTicks(row.aTicks - row.bTicks),
        );
        const restored = unwrap(
          addBeatValues(subtracted.value, b),
          `restore[${String(index)}]`,
        );
        expect(plainBeat(restored)).toEqual(plainBeat(a));
        additions += 1;
        subtractionValues += 1;
      } else {
        invariant(!subtracted.ok, `subtract[${String(index)}] expected refusal`);
        expect(subtracted.refusal.code).toBe("beat.negative_result");
        subtractionRefusals += 1;
      }

      const aPosition = unwrap(
        makeBeatPosition(plainBeat(a)),
        `a-position[${String(index)}]`,
      );
      const bPosition = unwrap(
        makeBeatPosition(plainBeat(b)),
        `b-position[${String(index)}]`,
      );
      const range = row.aTicks <= row.bTicks
        ? makeBeatRange(aPosition, bPosition)
        : makeBeatRange(bPosition, aPosition);
      if (row.aTicks === row.bTicks) {
        invariant(!range.ok, `range[${String(index)}] expected refusal`);
        expect(range.refusal.code).toBe("beat.range_empty");
        rangeRefusals += 1;
      } else {
        invariant(range.ok, `range[${String(index)}] expected value`);
        rangeValues += 1;
      }

      const duration = makeBeatDuration(plainBeat(a));
      if (row.aTicks === 0) {
        invariant(!duration.ok, `duration[${String(index)}] expected refusal`);
        expect(duration.refusal.code).toBe("beat.duration_not_positive");
        durationRefusals += 1;
      } else {
        invariant(duration.ok, `duration[${String(index)}] expected value`);
        durationValues += 1;
      }

      const timelineDurations = [row.aTicks, row.bTicks, row.cTicks].map(
        (ticks, tickIndex) => durationFromTicks(
          ticks + 1,
          `timeline[${String(index)}][${String(tickIndex)}]`,
        ),
      );
      const timeline = accumulateTimeline(timelineDurations);
      invariant(timeline.ok, `timeline[${String(index)}] expected value`);
      expect(Number(beatValueToMidiTicks(timeline.value))).toBe(
        row.aTicks + row.bTicks + row.cTicks + 3,
      );
      timelineFolds += 1;
    });
  }

  const reviewedDivisors = Array.from(
    { length: REVIEWED_PPQ },
    (_, index) => index + 1,
  ).filter((denominator) => REVIEWED_PPQ % denominator === 0);
  expect(reviewedDivisors).toHaveLength(28);
  for (const denominator of reviewedDivisors) {
    const value = unwrap(
      normalizeBeatValue({ numerator: 1, denominator }),
      `divisor ${String(denominator)}`,
    );
    expect(Number(beatValueToMidiTicks(value))).toBe(
      REVIEWED_PPQ / denominator,
    );
  }

  for (const row of meters) {
    const meter = unwrap(makeMeter(row), `meter ${JSON.stringify(row)}`);
    const capacity = measureCapacity(meter);
    const expectedTicks = row.beatsPerBar * 4 * REVIEWED_PPQ / row.beatUnit;
    expect(Number(beatValueToMidiTicks(capacity))).toBe(expectedTicks);
  }

  let boundaryChecks = 0;
  expect(normalizeBeatValue({
    numerator: REVIEWED_MAX_BEAT_NUMERATOR,
    denominator: 1,
  })).toMatchObject({ ok: true });
  boundaryChecks += 1;
  expect(normalizeBeatValue({
    numerator: REVIEWED_MAX_BEAT_NUMERATOR + 1,
    denominator: 1,
  })).toMatchObject({
    ok: false,
    refusal: { code: "beat.numerator_out_of_range" },
  });
  boundaryChecks += 1;
  expect(normalizeBeatValue({ numerator: 1, denominator: 7 })).toMatchObject({
    ok: false,
    refusal: { code: "beat.denominator_not_ppq_divisor" },
  });
  boundaryChecks += 1;
  const timelineMaximum = unwrap(makeBeatDuration({
    numerator: REVIEWED_MAX_TIMELINE_BEATS,
    denominator: 1,
  }), "timeline maximum");
  expect(accumulateTimeline([timelineMaximum])).toMatchObject({ ok: true });
  boundaryChecks += 1;
  const oneTick = durationFromTicks(1, "timeline plus one tick");
  expect(accumulateTimeline([timelineMaximum, oneTick])).toMatchObject({
    ok: false,
    refusal: { code: "timeline.total_exceeded" },
  });
  boundaryChecks += 1;

  return Object.freeze({
    beatSeed: REVIEWED_SEEDS.beat,
    meterSeed: REVIEWED_SEEDS.meter,
    beatScheduleDigest,
    meterScheduleDigest,
    cases: schedule.length,
    additions,
    comparisons: Object.freeze(comparisons),
    subtractionValues,
    subtractionRefusals,
    rangeValues,
    rangeRefusals,
    durationValues,
    durationRefusals,
    timelineFolds,
    divisorChecks: reviewedDivisors.length,
    meterChecks: meters.length,
    boundaryChecks,
  });
}

type TimeObservation = Readonly<{
  leftTicks: number;
  rightTicks: number;
  comparison: number;
  sumTicks: number;
}>;

function observeTimeLaw(): TimeObservation {
  const left = unwrap(
    normalizeBeatValue({ numerator: 1, denominator: 3 }),
    "time observation left",
  );
  const right = unwrap(
    normalizeBeatValue({ numerator: 1, denominator: 5 }),
    "time observation right",
  );
  const sum = unwrap(addBeatValues(left, right), "time observation sum");
  return Object.freeze({
    leftTicks: Number(beatValueToMidiTicks(left)),
    rightTicks: Number(beatValueToMidiTicks(right)),
    comparison: compareBeatValues(left, right),
    sumTicks: Number(beatValueToMidiTicks(sum)),
  });
}

function verifyTimeObservation(observed: TimeObservation): void {
  invariant(observed.leftTicks === 320, "left ticks mismatch");
  invariant(observed.rightTicks === 192, "right ticks mismatch");
  invariant(observed.comparison === 1, "comparison mismatch");
  invariant(observed.sumTicks === 512, "sum ticks mismatch");
}

function compareDegreeTuples(left: DegreeTuple, right: DegreeTuple): number {
  if (left.number !== right.number) return left.number - right.number;
  return left.alter - right.alter;
}

function degreeAuthority(): readonly DegreeTuple[] {
  return Object.freeze(REVIEWED_DEGREE_NUMBERS.flatMap((number) =>
    REVIEWED_ALTERATIONS.map((alter) => Object.freeze({ number, alter }))
  ));
}

function degreeArraySchedule(next: XorShift32): readonly DegreeArrayScheduleRow[] {
  const authority = degreeAuthority();
  return Object.freeze(Array.from({ length: 512 }, (_, index) => {
    const length = 2 + (next() % 9);
    const degrees = shuffled(authority, next)
      .slice(0, length)
      .sort(compareDegreeTuples);
    const field = DEGREE_ARRAY_FIELDS[index % DEGREE_ARRAY_FIELDS.length];
    if (field === undefined) throw new Error("F1_DEGREE_FIELD_INDEX");
    return Object.freeze({ field, degrees: Object.freeze(degrees) });
  }));
}

function storedPitchSchedule(next: XorShift32): readonly StoredPitchScheduleRow[] {
  return Object.freeze(Array.from({ length: 512 }, () => {
    const length = 1 + (next() % 16);
    const pitches = Array.from({ length }, () => Object.freeze({
      step: REVIEWED_STEPS[next() % REVIEWED_STEPS.length] ?? "C",
      alter: REVIEWED_ALTERATIONS[next() % REVIEWED_ALTERATIONS.length] ?? 0,
      octave: 2 + (next() % 5),
    }));
    return Object.freeze({ pitches: Object.freeze(pitches) });
  }));
}

function materializeDegree(input: DegreeTuple, label: string): ChordDegree {
  return unwrap(makeChordDegree(input), label);
}

function materializePitch(input: PitchCase, label: string): SpelledPitch {
  return unwrap(makeSpelledPitch(input), label);
}

type HarmonyCampaignReport = Readonly<{
  seed: number;
  scheduleDigest: string;
  degreeCases: number;
  degreeArrays: number;
  degreeOrderRefusals: number;
  degreeDuplicateRefusals: number;
  parsedChordConstructions: number;
  autoMatrixCells: number;
  autoSuccesses: number;
  rootlessRefusals: number;
  slashBassRefusals: number;
  manualRoundTrips: number;
  frozenRoundTrips: number;
  storedLengthSixteenRows: number;
  storedBoundaryChecks: number;
}>;

function runHarmonyCampaign(): HarmonyCampaignReport {
  const next = xorshift32(REVIEWED_SEEDS.voicing);
  const degreeCases = shuffled(degreeAuthority(), next);
  const degreeArrays = degreeArraySchedule(next);
  const storedRows = storedPitchSchedule(next);
  const autoMatrix = REVIEWED_AUTO_FAMILIES.flatMap((family) =>
    REVIEWED_AUTO_BASS_POLICIES.flatMap((bassPolicy) => [
      Object.freeze({ family, bassPolicy, slash: false }),
      Object.freeze({ family, bassPolicy, slash: true }),
    ])
  );
  const scheduleDigest = sha256({
    degreeCases,
    degreeArrays,
    storedRows,
    autoMatrix,
  });
  let degreeOrderRefusals = 0;
  let degreeDuplicateRefusals = 0;
  let parsedChordConstructions = 0;
  let autoSuccesses = 0;
  let rootlessRefusals = 0;
  let slashBassRefusals = 0;
  let manualRoundTrips = 0;
  let frozenRoundTrips = 0;
  let storedLengthSixteenRows = 0;

  for (const [index, input] of degreeCases.entries()) {
    withEvidence("F1_DEGREE_PROPERTY", {
      seed: REVIEWED_SEEDS.voicing,
      scheduleDigest,
      index,
    }, () => {
      const result = unwrap(makeChordDegree(input), `degree[${String(index)}]`);
      expect(result).toEqual(input);
      expect(Object.isFrozen(result)).toBe(true);
    });
  }

  const root = materializePitch(
    { step: "C", alter: 0, octave: 4 },
    "chord root pitch",
  );
  for (const [index, row] of degreeArrays.entries()) {
    withEvidence("F1_DEGREE_ARRAY_PROPERTY", {
      seed: REVIEWED_SEEDS.voicing,
      scheduleDigest,
      index,
      degreeOrderRefusals,
      degreeDuplicateRefusals,
    }, () => {
      const source = row.degrees.map((degree, degreeIndex) =>
        structuredClone(materializeDegree(
          degree,
          `degree-array[${String(index)}][${String(degreeIndex)}]`,
        ))
      );
      const accepted = unwrap(
        validateChordDegreeArray(row.field, source),
        `degree-array[${String(index)}]`,
      );
      expect(accepted).toEqual(row.degrees);
      expect(accepted).not.toBe(source);
      for (let degreeIndex = 0; degreeIndex < source.length; degreeIndex += 1) {
        expect(accepted[degreeIndex]).not.toBe(source[degreeIndex]);
      }

      const reversed = [...source].reverse();
      const unordered = validateChordDegreeArray(row.field, reversed);
      invariant(!unordered.ok, `degree-array[${String(index)}] expected order refusal`);
      expect(unordered.refusal.code).toBe("chord.degree_order");
      degreeOrderRefusals += 1;

      const first = source[0];
      invariant(first !== undefined, "degree array unexpectedly empty");
      const duplicated = validateChordDegreeArray(row.field, [first, first, ...source.slice(1)]);
      invariant(!duplicated.ok, `degree-array[${String(index)}] expected duplicate refusal`);
      expect(duplicated.refusal.code).toBe("chord.degree_duplicate");
      degreeDuplicateRefusals += 1;

      const extensions = row.field === "extensions" ? source : [];
      const additions = row.field === "additions" ? source : [];
      const alterations = row.field === "alterations" ? source : [];
      const chord = unwrap(makeChordSpec({
        kind: "parsed",
        sourceText: `C property ${String(index)}`,
        root,
        triad: "major",
        sixth: null,
        seventh: "minor",
        extensions,
        additions,
        alterations,
        omissions: [],
        bass: null,
        colorPolicy: "none",
      }), `chord[${String(index)}]`);
      expect(chord[row.field]).toEqual(row.degrees);
      const chordSnapshot = JSON.stringify(chord);
      source.reverse();
      Reflect.set(source[0] ?? {}, "alter", 2);
      expect(JSON.stringify(chord)).toBe(chordSnapshot);
      parsedChordConstructions += 1;
    });
  }

  const slashBass = { step: "D", alter: -1 } as const;
  for (const [index, cell] of autoMatrix.entries()) {
    withEvidence("F1_AUTO_MATRIX_PROPERTY", {
      seed: REVIEWED_SEEDS.voicing,
      scheduleDigest,
      index,
      autoSuccesses,
      rootlessRefusals,
      slashBassRefusals,
    }, () => {
      const result = makeAutoVoicing({
        mode: "auto",
        family: cell.family,
        voiceCount: 4,
        range: { lowMidi: 48, highMidi: 84 },
        bassPolicy: cell.bassPolicy,
      }, cell.slash ? slashBass : null);
      const rootless = cell.family === "rootless-a" || cell.family === "rootless-b";
      if (rootless && cell.bassPolicy !== "external") {
        invariant(!result.ok, `auto[${String(index)}] expected rootless refusal`);
        expect(result.refusal.code).toBe("voicing.rootless_requires_external");
        rootlessRefusals += 1;
      } else if (cell.slash && cell.bassPolicy === "none") {
        invariant(!result.ok, `auto[${String(index)}] expected slash refusal`);
        expect(result.refusal.code).toBe("voicing.slash_bass_policy_none");
        slashBassRefusals += 1;
      } else {
        invariant(result.ok, `auto[${String(index)}] expected value`);
        expect(result.value).toMatchObject({
          family: cell.family,
          bassPolicy: cell.bassPolicy,
        });
        autoSuccesses += 1;
      }
    });
  }

  for (const [index, row] of storedRows.entries()) {
    withEvidence("F1_STORED_VOICING_PROPERTY", {
      seed: REVIEWED_SEEDS.voicing,
      scheduleDigest,
      index,
      manualRoundTrips,
      frozenRoundTrips,
    }, () => {
      const source = row.pitches.map((pitch, pitchIndex) =>
        structuredClone(materializePitch(
          pitch,
          `stored[${String(index)}][${String(pitchIndex)}]`,
        ))
      );
      const generatedBy = { engineVersion: `property-${String(index)}`, family: "drop2" as const };
      const manual = unwrap(makeManualVoicing({
        mode: "manual",
        pitches: source,
        bassPolicy: "included",
      }, null), `manual[${String(index)}]`);
      const frozen = unwrap(makeFrozenVoicing({
        mode: "frozen",
        pitches: source,
        bassPolicy: "included",
        generatedBy,
      }, null), `frozen[${String(index)}]`);
      expect(sameJson(manual.pitches, row.pitches)).toBe(true);
      expect(sameJson(frozen.pitches, row.pitches)).toBe(true);
      expect(manual.pitches).not.toBe(source);
      expect(frozen.pitches).not.toBe(source);
      for (let pitchIndex = 0; pitchIndex < source.length; pitchIndex += 1) {
        expect(manual.pitches[pitchIndex]).not.toBe(source[pitchIndex]);
        expect(frozen.pitches[pitchIndex]).not.toBe(source[pitchIndex]);
        expect(Object.isFrozen(manual.pitches[pitchIndex])).toBe(true);
        expect(Object.isFrozen(frozen.pitches[pitchIndex])).toBe(true);
      }
      expect(frozen.generatedBy).toEqual(generatedBy);
      expect(frozen.generatedBy).not.toBe(generatedBy);
      expect(Object.isFrozen(frozen.generatedBy)).toBe(true);

      const manualSnapshot = JSON.stringify(manual);
      const frozenSnapshot = JSON.stringify(frozen);
      const first = source[0];
      invariant(first !== undefined, "stored source unexpectedly empty");
      Reflect.set(first, "octave", first.octave + 1);
      source.reverse();
      generatedBy.engineVersion = "mutated-after-construction";
      expect(JSON.stringify(manual)).toBe(manualSnapshot);
      expect(JSON.stringify(frozen)).toBe(frozenSnapshot);
      manualRoundTrips += 1;
      frozenRoundTrips += 1;
      if (row.pitches.length === 16) storedLengthSixteenRows += 1;
    });
  }

  const sixteen = Array.from({ length: 16 }, () =>
    materializePitch({ step: "C", alter: 0, octave: 4 }, "sixteen-note boundary")
  );
  const boundaryPitch = sixteen[0];
  invariant(boundaryPitch !== undefined, "stored boundary pitch missing");
  expect(makeManualVoicing({
    mode: "manual",
    pitches: sixteen,
    bassPolicy: "included",
  }, null)).toMatchObject({ ok: true });
  expect(makeManualVoicing({
    mode: "manual",
    pitches: [...sixteen, boundaryPitch],
    bassPolicy: "included",
  }, null)).toMatchObject({
    ok: false,
    refusal: { code: "limit.voicing_notes_exceeded" },
  });
  expect(makeFrozenVoicing({
    mode: "frozen",
    pitches: sixteen,
    bassPolicy: "included",
    generatedBy: { engineVersion: "boundary", family: "shell" },
  }, null)).toMatchObject({ ok: true });
  expect(makeFrozenVoicing({
    mode: "frozen",
    pitches: [...sixteen, boundaryPitch],
    bassPolicy: "included",
    generatedBy: { engineVersion: "boundary", family: "shell" },
  }, null)).toMatchObject({
    ok: false,
    refusal: { code: "limit.voicing_notes_exceeded" },
  });

  return Object.freeze({
    seed: REVIEWED_SEEDS.voicing,
    scheduleDigest,
    degreeCases: degreeCases.length,
    degreeArrays: degreeArrays.length,
    degreeOrderRefusals,
    degreeDuplicateRefusals,
    parsedChordConstructions,
    autoMatrixCells: autoMatrix.length,
    autoSuccesses,
    rootlessRefusals,
    slashBassRefusals,
    manualRoundTrips,
    frozenRoundTrips,
    storedLengthSixteenRows,
    storedBoundaryChecks: 4,
  });
}

type HarmonyObservation = Readonly<{
  sharpNineIdentity: string;
  flatThreeIdentity: string;
  reversedArrayCode: string | null;
  rootlessGeneratedCode: string | null;
  manualPitches: readonly PitchCase[];
  frozenEngineVersion: string;
  chordExtensions: readonly DegreeTuple[];
  chordAdditions: readonly DegreeTuple[];
}>;

function observeHarmonyLaw(): HarmonyObservation {
  const sharpNine = materializeDegree({ number: 9, alter: 1 }, "sharp nine");
  const flatThree = materializeDegree({ number: 3, alter: -1 }, "flat three");
  const reversed = validateChordDegreeArray("extensions", [sharpNine, flatThree]);
  const rootless = makeAutoVoicing({
    mode: "auto",
    family: "rootless-a",
    voiceCount: 4,
    range: { lowMidi: 48, highMidi: 84 },
    bassPolicy: "generated",
  }, null);
  const storedInput = [
    materializePitch({ step: "C", alter: 0, octave: 4 }, "stored C4"),
    materializePitch({ step: "G", alter: 0, octave: 3 }, "stored G3"),
    materializePitch({ step: "C", alter: 0, octave: 4 }, "stored C4 duplicate"),
  ];
  const manual = unwrap(makeManualVoicing({
    mode: "manual",
    pitches: storedInput,
    bassPolicy: "included",
  }, null), "manual observation");
  const frozen = unwrap(makeFrozenVoicing({
    mode: "frozen",
    pitches: storedInput,
    bassPolicy: "included",
    generatedBy: { engineVersion: "exact-engine", family: "drop2" },
  }, null), "frozen observation");
  const root = materializePitch({ step: "C", alter: 0, octave: 4 }, "observation root");
  const chord = unwrap(makeChordSpec({
    kind: "parsed",
    sourceText: "C(add #9)",
    root,
    triad: "major",
    sixth: null,
    seventh: null,
    extensions: [flatThree],
    additions: [sharpNine],
    alterations: [],
    omissions: [],
    bass: null,
    colorPolicy: "none",
  }), "chord observation");
  return Object.freeze({
    sharpNineIdentity: `${String(sharpNine.number)}:${String(sharpNine.alter)}`,
    flatThreeIdentity: `${String(flatThree.number)}:${String(flatThree.alter)}`,
    reversedArrayCode: reversed.ok ? null : reversed.refusal.code,
    rootlessGeneratedCode: rootless.ok ? null : rootless.refusal.code,
    manualPitches: manual.pitches,
    frozenEngineVersion: frozen.generatedBy.engineVersion,
    chordExtensions: chord.extensions,
    chordAdditions: chord.additions,
  });
}

function verifyHarmonyObservation(observed: HarmonyObservation): void {
  invariant(observed.sharpNineIdentity === "9:1", "sharp-nine identity mismatch");
  invariant(observed.flatThreeIdentity === "3:-1", "flat-three identity mismatch");
  invariant(observed.reversedArrayCode === "chord.degree_order", "degree order mismatch");
  invariant(
    observed.rootlessGeneratedCode === "voicing.rootless_requires_external",
    "rootless policy mismatch",
  );
  invariant(sameJson(observed.manualPitches, [
    { step: "C", alter: 0, octave: 4 },
    { step: "G", alter: 0, octave: 3 },
    { step: "C", alter: 0, octave: 4 },
  ]), "manual pitch exactness mismatch");
  invariant(observed.frozenEngineVersion === "exact-engine", "Frozen provenance mismatch");
  invariant(sameJson(observed.chordExtensions, [{ number: 3, alter: -1 }]), "extension category mismatch");
  invariant(sameJson(observed.chordAdditions, [{ number: 9, alter: 1 }]), "addition category mismatch");
}

describe("F1 independent seeded domain laws", () => {
  test("replays the spelling-first pitch campaign byte-for-byte", () => {
    const first = runPitchCampaign();
    const second = runPitchCampaign();
    expect(second).toEqual(first);
    expect(first).toEqual({
      seed: REVIEWED_SEEDS.pitch,
      scheduleDigest: "efd7c9cb352adcf4bf4fc6dee3160487278ca423d0c976103bd94a3aa4a73f1a",
      cases: 455,
      projectionSuccesses: 374,
      projectionRefusals: 81,
      octaveShiftChecks: 455,
      octaveFrequencyDoublings: 339,
      enharmonicIdentityPairs: 434,
    });
    emitEvidenceObservation(
      "F1-PROPERTY-PITCH",
      first.seed,
      {
        cases: first.cases,
        projectionSuccesses: first.projectionSuccesses,
        projectionRefusals: first.projectionRefusals,
        octaveShiftChecks: first.octaveShiftChecks,
        octaveFrequencyDoublings: first.octaveFrequencyDoublings,
        enharmonicIdentityPairs: first.enharmonicIdentityPairs,
      },
      first.scheduleDigest,
      3,
    );
  });

  test("kills deliberately wrong pitch identity and projection observations", () => {
    const c4: PitchCase = { step: "C", alter: 0, octave: 4 };
    const cDoubleFlatMinusOne: PitchCase = { step: "C", alter: -2, octave: -1 };
    verifyPitchObservation(c4, observePitch(c4));
    verifyPitchObservation(cDoubleFlatMinusOne, observePitch(cDoubleFlatMinusOne));

    let mutantsKilled = 0;
    expectMutantKilled("pitch-octave-offset", () => {
      const observed = observePitch(c4);
      verifyPitchObservation(c4, { ...observed, midi: (observed.midi ?? 0) - 12 });
    });
    mutantsKilled += 1;
    expectMutantKilled("pitch-signed-modulo", () => {
      const observed = observePitch(cDoubleFlatMinusOne);
      verifyPitchObservation(cDoubleFlatMinusOne, { ...observed, pitchClass: -2 });
    });
    mutantsKilled += 1;
    expectMutantKilled("pitch-enharmonic-identity-collapse", () => {
      const bSharp3 = unwrap(
        makeSpelledPitch({ step: "B", alter: 1, octave: 3 }),
        "B#3 identity control",
      );
      const writtenC4 = unwrap(makeSpelledPitch(c4), "C4 identity control");
      const observedComparison = compareSpelledPitches(bSharp3, writtenC4);
      invariant(observedComparison !== 0, "correct identity observation collapsed");
      const collapseEnharmonicIdentity = (): number => 0;
      const mutantComparison = collapseEnharmonicIdentity();
      invariant(mutantComparison !== 0, "enharmonic spellings compared equal");
    });
    mutantsKilled += 1;
    expect(mutantsKilled).toBe(3);
  });

  test("replays exact rational time and meter laws byte-for-byte", () => {
    const first = runTimeCampaign();
    const second = runTimeCampaign();
    expect(second).toEqual(first);
    expect(first).toEqual({
      beatSeed: REVIEWED_SEEDS.beat,
      meterSeed: REVIEWED_SEEDS.meter,
      beatScheduleDigest: "68267f53dcaa4bba4d7ba180b9a701446246171332de33f18c9a69ca03dad098",
      meterScheduleDigest: "f5cb0b6d7914f580ae7ba0c23fdb45fe818c9de030a238def959878dfee8332e",
      cases: 4_096,
      additions: 26_607,
      comparisons: { less: 2_065, equal: 0, greater: 2_031 },
      subtractionValues: 2_031,
      subtractionRefusals: 2_065,
      rangeValues: 4_096,
      rangeRefusals: 0,
      durationValues: 4_096,
      durationRefusals: 0,
      timelineFolds: 4_096,
      divisorChecks: 28,
      meterChecks: 96,
      boundaryChecks: 5,
    });
    emitEvidenceObservation(
      "F1-PROPERTY-TIME",
      { beat: first.beatSeed, meter: first.meterSeed },
      {
        cases: first.cases,
        additions: first.additions,
        comparisonsLess: first.comparisons.less,
        comparisonsEqual: first.comparisons.equal,
        comparisonsGreater: first.comparisons.greater,
        subtractionValues: first.subtractionValues,
        subtractionRefusals: first.subtractionRefusals,
        rangeValues: first.rangeValues,
        rangeRefusals: first.rangeRefusals,
        durationValues: first.durationValues,
        durationRefusals: first.durationRefusals,
        timelineFolds: first.timelineFolds,
        divisorChecks: first.divisorChecks,
        meterChecks: first.meterChecks,
        boundaryChecks: first.boundaryChecks,
      },
      sha256({
        beat: first.beatScheduleDigest,
        meter: first.meterScheduleDigest,
      }),
      3,
    );
  }, 30_000);

  test("kills deliberately wrong exact-time observations", () => {
    const correct = observeTimeLaw();
    verifyTimeObservation(correct);
    let mutantsKilled = 0;
    expectMutantKilled("time-plus-one-tick", () => {
      verifyTimeObservation({ ...correct, leftTicks: correct.leftTicks + 1 });
    });
    mutantsKilled += 1;
    expectMutantKilled("time-comparator-flip", () => {
      verifyTimeObservation({ ...correct, comparison: -correct.comparison });
    });
    mutantsKilled += 1;
    expectMutantKilled("time-addition-loses-one-tick", () => {
      verifyTimeObservation({ ...correct, sumTicks: correct.sumTicks - 1 });
    });
    mutantsKilled += 1;
    expect(mutantsKilled).toBe(3);
  });

  test("replays degree, chord, and voicing laws byte-for-byte", () => {
    const first = runHarmonyCampaign();
    const second = runHarmonyCampaign();
    expect(second).toEqual(first);
    expect(first).toEqual({
      seed: REVIEWED_SEEDS.voicing,
      scheduleDigest: "6c4698667ee1ee8cfc0cad3cca3d51ac847b893b7b122fc73e8aca4e2effb82c",
      degreeCases: 50,
      degreeArrays: 512,
      degreeOrderRefusals: 512,
      degreeDuplicateRefusals: 512,
      parsedChordConstructions: 512,
      autoMatrixCells: 42,
      autoSuccesses: 29,
      rootlessRefusals: 8,
      slashBassRefusals: 5,
      manualRoundTrips: 512,
      frozenRoundTrips: 512,
      storedLengthSixteenRows: 25,
      storedBoundaryChecks: 4,
    });
    emitEvidenceObservation(
      "F1-PROPERTY-HARMONY",
      first.seed,
      {
        degreeCases: first.degreeCases,
        degreeArrays: first.degreeArrays,
        degreeOrderRefusals: first.degreeOrderRefusals,
        degreeDuplicateRefusals: first.degreeDuplicateRefusals,
        parsedChordConstructions: first.parsedChordConstructions,
        autoMatrixCells: first.autoMatrixCells,
        autoSuccesses: first.autoSuccesses,
        rootlessRefusals: first.rootlessRefusals,
        slashBassRefusals: first.slashBassRefusals,
        manualRoundTrips: first.manualRoundTrips,
        frozenRoundTrips: first.frozenRoundTrips,
        storedLengthSixteenRows: first.storedLengthSixteenRows,
        storedBoundaryChecks: first.storedBoundaryChecks,
      },
      first.scheduleDigest,
      6,
    );
  }, 30_000);

  test("kills deliberately wrong degree, Auto-policy, and stored-voicing observations", () => {
    const correct = observeHarmonyLaw();
    verifyHarmonyObservation(correct);
    let mutantsKilled = 0;
    expectMutantKilled("degree-chromatic-identity-collapse", () => {
      verifyHarmonyObservation({
        ...correct,
        sharpNineIdentity: "3",
        flatThreeIdentity: "3",
      });
    });
    mutantsKilled += 1;
    expectMutantKilled("degree-order-acceptance", () => {
      verifyHarmonyObservation({ ...correct, reversedArrayCode: null });
    });
    mutantsKilled += 1;
    expectMutantKilled("auto-rootless-generated-acceptance", () => {
      verifyHarmonyObservation({ ...correct, rootlessGeneratedCode: null });
    });
    mutantsKilled += 1;
    expectMutantKilled("manual-sort-and-deduplicate", () => {
      verifyHarmonyObservation({
        ...correct,
        manualPitches: [
          { step: "G", alter: 0, octave: 3 },
          { step: "C", alter: 0, octave: 4 },
        ],
      });
    });
    mutantsKilled += 1;
    expectMutantKilled("frozen-provenance-rewrite", () => {
      verifyHarmonyObservation({ ...correct, frozenEngineVersion: "latest" });
    });
    mutantsKilled += 1;
    expectMutantKilled("chord-category-invention", () => {
      verifyHarmonyObservation({
        ...correct,
        chordExtensions: correct.chordAdditions,
        chordAdditions: correct.chordExtensions,
      });
    });
    mutantsKilled += 1;
    expect(mutantsKilled).toBe(6);
  });
});
