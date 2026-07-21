import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

import {
  ACCIDENTAL_STYLES,
  CHART_ERROR_CODES,
  CHART_TEXT_DRAFT_SCHEMA,
  CHART_TEXT_GRAMMAR_ID,
  CHART_TEXT_GRAMMAR_VERSION,
  CHART_WARNING_CODES,
  CHORD_SYMBOL_GRAMMAR_ID,
  CHORD_SYMBOL_GRAMMAR_VERSION,
  CHORD_SYMBOL_SUGGESTION_POLICY_ID,
  CHORD_SYMBOL_SUGGESTION_POLICY_VERSION,
  CHORD_SYMBOL_SUGGESTION_REPLACEMENTS,
  MAX_CHART_EVENTS,
  MAX_CHART_MEASURES_PER_SECTION,
  MAX_CHART_SECTIONS,
  MAX_CHART_TOKENS,
  MAX_CHART_UTF8_BYTES,
  MAX_DID_YOU_MEAN,
  MAX_SUGGESTION_COMPARISONS,
  MAX_SYMBOL_CODE_POINTS,
  MAX_SYMBOL_MODIFIERS,
  MAX_SYMBOL_TOKENS,
  parseChordSymbol,
  SYMBOL_ERROR_CODES,
  SYNTAX_CONTRACT_SCHEMA,
  syntaxOperations,
  type ChartDiagnostic,
  type ChartTextDraft,
  type ChartTextParseRequest,
  type ChartTextParseResult,
  type ChordSymbolFormatResult,
  type ChordSymbolParseResult,
  type ChordSymbolSuggestionReplacement,
  type InsertableChartChord,
  type ParseChartText,
  type ParseChordSymbol,
  type SourceRange,
  type SymbolDiagnostic,
  type SyntaxDiagnostic,
  type SyntaxOperations,
} from "../../src/theory";
import type { ChordSpec, Meter } from "../../src/domain";
import type {
  ChartSyntaxResultWithEvidence,
  DelegatedSymbolWorkEvidence,
  ParseChartTextWithEvidence,
  ParseChordSymbolWithEvidence,
  SyntaxResultWithEvidence,
  SyntaxWorkEvidence,
} from "../../src/theory/syntax-evidence-contract";
import {
  T0_REVIEWED_CHART_ERROR_CODES,
  T0_REVIEWED_CHART_WARNING_CODES,
  T0_REVIEWED_LIMITS,
  T0_REVIEWED_PUBLIC_CONTRACT,
  T0_REVIEWED_SUGGESTION_POLICY,
  T0_REVIEWED_SYMBOL_ERROR_CODES,
  validateT0Contract,
  type T0ContractValidationReport,
} from "../../scripts/validate-t0-contract";

setDefaultTimeout(60_000);

type JsonObject = Record<string, unknown>;
type Assert<T extends true> = T;
type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type Not<Value extends boolean> = Value extends true ? false : true;
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value ? true : false;

type SymbolSuccess = Extract<ChordSymbolParseResult, { ok: true }>;
type SymbolFailure = Extract<ChordSymbolParseResult, { ok: false }>;
type SymbolFormatFailure = Extract<ChordSymbolFormatResult, { ok: false }>;
type ChartSuccess = Extract<ChartTextParseResult, { ok: true }>;
type ChartFailure = Extract<ChartTextParseResult, { ok: false }>;
type WorkTermination = SyntaxWorkEvidence["termination"];

const typeAssertions: readonly [
  Assert<Equal<keyof SourceRange, "end" | "start">>,
  Assert<Equal<keyof SyntaxDiagnostic<string>, "code" | "message" | "range">>,
  Assert<Equal<SymbolSuccess["chord"], ChordSpec>>,
  Assert<Equal<SymbolSuccess["warnings"], readonly []>>,
  Assert<Equal<keyof SymbolFailure, "diagnostics" | "didYouMean" | "ok" | "sourceText">>,
  Assert<SymbolFailure["diagnostics"] extends readonly [SymbolDiagnostic, ...SymbolDiagnostic[]] ? true : false>,
  Assert<SymbolFormatFailure["diagnostics"] extends readonly [SymbolDiagnostic, ...SymbolDiagnostic[]] ? true : false>,
  Assert<Equal<ChartSuccess["draft"], ChartTextDraft>>,
  Assert<ChartFailure["diagnostics"] extends readonly [ChartDiagnostic, ...ChartDiagnostic[]] ? true : false>,
  Assert<Equal<ChartFailure["insertableChords"][number], InsertableChartChord>>,
  Assert<Equal<InsertableChartChord["layoutContextPreserved"], false>>,
  Assert<Not<HasKey<ChartTextDraft, "id">>>,
  Assert<Not<HasKey<ChartTextDraft, "revision">>>,
  Assert<Not<HasKey<ChartTextDraft, "voicing">>>,
  Assert<Equal<ChartTextParseRequest["mode"], "document" | "fragment">>,
  Assert<Equal<Extract<ChartTextParseRequest, { mode: "fragment" }>["meter"], Meter>>,
  Assert<Equal<Parameters<ParseChordSymbol>, [sourceText: string, accidentalStyle: "ascii" | "unicode"]>>,
  Assert<Equal<ReturnType<ParseChordSymbol>, ChordSymbolParseResult>>,
  Assert<Equal<Parameters<ParseChartText>[0], string>>,
  Assert<Equal<ReturnType<ParseChartText>, ChartTextParseResult>>,
  Assert<Equal<keyof SyntaxOperations, "formatChartText" | "formatChordSymbol" | "parseChartText" | "parseChordSymbol">>,
  Assert<Equal<ChordSymbolSuggestionReplacement, (typeof CHORD_SYMBOL_SUGGESTION_REPLACEMENTS)[number]>>,
  Assert<Equal<keyof SyntaxResultWithEvidence<unknown>, "evidence" | "result">>,
  Assert<Equal<keyof ChartSyntaxResultWithEvidence<unknown>, "delegatedSymbols" | "evidence" | "result">>,
  Assert<Equal<keyof DelegatedSymbolWorkEvidence, "delegationOrdinal" | "evidence" | "symbolRange">>,
  Assert<Equal<ReturnType<ParseChordSymbolWithEvidence>["result"], ChordSymbolParseResult>>,
  Assert<Equal<ReturnType<ParseChartTextWithEvidence>["result"], ChartTextParseResult>>,
  Assert<Equal<ReturnType<ParseChartTextWithEvidence>["delegatedSymbols"][number], DelegatedSymbolWorkEvidence>>,
  Assert<Equal<
    WorkTermination,
    | "complete"
    | "symbol-code-points"
    | "symbol-tokens"
    | "symbol-modifiers"
    | "chart-bytes"
    | "chart-tokens"
    | "chart-text-code-points"
    | "chart-sections"
    | "chart-measures"
    | "chart-events"
  >>,
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/theory", import.meta.url),
);
const validatorPath = fileURLToPath(
  new URL("../../scripts/validate-t0-contract.ts", import.meta.url),
);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`T0_TEST_OBJECT: ${label}`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`T0_TEST_ARRAY: ${label}`);
  return value;
}

async function readJsonObject(path: string): Promise<JsonObject> {
  return requireObject(JSON.parse(await readFile(path, "utf8")), path);
}

async function mutateJson(
  root: string,
  filename: string,
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const value = await readJsonObject(path);
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "jcpe t0 contract Ω path-"));
  const root = join(parent, "reviewed theory fixtures");
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function findingCodes(report: T0ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

async function expectRejected(
  root: string,
  ...codes: readonly string[]
): Promise<T0ContractValidationReport> {
  const report = await validateT0Contract(root);
  expect(report.outcome).toBe("fail");
  const actual = findingCodes(report);
  for (const code of codes) expect(actual).toContain(code);
  return report;
}

describe("T0 public syntax contract", () => {
  test("preserves the exact public type shapes", () => {
    expect([...typeAssertions]).toEqual(
      Array.from({ length: typeAssertions.length }, () => true),
    );
  });

  test("exports the independently reviewed constants and code inventories", () => {
    expect(SYNTAX_CONTRACT_SCHEMA).toBe(T0_REVIEWED_PUBLIC_CONTRACT.syntaxSchema);
    expect(CHORD_SYMBOL_GRAMMAR_ID).toBe(T0_REVIEWED_PUBLIC_CONTRACT.symbolGrammarId);
    expect(CHORD_SYMBOL_GRAMMAR_VERSION).toBe(
      T0_REVIEWED_PUBLIC_CONTRACT.symbolGrammarVersion,
    );
    expect(CHART_TEXT_GRAMMAR_ID).toBe(T0_REVIEWED_PUBLIC_CONTRACT.chartGrammarId);
    expect(CHART_TEXT_GRAMMAR_VERSION).toBe(
      T0_REVIEWED_PUBLIC_CONTRACT.chartGrammarVersion,
    );
    expect(CHART_TEXT_DRAFT_SCHEMA).toBe(T0_REVIEWED_PUBLIC_CONTRACT.chartDraftSchema);
    expect(ACCIDENTAL_STYLES).toEqual(["ascii", "unicode"]);
    expect(SYMBOL_ERROR_CODES).toEqual(T0_REVIEWED_SYMBOL_ERROR_CODES);
    expect(CHART_ERROR_CODES).toEqual(T0_REVIEWED_CHART_ERROR_CODES);
    expect(CHART_WARNING_CODES).toEqual(T0_REVIEWED_CHART_WARNING_CODES);
    expect({
      symbolCodePoints: MAX_SYMBOL_CODE_POINTS,
      symbolTokens: MAX_SYMBOL_TOKENS,
      symbolModifiers: MAX_SYMBOL_MODIFIERS,
      chartUtf8Bytes: MAX_CHART_UTF8_BYTES,
      chartTokens: MAX_CHART_TOKENS,
      chartSections: MAX_CHART_SECTIONS,
      chartMeasuresPerSection: MAX_CHART_MEASURES_PER_SECTION,
      chartEvents: MAX_CHART_EVENTS,
    }).toEqual({
      symbolCodePoints: T0_REVIEWED_LIMITS.symbolCodePoints,
      symbolTokens: T0_REVIEWED_LIMITS.symbolTokens,
      symbolModifiers: T0_REVIEWED_LIMITS.symbolModifiers,
      chartUtf8Bytes: T0_REVIEWED_LIMITS.chartUtf8Bytes,
      chartTokens: T0_REVIEWED_LIMITS.chartTokens,
      chartSections: T0_REVIEWED_LIMITS.chartSections,
      chartMeasuresPerSection: T0_REVIEWED_LIMITS.chartMeasuresPerSection,
      chartEvents: T0_REVIEWED_LIMITS.chartEvents,
    });
    expect(MAX_DID_YOU_MEAN).toBe(3);
    expect(MAX_SUGGESTION_COMPARISONS).toBe(64);
    expect(CHORD_SYMBOL_SUGGESTION_POLICY_ID).toBe(
      T0_REVIEWED_SUGGESTION_POLICY.id,
    );
    expect(CHORD_SYMBOL_SUGGESTION_POLICY_VERSION).toBe(
      T0_REVIEWED_SUGGESTION_POLICY.version,
    );
    expect(CHORD_SYMBOL_SUGGESTION_REPLACEMENTS).toEqual(
      T0_REVIEWED_SUGGESTION_POLICY.replacements,
    );
  });

  test("keeps every exported collection and operation surface immutable", () => {
    const before = parseChordSymbol("Cfoo", "ascii");
    const firstReplacement = CHORD_SYMBOL_SUGGESTION_REPLACEMENTS[0];
    for (const exportedCollection of [
      ACCIDENTAL_STYLES,
      SYMBOL_ERROR_CODES,
      CHART_ERROR_CODES,
      CHART_WARNING_CODES,
      CHORD_SYMBOL_SUGGESTION_REPLACEMENTS,
    ]) {
      expect(Object.isFrozen(exportedCollection)).toBe(true);
    }
    expect(
      CHORD_SYMBOL_SUGGESTION_REPLACEMENTS.every((replacement) =>
        Object.isFrozen(replacement),
      ),
    ).toBe(true);
    expect(Object.isFrozen(syntaxOperations)).toBe(true);
    expect(firstReplacement).toBeDefined();

    expect(() => {
      const mutableView = firstReplacement as unknown as {
        replacementToken: string;
      };
      mutableView.replacementToken = "m";
    }).toThrow(TypeError);
    expect(parseChordSymbol("Cfoo", "ascii")).toEqual(before);
  });
});

describe("T0 independent fixture validator", () => {
  test("passes with exact reviewed counts and is byte-for-byte deterministic", async () => {
    const first = await validateT0Contract(fixtureRoot);
    const second = await validateT0Contract(fixtureRoot);
    expect(first).toEqual(second);
    expect(first).toEqual({
      schema: "changes.validation.t0-contract.v1",
      package: "T0",
      outcome: "pass",
      counts: {
        companions: 6,
        symbolCases: 111,
        chartCases: 82,
        metamorphicLaws: 17,
        totalCases: 210,
        traces: 25,
        authorities: 7,
        seeds: 4,
        mutationControls: 60,
      },
      findings: [],
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  test("rejects schema, limits, and independence tampering in isolated copies", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "symbol-cases.json", (value) => {
        value["schema"] = "changes.fixtures.t0-symbol-cases.v999";
      });
      await expectRejected(root, "T0_CONTRACT_SCHEMA");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "t0-syntax-contract.json", (value) => {
        requireObject(value["limits"], "limits")["symbolTokens"] = 65;
      });
      await expectRejected(root, "T0_CONTRACT_LIMITS");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "t0-syntax-contract.json", (value) => {
        const policy = requireObject(
          value["suggestionPolicy"],
          "suggestionPolicy",
        );
        const first = requireObject(
          requireArray(policy["replacements"], "replacements")[0],
          "replacements[0]",
        );
        first["replacementToken"] = "dim7";
      });
      await expectRejected(root, "T0_CONTRACT_PUBLIC");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "symbol-cases.json", (value) => {
        const boundary = requireObject(
          requireArray(value["boundaryCases"], "boundaryCases")[0],
          "boundaryCases[0]",
        );
        const expected = requireObject(
          boundary["expected"],
          "boundary expected",
        );
        const evidence = requireObject(
          expected["expectedEvidence"],
          "boundary expectedEvidence",
        );
        evidence["termination"] = "complete";
      });
      await expectRejected(root, "T0_CONTRACT_WORK_EVIDENCE");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "provenance-ledger.json", (value) => {
        value["expectedValuesGenerated"] = true;
      });
      await expectRejected(root, "T0_CONTRACT_INDEPENDENCE");
    });
  });

  test("rejects case, trace, and bidirectional-link tampering", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "symbol-cases.json", (value) => {
        const first = requireObject(
          requireArray(value["canonicalCases"], "canonicalCases")[0],
          "canonicalCases[0]",
        );
        first["traceIds"] = ["T0-TRACE-NOT-REAL"];
      });
      await expectRejected(root, "T0_CONTRACT_CASE_REF");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (value) => {
        const first = requireObject(
          requireArray(value["traces"], "traces")[0],
          "traces[0]",
        );
        first["caseIds"] = ["T0-CASE-NOT-REAL"];
      });
      await expectRejected(root, "T0_CONTRACT_TRACE");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "trace-ledger.json", (value) => {
        const first = requireObject(
          requireArray(value["traces"], "traces")[0],
          "traces[0]",
        );
        const caseIds = requireArray(first["caseIds"], "traces[0].caseIds");
        first["caseIds"] = caseIds.slice(1);
      });
      await expectRejected(root, "T0_CONTRACT_TRACE_LINK");
    });
  });

  test("rejects mutation and authority tampering", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "mutation-controls.json", (value) => {
        const first = requireObject(
          requireArray(value["controls"], "controls")[0],
          "controls[0]",
        );
        first["killedByCaseIds"] = ["T0-CASE-NOT-REAL"];
      });
      await expectRejected(root, "T0_CONTRACT_MUTATION");
    });
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "provenance-ledger.json", (value) => {
        const first = requireObject(
          requireArray(value["authorities"], "authorities")[0],
          "authorities[0]",
        );
        first["authorityClass"] = "production-says-so";
      });
      await expectRejected(root, "T0_CONTRACT_AUTHORITY");
    });
  });

  test("separates byte-digest drift from semantic drift", async () => {
    await withFixtureCopy(async (root) => {
      const path = join(root, "roundtrip-cases.json");
      await writeFile(path, `${await readFile(path, "utf8")}\n`, "utf8");
      const report = await expectRejected(root, "T0_CONTRACT_BYTE_DIGEST");
      expect(findingCodes(report)).not.toContain("T0_CONTRACT_SEMANTIC_DIGEST");
    });
  });

  test("detects duplicate decoded JSON keys before last-key-wins parsing", async () => {
    await withFixtureCopy(async (root) => {
      const path = join(root, "t0-syntax-contract.json");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source.replace(
          /\{\s*"schema"/u,
          '{\n  "\\u0073chema": "changes.fixtures.t0-syntax-contract.v1",\n  "schema"',
        ),
        "utf8",
      );
      await expectRejected(root, "T0_CONTRACT_DUPLICATE_KEY");
    });
  });

  test("imports no production module and contains no production oracle", async () => {
    const source = await readFile(validatorPath, "utf8");
    const sourceFile = ts.createSourceFile(
      validatorPath,
      source,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TS,
    );
    const imports: string[] = [];
    sourceFile.forEachChild((node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        imports.push(node.moduleSpecifier.text);
      }
    });
    const resolvedProductionImports = imports
      .filter((specifier) => specifier.startsWith("."))
      .map((specifier) => resolve(dirname(validatorPath), specifier))
      .filter((path) => path.includes(`${join("", "src")}/`) || path.endsWith("/src"));
    expect(resolvedProductionImports).toEqual([]);
    expect(source).not.toContain("parseChordSymbol(");
    expect(source).not.toContain("formatChordSymbol(");
    expect(source).not.toContain("parseChartText(");
    expect(source).not.toContain("formatChartText(");
  });
});
