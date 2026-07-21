import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  makeBeatDuration,
  makeMeter,
  type BeatDuration,
  type ChordSpec,
  type Meter,
} from "../../src/domain";
import {
  CHART_TEXT_DRAFT_SCHEMA,
  CHART_TEXT_GRAMMAR_ID,
  CHART_TEXT_GRAMMAR_VERSION,
  MAX_CHART_EVENTS,
  MAX_CHART_SECTIONS,
  formatChartText,
  formatChordSymbol,
  parseChartText,
  parseChordSymbol,
  type AccidentalStyle,
  type ChartDraftEvent,
  type ChartDraftMeasure,
  type ChartDraftSection,
  type ChartTextDraft,
  type ChartTextParseRequest,
} from "../../src/theory";
import { formatChartTextWithEvidence } from "../../src/theory/chart-formatter";
import { parseChartTextWithEvidence } from "../../src/theory/chart-parser";
import { parseChordSymbolWithEvidence } from "../../src/theory/chord-symbol";
import chartFixtureValue from "../fixtures/theory/chart-cases.json";
import mutationFixtureValue from "../fixtures/theory/mutation-controls.json";
import symbolFixtureValue from "../fixtures/theory/symbol-cases.json";
import t0SyntaxContractFixtureValue from "../fixtures/theory/t0-syntax-contract.json";

type JsonRecord = Readonly<Record<string, unknown>>;

type CaseObservation = Readonly<{
  caseId: string;
  channel: "runtime-case" | "roundtrip-law";
  outcome: "pass";
  evidenceSha256: string;
  executions: number;
}>;

let assertionCount = 0;

const REVIEWED_MUTATION_CONTROL_COUNT = 60;
const LEDGER_TAMPERS_PER_CONTROL = 3;
const NEWLY_LINKED_MUTATION_CASE = "T0-CHART-ERR-022";

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

function pathSegments(path: string): readonly string[] {
  return path.match(/[^.[\]]+/gu) ?? [];
}

function valueAtPath(value: unknown, path: string): unknown {
  let cursor = value;
  for (const segment of pathSegments(path)) {
    if (typeof cursor !== "object" || cursor === null) {
      throw new Error(`mutation path does not resolve: ${path}`);
    }
    cursor = Reflect.get(cursor, segment);
  }
  return cursor;
}

function setValueAtPath(value: unknown, path: string, replacement: unknown): void {
  const segments = pathSegments(path);
  const final = segments.at(-1);
  if (final === undefined) throw new Error(`mutation path is empty: ${path}`);
  let cursor = value;
  for (const segment of segments.slice(0, -1)) {
    if (typeof cursor !== "object" || cursor === null) {
      throw new Error(`mutation path does not resolve: ${path}`);
    }
    cursor = Reflect.get(cursor, segment);
  }
  if (typeof cursor !== "object" || cursor === null) {
    throw new Error(`mutation path does not resolve: ${path}`);
  }
  if (!Reflect.set(cursor, final, replacement)) {
    throw new Error(`mutation path cannot be restored: ${path}`);
  }
}

function verifyMutationProjection(
  baseDraft: ChartTextDraft,
  mutatedDraft: ChartTextDraft,
  expectedValue: unknown,
  label: string,
): JsonRecord {
  const expected = record(expectedValue, label);
  equal(
    Object.keys(expected).sort(),
    ["after", "before", "path"],
    `${label}.shape`,
  );
  const path = string(expected["path"], `${label}.path`);
  const actual = {
    path,
    before: canonicalize(valueAtPath(baseDraft, path)),
    after: canonicalize(valueAtPath(mutatedDraft, path)),
  };
  equal(actual, expected, `${label}.values`);

  const restored = structuredClone(mutatedDraft);
  setValueAtPath(restored, path, structuredClone(valueAtPath(baseDraft, path)));
  equal(restored, baseDraft, `${label}.only-declared-mutation`);
  return actual;
}

function checkedMeter(value: unknown, label: string): Meter {
  const input = record(value, label);
  const result = makeMeter({
    beatsPerBar: number(input["beatsPerBar"], `${label}.beatsPerBar`),
    beatUnit: number(input["beatUnit"], `${label}.beatUnit`),
  });
  if (!result.ok) throw new Error(`${label} is not a meter`);
  return result.value;
}

function duration(numerator: number, denominator = 1): BeatDuration {
  const result = makeBeatDuration({ numerator, denominator });
  if (!result.ok) throw new Error("invalid test duration");
  return result.value;
}

function fixtureStyle(value: unknown): AccidentalStyle {
  if (value === undefined || value === "ascii") return "ascii";
  if (value === "unicode") return "unicode";
  throw new Error("invalid fixture accidental style");
}

function chartRequest(value: unknown, label: string): ChartTextParseRequest {
  const request = record(value, label);
  if (request["mode"] === "document") return { mode: "document" };
  if (request["mode"] !== "fragment") throw new Error(`${label}.mode`);
  return { mode: "fragment", meter: checkedMeter(request["meter"], `${label}.meter`) };
}

function diagnosticProjection(result: Readonly<{ ok: boolean; diagnostics?: readonly Readonly<{
  code: string;
  range: Readonly<{ start: number; end: number }>;
}>[] }>): readonly unknown[] {
  return result.ok
    ? []
    : (result.diagnostics ?? []).map(({ code, range }) => ({ code, range }));
}

function exactFormatterRefusal(
  draft: ChartTextDraft,
  expected: JsonRecord,
  label: string,
): ReturnType<typeof formatChartTextWithEvidence> {
  const result = formatChartText(draft, "ascii");
  equal(result.ok, false, `${label}.ok`);
  equal(Object.keys(result), ["ok", "diagnostics"], `${label}.result-shape`);
  equal(
    Object.hasOwn(result, "canonicalText"),
    false,
    `${label}.no-canonical-text`,
  );
  if (result.ok) throw new Error(`${label} unexpectedly formatted`);
  equal(result.diagnostics.length, 1, `${label}.diagnostic-count`);
  const diagnostic = result.diagnostics[0];
  equal(
    Object.keys(diagnostic),
    ["code", "range", "message"],
    `${label}.diagnostic-shape`,
  );
  truthy(diagnostic.message.length > 0, `${label}.diagnostic-message`);
  equal(
    { code: diagnostic.code, range: diagnostic.range },
    { code: expected["code"], range: expected["range"] },
    `${label}.diagnostic`,
  );

  const observed = formatChartTextWithEvidence(draft, "ascii");
  equal(observed.result, result, `${label}.public-private-result`);
  return observed;
}

function formatterZeroCounterNames(): readonly string[] {
  const contract = record(t0SyntaxContractFixtureValue, "T0 syntax contract fixture");
  const workEvidence = record(contract["workEvidence"], "T0 syntax work evidence");
  const operationSemantics = record(
    workEvidence["operationSemantics"],
    "T0 syntax operation semantics",
  );
  const chartFormatter = record(
    operationSemantics["formatChartText"],
    "T0 chart formatter evidence semantics",
  );
  return array(chartFormatter["zeroCounters"], "T0 chart formatter zero counters")
    .map((value, index) => string(value, `T0 chart formatter zero counter ${String(index)}`));
}

function verifyFormatterZeroCounters(
  evidenceValue: ReturnType<typeof formatChartTextWithEvidence>["evidence"],
  label: string,
): void {
  const evidence = record(evidenceValue, label);
  for (const counter of formatterZeroCounterNames()) {
    equal(evidence[counter], 0, `${label}.${counter}`);
  }
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function formatterPayload(
  subcaseId: string,
  fault: string | null,
  mutationProjection: JsonRecord | null,
  draft: ChartTextDraft,
  observed: ReturnType<typeof formatChartTextWithEvidence>,
): JsonRecord {
  return {
    subcaseId,
    fault,
    mutationProjection,
    mutatedDraftDigest: sha256(draft),
    result: observed.result,
    evidence: observed.evidence,
  };
}

function semanticChord(chord: ChordSpec): unknown {
  return Object.fromEntries(
    Object.entries(chord).filter(([key]) => key !== "sourceText"),
  );
}

function chord(sourceText: string): ChordSpec {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) throw new Error(`invalid fixture chord ${sourceText}`);
  return parsed.chord;
}

function fixtureCollections(
  fixtureValue: unknown,
  keys: readonly string[],
): readonly JsonRecord[] {
  const fixture = record(fixtureValue, "fixture");
  return keys.flatMap((key) =>
    array(fixture[key], `fixture.${key}`).map((value, index) =>
      record(value, `${key}[${String(index)}]`)
    )
  );
}

const symbolCases = fixtureCollections(symbolFixtureValue, [
  "canonicalCases",
  "aliasCases",
  "failureCases",
  "formatFailureCases",
  "boundaryCases",
]);
const chartCases = fixtureCollections(chartFixtureValue, [
  "successCases",
  "failureCases",
  "boundaryCases",
]);

function fixtureCase(cases: readonly JsonRecord[], id: string): JsonRecord {
  const found = cases.find((candidate) => candidate["id"] === id);
  if (found === undefined) throw new Error(`missing fixture case ${id}`);
  return found;
}

function expectSubset(actual: unknown, expected: unknown, label: string): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) throw new Error(`${label} actual is not an array`);
    equal(actual.length, expected.length, `${label}.length`);
    for (let index = 0; index < expected.length; index += 1) {
      expectSubset(actual[index], expected[index], `${label}[${String(index)}]`);
    }
    return;
  }
  if (typeof expected === "object" && expected !== null) {
    const actualRecord = record(actual, `${label} actual`);
    for (const [key, value] of Object.entries(expected)) {
      expectSubset(actualRecord[key], value, `${label}.${key}`);
    }
    return;
  }
  equal(actual, expected, label);
}

function materializeSymbolBoundary(fixtureCaseValue: JsonRecord): string {
  const recipe = record(fixtureCaseValue["materializationRecipe"], "symbol boundary recipe");
  if (typeof recipe["literalSource"] === "string") return recipe["literalSource"];
  const prefix = string(recipe["prefix"] ?? "C", "symbol boundary prefix");
  const append = string(recipe["append"] ?? recipe["scalar"], "symbol boundary scalar");
  return `${prefix}${append.repeat(number(recipe["appendCount"], "symbol append count"))}`;
}

function verifySymbolCase(id: string): Readonly<{ executions: number; payload: unknown }> {
  const fixtureCaseValue = fixtureCase(symbolCases, id);
  const expected = record(fixtureCaseValue["expected"], `${id}.expected`);
  if (id.startsWith("T0-SYM-FMT-ERR-")) {
    const result = formatChordSymbol(
      fixtureCaseValue["inputChord"] as ChordSpec,
      fixtureStyle(fixtureCaseValue["style"]),
    );
    equal(result.ok, false, `${id}: formatter refusal`);
    equal(diagnosticProjection(result), expected["diagnostics"], `${id}: diagnostics`);
    return { executions: 1, payload: result };
  }
  if (id.startsWith("T0-SYM-LIMIT-")) {
    const sourceText = materializeSymbolBoundary(fixtureCaseValue);
    const observed = parseChordSymbolWithEvidence(sourceText, "ascii");
    equal(observed.result.ok, false, `${id}: limit refusal`);
    if (!observed.result.ok) {
      equal(
        diagnosticProjection(observed.result),
        [{ code: expected["code"], range: expected["range"] }],
        `${id}: limit diagnostic`,
      );
    }
    expectSubset(observed.evidence, expected["expectedEvidence"], `${id}: evidence`);
    return { executions: 1, payload: observed };
  }
  if (id.startsWith("T0-SYM-ERR-")) {
    const inputs = typeof fixtureCaseValue["input"] === "string"
      ? [{ source: fixtureCaseValue["input"] }]
      : fixtureCaseValue["rows"] !== undefined
        ? array(fixtureCaseValue["rows"], `${id}.rows`).map((value, index) =>
          record(value, `${id}.row ${String(index)}`)
        )
        : array(fixtureCaseValue["inputs"], `${id}.inputs`).map((value, index) =>
          typeof value === "string"
            ? { source: value }
            : record(value, `${id}.input ${String(index)}`)
        );
    const payload: unknown[] = [];
    for (const input of inputs) {
      const result = parseChordSymbol(
        string(input["source"], `${id}.source`),
        fixtureStyle(fixtureCaseValue["style"]),
      );
      equal(result.ok, false, `${id}: refusal`);
      if (!result.ok) {
        const expectedDiagnostics = input["diagnostics"] ?? expected["diagnostics"];
        if (expectedDiagnostics !== undefined) {
          equal(diagnosticProjection(result), expectedDiagnostics, `${id}: diagnostics`);
        } else {
          equal(
            diagnosticProjection(result),
            [{
              code: input["code"] ?? expected["code"],
              range: input["range"],
            }],
            `${id}: code/range`,
          );
        }
        equal(
          result.didYouMean,
          input["didYouMean"] ?? expected["didYouMean"] ?? [],
          `${id}: suggestions`,
        );
      }
      payload.push(result);
    }
    for (const nearMissValue of array(
      fixtureCaseValue["nearMissesAccepted"] ?? [],
      `${id}.nearMissesAccepted`,
    )) {
      const nearMiss = string(nearMissValue, `${id}.nearMiss`);
      const result = parseChordSymbol(nearMiss, fixtureStyle(fixtureCaseValue["style"]));
      truthy(result.ok, `${id}: near miss ${nearMiss}`);
      payload.push(result);
    }
    return { executions: payload.length, payload };
  }
  if (id.startsWith("T0-ALIAS-")) {
    const inputs = typeof fixtureCaseValue["input"] === "string"
      ? [fixtureCaseValue["input"]]
      : array(fixtureCaseValue["inputs"], `${id}.inputs`);
    const styles = fixtureCaseValue["styles"] === undefined
      ? [[fixtureStyle(fixtureCaseValue["style"]), expected["canonicalText"]] as const]
      : Object.entries(record(fixtureCaseValue["styles"], `${id}.styles`));
    const payload: unknown[] = [];
    for (const inputValue of inputs) {
      for (const [styleValue, canonicalValue] of styles) {
        const sourceText = string(inputValue, `${id}.input`);
        const result = parseChordSymbol(sourceText, fixtureStyle(styleValue));
        truthy(result.ok, `${id}: alias parse`);
        if (!result.ok) continue;
        equal(result.canonicalText, canonicalValue, `${id}: alias canonical`);
        if (typeof expected["sameAstAs"] === "string") {
          const target = fixtureCase(symbolCases, expected["sameAstAs"]);
          const targetResult = parseChordSymbol(
            string(target["input"], `${id}.target`),
            fixtureStyle(target["style"]),
          );
          if (!targetResult.ok) throw new Error(`${id}: target parse failed`);
          equal(semanticChord(result.chord), semanticChord(targetResult.chord), `${id}: alias AST`);
        }
        if (expected["chordFields"] !== undefined) {
          expectSubset(result.chord, expected["chordFields"], `${id}: chord fields`);
        }
        payload.push(result);
      }
    }
    return { executions: payload.length, payload };
  }

  const result = parseChordSymbol(
    string(fixtureCaseValue["input"], `${id}.input`),
    fixtureStyle(fixtureCaseValue["style"]),
  );
  truthy(result.ok, `${id}: canonical parse`);
  if (!result.ok) throw new Error(`${id}: canonical parse failed`);
  equal(result.canonicalText, expected["canonicalText"], `${id}: canonical text`);
  const defaults = record(
    record(symbolFixtureValue, "symbol fixture")["expectedChordDefaults"],
    "symbol defaults",
  );
  equal(
    result.chord,
    {
      kind: "parsed",
      sourceText: fixtureCaseValue["input"],
      ...defaults,
      ...record(expected["chordFields"], `${id}.chordFields`),
    },
    `${id}: exact chord`,
  );
  return { executions: 1, payload: result };
}

function flattenEvents(
  draft: ChartTextDraft,
): readonly ChartDraftEvent[] {
  return draft.sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.events)
  );
}

function eventObservation(event: ChartDraftEvent): JsonRecord {
  const formatted = formatChordSymbol(event.chord, "ascii");
  const symbol = formatted.ok ? formatted.canonicalText : event.chord.sourceText;
  return {
    ordinal: event.ordinal,
    origin: event.origin,
    repeatedFromOrdinal: event.repeatedFromOrdinal,
    symbol,
    duration: event.duration,
    durationText: `${String(event.duration.numerator)}/${String(event.duration.denominator)}`,
    annotation: event.annotation,
    range: event.range,
    symbolRange: event.symbolRange,
    durationRange: event.durationRange,
    annotationRange: event.annotationRange,
  };
}

function verifyExpectedEvents(
  events: readonly ChartDraftEvent[],
  expectedValue: unknown,
  label: string,
): void {
  const expectedEvents = array(expectedValue, label);
  equal(events.length, expectedEvents.length, `${label}.length`);
  for (const [index, expectedEventValue] of expectedEvents.entries()) {
    const expectedEvent = record(expectedEventValue, `${label}[${String(index)}]`);
    const actual = eventObservation(events[index] as ChartDraftEvent);
    for (const [key, value] of Object.entries(expectedEvent)) {
      if (key === "chordCaseId") {
        equal(
          events[index]?.chord,
          expectedChordForCase(
            string(value, `${label}[${String(index)}].chordCaseId`),
            `${label}[${String(index)}].chordCaseId`,
          ),
          `${label}[${String(index)}].chordCaseId`,
        );
      } else if (key === "duration" && typeof value === "string") {
        equal(actual["durationText"], value, `${label}[${String(index)}].durationText`);
      } else {
        expectSubset(actual[key], value, `${label}[${String(index)}].${key}`);
      }
    }
  }
}

function expectedChordForCase(caseId: string, label: string): unknown {
  const fixtureCaseValue = fixtureCase(symbolCases, caseId);
  const sourceText = string(fixtureCaseValue["input"], `${label}.input`);
  const expected = record(fixtureCaseValue["expected"], `${label}.expected`);
  if (expected["ok"] !== true) throw new Error(`${label} must name an accepted symbol case`);
  const defaults = record(
    record(symbolFixtureValue, "symbol fixture")["expectedChordDefaults"],
    "symbol defaults",
  );
  return {
    kind: "parsed",
    sourceText,
    ...defaults,
    ...record(expected["chordFields"], `${label}.chordFields`),
  };
}

function verifyChartSuccess(
  id: string,
  result: Extract<ReturnType<typeof parseChartText>, { ok: true }>,
  expected: JsonRecord,
  row: JsonRecord | null,
): void {
  const canonical = row?.["canonicalText"] ?? expected["canonicalText"];
  if (canonical !== undefined) equal(result.canonicalText, canonical, `${id}: canonical`);
  const sections = result.draft.sections;
  const measures = sections.flatMap((section) => section.measures);
  const events = flattenEvents(result.draft);
  if (expected["headers"] !== undefined) {
    expectSubset(result.draft.headers, expected["headers"], `${id}: headers`);
  }
  if (expected["key"] !== undefined) equal(result.draft.headers.key, expected["key"], `${id}: key`);
  if (expected["title"] !== undefined) equal(result.draft.headers.title, expected["title"], `${id}: title`);
  if (expected["description"] !== undefined) {
    equal(result.draft.headers.description, expected["description"], `${id}: description`);
  }
  if (expected["warnings"] !== undefined) {
    equal(
      result.warnings.map(({ code, range }) => ({ code, range })),
      expected["warnings"],
      `${id}: warnings`,
    );
  }
  if (expected["sectionName"] !== undefined) equal(sections[0]?.name, expected["sectionName"], `${id}: section name`);
  if (expected["sectionKind"] !== undefined) equal(sections[0]?.kind, expected["sectionKind"], `${id}: section kind`);
  if (expected["sectionAnnotation"] !== undefined) {
    equal(sections[0]?.annotation, expected["sectionAnnotation"], `${id}: section annotation`);
  }
  if (expected["eventAnnotation"] !== undefined) {
    equal(events[0]?.annotation, expected["eventAnnotation"], `${id}: event annotation`);
  }
  if (expected["eventRoot"] !== undefined) equal(events[0]?.chord.root, expected["eventRoot"], `${id}: event root`);
  if (expected["sectionRange"] !== undefined) equal(sections[0]?.range, expected["sectionRange"], `${id}: section range`);
  if (expected["measureRange"] !== undefined) equal(measures[0]?.range, expected["measureRange"], `${id}: measure range`);
  if (expected["eventRange"] !== undefined) equal(events[0]?.range, expected["eventRange"], `${id}: event range`);
  if (expected["symbolRange"] !== undefined) equal(events[0]?.symbolRange, expected["symbolRange"], `${id}: symbol range`);
  if (expected["durationRange"] !== undefined) equal(events[0]?.durationRange, expected["durationRange"], `${id}: duration range`);
  if (expected["measureRanges"] !== undefined) {
    equal(measures.map(({ range }) => range), expected["measureRanges"], `${id}: measure ranges`);
  }
  if (expected["measureEventCounts"] !== undefined) {
    equal(measures.map(({ events: items }) => items.length), expected["measureEventCounts"], `${id}: measure event counts`);
  }
  if (expected["eventsObserved"] !== undefined) {
    equal(events.length, expected["eventsObserved"], `${id}: events observed`);
  }
  if (expected["eventRanges"] !== undefined) {
    equal(
      events.map(({ range, symbolRange, durationRange }) => ({ range, symbolRange, durationRange })),
      expected["eventRanges"],
      `${id}: event ranges`,
    );
  }
  if (expected["eventDurations"] !== undefined) {
    equal(events.map(({ duration: value }) => value), expected["eventDurations"], `${id}: durations`);
  }
  if (row?.["expectedDuration"] !== undefined) {
    equal(events[0]?.duration, row["expectedDuration"], `${id}: row duration`);
  }
  if (row?.["expectedDurations"] !== undefined) {
    equal(events.map(({ duration: value }) => value), row["expectedDurations"], `${id}: row durations`);
  }
  if (row?.["durationRange"] !== undefined) {
    equal(events[0]?.durationRange, row["durationRange"], `${id}: row duration range`);
  }
  if (expected["events"] !== undefined) verifyExpectedEvents(events, expected["events"], `${id}: events`);
  if (expected["event"] !== undefined) {
    const eventExpected = record(expected["event"], `${id}.event`);
    for (const [key, value] of Object.entries(eventExpected)) {
      if (key === "explicitEmptyAnnotationPresentOnlyInSourceText") continue;
      expectSubset(eventObservation(events[0] as ChartDraftEvent)[key], value, `${id}: event.${key}`);
    }
  }
  if (expected["measure"] !== undefined) {
    const measureExpected = record(expected["measure"], `${id}.measure`);
    for (const [key, value] of Object.entries(measureExpected)) {
      expectSubset(record(measures[0], `${id}.measure actual`)[key], value, `${id}: measure.${key}`);
    }
  }
  if (expected["section"] !== undefined) {
    const sectionExpected = record(expected["section"], `${id}.section`);
    for (const [key, value] of Object.entries(sectionExpected)) {
      if (key === "explicitEmptyAnnotationPresentOnlyInSourceText") continue;
      expectSubset(record(sections[0], `${id}.section actual`)[key], value, `${id}: section.${key}`);
    }
  }
  if (expected["sectionSummaries"] !== undefined) {
    const actual = sections.map((section) => ({
      name: section.name,
      annotation: section.annotation,
      measureEventCounts: section.measures.map(({ events: items }) => items.length),
    }));
    equal(actual, expected["sectionSummaries"], `${id}: section summaries`);
  }
  if (expected["eventSummaries"] !== undefined) {
    const actual = events.map((event) => {
      const observation = eventObservation(event);
      return {
        symbol: observation["symbol"],
        duration: observation["durationText"],
        annotation: event.annotation,
        origin: event.origin,
        ...(event.repeatedFromOrdinal === null
          ? {}
          : { repeatedFromOrdinal: event.repeatedFromOrdinal }),
      };
    });
    equal(actual, expected["eventSummaries"], `${id}: event summaries`);
  }
  if (expected["rangeProjection"] !== undefined) {
    const actual = {
      sections: sections.map(({ ordinal, range }) => ({ ordinal, range })),
      measures: sections.flatMap((section) => section.measures.map((measure) => ({
        sectionOrdinal: section.ordinal,
        measureOrdinal: measure.ordinal,
        range: measure.range,
      }))),
      events: events.map(({ ordinal, range, symbolRange, durationRange, annotationRange }) => ({
        ordinal,
        range,
        symbolRange,
        durationRange,
        annotationRange,
      })),
    };
    equal(actual, expected["rangeProjection"], `${id}: range projection`);
  }
}

function verifyChartFailure(
  id: string,
  observed: ReturnType<typeof parseChartTextWithEvidence>,
  expected: JsonRecord,
  row: JsonRecord | null,
): void {
  equal(observed.result.ok, false, `${id}: refusal`);
  if (observed.result.ok) return;
  const expectedDiagnostics = row?.["diagnostics"] ?? expected["diagnostics"];
  if (expectedDiagnostics !== undefined) {
    equal(diagnosticProjection(observed.result), expectedDiagnostics, `${id}: diagnostics`);
  } else if (typeof expected["code"] === "string") {
    const expectedRange = row?.["range"] ?? expected["range"];
    equal(
      diagnosticProjection(observed.result),
      [{ code: expected["code"], range: expectedRange }],
      `${id}: code/range`,
    );
  }
  const expectedCount = row?.["insertableCount"] ?? expected["insertableCount"];
  if (typeof expectedCount === "number") {
    equal(observed.result.insertableChords.length, expectedCount, `${id}: insertable count`);
  }
  const expectedRanges = row?.["insertableSymbolRanges"];
  if (expectedRanges !== undefined) {
    equal(
      observed.result.insertableChords.map(({ symbolRange }) => symbolRange),
      expectedRanges,
      `${id}: insertable ranges`,
    );
  }
  const delegatedRanges = row?.["delegatedSymbolRanges"];
  if (delegatedRanges !== undefined) {
    equal(
      observed.delegatedSymbols.map(({ symbolRange }) => symbolRange),
      delegatedRanges,
      `${id}: delegated ranges`,
    );
  }
  if (row?.["outerEvidenceProjection"] !== undefined) {
    expectSubset(observed.evidence, row["outerEvidenceProjection"], `${id}: outer evidence`);
  }
  if (row?.["delegatedEvidenceProjections"] !== undefined) {
    const expectedDelegations = array(
      row["delegatedEvidenceProjections"],
      `${id}.delegatedEvidenceProjections`,
    );
    equal(
      observed.delegatedSymbols.length,
      expectedDelegations.length,
      `${id}: delegated evidence cardinality`,
    );
    for (const [index, expectedValue] of expectedDelegations.entries()) {
      const expectedDelegation = record(expectedValue, `${id}.delegation ${String(index)}`);
      const actual = observed.delegatedSymbols[index];
      if (actual === undefined) throw new Error(`${id}: missing delegated evidence`);
      equal(
        actual.delegationOrdinal,
        expectedDelegation["delegationOrdinal"],
        `${id}: delegation ordinal ${String(index)}`,
      );
      equal(
        actual.symbolRange,
        expectedDelegation["symbolRange"],
        `${id}: delegation range ${String(index)}`,
      );
      equal(
        actual.evidence,
        expectedDelegation["evidence"],
        `${id}: delegation evidence ${String(index)}`,
      );
    }
  }
  if (row?.["insertableChords"] !== undefined) {
    const expectedInsertables = array(row["insertableChords"], `${id}.insertableChords`);
    equal(observed.result.insertableChords.length, expectedInsertables.length, `${id}: row insertables`);
    for (const [index, expectedValue] of expectedInsertables.entries()) {
      const expectedInsertable = record(expectedValue, `${id}.insertable ${String(index)}`);
      const actual = observed.result.insertableChords[index];
      if (actual === undefined) throw new Error(`${id}: missing insertable`);
      for (const [key, value] of Object.entries(expectedInsertable)) {
        if (key === "symbol" || key === "chordCaseId") continue;
        expectSubset(record(actual, `${id}.insertable actual`)[key], value, `${id}: insertable.${key}`);
      }
      if (typeof expectedInsertable["chordCaseId"] === "string") {
        equal(
          actual.chord,
          expectedChordForCase(
            expectedInsertable["chordCaseId"],
            `${id}.insertable ${String(index)} chord case`,
          ),
          `${id}: insertable chord semantics ${String(index)}`,
        );
      }
    }
  }
  if (row?.["eventRange"] !== undefined) {
    equal(
      observed.result.insertableChords[0]?.range,
      row["eventRange"],
      `${id}: failed event range`,
    );
  }
  if (row?.["trailingTriviaRangeRetainedByDiagnostic"] !== undefined) {
    const trailingRange = record(
      row["trailingTriviaRangeRetainedByDiagnostic"],
      `${id}.trailingTriviaRangeRetainedByDiagnostic`,
    );
    const sourceText = string(row["source"], `${id}.source`);
    equal(
      trailingRange,
      { start: sourceText.search(/[\t ]+$/u), end: sourceText.length },
      `${id}: trailing trivia source range`,
    );
    equal(
      sourceText.slice(
        number(trailingRange["start"], `${id}.trailing start`),
        number(trailingRange["end"], `${id}.trailing end`),
      ),
      "   ",
      `${id}: trailing trivia source slice`,
    );
    equal(
      observed.result.diagnostics[0].range.end,
      trailingRange["end"],
      `${id}: diagnostic retains trailing trivia`,
    );
  }
  if (row?.["commentRangeRetainedByDiagnostic"] !== undefined) {
    const commentRange = record(
      row["commentRangeRetainedByDiagnostic"],
      `${id}.commentRangeRetainedByDiagnostic`,
    );
    const sourceText = string(row["source"], `${id}.source`);
    equal(
      commentRange,
      { start: sourceText.indexOf(";"), end: sourceText.length },
      `${id}: comment source range`,
    );
    equal(
      sourceText.slice(
        number(commentRange["start"], `${id}.comment start`),
        number(commentRange["end"], `${id}.comment end`),
      ),
      ";note",
      `${id}: comment source slice`,
    );
    equal(
      observed.result.diagnostics[0].range.end,
      commentRange["end"],
      `${id}: diagnostic retains comment`,
    );
  }
  if (row?.["eventsObserved"] !== undefined) {
    equal(
      observed.evidence.slotsObserved,
      row["eventsObserved"],
      `${id}: failed events observed`,
    );
  }
  for (const insertable of observed.result.insertableChords) {
    equal(insertable.layoutContextPreserved, false, `${id}: insertable loses layout`);
  }
}

function chartRows(fixtureCaseValue: JsonRecord): readonly JsonRecord[] {
  if (typeof fixtureCaseValue["input"] === "string") {
    return [{ source: fixtureCaseValue["input"] }];
  }
  return array(fixtureCaseValue["rows"], "chart rows").map((value, index) =>
    record(value, `chart row ${String(index)}`)
  );
}

function verifyRegularChartCase(id: string): Readonly<{ executions: number; payload: unknown }> {
  const fixtureCaseValue = fixtureCase(chartCases, id);
  const expected = record(fixtureCaseValue["expected"], `${id}.expected`);
  const request = chartRequest(fixtureCaseValue["request"], `${id}.request`);
  const style = fixtureStyle(fixtureCaseValue["style"]);
  const payload: unknown[] = [];
  const rows = chartRows(fixtureCaseValue);
  if (id === "T0-CHART-ERR-032") {
    const expectedIds = [
      "trailing-horizontal-space",
      "trailing-comment-to-eof",
      "slotless-unclosed-near-miss",
      "same-space-prefix-closed-control",
      "slotless-closed-control",
      "post-closure-trivia-excluded-control",
    ];
    equal(rows.length, expectedIds.length, `${id}: row cardinality`);
    equal(
      rows.map((row, index) => string(row["id"], `${id}.row ${String(index)}.id`)),
      expectedIds,
      `${id}: ordered row IDs`,
    );
  }
  for (const row of rows) {
    const sourceText = string(row["source"], `${id}.source`);
    if (id === "T0-CHART-ERR-032") {
      equal(
        sourceText.length,
        number(row["sourceUtf16Length"], `${id}.sourceUtf16Length`),
        `${id}.${String(row["id"])}: source UTF-16 length`,
      );
    }
    const observed = parseChartTextWithEvidence(sourceText, request, style);
    const rowExpected = typeof row["expected"] === "object"
      ? record(row["expected"], `${id}.row expected`)
      : expected;
    const expectedOk = rowExpected["ok"];
    if (expectedOk === true) {
      truthy(observed.result.ok, `${id}: success`);
      if (observed.result.ok) verifyChartSuccess(id, observed.result, rowExpected, row);
    } else {
      verifyChartFailure(id, observed, expected, row);
    }
    payload.push(observed);
  }
  return { executions: payload.length, payload };
}

function materializeChartBoundaryRows(
  id: string,
  fixtureCaseValue: JsonRecord,
): readonly Readonly<{
  sourceText: string;
  request: ChartTextParseRequest;
  expected: JsonRecord;
}>[] {
  const request = fixtureCaseValue["request"] === undefined
    ? null
    : chartRequest(fixtureCaseValue["request"], `${id}.request`);
  if (id === "T0-CHART-LIMIT-012") {
    return array(fixtureCaseValue["rows"], `${id}.rows`).map((value, index) => {
      const row = record(value, `${id}.row ${String(index)}`);
      const recipe = row["materializationRecipe"] === undefined
        ? null
        : record(row["materializationRecipe"], `${id}.recipe ${String(index)}`);
      const sourceText = typeof row["source"] === "string"
        ? row["source"]
        : recipe?.["expression"] !== undefined
          ? (() => {
            const digit = string(recipe["digit"], `${id}.digit`);
            const count = number(recipe["digitCount"], `${id}.digitCount`);
            const expression = string(recipe["expression"], `${id}.expression`);
            if (expression.startsWith('"| C:1/"')) return `| C:1/${digit.repeat(count)} |`;
            if (expression.includes('"/1 |"')) return `| C:${digit.repeat(count)}/1 |`;
            return `| C:${digit.repeat(count)} |`;
          })()
          : "";
      if (request === null) throw new Error(`${id}: request missing`);
      return { sourceText, request, expected: record(row["expected"], `${id}.expected row`) };
    });
  }
  if (id === "T0-CHART-LIMIT-013") {
    return array(fixtureCaseValue["rows"], `${id}.rows`).map((value, index) => {
      const row = record(value, `${id}.row ${String(index)}`);
      const recipe = record(row["materializationRecipe"], `${id}.recipe`);
      const scalar = string(recipe["scalar"], `${id}.scalar`);
      const count = number(recipe["codePoints"], `${id}.codePoints`);
      const sourceText = row["field"] === "title"
        ? `@title ${JSON.stringify(scalar.repeat(count))}\n@meter 4/4\n[A]\n| C:4 |`
        : `| C:4 ${JSON.stringify(scalar.repeat(count))} |`;
      return {
        sourceText,
        request: chartRequest(row["request"], `${id}.row request`),
        expected: record(row["expected"], `${id}.expected row`),
      };
    });
  }
  const recipe = record(fixtureCaseValue["materializationRecipe"], `${id}.recipe`);
  if (id === "T0-CHART-LIMIT-016") {
    const prefix = `@meter 4/4\n${Array.from({ length: 64 }, (_, index) => `[S${String(index)}]\n| |\n`).join("")}`;
    return array(recipe["rows"], `${id}.rows`).map((value, index) => {
      const row = record(value, `${id}.row ${String(index)}`);
      if (request === null) throw new Error(`${id}: request missing`);
      return {
        sourceText: `${prefix}${string(row["suffix"], `${id}.suffix`)}`,
        request,
        expected: record(row["diagnostic"], `${id}.diagnostic`),
      };
    });
  }
  if (id === "T0-CHART-LIMIT-017") {
    const prefix = `${";\n".repeat(65_534)}| C `;
    return array(recipe["rows"], `${id}.rows`).map((value, index) => {
      const row = record(value, `${id}.row ${String(index)}`);
      if (request === null) throw new Error(`${id}: request missing`);
      return {
        sourceText: `${prefix}${string(row["suffix"], `${id}.suffix`)}`,
        request,
        expected: record(row["diagnostic"], `${id}.diagnostic`),
      };
    });
  }
  if (id === "T0-CHART-LIMIT-018") {
    const prefix = `C ${"/ ".repeat(8_191)}`;
    return array(recipe["rows"], `${id}.rows`).map((value, index) => {
      const row = record(value, `${id}.row ${String(index)}`);
      if (request === null) throw new Error(`${id}: request missing`);
      return {
        sourceText: `${prefix}${string(row["suffix"], `${id}.suffix`)}`,
        request,
        expected: record(row["diagnostic"], `${id}.diagnostic`),
      };
    });
  }
  if (id === "T0-CHART-LIMIT-021") {
    const prefix = ";\n".repeat(65_535);
    return array(recipe["rows"], `${id}.rows`).map((value, index) => {
      const row = record(value, `${id}.row ${String(index)}`);
      if (request === null) throw new Error(`${id}: request missing`);
      return {
        sourceText: `${prefix}${string(row["suffix"], `${id}.suffix`)}`,
        request,
        expected: record(row["expected"], `${id}.expected row`),
      };
    });
  }
  if (request === null) throw new Error(`${id}: request missing`);
  let sourceText: string;
  switch (id) {
    case "T0-CHART-LIMIT-001":
      sourceText = `${string(recipe["asciiPrefix"], `${id}.prefix`)}${string(recipe["appendScalar"], `${id}.scalar`).repeat(number(recipe["appendCount"], `${id}.count`))}`;
      break;
    case "T0-CHART-LIMIT-002":
      sourceText = `${";\n".repeat(number(recipe["commentCount"], `${id}.comments`))}${string(recipe["validFragmentSuffix"], `${id}.suffix`)}`;
      break;
    case "T0-CHART-LIMIT-003":
      sourceText = `@meter 4/4\n${Array.from({ length: 65 }, (_, index) => `[S${String(index).padStart(2, "0")}]\n| |\n`).join("")}`;
      break;
    case "T0-CHART-LIMIT-004":
      sourceText = `[A]\n${"| |\n".repeat(1_025)}`;
      break;
    case "T0-CHART-LIMIT-005": {
      const full = Array.from({ length: 8 }, (_, sectionOrdinal) =>
        `[S${String(sectionOrdinal).padStart(3, "0")}]\n${"| C:4 |\n".repeat(1_024)}`
      ).join("");
      sourceText = `@meter 4/4\n${full}[S008]\n| C:4 |\n`;
      break;
    }
    case "T0-CHART-LIMIT-006":
      sourceText = `@title ${JSON.stringify("x".repeat(257))}\n@meter 4/4\n[A]\n| C:4 |`;
      break;
    case "T0-CHART-LIMIT-007":
      sourceText = `| C:4 ${JSON.stringify("雪".repeat(2_001))} |`;
      break;
    case "T0-CHART-LIMIT-010":
      sourceText = `@description ${JSON.stringify("x".repeat(2_001))}\n@meter 4/4\n[A]\n| C:4 |`;
      break;
    case "T0-CHART-LIMIT-011":
      sourceText = `[${"x".repeat(257)}]\n| C:4 |`;
      break;
    case "T0-CHART-LIMIT-014":
      sourceText = `${string(recipe["asciiPrefix"], `${id}.prefix`)}${"x".repeat(number(recipe["asciiPaddingCount"], `${id}.padding`))}${string(recipe["crossingScalar"], `${id}.scalar`)}`;
      break;
    case "T0-CHART-LIMIT-015":
      sourceText = `@tempo 19\n@meter 4/4\n${Array.from({ length: 65 }, (_, index) => `[S${String(index).padStart(2, "0")}]\n| |\n`).join("")}`;
      break;
    default:
      throw new Error(`unmaterialized chart boundary ${id}`);
  }
  return [{
    sourceText,
    request,
    expected: record(fixtureCaseValue["expected"], `${id}.expected`),
  }];
}

function verifyChartBoundary(id: string): Readonly<{ executions: number; payload: unknown }> {
  const fixtureCaseValue = fixtureCase(chartCases, id);
  const payload: unknown[] = [];
  for (const row of materializeChartBoundaryRows(id, fixtureCaseValue)) {
    const observed = parseChartTextWithEvidence(row.sourceText, row.request, "ascii");
    equal(observed.result.ok, false, `${id}: boundary refusal`);
    if (!observed.result.ok) {
      equal(
        diagnosticProjection(observed.result),
        [{ code: row.expected["code"], range: row.expected["range"] }],
        `${id}: boundary diagnostic`,
      );
    }
    if (row.expected["expectedEvidence"] !== undefined) {
      expectSubset(observed.evidence, row.expected["expectedEvidence"], `${id}: boundary evidence`);
    }
    payload.push(observed);
  }
  return { executions: payload.length, payload };
}

function baseDraftFromCase(id: string): ChartTextDraft {
  const fixtureCaseValue = fixtureCase(chartCases, id);
  const parsed = parseChartText(
    string(fixtureCaseValue["input"], `${id}.input`),
    chartRequest(fixtureCaseValue["request"], `${id}.request`),
    fixtureStyle(fixtureCaseValue["style"]),
  );
  if (!parsed.ok) throw new Error(`${id}: base draft parse failed`);
  return parsed.draft;
}

function replaceEvent(
  draft: ChartTextDraft,
  eventOrdinal: number,
  replace: (event: ChartDraftEvent) => ChartDraftEvent,
): ChartTextDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) => ({
      ...section,
      measures: section.measures.map((measure) => ({
        ...measure,
        events: measure.events.map((event) =>
          event.ordinal === eventOrdinal ? replace(event) : event
        ),
      })),
    })),
  };
}

function sectionLimitDraft(): ChartTextDraft {
  const prefix = "@meter 4/4\n";
  const sources = Array.from({ length: 65 }, (_, ordinal) =>
    `[S${String(ordinal).padStart(3, "0")}]\n| |\n`
  );
  let cursor = prefix.length;
  const sections: ChartDraftSection[] = sources.map((source, ordinal) => {
    const start = cursor;
    cursor += source.length;
    const measureStart = start + 7;
    return {
      ordinal,
      kind: "named",
      name: `S${String(ordinal).padStart(3, "0")}`,
      annotation: "",
      range: { start, end: measureStart + 3 },
      measures: [{
        ordinal: 0,
        kind: "barred",
        range: { start: measureStart, end: measureStart + 3 },
        events: [],
      }],
    };
  });
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "document",
    sourceText: `${prefix}${sources.join("")}`,
    headers: {
      title: null,
      description: null,
      meter: checkedMeter({ beatsPerBar: 4, beatUnit: 4 }, "section limit meter"),
      tempoBpm: null,
      key: null,
    },
    sections,
  };
}

function eventLimitDraft(): ChartTextDraft {
  const prefix = "@meter 4/4\n";
  const eventChord = chord("C");
  const eventDuration = duration(4);
  const sectionSources: string[] = [];
  const sections: ChartDraftSection[] = [];
  let cursor = prefix.length;
  let eventOrdinal = 0;
  for (let sectionOrdinal = 0; sectionOrdinal < 9; sectionOrdinal += 1) {
    const measureCount = sectionOrdinal < 8 ? 1_024 : 1;
    const marker = `[S${String(sectionOrdinal).padStart(3, "0")}]\n`;
    const sectionStart = cursor;
    cursor += marker.length;
    const measures: ChartDraftMeasure[] = [];
    let source = marker;
    for (let measureOrdinal = 0; measureOrdinal < measureCount; measureOrdinal += 1) {
      const measureStart = cursor;
      const eventStart = measureStart + 2;
      const event: ChartDraftEvent = {
        ordinal: eventOrdinal,
        origin: "literal",
        repeatedFromOrdinal: null,
        chord: eventChord,
        duration: eventDuration,
        annotation: "",
        range: { start: eventStart, end: eventStart + 3 },
        symbolRange: { start: eventStart, end: eventStart + 1 },
        durationRange: { start: eventStart + 1, end: eventStart + 3 },
        annotationRange: null,
      };
      measures.push({
        ordinal: measureOrdinal,
        kind: "barred",
        range: { start: measureStart, end: measureStart + 7 },
        events: [event],
      });
      eventOrdinal += 1;
      cursor += 8;
      source += "| C:4 |\n";
    }
    sectionSources.push(source);
    sections.push({
      ordinal: sectionOrdinal,
      kind: "named",
      name: `S${String(sectionOrdinal).padStart(3, "0")}`,
      annotation: "",
      range: { start: sectionStart, end: cursor - 1 },
      measures,
    });
  }
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "document",
    sourceText: `${prefix}${sectionSources.join("")}`,
    headers: {
      title: null,
      description: null,
      meter: checkedMeter({ beatsPerBar: 4, beatUnit: 4 }, "event limit meter"),
      tempoBpm: null,
      key: null,
    },
    sections,
  };
}

function sectionFirstExcessProjection(draft: ChartTextDraft): JsonRecord {
  const section = draft.sections[MAX_CHART_SECTIONS];
  if (section === undefined) throw new Error("section-limit draft has no first excess section");
  return {
    kind: "section",
    sectionOrdinal: section.ordinal,
    range: section.range,
  };
}

function eventFirstExcessProjection(draft: ChartTextDraft): JsonRecord {
  const section = draft.sections[8];
  const measure = section?.measures[0];
  const event = measure?.events[0];
  if (section === undefined || measure === undefined || event === undefined) {
    throw new Error("event-limit draft has no first excess event");
  }
  return {
    kind: "event",
    sectionOrdinal: section.ordinal,
    measureOrdinal: measure.ordinal,
    eventOrdinal: event.ordinal,
    range: event.range,
    symbolRange: event.symbolRange,
    durationRange: event.durationRange,
    containingMeasureRange: measure.range,
    containingSectionRange: section.range,
  };
}

function verifyFmt003SectionRecipe(row: JsonRecord, draft: ChartTextDraft, label: string): void {
  const recipe = record(row["baseDraftRecipe"], `${label}.baseDraftRecipe`);
  equal(recipe["kind"], "source-backed-draft", `${label}.recipe kind`);
  const source = record(recipe["sourceMaterialization"], `${label}.sourceMaterialization`);
  const prefix = string(source["prefix"], `${label}.prefix`);
  equal(prefix, "@meter 4/4\n", `${label}.prefix value`);
  equal(source["sectionCount"], MAX_CHART_SECTIONS + 1, `${label}.section count`);
  equal(
    source["sectionName"],
    "S plus zero-padded three-digit source ordinal 000 through 064",
    `${label}.section naming rule`,
  );
  equal(source["sectionTemplate"], "[Snnn]\n| |\n", `${label}.section template`);
  const expectedSource = `${prefix}${Array.from(
    { length: MAX_CHART_SECTIONS + 1 },
    (_, ordinal) => `[S${String(ordinal).padStart(3, "0")}]\n| |\n`,
  ).join("")}`;
  equal(draft.sourceText, expectedSource, `${label}.materialized source`);
  equal(draft.sourceText.length, source["sourceUtf16Length"], `${label}.source UTF-16 length`);

  const materialization = record(
    recipe["draftMaterialization"],
    `${label}.draftMaterialization`,
  );
  equal(draft.mode, materialization["mode"], `${label}.draft mode`);
  const headers = record(materialization["headers"], `${label}.headers`);
  equal(draft.headers.meter, headers["meter"], `${label}.meter`);
  equal(materialization["sectionOrdinals"], "0 through 64", `${label}.ordinal rule`);
  equal(
    draft.sections.map(({ ordinal }) => ordinal),
    Array.from({ length: MAX_CHART_SECTIONS + 1 }, (_, ordinal) => ordinal),
    `${label}.section ordinals`,
  );
  const eachSection = record(materialization["eachSection"], `${label}.eachSection`);
  equal(eachSection["kind"], "named", `${label}.section kind rule`);
  equal(eachSection["oneEmptyBarredMeasure"], true, `${label}.empty measure rule`);
  truthy(
    draft.sections.every((section) =>
      section.kind === "named" &&
      section.name === `S${String(section.ordinal).padStart(3, "0")}` &&
      section.measures.length === 1 &&
      section.measures[0]?.kind === "barred" &&
      section.measures[0].events.length === 0 &&
      draft.sourceText.slice(section.range.start, section.range.end) ===
        `[S${String(section.ordinal).padStart(3, "0")}]\n| |` &&
      draft.sourceText.slice(
        section.measures[0].range.start,
        section.measures[0].range.end,
      ) === "| |"
    ),
    `${label}.all section records derive from source`,
  );
  equal(
    materialization["ranges"],
    "derive literally from source using contract section 2.1.1; do not invoke production parsing",
    `${label}.range materialization rule`,
  );
  equal(sectionFirstExcessProjection(draft), row["firstExcess"], `${label}.first excess`);
}

function verifyFmt003EventRecipe(row: JsonRecord, draft: ChartTextDraft, label: string): void {
  const recipe = record(row["baseDraftRecipe"], `${label}.baseDraftRecipe`);
  equal(recipe["kind"], "source-backed-draft", `${label}.recipe kind`);
  const source = record(recipe["sourceMaterialization"], `${label}.sourceMaterialization`);
  const prefix = string(source["prefix"], `${label}.prefix`);
  equal(prefix, "@meter 4/4\n", `${label}.prefix value`);
  equal(source["fullSectionCount"], 8, `${label}.full section count`);
  equal(
    source["fullSectionName"],
    "S plus zero-padded three-digit source ordinal 000 through 007",
    `${label}.full section naming rule`,
  );
  equal(
    source["fullSectionTemplate"],
    "[Snnn]\n followed by 1024 copies of | C:4 | plus LF",
    `${label}.full section template`,
  );
  equal(source["excessSection"], "[S008]\n| C:4 |\n", `${label}.excess section source`);
  const expectedSource = `${prefix}${Array.from(
    { length: 8 },
    (_, ordinal) =>
      `[S${String(ordinal).padStart(3, "0")}]\n${"| C:4 |\n".repeat(1_024)}`,
  ).join("")}[S008]\n| C:4 |\n`;
  equal(draft.sourceText, expectedSource, `${label}.materialized source`);
  equal(draft.sourceText.length, source["sourceUtf16Length"], `${label}.source UTF-16 length`);

  const materialization = record(
    recipe["draftMaterialization"],
    `${label}.draftMaterialization`,
  );
  equal(draft.mode, materialization["mode"], `${label}.draft mode`);
  const headers = record(materialization["headers"], `${label}.headers`);
  equal(draft.headers.meter, headers["meter"], `${label}.meter`);
  const fullSections = record(materialization["fullSections"], `${label}.fullSections`);
  equal(fullSections, { count: 8, measuresPerSection: 1_024, eventsPerMeasure: 1 }, `${label}.full sections recipe`);
  equal(
    draft.sections.slice(0, 8).map((section) => ({
      measures: section.measures.length,
      eventsPerMeasure: [...new Set(section.measures.map(({ events }) => events.length))],
    })),
    Array.from({ length: 8 }, () => ({ measures: 1_024, eventsPerMeasure: [1] })),
    `${label}.full sections materialized`,
  );
  const excessSection = record(materialization["excessSection"], `${label}.excessSection`);
  equal(
    {
      sectionOrdinal: draft.sections[8]?.ordinal,
      measureOrdinal: draft.sections[8]?.measures[0]?.ordinal,
      eventOrdinal: draft.sections[8]?.measures[0]?.events[0]?.ordinal,
    },
    excessSection,
    `${label}.excess ordinals`,
  );
  const events = record(materialization["events"], `${label}.events`);
  equal(events["origin"], "literal", `${label}.event origin rule`);
  equal(events["chordCaseId"], "T0-SYM-001", `${label}.event chord case`);
  equal(events["duration"], { numerator: 4, denominator: 1 }, `${label}.event duration rule`);
  const materializedEvents = flattenEvents(draft);
  const expectedEventChord = expectedChordForCase("T0-SYM-001", `${label}.event chord`);
  truthy(
    materializedEvents.every((event) =>
      event.origin === "literal" &&
      event.repeatedFromOrdinal === null &&
      stableJson(event.chord) === stableJson(expectedEventChord) &&
      stableJson(event.duration) === stableJson(events["duration"]) &&
      draft.sourceText.slice(event.range.start, event.range.end) === "C:4" &&
      draft.sourceText.slice(event.symbolRange.start, event.symbolRange.end) === "C" &&
      event.durationRange !== null &&
      draft.sourceText.slice(event.durationRange.start, event.durationRange.end) === ":4"
    ),
    `${label}.all event records derive from source`,
  );
  equal(
    materialization["ranges"],
    "derive literally from source using contract section 2.1.1; do not invoke production parsing",
    `${label}.range materialization rule`,
  );
  equal(eventFirstExcessProjection(draft), row["firstExcess"], `${label}.first excess`);
}

function verifyLimit019Recipe(
  fixtureCaseValue: JsonRecord,
  draft: ChartTextDraft,
  label: string,
): void {
  const recipe = record(fixtureCaseValue["materializationRecipe"], `${label}.recipe`);
  equal(
    recipe["sourceExpression"],
    "\"@meter 4/4\\n\" + eight sections S000 through S007, each `[Snnn]\\n` plus 1024 copies of `| C:4 |\\n`, then `[S008]\\n| C:4 |\\n`",
    `${label}.source expression`,
  );
  equal(draft.sourceText.length, recipe["sourceUtf16Length"], `${label}.source UTF-16 length`);
  equal(Array.from(draft.sourceText).length, recipe["sourceCodePoints"], `${label}.source code points`);
  equal(utf8Length(draft.sourceText), recipe["sourceUtf8Bytes"], `${label}.source UTF-8 bytes`);

  const prefix = record(
    recipe["prefixThroughPermittedEvents"],
    `${label}.prefixThroughPermittedEvents`,
  );
  const permittedSections = draft.sections.slice(0, 8);
  const permittedMeasures = permittedSections.flatMap(({ measures }) => measures);
  const permittedEvents = permittedMeasures.flatMap(({ events }) => events);
  equal(permittedSections.length, prefix["sections"], `${label}.permitted sections`);
  equal(permittedMeasures.length, prefix["measures"], `${label}.permitted measures`);
  equal(permittedEvents.length, prefix["events"], `${label}.permitted events`);
  equal(
    draft.sections[8]?.range.start,
    prefix["sourceUtf16Length"],
    `${label}.permitted source prefix length`,
  );

  const materialization = record(
    recipe["draftMaterialization"],
    `${label}.draftMaterialization`,
  );
  equal(draft.schema, materialization["schema"], `${label}.schema`);
  equal(draft.grammarId, materialization["grammarId"], `${label}.grammar ID`);
  equal(draft.grammarVersion, materialization["grammarVersion"], `${label}.grammar version`);
  equal(draft.mode, materialization["mode"], `${label}.mode`);
  equal(
    draft.headers.meter,
    record(materialization["headers"], `${label}.headers`)["meter"],
    `${label}.meter`,
  );
  const fullSections = record(materialization["fullSections"], `${label}.fullSections`);
  equal(fullSections, { count: 8, measuresPerSection: 1_024, eventsPerMeasure: 1 }, `${label}.full section recipe`);
  equal(
    permittedSections.map((section) => ({
      measures: section.measures.length,
      eventCounts: [...new Set(section.measures.map(({ events }) => events.length))],
    })),
    Array.from({ length: 8 }, () => ({ measures: 1_024, eventCounts: [1] })),
    `${label}.full section materialization`,
  );
  const eventRecipe = record(materialization["events"], `${label}.events`);
  equal(eventRecipe["origin"], "literal", `${label}.event origin`);
  equal(eventRecipe["chordCaseId"], "T0-SYM-001", `${label}.event chord case`);
  equal(eventRecipe["chordSourceText"], "C", `${label}.event chord source`);
  equal(eventRecipe["duration"], { numerator: 4, denominator: 1 }, `${label}.event duration`);
  const expectedEventChord = expectedChordForCase("T0-SYM-001", `${label}.event chord`);
  truthy(
    flattenEvents(draft).every((event) =>
      event.origin === eventRecipe["origin"] &&
      stableJson(event.chord) === stableJson(expectedEventChord) &&
      event.chord.sourceText === eventRecipe["chordSourceText"] &&
      stableJson(event.duration) === stableJson(eventRecipe["duration"])
    ),
    `${label}.event materialization`,
  );
  equal(
    materialization["ranges"],
    "all unchanged records use the literal section 2.1.1 ranges; do not invoke production parsing",
    `${label}.range materialization rule`,
  );

  const section = draft.sections[8];
  const measure = section?.measures[0];
  const event = measure?.events[0];
  if (section === undefined || measure === undefined || event === undefined) {
    throw new Error(`${label}: missing first excess event`);
  }
  equal(
    {
      sectionOrdinal: section.ordinal,
      measureOrdinal: measure.ordinal,
      eventOrdinal: event.ordinal,
      sectionRange: section.range,
      measureRange: measure.range,
      eventRange: event.range,
      symbolRange: event.symbolRange,
      durationRange: event.durationRange,
    },
    recipe["firstExcess"],
    `${label}.first excess`,
  );
}

function verifyLimit020Recipe(
  fixtureCaseValue: JsonRecord,
  prefix: string,
  baseSections: readonly ChartDraftSection[],
  label: string,
): void {
  const recipe = record(fixtureCaseValue["materializationRecipe"], `${label}.recipe`);
  equal(
    recipe["commonPrefixExpression"],
    "\"@meter 4/4\\n\" + Array.from({length:64}, (_, index) => `[S${String(index).padStart(3, \"0\")}]\\n| |\\n`).join(\"\")",
    `${label}.common prefix expression`,
  );
  equal(prefix.length, recipe["commonPrefixUtf16Length"], `${label}.prefix UTF-16 length`);
  equal(baseSections.length, recipe["commonPrefixSections"], `${label}.prefix sections`);
  equal(
    baseSections.flatMap(({ measures }) => measures).length,
    recipe["commonPrefixMeasures"],
    `${label}.prefix measures`,
  );
  equal(
    baseSections.flatMap(({ measures }) => measures.flatMap(({ events }) => events)).length,
    recipe["commonPrefixEvents"],
    `${label}.prefix events`,
  );
  const materialization = record(
    recipe["draftMaterialization"],
    `${label}.draftMaterialization`,
  );
  equal(materialization["schema"], CHART_TEXT_DRAFT_SCHEMA, `${label}.schema`);
  equal(materialization["grammarId"], CHART_TEXT_GRAMMAR_ID, `${label}.grammar ID`);
  equal(materialization["grammarVersion"], CHART_TEXT_GRAMMAR_VERSION, `${label}.grammar version`);
  equal(materialization["mode"], "document", `${label}.mode`);
  equal(
    record(materialization["headers"], `${label}.headers`)["meter"],
    { beatsPerBar: 4, beatUnit: 4 },
    `${label}.meter`,
  );
  equal(materialization["sectionOrdinals"], "0 through 64", `${label}.section ordinal rule`);
  const eachSection = record(materialization["eachSection"], `${label}.eachSection`);
  equal(eachSection, { kind: "named", oneEmptyBarredMeasure: true }, `${label}.section recipe`);
  equal(
    baseSections.map(({ ordinal }) => ordinal),
    Array.from({ length: MAX_CHART_SECTIONS }, (_, ordinal) => ordinal),
    `${label}.prefix section ordinals`,
  );
  truthy(
    baseSections.every((section) =>
      section.kind === "named" &&
      section.measures.length === 1 &&
      section.measures[0]?.kind === "barred" &&
      section.measures[0].events.length === 0 &&
      prefix.slice(section.range.start, section.range.end) ===
        `[S${String(section.ordinal).padStart(3, "0")}]\n| |`
    ),
    `${label}.prefix records derive from source`,
  );
  equal(
    materialization["ranges"],
    "derive literally from each row using contract section 2.1.1; do not invoke production parsing",
    `${label}.range materialization rule`,
  );
}

function limit020ShallowRangeProbeDraft(
  prefix: string,
  baseSections: readonly ChartDraftSection[],
  escapedBoundary: "first" | "last",
): ChartTextDraft {
  const sourceText = `${prefix}[S064] "x"\n| |\n| |\n`;
  const coherentFirstRange = { start: 726, end: 729 };
  const coherentLastRange = { start: 730, end: 733 };
  const firstRange = escapedBoundary === "first"
    ? { start: 714, end: 729 }
    : coherentFirstRange;
  const lastRange = escapedBoundary === "last"
    ? { start: 730, end: 734 }
    : coherentLastRange;
  return {
    schema: CHART_TEXT_DRAFT_SCHEMA,
    grammarId: CHART_TEXT_GRAMMAR_ID,
    grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
    mode: "document",
    sourceText,
    headers: {
      title: null,
      description: null,
      meter: checkedMeter({ beatsPerBar: 4, beatUnit: 4 }, "LIMIT020 probe meter"),
      tempoBpm: null,
      key: null,
    },
    sections: [
      ...baseSections,
      {
        ordinal: 64,
        kind: "named",
        name: "S064",
        annotation: "x",
        range: { start: 715, end: 733 },
        measures: [
          { ordinal: 0, kind: "barred", range: firstRange, events: [] },
          { ordinal: 1, kind: "barred", range: lastRange, events: [] },
        ],
      },
    ],
  };
}

function verifyChartFormatterCase(id: string): Readonly<{ executions: number; payload: unknown }> {
  const fixtureCaseValue = fixtureCase(chartCases, id);
  const payload: unknown[] = [];
  if (id === "T0-CHART-FMT-ERR-001") {
    const recipe = record(fixtureCaseValue["inputDraftRecipe"], `${id}.recipe`);
    const subcaseId = string(recipe["id"], `${id}.recipe.id`);
    equal(subcaseId, "event-0-duration-zero", `${id}.subcase-id`);
    equal(recipe["kind"], "single-field-mutation", `${id}.recipe.kind`);
    const baseDraftId = string(recipe["baseDraft"], `${id}.recipe.baseDraft`);
    equal(baseDraftId, "T0-CHART-001", `${id}.base-draft-id`);
    const base = baseDraftFromCase(baseDraftId);
    let malformed: ChartTextDraft;
    switch (subcaseId) {
      case "event-0-duration-zero":
        malformed = replaceEvent(base, 0, (event) => ({
          ...event,
          duration: { numerator: 0, denominator: 1 } as unknown as BeatDuration,
        }));
        break;
      default:
        throw new Error(`${id}: unknown formatter subcase ${subcaseId}`);
    }
    const expected = record(fixtureCaseValue["expected"], `${id}.expected`);
    equal(expected["ok"], false, `${id}.expected.ok`);
    const expectedDiagnostics = array(expected["diagnostics"], `${id}.diagnostics`);
    equal(expectedDiagnostics.length, 1, `${id}.diagnostic-row-count`);
    const expectedDiagnostic = record(expectedDiagnostics[0], `${id}.diagnostic`);
    equal(expectedDiagnostic["rangeOwner"], "event 0 range", `${id}.range-owner`);
    equal(
      expectedDiagnostic["range"],
      flattenEvents(malformed)[0]?.range,
      `${id}.range-owner projection`,
    );
    const mutationProjection = verifyMutationProjection(
      base,
      malformed,
      recipe["mutationProjection"],
      `${id}.${subcaseId}.mutationProjection`,
    );
    const observed = exactFormatterRefusal(
      malformed,
      expectedDiagnostic,
      `${id}.${subcaseId}`,
    );
    return {
      executions: 1,
      payload: formatterPayload(
        subcaseId,
        string(recipe["fault"], `${id}.recipe.fault`),
        mutationProjection,
        malformed,
        observed,
      ),
    };
  }
  if (id === "T0-CHART-FMT-ERR-002") {
    const rows = array(fixtureCaseValue["rows"], `${id}.rows`).map(
      (value, index) => record(value, `${id}.rows[${String(index)}]`),
    );
    const expectedIds = [
      "draft-schema-version-mismatch",
      "grammar-version-mismatch",
      "fragment-title-present",
      "event-ordinal-gap",
      "symbol-range-beyond-source",
      "repeat-link-self-reference",
      "literal-unformattable-extension",
      "repeat-copy-mismatch-unformattable",
    ];
    equal(rows.length, expectedIds.length, `${id}.row-count`);
    equal(
      rows.map((row) => string(row["id"], `${id}.row.id`)),
      expectedIds,
      `${id}.row-ids`,
    );
    for (const row of rows) {
      const subcaseId = string(row["id"], `${id}.row.id`);
      const fault = string(row["fault"], `${id}.${subcaseId}.fault`);
      const base = baseDraftFromCase(
        string(row["baseDraft"], `${id}.${subcaseId}.baseDraft`),
      );
      let draft = base;
      switch (subcaseId) {
        case "draft-schema-version-mismatch":
          draft = {
            ...draft,
            schema: "changes.theory.chart-text-draft.v999" as typeof CHART_TEXT_DRAFT_SCHEMA,
          };
          break;
        case "grammar-version-mismatch":
          draft = { ...draft, grammarVersion: 2 as typeof CHART_TEXT_GRAMMAR_VERSION };
          break;
        case "fragment-title-present":
          draft = { ...draft, headers: { ...draft.headers, title: "not allowed" } };
          break;
        case "event-ordinal-gap":
          draft = replaceEvent(draft, 2, (event) => ({ ...event, ordinal: 4 }));
          break;
        case "symbol-range-beyond-source":
          draft = replaceEvent(draft, 0, (event) => ({
            ...event,
            symbolRange: { ...event.symbolRange, end: draft.sourceText.length + 1 },
          }));
          break;
        case "repeat-link-self-reference":
          draft = replaceEvent(draft, 1, (event) => ({
            ...event,
            repeatedFromOrdinal: 1,
          }));
          break;
        case "literal-unformattable-extension":
          draft = replaceEvent(draft, 0, (event) => ({
            ...event,
            chord: { ...event.chord, extensions: [{ number: 9, alter: 0 }] },
          }));
          break;
        case "repeat-copy-mismatch-unformattable":
          draft = replaceEvent(draft, 1, (event) => ({
            ...event,
            chord: { ...event.chord, sixth: { number: 6, alter: 0 } },
          }));
          break;
        default:
          throw new Error(`${id}: unknown formatter subcase ${subcaseId}`);
      }
      const expected = record(row["expected"], `${id}.row expected`);
      const mutationProjection = verifyMutationProjection(
        base,
        draft,
        row["mutationProjection"],
        `${id}.${subcaseId}.mutationProjection`,
      );
      const observed = exactFormatterRefusal(
        draft,
        expected,
        `${id}.${subcaseId}`,
      );
      if (subcaseId === "literal-unformattable-extension") {
        const literal = flattenEvents(draft)[0];
        if (literal === undefined) throw new Error(`${id}.${subcaseId}: literal missing`);
        const nestedExpected = record(
          row["nestedSymbolFormatterDiagnostic"],
          `${id}.${subcaseId}.nestedSymbolFormatterDiagnostic`,
        );
        const localRange = record(
          nestedExpected["localRange"],
          `${id}.${subcaseId}.localRange`,
        );
        const nestedResult = formatChordSymbol(literal.chord, "ascii");
        equal(nestedResult.ok, false, `${id}.${subcaseId}.nested refusal`);
        equal(
          diagnosticProjection(nestedResult),
          [{ code: expected["code"], range: localRange }],
          `${id}.${subcaseId}.nested local diagnostic`,
        );
        equal(expected["rangeOwner"], "literal event.symbolRange", `${id}.${subcaseId}.range owner`);
        equal(expected["range"], literal.symbolRange, `${id}.${subcaseId}.chart range`);
        equal(
          expected["mustNotUseChordLocalSourceOffsets"],
          true,
          `${id}.${subcaseId}.chart-coordinate rule`,
        );
        truthy(
          stableJson(localRange) !== stableJson(literal.symbolRange),
          `${id}.${subcaseId}.local and chart ranges differ`,
        );
      }
      if (subcaseId === "repeat-copy-mismatch-unformattable") {
        const repeat = flattenEvents(draft)[1];
        if (repeat === undefined) throw new Error(`${id}.${subcaseId}: repeat missing`);
        const nestedResult = formatChordSymbol(repeat.chord, "ascii");
        equal(nestedResult.ok, false, `${id}.${subcaseId}.nested formatter would refuse`);
        if (nestedResult.ok) throw new Error(`${id}.${subcaseId}: malformed repeat formatted`);
        equal(
          nestedResult.diagnostics.map(({ code }) => code),
          ["symbol.ast_unformattable"],
          `${id}.${subcaseId}.nested refusal code`,
        );
        equal(expected["rangeOwner"], "repeat event.range", `${id}.${subcaseId}.range owner`);
        equal(expected["range"], repeat.range, `${id}.${subcaseId}.chart range`);
        equal(
          expected["mustRejectBeforeNestedSymbolFormatting"],
          true,
          `${id}.${subcaseId}.pre-nested rule`,
        );
        equal(observed.evidence.slotsObserved, 1, `${id}.${subcaseId}.only prior slot reached`);
        equal(
          observed.evidence.chordDelegations,
          1,
          `${id}.${subcaseId}.repeat not delegated`,
        );
      }
      payload.push(formatterPayload(
        subcaseId,
        fault,
        mutationProjection,
        draft,
        observed,
      ));
    }
    return { executions: payload.length, payload };
  }
  if (id === "T0-CHART-FMT-ERR-003") {
    const parentExpected = record(fixtureCaseValue["expected"], `${id}.expected`);
    equal(parentExpected["ok"], false, `${id}.expected.ok`);
    equal(parentExpected["noPartialText"], true, `${id}.expected.noPartialText`);
    equal(
      parentExpected["topLevelOrEarlierRangeIncoherenceWinsAs"],
      "chart.draft_unformattable",
      `${id}.expected.precedence code`,
    );
    const rows = array(fixtureCaseValue["rows"], `${id}.rows`).map(
      (value, index) => record(value, `${id}.rows[${String(index)}]`),
    );
    const expectedIds = [
      "section-limit-first-excess",
      "event-limit-first-excess",
    ];
    equal(rows.length, expectedIds.length, `${id}.row-count`);
    equal(
      rows.map((row) => string(row["id"], `${id}.row.id`)),
      expectedIds,
      `${id}.row-ids`,
    );
    for (const row of rows) {
      const subcaseId = string(row["id"], `${id}.row.id`);
      let draft: ChartTextDraft;
      let fault: string;
      switch (subcaseId) {
        case "section-limit-first-excess":
          draft = sectionLimitDraft();
          fault = "coherent first-excess section reaches the formatter limit";
          verifyFmt003SectionRecipe(row, draft, `${id}.${subcaseId}`);
          break;
        case "event-limit-first-excess":
          draft = eventLimitDraft();
          fault = "coherent first-excess event reaches the formatter limit";
          verifyFmt003EventRecipe(row, draft, `${id}.${subcaseId}`);
          break;
        default:
          throw new Error(`${id}: unknown formatter subcase ${subcaseId}`);
      }
      equal(
        Object.hasOwn(row, "mutationProjection"),
        false,
        `${id}.${subcaseId}.no-mutationProjection`,
      );
      const expected = record(row["expected"], `${id}.${subcaseId}.expected`);
      const observed = exactFormatterRefusal(
        draft,
        expected,
        `${id}.${subcaseId}`,
      );
      if (subcaseId === "section-limit-first-excess") {
        equal(
          expected["precedence"],
          "after the excess section own range/local shape is coherent and before its descendants or later nodes",
          `${id}.${subcaseId}.precedence`,
        );
        equal(
          {
            sectionsObserved: observed.evidence.sectionsObserved,
            measuresObserved: observed.evidence.measuresObserved,
            slotsObserved: observed.evidence.slotsObserved,
            chordDelegations: observed.evidence.chordDelegations,
            termination: observed.evidence.termination,
          },
          {
            sectionsObserved: MAX_CHART_SECTIONS + 1,
            measuresObserved: MAX_CHART_SECTIONS,
            slotsObserved: 0,
            chordDelegations: 0,
            termination: "chart-sections",
          },
          `${id}.${subcaseId}.precedence evidence`,
        );
      } else {
        equal(
          expected["precedence"],
          "after the excess event own ranges/local shape are coherent and before later nodes",
          `${id}.${subcaseId}.precedence`,
        );
        equal(
          {
            slotsObserved: observed.evidence.slotsObserved,
            chordDelegations: observed.evidence.chordDelegations,
            termination: observed.evidence.termination,
          },
          {
            slotsObserved: MAX_CHART_EVENTS + 1,
            chordDelegations: MAX_CHART_EVENTS,
            termination: "chart-events",
          },
          `${id}.${subcaseId}.precedence evidence`,
        );
      }
      payload.push(formatterPayload(
        subcaseId,
        fault,
        null,
        draft,
        observed,
      ));
    }

    const coherent = sectionLimitDraft();
    const topLevelBroken: ChartTextDraft = {
      ...coherent,
      grammarVersion: 2 as typeof CHART_TEXT_GRAMMAR_VERSION,
    };
    const topLevelResult = formatChartText(topLevelBroken, "ascii");
    equal(topLevelResult.ok, false, `${id}.top-level incoherence refusal`);
    if (topLevelResult.ok) throw new Error(`${id}: top-level incoherence formatted`);
    equal(
      topLevelResult.diagnostics.map(({ code }) => code),
      [parentExpected["topLevelOrEarlierRangeIncoherenceWinsAs"]],
      `${id}.top-level incoherence precedence`,
    );
    const earlierRangeBroken: ChartTextDraft = {
      ...coherent,
      sections: coherent.sections.map((section, index) =>
        index === 0
          ? { ...section, range: { ...section.range, start: section.range.start + 1 } }
          : section
      ),
    };
    const earlierRangeResult = formatChartText(earlierRangeBroken, "ascii");
    equal(earlierRangeResult.ok, false, `${id}.earlier range incoherence refusal`);
    if (earlierRangeResult.ok) throw new Error(`${id}: earlier range incoherence formatted`);
    equal(
      earlierRangeResult.diagnostics.map(({ code }) => code),
      [parentExpected["topLevelOrEarlierRangeIncoherenceWinsAs"]],
      `${id}.earlier range incoherence precedence`,
    );
    return { executions: payload.length, payload };
  }
  throw new Error(`unknown formatter case ${id}`);
}

function verifyFormatterBoundary(id: string): Readonly<{ executions: number; payload: unknown }> {
  if (id === "T0-CHART-LIMIT-019") {
    const base = eventLimitDraft();
    const fixtureCaseValue = fixtureCase(chartCases, id);
    verifyLimit019Recipe(fixtureCaseValue, base, id);
    const parentExpected = record(fixtureCaseValue["expected"], `${id}.expected`);
    equal(
      parentExpected,
      {
        malformedFirstExcessEventIsNotCounted: true,
        literalSourceTextMustEqualItsOwnSymbolRangeSlice: true,
        literalSymbolRangeMustOwnTheExactChordSpan: true,
        coherentFirstExcessEventIsCountedExactlyOnce: true,
        firstExcessChordFormatterIsNotReached: true,
        allOmittedFormatterCountersFollowTheZeroAndProjectionRulesInT0SyntaxContract: true,
      },
      `${id}.parent claims`,
    );
    const firstExcessEvent = base.sections[8]?.measures[0]?.events[0];
    if (firstExcessEvent === undefined) throw new Error(`${id}: first excess event missing`);
    const rows = array(
      record(fixtureCaseValue["materializationRecipe"], `${id}.recipe`)["rows"],
      `${id}.rows`,
    ).map((value, index) => record(value, `${id}.rows[${String(index)}]`));
    const expectedIds = [
      "literal-source-owner-mismatch",
      "literal-symbol-range-owner-mismatch",
      "coherent-first-excess-control",
    ];
    equal(rows.length, expectedIds.length, `${id}.row-count`);
    equal(
      rows.map((row) => string(row["id"], `${id}.row.id`)),
      expectedIds,
      `${id}.row-ids`,
    );
    const payload: unknown[] = [];
    for (const row of rows) {
      const subcaseId = string(row["id"], `${id}.row.id`);
      let draft = base;
      let fault: string | null;
      let mutationProjection: JsonRecord | null;
      switch (subcaseId) {
        case "literal-source-owner-mismatch":
          fault = string(row["singleFault"], `${id}.${subcaseId}.singleFault`);
          draft = replaceEvent(base, 8_192, (event) => ({
            ...event,
            chord: { ...event.chord, sourceText: "D" },
          }));
          mutationProjection = verifyMutationProjection(
            base,
            draft,
            row["mutationProjection"],
            `${id}.${subcaseId}.mutationProjection`,
          );
          break;
        case "literal-symbol-range-owner-mismatch":
          fault = string(row["singleFault"], `${id}.${subcaseId}.singleFault`);
          draft = replaceEvent(base, 8_192, (event) => ({
            ...event,
            symbolRange: {
              start: event.symbolRange.start + 1,
              end: event.symbolRange.end + 1,
            },
          }));
          mutationProjection = verifyMutationProjection(
            base,
            draft,
            row["mutationProjection"],
            `${id}.${subcaseId}.mutationProjection`,
          );
          break;
        case "coherent-first-excess-control":
          equal(row["singleFault"], null, `${id}.${subcaseId}.singleFault`);
          equal(
            Object.hasOwn(row, "mutationProjection"),
            false,
            `${id}.${subcaseId}.no-mutationProjection`,
          );
          fault = null;
          mutationProjection = null;
          break;
        default:
          throw new Error(`${id}: unknown formatter subcase ${subcaseId}`);
      }
      const expected = record(row["expected"], `${id}.expected`);
      const observed = exactFormatterRefusal(
        draft,
        expected,
        `${id}.${subcaseId}`,
      );
      equal(expected["ok"], false, `${id}.${subcaseId}.expected.ok`);
      equal(expected["noPartialText"], true, `${id}.${subcaseId}.no partial text`);
      expectSubset(
        observed.evidence,
        expected["expectedEvidence"],
        `${id}.${subcaseId}.evidence`,
      );
      verifyFormatterZeroCounters(observed.evidence, `${id}.${subcaseId}.zero counters`);
      if (subcaseId === "literal-source-owner-mismatch") {
        const actual = draft.sections[8]?.measures[0]?.events[0];
        if (actual === undefined) throw new Error(`${id}.${subcaseId}: event missing`);
        equal(expected["rangeOwner"], "first-excess event.range", `${id}.${subcaseId}.range owner`);
        equal(expected["range"], actual.range, `${id}.${subcaseId}.diagnostic range owner`);
        equal(
          base.sourceText.slice(firstExcessEvent.symbolRange.start, firstExcessEvent.symbolRange.end),
          firstExcessEvent.chord.sourceText,
          `${id}.${subcaseId}.coherent base source owner`,
        );
        truthy(
          draft.sourceText.slice(actual.symbolRange.start, actual.symbolRange.end) !==
            actual.chord.sourceText,
          `${id}.${subcaseId}.single source-owner fault`,
        );
        equal(
          observed.evidence.slotsObserved,
          MAX_CHART_EVENTS,
          `${id}.${subcaseId}.malformed excess not counted`,
        );
      }
      if (subcaseId === "literal-symbol-range-owner-mismatch") {
        const actual = draft.sections[8]?.measures[0]?.events[0];
        if (actual === undefined) throw new Error(`${id}.${subcaseId}: event missing`);
        equal(expected["rangeOwner"], "first-excess event.range", `${id}.${subcaseId}.range owner`);
        equal(expected["range"], actual.range, `${id}.${subcaseId}.diagnostic range owner`);
        equal(
          draft.sourceText.slice(actual.symbolRange.start, actual.symbolRange.end),
          ":",
          `${id}.${subcaseId}.mutated range owns duration colon`,
        );
        truthy(
          draft.sourceText.slice(actual.symbolRange.start, actual.symbolRange.end) !==
            actual.chord.sourceText,
          `${id}.${subcaseId}.single symbol-range fault`,
        );
        equal(
          observed.evidence.slotsObserved,
          MAX_CHART_EVENTS,
          `${id}.${subcaseId}.malformed excess not counted`,
        );
      }
      if (subcaseId === "coherent-first-excess-control") {
        equal(expected["received"], observed.evidence.slotsObserved, `${id}.${subcaseId}.received`);
        equal(expected["limit"], MAX_CHART_EVENTS, `${id}.${subcaseId}.limit`);
        equal(
          expected["received"],
          number(expected["limit"], `${id}.${subcaseId}.limit value`) + 1,
          `${id}.${subcaseId}.first excess counted once`,
        );
        equal(
          expected["firstExcessChordDelegated"],
          false,
          `${id}.${subcaseId}.delegation claim`,
        );
        equal(
          observed.evidence.chordDelegations,
          MAX_CHART_EVENTS,
          `${id}.${subcaseId}.first excess formatter not reached`,
        );
        equal(
          base.sourceText.slice(firstExcessEvent.symbolRange.start, firstExcessEvent.symbolRange.end),
          firstExcessEvent.chord.sourceText,
          `${id}.${subcaseId}.coherent source owner`,
        );
      }
      payload.push(formatterPayload(
        subcaseId,
        fault,
        mutationProjection,
        draft,
        observed,
      ));
    }
    return { executions: payload.length, payload };
  }
  if (id === "T0-CHART-LIMIT-020") {
    const fixtureCaseValue = fixtureCase(chartCases, id);
    const recipe = record(fixtureCaseValue["materializationRecipe"], `${id}.recipe`);
    const parentExpected = record(fixtureCaseValue["expected"], `${id}.expected`);
    equal(
      parentExpected,
      {
        malformedFirstExcessSectionIsNotCounted: true,
        namedSectionMustOwnItsOpeningMarker: true,
        sectionGapBeginsAfterCompleteAnnotation: true,
        sectionRangeMustOwnItsLastMeasureHull: true,
        coherentFirstExcessSectionIsCountedExactlyOnce: true,
        firstExcessSectionDescendantsAreNeverTraversed: true,
        allOmittedFormatterCountersFollowTheZeroAndProjectionRulesInT0SyntaxContract: true,
      },
      `${id}.parent claims`,
    );
    const rows = array(recipe["rows"], `${id}.rows`).map(
      (value, index) => record(value, `${id}.rows[${String(index)}]`),
    );
    const expectedIds = [
      "named-marker-owner-mismatch",
      "post-annotation-gap-missing",
      "section-hull-ends-before-last-measure",
      "coherent-annotated-first-excess-control",
    ];
    equal(rows.length, expectedIds.length, `${id}.row-count`);
    equal(
      rows.map((row) => string(row["id"], `${id}.row.id`)),
      expectedIds,
      `${id}.row-ids`,
    );
    const prefixSources = Array.from({ length: 64 }, (_, ordinal) =>
      `[S${String(ordinal).padStart(3, "0")}]\n| |\n`
    );
    const prefix = `@meter 4/4\n${prefixSources.join("")}`;
    const baseSections = sectionLimitDraft().sections.slice(0, 64);
    verifyLimit020Recipe(fixtureCaseValue, prefix, baseSections, id);
    const payload: unknown[] = [];
    for (const row of rows) {
      const subcaseId = string(row["id"], `${id}.row.id`);
      const detail = record(row["draftFirstExcess"], `${id}.detail`);
      const sourceText = `${prefix}${string(row["suffix"], `${id}.suffix`)}`;
      equal(
        sourceText.length,
        number(row["sourceUtf16Length"], `${id}.${subcaseId}.sourceUtf16Length`),
        `${id}.${subcaseId}.source UTF-16 length`,
      );
      const firstMeasureRange = record(
        detail["measureRange"] ?? detail["firstMeasureRange"],
        `${id}.firstMeasureRange`,
      ) as ChartDraftMeasure["range"];
      const lastMeasureRange = record(
        detail["lastMeasureRange"] ?? firstMeasureRange,
        `${id}.lastMeasureRange`,
      ) as ChartDraftMeasure["range"];
      const measureRanges = stableJson(firstMeasureRange) === stableJson(lastMeasureRange)
        ? [firstMeasureRange]
        : [firstMeasureRange, lastMeasureRange];
      const section: ChartDraftSection = {
        ordinal: 64,
        kind: "named",
        name: string(detail["name"], `${id}.name`),
        annotation: string(detail["annotation"], `${id}.annotation`),
        range: record(detail["range"], `${id}.range`) as ChartDraftSection["range"],
        measures: measureRanges.map((range, ordinal) => ({
          ordinal,
          kind: "barred",
          range,
          events: [],
        })),
      };
      const draft: ChartTextDraft = {
        schema: CHART_TEXT_DRAFT_SCHEMA,
        grammarId: CHART_TEXT_GRAMMAR_ID,
        grammarVersion: CHART_TEXT_GRAMMAR_VERSION,
        mode: "document",
        sourceText,
        headers: {
          title: null,
          description: null,
          meter: checkedMeter({ beatsPerBar: 4, beatUnit: 4 }, `${id}.meter`),
          tempoBpm: null,
          key: null,
        },
        sections: [...baseSections, section],
      };
      const expected = record(row["expected"], `${id}.expected`);
      const singleFault = row["singleFault"];
      let fault: string | null;
      if (subcaseId === "coherent-annotated-first-excess-control") {
        equal(singleFault, null, `${id}.${subcaseId}.singleFault`);
        fault = null;
      } else {
        fault = string(singleFault, `${id}.${subcaseId}.singleFault`);
      }
      equal(
        Object.hasOwn(row, "mutationProjection"),
        false,
        `${id}.${subcaseId}.no-mutationProjection`,
      );
      const observed = exactFormatterRefusal(
        draft,
        expected,
        `${id}.${subcaseId}`,
      );
      equal(expected["ok"], false, `${id}.${subcaseId}.expected.ok`);
      equal(expected["noPartialText"], true, `${id}.${subcaseId}.no partial text`);
      expectSubset(
        observed.evidence,
        expected["expectedEvidence"],
        `${id}.${subcaseId}.evidence`,
      );
      verifyFormatterZeroCounters(observed.evidence, `${id}.${subcaseId}.zero counters`);
      if (subcaseId === "named-marker-owner-mismatch") {
        equal(expected["descendantsVisited"], false, `${id}.${subcaseId}.descendant claim`);
        equal(sourceText[section.range.start], "S", `${id}.${subcaseId}.range starts at name`);
        truthy(
          !sourceText.startsWith(`[${section.name ?? ""}]`, section.range.start),
          `${id}.${subcaseId}.opening marker is not owned`,
        );
        equal(
          observed.evidence.sectionsObserved,
          MAX_CHART_SECTIONS,
          `${id}.${subcaseId}.malformed excess not counted`,
        );
      }
      if (subcaseId === "post-annotation-gap-missing") {
        equal(expected["descendantsVisited"], false, `${id}.${subcaseId}.descendant claim`);
        const markerEnd = section.range.start + `[${section.name ?? ""}]`.length;
        const encodedAnnotation = ` ${JSON.stringify(section.annotation)}`;
        const annotationEnd = markerEnd + encodedAnnotation.length;
        equal(
          sourceText.slice(markerEnd, annotationEnd),
          encodedAnnotation,
          `${id}.${subcaseId}.complete annotation source`,
        );
        equal(sourceText[annotationEnd], "|", `${id}.${subcaseId}.missing post-annotation gap`);
        equal(
          firstMeasureRange.start,
          annotationEnd,
          `${id}.${subcaseId}.measure begins without gap`,
        );
        equal(
          observed.evidence.sectionsObserved,
          MAX_CHART_SECTIONS,
          `${id}.${subcaseId}.malformed excess not counted`,
        );
      }
      if (subcaseId === "section-hull-ends-before-last-measure") {
        equal(
          expected["shallowBoundaryRangeReads"],
          ["first measure.range", "last measure.range"],
          `${id}.${subcaseId}.shallow range reads`,
        );
        equal(section.measures[0]?.range, detail["firstMeasureRange"], `${id}.${subcaseId}.first range`);
        equal(section.measures.at(-1)?.range, detail["lastMeasureRange"], `${id}.${subcaseId}.last range`);
        truthy(
          section.range.end < lastMeasureRange.end,
          `${id}.${subcaseId}.section hull excludes last measure end`,
        );
        equal(expected["descendantsTraversed"], false, `${id}.${subcaseId}.descendant claim`);
        equal(
          observed.evidence.sectionsObserved,
          MAX_CHART_SECTIONS,
          `${id}.${subcaseId}.malformed excess not counted`,
        );
      }
      if (subcaseId === "coherent-annotated-first-excess-control") {
        equal(expected["received"], observed.evidence.sectionsObserved, `${id}.${subcaseId}.received`);
        equal(expected["limit"], MAX_CHART_SECTIONS, `${id}.${subcaseId}.limit`);
        equal(
          expected["received"],
          number(expected["limit"], `${id}.${subcaseId}.limit value`) + 1,
          `${id}.${subcaseId}.first excess counted once`,
        );
        equal(expected["descendantsVisited"], false, `${id}.${subcaseId}.descendant claim`);
        equal(
          observed.evidence.measuresObserved,
          MAX_CHART_SECTIONS,
          `${id}.${subcaseId}.excess descendants not traversed`,
        );
        equal(observed.evidence.slotsObserved, 0, `${id}.${subcaseId}.no excess slots visited`);
      }
      payload.push(formatterPayload(
        subcaseId,
        fault,
        null,
        draft,
        observed,
      ));
    }

    const hullExpected = record(rows[2]?.["expected"], `${id}.hull expected`);
    for (const boundary of ["first", "last"] as const) {
      const probe = formatChartTextWithEvidence(
        limit020ShallowRangeProbeDraft(prefix, baseSections, boundary),
        "ascii",
      );
      equal(probe.result.ok, false, `${id}.${boundary} shallow range probe refusal`);
      if (probe.result.ok) throw new Error(`${id}.${boundary}: shallow range probe formatted`);
      equal(
        probe.result.diagnostics.map(({ code }) => code),
        [hullExpected["code"]],
        `${id}.${boundary} shallow range read`,
      );
      equal(
        {
          sectionsObserved: probe.evidence.sectionsObserved,
          measuresObserved: probe.evidence.measuresObserved,
          slotsObserved: probe.evidence.slotsObserved,
        },
        {
          sectionsObserved: MAX_CHART_SECTIONS,
          measuresObserved: MAX_CHART_SECTIONS,
          slotsObserved: 0,
        },
        `${id}.${boundary} shallow range probe stops before descendants`,
      );
      verifyFormatterZeroCounters(probe.evidence, `${id}.${boundary} shallow probe zero counters`);
    }
    return { executions: payload.length, payload };
  }
  throw new Error(`unknown formatter boundary ${id}`);
}

function runRoundtripLaws(): Readonly<{
  observation: JsonRecord;
  outputSha256: string;
}> {
  const child = Bun.spawnSync({
    cmd: [process.execPath, "test", "tests/conformance/t0-roundtrip-laws.test.ts"],
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = child.stdout.toString();
  const stderr = child.stderr.toString();
  equal(child.exitCode, 0, `roundtrip child exit: ${stderr}`);
  const marker = stdout.split("\n").find((line) =>
    line.startsWith("T0_CONFORMANCE_OBSERVATION ") && line.includes('"suite":"roundtrip-laws"')
  );
  if (marker === undefined) throw new Error("roundtrip observation marker missing");
  const parsed: unknown = JSON.parse(marker.slice("T0_CONFORMANCE_OBSERVATION ".length));
  const observation = record(parsed, "roundtrip observation");
  const { semanticDigest, ...unsigned } = observation;
  equal(semanticDigest, sha256(unsigned), "roundtrip observation digest");
  equal(observation["status"], "pass", "roundtrip observation status");
  return { observation, outputSha256: sha256(observation) };
}

function verifyRuntimeCase(id: string): Readonly<{ executions: number; payload: unknown }> {
  if (id.startsWith("T0-SYM-") || id.startsWith("T0-ALIAS-")) {
    return verifySymbolCase(id);
  }
  if (id.startsWith("T0-CHART-FMT-ERR-")) return verifyChartFormatterCase(id);
  if (id === "T0-CHART-LIMIT-019" || id === "T0-CHART-LIMIT-020") {
    return verifyFormatterBoundary(id);
  }
  if (id.startsWith("T0-CHART-LIMIT-") || id === "T0-CHART-UNICODE-001") {
    return verifyChartBoundary(id);
  }
  if (id.startsWith("T0-CHART-")) return verifyRegularChartCase(id);
  throw new Error(`unowned runtime case ${id}`);
}

describe("T0 reviewed mutation-control implication", () => {
  test("executes and hash-binds every linked case while making no source-mutant claim", () => {
    const mutationFixture = record(mutationFixtureValue, "mutation fixture");
    const controls = array(mutationFixture["controls"], "mutation controls")
      .map((value, index) => record(value, `control ${String(index)}`));
    const controlIds = controls.map((control) => string(control["id"], "control id"));
    equal(
      controlIds,
      Array.from(
        { length: REVIEWED_MUTATION_CONTROL_COUNT },
        (_, index) => `T0-MUT-${String(index + 1).padStart(3, "0")}`,
      ),
      "mutation control inventory",
    );
    const newestControl = controls.at(-1);
    if (newestControl === undefined) throw new Error("missing newest mutation control");
    equal(newestControl["id"], "T0-MUT-060", "newest mutation control ID");
    truthy(
      array(newestControl["killedByCaseIds"], "T0-MUT-060.killedByCaseIds")
        .includes(NEWLY_LINKED_MUTATION_CASE),
      "T0-MUT-060 links the stray section-closer regression",
    );
    const linkedIds = [...new Set(controls.flatMap((control) =>
      array(control["killedByCaseIds"], `${String(control["id"])}.killedByCaseIds`)
        .map((value) => string(value, "killer case ID"))
    ))].sort();
    truthy(
      linkedIds.includes(NEWLY_LINKED_MUTATION_CASE),
      "linked case inventory includes the MUT-060 regression",
    );

    const roundtrip = runRoundtripLaws();
    const lawIds = new Set(array(roundtrip.observation["lawIds"], "roundtrip law IDs")
      .map((value) => string(value, "roundtrip law ID")));
    const observations: CaseObservation[] = [];
    const unaccounted: string[] = [];
    for (const id of linkedIds) {
      if (id.startsWith("T0-META-")) {
        if (!lawIds.has(id)) {
          unaccounted.push(id);
          continue;
        }
        const lawDigests = record(roundtrip.observation["lawDigests"], "roundtrip law digests");
        observations.push({
          caseId: id,
          channel: "roundtrip-law",
          outcome: "pass",
          evidenceSha256: string(lawDigests[id], `${id}.digest`),
          executions: 1,
        });
        continue;
      }
      try {
        const verified = verifyRuntimeCase(id);
        observations.push({
          caseId: id,
          channel: "runtime-case",
          outcome: "pass",
          evidenceSha256: sha256({ id, payload: verified.payload }),
          executions: verified.executions,
        });
      } catch (error: unknown) {
        unaccounted.push(`${id}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    equal(unaccounted, [], "all linked cases accounted");
    equal(observations.length, linkedIds.length, "all linked cases observed");

    const observationsById = new Map(observations.map((item) => [item.caseId, item]));
    const reports = controls.map((control) => {
      const id = string(control["id"], "control id");
      const caseIds = array(control["killedByCaseIds"], "control case IDs")
        .map((value) => string(value, "control case ID"));
      const complete = caseIds.every((caseId) => observationsById.has(caseId));
      const killedCaseObservationDigests = caseIds.map((caseId) => ({
        caseId,
        observationSha256: observationsById.get(caseId)?.evidenceSha256 ?? null,
      }));
      return {
        id,
        operator: string(control["operator"], `${id}.operator`),
        mutatedFault: string(control["mutatedFault"], `${id}.mutatedFault`),
        expectedDetection: string(control["expectedDetection"], `${id}.expectedDetection`),
        caseIds,
        observationEvidenceIds: killedCaseObservationDigests.map(({ observationSha256 }) =>
          observationSha256
        ),
        killedCaseObservationDigests,
        reviewedControlDischarged: complete,
        sourceMutantExecuted: false,
        sourceMutantKilled: false,
        status: complete
          ? "discharged-by-reviewed-exact-case-implication"
          : "mapped-not-observed",
      };
    });
    const discharged = reports.filter(({ reviewedControlDischarged }) =>
      reviewedControlDischarged
    ).length;
    const survived = reports.length - discharged;
    equal(discharged, REVIEWED_MUTATION_CONTROL_COUNT, "reviewed controls discharged");
    equal(survived, 0, "reviewed controls not discharged");

    const controlObservationDigests = Object.fromEntries(reports.map((report) => [
      report.id,
      sha256({
        controlId: report.id,
        operator: report.operator,
        mutatedFault: report.mutatedFault,
        expectedDetection: report.expectedDetection,
        killedByCaseIds: report.caseIds,
        observationEvidenceIds: report.observationEvidenceIds,
        killedCaseObservationDigests: report.killedCaseObservationDigests,
        dischargeStatus: report.status,
      }),
    ]));
    equal(
      Object.keys(controlObservationDigests),
      controlIds,
      "control observation digest inventory",
    );

    const ledgerProjection = controls.map((control) => ({
      id: control["id"],
      operator: control["operator"],
      mutatedFault: control["mutatedFault"],
      expectedDetection: control["expectedDetection"],
      killedByCaseIds: control["killedByCaseIds"],
    }));
    const ledgerSha256 = sha256(ledgerProjection);
    let tamperGenerated = 0;
    let tamperKilled = 0;
    const rejectIfDigestChanges = (candidate: unknown): void => {
      tamperGenerated += 1;
      if (sha256(candidate) !== ledgerSha256) tamperKilled += 1;
    };
    for (let index = 0; index < ledgerProjection.length; index += 1) {
      rejectIfDigestChanges(ledgerProjection.filter((_, candidate) => candidate !== index));
      rejectIfDigestChanges(ledgerProjection.map((item, candidate) =>
        candidate === index ? { ...item, operator: `${String(item.operator)}-tampered` } : item
      ));
      rejectIfDigestChanges(ledgerProjection.map((item, candidate) =>
        candidate === index
          ? { ...item, killedByCaseIds: [...array(item.killedByCaseIds, "tamper cases"), "T0-NOT-A-CASE"] }
          : item
      ));
    }
    const expectedTamperMutants = REVIEWED_MUTATION_CONTROL_COUNT * LEDGER_TAMPERS_PER_CONTROL;
    equal(tamperGenerated, expectedTamperMutants, "ledger tamper mutants generated");
    equal(tamperKilled, expectedTamperMutants, "ledger tamper mutants killed");

    const evidence = {
      schema: "changes.evidence.t0-conformance-observation.v1",
      suite: "mutation-controls",
      fixtureSchema: mutationFixture["schema"],
      ledgerVersion: mutationFixture["ledgerVersion"],
      productionOutputUsed: mutationFixture["productionOutputUsed"],
      claim: "reviewed-exact-case-implication",
      controlIds,
      controlsDefined: reports.length,
      reviewedControlsDischarged: discharged,
      mappedButUnobserved: survived,
      sourceMutantsExecuted: 0,
      sourceMutantsKilled: 0,
      linkedCaseIds: linkedIds,
      linkedCasesObserved: observations.length,
      linkedCasesUnaccounted: unaccounted,
      runtimeExecutions: observations.reduce((sum, item) => sum + item.executions, 0),
      observationDigests: Object.fromEntries(observations.map(({ caseId, evidenceSha256 }) =>
        [caseId, evidenceSha256]
      )),
      controlObservationDigests,
      roundtripObservationSha256: roundtrip.outputSha256,
      reviewedLedgerSha256: ledgerSha256,
      ledgerTamperCampaign: {
        purpose: "verifier-self-test-only",
        operators: ["delete-control", "change-operator", "change-killer-case-mapping"],
        mutantsGenerated: tamperGenerated,
        mutantsKilled: tamperKilled,
        semanticSyntaxFaultsExecuted: 0,
      },
      assertionCount,
      status: "pass",
    };
    console.log(`T0_CONFORMANCE_OBSERVATION ${JSON.stringify({
      ...evidence,
      semanticDigest: sha256(evidence),
    })}`);
  }, 120_000);
});
