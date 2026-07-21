import { createHash } from "node:crypto";

import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  makeBeatDuration,
  makeMeter,
  type BeatDuration,
  type ChordSpec,
  type Meter,
} from "../../src/domain";
import * as theory from "../../src/theory";
import { formatChartTextWithEvidence } from "../../src/theory/chart-formatter";
import { parseChartTextWithEvidence } from "../../src/theory/chart-parser";
import {
  formatChordSymbolWithEvidence,
  parseChordSymbolWithEvidence,
} from "../../src/theory/chord-symbol";
import type {
  AccidentalStyle,
  ChartTextDraft,
  ChartTextParseRequest,
  SourceRange,
} from "../../src/theory/syntax-contract";
import type { SyntaxWorkEvidence } from "../../src/theory/syntax-evidence-contract";
import chartFixtureValue from "../fixtures/theory/chart-cases.json";
import symbolFixtureValue from "../fixtures/theory/symbol-cases.json";
import syntaxContractFixtureValue from "../fixtures/theory/t0-syntax-contract.json";

setDefaultTimeout(600_000);

type FixtureRecord = Record<string, unknown>;
type DiagnosticProjection = Readonly<{
  code: string;
  range: SourceRange;
}>;

const symbolFixture = record(symbolFixtureValue, "symbol fixture");
const chartFixture = record(chartFixtureValue, "chart fixture");
const observations = new Map<string, unknown[]>();

function record(value: unknown, label: string): FixtureRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`T0_FIXTURE_RECORD:${label}`);
  }
  return value as FixtureRecord;
}

function records(value: unknown, label: string): readonly FixtureRecord[] {
  if (!Array.isArray(value)) throw new Error(`T0_FIXTURE_ARRAY:${label}`);
  return value.map((item, index) => record(item, `${label}[${String(index)}]`));
}

function values(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`T0_FIXTURE_ARRAY:${label}`);
  return value as unknown[];
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`T0_FIXTURE_STRING:${label}`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`T0_FIXTURE_NUMBER:${label}`);
  }
  return value;
}

function fixtureId(value: FixtureRecord): string {
  return stringValue(value["id"], "case.id");
}

function fixtureRange(value: unknown, label: string): SourceRange {
  const range = record(value, label);
  return {
    start: numberValue(range["start"], `${label}.start`),
    end: numberValue(range["end"], `${label}.end`),
  };
}

function fixtureStyle(value: unknown, label: string): AccidentalStyle {
  if (value !== "ascii" && value !== "unicode") {
    throw new Error(`T0_FIXTURE_STYLE:${label}`);
  }
  return value;
}

function fixtureRequest(value: unknown, label: string): ChartTextParseRequest {
  const request = record(value, label);
  if (request["mode"] === "document") return { mode: "document" };
  if (request["mode"] !== "fragment") {
    throw new Error(`T0_FIXTURE_REQUEST_MODE:${label}`);
  }
  const meter = record(request["meter"], `${label}.meter`);
  return {
    mode: "fragment",
    meter: meterValue(
      numberValue(
        meter["beatsPerBar"],
        `${label}.meter.beatsPerBar`,
      ),
      numberValue(meter["beatUnit"], `${label}.meter.beatUnit`),
    ),
  };
}

function meterValue(beatsPerBar: number, beatUnit: number): Meter {
  const checked = makeMeter({ beatsPerBar, beatUnit });
  if (!checked.ok) throw new Error("T0_FIXTURE_METER");
  return checked.value;
}

function beatDuration(numerator: number, denominator = 1): BeatDuration {
  const checked = makeBeatDuration({ numerator, denominator });
  if (!checked.ok) throw new Error("T0_FIXTURE_DURATION");
  return checked.value;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [
      key,
      canonicalJsonValue(Reflect.get(value, key)),
    ]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceIdentity(sourceText: string): Readonly<{
  utf16CodeUnits: number;
  sha256: string;
}> {
  return { utf16CodeUnits: sourceText.length, sha256: sha256(sourceText) };
}

function observe(caseId: string, value: unknown): void {
  const prior = observations.get(caseId) ?? [];
  prior.push(value);
  observations.set(caseId, prior);
}

function diagnostics(
  values: readonly Readonly<{ code: string; range: SourceRange }>[],
): readonly DiagnosticProjection[] {
  return values.map(({ code, range }) => ({ code, range }));
}

function expectedDiagnostics(value: unknown): readonly DiagnosticProjection[] {
  return records(value, "expected diagnostics").map((item) => ({
    code: stringValue(item["code"], "diagnostic.code"),
    range: fixtureRange(item["range"], "diagnostic.range"),
  }));
}

function evidenceProjection(
  evidence: SyntaxWorkEvidence,
  expectedValue: unknown,
): FixtureRecord {
  const expected = record(expectedValue, "expected evidence");
  return Object.fromEntries(
    Object.keys(expected).map((key) => [key, Reflect.get(evidence, key)]),
  );
}

function semanticChord(chord: ChordSpec): Omit<ChordSpec, "sourceText"> {
  const { sourceText: _sourceText, ...semantic } = chord;
  void _sourceText;
  return semantic;
}

function expectedChord(
  sourceText: string,
  chordFieldsValue: unknown = {},
): ChordSpec {
  const defaults = record(
    symbolFixture["expectedChordDefaults"],
    "expectedChordDefaults",
  );
  const chordFields = record(chordFieldsValue, "chordFields");
  return {
    ...defaults,
    ...chordFields,
    kind: "parsed",
    sourceText,
  } as ChordSpec;
}

function canonicalSymbolRows(): readonly FixtureRecord[] {
  return records(symbolFixture["canonicalCases"], "canonicalCases");
}

function symbolCaseById(caseId: string): FixtureRecord {
  const rows = [
    ...canonicalSymbolRows(),
    ...records(symbolFixture["aliasCases"], "aliasCases"),
  ];
  const found = rows.find((row) => fixtureId(row) === caseId);
  if (found === undefined) throw new Error(`T0_SYMBOL_REFERENCE:${caseId}`);
  return found;
}

function expectedSemanticChordById(caseId: string): Omit<ChordSpec, "sourceText"> {
  const row = symbolCaseById(caseId);
  const expected = record(row["expected"], `${caseId}.expected`);
  const sameAstAs = expected["sameAstAs"];
  if (typeof sameAstAs === "string") return expectedSemanticChordById(sameAstAs);
  const source = typeof row["input"] === "string"
    ? row["input"]
    : stringValue(
      Array.isArray(row["inputs"]) ? row["inputs"][0] : undefined,
      `${caseId}.inputs[0]`,
    );
  return semanticChord(expectedChord(source, expected["chordFields"] ?? {}));
}

function symbolInputs(row: FixtureRecord): readonly Readonly<{
  sourceText: string;
  row: FixtureRecord | null;
}>[] {
  if (typeof row["input"] === "string") {
    return [{ sourceText: row["input"], row: null }];
  }
  if (Array.isArray(row["inputs"])) {
    return row["inputs"].map((value, index) => {
      if (typeof value === "string") return { sourceText: value, row: null };
      const item = record(value, `inputs[${String(index)}]`);
      return { sourceText: stringValue(item["source"], "input.source"), row: item };
    });
  }
  if (Array.isArray(row["rows"])) {
    return records(row["rows"], "rows").map((item) => ({
      sourceText: stringValue(item["source"], "row.source"),
      row: item,
    }));
  }
  const recipe = record(row["materializationRecipe"], "materializationRecipe");
  if (recipe["kind"] === "utf16-code-units") {
    const units = (recipe["units"] as unknown[]).map((unit, index) =>
      numberValue(unit, `units[${String(index)}]`));
    return [{ sourceText: String.fromCharCode(...units), row: null }];
  }
  throw new Error(`T0_SYMBOL_INPUT:${fixtureId(row)}`);
}

function expectedSymbolFailure(
  caseRow: FixtureRecord,
  inputRow: FixtureRecord | null,
): Readonly<{
  diagnostics: readonly DiagnosticProjection[];
  didYouMean: readonly string[];
}> {
  const expected = record(caseRow["expected"], `${fixtureId(caseRow)}.expected`);
  const diagnosticValue = inputRow?.["diagnostics"] ?? expected["diagnostics"];
  let expectedDiagnostic: readonly DiagnosticProjection[];
  if (diagnosticValue !== undefined) {
    expectedDiagnostic = expectedDiagnostics(diagnosticValue);
  } else {
    const code = stringValue(
      inputRow?.["code"] ?? expected["code"],
      "expected.code",
    );
    expectedDiagnostic = [{
      code,
      range: fixtureRange(inputRow?.["range"], "expected.range"),
    }];
  }
  const suggestions = inputRow?.["didYouMean"] ?? expected["didYouMean"] ?? [];
  if (!Array.isArray(suggestions) || !suggestions.every((item) => typeof item === "string")) {
    throw new Error("T0_SUGGESTION_FIXTURE");
  }
  return {
    diagnostics: expectedDiagnostic,
    didYouMean: suggestions.map((item, index) =>
      stringValue(item, `suggestions[${String(index)}]`)),
  };
}

function runSymbolSuccessCase(row: FixtureRecord): void {
  const caseId = fixtureId(row);
  const expected = record(row["expected"], `${caseId}.expected`);
  const inputs = symbolInputs(row);
  const styles = row["styles"] === undefined
    ? [[fixtureStyle(row["style"], `${caseId}.style`), expected["canonicalText"]]] as const
    : Object.entries(record(row["styles"], `${caseId}.styles`));

  for (const { sourceText } of inputs) {
    for (const [styleValue, canonicalValue] of styles) {
      const style = fixtureStyle(styleValue, `${caseId}.style`);
      const parsed = theory.parseChordSymbol(sourceText, style);
      expect(parsed.ok, caseId).toBe(true);
      if (!parsed.ok) continue;
      const canonicalText = stringValue(canonicalValue, `${caseId}.canonicalText`);
      expect(parsed.canonicalText, caseId).toBe(canonicalText);
      expect(parsed.warnings, caseId).toEqual([]);
      expect(parsed.chord.sourceText, caseId).toBe(sourceText);

      const sameAstAs = expected["sameAstAs"];
      const semanticExpected = typeof sameAstAs === "string"
        ? expectedSemanticChordById(sameAstAs)
        : semanticChord(expectedChord(sourceText, expected["chordFields"] ?? {}));
      expect(semanticChord(parsed.chord), caseId).toEqual(semanticExpected);
      expect(theory.formatChordSymbol(parsed.chord, style), caseId).toEqual({
        ok: true,
        canonicalText,
      });

      const withEvidence = parseChordSymbolWithEvidence(sourceText, style);
      expect(withEvidence.result, caseId).toEqual(parsed);
      observe(caseId, {
        operation: "parse-and-format-symbol",
        source: sourceIdentity(sourceText),
        style,
        canonicalText,
        semanticChord: semanticChord(parsed.chord),
        evidence: withEvidence.evidence,
      });
    }
  }
}

function runSymbolFailureCase(row: FixtureRecord): void {
  const caseId = fixtureId(row);
  for (const input of symbolInputs(row)) {
    const style = fixtureStyle(row["style"], `${caseId}.style`);
    const parsed = theory.parseChordSymbol(input.sourceText, style);
    const expected = expectedSymbolFailure(row, input.row);
    expect(parsed.ok, caseId).toBe(false);
    if (parsed.ok) continue;
    expect(parsed.sourceText, caseId).toBe(input.sourceText);
    expect(diagnostics(parsed.diagnostics), caseId).toEqual(expected.diagnostics);
    expect(parsed.didYouMean, caseId).toEqual(expected.didYouMean);
    for (const suggestion of parsed.didYouMean) {
      expect(theory.parseChordSymbol(suggestion, style).ok, `${caseId}:${suggestion}`)
        .toBe(true);
    }
    const withEvidence = parseChordSymbolWithEvidence(input.sourceText, style);
    expect(withEvidence.result, caseId).toEqual(parsed);
    observe(caseId, {
      operation: "parse-symbol-refusal",
      source: sourceIdentity(input.sourceText),
      style,
      diagnostics: expected.diagnostics,
      didYouMean: parsed.didYouMean,
      evidence: withEvidence.evidence,
    });
  }

  const acceptedNearMisses = row["nearMissesAccepted"];
  if (Array.isArray(acceptedNearMisses)) {
    for (const sourceText of acceptedNearMisses) {
      expect(theory.parseChordSymbol(stringValue(sourceText, "near miss"), "ascii").ok)
        .toBe(true);
    }
  }
}

function runSymbolFormatFailureCase(row: FixtureRecord): void {
  const caseId = fixtureId(row);
  const chord = record(row["inputChord"], `${caseId}.inputChord`) as ChordSpec;
  const style = fixtureStyle(row["style"], `${caseId}.style`);
  const expected = record(row["expected"], `${caseId}.expected`);
  const formatted = theory.formatChordSymbol(chord, style);
  expect(formatted.ok, caseId).toBe(false);
  if (formatted.ok) return;
  expect(diagnostics(formatted.diagnostics), caseId)
    .toEqual(expectedDiagnostics(expected["diagnostics"]));
  const withEvidence = formatChordSymbolWithEvidence(chord, style);
  expect(withEvidence.result, caseId).toEqual(formatted);
  observe(caseId, {
    operation: "format-symbol-refusal",
    style,
    diagnostics: diagnostics(formatted.diagnostics),
    evidence: withEvidence.evidence,
  });
}

function symbolLimitSource(row: FixtureRecord, count: number): string {
  const recipe = record(row["materializationRecipe"], "materializationRecipe");
  switch (recipe["kind"]) {
    case "append-code-points":
      return `${stringValue(recipe["prefix"], "prefix")}${stringValue(recipe["append"], "append").repeat(count)}`;
    case "symbol-token-count": {
      const literal = stringValue(recipe["literalSource"], "literalSource");
      return count === 65 ? literal : literal.slice(0, -1);
    }
    case "symbol-modifier-count": {
      const pattern = (recipe["modifierPattern"] as unknown[])
        .map((item) => stringValue(item, "modifierPattern"));
      return `${stringValue(recipe["base"], "base")}${Array.from(
        { length: count },
        (_, index) => pattern[index % pattern.length],
      ).join("")}`;
    }
    case "astral-symbol-code-point-boundary":
      return `C${stringValue(recipe["scalar"], "scalar").repeat(count)}`;
    default:
      throw new Error(`T0_SYMBOL_LIMIT_RECIPE:${String(recipe["kind"])}`);
  }
}

function runSymbolBoundaryCase(row: FixtureRecord): void {
  const caseId = fixtureId(row);
  const expected = record(row["expected"], `${caseId}.expected`);
  const received = numberValue(expected["received"], `${caseId}.received`);
  const recipe = record(row["materializationRecipe"], `${caseId}.recipe`);
  const sourceCount = recipe["kind"] === "append-code-points" ||
      recipe["kind"] === "astral-symbol-code-point-boundary"
    ? numberValue(recipe["appendCount"], `${caseId}.appendCount`)
    : recipe["kind"] === "symbol-modifier-count"
    ? numberValue(recipe["targetModifiers"], `${caseId}.targetModifiers`)
    : received;
  const sourceText = symbolLimitSource(row, sourceCount);
  const parsed = parseChordSymbolWithEvidence(sourceText, "ascii");
  expect(parsed.result.ok, caseId).toBe(false);
  if (!parsed.result.ok) {
    expect(diagnostics(parsed.result.diagnostics), caseId).toEqual([{
      code: stringValue(expected["code"], `${caseId}.code`),
      range: fixtureRange(expected["range"], `${caseId}.range`),
    }]);
  }
  const expectedEvidence = record(expected["expectedEvidence"], "expected evidence");
  expect(evidenceProjection(parsed.evidence, expectedEvidence), caseId)
    .toEqual(expectedEvidence);

  const nearCount = sourceCount - 1;
  const nearSource = symbolLimitSource(row, nearCount);
  const near = theory.parseChordSymbol(nearSource, "ascii");
  if (!near.ok) {
    expect(near.diagnostics.some(({ code }) => code === expected["code"]), caseId)
      .toBe(false);
  }
  const lowerBoundary = row["lowerBoundary"];
  if (lowerBoundary !== undefined) {
    const lower = record(lowerBoundary, `${caseId}.lowerBoundary`);
    const target = numberValue(lower["targetModifiers"], "targetModifiers");
    const lowerResult = theory.parseChordSymbol(symbolLimitSource(row, target), "ascii");
    if (!lowerResult.ok) {
      expect(lowerResult.diagnostics.some(({ code }) => code === expected["code"]), caseId)
        .toBe(false);
    }
  }
  observe(caseId, {
    operation: "parse-symbol-boundary",
    source: sourceIdentity(sourceText),
    diagnostics: parsed.result.ok ? [] : diagnostics(parsed.result.diagnostics),
    evidence: evidenceProjection(parsed.evidence, expected["expectedEvidence"]),
    nearBoundary: { source: sourceIdentity(nearSource), limitTriggered: false },
  });
}

function flattenedEvents(draft: ChartTextDraft) {
  return draft.sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.events));
}

function flattenedMeasures(draft: ChartTextDraft) {
  return draft.sections.flatMap((section) => measureWithOwner(section));
}

function measureWithOwner(section: ChartTextDraft["sections"][number]) {
  return section.measures.map((measure) => ({ section, measure }));
}

function eventDurationText(event: ChartTextDraft["sections"][number]["measures"][number]["events"][number]): string {
  return `${String(event.duration.numerator)}/${String(event.duration.denominator)}`;
}

function eventSymbolSource(draft: ChartTextDraft, event: ReturnType<typeof flattenedEvents>[number]): string {
  return draft.sourceText.slice(event.symbolRange.start, event.symbolRange.end) === "/"
    ? event.chord.sourceText
    : draft.sourceText.slice(event.symbolRange.start, event.symbolRange.end);
}

function projectNode(actual: unknown, expectedValue: unknown): unknown {
  if (Array.isArray(expectedValue)) {
    if (!Array.isArray(actual)) return actual;
    expect(actual).toHaveLength(expectedValue.length);
    return expectedValue.map((expectedItem, index) =>
      projectNode(actual[index], expectedItem));
  }
  if (typeof expectedValue !== "object" || expectedValue === null) return actual;
  if (typeof actual !== "object" || actual === null) return actual;
  const expected = record(expectedValue, "projection expected");
  const result: FixtureRecord = {};
  for (const key of Object.keys(expected)) {
    if (key === "chordCaseId" || key === "symbol" || key === "duration") {
      continue;
    }
    result[key] = projectNode(Reflect.get(actual, key), expected[key]);
  }
  if (typeof expected["chordCaseId"] === "string") {
    const chord = Reflect.get(actual, "chord") as ChordSpec;
    result["chordCaseId"] = expected["chordCaseId"];
    expect(semanticChord(chord)).toEqual(expectedSemanticChordById(expected["chordCaseId"]));
  }
  if (typeof expected["symbol"] === "string") {
    const chord = Reflect.get(actual, "chord") as ChordSpec;
    result["symbol"] = chord.sourceText;
  }
  if (typeof expected["duration"] === "string") {
    const duration = record(Reflect.get(actual, "duration"), "actual duration");
    result["duration"] = `${String(duration["numerator"])}/${String(duration["denominator"])}`;
  } else if (expected["duration"] !== undefined) {
    result["duration"] = projectNode(Reflect.get(actual, "duration"), expected["duration"]);
  }
  return result;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function durationTotal(
  events: readonly ReturnType<typeof flattenedEvents>[number][],
): Readonly<{ numerator: number; denominator: number }> {
  let numerator = 0;
  let denominator = 1;
  for (const event of events) {
    numerator = numerator * event.duration.denominator +
      event.duration.numerator * denominator;
    denominator *= event.duration.denominator;
    const divisor = greatestCommonDivisor(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
  }
  return { numerator, denominator };
}

function chartSuccessProjection(
  draft: ChartTextDraft,
  expected: FixtureRecord,
  request: ChartTextParseRequest,
  style: AccidentalStyle,
  canonicalText: string,
): FixtureRecord {
  const projection: FixtureRecord = { ok: true };
  const sections = draft.sections;
  const measures = flattenedMeasures(draft);
  const events = flattenedEvents(draft);
  const firstSection = sections[0];
  const firstMeasure = measures[0]?.measure;
  const firstEvent = events[0];

  for (const key of Object.keys(expected)) {
    switch (key) {
      case "ok":
      case "canonicalText":
      case "warnings":
        break;
      case "draft":
        projection[key] = projectNode(draft, expected[key]);
        break;
      case "headers":
        projection[key] = projectNode(draft.headers, expected[key]);
        break;
      case "section": {
        const expectedSection = record(expected[key], "expected.section");
        const sectionProjection = projectNode(
          firstSection,
          expectedSection,
        ) as FixtureRecord;
        if (
          expectedSection["explicitEmptyAnnotationPresentOnlyInSourceText"] !==
            undefined
        ) {
          if (firstSection === undefined || firstMeasure === undefined) {
            throw new Error("T0_EXPLICIT_EMPTY_SECTION_NODES");
          }
          const sectionPrefix = draft.sourceText.slice(
            firstSection.range.start,
            firstMeasure.range.start,
          );
          const localAnnotationStart = sectionPrefix.indexOf('""');
          const authoredAnnotationRange = localAnnotationStart < 0
            ? null
            : {
              start: firstSection.range.start + localAnnotationStart,
              end: firstSection.range.start + localAnnotationStart + 2,
            };
          const canonicalSectionLine = canonicalText.split("\n", 1)[0] ?? "";
          const eventAnnotationRange = firstEvent?.annotationRange ?? null;
          const eventAuthoredLocationIsExact = eventAnnotationRange !== null &&
            draft.sourceText.slice(
              eventAnnotationRange.start,
              eventAnnotationRange.end,
            ) === '""';
          const explicitEmptyAnnotationPresentOnlyInSourceText =
            firstSection.annotation === "" &&
            authoredAnnotationRange !== null &&
            draft.sourceText.slice(
              authoredAnnotationRange.start,
              authoredAnnotationRange.end,
            ) === '""' &&
            eventAuthoredLocationIsExact &&
            !canonicalSectionLine.includes('""');
          expect(explicitEmptyAnnotationPresentOnlyInSourceText).toBe(true);
          sectionProjection["explicitEmptyAnnotationPresentOnlyInSourceText"] =
            explicitEmptyAnnotationPresentOnlyInSourceText;
        }
        projection[key] = sectionProjection;
        break;
      }
      case "measure":
        projection[key] = projectNode(firstMeasure, expected[key]);
        break;
      case "event":
        projection[key] = projectNode(firstEvent, expected[key]);
        break;
      case "sections":
        projection[key] = typeof expected[key] === "number"
          ? sections.length
          : projectNode(sections, expected[key]);
        break;
      case "measures":
        projection[key] = typeof expected[key] === "number"
          ? measures.length
          : projectNode(measures.map(({ measure }) => measure), expected[key]);
        break;
      case "events":
        projection[key] = typeof expected[key] === "number"
          ? events.length
          : projectNode(events, expected[key]);
        break;
      case "eventsObserved":
        projection[key] = events.length;
        break;
      case "eventDurations":
        projection[key] = events.map(({ duration }) => duration);
        break;
      case "durationSources":
        projection[key] = events.map(({ durationRange }) =>
          durationRange === null ? "allocated" : "explicit");
        break;
      case "measureTotal":
        projection[key] = durationTotal(firstMeasure?.events ?? []);
        break;
      case "measureCapacity": {
        if (request.mode !== "fragment") throw new Error("T0_CAPACITY_REQUEST");
        const numerator = request.meter.beatsPerBar * 4;
        const denominator = request.meter.beatUnit;
        const divisor = greatestCommonDivisor(numerator, denominator);
        projection[key] = {
          numerator: numerator / divisor,
          denominator: denominator / divisor,
        };
        break;
      }
      case "ranges": {
        const expectedRanges = values(expected[key], "ranges");
        const first = expectedRanges[0];
        const componentProjection = typeof first === "object" && first !== null &&
          Object.hasOwn(first, "event");
        projection[key] = componentProjection
          ? events.map((event) => ({
            event: event.range,
            symbol: event.symbolRange,
            duration: event.durationRange,
          }))
          : events.map((event) => event.range);
        break;
      }
      case "sectionRange":
        projection[key] = firstSection?.range;
        break;
      case "measureRange":
        projection[key] = firstMeasure?.range;
        break;
      case "eventRange":
        projection[key] = firstEvent?.range;
        break;
      case "symbolRange":
        projection[key] = firstEvent?.symbolRange;
        break;
      case "durationRange":
        projection[key] = firstEvent?.durationRange;
        break;
      case "sectionRanges":
        projection[key] = sections.map((section) => section.range);
        break;
      case "measureRanges":
        projection[key] = measures.map(({ measure }) => measure.range);
        break;
      case "eventRanges":
        projection[key] = events.map(({ range, symbolRange, durationRange }) => ({
          range,
          symbolRange,
          durationRange,
        }));
        break;
      case "measureEventCounts":
        projection[key] = measures.map(({ measure }) => measure.events.length);
        break;
      case "sectionSummaries":
        projection[key] = sections.map((section) => ({
          name: section.name,
          annotation: section.annotation,
          measureEventCounts: section.measures.map((measure) => measure.events.length),
        }));
        break;
      case "rangeProjection":
        projection[key] = {
          sections: sections.map(({ ordinal, range }) => ({ ordinal, range })),
          measures: measures.map(({ section, measure }) => ({
            sectionOrdinal: section.ordinal,
            measureOrdinal: measure.ordinal,
            range: measure.range,
          })),
          events: events.map(({ ordinal, range, symbolRange, durationRange, annotationRange }) => ({
            ordinal,
            range,
            symbolRange,
            durationRange,
            annotationRange,
          })),
        };
        break;
      case "eventSummaries":
        projection[key] = events.map((event) => ({
          symbol: eventSymbolSource(draft, event),
          duration: eventDurationText(event),
          annotation: event.annotation,
          origin: event.origin,
          ...(event.origin === "repeat"
            ? { repeatedFromOrdinal: event.repeatedFromOrdinal }
            : {}),
        }));
        break;
      case "sectionName":
        projection[key] = firstSection?.name;
        break;
      case "sectionKind":
        projection[key] = firstSection?.kind;
        break;
      case "measureKind":
        projection[key] = firstMeasure?.kind;
        break;
      case "title":
        projection[key] = draft.headers.title;
        break;
      case "description":
        projection[key] = draft.headers.description;
        break;
      case "key":
        projection[key] = draft.headers.key;
        break;
      case "sectionAnnotation":
        projection[key] = firstSection?.annotation;
        break;
      case "eventAnnotation":
        projection[key] = firstEvent?.annotation;
        break;
      case "eventRoot":
        projection[key] = firstEvent?.chord.root;
        break;
      case "separatorRange":
        if (measures.length < 2) throw new Error("T0_SEPARATOR_MEASURES");
        projection[key] = {
          start: measures[0]?.measure.range.end,
          end: measures[1]?.measure.range.start,
        };
        break;
      case "boundaryRoles": {
        const roles: string[] = [];
        if (draft.headers.meter?.beatsPerBar === 1) {
          roles.push("minimum-meter-numerator");
        }
        if (draft.headers.meter?.beatsPerBar === 32) {
          roles.push("maximum-meter-numerator");
        }
        if (draft.headers.tempoBpm === 20) roles.push("minimum-tempo");
        if (draft.headers.tempoBpm === 400) roles.push("maximum-tempo");
        if (draft.headers.meter?.beatUnit === 2) roles.push("beat-unit-2");
        if (draft.headers.meter?.beatUnit === 8) roles.push("beat-unit-8");
        projection[key] = roles;
        break;
      }
      case "inputHeaderOrder":
        projection[key] = headerOrder(draft.sourceText);
        break;
      case "canonicalHeaderOrder":
        projection[key] = headerOrder(canonicalText);
        break;
      case "canonicalOmitsExplicitEmptySectionAnnotation": {
        const omitted = !canonicalText.split("\n")[0]?.includes('""');
        expect(omitted).toBe(true);
        projection[key] = omitted;
        break;
      }
      case "canonicalOmitsExplicitEmptyEventAnnotation": {
        const omitted = !canonicalText.includes(' ""');
        expect(omitted).toBe(true);
        projection[key] = omitted;
        break;
      }
      case "canonicalReparseAnnotationValues": {
        const reparsed = theory.parseChartText(canonicalText, request, style);
        expect(reparsed.ok).toBe(true);
        if (!reparsed.ok) throw new Error("T0_CANONICAL_REPARSE");
        projection[key] = {
          section: reparsed.draft.sections[0]?.annotation,
          event: reparsed.draft.sections[0]?.measures[0]?.events[0]?.annotation,
        };
        break;
      }
      case "intentionalNormalization": {
        const sourceHasEmptyAnnotation = draft.sourceText.includes('""');
        const canonicalOmitsEmptyAnnotation = !canonicalText.includes('""');
        expect(sourceHasEmptyAnnotation).toBe(true);
        expect(canonicalOmitsEmptyAnnotation).toBe(true);
        projection[key] = expected[key];
        break;
      }
      case "trailingSpaceAndCommentExcludedFromStructuredRanges": {
        const structuredEnds = [
          ...sections.map(({ range }) => range.end),
          ...measures.map(({ measure }) => measure.range.end),
          ...events.flatMap(({ range, symbolRange, durationRange, annotationRange }) => [
            range.end,
            symbolRange.end,
            ...(durationRange === null ? [] : [durationRange.end]),
            ...(annotationRange === null ? [] : [annotationRange.end]),
          ]),
        ];
        const structuredEnd = Math.max(...structuredEnds);
        const tail = draft.sourceText.slice(structuredEnd);
        const excluded = /^[ \t]+;[^\r\n]*$/u.test(tail) &&
          structuredEnds.every((end) => end <= structuredEnd) &&
          !canonicalText.includes(tail);
        expect(excluded).toBe(true);
        projection[key] = excluded;
        break;
      }
      case "separatorOwnedByMeasure": {
        if (measures.length < 2) throw new Error("T0_SEPARATOR_OWNERSHIP");
        const separator = {
          start: measures[0]?.measure.range.end ?? 0,
          end: measures[1]?.measure.range.start ?? 0,
        };
        projection[key] = measures.some(({ measure }) =>
          measure.range.start < separator.end && measure.range.end > separator.start);
        break;
      }
      case "newlineStartsNewBarredSequenceWithoutEmptyMeasure": {
        if (measures.length < 2) throw new Error("T0_NEWLINE_MEASURES");
        const separator = draft.sourceText.slice(
          measures[0]?.measure.range.end,
          measures[1]?.measure.range.start,
        );
        const condition = separator === "\n" &&
          measures.length === 2 && measures.every(({ measure }) => measure.events.length > 0);
        expect(condition).toBe(true);
        projection[key] = condition;
        break;
      }
      case "sectionGapBeginsAfterAnnotation":
      case "horizontalGapIsAccepted": {
        if (firstSection === undefined || firstMeasure === undefined) {
          throw new Error("T0_SECTION_GAP_NODES");
        }
        const prefix = draft.sourceText.slice(firstSection.range.start, firstMeasure.range.start);
        const encodedAnnotation = JSON.stringify(firstSection.annotation);
        const annotationStart = prefix.indexOf(encodedAnnotation);
        const gap = annotationStart < 0
          ? ""
          : prefix.slice(annotationStart + encodedAnnotation.length);
        const condition = annotationStart >= 0 && /^[ \t]+$/u.test(gap);
        expect(condition).toBe(true);
        projection[key] = condition;
        break;
      }
      case "slotSeparatorBeginsAfterCompleteAnnotation": {
        const first = events[0];
        const second = events[1];
        if (first?.annotationRange === null || first?.annotationRange === undefined ||
          second === undefined) {
          throw new Error("T0_SLOT_SEPARATOR_NODES");
        }
        const separator = draft.sourceText.slice(
          first.annotationRange.end,
          second.symbolRange.start,
        );
        const condition = separator.length > 0 && /^[ \t]+$/u.test(separator);
        expect(condition).toBe(true);
        projection[key] = condition;
        break;
      }
      case "leadingZeroesRemovedBeforeBoundComparison": {
        const sourceDurations = draft.sourceText.match(/:\d+(?:\/\d+)?/gu) ?? [];
        const canonicalDurations = canonicalText.match(/:\d+(?:\/\d+)?/gu) ?? [];
        const condition = sourceDurations.some((duration) => /(?:^:0|\/0)/u.test(duration)) &&
          canonicalDurations.every((duration) => !/(?:^:0\d|\/0\d)/u.test(duration));
        expect(condition).toBe(true);
        projection[key] = condition;
        break;
      }
      case "rawSourcePreserved":
        // runChartSuccess already proved equality to the independently supplied input.
        projection[key] = true;
        break;
      case "bigIntReceivesOnlyBoundedSignificantSlices":
        throw new Error("T0_BIGINT_CLAIM_REQUIRES_EVIDENCE");
      default:
        throw new Error(`T0_UNKNOWN_SUCCESS_EXPECTATION:${key}`);
    }
  }
  return projection;
}

function headerOrder(sourceText: string): readonly string[] {
  return sourceText.split("\n")
    .filter((line) => line.startsWith("@"))
    .map((line) => line.slice(1).split(/[ \t]/u, 1)[0] ?? "");
}

function runChartSuccess(
  caseId: string,
  sourceText: string,
  request: ChartTextParseRequest,
  style: AccidentalStyle,
  expected: FixtureRecord,
  expectedCanonical: string,
  expectedEvidenceValue?: unknown,
): void {
  const parsed = theory.parseChartText(sourceText, request, style);
  expect(parsed.ok, caseId).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.draft.sourceText, caseId).toBe(sourceText);
  expect(parsed.canonicalText, caseId).toBe(expectedCanonical);
  if (expected["warnings"] !== undefined) {
    expect(diagnostics(parsed.warnings), caseId)
      .toEqual(expectedDiagnostics(expected["warnings"]));
  }
  const projection = chartSuccessProjection(
    parsed.draft,
    expected,
    request,
    style,
    parsed.canonicalText,
  );
  if (expected["canonicalText"] !== undefined) {
    projection["canonicalText"] = parsed.canonicalText;
  }
  if (expected["warnings"] !== undefined) {
    projection["warnings"] = diagnostics(parsed.warnings);
  }
  expect(projection, caseId).toEqual(expected);
  expect(theory.formatChartText(parsed.draft, style), caseId).toEqual({
    ok: true,
    canonicalText: expectedCanonical,
  });
  const withEvidence = parseChartTextWithEvidence(sourceText, request, style);
  expect(withEvidence.result, caseId).toEqual(parsed);
  if (expectedEvidenceValue !== undefined) {
    const expectedEvidence = record(expectedEvidenceValue, "expected evidence");
    expect(evidenceProjection(withEvidence.evidence, expectedEvidence), caseId)
      .toEqual(expectedEvidence);
  }
  observe(caseId, {
    operation: "parse-and-format-chart",
    source: sourceIdentity(sourceText),
    request,
    style,
    canonicalText: parsed.canonicalText,
    projection,
    evidence: expectedEvidenceValue === undefined
      ? withEvidence.evidence
      : evidenceProjection(withEvidence.evidence, expectedEvidenceValue),
  });
}

function runChartSuccessCase(row: FixtureRecord): void {
  const caseId = fixtureId(row);
  const request = fixtureRequest(row["request"], `${caseId}.request`);
  const expected = record(row["expected"], `${caseId}.expected`);
  if (row["kind"] === "leading-zero-duration-normalization") {
    const claimEvidence: SyntaxWorkEvidence[] = [];
    const claimSources: string[] = [];
    const claimCanonical: string[] = [];
    const sourcePreservationProofs: boolean[] = [];
    for (const [index, child] of records(row["rows"], `${caseId}.rows`).entries()) {
      const sourceText = stringValue(child["source"], `${caseId}.rows.source`);
      const childExpected: FixtureRecord = {
        ok: true,
        canonicalText: stringValue(child["canonicalText"], "canonicalText"),
        durationRange: fixtureRange(child["durationRange"], "durationRange"),
        ...(child["expectedDuration"] === undefined
          ? { eventDurations: child["expectedDurations"] }
          : { eventDurations: [child["expectedDuration"]] }),
      };
      runChartSuccess(
        caseId,
        sourceText,
        request,
        "ascii",
        childExpected,
        stringValue(child["canonicalText"], "canonicalText"),
        child["expectedEvidence"],
      );
      const withEvidence = parseChartTextWithEvidence(sourceText, request, "ascii");
      expect(withEvidence.result.ok, `${caseId}:${String(index)}`).toBe(true);
      if (!withEvidence.result.ok) throw new Error("T0_LEADING_ZERO_PARSE");
      expect(withEvidence.result.draft.sourceText, `${caseId}:${String(index)}`)
        .toBe(sourceText);
      sourcePreservationProofs.push(
        withEvidence.result.draft.sourceText === sourceText,
      );
      claimEvidence.push(withEvidence.evidence);
      claimSources.push(sourceText);
      claimCanonical.push(withEvidence.result.canonicalText);
      expect(sourceText.length, `${caseId}:${String(index)}`).toBeGreaterThan(0);
    }
    const leadingZeroesRemovedBeforeBoundComparison = claimSources.every((sourceText) =>
      /(?:^|[/:])0+\d/u.test(sourceText)) && claimCanonical.every((canonicalText) =>
      !/(?:^|[/:])0\d/u.test(canonicalText));
    const rawSourcePreserved = sourcePreservationProofs.length === claimSources.length &&
      sourcePreservationProofs.every(Boolean);
    const bigIntReceivesOnlyBoundedSignificantSlices = claimEvidence.every((evidence) =>
      evidence.maxSourceBigIntDigits <= 13);
    expect(leadingZeroesRemovedBeforeBoundComparison).toBe(true);
    expect(rawSourcePreserved).toBe(true);
    expect(bigIntReceivesOnlyBoundedSignificantSlices).toBe(true);
    const claimProjection: FixtureRecord = {
      ok: true,
      leadingZeroesRemovedBeforeBoundComparison,
      rawSourcePreserved,
      bigIntReceivesOnlyBoundedSignificantSlices,
    };
    expect(claimProjection, caseId).toEqual(expected);
    observe(caseId, {
      operation: "chart-success-derived-claims",
      claims: claimProjection,
    });
    return;
  }
  const sourceText = stringValue(row["input"], `${caseId}.input`);
  if (row["styles"] !== undefined) {
    for (const [styleValue, canonicalValue] of Object.entries(
      record(row["styles"], `${caseId}.styles`),
    )) {
      runChartSuccess(
        caseId,
        sourceText,
        request,
        fixtureStyle(styleValue, `${caseId}.style`),
        expected,
        stringValue(canonicalValue, `${caseId}.canonicalText`),
      );
    }
    return;
  }
  runChartSuccess(
    caseId,
    sourceText,
    request,
    fixtureStyle(row["style"], `${caseId}.style`),
    expected,
    stringValue(expected["canonicalText"], `${caseId}.canonicalText`),
  );
}

function chartInsertableProjection(
  sourceText: string,
  actual: readonly unknown[],
  expectedValue: unknown,
): unknown {
  const expected = records(expectedValue, "insertable chords");
  if (actual.length !== expected.length) return actual;
  return expected.map((expectedItem, index) => {
    const actualItem = actual[index];
    const projected = projectNode(actualItem, expectedItem) as FixtureRecord;
    if (typeof expectedItem["symbol"] === "string") {
      const item = record(actualItem, "actual insertable");
      const chord = item["chord"] as ChordSpec;
      projected["symbol"] = sourceText.slice(
        (item["symbolRange"] as SourceRange).start,
        (item["symbolRange"] as SourceRange).end,
      ) === "/" ? chord.sourceText : chord.sourceText;
    }
    return projected;
  });
}

function assertDelegatedEvidence(
  actual: ReturnType<typeof parseChartTextWithEvidence>["delegatedSymbols"],
  expectedValue: unknown,
): void {
  const expected = records(expectedValue, "delegated evidence");
  expect(actual).toHaveLength(expected.length);
  const projection = expected.map((item, index) => {
    const actualItem = actual[index];
    if (actualItem === undefined) return null;
    return {
      delegationOrdinal: actualItem.delegationOrdinal,
      symbolRange: actualItem.symbolRange,
      evidence: evidenceProjection(actualItem.evidence, item["evidence"]),
    };
  });
  expect(canonicalJson(projection)).toBe(canonicalJson(expected));
}

function runChartFailure(
  caseId: string,
  sourceText: string,
  request: ChartTextParseRequest,
  style: AccidentalStyle,
  expectedDiagnostic: readonly DiagnosticProjection[],
  expected: FixtureRecord,
  row: FixtureRecord | null,
): void {
  const parsed = theory.parseChartText(sourceText, request, style);
  expect(parsed.ok, caseId).toBe(false);
  if (parsed.ok) return;
  expect(parsed.sourceText, caseId).toBe(sourceText);
  expect(diagnostics(parsed.diagnostics), caseId).toEqual(expectedDiagnostic);
  const insertableValue = row?.["insertableChords"] ?? expected["insertableChords"];
  if (insertableValue !== undefined) {
    expect(chartInsertableProjection(sourceText, parsed.insertableChords, insertableValue), caseId)
      .toEqual(insertableValue);
  }
  const insertableCount = row?.["insertableCount"] ?? expected["insertableCount"];
  if (typeof insertableCount === "number") {
    expect(parsed.insertableChords, caseId).toHaveLength(insertableCount);
  }
  for (const insertable of parsed.insertableChords) {
    expect(insertable.layoutContextPreserved, caseId).toBe(false);
  }
  const withEvidence = parseChartTextWithEvidence(sourceText, request, style);
  expect(withEvidence.result, caseId).toEqual(parsed);
  if (row?.["eventsObserved"] !== undefined) {
    expect(withEvidence.evidence.slotsObserved, `${caseId}.eventsObserved`).toBe(
      numberValue(row["eventsObserved"], `${caseId}.eventsObserved`),
    );
  }
  if (row?.["eventRange"] !== undefined) {
    expect(parsed.insertableChords[0]?.range, `${caseId}.eventRange`).toEqual(
      fixtureRange(row["eventRange"], `${caseId}.eventRange`),
    );
  }
  if (row?.["trailingTriviaRangeRetainedByDiagnostic"] !== undefined) {
    const eventRange = fixtureRange(row["eventRange"], `${caseId}.eventRange`);
    const retainedRange = fixtureRange(
      row["trailingTriviaRangeRetainedByDiagnostic"],
      `${caseId}.trailingTriviaRangeRetainedByDiagnostic`,
    );
    expect(retainedRange, `${caseId}.trailingTriviaRangeRetainedByDiagnostic`).toEqual({
      start: eventRange.end,
      end: sourceText.length,
    });
    expect(expectedDiagnostic[0]?.range, `${caseId}.diagnosticRetainsTrailingTrivia`)
      .toEqual({ start: 0, end: retainedRange.end });
  }
  if (row?.["commentRangeRetainedByDiagnostic"] !== undefined) {
    const retainedRange = fixtureRange(
      row["commentRangeRetainedByDiagnostic"],
      `${caseId}.commentRangeRetainedByDiagnostic`,
    );
    expect(retainedRange, `${caseId}.commentRangeRetainedByDiagnostic`).toEqual({
      start: sourceText.indexOf(";"),
      end: sourceText.length,
    });
    expect(expectedDiagnostic[0]?.range, `${caseId}.diagnosticRetainsComment`)
      .toEqual({ start: 0, end: retainedRange.end });
  }
  const outerEvidence = row?.["outerEvidenceProjection"] ??
    expected["outerEvidenceProjection"];
  if (outerEvidence !== undefined) {
    const expectedOuterEvidence = record(outerEvidence, "outer evidence");
    expect(evidenceProjection(withEvidence.evidence, expectedOuterEvidence), caseId)
      .toEqual(expectedOuterEvidence);
  }
  const delegatedEvidence = row?.["delegatedEvidenceProjections"] ??
    expected["delegatedEvidenceProjections"];
  if (delegatedEvidence !== undefined) {
    assertDelegatedEvidence(withEvidence.delegatedSymbols, delegatedEvidence);
  }
  if (row?.["delegatedSymbolRanges"] !== undefined) {
    expect(withEvidence.delegatedSymbols.map(({ symbolRange }) => symbolRange), caseId)
      .toEqual(row["delegatedSymbolRanges"] as SourceRange[]);
  }
  if (row?.["insertableSymbolRanges"] !== undefined) {
    expect(parsed.insertableChords.map(({ symbolRange }) => symbolRange), caseId)
      .toEqual(row["insertableSymbolRanges"] as SourceRange[]);
  }
  observe(caseId, {
    operation: "parse-chart-refusal",
    source: sourceIdentity(sourceText),
    request,
    style,
    diagnostics: expectedDiagnostic,
    insertableChords: parsed.insertableChords.map(({ ordinal, range, symbolRange, duration, layoutContextPreserved }) => ({
      ordinal,
      range,
      symbolRange,
      duration,
      layoutContextPreserved,
    })),
    evidence: outerEvidence === undefined
      ? withEvidence.evidence
      : evidenceProjection(withEvidence.evidence, outerEvidence),
  });
}

function chartFailureDiagnostics(
  expected: FixtureRecord,
  row: FixtureRecord | null,
): readonly DiagnosticProjection[] {
  const diagnosticValue = row?.["diagnostics"] ?? expected["diagnostics"];
  if (diagnosticValue !== undefined) return expectedDiagnostics(diagnosticValue);
  const childExpected = row?.["expected"] === undefined
    ? null
    : record(row["expected"], "row.expected");
  const code = stringValue(
    row?.["code"] ?? childExpected?.["code"] ?? expected["code"],
    "expected.code",
  );
  const range = row?.["range"] ?? childExpected?.["range"] ?? expected["range"];
  return [{ code, range: fixtureRange(range, "expected.range") }];
}

function runChartFailureCase(row: FixtureRecord): void {
  const caseId = fixtureId(row);
  if (row["operation"] === "format") return;
  const request = fixtureRequest(
    row["request"] ?? {
      mode: "fragment",
      meter: { beatsPerBar: 4, beatUnit: 4 },
    },
    `${caseId}.request`,
  );
  const style = fixtureStyle(row["style"] ?? "ascii", `${caseId}.style`);
  const expected = record(row["expected"], `${caseId}.expected`);
  const childRows = Array.isArray(row["rows"])
    ? records(row["rows"], `${caseId}.rows`)
    : [];
  if (caseId === "T0-CHART-ERR-032") {
    expect(childRows.map((child) => stringValue(child["id"], `${caseId}.row.id`)))
      .toEqual([
        "trailing-horizontal-space",
        "trailing-comment-to-eof",
        "slotless-unclosed-near-miss",
        "same-space-prefix-closed-control",
        "slotless-closed-control",
        "post-closure-trivia-excluded-control",
      ]);
  }
  const inputs = childRows.length === 0
    ? [{ sourceText: stringValue(row["input"], `${caseId}.input`), row: null }]
    : childRows.map((child) => ({
      sourceText: stringValue(child["source"], `${caseId}.row.source`),
      row: child,
    }));
  for (const input of inputs) {
    if (input.row?.["sourceUtf16Length"] !== undefined) {
      expect(input.sourceText.length, `${caseId}.sourceUtf16Length`).toBe(
        numberValue(input.row["sourceUtf16Length"], `${caseId}.sourceUtf16Length`),
      );
    }
    const childExpected = input.row?.["expected"];
    if (
      childExpected !== undefined &&
      record(childExpected, "child expected")["ok"] === true
    ) {
      const successExpected = record(childExpected, "child expected");
      runChartSuccess(
        caseId,
        input.sourceText,
        request,
        style,
        successExpected,
        stringValue(successExpected["canonicalText"], "canonicalText"),
      );
      continue;
    }
    runChartFailure(
      caseId,
      input.sourceText,
      request,
      style,
      chartFailureDiagnostics(expected, input.row),
      expected,
      input.row,
    );
  }
}

function sectionsSource(
  prefix: string,
  count: number,
  pad: number,
  empty: boolean,
): string {
  return prefix + Array.from({ length: count }, (_, index) => {
    const name = `S${String(index).padStart(pad, "0")}`;
    return empty ? `[${name}]\n| |\n` : `[${name}]\n| C:4 |\n`;
  }).join("");
}

function eventLimitSource(includeExcess: boolean): string {
  const prefix = "@meter 4/4\n";
  const full = Array.from({ length: 8 }, (_, index) =>
    `[S${String(index).padStart(3, "0")}]\n${"| C:4 |\n".repeat(1024)}`
  ).join("");
  return `${prefix}${full}${includeExcess ? "[S008]\n| C:4 |\n" : ""}`;
}

function textFieldSource(
  field: string,
  scalar: string,
  count: number,
): string {
  switch (field) {
    case "title":
      return `@title ${JSON.stringify(scalar.repeat(count))}\n@meter 4/4\n[A]\n| C:4 |`;
    case "description":
      return `@description ${JSON.stringify(scalar.repeat(count))}\n@meter 4/4\n[A]\n| C:4 |`;
    case "annotation":
      return `| C:4 ${JSON.stringify(scalar.repeat(count))} |`;
    case "section-name":
      return `[${scalar.repeat(count)}]\n| C:4 |`;
    default:
      throw new Error(`T0_TEXT_FIELD:${field}`);
  }
}

function boundaryRowSource(parentId: string, row: FixtureRecord): string {
  if (typeof row["source"] === "string") return row["source"];
  const recipe = record(row["materializationRecipe"], `${parentId}.row.recipe`);
  const digit = stringValue(recipe["digit"], "digit");
  const digits = digit.repeat(numberValue(recipe["digitCount"], "digitCount"));
  const name = stringValue(row["name"], "row.name");
  if (name.includes("rational-numerator")) return `| C:${digits}/1 |`;
  if (name.includes("rational-denominator")) return `| C:1/${digits} |`;
  return `| C:${digits} |`;
}

function runChartBoundaryFailure(
  caseId: string,
  sourceText: string,
  request: ChartTextParseRequest,
  expected: FixtureRecord,
): void {
  const diagnostic = [{
    code: stringValue(expected["code"], `${caseId}.code`),
    range: fixtureRange(expected["range"], `${caseId}.range`),
  }];
  const parsed = parseChartTextWithEvidence(sourceText, request, "ascii");
  expect(parsed.result.ok, caseId).toBe(false);
  if (!parsed.result.ok) {
    expect(diagnostics(parsed.result.diagnostics), caseId).toEqual(diagnostic);
  }
  const expectedEvidenceValue = expected["expectedEvidence"];
  if (expectedEvidenceValue !== undefined) {
    const expectedEvidence = record(expectedEvidenceValue, "expected evidence");
    const { delegatedSymbolCount, ...counterEvidence } = expectedEvidence;
    expect(evidenceProjection(parsed.evidence, counterEvidence), caseId)
      .toEqual(counterEvidence);
    if (delegatedSymbolCount !== undefined) {
      expect(parsed.delegatedSymbols, caseId).toHaveLength(
        numberValue(delegatedSymbolCount, "delegatedSymbolCount"),
      );
    }
  }
  observe(caseId, {
    operation: "parse-chart-boundary",
    source: sourceIdentity(sourceText),
    request,
    diagnostics: diagnostic,
    evidence: expectedEvidenceValue === undefined
      ? parsed.evidence
      : evidenceProjection(
        parsed.evidence,
        Object.fromEntries(
          Object.entries(record(expectedEvidenceValue, "expected evidence"))
            .filter(([key]) => key !== "delegatedSymbolCount"),
        ),
      ),
  });
}

function runChartBoundaryCase(row: FixtureRecord): void {
  const caseId = fixtureId(row);
  if (row["operation"] === "format") return;
  if (caseId === "T0-CHART-LIMIT-009") {
    const inputs = record(row["inputs"], `${caseId}.inputs`);
    const maximum = numberValue(inputs["maximumEvents"], "maximumEvents") *
      numberValue(inputs["maximumQuarterNoteCapacityPerEventMeasure"], "capacity");
    const expected = record(row["expected"], `${caseId}.expected`);
    expect(maximum, caseId).toBe(numberValue(
      expected["maximumReachableQuarterNoteBeats"],
      "maximumReachableQuarterNoteBeats",
    ));
    expect(maximum, caseId).toBeLessThan(numberValue(inputs["totalDraftLimit"], "limit"));
    observe(caseId, { operation: "dominated-limit-proof", maximum });
    return;
  }

  const defaultRequest = row["request"] === undefined
    ? { mode: "fragment", meter: meterValue(4, 4) } as const
    : fixtureRequest(row["request"], `${caseId}.request`);
  const recipeValue = row["materializationRecipe"];
  const recipe = recipeValue === undefined ? null : record(recipeValue, `${caseId}.recipe`);

  if (caseId === "T0-CHART-LIMIT-012") {
    for (const child of records(row["rows"], `${caseId}.rows`)) {
      runChartBoundaryFailure(
        caseId,
        boundaryRowSource(caseId, child),
        defaultRequest,
        record(child["expected"], `${caseId}.row.expected`),
      );
    }
    return;
  }
  if (caseId === "T0-CHART-LIMIT-013") {
    for (const child of records(row["rows"], `${caseId}.rows`)) {
      const childRecipe = record(child["materializationRecipe"], "child.recipe");
      const childRequest = fixtureRequest(child["request"], "child.request");
      const field = stringValue(child["field"], "child.field");
      const scalar = stringValue(childRecipe["scalar"], "child.scalar");
      const count = numberValue(childRecipe["codePoints"], "child.codePoints");
      runChartBoundaryFailure(
        caseId,
        textFieldSource(field, scalar, count),
        childRequest,
        record(child["expected"], "child.expected"),
      );
      const near = theory.parseChartText(
        textFieldSource(field, scalar, count - 1),
        childRequest,
        "ascii",
      );
      expect(near.ok, `${caseId}:near`).toBe(true);
    }
    return;
  }
  if (caseId === "T0-CHART-LIMIT-016") {
    const prefix = `@meter 4/4\n${Array.from({ length: 64 }, (_, index) =>
      `[S${String(index)}]\n| |\n`).join("")}`;
    for (const child of records(recipe?.["rows"], `${caseId}.rows`)) {
      runChartBoundaryFailure(
        caseId,
        `${prefix}${stringValue(child["suffix"], "suffix")}`,
        defaultRequest,
        {
          ...record(row["expected"], `${caseId}.expected`),
          ...record(child["diagnostic"], `${caseId}.diagnostic`),
        },
      );
    }
    return;
  }
  if (caseId === "T0-CHART-LIMIT-017") {
    const prefix = `${";\n".repeat(65_534)}| C `;
    for (const child of records(recipe?.["rows"], `${caseId}.rows`)) {
      runChartBoundaryFailure(
        caseId,
        `${prefix}${stringValue(child["suffix"], "suffix")}`,
        defaultRequest,
        {
          ...record(row["expected"], `${caseId}.expected`),
          ...record(child["diagnostic"], `${caseId}.diagnostic`),
        },
      );
    }
    return;
  }
  if (caseId === "T0-CHART-LIMIT-018") {
    const prefix = `C ${"/ ".repeat(8191)}`;
    for (const child of records(recipe?.["rows"], `${caseId}.rows`)) {
      runChartBoundaryFailure(
        caseId,
        `${prefix}${stringValue(child["suffix"], "suffix")}`,
        defaultRequest,
        {
          ...record(row["expected"], `${caseId}.expected`),
          ...record(child["diagnostic"], `${caseId}.diagnostic`),
        },
      );
    }
    return;
  }
  if (caseId === "T0-CHART-LIMIT-021") {
    const prefix = ";\n".repeat(65_535);
    for (const child of records(recipe?.["rows"], `${caseId}.rows`)) {
      runChartBoundaryFailure(
        caseId,
        `${prefix}${stringValue(child["suffix"], "suffix")}`,
        defaultRequest,
        record(child["expected"], `${caseId}.row.expected`),
      );
    }
    return;
  }

  let sourceText: string;
  let nearSource: string | null = null;
  switch (caseId) {
    case "T0-CHART-LIMIT-001": {
      const prefix = stringValue(recipe?.["asciiPrefix"], "asciiPrefix");
      const count = numberValue(recipe?.["appendCount"], "appendCount");
      sourceText = `${prefix}${"x".repeat(count)}`;
      nearSource = `${prefix}${"x".repeat(count - 1)}`;
      break;
    }
    case "T0-CHART-LIMIT-002": {
      const count = numberValue(recipe?.["commentCount"], "commentCount");
      sourceText = `${";\n".repeat(count)}| C |`;
      nearSource = `${";\n".repeat(count - 1)}| C |`;
      break;
    }
    case "T0-CHART-LIMIT-003":
      sourceText = sectionsSource("@meter 4/4\n", 65, 2, true);
      nearSource = sectionsSource("@meter 4/4\n", 64, 2, true);
      break;
    case "T0-CHART-LIMIT-004":
      sourceText = `[A]\n${"| |\n".repeat(1025)}`;
      nearSource = `[A]\n${"| |\n".repeat(1024)}`;
      break;
    case "T0-CHART-LIMIT-005":
      sourceText = eventLimitSource(true);
      nearSource = eventLimitSource(false);
      break;
    case "T0-CHART-LIMIT-006":
    case "T0-CHART-LIMIT-007":
    case "T0-CHART-LIMIT-010":
    case "T0-CHART-LIMIT-011": {
      const field = stringValue(recipe?.["field"], "field");
      const scalar = stringValue(recipe?.["scalar"], "scalar");
      const count = numberValue(recipe?.["codePoints"], "codePoints");
      sourceText = textFieldSource(field, scalar, count);
      nearSource = textFieldSource(field, scalar, count - 1);
      break;
    }
    case "T0-CHART-LIMIT-014": {
      const prefix = stringValue(recipe?.["asciiPrefix"], "asciiPrefix");
      const count = numberValue(recipe?.["asciiPaddingCount"], "padding");
      sourceText = `${prefix}${"x".repeat(count)}𝄪`;
      nearSource = `${prefix}${"x".repeat(count - 3)}𝄪`;
      break;
    }
    case "T0-CHART-LIMIT-015":
      sourceText = sectionsSource("@tempo 19\n@meter 4/4\n", 65, 2, true);
      nearSource = sectionsSource("@tempo 19\n@meter 4/4\n", 64, 2, true);
      break;
    case "T0-CHART-UNICODE-001": {
      const units = (recipe?.["units"] as unknown[]).map((unit, index) =>
        numberValue(unit, `units[${String(index)}]`));
      sourceText = String.fromCharCode(...units);
      break;
    }
    default:
      throw new Error(`T0_CHART_BOUNDARY_RECIPE:${caseId}`);
  }

  const expected = record(row["expected"], `${caseId}.expected`);
  runChartBoundaryFailure(caseId, sourceText, defaultRequest, expected);
  if (nearSource !== null) {
    const near = theory.parseChartText(nearSource, defaultRequest, "ascii");
    const nearFixture = record(row["nearBoundary"], `${caseId}.nearBoundary`);
    if (nearFixture["ok"] === true) expect(near.ok, `${caseId}:near`).toBe(true);
    if (nearFixture["ok"] === false) expect(near.ok, `${caseId}:near`).toBe(false);
  }
}

function independentChord(sourceText: string): ChordSpec {
  switch (sourceText) {
    case "C":
      return expectedChord("C");
    case "Cmaj7":
      return { ...expectedChord("Cmaj7", { seventh: "major" }) };
    case "Dm7":
      return expectedChord("Dm7", {
        root: { step: "D", alter: 0 },
        triad: "minor",
        seventh: "minor",
      });
    case "G7":
      return expectedChord("G7", {
        root: { step: "G", alter: 0 },
        seventh: "minor",
      });
    default:
      throw new Error(`T0_INDEPENDENT_CHORD:${sourceText}`);
  }
}

function materializeFixtureEvent(value: unknown): ChartTextDraft["sections"][number]["measures"][number]["events"][number] {
  const event = record(value, "fixture event");
  let chord: ChordSpec;
  if (typeof event["chordCaseId"] === "string") {
    const referenced = symbolCaseById(event["chordCaseId"]);
    chord = independentChord(stringValue(referenced["input"], "referenced input"));
  } else {
    chord = independentChord(stringValue(event["symbol"], "event.symbol"));
  }
  return {
    ordinal: numberValue(event["ordinal"], "event.ordinal"),
    origin: event["origin"] === "repeat" ? "repeat" : "literal",
    repeatedFromOrdinal: typeof event["repeatedFromOrdinal"] === "number"
      ? event["repeatedFromOrdinal"]
      : null,
    chord,
    duration: beatDuration(
      numberValue(record(event["duration"], "event.duration")["numerator"], "duration.numerator"),
      numberValue(record(event["duration"], "event.duration")["denominator"], "duration.denominator"),
    ),
    annotation: typeof event["annotation"] === "string" ? event["annotation"] : "",
    range: fixtureRange(event["range"], "event.range"),
    symbolRange: fixtureRange(event["symbolRange"], "event.symbolRange"),
    durationRange: event["durationRange"] === undefined || event["durationRange"] === null
      ? null
      : fixtureRange(event["durationRange"], "event.durationRange"),
    annotationRange: event["annotationRange"] === undefined || event["annotationRange"] === null
      ? null
      : fixtureRange(event["annotationRange"], "event.annotationRange"),
  };
}

function materializeFullFixtureDraft(caseId: "T0-CHART-001"): ChartTextDraft {
  const row = records(chartFixture["successCases"], "successCases")
    .find((item) => fixtureId(item) === caseId);
  if (row === undefined) throw new Error(`T0_CHART_REFERENCE:${caseId}`);
  const expected = record(row["expected"], `${caseId}.expected`);
  const draftValue = record(expected["draft"], `${caseId}.draft`);
  const sourceText = stringValue(row["input"], `${caseId}.input`);
  const sections = records(draftValue["sections"], "draft.sections").map((section) => ({
    ordinal: numberValue(section["ordinal"], "section.ordinal"),
    kind: section["kind"] === "named" ? "named" as const : "implicit" as const,
    name: typeof section["name"] === "string" ? section["name"] : null,
    annotation: typeof section["annotation"] === "string" ? section["annotation"] : "",
    range: fixtureRange(section["range"], "section.range"),
    measures: records(section["measures"], "section.measures").map((measure) => ({
      ordinal: numberValue(measure["ordinal"], "measure.ordinal"),
      kind: measure["kind"] === "barred" ? "barred" as const : "virtual" as const,
      range: fixtureRange(measure["range"], "measure.range"),
      events: records(measure["events"], "measure.events").map(materializeFixtureEvent),
    })),
  }));
  return {
    schema: theory.CHART_TEXT_DRAFT_SCHEMA,
    grammarId: theory.CHART_TEXT_GRAMMAR_ID,
    grammarVersion: theory.CHART_TEXT_GRAMMAR_VERSION,
    mode: "fragment",
    sourceText,
    headers: record(draftValue["headers"], "draft.headers") as unknown as ChartTextDraft["headers"],
    sections,
  };
}

function independentDocumentDraft(): ChartTextDraft {
  return {
    schema: theory.CHART_TEXT_DRAFT_SCHEMA,
    grammarId: theory.CHART_TEXT_GRAMMAR_ID,
    grammarVersion: theory.CHART_TEXT_GRAMMAR_VERSION,
    mode: "document",
    sourceText: "@meter 4/4\n[A]\n| C:4 |",
    headers: {
      title: null,
      description: null,
      meter: meterValue(4, 4),
      tempoBpm: null,
      key: null,
    },
    sections: [{
      ordinal: 0,
      kind: "named",
      name: "A",
      annotation: "",
      range: { start: 11, end: 22 },
      measures: [{
        ordinal: 0,
        kind: "barred",
        range: { start: 15, end: 22 },
        events: [{
          ordinal: 0,
          origin: "literal",
          repeatedFromOrdinal: null,
          chord: independentChord("C"),
          duration: beatDuration(4),
          annotation: "",
          range: { start: 17, end: 20 },
          symbolRange: { start: 17, end: 18 },
          durationRange: { start: 18, end: 20 },
          annotationRange: null,
        }],
      }],
    }],
  };
}

function independentRepeatDraft(): ChartTextDraft {
  return {
    schema: theory.CHART_TEXT_DRAFT_SCHEMA,
    grammarId: theory.CHART_TEXT_GRAMMAR_ID,
    grammarVersion: theory.CHART_TEXT_GRAMMAR_VERSION,
    mode: "fragment",
    sourceText: 'Cmaj7:1 "hold" /:3',
    headers: {
      title: null,
      description: null,
      meter: meterValue(4, 4),
      tempoBpm: null,
      key: null,
    },
    sections: [{
      ordinal: 0,
      kind: "implicit",
      name: null,
      annotation: "",
      range: { start: 0, end: 18 },
      measures: [{
        ordinal: 0,
        kind: "virtual",
        range: { start: 0, end: 18 },
        events: [{
          ordinal: 0,
          origin: "literal",
          repeatedFromOrdinal: null,
          chord: independentChord("Cmaj7"),
          duration: beatDuration(1),
          annotation: "hold",
          range: { start: 0, end: 14 },
          symbolRange: { start: 0, end: 5 },
          durationRange: { start: 5, end: 7 },
          annotationRange: { start: 8, end: 14 },
        }, {
          ordinal: 1,
          origin: "repeat",
          repeatedFromOrdinal: 0,
          chord: independentChord("Cmaj7"),
          duration: beatDuration(3),
          annotation: "",
          range: { start: 15, end: 18 },
          symbolRange: { start: 15, end: 16 },
          durationRange: { start: 16, end: 18 },
          annotationRange: null,
        }],
      }],
    }],
  };
}

function replaceDraftEvent(
  draft: ChartTextDraft,
  eventIndex: number,
  replacement: ChartTextDraft["sections"][number]["measures"][number]["events"][number],
): ChartTextDraft {
  const section = draft.sections[0];
  const measure = section?.measures[0];
  if (section === undefined || measure === undefined) throw new Error("T0_DRAFT_EVENT");
  const events = [...measure.events];
  events[eventIndex] = replacement;
  return {
    ...draft,
    sections: [{
      ...section,
      measures: [{ ...measure, events }],
    }],
  };
}

function independentEmptySectionDraft(count: number): ChartTextDraft {
  const sourceText = sectionsSource("@meter 4/4\n", count, 3, true);
  let cursor = "@meter 4/4\n".length;
  const sections: ChartTextDraft["sections"][number][] = [];
  for (let index = 0; index < count; index += 1) {
    const marker = `[S${String(index).padStart(3, "0")}]\n`;
    const measureStart = cursor + marker.length;
    sections.push({
      ordinal: index,
      kind: "named",
      name: `S${String(index).padStart(3, "0")}`,
      annotation: "",
      range: { start: cursor, end: measureStart + 3 },
      measures: [{
        ordinal: 0,
        kind: "barred",
        range: { start: measureStart, end: measureStart + 3 },
        events: [],
      }],
    });
    cursor += marker.length + 4;
  }
  return {
    schema: theory.CHART_TEXT_DRAFT_SCHEMA,
    grammarId: theory.CHART_TEXT_GRAMMAR_ID,
    grammarVersion: theory.CHART_TEXT_GRAMMAR_VERSION,
    mode: "document",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meterValue(4, 4),
      tempoBpm: null,
      key: null,
    },
    sections,
  };
}

function independentEventLimitDraft(includeExcess: boolean): ChartTextDraft {
  const sourceText = eventLimitSource(includeExcess);
  const sections: ChartTextDraft["sections"][number][] = [];
  let cursor = "@meter 4/4\n".length;
  let eventOrdinal = 0;
  const sectionCount = includeExcess ? 9 : 8;
  for (let sectionOrdinal = 0; sectionOrdinal < sectionCount; sectionOrdinal += 1) {
    const marker = `[S${String(sectionOrdinal).padStart(3, "0")}]\n`;
    const measureCount = sectionOrdinal < 8 ? 1024 : 1;
    const sectionStart = cursor;
    cursor += marker.length;
    const measures: ChartTextDraft["sections"][number]["measures"][number][] = [];
    for (let measureOrdinal = 0; measureOrdinal < measureCount; measureOrdinal += 1) {
      const measureStart = cursor;
      const eventStart = measureStart + 2;
      measures.push({
        ordinal: measureOrdinal,
        kind: "barred",
        range: { start: measureStart, end: measureStart + 7 },
        events: [{
          ordinal: eventOrdinal,
          origin: "literal",
          repeatedFromOrdinal: null,
          chord: independentChord("C"),
          duration: beatDuration(4),
          annotation: "",
          range: { start: eventStart, end: eventStart + 3 },
          symbolRange: { start: eventStart, end: eventStart + 1 },
          durationRange: { start: eventStart + 1, end: eventStart + 3 },
          annotationRange: null,
        }],
      });
      eventOrdinal += 1;
      cursor += 8;
    }
    sections.push({
      ordinal: sectionOrdinal,
      kind: "named",
      name: `S${String(sectionOrdinal).padStart(3, "0")}`,
      annotation: "",
      range: { start: sectionStart, end: measures[measures.length - 1]?.range.end ?? cursor },
      measures,
    });
  }
  return {
    schema: theory.CHART_TEXT_DRAFT_SCHEMA,
    grammarId: theory.CHART_TEXT_GRAMMAR_ID,
    grammarVersion: theory.CHART_TEXT_GRAMMAR_VERSION,
    mode: "document",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: meterValue(4, 4),
      tempoBpm: null,
      key: null,
    },
    sections,
  };
}

type FormatterRefusalIdentity = Readonly<{
  subcaseId: string;
  fault: string;
  baseDraft?: ChartTextDraft;
  mutationProjection?: unknown;
}>;

function pathSegments(path: string): readonly string[] {
  return path.match(/[^.[\]]+/gu) ?? [];
}

function valueAtPath(value: unknown, path: string): unknown {
  let cursor = value;
  for (const segment of pathSegments(path)) {
    if (typeof cursor !== "object" || cursor === null) {
      throw new Error(`T0_MUTATION_PATH:${path}`);
    }
    cursor = Reflect.get(cursor, segment);
  }
  return cursor;
}

function setValueAtPath(value: unknown, path: string, replacement: unknown): void {
  const segments = pathSegments(path);
  const final = segments.at(-1);
  if (final === undefined) throw new Error(`T0_MUTATION_PATH_EMPTY:${path}`);
  let cursor = value;
  for (const segment of segments.slice(0, -1)) {
    if (typeof cursor !== "object" || cursor === null) {
      throw new Error(`T0_MUTATION_PATH:${path}`);
    }
    cursor = Reflect.get(cursor, segment);
  }
  if (typeof cursor !== "object" || cursor === null) {
    throw new Error(`T0_MUTATION_PATH:${path}`);
  }
  if (!Reflect.set(cursor, final, replacement)) {
    throw new Error(`T0_MUTATION_PATH_SET:${path}`);
  }
}

function assertMutationProjection(
  baseDraft: ChartTextDraft,
  mutatedDraft: ChartTextDraft,
  expectedValue: unknown,
): FixtureRecord {
  const expected = record(expectedValue, "mutationProjection");
  const path = stringValue(expected["path"], "mutationProjection.path");
  const actual: FixtureRecord = {
    path,
    before: canonicalJsonValue(valueAtPath(baseDraft, path)),
    after: canonicalJsonValue(valueAtPath(mutatedDraft, path)),
  };
  expect(actual).toEqual(expected);

  const restored = structuredClone(mutatedDraft);
  setValueAtPath(restored, path, structuredClone(valueAtPath(baseDraft, path)));
  expect(canonicalJson(restored)).toBe(canonicalJson(baseDraft));
  return actual;
}

const FORMATTER_ZERO_COUNTERS = [
  "lexerCodePointsVisited",
  "tokensProduced",
  "parserTransitions",
  "modifierItemsObserved",
  "allocationDivisions",
  "numericComponentsCompared",
  "maxSourceBigIntDigits",
  "suggestionsCompared",
  "insertableCandidatesProduced",
  "peakTokenRecords",
  "peakDraftNodes",
  "peakSuggestionRecords",
] as const satisfies readonly (keyof SyntaxWorkEvidence)[];

function assertFormatterRangeOwner(
  draft: ChartTextDraft,
  expected: FixtureRecord,
  label: string,
): void {
  if (expected["rangeOwner"] === undefined) return;
  const owner = stringValue(expected["rangeOwner"], `${label}.rangeOwner`);
  const events = flattenedEvents(draft);
  let actual: SourceRange | undefined;
  switch (owner) {
    case "event 0 range":
      actual = events.find(({ ordinal }) => ordinal === 0)?.range;
      break;
    case "literal event.symbolRange":
      actual = events.find(({ origin }) => origin === "literal")?.symbolRange;
      break;
    case "repeat event.range":
      actual = events.find(({ origin }) => origin === "repeat")?.range;
      break;
    case "first-excess event.range":
      actual = events.find(({ ordinal }) => ordinal === theory.MAX_CHART_EVENTS)?.range;
      break;
    default:
      throw new Error(`T0_FORMAT_RANGE_OWNER:${owner}`);
  }
  expect(actual, `${label}.rangeOwner:${owner}`).toEqual(
    fixtureRange(expected["range"], `${label}.range`),
  );
}

function runFormatterRefusal(
  caseId: string,
  draft: ChartTextDraft,
  expected: FixtureRecord,
  expectedEvidenceValue: unknown,
  identity: FormatterRefusalIdentity,
): SyntaxWorkEvidence {
  const formatted = theory.formatChartText(draft, "ascii");
  expect(formatted.ok, caseId).toBe(false);
  expect(Object.keys(formatted), caseId).toEqual(["ok", "diagnostics"]);
  expect(Object.hasOwn(formatted, "canonicalText"), caseId).toBe(false);
  if (!formatted.ok) {
    expect(formatted.diagnostics, caseId).toHaveLength(1);
    const diagnostic = formatted.diagnostics[0];
    expect(Object.keys(diagnostic), caseId).toEqual([
      "code",
      "range",
      "message",
    ]);
    expect(diagnostic.message.length, caseId).toBeGreaterThan(0);
    expect(diagnostics(formatted.diagnostics), caseId).toEqual([{
      code: stringValue(expected["code"], `${caseId}.code`),
      range: fixtureRange(expected["range"], `${caseId}.range`),
    }]);
    assertFormatterRangeOwner(draft, expected, `${caseId}.${identity.subcaseId}`);
  }
  const withEvidence = formatChartTextWithEvidence(draft, "ascii");
  expect(withEvidence.result, caseId).toEqual(formatted);
  for (const counter of FORMATTER_ZERO_COUNTERS) {
    expect(withEvidence.evidence[counter], `${caseId}.${identity.subcaseId}.${counter}`)
      .toBe(0);
  }
  if (expectedEvidenceValue !== undefined) {
    const expectedEvidence = record(expectedEvidenceValue, "expected evidence");
    expect(evidenceProjection(withEvidence.evidence, expectedEvidence), caseId)
      .toEqual(expectedEvidence);
  }
  if (expected["received"] !== undefined || expected["limit"] !== undefined) {
    const received = numberValue(expected["received"], `${caseId}.received`);
    const limit = numberValue(expected["limit"], `${caseId}.limit`);
    switch (stringValue(expected["code"], `${caseId}.code`)) {
      case "limit.chart_events_exceeded":
        expect(received, `${caseId}.received`).toBe(withEvidence.evidence.slotsObserved);
        expect(limit, `${caseId}.limit`).toBe(theory.MAX_CHART_EVENTS);
        break;
      case "limit.chart_sections_exceeded":
        expect(received, `${caseId}.received`).toBe(withEvidence.evidence.sectionsObserved);
        expect(limit, `${caseId}.limit`).toBe(theory.MAX_CHART_SECTIONS);
        break;
      default:
        throw new Error(`T0_FORMAT_LIMIT_FIELDS:${caseId}`);
    }
  }
  let mutationProjection: FixtureRecord | null = null;
  if (identity.mutationProjection !== undefined) {
    if (identity.baseDraft === undefined) {
      throw new Error(`T0_MUTATION_BASE_MISSING:${identity.subcaseId}`);
    }
    mutationProjection = assertMutationProjection(
      identity.baseDraft,
      draft,
      identity.mutationProjection,
    );
  }
  observe(caseId, {
    operation: "format-chart-refusal",
    subcaseId: identity.subcaseId,
    fault: identity.fault,
    source: sourceIdentity(draft.sourceText),
    mutatedDraftDigest: sha256(canonicalJson(draft)),
    mutationProjection,
    diagnostics: formatted.ok ? [] : diagnostics(formatted.diagnostics),
    evidence: expectedEvidenceValue === undefined
      ? withEvidence.evidence
      : evidenceProjection(withEvidence.evidence, expectedEvidenceValue),
  });
  return withEvidence.evidence;
}

function formatterMutationBase(value: unknown, label: string): ChartTextDraft {
  const baseDraftId = stringValue(value, label);
  switch (baseDraftId) {
    case "T0-CHART-001":
      return materializeFullFixtureDraft(baseDraftId);
    case "T0-CHART-005":
      return independentDocumentDraft();
    case "T0-CHART-007":
      return independentRepeatDraft();
    default:
      throw new Error(`T0_FORMAT_BASE_DRAFT:${baseDraftId}`);
  }
}

function assertSectionLimitDraftRecipe(row: FixtureRecord, draft: ChartTextDraft): void {
  const label = "T0-CHART-FMT-ERR-003.section-limit-first-excess";
  const recipe = record(row["baseDraftRecipe"], `${label}.baseDraftRecipe`);
  expect(recipe["kind"], `${label}.kind`).toBe("source-backed-draft");
  const source = record(recipe["sourceMaterialization"], `${label}.sourceMaterialization`);
  const prefix = stringValue(source["prefix"], `${label}.prefix`);
  const sectionCount = numberValue(source["sectionCount"], `${label}.sectionCount`);
  expect(prefix).toBe("@meter 4/4\n");
  expect(sectionCount).toBe(65);
  expect(source["sectionName"], `${label}.sectionName`)
    .toBe("S plus zero-padded three-digit source ordinal 000 through 064");
  expect(source["sectionTemplate"], `${label}.sectionTemplate`).toBe("[Snnn]\n| |\n");
  expect(draft.sourceText).toBe(sectionsSource(prefix, sectionCount, 3, true));
  expect(draft.sourceText.length).toBe(
    numberValue(source["sourceUtf16Length"], `${label}.sourceUtf16Length`),
  );
  expect(draft.sections).toHaveLength(sectionCount);
  expect(draft.sections.map(({ ordinal }) => ordinal)).toEqual(
    Array.from({ length: sectionCount }, (_, ordinal) => ordinal),
  );
  expect(draft.sections.map(({ name }) => name)).toEqual(
    Array.from({ length: sectionCount }, (_, ordinal) => `S${String(ordinal).padStart(3, "0")}`),
  );

  const materialization = record(
    recipe["draftMaterialization"],
    `${label}.draftMaterialization`,
  );
  expect(materialization["mode"], `${label}.mode`).toBe(draft.mode);
  expect(materialization["headers"], `${label}.headers`).toEqual({ meter: draft.headers.meter });
  expect(materialization["sectionOrdinals"], `${label}.sectionOrdinals`).toBe("0 through 64");
  expect(materialization["eachSection"], `${label}.eachSection`).toEqual({
    kind: "named",
    oneEmptyBarredMeasure: true,
  });
  expect(draft.sections.every((section) =>
    section.kind === "named" && section.measures.length === 1 &&
    section.measures[0]?.kind === "barred" && section.measures[0].events.length === 0
  )).toBe(true);
  expect(materialization["ranges"], `${label}.ranges`).toBe(
    "derive literally from source using contract section 2.1.1; do not invoke production parsing",
  );

  const firstExcess = record(row["firstExcess"], `${label}.firstExcess`);
  const sectionOrdinal = numberValue(firstExcess["sectionOrdinal"], `${label}.sectionOrdinal`);
  const section = draft.sections[sectionOrdinal];
  expect(firstExcess["kind"], `${label}.firstExcess.kind`).toBe("section");
  expect(section?.ordinal, `${label}.firstExcess.ordinal`).toBe(sectionOrdinal);
  expect(section?.range, `${label}.firstExcess.range`).toEqual(
    fixtureRange(firstExcess["range"], `${label}.firstExcess.range`),
  );
}

function assertEventLimitDraftRecipe(row: FixtureRecord, draft: ChartTextDraft): void {
  const label = "T0-CHART-FMT-ERR-003.event-limit-first-excess";
  const recipe = record(row["baseDraftRecipe"], `${label}.baseDraftRecipe`);
  expect(recipe["kind"], `${label}.kind`).toBe("source-backed-draft");
  const source = record(recipe["sourceMaterialization"], `${label}.sourceMaterialization`);
  expect(source["prefix"], `${label}.prefix`).toBe("@meter 4/4\n");
  expect(source["fullSectionCount"], `${label}.fullSectionCount`).toBe(8);
  expect(source["fullSectionName"], `${label}.fullSectionName`)
    .toBe("S plus zero-padded three-digit source ordinal 000 through 007");
  expect(source["fullSectionTemplate"], `${label}.fullSectionTemplate`)
    .toBe("[Snnn]\n followed by 1024 copies of | C:4 | plus LF");
  expect(source["excessSection"], `${label}.excessSection`).toBe("[S008]\n| C:4 |\n");
  expect(draft.sourceText).toBe(eventLimitSource(true));
  expect(draft.sourceText.length).toBe(
    numberValue(source["sourceUtf16Length"], `${label}.sourceUtf16Length`),
  );

  const materialization = record(
    recipe["draftMaterialization"],
    `${label}.draftMaterialization`,
  );
  expect(materialization["mode"], `${label}.mode`).toBe(draft.mode);
  expect(materialization["headers"], `${label}.headers`).toEqual({ meter: draft.headers.meter });
  expect(materialization["fullSections"], `${label}.fullSections`).toEqual({
    count: 8,
    measuresPerSection: 1024,
    eventsPerMeasure: 1,
  });
  expect(draft.sections.slice(0, 8).every((section) =>
    section.measures.length === 1024 &&
    section.measures.every((measure) => measure.events.length === 1)
  )).toBe(true);
  expect(materialization["excessSection"], `${label}.excessSectionDraft`).toEqual({
    sectionOrdinal: 8,
    measureOrdinal: 0,
    eventOrdinal: theory.MAX_CHART_EVENTS,
  });
  expect(materialization["events"], `${label}.events`).toEqual({
    origin: "literal",
    chordCaseId: "T0-SYM-001",
    duration: { numerator: 4, denominator: 1 },
  });
  expect(flattenedEvents(draft).every((event) =>
    event.origin === "literal" && event.chord.sourceText === "C" &&
    event.duration.numerator === 4 && event.duration.denominator === 1
  )).toBe(true);
  expect(materialization["ranges"], `${label}.ranges`).toBe(
    "derive literally from source using contract section 2.1.1; do not invoke production parsing",
  );

  const firstExcess = record(row["firstExcess"], `${label}.firstExcess`);
  const eventOrdinal = numberValue(firstExcess["eventOrdinal"], `${label}.eventOrdinal`);
  const sectionOrdinal = numberValue(firstExcess["sectionOrdinal"], `${label}.sectionOrdinal`);
  const measureOrdinal = numberValue(firstExcess["measureOrdinal"], `${label}.measureOrdinal`);
  const section = draft.sections[sectionOrdinal];
  const measure = section?.measures[measureOrdinal];
  const event = measure?.events.find(({ ordinal }) => ordinal === eventOrdinal);
  expect(firstExcess["kind"], `${label}.firstExcess.kind`).toBe("event");
  expect(eventOrdinal, `${label}.firstExcess.eventOrdinal`).toBe(theory.MAX_CHART_EVENTS);
  expect(event?.range, `${label}.firstExcess.range`).toEqual(
    fixtureRange(firstExcess["range"], `${label}.firstExcess.range`),
  );
  expect(event?.symbolRange, `${label}.firstExcess.symbolRange`).toEqual(
    fixtureRange(firstExcess["symbolRange"], `${label}.firstExcess.symbolRange`),
  );
  expect(event?.durationRange, `${label}.firstExcess.durationRange`).toEqual(
    fixtureRange(firstExcess["durationRange"], `${label}.firstExcess.durationRange`),
  );
  expect(measure?.range, `${label}.firstExcess.containingMeasureRange`).toEqual(
    fixtureRange(
      firstExcess["containingMeasureRange"],
      `${label}.firstExcess.containingMeasureRange`,
    ),
  );
  expect(section?.range, `${label}.firstExcess.containingSectionRange`).toEqual(
    fixtureRange(
      firstExcess["containingSectionRange"],
      `${label}.firstExcess.containingSectionRange`,
    ),
  );
}

function runChartFormatFailureCase(row: FixtureRecord): void {
  const caseId = fixtureId(row);
  if (caseId === "T0-CHART-FMT-ERR-001") {
    const recipe = record(row["inputDraftRecipe"], `${caseId}.inputDraftRecipe`);
    expect(stringValue(recipe["id"], `${caseId}.id`)).toBe("event-0-duration-zero");
    expect(stringValue(recipe["kind"], `${caseId}.kind`)).toBe("single-field-mutation");
    const base = formatterMutationBase(recipe["baseDraft"], `${caseId}.baseDraft`);
    const event = base.sections[0]?.measures[0]?.events[0];
    if (event === undefined) throw new Error("T0_FORMAT_EVENT");
    const malformed = replaceDraftEvent(base, 0, {
      ...event,
      duration: { numerator: 0, denominator: 1 } as unknown as BeatDuration,
    });
    const expected = record(row["expected"], `${caseId}.expected`);
    const expectedDiagnostics = records(expected["diagnostics"], "diagnostics");
    expect(expectedDiagnostics, `${caseId}.diagnostics`).toHaveLength(1);
    const diagnostic = expectedDiagnostics[0];
    if (diagnostic === undefined) throw new Error("T0_FORMAT_DIAGNOSTIC");
    runFormatterRefusal(caseId, malformed, diagnostic, undefined, {
      subcaseId: stringValue(recipe["id"], `${caseId}.id`),
      fault: stringValue(recipe["fault"], `${caseId}.fault`),
      baseDraft: base,
      mutationProjection: record(
        recipe["mutationProjection"],
        `${caseId}.mutationProjection`,
      ),
    });
    return;
  }
  if (caseId === "T0-CHART-FMT-ERR-002") {
    const rows = records(row["rows"], `${caseId}.rows`);
    expect(rows.map((child) => stringValue(child["id"], `${caseId}.row.id`))).toEqual([
      "draft-schema-version-mismatch",
      "grammar-version-mismatch",
      "fragment-title-present",
      "event-ordinal-gap",
      "symbol-range-beyond-source",
      "repeat-link-self-reference",
      "literal-unformattable-extension",
      "repeat-copy-mismatch-unformattable",
    ]);
    for (const child of rows) {
      const childId = stringValue(child["id"], `${caseId}.row.id`);
      const fault = stringValue(child["fault"], "fault");
      const baseDraft = formatterMutationBase(
        child["baseDraft"],
        `${caseId}.${childId}.baseDraft`,
      );
      let draft = baseDraft;
      switch (childId) {
        case "draft-schema-version-mismatch":
          draft = {
            ...draft,
            schema: "changes.theory.chart-text-draft.v999" as typeof draft.schema,
          };
          break;
        case "grammar-version-mismatch":
          draft = { ...draft, grammarVersion: 2 as typeof draft.grammarVersion };
          break;
        case "fragment-title-present":
          draft = { ...draft, headers: { ...draft.headers, title: "not allowed" } };
          break;
        case "event-ordinal-gap": {
          const event = draft.sections[0]?.measures[0]?.events[2];
          if (event === undefined) throw new Error("T0_FORMAT_EVENT_2");
          draft = replaceDraftEvent(draft, 2, { ...event, ordinal: 4 });
          break;
        }
        case "symbol-range-beyond-source": {
          const event = draft.sections[0]?.measures[0]?.events[0];
          if (event === undefined) throw new Error("T0_FORMAT_EVENT_0");
          draft = replaceDraftEvent(draft, 0, {
            ...event,
            symbolRange: {
              start: event.symbolRange.start,
              end: draft.sourceText.length + 1,
            },
          });
          break;
        }
        case "repeat-link-self-reference": {
          const event = draft.sections[0]?.measures[0]?.events[1];
          if (event === undefined) throw new Error("T0_FORMAT_REPEAT");
          draft = replaceDraftEvent(draft, 1, { ...event, repeatedFromOrdinal: 1 });
          break;
        }
        case "literal-unformattable-extension": {
          const event = draft.sections[0]?.measures[0]?.events[0];
          if (event === undefined) throw new Error("T0_FORMAT_LITERAL_CHORD");
          draft = replaceDraftEvent(draft, 0, {
            ...event,
            chord: {
              ...event.chord,
              extensions: [{ number: 9, alter: 0 }],
            },
          });
          break;
        }
        case "repeat-copy-mismatch-unformattable": {
          const event = draft.sections[0]?.measures[0]?.events[1];
          if (event === undefined) throw new Error("T0_FORMAT_REPEAT_CHORD");
          draft = replaceDraftEvent(draft, 1, {
            ...event,
            chord: {
              ...event.chord,
              sixth: { number: 6, alter: 0 },
            },
          });
          break;
        }
        default:
          throw new Error(`T0_FORMAT_SUBCASE:${childId}`);
      }
      const expected = record(child["expected"], `${caseId}.row.expected`);
      if (childId === "literal-unformattable-extension") {
        const nested = record(
          child["nestedSymbolFormatterDiagnostic"],
          `${caseId}.${childId}.nestedSymbolFormatterDiagnostic`,
        );
        const event = flattenedEvents(draft)[0];
        if (event === undefined) throw new Error("T0_FORMAT_LITERAL_CHORD");
        const nestedResult = theory.formatChordSymbol(event.chord, "ascii");
        expect(nestedResult.ok, `${caseId}.${childId}.nestedRefusal`).toBe(false);
        if (!nestedResult.ok) {
          expect(diagnostics(nestedResult.diagnostics), `${caseId}.${childId}.localRange`)
            .toEqual([{
              code: stringValue(expected["code"], `${caseId}.${childId}.code`),
              range: fixtureRange(nested["localRange"], `${caseId}.${childId}.localRange`),
            }]);
        }
        expect(
          expected["mustNotUseChordLocalSourceOffsets"],
          `${caseId}.${childId}.mustNotUseChordLocalSourceOffsets`,
        ).toBe(true);
        expect(expected["range"], `${caseId}.${childId}.chartRangeDiffersFromLocalRange`)
          .not.toEqual(nested["localRange"]);
      }
      const formatterEvidence = runFormatterRefusal(
        caseId,
        draft,
        expected,
        undefined,
        {
          subcaseId: childId,
          fault,
          baseDraft,
          mutationProjection: record(
            child["mutationProjection"],
            `${caseId}.${childId}.mutationProjection`,
          ),
        },
      );
      if (childId === "repeat-copy-mismatch-unformattable") {
        expect(
          expected["mustRejectBeforeNestedSymbolFormatting"],
          `${caseId}.${childId}.mustRejectBeforeNestedSymbolFormatting`,
        ).toBe(true);
        const repeatEvent = flattenedEvents(draft).find(({ origin }) => origin === "repeat");
        if (repeatEvent === undefined) throw new Error("T0_FORMAT_REPEAT_CHORD");
        const nestedResult = theory.formatChordSymbol(repeatEvent.chord, "ascii");
        expect(nestedResult.ok).toBe(false);
        if (!nestedResult.ok) {
          expect(nestedResult.diagnostics[0].code).toBe("symbol.ast_unformattable");
        }
        expect(expected["code"]).toBe("chart.draft_unformattable");
        expect(formatterEvidence.chordDelegations, `${caseId}.${childId}.delegations`)
          .toBe(repeatEvent.ordinal);
      }
    }
    return;
  }
  if (caseId === "T0-CHART-FMT-ERR-003") {
    const rows = records(row["rows"], `${caseId}.rows`);
    expect(rows, caseId).toHaveLength(2);
    expect(rows.map((child) => stringValue(child["id"], `${caseId}.row.id`))).toEqual([
      "section-limit-first-excess",
      "event-limit-first-excess",
    ]);
    const sectionRow = rows[0];
    const eventRow = rows[1];
    if (sectionRow === undefined || eventRow === undefined) {
      throw new Error("T0_FORMAT_LIMIT_ROWS");
    }
    const parentExpected = record(row["expected"], `${caseId}.expected`);
    expect(parentExpected["ok"], `${caseId}.ok`).toBe(false);
    expect(parentExpected["noPartialText"], `${caseId}.noPartialText`).toBe(true);
    const earlierFailureCode = stringValue(
      parentExpected["topLevelOrEarlierRangeIncoherenceWinsAs"],
      `${caseId}.topLevelOrEarlierRangeIncoherenceWinsAs`,
    );
    expect(earlierFailureCode).toBe("chart.draft_unformattable");

    const sectionDraft = independentEmptySectionDraft(65);
    const eventDraft = independentEventLimitDraft(true);
    assertSectionLimitDraftRecipe(sectionRow, sectionDraft);
    assertEventLimitDraftRecipe(eventRow, eventDraft);
    const sectionExpected = record(sectionRow["expected"], "section expected");
    const eventExpected = record(eventRow["expected"], "event expected");
    expect(sectionExpected["precedence"], `${caseId}.section.precedence`).toBe(
      "after the excess section own range/local shape is coherent and before its descendants or later nodes",
    );
    expect(eventExpected["precedence"], `${caseId}.event.precedence`).toBe(
      "after the excess event own ranges/local shape are coherent and before later nodes",
    );

    const sectionEvidence = runFormatterRefusal(
      caseId,
      sectionDraft,
      sectionExpected,
      undefined,
      {
        subcaseId: stringValue(sectionRow["id"], `${caseId}.section.id`),
        fault: "coherent first-excess section reaches the formatter limit",
      },
    );
    expect({
      maxDecodedTextCodePointsObserved: sectionEvidence.maxDecodedTextCodePointsObserved,
      headersObserved: sectionEvidence.headersObserved,
      sectionsObserved: sectionEvidence.sectionsObserved,
      measuresObserved: sectionEvidence.measuresObserved,
      slotsObserved: sectionEvidence.slotsObserved,
      chordDelegations: sectionEvidence.chordDelegations,
      diagnosticsProduced: sectionEvidence.diagnosticsProduced,
      termination: sectionEvidence.termination,
    }).toEqual({
      maxDecodedTextCodePointsObserved: 4,
      headersObserved: 1,
      sectionsObserved: 65,
      measuresObserved: 64,
      slotsObserved: 0,
      chordDelegations: 0,
      diagnosticsProduced: 1,
      termination: "chart-sections",
    });

    const eventEvidence = runFormatterRefusal(
      caseId,
      eventDraft,
      eventExpected,
      undefined,
      {
        subcaseId: stringValue(eventRow["id"], `${caseId}.event.id`),
        fault: "coherent first-excess event reaches the formatter limit",
      },
    );
    expect({
      maxDecodedTextCodePointsObserved: eventEvidence.maxDecodedTextCodePointsObserved,
      headersObserved: eventEvidence.headersObserved,
      sectionsObserved: eventEvidence.sectionsObserved,
      measuresObserved: eventEvidence.measuresObserved,
      slotsObserved: eventEvidence.slotsObserved,
      chordDelegations: eventEvidence.chordDelegations,
      diagnosticsProduced: eventEvidence.diagnosticsProduced,
      termination: eventEvidence.termination,
    }).toEqual({
      maxDecodedTextCodePointsObserved: 4,
      headersObserved: 1,
      sectionsObserved: 9,
      measuresObserved: 8193,
      slotsObserved: 8193,
      chordDelegations: 8192,
      diagnosticsProduced: 1,
      termination: "chart-events",
    });

    for (const [subcaseId, draft] of [["section", sectionDraft], ["event", eventDraft]] as const) {
      const topLevelMalformed = theory.formatChartText({
        ...draft,
        schema: "changes.theory.chart-text-draft.v999" as typeof draft.schema,
      }, "ascii");
      expect(topLevelMalformed.ok, `${caseId}.${subcaseId}.topLevelPrecedence`).toBe(false);
      if (!topLevelMalformed.ok) {
        expect(earlierFailureCode, `${caseId}.${subcaseId}.topLevelCode`)
          .toBe(topLevelMalformed.diagnostics[0].code);
      }
    }
    return;
  }
  throw new Error(`T0_FORMAT_CASE:${caseId}`);
}

function assertLimit019Recipe(recipe: FixtureRecord, draft: ChartTextDraft): void {
  const label = "T0-CHART-LIMIT-019.materializationRecipe";
  expect(recipe["sourceExpression"], `${label}.sourceExpression`).toBe(
    "\"@meter 4/4\\n\" + eight sections S000 through S007, each `[Snnn]\\n` plus 1024 copies of `| C:4 |\\n`, then `[S008]\\n| C:4 |\\n`",
  );
  expect(draft.sourceText).toBe(eventLimitSource(true));
  expect(recipe["sourceUtf16Length"], `${label}.sourceUtf16Length`).toBe(
    draft.sourceText.length,
  );
  expect(recipe["sourceCodePoints"], `${label}.sourceCodePoints`).toBe(
    Array.from(draft.sourceText).length,
  );
  expect(recipe["sourceUtf8Bytes"], `${label}.sourceUtf8Bytes`).toBe(
    new TextEncoder().encode(draft.sourceText).length,
  );
  const prefix = record(
    recipe["prefixThroughPermittedEvents"],
    `${label}.prefixThroughPermittedEvents`,
  );
  expect(prefix).toEqual({
    sections: 8,
    measures: theory.MAX_CHART_MEASURES_PER_SECTION * 8,
    events: theory.MAX_CHART_EVENTS,
    sourceUtf16Length: draft.sections[8]?.range.start,
  });

  const materialization = record(recipe["draftMaterialization"], `${label}.draftMaterialization`);
  expect(materialization["schema"], `${label}.schema`).toBe(draft.schema);
  expect(materialization["grammarId"], `${label}.grammarId`).toBe(draft.grammarId);
  expect(materialization["grammarVersion"], `${label}.grammarVersion`).toBe(draft.grammarVersion);
  expect(materialization["mode"], `${label}.mode`).toBe(draft.mode);
  expect(materialization["headers"], `${label}.headers`).toEqual({ meter: draft.headers.meter });
  expect(materialization["fullSections"], `${label}.fullSections`).toEqual({
    count: 8,
    measuresPerSection: theory.MAX_CHART_MEASURES_PER_SECTION,
    eventsPerMeasure: 1,
  });
  expect(materialization["events"], `${label}.events`).toEqual({
    origin: "literal",
    chordCaseId: "T0-SYM-001",
    chordSourceText: "C",
    duration: { numerator: 4, denominator: 1 },
  });
  expect(materialization["ranges"], `${label}.ranges`).toBe(
    "all unchanged records use the literal section 2.1.1 ranges; do not invoke production parsing",
  );

  const first = record(recipe["firstExcess"], `${label}.firstExcess`);
  const section = draft.sections[numberValue(first["sectionOrdinal"], `${label}.sectionOrdinal`)];
  const measure = section?.measures[numberValue(first["measureOrdinal"], `${label}.measureOrdinal`)];
  const event = measure?.events.find(({ ordinal }) =>
    ordinal === numberValue(first["eventOrdinal"], `${label}.eventOrdinal`)
  );
  expect(first["eventOrdinal"], `${label}.eventOrdinal`).toBe(theory.MAX_CHART_EVENTS);
  expect(section?.range, `${label}.sectionRange`).toEqual(
    fixtureRange(first["sectionRange"], `${label}.sectionRange`),
  );
  expect(measure?.range, `${label}.measureRange`).toEqual(
    fixtureRange(first["measureRange"], `${label}.measureRange`),
  );
  expect(event?.range, `${label}.eventRange`).toEqual(
    fixtureRange(first["eventRange"], `${label}.eventRange`),
  );
  expect(event?.symbolRange, `${label}.symbolRange`).toEqual(
    fixtureRange(first["symbolRange"], `${label}.symbolRange`),
  );
  expect(event?.durationRange, `${label}.durationRange`).toEqual(
    fixtureRange(first["durationRange"], `${label}.durationRange`),
  );
}

function assertLimit020Recipe(recipe: FixtureRecord, prefix: ChartTextDraft): void {
  const label = "T0-CHART-LIMIT-020.materializationRecipe";
  expect(recipe["commonPrefixExpression"], `${label}.commonPrefixExpression`).toBe(
    "\"@meter 4/4\\n\" + Array.from({length:64}, (_, index) => `[S${String(index).padStart(3, \"0\")}]\\n| |\\n`).join(\"\")",
  );
  expect(recipe["commonPrefixUtf16Length"], `${label}.commonPrefixUtf16Length`)
    .toBe(prefix.sourceText.length);
  expect(recipe["commonPrefixSections"], `${label}.commonPrefixSections`)
    .toBe(prefix.sections.length);
  expect(recipe["commonPrefixMeasures"], `${label}.commonPrefixMeasures`)
    .toBe(flattenedMeasures(prefix).length);
  expect(recipe["commonPrefixEvents"], `${label}.commonPrefixEvents`)
    .toBe(flattenedEvents(prefix).length);

  const materialization = record(recipe["draftMaterialization"], `${label}.draftMaterialization`);
  expect(materialization["schema"], `${label}.schema`).toBe(prefix.schema);
  expect(materialization["grammarId"], `${label}.grammarId`).toBe(prefix.grammarId);
  expect(materialization["grammarVersion"], `${label}.grammarVersion`).toBe(prefix.grammarVersion);
  expect(materialization["mode"], `${label}.mode`).toBe(prefix.mode);
  expect(materialization["headers"], `${label}.headers`).toEqual({ meter: prefix.headers.meter });
  expect(materialization["sectionOrdinals"], `${label}.sectionOrdinals`).toBe("0 through 64");
  expect(materialization["eachSection"], `${label}.eachSection`).toEqual({
    kind: "named",
    oneEmptyBarredMeasure: true,
  });
  expect(materialization["ranges"], `${label}.ranges`).toBe(
    "derive literally from each row using contract section 2.1.1; do not invoke production parsing",
  );
}

function assertLimit020ShallowRangeProbes(
  prefix: ChartTextDraft,
  labelsValue: unknown,
): void {
  const label = "T0-CHART-LIMIT-020.section-hull-ends-before-last-measure";
  expect(labelsValue, `${label}.shallowBoundaryRangeReads`).toEqual([
    "first measure.range",
    "last measure.range",
  ]);
  const sourceText = `${prefix.sourceText}[S064]\n| | | |\n`;
  const section: ChartTextDraft["sections"][number] = {
    ordinal: theory.MAX_CHART_SECTIONS,
    kind: "named",
    name: "S064",
    annotation: "",
    range: { start: 715, end: 729 },
    measures: [{
      ordinal: 0,
      kind: "barred",
      range: { start: 722, end: 725 },
      events: [],
    }, {
      ordinal: 1,
      kind: "barred",
      range: { start: 724, end: 729 },
      events: [],
    }],
  };
  const base: ChartTextDraft = {
    ...prefix,
    sourceText,
    sections: [...prefix.sections, section],
  };
  const coherent = formatChartTextWithEvidence(base, "ascii");
  expect(coherent.result.ok, `${label}.coherentProbe`).toBe(false);
  if (!coherent.result.ok) {
    expect(coherent.result.diagnostics[0].code, `${label}.coherentProbeCode`)
      .toBe("limit.chart_sections_exceeded");
  }
  const firstMeasure = section.measures[0];
  const lastMeasure = section.measures[1];
  if (firstMeasure === undefined || lastMeasure === undefined) {
    throw new Error("T0_FORMAT_SHALLOW_RANGE_PROBE");
  }

  const probes = [{
    id: "first measure.range",
    measures: [{
      ...firstMeasure,
      range: { start: 714, end: 725 },
    }, lastMeasure],
  }, {
    id: "last measure.range",
    measures: [firstMeasure, {
      ...lastMeasure,
      range: { start: 724, end: 730 },
    }],
  }] as const;
  for (const probe of probes) {
    const observed = formatChartTextWithEvidence({
      ...base,
      sections: [...prefix.sections, { ...section, measures: probe.measures }],
    }, "ascii");
    expect(observed.result.ok, `${label}.${probe.id}`).toBe(false);
    if (!observed.result.ok) {
      expect(observed.result.diagnostics[0].code, `${label}.${probe.id}.code`)
        .toBe("chart.draft_unformattable");
    }
    expect(observed.evidence.sectionsObserved, `${label}.${probe.id}.sectionsObserved`)
      .toBe(theory.MAX_CHART_SECTIONS);
    expect(observed.evidence.measuresObserved, `${label}.${probe.id}.measuresObserved`)
      .toBe(theory.MAX_CHART_SECTIONS);
    expect(observed.evidence.slotsObserved, `${label}.${probe.id}.slotsObserved`).toBe(0);
  }
}

function runChartFormatterBoundaryCase(row: FixtureRecord): void {
  const caseId = fixtureId(row);
  if (caseId === "T0-CHART-LIMIT-019") {
    expect(row["style"], `${caseId}.style`).toBe("ascii");
    expect(row["kind"], `${caseId}.kind`).toBe(
      "formatter-validates-first-excess-literal-event-ownership-before-counting",
    );
    const recipe = record(row["materializationRecipe"], `${caseId}.recipe`);
    const canonicalBaseDraft = independentEventLimitDraft(true);
    assertLimit019Recipe(recipe, canonicalBaseDraft);
    expect(record(row["expected"], `${caseId}.expected`)).toEqual({
      malformedFirstExcessEventIsNotCounted: true,
      literalSourceTextMustEqualItsOwnSymbolRangeSlice: true,
      literalSymbolRangeMustOwnTheExactChordSpan: true,
      coherentFirstExcessEventIsCountedExactlyOnce: true,
      firstExcessChordFormatterIsNotReached: true,
      allOmittedFormatterCountersFollowTheZeroAndProjectionRulesInT0SyntaxContract: true,
    });
    const rows = records(recipe["rows"], `${caseId}.rows`);
    expect(rows.map((child) => stringValue(child["id"], `${caseId}.row.id`))).toEqual([
      "literal-source-owner-mismatch",
      "literal-symbol-range-owner-mismatch",
      "coherent-first-excess-control",
    ]);
    for (const child of rows) {
      const baseDraft = canonicalBaseDraft;
      let draft = baseDraft;
      const section = draft.sections[8];
      const measure = section?.measures[0];
      const event = measure?.events[0];
      if (section === undefined || measure === undefined || event === undefined) {
        throw new Error("T0_FORMAT_BOUNDARY_EVENT");
      }
      const childId = stringValue(child["id"], "child.id");
      if (childId === "literal-source-owner-mismatch") {
        draft = {
          ...draft,
          sections: draft.sections.map((item, index) => index !== 8 ? item : {
            ...item,
            measures: [{
              ...measure,
              events: [{ ...event, chord: { ...event.chord, sourceText: "D" } }],
            }],
          }),
        };
      } else if (childId === "literal-symbol-range-owner-mismatch") {
        draft = {
          ...draft,
          sections: draft.sections.map((item, index) => index !== 8 ? item : {
            ...item,
            measures: [{
              ...measure,
              events: [{
                ...event,
                symbolRange: { start: 65_613, end: 65_614 },
              }],
            }],
          }),
        };
      } else if (childId !== "coherent-first-excess-control") {
        throw new Error(`T0_FORMAT_BOUNDARY_SUBCASE:${childId}`);
      }
      const expected = record(child["expected"], `${caseId}.row.expected`);
      expect(expected["ok"], `${caseId}.${childId}.ok`).toBe(false);
      expect(expected["noPartialText"], `${caseId}.${childId}.noPartialText`).toBe(true);
      const singleFault = child["singleFault"];
      let mutationIdentity: Pick<
        FormatterRefusalIdentity,
        "baseDraft" | "mutationProjection"
      > = {};
      if (singleFault === null) {
        expect(
          Object.hasOwn(child, "mutationProjection"),
          `${caseId}.${childId}.mutationProjection`,
        ).toBe(false);
      } else {
        mutationIdentity = {
          baseDraft,
          mutationProjection: record(
            child["mutationProjection"],
            `${caseId}.${childId}.mutationProjection`,
          ),
        };
      }
      const evidence = runFormatterRefusal(
        caseId,
        draft,
        expected,
        expected["expectedEvidence"],
        {
          subcaseId: stringValue(child["id"], `${caseId}.row.id`),
          fault: singleFault === null
            ? "coherent first-excess event control"
            : stringValue(singleFault, `${caseId}.row.singleFault`),
          ...mutationIdentity,
        },
      );
      if (childId === "literal-source-owner-mismatch") {
        expect(event.chord.sourceText).toBe(
          baseDraft.sourceText.slice(event.symbolRange.start, event.symbolRange.end),
        );
        const mutatedEvent = flattenedEvents(draft).find(({ ordinal }) =>
          ordinal === theory.MAX_CHART_EVENTS
        );
        expect(mutatedEvent?.chord.sourceText).not.toBe(
          draft.sourceText.slice(
            mutatedEvent?.symbolRange.start ?? 0,
            mutatedEvent?.symbolRange.end ?? 0,
          ),
        );
      }
      if (childId === "literal-symbol-range-owner-mismatch") {
        const mutatedEvent = flattenedEvents(draft).find(({ ordinal }) =>
          ordinal === theory.MAX_CHART_EVENTS
        );
        expect(mutatedEvent?.symbolRange.start).not.toBe(mutatedEvent?.range.start);
        expect(draft.sourceText.slice(
          mutatedEvent?.symbolRange.start ?? 0,
          mutatedEvent?.symbolRange.end ?? 0,
        )).not.toBe(mutatedEvent?.chord.sourceText);
      }
      if (childId === "coherent-first-excess-control") {
        expect(expected["firstExcessChordDelegated"], `${caseId}.${childId}.delegated`)
          .toBe(false);
        expect(evidence.slotsObserved).toBe(theory.MAX_CHART_EVENTS + 1);
      } else {
        expect(evidence.slotsObserved).toBe(theory.MAX_CHART_EVENTS);
      }
      expect(evidence.maxDecodedTextCodePointsObserved).toBe(4);
      expect(evidence.chordDelegations).toBe(theory.MAX_CHART_EVENTS);
    }
    return;
  }

  if (caseId === "T0-CHART-LIMIT-020") {
    expect(row["style"], `${caseId}.style`).toBe("ascii");
    expect(row["kind"], `${caseId}.kind`).toBe(
      "formatter-validates-first-excess-section-local-shape-before-counting",
    );
    const recipe = record(row["materializationRecipe"], `${caseId}.recipe`);
    const prefix = independentEmptySectionDraft(64);
    assertLimit020Recipe(recipe, prefix);
    expect(record(row["expected"], `${caseId}.expected`)).toEqual({
      malformedFirstExcessSectionIsNotCounted: true,
      namedSectionMustOwnItsOpeningMarker: true,
      sectionGapBeginsAfterCompleteAnnotation: true,
      sectionRangeMustOwnItsLastMeasureHull: true,
      coherentFirstExcessSectionIsCountedExactlyOnce: true,
      firstExcessSectionDescendantsAreNeverTraversed: true,
      allOmittedFormatterCountersFollowTheZeroAndProjectionRulesInT0SyntaxContract: true,
    });
    const rows = records(recipe["rows"], `${caseId}.rows`);
    expect(rows.map((child) => stringValue(child["id"], `${caseId}.row.id`))).toEqual([
      "named-marker-owner-mismatch",
      "post-annotation-gap-missing",
      "section-hull-ends-before-last-measure",
      "coherent-annotated-first-excess-control",
    ]);
    for (const child of rows) {
      const suffix = stringValue(child["suffix"], "suffix");
      const childDraft = record(child["draftFirstExcess"], "draftFirstExcess");
      const sourceText = `${prefix.sourceText}${suffix}`;
      expect(sourceText.length, `${caseId}.${String(child["id"])}.sourceUtf16Length`).toBe(
        numberValue(child["sourceUtf16Length"], `${caseId}.sourceUtf16Length`),
      );
      const sectionRange = fixtureRange(childDraft["range"], "section.range");
      const measureRangeValue = childDraft["measureRange"] ??
        childDraft["firstMeasureRange"];
      const measureRange = fixtureRange(measureRangeValue, "measure.range");
      const excess = {
        ordinal: 64,
        kind: "named" as const,
        name: stringValue(childDraft["name"], "section.name"),
        annotation: stringValue(childDraft["annotation"], "section.annotation"),
        range: sectionRange,
        measures: [{
          ordinal: 0,
          kind: "barred" as const,
          range: measureRange,
          events: [],
        }],
      };
      const draft: ChartTextDraft = {
        ...prefix,
        sourceText,
        sections: [...prefix.sections, excess],
      };
      const expected = record(child["expected"], `${caseId}.row.expected`);
      const childId = stringValue(child["id"], `${caseId}.row.id`);
      expect(expected["ok"], `${caseId}.${childId}.ok`).toBe(false);
      expect(expected["noPartialText"], `${caseId}.${childId}.noPartialText`).toBe(true);
      if (childDraft["lastMeasureRange"] !== undefined) {
        expect(
          fixtureRange(childDraft["lastMeasureRange"], `${caseId}.${childId}.lastMeasureRange`),
        ).toEqual(measureRange);
      }
      if (expected["shallowBoundaryRangeReads"] !== undefined) {
        assertLimit020ShallowRangeProbes(prefix, expected["shallowBoundaryRangeReads"]);
        expect(excess.range.end, `${caseId}.${childId}.sectionHullEnd`)
          .toBeLessThan(excess.measures.at(-1)?.range.end ?? 0);
      }
      const singleFault = child["singleFault"];
      const evidence = runFormatterRefusal(
        caseId,
        draft,
        expected,
        expected["expectedEvidence"],
        {
          subcaseId: stringValue(child["id"], `${caseId}.row.id`),
          fault: singleFault === null
            ? "coherent first-excess section control"
            : stringValue(singleFault, `${caseId}.row.singleFault`),
          ...(child["mutationProjection"] === undefined
            ? {}
            : { mutationProjection: child["mutationProjection"] }),
        },
      );
      const descendantsFlag = expected["descendantsVisited"] ??
        expected["descendantsTraversed"];
      expect(descendantsFlag, `${caseId}.${childId}.descendants`).toBe(false);
      expect(evidence.measuresObserved, `${caseId}.${childId}.measuresObserved`)
        .toBe(theory.MAX_CHART_SECTIONS);
      expect(evidence.slotsObserved, `${caseId}.${childId}.slotsObserved`).toBe(0);
      expect(evidence.maxDecodedTextCodePointsObserved).toBe(4);
      if (childId === "coherent-annotated-first-excess-control") {
        expect(evidence.sectionsObserved).toBe(theory.MAX_CHART_SECTIONS + 1);
      } else {
        expect(evidence.sectionsObserved).toBe(theory.MAX_CHART_SECTIONS);
      }
      if (childId === "named-marker-owner-mismatch") {
        expect(sourceText[sectionRange.start]).not.toBe("[");
      }
      if (childId === "post-annotation-gap-missing") {
        const annotationEnd = sourceText.indexOf('"|', sectionRange.start) + 1;
        expect(sourceText[annotationEnd]).toBe("|");
      }
    }
    return;
  }
  throw new Error(`T0_FORMAT_BOUNDARY_CASE:${caseId}`);
}



describe("T0 production syntax conformance", () => {
  test("publishes the exact frozen public operation surface and private evidence seams", () => {
    const workEvidence = record(
      record(syntaxContractFixtureValue, "syntax contract")["workEvidence"],
      "syntax contract workEvidence",
    );
    const operationSemantics = record(
      workEvidence["operationSemantics"],
      "syntax contract operationSemantics",
    );
    const chartFormatterSemantics = record(
      operationSemantics["formatChartText"],
      "syntax contract formatChartText",
    );
    expect(chartFormatterSemantics["zeroCounters"]).toEqual(FORMATTER_ZERO_COUNTERS);
    expect(Object.keys(theory.syntaxOperations)).toEqual([
      "parseChordSymbol",
      "formatChordSymbol",
      "parseChartText",
      "formatChartText",
    ]);
    expect(Object.isFrozen(theory.syntaxOperations)).toBe(true);
    expect(theory.syntaxOperations.parseChordSymbol).toBe(theory.parseChordSymbol);
    expect(theory.syntaxOperations.formatChordSymbol).toBe(theory.formatChordSymbol);
    expect(theory.syntaxOperations.parseChartText).toBe(theory.parseChartText);
    expect(theory.syntaxOperations.formatChartText).toBe(theory.formatChartText);
    expect(Object.hasOwn(theory, "parseChordSymbolWithEvidence")).toBe(false);
    expect(Object.hasOwn(theory, "formatChordSymbolWithEvidence")).toBe(false);
    expect(Object.hasOwn(theory, "parseChartTextWithEvidence")).toBe(false);
    expect(Object.hasOwn(theory, "formatChartTextWithEvidence")).toBe(false);

    const symbol = parseChordSymbolWithEvidence("C", "ascii");
    const chart = parseChartTextWithEvidence(
      "C",
      { mode: "fragment", meter: { beatsPerBar: 4, beatUnit: 4 } },
      "ascii",
    );
    for (const observation of [symbol, chart]) {
      expect(Object.keys(observation)).toContain("result");
      expect(Object.keys(observation)).toContain("evidence");
      expect(Object.isFrozen(observation)).toBe(true);
      expect(Object.isFrozen(observation.result)).toBe(true);
      expect(Object.isFrozen(observation.evidence)).toBe(true);
      expect(Object.keys(observation.evidence)).toHaveLength(23);
    }
  });

  test("matches every independently authored symbol and ordinary chart authority", () => {
    for (const row of canonicalSymbolRows()) runSymbolSuccessCase(row);
    for (const row of records(symbolFixture["aliasCases"], "aliasCases")) {
      runSymbolSuccessCase(row);
    }
    for (const row of records(symbolFixture["failureCases"], "failureCases")) {
      runSymbolFailureCase(row);
    }
    for (const row of records(
      symbolFixture["formatFailureCases"],
      "formatFailureCases",
    )) {
      runSymbolFormatFailureCase(row);
    }
    for (const row of records(symbolFixture["boundaryCases"], "boundaryCases")) {
      runSymbolBoundaryCase(row);
    }
    for (const row of records(chartFixture["successCases"], "successCases")) {
      runChartSuccessCase(row);
    }
    for (const row of records(chartFixture["failureCases"], "failureCases")) {
      if (row["operation"] === "format") runChartFormatFailureCase(row);
      else runChartFailureCase(row);
    }
    for (const row of records(chartFixture["boundaryCases"], "boundaryCases")) {
      if (row["operation"] === "format") runChartFormatterBoundaryCase(row);
      else runChartBoundaryCase(row);
    }
  });

  test("accounts for all 193 fixture cases and emits one stable hash inventory", () => {
    const symbolRows = [
      ...canonicalSymbolRows(),
      ...records(symbolFixture["aliasCases"], "aliasCases"),
      ...records(symbolFixture["failureCases"], "failureCases"),
      ...records(symbolFixture["formatFailureCases"], "formatFailureCases"),
      ...records(symbolFixture["boundaryCases"], "boundaryCases"),
    ];
    const chartRows = [
      ...records(chartFixture["successCases"], "successCases"),
      ...records(chartFixture["failureCases"], "failureCases"),
      ...records(chartFixture["boundaryCases"], "boundaryCases"),
    ];
    expect(symbolRows).toHaveLength(111);
    expect(chartRows).toHaveLength(82);
    const fixtureCaseIds = [...symbolRows, ...chartRows]
      .map(fixtureId)
      .sort();
    expect(new Set(fixtureCaseIds).size).toBe(193);
    expect([...observations.keys()].sort()).toEqual(fixtureCaseIds);
    const fixtureCaseHashes = Object.fromEntries(
      fixtureCaseIds.map((caseId) => {
        const caseObservations = observations.get(caseId);
        if (caseObservations === undefined || caseObservations.length === 0) {
          throw new Error(`T0_CASE_NOT_EXECUTED:${caseId}`);
        }
        return [
          caseId,
          sha256(canonicalJson({ caseId, observations: caseObservations })),
        ];
      }),
    );
    const evidence = {
      schema: "changes.evidence.t0-production-conformance-observation.v1",
      fixtureCaseIds,
      fixtureCaseHashes,
      fixtureCases: fixtureCaseIds.length,
      executions: [...observations.values()].reduce(
        (total, caseObservations) => total + caseObservations.length,
        0,
      ),
      categoryCounts: {
        symbol: symbolRows.length,
        chart: chartRows.length,
      },
    };
    console.log(`T0_EVIDENCE_OBSERVATION ${JSON.stringify({
      ...evidence,
      semanticDigest: sha256(canonicalJson(evidence)),
    })}`);
  });
});
