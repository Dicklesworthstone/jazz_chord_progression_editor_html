import { createHash } from "node:crypto";
import { mkdir, readdir, rename } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname } from "node:path";

import ts from "typescript";

import adversarialFixture from
  "../tests/fixtures/legacy-migration/adversarial-cases.json";
import contractFixture from
  "../tests/fixtures/legacy-migration/c0-legacy-migration-contract.json";
import mutationFixture from
  "../tests/fixtures/legacy-migration/mutation-controls.json";
import presetFixture from
  "../tests/fixtures/legacy-migration/preset-expectations.json";
import provenanceFixture from
  "../tests/fixtures/legacy-migration/provenance-ledger.json";
import sourceFixture from
  "../tests/fixtures/legacy-migration/legacy-presets-source.json";
import traceFixture from
  "../tests/fixtures/legacy-migration/trace-ledger.json";

type JsonRecord = Record<string, unknown>;
type Outcome = "pass" | "fail";

export type C0EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  traceId?: string;
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

type JUnitCase = Readonly<{ file: string; name: string }>;

type JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly JUnitCase[];
}>;

type ResourceUsage = Readonly<{
  measurement: "Bun.Subprocess.resourceUsage";
  maxRssRaw: number | null;
  maxRssRawUnit: "kilobytes" | "bytes" | "runtime-defined";
  maxRssBytes: number | null;
  cpuUserMicros: number | null;
  cpuSystemMicros: number | null;
  gating: false;
}>;

type RawExecution = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  stdoutPath: string;
  stderrPath: string;
  stdoutSha256: string;
  stderrSha256: string;
  exitCode: number;
  signal: string | number | null;
  elapsedMs: number;
  resourceUsage: ResourceUsage;
}>;

type RawExecutionWithBytes = RawExecution & Readonly<{
  stdout: Uint8Array;
  stderr: Uint8Array;
}>;

const TOOL_VERSION = "changes.evidence.c0-verifier.v1";
const OUTPUT_PATH = "test-results/c0-evidence.json";
const RUNS_ROOT = "test-results/c0-evidence-runs";
const VALIDATOR_SCHEMA = "changes.validation.c0-contract.v1";
const LEDGER_SCHEMA = "changes.evidence.c0.v1";

export const C0_OBSERVATION_MARKERS = Object.freeze({
  production: "C0_PRODUCTION_OBSERVATION ",
  preset: "C0_PRESET_OBSERVATION ",
  mutation: "C0_MUTATION_OBSERVATION ",
  law: "C0_LAW_OBSERVATION ",
  static: "C0_STATIC_OBSERVATION ",
} as const);

export const C0_FOCUSED_TEST_FILES = Object.freeze([
  "tests/conformance/c0-mutation-controls.test.ts",
  "tests/conformance/c0-production-conformance.test.ts",
  "tests/golden/legacy-presets.test.ts",
  "tests/integration/c0-legacy-migration.test.ts",
  "tests/property/c0-migration-laws.test.ts",
  "tests/static/c0-contract.test.ts",
  "tests/static/c0-evidence.test.ts",
  "tests/static/c0-production-policy.test.ts",
  "tests/static/dependency-boundaries.test.ts",
  "tests/static/validated-document-cast-policy.test.ts",
] as const);

export const C0_EXPECTED_COUNTS = Object.freeze({
  adversarialCases: 70,
  presetChords: 80,
  mutationControls: 30,
  traces: 18,
  authorities: 7,
  types: 39,
  flags: 6,
  reportCodes: 38,
  refusalCodes: 13,
} as const);

export const C0_REQUIRED_RESOLUTION_INPUTS = Object.freeze([
  "src/application/document-validation-contract.ts",
  "src/application/document-validation.ts",
  "src/application/index.ts",
] as const);

export const C0_APPLICABILITY = Object.freeze([
  {
    id: "migration-runtime",
    applicability: "applicable",
    owner: "C0",
    proof:
      "All 70 adversarial cases and all 80 reviewed preset chords execute against the production migration core with real T0/T1 dependencies.",
  },
  {
    id: "deterministic-replay",
    applicability: "applicable",
    owner: "C0/verify",
    proof:
      "Signed runtime observations, exact fixture records, work counters, and replay results are SHA-256 bound.",
  },
  {
    id: "semantic-publication",
    applicability: "covered:real-external-f3-publication-integration",
    owner: "C0/F3",
    proof:
      "C0 returns an unbranded candidate and makes zero publication calls; the three shipped preset candidates are accepted by the real public F3 gate when an external caller invokes it.",
  },
  {
    id: "preview-confirm-cancel-transaction",
    applicability: "deferred:application-import-workflow-not-owned-by-c0",
    owner: "E0/A0/U5",
    proof:
      "C0-APPLY-005 is retained as a downstream transaction obligation; C0 proves only candidate purity and zero application mutation.",
  },
  {
    id: "browser-audio-accessibility-storage-network",
    applicability: "not-applicable:pure-synchronous-compatibility-package",
    owner: "E0/U5/Q0/X0",
    proof:
      "C0 has no DOM, audio, persistence, network, rendered, or accessibility adapter.",
  },
  {
    id: "cancellation-resume-stale-revision-cleanup",
    applicability: "not-applicable:synchronous-bounded-value-operation",
    owner: "C0",
    proof:
      "The operation has no token, continuation, revision, timer, listener, handle, node, or object URL.",
  },
  {
    id: "wall-time",
    applicability: "observation-only:counts-are-gating",
    owner: "C0/verify",
    proof:
      "Elapsed time and process resources are recorded but never truncate or accept migration work.",
  },
] as const);

const C0_INPUT_GROUP_PATTERNS = Object.freeze({
  contracts: [
    "AGENTS.md",
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/C0_LEGACY_MIGRATION_CONTRACT.md",
    "docs/F3_PUBLICATION_CONTRACT.md",
    "docs/LEGACY_AUDIT.md",
    "docs/REBUILD_PLAN.md",
    "docs/T0_SYNTAX_CONTRACT.md",
    "docs/T1_RESOLUTION_CONTRACT.md",
  ],
  configuration: [
    "bun.lock",
    "bunfig.toml",
    "eslint.config.mjs",
    "package.json",
    "tsconfig.app.json",
    "tsconfig.base.json",
    "tsconfig.tests.json",
    "tsconfig.tools.json",
  ],
  production: [
    "src/compatibility/**/*.ts",
    "src/domain/**/*.ts",
    "src/theory/**/*.ts",
    // The conformance proof deliberately resolves F3 through the public
    // application barrel. Bind the complete barrel closure so a redirect or
    // a newly introduced module side effect cannot remain invisible while the
    // direct document-validation implementation hashes stay unchanged.
    "src/application/**/*.ts",
  ],
  authority: ["tests/fixtures/legacy-migration/*.json"],
  harness: [
    "src/test-support/c0-verification-harness.ts",
    ...C0_FOCUSED_TEST_FILES,
  ],
  tooling: [
    "scripts/foundation-io.ts",
    "scripts/validate-c0-contract.ts",
    "scripts/verify-c0-evidence.ts",
    "scripts/verify.ts",
  ],
} as const);

const GOLDEN_TESTCASE: JUnitCase = Object.freeze({
  file: "tests/golden/legacy-presets.test.ts",
  name:
    "migrates every preset deterministically and matches all 80 manual classifications",
});

const EXPECTED_PRODUCTION_TESTCASE = Object.freeze({
  file: "tests/conformance/c0-production-conformance.test.ts",
  testcase: "executes all 70 reviewed adversarial cases against production",
});

const EXPECTED_MUTATION_TESTCASE = Object.freeze({
  file: "tests/conformance/c0-mutation-controls.test.ts",
  testcase: "kills all 30 reviewed semantic counterfactuals deterministically",
});

const EXPECTED_LAW_TESTCASE = Object.freeze({
  file: "tests/property/c0-migration-laws.test.ts",
  testcase: "proves deterministic migration laws and bounded termination",
});

const EXPECTED_STATIC_TESTCASE = Object.freeze({
  file: "tests/static/c0-production-policy.test.ts",
  testcase: "keeps C0 pure, synchronous, candidate-only, and privately evidenced",
});

const MUTATION_CLASSIFICATION =
  "reviewed-contract-projection mutation; runtime production baselines where applicable";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function records(value: unknown, label: string): readonly JsonRecord[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((item, index) => record(item, `${label}[${String(index)}]`));
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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

export function stableC0EvidenceJson(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

export function c0EvidenceDigest(value: unknown): string {
  const encoded: unknown = JSON.stringify(canonical(value));
  return createHash("sha256")
    .update(typeof encoded === "string" ? encoded : "undefined")
    .digest("hex");
}

function sha256Bytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort(compare)) ===
    JSON.stringify([...expected].sort(compare));
}

function exactStrings(value: unknown, expected: readonly string[]): boolean {
  return JSON.stringify(value) === JSON.stringify(expected);
}

function finding(
  code: string,
  path: string,
  message: string,
  traceId?: string,
): C0EvidenceFinding {
  const result = { code, path, message, ...(traceId === undefined ? {} : { traceId }) };
  return Object.freeze(result);
}

function findingKey(value: C0EvidenceFinding): string {
  return [value.traceId ?? "", value.code, value.path, value.message].join("\u0000");
}

function normalizeFindings(
  values: readonly C0EvidenceFinding[],
): readonly C0EvidenceFinding[] {
  return [...new Map(values.map((value) => [findingKey(value), value])).values()]
    .sort((left, right) => compare(findingKey(left), findingKey(right)));
}

function unsignedRecord(value: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  );
}

function validSignature(value: JsonRecord): boolean {
  return isSha256(value["semanticDigest"]) &&
    value["semanticDigest"] === c0EvidenceDigest(unsignedRecord(value));
}

function sanitizeMessage(value: string): string {
  let result = value.replaceAll(process.cwd(), ".");
  const home = process.env["HOME"];
  if (home !== undefined && home.length > 0) result = result.replaceAll(home, "~");
  return result.replaceAll("\\", "/");
}

export function sanitizeC0JUnit(value: string): string {
  return value
    .replaceAll(/\s+hostname=("[^"]*"|'[^']*')/gu, "")
    .replaceAll(process.cwd(), ".")
    .replaceAll(process.env["HOME"] ?? "\u0000", "~");
}

function attribute(tag: string, name: string): string | null {
  const expression = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "u");
  const match = expression.exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}

function xmlNumber(value: string | null, label: string): number {
  if (value === null || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new TypeError(`${label} must be a nonnegative integer`);
  }
  return Number(value);
}

export function inspectC0JUnit(value: string): Readonly<{
  summary: JUnitSummary | null;
  findings: readonly C0EvidenceFinding[];
}> {
  try {
    const rootMatch = /<testsuites\b[^>]*>/u.exec(value);
    if (rootMatch === null || !value.includes("</testsuites>")) {
      throw new TypeError("JUnit testsuites root is missing or unclosed");
    }
    const root = rootMatch[0];
    const tests = xmlNumber(attribute(root, "tests"), "tests");
    const assertions = xmlNumber(attribute(root, "assertions") ?? "0", "assertions");
    const failures = xmlNumber(attribute(root, "failures") ?? "0", "failures");
    const errors = xmlNumber(attribute(root, "errors") ?? "0", "errors");
    const skipped = xmlNumber(attribute(root, "skipped") ?? "0", "skipped");
    const cases: JUnitCase[] = [];
    let observedFailures = 0;
    let observedErrors = 0;
    let observedSkipped = 0;
    const caseExpression = /<testcase\b[^>]*(?:\/>|>[\s\S]*?<\/testcase>)/gu;
    for (const match of value.matchAll(caseExpression)) {
      const body = match[0];
      const open = /^<testcase\b[^>]*>/u.exec(body)?.[0] ?? body;
      const file = attribute(open, "file");
      const name = attribute(open, "name");
      if (file === null || name === null || file.length === 0 || name.length === 0) {
        throw new TypeError("Every testcase requires file and name");
      }
      cases.push({ file: file.replace(/^\.\//u, ""), name });
      observedFailures += (body.match(/<failure\b/gu) ?? []).length;
      observedErrors += (body.match(/<error\b/gu) ?? []).length;
      observedSkipped += (body.match(/<skipped\b/gu) ?? []).length;
    }
    const identities = cases.map(({ file, name }) => `${file}\u0000${name}`);
    if (
      cases.length !== tests ||
      new Set(identities).size !== identities.length ||
      observedFailures !== failures ||
      observedErrors !== errors ||
      (observedSkipped !== skipped && (skipped === 0 || observedSkipped > skipped))
    ) {
      throw new TypeError("JUnit counts, bodies, or testcase identities disagree");
    }
    return {
      summary: {
        tests,
        assertions,
        failures,
        errors,
        skipped,
        files: sortedUnique(cases.map(({ file }) => file)),
        cases: [...cases].sort((left, right) =>
          compare(`${left.file}\u0000${left.name}`, `${right.file}\u0000${right.name}`)
        ),
      },
      findings: [],
    };
  } catch (error) {
    return {
      summary: null,
      findings: [finding(
        "C0_EVIDENCE_JUNIT_INVALID",
        "suite.junit",
        sanitizeMessage(error instanceof Error ? error.message : "Invalid JUnit"),
      )],
    };
  }
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  if (
    ts.isComputedPropertyName(name) &&
    (ts.isStringLiteral(name.expression) ||
      ts.isNoSubstitutionTemplateLiteral(name.expression))
  ) {
    return name.expression.text;
  }
  return null;
}

function callRootIdentifier(expression: ts.Expression): string | null {
  let current = expression;
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current) ||
    ts.isCallExpression(current)
  ) {
    if (ts.isCallExpression(current)) current = current.expression;
    else current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : null;
}

function calledMember(expression: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (
    ts.isElementAccessExpression(expression) &&
    (ts.isStringLiteral(expression.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(expression.argumentExpression))
  ) {
    return expression.argumentExpression.text;
  }
  return null;
}

export function inspectC0TestControls(
  path: string,
  source: string,
): readonly C0EvidenceFinding[] {
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: C0EvidenceFinding[] = [];
  const testRoots = new Set(["test", "it", "describe"]);
  const namespaces = new Set<string>();

  for (const statement of parsed.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "bun:test" ||
      statement.importClause === undefined
    ) {
      continue;
    }
    const bindings = statement.importClause.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    else {
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (imported === "test" || imported === "it" || imported === "describe") {
          testRoots.add(element.name.text);
        }
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const discover = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isIdentifier(node.initializer) &&
        testRoots.has(node.initializer.text) &&
        !testRoots.has(node.name.text)
      ) {
        testRoots.add(node.name.text);
        changed = true;
      }
      ts.forEachChild(node, discover);
    };
    discover(parsed);
  }

  const report = (
    node: ts.Node,
    code: string,
    message: string,
  ): void => {
    const position = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
    findings.push(finding(
      code,
      `${path}:${String(position.line + 1)}:${String(position.character + 1)}`,
      message,
    ));
  };

  const forbiddenMembers = new Set([
    "skip",
    "skipIf",
    "todo",
    "todoIf",
    "only",
    "failing",
  ]);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const root = callRootIdentifier(node.expression);
      const member = calledMember(node.expression);
      const isTestCall =
        (root !== null && testRoots.has(root)) ||
        (root !== null && namespaces.has(root));
      if (isTestCall && member !== null && forbiddenMembers.has(member)) {
        report(
          node.expression,
          member === "todo" || member === "todoIf"
            ? "C0_EVIDENCE_TODO"
            : "C0_EVIDENCE_QUARANTINE",
          `Focused C0 evidence forbids ${member} test controls.`,
        );
      }
      if (
        ts.isIdentifier(node.expression) &&
        /^(?:xit|xdescribe|xtest)$/u.test(node.expression.text)
      ) {
        report(
          node.expression,
          "C0_EVIDENCE_QUARANTINE",
          "Focused C0 evidence forbids x-prefixed disabled tests.",
        );
      }
      if (
        ts.isIdentifier(node.expression) &&
        /^(?:quarantine|quarantined)$/u.test(node.expression.text)
      ) {
        report(
          node.expression,
          "C0_EVIDENCE_QUARANTINE",
          "Focused C0 evidence forbids quarantine helpers.",
        );
      }
      if (isTestCall) {
        for (const argument of node.arguments) {
          if (!ts.isObjectLiteralExpression(argument)) continue;
          for (const property of argument.properties) {
            if (
              (ts.isPropertyAssignment(property) ||
                ts.isShorthandPropertyAssignment(property) ||
                ts.isMethodDeclaration(property)) &&
              propertyNameText(property.name) === "retry"
            ) {
              report(
                property,
                "C0_EVIDENCE_RETRY",
                "Per-test retry configuration is forbidden.",
              );
            }
            if (ts.isSpreadAssignment(property)) {
              report(
                property,
                "C0_EVIDENCE_RETRY",
                "Spread test options are forbidden because retry policy cannot be audited.",
              );
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return normalizeFindings(findings);
}

type ParsedObservations = Readonly<{
  production: JsonRecord | null;
  preset: JsonRecord | null;
  mutation: JsonRecord | null;
  law: JsonRecord | null;
  static: JsonRecord | null;
  findings: readonly C0EvidenceFinding[];
}>;

function parseMarkedRecords(
  output: string,
  marker: string,
): readonly unknown[] {
  return output
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(marker))
    .map((line) => {
      try {
        const parsed: unknown = JSON.parse(line.slice(marker.length));
        return parsed;
      } catch {
        return null;
      }
    });
}

export function parseC0Observations(output: string): ParsedObservations {
  const findings: C0EvidenceFinding[] = [];
  const result: Record<keyof typeof C0_OBSERVATION_MARKERS, JsonRecord | null> = {
    production: null,
    preset: null,
    mutation: null,
    law: null,
    static: null,
  };
  for (const [kind, marker] of Object.entries(C0_OBSERVATION_MARKERS) as Array<
    [keyof typeof C0_OBSERVATION_MARKERS, string]
  >) {
    const values = parseMarkedRecords(output, marker);
    if (values.length !== 1 || !isRecord(values[0])) {
      findings.push(finding(
        "C0_EVIDENCE_OBSERVATION_INVENTORY",
        `observations.${kind}`,
        `Expected exactly one valid ${kind} observation marker.`,
      ));
      continue;
    }
    result[kind] = values[0];
  }
  const recordsValue = Object.values(result).filter(
    (value): value is JsonRecord => value !== null,
  );
  findings.push(...validateC0ObservationRecords(recordsValue));
  return { ...result, findings: normalizeFindings(findings) };
}

function fixtureIds(
  value: { readonly cases: readonly { readonly id: string }[] },
): readonly string[] {
  return value.cases.map(({ id }) => id);
}

function expectedAdversarialIds(): readonly string[] {
  return fixtureIds(adversarialFixture);
}

const PRESET_EXPECTATION_CATEGORIES = Object.freeze([
  "directNameParsedManual",
  "rootTypeFallbackParsedManual",
  "directNameSpellingConflict",
  "directNameSoundingConflict",
  "rootTypeFallbackConflict",
  "noParseableSymbol",
] as const);

function presetAuthority(): Readonly<{
  chordIds: readonly string[];
  sourceRowHashes: Readonly<Record<string, string>>;
  expectationRowHashes: Readonly<Record<string, string>>;
}> {
  const chordIds: string[] = [];
  const sourceRowHashes: Record<string, string> = {};
  for (const [presetIndex, preset] of records(sourceFixture.presets, "source presets").entries()) {
    const presetId = preset["legacyPresetId"];
    if (typeof presetId !== "string") {
      throw new TypeError(`source preset ${String(presetIndex)} lacks an ID`);
    }
    for (const [sectionIndex, section] of records(
      preset["sections"],
      `${presetId}.sections`,
    ).entries()) {
      for (const [chordIndex, chord] of records(
        section["chords"],
        `${presetId}.sections[${String(sectionIndex)}].chords`,
      ).entries()) {
        const id = `${presetId}:${String(sectionIndex)}:${String(chordIndex)}`;
        chordIds.push(id);
        sourceRowHashes[id] = c0EvidenceDigest(chord);
      }
    }
  }
  const expectationRowHashes: Record<string, string> = {};
  const presetRecord = record(presetFixture, "preset fixture");
  for (const category of PRESET_EXPECTATION_CATEGORIES) {
    for (const row of records(presetRecord[category], `preset.${category}`)) {
      const id = row["id"];
      if (typeof id !== "string" || expectationRowHashes[id] !== undefined) {
        throw new TypeError(`Invalid or duplicate preset expectation ID in ${category}`);
      }
      expectationRowHashes[id] = c0EvidenceDigest(row);
    }
  }
  return Object.freeze({ chordIds, sourceRowHashes, expectationRowHashes });
}

function expectedControlIds(): readonly string[] {
  return mutationFixture.controls.map(({ id }) => id);
}

function expectedLinkedCaseIds(): readonly string[] {
  return sortedUnique(
    mutationFixture.controls.map(({ linkedCaseId }) => linkedCaseId),
  );
}

function expectedWorkCounterNames(): readonly string[] {
  return contractFixture.work.counterNames;
}

function validProducer(
  value: unknown,
  expected: Readonly<{ file: string; testcase: string }>,
): boolean {
  return isRecord(value) &&
    exactKeys(value, ["file", "testcase"]) &&
    value["file"] === expected.file &&
    value["testcase"] === expected.testcase;
}

function validateHashMap(
  value: unknown,
  expectedIds: readonly string[],
): boolean {
  if (!isRecord(value) || !exactKeys(value, expectedIds)) return false;
  return expectedIds.every((id) => isSha256(value[id]));
}

function isSortedUniqueStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string") &&
    exactStrings(value, sortedUnique(value));
}

function validateProductionObservation(
  value: JsonRecord,
): readonly C0EvidenceFinding[] {
  const expectedIds = expectedAdversarialIds();
  const findings: C0EvidenceFinding[] = [];
  if (!exactKeys(value, [
    "caseHashes",
    "caseIds",
    "casesObserved",
    "deterministicReplays",
    "externalF3Accepted",
    "externalF3PublicationCalls",
    "inputMutations",
    "privateExecutions",
    "privateTextLeaks",
    "producer",
    "publicationCalls",
    "publicExecutions",
    "retainedCallerContainers",
    "schema",
    "semanticDigest",
    "status",
    "validatedBrandReturned",
  ])) {
    findings.push(finding(
      "C0_EVIDENCE_PRODUCTION_SHAPE",
      "observations.production",
      "Production observation fields differ from the reviewed evidence schema.",
    ));
  }
  if (
    value["schema"] !==
      "changes.evidence.c0-production-conformance-observation.v1" ||
    !validProducer(value["producer"], EXPECTED_PRODUCTION_TESTCASE) ||
    !exactStrings(value["caseIds"], expectedIds) ||
    value["casesObserved"] !== C0_EXPECTED_COUNTS.adversarialCases ||
    !validateHashMap(value["caseHashes"], expectedIds) ||
    !isNonnegativeInteger(value["publicExecutions"]) ||
    value["publicExecutions"] === 0 ||
    !isNonnegativeInteger(value["privateExecutions"]) ||
    value["privateExecutions"] === 0 ||
    !isNonnegativeInteger(value["deterministicReplays"]) ||
    value["deterministicReplays"] === 0 ||
    value["publicationCalls"] !== 0 ||
    value["externalF3PublicationCalls"] !== 3 ||
    value["externalF3Accepted"] !== 3 ||
    value["validatedBrandReturned"] !== false ||
    value["inputMutations"] !== 0 ||
    value["retainedCallerContainers"] !== 0 ||
    value["privateTextLeaks"] !== 0 ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "C0_EVIDENCE_PRODUCTION_INVENTORY",
      "observations.production",
      "All 70 cases, fresh public/private execution, replay, ownership, and privacy evidence are required.",
    ));
  }
  if (!validSignature(value)) {
    findings.push(finding(
      "C0_EVIDENCE_OBSERVATION_DIGEST",
      "observations.production.semanticDigest",
      "Production observation signature is missing or stale.",
    ));
  }
  return findings;
}

function validatePresetObservation(
  value: JsonRecord,
): readonly C0EvidenceFinding[] {
  const authority = presetAuthority();
  const findings: C0EvidenceFinding[] = [];
  if (!exactKeys(value, [
    "chordIds",
    "chordsObserved",
    "customManual",
    "deterministicReplays",
    "expectationRowHashes",
    "parsedManual",
    "presetsObserved",
    "producer",
    "replayHashes",
    "resultHashes",
    "schema",
    "sectionsObserved",
    "semanticDigest",
    "sourceMutations",
    "sourceRowHashes",
    "status",
  ])) {
    findings.push(finding(
      "C0_EVIDENCE_PRESET_SHAPE",
      "observations.preset",
      "Preset observation fields differ from the reviewed evidence schema.",
    ));
  }
  const resultHashes = isRecord(value["resultHashes"])
    ? value["resultHashes"]
    : {};
  const replayHashes = isRecord(value["replayHashes"])
    ? value["replayHashes"]
    : {};
  const exactFixtureHashes =
    isRecord(value["sourceRowHashes"]) &&
    isRecord(value["expectationRowHashes"]) &&
    c0EvidenceDigest(value["sourceRowHashes"]) ===
      c0EvidenceDigest(authority.sourceRowHashes) &&
    c0EvidenceDigest(value["expectationRowHashes"]) ===
      c0EvidenceDigest(authority.expectationRowHashes);
  const replayExact = authority.chordIds.every(
    (id) => resultHashes[id] === replayHashes[id] && isSha256(resultHashes[id]),
  );
  if (
    value["schema"] !== "changes.evidence.c0-preset-conformance-observation.v1" ||
    !validProducer(value["producer"], {
      file: GOLDEN_TESTCASE.file,
      testcase: GOLDEN_TESTCASE.name,
    }) ||
    !exactStrings(value["chordIds"], authority.chordIds) ||
    !validateHashMap(value["sourceRowHashes"], authority.chordIds) ||
    !validateHashMap(value["expectationRowHashes"], authority.chordIds) ||
    !validateHashMap(resultHashes, authority.chordIds) ||
    !validateHashMap(replayHashes, authority.chordIds) ||
    !exactFixtureHashes ||
    !replayExact ||
    value["chordsObserved"] !== C0_EXPECTED_COUNTS.presetChords ||
    value["presetsObserved"] !== 3 ||
    value["sectionsObserved"] !== 6 ||
    value["parsedManual"] !== 35 ||
    value["customManual"] !== 45 ||
    value["deterministicReplays"] !== 3 ||
    value["sourceMutations"] !== 0 ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "C0_EVIDENCE_PRESET_INVENTORY",
      "observations.preset",
      "All 80 source, expectation, result, and replay rows must be exact and independently hash-bound.",
    ));
  }
  if (!validSignature(value)) {
    findings.push(finding(
      "C0_EVIDENCE_OBSERVATION_DIGEST",
      "observations.preset.semanticDigest",
      "Preset observation signature is missing or stale.",
    ));
  }
  return findings;
}

function validateMutationObservation(
  value: JsonRecord,
): readonly C0EvidenceFinding[] {
  const controlIds = expectedControlIds();
  const linkedIds = expectedLinkedCaseIds();
  const findings: C0EvidenceFinding[] = [];
  if (!exactKeys(value, [
    "classification",
    "controlExecutionDigests",
    "controlIds",
    "counterfactualExecutions",
    "linkedCaseIds",
    "producer",
    "schema",
    "semanticDigest",
    "semanticOperatorsExecuted",
    "semanticOperatorsKilled",
    "semanticOperatorsSurvived",
    "sourceMutantsExecuted",
    "sourceMutantsKilled",
    "status",
  ])) {
    findings.push(finding(
      "C0_EVIDENCE_MUTATION_SHAPE",
      "observations.mutation",
      "Mutation observation fields differ from the reviewed evidence schema.",
    ));
  }
  const executions = Array.isArray(value["counterfactualExecutions"])
    ? value["counterfactualExecutions"]
    : [];
  const executionValid = executions.length === controlIds.length &&
    executions.every((item, index) => {
      if (!isRecord(item)) return false;
      const expected = mutationFixture.controls[index];
      return expected !== undefined &&
        exactKeys(item, [
          "afterSha256",
          "beforeSha256",
          "controlId",
          "killed",
          "linkedCaseId",
        ]) &&
        item["controlId"] === expected.id &&
        item["linkedCaseId"] === expected.linkedCaseId &&
        isSha256(item["beforeSha256"]) &&
        isSha256(item["afterSha256"]) &&
        item["beforeSha256"] !== item["afterSha256"] &&
        item["killed"] === true;
    });
  if (
    value["schema"] !==
      "changes.evidence.c0-mutation-conformance-observation.v1" ||
    !validProducer(value["producer"], EXPECTED_MUTATION_TESTCASE) ||
    value["classification"] !== MUTATION_CLASSIFICATION ||
    !exactStrings(value["controlIds"], controlIds) ||
    !exactStrings(value["linkedCaseIds"], linkedIds) ||
    value["semanticOperatorsExecuted"] !== C0_EXPECTED_COUNTS.mutationControls ||
    value["semanticOperatorsKilled"] !== C0_EXPECTED_COUNTS.mutationControls ||
    value["semanticOperatorsSurvived"] !== 0 ||
    value["sourceMutantsExecuted"] !== 0 ||
    value["sourceMutantsKilled"] !== 0 ||
    !validateHashMap(value["controlExecutionDigests"], controlIds) ||
    !executionValid ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "C0_EVIDENCE_MUTATION_INVENTORY",
      "observations.mutation",
      "All 30 reviewed counterfactual projections must be killed without claiming source-mutant execution.",
    ));
  }
  if (!validSignature(value)) {
    findings.push(finding(
      "C0_EVIDENCE_OBSERVATION_DIGEST",
      "observations.mutation.semanticDigest",
      "Mutation observation signature is missing or stale.",
    ));
  }
  return findings;
}

function validateLawObservation(
  value: JsonRecord,
): readonly C0EvidenceFinding[] {
  const findings: C0EvidenceFinding[] = [];
  if (!exactKeys(value, [
    "boundaryPairs",
    "deterministicReplays",
    "inputMutations",
    "lawHashes",
    "lawIds",
    "lawsObserved",
    "producer",
    "schema",
    "semanticDigest",
    "status",
    "terminalStates",
    "wallTimeGating",
    "workCounterNames",
  ])) {
    findings.push(finding(
      "C0_EVIDENCE_LAW_SHAPE",
      "observations.law",
      "Law observation fields differ from the reviewed evidence schema.",
    ));
  }
  const lawIds = isSortedUniqueStrings(value["lawIds"])
    ? value["lawIds"]
    : [];
  if (
    value["schema"] !== "changes.evidence.c0-migration-law-observation.v1" ||
    !validProducer(value["producer"], EXPECTED_LAW_TESTCASE) ||
    lawIds.length === 0 ||
    value["lawsObserved"] !== lawIds.length ||
    !validateHashMap(value["lawHashes"], lawIds) ||
    !isNonnegativeInteger(value["deterministicReplays"]) ||
    value["deterministicReplays"] === 0 ||
    !exactStrings(value["terminalStates"], [
      "complete-candidate",
      "complete-refusal",
    ]) ||
    !exactStrings(value["workCounterNames"], expectedWorkCounterNames()) ||
    !isNonnegativeInteger(value["boundaryPairs"]) ||
    value["boundaryPairs"] === 0 ||
    value["wallTimeGating"] !== false ||
    value["inputMutations"] !== 0 ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "C0_EVIDENCE_LAW_INVENTORY",
      "observations.law",
      "Deterministic laws, both terminal states, all counters, boundary pairs, and no wall-time gating are required.",
    ));
  }
  if (!validSignature(value)) {
    findings.push(finding(
      "C0_EVIDENCE_OBSERVATION_DIGEST",
      "observations.law.semanticDigest",
      "Law observation signature is missing or stale.",
    ));
  }
  return findings;
}

function validateStaticObservation(
  value: JsonRecord,
): readonly C0EvidenceFinding[] {
  const findings: C0EvidenceFinding[] = [];
  if (!exactKeys(value, [
    "allowedImports",
    "asyncOrGeneratorFunctions",
    "fixtureOrTestImports",
    "forbiddenProjectImports",
    "forbiddenRuntimeReferences",
    "implementationExports",
    "moduleMutableBindings",
    "privateEvidenceReexported",
    "producer",
    "productionCasts",
    "productionFiles",
    "publicExports",
    "schema",
    "semanticDigest",
    "status",
    "validatedDocumentMentions",
  ])) {
    findings.push(finding(
      "C0_EVIDENCE_STATIC_SHAPE",
      "observations.static",
      "Static observation fields differ from the reviewed evidence schema.",
    ));
  }
  const productionFiles = isSortedUniqueStrings(value["productionFiles"])
    ? value["productionFiles"]
    : [];
  const imports = isSortedUniqueStrings(value["allowedImports"])
    ? value["allowedImports"]
    : [];
  const implementationExports = isSortedUniqueStrings(value["implementationExports"])
    ? value["implementationExports"]
    : [];
  const publicExports = isSortedUniqueStrings(value["publicExports"])
    ? value["publicExports"]
    : [];
  if (
    value["schema"] !== "changes.evidence.c0-static-boundary-observation.v1" ||
    !validProducer(value["producer"], EXPECTED_STATIC_TESTCASE) ||
    productionFiles.length < 2 ||
    imports.length === 0 ||
    implementationExports.length === 0 ||
    publicExports.length === 0 ||
    !publicExports.includes("migrateLegacyJson") ||
    !publicExports.includes("legacyMigrationOperations") ||
    publicExports.includes("migrateLegacyJsonWithEvidence") ||
    !implementationExports.includes("migrateLegacyJsonWithEvidence") ||
    value["privateEvidenceReexported"] !== false ||
    value["validatedDocumentMentions"] !== 0 ||
    value["productionCasts"] !== 0 ||
    value["moduleMutableBindings"] !== 0 ||
    value["asyncOrGeneratorFunctions"] !== 0 ||
    !exactStrings(value["forbiddenRuntimeReferences"], []) ||
    !exactStrings(value["forbiddenProjectImports"], []) ||
    !exactStrings(value["fixtureOrTestImports"], []) ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "C0_EVIDENCE_STATIC_POLICY",
      "observations.static",
      "C0 must remain pure, synchronous, candidate-only, and keep its evidence seam private.",
    ));
  }
  if (!validSignature(value)) {
    findings.push(finding(
      "C0_EVIDENCE_OBSERVATION_DIGEST",
      "observations.static.semanticDigest",
      "Static observation signature is missing or stale.",
    ));
  }
  return findings;
}

export function validateC0ObservationRecords(
  values: readonly JsonRecord[],
): readonly C0EvidenceFinding[] {
  const findings: C0EvidenceFinding[] = [];
  const bySchema = new Map<string, JsonRecord>();
  for (const value of values) {
    const schema = value["schema"];
    if (typeof schema !== "string" || bySchema.has(schema)) {
      findings.push(finding(
        "C0_EVIDENCE_OBSERVATION_INVENTORY",
        "observations",
        "Observation schemas must be present and unique.",
      ));
      continue;
    }
    bySchema.set(schema, value);
  }
  const required = [
    [
      "changes.evidence.c0-production-conformance-observation.v1",
      validateProductionObservation,
    ],
    [
      "changes.evidence.c0-preset-conformance-observation.v1",
      validatePresetObservation,
    ],
    [
      "changes.evidence.c0-mutation-conformance-observation.v1",
      validateMutationObservation,
    ],
    ["changes.evidence.c0-migration-law-observation.v1", validateLawObservation],
    [
      "changes.evidence.c0-static-boundary-observation.v1",
      validateStaticObservation,
    ],
  ] as const;
  for (const [schema, validate] of required) {
    const value = bySchema.get(schema);
    if (value === undefined) {
      findings.push(finding(
        "C0_EVIDENCE_OBSERVATION_INVENTORY",
        `observations.${schema}`,
        "Required signed observation is missing.",
      ));
    } else {
      findings.push(...validate(value));
    }
  }
  if (bySchema.size !== required.length) {
    findings.push(finding(
      "C0_EVIDENCE_OBSERVATION_INVENTORY",
      "observations",
      "Exactly four reviewed C0 observation schemas are permitted.",
    ));
  }
  return normalizeFindings(findings);
}

function caseIdentityKey(value: JUnitCase): string {
  return `${value.file}\u0000${value.name}`;
}

function summaryHasCase(summary: JUnitSummary | null, expected: JUnitCase): boolean {
  if (summary === null) return false;
  const key = caseIdentityKey(expected);
  return summary.cases.some((item) => caseIdentityKey(item) === key);
}

export function buildC0PresetProof(
  presetObservation: JsonRecord | null,
  summary: JUnitSummary | null,
): JsonRecord {
  const authority = presetAuthority();
  const sourceHashes = presetObservation !== null &&
      isRecord(presetObservation["sourceRowHashes"])
    ? presetObservation["sourceRowHashes"]
    : {};
  const expectationHashes = presetObservation !== null &&
      isRecord(presetObservation["expectationRowHashes"])
    ? presetObservation["expectationRowHashes"]
    : {};
  const resultHashes = presetObservation !== null &&
      isRecord(presetObservation["resultHashes"])
    ? presetObservation["resultHashes"]
    : {};
  const replayHashes = presetObservation !== null &&
      isRecord(presetObservation["replayHashes"])
    ? presetObservation["replayHashes"]
    : {};
  const rows = authority.chordIds.map((id) => ({
    caseId: id,
    sourceRecordSha256: sourceHashes[id] ?? "unavailable",
    expectationRecordSha256: expectationHashes[id] ?? "unavailable",
    resultSha256: resultHashes[id] ?? "unavailable",
    replaySha256: replayHashes[id] ?? "unavailable",
  }));
  const testcaseObserved = summaryHasCase(summary, GOLDEN_TESTCASE);
  const rowsValid = rows.every((row) =>
    isSha256(row.sourceRecordSha256) &&
    isSha256(row.expectationRecordSha256) &&
    isSha256(row.resultSha256) &&
    row.resultSha256 === row.replaySha256
  );
  const preimage = {
    schema: "changes.evidence.c0-preset-proof.v1",
    testcase: GOLDEN_TESTCASE,
    testcaseObserved,
    rows,
    counts: {
      presets: 3,
      sections: 6,
      chords: C0_EXPECTED_COUNTS.presetChords,
      parsedManual: 35,
      customManual: 45,
    },
    outcome: testcaseObserved && rowsValid ? "pass" : "fail",
  };
  return { ...preimage, proofSha256: c0EvidenceDigest(preimage) };
}

function authorityEvidence(): readonly JsonRecord[] {
  return provenanceFixture.authorities.map((authority) => ({
    authorityId: authority.id,
    recordSha256: c0EvidenceDigest(authority),
  }));
}

function adversarialRecordHashes(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    adversarialFixture.cases.map((item) => [item.id, c0EvidenceDigest(item)]),
  );
}

function presetFixtureRecordHashes(): Readonly<Record<string, string>> {
  const authority = presetAuthority();
  return Object.fromEntries(authority.chordIds.map((id) => [
    id,
    c0EvidenceDigest({
      sourceRecordSha256: authority.sourceRowHashes[id],
      expectationRecordSha256: authority.expectationRowHashes[id],
    }),
  ]));
}

function controlsForTrace(trace: {
  readonly id: string;
  readonly authorityIds: readonly string[];
  readonly fixtureIds: readonly string[];
}): readonly string[] {
  const presetIds = new Set(presetAuthority().chordIds);
  const allPresets = trace.fixtureIds.includes("preset-expectations:all-80");
  return mutationFixture.controls
    .filter(({ linkedCaseId }) =>
      trace.fixtureIds.includes(linkedCaseId) ||
      trace.authorityIds.includes(linkedCaseId) ||
      trace.id === linkedCaseId ||
      (allPresets && presetIds.has(linkedCaseId))
    )
    .map(({ id }) => id);
}

export function buildC0TraceEvidence(
  observations: Readonly<{
    production: JsonRecord | null;
    preset: JsonRecord | null;
    mutation: JsonRecord | null;
  }>,
  summary: JUnitSummary | null,
): readonly JsonRecord[] {
  const productionHashes = observations.production !== null &&
      isRecord(observations.production["caseHashes"])
    ? observations.production["caseHashes"]
    : {};
  const presetResults = observations.preset !== null &&
      isRecord(observations.preset["resultHashes"])
    ? observations.preset["resultHashes"]
    : {};
  const mutationHashes = observations.mutation !== null &&
      isRecord(observations.mutation["controlExecutionDigests"])
    ? observations.mutation["controlExecutionDigests"]
    : {};
  const authorityRows = authorityEvidence();
  const authorityById = new Map(
    authorityRows.map((row) => [String(row["authorityId"]), row]),
  );
  const adversarialHashes = adversarialRecordHashes();
  const presetFixtureHashes = presetFixtureRecordHashes();
  const presetIds = presetAuthority().chordIds;
  const expectedCases = [
    {
      file: EXPECTED_PRODUCTION_TESTCASE.file,
      name: EXPECTED_PRODUCTION_TESTCASE.testcase,
    },
    GOLDEN_TESTCASE,
    {
      file: EXPECTED_MUTATION_TESTCASE.file,
      name: EXPECTED_MUTATION_TESTCASE.testcase,
    },
  ];

  return traceFixture.traces.map((trace) => {
    const expandedCaseIds = trace.fixtureIds.flatMap((fixtureId) =>
      fixtureId === "preset-expectations:all-80" ? presetIds : [fixtureId]
    );
    const caseEvidence = expandedCaseIds.map((caseId) => {
      const preset = presetFixtureHashes[caseId] !== undefined;
      return {
        caseId,
        channel: preset ? "preset-golden" : "adversarial-production",
        fixtureRecordSha256: preset
          ? presetFixtureHashes[caseId]
          : adversarialHashes[caseId] ?? "unavailable",
        runtimeObservationSha256: preset
          ? presetResults[caseId] ?? "unavailable"
          : productionHashes[caseId] ?? "unavailable",
      };
    });
    const requiredAuthorityEvidence = trace.authorityIds.map((id) =>
      authorityById.get(id) ?? {
        authorityId: id,
        recordSha256: "unavailable",
      }
    );
    const mutationControlIds = controlsForTrace(trace);
    const mutationEvidence = mutationControlIds.map((controlId) => ({
      controlId,
      executionSha256: mutationHashes[controlId] ?? "unavailable",
    }));
    const observedTests = expectedCases.filter((item) => summaryHasCase(summary, item));
    const complete =
      caseEvidence.length > 0 &&
      caseEvidence.every((row) =>
        isSha256(row.fixtureRecordSha256) &&
        isSha256(row.runtimeObservationSha256)
      ) &&
      requiredAuthorityEvidence.length === trace.authorityIds.length &&
      requiredAuthorityEvidence.every((row) => isSha256(row["recordSha256"])) &&
      mutationEvidence.every((row) => isSha256(row.executionSha256)) &&
      observedTests.some(({ file }) =>
        file === "tests/conformance/c0-production-conformance.test.ts" ||
        file === "tests/golden/legacy-presets.test.ts"
      );
    const preimage = {
      traceId: trace.id,
      requirement: trace.requirement,
      authorityIds: trace.authorityIds,
      authorityEvidence: requiredAuthorityEvidence,
      fixtureIds: trace.fixtureIds,
      caseEvidence,
      mutationControlIds,
      mutationEvidence,
      observedTests,
      evidencePaths: sortedUnique([
        "docs/C0_LEGACY_MIGRATION_CONTRACT.md",
        "tests/conformance/c0-mutation-controls.test.ts",
        "tests/conformance/c0-production-conformance.test.ts",
        "tests/fixtures/legacy-migration/trace-ledger.json",
        "tests/golden/legacy-presets.test.ts",
      ]),
      outcome: complete ? "pass" : "fail",
    };
    return { ...preimage, traceProofSha256: c0EvidenceDigest(preimage) };
  });
}

type SnapshotResult = Readonly<{
  snapshot: InputSnapshot;
  findings: readonly C0EvidenceFinding[];
  controls: readonly C0EvidenceFinding[];
}>;

function hasGlobMagic(value: string): boolean {
  return /[*?{[]/u.test(value);
}

async function expandPattern(pattern: string): Promise<readonly string[]> {
  if (!hasGlobMagic(pattern)) return [pattern];
  const matches: string[] = [];
  const glob = new Bun.Glob(pattern);
  for await (const path of glob.scan({
    cwd: process.cwd(),
    dot: true,
    onlyFiles: true,
  })) {
    matches.push(path.replaceAll("\\", "/"));
  }
  return sortedUnique(matches);
}

async function snapshotInputs(): Promise<SnapshotResult> {
  const findings: C0EvidenceFinding[] = [];
  const controls: C0EvidenceFinding[] = [];
  const groups = new Map<string, string>();
  for (const [group, patterns] of Object.entries(C0_INPUT_GROUP_PATTERNS)) {
    for (const pattern of patterns) {
      const expanded = await expandPattern(pattern);
      if (expanded.length === 0) {
        findings.push(finding(
          "C0_EVIDENCE_INPUT_PATTERN_EMPTY",
          pattern,
          `Required ${group} input pattern matched no files.`,
        ));
      }
      for (const path of expanded) {
        const previous = groups.get(path);
        if (previous !== undefined && previous !== group) {
          findings.push(finding(
            "C0_EVIDENCE_INPUT_DUPLICATE",
            path,
            `Input appears in both ${previous} and ${group}.`,
          ));
        } else {
          groups.set(path, group);
        }
      }
    }
  }
  const components: InputComponent[] = [];
  for (const [path, group] of [...groups].sort(([left], [right]) =>
    compare(left, right)
  )) {
    const file = Bun.file(path);
    if (!await file.exists()) {
      findings.push(finding(
        "C0_EVIDENCE_INPUT_MISSING",
        path,
        `Required ${group} input is missing.`,
      ));
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    components.push({
      group,
      path,
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    });
    const source = new TextDecoder().decode(bytes);
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) {
      controls.push(...inspectC0TestControls(path, source));
    }
    if (path === "bunfig.toml") {
      const retries = [...source.matchAll(
        /^\s*retry\s*=\s*([^#\r\n]+?)\s*(?:#.*)?$/gmu,
      )].map((match) => match[1]?.trim());
      if (retries.length !== 1 || retries[0] !== "0") {
        controls.push(finding(
          "C0_EVIDENCE_RETRY",
          "bunfig.toml:[test].retry",
          "Focused C0 evidence requires exactly one retry = 0 setting.",
        ));
      }
    }
  }
  return {
    snapshot: {
      algorithm: "sha256-component-manifest-v1",
      digest: c0EvidenceDigest(components),
      components,
    },
    findings: normalizeFindings(findings),
    controls: normalizeFindings(controls),
  };
}

function runPaths(runId: string): Readonly<{
  directory: string;
  validatorStdout: string;
  validatorStderr: string;
  suiteStdout: string;
  suiteStderr: string;
  junit: string;
  metadata: string;
}> {
  const directory = `${RUNS_ROOT}/${runId}`;
  return {
    directory,
    validatorStdout: `${directory}/contract-validator.stdout.json`,
    validatorStderr: `${directory}/contract-validator.stderr.txt`,
    suiteStdout: `${directory}/focused-tests.stdout.txt`,
    suiteStderr: `${directory}/focused-tests.stderr.txt`,
    junit: `${directory}/focused-tests.junit.xml`,
    metadata: `${directory}/run-metadata.json`,
  };
}

function runEnvironment(runId: string): Readonly<Record<string, string>> {
  return Object.freeze({
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    C0_EVIDENCE_RUN_ID: runId,
  });
}

function validatorCommand(): readonly string[] {
  return ["bun", "scripts/validate-c0-contract.ts"];
}

function suiteCommand(runId: string): readonly string[] {
  return [
    "bun",
    "test",
    ...C0_FOCUSED_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--reporter=junit",
    `--reporter-outfile=${runPaths(runId).junit}`,
  ];
}

async function atomicWrite(path: string, value: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await Bun.write(temporary, value);
  await rename(temporary, path);
}

function safeUsageNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (
    typeof value === "bigint" &&
    value >= 0n &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(value);
  }
  return null;
}

async function runRaw(
  command: readonly string[],
  environment: Readonly<Record<string, string>>,
  stdoutPath: string,
  stderrPath: string,
): Promise<RawExecutionWithBytes> {
  const started = performance.now();
  const child = Bun.spawn({
    cmd: [process.execPath, ...command.slice(1)],
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdoutBuffer, stderrBuffer] = await Promise.all([
    child.exited,
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
  ]);
  const stdout = new Uint8Array(stdoutBuffer);
  const stderr = new Uint8Array(stderrBuffer);
  await Promise.all([
    atomicWrite(stdoutPath, stdout),
    atomicWrite(stderrPath, stderr),
  ]);
  const usage = child.resourceUsage();
  const maxRssRaw = safeUsageNumber(usage?.maxRSS);
  const maxRssRawUnit = platform() === "linux"
    ? "kilobytes"
    : platform() === "darwin" ? "bytes" : "runtime-defined";
  const maxRssBytes = maxRssRaw === null
    ? null
    : maxRssRawUnit === "kilobytes"
      ? maxRssRaw * 1_024
      : maxRssRawUnit === "bytes" ? maxRssRaw : null;
  return {
    command,
    environment,
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
      maxRssBytes,
      cpuUserMicros: safeUsageNumber(usage?.cpuTime.user),
      cpuSystemMicros: safeUsageNumber(usage?.cpuTime.system),
      gating: false,
    },
    stdout,
    stderr,
  };
}

function withoutBytes(value: RawExecutionWithBytes): RawExecution {
  return {
    command: value.command,
    environment: value.environment,
    stdoutPath: value.stdoutPath,
    stderrPath: value.stderrPath,
    stdoutSha256: value.stdoutSha256,
    stderrSha256: value.stderrSha256,
    exitCode: value.exitCode,
    signal: value.signal,
    elapsedMs: value.elapsedMs,
    resourceUsage: value.resourceUsage,
  };
}

function environmentEvidence(): JsonRecord {
  const processors = cpus();
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return {
    bun: Bun.version,
    nodeCompatibility: process.versions.node,
    typescript: ts.version,
    platform: platform(),
    release: release(),
    architecture: process.arch,
    cpuCount: processors.length,
    cpuModel: processors[0]?.model ?? "unavailable",
    totalMemoryBytes: totalmem(),
    locale: resolved.locale,
    timeZone: resolved.timeZone,
  };
}

async function versionEvidence(): Promise<readonly JsonRecord[]> {
  const packageValue: unknown = await Bun.file("package.json").json();
  const packageRecord = record(packageValue, "package.json");
  const dependencies = isRecord(packageRecord["dependencies"])
    ? packageRecord["dependencies"]
    : {};
  const devDependencies = isRecord(packageRecord["devDependencies"])
    ? packageRecord["devDependencies"]
    : {};
  return [
    { name: "bun", version: Bun.version },
    { name: "node-compatibility", version: process.versions.node },
    { name: "typescript", version: ts.version },
    ...Object.entries({ ...dependencies, ...devDependencies })
      .filter(([name]) => name !== "typescript")
      .sort(([left], [right]) => compare(left, right))
      .map(([name, version]) => ({ name, version })),
  ];
}

function parseValidatorOutput(output: string): Readonly<{
  value: JsonRecord | null;
  findings: readonly C0EvidenceFinding[];
}> {
  try {
    const value: unknown = JSON.parse(output);
    const parsed = record(value, "validator output");
    const counts = record(parsed["counts"], "validator counts");
    const exact =
      parsed["schema"] === VALIDATOR_SCHEMA &&
      parsed["package"] === "C0" &&
      parsed["outcome"] === "pass" &&
      Array.isArray(parsed["findings"]) &&
      parsed["findings"].length === 0 &&
      counts["adversarialCases"] === C0_EXPECTED_COUNTS.adversarialCases &&
      counts["presetChords"] === C0_EXPECTED_COUNTS.presetChords &&
      counts["presetExpectationRows"] === C0_EXPECTED_COUNTS.presetChords &&
      counts["mutationControls"] === C0_EXPECTED_COUNTS.mutationControls &&
      counts["traces"] === C0_EXPECTED_COUNTS.traces &&
      counts["authorities"] === C0_EXPECTED_COUNTS.authorities &&
      counts["types"] === C0_EXPECTED_COUNTS.types &&
      counts["flags"] === C0_EXPECTED_COUNTS.flags &&
      counts["reportCodes"] === C0_EXPECTED_COUNTS.reportCodes &&
      counts["refusalCodes"] === C0_EXPECTED_COUNTS.refusalCodes;
    return exact
      ? { value: parsed, findings: [] }
      : {
          value: parsed,
          findings: [finding(
            "C0_EVIDENCE_VALIDATOR_RESULT",
            "validator.stdout",
            "C0 contract validator identity, counts, findings, or outcome differ.",
          )],
        };
  } catch (error) {
    return {
      value: null,
      findings: [finding(
        "C0_EVIDENCE_VALIDATOR_OUTPUT",
        "validator.stdout",
        sanitizeMessage(error instanceof Error ? error.message : "Invalid validator output"),
      )],
    };
  }
}

function expectedRunId(inputDigest: string, contractSha256: string): string {
  return c0EvidenceDigest({
    toolVersion: TOOL_VERSION,
    inputDigest,
    contractSha256,
  }).slice(0, 24);
}

function snapshotFrom(value: unknown): InputSnapshot | null {
  if (!isRecord(value) || !exactKeys(value, ["algorithm", "components", "digest"])) {
    return null;
  }
  if (
    value["algorithm"] !== "sha256-component-manifest-v1" ||
    !Array.isArray(value["components"]) ||
    !isSha256(value["digest"])
  ) {
    return null;
  }
  const components: InputComponent[] = [];
  for (const item of value["components"]) {
    if (
      !isRecord(item) ||
      !exactKeys(item, ["bytes", "group", "path", "sha256"]) ||
      typeof item["group"] !== "string" ||
      typeof item["path"] !== "string" ||
      !isNonnegativeInteger(item["bytes"]) ||
      !isSha256(item["sha256"])
    ) {
      return null;
    }
    components.push({
      group: item["group"],
      path: item["path"],
      bytes: item["bytes"],
      sha256: item["sha256"],
    });
  }
  if (
    value["digest"] !== c0EvidenceDigest(components) ||
    !exactStrings(
      components.map(({ path }) => path),
      [...components.map(({ path }) => path)].sort(compare),
    )
  ) {
    return null;
  }
  return {
    algorithm: "sha256-component-manifest-v1",
    digest: value["digest"],
    components,
  };
}

export function inspectC0RequiredResolutionInputs(
  components: readonly Readonly<{ group: string; path: string }>[],
): readonly C0EvidenceFinding[] {
  const groupByPath = new Map(
    components.map(({ group, path }) => [path, group] as const),
  );
  return C0_REQUIRED_RESOLUTION_INPUTS.flatMap((path) =>
    groupByPath.get(path) === "production"
      ? []
      : [finding(
        "C0_EVIDENCE_INPUT_CLOSURE",
        path,
        "The real F3 resolution path must be bound as a production input.",
      )]
  );
}

function validResourceUsage(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const nullableNonnegative = (item: unknown): boolean =>
    item === null || isNonnegativeInteger(item);
  return exactKeys(value, [
    "cpuSystemMicros",
    "cpuUserMicros",
    "gating",
    "maxRssBytes",
    "maxRssRaw",
    "maxRssRawUnit",
    "measurement",
  ]) &&
    value["measurement"] === "Bun.Subprocess.resourceUsage" &&
    nullableNonnegative(value["maxRssRaw"]) &&
    (value["maxRssRawUnit"] === "kilobytes" ||
      value["maxRssRawUnit"] === "bytes" ||
      value["maxRssRawUnit"] === "runtime-defined") &&
    nullableNonnegative(value["maxRssBytes"]) &&
    nullableNonnegative(value["cpuUserMicros"]) &&
    nullableNonnegative(value["cpuSystemMicros"]) &&
    value["gating"] === false;
}

function validRawExecution(
  value: unknown,
  command: readonly string[],
  environment: Readonly<Record<string, string>>,
  stdoutPath: string,
  stderrPath: string,
): boolean {
  if (!isRecord(value)) return false;
  return exactStrings(value["command"], command) &&
    c0EvidenceDigest(value["environment"]) === c0EvidenceDigest(environment) &&
    value["stdoutPath"] === stdoutPath &&
    value["stderrPath"] === stderrPath &&
    isSha256(value["stdoutSha256"]) &&
    isSha256(value["stderrSha256"]) &&
    isNonnegativeInteger(value["exitCode"]) &&
    (value["signal"] === null ||
      typeof value["signal"] === "string" ||
      isNonnegativeInteger(value["signal"])) &&
    typeof value["elapsedMs"] === "number" &&
    Number.isFinite(value["elapsedMs"]) &&
    value["elapsedMs"] >= 0 &&
    validResourceUsage(value["resourceUsage"]);
}

function validEnvironment(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value["bun"] === "string" && value["bun"].length > 0 &&
    typeof value["nodeCompatibility"] === "string" &&
    typeof value["typescript"] === "string" &&
    typeof value["platform"] === "string" &&
    typeof value["release"] === "string" &&
    typeof value["architecture"] === "string" &&
    isNonnegativeInteger(value["cpuCount"]) && value["cpuCount"] > 0 &&
    typeof value["cpuModel"] === "string" &&
    isNonnegativeInteger(value["totalMemoryBytes"]) &&
    typeof value["locale"] === "string" &&
    typeof value["timeZone"] === "string";
}

function validVersions(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const names: string[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !exactKeys(item, ["name", "version"]) ||
      typeof item["name"] !== "string" ||
      item["name"].length === 0 ||
      typeof item["version"] !== "string" ||
      item["version"].length === 0
    ) {
      return false;
    }
    names.push(item["name"]);
  }
  return new Set(names).size === names.length &&
    names.includes("bun") &&
    names.includes("node-compatibility") &&
    names.includes("typescript");
}

function observationBundle(value: unknown): Readonly<{
  production: JsonRecord | null;
  preset: JsonRecord | null;
  mutation: JsonRecord | null;
  law: JsonRecord | null;
  static: JsonRecord | null;
  records: readonly JsonRecord[];
}> {
  if (!isRecord(value)) {
    return {
      production: null,
      preset: null,
      mutation: null,
      law: null,
      static: null,
      records: [],
    };
  }
  const schemas = {
    production: "changes.evidence.c0-production-conformance-observation.v1",
    preset: "changes.evidence.c0-preset-conformance-observation.v1",
    mutation: "changes.evidence.c0-mutation-conformance-observation.v1",
    law: "changes.evidence.c0-migration-law-observation.v1",
    static: "changes.evidence.c0-static-boundary-observation.v1",
  } as const;
  const selected = Object.fromEntries(
    Object.entries(schemas).map(([key, schema]) => {
      const item = value[key];
      return [key, isRecord(item) && item["schema"] === schema ? item : null];
    }),
  );
  const production = isRecord(selected["production"])
    ? selected["production"]
    : null;
  const preset = isRecord(selected["preset"]) ? selected["preset"] : null;
  const mutation = isRecord(selected["mutation"]) ? selected["mutation"] : null;
  const law = isRecord(selected["law"]) ? selected["law"] : null;
  const staticObservation = isRecord(selected["static"])
    ? selected["static"]
    : null;
  return {
    production,
    preset,
    mutation,
    law,
    static: staticObservation,
    records: [production, preset, mutation, law, staticObservation].filter(
      (item): item is JsonRecord => item !== null,
    ),
  };
}

function traceControlCoverage(traces: readonly JsonRecord[]): readonly string[] {
  return sortedUnique(traces.flatMap((trace) => strings(trace["mutationControlIds"])));
}

export function validateC0EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): readonly C0EvidenceFinding[] {
  const findings: C0EvidenceFinding[] = [];
  if (!isRecord(candidate)) {
    return [finding(
      "C0_EVIDENCE_LEDGER_IDENTITY",
      OUTPUT_PATH,
      "Stored C0 evidence must be an object.",
    )];
  }
  if (
    candidate["schema"] !== LEDGER_SCHEMA ||
    candidate["schemaVersion"] !== 1 ||
    candidate["package"] !== "C0" ||
    candidate["toolVersion"] !== TOOL_VERSION ||
    candidate["mode"] !== "focused-package"
  ) {
    findings.push(finding(
      "C0_EVIDENCE_LEDGER_IDENTITY",
      OUTPUT_PATH,
      "Ledger schema, version, package, tool, or mode is invalid.",
    ));
  }
  if (
    candidate["outcome"] !== "pass" ||
    !Array.isArray(candidate["findings"]) ||
    candidate["findings"].length !== 0
  ) {
    findings.push(finding(
      "C0_EVIDENCE_STATUS",
      OUTPUT_PATH,
      "Healthy C0 evidence must pass with no findings.",
    ));
  }
  if (!validSignature(candidate)) {
    findings.push(finding(
      "C0_EVIDENCE_LEDGER_DIGEST",
      `${OUTPUT_PATH}#semanticDigest`,
      "Ledger semantic signature is missing or stale.",
    ));
  }

  const input = isRecord(candidate["input"]) ? candidate["input"] : null;
  const pre = snapshotFrom(input?.["pre"]);
  const post = snapshotFrom(input?.["post"]);
  if (
    pre === null ||
    post === null ||
    pre.digest !== post.digest ||
    pre.digest !== currentInputDigest ||
    c0EvidenceDigest(pre.components) !== c0EvidenceDigest(post.components)
  ) {
    findings.push(finding(
      "C0_EVIDENCE_INPUT_STALE",
      `${OUTPUT_PATH}#input`,
      "Pre, post, and current input component manifests must match exactly.",
    ));
  }
  if (pre !== null) {
    findings.push(...inspectC0RequiredResolutionInputs(pre.components));
  }
  const contractComponent = pre?.components.find(
    ({ path }) =>
      path === "tests/fixtures/legacy-migration/c0-legacy-migration-contract.json",
  );
  const runId = candidate["runId"];
  const expectedId = pre === null || contractComponent === undefined
    ? null
    : expectedRunId(pre.digest, contractComponent.sha256);
  if (typeof runId !== "string" || runId !== expectedId) {
    findings.push(finding(
      "C0_EVIDENCE_RUN_ID",
      `${OUTPUT_PATH}#runId`,
      "Run ID must derive from tool version, complete input digest, and contract bytes.",
    ));
  }
  const id = typeof runId === "string" ? runId : "invalid";
  const paths = runPaths(id);
  const environment = runEnvironment(id);

  if (!validEnvironment(candidate["environment"])) {
    findings.push(finding(
      "C0_EVIDENCE_ENVIRONMENT",
      `${OUTPUT_PATH}#environment`,
      "Complete host and runtime environment evidence is required.",
    ));
  }
  if (!validVersions(candidate["versions"])) {
    findings.push(finding(
      "C0_EVIDENCE_VERSIONS",
      `${OUTPUT_PATH}#versions`,
      "Exact Bun, Node compatibility, TypeScript, and package versions are required.",
    ));
  }
  if (!exactStrings(candidate["browserVersions"], [])) {
    findings.push(finding(
      "C0_EVIDENCE_BROWSER_APPLICABILITY",
      `${OUTPUT_PATH}#browserVersions`,
      "C0 has no browser evidence cells.",
    ));
  }
  if (c0EvidenceDigest(candidate["applicability"]) !== c0EvidenceDigest(C0_APPLICABILITY)) {
    findings.push(finding(
      "C0_EVIDENCE_APPLICABILITY",
      `${OUTPUT_PATH}#applicability`,
      "Applicability and downstream ownership must remain explicit and exact.",
    ));
  }

  const validator = isRecord(candidate["validator"])
    ? candidate["validator"]
    : null;
  if (
    validator === null ||
    !validRawExecution(
      validator,
      validatorCommand(),
      environment,
      paths.validatorStdout,
      paths.validatorStderr,
    ) ||
    validator["exitCode"] !== 0 ||
    validator["schema"] !== VALIDATOR_SCHEMA ||
    validator["outcome"] !== "pass" ||
    !Array.isArray(validator["findings"]) ||
    validator["findings"].length !== 0
  ) {
    findings.push(finding(
      "C0_EVIDENCE_VALIDATOR",
      `${OUTPUT_PATH}#validator`,
      "The exact C0 validator must pass with reviewed counts and no findings.",
    ));
  }

  const suite = isRecord(candidate["suite"]) ? candidate["suite"] : null;
  const suiteSummary: JUnitSummary | null = suite === null ||
      !Array.isArray(suite["cases"]) ||
      !Array.isArray(suite["files"])
    ? null
    : {
        tests: typeof suite["tests"] === "number" ? suite["tests"] : -1,
        assertions: typeof suite["assertions"] === "number"
          ? suite["assertions"]
          : -1,
        failures: typeof suite["failures"] === "number" ? suite["failures"] : -1,
        errors: typeof suite["errors"] === "number" ? suite["errors"] : -1,
        skipped: typeof suite["skipped"] === "number" ? suite["skipped"] : -1,
        files: strings(suite["files"]),
        cases: suite["cases"].filter(isRecord).flatMap((item) =>
          typeof item["file"] === "string" && typeof item["name"] === "string"
            ? [{ file: item["file"], name: item["name"] }]
            : []
        ),
      };
  const requiredCases = [
    GOLDEN_TESTCASE,
    { file: EXPECTED_PRODUCTION_TESTCASE.file, name: EXPECTED_PRODUCTION_TESTCASE.testcase },
    { file: EXPECTED_MUTATION_TESTCASE.file, name: EXPECTED_MUTATION_TESTCASE.testcase },
    { file: EXPECTED_LAW_TESTCASE.file, name: EXPECTED_LAW_TESTCASE.testcase },
    { file: EXPECTED_STATIC_TESTCASE.file, name: EXPECTED_STATIC_TESTCASE.testcase },
  ];
  if (
    suite === null ||
    !validRawExecution(
      suite,
      suiteCommand(id),
      environment,
      paths.suiteStdout,
      paths.suiteStderr,
    ) ||
    suite["exitCode"] !== 0 ||
    suite["junitPath"] !== paths.junit ||
    !isSha256(suite["junitSha256"]) ||
    suite["failures"] !== 0 ||
    suite["errors"] !== 0 ||
    suite["skipped"] !== 0 ||
    suite["todos"] !== 0 ||
    suite["expectedFailures"] !== 0 ||
    suite["retries"] !== 0 ||
    suite["quarantined"] !== 0 ||
    !exactStrings(suite["files"], C0_FOCUSED_TEST_FILES) ||
    !requiredCases.every((item) => summaryHasCase(suiteSummary, item))
  ) {
    findings.push(finding(
      "C0_EVIDENCE_SUITE",
      `${OUTPUT_PATH}#suite`,
      "The exact focused suite must pass with no failure, skip, todo, expected failure, retry, or quarantine.",
    ));
  }

  const observations = observationBundle(candidate["observations"]);
  findings.push(...validateC0ObservationRecords(observations.records));
  const expectedPresetProof = buildC0PresetProof(observations.preset, suiteSummary);
  if (c0EvidenceDigest(candidate["presetProof"]) !== c0EvidenceDigest(expectedPresetProof)) {
    findings.push(finding(
      "C0_EVIDENCE_PRESET_PROOF",
      `${OUTPUT_PATH}#presetProof`,
      "Stored preset proof must bind all 80 exact golden rows and the executed testcase.",
    ));
  }
  const expectedTraces = buildC0TraceEvidence(observations, suiteSummary);
  const traces = Array.isArray(candidate["traces"])
    ? candidate["traces"].filter(isRecord)
    : [];
  if (
    traces.length !== C0_EXPECTED_COUNTS.traces ||
    c0EvidenceDigest(traces) !== c0EvidenceDigest(expectedTraces) ||
    traces.some((trace) => trace["outcome"] !== "pass")
  ) {
    findings.push(finding(
      "C0_EVIDENCE_TRACE",
      `${OUTPUT_PATH}#traces`,
      "All 18 traces must recompute from exact authority, case, preset, mutation, and testcase evidence.",
    ));
  }
  if (!exactStrings(traceControlCoverage(traces), expectedControlIds())) {
    findings.push(finding(
      "C0_EVIDENCE_MUTATION_TRACE_COVERAGE",
      `${OUTPUT_PATH}#traces`,
      "All 30 reviewed mutation controls must be owned by at least one trace.",
    ));
  }
  if (
    c0EvidenceDigest(candidate["authorityEvidence"]) !==
      c0EvidenceDigest(authorityEvidence())
  ) {
    findings.push(finding(
      "C0_EVIDENCE_AUTHORITY",
      `${OUTPUT_PATH}#authorityEvidence`,
      "All seven reviewed authority records must be hash-bound.",
    ));
  }
  const mutation = observations.mutation;
  const expectedMutationEvidence = {
    classification: MUTATION_CLASSIFICATION,
    reviewedControls: C0_EXPECTED_COUNTS.mutationControls,
    semanticOperatorsExecuted: mutation?.["semanticOperatorsExecuted"] ?? 0,
    semanticOperatorsKilled: mutation?.["semanticOperatorsKilled"] ?? 0,
    semanticOperatorsSurvived: mutation?.["semanticOperatorsSurvived"] ?? 0,
    sourceMutantsExecuted: 0,
    sourceMutantsKilled: 0,
  };
  if (
    c0EvidenceDigest(candidate["mutationEvidence"]) !==
      c0EvidenceDigest(expectedMutationEvidence)
  ) {
    findings.push(finding(
      "C0_EVIDENCE_MUTATION_SUMMARY",
      `${OUTPUT_PATH}#mutationEvidence`,
      "Mutation summary must be honest about reviewed projections and zero source mutants.",
    ));
  }
  const law = observations.law;
  const expectedTermination = {
    terminalStates: law?.["terminalStates"] ?? [],
    workCounterNames: law?.["workCounterNames"] ?? [],
    boundaryPairs: law?.["boundaryPairs"] ?? 0,
    wallTimeGating: false,
    elapsedTimeRecorded: true,
    resourceUsageGating: false,
  };
  if (
    c0EvidenceDigest(candidate["terminationEvidence"]) !==
      c0EvidenceDigest(expectedTermination)
  ) {
    findings.push(finding(
      "C0_EVIDENCE_TERMINATION",
      `${OUTPUT_PATH}#terminationEvidence`,
      "Both terminal states, all counters, boundary pairs, and non-gating time/resources must be explicit.",
    ));
  }
  const production = observations.production;
  const expectedPublication = {
    migrationPublicationCalls: 0,
    externalF3PublicationCalls: production?.["externalF3PublicationCalls"] ?? 0,
    externalF3Accepted: production?.["externalF3Accepted"] ?? 0,
    candidatesPublishedByC0: 0,
    validatedBrandExportedByC0: false,
    downstreamConfirmationOwner: "E0/A0/U5",
  };
  if (
    c0EvidenceDigest(candidate["publicationEvidence"]) !==
      c0EvidenceDigest(expectedPublication)
  ) {
    findings.push(finding(
      "C0_EVIDENCE_PUBLICATION",
      `${OUTPUT_PATH}#publicationEvidence`,
      "C0 candidate-only behavior and three real external F3 publication checks are required.",
    ));
  }

  const metadata = isRecord(candidate["runMetadata"])
    ? candidate["runMetadata"]
    : null;
  if (
    metadata === null ||
    metadata["schema"] !== "changes.evidence.c0.run-metadata.v1" ||
    metadata["path"] !== paths.metadata ||
    !isSha256(metadata["sha256"])
  ) {
    findings.push(finding(
      "C0_EVIDENCE_RUN_METADATA",
      `${OUTPUT_PATH}#runMetadata`,
      "Run metadata identity and SHA-256 are required.",
    ));
  }
  return normalizeFindings(findings);
}

async function validateStoredEvidenceFiles(
  candidate: unknown,
): Promise<readonly C0EvidenceFinding[]> {
  const findings: C0EvidenceFinding[] = [];
  if (!isRecord(candidate) || typeof candidate["runId"] !== "string") {
    return [finding(
      "C0_EVIDENCE_RAW_IDENTITY",
      OUTPUT_PATH,
      "Stored ledger has no usable run identity.",
    )];
  }
  const runId = candidate["runId"];
  const paths = runPaths(runId);
  const validator = isRecord(candidate["validator"]) ? candidate["validator"] : {};
  const suite = isRecord(candidate["suite"]) ? candidate["suite"] : {};
  const metadata = isRecord(candidate["runMetadata"])
    ? candidate["runMetadata"]
    : {};
  const expectedFiles = [
    {
      path: paths.validatorStdout,
      digest: validator["stdoutSha256"],
      label: "validator.stdout",
    },
    {
      path: paths.validatorStderr,
      digest: validator["stderrSha256"],
      label: "validator.stderr",
    },
    {
      path: paths.suiteStdout,
      digest: suite["stdoutSha256"],
      label: "suite.stdout",
    },
    {
      path: paths.suiteStderr,
      digest: suite["stderrSha256"],
      label: "suite.stderr",
    },
    {
      path: paths.junit,
      digest: suite["junitSha256"],
      label: "suite.junit",
    },
    {
      path: paths.metadata,
      digest: metadata["sha256"],
      label: "runMetadata",
    },
  ];
  try {
    const actual = (await readdir(paths.directory)).sort(compare);
    const expected = expectedFiles.map(({ path }) => path.slice(
      paths.directory.length + 1,
    )).sort(compare);
    if (!exactStrings(actual, expected)) {
      findings.push(finding(
        "C0_EVIDENCE_RAW_FILE_SET",
        paths.directory,
        "Run directory must contain exactly the six declared raw evidence files.",
      ));
    }
  } catch (error) {
    findings.push(finding(
      "C0_EVIDENCE_RAW_DIRECTORY",
      paths.directory,
      sanitizeMessage(error instanceof Error ? error.message : "Run directory missing"),
    ));
  }
  for (const expected of expectedFiles) {
    if (!isSha256(expected.digest)) {
      findings.push(finding(
        "C0_EVIDENCE_RAW_HASH",
        expected.label,
        "Ledger is missing a raw-file SHA-256.",
      ));
      continue;
    }
    try {
      const bytes = new Uint8Array(await Bun.file(expected.path).arrayBuffer());
      if (sha256Bytes(bytes) !== expected.digest) {
        findings.push(finding(
          "C0_EVIDENCE_RAW_HASH",
          expected.path,
          "Raw evidence bytes differ from the ledger hash.",
        ));
      }
    } catch (error) {
      findings.push(finding(
        "C0_EVIDENCE_RAW_MISSING",
        expected.path,
        sanitizeMessage(error instanceof Error ? error.message : "Raw evidence missing"),
      ));
    }
  }
  try {
    const junit = await Bun.file(paths.junit).text();
    if (
      junit.includes("hostname=") ||
      junit.includes(process.cwd()) ||
      inspectC0JUnit(junit).summary === null
    ) {
      findings.push(finding(
        "C0_EVIDENCE_JUNIT_SANITIZATION",
        paths.junit,
        "Stored JUnit must be sanitized and independently parseable.",
      ));
    }
  } catch {
    // The missing-file finding above owns this failure.
  }
  try {
    const rawMetadata: unknown = await Bun.file(paths.metadata).json();
    const metadataRecord = record(rawMetadata, "run metadata");
    const input = isRecord(candidate["input"]) ? candidate["input"] : {};
    const pre = snapshotFrom(input["pre"]);
    const expectedMetadata = {
      schema: "changes.evidence.c0.run-metadata.v1",
      runId,
      inputDigest: pre?.digest ?? "unavailable",
      commands: {
        validator: validatorCommand(),
        suite: suiteCommand(runId),
      },
      environment: runEnvironment(runId),
      environmentEvidence: candidate["environment"],
      versions: candidate["versions"],
      executions: {
        validator: {
          elapsedMs: validator["elapsedMs"],
          resourceUsage: validator["resourceUsage"],
        },
        suite: {
          elapsedMs: suite["elapsedMs"],
          resourceUsage: suite["resourceUsage"],
        },
      },
    };
    if (c0EvidenceDigest(metadataRecord) !== c0EvidenceDigest(expectedMetadata)) {
      findings.push(finding(
        "C0_EVIDENCE_RUN_METADATA_DRIFT",
        paths.metadata,
        "Run metadata differs from commands, environment, versions, or resources.",
      ));
    }
  } catch (error) {
    findings.push(finding(
      "C0_EVIDENCE_RUN_METADATA_INVALID",
      paths.metadata,
      sanitizeMessage(error instanceof Error ? error.message : "Invalid run metadata"),
    ));
  }
  return normalizeFindings(findings);
}

function signLedger(value: JsonRecord): JsonRecord {
  const unsigned = unsignedRecord(value);
  return { ...unsigned, semanticDigest: c0EvidenceDigest(unsigned) };
}

function controlsCount(
  findings: readonly C0EvidenceFinding[],
  code: string,
): number {
  return findings.filter((item) => item.code === code).length;
}

export async function verifyC0Evidence(): Promise<JsonRecord> {
  const pre = await snapshotInputs();
  const contractComponent = pre.snapshot.components.find(
    ({ path }) =>
      path === "tests/fixtures/legacy-migration/c0-legacy-migration-contract.json",
  );
  const runId = expectedRunId(
    pre.snapshot.digest,
    contractComponent?.sha256 ?? "unavailable",
  );
  const paths = runPaths(runId);
  await mkdir(paths.directory, { recursive: true });
  const environment = runEnvironment(runId);
  const versions = await versionEvidence();
  const host = environmentEvidence();

  const validatorRun = await runRaw(
    validatorCommand(),
    environment,
    paths.validatorStdout,
    paths.validatorStderr,
  );
  const validatorParsed = parseValidatorOutput(
    new TextDecoder().decode(validatorRun.stdout),
  );
  const suiteRun = await runRaw(
    suiteCommand(runId),
    environment,
    paths.suiteStdout,
    paths.suiteStderr,
  );
  const rawJunit = await Bun.file(paths.junit).exists()
    ? await Bun.file(paths.junit).text()
    : '<testsuites tests="0" assertions="0" failures="1" errors="0" skipped="0"></testsuites>';
  const junit = sanitizeC0JUnit(rawJunit);
  await atomicWrite(paths.junit, junit);
  const inspected = inspectC0JUnit(junit);
  const parsed = parseC0Observations(
    new TextDecoder().decode(suiteRun.stdout),
  );
  const post = await snapshotInputs();
  const summary = inspected.summary;
  const observations = {
    production: parsed.production,
    preset: parsed.preset,
    mutation: parsed.mutation,
    law: parsed.law,
    static: parsed.static,
  };
  const traces = buildC0TraceEvidence(observations, summary);
  const presetProof = buildC0PresetProof(parsed.preset, summary);

  const requiredCases: readonly JUnitCase[] = [
    GOLDEN_TESTCASE,
    {
      file: EXPECTED_PRODUCTION_TESTCASE.file,
      name: EXPECTED_PRODUCTION_TESTCASE.testcase,
    },
    {
      file: EXPECTED_MUTATION_TESTCASE.file,
      name: EXPECTED_MUTATION_TESTCASE.testcase,
    },
    { file: EXPECTED_LAW_TESTCASE.file, name: EXPECTED_LAW_TESTCASE.testcase },
    {
      file: EXPECTED_STATIC_TESTCASE.file,
      name: EXPECTED_STATIC_TESTCASE.testcase,
    },
  ];
  const structuralFindings = normalizeFindings([
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...validatorParsed.findings,
    ...inspected.findings,
    ...parsed.findings,
    ...(pre.snapshot.digest === post.snapshot.digest ? [] : [finding(
      "C0_EVIDENCE_INPUT_CHANGED",
      "input",
      "Evidence inputs changed during execution.",
    )]),
    ...(validatorRun.exitCode === 0 ? [] : [finding(
      "C0_EVIDENCE_VALIDATOR_EXIT",
      "validator",
      `Validator exited ${String(validatorRun.exitCode)}.`,
    )]),
    ...(suiteRun.exitCode === 0 ? [] : [finding(
      "C0_EVIDENCE_SUITE_EXIT",
      "suite",
      `Focused suite exited ${String(suiteRun.exitCode)}.`,
    )]),
    ...(summary !== null &&
        summary.failures === 0 &&
        summary.errors === 0 &&
        summary.skipped === 0 &&
        exactStrings(summary.files, C0_FOCUSED_TEST_FILES) &&
        requiredCases.every((item) => summaryHasCase(summary, item))
      ? []
      : [finding(
          "C0_EVIDENCE_SUITE_SUMMARY",
          "suite.junit",
          "JUnit must contain the exact focused files, required testcase identities, and zero failures, errors, or skips.",
        )]),
    ...(traces.length === C0_EXPECTED_COUNTS.traces &&
        traces.every((trace) => trace["outcome"] === "pass")
      ? []
      : [finding(
          "C0_EVIDENCE_TRACE",
          "traces",
          "Every C0 trace requires complete authority, case, preset, and mutation evidence.",
        )]),
    ...(exactStrings(traceControlCoverage(traces), expectedControlIds())
      ? []
      : [finding(
          "C0_EVIDENCE_MUTATION_TRACE_COVERAGE",
          "traces",
          "All 30 mutation controls require trace ownership.",
        )]),
  ]);

  const validatorRecord: JsonRecord = {
    ...withoutBytes(validatorRun),
    schema: validatorParsed.value?.["schema"] ?? null,
    outcome: validatorParsed.value?.["outcome"] ?? "fail",
    counts: validatorParsed.value?.["counts"] ?? null,
    findings: validatorParsed.value?.["findings"] ?? [],
  };
  const allControls = normalizeFindings([...pre.controls, ...post.controls]);
  const suiteRecord: JsonRecord = {
    ...withoutBytes(suiteRun),
    junitPath: paths.junit,
    junitSha256: sha256Bytes(junit),
    tests: summary?.tests ?? 0,
    assertions: summary?.assertions ?? 0,
    failures: summary?.failures ?? 1,
    errors: summary?.errors ?? 0,
    skipped: summary?.skipped ?? 0,
    todos: controlsCount(allControls, "C0_EVIDENCE_TODO"),
    expectedFailures: 0,
    retries: controlsCount(allControls, "C0_EVIDENCE_RETRY"),
    quarantined: controlsCount(allControls, "C0_EVIDENCE_QUARANTINE"),
    files: summary?.files ?? [],
    cases: summary?.cases ?? [],
  };
  const metadataValue = {
    schema: "changes.evidence.c0.run-metadata.v1",
    runId,
    inputDigest: pre.snapshot.digest,
    commands: {
      validator: validatorCommand(),
      suite: suiteCommand(runId),
    },
    environment,
    environmentEvidence: host,
    versions,
    executions: {
      validator: {
        elapsedMs: validatorRun.elapsedMs,
        resourceUsage: validatorRun.resourceUsage,
      },
      suite: {
        elapsedMs: suiteRun.elapsedMs,
        resourceUsage: suiteRun.resourceUsage,
      },
    },
  };
  const metadataJson = stableC0EvidenceJson(metadataValue);
  await atomicWrite(paths.metadata, metadataJson);

  const mutationEvidence = {
    classification: MUTATION_CLASSIFICATION,
    reviewedControls: C0_EXPECTED_COUNTS.mutationControls,
    semanticOperatorsExecuted: parsed.mutation?.["semanticOperatorsExecuted"] ?? 0,
    semanticOperatorsKilled: parsed.mutation?.["semanticOperatorsKilled"] ?? 0,
    semanticOperatorsSurvived: parsed.mutation?.["semanticOperatorsSurvived"] ?? 0,
    sourceMutantsExecuted: 0,
    sourceMutantsKilled: 0,
  };
  const terminationEvidence = {
    terminalStates: parsed.law?.["terminalStates"] ?? [],
    workCounterNames: parsed.law?.["workCounterNames"] ?? [],
    boundaryPairs: parsed.law?.["boundaryPairs"] ?? 0,
    wallTimeGating: false,
    elapsedTimeRecorded: true,
    resourceUsageGating: false,
  };
  const publicationEvidence = {
    migrationPublicationCalls: 0,
    externalF3PublicationCalls:
      parsed.production?.["externalF3PublicationCalls"] ?? 0,
    externalF3Accepted: parsed.production?.["externalF3Accepted"] ?? 0,
    candidatesPublishedByC0: 0,
    validatedBrandExportedByC0: false,
    downstreamConfirmationOwner: "E0/A0/U5",
  };
  const preliminary = signLedger({
    schema: LEDGER_SCHEMA,
    schemaVersion: 1,
    package: "C0",
    toolVersion: TOOL_VERSION,
    runId,
    mode: "focused-package",
    outcome: structuralFindings.length === 0 ? "pass" : "fail",
    findings: structuralFindings,
    contract: {
      schema: contractFixture.schema,
      policyId: contractFixture.policy.id,
      policyVersion: contractFixture.policy.version,
      reviewedContractSha256: contractComponent?.sha256 ?? "unavailable",
    },
    environment: host,
    versions,
    browserVersions: [],
    applicability: C0_APPLICABILITY,
    input: { pre: pre.snapshot, post: post.snapshot },
    runMetadata: {
      schema: "changes.evidence.c0.run-metadata.v1",
      path: paths.metadata,
      sha256: sha256Bytes(metadataJson),
    },
    validator: validatorRecord,
    suite: suiteRecord,
    observations,
    presetProof,
    traces,
    authorityEvidence: authorityEvidence(),
    mutationEvidence,
    terminationEvidence,
    publicationEvidence,
  });
  const validationFindings = normalizeFindings([
    ...await validateStoredEvidenceFiles(preliminary),
    ...validateC0EvidenceCandidate(preliminary, post.snapshot.digest),
  ]);
  const ledger = validationFindings.length === 0
    ? preliminary
    : signLedger({
        ...unsignedRecord(preliminary),
        outcome: "fail",
        findings: validationFindings,
      });
  await atomicWrite(OUTPUT_PATH, stableC0EvidenceJson(ledger));
  return ledger;
}

export async function checkC0Evidence(): Promise<Readonly<{
  outcome: Outcome;
  findings: readonly C0EvidenceFinding[];
}>> {
  try {
    const candidate: unknown = await Bun.file(OUTPUT_PATH).json();
    const current = await snapshotInputs();
    const settled = await snapshotInputs();
    const findings = normalizeFindings([
      ...current.findings,
      ...current.controls,
      ...settled.findings,
      ...settled.controls,
      ...(current.snapshot.digest === settled.snapshot.digest
        ? []
        : [finding(
            "C0_EVIDENCE_INPUT_CHANGED",
            "input",
            "Inputs changed while checking stored evidence.",
          )]),
      ...await validateStoredEvidenceFiles(candidate),
      ...validateC0EvidenceCandidate(candidate, settled.snapshot.digest),
    ]);
    return { outcome: findings.length === 0 ? "pass" : "fail", findings };
  } catch (error) {
    return {
      outcome: "fail",
      findings: [finding(
        "C0_EVIDENCE_LEDGER_MISSING",
        OUTPUT_PATH,
        sanitizeMessage(error instanceof Error ? error.message : "Ledger unreadable"),
      )],
    };
  }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
      throw new TypeError("Usage: bun scripts/verify-c0-evidence.ts [--check]");
    }
    if (args[0] === "--check") {
      const result = await checkC0Evidence();
      console.log(stableC0EvidenceJson({
        schema: "changes.evidence.c0.summary.v1",
        mode: "check",
        ledgerPath: OUTPUT_PATH,
        ...result,
      }).trimEnd());
      process.exitCode = result.outcome === "pass" ? 0 : 1;
    } else {
      const evidence = await verifyC0Evidence();
      const suite = isRecord(evidence["suite"]) ? evidence["suite"] : {};
      console.log(stableC0EvidenceJson({
        schema: "changes.evidence.c0.summary.v1",
        mode: "focused-package",
        ledgerPath: OUTPUT_PATH,
        outcome: evidence["outcome"],
        runId: evidence["runId"],
        tests: suite["tests"] ?? 0,
        assertions: suite["assertions"] ?? 0,
        adversarialCases: C0_EXPECTED_COUNTS.adversarialCases,
        presetChords: C0_EXPECTED_COUNTS.presetChords,
        traces: C0_EXPECTED_COUNTS.traces,
        semanticOperatorsKilled: C0_EXPECTED_COUNTS.mutationControls,
        sourceMutantsExecuted: 0,
        findings: evidence["findings"],
      }).trimEnd());
      process.exitCode = evidence["outcome"] === "pass" ? 0 : 1;
    }
  } catch (error) {
    console.error(stableC0EvidenceJson({
      schema: TOOL_VERSION,
      outcome: "tool-failure",
      message: sanitizeMessage(
        error instanceof Error ? error.message : "C0 evidence verification failed",
      ),
    }).trimEnd());
    process.exitCode = 2;
  }
}
