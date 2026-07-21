import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import * as ts from "typescript";

export const F2_DECODER_SOURCE_POLICY_CODES = {
  sourceFileMissing: "F2_SOURCE_FILE_MISSING",
  importForbidden: "F2_SOURCE_IMPORT_FORBIDDEN",
  exportSurface: "F2_SOURCE_EXPORT_SURFACE",
  privateEvidencePublished: "F2_SOURCE_PRIVATE_EVIDENCE_PUBLISHED",
  operationsSurface: "F2_SOURCE_OPERATIONS_SURFACE",
  moduleMutableBinding: "F2_SOURCE_MODULE_MUTABLE_BINDING",
  moduleReferenceNotFrozen: "F2_SOURCE_MODULE_REFERENCE_NOT_FROZEN",
  moduleMutableBuiltIn: "F2_SOURCE_MODULE_MUTABLE_BUILTIN",
  moduleBindingWrite: "F2_SOURCE_MODULE_BINDING_WRITE",
  externalStateWrite: "F2_SOURCE_EXTERNAL_STATE_WRITE",
  reflectionRoutine: "F2_SOURCE_REFLECTION_ROUTINE",
  reflectionOutsideRoutine: "F2_SOURCE_REFLECTION_OUTSIDE_ROUTINE",
  taintedContainerRead: "F2_SOURCE_TAINTED_CONTAINER_READ",
  taintedHelperCall: "F2_SOURCE_TAINTED_HELPER_CALL",
  taintedContainerWrite: "F2_SOURCE_TAINTED_CONTAINER_WRITE",
  objectAssign: "F2_SOURCE_OBJECT_ASSIGN",
  jsonStringify: "F2_SOURCE_JSON_STRINGIFY",
  untrustedSpread: "F2_SOURCE_UNTRUSTED_SPREAD",
  depthWorklist: "F2_SOURCE_DEPTH_WORKLIST",
  depthRecursion: "F2_SOURCE_DEPTH_RECURSION",
  candidateFactory: "F2_SOURCE_CANDIDATE_FACTORY",
  candidateOutsideFactory: "F2_SOURCE_CANDIDATE_OUTSIDE_FACTORY",
  f1ContainerAttached: "F2_SOURCE_F1_CONTAINER_ATTACHED",
  makeChordEvent: "F2_SOURCE_MAKE_CHORD_EVENT",
  wallClock: "F2_SOURCE_WALL_CLOCK",
  uncheckedAssertion: "F2_SOURCE_UNCHECKED_ASSERTION",
  sharedCore: "F2_SOURCE_SHARED_CORE",
  publicWrapperBranch: "F2_SOURCE_PUBLIC_WRAPPER_BRANCH",
} as const;

export type F2DecoderSourcePolicyCode =
  (typeof F2_DECODER_SOURCE_POLICY_CODES)[keyof typeof F2_DECODER_SOURCE_POLICY_CODES];

export type F2DecoderSourcePolicyFinding = Readonly<{
  code: F2DecoderSourcePolicyCode;
  path: string;
  start: number;
  end: number;
  line: number;
  column: number;
  message: string;
}>;

export type F2DecoderSourcePolicyInput = Readonly<{
  decoderSource: string;
  domainIndexSource: string;
  decoderPath?: string;
  domainIndexPath?: string;
}>;

export type F2DecoderSourcePolicyReport = Readonly<{
  schema: "changes.validation.f2-decoder-source-policy.v1";
  outcome: "pass" | "fail";
  findings: readonly F2DecoderSourcePolicyFinding[];
}>;

type ParsedModule = Readonly<{
  path: string;
  sourceFile: ts.SourceFile;
}>;

type FunctionInfo = Readonly<{
  name: string;
  declaration: ts.FunctionDeclaration;
  parameters: readonly string[];
}>;

const DECODER_PATH = "src/domain/document-decoder.ts";
const DOMAIN_INDEX_PATH = "src/domain/index.ts";

const REQUIRED_DECODER_VALUE_EXPORTS = [
  "preflightDocumentImportBytesWithEvidence",
  "preflightDocumentImportBytes",
  "decodeDocumentShapeWithEvidence",
  "decodeDocumentShape",
  "documentDecodeOperations",
] as const;

const REQUIRED_PUBLIC_DECODER_EXPORTS = [
  "preflightDocumentImportBytes",
  "decodeDocumentShape",
  "documentDecodeOperations",
] as const;

const FORBIDDEN_PUBLIC_EVIDENCE_EXPORTS = new Set([
  "preflightDocumentImportBytesWithEvidence",
  "decodeDocumentShapeWithEvidence",
  "DocumentDecoderEvidence",
  "DocumentImportBytePreflightWithEvidenceResult",
  "DocumentShapeDecodeWithEvidenceResult",
  "PreflightDocumentImportBytesWithEvidence",
  "DecodeDocumentShapeWithEvidence",
]);

const WRAPPER_NAMES = new Set([
  "preflightDocumentImportBytesWithEvidence",
  "preflightDocumentImportBytes",
  "decodeDocumentShapeWithEvidence",
  "decodeDocumentShape",
]);

const CANDIDATE_FACTORY_NAMES = [
  "allocateCandidateObject",
  "allocateCandidateArray",
] as const;

const MUTABLE_BUILTIN_CONSTRUCTORS = new Set([
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Date",
  "RegExp",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "DataView",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
]);

const MUTATING_METHODS = new Set([
  "add",
  "clear",
  "copyWithin",
  "delete",
  "fill",
  "pop",
  "push",
  "reverse",
  "set",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

const MUTATING_INTRINSICS = new Set([
  "Object.assign",
  "Object.defineProperties",
  "Object.defineProperty",
  "Object.setPrototypeOf",
  "Reflect.defineProperty",
  "Reflect.deleteProperty",
  "Reflect.set",
  "Reflect.setPrototypeOf",
]);

const EXTERNAL_STATE_INTRINSICS = new Set([
  ...MUTATING_INTRINSICS,
  "Object.freeze",
  "Object.preventExtensions",
  "Object.seal",
]);

const EXTERNAL_STATE_GLOBALS = new Set([
  "Bun",
  "Deno",
  "caches",
  "cookieStore",
  "document",
  "exports",
  "frames",
  "global",
  "globalThis",
  "history",
  "indexedDB",
  "localStorage",
  "location",
  "module",
  "navigator",
  "parent",
  "process",
  "self",
  "sessionStorage",
  "top",
  "window",
]);

const FORBIDDEN_CLOCK_CALLS = new Set([
  "Date.now",
  "performance.now",
  "Bun.nanoseconds",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "queueMicrotask",
]);

const CANDIDATE_TYPE_PATTERN = /(?:ProgressionDocumentShapeV2|SectionShape|MeasureShape|MeasureCompletionShape|ChordEvent|ChordSpec|CustomChordSpec|AutoVoicing|ManualVoicing|FrozenVoicing|PlaybackSettings|KeyContext|Meter|SpelledPitch(?:Class)?|Beat(?:Value|Duration)|MidiRange)/;

const ASSIGNMENT_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

function parseModule(path: string, source: string): ParsedModule {
  return {
    path,
    sourceFile: ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  };
}

function locationFor(
  parsed: ParsedModule,
  node: ts.Node,
): Omit<F2DecoderSourcePolicyFinding, "code" | "path" | "message"> {
  const start = node.getStart(parsed.sourceFile);
  const point = parsed.sourceFile.getLineAndCharacterOfPosition(start);
  return {
    start,
    end: node.getEnd(),
    line: point.line + 1,
    column: point.character + 1,
  };
}

function finding(
  parsed: ParsedModule,
  node: ts.Node,
  code: F2DecoderSourcePolicyCode,
  message: string,
): F2DecoderSourcePolicyFinding {
  return {
    code,
    path: parsed.path,
    ...locationFor(parsed, node),
    message,
  };
}

function sortFindings(
  values: F2DecoderSourcePolicyFinding[],
): F2DecoderSourcePolicyFinding[] {
  return values.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.start - right.start ||
      left.end - right.end ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
  );
}

function bindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingIdentifiers(element.name),
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function accessPath(expression: ts.Expression): readonly string[] | null {
  const value = unwrapExpression(expression);
  if (ts.isIdentifier(value)) return [value.text];
  if (ts.isPropertyAccessExpression(value)) {
    const base = accessPath(value.expression);
    return base === null ? null : [...base, value.name.text];
  }
  if (
    ts.isElementAccessExpression(value) &&
    (ts.isStringLiteralLike(value.argumentExpression) ||
      ts.isNumericLiteral(value.argumentExpression))
  ) {
    const base = accessPath(value.expression);
    return base === null
      ? null
      : [...base, value.argumentExpression.text];
  }
  return null;
}

function expressionRootIdentifier(expression: ts.Expression): string | null {
  const value = unwrapExpression(expression);
  if (ts.isIdentifier(value)) return value.text;
  if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) {
    return expressionRootIdentifier(value.expression);
  }
  return null;
}

function enclosingFunctionName(node: ts.Node): string | null {
  let current = node.parent;
  while (!ts.isSourceFile(current)) {
    if (ts.isFunctionDeclaration(current)) return current.name?.text ?? null;
    if (
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

function visitDirectFunctionBody(
  declaration: ts.FunctionDeclaration,
  visit: (node: ts.Node) => void,
): void {
  if (declaration.body === undefined) return;
  const walk = (node: ts.Node): void => {
    if (node !== declaration && ts.isFunctionLike(node)) return;
    visit(node);
    ts.forEachChild(node, walk);
  };
  walk(declaration.body);
}

function functionInfos(parsed: ParsedModule): Map<string, FunctionInfo> {
  const result = new Map<string, FunctionInfo>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      result.set(node.name.text, {
        name: node.name.text,
        declaration: node,
        parameters: node.parameters.map((parameter) =>
          ts.isIdentifier(parameter.name) ? parameter.name.text : "",
        ),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return result;
}

function isPrimitiveLiteral(expression: ts.Expression): boolean {
  const value = unwrapExpression(expression);
  if (
    ts.isStringLiteralLike(value) ||
    ts.isNumericLiteral(value) ||
    ts.isBigIntLiteral(value) ||
    value.kind === ts.SyntaxKind.TrueKeyword ||
    value.kind === ts.SyntaxKind.FalseKeyword ||
    value.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  return (
    ts.isPrefixUnaryExpression(value) &&
    (value.operator === ts.SyntaxKind.PlusToken ||
      value.operator === ts.SyntaxKind.MinusToken) &&
    (ts.isNumericLiteral(value.operand) || ts.isBigIntLiteral(value.operand))
  );
}

function isObjectFreezeCall(expression: ts.Expression): expression is ts.CallExpression {
  const value = unwrapExpression(expression);
  return (
    ts.isCallExpression(value) &&
    accessPath(value.expression)?.join(".") === "Object.freeze" &&
    value.arguments.length === 1
  );
}

function isDeepFrozenLiteral(
  expression: ts.Expression,
  allowFunctionNames: ReadonlySet<string> = new Set(),
): boolean {
  const value = unwrapExpression(expression);
  if (isPrimitiveLiteral(value)) return true;
  if (ts.isIdentifier(value)) return allowFunctionNames.has(value.text);
  if (
    ts.isPrefixUnaryExpression(value) &&
    isPrimitiveLiteral(value)
  ) return true;
  if (ts.isBinaryExpression(value)) {
    return (
      isDeepFrozenLiteral(value.left, allowFunctionNames) &&
      isDeepFrozenLiteral(value.right, allowFunctionNames)
    );
  }
  if (!isObjectFreezeCall(value)) return false;
  const frozen = unwrapExpression(value.arguments[0] as ts.Expression);
  if (ts.isArrayLiteralExpression(frozen)) {
    return frozen.elements.every((element) =>
      !ts.isSpreadElement(element) &&
      isDeepFrozenLiteral(element, allowFunctionNames),
    );
  }
  if (!ts.isObjectLiteralExpression(frozen)) return false;
  return frozen.properties.every((property) => {
    if (ts.isPropertyAssignment(property)) {
      return isDeepFrozenLiteral(property.initializer, allowFunctionNames);
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      return allowFunctionNames.has(property.name.text);
    }
    return false;
  });
}

function mutableBuiltInNode(expression: ts.Expression): ts.Node | null {
  let result: ts.Node | null = null;
  const visit = (node: ts.Node): void => {
    if (result !== null) return;
    if (ts.isRegularExpressionLiteral(node)) {
      result = node;
      return;
    }
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassExpression(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      result = node;
      return;
    }
    if (ts.isNewExpression(node)) {
      const name = accessPath(node.expression)?.at(-1);
      if (name === undefined || MUTABLE_BUILTIN_CONSTRUCTORS.has(name)) {
        result = node;
        return;
      }
      // A class instance is mutable even when its constructor is project-local.
      result = node;
      return;
    }
    if (ts.isCallExpression(node)) {
      const path = accessPath(node.expression);
      const receiver = path?.at(-2);
      if (
        path?.at(-1) === "from" &&
        receiver !== undefined &&
        MUTABLE_BUILTIN_CONSTRUCTORS.has(receiver)
      ) {
        result = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return result;
}

function analyzeImportsAndExports(
  decoder: ParsedModule,
  domainIndex: ParsedModule,
): F2DecoderSourcePolicyFinding[] {
  const findings: F2DecoderSourcePolicyFinding[] = [];
  const actualDecoderExports = new Set<string>();

  for (const statement of decoder.sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier;
      if (
        !ts.isStringLiteralLike(specifier) ||
        !/^\.\/[a-z0-9-]+(?:\.(?:ts|js))?$/.test(specifier.text) ||
        specifier.text === "./index" ||
        specifier.text === "./document-decoder"
      ) {
        findings.push(
          finding(
            decoder,
            specifier,
            F2_DECODER_SOURCE_POLICY_CODES.importForbidden,
            "The F2 decoder may import only sibling Domain modules by direct relative path.",
          ),
        );
      }
      if (
        statement.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        for (const element of statement.importClause.namedBindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (imported === "makeChordEvent" || imported === "ValidatedDocument") {
            findings.push(
              finding(
                decoder,
                element,
                imported === "makeChordEvent"
                  ? F2_DECODER_SOURCE_POLICY_CODES.makeChordEvent
                  : F2_DECODER_SOURCE_POLICY_CODES.importForbidden,
                `${imported} is outside the reviewed F2 implementation surface.`,
              ),
            );
          }
        }
      }
    } else if (
      ts.isImportEqualsDeclaration(statement) ||
      (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) ||
      ts.isExportAssignment(statement)
    ) {
      findings.push(
        finding(
          decoder,
          statement,
          ts.isExportAssignment(statement) || ts.isExportDeclaration(statement)
            ? F2_DECODER_SOURCE_POLICY_CODES.exportSurface
            : F2_DECODER_SOURCE_POLICY_CODES.importForbidden,
          "The decoder uses direct named declarations and has no import-equals, re-export, or default-export surface.",
        ),
      );
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      actualDecoderExports.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingIdentifiers(declaration.name)) {
          actualDecoderExports.add(name.text);
        }
      }
    } else {
      findings.push(
        finding(
          decoder,
          statement,
          F2_DECODER_SOURCE_POLICY_CODES.exportSurface,
          "Only the five reviewed decoder value declarations may be exported.",
        ),
      );
    }
  }

  const expectedDecoderExports = new Set<string>(REQUIRED_DECODER_VALUE_EXPORTS);
  if (
    actualDecoderExports.size !== expectedDecoderExports.size ||
    [...actualDecoderExports].some((name) => !expectedDecoderExports.has(name))
  ) {
    findings.push(
      finding(
        decoder,
        decoder.sourceFile,
        F2_DECODER_SOURCE_POLICY_CODES.exportSurface,
        `Decoder value exports must be exactly ${REQUIRED_DECODER_VALUE_EXPORTS.join(", ")}.`,
      ),
    );
  }

  const publicDecoderExports = new Set<string>();
  for (const statement of domainIndex.sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (statement.exportClause === undefined) {
      if (
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteralLike(statement.moduleSpecifier) &&
        ["./document-decoder", "./document-decoder-contract"].includes(
          statement.moduleSpecifier.text,
        )
      ) {
        findings.push(
          finding(
            domainIndex,
            statement,
            F2_DECODER_SOURCE_POLICY_CODES.privateEvidencePublished,
            "A star export from an F2 decoder module would publish private evidence seams or types.",
          ),
        );
      }
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) continue;
    const fromDecoder =
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "./document-decoder";
    for (const element of statement.exportClause.elements) {
      const originalName = element.propertyName?.text ?? element.name.text;
      if (FORBIDDEN_PUBLIC_EVIDENCE_EXPORTS.has(originalName)) {
        findings.push(
          finding(
            domainIndex,
            element,
            F2_DECODER_SOURCE_POLICY_CODES.privateEvidencePublished,
            `Private F2 evidence name ${originalName} must remain a deep import.`,
          ),
        );
      }
      if (fromDecoder) publicDecoderExports.add(originalName);
    }
  }

  const expectedPublic = new Set<string>(REQUIRED_PUBLIC_DECODER_EXPORTS);
  if (
    publicDecoderExports.size !== expectedPublic.size ||
    [...publicDecoderExports].some((name) => !expectedPublic.has(name))
  ) {
    findings.push(
      finding(
        domainIndex,
        domainIndex.sourceFile,
        F2_DECODER_SOURCE_POLICY_CODES.exportSurface,
        `Domain index must re-export exactly ${REQUIRED_PUBLIC_DECODER_EXPORTS.join(", ")} from ./document-decoder.`,
      ),
    );
  }

  return findings;
}

function analyzeModuleRetention(
  parsed: ParsedModule,
  functions: ReadonlyMap<string, FunctionInfo>,
): F2DecoderSourcePolicyFinding[] {
  const findings: F2DecoderSourcePolicyFinding[] = [];
  const moduleBindings = new Set<string>();
  const importedBindings = new Set<string>();
  const functionBindings = new Set(functions.keys());

  for (const statement of parsed.sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
      const clause = statement.importClause;
      if (clause.name !== undefined) importedBindings.add(clause.name.text);
      if (clause.namedBindings !== undefined) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          importedBindings.add(clause.namedBindings.name.text);
        } else {
          for (const element of clause.namedBindings.elements) {
            importedBindings.add(element.name.text);
          }
        }
      }
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    const isConst =
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
    if (!isConst) {
      findings.push(
        finding(
          parsed,
          statement.declarationList,
          F2_DECODER_SOURCE_POLICY_CODES.moduleMutableBinding,
          "document-decoder.ts may not declare module-scope let or var bindings.",
        ),
      );
    }
    for (const declaration of statement.declarationList.declarations) {
      for (const name of bindingIdentifiers(declaration.name)) {
        moduleBindings.add(name.text);
      }
      if (!isConst || declaration.initializer === undefined) continue;
      const mutable = mutableBuiltInNode(declaration.initializer);
      if (mutable !== null) {
        findings.push(
          finding(
            parsed,
            mutable,
            F2_DECODER_SOURCE_POLICY_CODES.moduleMutableBuiltIn,
            "A module constant may not retain a mutable built-in, class instance, function, or accessor.",
          ),
        );
      }
      const names = bindingIdentifiers(declaration.name);
      const isOperations =
        names.length === 1 && names[0]?.text === "documentDecodeOperations";
      const allowedFunctions = isOperations
        ? new Set(["preflightDocumentImportBytes", "decodeDocumentShape"])
        : new Set<string>();
      if (!isDeepFrozenLiteral(declaration.initializer, allowedFunctions)) {
        findings.push(
          finding(
            parsed,
            declaration.initializer,
            F2_DECODER_SOURCE_POLICY_CODES.moduleReferenceNotFrozen,
            "Module reference constants must be recursively frozen acyclic plain literal trees.",
          ),
        );
      }
    }
  }

  const protectedBindings = new Set([
    ...moduleBindings,
    ...importedBindings,
    ...functionBindings,
  ]);
  const mutationApiCall = (node: ts.CallExpression): boolean => {
    const path = accessPath(node.expression)?.join(".");
    if (path !== undefined && MUTATING_INTRINSICS.has(path)) {
      const target = node.arguments[0];
      return (
        target !== undefined &&
        protectedBindings.has(expressionRootIdentifier(target) ?? "")
      );
    }
    if (ts.isPropertyAccessExpression(unwrapExpression(node.expression))) {
      const call = unwrapExpression(node.expression) as ts.PropertyAccessExpression;
      return (
        MUTATING_METHODS.has(call.name.text) &&
        protectedBindings.has(expressionRootIdentifier(call.expression) ?? "")
      );
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    let target: ts.Expression | null = null;
    if (
      ts.isBinaryExpression(node) &&
      ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)
    ) {
      target = node.left;
    } else if (
      ts.isPrefixUnaryExpression(node) ||
      ts.isPostfixUnaryExpression(node)
    ) {
      if (
        node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken
      ) target = node.operand;
    } else if (
      ts.isDeleteExpression(node)
    ) {
      target = node.expression;
    }
    if (
      target !== null &&
      protectedBindings.has(expressionRootIdentifier(target) ?? "")
    ) {
      findings.push(
        finding(
          parsed,
          target,
          F2_DECODER_SOURCE_POLICY_CODES.moduleBindingWrite,
          "Imports, module bindings, named functions, and their properties are immutable.",
        ),
      );
    }
    if (ts.isCallExpression(node) && mutationApiCall(node)) {
      findings.push(
        finding(
          parsed,
          node,
          F2_DECODER_SOURCE_POLICY_CODES.moduleBindingWrite,
          "A mutating call may not target an import, module binding, or named function.",
        ),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return findings;
}

const GLOBAL_STATE_TAINT = 1;
const IMPORTED_STATE_TAINT = 2;

function sourceChecker(parsed: ParsedModule): ts.TypeChecker {
  const options: ts.CompilerOptions = {
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const host = ts.createCompilerHost(options, true);
  host.fileExists = (path) => path === parsed.path;
  host.readFile = (path) =>
    path === parsed.path ? parsed.sourceFile.text : undefined;
  host.getSourceFile = (path) =>
    path === parsed.path ? parsed.sourceFile : undefined;
  const program = ts.createProgram([parsed.path], options, host);
  return program.getTypeChecker();
}

function analyzeExternalStateWrites(
  parsed: ParsedModule,
): F2DecoderSourcePolicyFinding[] {
  const findings: F2DecoderSourcePolicyFinding[] = [];
  const checker = sourceChecker(parsed);
  const symbolTaints = new Map<ts.Symbol, number>();
  const returnTaints = new Map<ts.Symbol, number>();

  const addTaint = (
    values: Map<ts.Symbol, number>,
    symbol: ts.Symbol | undefined,
    taint: number,
  ): boolean => {
    if (symbol === undefined || taint === 0) return false;
    const previous = values.get(symbol) ?? 0;
    const next = previous | taint;
    if (next === previous) return false;
    values.set(symbol, next);
    return true;
  };

  const bindingSymbol = (identifier: ts.Identifier): ts.Symbol | undefined =>
    checker.getSymbolAtLocation(identifier);

  for (const statement of parsed.sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) {
      continue;
    }
    const clause = statement.importClause;
    if (clause.name !== undefined) {
      addTaint(
        symbolTaints,
        bindingSymbol(clause.name),
        IMPORTED_STATE_TAINT,
      );
    }
    if (clause.namedBindings === undefined) continue;
    if (ts.isNamespaceImport(clause.namedBindings)) {
      addTaint(
        symbolTaints,
        bindingSymbol(clause.namedBindings.name),
        IMPORTED_STATE_TAINT,
      );
      continue;
    }
    for (const element of clause.namedBindings.elements) {
      addTaint(
        symbolTaints,
        bindingSymbol(element.name),
        IMPORTED_STATE_TAINT,
      );
    }
  }

  const identifierTaint = (identifier: ts.Identifier): number => {
    const symbol = bindingSymbol(identifier);
    const retained = symbol === undefined ? 0 : symbolTaints.get(symbol) ?? 0;
    if (retained !== 0) return retained;
    if (!EXTERNAL_STATE_GLOBALS.has(identifier.text)) return 0;
    const declarations = symbol?.getDeclarations() ?? [];
    return declarations.some(
      (declaration) => declaration.getSourceFile() === parsed.sourceFile,
    )
      ? 0
      : GLOBAL_STATE_TAINT;
  };

  const expressionTaint = (expression: ts.Expression): number => {
    const value = unwrapExpression(expression);
    if (ts.isIdentifier(value)) return identifierTaint(value);
    if (
      ts.isPropertyAccessExpression(value) ||
      ts.isElementAccessExpression(value)
    ) {
      return expressionTaint(value.expression);
    }
    if (ts.isConditionalExpression(value)) {
      return (
        expressionTaint(value.whenTrue) | expressionTaint(value.whenFalse)
      );
    }
    if (ts.isAwaitExpression(value)) {
      return expressionTaint(value.expression);
    }
    if (ts.isCallExpression(value)) {
      const callee = unwrapExpression(value.expression);
      if (ts.isIdentifier(callee)) {
        const symbol = bindingSymbol(callee);
        return symbol === undefined ? 0 : returnTaints.get(symbol) ?? 0;
      }
    }
    return 0;
  };

  const containingFunctionSymbol = (node: ts.Node): ts.Symbol | undefined => {
    let current = node.parent;
    while (!ts.isSourceFile(current)) {
      if (ts.isFunctionDeclaration(current)) {
        return current.name === undefined
          ? undefined
          : bindingSymbol(current.name);
      }
      if (ts.isFunctionLike(current)) return undefined;
      current = current.parent;
    }
    return undefined;
  };

  // Flow-insensitive fixed point: aliases, helper parameters, and local helper
  // returns cannot launder an externally owned state reference.
  let changed = true;
  while (changed) {
    changed = false;
    const propagate = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer !== undefined
      ) {
        const taint = expressionTaint(node.initializer);
        for (const identifier of bindingIdentifiers(node.name)) {
          changed = addTaint(symbolTaints, bindingSymbol(identifier), taint) || changed;
        }
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(unwrapExpression(node.left))
      ) {
        const target = unwrapExpression(node.left) as ts.Identifier;
        changed =
          addTaint(
            symbolTaints,
            bindingSymbol(target),
            expressionTaint(node.right),
          ) || changed;
      } else if (ts.isCallExpression(node)) {
        const callee = unwrapExpression(node.expression);
        if (ts.isIdentifier(callee)) {
          const declaration = bindingSymbol(callee)
            ?.getDeclarations()
            ?.find(ts.isFunctionDeclaration);
          if (declaration !== undefined) {
            for (const [index, parameter] of declaration.parameters.entries()) {
              const argument = node.arguments[index];
              if (argument === undefined) continue;
              const taint = expressionTaint(argument);
              for (const identifier of bindingIdentifiers(parameter.name)) {
                changed =
                  addTaint(symbolTaints, bindingSymbol(identifier), taint) ||
                  changed;
              }
            }
          }
        }
      } else if (
        ts.isReturnStatement(node) &&
        node.expression !== undefined
      ) {
        changed =
          addTaint(
            returnTaints,
            containingFunctionSymbol(node),
            expressionTaint(node.expression),
          ) || changed;
      }
      ts.forEachChild(node, propagate);
    };
    propagate(parsed.sourceFile);
  }

  const report = (node: ts.Node, message: string): void => {
    findings.push(
      finding(
        parsed,
        node,
        F2_DECODER_SOURCE_POLICY_CODES.externalStateWrite,
        message,
      ),
    );
  };

  const visit = (node: ts.Node): void => {
    let writeTarget: ts.Expression | null = null;
    if (
      ts.isBinaryExpression(node) &&
      ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)
    ) {
      writeTarget = node.left;
    } else if (
      (ts.isPrefixUnaryExpression(node) ||
        ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      writeTarget = node.operand;
    } else if (ts.isDeleteExpression(node)) {
      writeTarget = node.expression;
    }
    if (writeTarget !== null && expressionTaint(writeTarget) !== 0) {
      report(
        writeTarget,
        "The decoder may mutate only invocation-local state, never global, browser, process, storage, or imported application state.",
      );
    }

    if (ts.isCallExpression(node)) {
      const path = callPath(node);
      const intrinsicTarget =
        path !== null && EXTERNAL_STATE_INTRINSICS.has(path)
          ? node.arguments[0]
          : undefined;
      if (
        intrinsicTarget !== undefined &&
        expressionTaint(intrinsicTarget) !== 0
      ) {
        report(
          node,
          "Object and Reflect mutation intrinsics may not target externally owned state.",
        );
      }

      const callee = unwrapExpression(node.expression);
      if (
        ts.isPropertyAccessExpression(callee) ||
        ts.isElementAccessExpression(callee)
      ) {
        if (expressionTaint(callee.expression) !== 0) {
          report(
            node,
            "Method calls through global, browser, process, storage, or imported state owners are forbidden because their effects are externally retained.",
          );
        }
      } else if (
        ts.isIdentifier(callee) &&
        (identifierTaint(callee) & GLOBAL_STATE_TAINT) !== 0
      ) {
        report(
          node,
          "Calling a global-state function reference would create an externally retained effect.",
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return findings;
}

function callPath(node: ts.CallExpression): string | null {
  return accessPath(node.expression)?.join(".") ?? null;
}

function reflectionKind(node: ts.CallExpression): "keys" | "descriptor" | null {
  const path = callPath(node);
  if (path === "Reflect.ownKeys") return "keys";
  if (path === "Object.getOwnPropertyDescriptor") return "descriptor";
  return null;
}

function analyzeReflectionRoutine(
  parsed: ParsedModule,
  functions: ReadonlyMap<string, FunctionInfo>,
): Readonly<{
  findings: readonly F2DecoderSourcePolicyFinding[];
  routineName: string | null;
}> {
  const findings: F2DecoderSourcePolicyFinding[] = [];
  const callsByFunction = new Map<string, Array<{ node: ts.CallExpression; kind: "keys" | "descriptor" }>>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const kind = reflectionKind(node);
      const owner = enclosingFunctionName(node);
      if (kind !== null && owner !== null) {
        const calls = callsByFunction.get(owner) ?? [];
        calls.push({ node, kind });
        callsByFunction.set(owner, calls);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);

  const candidates = [...callsByFunction.entries()].filter(([, calls]) => {
    const kinds = new Set(calls.map((call) => call.kind));
    return kinds.has("keys") && kinds.has("descriptor");
  });
  const routineName = candidates.length === 1 ? candidates[0]?.[0] ?? null : null;
  if (routineName === null) {
    findings.push(
      finding(
        parsed,
        parsed.sourceFile,
        F2_DECODER_SOURCE_POLICY_CODES.reflectionRoutine,
        "Exactly one named routine must own both Reflect.ownKeys and Object.getOwnPropertyDescriptor snapshots.",
      ),
    );
  }
  for (const [owner, calls] of callsByFunction) {
    if (owner === routineName) continue;
    for (const call of calls) {
      findings.push(
        finding(
          parsed,
          call.node,
          F2_DECODER_SOURCE_POLICY_CODES.reflectionOutsideRoutine,
          "Own-key and descriptor reflection must stay in the one snapshot routine.",
        ),
      );
    }
  }

  if (routineName !== null && !functions.has(routineName)) {
    findings.push(
      finding(
        parsed,
        parsed.sourceFile,
        F2_DECODER_SOURCE_POLICY_CODES.reflectionRoutine,
        "The reflection snapshot owner must be a named function declaration.",
      ),
    );
  }
  return { findings, routineName };
}

function expressionIsTainted(
  expression: ts.Expression,
  tainted: ReadonlySet<string>,
  descriptorBindings: ReadonlySet<string>,
  taintedReturnFunctions: ReadonlySet<string>,
): boolean {
  const value = unwrapExpression(expression);
  if (ts.isIdentifier(value)) return tainted.has(value.text);
  if (ts.isPropertyAccessExpression(value)) {
    const root = expressionRootIdentifier(value.expression);
    return (
      (root !== null && tainted.has(root)) ||
      (value.name.text === "value" &&
        root !== null &&
        descriptorBindings.has(root))
    );
  }
  if (ts.isElementAccessExpression(value)) {
    const root = expressionRootIdentifier(value.expression);
    return root !== null && tainted.has(root);
  }
  if (ts.isCallExpression(value)) {
    const name = ts.isIdentifier(value.expression) ? value.expression.text : null;
    return name !== null && taintedReturnFunctions.has(name);
  }
  if (ts.isConditionalExpression(value)) {
    return (
      expressionIsTainted(value.whenTrue, tainted, descriptorBindings, taintedReturnFunctions) ||
      expressionIsTainted(value.whenFalse, tainted, descriptorBindings, taintedReturnFunctions)
    );
  }
  if (ts.isBinaryExpression(value)) {
    return (
      expressionIsTainted(value.left, tainted, descriptorBindings, taintedReturnFunctions) ||
      expressionIsTainted(value.right, tainted, descriptorBindings, taintedReturnFunctions)
    );
  }
  return false;
}

function analyzeTaintedInput(
  parsed: ParsedModule,
  functions: ReadonlyMap<string, FunctionInfo>,
  reflectionRoutineName: string | null,
): F2DecoderSourcePolicyFinding[] {
  const findings: F2DecoderSourcePolicyFinding[] = [];
  const taintedParameters = new Map<string, Set<number>>();
  const taintedReturnFunctions = new Set<string>();
  const seed = (name: string, index: number): void => {
    const values = taintedParameters.get(name) ?? new Set<number>();
    values.add(index);
    taintedParameters.set(name, values);
  };
  for (const name of WRAPPER_NAMES) seed(name, 0);
  if (reflectionRoutineName !== null) seed(reflectionRoutineName, 0);

  const localState = (
    info: FunctionInfo,
  ): Readonly<{ tainted: Set<string>; descriptors: Set<string> }> => {
    const tainted = new Set<string>();
    const descriptors = new Set<string>();
    for (const index of taintedParameters.get(info.name) ?? []) {
      const name = info.parameters[index];
      if (name !== undefined && name !== "") tainted.add(name);
    }
    let changed = true;
    while (changed) {
      changed = false;
      visitDirectFunctionBody(info.declaration, (node) => {
        if (!ts.isVariableDeclaration(node) || node.initializer === undefined) return;
        const names = bindingIdentifiers(node.name).map((name) => name.text);
        if (
          ts.isCallExpression(unwrapExpression(node.initializer)) &&
          reflectionKind(unwrapExpression(node.initializer) as ts.CallExpression) === "descriptor"
        ) {
          for (const name of names) {
            if (!descriptors.has(name)) {
              descriptors.add(name);
              changed = true;
            }
          }
        }
        if (names.some((name) => /descriptor/i.test(name))) {
          for (const name of names) descriptors.add(name);
        }
        if (
          expressionIsTainted(
            node.initializer,
            tainted,
            descriptors,
            taintedReturnFunctions,
          )
        ) {
          for (const name of names) {
            if (!tainted.has(name)) {
              tainted.add(name);
              changed = true;
            }
          }
        }
      });
    }
    return { tainted, descriptors };
  };

  let graphChanged = true;
  while (graphChanged) {
    graphChanged = false;
    for (const info of functions.values()) {
      const state = localState(info);
      visitDirectFunctionBody(info.declaration, (node) => {
        if (ts.isReturnStatement(node) && node.expression !== undefined) {
          if (
            expressionIsTainted(
              node.expression,
              state.tainted,
              state.descriptors,
              taintedReturnFunctions,
            ) &&
            !taintedReturnFunctions.has(info.name)
          ) {
            taintedReturnFunctions.add(info.name);
            graphChanged = true;
          }
        }
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(unwrapExpression(node.expression))
        ) {
          const callee = functions.get(
            (unwrapExpression(node.expression) as ts.Identifier).text,
          );
          if (callee === undefined) return;
          node.arguments.forEach((argument, index) => {
            if (
              expressionIsTainted(
                argument,
                state.tainted,
                state.descriptors,
                taintedReturnFunctions,
              )
            ) {
              const existing = taintedParameters.get(callee.name) ?? new Set<number>();
              if (!existing.has(index)) {
                existing.add(index);
                taintedParameters.set(callee.name, existing);
                graphChanged = true;
              }
            }
          });
        }
      });
    }
  }

  for (const info of functions.values()) {
    const state = localState(info);
    const isTainted = (expression: ts.Expression): boolean =>
      expressionIsTainted(
        expression,
        state.tainted,
        state.descriptors,
        taintedReturnFunctions,
      );
    visitDirectFunctionBody(info.declaration, (node) => {
      if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        isTainted(node.expression)
      ) {
        const isCallTarget = ts.isCallExpression(node.parent) && node.parent.expression === node;
        const isWriteTarget =
          (ts.isBinaryExpression(node.parent) && node.parent.left === node) ||
          ts.isDeleteExpression(node.parent) ||
          ts.isPrefixUnaryExpression(node.parent) ||
          ts.isPostfixUnaryExpression(node.parent);
        if (!isCallTarget && !isWriteTarget) {
          findings.push(
            finding(
              parsed,
              node,
              F2_DECODER_SOURCE_POLICY_CODES.taintedContainerRead,
              "Untrusted containers may not be member-read outside the descriptor snapshot.",
            ),
          );
        }
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer !== undefined &&
        isTainted(node.initializer)
      ) {
        findings.push(
          finding(
            parsed,
            node.name,
            F2_DECODER_SOURCE_POLICY_CODES.taintedContainerRead,
            "Destructuring an untrusted container bypasses the cached descriptor surface.",
          ),
        );
      }
      if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) {
        if (isTainted(node.expression)) {
          findings.push(
            finding(
              parsed,
              node,
              F2_DECODER_SOURCE_POLICY_CODES.untrustedSpread,
              "Spread may not invoke an untrusted iterator or enumerate an untrusted record.",
            ),
          );
        }
      }
      if (ts.isCallExpression(node)) {
        const path = callPath(node);
        if (path === "Object.assign") {
          findings.push(
            finding(
              parsed,
              node,
              F2_DECODER_SOURCE_POLICY_CODES.objectAssign,
              "Object.assign is forbidden in document-decoder.ts.",
            ),
          );
        }
        if (path === "JSON.stringify") {
          findings.push(
            finding(
              parsed,
              node,
              F2_DECODER_SOURCE_POLICY_CODES.jsonStringify,
              "JSON.stringify cannot validate shape or measure an arbitrary object.",
            ),
          );
        }
        if (
          path === "Reflect.get" &&
          node.arguments[0] !== undefined &&
          isTainted(node.arguments[0])
        ) {
          findings.push(
            finding(
              parsed,
              node,
              F2_DECODER_SOURCE_POLICY_CODES.taintedContainerRead,
              "Reflect.get may invoke an untrusted getter.",
            ),
          );
        }
        const callee = unwrapExpression(node.expression);
        if (
          (ts.isPropertyAccessExpression(callee) ||
            ts.isElementAccessExpression(callee)) &&
          isTainted(callee.expression)
        ) {
          findings.push(
            finding(
              parsed,
              node,
              F2_DECODER_SOURCE_POLICY_CODES.taintedHelperCall,
              "The decoder may not invoke an input-supplied method or iterator helper.",
            ),
          );
        }
        const mutatingIntrinsic = path !== null && MUTATING_INTRINSICS.has(path);
        if (
          mutatingIntrinsic &&
          node.arguments[0] !== undefined &&
          isTainted(node.arguments[0])
        ) {
          findings.push(
            finding(
              parsed,
              node,
              F2_DECODER_SOURCE_POLICY_CODES.taintedContainerWrite,
              "A mutating intrinsic may not target an untrusted container.",
            ),
          );
        }
        if (
          (ts.isPropertyAccessExpression(callee) ||
            ts.isElementAccessExpression(callee)) &&
          isTainted(callee.expression) &&
          MUTATING_METHODS.has(
            ts.isPropertyAccessExpression(callee)
              ? callee.name.text
              : callee.argumentExpression.getText(parsed.sourceFile),
          )
        ) {
          findings.push(
            finding(
              parsed,
              node,
              F2_DECODER_SOURCE_POLICY_CODES.taintedContainerWrite,
              "An input-supplied mutating method may not be called.",
            ),
          );
        }
      }
      let writeTarget: ts.Expression | null = null;
      if (
        ts.isBinaryExpression(node) &&
        ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)
      ) writeTarget = node.left;
      else if (ts.isDeleteExpression(node)) writeTarget = node.expression;
      else if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken)
      ) writeTarget = node.operand;
      if (
        writeTarget !== null &&
        (ts.isPropertyAccessExpression(writeTarget) ||
          ts.isElementAccessExpression(writeTarget)) &&
        isTainted(writeTarget.expression)
      ) {
        findings.push(
          finding(
            parsed,
            writeTarget,
            F2_DECODER_SOURCE_POLICY_CODES.taintedContainerWrite,
            "The decoder may not write, update, or delete an untrusted container property.",
          ),
        );
      }
    });
  }
  return findings;
}

function directLocalCalls(
  info: FunctionInfo,
  functions: ReadonlyMap<string, FunctionInfo>,
): readonly string[] {
  const result: string[] = [];
  visitDirectFunctionBody(info.declaration, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = unwrapExpression(node.expression);
    if (ts.isIdentifier(callee) && functions.has(callee.text)) result.push(callee.text);
  });
  return result;
}

function analyzeDepthTraversal(
  parsed: ParsedModule,
  functions: ReadonlyMap<string, FunctionInfo>,
): F2DecoderSourcePolicyFinding[] {
  const findings: F2DecoderSourcePolicyFinding[] = [];
  const candidates = [...functions.values()]
    .map((info) => {
      const text = info.declaration.getText(parsed.sourceFile);
      let score = 0;
      if (/depth/i.test(info.name)) score += 2;
      if (/MAX_JSON_NESTING_DEPTH|limit\.json_depth_exceeded|maxDepthObserved/.test(text)) {
        score += 4;
      }
      return { info, score };
    })
    .filter((value) => value.score > 0)
    .sort((left, right) => right.score - left.score);
  const depth = candidates[0]?.info;
  if (depth === undefined) {
    findings.push(
      finding(
        parsed,
        parsed.sourceFile,
        F2_DECODER_SOURCE_POLICY_CODES.depthWorklist,
        "A depth-preflight function with the reviewed bound and evidence marker is required.",
      ),
    );
    return findings;
  }

  const localArrays = new Set<string>();
  const loops: ts.IterationStatement[] = [];
  visitDirectFunctionBody(depth.declaration, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      const initializer = unwrapExpression(node.initializer);
      if (
        ts.isArrayLiteralExpression(initializer) ||
        (ts.isNewExpression(initializer) &&
          accessPath(initializer.expression)?.at(-1) === "Array")
      ) {
        localArrays.add(node.name.text);
      }
    }
    if (
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node)
    ) loops.push(node);
  });
  const hasWorklistLoop = loops.some((loop) => {
    const text = loop.getText(parsed.sourceFile);
    return [...localArrays].some((name) =>
      new RegExp(`\\b${name.replaceAll("$", "\\$")}\\b`).test(text),
    );
  });
  if (!hasWorklistLoop) {
    findings.push(
      finding(
        parsed,
        depth.declaration,
        F2_DECODER_SOURCE_POLICY_CODES.depthWorklist,
        "Depth preflight needs a function-local worklist consumed by an explicit loop.",
      ),
    );
  }

  const graph = new Map<string, readonly string[]>();
  for (const info of functions.values()) {
    graph.set(info.name, directLocalCalls(info, functions));
  }
  const reachable = new Set<string>();
  const stack = [depth.name];
  while (stack.length > 0) {
    const name = stack.pop();
    if (name === undefined || reachable.has(name)) continue;
    reachable.add(name);
    stack.push(...(graph.get(name) ?? []));
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleNodes: ts.Node[] = [];
  const findCycle = (name: string): boolean => {
    if (visiting.has(name)) {
      cycleNodes.push(functions.get(name)?.declaration ?? parsed.sourceFile);
      return true;
    }
    if (visited.has(name) || !reachable.has(name)) return false;
    visiting.add(name);
    for (const callee of graph.get(name) ?? []) {
      if (findCycle(callee)) return true;
    }
    visiting.delete(name);
    visited.add(name);
    return false;
  };
  if (findCycle(depth.name)) {
    findings.push(
      finding(
        parsed,
        cycleNodes[0] ?? depth.declaration,
        F2_DECODER_SOURCE_POLICY_CODES.depthRecursion,
        "The depth-preflight call graph must be acyclic; direct and indirect recursion are forbidden.",
      ),
    );
  }
  return findings;
}

function isCandidateFactoryCall(node: ts.Node | undefined): boolean {
  return (
    node !== undefined &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(unwrapExpression(node.expression)) &&
    CANDIDATE_FACTORY_NAMES.includes(
      (unwrapExpression(node.expression) as ts.Identifier).text as
        (typeof CANDIDATE_FACTORY_NAMES)[number],
    )
  );
}

function analyzeCandidateConstruction(
  parsed: ParsedModule,
  functions: ReadonlyMap<string, FunctionInfo>,
): F2DecoderSourcePolicyFinding[] {
  const findings: F2DecoderSourcePolicyFinding[] = [];
  for (const [index, name] of CANDIDATE_FACTORY_NAMES.entries()) {
    const info = functions.get(name);
    if (info === undefined) {
      findings.push(
        finding(
          parsed,
          parsed.sourceFile,
          F2_DECODER_SOURCE_POLICY_CODES.candidateFactory,
          `Required candidate factory ${name} is missing.`,
        ),
      );
      continue;
    }
    const expectedCounter =
      index === 0 ? "candidateObjectsAllocated" : "candidateArraysAllocated";
    const increments: ts.Node[] = [];
    visitDirectFunctionBody(info.declaration, (node) => {
      if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        accessPath(node)?.at(-1) === expectedCounter &&
        ((ts.isBinaryExpression(node.parent) && node.parent.left === node) ||
          ts.isPrefixUnaryExpression(node.parent) ||
          ts.isPostfixUnaryExpression(node.parent))
      ) increments.push(node);
    });
    if (increments.length === 0) {
      findings.push(
        finding(
          parsed,
          info.declaration,
          F2_DECODER_SOURCE_POLICY_CODES.candidateFactory,
          `${name} must increment ${expectedCounter} at the construction site.`,
        ),
      );
    }
  }

  const f1Results = new Set<string>();
  const f1Values = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && accessPath(node.expression)?.at(-1) === "makeChordEvent") {
      findings.push(
        finding(
          parsed,
          node,
          F2_DECODER_SOURCE_POLICY_CODES.makeChordEvent,
          "F2 may not call makeChordEvent because it creates replacement wrappers and first-refusal aggregation.",
        ),
      );
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      const initializer = unwrapExpression(node.initializer);
      if (
        ts.isCallExpression(initializer) &&
        /^(?:make|validate|parse|normalize)/.test(
          accessPath(initializer.expression)?.at(-1) ?? "",
        )
      ) f1Results.add(node.name.text);
      if (
        ts.isPropertyAccessExpression(initializer) &&
        initializer.name.text === "value" &&
        f1Results.has(expressionRootIdentifier(initializer.expression) ?? "")
      ) f1Values.add(node.name.text);
    }
    if (ts.isCallExpression(node) && isCandidateFactoryCall(node)) {
      let attached: string | undefined;
      const inspectAttachment = (candidateNode: ts.Node): void => {
        if (attached !== undefined) return;
        if (
          ts.isIdentifier(candidateNode) &&
          f1Values.has(candidateNode.text) &&
          !(
            ts.isPropertyAccessExpression(candidateNode.parent) &&
            candidateNode.parent.expression === candidateNode
          )
        ) {
          attached = candidateNode.text;
          return;
        }
        if (
          ts.isPropertyAccessExpression(candidateNode) &&
          candidateNode.name.text === "value"
        ) {
          const root = expressionRootIdentifier(candidateNode.expression);
          const inspectedMember =
            ts.isPropertyAccessExpression(candidateNode.parent) &&
            candidateNode.parent.expression === candidateNode;
          const copiedByValue =
            ts.isSpreadAssignment(candidateNode.parent) ||
            ts.isSpreadElement(candidateNode.parent);
          if (
            root !== null &&
            f1Results.has(root) &&
            !inspectedMember &&
            !copiedByValue
          ) {
            attached = root;
            return;
          }
        }
        ts.forEachChild(candidateNode, inspectAttachment);
      };
      for (const argument of node.arguments) inspectAttachment(argument);
      if (attached !== undefined) {
        findings.push(
          finding(
            parsed,
            node,
            F2_DECODER_SOURCE_POLICY_CODES.f1ContainerAttached,
            `F1 result ${attached} may be inspected as a leaf-law result but not attached to the candidate graph.`,
          ),
        );
      }
    }
    if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
      const directFactoryArgument =
        ts.isCallExpression(node.parent) &&
        isCandidateFactoryCall(node.parent);
      const nestedInFactoryArgument = (() => {
        let current = node.parent;
        while (!ts.isSourceFile(current) && !ts.isFunctionLike(current)) {
          if (ts.isCallExpression(current) && isCandidateFactoryCall(current)) return true;
          current = current.parent;
        }
        return false;
      })();
      const declaration = ts.isVariableDeclaration(node.parent) ? node.parent : null;
      const candidateTyped =
        declaration?.type !== undefined &&
        CANDIDATE_TYPE_PATTERN.test(declaration.type.getText(parsed.sourceFile));
      const candidateNamed =
        declaration !== null &&
        ts.isIdentifier(declaration.name) &&
        /candidate/i.test(declaration.name.text);
      const enclosing = enclosingFunctionName(node);
      if (
        !directFactoryArgument &&
        enclosing !== "allocateCandidateObject" &&
        enclosing !== "allocateCandidateArray" &&
        (nestedInFactoryArgument || candidateTyped || candidateNamed)
      ) {
        findings.push(
          finding(
            parsed,
            node,
            F2_DECODER_SOURCE_POLICY_CODES.candidateOutsideFactory,
            "Every decoded candidate record/array node must be created at a reviewed counter-incrementing factory call.",
          ),
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return findings;
}

function analyzeClockAndAssertions(
  parsed: ParsedModule,
): F2DecoderSourcePolicyFinding[] {
  const findings: F2DecoderSourcePolicyFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const path = callPath(node);
      if (
        (path !== null && FORBIDDEN_CLOCK_CALLS.has(path)) ||
        (path !== null && path.startsWith("Temporal.Now."))
      ) {
        findings.push(
          finding(
            parsed,
            node,
            F2_DECODER_SOURCE_POLICY_CODES.wallClock,
            "Wall clocks, timers, and scheduling APIs may not control decoder correctness.",
          ),
        );
      }
    }
    if (
      ts.isNewExpression(node) &&
      accessPath(node.expression)?.at(-1) === "Date"
    ) {
      findings.push(
        finding(
          parsed,
          node,
          F2_DECODER_SOURCE_POLICY_CODES.wallClock,
          "The decoder has no wall-clock ownership.",
        ),
      );
    }
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      findings.push(
        finding(
          parsed,
          node,
          F2_DECODER_SOURCE_POLICY_CODES.uncheckedAssertion,
          "Production decoder flow may not use any.",
        ),
      );
    }
    if (
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      const typeText = node.type.getText(parsed.sourceFile);
      const isConstAssertion = typeText === "const";
      const nestedCast =
        (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
        (ts.isAsExpression(node.expression) ||
          ts.isTypeAssertionExpression(node.expression));
      if (
        !isConstAssertion &&
        (nestedCast || CANDIDATE_TYPE_PATTERN.test(typeText) || typeText === "any")
      ) {
        findings.push(
          finding(
            parsed,
            node,
            F2_DECODER_SOURCE_POLICY_CODES.uncheckedAssertion,
            "Candidate publication may not rely on any, double casts, or a candidate-type assertion.",
          ),
        );
      }
    }
    if (
      ts.isTypePredicateNode(node) &&
      node.assertsModifier !== undefined &&
      node.type !== undefined &&
      CANDIDATE_TYPE_PATTERN.test(node.type.getText(parsed.sourceFile))
    ) {
      findings.push(
        finding(
          parsed,
          node,
          F2_DECODER_SOURCE_POLICY_CODES.uncheckedAssertion,
          "An assertion helper may not manufacture a decoded candidate type.",
        ),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return findings;
}

function singleReturnExpression(info: FunctionInfo): ts.Expression | null {
  const body = info.declaration.body;
  if (body === undefined || body.statements.length !== 1) return null;
  const statement = body.statements[0];
  if (statement === undefined) return null;
  return ts.isReturnStatement(statement) ? statement.expression ?? null : null;
}

function analyzeSharedCoresAndOperations(
  parsed: ParsedModule,
  functions: ReadonlyMap<string, FunctionInfo>,
): F2DecoderSourcePolicyFinding[] {
  const findings: F2DecoderSourcePolicyFinding[] = [];
  const pairs = [
    ["preflightDocumentImportBytes", "preflightDocumentImportBytesWithEvidence"],
    ["decodeDocumentShape", "decodeDocumentShapeWithEvidence"],
  ] as const;
  for (const [publicName, privateName] of pairs) {
    const publicInfo = functions.get(publicName);
    const privateInfo = functions.get(privateName);
    if (publicInfo === undefined || privateInfo === undefined) {
      findings.push(
        finding(
          parsed,
          parsed.sourceFile,
          F2_DECODER_SOURCE_POLICY_CODES.sharedCore,
          `${publicName} and ${privateName} must both be named wrappers.`,
        ),
      );
      continue;
    }
    const publicCalls = directLocalCalls(publicInfo, functions);
    const privateCalls = directLocalCalls(privateInfo, functions);
    const common = [...new Set(publicCalls)].filter((name) =>
      privateCalls.includes(name),
    );
    if (
      publicCalls.length !== 1 ||
      privateCalls.length !== 1 ||
      common.length !== 1 ||
      WRAPPER_NAMES.has(common[0] ?? "")
    ) {
      findings.push(
        finding(
          parsed,
          publicInfo.declaration,
          F2_DECODER_SOURCE_POLICY_CODES.sharedCore,
          "The public and private wrapper must each directly invoke the same single local core once.",
        ),
      );
    }

    const publicReturn = singleReturnExpression(publicInfo);
    const privateReturn = singleReturnExpression(privateInfo);
    const coreName = common[0];
    const publicBase =
      publicReturn !== null && ts.isPropertyAccessExpression(publicReturn)
        ? unwrapExpression(publicReturn.expression)
        : null;
    const publicIsProjection =
      publicReturn !== null &&
      ts.isPropertyAccessExpression(publicReturn) &&
      publicReturn.name.text === "result" &&
      publicBase !== null &&
      ts.isCallExpression(publicBase) &&
      ts.isIdentifier(unwrapExpression(publicBase.expression)) &&
      (unwrapExpression(publicBase.expression) as ts.Identifier).text === coreName;
    const privateValue = privateReturn === null ? null : unwrapExpression(privateReturn);
    const privateIsCore =
      privateValue !== null &&
      ts.isCallExpression(privateValue) &&
      ts.isIdentifier(unwrapExpression(privateValue.expression)) &&
      (unwrapExpression(privateValue.expression) as ts.Identifier).text === coreName;
    if (!publicIsProjection || !privateIsCore) {
      findings.push(
        finding(
          parsed,
          publicInfo.declaration,
          F2_DECODER_SOURCE_POLICY_CODES.publicWrapperBranch,
          "Public wrappers must be branch-free result projections and private wrappers direct shared-core returns.",
        ),
      );
    }
  }

  const operationsStatement = parsed.sourceFile.statements.find((statement) =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some((declaration) =>
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === "documentDecodeOperations"
    )
  );
  const operationsDeclaration =
    operationsStatement !== undefined && ts.isVariableStatement(operationsStatement)
      ? operationsStatement.declarationList.declarations.find((declaration) =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === "documentDecodeOperations"
        )
      : undefined;
  const initializer = operationsDeclaration?.initializer === undefined
    ? null
    : unwrapExpression(operationsDeclaration.initializer);
  let validOperations = false;
  if (initializer !== null && isObjectFreezeCall(initializer)) {
    const argument = unwrapExpression(initializer.arguments[0] as ts.Expression);
    if (ts.isObjectLiteralExpression(argument)) {
      const entries = argument.properties.map((property) => {
        if (ts.isShorthandPropertyAssignment(property)) {
          return [property.name.text, property.name.text] as const;
        }
        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          ts.isIdentifier(unwrapExpression(property.initializer))
        ) {
          return [
            property.name.text,
            (unwrapExpression(property.initializer) as ts.Identifier).text,
          ] as const;
        }
        return ["", ""] as const;
      });
      const [firstEntry, secondEntry] = entries;
      validOperations =
        entries.length === 2 &&
        firstEntry !== undefined &&
        secondEntry !== undefined &&
        firstEntry[0] === "preflightDocumentImportBytes" &&
        firstEntry[1] === "preflightDocumentImportBytes" &&
        secondEntry[0] === "decodeDocumentShape" &&
        secondEntry[1] === "decodeDocumentShape";
    }
  }
  if (!validOperations) {
    findings.push(
      finding(
        parsed,
        operationsDeclaration ?? parsed.sourceFile,
        F2_DECODER_SOURCE_POLICY_CODES.operationsSurface,
        "documentDecodeOperations must be Object.freeze({preflightDocumentImportBytes, decodeDocumentShape}) in exact key order and identity.",
      ),
    );
  }
  return findings;
}

export function analyzeF2DecoderSourcePolicy(
  input: F2DecoderSourcePolicyInput,
): F2DecoderSourcePolicyFinding[] {
  const decoder = parseModule(input.decoderPath ?? DECODER_PATH, input.decoderSource);
  const domainIndex = parseModule(
    input.domainIndexPath ?? DOMAIN_INDEX_PATH,
    input.domainIndexSource,
  );
  const functions = functionInfos(decoder);
  const reflection = analyzeReflectionRoutine(decoder, functions);
  return sortFindings([
    ...analyzeImportsAndExports(decoder, domainIndex),
    ...analyzeModuleRetention(decoder, functions),
    ...analyzeExternalStateWrites(decoder),
    ...reflection.findings,
    ...analyzeTaintedInput(decoder, functions, reflection.routineName),
    ...analyzeDepthTraversal(decoder, functions),
    ...analyzeCandidateConstruction(decoder, functions),
    ...analyzeClockAndAssertions(decoder),
    ...analyzeSharedCoresAndOperations(decoder, functions),
  ]);
}

export function formatF2DecoderSourcePolicyFinding(
  value: F2DecoderSourcePolicyFinding,
): string {
  return `${value.path}:${String(value.line)}:${String(value.column)} ${value.code} ${value.message}`;
}

export async function inspectF2DecoderSourcePolicy(
  root = process.cwd(),
): Promise<F2DecoderSourcePolicyReport> {
  const decoderPath = resolve(root, DECODER_PATH);
  const domainIndexPath = resolve(root, DOMAIN_INDEX_PATH);
  let decoderSource: string;
  try {
    decoderSource = await readFile(decoderPath, "utf8");
  } catch {
    const missing = parseModule(DECODER_PATH, "");
    return {
      schema: "changes.validation.f2-decoder-source-policy.v1",
      outcome: "fail",
      findings: [
        finding(
          missing,
          missing.sourceFile,
          F2_DECODER_SOURCE_POLICY_CODES.sourceFileMissing,
          `${DECODER_PATH} does not exist.`,
        ),
      ],
    };
  }
  const domainIndexSource = await readFile(domainIndexPath, "utf8");
  const findings = analyzeF2DecoderSourcePolicy({
    decoderSource,
    domainIndexSource,
    decoderPath: relative(root, decoderPath).replaceAll("\\", "/"),
    domainIndexPath: relative(root, domainIndexPath).replaceAll("\\", "/"),
  });
  return {
    schema: "changes.validation.f2-decoder-source-policy.v1",
    outcome: findings.length === 0 ? "pass" : "fail",
    findings,
  };
}

if (import.meta.main) {
  try {
    const report = await inspectF2DecoderSourcePolicy();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.outcome === "pass" ? 0 : 1;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "changes.validation.f2-decoder-source-policy.v1",
          outcome: "tool-failure",
          message:
            error instanceof Error
              ? error.message
              : "Unknown F2 decoder source-policy failure.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  }
}
