import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import ts from "typescript";

import { inspectProjectSourcePolicy } from "../../scripts/source-policy";
import { realizeVoicing, type AutoVoicingRequest } from "../../src/theory";
import {
  V0_STATIC_ALLOWED_RUNTIME_IMPORT_PREFIXES,
  V0_STATIC_MARKER,
  V0_STATIC_PRODUCER,
  V0_STATIC_SCHEMA,
  V0_STATIC_SOURCE_FILES,
  signV0EvidenceObservation,
  v0EvidenceDigest,
} from "../../scripts/verify-v0-evidence";
import {
  buildV0CandidateRequest,
  v0CandidateCase,
} from "../support/v0-voicing-fixture";

type SourceAudit = Readonly<{
  path: string;
  runtimeImports: readonly string[];
  forbiddenImports: readonly string[];
  fixtureOrTestSupportImports: readonly string[];
  forbiddenRuntimeReferences: readonly string[];
  forbiddenRequestFields: readonly string[];
  moduleMutableBindings: number;
  asyncOrGeneratorFunctions: number;
}>;

const INTERNAL_V0_IMPORTS = Object.freeze([
  "./voicing-applicability",
  "./voicing-candidates",
  "./voicing-candidates-contract",
  "./voicing-engine-primitives",
  "./voicing-family-authority",
  "./voicing-operations",
] as const);

const FORBIDDEN_RUNTIME_NAMES = new Set([
  "AudioContext", "Date", "EventSource", "Math.random", "Performance",
  "WebSocket", "XMLHttpRequest", "cancelAnimationFrame", "clearInterval",
  "clearTimeout", "crypto", "document", "fetch", "globalThis", "indexedDB",
  "localStorage", "navigator", "performance", "queueMicrotask",
  "requestAnimationFrame", "sessionStorage", "setInterval", "setTimeout",
  "window",
]);

const FORBIDDEN_REQUEST_FIELDS = new Set([
  "cancelToken", "cancellation", "elapsedTime", "next", "pairwiseCost",
  "previous", "revision", "staleRevision", "voiceId", "wallTime",
]);

function importIsTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  if (clause.name !== undefined) return false;
  const bindings = clause.namedBindings;
  if (bindings === undefined || ts.isNamespaceImport(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every(({ isTypeOnly }) =>
    isTypeOnly
  );
}

function propertyName(node: ts.Node): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function auditSource(path: string): SourceAudit {
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  const runtimeImports: string[] = [];
  const fixtureOrTestSupportImports: string[] = [];
  const forbiddenRuntimeReferences = new Set<string>();
  const forbiddenRequestFields = new Set<string>();
  let moduleMutableBindings = 0;
  let asyncOrGeneratorFunctions = 0;

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) &&
        ts.isStringLiteralLike(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (!importIsTypeOnly(statement)) runtimeImports.push(specifier);
      if (/(?:^|\/)(?:fixtures|test-support|tests)(?:\/|$)/u.test(specifier)) {
        fixtureOrTestSupportImports.push(specifier);
      }
    }
    if (ts.isVariableStatement(statement) &&
        (statement.declarationList.flags & ts.NodeFlags.BlockScoped) === 0) {
      moduleMutableBindings += statement.declarationList.declarations.length;
    }
    if (ts.isVariableStatement(statement) &&
        (statement.declarationList.flags & ts.NodeFlags.Let) !== 0) {
      moduleMutableBindings += statement.declarationList.declarations.length;
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      const modifiers = ts.canHaveModifiers(node)
        ? ts.getModifiers(node)
        : undefined;
      const async = modifiers?.some(({ kind }) =>
        kind === ts.SyntaxKind.AsyncKeyword
      ) ?? false;
      const generator = "asteriskToken" in node && node.asteriskToken !== undefined;
      if (async || generator) asyncOrGeneratorFunctions += 1;
    }
    if (ts.isIdentifier(node) && FORBIDDEN_RUNTIME_NAMES.has(node.text)) {
      forbiddenRuntimeReferences.add(node.text);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const dotted = `${node.expression.getText(source)}.${node.name.text}`;
      if (FORBIDDEN_RUNTIME_NAMES.has(dotted)) forbiddenRuntimeReferences.add(dotted);
      if (FORBIDDEN_REQUEST_FIELDS.has(node.name.text)) {
        forbiddenRequestFields.add(node.name.text);
      }
    }
    if (ts.isPropertyAssignment(node) || ts.isPropertySignature(node) ||
        ts.isPropertyDeclaration(node) || ts.isMethodSignature(node)) {
      const name = propertyName(node.name);
      if (name !== null && FORBIDDEN_REQUEST_FIELDS.has(name)) {
        forbiddenRequestFields.add(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const forbiddenImports = runtimeImports.filter((specifier) =>
    !V0_STATIC_ALLOWED_RUNTIME_IMPORT_PREFIXES.some((prefix) =>
      specifier === prefix || specifier.startsWith(`${prefix}/`)
    ) && !INTERNAL_V0_IMPORTS.includes(
      specifier as (typeof INTERNAL_V0_IMPORTS)[number],
    )
  );
  return Object.freeze({
    path,
    runtimeImports: Object.freeze(runtimeImports),
    forbiddenImports: Object.freeze(forbiddenImports),
    fixtureOrTestSupportImports: Object.freeze(fixtureOrTestSupportImports),
    forbiddenRuntimeReferences: Object.freeze([...forbiddenRuntimeReferences]),
    forbiddenRequestFields: Object.freeze([...forbiddenRequestFields]),
    moduleMutableBindings,
    asyncOrGeneratorFunctions,
  });
}

test(
  "keeps V0 pure, synchronous, local, and isolated from ambient state",
  async () => {
    const audits = V0_STATIC_SOURCE_FILES.map(auditSource);
    const forbiddenImports = audits.flatMap(({ path, forbiddenImports: values }) =>
      values.map((specifier) => `${path}:${specifier}`)
    );
    const forbiddenRuntimeReferences = audits.flatMap(
      ({ path, forbiddenRuntimeReferences: values }) =>
        values.map((name) => `${path}:${name}`),
    );
    const forbiddenRequestFields = audits.flatMap(
      ({ path, forbiddenRequestFields: values }) =>
        values.map((name) => `${path}:${name}`),
    );
    const fixtureOrTestSupportImports = audits.flatMap(
      ({ path, fixtureOrTestSupportImports: values }) =>
        values.map((specifier) => `${path}:${specifier}`),
    );
    const moduleMutableBindings = audits.reduce(
      (sum, audit) => sum + audit.moduleMutableBindings,
      0,
    );
    const asyncOrGeneratorFunctions = audits.reduce(
      (sum, audit) => sum + audit.asyncOrGeneratorFunctions,
      0,
    );

    expect(forbiddenImports).toEqual([]);
    expect(forbiddenRuntimeReferences).toEqual([]);
    expect(forbiddenRequestFields).toEqual([]);
    expect(fixtureOrTestSupportImports).toEqual([]);
    expect(moduleMutableBindings).toBe(0);
    expect(asyncOrGeneratorFunctions).toBe(0);
    const projectSourcePolicy = await inspectProjectSourcePolicy();
    expect(projectSourcePolicy.outcome).toBe("pass");
    expect(projectSourcePolicy.findings).toEqual([]);

    const base = buildV0CandidateRequest(v0CandidateCase("V0-CAND-001"));
    if (base.kind !== "auto") throw new Error("V0-CAND-001 must be Auto");
    const extended = Object.freeze({
      ...base,
      previous: Object.freeze({ id: "static-ambient-previous" }),
      next: Object.freeze({ id: "static-ambient-next" }),
      voiceId: "static-ambient-voice",
      pairwiseCost: 9_999,
      cancellation: Object.freeze({ requested: true }),
      staleRevision: 8_888,
      elapsedTime: 7_777,
    }) as unknown as AutoVoicingRequest;
    const baseline = realizeVoicing(base);
    const originalNow = Date.now;
    const originalRandom = Math.random;
    let perturbed: ReturnType<typeof realizeVoicing>;
    try {
      Date.now = () => 5_555_555_555_555;
      Math.random = () => 0.246_813_579;
      perturbed = realizeVoicing(extended);
    } finally {
      Date.now = originalNow;
      Math.random = originalRandom;
    }
    const operationSynchronous = !(baseline instanceof Promise) &&
      !(perturbed instanceof Promise);
    const ambientReplayDeeplyEqual = JSON.stringify(baseline) ===
      JSON.stringify(perturbed);
    expect(operationSynchronous).toBe(true);
    expect(ambientReplayDeeplyEqual).toBe(true);

    const payload = {
      schema: V0_STATIC_SCHEMA,
      suite: "v0-production-policy",
      producer: V0_STATIC_PRODUCER,
      sourceFiles: V0_STATIC_SOURCE_FILES,
      allowedRuntimeImportPrefixes: V0_STATIC_ALLOWED_RUNTIME_IMPORT_PREFIXES,
      inspectedRuntimeImports: audits.flatMap(({ path, runtimeImports }) =>
        runtimeImports.map((specifier) => `${path}:${specifier}`)
      ),
      forbiddenImports,
      forbiddenRuntimeReferences,
      forbiddenRequestFields,
      fixtureOrTestSupportImports,
      moduleMutableBindings,
      asyncOrGeneratorFunctions,
      operationSynchronous,
      ambientReplayDeeplyEqual,
      projectSourcePolicy,
      applicability: {
        cancellation: false,
        staleRevision: false,
        browser: false,
        audio: false,
        storage: false,
      },
      status: "pass",
    } as const;
    const signed = signV0EvidenceObservation(payload);
    expect(signed.semanticDigest).toBe(v0EvidenceDigest(payload));
    console.log(`${V0_STATIC_MARKER}${JSON.stringify(signed)}`);
  },
);
