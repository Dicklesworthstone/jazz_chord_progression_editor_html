import { createHash } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname } from "node:path";

import ts from "typescript";

import lawFixture from "../tests/fixtures/playback-plan/law-cases.json";
import limitFixture from "../tests/fixtures/playback-plan/limit-cases.json";
import loopFixture from "../tests/fixtures/playback-plan/loop-cases.json";
import mutationFixture from
  "../tests/fixtures/playback-plan/mutation-controls.json";
import provenanceFixture from
  "../tests/fixtures/playback-plan/provenance-ledger.json";
import realizationFixture from
  "../tests/fixtures/playback-plan/realization-cases.json";
import timelineFixture from
  "../tests/fixtures/playback-plan/timeline-cases.json";
import traceFixture from "../tests/fixtures/playback-plan/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

export type P0EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  traceId: string | null;
}>;

export type P0JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }> [];
}>;

type InputComponent = Readonly<{
  group: string;
  path: string;
  bytes: number;
  sha256: string;
}>;

export type P0InputSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly InputComponent[];
}>;

type RawExecution = Readonly<{
  command: readonly string[];
  environment: Readonly<Record<string, string>>;
  exitCode: number;
  signal: string | number | null;
  elapsedMs: number;
  stdoutPath: string;
  stderrPath: string;
  stdoutSha256: string;
  stderrSha256: string;
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

const OUTPUT_PATH = "test-results/p0-evidence.json" as const;
const TOOL_VERSION = "changes.evidence.p0-verifier.v1" as const;
const PRODUCTION_SCHEMA =
  "changes.evidence.p0-production-conformance-observation.v1" as const;
const MUTATION_SCHEMA =
  "changes.evidence.p0-mutation-conformance-observation.v1" as const;
const PRODUCTION_PRODUCER = Object.freeze({
  file: "tests/conformance/playback-plan-conformance.test.ts",
  testcase:
    "executes every reviewed P0 mutation baseline against literal fixture authority",
} as const);
const MUTATION_PRODUCER = Object.freeze({
  file: "tests/conformance/playback-plan-conformance.test.ts",
  testcase:
    "kills all 42 reviewed semantic counterfactuals and all 96 killer links",
} as const);

export const P0_PLANNED_EVIDENCE_OWNERS = Object.freeze([
  "tests/conformance/playback-plan-conformance.test.ts",
  "tests/integration/playback-plan-consumers.test.ts",
  "tests/integration/playback-plan-limits.test.ts",
  "tests/property/playback-plan-transposition.test.ts",
  "tests/static/playback-boundary.test.ts",
  "tests/unit/playback-plan-gate.test.ts",
  "tests/unit/playback-plan-loop.test.ts",
  "tests/unit/playback-plan-manual.test.ts",
  "tests/unit/playback-plan-midi-integral.test.ts",
  "tests/unit/playback-plan-realization.test.ts",
  "tests/unit/playback-plan-refusals.test.ts",
  "tests/unit/playback-plan-timeline.test.ts",
] as const);

export const P0_FOCUSED_TEST_FILES = Object.freeze([
  ...P0_PLANNED_EVIDENCE_OWNERS,
  "tests/static/p0-contract.test.ts",
  "tests/static/p0-evidence.test.ts",
  "tests/static/p0-upstream-realization-fixtures.test.ts",
] as const);

export const P0_FIXTURE_FILES = Object.freeze([
  "tests/fixtures/playback-plan/law-cases.json",
  "tests/fixtures/playback-plan/limit-cases.json",
  "tests/fixtures/playback-plan/loop-cases.json",
  "tests/fixtures/playback-plan/mutation-controls.json",
  "tests/fixtures/playback-plan/p0-playback-plan-contract.json",
  "tests/fixtures/playback-plan/provenance-ledger.json",
  "tests/fixtures/playback-plan/realization-cases.json",
  "tests/fixtures/playback-plan/source-catalog.json",
  "tests/fixtures/playback-plan/timeline-cases.json",
  "tests/fixtures/playback-plan/trace-ledger.json",
] as const);

const INPUT_GROUPS = Object.freeze({
  contracts: Object.freeze([
    "AGENTS.md",
    "docs/ARCHITECTURE.md",
    "docs/P0_PLAYBACK_PLAN_CONTRACT.md",
    "docs/REBUILD_PLAN.md",
    "src/playback/playback-plan-contract.ts",
  ]),
  authority: P0_FIXTURE_FILES,
  production: Object.freeze([
    "src/playback/compile-playback-plan.ts",
    "src/playback/index.ts",
    "src/playback/playback-plan-contract.ts",
  ]),
  harness: Object.freeze([
    ...P0_FOCUSED_TEST_FILES,
    "tests/support/p0-conformance.ts",
    "tests/support/p0-playback-fixtures.ts",
  ]),
  review: Object.freeze([
    "docs/evidence/P0_INDEPENDENT_TRACE_REVIEW.md",
  ]),
  tooling: Object.freeze([
    "package.json",
    "scripts/validate-p0-contract.ts",
    "scripts/verify-p0-evidence.ts",
    "scripts/verify.ts",
    "tsconfig.tests.json",
  ]),
} as const);

export const P0_EXPECTED_COUNTS = Object.freeze({
  fixtureFiles: 10,
  sourceRecords: 6,
  timelineCases: 10,
  realizationCases: 23,
  loopCases: 14,
  lawCases: 14,
  structuralLimitCases: 6,
  counterBoundaryCases: 16,
  totalNamedCases: 83,
  mutationControls: 42,
  mutationKillerLinks: 96,
  authorities: 11,
  traces: 20,
  parentClaims: 8,
  ownerFiles: 12,
} as const);

export const P0_APPLICABILITY = Object.freeze([
  Object.freeze({
    id: "cancellation",
    applicability: "not-applicable:synchronous-bounded-operation",
    owner: "P0",
    proof: "P0 returns one all-or-nothing value and has no resumable state.",
  }),
  Object.freeze({
    id: "resume",
    applicability: "not-applicable:non-resumable-value-operation",
    owner: "P0",
    proof: "No continuation token or partial result exists in the public contract.",
  }),
  Object.freeze({
    id: "stale-revision",
    applicability: "not-applicable:structural-correlation",
    owner: "P0/A0",
    proof: "Exact source, policy, and binding correlation replaces revision tokens.",
  }),
  Object.freeze({
    id: "browser-accessibility",
    applicability: "not-applicable:pure-playback-value-operation",
    owner: "U0/U1/Q0",
    proof: "P0 has no rendered or browser surface.",
  }),
  Object.freeze({
    id: "audio-render-listening",
    applicability: "not-applicable:no-audio-call",
    owner: "X0/X1",
    proof: "P0 only hands off an immutable plan; audio execution is downstream.",
  }),
  Object.freeze({
    id: "storage",
    applicability: "not-applicable:no-persistence-call",
    owner: "A1/E0",
    proof: "P0 has no persistence side effect.",
  }),
  Object.freeze({
    id: "wall-time-cutoff",
    applicability: "forbidden:exact-work-and-memory-counters-only",
    owner: "P0",
    proof: "Elapsed time is recorded as evidence and cannot select a musical result.",
  }),
] as const);

function finding(
  code: string,
  path: string,
  message: string,
  traceId: string | null = null,
): P0EvidenceFinding {
  return Object.freeze({ code, path, message, traceId });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort(compare).map((key) => [
      key,
      canonicalValue(value[key]),
    ]),
  );
}

export function stableP0EvidenceJson(value: unknown): string {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

function compactP0EvidenceJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function p0EvidenceDigest(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(compactP0EvidenceJson(value)));
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function exactStrings(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length &&
    value.every((item, index) => item === expected[index]);
}

function withoutKey(value: JsonRecord, omitted: string): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omitted),
  );
}

function hasValidSemanticDigest(value: JsonRecord): boolean {
  return isSha256(value["semanticDigest"]) &&
    value["semanticDigest"] === p0EvidenceDigest(
      withoutKey(value, "semanticDigest"),
    );
}

function attribute(source: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`, "u").exec(source);
  return match?.[1] ?? null;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function nonnegativeInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function sanitizeP0JUnit(xml: string): string {
  return xml
    .replaceAll(/\s+hostname="[^"]*"/gu, "")
    .replaceAll(/\s+timestamp="[^"]*"/gu, "")
    .replaceAll(/\r\n?/gu, "\n");
}

export function inspectP0JUnit(xml: string): Readonly<{
  summary: P0JUnitSummary | null;
  findings: readonly P0EvidenceFinding[];
}> {
  const findings: P0EvidenceFinding[] = [];
  const root = /<testsuites\b([^>]*)>/u.exec(xml)?.[1] ?? null;
  if (root === null) {
    return {
      summary: null,
      findings: [finding(
        "P0_EVIDENCE_JUNIT_ROOT",
        "suite.junit",
        "JUnit lacks one testsuites root.",
      )],
    };
  }
  const tests = nonnegativeInteger(attribute(root, "tests"));
  const assertions = nonnegativeInteger(attribute(root, "assertions"));
  const failures = nonnegativeInteger(attribute(root, "failures"));
  const errors = nonnegativeInteger(attribute(root, "errors")) ?? 0;
  const skipped = nonnegativeInteger(attribute(root, "skipped"));
  const cases = [...xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>)/gu)].flatMap(
    (match) => {
      const attributes = match[1] ?? "";
      const file = attribute(attributes, "file");
      const name = attribute(attributes, "name");
      return file === null || name === null
        ? []
        : [{ file: decodeXml(file), name: decodeXml(name) }];
    },
  );
  if (
    tests === null || assertions === null || failures === null ||
    skipped === null || cases.length !== tests
  ) {
    findings.push(finding(
      "P0_EVIDENCE_JUNIT_COUNTS",
      "suite.junit",
      "JUnit counts are absent, malformed, or disagree with testcase rows.",
    ));
  }
  const identities = cases.map(({ file, name }) => `${file}\u0000${name}`);
  if (new Set(identities).size !== identities.length) {
    findings.push(finding(
      "P0_EVIDENCE_JUNIT_DUPLICATE",
      "suite.junit",
      "JUnit testcase identities must be unique.",
    ));
  }
  if (findings.length > 0 || tests === null || assertions === null ||
    failures === null || skipped === null) {
    return { summary: null, findings };
  }
  return {
    summary: Object.freeze({
      tests,
      assertions,
      failures,
      errors,
      skipped,
      files: Object.freeze([...new Set(cases.map(({ file }) => file))].sort(compare)),
      cases: Object.freeze(cases),
    }),
    findings,
  };
}

export function inspectP0TestControls(
  path: string,
  sourceText: string,
): readonly P0EvidenceFinding[] {
  const findings: P0EvidenceFinding[] = [];
  const source = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const forbiddenMethods = new Set([
    "skip",
    "only",
    "todo",
    "retry",
    "quarantine",
  ]);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      forbiddenMethods.has(node.expression.name.text)
    ) {
      findings.push(finding(
        "P0_EVIDENCE_TEST_RELAXATION",
        `${path}:${String(source.getLineAndCharacterOfPosition(node.getStart()).line + 1)}`,
        `Focused evidence may not call .${node.expression.name.text}().`,
      ));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

const FORBIDDEN_CAPABILITIES = new Set([
  "AudioContext",
  "OfflineAudioContext",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "Date",
  "performance",
]);

export function inspectP0ProductionBoundary(
  sources: Readonly<Record<string, string>>,
): Readonly<{
  observation: JsonRecord;
  findings: readonly P0EvidenceFinding[];
}> {
  const findings: P0EvidenceFinding[] = [];
  const forbiddenReferences: string[] = [];
  const files = Object.keys(sources).sort(compare);
  const expectedFiles = [...INPUT_GROUPS.production].sort(compare);
  if (!exactStrings(files, expectedFiles)) {
    findings.push(finding(
      "P0_EVIDENCE_PRODUCTION_INVENTORY",
      "src/playback",
      "Production boundary must contain the exact three reviewed P0 files.",
      "P0-TRACE-BOUNDARY",
    ));
  }
  for (const [path, sourceText] of Object.entries(sources)) {
    const source = ts.createSourceFile(
      path,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (
        specifier === "../theory" &&
        statement.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword
      ) {
        forbiddenReferences.push(`${path}:runtime-theory-import`);
      }
      if (
        !specifier.startsWith("./") && specifier !== "../domain" &&
        specifier !== "../theory"
      ) {
        forbiddenReferences.push(`${path}:import:${specifier}`);
      }
    }
    const importRanges = source.statements.filter(ts.isImportDeclaration).map(
      (statement) => ({ start: statement.getStart(source), end: statement.end }),
    );
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && FORBIDDEN_CAPABILITIES.has(node.text)) {
        const insideImport = importRanges.some(({ start, end }) =>
          node.getStart(source) >= start && node.end <= end
        );
        if (!insideImport) {
          forbiddenReferences.push(`${path}:capability:${node.text}`);
        }
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ((node.expression.getText(source) === "Math" && node.name.text === "random") ||
          node.name.text === "localeCompare")
      ) {
        forbiddenReferences.push(`${path}:ambient:${node.getText(source)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const unique = [...new Set(forbiddenReferences)].sort(compare);
  if (unique.length > 0) {
    findings.push(finding(
      "P0_EVIDENCE_PRODUCTION_BOUNDARY",
      "src/playback",
      "P0 production references a forbidden runtime capability or layer.",
      "P0-TRACE-BOUNDARY",
    ));
  }
  return {
    observation: {
      schema: "changes.evidence.p0-static-boundary-observation.v1",
      files,
      forbiddenReferences: unique,
      theoryRuntimeImports: unique.filter((item) =>
        item.endsWith("runtime-theory-import")
      ).length,
      status: findings.length === 0 ? "pass" : "fail",
    },
    findings,
  };
}

export function parseP0Observations(stdout: string): Readonly<{
  observations: readonly JsonRecord[];
  findings: readonly P0EvidenceFinding[];
}> {
  const observations: JsonRecord[] = [];
  const findings: P0EvidenceFinding[] = [];
  for (const [index, line] of stdout.split("\n").entries()) {
    const match = /^(P0_[A-Z0-9_]+_OBSERVATION)\s+(\{.*\})$/u.exec(line.trim());
    if (match === null) continue;
    try {
      const parsed: unknown = JSON.parse(match[2] ?? "null");
      if (!isRecord(parsed)) throw new TypeError("observation-not-record");
      observations.push(parsed);
    } catch {
      findings.push(finding(
        "P0_EVIDENCE_OBSERVATION_JSON",
        `suite.stdout:${String(index + 1)}`,
        `${match[1] ?? "P0 observation"} is not one valid JSON object.`,
      ));
    }
  }
  const schemas = observations.flatMap((row) =>
    typeof row["schema"] === "string" ? [row["schema"]] : []
  );
  if (new Set(schemas).size !== schemas.length) {
    findings.push(finding(
      "P0_EVIDENCE_OBSERVATION_DUPLICATE",
      "suite.stdout",
      "Observation schemas must be unique.",
    ));
  }
  return { observations, findings };
}

function mutationControls(): readonly Readonly<{
  id: string;
  killerCaseIds: readonly string[];
}>[] {
  return mutationFixture.controls.map((control) => ({
    id: control.id,
    killerCaseIds: control.killerCaseIds,
  }));
}

function caseFixtureRecords(): ReadonlyMap<
  string,
  Readonly<{ path: string; row: JsonRecord }>
> {
  const groups: readonly Readonly<{
    path: string;
    rows: readonly JsonRecord[];
  }>[] = [
    { path: "tests/fixtures/playback-plan/timeline-cases.json", rows: timelineFixture.cases },
    { path: "tests/fixtures/playback-plan/realization-cases.json", rows: realizationFixture.cases },
    { path: "tests/fixtures/playback-plan/loop-cases.json", rows: loopFixture.cases },
    { path: "tests/fixtures/playback-plan/law-cases.json", rows: lawFixture.cases },
    {
      path: "tests/fixtures/playback-plan/limit-cases.json",
      rows: [...limitFixture.structuralCases, ...limitFixture.counterBoundaries],
    },
  ];
  return new Map(groups.flatMap(({ path, rows }) =>
    rows.map((row) => [String(row["id"]), { path, row }] as const)
  ));
}

function productionCaseIds(): readonly string[] {
  return [...new Set(mutationFixture.controls.flatMap(
    ({ killerCaseIds }) => killerCaseIds,
  ))].sort(compare);
}

export function validateP0ProductionObservation(
  value: unknown,
): readonly P0EvidenceFinding[] {
  const findings: P0EvidenceFinding[] = [];
  const record = isRecord(value) ? value : {};
  const expectedCaseIds = productionCaseIds();
  const fixtures = caseFixtureRecords();
  const rows = Array.isArray(record["caseObservations"])
    ? record["caseObservations"].filter(isRecord)
    : [];
  const actualCaseIds = rows.flatMap((row) =>
    typeof row["caseId"] === "string" ? [row["caseId"]] : []
  );
  if (
    record["schema"] !== PRODUCTION_SCHEMA ||
    record["suite"] !== "p0-production-literal-baselines" ||
    compactP0EvidenceJson(record["producer"]) !==
      compactP0EvidenceJson(PRODUCTION_PRODUCER) ||
    !exactStrings(record["caseIds"], expectedCaseIds) ||
    !exactStrings(actualCaseIds, expectedCaseIds) ||
    record["casesObserved"] !== expectedCaseIds.length ||
    record["fixtureMismatches"] !== 0 ||
    record["status"] !== "pass"
  ) {
    findings.push(finding(
      "P0_EVIDENCE_PRODUCTION_INVENTORY",
      "observations.production",
      "Production evidence must bind the exact 64 reviewed killer baselines in deterministic order.",
    ));
  }
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const caseId = typeof row["caseId"] === "string" ? row["caseId"] : "";
    const fixture = fixtures.get(caseId);
    const projectionsExist = "expectedProjection" in row &&
      "actualProjection" in row;
    const valid = caseId.length > 0 && !seen.has(caseId) &&
      fixture !== undefined && row["fixturePath"] === fixture.path &&
      row["fixtureRecordSha256"] === p0EvidenceDigest(fixture.row) &&
      projectionsExist &&
      compactP0EvidenceJson(row["expectedProjection"]) ===
        compactP0EvidenceJson(row["actualProjection"]) &&
      row["expectedProjectionSha256"] ===
        p0EvidenceDigest(row["expectedProjection"]) &&
      row["actualProjectionSha256"] ===
        p0EvidenceDigest(row["actualProjection"]) &&
      row["expectedProjectionSha256"] === row["actualProjectionSha256"] &&
      isSha256(row["runtimeResultSha256"]) &&
      row["matchedLiteralFixture"] === true;
    seen.add(caseId);
    if (!valid) {
      findings.push(finding(
        "P0_EVIDENCE_PRODUCTION_ROW",
        `observations.production.caseObservations[${String(index)}]`,
        "Production row is not uniquely hash-bound to its literal fixture, projection, and runtime result.",
      ));
    }
  }
  if (!hasValidSemanticDigest(record)) {
    findings.push(finding(
      "P0_EVIDENCE_PRODUCTION_DIGEST",
      "observations.production.semanticDigest",
      "Production observation semantic digest is invalid.",
    ));
  }
  return findings;
}

export function validateP0MutationObservation(
  value: unknown,
): readonly P0EvidenceFinding[] {
  const findings: P0EvidenceFinding[] = [];
  const record = isRecord(value) ? value : {};
  const controls = mutationControls();
  const expectedControlIds = controls.map(({ id }) => id);
  const expectedLinks = controls.flatMap(({ id, killerCaseIds }) =>
    killerCaseIds.map((caseId) => `${id}\u0000${caseId}`)
  ).sort(compare);
  const rows = Array.isArray(record["counterfactualExecutions"])
    ? record["counterfactualExecutions"].filter(isRecord)
    : [];
  const actualLinks = rows.flatMap((row) =>
    typeof row["controlId"] === "string" && typeof row["caseId"] === "string"
      ? [`${row["controlId"]}\u0000${row["caseId"]}`]
      : []
  ).sort(compare);
  if (
    record["schema"] !== MUTATION_SCHEMA ||
    record["suite"] !== "p0-semantic-counterfactuals" ||
    compactP0EvidenceJson(record["producer"]) !==
      compactP0EvidenceJson(MUTATION_PRODUCER) ||
    record["classification"] !==
      "reviewed contract projection mutation with real production baselines and checked-in literal fixture oracles" ||
    !exactStrings(record["controlIds"], expectedControlIds) ||
    record["controlsDefined"] !== P0_EXPECTED_COUNTS.mutationControls ||
    record["controlsExecuted"] !== P0_EXPECTED_COUNTS.mutationControls ||
    record["controlsKilled"] !== P0_EXPECTED_COUNTS.mutationControls ||
    record["controlsSurvived"] !== 0 ||
    record["reviewedKillerLinks"] !== P0_EXPECTED_COUNTS.mutationKillerLinks ||
    record["killerLinksExecuted"] !== P0_EXPECTED_COUNTS.mutationKillerLinks ||
    record["killerLinksKilled"] !== P0_EXPECTED_COUNTS.mutationKillerLinks ||
    record["killerLinksSurvived"] !== 0 ||
    record["sourceMutantsExecuted"] !== 0 ||
    record["status"] !== "pass" ||
    !exactStrings(actualLinks, expectedLinks)
  ) {
    findings.push(finding(
      "P0_EVIDENCE_MUTATION_INVENTORY",
      "observations.mutation",
      "Mutation evidence must execute and kill the exact 42 controls and 96 reviewed links.",
    ));
  }
  const seen = new Set<string>();
  const fixtures = caseFixtureRecords();
  const controlsById = new Map(
    mutationFixture.controls.map((control) => [control.id, control] as const),
  );
  for (const [index, row] of rows.entries()) {
    const identity = `${String(row["controlId"])}\u0000${String(row["caseId"])}`;
    const controlId = typeof row["controlId"] === "string"
      ? row["controlId"]
      : "";
    const caseId = typeof row["caseId"] === "string" ? row["caseId"] : "";
    const control = controlsById.get(controlId);
    const fixture = fixtures.get(caseId);
    const baselineExists = "baselineProjection" in row;
    const mutantExists = "mutantProjection" in row;
    const valid = !seen.has(identity) &&
      control !== undefined && fixture !== undefined &&
      row["operator"] === control.operator &&
      row["faultFamily"] === control.faultFamily &&
      row["executionKind"] === "executable-semantic-counterfactual" &&
      row["sourceMutationExecuted"] === false &&
      row["fixtureRecordSha256"] === p0EvidenceDigest(control) &&
      row["caseFixturePath"] === fixture.path &&
      row["caseFixtureRecordSha256"] === p0EvidenceDigest(fixture.row) &&
      row["oracleDecision"] === "killed" && row["killed"] === true &&
      isSha256(row["expectedProjectionSha256"]) &&
      row["expectedProjectionSha256"] === row["baselineProjectionSha256"] &&
      baselineExists && row["baselineProjectionSha256"] ===
        p0EvidenceDigest(row["baselineProjection"]) &&
      isSha256(row["mutantProjectionSha256"]) &&
      row["mutantProjectionSha256"] !== row["baselineProjectionSha256"] &&
      mutantExists && row["mutantProjectionSha256"] ===
        p0EvidenceDigest(row["mutantProjection"]) &&
      isSha256(row["baselineResultSha256"]) &&
      isSha256(row["mutantResultSha256"]) &&
      row["baselineResultSha256"] !== row["mutantResultSha256"] &&
      row["beforeSha256"] === row["baselineProjectionSha256"] &&
      row["afterSha256"] === row["mutantProjectionSha256"] &&
      Array.isArray(row["changedFields"]) && row["changedFields"].length > 0 &&
      row["executionDigest"] === p0EvidenceDigest(
        withoutKey(row, "executionDigest"),
      );
    seen.add(identity);
    if (!valid) {
      findings.push(finding(
        "P0_EVIDENCE_MUTATION_ROW",
        `observations.mutation.counterfactualExecutions[${String(index)}]`,
        "Mutation row lacks a unique real baseline, changed mutant projection, or killed oracle decision.",
      ));
    }
  }
  if (!hasValidSemanticDigest(record)) {
    findings.push(finding(
      "P0_EVIDENCE_MUTATION_DIGEST",
      "observations.mutation.semanticDigest",
      "Mutation observation semantic digest is invalid.",
    ));
  }
  return findings;
}

function namedCaseIds(): readonly string[] {
  return Object.freeze([
    ...timelineFixture.cases.map(({ id }) => id),
    ...realizationFixture.cases.map(({ id }) => id),
    ...loopFixture.cases.map(({ id }) => id),
    ...lawFixture.cases.map(({ id }) => id),
    ...limitFixture.structuralCases.map(({ id }) => id),
    ...limitFixture.counterBoundaries.map(({ id }) => id),
  ]);
}

function caseIdsFromJUnit(summary: P0JUnitSummary | null): ReadonlySet<string> {
  if (summary === null) return new Set();
  const ids = summary.cases.flatMap(({ name }) =>
    name.match(/P0-(?:TIME|REAL|LOOP|LAW|LIMIT-(?:STRUCT|SEAM))-\d{3}/gu) ?? []
  );
  return new Set(ids);
}

export function validateP0FocusedJUnit(
  summary: P0JUnitSummary | null,
): readonly P0EvidenceFinding[] {
  if (summary === null) {
    return [finding(
      "P0_EVIDENCE_SUITE_MISSING",
      "suite.junit",
      "Focused P0 JUnit could not be parsed.",
    )];
  }
  const findings: P0EvidenceFinding[] = [];
  const expectedFiles = [...P0_FOCUSED_TEST_FILES].sort(compare);
  if (
    summary.failures !== 0 || summary.errors !== 0 || summary.skipped !== 0 ||
    !exactStrings(summary.files, expectedFiles)
  ) {
    findings.push(finding(
      "P0_EVIDENCE_SUITE_SUMMARY",
      "suite.junit",
      "The exact focused file inventory must pass with zero failure, error, or skip.",
    ));
  }
  const caseIds = caseIdsFromJUnit(summary);
  const missingCases = namedCaseIds().filter((id) => !caseIds.has(id));
  if (missingCases.length > 0) {
    findings.push(finding(
      "P0_EVIDENCE_SUITE_CASES",
      "suite.junit",
      `Focused JUnit is missing named cases: ${missingCases.join(", ")}.`,
    ));
  }
  for (const owner of P0_PLANNED_EVIDENCE_OWNERS) {
    if (!summary.files.includes(owner)) {
      findings.push(finding(
        "P0_EVIDENCE_OWNER_MISSING",
        owner,
        "Frozen trace owner did not execute in the focused suite.",
      ));
    }
  }
  return findings;
}

export function buildP0TraceEvidence(
  summary: P0JUnitSummary | null,
  mutationObservation: unknown,
): readonly JsonRecord[] {
  const caseIds = caseIdsFromJUnit(summary);
  const files = new Set(summary?.files ?? []);
  const mutation = isRecord(mutationObservation) ? mutationObservation : {};
  const controlIds = new Set(
    Array.isArray(mutation["controlIds"])
      ? mutation["controlIds"].filter((item): item is string => typeof item === "string")
      : [],
  );
  return traceFixture.traces.map((trace) => {
    const missingCaseIds = trace.caseIds.filter((id) => !caseIds.has(id));
    const missingControlIds = trace.mutationControlIds.filter(
      (id) => !controlIds.has(id),
    );
    const missingOwnerFiles = trace.plannedEvidenceOwners.filter(
      (path) => !files.has(path),
    );
    const missingAuthorityIds = trace.authorityIds.filter((id) =>
      !provenanceFixture.authorities.some((authority) => authority.id === id)
    );
    return {
      schema: "changes.evidence.p0-trace-observation.v1",
      id: trace.id,
      caseIds: trace.caseIds,
      mutationControlIds: trace.mutationControlIds,
      ownerFiles: trace.plannedEvidenceOwners,
      authorityIds: trace.authorityIds,
      missingCaseIds,
      missingControlIds,
      missingOwnerFiles,
      missingAuthorityIds,
      outcome: missingCaseIds.length === 0 && missingControlIds.length === 0 &&
          missingOwnerFiles.length === 0 && missingAuthorityIds.length === 0
        ? "pass"
        : "fail",
    };
  });
}

export function buildP0NamedCriteria(
  traces: readonly JsonRecord[],
): readonly JsonRecord[] {
  return traceFixture.parentClaims.map((claim) => {
    const bound = traceFixture.traces.filter((trace) =>
      trace.parentClaimIds.includes(claim.id)
    );
    const traceIds = bound.map(({ id }) => id);
    const passing = new Set(
      traces.filter((trace) => trace["outcome"] === "pass").flatMap((trace) =>
        typeof trace["id"] === "string" ? [trace["id"]] : []
      ),
    );
    return {
      schema: "changes.evidence.p0-criterion-observation.v1",
      id: claim.id,
      traceIds,
      outcome: traceIds.length > 0 && traceIds.every((id) => passing.has(id))
        ? "pass"
        : "fail",
    };
  });
}

function reviewAcceptance(source: string): JsonRecord {
  const status = /^Human acceptance:\s*(accepted|pending)$/imu.exec(source)?.[1]
    ?? "missing";
  const checklist = [
    "timeline and loop goldens",
    "manual and frozen pitch authority",
    "transposition spelling witness",
    "refusal precedence",
    "work and memory ceilings",
  ];
  const missingChecklist = checklist.filter((item) =>
    !source.toLowerCase().includes(`- [x] ${item}`)
  );
  return {
    schema: "changes.evidence.p0-human-acceptance.v1",
    status,
    requiredByContract: true,
    missingChecklist,
    outcome: status === "accepted" && missingChecklist.length === 0
      ? "pass"
      : "pending",
  };
}

async function snapshotP0EvidenceInputs(): Promise<Readonly<{
  snapshot: P0InputSnapshot;
  findings: readonly P0EvidenceFinding[];
  controls: readonly P0EvidenceFinding[];
}>> {
  const findings: P0EvidenceFinding[] = [];
  const controls: P0EvidenceFinding[] = [];
  const components: InputComponent[] = [];
  for (const [group, paths] of Object.entries(INPUT_GROUPS)) {
    for (const path of paths) {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        findings.push(finding(
          "P0_EVIDENCE_INPUT_MISSING",
          path,
          `Required ${group} evidence input is missing.`,
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
      if (path.endsWith(".test.ts")) {
        controls.push(...inspectP0TestControls(path, new TextDecoder().decode(bytes)));
      }
    }
  }
  components.sort((left, right) => compare(
    `${left.group}\u0000${left.path}`,
    `${right.group}\u0000${right.path}`,
  ));
  const digest = p0EvidenceDigest(components);
  return {
    snapshot: Object.freeze({
      algorithm: "sha256-component-manifest-v1",
      digest,
      components: Object.freeze(components),
    }),
    findings,
    controls,
  };
}

function componentDigestMap(
  snapshot: P0InputSnapshot,
  group: string,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    snapshot.components.filter((item) => item.group === group).map((item) => [
      item.path,
      item.sha256,
    ]),
  );
}

function p0EvidencePaths(runId: string): Readonly<{
  directory: string;
  junit: string;
  stdout: string;
  stderr: string;
  validatorStdout: string;
  validatorStderr: string;
  metadata: string;
}> {
  const directory = `test-results/p0-evidence-runs/${runId}`;
  return Object.freeze({
    directory,
    junit: `${directory}/focused-tests.junit.xml`,
    stdout: `${directory}/focused-tests.stdout.txt`,
    stderr: `${directory}/focused-tests.stderr.txt`,
    validatorStdout: `${directory}/contract-validator.stdout.json`,
    validatorStderr: `${directory}/contract-validator.stderr.txt`,
    metadata: `${directory}/run-metadata.json`,
  });
}

function runEnvironment(runId: string): Readonly<Record<string, string>> {
  return Object.freeze({
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    P0_EVIDENCE_RUN_ID: runId,
  });
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

export function focusedP0SuiteCommand(runId: string): readonly string[] {
  return Object.freeze([
    "bun",
    "test",
    ...P0_FOCUSED_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--timeout=600000",
    "--reporter=junit",
    `--reporter-outfile=${p0EvidencePaths(runId).junit}`,
  ]);
}

async function atomicWrite(
  path: string,
  value: string | Uint8Array,
): Promise<void> {
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
): Promise<RawExecution & Readonly<{
  stdout: Uint8Array;
  stderr: Uint8Array;
}>> {
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
    exitCode,
    signal: child.signalCode,
    elapsedMs: performance.now() - started,
    stdoutPath,
    stderrPath,
    stdoutSha256: sha256Bytes(stdout),
    stderrSha256: sha256Bytes(stderr),
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

function withoutBuffers(
  run: RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>,
): RawExecution {
  return {
    command: run.command,
    environment: run.environment,
    exitCode: run.exitCode,
    signal: run.signal,
    elapsedMs: run.elapsedMs,
    stdoutPath: run.stdoutPath,
    stderrPath: run.stderrPath,
    stdoutSha256: run.stdoutSha256,
    stderrSha256: run.stderrSha256,
    resourceUsage: run.resourceUsage,
  };
}

function parseValidatorOutput(stdout: string): JsonRecord | null {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const value: unknown = JSON.parse(stdout.slice(start, end + 1));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function reviewFinding(acceptance: JsonRecord): P0EvidenceFinding[] {
  return acceptance["outcome"] === "pass"
    ? []
    : [finding(
        "P0_EVIDENCE_HUMAN_REVIEW_PENDING",
        "docs/evidence/P0_INDEPENDENT_TRACE_REVIEW.md",
        "The contract requires project-owner review before first golden acceptance.",
        null,
      )];
}

export function validateP0EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): readonly P0EvidenceFinding[] {
  const findings: P0EvidenceFinding[] = [];
  if (!isRecord(candidate)) {
    return [finding(
      "P0_EVIDENCE_LEDGER_SHAPE",
      OUTPUT_PATH,
      "Stored evidence must be one object.",
    )];
  }
  if (
    candidate["schema"] !== "changes.evidence.p0.v1" ||
    candidate["package"] !== "P0" || candidate["toolVersion"] !== TOOL_VERSION
  ) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_IDENTITY",
      OUTPUT_PATH,
      "Stored evidence identity or tool version is wrong.",
    ));
  }
  const input = isRecord(candidate["input"]) ? candidate["input"] : {};
  const pre = isRecord(input["pre"]) ? input["pre"] : {};
  const post = isRecord(input["post"]) ? input["post"] : {};
  if (pre["digest"] !== post["digest"]) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_INPUT_CHANGED",
      `${OUTPUT_PATH}#input`,
      "Stored evidence was produced while a bound P0 input changed.",
    ));
  }
  if (post["digest"] !== currentInputDigest) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_STALE",
      `${OUTPUT_PATH}#input.post.digest`,
      "Stored evidence does not bind the current P0 inputs.",
    ));
  }
  const suite = isRecord(candidate["suite"]) ? candidate["suite"] : {};
  if (
    suite["exitCode"] !== 0 || suite["failures"] !== 0 ||
    suite["errors"] !== 0 || suite["skipped"] !== 0 ||
    suite["retries"] !== 0 || suite["quarantined"] !== 0 ||
    !exactStrings(suite["files"], [...P0_FOCUSED_TEST_FILES].sort(compare))
  ) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_SUITE",
      `${OUTPUT_PATH}#suite`,
      "Stored evidence does not contain the exact zero-relaxation focused suite.",
    ));
  }
  const observations = Array.isArray(candidate["observations"])
    ? candidate["observations"].filter(isRecord)
    : [];
  const production = observations.find((row) =>
    row["schema"] === PRODUCTION_SCHEMA
  );
  const mutation = observations.find((row) => row["schema"] === MUTATION_SCHEMA);
  if (
    observations.length !== 2 || production === undefined ||
    mutation === undefined
  ) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_OBSERVATIONS",
      `${OUTPUT_PATH}#observations`,
      "Stored evidence requires exactly one production and one mutation observation.",
    ));
  }
  findings.push(...validateP0ProductionObservation(production));
  findings.push(...validateP0MutationObservation(mutation));
  const traces = Array.isArray(candidate["traces"])
    ? candidate["traces"].filter(isRecord)
    : [];
  if (
    traces.length !== P0_EXPECTED_COUNTS.traces ||
    traces.some((trace) => trace["outcome"] !== "pass")
  ) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_TRACES",
      `${OUTPUT_PATH}#traces`,
      "All 20 frozen traces require passing case, control, owner, and authority evidence.",
    ));
  }
  const criteria = Array.isArray(candidate["criteria"])
    ? candidate["criteria"].filter(isRecord)
    : [];
  if (
    criteria.length !== P0_EXPECTED_COUNTS.parentClaims ||
    criteria.some((criterion) => criterion["outcome"] !== "pass")
  ) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_CRITERIA",
      `${OUTPUT_PATH}#criteria`,
      "All eight parent claims require passing bound traces.",
    ));
  }
  const acceptance = isRecord(candidate["humanAcceptance"])
    ? candidate["humanAcceptance"]
    : {};
  findings.push(...reviewFinding(acceptance));
  const recordedFindings = Array.isArray(candidate["findings"])
    ? candidate["findings"].filter(isRecord)
    : [];
  const recordedTechnical = recordedFindings.filter((item) =>
    item["code"] !== "P0_EVIDENCE_HUMAN_REVIEW_PENDING"
  );
  if (recordedTechnical.length > 0) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_RECORDED_FINDINGS",
      `${OUTPUT_PATH}#findings`,
      "Stored evidence contains unresolved technical findings.",
    ));
  }
  const expectedOutcome = recordedTechnical.length > 0
    ? "fail"
    : acceptance["outcome"] === "pass" ? "pass" : "pending-human-review";
  if (candidate["outcome"] !== expectedOutcome) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_OUTCOME",
      `${OUTPUT_PATH}#outcome`,
      "Stored evidence outcome disagrees with its technical and human-review state.",
    ));
  }
  if (
    candidate["semanticDigest"] !==
      p0EvidenceDigest(withoutKey(candidate, "semanticDigest"))
  ) {
    findings.push(finding(
      "P0_EVIDENCE_LEDGER_DIGEST",
      `${OUTPUT_PATH}#semanticDigest`,
      "Stored evidence semantic digest is invalid.",
    ));
  }
  return findings.sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
}

export async function verifyP0Evidence(): Promise<JsonRecord> {
  const pre = await snapshotP0EvidenceInputs();
  const runId = pre.snapshot.digest.slice(0, 24);
  const paths = p0EvidencePaths(runId);
  await mkdir(paths.directory, { recursive: true });
  const environment = runEnvironment(runId);
  const validatorCommand = Object.freeze([
    "bun",
    "scripts/validate-p0-contract.ts",
  ]);
  const suiteCommand = focusedP0SuiteCommand(runId);
  const metadata = {
    schema: "changes.evidence.p0.run-metadata.v1",
    runId,
    commands: { validator: validatorCommand, suite: suiteCommand },
    environment,
    inputDigest: pre.snapshot.digest,
    seed: {
      kind: "none",
      randomInputs: 0,
      wallTimeAffectedSelection: false,
      deterministicFixtureOrder: true,
    },
  };
  await atomicWrite(paths.metadata, stableP0EvidenceJson(metadata));

  const validatorRun = await runRaw(
    validatorCommand,
    environment,
    paths.validatorStdout,
    paths.validatorStderr,
  );
  const suiteRun = await runRaw(
    suiteCommand,
    environment,
    paths.stdout,
    paths.stderr,
  );
  const junitFile = Bun.file(paths.junit);
  const junit = await junitFile.exists()
    ? sanitizeP0JUnit(await junitFile.text())
    : "";
  if (junit.length > 0) await atomicWrite(paths.junit, junit);
  const inspected = inspectP0JUnit(junit);
  const parsed = parseP0Observations(new TextDecoder().decode(suiteRun.stdout));
  const production = parsed.observations.find((row) =>
    row["schema"] === PRODUCTION_SCHEMA
  );
  const mutation = parsed.observations.find((row) => row["schema"] === MUTATION_SCHEMA);
  const post = await snapshotP0EvidenceInputs();
  const productionSources: Record<string, string> = {};
  for (const path of INPUT_GROUPS.production) {
    productionSources[path] = await Bun.file(path).text();
  }
  const boundary = inspectP0ProductionBoundary(productionSources);
  const traces = buildP0TraceEvidence(inspected.summary, mutation);
  const criteria = buildP0NamedCriteria(traces);
  const acceptance = reviewAcceptance(
    await Bun.file("docs/evidence/P0_INDEPENDENT_TRACE_REVIEW.md").text(),
  );
  const validator = parseValidatorOutput(
    new TextDecoder().decode(validatorRun.stdout),
  );
  const technicalFindings = [
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...inspected.findings,
    ...parsed.findings,
    ...boundary.findings,
    ...validateP0FocusedJUnit(inspected.summary),
    ...validateP0ProductionObservation(production),
    ...validateP0MutationObservation(mutation),
    ...(pre.snapshot.digest === post.snapshot.digest ? [] : [finding(
      "P0_EVIDENCE_INPUT_CHANGED",
      "input",
      "Evidence inputs changed during execution.",
    )]),
    ...(validatorRun.exitCode === 0 && validator?.["outcome"] === "pass"
      ? []
      : [finding(
          "P0_EVIDENCE_VALIDATOR",
          "validator",
          "P0 contract validator did not pass.",
        )]),
    ...(suiteRun.exitCode === 0 ? [] : [finding(
      "P0_EVIDENCE_SUITE_EXIT",
      "suite",
      `Focused suite exited ${String(suiteRun.exitCode)}.`,
    )]),
    ...traces.filter((trace) => trace["outcome"] !== "pass").map((trace) =>
      finding(
        "P0_EVIDENCE_TRACE",
        `traces#${String(trace["id"])}`,
        "Trace lacks required runtime case, control, owner, or authority evidence.",
        String(trace["id"]),
      )
    ),
    ...criteria.filter((criterion) => criterion["outcome"] !== "pass").map(
      (criterion) => finding(
        "P0_EVIDENCE_CRITERION",
        `criteria#${String(criterion["id"])}`,
        "Parent criterion lacks complete bound trace evidence.",
      ),
    ),
  ];
  const uniqueTechnical = [...new Map(technicalFindings.map((item) => [
    `${item.code}\u0000${item.path}\u0000${item.message}`,
    item,
  ])).values()].sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
  const humanFindings = reviewFinding(acceptance);
  const summary = inspected.summary;
  const payload: JsonRecord = {
    schema: "changes.evidence.p0.v1",
    schemaVersion: 1,
    package: "P0",
    toolVersion: TOOL_VERSION,
    runId,
    outcome: uniqueTechnical.length === 0 && humanFindings.length === 0
      ? "pass"
      : uniqueTechnical.length === 0 ? "pending-human-review" : "fail",
    findings: [...uniqueTechnical, ...humanFindings],
    environment: environmentEvidence(),
    seed: metadata.seed,
    applicability: P0_APPLICABILITY,
    input: { pre: pre.snapshot, post: post.snapshot },
    hashes: {
      contracts: componentDigestMap(post.snapshot, "contracts"),
      fixtures: componentDigestMap(post.snapshot, "authority"),
      production: componentDigestMap(post.snapshot, "production"),
      harness: componentDigestMap(post.snapshot, "harness"),
      review: componentDigestMap(post.snapshot, "review"),
      tooling: componentDigestMap(post.snapshot, "tooling"),
    },
    validator: {
      ...withoutBuffers(validatorRun),
      schema: validator?.["schema"] ?? null,
      outcome: validator?.["outcome"] ?? "fail",
      counts: validator?.["counts"] ?? null,
    },
    suite: {
      ...withoutBuffers(suiteRun),
      junitPath: paths.junit,
      junitSha256: sha256Bytes(new TextEncoder().encode(junit)),
      tests: summary?.tests ?? null,
      assertions: summary?.assertions ?? null,
      failures: summary?.failures ?? null,
      errors: summary?.errors ?? null,
      skipped: summary?.skipped ?? null,
      files: summary?.files ?? [],
      cases: summary?.cases ?? [],
      retries: 0,
      quarantined: 0,
    },
    observations: parsed.observations,
    staticBoundary: boundary.observation,
    traces,
    criteria,
    humanAcceptance: acceptance,
    authorityIds: provenanceFixture.authorities.map(({ id }) => id),
    inventory: {
      namedCaseIds: namedCaseIds(),
      mutationControlIds: mutationControls().map(({ id }) => id),
      mutationKillerLinks: mutationControls().flatMap(({ id, killerCaseIds }) =>
        killerCaseIds.map((caseId) => ({ controlId: id, caseId }))
      ),
      traceIds: traceFixture.traces.map(({ id }) => id),
      ownerFiles: P0_PLANNED_EVIDENCE_OWNERS,
    },
    runMetadata: {
      path: paths.metadata,
      sha256: sha256Bytes(
        new Uint8Array(await Bun.file(paths.metadata).arrayBuffer()),
      ),
    },
  };
  return {
    ...payload,
    semanticDigest: p0EvidenceDigest(payload),
  };
}

if (import.meta.main) {
  const evidence = await verifyP0Evidence();
  await atomicWrite(OUTPUT_PATH, stableP0EvidenceJson(evidence));
  const current = await snapshotP0EvidenceInputs();
  const findings = validateP0EvidenceCandidate(
    evidence,
    current.snapshot.digest,
  );
  console.log(stableP0EvidenceJson({
    schema: "changes.evidence.p0-verification-result.v1",
    package: "P0",
    outcome: findings.length === 0 ? "pass" : evidence["outcome"],
    runId: evidence["runId"],
    evidencePath: OUTPUT_PATH,
    counts: P0_EXPECTED_COUNTS,
    findings,
  }));
  if (findings.length > 0) process.exitCode = 1;
}
