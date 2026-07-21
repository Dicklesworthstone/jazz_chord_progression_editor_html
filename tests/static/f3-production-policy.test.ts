import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";
import ts from "typescript";

import type {
  ProgressionDocumentShapeV2,
  ValidatedDocument,
} from "../../src/domain";

type Assert<Value extends true> = Value;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type Not<Value extends boolean> = Value extends true ? false : true;
type UnvalidatedShapeCannotCrossBrand = Assert<
  Not<IsAssignable<ProgressionDocumentShapeV2, ValidatedDocument>>
>;

const unvalidatedShapeCannotCrossBrand: UnvalidatedShapeCannotCrossBrand = true;

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceRoot = resolve(repositoryRoot, "src");
const implementationPath = resolve(
  sourceRoot,
  "application/document-validation.ts",
);
const indexPath = resolve(sourceRoot, "application/index.ts");

type PolicyReport = Readonly<{
  imports: readonly string[];
  exportedValues: readonly string[];
  moduleMutableBindings: number;
  asyncOrGeneratorFunctions: number;
  forbiddenRuntimeReferences: readonly string[];
  testAuthorityImports: readonly string[];
  validatedDocumentCastTextCount: number;
  privateEvidenceIndexMentions: number;
  operationObjectExact: boolean;
}>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    ).map(([key, item]) => [key, canonical(item)]),
  );
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)), "utf8")
    .digest("hex");
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function inspectPolicy(
  implementationSource: string,
  indexSource: string,
): PolicyReport {
  const file = ts.createSourceFile(
    "document-validation.ts",
    implementationSource,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  const exportedValues: string[] = [];
  const forbiddenRuntimeReferences = new Set<string>();
  const testAuthorityImports: string[] = [];
  let moduleMutableBindings = 0;
  let asyncOrGeneratorFunctions = 0;

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier;
      if (ts.isStringLiteral(specifier)) {
        imports.push(specifier.text);
        if (
          /(?:^|\/)(?:fixtures|test-support|tests)(?:\/|$)/u.test(
            specifier.text,
          )
        ) {
          testAuthorityImports.push(specifier.text);
        }
      }
    }
    if (
      ts.isVariableStatement(statement) &&
      (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    ) {
      moduleMutableBindings += statement.declarationList.declarations.length;
    }
    if (hasExportModifier(statement)) {
      if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
        exportedValues.push(statement.name.text);
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            exportedValues.push(declaration.name.text);
          }
        }
      }
    }
  }

  const forbiddenNames = new Set([
    "AudioContext",
    "Date",
    "EventSource",
    "Math.random",
    "SharedWorker",
    "WebSocket",
    "Worker",
    "clearInterval",
    "clearTimeout",
    "console",
    "document",
    "fetch",
    "indexedDB",
    "localStorage",
    "performance",
    "queueMicrotask",
    "requestAnimationFrame",
    "sessionStorage",
    "setInterval",
    "setTimeout",
    "window",
  ]);
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
    if (ts.isIdentifier(node) && forbiddenNames.has(node.text)) {
      forbiddenRuntimeReferences.add(node.text);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      forbiddenNames.has(`${node.expression.text}.${node.name.text}`)
    ) {
      forbiddenRuntimeReferences.add(
        `${node.expression.text}.${node.name.text}`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  const operationObjectExact = /export const documentValidationOperations(?:\s*:\s*DocumentValidationOperations)?\s*=\s*Object\.freeze\(\{\s*validateDocumentSemantics,?\s*\}\);/su
    .test(implementationSource);

  return {
    imports: imports.sort(),
    exportedValues: exportedValues.sort(),
    moduleMutableBindings,
    asyncOrGeneratorFunctions,
    forbiddenRuntimeReferences: [...forbiddenRuntimeReferences].sort(),
    testAuthorityImports: testAuthorityImports.sort(),
    validatedDocumentCastTextCount:
      (implementationSource.match(/\bas\s+ValidatedDocument\b/gu) ?? []).length,
    privateEvidenceIndexMentions:
      (indexSource.match(/validateDocumentSemanticsWithEvidence/gu) ?? []).length,
    operationObjectExact,
  };
}

async function sourceFiles(root: string): Promise<readonly string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) paths.push(...await sourceFiles(path));
    if (entry.isFile() && /\.tsx?$/u.test(entry.name)) paths.push(path);
  }
  return paths.sort();
}

describe("F3 production boundary policy", () => {
  test("keeps publication pure, synchronous, private, and singly branded", async () => {
    const implementationSource = await Bun.file(implementationPath).text();
    const indexSource = await Bun.file(indexPath).text();
    const report = inspectPolicy(implementationSource, indexSource);
    expect(report.imports).toEqual([
      "../domain",
      "../theory",
      "./document-validation-contract",
    ]);
    expect(report.exportedValues).toEqual([
      "documentValidationOperations",
      "validateDocumentSemantics",
      "validateDocumentSemanticsWithEvidence",
    ]);
    expect(report.moduleMutableBindings).toBe(0);
    expect(report.asyncOrGeneratorFunctions).toBe(0);
    expect(report.forbiddenRuntimeReferences).toEqual([]);
    expect(report.testAuthorityImports).toEqual([]);
    expect(report.validatedDocumentCastTextCount).toBe(1);
    expect(report.privateEvidenceIndexMentions).toBe(0);
    expect(report.operationObjectExact).toBe(true);

    const files = await sourceFiles(sourceRoot);
    const castSites: string[] = [];
    const evidenceIndexLeaks: string[] = [];
    for (const path of files) {
      const source = await Bun.file(path).text();
      if (/\bas\s+ValidatedDocument\b/gu.test(source)) {
        castSites.push(relative(sourceRoot, path).replaceAll("\\", "/"));
      }
      if (
        path !== implementationPath &&
        /validateDocumentSemanticsWithEvidence/u.test(source) &&
        !path.includes("test-support")
      ) {
        evidenceIndexLeaks.push(
          relative(sourceRoot, path).replaceAll("\\", "/"),
        );
      }
    }
    expect(castSites).toEqual(["application/document-validation.ts"]);
    expect(evidenceIndexLeaks).toEqual([]);

    const payload = {
      schema: "changes.evidence.f3-static-boundary-observation.v1",
      producer: {
        file: "tests/static/f3-production-policy.test.ts",
        testcase:
          "keeps publication pure, synchronous, private, and singly branded",
      },
      allowedImports: report.imports,
      implementationExports: report.exportedValues,
      castSites,
      allowedCastCount: report.validatedDocumentCastTextCount,
      privateEvidenceIndexMentions: report.privateEvidenceIndexMentions,
      moduleMutableBindings: report.moduleMutableBindings,
      asyncOrGeneratorFunctions: report.asyncOrGeneratorFunctions,
      forbiddenRuntimeReferences: report.forbiddenRuntimeReferences,
      fixtureOrTestSupportImports: report.testAuthorityImports,
      existingPublicationBypassPaths: 0,
      shapeAssignableToValidatedDocument: !unvalidatedShapeCannotCrossBrand,
      operationObjectExact: report.operationObjectExact,
      status: "pass",
    };
    console.log(`F3_STATIC_OBSERVATION ${JSON.stringify({
      ...payload,
      semanticDigest: sha256(payload),
    })}`);
  });

  test("detects representative authority, clock, async, and surface violations", () => {
    const report = inspectPolicy(
      `
        import fixture from "../../tests/fixtures/publication/document-cases.json";
        import { clock } from "../content/runtime";
        let cache: unknown;
        export async function publish(candidate: unknown): Promise<unknown> {
          setTimeout(() => {}, 0);
          return candidate;
        }
        export const documentValidationOperations = { publish };
        void [fixture, clock, cache];
      `,
      "export { validateDocumentSemanticsWithEvidence } from './document-validation';",
    );
    expect(report.testAuthorityImports).toEqual([
      "../../tests/fixtures/publication/document-cases.json",
    ]);
    expect(report.moduleMutableBindings).toBe(1);
    expect(report.asyncOrGeneratorFunctions).toBe(1);
    expect(report.forbiddenRuntimeReferences).toContain("setTimeout");
    expect(report.privateEvidenceIndexMentions).toBe(1);
    expect(report.operationObjectExact).toBe(false);
  });
});
