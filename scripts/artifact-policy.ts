import { createHash } from "node:crypto";
import * as ts from "typescript";

export const GENERATED_ARTIFACT_BANNER =
  "<!-- @generated; edit src/, then run bun run build -->";
export const DEFAULT_MAX_ARTIFACT_BYTES = 9_437_184;
export const DEFAULT_FOUNDATION_SHELL_BYTES = 262_144;

const REQUIRED_NONE_DIRECTIVES = [
  "base-uri",
  "connect-src",
  "default-src",
  "form-action",
  "frame-src",
  "manifest-src",
  "object-src",
  "worker-src",
] as const;

export type ArtifactFinding = {
  code: string;
  path: string;
  message: string;
  offset: number;
  line: number;
  column: number;
};

export type ArtifactInspectionOptions = {
  maxBytes?: number;
  shellMaxBytes?: number;
  requireReleaseEnvelope?: boolean;
};

export type ArtifactInspection = {
  schema: "jcpe.artifact-inspection.v1";
  outcome: "pass" | "fail";
  artifact: {
    sha256: string;
    bytes: number;
    maxBytes: number;
    shellMaxBytes: number | null;
  };
  html: {
    elements: number;
    inlineScripts: number;
    inlineStyles: number;
    embeddedAssets: number;
    urlBearingAttributes: number;
  };
  csp: {
    required: boolean;
    present: boolean;
    directives: Record<string, string[]>;
    scriptHashes: string[];
    styleHashes: string[];
  };
  findings: ArtifactFinding[];
};

export type LicenseRecord = {
  name: string;
  version: string;
  license: string;
  source: string;
  role?: string;
  class?: string;
  bundledInArtifact?: boolean;
  noticeEmbedded?: boolean;
  licenseTextSha256?: string;
};

export type AssetLicenseRecord = {
  id: string;
  mime: string;
  bytes: number;
  sha256: string;
  source: string;
  license: string;
};

export type LicenseReport = {
  schemaVersion: 1;
  packages: LicenseRecord[];
  assets: AssetLicenseRecord[];
};

export type StandaloneManifest = {
  schemaVersion: 1;
  artifact: {
    path: string;
    sha256: string;
    bytes: number;
    budgetBytes: number;
    remainingBytes: number;
    foundationShellBudgetBytes: number;
    rootEqualsDist: true;
  };
  build: {
    bunVersion: string;
    target: "browser";
    sourceSha256: string;
  };
  html: {
    generatedBanner: string;
    compatModeExpected: "CSS1Compat";
    inlineScriptCount: number;
    inlineStyleCount: number;
    embeddedAssetCount: number;
    forbiddenReferences: ArtifactFinding[];
  };
  licenses: LicenseRecord[];
  assets: AssetLicenseRecord[];
};

type AttributeToken = {
  name: string;
  value: string;
  offset: number;
};

type ElementToken = {
  name: string;
  attributes: AttributeToken[];
  content: string;
  contentOffset: number;
  offset: number;
  path: string;
};

type FindingCollector = {
  add: (code: string, path: string, message: string, offset: number) => void;
};

type UrlKind =
  | "empty"
  | "fragment"
  | "data"
  | "blob"
  | "remote"
  | "relative"
  | "unsafe";

const encoder = new TextEncoder();

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Base64(value: string): string {
  return createHash("sha256").update(value).digest("base64");
}

function lineAndColumn(source: string, offset: number): {
  line: number;
  column: number;
} {
  let line = 1;
  let column = 1;
  const end = Math.max(0, Math.min(offset, source.length));
  for (let index = 0; index < end; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function findingCollector(source: string, findings: ArtifactFinding[]): FindingCollector {
  const seen = new Set<string>();
  return {
    add(code, path, message, rawOffset) {
      const offset = Math.max(0, Math.min(rawOffset, source.length));
      const key = [code, path, String(offset), message].join("\u0000");
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({
        code,
        path,
        message,
        offset,
        ...lineAndColumn(source, offset),
      });
    },
  };
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    colon: ":",
    gt: ">",
    lt: "<",
    nbsp: "\u00a0",
    period: ".",
    quot: '"',
    sol: "/",
  };
  return value.replace(
    /&(?:#(x[0-9a-f]+|\d+)|([a-z][a-z0-9]+));?/gi,
    (match, numeric: string | undefined, name: string | undefined) => {
      if (numeric) {
        const radix = numeric[0]?.toLowerCase() === "x" ? 16 : 10;
        const digits = radix === 16 ? numeric.slice(1) : numeric;
        const codePoint = Number.parseInt(digits, radix);
        if (
          Number.isFinite(codePoint) &&
          codePoint > 0 &&
          codePoint <= 0x10ffff &&
          !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return String.fromCodePoint(codePoint);
        }
        return "\ufffd";
      }
      return name ? (named[name.toLowerCase()] ?? match) : match;
    },
  );
}

function isNameCharacter(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_:.-]/.test(char);
}

function findTagEnd(source: string, from: number): number {
  let quote: string | null = null;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }
  return -1;
}

function parseAttributes(
  source: string,
  start: number,
  end: number,
  path: string,
  collector: FindingCollector,
): AttributeToken[] {
  const attributes: AttributeToken[] = [];
  const names = new Set<string>();
  let index = start;

  while (index < end) {
    while (index < end && /\s|\//.test(source[index] ?? "")) index += 1;
    if (index >= end) break;
    const nameOffset = index;
    while (index < end && isNameCharacter(source[index])) index += 1;
    if (index === nameOffset) {
      index += 1;
      continue;
    }
    const name = source.slice(nameOffset, index).toLowerCase();
    while (index < end && /\s/.test(source[index] ?? "")) index += 1;
    let value = "";
    let valueOffset = index;
    if (source[index] === "=") {
      index += 1;
      while (index < end && /\s/.test(source[index] ?? "")) index += 1;
      valueOffset = index;
      const quote = source[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        valueOffset = index;
        const valueStart = index;
        while (index < end && source[index] !== quote) index += 1;
        value = source.slice(valueStart, index);
        if (index < end) index += 1;
      } else {
        const valueStart = index;
        while (index < end && !/\s|>/.test(source[index] ?? "")) index += 1;
        value = source.slice(valueStart, index);
      }
    }
    if (names.has(name)) {
      collector.add(
        "ARTIFACT_DUPLICATE_ATTRIBUTE",
        `${path}.attributes.${name}`,
        `Duplicate HTML attribute: ${name}.`,
        nameOffset,
      );
      continue;
    }
    names.add(name);
    attributes.push({
      name,
      value: decodeHtmlEntities(value),
      offset: valueOffset,
    });
  }
  return attributes;
}

function tokenizeHtml(source: string, collector: FindingCollector): ElementToken[] {
  const elements: ElementToken[] = [];
  const counts = new Map<string, number>();
  const lower = source.toLowerCase();
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open < 0) break;
    if (source.startsWith("<!--", open)) {
      const close = source.indexOf("-->", open + 4);
      index = close < 0 ? source.length : close + 3;
      continue;
    }
    if (source.startsWith("<!", open) || source.startsWith("<?", open)) {
      const close = findTagEnd(source, open + 2);
      index = close < 0 ? source.length : close + 1;
      continue;
    }
    if (source.startsWith("</", open)) {
      const close = findTagEnd(source, open + 2);
      index = close < 0 ? source.length : close + 1;
      continue;
    }

    let cursor = open + 1;
    while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
    const nameStart = cursor;
    while (cursor < source.length && isNameCharacter(source[cursor])) cursor += 1;
    if (cursor === nameStart) {
      index = open + 1;
      continue;
    }
    const name = source.slice(nameStart, cursor).toLowerCase();
    const close = findTagEnd(source, cursor);
    if (close < 0) {
      collector.add(
        "ARTIFACT_HTML_PARSE",
        "$.html",
        `Unterminated <${name}> start tag.`,
        open,
      );
      break;
    }
    const ordinal = counts.get(name) ?? 0;
    counts.set(name, ordinal + 1);
    const path = `$.html.${name}[${String(ordinal)}]`;
    const attributes = parseAttributes(source, cursor, close, path, collector);
    const selfClosing = /\/\s*>$/.test(source.slice(open, close + 1));
    let content = "";
    const contentOffset = close + 1;
    let next = close + 1;

    if (!selfClosing && (name === "script" || name === "style")) {
      const closingStart = lower.indexOf(`</${name}`, contentOffset);
      if (closingStart < 0) {
        content = source.slice(contentOffset);
        collector.add(
          "ARTIFACT_HTML_PARSE",
          path,
          `Missing closing </${name}> tag.`,
          open,
        );
        next = source.length;
      } else {
        content = source.slice(contentOffset, closingStart);
        const closingEnd = findTagEnd(source, closingStart + name.length + 2);
        next = closingEnd < 0 ? source.length : closingEnd + 1;
      }
    }

    elements.push({
      name,
      attributes,
      content,
      contentOffset,
      offset: open,
      path,
    });
    index = next;
  }
  return elements;
}

function attribute(element: ElementToken, name: string): AttributeToken | undefined {
  return element.attributes.find((item) => item.name === name);
}

function normalizedUrlPrefix(value: string): string {
  let normalized = "";
  for (const character of value.trim()) {
    if ((character.codePointAt(0) ?? 0) > 0x20) normalized += character;
  }
  return normalized.toLowerCase();
}

function urlKind(value: string): UrlKind {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "empty";
  if (trimmed.startsWith("#")) return "fragment";
  const prefix = normalizedUrlPrefix(trimmed);
  if (prefix.startsWith("data:")) return "data";
  if (prefix.startsWith("blob:")) return "blob";
  if (prefix.startsWith("//")) return "remote";
  if (/^(?:https?|wss?):/.test(prefix)) return "remote";
  if (/^(?:javascript|vbscript):/.test(prefix)) return "unsafe";
  if (/^[a-z][a-z0-9+.-]*:/.test(prefix)) return "relative";
  return "relative";
}

function passiveDataUrl(value: string, family: "image" | "media" | "font"): boolean {
  const prefix = normalizedUrlPrefix(value);
  if (family === "image") return prefix.startsWith("data:image/");
  if (family === "media") {
    return prefix.startsWith("data:audio/") || prefix.startsWith("data:video/");
  }
  return (
    prefix.startsWith("data:font/") ||
    prefix.startsWith("data:application/font-") ||
    prefix.startsWith("data:application/vnd.ms-fontobject")
  );
}

function requiresResource(value: string, passiveFamily?: "image" | "media" | "font"): boolean {
  const kind = urlKind(value);
  if (kind === "empty" || kind === "fragment" || kind === "blob") return false;
  if (kind === "data") {
    return passiveFamily ? !passiveDataUrl(value, passiveFamily) : true;
  }
  return true;
}

function isRemote(value: string): boolean {
  return urlKind(value) === "remote";
}

function parseSrcset(value: string): string[] {
  const candidates: string[] = [];
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /[\s,]/.test(value[index] ?? "")) index += 1;
    if (index >= value.length) break;
    const start = index;
    while (index < value.length && !/\s/.test(value[index] ?? "")) index += 1;
    let candidate = value.slice(start, index);
    if (!candidate.toLowerCase().startsWith("data:")) {
      candidate = candidate.replace(/,+$/, "");
    }
    if (candidate.length > 0) candidates.push(candidate);
    let quote: string | null = null;
    let depth = 0;
    while (index < value.length) {
      const char = value[index];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth = Math.max(0, depth - 1);
      } else if (char === "," && depth === 0) {
        index += 1;
        break;
      }
      index += 1;
    }
  }
  return candidates;
}

function cssStringEnd(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function cssCommentEnd(source: string, start: number): number {
  const end = source.indexOf("*/", start + 2);
  return end < 0 ? source.length : end + 2;
}

function cssIdentifier(source: string, start: number): { value: string; end: number } {
  let index = start;
  let value = "";
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      const hex = source.slice(index + 1).match(/^[0-9a-f]{1,6}\s?/i)?.[0];
      if (hex) {
        value += String.fromCodePoint(Number.parseInt(hex.trim(), 16));
        index += 1 + hex.length;
        continue;
      }
      const escaped = source[index + 1];
      if (escaped !== undefined) {
        value += escaped;
        index += 2;
        continue;
      }
    }
    if (char === undefined || !/[A-Za-z0-9_-]/.test(char)) break;
    value += char;
    index += 1;
  }
  return { value: value.toLowerCase(), end: index };
}

function parseCssFunction(
  source: string,
  open: number,
): { content: string; end: number } {
  let depth = 1;
  let index = open + 1;
  while (index < source.length && depth > 0) {
    if (source.startsWith("/*", index)) {
      index = cssCommentEnd(source, index);
      continue;
    }
    const char = source[index];
    if (char === '"' || char === "'") {
      index = cssStringEnd(source, index);
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    index += 1;
  }
  const contentEnd = depth === 0 ? index - 1 : source.length;
  return { content: source.slice(open + 1, contentEnd), end: index };
}

function unquoteCssValue(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).replace(/\\([\\'"() ])/g, "$1");
  }
  return trimmed;
}

function imageSetStringUrls(content: string): string[] {
  const values: string[] = [];
  let index = 0;
  while (index < content.length) {
    if (content.startsWith("/*", index)) {
      index = cssCommentEnd(content, index);
      continue;
    }
    const char = content[index];
    if (char === '"' || char === "'") {
      const end = cssStringEnd(content, index);
      values.push(unquoteCssValue(content.slice(index, end)));
      index = end;
      continue;
    }
    index += 1;
  }
  return values;
}

function inspectCss(
  source: string,
  baseOffset: number,
  path: string,
  collector: FindingCollector,
): void {
  const blockStack: boolean[] = [];
  let pendingFontFace = false;
  let index = 0;

  const sourceMap = /(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=/i.exec(source);
  if (sourceMap) {
    collector.add(
      "ARTIFACT_SOURCE_MAP",
      path,
      "Generated CSS must not reference a source map.",
      baseOffset + sourceMap.index,
    );
  }

  while (index < source.length) {
    if (source.startsWith("/*", index)) {
      index = cssCommentEnd(source, index);
      continue;
    }
    const char = source[index];
    if (char === '"' || char === "'") {
      index = cssStringEnd(source, index);
      continue;
    }
    if (char === "{") {
      blockStack.push(pendingFontFace || (blockStack.at(-1) ?? false));
      pendingFontFace = false;
      index += 1;
      continue;
    }
    if (char === "}") {
      blockStack.pop();
      pendingFontFace = false;
      index += 1;
      continue;
    }
    if (char === "@") {
      const identifier = cssIdentifier(source, index + 1);
      if (identifier.value === "font-face") {
        pendingFontFace = true;
        index = identifier.end;
        continue;
      }
      if (identifier.value === "import") {
        collector.add(
          "ARTIFACT_CSS_IMPORT",
          path,
          "CSS @import creates a runtime sidecar request.",
          baseOffset + index,
        );
        let cursor = identifier.end;
        let depth = 0;
        while (cursor < source.length) {
          if (source.startsWith("/*", cursor)) {
            cursor = cssCommentEnd(source, cursor);
            continue;
          }
          const item = source[cursor];
          if (item === '"' || item === "'") {
            cursor = cssStringEnd(source, cursor);
            continue;
          }
          if (item === "(") depth += 1;
          else if (item === ")") depth = Math.max(0, depth - 1);
          else if (item === ";" && depth === 0) {
            cursor += 1;
            break;
          }
          cursor += 1;
        }
        index = cursor;
        continue;
      }
    }
    if (/[A-Za-z_\\-]/.test(char ?? "")) {
      const identifier = cssIdentifier(source, index);
      let cursor = identifier.end;
      while (/\s/.test(source[cursor] ?? "")) cursor += 1;
      if (source[cursor] === "(") {
        const parsed = parseCssFunction(source, cursor);
        if (identifier.value === "url") {
          const value = unquoteCssValue(parsed.content);
          const inFontFace = blockStack.at(-1) ?? false;
          const family = inFontFace ? "font" : "image";
          if (requiresResource(value, family)) {
            collector.add(
              inFontFace
                ? "ARTIFACT_EXTERNAL_FONT"
                : "ARTIFACT_CSS_EXTERNAL_ASSET",
              path,
              inFontFace
                ? "CSS font URL must be an inventoried embedded font."
                : "CSS asset URL must be an inventoried embedded asset.",
              baseOffset + index,
            );
          }
          index = parsed.end;
          continue;
        }
        if (identifier.value === "image-set" || identifier.value === "-webkit-image-set") {
          const external = imageSetStringUrls(parsed.content).some((value) =>
            requiresResource(value, "image")
          );
          if (external) {
            collector.add(
              "ARTIFACT_CSS_EXTERNAL_ASSET",
              path,
              "CSS image-set contains a non-embedded candidate.",
              baseOffset + index,
            );
          }
          // Continue into the function so nested url() candidates are inspected too.
        }
      }
      index = Math.max(index + 1, identifier.end);
      continue;
    }
    index += 1;
  }
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function staticString(expression: ts.Expression | undefined): string | undefined {
  if (!expression) return undefined;
  const current = unwrapExpression(expression);
  if (ts.isStringLiteralLike(current)) return current.text;
  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(current.left);
    const right = staticString(current.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}

function memberPath(expression: ts.Expression): string[] | undefined {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) return [current.text];
  if (ts.isPropertyAccessExpression(current)) {
    const base = memberPath(current.expression);
    return base ? [...base, current.name.text] : undefined;
  }
  if (ts.isElementAccessExpression(current)) {
    const base = memberPath(current.expression);
    const property = staticString(current.argumentExpression);
    return base && property !== undefined ? [...base, property] : undefined;
  }
  return undefined;
}

function pathEnds(path: string[] | undefined, suffix: readonly string[]): boolean {
  if (!path || path.length < suffix.length) return false;
  return suffix.every(
    (item, index) => path[path.length - suffix.length + index] === item,
  );
}

function nodeOffset(node: ts.Node, baseOffset: number, file: ts.SourceFile): number {
  return baseOffset + node.getStart(file, false);
}

function inspectJavaScript(
  source: string,
  baseOffset: number,
  path: string,
  collector: FindingCollector,
): void {
  const sourceMap = /(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=/i.exec(source);
  if (sourceMap) {
    collector.add(
      "ARTIFACT_SOURCE_MAP",
      path,
      "Generated JavaScript must not reference a source map.",
      baseOffset + sourceMap.index,
    );
  }

  const file = ts.createSourceFile(
    "inline-artifact.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined)
    ) {
      collector.add(
        "ARTIFACT_STATIC_IMPORT",
        path,
        "Standalone JavaScript must not contain a static module import.",
        nodeOffset(node, baseOffset, file),
      );
    }

    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        collector.add(
          "ARTIFACT_DYNAMIC_IMPORT",
          path,
          "Standalone JavaScript must not contain dynamic import().",
          nodeOffset(node, baseOffset, file),
        );
      } else {
        const pathParts = memberPath(node.expression);
        const last = pathParts?.at(-1);
        const first = pathParts?.[0];
        const globalOwner =
          pathParts?.length === 1 ||
          first === "globalThis" ||
          first === "window" ||
          first === "self";
        if (last === "fetch" && globalOwner) {
          collector.add(
            "ARTIFACT_FETCH",
            path,
            "fetch() is forbidden in the standalone runtime.",
            nodeOffset(node, baseOffset, file),
          );
        }
        if (pathEnds(pathParts, ["navigator", "sendBeacon"])) {
          collector.add(
            "ARTIFACT_SEND_BEACON",
            path,
            "navigator.sendBeacon() is forbidden in the offline runtime.",
            nodeOffset(node, baseOffset, file),
          );
        }
        if (pathEnds(pathParts, ["navigator", "serviceWorker", "register"])) {
          collector.add(
            "ARTIFACT_SERVICE_WORKER",
            path,
            "Service-worker registration is forbidden.",
            nodeOffset(node, baseOffset, file),
          );
        }
        if (
          last === "addModule" &&
          pathParts?.some((part) => /worklet$/i.test(part))
        ) {
          collector.add(
            "ARTIFACT_WORKLET_MODULE",
            path,
            "Worklet module loading is forbidden.",
            nodeOffset(node, baseOffset, file),
          );
        }
        if (
          (pathEnds(pathParts, ["window", "open"]) ||
            pathEnds(pathParts, ["globalThis", "open"])) &&
          node.arguments.length > 0
        ) {
          collector.add(
            "ARTIFACT_POPUP_NAVIGATION",
            path,
            "Popup navigation is outside the offline product boundary.",
            nodeOffset(node, baseOffset, file),
          );
        }
        if (last === "require" && node.arguments.length > 0) {
          collector.add(
            "ARTIFACT_STATIC_IMPORT",
            path,
            "Runtime require() is a standalone sidecar dependency.",
            nodeOffset(node, baseOffset, file),
          );
        }
        if (
          last === "setAttribute" &&
          node.arguments.length >= 2 &&
          ["action", "data", "href", "poster", "src", "srcset"].includes(
            staticString(node.arguments[0])?.toLowerCase() ?? "",
          )
        ) {
          const target = staticString(node.arguments[1]);
          if (target !== undefined && requiresResource(target, "image")) {
            collector.add(
              "ARTIFACT_DYNAMIC_RESOURCE_URL",
              path,
              "JavaScript assigns a non-embedded resource URL.",
              nodeOffset(node, baseOffset, file),
            );
          }
        }
      }
    }

    if (ts.isNewExpression(node)) {
      const pathParts = memberPath(node.expression);
      const name = pathParts?.at(-1);
      const mapping: Record<string, [string, string]> = {
        EventSource: [
          "ARTIFACT_EVENT_SOURCE",
          "EventSource is forbidden in the offline runtime.",
        ],
        SharedWorker: [
          "ARTIFACT_SHARED_WORKER",
          "SharedWorker is forbidden in the standalone runtime.",
        ],
        WebSocket: [
          "ARTIFACT_WEB_SOCKET",
          "WebSocket is forbidden in the offline runtime.",
        ],
        Worker: [
          "ARTIFACT_WORKER",
          "Worker is forbidden in the standalone runtime.",
        ],
        XMLHttpRequest: [
          "ARTIFACT_XML_HTTP_REQUEST",
          "XMLHttpRequest is forbidden in the offline runtime.",
        ],
      };
      const finding = name ? mapping[name] : undefined;
      if (finding) {
        collector.add(
          finding[0],
          path,
          finding[1],
          nodeOffset(node, baseOffset, file),
        );
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const targetPath = memberPath(node.left);
      const targetName = targetPath?.at(-1)?.toLowerCase();
      const value = staticString(node.right);
      if (
        targetName &&
        ["action", "data", "href", "poster", "src", "srcset"].includes(targetName) &&
        value !== undefined &&
        requiresResource(value, "image")
      ) {
        collector.add(
          "ARTIFACT_DYNAMIC_RESOURCE_URL",
          path,
          "JavaScript assigns a non-embedded resource URL.",
          nodeOffset(node, baseOffset, file),
        );
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(file);
}

function executableScript(element: ElementToken): boolean {
  const type = attribute(element, "type")?.value.trim().toLowerCase();
  if (!type || type === "module") return true;
  return (
    type === "text/javascript" ||
    type === "application/javascript" ||
    type.endsWith("/ecmascript")
  );
}

function externalCodeForResource(
  value: string,
  remoteCode: string,
  sidecarCode = "ARTIFACT_RUNTIME_SIDECAR",
): string | null {
  const kind = urlKind(value);
  if (kind === "empty" || kind === "fragment" || kind === "blob") return null;
  if (kind === "data") return "ARTIFACT_EXECUTABLE_DATA_URL";
  return isRemote(value) ? remoteCode : sidecarCode;
}

function inspectElement(
  element: ElementToken,
  collector: FindingCollector,
  counts: {
    inlineScripts: number;
    inlineStyles: number;
    embeddedAssets: number;
    urlBearingAttributes: number;
  },
  requireReleaseEnvelope: boolean,
): void {
  const addUrlCount = (item: AttributeToken | undefined): void => {
    if (item) counts.urlBearingAttributes += 1;
  };
  const addResourceFinding = (
    item: AttributeToken,
    remoteCode: string,
    message: string,
    sidecarCode = "ARTIFACT_RUNTIME_SIDECAR",
  ): void => {
    const code = externalCodeForResource(item.value, remoteCode, sidecarCode);
    if (code) collector.add(code, `${element.path}.attributes.${item.name}`, message, item.offset);
  };

  const styleAttribute = attribute(element, "style");
  if (styleAttribute) {
    inspectCss(
      styleAttribute.value,
      styleAttribute.offset,
      `${element.path}.attributes.style`,
      collector,
    );
    if (requireReleaseEnvelope) {
      collector.add(
        "ARTIFACT_INLINE_STYLE_ATTRIBUTE",
        `${element.path}.attributes.style`,
        "Hash-authorized CSP does not permit inline style attributes.",
        styleAttribute.offset,
      );
    }
  }
  for (const item of element.attributes) {
    if (item.name.startsWith("on")) {
      inspectJavaScript(
        item.value,
        item.offset,
        `${element.path}.attributes.${item.name}`,
        collector,
      );
      if (requireReleaseEnvelope) {
        collector.add(
          "ARTIFACT_INLINE_EVENT_HANDLER",
          `${element.path}.attributes.${item.name}`,
          "Hash-authorized CSP does not permit inline event attributes.",
          item.offset,
        );
      }
    }
  }

  if (element.name === "script") {
    const src = attribute(element, "src");
    addUrlCount(src);
    if (src) {
      addResourceFinding(
        src,
        "ARTIFACT_EXTERNAL_SCRIPT",
        "Script source must be inlined in the standalone artifact.",
      );
    } else if (executableScript(element)) {
      counts.inlineScripts += 1;
      inspectJavaScript(element.content, element.contentOffset, element.path, collector);
    } else if (attribute(element, "type")?.value.trim().toLowerCase() === "importmap") {
      collector.add(
        "ARTIFACT_STATIC_IMPORT",
        element.path,
        "Import maps imply runtime module resolution and are forbidden.",
        element.offset,
      );
    }
    return;
  }

  if (element.name === "style") {
    counts.inlineStyles += 1;
    inspectCss(element.content, element.contentOffset, element.path, collector);
    return;
  }

  if (element.name === "link") {
    const href = attribute(element, "href");
    addUrlCount(href);
    if (!href) return;
    const rel = new Set(
      (attribute(element, "rel")?.value.toLowerCase().split(/\s+/) ?? []).filter(Boolean),
    );
    const as = attribute(element, "as")?.value.toLowerCase();
    if (rel.has("stylesheet")) {
      addResourceFinding(
        href,
        "ARTIFACT_EXTERNAL_STYLESHEET",
        "Stylesheet must be inlined in the standalone artifact.",
      );
    } else if (rel.has("modulepreload") || (rel.has("preload") && as === "script")) {
      addResourceFinding(
        href,
        "ARTIFACT_EXTERNAL_SCRIPT",
        "Module/script preload is a runtime sidecar dependency.",
      );
    } else if (rel.has("manifest")) {
      addResourceFinding(
        href,
        "ARTIFACT_EXTERNAL_MANIFEST",
        "External application manifests are forbidden.",
        "ARTIFACT_EXTERNAL_MANIFEST",
      );
    } else if (rel.has("preload") && as === "font") {
      if (requiresResource(href.value, "font")) {
        collector.add(
          "ARTIFACT_EXTERNAL_FONT",
          `${element.path}.attributes.href`,
          "Font preload must use an inventoried embedded font.",
          href.offset,
        );
      }
    } else if (
      rel.has("icon") ||
      rel.has("apple-touch-icon") ||
      (rel.has("preload") && as === "image")
    ) {
      if (urlKind(href.value) === "data" && passiveDataUrl(href.value, "image")) {
        counts.embeddedAssets += 1;
      } else if (requiresResource(href.value, "image")) {
        collector.add(
          isRemote(href.value) ? "ARTIFACT_EXTERNAL_IMAGE" : "ARTIFACT_RUNTIME_SIDECAR",
          `${element.path}.attributes.href`,
          "Linked image must be an inventoried embedded image.",
          href.offset,
        );
      }
    } else if (requiresResource(href.value)) {
      collector.add(
        "ARTIFACT_EXTERNAL_LINK",
        `${element.path}.attributes.href`,
        "External link metadata is outside the standalone contract.",
        href.offset,
      );
    }
    return;
  }

  if (element.name === "img" || element.name === "image") {
    const src = attribute(element, element.name === "image" ? "href" : "src") ??
      attribute(element, "xlink:href");
    addUrlCount(src);
    if (src) {
      const kind = urlKind(src.value);
      if (kind === "data" && passiveDataUrl(src.value, "image")) {
        counts.embeddedAssets += 1;
      } else if (requiresResource(src.value, "image")) {
        collector.add(
          isRemote(src.value) ? "ARTIFACT_EXTERNAL_IMAGE" : "ARTIFACT_RUNTIME_SIDECAR",
          `${element.path}.attributes.${src.name}`,
          "Image must be an inventoried embedded image.",
          src.offset,
        );
      }
    }
    const srcset = attribute(element, "srcset");
    addUrlCount(srcset);
    if (
      srcset &&
      parseSrcset(srcset.value).some((candidate) => requiresResource(candidate, "image"))
    ) {
      collector.add(
        "ARTIFACT_EXTERNAL_SRCSET",
        `${element.path}.attributes.srcset`,
        "srcset contains a non-embedded candidate.",
        srcset.offset,
      );
    }
    return;
  }

  if (element.name === "source") {
    const src = attribute(element, "src");
    const srcset = attribute(element, "srcset");
    addUrlCount(src);
    addUrlCount(srcset);
    if (src && requiresResource(src.value, "media")) {
      collector.add(
        isRemote(src.value) ? "ARTIFACT_EXTERNAL_MEDIA" : "ARTIFACT_RUNTIME_SIDECAR",
        `${element.path}.attributes.src`,
        "Media source must be an inventoried embedded asset.",
        src.offset,
      );
    }
    if (
      srcset &&
      parseSrcset(srcset.value).some((candidate) => requiresResource(candidate, "image"))
    ) {
      collector.add(
        "ARTIFACT_EXTERNAL_SRCSET",
        `${element.path}.attributes.srcset`,
        "srcset contains a non-embedded candidate.",
        srcset.offset,
      );
    }
    return;
  }

  if (element.name === "audio" || element.name === "video" || element.name === "track") {
    for (const name of ["src", "poster"] as const) {
      const item = attribute(element, name);
      addUrlCount(item);
      if (item && requiresResource(item.value, name === "poster" ? "image" : "media")) {
        collector.add(
          isRemote(item.value) ? "ARTIFACT_EXTERNAL_MEDIA" : "ARTIFACT_RUNTIME_SIDECAR",
          `${element.path}.attributes.${name}`,
          "Media must be an inventoried embedded asset.",
          item.offset,
        );
      }
    }
    return;
  }

  if (element.name === "base") {
    const href = attribute(element, "href");
    addUrlCount(href);
    if (href && href.value.trim().length > 0) {
      collector.add(
        "ARTIFACT_BASE_URL",
        `${element.path}.attributes.href`,
        "Base URLs make standalone resolution environment-dependent.",
        href.offset,
      );
    }
    return;
  }

  if (element.name === "iframe") {
    const src = attribute(element, "src");
    const srcdoc = attribute(element, "srcdoc");
    addUrlCount(src);
    if ((src && src.value.trim()) || (srcdoc && srcdoc.value.trim())) {
      collector.add(
        "ARTIFACT_EXTERNAL_FRAME",
        `${element.path}.attributes.${src ? "src" : "srcdoc"}`,
        "Frames are forbidden by the standalone CSP.",
        (src ?? srcdoc ?? element).offset,
      );
    }
    return;
  }

  if (element.name === "object") {
    const data = attribute(element, "data");
    addUrlCount(data);
    if (data && data.value.trim()) {
      collector.add(
        "ARTIFACT_EXTERNAL_OBJECT",
        `${element.path}.attributes.data`,
        "Object resources are forbidden by the standalone CSP.",
        data.offset,
      );
    }
    return;
  }

  if (element.name === "form") {
    const action = attribute(element, "action");
    addUrlCount(action);
    if (action && action.value.trim() && urlKind(action.value) !== "fragment") {
      collector.add(
        "ARTIFACT_EXTERNAL_FORM_ACTION",
        `${element.path}.attributes.action`,
        "Form navigation is forbidden by the standalone CSP.",
        action.offset,
      );
    }
    return;
  }

  if (element.name === "a" || element.name === "area") {
    const href = attribute(element, "href");
    addUrlCount(href);
    if (href && !["empty", "fragment", "blob"].includes(urlKind(href.value))) {
      collector.add(
        "ARTIFACT_EXTERNAL_ANCHOR",
        `${element.path}.attributes.href`,
        "External navigation is outside the offline product boundary.",
        href.offset,
      );
    }
    return;
  }

  if (element.name === "meta") {
    const httpEquiv = attribute(element, "http-equiv")?.value.trim().toLowerCase();
    if (httpEquiv === "refresh") {
      collector.add(
        "ARTIFACT_META_REFRESH",
        element.path,
        "Meta refresh navigation is forbidden.",
        element.offset,
      );
    }
  }

  if (element.name === "html") {
    const manifest = attribute(element, "manifest");
    addUrlCount(manifest);
    if (manifest && manifest.value.trim()) {
      collector.add(
        "ARTIFACT_EXTERNAL_MANIFEST",
        `${element.path}.attributes.manifest`,
        "External application manifests are forbidden.",
        manifest.offset,
      );
    }
  }
}

function parseCsp(value: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const raw of value.split(";")) {
    const values = raw.trim().split(/\s+/).filter(Boolean);
    const name = values.shift()?.toLowerCase();
    if (!name) continue;
    directives[name] = values;
  }
  return Object.fromEntries(
    Object.entries(directives).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function inspectEnvelope(
  source: string,
  elements: ElementToken[],
  collector: FindingCollector,
): {
  present: boolean;
  directives: Record<string, string[]>;
  scriptHashes: string[];
  styleHashes: string[];
} {
  if (!source.startsWith(`${GENERATED_ARTIFACT_BANNER}\n`)) {
    collector.add(
      "ARTIFACT_GENERATED_BANNER",
      "$.artifact.banner",
      "Generated artifact must begin with the fixed timestamp-free banner.",
      0,
    );
  }
  const afterBanner = source.startsWith(GENERATED_ARTIFACT_BANNER)
    ? source.slice(GENERATED_ARTIFACT_BANNER.length).replace(/^\r?\n/, "")
    : source;
  if (!/^<!doctype html>/i.test(afterBanner)) {
    collector.add(
      "ARTIFACT_DOCTYPE",
      "$.artifact.doctype",
      "Generated artifact must place a standards-mode HTML doctype after the banner.",
      source.startsWith(GENERATED_ARTIFACT_BANNER)
        ? GENERATED_ARTIFACT_BANNER.length
        : 0,
    );
  }

  const cspElements = elements.filter(
    (element) =>
      element.name === "meta" &&
      attribute(element, "http-equiv")?.value.trim().toLowerCase() ===
        "content-security-policy",
  );
  if (cspElements.length !== 1) {
    collector.add(
      cspElements.length === 0 ? "ARTIFACT_CSP_MISSING" : "ARTIFACT_CSP_DUPLICATE",
      "$.artifact.csp",
      cspElements.length === 0
        ? "Generated artifact requires one embedded Content Security Policy."
        : "Generated artifact must contain exactly one Content Security Policy.",
      cspElements[1]?.offset ?? cspElements[0]?.offset ?? 0,
    );
  }
  const cspElement = cspElements[0];
  const cspContent = cspElement
    ? (attribute(cspElement, "content")?.value ?? "")
    : "";
  const directives = parseCsp(cspContent);
  for (const directive of REQUIRED_NONE_DIRECTIVES) {
    if (JSON.stringify(directives[directive] ?? []) !== JSON.stringify(["'none'"])) {
      collector.add(
        "ARTIFACT_CSP_DIRECTIVE",
        `$.artifact.csp.${directive}`,
        `${directive} must be exactly 'none'.`,
        cspElement?.offset ?? 0,
      );
    }
  }
  for (const [name, values] of Object.entries(directives)) {
    if (
      values.some(
        (value) =>
          value === "*" ||
          value === "'unsafe-inline'" ||
          value === "'unsafe-eval'" ||
          /^(?:https?|wss?):/i.test(value),
      )
    ) {
      collector.add(
        "ARTIFACT_CSP_UNSAFE_SOURCE",
        `$.artifact.csp.${name}`,
        `${name} contains an unsafe or network source.`,
        cspElement?.offset ?? 0,
      );
    }
    // 'wasm-unsafe-eval' is the one permitted relaxation, and only on
    // script-src: it lets the page instantiate the inventoried embedded
    // wasm bytes. It authorizes no URL and stays forbidden elsewhere.
    if (name !== "script-src" && values.includes("'wasm-unsafe-eval'")) {
      collector.add(
        "ARTIFACT_CSP_UNSAFE_SOURCE",
        `$.artifact.csp.${name}`,
        `${name} may not carry 'wasm-unsafe-eval'; only script-src may.`,
        cspElement?.offset ?? 0,
      );
    }
  }

  const executableScripts = elements.filter(
    (element) =>
      element.name === "script" &&
      attribute(element, "src") === undefined &&
      executableScript(element),
  );
  const styles = elements.filter((element) => element.name === "style");
  const scriptHashes = executableScripts.map((element) => sha256Base64(element.content)).sort();
  const styleHashes = styles.map((element) => sha256Base64(element.content)).sort();
  const scriptSources = directives["script-src"] ?? [];
  const styleSources = directives["style-src"] ?? [];
  executableScripts.forEach((element) => {
    const required = `'sha256-${sha256Base64(element.content)}'`;
    if (!scriptSources.includes(required)) {
      collector.add(
        "ARTIFACT_CSP_SCRIPT_HASH",
        element.path,
        "Inline executable script is not authorized by its exact CSP hash.",
        element.offset,
      );
    }
  });
  styles.forEach((element) => {
    const required = `'sha256-${sha256Base64(element.content)}'`;
    if (!styleSources.includes(required)) {
      collector.add(
        "ARTIFACT_CSP_STYLE_HASH",
        element.path,
        "Inline style is not authorized by its exact CSP hash.",
        element.offset,
      );
    }
  });
  if (directives["script-src-attr"]?.join(" ") !== "'none'") {
    collector.add(
      "ARTIFACT_CSP_DIRECTIVE",
      "$.artifact.csp.script-src-attr",
      "script-src-attr must be exactly 'none'.",
      cspElement?.offset ?? 0,
    );
  }
  if (directives["style-src-attr"]?.join(" ") !== "'none'") {
    collector.add(
      "ARTIFACT_CSP_DIRECTIVE",
      "$.artifact.csp.style-src-attr",
      "style-src-attr must be exactly 'none'.",
      cspElement?.offset ?? 0,
    );
  }
  const firstExecutable = elements
    .filter((element) => element.name === "script" || element.name === "style" || attribute(element, "src") !== undefined)
    .sort((left, right) => left.offset - right.offset)[0];
  if (cspElement && firstExecutable && cspElement.offset > firstExecutable.offset) {
    collector.add(
      "ARTIFACT_CSP_ORDER",
      "$.artifact.csp",
      "Content Security Policy must precede executable/resource elements.",
      cspElement.offset,
    );
  }
  return {
    present: cspElements.length === 1,
    directives,
    scriptHashes,
    styleHashes,
  };
}

export function inspectArtifact(
  html: string,
  options: ArtifactInspectionOptions = {},
): ArtifactInspection {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
  const shellMaxBytes = options.shellMaxBytes ?? null;
  const requireReleaseEnvelope = options.requireReleaseEnvelope ?? true;
  const bytes = encoder.encode(html);
  const findings: ArtifactFinding[] = [];
  const collector = findingCollector(html, findings);
  if (bytes.byteLength > maxBytes) {
    collector.add(
      "ARTIFACT_SIZE_BUDGET",
      "$.artifact.bytes",
      `Artifact is ${String(bytes.byteLength)} bytes; maximum is ${String(maxBytes)}.`,
      0,
    );
  }
  if (shellMaxBytes !== null && bytes.byteLength > shellMaxBytes) {
    collector.add(
      "ARTIFACT_SHELL_SIZE_BUDGET",
      "$.artifact.bytes",
      `Foundation shell is ${String(bytes.byteLength)} bytes; maximum is ${String(shellMaxBytes)}.`,
      0,
    );
  }

  const elements = tokenizeHtml(html, collector);
  const counts = {
    inlineScripts: 0,
    inlineStyles: 0,
    embeddedAssets: 0,
    urlBearingAttributes: 0,
  };
  for (const element of elements) {
    inspectElement(element, collector, counts, requireReleaseEnvelope);
  }
  const csp = requireReleaseEnvelope
    ? inspectEnvelope(html, elements, collector)
    : {
        present: false,
        directives: {},
        scriptHashes: [],
        styleHashes: [],
      };

  findings.sort(
    (left, right) =>
      left.offset - right.offset ||
      left.code.localeCompare(right.code) ||
      left.path.localeCompare(right.path) ||
      left.message.localeCompare(right.message),
  );
  return {
    schema: "jcpe.artifact-inspection.v1",
    outcome: findings.length === 0 ? "pass" : "fail",
    artifact: {
      sha256: sha256Hex(bytes),
      bytes: bytes.byteLength,
      maxBytes,
      shellMaxBytes,
    },
    html: {
      elements: elements.length,
      inlineScripts: counts.inlineScripts,
      inlineStyles: counts.inlineStyles,
      embeddedAssets: counts.embeddedAssets,
      urlBearingAttributes: counts.urlBearingAttributes,
    },
    csp: {
      required: requireReleaseEnvelope,
      ...csp,
    },
    findings,
  };
}

export class ArtifactInspectionError extends Error {
  readonly inspection: ArtifactInspection;

  constructor(inspection: ArtifactInspection) {
    super(
      [
        `Artifact inspection failed with ${String(inspection.findings.length)} finding(s).`,
        ...inspection.findings.map(
          (finding) =>
            `${finding.code} ${finding.path}:${String(finding.line)}:${String(finding.column)} ${finding.message}`,
        ),
      ].join("\n"),
    );
    this.name = "ArtifactInspectionError";
    this.inspection = inspection;
  }
}

export function assertArtifactInspection(
  inspection: ArtifactInspection,
): asserts inspection is ArtifactInspection & { outcome: "pass"; findings: [] } {
  if (inspection.findings.length > 0 || inspection.outcome !== "pass") {
    throw new ArtifactInspectionError(inspection);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function createLicenseReport(
  records: readonly LicenseRecord[],
  assets: readonly AssetLicenseRecord[] = [],
): LicenseReport {
  const packages = records
    .map((record) => ({ ...record }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.version.localeCompare(right.version) ||
        left.license.localeCompare(right.license),
    );
  const sortedAssets = assets
    .map((asset) => ({ ...asset }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { schemaVersion: 1, packages, assets: sortedAssets };
}

// Keep the promise-based API stable even though manifest construction is synchronous.
// eslint-disable-next-line @typescript-eslint/require-await
export async function createStandaloneManifest(input: {
  html: string;
  path: string;
  sourceHash: string;
  bunVersion: string;
  licenses: readonly LicenseRecord[];
}): Promise<StandaloneManifest> {
  const inspection = inspectArtifact(input.html, {
    maxBytes: DEFAULT_MAX_ARTIFACT_BYTES,
    shellMaxBytes: DEFAULT_FOUNDATION_SHELL_BYTES,
    requireReleaseEnvelope: true,
  });
  const licenseReport = createLicenseReport(input.licenses);
  return {
    schemaVersion: 1,
    artifact: {
      path: input.path.replaceAll("\\", "/"),
      sha256: inspection.artifact.sha256,
      bytes: inspection.artifact.bytes,
      budgetBytes: inspection.artifact.maxBytes,
      remainingBytes: inspection.artifact.maxBytes - inspection.artifact.bytes,
      foundationShellBudgetBytes: DEFAULT_FOUNDATION_SHELL_BYTES,
      rootEqualsDist: true,
    },
    build: {
      bunVersion: input.bunVersion,
      target: "browser",
      sourceSha256: input.sourceHash,
    },
    html: {
      generatedBanner: GENERATED_ARTIFACT_BANNER,
      compatModeExpected: "CSS1Compat",
      inlineScriptCount: inspection.html.inlineScripts,
      inlineStyleCount: inspection.html.inlineStyles,
      embeddedAssetCount: inspection.html.embeddedAssets,
      forbiddenReferences: inspection.findings,
    },
    licenses: licenseReport.packages,
    assets: licenseReport.assets,
  };
}
