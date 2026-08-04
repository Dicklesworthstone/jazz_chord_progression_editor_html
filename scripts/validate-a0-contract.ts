import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type A0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type A0ContractValidationReport = Readonly<{
  schema: "changes.validation.a0-contract.v1";
  package: "A0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    stateCases: number;
    staleAndTransportCases: number;
    namedSequences: number;
    randomizedSequences: number;
    mutationControls: number;
    traces: number;
    authorities: number;
    commandKindsCovered: number;
    operationsCovered: number;
  }>;
  findings: readonly A0ContractFinding[];
}>;

const CONTRACT_FILENAME = "a0-application-contract.json";

export const A0_REVIEWED_COMPANIONS = [
  "mutation-controls.json",
  "provenance-ledger.json",
  "sequence-cases.json",
  "stale-and-transport-cases.json",
  "state-matrix.json",
  "trace-ledger.json",
] as const;

type CompanionFilename = (typeof A0_REVIEWED_COMPANIONS)[number];

const EXPECTED_FILES = [CONTRACT_FILENAME, ...A0_REVIEWED_COMPANIONS] as const;
type ExpectedFilename = (typeof EXPECTED_FILES)[number];

const EXPECTED_SCHEMAS: Readonly<Record<ExpectedFilename, string>> = {
  "a0-application-contract.json":
    "changes.fixtures.a0-application-contract.v1",
  "mutation-controls.json": "changes.fixtures.a0-mutation-controls.v1",
  "provenance-ledger.json": "changes.fixtures.a0-provenance-ledger.v1",
  "sequence-cases.json": "changes.fixtures.a0-sequence-cases.v1",
  "stale-and-transport-cases.json":
    "changes.fixtures.a0-stale-and-transport-cases.v1",
  "state-matrix.json": "changes.fixtures.a0-state-matrix.v1",
  "trace-ledger.json": "changes.fixtures.a0-trace-ledger.v1",
};

export const A0_REVIEWED_BYTE_DIGESTS: Readonly<
  Record<CompanionFilename, string>
> = {
  "mutation-controls.json":
    "ae65750167b20e0cea40520820dfdd459f86e3938ca96965b1bd3af310985a83",
  "provenance-ledger.json":
    "3fba29f7989a2e7d5b233341b968e6d8c6dc4935ffdffafcc4642eab075d794d",
  "sequence-cases.json":
    "d90a939148958f5ce8d12fa5a8119cb777334a24076198f6a11bfe6e6aedacd6",
  "stale-and-transport-cases.json":
    "6989eb99432a1375758c7a7bd92b45562ef54b68215d36dedaa68622a3b8af58",
  "state-matrix.json":
    "8589e846285870489b5d61301c6a795eb394e7a70cfd3437787d9bd303abf343",
  "trace-ledger.json":
    "e222347208f6a4b392efe02295ee4fcdcfba013de80967b1ff18d84ec872f35a",
};

export const A0_REVIEWED_OPERATION_ORDER = [
  "createInitialAppState",
  "runDocumentCommand",
  "undoDocumentCommand",
  "redoDocumentCommand",
  "reduceEphemeralIntent",
  "beginApplicationRequest",
  "settleApplicationRequest",
  "acceptTransportNotification",
  "selectEventById",
  "selectSelectedEvents",
  "selectInsertionLocation",
  "selectBeatRange",
  "selectDirtyState",
  "selectHistoryAvailability",
] as const;

/**
 * The accepted historical A0 command tuple. This reviewed record is frozen
 * evidence and must never be rewritten as though the sixteenth kind had
 * always existed; the sole authorized live suffix is the R1-accepted A0/U1
 * `apply-edit-plan` amendment (see A0_U1_AUTHORIZED_LIVE_COMMAND_KINDS).
 */
export const A0_REVIEWED_COMMAND_KINDS = [
  "insert",
  "delete",
  "move",
  "duplicate",
  "set-text",
  "set-duration",
  "set-measure-completion",
  "set-section",
  "set-chord",
  "set-voicing",
  "set-document-settings",
  "transpose",
  "apply-suggestion",
  "apply-reharmonization",
  "replace-document",
] as const;

/** The merged live tuple: the historical fifteen plus the accepted A0/U1 suffix. */
export const A0_U1_AUTHORIZED_LIVE_COMMAND_KINDS = [
  ...A0_REVIEWED_COMMAND_KINDS,
  "apply-edit-plan",
] as const;

export const A0_REVIEWED_REPLACEMENT_ORIGINS = [
  "new",
  "lesson",
  "canonical-import",
  "legacy-import",
] as const;

export const A0_REVIEWED_REQUEST_KINDS = [
  "analysis",
  "import-read",
  "voicing-search",
  "suggestion-search",
  "route-search",
  "constraint-search",
  "reharmonization-search",
  "practice-generation",
  "playback-plan",
  "document-transition",
] as const;

export const A0_REVIEWED_TRANSPORT_STATUSES = [
  "unavailable",
  "ready",
  "starting",
  "playing",
  "paused",
  "stopping",
  "failed",
] as const;

export const A0_REVIEWED_PANEL_IDS = [
  "chart",
  "inspector",
  "history",
  "atlas",
  "continuation",
  "tonal-journey",
  "route-planner",
  "constraints",
  "reharmonization",
  "guide-tones",
  "color-lab",
  "practice",
  "document",
  "settings",
] as const;

export const A0_REVIEWED_DIALOG_KINDS = [
  "new-document",
  "lesson-load",
  "import-confirm",
  "discard-changes",
  "history-limit",
  "error-details",
] as const;

export const A0_REVIEWED_EFFECT_KINDS = [
  "queue-recovery",
  "compile-playback-plan",
  "restore-focus",
  "announce",
  "recommend-export",
] as const;

export const A0_REVIEWED_REFUSAL_CODES = [
  "application.revision_exhausted",
  "application.sequence_exhausted",
  "command.id_invalid",
  "command.label_invalid",
  "command.logical_time_invalid",
  "command.stale_revision",
  "command.wrong_document",
  "command.target_missing",
  "command.target_kind_mismatch",
  "command.destination_invalid",
  "command.duplicate_target",
  "command.ancestor_descendant_overlap",
  "command.payload_invalid",
  "command.coalescing_invalid",
  "command.id_allocation_failed",
  "command.derived_patch_scope_mismatch",
  "command.derived_patch_stale",
  "command.structural_validation_failed",
  "command.semantic_validation_failed",
  "history.locked",
  "history.undo_empty",
  "history.redo_empty",
  "history.entry_too_large",
  "history.nonundoable_confirmation_required",
  "history.byte_estimate_invalid",
  "bookmark.invalid",
  "bookmark.selection_limit",
  "dialog.stack_limit",
  "ephemeral.intent_invalid",
  "request.limit",
  "request.slot_busy",
  "request.id_invalid",
  "request.base_revision_invalid",
  "transport.expectation_invalid",
  "transport.notification_invalid",
] as const;

export const A0_REVIEWED_LIMITS = {
  maximumRevision: 9_007_199_254_740_991,
  maximumSequence: 9_007_199_254_740_991,
  historyEntries: 200,
  historyRetainedBytes: 16_777_216,
  selectedEventIds: 8_192,
  dialogStackDepth: 8,
  notices: 32,
  pendingRequests: 8,
  commandIdCodePoints: 128,
  commandLabelCodePoints: 160,
  focusSessionIdCodePoints: 128,
  noticeMessageCodePoints: 512,
  quickEntryCodePoints: 4_096,
  draftIssues: 64,
  textCoalesceWindowMsExclusive: 1_000,
} as const;

export const A0_REVIEWED_HISTORY_ESTIMATE_WEIGHTS = {
  objectBytes: 32,
  arrayBytes: 24,
  arraySlotBytes: 8,
  stringBytes: 16,
  numberBytes: 8,
  booleanBytes: 4,
  nullBytes: 4,
  referenceBytes: 8,
  stringPayload: "utf8",
  sharedIdentityScope: "one-history-entry",
  jsonSerialization: "forbidden",
} as const;

export const A0_REVIEWED_COUNTS = {
  companions: 6,
  stateCases: 68,
  staleAndTransportCases: 20,
  namedSequences: 6,
  randomizedSequences: 1_000,
  mutationControls: 32,
  traces: 19,
  authorities: 7,
} as const;

type ParsedFixture = Readonly<{
  filename: ExpectedFilename;
  source: string;
  root: JsonObject;
  digest: string;
}>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function finding(
  findings: A0ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

function objectAt(
  value: unknown,
  path: string,
  findings: A0ContractFinding[],
): JsonObject | null {
  if (isObject(value)) return value;
  finding(findings, "A0_OBJECT_REQUIRED", path, "Expected an object.");
  return null;
}

function arrayAt(
  value: unknown,
  path: string,
  findings: A0ContractFinding[],
): unknown[] {
  if (Array.isArray(value)) return value;
  finding(findings, "A0_ARRAY_REQUIRED", path, "Expected an array.");
  return [];
}

function stringArrayAt(
  value: unknown,
  path: string,
  findings: A0ContractFinding[],
): string[] {
  const values = arrayAt(value, path, findings);
  const result: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const entry = values[index];
    if (typeof entry !== "string") {
      finding(
        findings,
        "A0_STRING_REQUIRED",
        `${path}[${String(index)}]`,
        "Expected a string.",
      );
      continue;
    }
    result.push(entry);
  }
  return result;
}

function exactArray(
  actual: unknown,
  expected: readonly string[],
  path: string,
  findings: A0ContractFinding[],
): void {
  if (!sameJson(actual, expected)) {
    finding(
      findings,
      "A0_REVIEWED_VALUE_DRIFT",
      path,
      `Expected ${JSON.stringify(expected)}.`,
    );
  }
}

function exactObject(
  actual: unknown,
  expected: Readonly<Record<string, unknown>>,
  path: string,
  findings: A0ContractFinding[],
): void {
  if (!sameJson(actual, expected)) {
    finding(
      findings,
      "A0_REVIEWED_VALUE_DRIFT",
      path,
      "Reviewed object differs from the contract authority.",
    );
  }
}

function checkUnique(
  values: readonly string[],
  path: string,
  findings: A0ContractFinding[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      finding(findings, "A0_DUPLICATE_ID", path, `Duplicate ID ${value}.`);
    }
    seen.add(value);
  }
}

function recordId(
  record: JsonObject,
  path: string,
  findings: A0ContractFinding[],
): string | null {
  const id = record["id"];
  if (typeof id === "string" && id.length > 0) return id;
  finding(findings, "A0_ID_REQUIRED", `${path}.id`, "A nonblank ID is required.");
  return null;
}

function recordsAt(
  root: JsonObject,
  key: string,
  filename: string,
  findings: A0ContractFinding[],
): JsonObject[] {
  const values = arrayAt(root[key], `${filename}.${key}`, findings);
  const records: JsonObject[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const record = objectAt(
      values[index],
      `${filename}.${key}[${String(index)}]`,
      findings,
    );
    if (record !== null) records.push(record);
  }
  return records;
}

async function parseFixtures(
  rootPath: string,
  findings: A0ContractFinding[],
): Promise<Map<ExpectedFilename, ParsedFixture>> {
  const parsed = new Map<ExpectedFilename, ParsedFixture>();
  let entries: string[];
  try {
    entries = (await readdir(rootPath)).filter((entry) => entry.endsWith(".json"));
  } catch (error) {
    finding(
      findings,
      "A0_FIXTURE_ROOT_UNREADABLE",
      rootPath,
      error instanceof Error ? error.message : "Fixture root is unreadable.",
    );
    return parsed;
  }

  const expectedSet = new Set<string>(EXPECTED_FILES);
  for (const entry of entries.sort()) {
    if (!expectedSet.has(entry)) {
      finding(
        findings,
        "A0_UNDECLARED_FIXTURE",
        entry,
        "Unexpected JSON fixture in the reviewed A0 root.",
      );
    }
  }

  for (const filename of EXPECTED_FILES) {
    const path = join(rootPath, filename);
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch {
      finding(findings, "A0_FIXTURE_MISSING", filename, "Required fixture is missing.");
      continue;
    }

    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch (error) {
      finding(
        findings,
        "A0_JSON_INVALID",
        filename,
        error instanceof Error ? error.message : "Invalid JSON.",
      );
      continue;
    }

    const root = objectAt(value, filename, findings);
    if (root === null) continue;
    if (root["schema"] !== EXPECTED_SCHEMAS[filename]) {
      finding(
        findings,
        "A0_SCHEMA_INVALID",
        `${filename}.schema`,
        `Expected ${EXPECTED_SCHEMAS[filename]}.`,
      );
    }
    if (root["expectedValuesGenerated"] !== false) {
      finding(
        findings,
        "A0_EXPECTATIONS_NOT_INDEPENDENT",
        `${filename}.expectedValuesGenerated`,
        "Expected false.",
      );
    }
    if (root["productionOutputUsed"] !== false) {
      finding(
        findings,
        "A0_PRODUCTION_OUTPUT_USED",
        `${filename}.productionOutputUsed`,
        "Expected false.",
      );
    }
    parsed.set(filename, { filename, source, root, digest: sha256(source) });
  }
  return parsed;
}

function checkCompanionDigests(
  contract: JsonObject,
  parsed: ReadonlyMap<ExpectedFilename, ParsedFixture>,
  findings: A0ContractFinding[],
): void {
  exactArray(
    contract["companions"],
    A0_REVIEWED_COMPANIONS,
    `${CONTRACT_FILENAME}.companions`,
    findings,
  );
  const digestObject = objectAt(
    contract["reviewedFileSha256"],
    `${CONTRACT_FILENAME}.reviewedFileSha256`,
    findings,
  );
  if (digestObject === null) return;

  if (!sameJson(Object.keys(digestObject).sort(), [...A0_REVIEWED_COMPANIONS].sort())) {
    finding(
      findings,
      "A0_DIGEST_KEYSET_INVALID",
      `${CONTRACT_FILENAME}.reviewedFileSha256`,
      "Digest keys must exactly equal the companion set.",
    );
  }

  for (const filename of A0_REVIEWED_COMPANIONS) {
    const fixture = parsed.get(filename);
    const reviewed = A0_REVIEWED_BYTE_DIGESTS[filename];
    if (digestObject[filename] !== reviewed) {
      finding(
        findings,
        "A0_CONTRACT_DIGEST_DRIFT",
        `${CONTRACT_FILENAME}.reviewedFileSha256.${filename}`,
        `Expected reviewed digest ${reviewed}.`,
      );
    }
    if (fixture !== undefined && fixture.digest !== reviewed) {
      finding(
        findings,
        "A0_COMPANION_DIGEST_MISMATCH",
        filename,
        `Expected ${reviewed}, received ${fixture.digest}.`,
      );
    }
  }
}

function collectCaseRecords(
  state: JsonObject,
  stale: JsonObject,
  sequences: JsonObject,
  findings: A0ContractFinding[],
): Readonly<{
  stateCases: JsonObject[];
  staleCases: JsonObject[];
  namedSequences: JsonObject[];
  propertyProtocol: JsonObject | null;
  caseIds: Set<string>;
}> {
  const stateCases = recordsAt(state, "cases", "state-matrix.json", findings);
  const staleCases = recordsAt(
    stale,
    "cases",
    "stale-and-transport-cases.json",
    findings,
  );
  const namedSequences = recordsAt(
    sequences,
    "namedSequences",
    "sequence-cases.json",
    findings,
  );
  const propertyProtocol = objectAt(
    sequences["randomizedProtocol"],
    "sequence-cases.json.randomizedProtocol",
    findings,
  );
  const all = [...stateCases, ...staleCases, ...namedSequences];
  const ids: string[] = [];
  for (let index = 0; index < all.length; index += 1) {
    const id = recordId(all[index] ?? {}, `case[${String(index)}]`, findings);
    if (id !== null) ids.push(id);
  }
  if (propertyProtocol !== null) {
    const id = recordId(propertyProtocol, "sequence-cases.json.randomizedProtocol", findings);
    if (id !== null) ids.push(id);
  }
  checkUnique(ids, "all-case-ids", findings);
  return {
    stateCases,
    staleCases,
    namedSequences,
    propertyProtocol,
    caseIds: new Set(ids),
  };
}

function checkRecordLinks(
  records: readonly JsonObject[],
  caseLabel: string,
  traceIds: ReadonlySet<string>,
  authorityIds: ReadonlySet<string>,
  findings: A0ContractFinding[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? {};
    const id = typeof record["id"] === "string" ? record["id"] : `${caseLabel}[${String(index)}]`;
    const traces = stringArrayAt(record["traceIds"], `${id}.traceIds`, findings);
    const authorities = stringArrayAt(
      record["authorityIds"],
      `${id}.authorityIds`,
      findings,
    );
    if (traces.length === 0) {
      finding(findings, "A0_TRACE_LINK_REQUIRED", `${id}.traceIds`, "At least one trace is required.");
    }
    if (authorities.length === 0) {
      finding(
        findings,
        "A0_AUTHORITY_LINK_REQUIRED",
        `${id}.authorityIds`,
        "At least one authority is required.",
      );
    }
    for (const traceId of traces) {
      if (!traceIds.has(traceId)) {
        finding(findings, "A0_TRACE_LINK_MISSING", `${id}.traceIds`, `Unknown trace ${traceId}.`);
      }
    }
    for (const authorityId of authorities) {
      if (!authorityIds.has(authorityId)) {
        finding(
          findings,
          "A0_AUTHORITY_LINK_MISSING",
          `${id}.authorityIds`,
          `Unknown authority ${authorityId}.`,
        );
      }
    }
  }
}

function actionKind(record: JsonObject): string | null {
  const action = record["action"];
  if (!isObject(action)) return null;
  return typeof action["kind"] === "string" ? action["kind"] : null;
}

function checkCoverage(
  contract: JsonObject,
  cases: ReturnType<typeof collectCaseRecords>,
  findings: A0ContractFinding[],
): Readonly<{ commandKinds: number; operations: number }> {
  const commandKinds = new Set<string>();
  const operations = new Set<string>();
  for (const record of [...cases.stateCases, ...cases.staleCases]) {
    const kind = actionKind(record);
    if (kind !== null && A0_REVIEWED_COMMAND_KINDS.includes(kind as never)) {
      commandKinds.add(kind);
    }
    const operation = record["operation"];
    if (typeof operation === "string") operations.add(operation);
  }

  for (const kind of A0_REVIEWED_COMMAND_KINDS) {
    if (!commandKinds.has(kind)) {
      finding(
        findings,
        "A0_COMMAND_KIND_UNCOVERED",
        "state-matrix.json.cases",
        `No independently authored case exercises ${kind}.`,
      );
    }
  }
  for (const operation of A0_REVIEWED_OPERATION_ORDER) {
    if (!operations.has(operation)) {
      finding(
        findings,
        "A0_OPERATION_UNCOVERED",
        "case-operation-coverage",
        `No independently authored case exercises ${operation}.`,
      );
    }
  }

  const origins = new Set<string>();
  for (const record of cases.stateCases) {
    const action = record["action"];
    if (isObject(action) && action["kind"] === "replace-document" && typeof action["origin"] === "string") {
      origins.add(action["origin"]);
    }
  }
  for (const origin of A0_REVIEWED_REPLACEMENT_ORIGINS) {
    if (!origins.has(origin)) {
      finding(
        findings,
        "A0_REPLACEMENT_ORIGIN_UNCOVERED",
        "state-matrix.json.cases",
        `No replacement case exercises ${origin}.`,
      );
    }
  }

  const categories = new Set<string>();
  for (const record of [...cases.stateCases, ...cases.staleCases]) {
    if (typeof record["category"] === "string") categories.add(record["category"]);
  }
  for (const required of [
    "positive",
    "near-miss",
    "refusal",
    "malformed",
    "limit",
    "cancellation",
    "stale",
    "boundary",
    "legacy-regression",
    "invariant",
  ]) {
    if (!categories.has(required)) {
      finding(
        findings,
        "A0_CASE_CATEGORY_MISSING",
        "case-category-coverage",
        `Missing ${required} case category.`,
      );
    }
  }

  const summary = objectAt(
    contract["coverageSummary"],
    `${CONTRACT_FILENAME}.coverageSummary`,
    findings,
  );
  if (summary !== null) {
    exactObject(
      summary,
      {
        stateCases: A0_REVIEWED_COUNTS.stateCases,
        staleAndTransportCases: A0_REVIEWED_COUNTS.staleAndTransportCases,
        namedSequences: A0_REVIEWED_COUNTS.namedSequences,
        randomizedSequenceCount: A0_REVIEWED_COUNTS.randomizedSequences,
        mutationControls: A0_REVIEWED_COUNTS.mutationControls,
        traces: A0_REVIEWED_COUNTS.traces,
        authorities: A0_REVIEWED_COUNTS.authorities,
      },
      `${CONTRACT_FILENAME}.coverageSummary`,
      findings,
    );
  }
  return { commandKinds: commandKinds.size, operations: operations.size };
}

function checkTraceAndMutationLinks(
  traceRecords: readonly JsonObject[],
  controlRecords: readonly JsonObject[],
  caseIds: ReadonlySet<string>,
  findings: A0ContractFinding[],
): void {
  const traceIds = traceRecords
    .map((record, index) => recordId(record, `trace[${String(index)}]`, findings))
    .filter((id): id is string => id !== null);
  const controlIds = controlRecords
    .map((record, index) => recordId(record, `control[${String(index)}]`, findings))
    .filter((id): id is string => id !== null);
  checkUnique(traceIds, "trace-ids", findings);
  checkUnique(controlIds, "control-ids", findings);
  const traceSet = new Set(traceIds);
  const controlSet = new Set(controlIds);

  for (const control of controlRecords) {
    const id = typeof control["id"] === "string" ? control["id"] : "unknown-control";
    const killers = stringArrayAt(control["killerCaseIds"], `${id}.killerCaseIds`, findings);
    const traces = stringArrayAt(control["traceIds"], `${id}.traceIds`, findings);
    if (killers.length === 0) {
      finding(findings, "A0_KILLER_REQUIRED", `${id}.killerCaseIds`, "A killer case is required.");
    }
    for (const killer of killers) {
      if (!caseIds.has(killer)) {
        finding(findings, "A0_KILLER_LINK_MISSING", `${id}.killerCaseIds`, `Unknown case ${killer}.`);
      }
    }
    for (const trace of traces) {
      if (!traceSet.has(trace)) {
        finding(findings, "A0_TRACE_LINK_MISSING", `${id}.traceIds`, `Unknown trace ${trace}.`);
      }
    }
  }

  for (const trace of traceRecords) {
    const id = typeof trace["id"] === "string" ? trace["id"] : "unknown-trace";
    const linkedCases = stringArrayAt(trace["caseIds"], `${id}.caseIds`, findings);
    const linkedControls = stringArrayAt(
      trace["controlIds"],
      `${id}.controlIds`,
      findings,
    );
    if (linkedCases.length === 0) {
      finding(findings, "A0_TRACE_CASE_REQUIRED", `${id}.caseIds`, "A trace case is required.");
    }
    for (const linkedCase of linkedCases) {
      if (!caseIds.has(linkedCase)) {
        finding(findings, "A0_CASE_LINK_MISSING", `${id}.caseIds`, `Unknown case ${linkedCase}.`);
      }
    }
    for (const linkedControl of linkedControls) {
      if (!controlSet.has(linkedControl)) {
        finding(
          findings,
          "A0_CONTROL_LINK_MISSING",
          `${id}.controlIds`,
          `Unknown control ${linkedControl}.`,
        );
      }
    }
  }
}

function checkRandomProtocol(
  protocol: JsonObject | null,
  findings: A0ContractFinding[],
): number {
  if (protocol === null) return 0;
  const sequenceCount = protocol["sequenceCount"];
  if (sequenceCount !== A0_REVIEWED_COUNTS.randomizedSequences) {
    finding(
      findings,
      "A0_RANDOM_SEQUENCE_COUNT_INVALID",
      "sequence-cases.json.randomizedProtocol.sequenceCount",
      `Expected ${String(A0_REVIEWED_COUNTS.randomizedSequences)}.`,
    );
    return typeof sequenceCount === "number" ? sequenceCount : 0;
  }
  if (protocol["productionImports"] !== undefined) {
    finding(
      findings,
      "A0_RANDOM_PROTOCOL_UNDECLARED_FIELD",
      "sequence-cases.json.randomizedProtocol.productionImports",
      "Production import policy belongs to the referenceModel.",
    );
  }
  if (protocol["wallTimeSemanticCutoff"] !== false) {
    finding(
      findings,
      "A0_WALL_TIME_CUTOFF_FORBIDDEN",
      "sequence-cases.json.randomizedProtocol.wallTimeSemanticCutoff",
      "Expected false.",
    );
  }
  const weights = objectAt(
    protocol["weightsPer1024"],
    "sequence-cases.json.randomizedProtocol.weightsPer1024",
    findings,
  );
  if (weights !== null) {
    let sum = 0;
    for (const value of Object.values(weights)) {
      if (typeof value === "number") sum += value;
    }
    if (sum !== 1_024) {
      finding(
        findings,
        "A0_RANDOM_WEIGHTS_INVALID",
        "sequence-cases.json.randomizedProtocol.weightsPer1024",
        `Expected weights to sum to 1024, received ${String(sum)}.`,
      );
    }
  }
  return sequenceCount;
}

export async function validateA0Contract(
  rootPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../tests/fixtures/application-state",
  ),
): Promise<A0ContractValidationReport> {
  const findings: A0ContractFinding[] = [];
  const parsed = await parseFixtures(rootPath, findings);
  const contract = parsed.get(CONTRACT_FILENAME)?.root;
  const state = parsed.get("state-matrix.json")?.root;
  const stale = parsed.get("stale-and-transport-cases.json")?.root;
  const sequences = parsed.get("sequence-cases.json")?.root;
  const mutations = parsed.get("mutation-controls.json")?.root;
  const traces = parsed.get("trace-ledger.json")?.root;
  const provenance = parsed.get("provenance-ledger.json")?.root;

  if (
    contract === undefined ||
    state === undefined ||
    stale === undefined ||
    sequences === undefined ||
    mutations === undefined ||
    traces === undefined ||
    provenance === undefined
  ) {
    return {
      schema: "changes.validation.a0-contract.v1",
      package: "A0",
      outcome: "fail",
      counts: {
        companions: parsed.size > 0 ? parsed.size - 1 : 0,
        stateCases: 0,
        staleAndTransportCases: 0,
        namedSequences: 0,
        randomizedSequences: 0,
        mutationControls: 0,
        traces: 0,
        authorities: 0,
        commandKindsCovered: 0,
        operationsCovered: 0,
      },
      findings,
    };
  }

  checkCompanionDigests(contract, parsed, findings);
  if (contract["package"] !== "A0" || contract["contractVersion"] !== 1) {
    finding(
      findings,
      "A0_CONTRACT_IDENTITY_INVALID",
      CONTRACT_FILENAME,
      "Expected package A0 and contractVersion 1.",
    );
  }

  const publicSurface = objectAt(
    contract["publicSurface"],
    `${CONTRACT_FILENAME}.publicSurface`,
    findings,
  );
  if (publicSurface !== null) {
    exactArray(
      publicSurface["operationOrder"],
      A0_REVIEWED_OPERATION_ORDER,
      `${CONTRACT_FILENAME}.publicSurface.operationOrder`,
      findings,
    );
    if (
      publicSurface["module"] !== "src/application/application-state-contract.ts" ||
      publicSurface["implementationModule"] !==
        "src/application/application-state.ts" ||
      publicSurface["contractSchema"] !==
        "changes.application.state-contract.v1" ||
      publicSurface["stateDocumentType"] !== "ValidatedDocument"
    ) {
      finding(
        findings,
        "A0_PUBLIC_SURFACE_INVALID",
        `${CONTRACT_FILENAME}.publicSurface`,
        "Reviewed public surface differs.",
      );
    }
  }

  exactArray(contract["commandKinds"], A0_REVIEWED_COMMAND_KINDS, `${CONTRACT_FILENAME}.commandKinds`, findings);
  exactArray(contract["replacementOrigins"], A0_REVIEWED_REPLACEMENT_ORIGINS, `${CONTRACT_FILENAME}.replacementOrigins`, findings);
  exactArray(contract["requestKinds"], A0_REVIEWED_REQUEST_KINDS, `${CONTRACT_FILENAME}.requestKinds`, findings);
  exactArray(contract["transportStatuses"], A0_REVIEWED_TRANSPORT_STATUSES, `${CONTRACT_FILENAME}.transportStatuses`, findings);
  exactArray(contract["panelIds"], A0_REVIEWED_PANEL_IDS, `${CONTRACT_FILENAME}.panelIds`, findings);
  exactArray(contract["dialogKinds"], A0_REVIEWED_DIALOG_KINDS, `${CONTRACT_FILENAME}.dialogKinds`, findings);
  exactArray(contract["effectKinds"], A0_REVIEWED_EFFECT_KINDS, `${CONTRACT_FILENAME}.effectKinds`, findings);
  exactArray(contract["refusalCodes"], A0_REVIEWED_REFUSAL_CODES, `${CONTRACT_FILENAME}.refusalCodes`, findings);
  exactObject(contract["limits"], A0_REVIEWED_LIMITS, `${CONTRACT_FILENAME}.limits`, findings);
  exactObject(
    contract["historyEstimateWeights"],
    A0_REVIEWED_HISTORY_ESTIMATE_WEIGHTS,
    `${CONTRACT_FILENAME}.historyEstimateWeights`,
    findings,
  );

  const cases = collectCaseRecords(state, stale, sequences, findings);
  const controlRecords = recordsAt(
    mutations,
    "controls",
    "mutation-controls.json",
    findings,
  );
  const traceRecords = recordsAt(traces, "traces", "trace-ledger.json", findings);
  const authorityRecords = recordsAt(
    provenance,
    "authorities",
    "provenance-ledger.json",
    findings,
  );
  const authorityIds = authorityRecords
    .map((record, index) => recordId(record, `authority[${String(index)}]`, findings))
    .filter((id): id is string => id !== null);
  const traceIds = traceRecords
    .map((record) => (typeof record["id"] === "string" ? record["id"] : null))
    .filter((id): id is string => id !== null);
  checkUnique(authorityIds, "authority-ids", findings);

  checkRecordLinks(
    [...cases.stateCases, ...cases.staleCases, ...cases.namedSequences],
    "case",
    new Set(traceIds),
    new Set(authorityIds),
    findings,
  );
  if (cases.propertyProtocol !== null) {
    checkRecordLinks(
      [cases.propertyProtocol],
      "randomizedProtocol",
      new Set(traceIds),
      new Set(authorityIds),
      findings,
    );
  }
  checkTraceAndMutationLinks(
    traceRecords,
    controlRecords,
    cases.caseIds,
    findings,
  );
  const coverage = checkCoverage(contract, cases, findings);
  const randomizedSequences = checkRandomProtocol(cases.propertyProtocol, findings);

  const actualCounts = {
    companions: parsed.size - 1,
    stateCases: cases.stateCases.length,
    staleAndTransportCases: cases.staleCases.length,
    namedSequences: cases.namedSequences.length,
    randomizedSequences,
    mutationControls: controlRecords.length,
    traces: traceRecords.length,
    authorities: authorityRecords.length,
  };
  exactObject(actualCounts, A0_REVIEWED_COUNTS, "reviewed-counts", findings);

  findings.sort((left, right) => {
    const path = left.path.localeCompare(right.path);
    return path !== 0 ? path : left.code.localeCompare(right.code);
  });

  return {
    schema: "changes.validation.a0-contract.v1",
    package: "A0",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      ...actualCounts,
      commandKindsCovered: coverage.commandKinds,
      operationsCovered: coverage.operations,
    },
    findings,
  };
}

async function main(): Promise<void> {
  const rootPath = process.argv[2];
  const report = await validateA0Contract(rootPath);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.outcome !== "pass") process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) await main();
