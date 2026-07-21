import { createHash } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname } from "node:path";

import ts from "typescript";

import contractFixture from
  "../tests/fixtures/publication/f3-publication-contract.json";
import documentFixture from
  "../tests/fixtures/publication/document-cases.json";
import mutationFixture from
  "../tests/fixtures/publication/mutation-controls.json";
import operationFixture from
  "../tests/fixtures/publication/operation-state-cases.json";
import provenanceFixture from
  "../tests/fixtures/publication/provenance-ledger.json";
import traceFixture from "../tests/fixtures/publication/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

export type F3EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

type F3JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
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

const TOOL_VERSION = "changes.evidence.f3-verifier.v1";
const OUTPUT_PATH = "test-results/f3-evidence.json";
const OBSERVATION_MARKERS = [
  "F3_EVIDENCE_OBSERVATION ",
  "F3_CONFORMANCE_OBSERVATION ",
  "F3_STATIC_OBSERVATION ",
] as const;

export const F3_FOCUSED_TEST_FILES = Object.freeze([
  "tests/conformance/f3-mutation-controls.test.ts",
  "tests/conformance/f3-production-conformance.test.ts",
  "tests/integration/f3-document-validation.test.ts",
  "tests/static/f3-contract.test.ts",
  "tests/static/f3-evidence.test.ts",
  "tests/static/f3-production-policy.test.ts",
  "tests/static/validated-document-cast-policy.test.ts",
] as const);

export const F3_EXPECTED_COUNTS = Object.freeze({
  documentCases: 45,
  operationStateCases: 8,
  mutationControls: 37,
  mutationKillerLinks: 60,
  mutationLinkedCases: 46,
  traces: 12,
  authorities: 8,
  issueCodesCovered: 10,
  positiveCases: 17,
  semanticRefusals: 25,
  f2BoundaryRefusals: 3,
} as const);

export const F3_APPLICABILITY = Object.freeze([
  {
    id: "browser",
    applicability: "not-applicable:pure-synchronous-value-operation",
    owner: "U0/Q0/R0",
    proof: "F3 has no DOM, browser, network, or rendered surface.",
  },
  {
    id: "audio",
    applicability: "not-applicable:no-audio-or-playback-adapter",
    owner: "P0/S0/AU0",
    proof: "F3 accepts one value argument and performs zero adapter calls.",
  },
  {
    id: "accessibility",
    applicability: "not-applicable:no-user-interface",
    owner: "U0/U1/Q0",
    proof: "F3 publishes typed data and renders no controls or content.",
  },
  {
    id: "cancellation",
    applicability: "not-applicable:synchronous-bounded",
    owner: "F3",
    proof: "F3-OPSTATE-004",
  },
  {
    id: "stale-revision",
    applicability: "not-applicable:revision-free-value-operation",
    owner: "A0",
    proof: "F3-OPSTATE-005",
  },
  {
    id: "resume",
    applicability: "not-applicable:non-resumable",
    owner: "F3",
    proof: "F3-OPSTATE-006",
  },
  {
    id: "wall-time-cutoff",
    applicability: "forbidden:counts-only",
    owner: "F3",
    proof: "F3-OPSTATE-007; elapsed time is recorded but never gates music.",
  },
  {
    id: "downstream-command-import-recovery-reproof",
    applicability: "deferred:downstream-modules-not-yet-present",
    owner: "A0/C0/E0",
    proof:
      "F3 proves the sole cast and non-assignability now; each downstream owner must repeat its no-bypass integration proof.",
  },
] as const);

export const F3_INPUT_GROUPS = Object.freeze({
  contracts: [
    "docs/ARCHITECTURE.md",
    "docs/F3_PUBLICATION_CONTRACT.md",
    "package.json",
    "bun.lock",
    "bunfig.toml",
  ],
  production: [
    "src/application/document-validation-contract.ts",
    "src/application/document-validation.ts",
    "src/application/index.ts",
    "src/domain/validated-document.ts",
  ],
  authority: [
    "tests/fixtures/publication/document-cases.json",
    "tests/fixtures/publication/f3-publication-contract.json",
    "tests/fixtures/publication/mutation-controls.json",
    "tests/fixtures/publication/operation-state-cases.json",
    "tests/fixtures/publication/provenance-ledger.json",
    "tests/fixtures/publication/trace-ledger.json",
  ],
  harness: [
    "src/test-support/f3-publication-harness.ts",
    "src/test-support/f3-publication-materializer.ts",
    ...F3_FOCUSED_TEST_FILES,
  ],
  tooling: [
    "scripts/validate-f3-contract.ts",
    "scripts/verify-f3-evidence.ts",
    "scripts/verify.ts",
    "tsconfig.app.json",
    "tsconfig.base.json",
    "tsconfig.tests.json",
    "tsconfig.tools.json",
  ],
} as const);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function records(value: unknown, label: string): readonly JsonRecord[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => record(item, `${label}[${String(index)}]`));
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function finding(code: string, path: string, message: string): F3EvidenceFinding {
  return Object.freeze({ code, path, message });
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
    Object.entries(value).sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

export function stableF3EvidenceJson(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

export function f3EvidenceDigest(value: unknown): string {
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

function signedPayload(value: JsonRecord): JsonRecord {
  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  );
  return { ...payload, semanticDigest: f3EvidenceDigest(payload) };
}

function fixtureIds(value: unknown, field: string): readonly string[] {
  const root = record(value, "fixture");
  return records(root[field], `fixture.${field}`).map((item) => {
    if (typeof item["id"] !== "string") throw new Error(`${field} ID missing`);
    return item["id"];
  });
}

function documentCaseIds(): readonly string[] {
  return fixtureIds(documentFixture, "cases");
}

function operationCaseIds(): readonly string[] {
  return fixtureIds(operationFixture, "cases");
}

function mutationControls(): readonly JsonRecord[] {
  return records(record(mutationFixture, "mutation fixture")["controls"], "controls");
}

function mutationControlIds(): readonly string[] {
  return mutationControls().map((control) => String(control["id"]));
}

function mutationLinks(): readonly Readonly<{ controlId: string; caseId: string }>[] {
  return mutationControls().flatMap((control) => {
    const controlId = String(control["id"]);
    return strings(control["killerCaseIds"]).map((caseId) => ({ controlId, caseId }));
  });
}

function traceRows(): readonly JsonRecord[] {
  return records(record(traceFixture, "trace fixture")["traces"], "traces");
}

function authorityIds(): readonly string[] {
  return fixtureIds(provenanceFixture, "authorities");
}

function exactStringArray(actual: unknown, expected: readonly string[]): boolean {
  return JSON.stringify(strings(actual)) === JSON.stringify(expected);
}

function exactDigestMap(value: unknown, expectedKeys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return JSON.stringify(keys) === JSON.stringify(expectedKeys) &&
    Object.values(value).every(isSha256);
}

function validateSignedObservation(
  value: JsonRecord,
  path: string,
): F3EvidenceFinding[] {
  const digest = value["semanticDigest"];
  const expected = f3EvidenceDigest(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  ));
  return digest === expected
    ? []
    : [finding(
      "F3_EVIDENCE_OBSERVATION_DIGEST",
      path,
      "Observation semantic digest does not bind its canonical payload.",
    )];
}

function validateProductionObservation(value: JsonRecord): F3EvidenceFinding[] {
  const findings: F3EvidenceFinding[] = [];
  const documents = documentCaseIds();
  const operations = operationCaseIds();
  const allCases = [...documents, ...operations].sort(compare);
  if (
    value["schema"] !==
      "changes.evidence.f3-production-conformance-observation.v1" ||
    !exactStringArray(value["documentCaseIds"], documents) ||
    !exactStringArray(value["operationStateCaseIds"], operations) ||
    value["documentCasesObserved"] !== F3_EXPECTED_COUNTS.documentCases ||
    value["operationStateCasesObserved"] !==
      F3_EXPECTED_COUNTS.operationStateCases ||
    !exactDigestMap(value["caseHashes"], allCases)
  ) {
    findings.push(finding(
      "F3_EVIDENCE_PRODUCTION_INVENTORY",
      "observations.production",
      "Production observation must bind all 45 document and 8 operation-state cases exactly.",
    ));
  }
  const outcomes = value["outcomeCounts"];
  const runtimeExecutions = value["runtimeExecutions"];
  if (
    !isRecord(outcomes) ||
    outcomes["publication"] !== F3_EXPECTED_COUNTS.positiveCases ||
    outcomes["semanticRefusal"] !== F3_EXPECTED_COUNTS.semanticRefusals ||
    outcomes["f2BoundaryRefusal"] !== F3_EXPECTED_COUNTS.f2BoundaryRefusals ||
    value["privacyLeaks"] !== 0 ||
    value["mutableInputAliases"] !== 0 ||
    value["inputMutations"] !== 0 ||
    !isRecord(runtimeExecutions) ||
    runtimeExecutions["f2Decode"] !== 47 ||
    runtimeExecutions["f3Private"] !== 43 ||
    runtimeExecutions["f3Public"] !== 3 ||
    runtimeExecutions["deterministicReplay"] !== 1 ||
    runtimeExecutions["positionMetamorphic"] !== 1 ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "F3_EVIDENCE_PRODUCTION_OUTCOME",
      "observations.production",
      "Production outcomes, privacy, immutability, and transaction counts are not exact.",
    ));
  }
  const boundaries = value["maximumBoundaryCounters"];
  const maximumMeasures = isRecord(boundaries)
    ? boundaries["F3-DOC-037"]
    : undefined;
  const maximumEvents = isRecord(boundaries)
    ? boundaries["F3-DOC-038"]
    : undefined;
  if (
    !isRecord(maximumMeasures) ||
    maximumMeasures["sectionsVisited"] !== 64 ||
    maximumMeasures["measuresVisited"] !== 65_536 ||
    maximumMeasures["eventsVisited"] !== 0 ||
    !isRecord(maximumEvents) ||
    maximumEvents["eventsVisited"] !== 8_192 ||
    maximumEvents["symbolParseCalls"] !== 8_192 ||
    maximumEvents["resolutionCalls"] !== 8_192 ||
    maximumEvents["voicingChecks"] !== 8_192
  ) {
    findings.push(finding(
      "F3_EVIDENCE_BOUNDARY_COUNTERS",
      "observations.production.maximumBoundaryCounters",
      "Exact maximum-measure and maximum-event work counters are required.",
    ));
  }
  return findings;
}

function validateMutationObservation(value: JsonRecord): F3EvidenceFinding[] {
  const findings: F3EvidenceFinding[] = [];
  const controls = mutationControlIds();
  const links = mutationLinks();
  const linkedCases = sortedUnique(links.map(({ caseId }) => caseId));
  const executions = records(value["counterfactualExecutions"], "counterfactual executions");
  const executionKeys = executions.map((execution) =>
    `${String(execution["controlId"])}\u0000${String(execution["caseId"])}`
  );
  const expectedKeys = links.map(({ controlId, caseId }) => `${controlId}\u0000${caseId}`);
  const exactExecutions =
    JSON.stringify(executionKeys) === JSON.stringify(expectedKeys) &&
    executions.every((execution) =>
      execution["killed"] === true &&
      Array.isArray(execution["changedFields"]) &&
      execution["changedFields"].length > 0 &&
      isSha256(execution["beforeSha256"]) &&
      isSha256(execution["afterSha256"]) &&
      execution["beforeSha256"] !== execution["afterSha256"]
    );
  if (
    value["schema"] !==
      "changes.evidence.f3-mutation-conformance-observation.v1" ||
    value["claim"] !==
      "executable-semantic-counterfactuals-not-source-mutants" ||
    !exactStringArray(value["controlIds"], controls) ||
    value["controlsDefined"] !== F3_EXPECTED_COUNTS.mutationControls ||
    value["semanticOperatorsExecuted"] !==
      F3_EXPECTED_COUNTS.mutationControls ||
    value["semanticOperatorsKilled"] !==
      F3_EXPECTED_COUNTS.mutationControls ||
    value["semanticOperatorsSurvived"] !== 0 ||
    value["reviewedKillerLinks"] !== F3_EXPECTED_COUNTS.mutationKillerLinks ||
    value["killerLinksExecuted"] !== F3_EXPECTED_COUNTS.mutationKillerLinks ||
    value["killerLinksKilled"] !== F3_EXPECTED_COUNTS.mutationKillerLinks ||
    value["killerLinksSurvived"] !== 0 ||
    value["sourceMutantsExecuted"] !== 0 ||
    value["sourceMutantsKilled"] !== 0 ||
    !exactStringArray(value["linkedCaseIds"], linkedCases) ||
    value["linkedCasesObserved"] !== F3_EXPECTED_COUNTS.mutationLinkedCases ||
    value["mappedButUnobserved"] !== 0 ||
    !exactDigestMap(value["caseObservationDigests"], linkedCases) ||
    !exactDigestMap(value["controlExecutionDigests"], controls) ||
    !exactExecutions ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "F3_EVIDENCE_MUTATION_INVENTORY",
      "observations.mutation",
      "All 37 semantic operators and 60 reviewed killer links must execute and be killed with zero source-mutant claims.",
    ));
  }
  return findings;
}

function validateStaticObservation(value: JsonRecord): F3EvidenceFinding[] {
  const expectedImports = [
    "../domain",
    "../theory",
    "./document-validation-contract",
  ];
  const expectedExports = [
    "documentValidationOperations",
    "validateDocumentSemantics",
    "validateDocumentSemanticsWithEvidence",
  ];
  if (
    value["schema"] !==
      "changes.evidence.f3-static-boundary-observation.v1" ||
    !exactStringArray(value["allowedImports"], expectedImports) ||
    !exactStringArray(value["implementationExports"], expectedExports) ||
    !exactStringArray(value["castSites"], [
      "application/document-validation.ts",
    ]) ||
    value["allowedCastCount"] !== 1 ||
    value["privateEvidenceIndexMentions"] !== 0 ||
    value["moduleMutableBindings"] !== 0 ||
    value["asyncOrGeneratorFunctions"] !== 0 ||
    !exactStringArray(value["forbiddenRuntimeReferences"], []) ||
    !exactStringArray(value["fixtureOrTestSupportImports"], []) ||
    value["existingPublicationBypassPaths"] !== 0 ||
    value["shapeAssignableToValidatedDocument"] !== false ||
    value["operationObjectExact"] !== true ||
    value["status"] !== "pass"
  ) {
    return [finding(
      "F3_EVIDENCE_STATIC_BOUNDARY",
      "observations.static",
      "Static publication boundary, purity, private seam, and exact sole-cast evidence is not exact.",
    )];
  }
  return [];
}

export function validateF3ObservationRecords(
  values: readonly JsonRecord[],
): F3EvidenceFinding[] {
  const findings = values.flatMap((value, index) =>
    validateSignedObservation(value, `observations[${String(index)}]`)
  );
  const production = values.filter((value) =>
    value["schema"] ===
      "changes.evidence.f3-production-conformance-observation.v1"
  );
  const mutation = values.filter((value) =>
    value["schema"] ===
      "changes.evidence.f3-mutation-conformance-observation.v1"
  );
  const staticRows = values.filter((value) =>
    value["schema"] ===
      "changes.evidence.f3-static-boundary-observation.v1"
  );
  if (production.length !== 1 || mutation.length !== 1 || staticRows.length !== 1) {
    findings.push(finding(
      "F3_EVIDENCE_OBSERVATION_INVENTORY",
      "observations",
      "Exactly one production, one mutation, and one static observation are required.",
    ));
    return findings;
  }
  const productionRow = production[0];
  const mutationRow = mutation[0];
  const staticRow = staticRows[0];
  if (productionRow !== undefined) {
    findings.push(...validateProductionObservation(productionRow));
  }
  if (mutationRow !== undefined) {
    findings.push(...validateMutationObservation(mutationRow));
  }
  if (staticRow !== undefined) {
    findings.push(...validateStaticObservation(staticRow));
  }
  return findings.sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
}

export function parseF3Observations(output: string): Readonly<{
  records: readonly JsonRecord[];
  findings: readonly F3EvidenceFinding[];
}> {
  const parsed: JsonRecord[] = [];
  const findings: F3EvidenceFinding[] = [];
  for (const line of output.split(/\r?\n/u)) {
    const marker = OBSERVATION_MARKERS.find((candidate) =>
      line.startsWith(candidate)
    );
    if (marker === undefined) continue;
    try {
      parsed.push(record(JSON.parse(line.slice(marker.length)), "observation"));
    } catch (error) {
      findings.push(finding(
        "F3_EVIDENCE_OBSERVATION_JSON",
        "suite.stdout",
        error instanceof Error ? error.message : "Observation JSON is invalid.",
      ));
    }
  }
  findings.push(...validateF3ObservationRecords(parsed));
  return { records: parsed, findings };
}

function xmlUnescape(value: string): string {
  return value.replaceAll("&quot;", "\"").replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attributes(source: string): Map<string, string> {
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

export function inspectF3JUnit(xml: string): Readonly<{
  summary: F3JUnitSummary | null;
  findings: readonly F3EvidenceFinding[];
}> {
  try {
    const rootMatch = /<testsuites\b([^>]*)>/u.exec(xml);
    if (rootMatch?.[1] === undefined || !xml.includes("</testsuites>")) {
      throw new Error("missing testsuites root");
    }
    const root = attributes(rootMatch[1]);
    const tests = countAttribute(root.get("tests"), "tests");
    const assertions = countAttribute(root.get("assertions"), "assertions");
    const failures = countAttribute(root.get("failures"), "failures");
    const skipped = countAttribute(root.get("skipped"), "skipped");
    const errors = countAttribute(root.get("errors"), "errors", 0);
    const cases: Array<{ file: string; name: string }> = [];
    const pattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu;
    let testcase: RegExpExecArray | null;
    let observedFailures = 0;
    let observedErrors = 0;
    let observedSkipped = 0;
    while ((testcase = pattern.exec(xml)) !== null) {
      const body = testcase[2] ?? "";
      const parsed = attributes(testcase[1] ?? "");
      const file = parsed.get("file");
      const name = parsed.get("name");
      if (file === undefined || file.length === 0 || name === undefined || name.length === 0) {
        throw new Error("testcase requires file and name");
      }
      cases.push({ file: file.replaceAll("\\", "/"), name });
      observedFailures += (body.match(/<failure\b/gu) ?? []).length;
      observedErrors += (body.match(/<error\b/gu) ?? []).length;
      observedSkipped += (body.match(/<skipped\b/gu) ?? []).length;
    }
    const identities = cases.map(({ file, name }) => `${file}\u0000${name}`);
    if (new Set(identities).size !== identities.length) {
      throw new Error("duplicate testcase identity");
    }
    if (
      tests !== cases.length ||
      failures !== observedFailures ||
      errors !== observedErrors ||
      (skipped !== observedSkipped && (skipped === 0 || observedSkipped > skipped))
    ) {
      throw new Error("JUnit summary does not match testcase bodies");
    }
    return {
      summary: {
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
      },
      findings: [],
    };
  } catch (error) {
    return {
      summary: null,
      findings: [finding(
        "F3_EVIDENCE_JUNIT_INVALID",
        "suite.junit",
        error instanceof Error ? error.message : "JUnit is invalid.",
      )],
    };
  }
}

export function sanitizeF3JUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/gu,
    "$1",
  );
  if (/\bhostname\s*=/u.test(sanitized)) {
    throw new Error("F3_EVIDENCE_JUNIT_HOSTNAME");
  }
  return sanitized;
}

export function inspectF3TestControls(
  path: string,
  source: string,
): F3EvidenceFinding[] {
  const findings: F3EvidenceFinding[] = [];
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const builders = new Set(["test", "it", "describe"]);
  const namespaces = new Set<string>();
  const forbidden = new Set([
    "failing",
    "only",
    "quarantine",
    "skip",
    "skipIf",
    "todo",
    "todoIf",
  ]);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "bun:test") continue;
    const clause = statement.importClause;
    if (clause?.namedBindings !== undefined &&
      ts.isNamespaceImport(clause.namedBindings)) {
      namespaces.add(clause.namedBindings.name.text);
    }
    if (clause?.namedBindings !== undefined &&
      ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (["test", "it", "describe"].includes(imported)) {
          builders.add(element.name.text);
        }
      }
    }
  }
  const isBuilder = (node: ts.Expression): boolean =>
    ts.isIdentifier(node) && builders.has(node.text) ||
    ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaces.has(node.expression.text) &&
      builders.has(node.name.text);
  const report = (node: ts.Node, code: string, message: string): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    findings.push(finding(
      code,
      `${path}:${String(position.line + 1)}:${String(position.character + 1)}`,
      message,
    ));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && ["xit", "xdescribe"].includes(node.text)) {
      report(node, "F3_EVIDENCE_QUARANTINE", "x-prefixed test is forbidden.");
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      forbidden.has(node.name.text) &&
      isBuilder(node.expression)
    ) {
      report(
        node,
        node.name.text.startsWith("todo")
          ? "F3_EVIDENCE_TODO"
          : "F3_EVIDENCE_QUARANTINE",
        `Forbidden ${node.name.text} test control.`,
      );
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) &&
        /^(?:quarantine|quarantined)$/u.test(node.expression.text)) {
        report(node, "F3_EVIDENCE_QUARANTINE", "Quarantine call is forbidden.");
      }
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            ((ts.isIdentifier(property.name) && property.name.text === "retry") ||
              (ts.isStringLiteral(property.name) && property.name.text === "retry"))
          ) {
            report(property, "F3_EVIDENCE_RETRY", "Per-test retry is forbidden.");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function observationBySchema(
  values: readonly JsonRecord[],
  schema: string,
): JsonRecord | undefined {
  return values.find((value) => value["schema"] === schema);
}

export function buildF3TraceEvidence(
  values: readonly JsonRecord[],
): readonly JsonRecord[] {
  const production = observationBySchema(
    values,
    "changes.evidence.f3-production-conformance-observation.v1",
  );
  const mutation = observationBySchema(
    values,
    "changes.evidence.f3-mutation-conformance-observation.v1",
  );
  const caseHashes = isRecord(production?.["caseHashes"])
    ? production["caseHashes"]
    : {};
  const controlHashes = isRecord(mutation?.["controlExecutionDigests"])
    ? mutation["controlExecutionDigests"]
    : {};
  return traceRows().map((trace) => {
    const id = String(trace["id"]);
    const requiredCaseIds = strings(trace["requiredCaseIds"]);
    const mutationControlIds = strings(trace["mutationControlIds"]);
    const missingCaseIds = requiredCaseIds.filter((caseId) =>
      !isSha256(caseHashes[caseId])
    );
    const missingMutationControlIds = mutationControlIds.filter((controlId) =>
      !isSha256(controlHashes[controlId])
    );
    const caseEvidence = Object.fromEntries(requiredCaseIds.map((caseId) => [
      caseId,
      caseHashes[caseId] ?? null,
    ]));
    const mutationEvidence = Object.fromEntries(
      mutationControlIds.map((controlId) => [
        controlId,
        controlHashes[controlId] ?? null,
      ]),
    );
    return {
      id,
      parentClauseSha256: f3EvidenceDigest(trace["parentClause"]),
      proofKinds: trace["proofKinds"],
      requiredCaseIds,
      mutationControlIds,
      missingCaseIds,
      missingMutationControlIds,
      caseEvidenceSha256: f3EvidenceDigest(caseEvidence),
      mutationEvidenceSha256: f3EvidenceDigest(mutationEvidence),
      outcome: missingCaseIds.length === 0 && missingMutationControlIds.length === 0
        ? "pass"
        : "fail",
    };
  });
}

function paths(runId: string): Readonly<{
  directory: string;
  junit: string;
  stdout: string;
  stderr: string;
  validatorStdout: string;
  validatorStderr: string;
  metadata: string;
}> {
  const directory = `test-results/f3-evidence-runs/${runId}`;
  return {
    directory,
    junit: `${directory}/focused-tests.junit.xml`,
    stdout: `${directory}/focused-tests.stdout.txt`,
    stderr: `${directory}/focused-tests.stderr.txt`,
    validatorStdout: `${directory}/contract-validator.stdout.json`,
    validatorStderr: `${directory}/contract-validator.stderr.txt`,
    metadata: `${directory}/run-metadata.json`,
  };
}

function environment(runId: string): Readonly<Record<string, string>> {
  return {
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    F3_EVIDENCE_RUN_ID: runId,
  };
}

function suiteCommand(runId: string): readonly string[] {
  return [
    "bun",
    "test",
    ...F3_FOCUSED_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--reporter=junit",
    `--reporter-outfile=${paths(runId).junit}`,
  ];
}

function validatorCommand(): readonly string[] {
  return ["bun", "scripts/validate-f3-contract.ts"];
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
  runEnvironment: Readonly<Record<string, string>>,
  stdoutPath: string,
  stderrPath: string,
): Promise<RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>> {
  const started = performance.now();
  const child = Bun.spawn({
    cmd: [process.execPath, ...command.slice(1)],
    cwd: process.cwd(),
    env: { ...process.env, ...runEnvironment },
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
    environment: runEnvironment,
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

function withoutBuffers(
  value: RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>,
): RawExecution {
  const { stdout: _stdout, stderr: _stderr, ...recordValue } = value;
  void _stdout;
  void _stderr;
  return recordValue;
}

async function snapshotInputs(): Promise<Readonly<{
  snapshot: InputSnapshot;
  findings: readonly F3EvidenceFinding[];
  controls: readonly F3EvidenceFinding[];
}>> {
  const pathGroups = new Map<string, string>();
  const findings: F3EvidenceFinding[] = [];
  const controls: F3EvidenceFinding[] = [];
  for (const [group, groupPaths] of Object.entries(F3_INPUT_GROUPS)) {
    for (const path of groupPaths) {
      if (pathGroups.has(path)) {
        findings.push(finding(
          "F3_EVIDENCE_INPUT_DUPLICATE",
          path,
          `Input appears in ${String(pathGroups.get(path))} and ${group}.`,
        ));
      } else {
        pathGroups.set(path, group);
      }
    }
  }
  const components: InputComponent[] = [];
  for (const [path, group] of [...pathGroups].sort(([left], [right]) =>
    compare(left, right)
  )) {
    const file = Bun.file(path);
    if (!await file.exists()) {
      findings.push(finding(
        "F3_EVIDENCE_INPUT_MISSING",
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
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) {
      controls.push(...inspectF3TestControls(
        path,
        new TextDecoder().decode(bytes),
      ));
    }
    if (
      path === "bunfig.toml" &&
      !/^retry\s*=\s*0\s*$/mu.test(new TextDecoder().decode(bytes))
    ) {
      controls.push(finding(
        "F3_EVIDENCE_RETRY",
        "bunfig.toml:[test].retry",
        "Focused F3 evidence requires retry = 0.",
      ));
    }
  }
  return {
    snapshot: {
      algorithm: "sha256-component-manifest-v1",
      digest: f3EvidenceDigest(components),
      components,
    },
    findings,
    controls,
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

function parseValidatorOutput(output: string): Readonly<{
  value: JsonRecord | null;
  findings: readonly F3EvidenceFinding[];
}> {
  try {
    const value = record(JSON.parse(output), "validator output");
    const counts = value["counts"];
    if (
      value["schema"] !== "changes.validation.f3-contract.v1" ||
      value["package"] !== "F3" ||
      value["outcome"] !== "pass" ||
      !isRecord(counts) ||
      counts["documentCases"] !== F3_EXPECTED_COUNTS.documentCases ||
      counts["operationStateCases"] !== F3_EXPECTED_COUNTS.operationStateCases ||
      counts["mutationControls"] !== F3_EXPECTED_COUNTS.mutationControls ||
      counts["traces"] !== F3_EXPECTED_COUNTS.traces ||
      counts["authorities"] !== F3_EXPECTED_COUNTS.authorities ||
      counts["issueCodesCovered"] !== F3_EXPECTED_COUNTS.issueCodesCovered ||
      !Array.isArray(value["findings"]) || value["findings"].length !== 0
    ) {
      throw new Error("validator identity or counts are not exact");
    }
    return { value, findings: [] };
  } catch (error) {
    return {
      value: null,
      findings: [finding(
        "F3_EVIDENCE_VALIDATOR_OUTPUT",
        "validator.stdout",
        error instanceof Error ? error.message : "Validator output is invalid.",
      )],
    };
  }
}

export function validateF3EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): F3EvidenceFinding[] {
  if (!isRecord(candidate)) {
    return [finding(
      "F3_EVIDENCE_LEDGER_SHAPE",
      OUTPUT_PATH,
      "Ledger must be an object.",
    )];
  }
  const findings: F3EvidenceFinding[] = [];
  if (
    candidate["schema"] !== "changes.evidence.f3.v1" ||
    candidate["schemaVersion"] !== 1 ||
    candidate["package"] !== "F3" ||
    candidate["toolVersion"] !== TOOL_VERSION ||
    candidate["outcome"] !== "pass" ||
    !Array.isArray(candidate["findings"]) ||
    candidate["findings"].length !== 0
  ) {
    findings.push(finding(
      "F3_EVIDENCE_LEDGER_IDENTITY",
      OUTPUT_PATH,
      "Ledger identity or passing status is invalid.",
    ));
  }
  const expectedRunId = f3EvidenceDigest({
    toolVersion: TOOL_VERSION,
    inputDigest: currentInputDigest,
    contractVersion: record(contractFixture, "contract fixture")["contractVersion"],
  }).slice(0, 24);
  const runId = candidate["runId"];
  if (runId !== expectedRunId) {
    findings.push(finding(
      "F3_EVIDENCE_RUN_ID",
      `${OUTPUT_PATH}#runId`,
      "Run ID must derive from the verifier, current input digest, and reviewed contract version.",
    ));
  }
  if (
    JSON.stringify(canonical(candidate["environment"])) !==
      JSON.stringify(canonical(environmentEvidence()))
  ) {
    findings.push(finding(
      "F3_EVIDENCE_ENVIRONMENT",
      `${OUTPUT_PATH}#environment`,
      "Stored runtime environment differs from the current environment.",
    ));
  }
  if (
    JSON.stringify(canonical(candidate["applicability"])) !==
      JSON.stringify(canonical(F3_APPLICABILITY))
  ) {
    findings.push(finding(
      "F3_EVIDENCE_APPLICABILITY",
      `${OUTPUT_PATH}#applicability`,
      "Applicability and downstream ownership must match exactly.",
    ));
  }
  const input = candidate["input"];
  if (
    !isRecord(input) || !isRecord(input["pre"]) || !isRecord(input["post"]) ||
    input["pre"]["digest"] !== input["post"]["digest"] ||
    input["pre"]["digest"] !== currentInputDigest
  ) {
    findings.push(finding(
      "F3_EVIDENCE_INPUT_STALE",
      `${OUTPUT_PATH}#input`,
      "Pre, post, and current input snapshots must match.",
    ));
  }
  const suite = candidate["suite"];
  const expectedPaths = paths(expectedRunId);
  const expectedEnvironment = environment(expectedRunId);
  if (
    !isRecord(suite) || suite["exitCode"] !== 0 ||
    suite["failures"] !== 0 || suite["errors"] !== 0 ||
    suite["skipped"] !== 0 || suite["todos"] !== 0 ||
    suite["retries"] !== 0 || suite["quarantined"] !== 0 ||
    JSON.stringify(suite["files"]) !== JSON.stringify(F3_FOCUSED_TEST_FILES)
  ) {
    findings.push(finding(
      "F3_EVIDENCE_SUITE",
      `${OUTPUT_PATH}#suite`,
      "Focused suite must pass its exact file inventory with no relaxed controls.",
    ));
  }
  if (
    !isRecord(suite) ||
    JSON.stringify(suite["command"]) !== JSON.stringify(suiteCommand(expectedRunId)) ||
    JSON.stringify(canonical(suite["environment"])) !==
      JSON.stringify(canonical(expectedEnvironment)) ||
    suite["stdoutPath"] !== expectedPaths.stdout ||
    suite["stderrPath"] !== expectedPaths.stderr ||
    suite["junitPath"] !== expectedPaths.junit ||
    !isSha256(suite["stdoutSha256"]) ||
    !isSha256(suite["stderrSha256"]) ||
    !isSha256(suite["junitSha256"]) ||
    suite["signal"] !== null
  ) {
    findings.push(finding(
      "F3_EVIDENCE_SUITE_IDENTITY",
      `${OUTPUT_PATH}#suite`,
      "Focused suite command, environment, paths, hashes, and signal must be run-ID exact.",
    ));
  }
  const validator = candidate["validator"];
  if (!isRecord(validator) || validator["exitCode"] !== 0 || validator["outcome"] !== "pass") {
    findings.push(finding(
      "F3_EVIDENCE_VALIDATOR",
      `${OUTPUT_PATH}#validator`,
      "Independent F3 contract validation must pass.",
    ));
  }
  if (
    !isRecord(validator) ||
    validator["schema"] !== "changes.validation.f3-contract.v1" ||
    JSON.stringify(validator["command"]) !== JSON.stringify(validatorCommand()) ||
    JSON.stringify(canonical(validator["environment"])) !==
      JSON.stringify(canonical(expectedEnvironment)) ||
    validator["stdoutPath"] !== expectedPaths.validatorStdout ||
    validator["stderrPath"] !== expectedPaths.validatorStderr ||
    !isSha256(validator["stdoutSha256"]) ||
    !isSha256(validator["stderrSha256"]) ||
    validator["signal"] !== null
  ) {
    findings.push(finding(
      "F3_EVIDENCE_VALIDATOR_IDENTITY",
      `${OUTPUT_PATH}#validator`,
      "Validator command, environment, paths, hashes, schema, and signal must be run-ID exact.",
    ));
  }
  const runMetadata = candidate["runMetadata"];
  if (
    !isRecord(runMetadata) ||
    runMetadata["path"] !== expectedPaths.metadata ||
    !isSha256(runMetadata["sha256"])
  ) {
    findings.push(finding(
      "F3_EVIDENCE_RUN_METADATA",
      `${OUTPUT_PATH}#runMetadata`,
      "Run metadata path and hash must be run-ID exact.",
    ));
  }
  if (
    !Array.isArray(candidate["traces"]) ||
    candidate["traces"].length !== F3_EXPECTED_COUNTS.traces ||
    candidate["traces"].some((trace) =>
      !isRecord(trace) || trace["outcome"] !== "pass"
    )
  ) {
    findings.push(finding(
      "F3_EVIDENCE_TRACE",
      `${OUTPUT_PATH}#traces`,
      "All 12 parent trace clauses must have case and mutation evidence.",
    ));
  }
  if (!exactStringArray(candidate["authorityIds"], authorityIds())) {
    findings.push(finding(
      "F3_EVIDENCE_AUTHORITY",
      `${OUTPUT_PATH}#authorityIds`,
      "All eight reviewed provenance authorities must remain bound.",
    ));
  }
  const observations = Array.isArray(candidate["observations"])
    ? candidate["observations"].filter(isRecord)
    : [];
  findings.push(...validateF3ObservationRecords(observations));
  return findings.sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
}

async function validateStoredEvidenceFiles(
  candidate: unknown,
): Promise<F3EvidenceFinding[]> {
  if (!isRecord(candidate) || typeof candidate["runId"] !== "string") return [];
  const findings: F3EvidenceFinding[] = [];
  const validator = candidate["validator"];
  const suite = candidate["suite"];
  const runMetadata = candidate["runMetadata"];
  const checks: readonly Readonly<{
    path: unknown;
    expectedSha256: unknown;
    label: string;
  }>[] = [
    {
      path: isRecord(validator) ? validator["stdoutPath"] : undefined,
      expectedSha256: isRecord(validator) ? validator["stdoutSha256"] : undefined,
      label: "validator.stdout",
    },
    {
      path: isRecord(validator) ? validator["stderrPath"] : undefined,
      expectedSha256: isRecord(validator) ? validator["stderrSha256"] : undefined,
      label: "validator.stderr",
    },
    {
      path: isRecord(suite) ? suite["stdoutPath"] : undefined,
      expectedSha256: isRecord(suite) ? suite["stdoutSha256"] : undefined,
      label: "suite.stdout",
    },
    {
      path: isRecord(suite) ? suite["stderrPath"] : undefined,
      expectedSha256: isRecord(suite) ? suite["stderrSha256"] : undefined,
      label: "suite.stderr",
    },
    {
      path: isRecord(suite) ? suite["junitPath"] : undefined,
      expectedSha256: isRecord(suite) ? suite["junitSha256"] : undefined,
      label: "suite.junit",
    },
    {
      path: isRecord(runMetadata) ? runMetadata["path"] : undefined,
      expectedSha256: isRecord(runMetadata) ? runMetadata["sha256"] : undefined,
      label: "runMetadata",
    },
  ];
  for (const check of checks) {
    if (typeof check.path !== "string" || !isSha256(check.expectedSha256)) {
      findings.push(finding(
        "F3_EVIDENCE_STORED_FILE_IDENTITY",
        check.label,
        "Stored evidence path and hash are required.",
      ));
      continue;
    }
    const file = Bun.file(check.path);
    if (!await file.exists()) {
      findings.push(finding(
        "F3_EVIDENCE_STORED_FILE_MISSING",
        check.path,
        `${check.label} is missing.`,
      ));
      continue;
    }
    const actual = sha256Bytes(new Uint8Array(await file.arrayBuffer()));
    if (actual !== check.expectedSha256) {
      findings.push(finding(
        "F3_EVIDENCE_STORED_FILE_HASH",
        check.path,
        `${check.label} does not match its recorded SHA-256.`,
      ));
    }
  }
  if (isRecord(suite) && typeof suite["stdoutPath"] === "string") {
    const output = await Bun.file(suite["stdoutPath"]).text();
    const parsed = parseF3Observations(output);
    findings.push(...parsed.findings);
    if (
      JSON.stringify(canonical(parsed.records)) !==
        JSON.stringify(canonical(candidate["observations"]))
    ) {
      findings.push(finding(
        "F3_EVIDENCE_STORED_OBSERVATIONS",
        suite["stdoutPath"],
        "Stored suite observations differ from the ledger observations.",
      ));
    }
  }
  if (isRecord(suite) && typeof suite["junitPath"] === "string") {
    const junit = await Bun.file(suite["junitPath"]).text();
    if (/\bhostname\s*=/u.test(junit)) {
      findings.push(finding(
        "F3_EVIDENCE_JUNIT_HOSTNAME",
        suite["junitPath"],
        "Stored JUnit still contains a machine hostname.",
      ));
    }
    findings.push(...inspectF3JUnit(junit).findings);
  }
  if (isRecord(validator) && typeof validator["stdoutPath"] === "string") {
    findings.push(...parseValidatorOutput(
      await Bun.file(validator["stdoutPath"]).text(),
    ).findings);
  }
  return findings;
}

async function verifyF3Evidence(): Promise<JsonRecord> {
  const pre = await snapshotInputs();
  const runId = f3EvidenceDigest({
    toolVersion: TOOL_VERSION,
    inputDigest: pre.snapshot.digest,
    contractVersion: record(contractFixture, "contract fixture")["contractVersion"],
  }).slice(0, 24);
  const runPaths = paths(runId);
  await mkdir(runPaths.directory, { recursive: true });
  const runEnvironment = environment(runId);
  const metadata = {
    schema: "changes.evidence.f3.run-metadata.v1",
    runId,
    commands: {
      validator: validatorCommand(),
      suite: suiteCommand(runId),
    },
    environment: runEnvironment,
    inputDigest: pre.snapshot.digest,
  };
  await atomicWrite(runPaths.metadata, stableF3EvidenceJson(metadata));
  const validatorRun = await runRaw(
    validatorCommand(),
    runEnvironment,
    runPaths.validatorStdout,
    runPaths.validatorStderr,
  );
  const validatorParsed = parseValidatorOutput(
    new TextDecoder().decode(validatorRun.stdout),
  );
  const suiteRun = await runRaw(
    suiteCommand(runId),
    runEnvironment,
    runPaths.stdout,
    runPaths.stderr,
  );
  const rawJunit = await Bun.file(runPaths.junit).text();
  const junit = sanitizeF3JUnit(rawJunit);
  await atomicWrite(runPaths.junit, junit);
  const inspected = inspectF3JUnit(junit);
  const parsedObservations = parseF3Observations(
    new TextDecoder().decode(suiteRun.stdout),
  );
  const post = await snapshotInputs();
  const summary = inspected.summary;
  const traces = buildF3TraceEvidence(parsedObservations.records);
  const structuralFindings = [
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...validatorParsed.findings,
    ...inspected.findings,
    ...parsedObservations.findings,
    ...(pre.snapshot.digest === post.snapshot.digest ? [] : [finding(
      "F3_EVIDENCE_INPUT_CHANGED",
      "input",
      "Evidence inputs changed during execution.",
    )]),
    ...(validatorRun.exitCode === 0 ? [] : [finding(
      "F3_EVIDENCE_VALIDATOR_EXIT",
      "validator",
      `Validator exited ${String(validatorRun.exitCode)}.`,
    )]),
    ...(suiteRun.exitCode === 0 ? [] : [finding(
      "F3_EVIDENCE_SUITE_EXIT",
      "suite",
      `Focused suite exited ${String(suiteRun.exitCode)}.`,
    )]),
    ...(summary !== null &&
      summary.failures === 0 && summary.errors === 0 && summary.skipped === 0 &&
      JSON.stringify(summary.files) === JSON.stringify(F3_FOCUSED_TEST_FILES)
      ? []
      : [finding(
        "F3_EVIDENCE_SUITE_SUMMARY",
        "suite.junit",
        "JUnit must show the exact focused files with zero failure, error, or skip.",
      )]),
    ...traces.filter((trace) => trace["outcome"] !== "pass").map((trace) =>
      finding(
        "F3_EVIDENCE_TRACE",
        `traces#${String(trace["id"])}`,
        "Trace is missing case or mutation evidence.",
      )
    ),
  ];
  const uniqueFindings = [...new Map(structuralFindings.map((item) => [
    `${item.code}\u0000${item.path}\u0000${item.message}`,
    item,
  ])).values()].sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
  const validatorRecord = {
    ...withoutBuffers(validatorRun),
    schema: validatorParsed.value?.["schema"] ?? null,
    outcome: validatorParsed.value?.["outcome"] ?? "fail",
    counts: validatorParsed.value?.["counts"] ?? null,
  };
  const suiteRecord = {
    ...withoutBuffers(suiteRun),
    junitPath: runPaths.junit,
    junitSha256: sha256Bytes(new TextEncoder().encode(junit)),
    tests: summary?.tests ?? 0,
    assertions: summary?.assertions ?? 0,
    failures: summary?.failures ?? 0,
    errors: summary?.errors ?? 0,
    skipped: summary?.skipped ?? 0,
    todos: [...pre.controls, ...post.controls].filter(({ code }) =>
      code === "F3_EVIDENCE_TODO"
    ).length,
    retries: [...pre.controls, ...post.controls].filter(({ code }) =>
      code === "F3_EVIDENCE_RETRY"
    ).length,
    quarantined: [...pre.controls, ...post.controls].filter(({ code }) =>
      code === "F3_EVIDENCE_QUARANTINE"
    ).length,
    files: summary?.files ?? [],
    cases: summary?.cases ?? [],
  };
  const preliminary: JsonRecord = {
    schema: "changes.evidence.f3.v1",
    schemaVersion: 1,
    package: "F3",
    toolVersion: TOOL_VERSION,
    runId,
    outcome: uniqueFindings.length === 0 ? "pass" : "fail",
    findings: uniqueFindings,
    contract: {
      schema: record(contractFixture, "contract fixture")["schema"],
      version: record(contractFixture, "contract fixture")["contractVersion"],
      reviewedFileSha256: record(contractFixture, "contract fixture")["reviewedFileSha256"],
    },
    environment: environmentEvidence(),
    applicability: F3_APPLICABILITY,
    input: { pre: pre.snapshot, post: post.snapshot },
    runMetadata: {
      path: runPaths.metadata,
      sha256: sha256Bytes(new Uint8Array(
        await Bun.file(runPaths.metadata).arrayBuffer(),
      )),
    },
    validator: validatorRecord,
    suite: suiteRecord,
    observations: parsedObservations.records,
    traces,
    authorityIds: authorityIds(),
    mutationEvidence: {
      classification: "executable-semantic-counterfactuals-not-source-mutants",
      reviewedControls: F3_EXPECTED_COUNTS.mutationControls,
      reviewedKillerLinks: F3_EXPECTED_COUNTS.mutationKillerLinks,
      sourceMutantsExecuted: 0,
    },
    terminationEvidence: {
      semanticBounds: "counts-only",
      wallTimeGating: false,
      elapsedTimeRecorded: true,
      maximumMeasureCase: "F3-DOC-037",
      maximumEventCase: "F3-DOC-038",
    },
  };
  const candidateFindings = [
    ...await validateStoredEvidenceFiles(preliminary),
    ...validateF3EvidenceCandidate(preliminary, post.snapshot.digest),
  ];
  const ledger = candidateFindings.length === 0
    ? preliminary
    : {
      ...preliminary,
      outcome: "fail",
      findings: candidateFindings,
    };
  await atomicWrite(OUTPUT_PATH, stableF3EvidenceJson(ledger));
  return ledger;
}

async function checkExisting(): Promise<Readonly<{
  outcome: "pass" | "fail";
  findings: readonly F3EvidenceFinding[];
}>> {
  try {
    const candidate: unknown = await Bun.file(OUTPUT_PATH).json();
    const current = await snapshotInputs();
    const findings = [
      ...current.findings,
      ...current.controls,
      ...await validateStoredEvidenceFiles(candidate),
      ...validateF3EvidenceCandidate(candidate, current.snapshot.digest),
    ];
    return { outcome: findings.length === 0 ? "pass" : "fail", findings };
  } catch (error) {
    return {
      outcome: "fail",
      findings: [finding(
        "F3_EVIDENCE_LEDGER_MISSING",
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
      throw new Error("Usage: bun scripts/verify-f3-evidence.ts [--check]");
    }
    if (args[0] === "--check") {
      const result = await checkExisting();
      console.log(stableF3EvidenceJson({
        schema: "changes.evidence.f3.summary.v1",
        mode: "check",
        ledgerPath: OUTPUT_PATH,
        ...result,
      }).trimEnd());
      process.exitCode = result.outcome === "pass" ? 0 : 1;
    } else {
      const evidence = await verifyF3Evidence();
      const suite = record(evidence["suite"], "suite");
      console.log(stableF3EvidenceJson({
        schema: "changes.evidence.f3.summary.v1",
        mode: "focused-package",
        ledgerPath: OUTPUT_PATH,
        outcome: evidence["outcome"],
        runId: evidence["runId"],
        tests: suite["tests"],
        assertions: suite["assertions"],
        traces: Array.isArray(evidence["traces"])
          ? evidence["traces"].length
          : 0,
        semanticOperatorsKilled: F3_EXPECTED_COUNTS.mutationControls,
        killerLinksKilled: F3_EXPECTED_COUNTS.mutationKillerLinks,
        sourceMutantsExecuted: 0,
        findings: evidence["findings"],
      }).trimEnd());
      process.exitCode = evidence["outcome"] === "pass" ? 0 : 1;
    }
  } catch (error) {
    console.error(stableF3EvidenceJson({
      schema: TOOL_VERSION,
      outcome: "tool-failure",
      message: error instanceof Error
        ? error.message
        : "F3 evidence verification failed.",
    }).trimEnd());
    process.exitCode = 2;
  }
}

export const f3EvidenceTestSupport = Object.freeze({
  signedPayload,
});
