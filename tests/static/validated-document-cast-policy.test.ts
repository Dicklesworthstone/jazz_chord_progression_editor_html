import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

setDefaultTimeout(60_000);

const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));
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
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    strict: true,
    skipLibCheck: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  const sourceFiles = program.getSourceFiles().filter((file) => files.includes(file.fileName));
  const sourceFileNames = new Set(sourceFiles.map((file) => file.fileName));
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
  const isValidatedType = (type: ts.Type): boolean => {
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
    return type.isUnionOrIntersection() && type.types.some(isValidatedType);
  };
  const typeGraphContains = (
    rootType: ts.Type,
    predicate: (type: ts.Type) => boolean,
  ): boolean => {
    const pending: ts.Type[] = [rootType];
    const visited = new Set<ts.Type>();
    while (pending.length > 0) {
      const type = pending.pop();
      if (type === undefined || visited.has(type)) continue;
      visited.add(type);
      if (
        (type.flags &
          (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) !== 0
      ) continue;
      if (predicate(type)) return true;
      if (type.isUnionOrIntersection()) pending.push(...type.types);
      pending.push(...(type.aliasTypeArguments ?? []));
      if (
        (type.flags & ts.TypeFlags.Object) !== 0 &&
        ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0
      ) {
        pending.push(...checker.getTypeArguments(type as ts.TypeReference));
      }
      const constraint = type.getConstraint();
      if (constraint !== undefined) pending.push(constraint);
      const stringIndex = type.getStringIndexType();
      if (stringIndex !== undefined) pending.push(stringIndex);
      const numberIndex = type.getNumberIndexType();
      if (numberIndex !== undefined) pending.push(numberIndex);
      for (const signature of [
        ...type.getCallSignatures(),
        ...type.getConstructSignatures(),
      ]) {
        if (
          signature.declaration !== undefined &&
          sourceFileNames.has(signature.declaration.getSourceFile().fileName)
        ) {
          pending.push(checker.getReturnTypeOfSignature(signature));
        }
      }
      for (const property of type.getProperties()) {
        const declaration = property.declarations?.find((candidate) =>
          sourceFileNames.has(candidate.getSourceFile().fileName)
        );
        if (declaration !== undefined) {
          pending.push(checker.getTypeOfSymbolAtLocation(property, declaration));
        }
      }
    }
    return false;
  };
  const containsValidatedType = (type: ts.Type): boolean =>
    typeGraphContains(type, isValidatedType);
  const isBrandCompatibleTypeParameter = (candidate: ts.Type): boolean => {
    if ((candidate.flags & ts.TypeFlags.TypeParameter) === 0) return false;
    const constraint = candidate.getConstraint();
    return constraint === undefined ||
      (constraint.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0 ||
      checker.isTypeAssignableTo(validatedType, constraint);
  };
  const containsBrandCompatibleTypeParameter = (type: ts.Type): boolean =>
    typeGraphContains(type, isBrandCompatibleTypeParameter);
  const typeAdmitsValidatedDocument = (candidate: ts.Type): boolean => {
    if (
      (candidate.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0
    ) return true;
    if (checker.isTypeAssignableTo(validatedType, candidate)) return true;
    return candidate.isUnion() && candidate.types.some(typeAdmitsValidatedDocument);
  };
  const indexedAccessCanProjectValidatedDocument = (
    node: ts.IndexedAccessTypeNode,
  ): boolean => {
    const objectType = checker.getTypeFromTypeNode(node.objectType);
    if ((objectType.flags & ts.TypeFlags.TypeParameter) === 0) return false;
    const constraint = objectType.getConstraint();
    if (constraint === undefined) return true;
    const indexType = checker.getTypeFromTypeNode(node.indexType);
    const indexMembers = indexType.isUnion() ? indexType.types : [indexType];
    const projectedTypes: ts.Type[] = [];
    let hasBroadIndex = false;
    for (const indexMember of indexMembers) {
      if (
        (indexMember.flags &
          (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral)) !== 0
      ) {
        const propertyName = String(
          (indexMember as ts.StringLiteralType | ts.NumberLiteralType).value,
        );
        const property = constraint.getProperty(propertyName);
        const declaration = property?.valueDeclaration ?? property?.declarations?.[0];
        if (property !== undefined && declaration !== undefined) {
          projectedTypes.push(
            checker.getTypeOfSymbolAtLocation(property, declaration),
          );
        }
      }
      else hasBroadIndex = true;
    }
    if (hasBroadIndex) {
      for (const property of constraint.getProperties()) {
        const declaration = property.valueDeclaration ?? property.declarations?.[0];
        if (declaration !== undefined) {
          projectedTypes.push(
            checker.getTypeOfSymbolAtLocation(property, declaration),
          );
        }
      }
      const stringIndex = constraint.getStringIndexType();
      if (stringIndex !== undefined) projectedTypes.push(stringIndex);
      const numberIndex = constraint.getNumberIndexType();
      if (numberIndex !== undefined) projectedTypes.push(numberIndex);
    }
    return projectedTypes.some(typeAdmitsValidatedDocument);
  };
  const typeNodeContainsBrandCompatibleTypeParameter = (
    rootNode: ts.TypeNode,
  ): boolean => {
    let found = false;
    const visitTypeNode = (node: ts.Node): void => {
      if (found) return;
      if (
        ts.isIndexedAccessTypeNode(node) &&
        indexedAccessCanProjectValidatedDocument(node)
      ) {
        found = true;
        return;
      }
      if (
        ts.isTypeNode(node) &&
        isBrandCompatibleTypeParameter(checker.getTypeFromTypeNode(node))
      ) {
        found = true;
        return;
      }
      ts.forEachChild(node, visitTypeNode);
    };
    visitTypeNode(rootNode);
    return found;
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
        if (
          containsBrandCompatibleTypeParameter(assertedType) ||
          typeNodeContainsBrandCompatibleTypeParameter(node.type)
        ) {
          reportUse(
            sourceFile,
            localPath,
            node,
            "unchecked generic escape assertion",
          );
        }
        if (containsValidatedType(assertedType)) {
          reportUse(
            sourceFile,
            localPath,
            node,
            "unauthorized assertion",
            isValidatedType(assertedType),
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
            isValidatedType(checker.getReturnTypeOfSignature(signature))
          );
          if (
            localPath !== allowedCastFile &&
            (isValidatedType(exportedType) || returnsValidated)
          ) reportUse(sourceFile, localPath, node, "unauthorized value export");
        }
      }
      if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
        const signature = checker.getSignatureFromDeclaration(node);
        if (
          localPath !== allowedCastFile &&
          signature !== undefined &&
          isValidatedType(checker.getReturnTypeOfSignature(signature))
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

test("catches direct, wrapped, generic, and multiline assertions", async () => {
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
        "type Box<T> = { value: T };",
        "declare const raw: unknown;",
        "declare const existingValidatedDocument: VD;",
        "declare function unsafeCast<T>(value: unknown): T;",
        "function inferredCast<T>(value: unknown): T { return value as T; }",
        "function inferredCastWithWitness<T>(value: unknown, _witness: T): T { return value as T; }",
        "function conditionalCastWithWitness<T>(value: unknown, _witness: T): T extends string ? string : T { return value as (T extends string ? string : T); }",
        'function indexedCastWithWitness<T extends { x: unknown }>(value: unknown, _witness: T): T["x"] { return value as T["x"]; }',
        "const alias = raw as\nVD;",
        "const qualified = raw as Domain.ValidatedDocument | null;",
        "const angle = <Domain.ValidatedDocument>raw;",
        "const generic = unsafeCast<VD>(raw);",
        "const excluded = raw as Exclude<VD, null>;",
        "const extracted = raw as Extract<VD | null, object>;",
        "const omitted = raw as Omit<VD, never>;",
        "const wrapped = raw as { doc: VD };",
        "const boxed = raw as Box<VD>;",
        "const factory = raw as () => VD;",
        "const nestedGeneric = unsafeCast<Box<VD>>(raw);",
        "const inferredGeneric: VD = inferredCast(raw);",
        "const inferredGenericWithWitness: VD = inferredCastWithWitness(raw, existingValidatedDocument);",
        "const conditionalGenericWithWitness: VD = conditionalCastWithWitness(raw, existingValidatedDocument);",
        "const indexedGenericWithWitness: VD = indexedCastWithWitness(raw, { x: existingValidatedDocument });",
        "const forged: VD = raw as never;",
        "const safeMembers = Object.freeze(['alpha', 'beta'] as const);",
        "const safeMember = raw as (typeof safeMembers)[number];",
        "const safeRecord = raw as Readonly<Record<string, unknown>>;",
        "void [alias, qualified, angle, generic, excluded, extracted, omitted, wrapped, boxed, factory, nestedGeneric, inferredGeneric, inferredGenericWithWitness, conditionalGenericWithWitness, indexedGenericWithWitness, forged, safeMember, safeRecord];",
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
      finding.includes("unchecked generic escape assertion") ||
      finding.includes("unchecked escape assertion")
    );
    expect(policyFindings).toHaveLength(17);
    expect(policyFindings.filter((finding) =>
      finding.includes("unauthorized assertion")
    )).toHaveLength(10);
    expect(policyFindings.filter((finding) =>
      finding.includes("unauthorized generic cast")
    )).toHaveLength(2);
    expect(policyFindings.filter((finding) =>
      finding.includes("unchecked generic escape assertion")
    )).toHaveLength(4);
    expect(policyFindings.filter((finding) =>
      finding.includes("unchecked escape assertion")
    )).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
