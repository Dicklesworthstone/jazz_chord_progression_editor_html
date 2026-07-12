import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

setDefaultTimeout(60_000);

const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));
const policySupportFile = fileURLToPath(
  new URL("../fixtures/typescript/cast-policy-minimal-lib.d.ts", import.meta.url),
);
const canonicalTypeFile = "domain/validated-document.ts";
const allowedCastFile = "application/document-validation.ts";

async function typescriptFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await typescriptFiles(path));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) result.push(path);
  }
  return result.sort();
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
}

type PolicyReport = Readonly<{
  findings: readonly string[];
  allowedCastCount: number;
  hasPublicationFile: boolean;
}>;

async function analyzeCastPolicy(root: string): Promise<PolicyReport> {
  const files = await typescriptFiles(root);
  const program = ts.createProgram([...files, policySupportFile], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    noLib: true,
    strict: true,
    skipLibCheck: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  const sourceFiles = program.getSourceFiles().filter((file) => files.includes(file.fileName));
  const canonicalSource = sourceFiles.find((file) =>
    relative(root, file.fileName).replaceAll("\\", "/") === canonicalTypeFile
  );
  const validatedDeclaration = canonicalSource?.statements.find((statement) =>
    ts.isTypeAliasDeclaration(statement) &&
    statement.name.text === "ValidatedDocument"
  );
  if (
    canonicalSource === undefined ||
    validatedDeclaration === undefined ||
    !ts.isTypeAliasDeclaration(validatedDeclaration)
  ) throw new Error("F1_VALIDATED_DOCUMENT_CANONICAL_TYPE_MISSING");
  const validatedType = checker.getTypeAtLocation(validatedDeclaration.name);
  const validatedBrandProperty = validatedType.getProperties().find((property) =>
    property.declarations?.some((declaration) =>
      ts.isPropertySignature(declaration) &&
      ts.isComputedPropertyName(declaration.name) &&
      ts.isIdentifier(declaration.name.expression) &&
      declaration.name.expression.text === "validatedDocumentBrand"
    )
  );
  if (validatedBrandProperty === undefined) {
    throw new Error("F1_VALIDATED_DOCUMENT_BRAND_PROPERTY_MISSING");
  }
  const containsValidatedType = (type: ts.Type): boolean => {
    if (
      (type.flags &
        (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) !== 0
    ) return false;
    const hasValidatedBrand = type.getProperties().some(
      (property) => property.escapedName === validatedBrandProperty.escapedName,
    );
    if (hasValidatedBrand && checker.isTypeAssignableTo(type, validatedType)) {
      return true;
    }
    return type.isUnionOrIntersection() && type.types.some(containsValidatedType);
  };

  const findings: string[] = [];
  let allowedCastCount = 0;
  const reportUse = (
    sourceFile: ts.SourceFile,
    localPath: string,
    node: ts.Node,
    label: string,
    allowDirectPublicationAssertion = false,
  ): void => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    if (localPath === allowedCastFile && allowDirectPublicationAssertion) {
      allowedCastCount += 1;
    }
    else findings.push(`${localPath}:${String(line)} ${label}`);
  };

  for (const sourceFile of sourceFiles) {
    const localPath = relative(root, sourceFile.fileName).replaceAll("\\", "/");
    const visit = (node: ts.Node): void => {
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
        const assertedType = checker.getTypeFromTypeNode(node.type);
        if (
          (assertedType.flags &
            (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) !== 0
        ) {
          reportUse(
            sourceFile,
            localPath,
            node,
            "unchecked escape assertion",
          );
        }
        if (containsValidatedType(assertedType)) {
          reportUse(
            sourceFile,
            localPath,
            node,
            "unauthorized assertion",
            true,
          );
        }
      }
      if (ts.isCallExpression(node) && node.typeArguments !== undefined) {
        for (const typeArgument of node.typeArguments) {
          if (containsValidatedType(checker.getTypeFromTypeNode(typeArgument))) {
            reportUse(sourceFile, localPath, node, "unauthorized generic cast");
          }
        }
      }
      if (ts.isVariableStatement(node) && hasExportModifier(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === "validatedDocumentBrand"
          ) reportUse(sourceFile, localPath, node, "exported brand");
          const exportedType = checker.getTypeAtLocation(declaration.name);
          const returnsValidated = exportedType.getCallSignatures().some((signature) =>
            containsValidatedType(checker.getReturnTypeOfSignature(signature))
          );
          if (
            localPath !== allowedCastFile &&
            (containsValidatedType(exportedType) || returnsValidated)
          ) reportUse(sourceFile, localPath, node, "unauthorized value export");
        }
      }
      if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
        const signature = checker.getSignatureFromDeclaration(node);
        if (
          localPath !== allowedCastFile &&
          signature !== undefined &&
          containsValidatedType(checker.getReturnTypeOfSignature(signature))
        ) reportUse(sourceFile, localPath, node, "unauthorized function export");
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return {
    findings: findings.sort(),
    allowedCastCount,
    hasPublicationFile: sourceFiles.some((file) =>
      relative(root, file.fileName).replaceAll("\\", "/") === allowedCastFile
    ),
  };
}

test("allows the opaque ValidatedDocument cast only at the F3 publication gate", async () => {
  const report = await analyzeCastPolicy(sourceRoot);
  expect(report.findings).toEqual([]);
  // F1/spec intentionally has no publication implementation. Once F3 adds the
  // named file, it must contain exactly one symbol-resolved cast.
  expect(report.allowedCastCount).toBe(report.hasPublicationFile ? 1 : 0);
});

test("catches multiline, alias, qualified, union, generic, and angle assertions", async () => {
  const root = await mkdtemp(join(tmpdir(), "jcpe-validated-cast-policy-"));
  try {
    await mkdir(join(root, "domain"), { recursive: true });
    await mkdir(join(root, "application"), { recursive: true });
    await writeFile(
      join(root, canonicalTypeFile),
      "declare const validatedDocumentBrand: unique symbol;\ntype Base = { schema: string };\nexport type ValidatedDocument = Base & { readonly [validatedDocumentBrand]: true };\n",
      "utf8",
    );
    await writeFile(
      join(root, "attack.ts"),
      [
        'import type { ValidatedDocument as VD } from "./domain/validated-document";',
        'import type * as Domain from "./domain/validated-document";',
        "declare const raw: unknown;",
        "declare function unsafeCast<T>(value: unknown): T;",
        "const alias = raw as\nVD;",
        "const qualified = raw as Domain.ValidatedDocument | null;",
        "const angle = <Domain.ValidatedDocument>raw;",
        "const generic = unsafeCast<VD>(raw);",
        "const excluded = raw as Exclude<VD, null>;",
        "const extracted = raw as Extract<VD | null, object>;",
        "const omitted = raw as Omit<VD, never>;",
        "const forged: VD = raw as never;",
        "void [alias, qualified, angle, generic, excluded, extracted, omitted, forged];",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "attack.tsx"),
      'import type { ValidatedDocument } from "./domain/validated-document";\ndeclare const raw: unknown;\nconst multiline = raw as\nValidatedDocument;\nvoid multiline;\n',
      "utf8",
    );
    await writeFile(
      join(root, allowedCastFile),
      'import type { ValidatedDocument } from "../domain/validated-document";\ndeclare const raw: unknown;\nexport const publish = (): ValidatedDocument => raw as ValidatedDocument;\n',
      "utf8",
    );
    const report = await analyzeCastPolicy(root);
    expect(report.allowedCastCount).toBe(1);
    const policyFindings = report.findings.filter((finding) =>
      finding.includes("unauthorized assertion") ||
      finding.includes("unauthorized generic cast") ||
      finding.includes("unchecked escape assertion")
    );
    expect(policyFindings).toHaveLength(9);
    expect(policyFindings.filter((finding) =>
      finding.includes("unauthorized assertion")
    )).toHaveLength(7);
    expect(policyFindings.filter((finding) =>
      finding.includes("unauthorized generic cast")
    )).toHaveLength(1);
    expect(policyFindings.filter((finding) =>
      finding.includes("unchecked escape assertion")
    )).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
