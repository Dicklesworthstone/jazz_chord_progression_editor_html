import { describe, expect, test } from "bun:test";

import {
  MAX_NORMALIZED_BEAT_NUMERATOR,
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
  MIDI_PPQ,
  accumulateTimeline,
  addBeatValues,
  beatValueToMidiTicks,
  compareBeatValues,
  makeBeatDuration,
  makeBeatPosition,
  makeBeatRange,
  makeMeter,
  makeTempoBpm,
  measureCapacity,
  normalizeBeatValue,
  subtractBeatValues,
  type BeatDuration,
  type BeatPosition,
  type BeatValue,
} from "../../src/domain/duration";

type Rational = Readonly<{
  numerator: number;
  denominator: number;
}>;

type FixtureIssue = Readonly<{
  code: string;
  path: readonly (string | number)[];
}>;

type DivisorCase = Readonly<{
  id: string;
  denominator: number;
  unitTicks: number;
  doubleUnit: Rational;
}>;

type EdgeExpectation = Readonly<{
  ok?: boolean;
  value?: Rational;
  total?: Rational;
  ordering?: number;
  issue?: FixtureIssue;
}>;

type EdgeCase = Readonly<{
  id: string;
  kind: string;
  input?: unknown;
  left?: Rational;
  right?: Rational;
  expected: EdgeExpectation;
}>;

type PairwiseOracle = Readonly<{
  expectedComparisonPartition: Readonly<{
    less: number;
    equal: number;
    greater: number;
  }>;
  expectedExecutionCounts: Readonly<{
    additions: number;
    comparisons: number;
    subtractionValues: number;
    subtractionNegativeRefusals: number;
  }>;
}>;

type BeatFixture = Readonly<{
  ppq: number;
  divisorCases: readonly DivisorCase[];
  edgeCases: readonly EdgeCase[];
  pairwiseClosureCases: readonly [
    Readonly<{ independentTickOracle: PairwiseOracle }>,
  ];
}>;

type CapacityCase = Readonly<{
  id: string;
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  expectedCapacity: Rational;
}>;

type MeterFixture = Readonly<{
  capacityFormula: string;
  capacityCases: readonly CapacityCase[];
}>;

const beatFixture = Bun.file(
  new URL("../fixtures/domain/beat-value-cases.json", import.meta.url),
).json() as Promise<BeatFixture>;

const meterFixture = Bun.file(
  new URL("../fixtures/domain/meter-measure-cases.json", import.meta.url),
).json() as Promise<MeterFixture>;

function requireRational(value: unknown, label: string): Rational {
  if (
    typeof value !== "object" ||
    value === null ||
    !("numerator" in value) ||
    !("denominator" in value) ||
    typeof value.numerator !== "number" ||
    typeof value.denominator !== "number"
  ) {
    throw new Error(`F1_DURATION_FIXTURE_RATIONAL: ${label}`);
  }
  return { numerator: value.numerator, denominator: value.denominator };
}

function requireRationalArray(value: unknown, label: string): readonly Rational[] {
  if (!Array.isArray(value)) {
    throw new Error(`F1_DURATION_FIXTURE_ARRAY: ${label}`);
  }
  return value.map((entry, index) =>
    requireRational(entry, `${label}[${String(index)}]`),
  );
}

function requireRangeInput(
  value: unknown,
  label: string,
): Readonly<{ start: Rational; end: Rational }> {
  if (
    typeof value !== "object" ||
    value === null ||
    !("start" in value) ||
    !("end" in value)
  ) {
    throw new Error(`F1_DURATION_FIXTURE_RANGE: ${label}`);
  }
  return {
    start: requireRational(value.start, `${label}.start`),
    end: requireRational(value.end, `${label}.end`),
  };
}

function requireExpectedIssue(edge: EdgeCase): FixtureIssue {
  const issue = edge.expected.issue;
  if (issue === undefined) {
    throw new Error(`F1_DURATION_FIXTURE_ISSUE: ${edge.id}`);
  }
  return issue;
}

function requireExpectedValue(edge: EdgeCase): Rational {
  const value = edge.expected.value;
  if (value === undefined) {
    throw new Error(`F1_DURATION_FIXTURE_VALUE: ${edge.id}`);
  }
  return value;
}

function requireExpectedTotal(edge: EdgeCase): Rational {
  const value = edge.expected.total;
  if (value === undefined) {
    throw new Error(`F1_DURATION_FIXTURE_TOTAL: ${edge.id}`);
  }
  return value;
}

function expectFixtureResult(
  result:
    | Readonly<{ ok: true; value: BeatValue }>
    | Readonly<{
        ok: false;
        refusal: Readonly<{
          code: string;
          path: readonly (string | number)[];
        }>;
      }>,
  edge: EdgeCase,
): void {
  if (edge.expected.ok === true) {
    if (!result.ok) {
      throw new Error(`F1_DURATION_EXPECTED_SUCCESS: ${edge.id}`);
    }
    expect(plainBeat(result.value)).toEqual(requireExpectedValue(edge));
    return;
  }

  if (result.ok) {
    throw new Error(`F1_DURATION_EXPECTED_REFUSAL: ${edge.id}`);
  }
  const issue = requireExpectedIssue(edge);
  expect({ code: result.refusal.code, path: result.refusal.path }).toEqual(issue);
}

function plainBeat(value: BeatValue): Rational {
  return { numerator: value.numerator, denominator: value.denominator };
}

function normalizeOrThrow(input: Rational, label: string): BeatValue {
  const result = normalizeBeatValue(input);
  if (!result.ok) {
    throw new Error(`F1_DURATION_NORMALIZE_FAILED: ${label}`);
  }
  return result.value;
}

function durationOrThrow(input: Rational, label: string): BeatDuration {
  const result = makeBeatDuration(input);
  if (!result.ok) {
    throw new Error(`F1_DURATION_CONSTRUCT_FAILED: ${label}`);
  }
  return result.value;
}

function positionOrThrow(input: Rational, label: string): BeatPosition {
  const result = makeBeatPosition(input);
  if (!result.ok) {
    throw new Error(`F1_POSITION_CONSTRUCT_FAILED: ${label}`);
  }
  return result.value;
}

function tickOracleRational(ticks: number): Rational {
  let dividend = ticks;
  let divisor = MIDI_PPQ;
  while (divisor !== 0) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }
  return {
    numerator: ticks / dividend,
    denominator: MIDI_PPQ / dividend,
  };
}

describe("F1 exact musical time", () => {
  test("normalizes every reviewed PPQ divisor and converts it to exact ticks", async () => {
    const fixture = await beatFixture;
    expect(fixture.ppq).toBe(MIDI_PPQ);

    for (const row of fixture.divisorCases) {
      const unit = normalizeOrThrow(
        { numerator: 1, denominator: row.denominator },
        row.id,
      );
      expect(Number(beatValueToMidiTicks(unit))).toBe(row.unitTicks);

      const doubled = addBeatValues(unit, unit);
      if (!doubled.ok) {
        throw new Error(`F1_DURATION_DOUBLE_FAILED: ${row.id}`);
      }
      expect(plainBeat(doubled.value)).toEqual(row.doubleUnit);
    }
  });

  test("matches every in-scope reviewed normalization and operation edge", async () => {
    const fixture = await beatFixture;
    let handled = 0;

    for (const edge of fixture.edgeCases) {
      switch (edge.kind) {
        case "normalize":
        case "normalize-before-denominator-check":
        case "normalize-before-numerator-bound": {
          expectFixtureResult(
            normalizeBeatValue(requireRational(edge.input, edge.id)),
            edge,
          );
          handled += 1;
          break;
        }
        case "add":
        case "add-with-bigint-intermediate-then-reduce":
        case "add-overflow-after-reduction": {
          const left = normalizeOrThrow(requireRational(edge.left, edge.id), edge.id);
          const right = normalizeOrThrow(requireRational(edge.right, edge.id), edge.id);
          expectFixtureResult(addBeatValues(left, right), edge);
          handled += 1;
          break;
        }
        case "subtract": {
          const left = normalizeOrThrow(requireRational(edge.left, edge.id), edge.id);
          const right = normalizeOrThrow(requireRational(edge.right, edge.id), edge.id);
          expectFixtureResult(subtractBeatValues(left, right), edge);
          handled += 1;
          break;
        }
        case "compare": {
          const left = normalizeOrThrow(requireRational(edge.left, edge.id), edge.id);
          const right = normalizeOrThrow(requireRational(edge.right, edge.id), edge.id);
          const expectedOrdering = edge.expected.ordering;
          if (expectedOrdering === undefined) {
            throw new Error(`F1_DURATION_FIXTURE_ORDERING: ${edge.id}`);
          }
          expect(expectedOrdering).toBe(compareBeatValues(left, right));
          handled += 1;
          break;
        }
        case "decode-position": {
          expectFixtureResult(
            makeBeatPosition(requireRational(edge.input, edge.id)),
            edge,
          );
          handled += 1;
          break;
        }
        case "decode-duration": {
          expectFixtureResult(
            makeBeatDuration(requireRational(edge.input, edge.id)),
            edge,
          );
          handled += 1;
          break;
        }
        case "decode-range": {
          const input = requireRangeInput(edge.input, edge.id);
          const start = positionOrThrow(input.start, `${edge.id}.start`);
          const end = positionOrThrow(input.end, `${edge.id}.end`);
          const result = makeBeatRange(start, end);
          if (edge.expected.ok === true) {
            expect(result).toMatchObject({ ok: true });
          } else if (result.ok) {
            throw new Error(`F1_DURATION_EXPECTED_RANGE_REFUSAL: ${edge.id}`);
          } else {
            const actualIssue: FixtureIssue = {
              code: result.refusal.code,
              path: result.refusal.path,
            };
            expect(actualIssue).toEqual(requireExpectedIssue(edge));
          }
          handled += 1;
          break;
        }
        case "accumulate-timeline":
        case "accumulate-empty-timeline": {
          const inputs = requireRationalArray(edge.input, edge.id);
          const durations = inputs.map((input, index) =>
            durationOrThrow(input, `${edge.id}[${String(index)}]`),
          );
          const result = accumulateTimeline(durations);
          if (edge.expected.ok === true) {
            if (!result.ok) {
              throw new Error(`F1_DURATION_EXPECTED_TIMELINE: ${edge.id}`);
            }
            expect(plainBeat(result.value)).toEqual(requireExpectedTotal(edge));
          } else if (result.ok) {
            throw new Error(`F1_DURATION_EXPECTED_TIMELINE_REFUSAL: ${edge.id}`);
          } else {
            const actualIssue: FixtureIssue = {
              code: result.refusal.code,
              path: result.refusal.path,
            };
            expect(actualIssue).toEqual(requireExpectedIssue(edge));
          }
          handled += 1;
          break;
        }
        case "decode-canonical-wire-beat": {
          // F2 owns strict canonical-wire decoding; this F1 constructor normalizes.
          expect(edge.id).toBe("F1-BEAT-EDGE-028");
          break;
        }
        default:
          throw new Error(`F1_DURATION_FIXTURE_KIND: ${edge.kind}`);
      }
    }

    expect(handled).toBe(fixture.edgeCases.length - 1);
  });

  test("proves the complete reviewed ordered-pair closure with an independent tick oracle", async () => {
    const fixture = await beatFixture;
    const row = fixture.pairwiseClosureCases[0];
    const expected = row.independentTickOracle;
    let additions = 0;
    let comparisons = 0;
    let subtractionValues = 0;
    let subtractionNegativeRefusals = 0;
    const comparisonPartition = { less: 0, equal: 0, greater: 0 };

    for (const leftRow of fixture.divisorCases) {
      const left = normalizeOrThrow(
        { numerator: 1, denominator: leftRow.denominator },
        leftRow.id,
      );
      for (const rightRow of fixture.divisorCases) {
        const right = normalizeOrThrow(
          { numerator: 1, denominator: rightRow.denominator },
          rightRow.id,
        );

        const added = addBeatValues(left, right);
        if (!added.ok) {
          throw new Error(`F1_DURATION_PAIRWISE_ADD: ${leftRow.id}/${rightRow.id}`);
        }
        expect(plainBeat(added.value)).toEqual(
          tickOracleRational(leftRow.unitTicks + rightRow.unitTicks),
        );
        additions += 1;

        const ordering = compareBeatValues(left, right);
        const oracleOrdering = Math.sign(
          leftRow.unitTicks - rightRow.unitTicks,
        );
        expect(oracleOrdering).toBe(ordering);
        if (ordering < 0) comparisonPartition.less += 1;
        else if (ordering > 0) comparisonPartition.greater += 1;
        else comparisonPartition.equal += 1;
        comparisons += 1;

        const subtracted = subtractBeatValues(left, right);
        if (leftRow.unitTicks < rightRow.unitTicks) {
          if (subtracted.ok) {
            throw new Error(
              `F1_DURATION_PAIRWISE_UNDERFLOW: ${leftRow.id}/${rightRow.id}`,
            );
          }
          expect(subtracted.refusal).toMatchObject({
            code: "beat.negative_result",
            path: [],
          });
          subtractionNegativeRefusals += 1;
        } else {
          if (!subtracted.ok) {
            throw new Error(
              `F1_DURATION_PAIRWISE_SUBTRACT: ${leftRow.id}/${rightRow.id}`,
            );
          }
          expect(plainBeat(subtracted.value)).toEqual(
            tickOracleRational(leftRow.unitTicks - rightRow.unitTicks),
          );
          subtractionValues += 1;
        }
      }
    }

    expect({
      additions,
      comparisons,
      subtractionValues,
      subtractionNegativeRefusals,
    }).toEqual(expected.expectedExecutionCounts);
    expect(comparisonPartition).toEqual(expected.expectedComparisonPartition);
  });

  test("keeps raw validation, duration, range, and timeline failures distinct", () => {
    expect(normalizeBeatValue({ numerator: Number.NaN, denominator: 1 })).toMatchObject({
      ok: false,
      refusal: { code: "beat.numerator_not_safe_integer", path: ["numerator"] },
    });
    expect(normalizeBeatValue({ numerator: 1, denominator: Number.POSITIVE_INFINITY })).toMatchObject({
      ok: false,
      refusal: { code: "beat.denominator_not_safe_integer", path: ["denominator"] },
    });
    expect(makeBeatDuration({ numerator: 0, denominator: 960 })).toMatchObject({
      ok: false,
      refusal: { code: "beat.duration_not_positive", path: ["numerator"] },
    });

    const maximum = normalizeOrThrow(
      { numerator: MAX_NORMALIZED_BEAT_NUMERATOR, denominator: 1 },
      "maximum",
    );
    const one = normalizeOrThrow({ numerator: 1, denominator: 1 }, "one");
    expect(addBeatValues(maximum, one)).toMatchObject({
      ok: false,
      refusal: {
        code: "beat.numerator_out_of_range",
        path: [],
        normalizedNumeratorDecimal: "2147483648",
      },
    });

    const timelineMaximum = durationOrThrow(
      { numerator: MAX_TIMELINE_QUARTER_NOTE_BEATS, denominator: 1 },
      "timeline maximum",
    );
    const oneTick = durationOrThrow({ numerator: 1, denominator: MIDI_PPQ }, "one tick");
    expect(accumulateTimeline([timelineMaximum, oneTick])).toMatchObject({
      ok: false,
      refusal: { code: "timeline.total_exceeded", path: [] },
    });
  });
});

describe("F1 meter and tempo", () => {
  test("matches every independently reviewed measure-capacity equation", async () => {
    const fixture = await meterFixture;
    expect(fixture.capacityFormula).toBe("beatsPerBar * 4 / beatUnit");

    for (const row of fixture.capacityCases) {
      const result = makeMeter(row.meter);
      if (!result.ok) {
        throw new Error(`F1_METER_CONSTRUCT_FAILED: ${row.id}`);
      }
      expect(plainBeat(measureCapacity(result.value))).toEqual(
        row.expectedCapacity,
      );
    }
  });

  test("refuses nonmember meter and tempo values without coercion", () => {
    for (const beatsPerBar of [0, 0.5, 33, Number.NaN]) {
      expect(makeMeter({ beatsPerBar, beatUnit: 4 })).toMatchObject({
        ok: false,
        refusal: {
          code: "meter.beats_per_bar_out_of_range",
          path: ["beatsPerBar"],
        },
      });
    }
    for (const beatUnit of [1, 4.5, 16, Number.NaN]) {
      expect(makeMeter({ beatsPerBar: 4, beatUnit })).toMatchObject({
        ok: false,
        refusal: { code: "meter.beat_unit_invalid", path: ["beatUnit"] },
      });
    }

    expect(makeTempoBpm(Number.NaN)).toMatchObject({
      ok: false,
      refusal: { code: "tempo.not_finite", path: [] },
    });
    expect(makeTempoBpm(120.5)).toMatchObject({
      ok: false,
      refusal: { code: "tempo.not_integer", path: [] },
    });
    expect(makeTempoBpm(19)).toMatchObject({
      ok: false,
      refusal: { code: "tempo.out_of_range", path: [] },
    });
    expect(makeTempoBpm(401)).toMatchObject({
      ok: false,
      refusal: { code: "tempo.out_of_range", path: [] },
    });
    expect(makeTempoBpm(20)).toEqual({ ok: true, value: 20 });
    expect(makeTempoBpm(400)).toEqual({ ok: true, value: 400 });
  });

  test("returns frozen canonical values and result records", () => {
    const beat = normalizeBeatValue({ numerator: 2, denominator: 4 });
    expect(Object.isFrozen(beat)).toBe(true);
    if (!beat.ok) throw new Error("F1_DURATION_EXPECTED_FROZEN_SUCCESS");
    expect(Object.isFrozen(beat.value)).toBe(true);

    const meter = makeMeter({ beatsPerBar: 4, beatUnit: 4 });
    expect(Object.isFrozen(meter)).toBe(true);
    if (!meter.ok) throw new Error("F1_METER_EXPECTED_FROZEN_SUCCESS");
    expect(Object.isFrozen(meter.value)).toBe(true);
  });
});
