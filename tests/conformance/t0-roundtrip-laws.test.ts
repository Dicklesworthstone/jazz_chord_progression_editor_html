import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import { makeMeter, type ChordSpec, type Meter } from "../../src/domain";
import {
  ACCIDENTAL_STYLES,
  CHART_ERROR_CODES,
  CHORD_SYMBOL_SUGGESTION_POLICY_ID,
  CHORD_SYMBOL_SUGGESTION_POLICY_VERSION,
  CHORD_SYMBOL_SUGGESTION_REPLACEMENTS,
  SYMBOL_ERROR_CODES,
  formatChartText,
  formatChordSymbol,
  parseChartText,
  parseChordSymbol,
  type AccidentalStyle,
  type ChartTextParseRequest,
} from "../../src/theory";
import { formatChartTextWithEvidence } from "../../src/theory/chart-formatter";
import { parseChartTextWithEvidence } from "../../src/theory/chart-parser";
import {
  formatChordSymbolWithEvidence,
  parseChordSymbolWithEvidence,
} from "../../src/theory/chord-symbol";
import chartFixtureValue from "../fixtures/theory/chart-cases.json";
import roundtripFixtureValue from "../fixtures/theory/roundtrip-cases.json";
import symbolFixtureValue from "../fixtures/theory/symbol-cases.json";

type JsonRecord = Readonly<Record<string, unknown>>;

type LawObservation = Readonly<{
  lawId: string;
  cases: number;
  seedId: string | null;
  digest: string;
}>;

const observations: LawObservation[] = [];
let assertionCount = 0;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a record`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`${label} must be a number`);
  return value;
}

function equal(actual: unknown, expected: unknown, label: string): void {
  assertionCount += 1;
  expect(actual, label).toEqual(expected);
}

function truthy(actual: unknown, label: string): void {
  assertionCount += 1;
  expect(actual, label).toBe(true);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function semanticChord(chord: ChordSpec): unknown {
  return Object.fromEntries(
    Object.entries(chord).filter(([key]) => key !== "sourceText"),
  );
}

function semanticChart(
  draft: Extract<ReturnType<typeof parseChartText>, { ok: true }>["draft"],
): unknown {
  return {
    mode: draft.mode,
    headers: draft.headers,
    sections: draft.sections.map((section) => ({
      ordinal: section.ordinal,
      kind: section.kind,
      name: section.name,
      annotation: section.annotation,
      measures: section.measures.map((measure) => ({
        ordinal: measure.ordinal,
        kind: measure.kind,
        events: measure.events.map((event) => ({
          ordinal: event.ordinal,
          origin: event.origin,
          repeatedFromOrdinal: event.repeatedFromOrdinal,
          chord: semanticChord(event.chord),
          duration: event.duration,
          annotation: event.annotation,
        })),
      })),
    })),
  };
}

function diagnostics(
  result: ReturnType<typeof parseChordSymbol> | ReturnType<typeof parseChartText>,
): readonly unknown[] {
  return result.ok
    ? []
    : result.diagnostics.map(({ code, range }) => ({ code, range }));
}

function checkedMeter(value: unknown, label: string): Meter {
  const input = record(value, label);
  const result = makeMeter({
    beatsPerBar: number(input["beatsPerBar"], `${label}.beatsPerBar`),
    beatUnit: number(input["beatUnit"], `${label}.beatUnit`),
  });
  if (!result.ok) throw new Error(`${label} is not a valid meter`);
  return result.value;
}

function chartRequest(value: unknown, label: string): ChartTextParseRequest {
  const request = record(value, label);
  if (request["mode"] === "document") return { mode: "document" };
  if (request["mode"] !== "fragment") throw new Error(`${label}.mode`);
  return {
    mode: "fragment",
    meter: checkedMeter(request["meter"], `${label}.meter`),
  };
}

function fixtureStyle(value: unknown, label: string): AccidentalStyle {
  if (value !== "ascii" && value !== "unicode") throw new Error(label);
  return value;
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state;
  };
}

function shuffled<T>(values: readonly T[], seed: number): readonly T[] {
  const result = [...values];
  const next = xorshift32(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const replacementIndex = next() % (index + 1);
    const held = result[index];
    const replacement = result[replacementIndex];
    if (held === undefined || replacement === undefined) {
      throw new Error("T0 seeded shuffle index escaped its schedule");
    }
    result[index] = replacement;
    result[replacementIndex] = held;
  }
  return result;
}

function permutations(values: readonly string[]): readonly (readonly string[])[] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, candidate) => candidate !== index))
      .map((suffix) => [value, ...suffix])
  );
}

function law(id: string): JsonRecord {
  const fixture = record(roundtripFixtureValue, "roundtrip fixture");
  const found = array(fixture["laws"], "roundtrip laws")
    .map((value, index) => record(value, `roundtrip law ${String(index)}`))
    .find((value) => value["id"] === id);
  if (found === undefined) throw new Error(`missing law ${id}`);
  return found;
}

function finishLaw(id: string, cases: number, payload: unknown): void {
  const source = law(id);
  const seedId = typeof source["seedId"] === "string" ? source["seedId"] : null;
  observations.push({ lawId: id, cases, seedId, digest: sha256({ lawId: id, payload }) });
}

function symbolCases(key: "canonicalCases" | "aliasCases"): readonly JsonRecord[] {
  const fixture = record(symbolFixtureValue, "symbol fixture");
  return array(fixture[key], `symbol ${key}`).map((value, index) =>
    record(value, `${key}[${String(index)}]`)
  );
}

function chartSuccessCase(id: string): JsonRecord {
  const fixture = record(chartFixtureValue, "chart fixture");
  const found = array(fixture["successCases"], "chart success cases")
    .map((value, index) => record(value, `chart success ${String(index)}`))
    .find((value) => value["id"] === id);
  if (found === undefined) throw new Error(`missing chart case ${id}`);
  return found;
}

function runSymbolRoundTrip(
  sourceText: string,
  style: AccidentalStyle,
  expectedCanonical: string,
  label: string,
): unknown {
  const first = parseChordSymbol(sourceText, style);
  truthy(first.ok, `${label}: first parse`);
  if (!first.ok) throw new Error(`${label}: first parse failed`);
  equal(first.chord.sourceText, sourceText, `${label}: source preservation`);
  equal(first.canonicalText, expectedCanonical, `${label}: fixture canonical`);
  const formatted = formatChordSymbol(first.chord, style);
  truthy(formatted.ok, `${label}: format`);
  if (!formatted.ok) throw new Error(`${label}: format failed`);
  equal(formatted.canonicalText, expectedCanonical, `${label}: canonical format`);
  const second = parseChordSymbol(formatted.canonicalText, style);
  truthy(second.ok, `${label}: canonical reparse`);
  if (!second.ok) throw new Error(`${label}: canonical reparse failed`);
  equal(
    semanticChord(second.chord),
    semanticChord(first.chord),
    `${label}: semantic round trip`,
  );
  equal(
    second.chord.sourceText,
    expectedCanonical,
    `${label}: canonical source preservation`,
  );
  const secondFormat = formatChordSymbol(second.chord, style);
  equal(secondFormat, formatted, `${label}: formatter idempotence`);
  return {
    sourceText,
    style,
    canonicalText: formatted.canonicalText,
    semantic: semanticChord(first.chord),
  };
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function reduced(numerator: number, denominator: number): Readonly<{
  numerator: number;
  denominator: number;
}> {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

describe("T0 independent round-trip and metamorphic laws", () => {
  test("T0-META-001 symbol parse-format-parse and canonical idempotence", () => {
    const payload: unknown[] = [];
    let cases = 0;
    for (const fixtureCase of symbolCases("canonicalCases")) {
      const expected = record(fixtureCase["expected"], "canonical expected");
      payload.push(runSymbolRoundTrip(
        string(fixtureCase["input"], "canonical input"),
        fixtureStyle(fixtureCase["style"], "canonical style"),
        string(expected["canonicalText"], "canonical text"),
        string(fixtureCase["id"], "canonical id"),
      ));
      cases += 1;
    }
    for (const fixtureCase of symbolCases("aliasCases")) {
      const expected = record(fixtureCase["expected"], "alias expected");
      const inputs = typeof fixtureCase["input"] === "string"
        ? [fixtureCase["input"]]
        : array(fixtureCase["inputs"], "alias inputs");
      const styleRows = fixtureCase["styles"] === undefined
        ? [{
          style: fixtureStyle(fixtureCase["style"], "alias style"),
          canonicalText: string(expected["canonicalText"], "alias canonical text"),
        }]
        : Object.entries(record(fixtureCase["styles"], "alias styles")).map(
          ([style, canonicalText]) => ({
            style: fixtureStyle(style, "alias style key"),
            canonicalText: string(canonicalText, "alias style canonical text"),
          }),
        );
      for (const [index, input] of inputs.entries()) {
        for (const styleRow of styleRows) {
          payload.push(runSymbolRoundTrip(
            string(input, "alias input"),
            styleRow.style,
            styleRow.canonicalText,
            `${string(fixtureCase["id"], "alias id")}:${String(index)}:${styleRow.style}`,
          ));
          cases += 1;
        }
      }
    }
    finishLaw("T0-META-001", cases, payload);
  });

  test("T0-META-002 reviewed root, family, and accidental-style cross-product", () => {
    const source = law("T0-META-002");
    const roots = array(source["roots"], "META-002 roots").map((value) =>
      string(value, "META-002 root")
    );
    const bodies = array(source["symbolBodies"], "META-002 bodies").map((value) =>
      string(value, "META-002 body")
    );
    const styles = array(source["styles"], "META-002 styles").map((value) =>
      fixtureStyle(value, "META-002 style")
    );
    const payload: unknown[] = [];
    for (const root of roots) {
      const rootResult = parseChordSymbol(root, "ascii");
      if (!rootResult.ok) throw new Error(`fixture root ${root} failed`);
      for (const body of bodies) {
        let priorSemantic: unknown = null;
        for (const style of styles) {
          const parsed = parseChordSymbol(`${root}${body}`, style);
          truthy(parsed.ok, `META-002 ${root}${body} ${style}`);
          if (!parsed.ok) continue;
          equal(parsed.chord.root, rootResult.chord.root, "META-002 spelled root");
          if (priorSemantic !== null) {
            equal(semanticChord(parsed.chord), priorSemantic, "META-002 style semantics");
          }
          priorSemantic = semanticChord(parsed.chord);
          const canonical = parseChordSymbol(parsed.canonicalText, style);
          truthy(canonical.ok, "META-002 canonical reparse");
          if (!canonical.ok) continue;
          equal(semanticChord(canonical.chord), priorSemantic, "META-002 reparse semantics");
          payload.push({ root, body, style, canonicalText: parsed.canonicalText });
        }
      }
    }
    const expected = record(source["expected"], "META-002 expected");
    equal(payload.length, expected["caseCount"], "META-002 case count");
    finishLaw("T0-META-002", payload.length, payload);
  });

  test("T0-META-003 all legal modifier permutations normalize identically", () => {
    const source = law("T0-META-003");
    const base = string(source["base"], "META-003 base");
    const modifiers = array(source["modifiers"], "META-003 modifiers").map((value) =>
      string(value, "META-003 modifier")
    );
    const separators = array(source["separators"], "META-003 separators").map((value) =>
      string(value, "META-003 separator")
    );
    const expected = record(source["expected"], "META-003 expected");
    const seed = number(
      record(roundtripFixtureValue, "roundtrip fixture")["seeds"] === undefined
        ? 0
        : record(array(record(roundtripFixtureValue, "roundtrip fixture")["seeds"], "seeds")
          .find((value) => record(value, "seed")["id"] === source["seedId"]), "META-003 seed")["value"],
      "META-003 seed value",
    );
    const schedule = shuffled(
      permutations(modifiers).flatMap((order) =>
        separators.map((separator) => ({ order, separator }))
      ),
      seed,
    );
    const payload: unknown[] = [];
    let baseline: unknown = null;
    for (const { order, separator } of schedule) {
      const sourceText = `${base}(${order.join(separator)})`;
      const parsed = parseChordSymbol(sourceText, "ascii");
      truthy(parsed.ok, `META-003 ${sourceText}`);
      if (!parsed.ok) continue;
      equal(parsed.canonicalText, expected["canonicalText"], "META-003 canonical");
      if (baseline === null) baseline = semanticChord(parsed.chord);
      equal(semanticChord(parsed.chord), baseline, "META-003 semantic normalization");
      payload.push({ sourceText, canonicalText: parsed.canonicalText });
    }
    equal(schedule.length, expected["caseCount"], "META-003 case count");
    finishLaw("T0-META-003", schedule.length, payload);
  });

  test("T0-META-004 illegal modifier order retains the conflict and later-token range", () => {
    const source = law("T0-META-004");
    const payload: unknown[] = [];
    for (const faultValue of array(source["faults"], "META-004 faults")) {
      const fault = record(faultValue, "META-004 fault");
      const tokens = array(fault["tokens"], "META-004 tokens").map((value) =>
        string(value, "META-004 token")
      );
      for (const order of [tokens, [...tokens].reverse()]) {
        const sourceText = `C7(${order.join(",")})`;
        const parsed = parseChordSymbol(sourceText, "ascii");
        equal(parsed.ok, false, `META-004 refusal ${sourceText}`);
        if (parsed.ok) continue;
        equal(parsed.diagnostics[0].code, fault["code"], "META-004 code");
        const laterStart = sourceText.lastIndexOf(order[1] ?? "");
        equal(
          parsed.diagnostics[0].range,
          { start: laterStart, end: laterStart + (order[1]?.length ?? 0) },
          "META-004 later conflicting token range",
        );
        payload.push({ sourceText, diagnostics: diagnostics(parsed) });
      }
    }
    finishLaw("T0-META-004", payload.length, payload);
  });

  test("T0-META-005 highest extension remains one explicit syntax fact", () => {
    const source = law("T0-META-005");
    const payload: unknown[] = [];
    for (const rowValue of array(source["rows"], "META-005 rows")) {
      const row = record(rowValue, "META-005 row");
      const parsed = parseChordSymbol(string(row["symbol"], "META-005 symbol"), "ascii");
      truthy(parsed.ok, "META-005 parse");
      if (!parsed.ok) continue;
      equal(
        parsed.chord.extensions.map(({ number: degree }) => degree),
        row["stored"],
        "META-005 explicit extension",
      );
      equal(parsed.chord.seventh, row["seventh"], "META-005 seventh");
      equal(parsed.chord.additions, [], "META-005 extension is not an addition");
      payload.push({ symbol: row["symbol"], semantic: semanticChord(parsed.chord) });
    }
    finishLaw("T0-META-005", payload.length, payload);
  });

  test("T0-META-006 reviewed chart export-import cases round-trip semantically", () => {
    const source = law("T0-META-006");
    const payload: unknown[] = [];
    for (const idValue of array(source["sourceCaseIds"], "META-006 source IDs")) {
      const id = string(idValue, "META-006 source ID");
      const fixtureCase = chartSuccessCase(id);
      const input = string(fixtureCase["input"], `${id}.input`);
      const request = chartRequest(fixtureCase["request"], `${id}.request`);
      const style = fixtureStyle(fixtureCase["style"] ?? "ascii", `${id}.style`);
      const parsed = parseChartText(input, request, style);
      truthy(parsed.ok, `${id}: parse`);
      if (!parsed.ok) continue;
      const formatted = formatChartText(parsed.draft, style);
      truthy(formatted.ok, `${id}: format`);
      if (!formatted.ok) continue;
      equal(formatted.canonicalText, parsed.canonicalText, `${id}: parser canonical`);
      const reparsed = parseChartText(formatted.canonicalText, request, style);
      truthy(reparsed.ok, `${id}: reparse`);
      if (!reparsed.ok) continue;
      equal(semanticChart(reparsed.draft), semanticChart(parsed.draft), `${id}: semantics`);
      const reformat = formatChartText(reparsed.draft, style);
      equal(reformat, formatted, `${id}: idempotence`);
      const serialized = stableJson(parsed.draft);
      truthy(!serialized.includes('"id"'), `${id}: draft remains ID-free`);
      payload.push({ id, canonicalText: formatted.canonicalText, semantics: semanticChart(parsed.draft) });
    }
    finishLaw("T0-META-006", payload.length, payload);
  });

  test("T0-META-007 exact allocation conserves capacity or refuses a non-PPQ share", () => {
    const source = law("T0-META-007");
    const meters = array(source["meters"], "META-007 meters");
    const slotCounts = array(source["slotCounts"], "META-007 slot counts")
      .map((value) => number(value, "META-007 slot count"));
    const payload: unknown[] = [];
    for (const [meterIndex, meterValue] of meters.entries()) {
      const meter = checkedMeter(meterValue, `META-007 meter ${String(meterIndex)}`);
      const capacity = reduced(meter.beatsPerBar * 4, meter.beatUnit);
      for (const slotCount of slotCounts) {
        const sourceText = Array.from({ length: slotCount }, () => "C").join(" ");
        const parsed = parseChartText(
          sourceText,
          { mode: "fragment", meter },
          "ascii",
        );
        const share = reduced(capacity.numerator, capacity.denominator * slotCount);
        if (960 % share.denominator !== 0) {
          equal(parsed.ok, false, "META-007 nonrepresentable refusal");
          if (!parsed.ok) {
            equal(
              parsed.diagnostics.map(({ code }) => code),
              ["chart.bar_division_not_representable"],
              "META-007 typed division refusal",
            );
          }
          payload.push({ meter, slotCount, outcome: "unrepresentable", share });
          continue;
        }
        truthy(parsed.ok, "META-007 representable allocation");
        if (!parsed.ok) continue;
        const events = parsed.draft.sections[0]?.measures[0]?.events ?? [];
        equal(events.length, slotCount, "META-007 allocated event count");
        let commonDenominator = 1;
        for (const event of events) {
          commonDenominator = commonDenominator * event.duration.denominator /
            gcd(commonDenominator, event.duration.denominator);
          truthy(960 % event.duration.denominator === 0, "META-007 PPQ projection");
        }
        const sumNumerator = events.reduce(
          (sum, event) => sum + event.duration.numerator *
            (commonDenominator / event.duration.denominator),
          0,
        );
        equal(
          reduced(sumNumerator, commonDenominator),
          capacity,
          "META-007 exact capacity conservation",
        );
        payload.push({ meter, slotCount, outcome: "allocated", durations: events.map(({ duration }) => duration) });
      }
    }
    finishLaw("T0-META-007", payload.length, payload);
  });

  test("T0-META-008 virtual and barred fragments preserve only their declared layout distinction", () => {
    const source = law("T0-META-008");
    const request = chartRequest(source["request"], "META-008 request");
    const style = fixtureStyle(source["style"], "META-008 style");
    const virtual = parseChartText(string(source["virtual"], "META-008 virtual"), request, style);
    const barred = parseChartText(string(source["barred"], "META-008 barred"), request, style);
    truthy(virtual.ok, "META-008 virtual parse");
    truthy(barred.ok, "META-008 barred parse");
    if (!virtual.ok || !barred.ok) return;
    const virtualMeasure = virtual.draft.sections[0]?.measures[0];
    const barredMeasure = barred.draft.sections[0]?.measures[0];
    equal(virtualMeasure?.kind, "virtual", "META-008 virtual kind");
    equal(barredMeasure?.kind, "barred", "META-008 barred kind");
    equal(
      virtualMeasure?.events.map((event) => ({ chord: semanticChord(event.chord), duration: event.duration })),
      barredMeasure?.events.map((event) => ({ chord: semanticChord(event.chord), duration: event.duration })),
      "META-008 event semantics",
    );
    truthy(!virtual.canonicalText.includes("|"), "META-008 virtual formatting");
    truthy(barred.canonicalText.includes("|"), "META-008 barred formatting");
    finishLaw("T0-META-008", 2, { virtual: virtual.canonicalText, barred: barred.canonicalText });
  });

  test("T0-META-009 repeat expansion copies chord semantics and nothing else", () => {
    const source = law("T0-META-009");
    const request = chartRequest(source["request"], "META-009 request");
    const style = fixtureStyle(source["style"], "META-009 style");
    const repeated = parseChartText(string(source["repeat"], "META-009 repeat"), request, style);
    const literal = parseChartText(string(source["literal"], "META-009 literal"), request, style);
    truthy(repeated.ok, "META-009 repeat parse");
    truthy(literal.ok, "META-009 literal parse");
    if (!repeated.ok || !literal.ok) return;
    const repeatedEvents = repeated.draft.sections[0]?.measures[0]?.events ?? [];
    const literalEvents = literal.draft.sections[0]?.measures[0]?.events ?? [];
    const repeatEvent = repeatedEvents[1];
    equal(
      repeatedEvents.map((event) => ({ chord: semanticChord(event.chord), duration: event.duration })),
      literalEvents.map((event) => ({ chord: semanticChord(event.chord), duration: event.duration })),
      "META-009 repeat/literal semantics",
    );
    equal(repeatEvent?.origin, "repeat", "META-009 repeat origin");
    equal(repeatEvent?.repeatedFromOrdinal, 0, "META-009 nearest linkage");
    equal(repeatEvent?.annotation, "", "META-009 annotation not copied");
    equal(
      repeated.canonicalText,
      record(source["expected"], "META-009 expected")["canonicalRepeatText"],
      "META-009 canonical repeat",
    );
    finishLaw("T0-META-009", 2, { repeated: semanticChart(repeated.draft), literal: semanticChart(literal.draft) });
  });

  test("T0-META-010 comments erase only from canonical text and produce exact warnings", () => {
    const source = law("T0-META-010");
    const request = chartRequest(source["request"], "META-010 request");
    const style = fixtureStyle(source["style"], "META-010 style");
    const base = parseChartText(string(source["base"], "META-010 base"), request, style);
    const commented = parseChartText(
      string(source["withComments"], "META-010 commented"),
      request,
      style,
    );
    truthy(base.ok, "META-010 base parse");
    truthy(commented.ok, "META-010 commented parse");
    if (!base.ok || !commented.ok) return;
    equal(semanticChart(commented.draft), semanticChart(base.draft), "META-010 semantics");
    equal(commented.canonicalText, base.canonicalText, "META-010 canonical erasure");
    equal(
      commented.warnings.map(({ code }) => code),
      Array.from({ length: 3 }, () => "chart.comments_not_round_tripped"),
      "META-010 warning inventory",
    );
    equal(commented.draft.sourceText, source["withComments"], "META-010 exact source");
    finishLaw("T0-META-010", 2, { base: base.canonicalText, warnings: commented.warnings });
  });

  test("T0-META-011 astral comment prefixes shift every diagnostic in UTF-16 units", () => {
    const source = law("T0-META-011");
    const request = chartRequest(source["request"], "META-011 request");
    const style = fixtureStyle(source["style"], "META-011 style");
    const payload: unknown[] = [];
    const prefixes = array(source["prefixPayloads"], "META-011 prefixes");
    const shifts = array(source["expectedShiftCodeUnits"], "META-011 shifts");
    for (const baseValue of array(source["baseSources"], "META-011 bases")) {
      const base = record(baseValue, "META-011 base");
      const sourceText = string(base["source"], "META-011 source");
      const code = string(base["code"], "META-011 code");
      const parsedBase = parseChartText(sourceText, request, style);
      equal(parsedBase.ok, false, "META-011 base refusal");
      if (parsedBase.ok) continue;
      const diagnostic = parsedBase.diagnostics.find((item) => item.code === code);
      if (diagnostic === undefined) throw new Error(`META-011 missing ${code}`);
      for (const [index, prefixValue] of prefixes.entries()) {
        const prefix = `;${string(prefixValue, "META-011 prefix")}\n`;
        const shifted = parseChartText(`${prefix}${sourceText}`, request, style);
        equal(shifted.ok, false, "META-011 shifted refusal");
        if (shifted.ok) continue;
        const shiftedDiagnostic = shifted.diagnostics.find((item) => item.code === code);
        if (shiftedDiagnostic === undefined) throw new Error(`META-011 shifted ${code}`);
        const expectedShift = number(shifts[index], "META-011 shift");
        equal(prefix.length, expectedShift, "META-011 authored shift");
        equal(
          shiftedDiagnostic.range,
          {
            start: diagnostic.range.start + expectedShift,
            end: diagnostic.range.end + expectedShift,
          },
          "META-011 UTF-16 shifted range",
        );
        payload.push({ sourceText, prefix, code, range: shiftedDiagnostic.range });
      }
    }
    finishLaw("T0-META-011", payload.length, payload);
  });

  test("T0-META-012 suggestions are exact, bounded, parseable, and repeatable", () => {
    const source = law("T0-META-012");
    const payload: unknown[] = [];
    for (const rowValue of array(source["rows"], "META-012 rows")) {
      const row = record(rowValue, "META-012 row");
      const sourceText = string(row["source"], "META-012 source");
      const parsed = parseChordSymbol(sourceText, "ascii");
      equal(parsed.ok, false, "META-012 refusal");
      if (parsed.ok) continue;
      equal(parsed.didYouMean, row["suggestions"], "META-012 suggestions");
      truthy(parsed.didYouMean.length <= 3, "META-012 result bound");
      for (const suggestion of parsed.didYouMean) {
        truthy(parseChordSymbol(suggestion, "ascii").ok, "META-012 suggestion parses");
      }
      equal(parseChordSymbol(sourceText, "ascii"), parsed, "META-012 replay");
      payload.push({ sourceText, suggestions: parsed.didYouMean });
    }
    finishLaw("T0-META-012", payload.length, payload);
  });

  test("T0-META-013 seeded replay returns byte-identical results and work evidence", () => {
    const source = law("T0-META-013");
    const fixture = record(roundtripFixtureValue, "roundtrip fixture");
    const seeds = array(fixture["seeds"], "roundtrip seeds").map((value) =>
      record(value, "roundtrip seed")
    );
    const expectedSeedIds = array(source["seedIds"], "META-013 seed IDs");
    equal(seeds.map((seed) => seed["id"]), expectedSeedIds, "META-013 seed inventory");
    const baseSchedule = [
      { kind: "symbol" as const, sourceText: "Cdom7" },
      { kind: "symbol" as const, sourceText: "F𝄪maj7" },
      { kind: "chart" as const, sourceText: "C Dm G7" },
      { kind: "chart" as const, sourceText: "| Cfoo:2 Dwat:2 |" },
    ];
    const payload: unknown[] = [];
    for (const seed of seeds) {
      const seedId = string(seed["id"], "META-013 seed id");
      const seedValue = number(seed["value"], "META-013 seed value");
      const run = (): unknown => shuffled(baseSchedule, seedValue).map((item, caseOrdinal) => {
        if (item.kind === "symbol") {
          const observed = parseChordSymbolWithEvidence(item.sourceText, "ascii");
          return {
            seedId,
            seedValue,
            lawId: "T0-META-013",
            caseOrdinal,
            sourceText: item.sourceText,
            ranges: observed.result.ok ? [] : diagnostics(observed.result),
            syntaxWorkEvidence: observed.evidence,
            result: observed.result,
          };
        }
        const observed = parseChartTextWithEvidence(
          item.sourceText,
          { mode: "fragment", meter: checkedMeter({ beatsPerBar: 4, beatUnit: 4 }, "META-013 meter") },
          "ascii",
        );
        return {
          seedId,
          seedValue,
          lawId: "T0-META-013",
          caseOrdinal,
          sourceText: item.sourceText,
          ranges: observed.result.ok ? observed.result.warnings : diagnostics(observed.result),
          syntaxWorkEvidence: observed.evidence,
          delegatedSymbols: observed.delegatedSymbols,
          result: observed.result,
        };
      });
      const first = run();
      const second = run();
      equal(stableJson(second), stableJson(first), `META-013 replay ${seedId}`);
      payload.push(first);
    }
    finishLaw("T0-META-013", seeds.length * baseSchedule.length, payload);
  });

  test("T0-META-014 every reviewed single fault refuses without repair", () => {
    const source = law("T0-META-014");
    const payload: unknown[] = [];
    for (const rowValue of array(source["rows"], "META-014 rows")) {
      const row = record(rowValue, "META-014 row");
      const operation = record(row["operation"], "META-014 operation");
      const base = string(row["base"], "META-014 base");
      const at = number(operation["atUtf16"], "META-014 offset");
      const materialized = `${base.slice(0, at)}${string(operation["text"], "META-014 text")}${base.slice(at)}`;
      equal(materialized, row["mutated"], "META-014 mutation materialization");
      const parsed = parseChordSymbol(materialized, "ascii");
      equal(parsed.ok, false, "META-014 refusal");
      if (parsed.ok) continue;
      equal(parsed.sourceText, materialized, "META-014 exact failed source");
      const expected = record(row["expected"], "META-014 expected");
      equal(
        diagnostics(parsed)[0],
        { code: expected["code"], range: expected["range"] },
        "META-014 exact fault",
      );
      payload.push({ sourceText: materialized, diagnostics: diagnostics(parsed) });
    }
    finishLaw("T0-META-014", payload.length, payload);
  });

  test("T0-META-015 suggestion replacement remains local and validates complete candidates", () => {
    const source = law("T0-META-015");
    const payload: unknown[] = [];
    const groups = ["validSuffixRows", "invalidCandidateRows", "wholeCandidateOrderingRows"] as const;
    for (const group of groups) {
      for (const rowValue of array(source[group], `META-015 ${group}`)) {
        const row = record(rowValue, `META-015 ${group} row`);
        const sourceText = string(row["source"], "META-015 source");
        const parsed = parseChordSymbol(sourceText, "ascii");
        equal(parsed.ok, false, "META-015 refusal");
        if (parsed.ok) continue;
        equal(parsed.didYouMean, row["suggestions"], "META-015 exact suggestions");
        for (const suggestion of parsed.didYouMean) {
          truthy(parseChordSymbol(suggestion, "ascii").ok, "META-015 returned candidate parses");
        }
        if (typeof row["unvalidatedCandidate"] === "string") {
          equal(
            parseChordSymbol(row["unvalidatedCandidate"], "ascii").ok,
            false,
            "META-015 rejected whole candidate fails",
          );
        }
        equal(parseChordSymbol(sourceText, "ascii"), parsed, "META-015 replay");
        payload.push({ group, sourceText, suggestions: parsed.didYouMean });
      }
    }
    finishLaw("T0-META-015", payload.length, payload);
  });

  test("T0-META-016 preflight and grammar lexers visit each owned source unit at most once", () => {
    const probes = [
      { sourceText: "F𝄪maj7", kind: "symbol" as const },
      { sourceText: "| F𝄪maj7:4 |", kind: "chart" as const },
    ];
    const payload: unknown[] = [];
    for (const probe of probes) {
      const charDescriptor = Object.getOwnPropertyDescriptor(String.prototype, "charCodeAt");
      const pointDescriptor = Object.getOwnPropertyDescriptor(String.prototype, "codePointAt");
      if (charDescriptor === undefined || pointDescriptor === undefined) {
        throw new Error("META-016 String scalar operations unavailable");
      }
      const originalChar: unknown = charDescriptor.value;
      const originalPoint: unknown = pointDescriptor.value;
      if (typeof originalChar !== "function" || typeof originalPoint !== "function") {
        throw new Error("META-016 String scalar operations unavailable");
      }
      const preflight = new Map<number, number>();
      const lexer = new Map<number, number>();
      Object.defineProperty(String.prototype, "charCodeAt", {
        ...charDescriptor,
        value: function charCodeAt(this: string, index: number): number {
          if (this === probe.sourceText) preflight.set(index, (preflight.get(index) ?? 0) + 1);
          const observed: unknown = Reflect.apply(originalChar, this, [index]);
          if (typeof observed !== "number") throw new Error("META-016 invalid charCodeAt");
          return observed;
        },
      });
      Object.defineProperty(String.prototype, "codePointAt", {
        ...pointDescriptor,
        value: function codePointAt(this: string, index: number): number | undefined {
          if (this === probe.sourceText) lexer.set(index, (lexer.get(index) ?? 0) + 1);
          const observed: unknown = Reflect.apply(originalPoint, this, [index]);
          if (observed !== undefined && typeof observed !== "number") {
            throw new Error("META-016 invalid codePointAt");
          }
          return observed;
        },
      });
      try {
        const result = probe.kind === "symbol"
          ? parseChordSymbol(probe.sourceText, "unicode")
          : parseChartText(
            probe.sourceText,
            { mode: "fragment", meter: checkedMeter({ beatsPerBar: 4, beatUnit: 4 }, "META-016 meter") },
            "unicode",
          );
        truthy(result.ok, `META-016 ${probe.kind} parse`);
      } finally {
        Object.defineProperty(String.prototype, "charCodeAt", charDescriptor);
        Object.defineProperty(String.prototype, "codePointAt", pointDescriptor);
      }
      if (probe.kind === "symbol") {
        equal(
          [...preflight.entries()],
          Array.from({ length: probe.sourceText.length }, (_, index) => [index, 1]),
          "META-016 symbol preflight ledger",
        );
      } else {
        truthy(
          Array.from({ length: probe.sourceText.length }, (_, index) =>
            (preflight.get(index) ?? 0) >= 1
          ).every(Boolean),
          "META-016 chart preflight reaches every valid code unit",
        );
      }
      truthy([...lexer.values()].every((count) => count === 1), `META-016 ${probe.kind} lexer multiplicity`);
      equal(
        lexer.size,
        Array.from(probe.sourceText).length,
        `META-016 ${probe.kind} scalar coverage`,
      );
      payload.push({ ...probe, preflight: [...preflight], lexer: [...lexer] });
    }

    const parsedSymbol = parseChordSymbolWithEvidence("F𝄪maj7", "unicode");
    if (!parsedSymbol.result.ok) throw new Error("META-016 symbol evidence parse");
    const symbolFormat = formatChordSymbolWithEvidence(parsedSymbol.result.chord, "unicode");
    equal(symbolFormat.evidence.lexerCodePointsVisited, 0, "META-016 symbol formatter does not lex");
    const parsedChart = parseChartTextWithEvidence(
      "| F𝄪maj7:4 |",
      { mode: "fragment", meter: checkedMeter({ beatsPerBar: 4, beatUnit: 4 }, "META-016 format meter") },
      "unicode",
    );
    if (!parsedChart.result.ok) throw new Error("META-016 chart evidence parse");
    const chartFormat = formatChartTextWithEvidence(parsedChart.result.draft, "unicode");
    equal(chartFormat.evidence.lexerCodePointsVisited, 0, "META-016 chart formatter does not lex");
    finishLaw("T0-META-016", 4, payload);
  });

  test("T0-META-017 exported policy is recursively immutable and parse-neutral", () => {
    const source = law("T0-META-017");
    const policyProbe = record(source["policyProbe"], "META-017 policy probe");
    equal(CHORD_SYMBOL_SUGGESTION_POLICY_ID, policyProbe["suggestionPolicyId"], "META-017 policy id");
    equal(CHORD_SYMBOL_SUGGESTION_POLICY_VERSION, policyProbe["suggestionPolicyVersion"], "META-017 policy version");
    equal(CHORD_SYMBOL_SUGGESTION_REPLACEMENTS.length, policyProbe["replacementRowCount"], "META-017 row count");
    for (const value of [
      ACCIDENTAL_STYLES,
      SYMBOL_ERROR_CODES,
      CHART_ERROR_CODES,
      CHORD_SYMBOL_SUGGESTION_REPLACEMENTS,
    ]) {
      truthy(Object.isFrozen(value), "META-017 exported array frozen");
    }
    for (const row of CHORD_SYMBOL_SUGGESTION_REPLACEMENTS) {
      truthy(Object.isFrozen(row), "META-017 replacement row frozen");
    }
    const beforePolicy = stableJson(CHORD_SYMBOL_SUGGESTION_REPLACEMENTS);
    const beforeParse = stableJson(parseChordSymbol("Cx", "ascii"));
    const firstRow = CHORD_SYMBOL_SUGGESTION_REPLACEMENTS[0];
    const attempts: readonly (() => unknown)[] = [
      () => {
        Reflect.apply(Array.prototype.push, CHORD_SYMBOL_SUGGESTION_REPLACEMENTS, [{
          grammarRegion: "quality",
          failedToken: "x",
          replacementToken: "dim7",
        }]);
      },
      () => {
        Reflect.apply(Array.prototype.reverse, CHORD_SYMBOL_SUGGESTION_REPLACEMENTS, []);
      },
      () => Object.defineProperty(CHORD_SYMBOL_SUGGESTION_REPLACEMENTS, "0", {
        value: CHORD_SYMBOL_SUGGESTION_REPLACEMENTS[1],
      }),
      () => Object.defineProperty(firstRow, "replacementToken", { value: "dim7" }),
      () => Object.defineProperty(firstRow, "failedToken", { value: undefined }),
      () => Object.defineProperty(firstRow, "forged", { value: true }),
    ];
    for (const [index, attempt] of attempts.entries()) {
      let thrown: unknown = null;
      try {
        attempt();
      } catch (error: unknown) {
        thrown = error;
      }
      truthy(thrown instanceof TypeError, `META-017 mutation ${String(index)} throws`);
      equal(stableJson(CHORD_SYMBOL_SUGGESTION_REPLACEMENTS), beforePolicy, "META-017 policy bytes stable");
      equal(stableJson(parseChordSymbol("Cx", "ascii")), beforeParse, "META-017 parse stable");
    }
    finishLaw("T0-META-017", attempts.length, { beforePolicy, beforeParse, attempts: attempts.length });
  });

  test("emits one hash-bound deterministic round-trip observation", () => {
    const fixture = record(roundtripFixtureValue, "roundtrip fixture");
    const lawIds = array(fixture["laws"], "roundtrip laws").map((value) =>
      string(record(value, "roundtrip law")["id"], "roundtrip law id")
    );
    equal(observations.map(({ lawId }) => lawId), lawIds, "roundtrip observation inventory");
    const evidence = {
      schema: "changes.evidence.t0-conformance-observation.v1",
      suite: "roundtrip-laws",
      fixtureSchema: fixture["schema"],
      fixtureVersion: fixture["fixtureVersion"],
      productionOutputUsed: fixture["productionOutputUsed"],
      seedAlgorithm: fixture["seedAlgorithm"],
      seeds: fixture["seeds"],
      lawIds,
      lawsObserved: observations.length,
      caseObservations: observations.reduce((sum, item) => sum + item.cases, 0),
      assertionCount,
      lawDigests: Object.fromEntries(observations.map(({ lawId, digest }) => [lawId, digest])),
      status: "pass",
    };
    console.log(`T0_CONFORMANCE_OBSERVATION ${JSON.stringify({
      ...evidence,
      semanticDigest: sha256(evidence),
    })}`);
  });
});
