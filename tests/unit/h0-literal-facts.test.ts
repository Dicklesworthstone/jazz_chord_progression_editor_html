import { expect, test } from "bun:test";
import {
  ALTERED_DOMINANT_REALIZATION_IDS,
  deriveLiteralFacts,
  parseChordSymbol,
  resolveChord,
  spellChordDegree,
  type H0LiteralFactsRequest,
  type H0LiteralFactsResult,
  type H0SelectedRealizationId,
  type ParsedResolvedChord,
} from "../../src/theory";
import type { ChordDegree } from "../../src/domain";
import sources from "../fixtures/harmony-analysis/source-catalog.json";
import literalCases from "../fixtures/harmony-analysis/literal-fact-cases.json";
import scaleCases from "../fixtures/harmony-analysis/chord-scale-cases.json";

function resolved(symbol: string): ParsedResolvedChord {
  const parsed = parseChordSymbol(symbol, "ascii");
  if (!parsed.ok) throw new Error(`Fixture parse failed: ${symbol}`);
  const result = resolveChord(parsed.chord);
  if (!result.ok) throw new Error(`Fixture resolution failed: ${symbol}: ${result.refusal.code}`);
  return result.value;
}

function request(symbol: string, selectedRealizationId: H0SelectedRealizationId | null = null): H0LiteralFactsRequest & { source: ParsedResolvedChord } {
  return { requestId: "literal-test", baseRevision: 42, source: resolved(symbol), selectedRealizationId };
}

function value(result: H0LiteralFactsResult) {
  if (!result.ok) throw new Error(result.refusal.code);
  return result.value;
}

function degreeText(degree: ChordDegree): string {
  return `${degree.alter < 0 ? "b".repeat(-degree.alter) : "#".repeat(degree.alter)}${String(degree.number)}`;
}

function allFrozen(node: unknown): void {
  if (node === null || typeof node !== "object") return;
  expect(Object.isFrozen(node)).toBe(true);
  for (const child of Object.values(node)) allFrozen(child);
}

function objectReferences(node: unknown, references = new Set<object>()): Set<object> {
  if (node === null || typeof node !== "object" || references.has(node)) return references;
  references.add(node);
  for (const child of Object.values(node)) objectReferences(child, references);
  return references;
}

for (const source of sources.chords) {
  if (source.degrees === null) continue; // Custom has its separate ordered-pitch fixture below.
  test(`literal projection matches independent ${source.id} degrees and spellings`, () => {
    const selection = source.realizationId === "literal" ? "literal"
      : ALTERED_DOMINANT_REALIZATION_IDS.find((id) => id === source.realizationId);
    if (selection === undefined) throw new Error("Unknown reviewed realization");
    const input = request(source.symbol, selection);
    const before = JSON.stringify(input);
    const result = deriveLiteralFacts(input);
    const actual = value(result);
    const facts = actual.literalFacts;
    if (facts.applicability !== "applicable") throw new Error("Parsed source lost applicability");
    expect(facts.degrees.map(degreeText)).toEqual(source.degrees);
    expect(JSON.stringify(facts.root)).toBe(JSON.stringify(source.rootSpelling));
    expect(JSON.stringify(facts.spelledPitchNames)).toBe(JSON.stringify(source.degreeSpellings));
    expect<string>(facts.selectedRealizationId).toBe(source.realizationId);
    expect<readonly number[]>(facts.pitchClasses).toEqual(source.degreeSpellings.map((pitch) => {
      const naturals: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
      const natural = naturals[pitch.step];
      if (natural === undefined) throw new Error("Unknown independent spelling");
      return (natural + pitch.alter + 12) % 12;
    }));
    expect(JSON.stringify(input)).toBe(before);
    expect(actual.baseRevision).toBe(42);
    allFrozen(result);
    const inputReferences = objectReferences(input);
    for (const reference of objectReferences(result)) expect(inputReferences.has(reference)).toBe(false);
    expect(deriveLiteralFacts(input)).toEqual(result);
  });
}

test("reviewed literal fixture identities and exact weights remain independent", () => {
  expect(literalCases.cases).toHaveLength(10);
  for (const row of literalCases.cases) {
    if (!("matchedWeight" in row.expected)) continue;
    const source = sources.chords.find((candidate) => candidate.id === row.sourceId);
    if (source === undefined) throw new Error("Missing reviewed source");
    expect(value(deriveLiteralFacts(request(source.symbol))).literalFacts.match).toEqual(row.expected.matchedWeight);
  }
});

test("all twelve written roots preserve the independently materialized major-seventh spellings", () => {
  for (const root of sources.rootInventory) {
    const cell = scaleCases.rootExpansion.cells.find((candidate) => candidate.rootId === root.id &&
      candidate.mappingRuleId === "h0.scale.ionian" && candidate.polarity === "positive");
    if (cell === undefined) throw new Error("Missing independently materialized root");
    const facts = value(deriveLiteralFacts(request(`${root.symbol}maj7`))).literalFacts;
    const expected = [0, 2, 4, 6].map((index) => cell.expected.scaleDegreeSpellings[index]);
    expect(JSON.stringify(facts.spelledPitchNames)).toBe(JSON.stringify(expected));
    expect(facts.match).toEqual({ numerator: 7, denominator: 7 });
  }
});

test("added seconds/fourths weigh one; structural suspensions weigh two", () => {
  for (const [symbol, numerator] of [["Cadd2", 6], ["Cadd4", 6], ["Csus2", 5], ["Csus4", 5], ["C7#9", 8]] as const) {
    const facts = value(deriveLiteralFacts(request(symbol))).literalFacts;
    expect(facts.match).toEqual({ numerator, denominator: numerator });
  }
});

test("Custom facts retain literal pitch order, duplicate enharmonic spellings and slash bass", () => {
  const source = resolveChord({ kind: "custom", sourceText: "cluster-X", label: "cluster-X",
    pitchNames: [{ step: "D", alter: -1 }, { step: "C", alter: 1 }, { step: "D", alter: -1 }],
    bass: { step: "G", alter: -1 } });
  const result = deriveLiteralFacts({ requestId: "custom", baseRevision: 0, source: source.value, selectedRealizationId: null });
  const actual = value(result);
  expect(actual.disposition).toBe("not-applicable");
  expect(actual.literalFacts).toMatchObject({ root: null, degrees: null, guideToneDegrees: null,
    pitchClasses: [1, 1, 1], match: null, matchComponents: [], bass: { step: "G", alter: -1 } });
  expect(actual.literalFacts.spelledPitchNames).toEqual(source.value.source.pitchNames);
  expect(actual.limitations.map((limitation) => limitation.code)).toEqual(["custom.no_degree_analysis", "custom.no_auto_voicing"]);
  expect(result.evidence.selectedRealizationDegreesVisited).toBe(0);
  allFrozen(result);
});

test("a mutable request cannot change returned degrees, roles, names or bass", () => {
  const input = structuredClone(request("Db7/F"));
  const result = deriveLiteralFacts(input);
  const output = JSON.stringify(result);
  const original = input.source.realizations[0];
  // Reflect exercises the runtime boundary without claiming these writes are a
  // valid typed use of readonly T1 records.
  Reflect.set(input.source.source.root, "step", "A");
  Reflect.set(original.degrees[0], "alter", 1);
  Reflect.set(original.spelledPitchNames[0], "alter", 2);
  if (input.source.bass !== null) Reflect.set(input.source.bass, "step", "B");
  expect(JSON.stringify(result)).toBe(output);
});

test("identity, upstream pins and selection refusals follow code-major precedence", () => {
  const alt = request("C7alt");
  expect(deriveLiteralFacts(alt)).toMatchObject({ ok: false, refusal: { code: "harmony.selected_realization_required" } });
  expect(deriveLiteralFacts({ ...alt, selectedRealizationId: "literal" })).toMatchObject({ ok: false,
    refusal: { code: "harmony.selected_realization_unknown", available: ALTERED_DOMINANT_REALIZATION_IDS } });
  for (const field of ["schema", "formulaTableId", "formulaTableVersion", "degreeSpellingPolicyId", "degreeSpellingPolicyVersion", "degreeRolePolicyId", "degreeRolePolicyVersion"] as const) {
    const input = structuredClone(alt);
    Reflect.set(input.source, field, typeof input.source[field] === "number" ? 2 : "unsupported");
    expect(deriveLiteralFacts(input)).toMatchObject({ ok: false,
      refusal: { code: "harmony.upstream_contract_version_unsupported", path: ["source", field] } });
    expect(deriveLiteralFacts({ ...input, baseRevision: -1 })).toMatchObject({ ok: false, refusal: { code: "harmony.base_revision_invalid" } });
    expect(deriveLiteralFacts({ ...input, requestId: "", baseRevision: -1 })).toMatchObject({ ok: false, refusal: { code: "harmony.request_id_invalid" } });
  }
});

test("request ID and revision exact boundaries refuse without a partial value", () => {
  const input = request("Cmaj7");
  expect(deriveLiteralFacts({ ...input, requestId: "a".repeat(64), baseRevision: Number.MAX_SAFE_INTEGER }).ok).toBe(true);
  for (const id of ["", "a".repeat(65), "é", "two words", ".starts-with-dot"]) {
    const result = deriveLiteralFacts({ ...input, requestId: id });
    expect(result).toMatchObject({ ok: false, refusal: { code: "harmony.request_id_invalid" }, evidence: { termination: "input-refusal" } });
    expect("value" in result).toBe(false);
    allFrozen(result);
  }
  for (const baseRevision of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(deriveLiteralFacts({ ...input, baseRevision })).toMatchObject({ ok: false, refusal: { code: "harmony.base_revision_invalid" } });
  }
});

test("literal accounting counts selected semantic records, with an explicit 16/17 cap", () => {
  const input = request("Cmaj7");
  const result = deriveLiteralFacts(input);
  // Four degrees, four spellings, four match records, role slots (3+1+2),
  // one root, one literal and one rule reference: 21 output records.
  expect(result.evidence).toMatchObject({ t1ResolutionsVisited: 1, selectedRealizationDegreesVisited: 4,
    degreeComparisons: 4, emittedRecords: 21, termination: "complete" });
  expect(result.evidence.peakTrackedRecords).toBeGreaterThan(result.evidence.emittedRecords);
  // The public T1 semantic tuple is unbounded in TypeScript. These distinct
  // degree witnesses exercise H0's structural cap; they do not claim that the
  // T1 formula grammar can produce every such tuple from a chord symbol.
  const distinct: readonly ChordDegree[] = [
    { number: 1, alter: 0 }, { number: 2, alter: 0 }, { number: 3, alter: -1 }, { number: 3, alter: 0 },
    { number: 4, alter: 0 }, { number: 5, alter: -1 }, { number: 5, alter: 0 }, { number: 5, alter: 1 },
    { number: 6, alter: 0 }, { number: 7, alter: -2 }, { number: 7, alter: -1 }, { number: 7, alter: 0 },
    { number: 9, alter: -1 }, { number: 9, alter: 0 }, { number: 9, alter: 1 }, { number: 11, alter: 0 },
    { number: 13, alter: 0 },
  ];
  for (const count of [16, 17]) {
    const expanded = structuredClone(input);
    const literal = expanded.source.realizations[0];
    const degrees = distinct.slice(0, count);
    const spellings = degrees.map((degree) => {
      const spelling = spellChordDegree({ step: "C", alter: 0 }, degree);
      if (!spelling.ok) throw new Error("Unrepresentable boundary spelling");
      return spelling.value;
    });
    Reflect.set(literal, "degrees", degrees);
    Reflect.set(literal, "spelledPitchNames", spellings.map((spelling) => spelling.spelled));
    Reflect.set(literal, "pitchClasses", spellings.map((spelling) => spelling.pitchClass));
    const actual = deriveLiteralFacts(expanded);
    if (count === 16) expect(actual.ok).toBe(true);
    else {
      expect(actual).toMatchObject({ ok: false, refusal: { code: "limit.harmony_evidence_records_exceeded", field: "matchComponents", received: 17, maximum: 16 } });
      expect("value" in actual).toBe(false);
    }
  }
});
