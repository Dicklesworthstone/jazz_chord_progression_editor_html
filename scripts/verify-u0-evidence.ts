import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import ts from "typescript";

import { findRealNode } from "./toolchain-doctor";
import {
  compareU0BrowserCellInventory,
  compareU0BunJUnitInventory,
  compareU0PlaywrightInventory,
  loadU0EvidenceInventory,
  U0_EVIDENCE_INVENTORY_PATH,
  verifyU0EvidenceInventorySourceHashes,
  type U0EvidenceInventory,
} from "./u0-evidence-inventory";
import contractFixture from "../tests/fixtures/ui/u0-ui-contract.json";
import primitiveFixture from "../tests/fixtures/ui/primitive-state-matrix.json";
import provenanceFixture from "../tests/fixtures/ui/provenance-ledger.json";
import shellFixture from "../tests/fixtures/ui/shell-state-matrix.json";
import traceFixture from "../tests/fixtures/ui/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

export type U0EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type U0JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

export type U0BrowserCell = Readonly<{
  value: JsonRecord;
  bytes: number;
  sha256: string;
  source: "attachment" | "persisted";
  path: string;
}>;

type InputComponent = Readonly<{
  group: string;
  path: string;
  bytes: number;
  sha256: string;
}>;

type InputSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly InputComponent[];
}>;

type RawExecution = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  deadlineMs: number;
  timedOut: boolean;
  stdoutPath: string;
  stderrPath: string;
  stdoutSha256: string;
  stderrSha256: string;
  exitCode: number;
  signal: string | number | null;
  elapsedMs: number;
  resourceUsage: Readonly<{
    measurement: "Bun.Subprocess.resourceUsage";
    maxRssRaw: number | null;
    maxRssRawUnit: "bytes" | "kilobytes" | "runtime-defined";
    maxRssBytes: number | null;
    cpuUserMicros: number | null;
    cpuSystemMicros: number | null;
    gating: false;
  }>;
}>;

type TraceRow = Readonly<{
  id: string;
  caseIds: readonly string[];
  componentIds: readonly string[];
  galleryCellIds: readonly string[];
  plannedEvidenceOwner: string;
}>;

type ArtifactIdentity = Readonly<{
  bytes: number;
  sha256: string;
}>;

const TOOL_VERSION = "changes.evidence.u0-verifier.v1";
const OUTPUT_PATH = "test-results/u0-evidence.json";
const BROWSER_CELL_SCHEMA = "changes.ui.u0-browser-evidence-cell.v1";
const PLAYWRIGHT_VERSION = "1.61.1";
const BROWSER_PROJECTS = Object.freeze(["chromium", "firefox", "webkit"] as const);
const U0_WEBKIT_SCREENSHOT_SYNC_CSP_ERROR =
  "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
const U0_ZERO_REQUEST_CELL_IDS = Object.freeze(new Set([
  "U0-OVR-008-mobile-modal-arbitration",
  "u0-focus-entry-exact-stale-fallback",
  "u0-keyboard-roving-cancellation",
  "u0-nonhappy-preservation-safe-actions",
  "u0-overlay-alert-safe-default",
  "u0-overlay-limits-mobile-sheet",
  "u0-overlay-modal-close-cancel",
  "u0-overlay-stale-owner",
  "u0-overlay-topmost-transients",
  "u0-overlay-visible-dismiss-affordances",
  "u0-system-status-live-preservation-actions",
]));
const U0_VALIDATOR_PROCESS_DEADLINE_MS = 300_000;
const U0_BUN_PROCESS_DEADLINE_MS = 1_800_000;
const U0_PLAYWRIGHT_GLOBAL_TIMEOUT_MS = 3_600_000;
const U0_BROWSER_PROCESS_DEADLINE_MS = U0_PLAYWRIGHT_GLOBAL_TIMEOUT_MS + 60_000;
const SAFE_RUN_ID = /^[a-f0-9]{32}$/u;
export const U0_MANUAL_ACCESSIBILITY_LEDGER_PATH =
  "test-results/u0-manual-accessibility.json";
const U0_MANUAL_ACCESSIBILITY_ARTIFACT_ROOT =
  "test-results/u0-manual-accessibility-artifacts";
const U0_MANUAL_ACCESSIBILITY_SCHEMA =
  "changes.evidence.u0-manual-accessibility.v1";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compare);
}

function hasExactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  return canonicalEquals(Object.keys(value).sort(compare), [...keys].sort(compare));
}

function finding(code: string, path: string, message: string): U0EvidenceFinding {
  return Object.freeze({ code, path, message });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

export function stableU0EvidenceJson(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

export function u0EvidenceDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)), "utf8")
    .digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function traceRows(): readonly TraceRow[] {
  const root = record(traceFixture, "U0 trace fixture");
  return records(root["traces"]).map((value, index) => {
    if (
      typeof value["id"] !== "string" ||
      typeof value["plannedEvidenceOwner"] !== "string"
    ) {
      throw new Error(`U0 trace row ${String(index)} has no exact owner`);
    }
    return Object.freeze({
      id: value["id"],
      caseIds: strings(value["caseIds"]),
      componentIds: strings(value["componentIds"]),
      galleryCellIds: strings(value["galleryCellIds"]),
      plannedEvidenceOwner: value["plannedEvidenceOwner"],
    });
  });
}

const TRACE_ROWS = traceRows();

export const U0_EXACT_OWNER_FILES = Object.freeze(
  sortedUnique(TRACE_ROWS.map(({ plannedEvidenceOwner }) => plannedEvidenceOwner)),
);

export const U0_BUN_OWNER_FILES = Object.freeze(
  U0_EXACT_OWNER_FILES.filter((path) => path.endsWith(".test.ts")),
);

export const U0_BROWSER_OWNER_FILES = Object.freeze(
  U0_EXACT_OWNER_FILES.filter((path) => path.endsWith(".spec.ts")),
);

export const U0_FOCUSED_BUN_TEST_FILES = Object.freeze(
  sortedUnique([
    ...U0_BUN_OWNER_FILES,
    "tests/static/u0-evidence-inventory.test.ts",
    "tests/static/u0-evidence.test.ts",
  ]),
);

export const U0_EXPECTED_COUNTS = Object.freeze({
  traces: 20,
  owners: 20,
  bunOwners: 6,
  browserOwners: 14,
  companions: 4,
  tracedCases: 178,
  galleryCells: 714,
  components: 51,
  primitiveCases: 94,
  topologyCases: 13,
  menuTopologyCases: 7,
  contrastCases: 9,
  shellCases: 55,
  authorities: 9,
} as const);

export const U0_INPUT_GROUPS = Object.freeze({
  contracts: Object.freeze([
    "docs/ARCHITECTURE.md",
    "docs/REBUILD_PLAN.md",
    "docs/U0_UI_CONTRACT.md",
    "package.json",
    "bun.lock",
    "bunfig.toml",
    "tsconfig.json",
  ]),
  authority: Object.freeze([
    "tests/fixtures/foundation/foundation-contract.json",
    "tests/fixtures/foundation/toolchain-ledger.json",
    "tests/fixtures/ui/u0-ui-contract.json",
    "tests/fixtures/ui/primitive-state-matrix.json",
    "tests/fixtures/ui/shell-state-matrix.json",
    "tests/fixtures/ui/trace-ledger.json",
    "tests/fixtures/ui/provenance-ledger.json",
    U0_EVIDENCE_INVENTORY_PATH,
  ]),
  harness: Object.freeze([
    ...U0_EXACT_OWNER_FILES,
    "tests/e2e/u0-browser-test-kit.ts",
    "tests/e2e/u0-interaction-harness.tsx",
    "tests/e2e/u0-rail-focus-harness.ts",
    "tests/e2e/u0-responsive-stale-owner-harness.ts",
    "tests/e2e/u0-target-size-harness.ts",
    "tests/visual/u0-component-gallery.html",
    "tests/visual/u0-component-gallery.tsx",
  ]),
  tooling: Object.freeze([
    "scripts/source-policy.ts",
    "scripts/build.ts",
    "scripts/validate-u0-contract.ts",
    "scripts/verify-u0-evidence.ts",
    "scripts/verify.ts",
    "scripts/run-playwright.ts",
    "scripts/run-node-tool.ts",
    "scripts/toolchain-doctor.ts",
    "scripts/u0-evidence-inventory.ts",
    "tests/static/u0-evidence.test.ts",
    "tests/static/u0-evidence-inventory.test.ts",
    "playwright.config.ts",
    "tsconfig.app.json",
    "tsconfig.base.json",
    "tsconfig.e2e.json",
    "tsconfig.tests.json",
    "tsconfig.tools.json",
    "eslint.config.mjs",
  ]),
  dependencies: Object.freeze([
    "node_modules/preact/package.json",
    "node_modules/preact/LICENSE",
    "node_modules/preact/dist/preact.module.js",
    "node_modules/preact/hooks/dist/hooks.module.js",
    "node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js",
  ]),
} as const);

function xmlUnescape(value: string): string {
  return value.replaceAll("&quot;", "\"").replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function xmlAttributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined || result.has(key)) {
      throw new Error("duplicate or malformed XML attribute");
    }
    result.set(key, xmlUnescape(value));
  }
  return result;
}

function countAttribute(
  value: string | undefined,
  name: string,
  fallback = 0,
): number {
  if (value === undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`invalid ${name} count`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${name} count`);
  return parsed;
}

export function inspectU0JUnit(xml: string): Readonly<{
  summary: U0JUnitSummary | null;
  findings: readonly U0EvidenceFinding[];
}> {
  try {
    const rootMatch = /<testsuites\b([^>]*)>/u.exec(xml);
    if (rootMatch?.[1] === undefined || !xml.includes("</testsuites>")) {
      throw new Error("missing testsuites root");
    }
    const root = xmlAttributes(rootMatch[1]);
    const tests = countAttribute(root.get("tests"), "tests");
    const assertions = countAttribute(root.get("assertions"), "assertions");
    const failures = countAttribute(root.get("failures"), "failures");
    const errors = countAttribute(root.get("errors"), "errors", 0);
    const skipped = countAttribute(root.get("skipped"), "skipped");
    const cases: Array<{ file: string; name: string }> = [];
    let observedFailures = 0;
    let observedErrors = 0;
    let observedSkipped = 0;
    const pattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu;
    let testcase: RegExpExecArray | null;
    while ((testcase = pattern.exec(xml)) !== null) {
      const parsed = xmlAttributes(testcase[1] ?? "");
      const file = parsed.get("file")?.replaceAll("\\", "/");
      const name = parsed.get("name");
      if (!file || !name) throw new Error("testcase requires file and name");
      const body = testcase[2] ?? "";
      observedFailures += (body.match(/<failure\b/gu) ?? []).length;
      observedErrors += (body.match(/<error\b/gu) ?? []).length;
      observedSkipped += (body.match(/<skipped\b/gu) ?? []).length;
      cases.push({ file, name });
    }
    const identities = cases.map(({ file, name }) => `${file}\u0000${name}`);
    if (new Set(identities).size !== identities.length) {
      throw new Error("duplicate testcase identity");
    }
    if (
      tests !== cases.length || failures !== observedFailures ||
      errors !== observedErrors || skipped !== observedSkipped
    ) {
      throw new Error("JUnit summary does not match testcase bodies");
    }
    return {
      summary: Object.freeze({
        tests,
        assertions,
        failures,
        errors,
        skipped,
        files: sortedUnique(cases.map(({ file }) => file)),
        cases: cases.sort((left, right) => compare(
          `${left.file}\u0000${left.name}`,
          `${right.file}\u0000${right.name}`,
        )),
      }),
      findings: [],
    };
  } catch (error) {
    return {
      summary: null,
      findings: [finding(
        "U0_EVIDENCE_JUNIT_INVALID",
        "bun.junit",
        error instanceof Error ? error.message : "JUnit is invalid.",
      )],
    };
  }
}

export function sanitizeU0JUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/gu,
    "$1",
  );
  if (/\bhostname\s*=/u.test(sanitized)) {
    throw new Error("U0_EVIDENCE_JUNIT_HOSTNAME");
  }
  return sanitized;
}

export function inspectU0TestControls(
  path: string,
  source: string,
): U0EvidenceFinding[] {
  const findings: U0EvidenceFinding[] = [];
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const builders = new Set(["test", "it", "describe"]);
  const namespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !["bun:test", "@playwright/test"].includes(statement.moduleSpecifier.text)
    ) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    }
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (["test", "it", "describe"].includes(imported)) {
          builders.add(element.name.text);
        }
      }
    }
  }
  const rootIsBuilder = (expression: ts.Expression): boolean => {
    if (ts.isIdentifier(expression)) return builders.has(expression.text);
    if (ts.isPropertyAccessExpression(expression)) {
      if (
        ts.isIdentifier(expression.expression) &&
        namespaces.has(expression.expression.text) &&
        builders.has(expression.name.text)
      ) return true;
      return rootIsBuilder(expression.expression);
    }
    return false;
  };
  const report = (node: ts.Node, code: string, message: string): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    findings.push(finding(
      code,
      `${path}:${String(position.line + 1)}:${String(position.character + 1)}`,
      message,
    ));
  };
  const forbidden = new Set([
    "fail",
    "failing",
    "fixme",
    "only",
    "skip",
    "skipIf",
    "slow",
    "todo",
    "todoIf",
  ]);
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && ["xit", "xdescribe"].includes(node.text)) {
      report(node, "U0_EVIDENCE_QUARANTINE", "x-prefixed test is forbidden.");
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      forbidden.has(node.name.text) && rootIsBuilder(node.expression)
    ) {
      report(
        node,
        node.name.text.startsWith("todo")
          ? "U0_EVIDENCE_TODO"
          : "U0_EVIDENCE_QUARANTINE",
        `Forbidden ${node.name.text} test control.`,
      );
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        /^(?:quarantine|quarantined)$/u.test(node.expression.text)
      ) {
        report(node, "U0_EVIDENCE_QUARANTINE", "Quarantine call is forbidden.");
      }
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            ((ts.isIdentifier(property.name) &&
              (property.name.text === "retry" || property.name.text === "retries")) ||
              (ts.isStringLiteral(property.name) &&
                (property.name.text === "retry" || property.name.text === "retries")))
          ) {
            report(
              property,
              "U0_EVIDENCE_RETRY",
              "Per-test and per-suite retries are forbidden.",
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function normalizePlaywrightFile(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  return normalized.startsWith("tests/") ? normalized : `tests/${normalized}`;
}

function decodeCellAttachment(
  attachment: JsonRecord,
  path: string,
): U0BrowserCell | null {
  if (
    attachment["contentType"] !== "application/json" ||
    typeof attachment["body"] !== "string"
  ) return null;
  try {
    const bytes = Uint8Array.from(Buffer.from(attachment["body"], "base64"));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(value) || value["schema"] !== BROWSER_CELL_SCHEMA) return null;
    return Object.freeze({
      value,
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
      source: "attachment",
      path,
    });
  } catch {
    return null;
  }
}

type PlaywrightInventory = Readonly<{
  files: readonly string[];
  tests: number;
  cells: readonly U0BrowserCell[];
  screenshots: readonly Readonly<{
    bytes: number;
    filename: string;
    path: string;
    sha256: string;
  }>[];
  findings: readonly U0EvidenceFinding[];
  browserVersions: readonly Readonly<{ name: string; versions: readonly string[] }>[];
}>;

export function inspectU0PlaywrightReport(value: unknown): PlaywrightInventory {
  const findings: U0EvidenceFinding[] = [];
  const files: string[] = [];
  const cells: U0BrowserCell[] = [];
  const screenshots: Array<Readonly<{
    bytes: number;
    filename: string;
    path: string;
    sha256: string;
  }>> = [];
  const projectsBySpec = new Map<string, string[]>();
  const versions = new Map<string, Set<string>>(
    BROWSER_PROJECTS.map((name) => [name, new Set<string>()]),
  );
  let tests = 0;
  if (!isRecord(value)) {
    return {
      files: [],
      tests: 0,
      cells: [],
      screenshots: [],
      findings: [finding(
        "U0_EVIDENCE_PLAYWRIGHT_SHAPE",
        "browser.report",
        "Playwright JSON report must be an object.",
      )],
      browserVersions: [],
    };
  }
  const config = isRecord(value["config"]) ? value["config"] : {};
  const projects = records(config["projects"]);
  const projectNames = projects.map((project) => String(project["name"]));
  if (
    config["forbidOnly"] !== true || config["fullyParallel"] !== false ||
    config["globalTimeout"] !== U0_PLAYWRIGHT_GLOBAL_TIMEOUT_MS ||
    config["workers"] !== 1 ||
    JSON.stringify(projectNames) !== JSON.stringify(BROWSER_PROJECTS) ||
    projects.some((project) => project["retries"] !== 0 || project["repeatEach"] !== 1)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_PLAYWRIGHT_CONFIG",
      "browser.report.config",
      "Browser evidence requires exact three-engine, one-worker, zero-retry, finite-global-timeout configuration.",
    ));
  }
  if (!Array.isArray(value["errors"]) || value["errors"].length !== 0) {
    findings.push(finding(
      "U0_EVIDENCE_PLAYWRIGHT_ERRORS",
      "browser.report.errors",
      "Playwright report-level errors must be empty.",
    ));
  }
  const walk = (suites: unknown, suitePath: string): void => {
    for (const [suiteIndex, suite] of records(suites).entries()) {
      const currentPath = `${suitePath}[${String(suiteIndex)}]`;
      const suiteFile = normalizePlaywrightFile(suite["file"]);
      if (suiteFile) files.push(suiteFile);
      for (const [specIndex, spec] of records(suite["specs"]).entries()) {
        const specPath = `${currentPath}.specs[${String(specIndex)}]`;
        const file = normalizePlaywrightFile(spec["file"] ?? suite["file"]);
        const title = typeof spec["title"] === "string" ? spec["title"] : "";
        if (!file || !title || spec["ok"] !== true) {
          findings.push(finding(
            "U0_EVIDENCE_PLAYWRIGHT_SPEC",
            specPath,
            "Every browser specification requires an exact file, title, and passing status.",
          ));
        }
        if (!Array.isArray(spec["tags"]) || spec["tags"].length !== 0) {
          findings.push(finding(
            "U0_EVIDENCE_PLAYWRIGHT_TAG",
            `${specPath}.tags`,
            "Tags and quarantine markers are forbidden in U0 evidence.",
          ));
        }
        for (const [testIndex, test] of records(spec["tests"]).entries()) {
          tests += 1;
          const testPath = `${specPath}.tests[${String(testIndex)}]`;
          const project = typeof test["projectName"] === "string"
            ? test["projectName"]
            : "";
          if (file && title) {
            const identity = `${file}\u0000${title}`;
            const observed = projectsBySpec.get(identity) ?? [];
            observed.push(project);
            projectsBySpec.set(identity, observed);
          }
          const testAnnotations = test["annotations"];
          const results = records(test["results"]);
          if (
            !BROWSER_PROJECTS.includes(project as typeof BROWSER_PROJECTS[number]) ||
            test["expectedStatus"] !== "passed" || test["status"] !== "expected" ||
            !Array.isArray(testAnnotations) || testAnnotations.length !== 0 ||
            results.length !== 1
          ) {
            findings.push(finding(
              "U0_EVIDENCE_PLAYWRIGHT_TEST",
              testPath,
              "Each exact browser project must pass once with no annotation or expected failure.",
            ));
          }
          const result = results[0];
          if (result === undefined) continue;
          if (
            result["status"] !== "passed" || result["retry"] !== 0 ||
            !Array.isArray(result["errors"]) || result["errors"].length !== 0 ||
            !Array.isArray(result["annotations"]) || result["annotations"].length !== 0
          ) {
            findings.push(finding(
              "U0_EVIDENCE_PLAYWRIGHT_RESULT",
              `${testPath}.results[0]`,
              "Browser result must pass on its first attempt without errors or annotations.",
            ));
          }
          for (const [attachmentIndex, attachment] of records(result["attachments"]).entries()) {
            const attachmentPath =
              `${testPath}.results[0].attachments[${String(attachmentIndex)}]`;
            if (attachment["contentType"] === "image/png") {
              if (
                typeof attachment["name"] !== "string" ||
                !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/u.test(attachment["name"]) ||
                typeof attachment["body"] !== "string" ||
                attachment["path"] !== undefined
              ) {
                findings.push(finding(
                  "U0_EVIDENCE_PLAYWRIGHT_SCREENSHOT_ATTACHMENT",
                  attachmentPath,
                  "Passing screenshot attachments require a safe PNG name and inline base64 body only.",
                ));
              } else {
                const bytes = Uint8Array.from(Buffer.from(attachment["body"], "base64"));
                screenshots.push(Object.freeze({
                  bytes: bytes.byteLength,
                  filename: attachment["name"],
                  path: attachmentPath,
                  sha256: sha256Bytes(bytes),
                }));
              }
              continue;
            }
            const cell = decodeCellAttachment(
              attachment,
              attachmentPath,
            );
            if (cell === null) continue;
            const producer = isRecord(cell.value["producer"])
              ? cell.value["producer"]
              : {};
            const browser = isRecord(cell.value["browser"]) ? cell.value["browser"] : {};
            if (
              producer["file"] !== file || producer["title"] !== title ||
              browser["name"] !== project
            ) {
              findings.push(finding(
                "U0_EVIDENCE_ATTACHMENT_PRODUCER",
                cell.path,
                "Raw cell producer and browser must match its Playwright result exactly.",
              ));
            }
            if (typeof browser["version"] === "string" && versions.has(project)) {
              versions.get(project)?.add(browser["version"]);
            }
            cells.push(cell);
          }
        }
      }
      walk(suite["suites"], `${currentPath}.suites`);
    }
  };
  walk(value["suites"], "browser.report.suites");
  for (const [identity, observed] of [...projectsBySpec].sort(([left], [right]) =>
    compare(left, right)
  )) {
    if (
      JSON.stringify([...observed].sort(compare)) !==
        JSON.stringify([...BROWSER_PROJECTS].sort(compare))
    ) {
      findings.push(finding(
        "U0_EVIDENCE_PLAYWRIGHT_PROJECT_MATRIX",
        `browser.report.specs.${u0EvidenceDigest(identity).slice(0, 12)}`,
        "Every file/title specification must execute exactly once in Chromium, Firefox, and WebKit.",
      ));
    }
  }
  const stats = isRecord(value["stats"]) ? value["stats"] : {};
  if (
    stats["expected"] !== tests || stats["skipped"] !== 0 ||
    stats["unexpected"] !== 0 || stats["flaky"] !== 0
  ) {
    findings.push(finding(
      "U0_EVIDENCE_PLAYWRIGHT_STATS",
      "browser.report.stats",
      "Reporter totals must equal executed tests with zero skipped, unexpected, or flaky result.",
    ));
  }
  return Object.freeze({
    files: sortedUnique(files),
    tests,
    cells,
    screenshots,
    findings,
    browserVersions: BROWSER_PROJECTS.map((name) => Object.freeze({
      name,
      versions: [...(versions.get(name) ?? [])].sort(compare),
    })),
  });
}

function recursivelyObservedStrings(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) recursivelyObservedStrings(item, output);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) recursivelyObservedStrings(item, output);
  }
}

function cellIdentity(value: JsonRecord): string {
  const producer = isRecord(value["producer"]) ? value["producer"] : {};
  const browser = isRecord(value["browser"]) ? value["browser"] : {};
  return [producer["file"], producer["title"], browser["name"], value["cellId"]]
    .map(String).join("\u0000");
}

const U0_ACCESSIBILITY_OWNER = "tests/e2e/u0-accessibility.spec.ts";
const U0_REQUIRED_MANUAL_ACCESSIBILITY_IDS = Object.freeze([
  "U0-MANUAL-KEYBOARD",
  "U0-MANUAL-FOCUS",
  "U0-MANUAL-REFLOW-200",
  "U0-MANUAL-MOTION",
  "U0-MANUAL-FORCED-COLORS",
  "U0-MANUAL-SCREEN-READER",
] as const);

const U0_MANUAL_REQUIRED_CHECKS = Object.freeze({
  "U0-MANUAL-KEYBOARD": Object.freeze([
    "allActionsReachableWithoutPointer",
    "arrowKeysCreateNoTrap",
    "dragAlternativesComplete",
    "escapeCancelsOrCloses",
    "tabOrderMatchesContract",
  ]),
  "U0-MANUAL-FOCUS": Object.freeze([
    "focusNotClippedOrObscured",
    "focusRestoredToInvoker",
    "topmostDismissalCorrect",
    "visibleFocus",
  ]),
  "U0-MANUAL-REFLOW-200": Object.freeze([
    "browserZoomNotBlocked",
    "pageHorizontalOverflowAbsent",
    "primaryControlsOperable",
    "transportVisible",
  ]),
  "U0-MANUAL-MOTION": Object.freeze([
    "largeTransformsAbsent",
    "nonessentialMotionSuppressed",
    "smoothScrollAbsent",
    "stateChangesPerceivable",
  ]),
  "U0-MANUAL-FORCED-COLORS": Object.freeze([
    "controlBoundariesVisible",
    "focusIndicatorVisible",
    "stateMeaningPreserved",
  ]),
  "U0-MANUAL-SCREEN-READER": Object.freeze([
    "focusOrderCoherent",
    "landmarksAndHeadingsAnnounced",
    "namesAnnounced",
    "statesAnnounced",
  ]),
} as const);
const U0_MANUAL_REQUIRED_CHECKS_BY_ID = new Map<string, readonly string[]>(
  Object.entries(U0_MANUAL_REQUIRED_CHECKS),
);

const U0_MANUAL_ATTACHMENT_MEDIA = Object.freeze(
  new Map<string, string>([
    [".json", "application/json"],
    [".md", "text/markdown"],
    [".mp4", "video/mp4"],
    [".png", "image/png"],
    [".txt", "text/plain"],
    [".wav", "audio/wav"],
    [".webm", "video/webm"],
  ]),
);

function manualAttachmentContentError(
  path: string,
  bytes: Uint8Array,
): string | null {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value)
      ? null
      : "PNG attachment has no valid PNG signature.";
  }
  if (extension === ".wav") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WAVE"
      ? null
      : "WAV attachment has no RIFF/WAVE signature.";
  }
  if (extension === ".webm") {
    return bytes[0] === 0x1a && bytes[1] === 0x45 &&
        bytes[2] === 0xdf && bytes[3] === 0xa3
      ? null
      : "WebM attachment has no EBML signature.";
  }
  if (extension === ".mp4") {
    return new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp"
      ? null
      : "MP4 attachment has no ftyp box.";
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (extension === ".json") JSON.parse(text);
    else if (text.trim().length < 20) {
      return "Text attachment must contain a substantive UTF-8 observation.";
    }
    return null;
  } catch {
    return extension === ".json"
      ? "JSON attachment is not valid UTF-8 JSON."
      : "Text attachment is not valid substantive UTF-8 text.";
  }
}

function browserArtifactIdentity(
  cells: readonly U0BrowserCell[],
): ArtifactIdentity | null {
  const identities = new Map<string, ArtifactIdentity>();
  for (const cell of cells) {
    const artifact = isRecord(cell.value["artifact"]) ? cell.value["artifact"] : {};
    if (
      typeof artifact["bytes"] !== "number" ||
      !Number.isSafeInteger(artifact["bytes"]) ||
      artifact["bytes"] <= 0 ||
      !isSha256(artifact["sha256"])
    ) continue;
    const identity = {
      bytes: artifact["bytes"],
      sha256: artifact["sha256"],
    };
    identities.set(`${identity.sha256}\u0000${identity.bytes.toString()}`, identity);
  }
  return identities.size === 1 ? [...identities.values()][0] ?? null : null;
}

async function releaseArtifactIdentity(): Promise<ArtifactIdentity | null> {
  const path = "jazz_chord_progression_editor.html";
  try {
    const bytes = await readRegularFileNoFollow(path);
    return Object.freeze({
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    });
  } catch {
    return null;
  }
}

function isCanonicalUtcTimestamp(
  value: unknown,
  latestMs = Date.now() + 5 * 60 * 1_000,
): value is string {
  if (
    typeof value !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u
      .test(value)
  ) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) &&
    new Date(parsed).toISOString() === value &&
    parsed <= latestMs;
}

function isHumanOperator(value: unknown): value is string {
  return typeof value === "string" &&
    value.trim().length >= 2 &&
    !/(?:^|[\s_-])(?:agent|anonymous|aria-snapshot|automated|automation|bot|chatgpt|claude|codex|human operator(?: [0-9]+)?|n\/a|playwright|synthetic|tester|unknown)(?:$|[\s_-])/iu
      .test(value.trim());
}

function isSpecificManualLabel(value: unknown): value is string {
  return typeof value === "string" &&
    value.trim().length >= 2 &&
    !/^(?:n\/a|named at|test (?:browser|os)|unknown)$/iu.test(value.trim());
}

function manualAttachmentDirectory(artifactSha256: string): string {
  return `${U0_MANUAL_ACCESSIBILITY_ARTIFACT_ROOT}/${artifactSha256}`;
}

function safeManualAttachmentPath(
  value: unknown,
  artifactSha256: string,
): value is string {
  if (typeof value !== "string" || value.includes("\\") || value.includes("\0")) {
    return false;
  }
  const prefix = `${manualAttachmentDirectory(artifactSha256)}/`;
  if (!value.startsWith(prefix) || value.length > 512) return false;
  const suffix = value.slice(prefix.length);
  const segments = suffix.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) =>
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment)
    )
  ) return false;
  const root = resolve(manualAttachmentDirectory(artifactSha256));
  const target = resolve(value);
  const normalized = relative(root, target).replaceAll("\\", "/");
  return normalized !== "" &&
    normalized !== ".." &&
    !normalized.startsWith("../") &&
    !resolve(value).startsWith(`${root}/../`);
}

function manualAuthority(): JsonRecord {
  const contract = record(contractFixture, "U0 contract");
  const hashes = record(contract["reviewedFileSha256"], "U0 reviewed hashes");
  return {
    contractSchema: contract["schema"],
    contractVersion: contract["contractVersion"],
    traceId: "TR-U0-AXE",
    traceLedgerSha256: hashes["trace-ledger.json"],
  };
}

function manualRows(value: unknown): readonly JsonRecord[] {
  if (!isRecord(value) || !Array.isArray(value["rows"])) return [];
  return value["rows"].filter(isRecord);
}

function manualAttachmentRecords(value: unknown): readonly JsonRecord[] {
  return manualRows(value).flatMap((row) => records(row["attachments"]));
}

/**
 * The automated accessibility owner must explicitly preserve the claim
 * boundary. Accessibility-tree snapshots, emulated media, and effective CSS
 * pixels are useful evidence, but they can never satisfy the manual gate.
 */
export function validateU0AutomatedAccessibilityBoundary(
  cells: readonly U0BrowserCell[],
): readonly U0EvidenceFinding[] {
  const findings: U0EvidenceFinding[] = [];
  const accessibilityCells = cells.filter((cell) => {
    const producer = isRecord(cell.value["producer"])
      ? cell.value["producer"]
      : {};
    return producer["file"] === U0_ACCESSIBILITY_OWNER;
  });
  if (accessibilityCells.length === 0) {
    return [finding(
      "U0_EVIDENCE_AUTOMATED_ACCESSIBILITY_BOUNDARY",
      U0_ACCESSIBILITY_OWNER,
      "The automated accessibility owner must record that manual device evidence remains pending.",
    )];
  }
  for (const cell of accessibilityCells) {
    const observations = isRecord(cell.value["observations"])
      ? cell.value["observations"]
      : {};
    const ledger = isRecord(observations["manualScriptLedger"])
      ? observations["manualScriptLedger"]
      : {};
    const boundary = isRecord(ledger["claimBoundary"])
      ? ledger["claimBoundary"]
      : {};
    const scripts = records(ledger["scripts"]);
    const ids = scripts.map((entry) => entry["id"]);
    const exact =
      JSON.stringify(ids) === JSON.stringify(U0_REQUIRED_MANUAL_ACCESSIBILITY_IDS) &&
      scripts.every((entry) => entry["manualDeviceStatus"] === "pending-Q0") &&
      boundary["hardwareCertification"] === "Not claimed." &&
      typeof boundary["pending"] === "string" &&
      boundary["pending"].includes("pending") &&
      ledger["operator"] === undefined &&
      ledger["observedAt"] === undefined;
    if (!exact) {
      findings.push(finding(
        "U0_EVIDENCE_AUTOMATED_ACCESSIBILITY_BOUNDARY",
        `${cell.path}#observations.manualScriptLedger`,
        "Automated evidence must keep all six named manual rows pending and make no operator claim.",
      ));
    }
  }
  return findings;
}

function inspectU0ManualAccessibilityLedger(
  value: unknown,
  expectedArtifact: ArtifactIdentity,
  latestObservationMs = Date.now() + 5 * 60 * 1_000,
): Readonly<{
  attachments: readonly JsonRecord[];
  findings: readonly U0EvidenceFinding[];
}> {
  if (!isRecord(value)) {
    return {
      attachments: [],
      findings: [finding(
        "U0_EVIDENCE_MANUAL_LEDGER_SHAPE",
        U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
        "Manual accessibility evidence must be a JSON object.",
      )],
    };
  }
  const findings: U0EvidenceFinding[] = [];
  const authority = isRecord(value["authority"]) ? value["authority"] : {};
  const artifact = isRecord(value["artifact"]) ? value["artifact"] : {};
  const attestation = isRecord(value["attestation"]) ? value["attestation"] : {};
  if (
    !hasExactKeys(value, [
      "artifact",
      "attestation",
      "authority",
      "package",
      "rows",
      "schema",
    ]) ||
    !hasExactKeys(authority, [
      "contractSchema",
      "contractVersion",
      "traceId",
      "traceLedgerSha256",
    ]) ||
    !hasExactKeys(artifact, ["bytes", "path", "sha256"]) ||
    !hasExactKeys(attestation, [
      "automationMadeNoManualClaim",
      "observationsRecordedAfterHumanInteraction",
    ]) ||
    value["schema"] !== U0_MANUAL_ACCESSIBILITY_SCHEMA ||
    value["package"] !== "U0" ||
    stableU0EvidenceJson(authority) !== stableU0EvidenceJson(manualAuthority()) ||
    attestation["automationMadeNoManualClaim"] !== true ||
    attestation["observationsRecordedAfterHumanInteraction"] !== true
  ) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_LEDGER_IDENTITY",
      U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
      "Manual evidence must bind the reviewed U0 contract, TR-U0-AXE, and an explicit human-observation attestation.",
    ));
  }
  if (
    artifact["path"] !== "jazz_chord_progression_editor.html" ||
    artifact["bytes"] !== expectedArtifact.bytes ||
    artifact["sha256"] !== expectedArtifact.sha256
  ) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_ARTIFACT",
      `${U0_MANUAL_ACCESSIBILITY_LEDGER_PATH}#artifact`,
      "Manual evidence must bind the exact artifact bytes used by the browser evidence.",
    ));
  }
  const rowsValue = value["rows"];
  const rows = manualRows(value);
  if (
    !Array.isArray(rowsValue) ||
    rows.length !== rowsValue.length ||
    JSON.stringify(rows.map((row) => row["id"])) !==
      JSON.stringify(U0_REQUIRED_MANUAL_ACCESSIBILITY_IDS)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_ROW_INVENTORY",
      `${U0_MANUAL_ACCESSIBILITY_LEDGER_PATH}#rows`,
      "Manual evidence requires the six reviewed rows exactly once and in contract order.",
    ));
  }
  const attachmentPaths = new Set<string>();
  const attachmentHashes = new Set<string>();
  const normalizedResults = new Set<string>();
  for (const row of rows) {
    const id = String(row["id"]);
    const path = `${U0_MANUAL_ACCESSIBILITY_LEDGER_PATH}#rows.${id}`;
    const platformValue = isRecord(row["platform"]) ? row["platform"] : {};
    const browserValue = isRecord(row["browser"]) ? row["browser"] : {};
    const checks = isRecord(row["checks"]) ? row["checks"] : {};
    const observedResult = row["observedResult"];
    const rowKeys = [
      "attachments",
      "browser",
      "checks",
      "id",
      "observedAt",
      "observedResult",
      "operator",
      "platform",
      "status",
      ...(id === "U0-MANUAL-REFLOW-200"
        ? [
            "method",
            "reflowViewportCssPx",
            "startingViewportCssPx",
            "zoomPercent",
          ]
        : []),
      ...(id === "U0-MANUAL-SCREEN-READER"
        ? ["assistiveTechnology", "spokenResult"]
        : []),
    ];
    if (
      !hasExactKeys(row, rowKeys) ||
      !hasExactKeys(platformValue, ["name", "version"]) ||
      !hasExactKeys(browserValue, ["name", "version"]) ||
      row["status"] !== "pass" ||
      !isHumanOperator(row["operator"]) ||
      !isCanonicalUtcTimestamp(row["observedAt"], latestObservationMs) ||
      !isSpecificManualLabel(platformValue["name"]) ||
      !isSpecificManualLabel(platformValue["version"]) ||
      !isSpecificManualLabel(browserValue["name"]) ||
      !isSpecificManualLabel(browserValue["version"]) ||
      typeof observedResult !== "string" ||
      observedResult.trim().length < 12 ||
      /\b(?:ariaSnapshot|effective CSS pixel|proxy)\b/iu.test(observedResult)
    ) {
      findings.push(finding(
        "U0_EVIDENCE_MANUAL_ROW_OBSERVATION",
        path,
        "Each manual row requires a human operator, canonical timestamp, OS/browser versions, a direct observed result, and pass status.",
      ));
    }
    if (typeof observedResult === "string") {
      const normalized = observedResult.trim().toLocaleLowerCase().replaceAll(/\s+/gu, " ");
      if (normalizedResults.has(normalized)) {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_RESULT_DUPLICATE",
          path,
          "Manual rows require distinct direct observations rather than repeated boilerplate.",
        ));
      }
      normalizedResults.add(normalized);
    }
    const requiredChecks = U0_MANUAL_REQUIRED_CHECKS_BY_ID.get(id);
    const exactCheckKeys = requiredChecks !== undefined &&
      canonicalEquals(
        Object.keys(checks).sort(compare),
        [...requiredChecks].sort(compare),
      );
    if (
      requiredChecks === undefined ||
      requiredChecks.some((key) => checks[key] !== true) ||
      !exactCheckKeys
    ) {
      findings.push(finding(
        "U0_EVIDENCE_MANUAL_ROW_CHECKS",
        `${path}.checks`,
        "Every structured check owned by this manual row must be explicitly true.",
      ));
    }
    if (id === "U0-MANUAL-REFLOW-200") {
      const startingViewport = isRecord(row["startingViewportCssPx"])
        ? row["startingViewportCssPx"]
        : {};
      const reflowViewport = isRecord(row["reflowViewportCssPx"])
        ? row["reflowViewportCssPx"]
        : {};
      if (
        !hasExactKeys(startingViewport, ["height", "width"]) ||
        !hasExactKeys(reflowViewport, ["height", "width"]) ||
        row["method"] !== "browser-ui-zoom" ||
        row["zoomPercent"] !== 200 ||
        startingViewport["width"] !== 1280 ||
        startingViewport["height"] !== 800 ||
        reflowViewport["width"] !== 320 ||
        reflowViewport["height"] !== 568
      ) {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_REFLOW",
          path,
          "Reflow evidence requires real browser UI zoom at 200 percent from 1280x800 plus the separate 320x568 boundary.",
        ));
      }
    }
    if (id === "U0-MANUAL-SCREEN-READER") {
      const assistiveTechnology = isRecord(row["assistiveTechnology"])
        ? row["assistiveTechnology"]
        : {};
      if (
        !hasExactKeys(assistiveTechnology, ["name", "version"]) ||
        !isSpecificManualLabel(assistiveTechnology["name"]) ||
        !isSpecificManualLabel(assistiveTechnology["version"]) ||
        typeof row["spokenResult"] !== "string" ||
        row["spokenResult"].trim().length < 12 ||
        /\b(?:ariaSnapshot|proxy)\b/iu.test(row["spokenResult"])
      ) {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_SCREEN_READER",
          path,
          "Screen-reader evidence requires a named AT/version and a direct spoken-result observation.",
        ));
      }
    }
    const attachmentsValue = row["attachments"];
    const attachments = records(attachmentsValue);
    if (
      !Array.isArray(attachmentsValue) ||
      attachments.length !== attachmentsValue.length ||
      attachments.length === 0
    ) {
      findings.push(finding(
        "U0_EVIDENCE_MANUAL_ATTACHMENT_INVENTORY",
        `${path}.attachments`,
        "Each manual row requires at least one independently hash-verified attachment.",
      ));
    }
    for (const attachment of attachments) {
      const attachmentPath = attachment["path"];
      const extension = typeof attachmentPath === "string"
        ? extname(attachmentPath).toLowerCase()
        : "";
      if (
        !safeManualAttachmentPath(attachmentPath, expectedArtifact.sha256) ||
        !hasExactKeys(attachment, ["bytes", "mediaType", "path", "sha256"]) ||
        attachment["mediaType"] !== U0_MANUAL_ATTACHMENT_MEDIA.get(extension) ||
        typeof attachment["bytes"] !== "number" ||
        !Number.isSafeInteger(attachment["bytes"]) ||
        attachment["bytes"] <= 0 ||
        !isSha256(attachment["sha256"])
      ) {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_ATTACHMENT_IDENTITY",
          `${path}.attachments`,
          "Attachments require a safe artifact-scoped path, supported media type, positive bytes, and SHA-256.",
        ));
        continue;
      }
      if (attachmentPaths.has(attachmentPath)) {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_ATTACHMENT_DUPLICATE",
          attachmentPath,
          "One attachment path cannot certify multiple manual rows.",
        ));
      }
      attachmentPaths.add(attachmentPath);
      if (isSha256(attachment["sha256"])) {
        if (attachmentHashes.has(attachment["sha256"])) {
          findings.push(finding(
            "U0_EVIDENCE_MANUAL_ATTACHMENT_CONTENT_DUPLICATE",
            attachmentPath,
            "Each manual row requires distinct attachment content.",
          ));
        }
        attachmentHashes.add(attachment["sha256"]);
      }
    }
  }
  return {
    attachments: manualAttachmentRecords(value),
    findings,
  };
}

export function validateU0ManualAccessibilityLedger(
  value: unknown,
  expectedArtifact: ArtifactIdentity,
): readonly U0EvidenceFinding[] {
  return inspectU0ManualAccessibilityLedger(value, expectedArtifact).findings;
}

export function validateU0BrowserCells(input: Readonly<{
  runId: string;
  attachmentCells: readonly U0BrowserCell[];
  persistedCells: readonly U0BrowserCell[];
}>): readonly U0EvidenceFinding[] {
  const findings: U0EvidenceFinding[] = [];
  const traceById = new Map(TRACE_ROWS.map((trace) => [trace.id, trace]));
  const allFixtureCases = [
    ...records(record(primitiveFixture, "primitive fixture")["cases"]),
    ...records(record(primitiveFixture, "primitive fixture")["topologyCases"]),
    ...records(record(primitiveFixture, "primitive fixture")["menuTopologyCases"]),
    ...records(record(primitiveFixture, "primitive fixture")["contrastCases"]),
    ...records(record(shellFixture, "shell fixture")["viewportCases"]),
    ...records(record(shellFixture, "shell fixture")["environmentCases"]),
    ...records(record(shellFixture, "shell fixture")["overlayCases"]),
    ...records(record(shellFixture, "shell fixture")["systemStateCases"]),
    ...records(record(shellFixture, "shell fixture")["refusalCases"]),
  ];
  const fixtureById = new Map(allFixtureCases.map((value) => [String(value["id"]), value]));
  const attachmentByKey = new Map<string, U0BrowserCell>();
  const artifactIdentities = new Set<string>();
  for (const cell of input.attachmentCells) {
    const key = cellIdentity(cell.value);
    if (attachmentByKey.has(key)) {
      findings.push(finding(
        "U0_EVIDENCE_CELL_DUPLICATE",
        cell.path,
        "Playwright report contains a duplicate raw evidence cell.",
      ));
    } else attachmentByKey.set(key, cell);
  }
  const persistedByKey = new Map<string, U0BrowserCell>();
  const galleryObserved = new Set<string>();
  for (const cell of input.persistedCells) {
    const value = cell.value;
    const path = cell.path;
    const key = cellIdentity(value);
    if (persistedByKey.has(key)) {
      findings.push(finding(
        "U0_EVIDENCE_CELL_DUPLICATE",
        path,
        "Persisted evidence contains a duplicate producer/browser/cell identity.",
      ));
    } else persistedByKey.set(key, cell);
    const browser = isRecord(value["browser"]) ? value["browser"] : {};
    const artifact = isRecord(value["artifact"]) ? value["artifact"] : {};
    const viewport = isRecord(value["viewport"]) ? value["viewport"] : {};
    const diagnostics = isRecord(value["diagnostics"])
      ? value["diagnostics"]
      : {};
    const producer = isRecord(value["producer"]) ? value["producer"] : {};
    const browserName = browser["name"];
    const cellId = typeof value["cellId"] === "string" ? value["cellId"] : "";
    artifactIdentities.add(`${String(artifact["sha256"])}\u0000${String(artifact["bytes"])}`);
    if (
      value["schema"] !== BROWSER_CELL_SCHEMA || value["runId"] !== input.runId ||
      value["package"] !== "U0" || value["outcome"] !== "pass" ||
      value["error"] !== null || typeof value["cellId"] !== "string" ||
      value["playwrightVersion"] !== PLAYWRIGHT_VERSION ||
      !BROWSER_PROJECTS.includes(browserName as typeof BROWSER_PROJECTS[number]) ||
      typeof browser["version"] !== "string" || browser["version"].length === 0 ||
      !isSha256(artifact["sha256"]) ||
      typeof artifact["bytes"] !== "number" || artifact["bytes"] <= 0 ||
      !Number.isInteger(viewport["width"]) || Number(viewport["width"]) <= 0 ||
      !Number.isInteger(viewport["height"]) || Number(viewport["height"]) <= 0 ||
      !isRecord(value["environment"]) || !isRecord(value["observations"]) ||
      value["retry"] !== 0 || value["repeatEachIndex"] !== 0 ||
      !Number.isInteger(value["workerIndex"]) || Number(value["workerIndex"]) < 0 ||
      typeof producer["file"] !== "string" ||
      !U0_BROWSER_OWNER_FILES.includes(producer["file"]) ||
      typeof producer["title"] !== "string" || producer["title"].length === 0
    ) {
      findings.push(finding(
        "U0_EVIDENCE_CELL_SHAPE",
        path,
        "Raw browser cell identity, version, artifact, viewport, producer, and first-attempt pass fields must be exact.",
      ));
    }
    if (
      !Array.isArray(diagnostics["consoleErrors"]) || diagnostics["consoleErrors"].length !== 0 ||
      !Array.isArray(diagnostics["pageErrors"]) || diagnostics["pageErrors"].length !== 0 ||
      !Array.isArray(diagnostics["requests"]) ||
      (diagnostics["requests"].length === 0 && !U0_ZERO_REQUEST_CELL_IDS.has(cellId)) ||
      (diagnostics["requests"].length > 0 && U0_ZERO_REQUEST_CELL_IDS.has(cellId))
    ) {
      findings.push(finding(
        "U0_EVIDENCE_CELL_DIAGNOSTICS",
        `${path}#diagnostics`,
        "Console/page errors and the reviewed request-presence policy must be exact.",
      ));
    }
    if (!Array.isArray(value["screenshots"])) {
      findings.push(finding(
        "U0_EVIDENCE_SCREENSHOT_INVENTORY",
        `${path}#screenshots`,
        "Screenshot evidence must be an explicit array.",
      ));
    } else {
      for (const [index, screenshot] of records(value["screenshots"]).entries()) {
        const harness = isRecord(screenshot["harness"]) ? screenshot["harness"] : {};
        const filename = typeof screenshot["filename"] === "string"
          ? screenshot["filename"]
          : "";
        const expectedStrictCsp =
          !/^U0-ENV-00[23]-gallery-(?:chromium|firefox|webkit)\.png$/u.test(filename);
        const expectedConsoleErrors = browserName === "webkit" && expectedStrictCsp
          ? [U0_WEBKIT_SCREENSHOT_SYNC_CSP_ERROR]
          : [];
        const expectedStyleSync = browserName === "webkit" ? 1 : 0;
        if (
          harness["browserName"] !== browserName ||
          harness["isolated"] !== true ||
          !canonicalEquals(harness["consoleErrors"], expectedConsoleErrors) ||
          !canonicalEquals(harness["pageErrors"], []) ||
          harness["strictCsp"] !== expectedStrictCsp ||
          harness["syncStyleInsertions"] !== expectedStyleSync ||
          harness["syncStyleRemovals"] !== expectedStyleSync ||
          harness["unexpectedStyleMutations"] !== 0
        ) {
          findings.push(finding(
            "U0_EVIDENCE_SCREENSHOT_HARNESS",
            `${path}#screenshots[${String(index)}].harness`,
            "Screenshot tool mutations must be explicitly isolated and match the pinned engine-specific harness signature.",
          ));
        }
      }
    }
    for (const request of records(diagnostics["requests"])) {
      if (typeof request["url"] !== "string") continue;
      try {
        const url = new URL(request["url"]);
        if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
          findings.push(finding(
            "U0_EVIDENCE_NONLOCAL_REQUEST",
            `${path}#diagnostics.requests`,
            "Browser evidence observed a nonlocal request.",
          ));
        }
      } catch {
        findings.push(finding(
          "U0_EVIDENCE_REQUEST_URL",
          `${path}#diagnostics.requests`,
          "Observed request URL is malformed.",
        ));
      }
    }
    const bindings = records(value["bindings"]);
    if (!Array.isArray(value["bindings"]) || bindings.length === 0) {
      findings.push(finding(
        "U0_EVIDENCE_CELL_BINDING",
        `${path}#bindings`,
        "Each raw cell must bind at least one reviewed case and trace.",
      ));
    }
    for (const binding of bindings) {
      const caseId = typeof binding["caseId"] === "string" ? binding["caseId"] : "";
      const traceIds = strings(binding["traceIds"]);
      const fixtureCase = fixtureById.get(caseId);
      if (fixtureCase === undefined || traceIds.length === 0) {
        findings.push(finding(
          "U0_EVIDENCE_CELL_BINDING",
          `${path}#bindings.${caseId}`,
          "Cell binding references an unknown case or no trace.",
        ));
        continue;
      }
      for (const traceId of traceIds) {
        const trace = traceById.get(traceId);
        if (
          trace === undefined || !trace.caseIds.includes(caseId) ||
          !strings(fixtureCase["traceIds"]).includes(traceId) ||
          trace.plannedEvidenceOwner !== producer["file"]
        ) {
          findings.push(finding(
            "U0_EVIDENCE_CELL_OWNER",
            `${path}#bindings.${caseId}.${traceId}`,
            "Case/trace evidence must be reciprocal and emitted only by its exact planned owner.",
          ));
        }
      }
    }
    recursivelyObservedStrings(value["observations"], galleryObserved);
    const attachment = attachmentByKey.get(key);
    if (
      attachment === undefined || attachment.sha256 !== cell.sha256 ||
      attachment.bytes !== cell.bytes
    ) {
      findings.push(finding(
        "U0_EVIDENCE_CELL_ATTACHMENT_MISMATCH",
        path,
        "Persisted raw cell must be byte-identical to its Playwright attachment.",
      ));
    }
  }
  for (const [key, attachment] of attachmentByKey) {
    if (!persistedByKey.has(key)) {
      findings.push(finding(
        "U0_EVIDENCE_CELL_PERSISTED_MISSING",
        attachment.path,
        "Playwright attachment has no independently read persisted cell.",
      ));
    }
  }
  if (artifactIdentities.size !== 1) {
    findings.push(finding(
      "U0_EVIDENCE_ARTIFACT_DIVERGENCE",
      "browser.cells#artifact",
      "Every browser cell in one unchanged run must bind the same built artifact bytes and SHA-256.",
    ));
  }
  findings.push(...validateU0AutomatedAccessibilityBoundary(input.persistedCells));
  for (const trace of TRACE_ROWS.filter(({ plannedEvidenceOwner }) =>
    plannedEvidenceOwner.endsWith(".spec.ts")
  )) {
    const cells = input.persistedCells.filter((cell) => {
      const producer = isRecord(cell.value["producer"]) ? cell.value["producer"] : {};
      return producer["file"] === trace.plannedEvidenceOwner;
    });
    for (const project of BROWSER_PROJECTS) {
      const observed = new Set<string>();
      for (const cell of cells) {
        const browser = isRecord(cell.value["browser"]) ? cell.value["browser"] : {};
        if (browser["name"] !== project) continue;
        for (const binding of records(cell.value["bindings"])) {
          if (strings(binding["traceIds"]).includes(trace.id)) {
            observed.add(String(binding["caseId"]));
          }
        }
      }
      const missing = trace.caseIds.filter((caseId) => !observed.has(caseId));
      if (missing.length > 0) {
        findings.push(finding(
          "U0_EVIDENCE_TRACE_CASE_MISSING",
          `${trace.id}.${project}`,
          `Exact owner ${trace.plannedEvidenceOwner} is missing ${missing.join(", ")}.`,
        ));
      }
    }
    const missingGallery = trace.galleryCellIds.filter((id) => !galleryObserved.has(id));
    if (missingGallery.length > 0) {
      findings.push(finding(
        "U0_EVIDENCE_GALLERY_CELL_MISSING",
        trace.id,
        `Exact gallery evidence is missing ${String(missingGallery.length)} reviewed cells.`,
      ));
    }
  }
  return findings.sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
}

function bunTraceEvidence(
  summary: U0JUnitSummary | null,
): readonly JsonRecord[] {
  return TRACE_ROWS.filter(({ plannedEvidenceOwner }) =>
    plannedEvidenceOwner.endsWith(".test.ts")
  ).map((trace) => {
    const cases = summary?.cases.filter(({ file }) => file === trace.plannedEvidenceOwner) ?? [];
    const missingCaseIds = trace.caseIds.filter((caseId) => {
      const escaped = caseId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const pattern = new RegExp(
        `(?:^|[^A-Za-z0-9-])${escaped}(?:$|[^A-Za-z0-9-])`,
        "u",
      );
      return !cases.some(({ name }) => pattern.test(name));
    });
    return {
      id: trace.id,
      owner: trace.plannedEvidenceOwner,
      ownerTestcaseCount: cases.length,
      ownerTestcaseDigest: u0EvidenceDigest(cases),
      requiredCaseIds: trace.caseIds,
      missingCaseIds,
      outcome: cases.length > 0 && missingCaseIds.length === 0 ? "pass" : "fail",
    };
  });
}

export function buildU0TraceEvidence(input: Readonly<{
  junit: U0JUnitSummary | null;
  browserCells: readonly U0BrowserCell[];
}>): readonly JsonRecord[] {
  const bun = new Map(bunTraceEvidence(input.junit).map((row) => [String(row["id"]), row]));
  return TRACE_ROWS.map((trace) => {
    const bunRow = bun.get(trace.id);
    if (bunRow !== undefined) return bunRow;
    const cells = input.browserCells.filter((cell) => {
      const producer = isRecord(cell.value["producer"]) ? cell.value["producer"] : {};
      return producer["file"] === trace.plannedEvidenceOwner;
    });
    const coverage = Object.fromEntries(BROWSER_PROJECTS.map((project) => {
      const caseIds = new Set<string>();
      for (const cell of cells) {
        const browser = isRecord(cell.value["browser"]) ? cell.value["browser"] : {};
        if (browser["name"] !== project) continue;
        for (const binding of records(cell.value["bindings"])) {
          if (strings(binding["traceIds"]).includes(trace.id)) {
            caseIds.add(String(binding["caseId"]));
          }
        }
      }
      return [project, [...caseIds].sort(compare)];
    }));
    const observedGallery = new Set<string>();
    for (const cell of cells) recursivelyObservedStrings(cell.value["observations"], observedGallery);
    const missingGalleryCellIds = trace.galleryCellIds.filter((id) => !observedGallery.has(id));
    const missingByProject = Object.fromEntries(BROWSER_PROJECTS.map((project) => [
      project,
      trace.caseIds.filter((id) => !strings(coverage[project]).includes(id)),
    ]));
    const outcome = BROWSER_PROJECTS.every((project) =>
        strings(missingByProject[project]).length === 0
      ) && missingGalleryCellIds.length === 0;
    return {
      id: trace.id,
      owner: trace.plannedEvidenceOwner,
      requiredCaseIds: trace.caseIds,
      caseCoverageByBrowser: coverage,
      missingCaseIdsByBrowser: missingByProject,
      requiredGalleryCellCount: trace.galleryCellIds.length,
      missingGalleryCellIds,
      rawCellCount: cells.length,
      rawCellManifestSha256: u0EvidenceDigest(cells.map((cell) => ({
        path: cell.path,
        bytes: cell.bytes,
        sha256: cell.sha256,
      }))),
      outcome: outcome ? "pass" : "fail",
    };
  });
}

function runPaths(runId: string): Readonly<{
  directory: string;
  metadata: string;
  validatorStdout: string;
  validatorStderr: string;
  bunStdout: string;
  bunStderr: string;
  junit: string;
  browserStdout: string;
  browserStderr: string;
  playwright: string;
  cellsDirectory: string;
}> {
  const directory = `test-results/u0-evidence-runs/${runId}`;
  return {
    directory,
    metadata: `${directory}/run-metadata.json`,
    validatorStdout: `${directory}/contract-validator.stdout.json`,
    validatorStderr: `${directory}/contract-validator.stderr.txt`,
    bunStdout: `${directory}/focused-bun.stdout.txt`,
    bunStderr: `${directory}/focused-bun.stderr.txt`,
    junit: `${directory}/focused-bun.junit.xml`,
    browserStdout: `${directory}/playwright.stdout.txt`,
    browserStderr: `${directory}/playwright.stderr.txt`,
    playwright: `${directory}/playwright-results.json`,
    cellsDirectory: `test-results/u0-browser-evidence-runs/${runId}`,
  };
}

function fixedRunArtifactPaths(
  paths: ReturnType<typeof runPaths>,
): readonly string[] {
  return Object.freeze([
    paths.metadata,
    paths.validatorStdout,
    paths.validatorStderr,
    paths.bunStdout,
    paths.bunStderr,
    paths.junit,
    paths.browserStdout,
    paths.browserStderr,
    paths.playwright,
  ]);
}

async function inspectExactRunDirectory(
  paths: ReturnType<typeof runPaths>,
): Promise<Readonly<{
  entries: readonly string[];
  findings: readonly U0EvidenceFinding[];
}>> {
  const findings: U0EvidenceFinding[] = [];
  const expected = fixedRunArtifactPaths(paths).map((path) => basename(path)).sort(compare);
  let entries: readonly string[] = [];
  try {
    const status = await lstat(paths.directory);
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new Error("Run evidence root must be a real non-symlink directory.");
    }
    const directoryEntries = (await readdir(paths.directory, { withFileTypes: true }))
      .sort((left, right) => compare(left.name, right.name));
    entries = directoryEntries.map((entry) => entry.name);
    for (const entry of directoryEntries) {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        findings.push(finding(
          "U0_EVIDENCE_RUN_ARTIFACT_TYPE",
          join(paths.directory, entry.name).replaceAll("\\", "/"),
          "The fixed run directory may contain only regular non-symlink files.",
        ));
      }
    }
    if (!canonicalEquals(entries, expected)) {
      findings.push(finding(
        "U0_EVIDENCE_RUN_DIRECTORY_INVENTORY",
        paths.directory,
        "The fixed run directory must contain exactly the nine reviewed raw artifacts.",
      ));
    }
  } catch (error) {
    findings.push(finding(
      "U0_EVIDENCE_RUN_DIRECTORY",
      paths.directory,
      error instanceof Error ? error.message : "The fixed run directory is unreadable.",
    ));
  }
  return { entries, findings };
}

async function runEnvironment(
  runId: string,
): Promise<Readonly<Record<string, string>>> {
  const paths = runPaths(runId);
  const realNode = await findRealNode();
  const environment: Record<string, string> = {
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    NO_COLOR: "1",
    CI: "1",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    BUN_BINARY: process.execPath,
    JCPE_NODE: realNode.path,
    NODE_BINARY: realNode.path,
    PATH: sortedUnique([
      dirname(process.execPath),
      dirname(realNode.path),
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ]).join(":"),
    HOME: process.env["HOME"] ?? "/tmp",
    TMPDIR: process.env["TMPDIR"] ?? "/tmp",
    JCPE_U0_EVIDENCE_RUN_ID: runId,
    PLAYWRIGHT_JSON_OUTPUT_FILE: paths.playwright,
  };
  for (const key of [
    "LD_LIBRARY_PATH",
    "PLAYWRIGHT_BROWSERS_PATH",
    "XDG_CACHE_HOME",
  ]) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return Object.freeze(environment);
}

function validatorCommand(): readonly string[] {
  return ["bun", "scripts/validate-u0-contract.ts"];
}

function bunCommand(runId: string): readonly string[] {
  return [
    "bun",
    "test",
    ...U0_FOCUSED_BUN_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--timeout=120000",
    "--reporter=junit",
    `--reporter-outfile=${runPaths(runId).junit}`,
  ];
}

function browserCommand(): readonly string[] {
  return [
    "bun",
    "scripts/run-playwright.ts",
    "test",
    ...U0_BROWSER_OWNER_FILES,
    "--workers=1",
    "--retries=0",
    "--timeout=300000",
    `--global-timeout=${String(U0_PLAYWRIGHT_GLOBAL_TIMEOUT_MS)}`,
  ];
}

async function atomicWrite(path: string, value: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${String(process.pid)}.${randomBytes(4).toString("hex")}.tmp`;
  await Bun.write(temporary, value);
  await rename(temporary, path);
}

function safeUsageNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (
    typeof value === "bigint" && value >= 0n &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) return Number(value);
  return null;
}

async function runRaw(
  command: readonly string[],
  environment: Readonly<Record<string, string>>,
  stdoutPath: string,
  stderrPath: string,
  deadlineMs: number,
): Promise<RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>> {
  const started = performance.now();
  const child = Bun.spawn({
    cmd: [process.execPath, ...command.slice(1)],
    cwd: process.cwd(),
    env: environment,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, deadlineMs);
  const [exitCode, stdoutBuffer, stderrBuffer] = await Promise.all([
    child.exited,
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
  ]).finally(() => {
    clearTimeout(deadline);
  });
  const stdout = new Uint8Array(stdoutBuffer);
  const stderr = new Uint8Array(stderrBuffer);
  await Promise.all([atomicWrite(stdoutPath, stdout), atomicWrite(stderrPath, stderr)]);
  const usage = child.resourceUsage();
  const maxRssRaw = safeUsageNumber(usage?.maxRSS);
  const maxRssRawUnit = platform() === "linux"
    ? "kilobytes"
    : platform() === "darwin" ? "bytes" : "runtime-defined";
  return {
    command,
    environment,
    deadlineMs,
    timedOut,
    stdoutPath,
    stderrPath,
    stdoutSha256: sha256Bytes(stdout),
    stderrSha256: sha256Bytes(stderr),
    exitCode,
    signal: child.signalCode,
    elapsedMs: Math.round((performance.now() - started) * 1_000) / 1_000,
    resourceUsage: {
      measurement: "Bun.Subprocess.resourceUsage",
      maxRssRaw,
      maxRssRawUnit,
      maxRssBytes: maxRssRaw === null
        ? null
        : maxRssRawUnit === "kilobytes"
        ? maxRssRaw * 1_024
        : maxRssRawUnit === "bytes" ? maxRssRaw : null,
      cpuUserMicros: safeUsageNumber(usage?.cpuTime.user),
      cpuSystemMicros: safeUsageNumber(usage?.cpuTime.system),
      gating: false,
    },
    stdout,
    stderr,
  };
}

function withoutBuffers(
  value: RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>,
): RawExecution {
  const { stdout: _stdout, stderr: _stderr, ...rest } = value;
  void _stdout;
  void _stderr;
  return rest;
}

async function productionPaths(): Promise<readonly string[]> {
  const paths: string[] = [];
  const glob = new Bun.Glob("**/*.{ts,tsx,css,html}");
  for await (const path of glob.scan({ cwd: "src", onlyFiles: true })) {
    paths.push(`src/${path.replaceAll("\\", "/")}`);
  }
  return paths.sort(compare);
}

function localInputModuleSpecifiers(path: string, source: string): readonly string[] {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers = new Set<string>();
  const add = (value: ts.Expression | undefined): void => {
    if (value !== undefined && ts.isStringLiteralLike(value)) {
      specifiers.add(value.text);
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      add(node.argument.literal);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...specifiers].sort(compare);
}

async function resolveLocalInputModule(
  importer: string,
  specifier: string,
): Promise<string | null> {
  if (!specifier.startsWith(".")) return null;
  const root = resolve(process.cwd());
  const base = resolve(root, dirname(importer), specifier);
  const hasExtension = /\.[A-Za-z0-9]+$/u.test(base);
  const candidates = hasExtension
    ? [base]
    : [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.json`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
        join(base, "index.json"),
      ];
  for (const candidate of candidates) {
    if (!await Bun.file(candidate).exists()) continue;
    const normalized = relative(root, candidate).replaceAll("\\", "/");
    if (normalized === ".." || normalized.startsWith("../")) return null;
    return normalized;
  }
  return null;
}

async function expandLocalInputClosure(
  pathGroups: Map<string, string>,
  findings: U0EvidenceFinding[],
): Promise<void> {
  const pending = [...pathGroups.keys()].sort(compare);
  const visited = new Set<string>();
  while (pending.length > 0) {
    const path = pending.shift();
    if (
      path === undefined ||
      visited.has(path) ||
      (!path.endsWith(".ts") && !path.endsWith(".tsx"))
    ) continue;
    visited.add(path);
    const file = Bun.file(path);
    if (!await file.exists()) continue;
    const source = await file.text();
    for (const specifier of localInputModuleSpecifiers(path, source)) {
      if (!specifier.startsWith(".")) continue;
      const target = await resolveLocalInputModule(path, specifier);
      if (target === null) {
        findings.push(finding(
          "U0_EVIDENCE_INPUT_IMPORT_MISSING",
          `${path}#${specifier}`,
          "A local module imported by the evidence execution closure is missing or outside the repository.",
        ));
        continue;
      }
      if (pathGroups.has(target)) continue;
      pathGroups.set(target, `${String(pathGroups.get(path))}:import`);
      pending.push(target);
      pending.sort(compare);
    }
  }
}

async function toolchainInputComponent(): Promise<InputComponent> {
  const manifest = record(await Bun.file("package.json").json(), "package manifest");
  const dependencies = isRecord(manifest["devDependencies"])
    ? manifest["devDependencies"]
    : {};
  const value = stableU0EvidenceJson({
    bun: Bun.version,
    bunNodeCompatibility: process.versions.node,
    realNode: await findRealNode(),
    typescript: ts.version,
    playwright: dependencies["@playwright/test"] ?? null,
    axePlaywright: dependencies["@axe-core/playwright"] ?? null,
    platform: platform(),
    release: release(),
    architecture: process.arch,
  });
  const bytes = new TextEncoder().encode(value);
  return {
    group: "environment",
    path: "<environment/toolchain>",
    bytes: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  };
}

async function snapshotInputs(): Promise<Readonly<{
  snapshot: InputSnapshot;
  findings: readonly U0EvidenceFinding[];
  controls: readonly U0EvidenceFinding[];
  sourceByOwner: ReadonlyMap<string, string>;
}>> {
  const findings: U0EvidenceFinding[] = [];
  const controls: U0EvidenceFinding[] = [];
  const pathGroups = new Map<string, string>();
  const groups: Readonly<Record<string, readonly string[]>> = {
    ...U0_INPUT_GROUPS,
    production: await productionPaths(),
  };
  for (const [group, paths] of Object.entries(groups)) {
    for (const path of paths) {
      if (pathGroups.has(path)) {
        findings.push(finding(
          "U0_EVIDENCE_INPUT_DUPLICATE",
          path,
          `Input appears in ${String(pathGroups.get(path))} and ${group}.`,
        ));
      } else pathGroups.set(path, group);
    }
  }
  await expandLocalInputClosure(pathGroups, findings);
  const components: InputComponent[] = [];
  const sourceByOwner = new Map<string, string>();
  for (const [path, group] of [...pathGroups].sort(([left], [right]) => compare(left, right))) {
    const file = Bun.file(path);
    if (!await file.exists()) {
      findings.push(finding(
        "U0_EVIDENCE_INPUT_MISSING",
        path,
        `Required ${group} input is missing.`,
      ));
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const source = new TextDecoder().decode(bytes);
    components.push({ group, path, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
    if (U0_EXACT_OWNER_FILES.includes(path)) {
      sourceByOwner.set(path, source);
      controls.push(...inspectU0TestControls(path, source));
    }
    if (path === "bunfig.toml" && !/^retry\s*=\s*0\s*$/mu.test(source)) {
      controls.push(finding(
        "U0_EVIDENCE_RETRY",
        "bunfig.toml:[test].retry",
        "Focused U0 evidence requires retry = 0.",
      ));
    }
    if (
      path === "playwright.config.ts" &&
      (!/\bforbidOnly\s*:\s*true\b/u.test(source) ||
        !/\bretries\s*:\s*0\b/u.test(source) ||
        !/\bworkers\s*:\s*1\b/u.test(source) ||
        !/\bfullyParallel\s*:\s*false\b/u.test(source))
    ) {
      controls.push(finding(
        "U0_EVIDENCE_PLAYWRIGHT_CONFIG",
        "playwright.config.ts",
        "U0 requires forbidOnly, zero retries, one worker, and no full parallelism.",
      ));
    }
  }
  components.push(await toolchainInputComponent());
  components.sort((left, right) => compare(left.path, right.path));
  const ownerInventory = sortedUnique([...sourceByOwner.keys()]);
  if (JSON.stringify(ownerInventory) !== JSON.stringify(U0_EXACT_OWNER_FILES)) {
    findings.push(finding(
      "U0_EVIDENCE_OWNER_MISSING",
      "tests/fixtures/ui/trace-ledger.json",
      "Every unique planned evidence owner must exist and be hashed.",
    ));
  }
  return {
    snapshot: {
      algorithm: "sha256-component-manifest-v1",
      digest: u0EvidenceDigest(components),
      components,
    },
    findings,
    controls,
    sourceByOwner,
  };
}

async function environmentEvidence(): Promise<JsonRecord> {
  const realNode = await findRealNode();
  const processors = cpus();
  const manifest = record(await Bun.file("package.json").json(), "package manifest");
  const dependencies = isRecord(manifest["devDependencies"])
    ? manifest["devDependencies"]
    : {};
  return {
    bun: Bun.version,
    bunNodeCompatibility: process.versions.node,
    realNode,
    typescript: ts.version,
    playwright: dependencies["@playwright/test"] ?? null,
    axePlaywright: dependencies["@axe-core/playwright"] ?? null,
    platform: platform(),
    release: release(),
    architecture: process.arch,
    cpuCount: processors.length,
    cpuModel: processors[0]?.model ?? "unavailable",
    totalMemoryBytes: totalmem(),
  };
}

function parseValidatorOutput(output: string): Readonly<{
  value: JsonRecord | null;
  findings: readonly U0EvidenceFinding[];
}> {
  try {
    const value = record(JSON.parse(output), "U0 validator output");
    const counts = isRecord(value["counts"]) ? value["counts"] : {};
    if (
      value["schema"] !== "changes.validation.u0-contract.v1" ||
      value["package"] !== "U0" || value["outcome"] !== "pass" ||
      counts["companions"] !== U0_EXPECTED_COUNTS.companions ||
      counts["components"] !== U0_EXPECTED_COUNTS.components ||
      counts["primitiveCases"] !== U0_EXPECTED_COUNTS.primitiveCases ||
      counts["galleryCells"] !== U0_EXPECTED_COUNTS.galleryCells ||
      counts["topologyCases"] !== U0_EXPECTED_COUNTS.topologyCases ||
      counts["menuTopologyCases"] !== U0_EXPECTED_COUNTS.menuTopologyCases ||
      counts["contrastCases"] !== U0_EXPECTED_COUNTS.contrastCases ||
      counts["shellCases"] !== U0_EXPECTED_COUNTS.shellCases ||
      counts["traces"] !== U0_EXPECTED_COUNTS.traces ||
      counts["authorities"] !== U0_EXPECTED_COUNTS.authorities ||
      !Array.isArray(value["findings"]) || value["findings"].length !== 0
    ) throw new Error("validator identity or counts are not exact");
    return { value, findings: [] };
  } catch (error) {
    return {
      value: null,
      findings: [finding(
        "U0_EVIDENCE_VALIDATOR_OUTPUT",
        "validator.stdout",
        error instanceof Error ? error.message : "Validator output is invalid.",
      )],
    };
  }
}

async function readPersistedCells(runId: string): Promise<Readonly<{
  cells: readonly U0BrowserCell[];
  findings: readonly U0EvidenceFinding[];
}>> {
  const directory = runPaths(runId).cellsDirectory;
  const findings: U0EvidenceFinding[] = [];
  const cells: U0BrowserCell[] = [];
  try {
    const directoryStatus = await lstat(directory);
    if (!directoryStatus.isDirectory() || directoryStatus.isSymbolicLink()) {
      throw new Error("Raw-cell evidence root must be a real non-symlink directory.");
    }
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => compare(left.name, right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === "screenshots") continue;
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        findings.push(finding(
          "U0_EVIDENCE_CELL_DIRECTORY_INVENTORY",
          join(directory, entry.name).replaceAll("\\", "/"),
          "The raw-cell directory may contain only JSON cells and the screenshots directory.",
        ));
        continue;
      }
      const path = join(directory, entry.name).replaceAll("\\", "/");
      const bytes = await readRegularFileNoFollow(path, directory);
      try {
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!isRecord(value)) throw new Error("cell is not an object");
        cells.push(Object.freeze({
          value,
          bytes: bytes.byteLength,
          sha256: sha256Bytes(bytes),
          source: "persisted",
          path,
        }));
      } catch (error) {
        findings.push(finding(
          "U0_EVIDENCE_CELL_JSON",
          path,
          error instanceof Error ? error.message : "Raw cell JSON is invalid.",
        ));
      }
    }
  } catch (error) {
    findings.push(finding(
      "U0_EVIDENCE_CELL_DIRECTORY",
      directory,
      error instanceof Error ? error.message : "Raw cell directory is unreadable.",
    ));
  }
  cells.sort((left, right) => compare(left.path, right.path));
  return { cells, findings };
}

async function verifyBrowserScreenshots(
  runId: string,
  cells: readonly U0BrowserCell[],
): Promise<Readonly<{
  artifacts: readonly JsonRecord[];
  findings: readonly U0EvidenceFinding[];
}>> {
  const byPath = new Map<string, JsonRecord>();
  const findings: U0EvidenceFinding[] = [];
  for (const cell of cells) {
    if (!Array.isArray(cell.value["screenshots"])) {
      findings.push(finding(
        "U0_EVIDENCE_SCREENSHOT_INVENTORY",
        `${cell.path}#screenshots`,
        "Screenshot evidence must be an explicit array.",
      ));
      continue;
    }
    for (const screenshot of records(cell.value["screenshots"])) {
      const filename = screenshot["filename"];
      const expectedBytes = screenshot["bytes"];
      const expectedSha256 = screenshot["sha256"];
      if (
        typeof filename !== "string" ||
        !/^[A-Za-z0-9._-]+\.png$/u.test(filename) ||
        typeof expectedBytes !== "number" || expectedBytes <= 0 ||
        !isSha256(expectedSha256)
      ) {
        findings.push(finding(
          "U0_EVIDENCE_SCREENSHOT_IDENTITY",
          `${cell.path}#screenshots`,
          "Screenshot record requires a safe PNG filename, positive bytes, and SHA-256.",
        ));
        continue;
      }
      const path = join(
        runPaths(runId).cellsDirectory,
        "screenshots",
        filename,
      ).replaceAll("\\", "/");
      let bytes: Uint8Array;
      try {
        bytes = await readRegularFileNoFollow(
          path,
          join(runPaths(runId).cellsDirectory, "screenshots"),
        );
      } catch {
        findings.push(finding(
          "U0_EVIDENCE_SCREENSHOT_MISSING",
          path,
          "Recorded browser screenshot is missing.",
        ));
        continue;
      }
      const actualSha256 = sha256Bytes(bytes);
      if (bytes.byteLength !== expectedBytes || actualSha256 !== expectedSha256) {
        findings.push(finding(
          "U0_EVIDENCE_SCREENSHOT_HASH",
          path,
          "Screenshot differs from its raw cell bytes or SHA-256.",
        ));
        continue;
      }
      const artifact = { path, bytes: bytes.byteLength, sha256: actualSha256 };
      const previous = byPath.get(path);
      if (previous !== undefined &&
        (previous["bytes"] !== artifact.bytes || previous["sha256"] !== artifact.sha256)) {
        findings.push(finding(
          "U0_EVIDENCE_SCREENSHOT_COLLISION",
          path,
          "Two raw cells disagree about one screenshot filename.",
        ));
      } else byPath.set(path, artifact);
    }
  }
  const screenshotDirectory = join(
    runPaths(runId).cellsDirectory,
    "screenshots",
  ).replaceAll("\\", "/");
  const actualPaths: string[] = [];
  try {
    const entries = (await readdir(screenshotDirectory, { withFileTypes: true }))
      .sort((left, right) => compare(left.name, right.name));
    for (const entry of entries) {
      const path = join(screenshotDirectory, entry.name).replaceAll("\\", "/");
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !/^[A-Za-z0-9._-]+\.png$/u.test(entry.name)
      ) {
        findings.push(finding(
          "U0_EVIDENCE_SCREENSHOT_INVENTORY",
          path,
          "The screenshot directory may contain only referenced regular PNG files.",
        ));
      } else actualPaths.push(path);
    }
  } catch {
    if (byPath.size > 0) {
      findings.push(finding(
        "U0_EVIDENCE_SCREENSHOT_DIRECTORY",
        screenshotDirectory,
        "Referenced browser screenshots require a readable screenshot directory.",
      ));
    }
  }
  if (
    JSON.stringify(actualPaths.sort(compare)) !==
      JSON.stringify([...byPath.keys()].sort(compare))
  ) {
    findings.push(finding(
      "U0_EVIDENCE_SCREENSHOT_INVENTORY",
      screenshotDirectory,
      "The screenshot directory must equal the raw-cell screenshot inventory exactly.",
    ));
  }
  return {
    artifacts: [...byPath.values()].sort((left, right) =>
      compare(String(left["path"]), String(right["path"]))
    ),
    findings,
  };
}

function validateU0ReportScreenshotManifest(
  reportScreenshots: PlaywrightInventory["screenshots"],
  persistedArtifacts: readonly JsonRecord[],
): readonly U0EvidenceFinding[] {
  const findings: U0EvidenceFinding[] = [];
  const reportManifest = reportScreenshots.map(({ filename, bytes, sha256 }) => ({
    filename,
    bytes,
    sha256,
  })).sort((left, right) => compare(left.filename, right.filename));
  const persistedManifest = persistedArtifacts.map((artifact) => ({
    filename: basename(String(artifact["path"])),
    bytes: artifact["bytes"],
    sha256: artifact["sha256"],
  })).sort((left, right) => compare(left.filename, right.filename));
  const names = reportManifest.map(({ filename }) => filename);
  if (new Set(names).size !== names.length) {
    findings.push(finding(
      "U0_EVIDENCE_PLAYWRIGHT_SCREENSHOT_DUPLICATE",
      "browser.report.attachments",
      "Each reviewed screenshot filename must be attached exactly once.",
    ));
  }
  if (!canonicalEquals(reportManifest, persistedManifest)) {
    findings.push(finding(
      "U0_EVIDENCE_PLAYWRIGHT_SCREENSHOT_MANIFEST",
      "browser.report.attachments",
      "Inline Playwright screenshot attachments must exactly equal the persisted cell PNG inventory by name, bytes, and SHA-256.",
    ));
  }
  return findings;
}

async function isGitTracked(path: string): Promise<boolean> {
  try {
    const child = Bun.spawn({
      cmd: ["git", "ls-files", "--error-unmatch", "--", path],
      cwd: process.cwd(),
      env: {
        PATH: process.env["PATH"] ?? "/usr/local/bin:/usr/bin:/bin",
      },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      timeout: 30_000,
      killSignal: "SIGKILL",
    });
    return await child.exited === 0;
  } catch {
    return false;
  }
}

async function readManualArtifactFiles(
  expectedArtifact: ArtifactIdentity,
): Promise<Readonly<{
  artifacts: readonly JsonRecord[];
  findings: readonly U0EvidenceFinding[];
  paths: readonly string[];
}>> {
  const root = manualAttachmentDirectory(expectedArtifact.sha256);
  const findings: U0EvidenceFinding[] = [];
  const paths: string[] = [];
  try {
    const rootStatus = await lstat(root);
    if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
      findings.push(finding(
        "U0_EVIDENCE_MANUAL_ATTACHMENT_ROOT",
        root,
        "Manual attachment root must be a real non-symlink directory.",
      ));
      return { artifacts: [], findings, paths };
    }
  } catch {
    return { artifacts: [], findings, paths };
  }
  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => compare(left.name, right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_ATTACHMENT_SYMLINK",
          path,
          "Manual evidence attachments must be regular files, not symbolic links.",
        ));
      } else if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        paths.push(path);
      } else {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_ATTACHMENT_TYPE",
          path,
          "Manual evidence directories may contain only regular files and directories.",
        ));
      }
    }
  };
  await walk(root);
  const artifacts: JsonRecord[] = [];
  const resolvedRoot = resolve(root);
  for (const path of paths.sort(compare)) {
    try {
      const status = await lstat(path);
      const resolvedPath = await realpath(path);
      const containment = relative(resolvedRoot, resolvedPath).replaceAll("\\", "/");
      if (
        !status.isFile() ||
        status.isSymbolicLink() ||
        containment === ".." ||
        containment.startsWith("../")
      ) {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_ATTACHMENT_TYPE",
          path,
          "Manual evidence attachment resolution must remain a regular file inside its artifact directory.",
        ));
        continue;
      }
      if (await isGitTracked(path)) {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_ATTACHMENT_TRACKED",
          path,
          "Operator evidence must remain runtime-only and untracked.",
        ));
      }
      const bytes = await readRegularFileNoFollow(path, root);
      const contentError = manualAttachmentContentError(path, bytes);
      if (contentError !== null) {
        findings.push(finding(
          "U0_EVIDENCE_MANUAL_ATTACHMENT_CONTENT",
          path,
          contentError,
        ));
      }
      artifacts.push({
        path,
        bytes: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      });
    } catch (error) {
      findings.push(finding(
        "U0_EVIDENCE_MANUAL_ATTACHMENT_READ",
        path,
        error instanceof Error ? error.message : "Manual evidence attachment is unreadable.",
      ));
    }
  }
  return { artifacts, findings, paths };
}

async function readU0ManualAccessibilityEvidence(
  expectedArtifact: ArtifactIdentity | null,
  latestObservationMs = Date.now() + 5 * 60 * 1_000,
): Promise<Readonly<{
  artifacts: readonly JsonRecord[];
  findings: readonly U0EvidenceFinding[];
  summary: JsonRecord;
}>> {
  const findings: U0EvidenceFinding[] = [];
  const artifacts: JsonRecord[] = [];
  if (expectedArtifact === null) {
    return {
      artifacts,
      findings: [finding(
        "U0_EVIDENCE_MANUAL_ARTIFACT_UNAVAILABLE",
        U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
        "A unique validated browser artifact is required before manual evidence can be checked.",
      )],
      summary: {
        ledgerPath: U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
        outcome: "fail",
      },
    };
  }
  const releaseArtifact = Bun.file("jazz_chord_progression_editor.html");
  if (!await releaseArtifact.exists()) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_RELEASE_ARTIFACT_MISSING",
      "jazz_chord_progression_editor.html",
      "The guarded standalone artifact is required for manual evidence binding.",
    ));
  } else {
    const releaseBytes = new Uint8Array(await releaseArtifact.arrayBuffer());
    if (
      releaseBytes.byteLength !== expectedArtifact.bytes ||
      sha256Bytes(releaseBytes) !== expectedArtifact.sha256
    ) {
      findings.push(finding(
        "U0_EVIDENCE_MANUAL_RELEASE_ARTIFACT_MISMATCH",
        "jazz_chord_progression_editor.html",
        "The tracked standalone artifact differs from the artifact exercised by U0 browser evidence.",
      ));
    }
  }
  const ledgerFile = Bun.file(U0_MANUAL_ACCESSIBILITY_LEDGER_PATH);
  if (!await ledgerFile.exists()) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_ACCESSIBILITY_PENDING",
      U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
      "A human operator has not yet attached the six required manual accessibility observations.",
    ));
    return {
      artifacts,
      findings,
      summary: {
        artifact: expectedArtifact,
        ledgerPath: U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
        outcome: "pending",
        rows: 0,
      },
    };
  }
  try {
    const status = await lstat(U0_MANUAL_ACCESSIBILITY_LEDGER_PATH);
    if (!status.isFile() || status.isSymbolicLink()) {
      findings.push(finding(
        "U0_EVIDENCE_MANUAL_LEDGER_TYPE",
        U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
        "The manual accessibility ledger must be a regular file.",
      ));
    }
    if (await isGitTracked(U0_MANUAL_ACCESSIBILITY_LEDGER_PATH)) {
      findings.push(finding(
        "U0_EVIDENCE_MANUAL_LEDGER_TRACKED",
        U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
        "The operator-authored manual ledger must remain runtime-only and untracked.",
      ));
    }
    artifacts.push(await artifactDigest(U0_MANUAL_ACCESSIBILITY_LEDGER_PATH));
  } catch (error) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_LEDGER_READ",
      U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
      error instanceof Error ? error.message : "The manual ledger is unreadable.",
    ));
  }
  let value: unknown = null;
  try {
    value = await ledgerFile.json();
  } catch (error) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_LEDGER_JSON",
      U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
      error instanceof Error ? error.message : "The manual ledger is not valid JSON.",
    ));
  }
  const inspected = inspectU0ManualAccessibilityLedger(
    value,
    expectedArtifact,
    latestObservationMs,
  );
  findings.push(...inspected.findings);
  const directory = await readManualArtifactFiles(expectedArtifact);
  findings.push(...directory.findings);
  artifacts.push(...directory.artifacts);
  const declaredPaths = inspected.attachments
    .map((attachment) => attachment["path"])
    .filter((path): path is string => typeof path === "string")
    .sort(compare);
  if (JSON.stringify(declaredPaths) !== JSON.stringify(directory.paths)) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_ATTACHMENT_INVENTORY",
      manualAttachmentDirectory(expectedArtifact.sha256),
      "The artifact-scoped manual attachment directory must equal the ledger inventory exactly.",
    ));
  }
  const actualByPath = new Map(directory.artifacts.map((artifact) => [
    String(artifact["path"]),
    artifact,
  ]));
  for (const attachment of inspected.attachments) {
    const path = attachment["path"];
    if (typeof path !== "string") continue;
    const actual = actualByPath.get(path);
    if (
      actual === undefined ||
      actual["bytes"] !== attachment["bytes"] ||
      actual["sha256"] !== attachment["sha256"]
    ) {
      findings.push(finding(
        "U0_EVIDENCE_MANUAL_ATTACHMENT_HASH",
        path,
        "Manual attachment bytes and SHA-256 must match the independently read file.",
      ));
    }
  }
  const unique = uniqueFindings(findings);
  return {
    artifacts: artifacts.sort((left, right) =>
      compare(String(left["path"]), String(right["path"]))
    ),
    findings: unique,
    summary: {
      artifact: expectedArtifact,
      attachmentManifest: directory.artifacts,
      ledgerPath: U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
      ledgerSha256: artifacts.find((artifact) =>
        artifact["path"] === U0_MANUAL_ACCESSIBILITY_LEDGER_PATH
      )?.["sha256"] ?? null,
      outcome: unique.length === 0 ? "pass" : "fail",
      rows: manualRows(value).map((row) => ({
        id: row["id"],
        observedAt: row["observedAt"],
        operator: row["operator"],
        status: row["status"],
      })),
    },
  };
}

function manualEvidenceSnapshotDigest(value: Readonly<{
  artifacts: readonly JsonRecord[];
  findings: readonly U0EvidenceFinding[];
  summary: JsonRecord;
}>): string {
  return u0EvidenceDigest({
    artifacts: value.artifacts,
    findings: value.findings,
    summary: value.summary,
  });
}

type ReviewedU0EvidenceInventory = Readonly<{
  findings: readonly U0EvidenceFinding[];
  inventory: U0EvidenceInventory | null;
  summary: JsonRecord;
}>;

async function reviewedU0EvidenceInventory(): Promise<ReviewedU0EvidenceInventory> {
  const loaded = await loadU0EvidenceInventory();
  const findings: U0EvidenceFinding[] = [...loaded.findings];
  if (loaded.inventory === null) {
    return {
      findings,
      inventory: null,
      summary: {
        path: U0_EVIDENCE_INVENTORY_PATH,
        outcome: "fail",
      },
    };
  }
  findings.push(...await verifyU0EvidenceInventorySourceHashes(loaded.inventory));
  let fixtureSha256: string | null = null;
  try {
    fixtureSha256 = String((await artifactDigest(U0_EVIDENCE_INVENTORY_PATH))["sha256"]);
  } catch (error) {
    findings.push(finding(
      "U0_EVIDENCE_INVENTORY_UNREADABLE",
      U0_EVIDENCE_INVENTORY_PATH,
      error instanceof Error ? error.message : "Reviewed inventory is unreadable.",
    ));
  }
  return {
    findings: uniqueFindings(findings),
    inventory: loaded.inventory,
    summary: {
      path: U0_EVIDENCE_INVENTORY_PATH,
      schema: loaded.inventory.schema,
      fixtureVersion: loaded.inventory.fixtureVersion,
      fixtureSha256,
      expectedCounts: loaded.inventory.expectedCounts,
      reviewedSourceManifestSha256: u0EvidenceDigest(loaded.inventory.reviewedSources),
      outcome: findings.length === 0 ? "pass" : "fail",
    },
  };
}

function uniqueFindings(values: readonly U0EvidenceFinding[]): readonly U0EvidenceFinding[] {
  return [...new Map(values.map((item) => [
    `${item.code}\u0000${item.path}\u0000${item.message}`,
    item,
  ])).values()].sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
}

function signedLedger(value: JsonRecord): JsonRecord {
  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  );
  return { ...payload, semanticDigest: u0EvidenceDigest(payload) };
}

function canonicalEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function expectedValidatorCounts(): JsonRecord {
  return {
    companions: U0_EXPECTED_COUNTS.companions,
    components: U0_EXPECTED_COUNTS.components,
    primitiveCases: U0_EXPECTED_COUNTS.primitiveCases,
    galleryCells: U0_EXPECTED_COUNTS.galleryCells,
    topologyCases: U0_EXPECTED_COUNTS.topologyCases,
    menuTopologyCases: U0_EXPECTED_COUNTS.menuTopologyCases,
    contrastCases: U0_EXPECTED_COUNTS.contrastCases,
    shellCases: U0_EXPECTED_COUNTS.shellCases,
    traces: U0_EXPECTED_COUNTS.traces,
    authorities: U0_EXPECTED_COUNTS.authorities,
  };
}

function validStoredExecution(
  value: unknown,
  expected: Readonly<{
    command: readonly string[];
    deadlineMs: number;
    stderrPath: string;
    stdoutPath: string;
  }>,
): boolean {
  if (!isRecord(value)) return false;
  const usage = isRecord(value["resourceUsage"]) ? value["resourceUsage"] : {};
  return canonicalEquals(value["command"], expected.command) &&
    isRecord(value["environment"]) &&
    value["deadlineMs"] === expected.deadlineMs &&
    value["timedOut"] === false &&
    value["stdoutPath"] === expected.stdoutPath &&
    value["stderrPath"] === expected.stderrPath &&
    isSha256(value["stdoutSha256"]) &&
    isSha256(value["stderrSha256"]) &&
    value["exitCode"] === 0 &&
    value["signal"] === null &&
    typeof value["elapsedMs"] === "number" &&
    Number.isFinite(value["elapsedMs"]) &&
    value["elapsedMs"] >= 0 &&
    usage["measurement"] === "Bun.Subprocess.resourceUsage" &&
    usage["gating"] === false;
}

export function validateU0EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): readonly U0EvidenceFinding[] {
  if (!isRecord(candidate)) {
    return [finding(
      "U0_EVIDENCE_LEDGER_SHAPE",
      OUTPUT_PATH,
      "Evidence ledger must be an object.",
    )];
  }
  const findings: U0EvidenceFinding[] = [];
  const unsigned = Object.fromEntries(
    Object.entries(candidate).filter(([key]) => key !== "semanticDigest"),
  );
  if (candidate["semanticDigest"] !== u0EvidenceDigest(unsigned)) {
    findings.push(finding(
      "U0_EVIDENCE_DIGEST",
      `${OUTPUT_PATH}#semanticDigest`,
      "Ledger digest does not bind its canonical payload.",
    ));
  }
  if (
    candidate["schema"] !== "changes.evidence.u0.v1" ||
    candidate["schemaVersion"] !== 1 || candidate["package"] !== "U0" ||
    candidate["toolVersion"] !== TOOL_VERSION || candidate["outcome"] !== "pass" ||
    !isCanonicalUtcTimestamp(candidate["verificationStartedAt"]) ||
    !isSha256(candidate["manualPreflightDigest"]) ||
    !Array.isArray(candidate["findings"]) || candidate["findings"].length !== 0
  ) {
    findings.push(finding(
      "U0_EVIDENCE_LEDGER_IDENTITY",
      OUTPUT_PATH,
      "Ledger identity and passing status must be exact.",
    ));
  }
  const nonce = candidate["nonce"];
  const expectedRunId = typeof nonce === "string" && /^[a-f0-9]{32}$/u.test(nonce)
    ? u0EvidenceDigest({
      toolVersion: TOOL_VERSION,
      inputDigest: currentInputDigest,
      contractVersion: record(contractFixture, "U0 contract")["contractVersion"],
      nonce,
    }).slice(0, 32)
    : "";
  if (!SAFE_RUN_ID.test(String(candidate["runId"])) || candidate["runId"] !== expectedRunId) {
    findings.push(finding(
      "U0_EVIDENCE_RUN_ID",
      `${OUTPUT_PATH}#runId`,
      "Run ID must bind the verifier, current inputs, contract version, and recorded nonce.",
    ));
  }
  const input = isRecord(candidate["input"]) ? candidate["input"] : {};
  const pre = isRecord(input["pre"]) ? input["pre"] : {};
  const post = isRecord(input["post"]) ? input["post"] : {};
  if (
    pre["digest"] !== currentInputDigest || post["digest"] !== currentInputDigest ||
    pre["digest"] !== post["digest"] ||
    pre["algorithm"] !== "sha256-component-manifest-v1" ||
    post["algorithm"] !== "sha256-component-manifest-v1" ||
    !Array.isArray(pre["components"]) ||
    pre["components"].length === 0 ||
    !canonicalEquals(pre, post)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_INPUT_STALE",
      `${OUTPUT_PATH}#input`,
      "Pre, post, and current input manifests must match.",
    ));
  }
  const traces = records(candidate["traces"]);
  if (
    traces.length !== U0_EXPECTED_COUNTS.traces ||
    JSON.stringify(traces.map((trace) => trace["id"])) !==
      JSON.stringify(TRACE_ROWS.map(({ id }) => id)) ||
    traces.some((trace, index) => {
      const expected = TRACE_ROWS[index];
      if (
        expected === undefined ||
        trace["outcome"] !== "pass" ||
        trace["owner"] !== expected.plannedEvidenceOwner ||
        !canonicalEquals(trace["requiredCaseIds"], expected.caseIds)
      ) return true;
      if (expected.plannedEvidenceOwner.endsWith(".test.ts")) {
        return typeof trace["ownerTestcaseCount"] !== "number" ||
          trace["ownerTestcaseCount"] <= 0 ||
          !isSha256(trace["ownerTestcaseDigest"]) ||
          !canonicalEquals(trace["missingCaseIds"], []);
      }
      const coverage = isRecord(trace["caseCoverageByBrowser"])
        ? trace["caseCoverageByBrowser"]
        : {};
      const missing = isRecord(trace["missingCaseIdsByBrowser"])
        ? trace["missingCaseIdsByBrowser"]
        : {};
      return BROWSER_PROJECTS.some((project) =>
          !canonicalEquals(coverage[project], expected.caseIds) ||
          !canonicalEquals(missing[project], [])
        ) ||
        trace["requiredGalleryCellCount"] !== expected.galleryCellIds.length ||
        !canonicalEquals(trace["missingGalleryCellIds"], []) ||
        typeof trace["rawCellCount"] !== "number" ||
        trace["rawCellCount"] <= 0 ||
        !isSha256(trace["rawCellManifestSha256"]);
    })
  ) {
    findings.push(finding(
      "U0_EVIDENCE_TRACE",
      `${OUTPUT_PATH}#traces`,
      "All twenty reviewed traces must pass in ledger order.",
    ));
  }
  const owners = candidate["owners"];
  if (!isRecord(owners) ||
    !canonicalEquals(owners["exact"], U0_EXACT_OWNER_FILES) ||
    !canonicalEquals(owners["bun"], U0_BUN_OWNER_FILES) ||
    !canonicalEquals(owners["browser"], U0_BROWSER_OWNER_FILES)) {
    findings.push(finding(
      "U0_EVIDENCE_OWNER_INVENTORY",
      `${OUTPUT_PATH}#owners`,
      "Stored owner inventory must equal the reviewed trace ledger exactly.",
    ));
  }
  const evidenceInventory = isRecord(candidate["evidenceInventory"])
    ? candidate["evidenceInventory"]
    : {};
  if (
    evidenceInventory["path"] !== U0_EVIDENCE_INVENTORY_PATH ||
    evidenceInventory["schema"] !== "changes.ui.u0-evidence-inventory.v1" ||
    evidenceInventory["fixtureVersion"] !== 1 ||
    evidenceInventory["outcome"] !== "pass" ||
    !isSha256(evidenceInventory["fixtureSha256"]) ||
    !isSha256(evidenceInventory["reviewedSourceManifestSha256"]) ||
    !isRecord(evidenceInventory["expectedCounts"])
  ) {
    findings.push(finding(
      "U0_EVIDENCE_INVENTORY_CLAIM",
      `${OUTPUT_PATH}#evidenceInventory`,
      "The ledger must bind the passing independently reviewed testcase, browser-cell, screenshot, and source-hash inventory.",
    ));
  }
  const expectedContract = {
    schema: record(contractFixture, "U0 contract")["schema"],
    version: record(contractFixture, "U0 contract")["contractVersion"],
    reviewedFileSha256: record(contractFixture, "U0 contract")["reviewedFileSha256"],
  };
  if (!canonicalEquals(candidate["contract"], expectedContract)) {
    findings.push(finding(
      "U0_EVIDENCE_CONTRACT_IDENTITY",
      `${OUTPUT_PATH}#contract`,
      "The evidence ledger must bind the exact reviewed U0 contract and companion hashes.",
    ));
  }
  const environment = isRecord(candidate["environment"])
    ? candidate["environment"]
    : {};
  if (
    environment["bun"] !== Bun.version ||
    environment["typescript"] !== ts.version ||
    environment["playwright"] !== PLAYWRIGHT_VERSION ||
    typeof environment["realNode"] !== "object" ||
    environment["platform"] !== platform() ||
    environment["architecture"] !== process.arch
  ) {
    findings.push(finding(
      "U0_EVIDENCE_ENVIRONMENT",
      `${OUTPUT_PATH}#environment`,
      "The evidence ledger requires the exact verifier toolchain and platform identity.",
    ));
  }
  const safeRunId = SAFE_RUN_ID.test(String(candidate["runId"]))
    ? String(candidate["runId"])
    : "invalid";
  const paths = runPaths(safeRunId);
  const validator = isRecord(candidate["validator"]) ? candidate["validator"] : {};
  if (
    !validStoredExecution(validator, {
      command: validatorCommand(),
      deadlineMs: U0_VALIDATOR_PROCESS_DEADLINE_MS,
      stdoutPath: paths.validatorStdout,
      stderrPath: paths.validatorStderr,
    }) ||
    validator["schema"] !== "changes.validation.u0-contract.v1" ||
    validator["outcome"] !== "pass" ||
    !canonicalEquals(validator["counts"], expectedValidatorCounts())
  ) {
    findings.push(finding(
      "U0_EVIDENCE_VALIDATOR_CLAIM",
      `${OUTPUT_PATH}#validator`,
      "Validator claims must identify a zero-exit exact command and the complete reviewed count matrix.",
    ));
  }
  const bun = isRecord(candidate["bun"]) ? candidate["bun"] : {};
  const bunSummary = isRecord(bun["summary"]) ? bun["summary"] : {};
  if (
    !validStoredExecution(bun, {
      command: bunCommand(safeRunId),
      deadlineMs: U0_BUN_PROCESS_DEADLINE_MS,
      stdoutPath: paths.bunStdout,
      stderrPath: paths.bunStderr,
    }) ||
    bun["junitPath"] !== paths.junit ||
    !isSha256(bun["junitSha256"]) ||
    bun["relaxedControls"] !== 0 ||
    typeof bunSummary["tests"] !== "number" ||
    bunSummary["tests"] <= 0 ||
    typeof bunSummary["assertions"] !== "number" ||
    bunSummary["assertions"] <= 0 ||
    bunSummary["failures"] !== 0 ||
    bunSummary["errors"] !== 0 ||
    bunSummary["skipped"] !== 0 ||
    !canonicalEquals(bunSummary["files"], U0_FOCUSED_BUN_TEST_FILES) ||
    !Array.isArray(bunSummary["cases"]) ||
    bunSummary["cases"].length !== bunSummary["tests"]
  ) {
    findings.push(finding(
      "U0_EVIDENCE_BUN_CLAIM",
      `${OUTPUT_PATH}#bun`,
      "Bun claims must bind the exact zero-exit command, sanitized JUnit bytes, owner inventory, and passing testcase bodies.",
    ));
  }
  const browser = isRecord(candidate["browser"]) ? candidate["browser"] : {};
  const rawCellManifest = records(browser["rawCellManifest"]);
  if (
    !validStoredExecution(browser, {
      command: browserCommand(),
      deadlineMs: U0_BROWSER_PROCESS_DEADLINE_MS,
      stdoutPath: paths.browserStdout,
      stderrPath: paths.browserStderr,
    }) ||
    browser["reportPath"] !== paths.playwright ||
    !isSha256(browser["reportSha256"]) ||
    !canonicalEquals(browser["projects"], BROWSER_PROJECTS) ||
    !canonicalEquals(browser["files"], U0_BROWSER_OWNER_FILES) ||
    typeof browser["tests"] !== "number" ||
    browser["tests"] <= 0 ||
    typeof browser["rawCells"] !== "number" ||
    browser["rawCells"] <= 0 ||
    !Array.isArray(browser["reportScreenshotManifest"]) ||
    records(browser["reportScreenshotManifest"]).length !==
      browser["reportScreenshotManifest"].length ||
    !Array.isArray(browser["rawCellManifest"]) ||
    rawCellManifest.length !== browser["rawCells"] ||
    rawCellManifest.some((artifact) =>
      typeof artifact["path"] !== "string" ||
      !artifact["path"].startsWith(`${paths.cellsDirectory}/`) ||
      typeof artifact["bytes"] !== "number" ||
      artifact["bytes"] <= 0 ||
      !isSha256(artifact["sha256"])
    )
  ) {
    findings.push(finding(
      "U0_EVIDENCE_BROWSER_CLAIM",
      `${OUTPUT_PATH}#browser`,
      "Browser claims must bind the exact zero-retry three-engine report and raw-cell manifest.",
    ));
  }
  const authorityIds = records(
    record(provenanceFixture, "provenance")["authorities"],
  ).map((authority) => authority["id"]);
  if (!canonicalEquals(candidate["authorityIds"], authorityIds)) {
    findings.push(finding(
      "U0_EVIDENCE_AUTHORITY_INVENTORY",
      `${OUTPUT_PATH}#authorityIds`,
      "Stored authority IDs must equal the reviewed provenance ledger.",
    ));
  }
  if (!canonicalEquals(candidate["galleryEvidence"], {
    reviewedCells: U0_EXPECTED_COUNTS.galleryCells,
    productionOutputUsedAsOracle: false,
    releaseArtifactExclusionOwner: "tests/static/u0-gallery-exclusion.test.ts",
  })) {
    findings.push(finding(
      "U0_EVIDENCE_GALLERY_CLAIM",
      `${OUTPUT_PATH}#galleryEvidence`,
      "Gallery evidence must preserve the reviewed count, independent oracle, and release-exclusion owner.",
    ));
  }
  if (!canonicalEquals(candidate["terminationEvidence"], {
    boundedByExactCounts: true,
    wallTimeGating: false,
    elapsedAndResourceUseRecorded: true,
    subprocessDeadlinesMs: {
      validator: U0_VALIDATOR_PROCESS_DEADLINE_MS,
      bun: U0_BUN_PROCESS_DEADLINE_MS,
      browser: U0_BROWSER_PROCESS_DEADLINE_MS,
    },
    playwrightGlobalTimeoutMs: U0_PLAYWRIGHT_GLOBAL_TIMEOUT_MS,
  })) {
    findings.push(finding(
      "U0_EVIDENCE_TERMINATION_CLAIM",
      `${OUTPUT_PATH}#terminationEvidence`,
      "Termination evidence must be count-bounded and must not use wall time as a semantic cutoff.",
    ));
  }
  const manual = isRecord(candidate["manualAccessibility"])
    ? candidate["manualAccessibility"]
    : {};
  const manualRowsSummary = records(manual["rows"]);
  if (
    manual["ledgerPath"] !== U0_MANUAL_ACCESSIBILITY_LEDGER_PATH ||
    manual["outcome"] !== "pass" ||
    !isSha256(manual["ledgerSha256"]) ||
    !isRecord(manual["artifact"]) ||
    !Array.isArray(manual["attachmentManifest"]) ||
    manual["attachmentManifest"].length === 0 ||
    JSON.stringify(manualRowsSummary.map((row) => row["id"])) !==
      JSON.stringify(U0_REQUIRED_MANUAL_ACCESSIBILITY_IDS) ||
    manualRowsSummary.some((row) => row["status"] !== "pass")
  ) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_CLAIM",
      `${OUTPUT_PATH}#manualAccessibility`,
      "A passing ledger requires the separate artifact-bound six-row operator evidence summary.",
    ));
  }
  const artifactsValue = candidate["artifacts"];
  const artifacts = records(artifactsValue);
  const artifactPaths = artifacts.map((artifact) => artifact["path"]);
  if (
    !Array.isArray(artifactsValue) ||
    artifacts.length !== artifactsValue.length ||
    artifacts.length < 10 ||
    new Set(artifactPaths).size !== artifactPaths.length ||
    artifacts.some((artifact) =>
      typeof artifact["path"] !== "string" ||
      typeof artifact["bytes"] !== "number" ||
      !Number.isSafeInteger(artifact["bytes"]) ||
      artifact["bytes"] < 0 ||
      !isSha256(artifact["sha256"])
    )
  ) {
    findings.push(finding(
      "U0_EVIDENCE_ARTIFACT_INVENTORY",
      `${OUTPUT_PATH}#artifacts`,
      "A passing ledger requires a nonempty, unique, fully identified raw artifact inventory.",
    ));
  }
  return findings;
}

async function verifyStoredArtifacts(
  candidate: JsonRecord,
  expectedArtifacts?: readonly JsonRecord[],
): Promise<readonly U0EvidenceFinding[]> {
  const findings: U0EvidenceFinding[] = [];
  const artifactsValue = candidate["artifacts"];
  const artifacts = records(artifactsValue);
  if (
    !Array.isArray(artifactsValue) ||
    artifacts.length !== artifactsValue.length ||
    artifacts.length === 0
  ) {
    findings.push(finding(
      "U0_EVIDENCE_ARTIFACT_INVENTORY",
      `${OUTPUT_PATH}#artifacts`,
      "Stored evidence must declare every raw artifact in a nonempty object array.",
    ));
  }
  const paths = artifacts.map((artifact) => artifact["path"]);
  if (new Set(paths).size !== paths.length) {
    findings.push(finding(
      "U0_EVIDENCE_ARTIFACT_DUPLICATE",
      `${OUTPUT_PATH}#artifacts`,
      "Stored evidence artifact paths must be unique.",
    ));
  }
  for (const artifact of artifacts) {
    const path = artifact["path"];
    const expectedBytes = artifact["bytes"];
    const expectedSha256 = artifact["sha256"];
    if (
      typeof path !== "string" || typeof expectedBytes !== "number" ||
      !isSha256(expectedSha256)
    ) {
      findings.push(finding(
        "U0_EVIDENCE_ARTIFACT_IDENTITY",
        String(path),
        "Stored evidence artifact requires path, bytes, and SHA-256.",
      ));
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await readRegularFileNoFollow(path);
    } catch (error) {
      findings.push(finding(
        "U0_EVIDENCE_ARTIFACT_MISSING",
        path,
        error instanceof Error ? error.message : "Stored evidence artifact is unreadable.",
      ));
      continue;
    }
    if (bytes.byteLength !== expectedBytes || sha256Bytes(bytes) !== expectedSha256) {
      findings.push(finding(
        "U0_EVIDENCE_ARTIFACT_HASH",
        path,
        "Stored evidence artifact differs from its recorded bytes or SHA-256.",
      ));
    }
  }
  if (
    expectedArtifacts !== undefined &&
    !canonicalEquals(
      [...artifacts].sort((left, right) =>
        compare(String(left["path"]), String(right["path"]))
      ),
      [...expectedArtifacts].sort((left, right) =>
        compare(String(left["path"]), String(right["path"]))
      ),
    )
  ) {
    findings.push(finding(
      "U0_EVIDENCE_ARTIFACT_INVENTORY_MISMATCH",
      `${OUTPUT_PATH}#artifacts`,
      "Stored evidence artifacts must exactly equal the independently reconstructed raw inventory.",
    ));
  }
  return findings;
}

async function readRegularFileNoFollow(
  path: string,
  containmentRoot?: string,
): Promise<Uint8Array> {
  if (containmentRoot !== undefined) {
    const rootStatus = await lstat(containmentRoot);
    if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
      throw new Error(`Evidence root is not a real directory: ${containmentRoot}`);
    }
  }
  const status = await lstat(path);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`Evidence artifact is not a regular non-symlink file: ${path}`);
  }
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const openedStatus = await handle.stat();
    if (!openedStatus.isFile()) {
      throw new Error(`Opened evidence artifact is not a regular file: ${path}`);
    }
    if (containmentRoot !== undefined) {
      const resolvedRoot = await realpath(containmentRoot);
      const resolvedPath = await realpath(path);
      const containment = relative(resolvedRoot, resolvedPath).replaceAll("\\", "/");
      if (
        containment === "" ||
        containment === ".." ||
        containment.startsWith("../")
      ) {
        throw new Error(`Evidence artifact escapes its run directory: ${path}`);
      }
    }
    return new Uint8Array(await handle.readFile());
  } finally {
    await handle.close();
  }
}

async function artifactDigest(path: string): Promise<JsonRecord> {
  const bytes = await readRegularFileNoFollow(path);
  return { path, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}

async function readRequiredStoredBytes(
  path: string,
  findings: U0EvidenceFinding[],
  containmentRoot?: string,
): Promise<Uint8Array | null> {
  try {
    return await readRegularFileNoFollow(path, containmentRoot);
  } catch (error) {
    findings.push(finding(
      "U0_EVIDENCE_RAW_ARTIFACT_MISSING",
      path,
      error instanceof Error ? error.message : "A required raw U0 evidence artifact is missing.",
    ));
    return null;
  }
}

function compareStoredExecutionToRaw(
  value: unknown,
  input: Readonly<{
    command: readonly string[];
    deadlineMs: number;
    environment: JsonRecord;
    label: string;
    stderr: Uint8Array | null;
    stderrPath: string;
    stdout: Uint8Array | null;
    stdoutPath: string;
  }>,
): readonly U0EvidenceFinding[] {
  if (!isRecord(value)) {
    return [finding(
      "U0_EVIDENCE_EXECUTION_RECONSTRUCTION",
      `${OUTPUT_PATH}#${input.label}`,
      "Stored execution record is missing.",
    )];
  }
  const exact =
    canonicalEquals(value["command"], input.command) &&
    canonicalEquals(value["environment"], input.environment) &&
    value["deadlineMs"] === input.deadlineMs &&
    value["timedOut"] === false &&
    value["stdoutPath"] === input.stdoutPath &&
    value["stderrPath"] === input.stderrPath &&
    input.stdout !== null &&
    input.stderr !== null &&
    value["stdoutSha256"] === sha256Bytes(input.stdout) &&
    value["stderrSha256"] === sha256Bytes(input.stderr) &&
    value["exitCode"] === 0 &&
    value["signal"] === null;
  return exact
    ? []
    : [finding(
      "U0_EVIDENCE_EXECUTION_RECONSTRUCTION",
      `${OUTPUT_PATH}#${input.label}`,
      "Stored execution command, environment, paths, exit state, and raw stream hashes must reconstruct exactly.",
    )];
}

async function reconstructStoredU0Evidence(
  candidate: JsonRecord,
  current: InputSnapshot,
): Promise<readonly U0EvidenceFinding[]> {
  const findings: U0EvidenceFinding[] = [];
  const runId = candidate["runId"];
  if (typeof runId !== "string" || !SAFE_RUN_ID.test(runId)) {
    return [finding(
      "U0_EVIDENCE_RUN_ID",
      `${OUTPUT_PATH}#runId`,
      "Raw evidence reconstruction requires a safe verifier-derived run ID.",
    )];
  }
  const paths = runPaths(runId);
  const evidenceInventory = await reviewedU0EvidenceInventory();
  findings.push(...evidenceInventory.findings);
  if (!canonicalEquals(candidate["evidenceInventory"], evidenceInventory.summary)) {
    findings.push(finding(
      "U0_EVIDENCE_INVENTORY_RECONSTRUCTION",
      U0_EVIDENCE_INVENTORY_PATH,
      "Stored reviewed inventory claims must equal the current independently verified fixture and source manifest.",
    ));
  }
  const runDirectoryBefore = await inspectExactRunDirectory(paths);
  findings.push(...runDirectoryBefore.findings);
  const fixedPaths = fixedRunArtifactPaths(paths);
  const bytesByPath = new Map<string, Uint8Array>();
  for (const path of fixedPaths) {
    const bytes = await readRequiredStoredBytes(path, findings, paths.directory);
    if (bytes !== null) bytesByPath.set(path, bytes);
  }
  let metadata: JsonRecord = {};
  const metadataBytes = bytesByPath.get(paths.metadata);
  if (metadataBytes !== undefined) {
    try {
      metadata = record(
        JSON.parse(new TextDecoder().decode(metadataBytes)),
        "U0 run metadata",
      );
    } catch (error) {
      findings.push(finding(
        "U0_EVIDENCE_RUN_METADATA",
        paths.metadata,
        error instanceof Error ? error.message : "Run metadata is invalid.",
      ));
    }
  }
  const metadataCommands = isRecord(metadata["commands"])
    ? metadata["commands"]
    : {};
  const metadataDeadlines = isRecord(metadata["deadlinesMs"])
    ? metadata["deadlinesMs"]
    : {};
  const metadataEnvironment = isRecord(metadata["environment"])
    ? metadata["environment"]
    : {};
  const expectedEnvironment = await runEnvironment(runId);
  if (
    metadata["schema"] !== "changes.evidence.u0.run-metadata.v1" ||
    metadata["runId"] !== runId ||
    metadata["nonce"] !== candidate["nonce"] ||
    metadata["verificationStartedAt"] !== candidate["verificationStartedAt"] ||
    metadata["manualPreflightDigest"] !== candidate["manualPreflightDigest"] ||
    metadata["inputDigest"] !== current.digest ||
    !canonicalEquals(metadataCommands["validator"], validatorCommand()) ||
    !canonicalEquals(metadataCommands["bun"], bunCommand(runId)) ||
    !canonicalEquals(metadataCommands["browser"], browserCommand()) ||
    !canonicalEquals(metadataDeadlines, {
      validator: U0_VALIDATOR_PROCESS_DEADLINE_MS,
      bun: U0_BUN_PROCESS_DEADLINE_MS,
      browser: U0_BROWSER_PROCESS_DEADLINE_MS,
      playwrightGlobal: U0_PLAYWRIGHT_GLOBAL_TIMEOUT_MS,
    }) ||
    !canonicalEquals(metadataEnvironment, expectedEnvironment)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_RUN_METADATA",
      paths.metadata,
      "Run metadata must bind this run, current inputs, exact commands, nonce, and execution environment.",
    ));
  }
  const validatorStdout = bytesByPath.get(paths.validatorStdout) ?? null;
  const validatorStderr = bytesByPath.get(paths.validatorStderr) ?? null;
  const validator = parseValidatorOutput(
    validatorStdout === null ? "" : new TextDecoder().decode(validatorStdout),
  );
  findings.push(...validator.findings);
  findings.push(...compareStoredExecutionToRaw(candidate["validator"], {
    command: validatorCommand(),
    deadlineMs: U0_VALIDATOR_PROCESS_DEADLINE_MS,
    environment: expectedEnvironment,
    label: "validator",
    stdout: validatorStdout,
    stderr: validatorStderr,
    stdoutPath: paths.validatorStdout,
    stderrPath: paths.validatorStderr,
  }));
  const candidateValidator = isRecord(candidate["validator"])
    ? candidate["validator"]
    : {};
  if (
    candidateValidator["schema"] !== validator.value?.["schema"] ||
    candidateValidator["outcome"] !== validator.value?.["outcome"] ||
    !canonicalEquals(candidateValidator["counts"], validator.value?.["counts"])
  ) {
    findings.push(finding(
      "U0_EVIDENCE_VALIDATOR_RECONSTRUCTION",
      paths.validatorStdout,
      "Stored validator claims must equal the independently parsed stdout.",
    ));
  }
  const junitBytes = bytesByPath.get(paths.junit) ?? null;
  const junitText = junitBytes === null ? "" : new TextDecoder().decode(junitBytes);
  if (junitText !== sanitizeU0JUnit(junitText)) {
    findings.push(finding(
      "U0_EVIDENCE_JUNIT_SANITIZATION",
      paths.junit,
      "Stored JUnit must already be sanitized before it enters the evidence ledger.",
    ));
  }
  const junit = inspectU0JUnit(junitText);
  findings.push(...junit.findings);
  if (evidenceInventory.inventory !== null) {
    findings.push(...compareU0BunJUnitInventory(
      evidenceInventory.inventory,
      junit.summary?.cases ?? [],
    ));
  }
  if (
    junit.summary === null ||
    junit.summary.failures !== 0 ||
    junit.summary.errors !== 0 ||
    junit.summary.skipped !== 0 ||
    !canonicalEquals(junit.summary.files, U0_FOCUSED_BUN_TEST_FILES)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_BUN_INVENTORY",
      paths.junit,
      "Reconstructed JUnit must pass the exact focused owner and verifier-self-test inventory.",
    ));
  }
  const bunStdout = bytesByPath.get(paths.bunStdout) ?? null;
  const bunStderr = bytesByPath.get(paths.bunStderr) ?? null;
  findings.push(...compareStoredExecutionToRaw(candidate["bun"], {
    command: bunCommand(runId),
    deadlineMs: U0_BUN_PROCESS_DEADLINE_MS,
    environment: expectedEnvironment,
    label: "bun",
    stdout: bunStdout,
    stderr: bunStderr,
    stdoutPath: paths.bunStdout,
    stderrPath: paths.bunStderr,
  }));
  const candidateBun = isRecord(candidate["bun"]) ? candidate["bun"] : {};
  if (
    candidateBun["junitPath"] !== paths.junit ||
    candidateBun["junitSha256"] !==
      (junitBytes === null ? null : sha256Bytes(junitBytes)) ||
    !canonicalEquals(candidateBun["summary"], junit.summary)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_BUN_RECONSTRUCTION",
      paths.junit,
      "Stored Bun summary and JUnit hash must equal the independently parsed raw file.",
    ));
  }
  let playwrightValue: unknown = null;
  const playwrightBytes = bytesByPath.get(paths.playwright) ?? null;
  if (playwrightBytes !== null) {
    try {
      playwrightValue = JSON.parse(new TextDecoder().decode(playwrightBytes));
    } catch {
      playwrightValue = null;
    }
  }
  const playwright = inspectU0PlaywrightReport(playwrightValue);
  findings.push(...playwright.findings);
  if (evidenceInventory.inventory !== null) {
    findings.push(...compareU0PlaywrightInventory(
      evidenceInventory.inventory,
      playwrightValue,
    ));
  }
  if (!canonicalEquals(playwright.files, U0_BROWSER_OWNER_FILES)) {
    findings.push(finding(
      "U0_EVIDENCE_BROWSER_INVENTORY",
      paths.playwright,
      "Reconstructed Playwright report must execute the exact reviewed browser-owner inventory.",
    ));
  }
  const persisted = await readPersistedCells(runId);
  findings.push(...persisted.findings);
  if (evidenceInventory.inventory !== null) {
    findings.push(...compareU0BrowserCellInventory(
      evidenceInventory.inventory,
      persisted.cells,
    ));
  }
  const screenshots = await verifyBrowserScreenshots(runId, persisted.cells);
  findings.push(...screenshots.findings);
  findings.push(...validateU0ReportScreenshotManifest(
    playwright.screenshots,
    screenshots.artifacts,
  ));
  findings.push(...validateU0BrowserCells({
    runId,
    attachmentCells: playwright.cells,
    persistedCells: persisted.cells,
  }));
  const browserStdout = bytesByPath.get(paths.browserStdout) ?? null;
  const browserStderr = bytesByPath.get(paths.browserStderr) ?? null;
  findings.push(...compareStoredExecutionToRaw(candidate["browser"], {
    command: browserCommand(),
    deadlineMs: U0_BROWSER_PROCESS_DEADLINE_MS,
    environment: expectedEnvironment,
    label: "browser",
    stdout: browserStdout,
    stderr: browserStderr,
    stdoutPath: paths.browserStdout,
    stderrPath: paths.browserStderr,
  }));
  const candidateBrowser = isRecord(candidate["browser"]) ? candidate["browser"] : {};
  const rawCellManifest = persisted.cells.map(({ path, bytes, sha256 }) => ({
    path,
    bytes,
    sha256,
  }));
  if (
    candidateBrowser["reportPath"] !== paths.playwright ||
    candidateBrowser["reportSha256"] !==
      (playwrightBytes === null ? null : sha256Bytes(playwrightBytes)) ||
    !canonicalEquals(candidateBrowser["projects"], BROWSER_PROJECTS) ||
    candidateBrowser["tests"] !== playwright.tests ||
    !canonicalEquals(candidateBrowser["files"], playwright.files) ||
    !canonicalEquals(candidateBrowser["browserVersions"], playwright.browserVersions) ||
    !canonicalEquals(
      candidateBrowser["reportScreenshotManifest"],
      playwright.screenshots.map(({ filename, bytes, sha256 }) => ({
        filename,
        bytes,
        sha256,
      })).sort((left, right) => compare(left.filename, right.filename)),
    ) ||
    candidateBrowser["rawCells"] !== persisted.cells.length ||
    !canonicalEquals(candidateBrowser["rawCellManifest"], rawCellManifest)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_BROWSER_RECONSTRUCTION",
      paths.playwright,
      "Stored browser claims must equal the parsed report and independently enumerated raw cells.",
    ));
  }
  const releaseArtifact = await releaseArtifactIdentity();
  const browserArtifact = browserArtifactIdentity(persisted.cells);
  if (
    releaseArtifact === null ||
    browserArtifact === null ||
    !canonicalEquals(releaseArtifact, browserArtifact)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_BROWSER_RELEASE_ARTIFACT_MISMATCH",
      "jazz_chord_progression_editor.html",
      "Reconstructed browser evidence must bind the current tracked release artifact exactly.",
    ));
  }
  const verificationStartedMs = Date.parse(String(candidate["verificationStartedAt"]));
  const manual = await readU0ManualAccessibilityEvidence(
    releaseArtifact,
    Number.isNaN(verificationStartedMs) ? 0 : verificationStartedMs,
  );
  findings.push(...manual.findings);
  if (
    candidate["manualPreflightDigest"] !== manualEvidenceSnapshotDigest(manual) ||
    !canonicalEquals(candidate["manualAccessibility"], manual.summary)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_MANUAL_RECONSTRUCTION",
      U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
      "Stored manual accessibility claims must equal the independently read operator ledger and attachments.",
    ));
  }
  const traces = buildU0TraceEvidence({
    junit: junit.summary,
    browserCells: persisted.cells,
  });
  if (
    traces.some((trace) => trace["outcome"] !== "pass") ||
    !canonicalEquals(candidate["traces"], traces)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_TRACE_RECONSTRUCTION",
      `${OUTPUT_PATH}#traces`,
      "Stored trace rows must equal the rows rebuilt from exact JUnit case names and browser cells.",
    ));
  }
  const input = isRecord(candidate["input"]) ? candidate["input"] : {};
  if (
    !canonicalEquals(input["pre"], current) ||
    !canonicalEquals(input["post"], current)
  ) {
    findings.push(finding(
      "U0_EVIDENCE_INPUT_MANIFEST",
      `${OUTPUT_PATH}#input`,
      "Stored pre/post component manifests must equal the complete current snapshot.",
    ));
  }
  const expectedArtifacts: JsonRecord[] = [];
  for (const path of fixedPaths) {
    if (bytesByPath.has(path)) expectedArtifacts.push(await artifactDigest(path));
  }
  expectedArtifacts.push(
    ...persisted.cells.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    ...screenshots.artifacts,
    ...manual.artifacts,
  );
  const runDirectoryAfter = await inspectExactRunDirectory(paths);
  findings.push(...runDirectoryAfter.findings);
  if (!canonicalEquals(runDirectoryBefore.entries, runDirectoryAfter.entries)) {
    findings.push(finding(
      "U0_EVIDENCE_RUN_DIRECTORY_CHANGED",
      paths.directory,
      "The fixed run directory inventory changed during reconstruction.",
    ));
  }
  findings.push(...await verifyStoredArtifacts(candidate, expectedArtifacts));
  return uniqueFindings(findings);
}

async function verifyU0Evidence(): Promise<JsonRecord> {
  const pre = await snapshotInputs();
  const verificationStartedAt = new Date().toISOString();
  const verificationStartedMs = Date.parse(verificationStartedAt);
  const releaseArtifact = await releaseArtifactIdentity();
  const manualPreflight = await readU0ManualAccessibilityEvidence(
    releaseArtifact,
    verificationStartedMs,
  );
  const manualPreflightDigest = manualEvidenceSnapshotDigest(manualPreflight);
  const evidenceInventory = await reviewedU0EvidenceInventory();
  const nonce = randomBytes(16).toString("hex");
  const runId = u0EvidenceDigest({
    toolVersion: TOOL_VERSION,
    inputDigest: pre.snapshot.digest,
    contractVersion: record(contractFixture, "U0 contract")["contractVersion"],
    nonce,
  }).slice(0, 32);
  const paths = runPaths(runId);
  const environment = await runEnvironment(runId);
  await mkdir(paths.directory, { recursive: true });
  await mkdir(paths.cellsDirectory, { recursive: true });
  const metadata = {
    schema: "changes.evidence.u0.run-metadata.v1",
    runId,
    nonce,
    verificationStartedAt,
    manualPreflightDigest,
    inputDigest: pre.snapshot.digest,
    commands: {
      validator: validatorCommand(),
      bun: bunCommand(runId),
      browser: browserCommand(),
    },
    deadlinesMs: {
      validator: U0_VALIDATOR_PROCESS_DEADLINE_MS,
      bun: U0_BUN_PROCESS_DEADLINE_MS,
      browser: U0_BROWSER_PROCESS_DEADLINE_MS,
      playwrightGlobal: U0_PLAYWRIGHT_GLOBAL_TIMEOUT_MS,
    },
    environment,
  };
  await atomicWrite(paths.metadata, stableU0EvidenceJson(metadata));
  const validatorRun = await runRaw(
    validatorCommand(), environment, paths.validatorStdout, paths.validatorStderr,
    U0_VALIDATOR_PROCESS_DEADLINE_MS,
  );
  const validator = parseValidatorOutput(new TextDecoder().decode(validatorRun.stdout));
  const bunRun = await runRaw(
    bunCommand(runId), environment, paths.bunStdout, paths.bunStderr,
    U0_BUN_PROCESS_DEADLINE_MS,
  );
  let junitText = "";
  const junitFile = Bun.file(paths.junit);
  if (await junitFile.exists()) {
    junitText = sanitizeU0JUnit(await junitFile.text());
    await atomicWrite(paths.junit, junitText);
  }
  const junit = inspectU0JUnit(junitText);
  const bunInventoryFindings = evidenceInventory.inventory === null
    ? []
    : compareU0BunJUnitInventory(
      evidenceInventory.inventory,
      junit.summary?.cases ?? [],
    );
  const browserRun = await runRaw(
    browserCommand(), environment, paths.browserStdout, paths.browserStderr,
    U0_BROWSER_PROCESS_DEADLINE_MS,
  );
  let playwrightValue: unknown = null;
  const playwrightFile = Bun.file(paths.playwright);
  if (await playwrightFile.exists()) {
    try {
      playwrightValue = await playwrightFile.json();
    } catch {
      playwrightValue = null;
    }
  }
  const playwright = inspectU0PlaywrightReport(playwrightValue);
  const playwrightInventoryFindings = evidenceInventory.inventory === null
    ? []
    : compareU0PlaywrightInventory(evidenceInventory.inventory, playwrightValue);
  const persisted = await readPersistedCells(runId);
  const browserCellInventoryFindings = evidenceInventory.inventory === null
    ? []
    : compareU0BrowserCellInventory(evidenceInventory.inventory, persisted.cells);
  const screenshots = await verifyBrowserScreenshots(runId, persisted.cells);
  const reportScreenshotFindings = validateU0ReportScreenshotManifest(
    playwright.screenshots,
    screenshots.artifacts,
  );
  const cellFindings = validateU0BrowserCells({
    runId,
    attachmentCells: playwright.cells,
    persistedCells: persisted.cells,
  });
  const browserArtifact = browserArtifactIdentity(persisted.cells);
  const manualPostflight = await readU0ManualAccessibilityEvidence(
    releaseArtifact,
    verificationStartedMs,
  );
  const manualPostflightDigest = manualEvidenceSnapshotDigest(manualPostflight);
  const manualAccessibility = manualPreflight;
  const post = await snapshotInputs();
  const traces = buildU0TraceEvidence({
    junit: junit.summary,
    browserCells: persisted.cells,
  });
  const structuralFindings = uniqueFindings([
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...validator.findings,
    ...evidenceInventory.findings,
    ...junit.findings,
    ...bunInventoryFindings,
    ...playwright.findings,
    ...playwrightInventoryFindings,
    ...persisted.findings,
    ...browserCellInventoryFindings,
    ...screenshots.findings,
    ...reportScreenshotFindings,
    ...cellFindings,
    ...manualAccessibility.findings,
    ...(await inspectExactRunDirectory(paths)).findings,
    ...(browserArtifact !== null && releaseArtifact !== null &&
        canonicalEquals(browserArtifact, releaseArtifact)
      ? []
      : [finding(
        "U0_EVIDENCE_BROWSER_RELEASE_ARTIFACT_MISMATCH",
        "jazz_chord_progression_editor.html",
        "Every browser evidence cell must bind the exact tracked release artifact captured before automation.",
      )]),
    ...(manualPreflightDigest === manualPostflightDigest
      ? []
      : [finding(
        manualPreflight.summary["outcome"] === "pending" &&
            manualPostflight.summary["outcome"] !== "pending"
          ? "U0_EVIDENCE_MANUAL_CREATED_DURING_AUTOMATION"
          : "U0_EVIDENCE_MANUAL_CHANGED_DURING_AUTOMATION",
        U0_MANUAL_ACCESSIBILITY_LEDGER_PATH,
        "Manual accessibility evidence must exist before automation and remain byte-identical throughout the run.",
      )]),
    ...(pre.snapshot.digest === post.snapshot.digest ? [] : [finding(
      "U0_EVIDENCE_INPUT_CHANGED",
      "input",
      "Evidence inputs changed during execution.",
    )]),
    ...(validatorRun.exitCode === 0 ? [] : [finding(
      "U0_EVIDENCE_VALIDATOR_EXIT",
      "validator",
      `Validator exited ${String(validatorRun.exitCode)}.`,
    )]),
    ...(bunRun.exitCode === 0 ? [] : [finding(
      "U0_EVIDENCE_BUN_EXIT",
      "bun",
      `Focused Bun suite exited ${String(bunRun.exitCode)}.`,
    )]),
    ...(browserRun.exitCode === 0 ? [] : [finding(
      "U0_EVIDENCE_BROWSER_EXIT",
      "browser",
      `Focused browser suite exited ${String(browserRun.exitCode)}.`,
    )]),
    ...(junit.summary !== null && junit.summary.failures === 0 &&
        junit.summary.errors === 0 && junit.summary.skipped === 0 &&
        JSON.stringify(junit.summary.files) === JSON.stringify(U0_FOCUSED_BUN_TEST_FILES)
      ? []
      : [finding(
        "U0_EVIDENCE_BUN_INVENTORY",
        "bun.junit",
        "Focused Bun suite must pass the exact owner and verifier-self-test inventory.",
      )]),
    ...(JSON.stringify(playwright.files) === JSON.stringify(U0_BROWSER_OWNER_FILES)
      ? []
      : [finding(
        "U0_EVIDENCE_BROWSER_INVENTORY",
        "browser.report.suites",
        "Playwright must execute the exact reviewed browser-owner inventory.",
      )]),
    ...traces.filter((trace) => trace["outcome"] !== "pass").map((trace) => finding(
      "U0_EVIDENCE_TRACE",
      `traces#${String(trace["id"])}`,
      "Trace lacks exact-owner case or gallery evidence.",
    )),
  ]);
  const artifacts: JsonRecord[] = [];
  for (const path of fixedRunArtifactPaths(paths)) {
    try {
      artifacts.push(await artifactDigest(path));
    } catch {
      // Exact run-directory findings above retain the missing/type failure.
    }
  }
  artifacts.push(...persisted.cells.map(({ path, bytes, sha256 }) => ({
    path,
    bytes,
    sha256,
  })));
  artifacts.push(...screenshots.artifacts);
  artifacts.push(...manualAccessibility.artifacts);
  const preliminary: JsonRecord = {
    schema: "changes.evidence.u0.v1",
    schemaVersion: 1,
    package: "U0",
    toolVersion: TOOL_VERSION,
    runId,
    nonce,
    verificationStartedAt,
    manualPreflightDigest,
    outcome: structuralFindings.length === 0 ? "pass" : "fail",
    findings: structuralFindings,
    contract: {
      schema: record(contractFixture, "U0 contract")["schema"],
      version: record(contractFixture, "U0 contract")["contractVersion"],
      reviewedFileSha256: record(contractFixture, "U0 contract")["reviewedFileSha256"],
    },
    environment: await environmentEvidence(),
    input: { pre: pre.snapshot, post: post.snapshot },
    owners: {
      exact: U0_EXACT_OWNER_FILES,
      bun: U0_BUN_OWNER_FILES,
      browser: U0_BROWSER_OWNER_FILES,
    },
    evidenceInventory: evidenceInventory.summary,
    validator: {
      ...withoutBuffers(validatorRun),
      schema: validator.value?.["schema"] ?? null,
      outcome: validator.value?.["outcome"] ?? "fail",
      counts: validator.value?.["counts"] ?? null,
    },
    bun: {
      ...withoutBuffers(bunRun),
      junitPath: paths.junit,
      junitSha256: junitText ? sha256Bytes(new TextEncoder().encode(junitText)) : null,
      summary: junit.summary,
      relaxedControls: pre.controls.length + post.controls.length,
    },
    browser: {
      ...withoutBuffers(browserRun),
      reportPath: paths.playwright,
      reportSha256: await playwrightFile.exists()
        ? sha256Bytes(new Uint8Array(await playwrightFile.arrayBuffer()))
        : null,
      projects: BROWSER_PROJECTS,
      tests: playwright.tests,
      files: playwright.files,
      browserVersions: playwright.browserVersions,
      reportScreenshotManifest: playwright.screenshots.map(
        ({ filename, bytes, sha256 }) => ({ filename, bytes, sha256 }),
      ).sort((left, right) => compare(left.filename, right.filename)),
      rawCells: persisted.cells.length,
      rawCellManifest: persisted.cells.map(({ path, bytes, sha256 }) => ({
        path,
        bytes,
        sha256,
      })),
    },
    traces,
    authorityIds: records(record(provenanceFixture, "provenance")["authorities"])
      .map((authority) => authority["id"]),
    galleryEvidence: {
      reviewedCells: U0_EXPECTED_COUNTS.galleryCells,
      productionOutputUsedAsOracle: false,
      releaseArtifactExclusionOwner: "tests/static/u0-gallery-exclusion.test.ts",
    },
    manualAccessibility: manualAccessibility.summary,
    terminationEvidence: {
      boundedByExactCounts: true,
      wallTimeGating: false,
      elapsedAndResourceUseRecorded: true,
      subprocessDeadlinesMs: {
        validator: U0_VALIDATOR_PROCESS_DEADLINE_MS,
        bun: U0_BUN_PROCESS_DEADLINE_MS,
        browser: U0_BROWSER_PROCESS_DEADLINE_MS,
      },
      playwrightGlobalTimeoutMs: U0_PLAYWRIGHT_GLOBAL_TIMEOUT_MS,
    },
    artifacts,
  };
  const candidateFindings = uniqueFindings([
    ...structuralFindings,
    ...validateU0EvidenceCandidate(
      signedLedger(preliminary),
      post.snapshot.digest,
    ),
    ...await verifyStoredArtifacts(preliminary),
  ]);
  const ledger = signedLedger({
    ...preliminary,
    outcome: candidateFindings.length === 0 ? "pass" : "fail",
    findings: candidateFindings,
  });
  await atomicWrite(OUTPUT_PATH, stableU0EvidenceJson(ledger));
  return ledger;
}

async function checkExisting(): Promise<Readonly<{
  outcome: "pass" | "fail";
  findings: readonly U0EvidenceFinding[];
}>> {
  try {
    const candidate: unknown = await Bun.file(OUTPUT_PATH).json();
    const current = await snapshotInputs();
    const findings = uniqueFindings([
      ...current.findings,
      ...current.controls,
      ...validateU0EvidenceCandidate(candidate, current.snapshot.digest),
      ...(isRecord(candidate)
        ? await reconstructStoredU0Evidence(candidate, current.snapshot)
        : []),
    ]);
    return { outcome: findings.length === 0 ? "pass" : "fail", findings };
  } catch (error) {
    return {
      outcome: "fail",
      findings: [finding(
        "U0_EVIDENCE_LEDGER_MISSING",
        OUTPUT_PATH,
        error instanceof Error ? error.message : "Evidence ledger is unreadable.",
      )],
    };
  }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
      throw new Error("Usage: bun scripts/verify-u0-evidence.ts [--check]");
    }
    if (args[0] === "--check") {
      const result = await checkExisting();
      console.log(stableU0EvidenceJson({
        schema: "changes.evidence.u0.summary.v1",
        mode: "check",
        ledgerPath: OUTPUT_PATH,
        ...result,
      }).trimEnd());
      process.exitCode = result.outcome === "pass" ? 0 : 1;
    } else {
      const ledger = await verifyU0Evidence();
      const browser = isRecord(ledger["browser"]) ? ledger["browser"] : {};
      const bun = isRecord(ledger["bun"]) ? ledger["bun"] : {};
      const bunSummary = isRecord(bun["summary"]) ? bun["summary"] : {};
      console.log(stableU0EvidenceJson({
        schema: "changes.evidence.u0.summary.v1",
        mode: "focused-package",
        ledgerPath: OUTPUT_PATH,
        outcome: ledger["outcome"],
        runId: ledger["runId"],
        bunTests: bunSummary["tests"] ?? 0,
        browserTests: browser["tests"] ?? 0,
        rawBrowserCells: browser["rawCells"] ?? 0,
        traces: Array.isArray(ledger["traces"]) ? ledger["traces"].length : 0,
        galleryCells: U0_EXPECTED_COUNTS.galleryCells,
        findings: ledger["findings"],
      }).trimEnd());
      process.exitCode = ledger["outcome"] === "pass" ? 0 : 1;
    }
  } catch (error) {
    console.error(stableU0EvidenceJson({
      schema: TOOL_VERSION,
      outcome: "tool-failure",
      message: error instanceof Error ? error.message : "U0 evidence verification failed.",
    }).trimEnd());
    process.exitCode = 2;
  }
}

export const u0EvidenceTestSupport = Object.freeze({
  browserProjects: BROWSER_PROJECTS,
  outputPath: OUTPUT_PATH,
  reconstructStoredU0Evidence,
  signedLedger,
  verifyStoredArtifacts,
});
