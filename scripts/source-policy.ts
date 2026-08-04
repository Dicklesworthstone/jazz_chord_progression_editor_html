import { posix } from "node:path";
import * as ts from "typescript";

export const SOURCE_POLICY_CODES = {
  boundaryLayerDirection: "BOUNDARY_LAYER_DIRECTION",
  boundaryTheoryContent: "BOUNDARY_THEORY_CONTENT",
  boundaryTestSupport: "BOUNDARY_TEST_SUPPORT",
  boundaryPreactOwner: "BOUNDARY_PREACT_OWNER",
  boundaryPackageNotAllowed: "BOUNDARY_PACKAGE_NOT_ALLOWED",
  boundaryPrivateImport: "BOUNDARY_PRIVATE_IMPORT",
  boundaryUnknownLayer: "BOUNDARY_UNKNOWN_LAYER",
  sourceDynamicImport: "SOURCE_PROHIBITED_DYNAMIC_IMPORT",
  sourceRequire: "SOURCE_PROHIBITED_REQUIRE",
  sourceFetch: "SOURCE_PROHIBITED_FETCH",
  sourceXmlHttpRequest: "SOURCE_PROHIBITED_XML_HTTP_REQUEST",
  sourceWebSocket: "SOURCE_PROHIBITED_WEB_SOCKET",
  sourceEventSource: "SOURCE_PROHIBITED_EVENT_SOURCE",
  sourceSendBeacon: "SOURCE_PROHIBITED_SEND_BEACON",
  sourceWorker: "SOURCE_PROHIBITED_WORKER",
  sourceSharedWorker: "SOURCE_PROHIBITED_SHARED_WORKER",
  sourceServiceWorker: "SOURCE_PROHIBITED_SERVICE_WORKER",
  sourceWorkletModule: "SOURCE_PROHIBITED_WORKLET_MODULE",
  sourceImportScripts: "SOURCE_PROHIBITED_IMPORT_SCRIPTS",
  sourcePopupNavigation: "SOURCE_PROHIBITED_POPUP_NAVIGATION",
  sourceDynamicResource: "SOURCE_PROHIBITED_DYNAMIC_RESOURCE",
  sourceCodeEvaluation: "SOURCE_PROHIBITED_CODE_EVALUATION",
  sourceHtmlInjection: "SOURCE_PROHIBITED_HTML_INJECTION",
  sourceWebAudioOwner: "SOURCE_WEB_AUDIO_OWNER",
  sourceDuplicateMember: "SOURCE_DUPLICATE_MEMBER",
  sourceDuplicateExport: "SOURCE_DUPLICATE_EXPORT",
} as const;

export type SourcePolicyCode =
  (typeof SOURCE_POLICY_CODES)[keyof typeof SOURCE_POLICY_CODES];

export type VirtualSource = Readonly<{
  path: string;
  source: string;
}>;

export type SourcePolicyFinding = Readonly<{
  code: SourcePolicyCode;
  path: string;
  start: number;
  end: number;
  line: number;
  column: number;
  message: string;
}>;

export type LayerRule = Readonly<{
  name: string;
  mayImport: readonly string[];
}>;

export type SourcePolicyOptions = Readonly<{
  layerRules?: readonly LayerRule[];
  aliases?: Readonly<Record<string, string>>;
}>;

export const DEFAULT_LAYER_RULES: readonly LayerRule[] = [
  { name: "domain", mayImport: [] },
  { name: "theory", mayImport: ["domain"] },
  { name: "playback", mayImport: ["domain", "theory"] },
  { name: "audio", mayImport: ["domain", "playback"] },
  { name: "compatibility", mayImport: ["domain", "theory"] },
  { name: "persistence", mayImport: ["domain"] },
  { name: "export", mayImport: ["domain", "playback", "theory"] },
  { name: "content", mayImport: ["domain", "theory"] },
  {
    name: "application",
    mayImport: [
      "audio",
      "compatibility",
      "content",
      "domain",
      "export",
      "persistence",
      "playback",
      "theory",
    ],
  },
  { name: "ui", mayImport: ["application", "domain"] },
] as const;

const DEFAULT_ALIASES: Readonly<Record<string, string>> = {
  "@/": "src/",
};

type ParsedSource = Readonly<{
  path: string;
  sourceFile: ts.SourceFile;
}>;

type ExportKind =
  | "class"
  | "default"
  | "enum"
  | "function-implementation"
  | "function-signature"
  | "interface"
  | "namespace"
  | "reexport"
  | "type-alias"
  | "value";

type ExportNamespace = "type" | "value";

type ExportEntry = Readonly<{
  name: string;
  namespace: ExportNamespace;
  kind: ExportKind;
  node: ts.Node;
}>;

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

const ASSET_EXTENSIONS = new Set([
  ".css",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
]);

const WEB_AUDIO_CONSTRUCTORS = new Set([
  "AnalyserNode",
  "AudioBuffer",
  "AudioBufferSourceNode",
  "AudioContext",
  "AudioDestinationNode",
  "AudioNode",
  "AudioParam",
  "AudioWorkletNode",
  "BiquadFilterNode",
  "ChannelMergerNode",
  "ChannelSplitterNode",
  "ConstantSourceNode",
  "ConvolverNode",
  "DelayNode",
  "DynamicsCompressorNode",
  "GainNode",
  "IIRFilterNode",
  "MediaElementAudioSourceNode",
  "MediaStreamAudioDestinationNode",
  "MediaStreamAudioSourceNode",
  "OfflineAudioContext",
  "OscillatorNode",
  "PannerNode",
  "PeriodicWave",
  "StereoPannerNode",
  "WaveShaperNode",
  "webkitAudioContext",
]);

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

function normalizePath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const sourceIndex = normalized.lastIndexOf("/src/");
  if (sourceIndex >= 0) return normalized.slice(sourceIndex + 1);
  const testsIndex = normalized.lastIndexOf("/tests/");
  if (testsIndex >= 0) return normalized.slice(testsIndex + 1);
  const scriptsIndex = normalized.lastIndexOf("/scripts/");
  if (scriptsIndex >= 0) return normalized.slice(scriptsIndex + 1);
  return normalized.replace(/^\.\//, "");
}

function withoutSourceExtension(value: string): string {
  const extension = SOURCE_EXTENSIONS.find((candidate) => value.endsWith(candidate));
  return extension ? value.slice(0, -extension.length) : value;
}

function sourceKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function classifyLayer(path: string): string | null {
  const normalized = normalizePath(path);
  if (normalized === "src/main.tsx" || normalized === "src/main.ts") return "main";
  if (normalized.startsWith("src/test-support/")) return "test-support";
  if (normalized.startsWith("tests/")) return "tests";
  if (normalized.startsWith("scripts/")) return "scripts";
  if (!normalized.startsWith("src/")) return null;
  const segment = normalized.slice("src/".length).split("/")[0];
  return segment && !segment.includes(".") ? segment : "source-root";
}

function isProductionPath(path: string): boolean {
  const layer = classifyLayer(path);
  return path.startsWith("src/") && layer !== "test-support";
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function resolveAlias(
  specifier: string,
  aliases: Readonly<Record<string, string>>,
): string | null {
  for (const prefix of Object.keys(aliases).sort((left, right) => right.length - left.length)) {
    if (specifier.startsWith(prefix)) {
      const replacement = aliases[prefix];
      if (replacement === undefined) continue;
      return posix.normalize(`${replacement}${specifier.slice(prefix.length)}`);
    }
  }
  return null;
}

function resolveProjectSpecifier(
  importerPath: string,
  specifier: string,
  aliases: Readonly<Record<string, string>>,
): string | null {
  const alias = resolveAlias(specifier, aliases);
  if (alias) return normalizePath(alias);
  if (specifier.startsWith("src/")) return normalizePath(specifier);
  if (!isRelativeSpecifier(specifier)) return null;
  return normalizePath(posix.normalize(posix.join(posix.dirname(importerPath), specifier)));
}

function packageRoot(specifier: string): string {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0] ?? specifier;
}

function isPublicLayerEntrypoint(targetPath: string, targetLayer: string): boolean {
  const extensionless = withoutSourceExtension(targetPath).replace(/\/$/, "");
  return (
    extensionless === `src/${targetLayer}` ||
    extensionless === `src/${targetLayer}/index` ||
    (targetLayer === "ui" && extensionless === "src/ui/runtime") ||
    (targetLayer === "application" &&
      extensionless === "src/application/runtime") ||
    /*
     * The audio layer publishes two entries for the same reason ui and
     * application do: `index` is DOM-free so headless projects can consume the
     * engine, transport, and port contracts, and `runtime` carries the one
     * browser adapter that needs the DOM lib.
     */
    (targetLayer === "audio" && extensionless === "src/audio/runtime")
  );
}

function resourceExtension(specifier: string): string | null {
  const clean = specifier.split(/[?#]/, 1)[0] ?? specifier;
  const extension = posix.extname(clean).toLowerCase();
  return ASSET_EXTENSIONS.has(extension) ? extension : null;
}

function locationFor(sourceFile: ts.SourceFile, node: ts.Node): {
  start: number;
  end: number;
  line: number;
  column: number;
} {
  const start = node.getStart(sourceFile);
  const point = sourceFile.getLineAndCharacterOfPosition(start);
  return {
    start,
    end: node.getEnd(),
    line: point.line + 1,
    column: point.character + 1,
  };
}

function finding(
  parsed: ParsedSource,
  node: ts.Node,
  code: SourcePolicyCode,
  message: string,
): SourcePolicyFinding {
  return {
    code,
    path: parsed.path,
    ...locationFor(parsed.sourceFile, node),
    message,
  };
}

function staticPropertyName(name: ts.PropertyName | ts.BindingName): string | null {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPrivateIdentifier(name)) return `#${name.text}`;
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
    return name.text;
  }
  if (ts.isNumericLiteral(name)) return String(Number(name.text));
  if (!ts.isComputedPropertyName(name)) return null;
  const expression = name.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) return String(Number(expression.text));
  if (
    ts.isPrefixUnaryExpression(expression) &&
    (expression.operator === ts.SyntaxKind.PlusToken ||
      expression.operator === ts.SyntaxKind.MinusToken) &&
    ts.isNumericLiteral(expression.operand)
  ) {
    const sign = expression.operator === ts.SyntaxKind.MinusToken ? -1 : 1;
    return String(sign * Number(expression.operand.text));
  }
  return null;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}

function isExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword) ||
    hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

function isDefaultExport(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

function memberKey(member: ts.ClassElement): string | null {
  if (ts.isConstructorDeclaration(member)) return "instance:constructor";
  if (!member.name) return null;
  const name = staticPropertyName(member.name);
  if (!name) return null;
  const scope = hasModifier(member, ts.SyntaxKind.StaticKeyword) ? "static" : "instance";
  return `${scope}:${name}`;
}

function duplicateObjectMembers(
  parsed: ParsedSource,
  object: ts.ObjectLiteralExpression,
): SourcePolicyFinding[] {
  const groups = new Map<string, ts.ObjectLiteralElementLike[]>();
  for (const member of object.properties) {
    if (ts.isSpreadAssignment(member)) continue;
    const name = staticPropertyName(member.name);
    if (!name) continue;
    const group = groups.get(name) ?? [];
    group.push(member);
    groups.set(name, group);
  }

  const findings: SourcePolicyFinding[] = [];
  for (const [name, members] of groups) {
    if (members.length < 2) continue;
    const implementations: ts.ObjectLiteralElementLike[] = [];
    let accessorRepresentative: ts.ObjectLiteralElementLike | null = null;
    let getterSeen = false;
    let setterSeen = false;
    for (const member of members) {
      if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
        const repeated = ts.isGetAccessorDeclaration(member) ? getterSeen : setterSeen;
        if (!accessorRepresentative) {
          accessorRepresentative = member;
          implementations.push(member);
        } else if (repeated) {
          implementations.push(member);
        }
        if (ts.isGetAccessorDeclaration(member)) getterSeen = true;
        else setterSeen = true;
      } else {
        implementations.push(member);
      }
    }
    implementations.sort(
      (left, right) => left.getStart(parsed.sourceFile) - right.getStart(parsed.sourceFile),
    );

    for (const duplicate of implementations.slice(1)) {
      const range = duplicate.name ?? duplicate;
      findings.push(
        finding(
          parsed,
          range,
          SOURCE_POLICY_CODES.sourceDuplicateMember,
          `Object member ${JSON.stringify(name)} has more than one implementation.`,
        ),
      );
    }
  }
  return findings;
}

function duplicateClassMembers(
  parsed: ParsedSource,
  declaration: ts.ClassLikeDeclaration,
): SourcePolicyFinding[] {
  const groups = new Map<string, ts.ClassElement[]>();
  for (const member of declaration.members) {
    const key = memberKey(member);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(member);
    groups.set(key, group);
  }

  const findings: SourcePolicyFinding[] = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const implementations: ts.ClassElement[] = [];
    let accessorRepresentative: ts.ClassElement | null = null;
    let getterSeen = false;
    let setterSeen = false;
    let methodRepresentative: ts.ClassElement | null = null;
    let methodBodySeen = false;
    for (const member of members) {
      if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
        const repeated = ts.isGetAccessorDeclaration(member) ? getterSeen : setterSeen;
        if (!accessorRepresentative) {
          accessorRepresentative = member;
          implementations.push(member);
        } else if (repeated) {
          implementations.push(member);
        }
        if (ts.isGetAccessorDeclaration(member)) getterSeen = true;
        else setterSeen = true;
      } else if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
        if (!methodRepresentative) {
          methodRepresentative = member;
          implementations.push(member);
        }
        if (member.body) {
          if (methodBodySeen) implementations.push(member);
          methodBodySeen = true;
        }
      } else {
        implementations.push(member);
      }
    }
    implementations.sort(
      (left, right) => left.getStart(parsed.sourceFile) - right.getStart(parsed.sourceFile),
    );

    for (const duplicate of implementations.slice(1)) {
      const range = ts.isConstructorDeclaration(duplicate)
        ? duplicate
        : duplicate.name ?? duplicate;
      findings.push(
        finding(
          parsed,
          range,
          SOURCE_POLICY_CODES.sourceDuplicateMember,
          `Class member ${JSON.stringify(key)} is declared by incompatible implementations.`,
        ),
      );
    }
  }
  return findings;
}

function bindingNames(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
  );
}

function directExportEntries(sourceFile: ts.SourceFile): ExportEntry[] {
  const entries: ExportEntry[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      entries.push({
        name: "default",
        namespace: "value",
        kind: "default",
        node: statement,
      });
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) continue;
      if (ts.isNamespaceExport(statement.exportClause)) {
        entries.push({
          name: statement.exportClause.name.text,
          namespace: "value",
          kind: "reexport",
          node: statement.exportClause.name,
        });
        continue;
      }
      for (const element of statement.exportClause.elements) {
        const typeOnly = statement.isTypeOnly || element.isTypeOnly;
        entries.push({
          name: element.name.text,
          namespace: typeOnly ? "type" : "value",
          kind: "reexport",
          node: element.name,
        });
      }
      continue;
    }

    if (!isExported(statement)) continue;
    if (isDefaultExport(statement)) {
      entries.push({
        name: "default",
        namespace: "value",
        kind: "default",
        node: statement,
      });
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) {
          entries.push({ name: name.text, namespace: "value", kind: "value", node: name });
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      entries.push({
        name: statement.name.text,
        namespace: "value",
        kind: statement.body ? "function-implementation" : "function-signature",
        node: statement.name,
      });
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      entries.push({
        name: statement.name.text,
        namespace: "value",
        kind: "class",
        node: statement.name,
      });
    } else if (ts.isEnumDeclaration(statement)) {
      entries.push({
        name: statement.name.text,
        namespace: "value",
        kind: "enum",
        node: statement.name,
      });
    } else if (ts.isInterfaceDeclaration(statement)) {
      entries.push({
        name: statement.name.text,
        namespace: "type",
        kind: "interface",
        node: statement.name,
      });
    } else if (ts.isTypeAliasDeclaration(statement)) {
      entries.push({
        name: statement.name.text,
        namespace: "type",
        kind: "type-alias",
        node: statement.name,
      });
    } else if (ts.isModuleDeclaration(statement)) {
      entries.push({
        name: statement.name.getText(sourceFile),
        namespace: "value",
        kind: "namespace",
        node: statement.name,
      });
    }
  }
  return entries;
}

function moduleLookup(parsed: readonly ParsedSource[]): Map<string, ParsedSource> {
  const result = new Map<string, ParsedSource>();
  for (const source of parsed) {
    const normalized = normalizePath(source.path);
    result.set(normalized, source);
    result.set(withoutSourceExtension(normalized), source);
    const extensionless = withoutSourceExtension(normalized);
    if (extensionless.endsWith("/index")) {
      result.set(extensionless.slice(0, -"/index".length), source);
    }
  }
  return result;
}

function exportedEntriesIncludingStars(
  parsed: ParsedSource,
  sources: Map<string, ParsedSource>,
  aliases: Readonly<Record<string, string>>,
  visiting: ReadonlySet<string> = new Set(),
): ExportEntry[] {
  const direct = directExportEntries(parsed.sourceFile);
  if (visiting.has(parsed.path)) return direct;
  const nextVisiting = new Set(visiting);
  nextVisiting.add(parsed.path);

  for (const statement of parsed.sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      continue;
    }
    const resolved = resolveProjectSpecifier(
      parsed.path,
      statement.moduleSpecifier.text,
      aliases,
    );
    if (!resolved) continue;
    const target = sources.get(resolved) ?? sources.get(withoutSourceExtension(resolved));
    if (!target) continue;
    for (const inherited of exportedEntriesIncludingStars(
      target,
      sources,
      aliases,
      nextVisiting,
    )) {
      if (inherited.name === "default") continue;
      direct.push({
        ...inherited,
        kind: "reexport",
        node: statement.moduleSpecifier,
      });
    }
  }
  return direct;
}

function isLegalExportGroup(entries: readonly ExportEntry[]): boolean {
  if (entries.length < 2) return true;
  if (entries.every((entry) => entry.kind === "interface")) return true;
  if (
    entries.every(
      (entry) =>
        entry.kind === "function-signature" || entry.kind === "function-implementation",
    ) &&
    entries.filter((entry) => entry.kind === "function-implementation").length <= 1
  ) {
    return true;
  }

  const namespaces = entries.filter((entry) => entry.kind === "namespace");
  const mergeTargets = entries.filter((entry) => entry.kind !== "namespace");
  return (
    namespaces.length === 1 &&
    mergeTargets.length === 1 &&
    ["class", "enum", "function-implementation"].includes(
      mergeTargets[0]?.kind ?? "",
    )
  );
}

function duplicateExports(
  parsed: ParsedSource,
  sources: Map<string, ParsedSource>,
  aliases: Readonly<Record<string, string>>,
): SourcePolicyFinding[] {
  const entries = exportedEntriesIncludingStars(parsed, sources, aliases).sort(
    (left, right) =>
      left.node.getStart(parsed.sourceFile) - right.node.getStart(parsed.sourceFile) ||
      left.name.localeCompare(right.name),
  );
  const groups = new Map<string, ExportEntry[]>();
  for (const entry of entries) {
    const key = `${entry.namespace}:${entry.name}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  const findings: SourcePolicyFinding[] = [];
  for (const [key, group] of groups) {
    if (isLegalExportGroup(group)) continue;
    for (const duplicate of group.slice(1)) {
      findings.push(
        finding(
          parsed,
          duplicate.node,
          SOURCE_POLICY_CODES.sourceDuplicateExport,
          `Export ${JSON.stringify(key)} is published more than once.`,
        ),
      );
    }
  }
  return findings;
}

function accessPath(expression: ts.Expression): string[] | null {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (expression.kind === ts.SyntaxKind.ImportKeyword) return ["import"];
  if (ts.isPropertyAccessExpression(expression)) {
    const base = accessPath(expression.expression);
    return base ? [...base, expression.name.text] : null;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    (ts.isStringLiteral(expression.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(expression.argumentExpression))
  ) {
    const base = accessPath(expression.expression);
    return base ? [...base, expression.argumentExpression.text] : null;
  }
  return null;
}

function lastAccessName(expression: ts.Expression): string | null {
  const path = accessPath(expression);
  return path?.at(-1) ?? null;
}

function literalText(expression: ts.Expression | undefined): string | null {
  return expression &&
    (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    ? expression.text
    : null;
}

function capabilityFindings(parsed: ParsedSource, node: ts.Node): SourcePolicyFinding[] {
  if (!isProductionPath(parsed.path)) return [];
  const findings: SourcePolicyFinding[] = [];
  const add = (code: SourcePolicyCode, message: string, range: ts.Node = node): void => {
    findings.push(finding(parsed, range, code, message));
  };

  if (ts.isCallExpression(node)) {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(
        SOURCE_POLICY_CODES.sourceDynamicImport,
        "Dynamic import is forbidden in standalone production source.",
        node.expression,
      );
      return findings;
    }

    const path = accessPath(node.expression);
    const name = path?.at(-1);
    if (name === "require" && path?.length === 1) {
      add(SOURCE_POLICY_CODES.sourceRequire, "CommonJS require is forbidden in browser source.", node.expression);
    } else if (name === "fetch") {
      add(SOURCE_POLICY_CODES.sourceFetch, "Runtime fetch is forbidden in the offline application.", node.expression);
    } else if (name === "sendBeacon") {
      add(SOURCE_POLICY_CODES.sourceSendBeacon, "sendBeacon is forbidden in the offline application.", node.expression);
    } else if (name === "importScripts") {
      add(SOURCE_POLICY_CODES.sourceImportScripts, "importScripts is forbidden in standalone source.", node.expression);
    } else if (name === "register" && path?.slice(-2).join(".") === "serviceWorker.register") {
      add(SOURCE_POLICY_CODES.sourceServiceWorker, "Service-worker registration is forbidden.", node.expression);
    } else if (name === "addModule" && path?.some((part) => /worklet/i.test(part))) {
      add(SOURCE_POLICY_CODES.sourceWorkletModule, "Worklet module loading is forbidden.", node.expression);
    } else if (
      name === "open" &&
      path &&
      (path.length === 1 || ["window", "globalThis", "self"].includes(path[0] ?? ""))
    ) {
      add(SOURCE_POLICY_CODES.sourcePopupNavigation, "Popup navigation is forbidden.", node.expression);
    } else if (name === "eval") {
      add(SOURCE_POLICY_CODES.sourceCodeEvaluation, "Dynamic code evaluation is forbidden.", node.expression);
    } else if (
      ["setTimeout", "setInterval"].includes(name ?? "") &&
      literalText(node.arguments[0]) !== null
    ) {
      add(SOURCE_POLICY_CODES.sourceCodeEvaluation, "String timer callbacks are forbidden.", node.expression);
    } else if (
      ["insertAdjacentHTML", "createContextualFragment"].includes(name ?? "") ||
      (name && ["write", "writeln"].includes(name) && path?.[0] === "document")
    ) {
      add(SOURCE_POLICY_CODES.sourceHtmlInjection, "HTML parsing/insertion sink is forbidden.", node.expression);
    } else if (
      name === "setAttribute" &&
      literalText(node.arguments[0])?.toLowerCase() === "srcdoc"
    ) {
      add(SOURCE_POLICY_CODES.sourceHtmlInjection, "Setting srcdoc is forbidden.", node.expression);
    } else if (
      name === "parseFromString" &&
      literalText(node.arguments[1])?.toLowerCase() === "text/html"
    ) {
      add(SOURCE_POLICY_CODES.sourceHtmlInjection, "Parsing untrusted HTML is forbidden.", node.expression);
    } else if (
      name === "createElement" &&
      ["script", "link", "iframe", "object", "embed"].includes(
        literalText(node.arguments[0])?.toLowerCase() ?? "",
      )
    ) {
      add(
        SOURCE_POLICY_CODES.sourceDynamicResource,
        "Creating executable or navigable resource elements dynamically is forbidden.",
        node.expression,
      );
    }
  }

  if (ts.isNewExpression(node)) {
    const name = lastAccessName(node.expression);
    if (name === "XMLHttpRequest") {
      add(SOURCE_POLICY_CODES.sourceXmlHttpRequest, "XMLHttpRequest is forbidden.", node.expression);
    } else if (name === "WebSocket") {
      add(SOURCE_POLICY_CODES.sourceWebSocket, "WebSocket is forbidden.", node.expression);
    } else if (name === "EventSource") {
      add(SOURCE_POLICY_CODES.sourceEventSource, "EventSource is forbidden.", node.expression);
    } else if (name === "Worker") {
      add(SOURCE_POLICY_CODES.sourceWorker, "Worker is forbidden.", node.expression);
    } else if (name === "SharedWorker") {
      add(SOURCE_POLICY_CODES.sourceSharedWorker, "SharedWorker is forbidden.", node.expression);
    } else if (name === "Function") {
      add(SOURCE_POLICY_CODES.sourceCodeEvaluation, "Function construction is forbidden.", node.expression);
    } else if (["Image", "Audio", "Video"].includes(name ?? "")) {
      add(
        SOURCE_POLICY_CODES.sourceDynamicResource,
        "Dynamic media/resource constructors are forbidden in standalone source.",
        node.expression,
      );
    }

    if (name && WEB_AUDIO_CONSTRUCTORS.has(name) && classifyLayer(parsed.path) !== "audio") {
      add(
        SOURCE_POLICY_CODES.sourceWebAudioOwner,
        "Only the audio layer may construct Web Audio objects.",
        node.expression,
      );
    }
  }

  if (
    ts.isBinaryExpression(node) &&
    ASSIGNMENT_OPERATORS.has(node.operatorToken.kind) &&
    (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
  ) {
    const name = lastAccessName(node.left);
    if (name === "innerHTML" || name === "outerHTML" || name === "srcdoc") {
      add(SOURCE_POLICY_CODES.sourceHtmlInjection, `Assignment to ${name} is forbidden.`, node.left);
    }
  }

  if (ts.isJsxAttribute(node)) {
    const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(parsed.sourceFile);
    if (name === "dangerouslySetInnerHTML" || name.toLowerCase() === "srcdoc") {
      add(SOURCE_POLICY_CODES.sourceHtmlInjection, `JSX attribute ${name} is forbidden.`, node.name);
    }
  }

  if (
    (ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isPropertyDeclaration(node)) &&
    "name" in node &&
    staticPropertyName(node.name) === "dangerouslySetInnerHTML"
  ) {
    add(
      SOURCE_POLICY_CODES.sourceHtmlInjection,
      "dangerouslySetInnerHTML is forbidden.",
      node.name,
    );
  }

  return findings;
}

function checkModuleSpecifier(
  parsed: ParsedSource,
  moduleSpecifier: ts.Expression,
  options: Required<SourcePolicyOptions>,
): SourcePolicyFinding[] {
  if (!ts.isStringLiteralLike(moduleSpecifier)) return [];
  const specifier = moduleSpecifier.text;
  const importerLayer = classifyLayer(parsed.path);
  const production = isProductionPath(parsed.path);
  if (!production || importerLayer === null) return [];

  const asset = resourceExtension(specifier);
  if (asset) {
    return ["main", "ui", "content"].includes(importerLayer)
      ? []
      : [
          finding(
            parsed,
            moduleSpecifier,
            SOURCE_POLICY_CODES.boundaryLayerDirection,
            `Layer ${importerLayer} may not import browser asset ${asset}.`,
          ),
        ];
  }

  const resolved = resolveProjectSpecifier(parsed.path, specifier, options.aliases);
  if (!resolved) {
    const root = packageRoot(specifier);
    if (root === "preact") {
      if (specifier === "preact/compat" || specifier.startsWith("preact/compat/")) {
        return [
          finding(
            parsed,
            moduleSpecifier,
            SOURCE_POLICY_CODES.boundaryPackageNotAllowed,
            "The React compatibility layer is outside the source-owned Preact UI contract.",
          ),
        ];
      }
      const preactOwner =
        importerLayer === "ui" || normalizePath(parsed.path) === "src/main.tsx";
      return preactOwner
        ? []
        : [
            finding(
              parsed,
              moduleSpecifier,
              SOURCE_POLICY_CODES.boundaryPreactOwner,
              "Only ui and src/main.tsx may import Preact.",
            ),
          ];
    }
    return [
      finding(
        parsed,
        moduleSpecifier,
        SOURCE_POLICY_CODES.boundaryPackageNotAllowed,
        `Production package import ${JSON.stringify(root)} is not allowed; Preact is the only runtime package.`,
      ),
    ];
  }

  const targetLayer = classifyLayer(resolved);
  if (targetLayer === null || targetLayer === "source-root") {
    return [
      finding(
        parsed,
        moduleSpecifier,
        SOURCE_POLICY_CODES.boundaryUnknownLayer,
        `Project import ${JSON.stringify(specifier)} does not resolve to a declared layer.`,
      ),
    ];
  }
  if (targetLayer === "test-support" || targetLayer === "tests" || targetLayer === "scripts") {
    return [
      finding(
        parsed,
        moduleSpecifier,
        SOURCE_POLICY_CODES.boundaryTestSupport,
        "Production modules may not import test-support, tests, or scripts.",
      ),
    ];
  }
  if (targetLayer === importerLayer) return [];

  const declaredLayers = new Set(options.layerRules.map((rule) => rule.name));
  if (!declaredLayers.has(targetLayer)) {
    return [
      finding(
        parsed,
        moduleSpecifier,
        SOURCE_POLICY_CODES.boundaryUnknownLayer,
        `Target layer ${JSON.stringify(targetLayer)} is not declared by the foundation contract.`,
      ),
    ];
  }

  const allowed =
    importerLayer === "main"
      ? new Set(options.layerRules.map((rule) => rule.name))
      : new Set(
          options.layerRules.find((rule) => rule.name === importerLayer)?.mayImport ?? [],
        );
  if (!allowed.has(targetLayer)) {
    const code =
      importerLayer === "theory" && targetLayer === "content"
        ? SOURCE_POLICY_CODES.boundaryTheoryContent
        : SOURCE_POLICY_CODES.boundaryLayerDirection;
    return [
      finding(
        parsed,
        moduleSpecifier,
        code,
        `Layer ${importerLayer} may not import layer ${targetLayer}.`,
      ),
    ];
  }

  if (!isPublicLayerEntrypoint(resolved, targetLayer)) {
    return [
      finding(
        parsed,
        moduleSpecifier,
        SOURCE_POLICY_CODES.boundaryPrivateImport,
        `Cross-layer import must use the public ${targetLayer} entry point.`,
      ),
    ];
  }
  return [];
}

function moduleSpecifierNode(node: ts.Node): ts.Expression | null {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier ?? null;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference)
  ) {
    return node.moduleReference.expression;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  ) {
    return node.argument.literal;
  }
  return null;
}

function sortFindings(findings: SourcePolicyFinding[]): SourcePolicyFinding[] {
  return findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.start - right.start ||
      left.end - right.end ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
}

export function analyzeSourcePolicy(
  sources: readonly VirtualSource[],
  options: SourcePolicyOptions = {},
): SourcePolicyFinding[] {
  const resolvedOptions: Required<SourcePolicyOptions> = {
    layerRules: options.layerRules ?? DEFAULT_LAYER_RULES,
    aliases: options.aliases ?? DEFAULT_ALIASES,
  };
  const parsed = sources
    .map((source): ParsedSource => {
      const path = normalizePath(source.path);
      return {
        path,
        sourceFile: ts.createSourceFile(
          path,
          source.source,
          ts.ScriptTarget.Latest,
          true,
          sourceKind(path),
        ),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const lookup = moduleLookup(parsed);
  const findings: SourcePolicyFinding[] = [];

  for (const source of parsed) {
    const visit = (node: ts.Node): void => {
      const specifier = moduleSpecifierNode(node);
      if (specifier) {
        findings.push(...checkModuleSpecifier(source, specifier, resolvedOptions));
      }
      if (ts.isObjectLiteralExpression(node)) {
        findings.push(...duplicateObjectMembers(source, node));
      }
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        findings.push(...duplicateClassMembers(source, node));
      }
      findings.push(...capabilityFindings(source, node));
      ts.forEachChild(node, visit);
    };
    visit(source.sourceFile);
    findings.push(...duplicateExports(source, lookup, resolvedOptions.aliases));
  }
  return sortFindings(findings);
}

export function formatSourcePolicyFinding(value: SourcePolicyFinding): string {
  return `${value.path}:${String(value.line)}:${String(value.column)} ${value.code} ${value.message}`;
}

async function projectSources(root: string): Promise<VirtualSource[]> {
  const sources: VirtualSource[] = [];
  const glob = new Bun.Glob("src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}");
  for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
    sources.push({
      path: normalizePath(path),
      source: await Bun.file(posix.join(root.replaceAll("\\", "/"), path)).text(),
    });
  }
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

export async function inspectProjectSourcePolicy(
  root = process.cwd(),
): Promise<Readonly<{
  schema: "jcpe.source-policy.v1";
  traceIds: readonly ["F0-BOUNDARY-01", "F0-DUPLICATE-01"];
  outcome: "pass" | "fail";
  files: number;
  findings: readonly SourcePolicyFinding[];
}>> {
  const sources = await projectSources(root);
  const findings = analyzeSourcePolicy(sources);
  return {
    schema: "jcpe.source-policy.v1",
    traceIds: ["F0-BOUNDARY-01", "F0-DUPLICATE-01"],
    outcome: findings.length === 0 ? "pass" : "fail",
    files: sources.length,
    findings,
  };
}

if (import.meta.main) {
  try {
    const report = await inspectProjectSourcePolicy();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.outcome === "pass" ? 0 : 1;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "jcpe.source-policy.v1",
          outcome: "tool-failure",
          message: error instanceof Error ? error.message : "Unknown source-policy failure.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  }
}
