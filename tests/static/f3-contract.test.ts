import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";

import {
  DOCUMENT_AUTO_RANGE_POLICY,
  DOCUMENT_EVENT_SEMANTIC_CHECK_ORDER,
  DOCUMENT_MEASURE_POLICY_ID,
  DOCUMENT_MEASURE_POLICY_VERSION,
  DOCUMENT_MEASURE_SEMANTIC_CHECK_ORDER,
  DOCUMENT_SEMANTIC_DIAGNOSTIC_ORDER,
  DOCUMENT_SEMANTIC_ISSUE_CODES,
  DOCUMENT_SEMANTICS_POLICY_ID,
  DOCUMENT_SEMANTICS_POLICY_VERSION,
  DOCUMENT_SLASH_BASS_PROJECTION,
  DOCUMENT_SOURCE_AST_FIELDS,
  DOCUMENT_SOURCE_AST_POLICY_ID,
  DOCUMENT_SOURCE_AST_POLICY_VERSION,
  DOCUMENT_SOURCE_PARSE_ACCIDENTAL_STYLE,
  DOCUMENT_STORED_PITCH_COMPARISON,
  DOCUMENT_STORED_PITCH_POLICY_ID,
  DOCUMENT_STORED_PITCH_POLICY_VERSION,
  DOCUMENT_VALIDATION_APPLICABILITY,
  DOCUMENT_VALIDATION_CONTRACT_SCHEMA,
  DOCUMENT_VALIDATION_OPERATION_NAMES,
  DOCUMENT_VALIDATION_TERMINATIONS,
  DOCUMENT_VALIDATION_WORK_COUNTER_NAMES,
  MAX_F3_EVENTS_VISITED,
  MAX_F3_EXACT_BEAT_ADDITIONS,
  MAX_F3_ISSUES_PER_EVENT,
  MAX_F3_ISSUES_PER_MEASURE,
  MAX_F3_MEASURES_VISITED,
  MAX_F3_PUBLICATION_NODE_VISITS,
  MAX_F3_RESOLUTION_CALLS,
  MAX_F3_SECTIONS_VISITED,
  MAX_F3_SEMANTIC_ISSUES,
  MAX_F3_SYMBOL_PARSE_CALLS,
  MAX_F3_TRACKED_RECORDS,
  MAX_F3_VOICING_CHECKS,
  type DocumentSemanticIssue,
  type DocumentSemanticValidationResult,
  type DocumentValidationOperationName,
  type DocumentValidationOperations,
  type DocumentValidationTermination,
  type DocumentValidationWorkCounters,
  type ValidateDocumentSemantics,
} from "../../src/application";
import type {
  F3SemanticIssueCode,
  ProgressionDocumentShapeV2,
  ValidatedDocument,
} from "../../src/domain";
import {
  F3_REVIEWED_APPLICABILITY,
  F3_REVIEWED_BYTE_DIGESTS,
  F3_REVIEWED_COMPANIONS,
  F3_REVIEWED_IDENTITIES,
  F3_REVIEWED_ISSUE_CODES,
  F3_REVIEWED_LIMITS,
  F3_REVIEWED_ORDERING,
  F3_REVIEWED_POLICIES,
  F3_REVIEWED_PUBLIC_SURFACE,
  F3_REVIEWED_TERMINATIONS,
  F3_REVIEWED_WORK_COUNTER_ORDER,
  validateF3Contract,
  type F3ContractValidationReport,
} from "../../scripts/validate-f3-contract";

setDefaultTimeout(60_000);

type JsonObject = Record<string, unknown>;
type Assert<Value extends true> = Value;
type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type Not<Value extends boolean> = Value extends true ? false : true;
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value
  ? true
  : false;

type Success = Extract<DocumentSemanticValidationResult, { ok: true }>;
type Failure = Extract<DocumentSemanticValidationResult, { ok: false }>;

const typeAssertions: readonly [
  Assert<Equal<DocumentValidationOperationName, "validateDocumentSemantics">>,
  Assert<
    Equal<
      DocumentValidationTermination,
      "complete-refusal" | "complete-success"
    >
  >,
  Assert<
    Equal<
      Parameters<ValidateDocumentSemantics>,
      [candidate: ProgressionDocumentShapeV2]
    >
  >,
  Assert<
    Equal<
      ReturnType<ValidateDocumentSemantics>,
      DocumentSemanticValidationResult
    >
  >,
  Assert<Equal<keyof DocumentValidationOperations, "validateDocumentSemantics">>,
  Assert<Equal<keyof Success, "ok" | "value" | "warnings">>,
  Assert<Equal<Success["value"], ValidatedDocument>>,
  Assert<Equal<Success["warnings"], readonly []>>,
  Assert<Equal<keyof Failure, "errors" | "ok">>,
  Assert<
    Failure["errors"] extends readonly [
      DocumentSemanticIssue,
      ...DocumentSemanticIssue[],
    ]
      ? true
      : false
  >,
  Assert<Equal<keyof DocumentSemanticIssue, "code" | "message" | "path">>,
  Assert<Equal<DocumentSemanticIssue["code"], F3SemanticIssueCode>>,
  Assert<
    Equal<
      keyof DocumentValidationWorkCounters,
      | "eventsVisited"
      | "exactBeatAdditions"
      | "issuesEmitted"
      | "measuresVisited"
      | "publicationNodeVisits"
      | "resolutionCalls"
      | "sectionsVisited"
      | "symbolParseCalls"
      | "voicingChecks"
    >
  >,
  Assert<Not<HasKey<DocumentValidationOperations, "evidence">>>,
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];

const fixtureRoot = new URL("../fixtures/publication", import.meta.url).pathname;
const contractSourcePath = new URL(
  "../../src/application/document-validation-contract.ts",
  import.meta.url,
).pathname;
const applicationIndexPath = new URL(
  "../../src/application/index.ts",
  import.meta.url,
).pathname;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`F3_TEST_OBJECT: ${label}`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`F3_TEST_ARRAY: ${label}`);
  return value;
}

async function readJsonObject(path: string): Promise<JsonObject> {
  return requireObject(JSON.parse(await readFile(path, "utf8")), path);
}

async function mutateJson(
  root: string,
  filename: string,
  mutate: (value: JsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const value = await readJsonObject(path);
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "jcpe f3 contract Ω path-"));
  const root = join(parent, "reviewed publication fixtures");
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function findingCodes(report: F3ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

async function expectRejected(
  root: string,
  ...codes: readonly string[]
): Promise<F3ContractValidationReport> {
  const report = await validateF3Contract(root);
  expect(report.outcome).toBe("fail");
  const actual = findingCodes(report);
  for (const code of codes) expect(actual).toContain(code);
  return report;
}

function countValidatedDocumentCasts(source: string): number {
  const file = ts.createSourceFile(
    contractSourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let casts = 0;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      node.type.getText(file) === "ValidatedDocument"
    ) {
      casts += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return casts;
}

describe("F3 semantic publication contract", () => {
  test("freezes the exact public type shapes", () => {
    expect([...typeAssertions]).toEqual(
      Array.from({ length: typeAssertions.length }, () => true),
    );
  });

  test("matches every reviewed identity, policy, ordering rule, and count bound", () => {
    expect(DOCUMENT_VALIDATION_CONTRACT_SCHEMA).toBe(
      F3_REVIEWED_PUBLIC_SURFACE.contractSchema,
    );
    expect(DOCUMENT_VALIDATION_OPERATION_NAMES).toEqual(
      F3_REVIEWED_PUBLIC_SURFACE.operationOrder,
    );
    expect({
      semanticPolicy: {
        id: DOCUMENT_SEMANTICS_POLICY_ID,
        version: DOCUMENT_SEMANTICS_POLICY_VERSION,
      },
      sourceAstPolicy: {
        id: DOCUMENT_SOURCE_AST_POLICY_ID,
        version: DOCUMENT_SOURCE_AST_POLICY_VERSION,
      },
      storedPitchPolicy: {
        id: DOCUMENT_STORED_PITCH_POLICY_ID,
        version: DOCUMENT_STORED_PITCH_POLICY_VERSION,
      },
      measurePolicy: {
        id: DOCUMENT_MEASURE_POLICY_ID,
        version: DOCUMENT_MEASURE_POLICY_VERSION,
      },
    }).toEqual(F3_REVIEWED_IDENTITIES);
    expect(DOCUMENT_SEMANTIC_ISSUE_CODES).toEqual(F3_REVIEWED_ISSUE_CODES);
    expect({
      eventCheckOrder: DOCUMENT_EVENT_SEMANTIC_CHECK_ORDER,
      measureCheckOrder: DOCUMENT_MEASURE_SEMANTIC_CHECK_ORDER,
      finalDiagnosticOrder: DOCUMENT_SEMANTIC_DIAGNOSTIC_ORDER,
      duplicatePolicy: "collapse-exact-code-and-path-only",
      independentFindingsCollected: true,
    }).toEqual(F3_REVIEWED_ORDERING);
    expect({
      sourceParseAccidentalStyle: DOCUMENT_SOURCE_PARSE_ACCIDENTAL_STYLE,
      sourceAstFields: DOCUMENT_SOURCE_AST_FIELDS,
      storedPitchComparison: DOCUMENT_STORED_PITCH_COMPARISON,
      slashBassProjection: DOCUMENT_SLASH_BASS_PROJECTION,
      autoRange: DOCUMENT_AUTO_RANGE_POLICY,
      alteredDominant: "preserve-four-realizations-without-selection",
      custom: "never-parse-display-text-and-never-auto-voice",
      familyAvailabilityOwner: "V0",
      measureCapacity: "beatsPerBar * 4 / beatUnit in exact quarter-note beats",
      repair: "forbidden",
      diagnosticPrivacy:
        "no-chart-text-ids-labels-annotations-or-hostile-values",
    }).toEqual(F3_REVIEWED_POLICIES);
    expect({
      sectionsVisited: MAX_F3_SECTIONS_VISITED,
      measuresVisited: MAX_F3_MEASURES_VISITED,
      eventsVisited: MAX_F3_EVENTS_VISITED,
      symbolParseCalls: MAX_F3_SYMBOL_PARSE_CALLS,
      resolutionCalls: MAX_F3_RESOLUTION_CALLS,
      voicingChecks: MAX_F3_VOICING_CHECKS,
      exactBeatAdditions: MAX_F3_EXACT_BEAT_ADDITIONS,
      publicationNodeVisits: MAX_F3_PUBLICATION_NODE_VISITS,
      issuesPerEvent: MAX_F3_ISSUES_PER_EVENT,
      issuesPerMeasure: MAX_F3_ISSUES_PER_MEASURE,
      semanticIssues: MAX_F3_SEMANTIC_ISSUES,
      trackedRecords: MAX_F3_TRACKED_RECORDS,
    }).toEqual(F3_REVIEWED_LIMITS);
    expect(DOCUMENT_VALIDATION_WORK_COUNTER_NAMES).toEqual(
      F3_REVIEWED_WORK_COUNTER_ORDER,
    );
    expect(DOCUMENT_VALIDATION_TERMINATIONS).toEqual(
      F3_REVIEWED_TERMINATIONS,
    );
    expect(DOCUMENT_VALIDATION_APPLICABILITY).toEqual(
      F3_REVIEWED_APPLICABILITY,
    );
  });

  test("keeps the brand cast and private evidence out of the specification surface", async () => {
    const [contractSource, applicationIndex] = await Promise.all([
      readFile(contractSourcePath, "utf8"),
      readFile(applicationIndexPath, "utf8"),
    ]);
    expect(countValidatedDocumentCasts(contractSource)).toBe(0);
    expect(contractSource).not.toContain("function validateDocumentSemantics");
    expect(applicationIndex).not.toContain("DocumentValidationEvidence");
  });

  test("accepts the independently reviewed corpus deterministically", async () => {
    const first = await validateF3Contract(fixtureRoot);
    const second = await validateF3Contract(fixtureRoot);
    expect(first).toEqual(second);
    expect(first).toEqual({
      schema: "changes.validation.f3-contract.v1",
      package: "F3",
      outcome: "pass",
      counts: {
        companions: 5,
        documentCases: 45,
        operationStateCases: 8,
        mutationControls: 37,
        traces: 12,
        authorities: 8,
        issueCodesCovered: 10,
      },
      findings: [],
    });
    expect(Object.keys(F3_REVIEWED_BYTE_DIGESTS).sort()).toEqual(
      [...F3_REVIEWED_COMPANIONS].sort(),
    );
  });

  test("rejects a missing reviewed companion", async () => {
    await withFixtureCopy(async (root) => {
      await rm(join(root, "trace-ledger.json"));
      await expectRejected(root, "F3_CONTRACT_FILE_SET");
    });
  });

  test("rejects public-surface, limit, and independence drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "f3-publication-contract.json", (value) => {
        requireObject(value["publicSurface"], "publicSurface")["module"] =
          "src/application/other.ts";
        requireObject(value["limits"], "limits")["eventsVisited"] = 8_193;
        requireObject(value["independence"], "independence")[
          "productionOutputMayCertifyItself"
        ] = true;
      });
      await expectRejected(
        root,
        "F3_CONTRACT_MANIFEST",
        "F3_CONTRACT_INDEPENDENCE",
      );
    });
  });

  test("rejects invalid diagnostics and coordinated issue-coverage loss", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "document-cases.json", (value) => {
        const cases = requireArray(value["cases"], "cases");
        const caseRecord = requireObject(cases[26], "F3-DOC-027");
        const expected = requireObject(caseRecord["expected"], "expected");
        const errors = requireArray(expected["errors"], "errors");
        requireObject(errors[0], "error")["code"] = "shape.invalid_type";
      });
      await expectRejected(
        root,
        "F3_CONTRACT_BYTE_DIGEST",
        "F3_CONTRACT_DIAGNOSTIC",
        "F3_CONTRACT_COVERAGE",
      );
    });
  });

  test("rejects duplicate IDs and broken trace backlinks", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "document-cases.json", (value) => {
        const cases = requireArray(value["cases"], "cases");
        requireObject(cases[1], "second case")["id"] = "F3-DOC-001";
      });
      await mutateJson(root, "trace-ledger.json", (value) => {
        const traces = requireArray(value["traces"], "traces");
        const trace = requireObject(traces[0], "boundary trace");
        const required = requireArray(trace["requiredCaseIds"], "requiredCaseIds");
        trace["requiredCaseIds"] = required.filter(
          (caseId) => caseId !== "F3-DOC-003",
        );
      });
      await expectRejected(
        root,
        "F3_CONTRACT_ID_SEQUENCE",
        "F3_CONTRACT_ID",
        "F3_CONTRACT_TRACE_BACKLINK",
      );
    });
  });

  test("rejects generated expected values and duplicate decoded JSON keys", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "operation-state-cases.json", (value) => {
        value["expectedValuesGenerated"] = true;
      });
      const manifestPath = join(root, "f3-publication-contract.json");
      const source = await readFile(manifestPath, "utf8");
      await writeFile(
        manifestPath,
        source.replace(
          '  "package": "F3",',
          '  "package": "F3",\n  "package": "F3",',
        ),
        "utf8",
      );
      await expectRejected(
        root,
        "F3_CONTRACT_INDEPENDENCE",
        "F3_CONTRACT_DUPLICATE_KEY",
      );
    });
  });
});
