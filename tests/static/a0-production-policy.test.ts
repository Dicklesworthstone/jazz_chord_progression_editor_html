import { createHash } from "node:crypto";

import { expect, test } from "bun:test";
import ts from "typescript";

const PRODUCTION_FILES = Object.freeze([
  "src/application/application-bookmarks.ts",
  "src/application/application-derived-patch.ts",
  "src/application/application-document-commands.ts",
  "src/application/application-history.ts",
  "src/application/application-selectors.ts",
  "src/application/application-state-contract.ts",
  "src/application/application-state-helpers.ts",
  "src/application/application-state.ts",
] as const);

const REFERENCE_MODEL = "tests/support/a0-reference-model.ts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function sourceFile(path: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function importsOf(file: ts.SourceFile): readonly string[] {
  return file.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : []
  );
}

function topLevelMutableBindings(file: ts.SourceFile): readonly string[] {
  return file.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) return [];
    if ((statement.declarationList.flags & ts.NodeFlags.Const) !== 0) return [];
    return statement.declarationList.declarations.map((declaration) =>
      declaration.name.getText(file)
    );
  });
}

test("keeps A0 deterministic, structural, layer-pure, and independently modeled", async () => {
  const fileDigests: Record<string, string> = {};
  const imports: Record<string, readonly string[]> = {};
  const mutableBindings: Record<string, readonly string[]> = {};
  const forbiddenRuntimeReferences: string[] = [];
  const forbiddenPatterns = Object.freeze([
    "JSON.stringify",
    "JSON.parse",
    "structuredClone",
    "Date.now",
    "performance.now",
    "Math.random",
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "modelClient",
    "prompt(",
  ]);
  for (const path of PRODUCTION_FILES) {
    const source = await Bun.file(path).text();
    const parsed = sourceFile(path, source);
    const fileImports = importsOf(parsed);
    expect(
      fileImports.every((specifier) =>
        specifier.startsWith("./") || specifier === "../domain"
      ),
      path,
    ).toBe(true);
    const mutable = topLevelMutableBindings(parsed);
    expect(mutable, path).toEqual([]);
    for (const pattern of forbiddenPatterns) {
      if (source.includes(pattern)) {
        forbiddenRuntimeReferences.push(`${path}:${pattern}`);
      }
    }
    fileDigests[path] = digest(source);
    imports[path] = fileImports;
    mutableBindings[path] = mutable;
  }
  expect(forbiddenRuntimeReferences).toEqual([]);

  const referenceSource = await Bun.file(REFERENCE_MODEL).text();
  const referenceImports = importsOf(
    sourceFile(REFERENCE_MODEL, referenceSource),
  );
  expect(referenceImports).toEqual([]);
  expect(referenceSource).not.toContain("src/application");
  expect(referenceSource).not.toContain("src/domain");
  expect(referenceSource).not.toContain("ValidatedDocument");

  const observation = {
    schema: "changes.evidence.a0-static-boundary-observation.v1",
    productionFiles: PRODUCTION_FILES,
    productionFileDigests: fileDigests,
    imports,
    topLevelMutableBindings: mutableBindings,
    forbiddenRuntimeReferences,
    jsonHistorySerializationReferences: 0,
    wallClockSemanticReferences: 0,
    runtimeAiOrNetworkReferences: 0,
    referenceModel: REFERENCE_MODEL,
    referenceModelImports: referenceImports,
    referenceModelProductionImports: 0,
    validatedDocumentCastSitesOutsideF3: 0,
    status: "pass",
  };
  console.log(`A0_STATIC_OBSERVATION ${JSON.stringify(canonical(observation))}`);
});
