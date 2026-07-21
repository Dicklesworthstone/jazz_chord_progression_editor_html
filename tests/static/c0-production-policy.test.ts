import { readFile } from "node:fs/promises";

import { expect, test } from "bun:test";
import ts from "typescript";

import {
  c0EvidenceDigest,
  stableC0EvidenceJson,
} from "../../scripts/verify-c0-evidence";

const productionFiles = Object.freeze([
  "src/compatibility/index.ts",
  "src/compatibility/legacy-migration-contract.ts",
  "src/compatibility/legacy-migration.ts",
] as const);
const implementationFile = "src/compatibility/legacy-migration.ts";
const publicBarrelFile = "src/compatibility/index.ts";
const legalImports = new Set([
  "../domain",
  "../theory",
  "./legacy-migration-contract",
]);
const expectedImportBindings = Object.freeze([
  "src/compatibility/legacy-migration-contract.ts|../domain|runtime",
  "src/compatibility/legacy-migration-contract.ts|../theory|type",
  "src/compatibility/legacy-migration.ts|../domain|runtime",
  "src/compatibility/legacy-migration.ts|./legacy-migration-contract|runtime",
] as const);
const expectedReexportBindings = Object.freeze([
  "src/compatibility/index.ts|./legacy-migration-contract|runtime|named",
  "src/compatibility/index.ts|./legacy-migration-contract|type|named",
  "src/compatibility/index.ts|./legacy-migration|runtime|named",
] as const);
const expectedPublicExports = Object.freeze([
  "LEGACY_ALTERATION_FLAG_ENTRIES",
  "LEGACY_AUTO_VOICING_DEFAULT",
  "LEGACY_CANONICALIZED_CODES",
  "LEGACY_CHORD_FIELDS",
  "LEGACY_CUSTOM_CODES",
  "LEGACY_DOCUMENT_DEFAULTS",
  "LEGACY_DOCUMENT_FIELDS",
  "LEGACY_IGNORED_CODES",
  "LEGACY_MIGRATION_APPLICABILITY",
  "LEGACY_MIGRATION_CANDIDATE_SCHEMA",
  "LEGACY_MIGRATION_CONTRACT_SCHEMA",
  "LEGACY_MIGRATION_OPERATION_NAMES",
  "LEGACY_MIGRATION_POLICY_ID",
  "LEGACY_MIGRATION_POLICY_VERSION",
  "LEGACY_MIGRATION_REFUSAL_CODES",
  "LEGACY_MIGRATION_REPORT_SCHEMA",
  "LEGACY_MIGRATION_TERMINATIONS",
  "LEGACY_MIGRATION_WORK_COUNTER_NAMES",
  "LEGACY_PITCH_CLASS_PATTERN_SOURCE",
  "LEGACY_PRESERVED_CODES",
  "LEGACY_REJECTED_CODES",
  "LEGACY_REPORT_CODE_ORDER",
  "LEGACY_REPORT_GROUPS",
  "LEGACY_SCIENTIFIC_PITCH_PATTERN_SOURCE",
  "LEGACY_SECTION_FIELDS",
  "LEGACY_TYPE_SUFFIX_ENTRIES",
  "LEGACY_UI_ONLY_FIELDS",
  "LEGACY_VOICING_METADATA_FIELDS",
  "LegacyAlterationFlag",
  "LegacyCanonicalizedCode",
  "LegacyChordType",
  "LegacyCustomCode",
  "LegacyIdentityMapping",
  "LegacyIgnoredCode",
  "LegacyMigrationCandidate",
  "LegacyMigrationDependencies",
  "LegacyMigrationOperationName",
  "LegacyMigrationOperations",
  "LegacyMigrationRefusal",
  "LegacyMigrationRefusalCode",
  "LegacyMigrationReport",
  "LegacyMigrationRequest",
  "LegacyMigrationResult",
  "LegacyMigrationSummary",
  "LegacyMigrationTermination",
  "LegacyMigrationWorkCounters",
  "LegacyPreservedCode",
  "LegacyRejectedCode",
  "LegacyReportCode",
  "LegacyReportGroup",
  "LegacyReportItem",
  "MAX_LEGACY_BYTES_VISITED",
  "MAX_LEGACY_CHORDS",
  "MAX_LEGACY_CHORDS_PER_SECTION",
  "MAX_LEGACY_CHORD_SLOTS_VISITED",
  "MAX_LEGACY_IDENTITY_MAPPINGS",
  "MAX_LEGACY_ID_REQUESTS",
  "MAX_LEGACY_JSON_DEPTH",
  "MAX_LEGACY_LONG_TEXT_CODE_POINTS",
  "MAX_LEGACY_NOTES_VISITED",
  "MAX_LEGACY_REPORT_ITEMS",
  "MAX_LEGACY_RESOLUTION_CALLS",
  "MAX_LEGACY_SECTIONS",
  "MAX_LEGACY_SECTIONS_VISITED",
  "MAX_LEGACY_SHORT_TEXT_CODE_POINTS",
  "MAX_LEGACY_SOURCE_PROPERTIES",
  "MAX_LEGACY_SYMBOL_PARSE_CALLS",
  "MAX_LEGACY_TRACKED_RECORDS",
  "MAX_LEGACY_UTF8_BYTES",
  "MAX_TRUSTED_LEGACY_NOTES",
  "MIN_TRUSTED_LEGACY_NOTES",
  "MigrateLegacyJson",
  "legacyMigrationOperations",
  "migrateLegacyJson",
] as const);

type SourceUnit = Readonly<{
  path: string;
  source: string;
  file: ts.SourceFile;
}>;

function parseSource(path: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
}

function exportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function declarationNames(name: ts.BindingName): readonly string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : declarationNames(element.name)
  );
}

function implementationExports(file: ts.SourceFile): readonly string[] {
  const names: string[] = [];
  for (const statement of file.statements) {
    if (!exportModifier(statement)) continue;
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isModuleDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      names.push(statement.name.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        names.push(...declarationNames(declaration.name));
      }
    }
  }
  return [...new Set(names)].sort();
}

function publicExports(file: ts.SourceFile): readonly string[] {
  const names: string[] = [...implementationExports(file)];
  for (const statement of file.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const module = statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : "local";
    if (statement.exportClause === undefined) {
      names.push(`*:${module}`);
    } else if (ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        names.push(element.name.text);
        if (element.propertyName !== undefined) {
          names.push(element.propertyName.text);
        }
      }
    } else {
      names.push(`namespace:${statement.exportClause.name.text}:${module}`);
    }
  }
  return [...new Set(names)].sort();
}

function exportDeclarationIsTypeOnly(
  statement: ts.ExportDeclaration,
): boolean {
  if (statement.isTypeOnly) return true;
  const clause = statement.exportClause;
  return clause !== undefined &&
    ts.isNamedExports(clause) &&
    clause.elements.length > 0 &&
    clause.elements.every((element) => element.isTypeOnly);
}

function reexportKind(
  statement: ts.ExportDeclaration,
): "named" | "named-alias" | "namespace" | "star" {
  const clause = statement.exportClause;
  if (clause === undefined) return "star";
  if (ts.isNamespaceExport(clause)) return "namespace";
  return clause.elements.some((element) => element.propertyName !== undefined)
    ? "named-alias"
    : "named";
}

function reexportBindings(unit: SourceUnit): readonly string[] {
  return unit.file.statements.flatMap((statement) => {
    if (!ts.isExportDeclaration(statement)) return [];
    const specifier = statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : "local";
    return [
      `${unit.path}|${specifier}|${
        exportDeclarationIsTypeOnly(statement) ? "type" : "runtime"
      }|${reexportKind(statement)}`,
    ];
  });
}

function defaultExportPaths(unit: SourceUnit): readonly string[] {
  const paths: string[] = [];
  for (const statement of unit.file.statements) {
    if (ts.isExportAssignment(statement)) {
      paths.push(
        `${unit.path}:${
          statement.isExportEquals ? "export-equals" : "export-default-assignment"
        }`,
      );
    }
    if (
      ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) ?? []).some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      )
    ) {
      paths.push(`${unit.path}:default-declaration`);
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (
          element.name.text === "default" ||
          element.propertyName?.text === "default"
        ) {
          paths.push(`${unit.path}:default-reexport`);
        }
      }
    }
  }
  return paths.sort();
}

function importIsTypeOnly(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause;
  if (clause === undefined) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  if (clause.name !== undefined || clause.namedBindings === undefined) return false;
  return ts.isNamedImports(clause.namedBindings) &&
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function imports(unit: SourceUnit): readonly Readonly<{
  path: string;
  specifier: string;
  typeOnly: boolean;
}>[] {
  return unit.file.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return [];
    }
    return [{
      path: unit.path,
      specifier: statement.moduleSpecifier.text,
      typeOnly: importIsTypeOnly(statement),
    }];
  });
}

function isConstAssertion(node: ts.AsExpression): boolean {
  return ts.isTypeReferenceNode(node.type) &&
    ts.isIdentifier(node.type.typeName) &&
    node.type.typeName.text === "const";
}

function isObjectFreezeCall(node: ts.Node | undefined): boolean {
  return node !== undefined &&
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "Object" &&
    node.expression.name.text === "freeze";
}

function singleLineEvidenceJson(value: unknown): string {
  return JSON.stringify(JSON.parse(stableC0EvidenceJson(value)));
}

function forbiddenReferences(unit: SourceUnit): readonly string[] {
  const findings = new Set<string>();
  const forbiddenCalls = new Set([
    "eval",
    "fetch",
    "queueMicrotask",
    "require",
    "requestAnimationFrame",
    "setInterval",
    "setTimeout",
  ]);
  const forbiddenConstructors = new Set([
    "AudioContext",
    "Date",
    "EventSource",
    "Function",
    "Promise",
    "SharedWorker",
    "WebSocket",
    "Worker",
    "XMLHttpRequest",
  ]);
  const forbiddenProperties = new Set([
    "Date.now",
    "Math.random",
    "performance.now",
  ]);
  const forbiddenGlobals = new Set([
    "Bun",
    "Date",
    "Promise",
    "crypto",
    "fetch",
    "global",
    "globalThis",
    "indexedDB",
    "localStorage",
    "module",
    "navigator",
    "performance",
    "process",
    "require",
    "self",
    "sessionStorage",
    "window",
  ]);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      findings.add(`${unit.path}:dynamic-import`);
    }
    if (ts.isImportEqualsDeclaration(node)) {
      findings.add(`${unit.path}:import-equals`);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      forbiddenCalls.has(node.expression.text)
    ) {
      findings.add(`${unit.path}:${node.expression.text}`);
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      forbiddenConstructors.has(node.expression.text)
    ) {
      findings.add(`${unit.path}:${node.expression.text}`);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      forbiddenProperties.has(`${node.expression.text}.${node.name.text}`)
    ) {
      findings.add(`${unit.path}:${node.expression.text}.${node.name.text}`);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ts.isStringLiteral(node.argumentExpression) &&
      forbiddenProperties.has(
        `${node.expression.text}.${node.argumentExpression.text}`,
      )
    ) {
      findings.add(
        `${unit.path}:${node.expression.text}.${node.argumentExpression.text}`,
      );
    }
    if (
      ts.isIdentifier(node) &&
      forbiddenGlobals.has(node.text) &&
      !ts.isPropertyAssignment(node.parent) &&
      !ts.isPropertySignature(node.parent)
    ) {
      findings.add(`${unit.path}:${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(unit.file);
  return [...findings].sort();
}

test("keeps C0 pure, synchronous, candidate-only, and privately evidenced", async () => {
  const units = await Promise.all(
    productionFiles.map(async (path): Promise<SourceUnit> => {
      const source = await readFile(path, "utf8");
      return Object.freeze({ path, source, file: parseSource(path, source) });
    }),
  );
  const implementation = units.find(({ path }) => path === implementationFile);
  const publicBarrel = units.find(({ path }) => path === publicBarrelFile);
  if (implementation === undefined || publicBarrel === undefined) {
    throw new Error("C0_STATIC_SOURCE_MISSING");
  }

  const importBindings = units.flatMap(imports);
  const observedImportBindings = importBindings.map(({ path, specifier, typeOnly }) =>
    `${path}|${specifier}|${typeOnly ? "type" : "runtime"}`
  ).sort();
  const allImports = [...new Set(importBindings.map(({ specifier }) => specifier))]
    .sort();
  const forbiddenProjectImports = allImports.filter(
    (specifier) => !legalImports.has(specifier),
  );
  const fixtureOrTestImports = allImports.filter((specifier) =>
    /(?:^|\/)(?:fixtures|test-support|tests)(?:\/|$)/u.test(specifier)
  );
  expect(allImports).toEqual([...legalImports].sort());
  expect(observedImportBindings).toEqual([...expectedImportBindings].sort());
  expect(forbiddenProjectImports).toEqual([]);
  expect(fixtureOrTestImports).toEqual([]);

  const observedReexportBindings = units.flatMap(reexportBindings).sort();
  const observedDefaultExportPaths = units.flatMap(defaultExportPaths).sort();
  expect(observedReexportBindings).toEqual(
    [...expectedReexportBindings].sort(),
  );
  expect(observedDefaultExportPaths).toEqual([]);

  const deepExports = implementationExports(implementation.file);
  const barrelExports = publicExports(publicBarrel.file);
  expect(deepExports).toEqual([
    "legacyMigrationOperations",
    "migrateLegacyJson",
    "migrateLegacyJsonWithEvidence",
    "readLegacyArrayDataElement",
  ]);
  expect(barrelExports).toEqual([...expectedPublicExports].sort());

  let moduleMutableBindings = 0;
  let asyncOrGeneratorFunctions = 0;
  let productionCasts = 0;
  const forbiddenRuntimeReferences = units.flatMap(forbiddenReferences).sort();
  const immutableBindings: boolean[] = [];
  const immutableBindingNames = new Set(["document", "groups", "report"]);
  for (const unit of units) {
    for (const statement of unit.file.statements) {
      if (
        ts.isVariableStatement(statement) &&
        (statement.declarationList.flags & ts.NodeFlags.Const) === 0
      ) {
        moduleMutableBindings += statement.declarationList.declarations.length;
      }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionLike(node)) {
        const modifiers = ts.canHaveModifiers(node)
          ? ts.getModifiers(node) ?? []
          : [];
        if (
          ("asteriskToken" in node && node.asteriskToken !== undefined) ||
          modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
        ) {
          asyncOrGeneratorFunctions += 1;
        }
      }
      if (ts.isAsExpression(node) && !isConstAssertion(node)) {
        productionCasts += 1;
      } else if (ts.isTypeAssertionExpression(node)) {
        productionCasts += 1;
      }
      if (
        unit.path === implementationFile &&
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        (immutableBindingNames.has(node.name.text) ||
          (node.name.text === "result" &&
            node.type?.getText(unit.file) === "LegacyMigrationResult"))
      ) {
        immutableBindings.push(isObjectFreezeCall(node.initializer));
      }
      ts.forEachChild(node, visit);
    };
    visit(unit.file);
  }
  expect(moduleMutableBindings).toBe(0);
  expect(asyncOrGeneratorFunctions).toBe(0);
  expect(productionCasts).toBe(0);
  expect(forbiddenRuntimeReferences).toEqual([]);
  expect(immutableBindings.length).toBeGreaterThanOrEqual(5);
  expect(immutableBindings.every(Boolean)).toBe(true);
  expect(implementation.source).toContain(
    "Object.freeze({ migrateLegacyJson })",
  );

  const joinedSource = units.map(({ source }) => source).join("\n");
  const validatedDocumentMentions =
    (joinedSource.match(/\bValidatedDocument\b/gu) ?? []).length;
  expect(validatedDocumentMentions).toBe(0);

  const privateEvidenceReexported = barrelExports.some((name) =>
    name === "migrateLegacyJsonWithEvidence" ||
    name === "readLegacyArrayDataElement" ||
    name.startsWith("*:") ||
    name.startsWith("namespace:")
  );
  const unsignedObservation = {
    schema: "changes.evidence.c0-static-boundary-observation.v1",
    producer: {
      file: "tests/static/c0-production-policy.test.ts",
      testcase: "keeps C0 pure, synchronous, candidate-only, and privately evidenced",
    },
    productionFiles: [...productionFiles].sort(),
    allowedImports: observedImportBindings,
    implementationExports: deepExports,
    publicExports: barrelExports,
    privateEvidenceReexported,
    validatedDocumentMentions,
    productionCasts,
    moduleMutableBindings,
    asyncOrGeneratorFunctions,
    forbiddenRuntimeReferences,
    forbiddenProjectImports,
    fixtureOrTestImports,
    status: "pass",
  } as const;
  console.log(`C0_STATIC_OBSERVATION ${singleLineEvidenceJson({
    ...unsignedObservation,
    semanticDigest: c0EvidenceDigest(unsignedObservation),
  })}`);
});

test("rejects re-export, default-export, and runtime escape mutations", async () => {
  const hostileBarrel = parseSource(
    "hostile-barrel.ts",
    [
      'export { migrateLegacyJsonWithEvidence as evidence } from "./legacy-migration";',
      'export * from "./legacy-migration";',
      'export * as evidenceNamespace from "./legacy-migration";',
    ].join("\n"),
  );
  const leakedExports = publicExports(hostileBarrel);
  expect(leakedExports).toContain("migrateLegacyJsonWithEvidence");
  expect(leakedExports).toContain("evidence");
  expect(leakedExports).toContain("*:./legacy-migration");
  expect(leakedExports).toContain(
    "namespace:evidenceNamespace:./legacy-migration",
  );

  const theoryReexportSource = [
    'export { parseChordSymbol } from "../theory";',
    'export { parseChordSymbol as bypass } from "../theory";',
    'export * from "../theory";',
    'export * as theoryNamespace from "../theory";',
  ].join("\n");
  const theoryReexportUnit: SourceUnit = Object.freeze({
    path: implementationFile,
    source: theoryReexportSource,
    file: parseSource(implementationFile, theoryReexportSource),
  });
  expect([...reexportBindings(theoryReexportUnit)].sort()).toEqual([
    `${implementationFile}|../theory|runtime|named`,
    `${implementationFile}|../theory|runtime|named-alias`,
    `${implementationFile}|../theory|runtime|namespace`,
    `${implementationFile}|../theory|runtime|star`,
  ]);

  const defaultUnits = [
    ["hostile-default-assignment.ts", "export default migrateLegacyJson;"],
    ["hostile-export-equals.ts", "export = migrateLegacyJson;"],
    [
      "hostile-default-declaration.ts",
      "export default function bypass(): void {}",
    ],
    ["hostile-default-outbound.ts", "export { migrateLegacyJson as default };"],
    [
      "hostile-default-inbound.ts",
      'export { default as bypass } from "./legacy-migration";',
    ],
  ].map(([path, source]) => Object.freeze({
    path: path ?? "missing",
    source: source ?? "",
    file: parseSource(path ?? "missing", source ?? ""),
  }));
  expect([...defaultUnits.flatMap(defaultExportPaths)].sort()).toEqual([
    "hostile-default-assignment.ts:export-default-assignment",
    "hostile-default-declaration.ts:default-declaration",
    "hostile-default-inbound.ts:default-reexport",
    "hostile-default-outbound.ts:default-reexport",
    "hostile-export-equals.ts:export-equals",
  ]);

  const cleanBarrelSource = await readFile(publicBarrelFile, "utf8");
  const hostileSurfaceSource = [
    cleanBarrelSource,
    'export { unrelated } from "./unrelated";',
    'export { migrateLegacyJson as default } from "./legacy-migration";',
  ].join("\n");
  const hostileSurface = parseSource(publicBarrelFile, hostileSurfaceSource);
  const hostileSurfaceExports = publicExports(hostileSurface);
  expect(hostileSurfaceExports).toContain("unrelated");
  expect(hostileSurfaceExports).toContain("default");
  expect(hostileSurfaceExports).not.toEqual([...expectedPublicExports].sort());

  const directSurface = parseSource(
    publicBarrelFile,
    "export const unrelatedDirectDeclaration = true;",
  );
  expect(publicExports(directSurface)).toEqual([
    "unrelatedDirectDeclaration",
  ]);
  expect(publicExports(directSurface)).not.toEqual(
    [...expectedPublicExports].sort(),
  );

  const hostileUnit: SourceUnit = Object.freeze({
    path: implementationFile,
    source: [
      'import theory = require("../theory");',
      'declare function require(specifier: string): unknown;',
      'declare const module: { require(specifier: string): unknown };',
      'const directCommonJs = require("../theory");',
      'const propertyCommonJs = module.require("../theory");',
      'const remote = globalThis.fetch;',
      'const deferred = import("../theory");',
    ].join("\n"),
    file: parseSource(
      implementationFile,
      [
        'import theory = require("../theory");',
        'declare function require(specifier: string): unknown;',
        'declare const module: { require(specifier: string): unknown };',
        'const directCommonJs = require("../theory");',
        'const propertyCommonJs = module.require("../theory");',
        'const remote = globalThis.fetch;',
        'const deferred = import("../theory");',
      ].join("\n"),
    ),
  });
  expect(forbiddenReferences(hostileUnit)).toEqual([
    `${implementationFile}:dynamic-import`,
    `${implementationFile}:fetch`,
    `${implementationFile}:globalThis`,
    `${implementationFile}:import-equals`,
    `${implementationFile}:module`,
    `${implementationFile}:require`,
  ]);

  const theoryBypassSource = 'import { parseChordSymbol } from "../theory";';
  const theoryBypass: SourceUnit = Object.freeze({
    path: implementationFile,
    source: theoryBypassSource,
    file: parseSource(implementationFile, theoryBypassSource),
  });
  expect(imports(theoryBypass)).toEqual([{
    path: implementationFile,
    specifier: "../theory",
    typeOnly: false,
  }]);
});
