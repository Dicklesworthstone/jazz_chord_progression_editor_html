import { expect, test } from "bun:test";
import ts from "typescript";

import { compilePlaybackPlan } from "../../src/playback";
import {
  observeP0Case,
  p0FixtureCase,
  requireP0Record,
} from "../support/p0-conformance";
import { materializeP0TimelineCase } from
  "../support/p0-playback-fixtures";

const PRODUCTION_FILES = Object.freeze([
  "src/playback/compile-playback-plan.ts",
  "src/playback/index.ts",
  "src/playback/playback-plan-contract.ts",
] as const);

const COUNTER_NAMES = Object.freeze([
  "audioCalls",
  "fetchCalls",
  "xhrCalls",
  "webSocketCalls",
  "storageCalls",
  "dateCalls",
  "performanceNowCalls",
  "randomCalls",
  "localeCompareCalls",
  "modelClientCalls",
] as const);

type CapabilityCounterName = (typeof COUNTER_NAMES)[number];
type CapabilityCounters = Record<CapabilityCounterName, number>;

function emptyCounters(): CapabilityCounters {
  return Object.fromEntries(COUNTER_NAMES.map((name) => [name, 0])) as
    CapabilityCounters;
}

function importIsTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause?.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  const bindings = clause?.namedBindings;
  return bindings !== undefined && ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every(({ isTypeOnly }) => isTypeOnly);
}

function inspectBoundary(
  path: string,
  sourceText: string,
): Readonly<{
  counters: CapabilityCounters;
  forbiddenImports: readonly string[];
  runtimeTheoryImports: number;
  synchronousCompilerDeclarations: number;
}> {
  const source = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const counters = emptyCounters();
  const forbiddenImports: string[] = [];
  let runtimeTheoryImports = 0;
  let synchronousCompilerDeclarations = 0;

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const typeOnly = importIsTypeOnly(statement);
      if (specifier === "../theory" && !typeOnly) runtimeTheoryImports += 1;
      if (
        !specifier.startsWith("./") && specifier !== "../domain" &&
        specifier !== "../theory"
      ) forbiddenImports.push(specifier);
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "compilePlaybackPlan" &&
      statement.asteriskToken === undefined &&
      !statement.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword)
    ) synchronousCompilerDeclarations += 1;
  }

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      if (node.text === "AudioContext" || node.text === "OfflineAudioContext") {
        counters.audioCalls += 1;
      } else if (node.text === "fetch") {
        counters.fetchCalls += 1;
      } else if (node.text === "XMLHttpRequest") {
        counters.xhrCalls += 1;
      } else if (node.text === "WebSocket" || node.text === "EventSource") {
        counters.webSocketCalls += 1;
      } else if (
        node.text === "localStorage" || node.text === "sessionStorage" ||
        node.text === "indexedDB"
      ) {
        counters.storageCalls += 1;
      } else if (node.text === "Date") {
        counters.dateCalls += 1;
      } else if (
        node.text === "modelClient" || node.text === "ModelClient" ||
        node.text === "OpenAI" || node.text === "Anthropic"
      ) {
        counters.modelClientCalls += 1;
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      const owner = node.expression.getText(source);
      if (owner === "performance" && node.name.text === "now") {
        counters.performanceNowCalls += 1;
      }
      if (owner === "Math" && node.name.text === "random") {
        counters.randomCalls += 1;
      }
      if (node.name.text === "localeCompare") counters.localeCompareCalls += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return Object.freeze({
    counters,
    forbiddenImports: Object.freeze(forbiddenImports),
    runtimeTheoryImports,
    synchronousCompilerDeclarations,
  });
}

test("P0-LAW-013 has an explicit zero-capability, offline source boundary", async () => {
  const law = p0FixtureCase("P0-LAW-013").row;
  const expectedCounters = requireP0Record(
    law["capabilityTrapCounters"],
    "P0-LAW-013.capabilityTrapCounters",
  );
  const inspections = await Promise.all(PRODUCTION_FILES.map(async (path) =>
    inspectBoundary(path, await Bun.file(path).text())
  ));
  const actualCounters = emptyCounters();
  for (const inspection of inspections) {
    for (const name of COUNTER_NAMES) {
      actualCounters[name] += inspection.counters[name];
    }
  }

  expect(Object.keys(expectedCounters).sort()).toEqual(
    [...COUNTER_NAMES].sort(),
  );
  for (const name of COUNTER_NAMES) {
    const expected = expectedCounters[name];
    if (typeof expected !== "number") {
      throw new TypeError(`P0_LAW_013_COUNTER:${name}`);
    }
    expect(actualCounters[name]).toBe(expected);
  }
  expect(inspections.flatMap(({ forbiddenImports }) => forbiddenImports))
    .toEqual([]);
  expect(
    inspections.reduce(
      (count, { runtimeTheoryImports }) => count + runtimeTheoryImports,
      0,
    ),
  ).toBe(0);
  expect(
    inspections.reduce(
      (count, { synchronousCompilerDeclarations }) =>
        count + synchronousCompilerDeclarations,
      0,
    ),
  ).toBe(1);
});

test("P0-LAW-013 compilation returns synchronously without a wall-time cutoff", () => {
  const returned = compilePlaybackPlan(
    materializeP0TimelineCase("P0-TIME-001").request,
  );
  expect(returned).not.toBeInstanceOf(Promise);
  expect(returned.ok).toBe(true);
  if (!returned.ok) throw new Error(`P0_LAW_013:${returned.refusal.code}`);
  expect(returned.evidence.termination).toBe("complete");

  const observation = observeP0Case("P0-LAW-013");
  expect(observation.actualProjectionSha256).toBe(
    observation.expectedProjectionSha256,
  );
});
