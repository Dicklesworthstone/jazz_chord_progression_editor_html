import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";

import {
  APPLICATION_COMMAND_KINDS,
  APPLICATION_DIALOG_KINDS,
  APPLICATION_EFFECT_KINDS,
  APPLICATION_HISTORY_POLICY_ID,
  APPLICATION_HISTORY_POLICY_VERSION,
  APPLICATION_PANEL_IDS,
  APPLICATION_REFUSAL_CODES,
  APPLICATION_REPLACEMENT_ORIGINS,
  APPLICATION_REQUEST_KINDS,
  APPLICATION_STALE_RESULT_POLICY_ID,
  APPLICATION_STALE_RESULT_POLICY_VERSION,
  APPLICATION_STATE_CONTRACT_SCHEMA,
  APPLICATION_STATE_OPERATION_NAMES,
  APPLICATION_STATE_POLICY_ID,
  APPLICATION_STATE_POLICY_VERSION,
  APPLICATION_TRANSPORT_STATUSES,
  HISTORY_RETAINED_BYTE_ESTIMATE_POLICY,
  MAX_APPLICATION_REVISION,
  MAX_APPLICATION_SEQUENCE,
  MAX_COMMAND_ID_CODE_POINTS,
  MAX_COMMAND_LABEL_CODE_POINTS,
  MAX_DIALOG_STACK_DEPTH,
  MAX_DRAFT_ISSUES,
  MAX_FOCUS_SESSION_ID_CODE_POINTS,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_RETAINED_BYTES,
  MAX_NOTICES,
  MAX_NOTICE_MESSAGE_CODE_POINTS,
  MAX_PENDING_REQUESTS,
  MAX_QUICK_ENTRY_CODE_POINTS,
  MAX_SELECTED_EVENT_IDS,
  TEXT_COMMAND_COALESCE_WINDOW_MS,
  type AppState,
  type ApplicationCommandKind,
  type ApplicationRefusal,
  type ApplicationStateOperationName,
  type ApplicationStateOperations,
  type ApplicationTransitionResult,
  type DocumentCommand,
  type HistoryEntry,
  type MoveDocumentNodesCommand,
  type SetTextCommand,
  type TextCommandCoalescing,
  type TransportViewState,
} from "../../src/application";
import type {
  ProgressionDocumentV2,
  ValidatedDocument,
} from "../../src/domain";
import {
  A0_REVIEWED_BYTE_DIGESTS,
  A0_REVIEWED_COMMAND_KINDS,
  A0_REVIEWED_COUNTS,
  A0_REVIEWED_DIALOG_KINDS,
  A0_REVIEWED_EFFECT_KINDS,
  A0_REVIEWED_HISTORY_ESTIMATE_WEIGHTS,
  A0_REVIEWED_LIMITS,
  A0_REVIEWED_OPERATION_ORDER,
  A0_REVIEWED_PANEL_IDS,
  A0_REVIEWED_REFUSAL_CODES,
  A0_REVIEWED_REPLACEMENT_ORIGINS,
  A0_REVIEWED_REQUEST_KINDS,
  A0_REVIEWED_TRANSPORT_STATUSES,
  validateA0Contract,
  type A0ContractValidationReport,
} from "../../scripts/validate-a0-contract";

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

type Success = Extract<ApplicationTransitionResult, { ok: true }>;
type Failure = Extract<ApplicationTransitionResult, { ok: false }>;

const typeAssertions: readonly [
  Assert<Equal<AppState["document"], ValidatedDocument>>,
  Assert<Not<ProgressionDocumentV2 extends ValidatedDocument ? true : false>>,
  Assert<Equal<DocumentCommand["kind"], ApplicationCommandKind>>,
  Assert<Equal<MoveDocumentNodesCommand["coalescing"], null>>,
  Assert<Equal<SetTextCommand["coalescing"], TextCommandCoalescing>>,
  Assert<Equal<HistoryEntry["before"], ValidatedDocument>>,
  Assert<Equal<HistoryEntry["after"], ValidatedDocument>>,
  Assert<
    Equal<
      keyof HistoryEntry,
      | "after"
      | "afterBookmarks"
      | "before"
      | "beforeBookmarks"
      | "coalescing"
      | "commandId"
      | "commandKind"
      | "firstLogicalTimeMs"
      | "label"
      | "lastLogicalTimeMs"
      | "retainedBytesEstimate"
    >
  >,
  Assert<
    Equal<
      keyof TransportViewState,
      | "commandRequestId"
      | "documentId"
      | "failureCode"
      | "generation"
      | "notificationSequence"
      | "planRevision"
      | "playhead"
      | "startBeat"
      | "status"
    >
  >,
  Assert<Equal<keyof ApplicationStateOperations, ApplicationStateOperationName>>,
  Assert<Equal<keyof Success, "counters" | "effects" | "ok" | "outcome" | "state">>,
  Assert<
    Equal<
      keyof Failure,
      "counters" | "effects" | "notice" | "ok" | "refusal" | "state"
    >
  >,
  Assert<Equal<Failure["refusal"], ApplicationRefusal>>,
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
];

const fixtureRoot = new URL(
  "../fixtures/application-state",
  import.meta.url,
).pathname;
const contractSourcePath = new URL(
  "../../src/application/application-state-contract.ts",
  import.meta.url,
).pathname;
const architecturePath = new URL(
  "../../docs/ARCHITECTURE.md",
  import.meta.url,
).pathname;
const contractDocPath = new URL(
  "../../docs/A0_APPLICATION_CONTRACT.md",
  import.meta.url,
).pathname;
const packagePath = new URL("../../package.json", import.meta.url).pathname;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`A0_TEST_OBJECT: ${label}`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`A0_TEST_ARRAY: ${label}`);
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
  const parent = await mkdtemp(join(tmpdir(), "jcpe a0 contract Ω path-"));
  const root = join(parent, "reviewed application fixtures");
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function findingCodes(report: A0ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

async function expectRejected(
  root: string,
  ...codes: readonly string[]
): Promise<void> {
  const report = await validateA0Contract(root);
  expect(report.outcome).toBe("fail");
  const actual = findingCodes(report);
  for (const code of codes) expect(actual).toContain(code);
}

describe("A0 reviewed application contract", () => {
  test("public constants and types match the reviewed machine authority", async () => {
    expect(typeAssertions).toHaveLength(13);
    expect(APPLICATION_STATE_CONTRACT_SCHEMA).toBe(
      "changes.application.state-contract.v1",
    );
    expect([APPLICATION_STATE_POLICY_ID, APPLICATION_STATE_POLICY_VERSION]).toEqual([
      "changes.application-state",
      1,
    ]);
    expect([
      APPLICATION_HISTORY_POLICY_ID,
      APPLICATION_HISTORY_POLICY_VERSION,
    ]).toEqual(["changes.application-history", 1]);
    expect([
      APPLICATION_STALE_RESULT_POLICY_ID,
      APPLICATION_STALE_RESULT_POLICY_VERSION,
    ]).toEqual(["changes.application-stale-result-gate", 1]);
    expect(APPLICATION_COMMAND_KINDS).toEqual(A0_REVIEWED_COMMAND_KINDS);
    expect(APPLICATION_STATE_OPERATION_NAMES).toEqual(A0_REVIEWED_OPERATION_ORDER);
    expect(APPLICATION_REPLACEMENT_ORIGINS).toEqual(
      A0_REVIEWED_REPLACEMENT_ORIGINS,
    );
    expect(APPLICATION_REQUEST_KINDS).toEqual(A0_REVIEWED_REQUEST_KINDS);
    expect(APPLICATION_TRANSPORT_STATUSES).toEqual(
      A0_REVIEWED_TRANSPORT_STATUSES,
    );
    expect(APPLICATION_PANEL_IDS).toEqual(A0_REVIEWED_PANEL_IDS);
    expect(APPLICATION_DIALOG_KINDS).toEqual(A0_REVIEWED_DIALOG_KINDS);
    expect(APPLICATION_EFFECT_KINDS).toEqual(A0_REVIEWED_EFFECT_KINDS);
    expect(APPLICATION_REFUSAL_CODES).toEqual(A0_REVIEWED_REFUSAL_CODES);
    expect({
      maximumRevision: MAX_APPLICATION_REVISION,
      maximumSequence: MAX_APPLICATION_SEQUENCE,
      historyEntries: MAX_HISTORY_ENTRIES,
      historyRetainedBytes: MAX_HISTORY_RETAINED_BYTES,
      selectedEventIds: MAX_SELECTED_EVENT_IDS,
      dialogStackDepth: MAX_DIALOG_STACK_DEPTH,
      notices: MAX_NOTICES,
      pendingRequests: MAX_PENDING_REQUESTS,
      commandIdCodePoints: MAX_COMMAND_ID_CODE_POINTS,
      commandLabelCodePoints: MAX_COMMAND_LABEL_CODE_POINTS,
      focusSessionIdCodePoints: MAX_FOCUS_SESSION_ID_CODE_POINTS,
      noticeMessageCodePoints: MAX_NOTICE_MESSAGE_CODE_POINTS,
      quickEntryCodePoints: MAX_QUICK_ENTRY_CODE_POINTS,
      draftIssues: MAX_DRAFT_ISSUES,
      textCoalesceWindowMsExclusive: TEXT_COMMAND_COALESCE_WINDOW_MS,
    }).toEqual(A0_REVIEWED_LIMITS);
    expect({
      objectBytes: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.objectBytes,
      arrayBytes: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.arrayBytes,
      arraySlotBytes: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.arraySlotBytes,
      stringBytes: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.stringBytes,
      numberBytes: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.numberBytes,
      booleanBytes: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.booleanBytes,
      nullBytes: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.nullBytes,
      referenceBytes: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.referenceBytes,
      stringPayload: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.stringPayload,
      sharedIdentityScope:
        HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.sharedIdentityScope,
      jsonSerialization: HISTORY_RETAINED_BYTE_ESTIMATE_POLICY.jsonSerialization,
    }).toEqual(A0_REVIEWED_HISTORY_ESTIMATE_WEIGHTS);

    const contract = await readJsonObject(
      join(fixtureRoot, "a0-application-contract.json"),
    );
    expect(contract["reviewedFileSha256"]).toEqual(A0_REVIEWED_BYTE_DIGESTS);
  });

  test("reviewed fixtures validate with full declared coverage", async () => {
    const report = await validateA0Contract(fixtureRoot);
    expect(report).toEqual({
      schema: "changes.validation.a0-contract.v1",
      package: "A0",
      outcome: "pass",
      counts: {
        companions: A0_REVIEWED_COUNTS.companions,
        stateCases: A0_REVIEWED_COUNTS.stateCases,
        staleAndTransportCases: A0_REVIEWED_COUNTS.staleAndTransportCases,
        namedSequences: A0_REVIEWED_COUNTS.namedSequences,
        randomizedSequences: A0_REVIEWED_COUNTS.randomizedSequences,
        mutationControls: A0_REVIEWED_COUNTS.mutationControls,
        traces: A0_REVIEWED_COUNTS.traces,
        authorities: A0_REVIEWED_COUNTS.authorities,
        commandKindsCovered: A0_REVIEWED_COMMAND_KINDS.length,
        operationsCovered: A0_REVIEWED_OPERATION_ORDER.length,
      },
      findings: [],
    });
  });

  test("digest and independence tampering are rejected", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "state-matrix.json", (value) => {
        value["expectedValuesGenerated"] = true;
      });
      await expectRejected(
        root,
        "A0_COMPANION_DIGEST_MISMATCH",
        "A0_EXPECTATIONS_NOT_INDEPENDENT",
      );
    });
  });

  test("reviewed limits and counts cannot drift", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "a0-application-contract.json", (value) => {
        const limits = requireObject(value["limits"], "limits");
        limits["historyEntries"] = 201;
      });
      await mutateJson(root, "state-matrix.json", (value) => {
        requireArray(value["cases"], "cases").pop();
      });
      await expectRejected(
        root,
        "A0_REVIEWED_VALUE_DRIFT",
        "A0_COMPANION_DIGEST_MISMATCH",
      );
    });
  });

  test("missing case, trace, authority, and killer links are rejected", async () => {
    await withFixtureCopy(async (root) => {
      await mutateJson(root, "state-matrix.json", (value) => {
        const first = requireObject(requireArray(value["cases"], "cases")[0], "case");
        first["traceIds"] = ["TR-DOES-NOT-EXIST"];
        first["authorityIds"] = ["AUTH-DOES-NOT-EXIST"];
      });
      await mutateJson(root, "mutation-controls.json", (value) => {
        const first = requireObject(
          requireArray(value["controls"], "controls")[0],
          "control",
        );
        first["killerCaseIds"] = ["A0-DOES-NOT-EXIST"];
      });
      await expectRejected(
        root,
        "A0_TRACE_LINK_MISSING",
        "A0_AUTHORITY_LINK_MISSING",
        "A0_KILLER_LINK_MISSING",
      );
    });
  });

  test("source contract has no runtime handles, brand cast, or implementation", async () => {
    const source = await readFile(contractSourcePath, "utf8");
    const file = ts.createSourceFile(
      contractSourcePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const prohibited = new Set([
      "AbortController",
      "AudioContext",
      "File",
      "FileSystemHandle",
      "IDBDatabase",
      "Node",
      "Preact",
      "Storage",
      "Timer",
    ]);
    const findings: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword
      ) {
        findings.push("runtime-import");
      }
      if (ts.isAsExpression(node)) {
        const text = node.type.getText(file);
        if (text.includes("ValidatedDocument")) findings.push("brand-cast");
      }
      if (ts.isIdentifier(node) && prohibited.has(node.text)) {
        findings.push(`runtime-handle:${node.text}`);
      }
      if (
        ts.isFunctionDeclaration(node) &&
        node.body !== undefined
      ) {
        findings.push("function-implementation");
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(findings).toEqual([]);
  });

  test("docs and package expose the A0 contract command and handoff", async () => {
    const [architecture, contractDoc, packageJson] = await Promise.all([
      readFile(architecturePath, "utf8"),
      readFile(contractDocPath, "utf8"),
      readJsonObject(packagePath),
    ]);
    const scripts = requireObject(packageJson["scripts"], "scripts");
    expect(scripts["validate:a0-contract"]).toBe(
      "bun scripts/validate-a0-contract.ts",
    );
    expect(architecture).toContain("validate:a0-contract");
    expect(architecture).toContain("A0_APPLICATION_CONTRACT.md");
    expect(contractDoc).toContain("implementation agent");
    expect(contractDoc).toContain("silently dropping undo");
    expect(contractDoc).toContain("runtime AI");
  });
});
