import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  APPLICATION_COMMAND_KINDS,
  APPLICATION_WORK_COUNTER_NAMES,
} from "../src/application/application-state-contract";
import {
  A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS,
  A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES,
  A0_U1_ATOMIC_EDIT_ALLOWED_OUTER_CODES_BY_REFUSAL_CODE,
  A0_U1_ATOMIC_EDIT_PLAN_DIAGNOSTIC_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS,
  A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER,
  A0_U1_ATOMIC_EDIT_LAW_IDS,
  A0_U1_ATOMIC_EDIT_LIMITS,
  A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA,
  A0_U1_ATOMIC_EDIT_PLAN_KINDS,
  A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
  A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
  A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
  A0_U1_NEW_EVENT_AUTO_VOICING,
  A0_U1_NEW_EVENT_POLICY_ID,
  A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
  A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY,
  A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
} from "../src/application/application-edit-plan-contract";

type JsonObject = Record<string, unknown>;

export type A0U1EditPlanContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type A0U1EditPlanContractValidationReport = Readonly<{
  schema: "changes.validation.a0-u1-edit-plan-contract.v1";
  package: "A0/U1 atomic edit plan";
  outcome: "pass" | "fail";
  reviewState: "proposed-independent-spec";
  counts: Readonly<{
    files: number;
    commandKinds: number;
    planKinds: number;
    lawRows: number;
    caseGroups: number;
    literalTransitions: number;
    applicabilityRows: number;
    transpositionWitnesses: number;
    mutationControls: number;
    traces: number;
    authorities: number;
  }>;
  existingA0CommandKindsUnchanged: boolean;
  productionImplementationClaim: false;
  u1UiCompletionClaim: false;
  humanAcceptanceClaim: false;
  expertReviewClaim: false;
  findings: readonly A0U1EditPlanContractFinding[];
}>;

export type A0U1EditPlanContractValidationOptions = Readonly<{
  /** Test-only seam: semantic authority remains independently fixed. */
  expectedByteDigests?: Readonly<Record<string, string>>;
}>;

const REPOSITORY_ROOT = new URL("../", import.meta.url).pathname;
const DEFAULT_FIXTURE_ROOT = resolve(
  REPOSITORY_ROOT,
  "tests/fixtures/a0-u1-edit-plan",
);

export const A0_U1_EDIT_PLAN_SPEC_FILES = Object.freeze([
  "a0-u1-edit-plan-contract.json",
  "edit-plan-cases.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const);

type SpecFilename = (typeof A0_U1_EDIT_PLAN_SPEC_FILES)[number];

const EXPECTED_SCHEMAS: Readonly<Record<SpecFilename, string>> = Object.freeze({
  "a0-u1-edit-plan-contract.json":
    "changes.fixtures.a0-u1-edit-plan-contract.v1",
  "edit-plan-cases.json": "changes.fixtures.a0-u1-edit-plan-cases.v1",
  "mutation-controls.json":
    "changes.fixtures.a0-u1-edit-plan-mutation-controls.v1",
  "provenance-ledger.json":
    "changes.fixtures.a0-u1-edit-plan-provenance-ledger.v1",
  "trace-ledger.json": "changes.fixtures.a0-u1-edit-plan-trace-ledger.v1",
});

const EXPECTED_REVIEW_STATES: Readonly<Record<SpecFilename, string>> =
  Object.freeze({
    "a0-u1-edit-plan-contract.json": "proposed-independent-spec",
    "edit-plan-cases.json": "proposed-independent-literal-spec",
    "mutation-controls.json": "proposed-independent-literal-spec",
    "provenance-ledger.json": "proposed-independent-spec",
    "trace-ledger.json": "proposed-independent-literal-spec",
  });

/** Frozen only after the independently authored packet has passed review. */
export const A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS: Readonly<
  Record<SpecFilename, string>
> = Object.freeze({
  "a0-u1-edit-plan-contract.json":
    "cb23fac90ca33dd03e2d423825da16520c965bdb6185ea1b2682c5771fd7ea05",
  "edit-plan-cases.json":
    "04aebe01fd33716b355907c64cde431cac1efa68730334afe2ae7c532ffc6754",
  "mutation-controls.json":
    "34bae67af32efece64804aaa63e258329d47651630fc3f3672197e50d886f051",
  "provenance-ledger.json":
    "f432b32c8eabd18afdbed298ab96dc6676f98451d69517c2d5502f413cf3b136",
  "trace-ledger.json":
    "1f2b0d08ea642e0f384ad7adac055473bff7b372f3ee0af3d2edf99b0408f02c",
});

export const A0_U1_EDIT_PLAN_SPEC_SEMANTIC_DIGEST =
  "4ae4489a18fa2b4b0e039dc3603eeef10c9ad99fb9b2bb83c3a9761c375ffe21";

const EXPECTED_COUNTS = Object.freeze({
  files: 5,
  commandKinds: 1,
  planKinds: 5,
  lawRows: 17,
  caseGroups: 50,
  literalTransitions: 70,
  applicabilityRows: 5,
  transpositionWitnesses: 5,
  mutationControls: 30,
  traces: 6,
  authorities: 6,
});

const EXPECTED_COVERAGE_FAMILIES = Object.freeze([
  "positive",
  "negative-near-miss",
  "stale-wrong-document",
  "malformed-exact-shape",
  "exact-boundary",
  "plus-one",
  "undo-redo",
  "collision-allocation",
  "transposition-applicability",
  "mutation",
] as const);

const EXPECTED_DESTINATION_REFUSAL_CODES: readonly string[] = Object.freeze([
  "edit-plan.destination-invalid",
  "edit-plan.event-order-invalid",
  "edit-plan.section-split-boundary-invalid",
  "edit-plan.section-order-invalid",
]);

const EXPECTED_ID_ALLOCATION_REFUSAL_CODES: readonly string[] = Object.freeze([
  "edit-plan.id-factory-failed",
  "edit-plan.id-collision",
]);

function expectedAllowedOuterCodesForRefusal(
  nestedCode: string,
): readonly string[] {
  if (nestedCode === "edit-plan.target-missing") {
    return ["command.target_missing"];
  }
  if (EXPECTED_DESTINATION_REFUSAL_CODES.includes(nestedCode)) {
    return ["command.destination_invalid"];
  }
  if (EXPECTED_ID_ALLOCATION_REFUSAL_CODES.includes(nestedCode)) {
    return ["command.id_allocation_failed"];
  }
  if (nestedCode === "edit-plan.structural-publication-refused") {
    return ["command.structural_validation_failed"];
  }
  if (nestedCode === "edit-plan.semantic-publication-refused") {
    return ["command.semantic_validation_failed"];
  }
  if (nestedCode === "edit-plan.history-refused") {
    return ["history.entry_too_large", "history.byte_estimate_invalid"];
  }
  return ["command.payload_invalid"];
}

const EXPECTED_ROOT_KEYS = Object.freeze([
  "schema",
  "reviewState",
  "pinState",
  "package",
  "owner",
  "prospectiveConsumer",
  "activeLeaf",
  "contractModule",
  "applicationContractSchema",
  "receiptSchema",
  "implementationStatus",
  "productionImplementationClaim",
  "u1UiCompletionClaim",
  "humanAcceptanceClaim",
  "expertReviewClaim",
  "productionOutputUsedAsOracle",
  "expectedValuesGenerated",
  "commandKinds",
  "planKinds",
  "commandEnvelope",
  "decisions",
  "refusalCodes",
  "outerRefusalCodes",
  "preplanOuterRefusalCodes",
  "allowedOuterCodesByRefusalCode",
  "refusalPrecedence",
  "outerWorkCounterNames",
  "workCounterNames",
  "limits",
  "ordering",
  "coverageFamilies",
  "lawIds",
  "counts",
  "proofRequirements",
  "acceptedUpstreamBoundary",
  "companionSha256",
] as const);

const EXPECTED_TOP_LEVEL_KEYS: Readonly<
  Record<
    Exclude<SpecFilename, "a0-u1-edit-plan-contract.json">,
    readonly string[]
  >
> = Object.freeze({
  "edit-plan-cases.json": Object.freeze([
    "schema",
    "reviewState",
    "pinState",
    "materializationPolicy",
    "literalCatalog",
    "caseGroups",
    "applicabilityRows",
    "transpositionWitnesses",
  ]),
  "mutation-controls.json": Object.freeze([
    "schema",
    "reviewState",
    "pinState",
    "controls",
  ]),
  "provenance-ledger.json": Object.freeze([
    "schema",
    "reviewState",
    "pinState",
    "expertReviewClaim",
    "humanAcceptanceClaim",
    "independence",
    "authorities",
  ]),
  "trace-ledger.json": Object.freeze([
    "schema",
    "reviewState",
    "pinState",
    "traces",
    "lawCoverage",
  ]),
});

const EXPECTED_LITERAL_CATALOG_KEYS = Object.freeze([
  "documents",
  "states",
  "commands",
  "results",
  "deltas",
  "counters",
  "bookmarks",
  "focusRequests",
  "histories",
  "effects",
  "allocationTraces",
  "eventOrders",
  "exactTimeEvidence",
  "sectionEvidence",
  "transitions",
] as const);

const EXPECTED_DECISION_KEYS = Object.freeze([
  "insertFragment",
  "splitEventDuration",
  "joinEventDurations",
  "splitSection",
  "joinSections",
] as const);

const EXPECTED_ORDERING_KEYS = Object.freeze([
  "runnerStages",
  "idAllocation",
  "diagnostics",
  "effects",
  "bookmarks",
  "quickEntryTargetMatch",
] as const);

const EXPECTED_PROOF_REQUIREMENT_KEYS = Object.freeze([
  "literalBeforeCommandResultAfter",
  "computedRecursiveDeltaEqualsDeclaredDelta",
  "completeExactCounters",
  "literalBookmarksFocusHistoryAndEffects",
  "positiveNegativeNearMissAndMalformed",
  "staleAndWrongDocument",
  "exactAndPlusOne",
  "undoAndRedoEveryPlanKind",
  "collisionAndPartialAllocation",
  "baseTransposedAndInverseHashes",
  "manualAndFrozenPitchBytes",
  "oneFieldMutation",
  "mutationObservationDistinctFromTarget",
  "mutationObservationIndependentlyRecomputed",
  "reciprocalLawCaseTransitionControlTraceAuthorityLinks",
  "productionOutputMayAuthorExpectedValues",
  "wallTimeMayAffectOutcome",
] as const);

const EXPECTED_TRANSITION_KEYS = Object.freeze([
  "id",
  "caseId",
  "operation",
  "phase",
  "runRole",
  "beforeState",
  "command",
  "expected",
  "lawIds",
] as const);

const EXPECTED_TRANSITION_RESULT_KEYS = Object.freeze([
  "result",
  "afterState",
  "exactDelta",
  "counters",
  "bookmarks",
  "focusRequest",
  "history",
  "effects",
  "allocationTrace",
  "eventOrder",
  "exactTimeEvidence",
  "sectionEvidence",
] as const);

const EXPECTED_SUCCESS_RESULT_KEYS = Object.freeze([
  "ok",
  "state",
  "outcome",
  "effects",
  "counters",
  "editPlanReceipt",
] as const);

const EXPECTED_FAILURE_RESULT_KEYS = Object.freeze([
  "ok",
  "state",
  "refusal",
  "notice",
  "effects",
  "counters",
  "editPlanRefusal",
] as const);

const EXPECTED_RECEIPT_KEYS = Object.freeze([
  "schema",
  "commandKind",
  "commandId",
  "planKind",
  "documentId",
  "baseRevision",
  "committedRevision",
  "allocatedIdentities",
  "removedIdentities",
  "survivorId",
  "insertSource",
  "completionMeasureIds",
  "timelineDisposition",
  "bookmarks",
  "quickEntryDisposition",
  "historyEntriesAppended",
  "structuralDecodeCalls",
  "semanticValidationCalls",
  "effects",
  "work",
] as const);

const EXPECTED_CASE_KEYS = Object.freeze([
  "id",
  "operation",
  "category",
  "summary",
  "proofKinds",
  "transitionIds",
  "mutationControlIds",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_APPLICABILITY_KEYS = Object.freeze([
  "id",
  "operation",
  "synchronization",
  "cancellation",
  "staleState",
  "transposition",
  "allocation",
  "wallTimeCutoff",
  "caseIds",
  "transitionIds",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_TRANSPOSITION_KEYS = Object.freeze([
  "id",
  "operation",
  "baseTransitionId",
  "transposedTransitionId",
  "intervalSemitones",
  "sourceDocumentRef",
  "targetDocumentRef",
  "sourceCanonicalSha256",
  "targetCanonicalSha256",
  "inverseCanonicalSha256",
  "manualPitchBytes",
  "frozenPitchBytes",
  "invariantFields",
  "changedFields",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_CONTROL_KEYS = Object.freeze([
  "id",
  "category",
  "operation",
  "lawIds",
  "baselineTransitionId",
  "killerTransitionId",
  "mutation",
  "observation",
  "exactExpectedDifference",
  "oracleExpectation",
  "linkedCaseIds",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_TRACE_KEYS = Object.freeze([
  "id",
  "scope",
  "requirement",
  "lawIds",
  "caseIds",
  "transitionIds",
  "controlIds",
  "authorityIds",
  "proofKinds",
  "implementationOwner",
] as const);

const EXPECTED_LAW_COVERAGE_KEYS = Object.freeze([
  "lawId",
  "requirement",
  "positiveTransitionIds",
  "negativeOrNearMissTransitionIds",
  "boundaryTransitionIds",
  "applicabilityRowIds",
  "mutationControlIds",
  "traceIds",
  "authorityIds",
] as const);

const EXPECTED_AUTHORITY_KEYS = Object.freeze([
  "id",
  "authorityClass",
  "sourceKind",
  "sourceRef",
  "scope",
  "judgmentBearing",
  "reviewState",
  "lawIds",
  "caseIds",
  "transitionIds",
  "controlIds",
  "traceIds",
] as const);

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordsAt(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function stringsAt(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (typeof value === "bigint") {
    return `{"$bigint":${JSON.stringify(value.toString())}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return `{"$specialNumber":${JSON.stringify(
      Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity",
    )}}`;
  }
  if (value === undefined) return '{"$undefined":true}';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort(codeUnitCompare)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function utf8Hex(value: unknown): string {
  return [...new TextEncoder().encode(stableJson(value))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function jsonDeepEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function addFinding(
  findings: A0U1EditPlanContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push(Object.freeze({ code, path, message }));
}

function requireExact(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  message: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!jsonDeepEqual(actual, expected)) {
    addFinding(findings, code, path, message);
  }
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is JsonObject {
  return isObject(value) && jsonDeepEqual(Object.keys(value), keys);
}

function indexById(
  records: readonly JsonObject[],
  path: string,
  findings: A0U1EditPlanContractFinding[],
): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const [index, record] of records.entries()) {
    const id = record["id"];
    if (typeof id !== "string" || id.length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_ID_MISSING",
        `${path}[${String(index)}].id`,
        "Every linked record needs a stable nonempty ID.",
      );
      continue;
    }
    if (result.has(id)) {
      addFinding(
        findings,
        "EDIT_PLAN_ID_DUPLICATE",
        `${path}.${id}`,
        "Linked record IDs must be unique within their ledger.",
      );
    }
    result.set(id, record);
  }
  return result;
}

/** Strict lexical pre-pass; JSON.parse remains the semantic decoder. */
function findDuplicateJsonKeys(source: string): string[] {
  let index = 0;
  const duplicates: string[] = [];
  const skipWhitespace = (): void => {
    while (/\s/u.test(source[index] ?? "")) index += 1;
  };
  const parseString = (): string => {
    const start = index;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        index += 2;
        continue;
      }
      index += 1;
      if (character === '"') {
        return JSON.parse(source.slice(start, index)) as string;
      }
    }
    throw new Error("unterminated JSON string");
  };
  const parseValue = (path: string): void => {
    skipWhitespace();
    const character = source[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      while (index < source.length) {
        skipWhitespace();
        if (source[index] !== '"') throw new Error("object key expected");
        const key = parseString();
        const keyPath = `${path}.${key}`;
        if (keys.has(key)) duplicates.push(keyPath);
        keys.add(key);
        skipWhitespace();
        if (source[index] !== ":") throw new Error("colon expected");
        index += 1;
        parseValue(keyPath);
        skipWhitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("comma expected");
        index += 1;
      }
      throw new Error("unterminated JSON object");
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      let itemIndex = 0;
      while (index < source.length) {
        parseValue(`${path}[${String(itemIndex)}]`);
        itemIndex += 1;
        skipWhitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("comma expected");
        index += 1;
      }
      throw new Error("unterminated JSON array");
    }
    if (character === '"') {
      parseString();
      return;
    }
    const tokenStart = index;
    while (index < source.length && !/[\s,\]}]/u.test(source[index] ?? "")) {
      index += 1;
    }
    if (index === tokenStart) throw new Error("JSON value expected");
  };
  parseValue("$");
  skipWhitespace();
  if (index !== source.length) throw new Error("trailing JSON token");
  return duplicates;
}

type LoadedFixture = Readonly<{
  filename: SpecFilename;
  bytes: Uint8Array;
  source: string;
  root: JsonObject;
}>;

async function hydrateCheckedInDocumentLiterals(
  casesRoot: JsonObject,
  findings: A0U1EditPlanContractFinding[],
): Promise<JsonObject> {
  const hydrated = cloneJson(casesRoot);
  const catalog = isObject(hydrated["literalCatalog"])
    ? hydrated["literalCatalog"]
    : {};
  const documents = isObject(catalog["documents"]) ? catalog["documents"] : {};
  const repositoryPath = resolve(REPOSITORY_ROOT);
  for (const [literalId, descriptor] of Object.entries(documents)) {
    if (
      !isObject(descriptor) ||
      descriptor["kind"] !== "checked-in-independent-literal"
    ) {
      continue;
    }
    const path = `edit-plan-cases.json.literalCatalog.documents.${literalId}`;
    checkExactKeys(
      descriptor,
      [
        "kind",
        "path",
        "sha256",
        "jsonPointer",
        "materializeAs",
        "canonicalSha256",
      ],
      "EDIT_PLAN_EXTERNAL_LITERAL_KEYS",
      path,
      findings,
    );
    const relativePath = descriptor["path"];
    if (
      typeof relativePath !== "string" ||
      !relativePath.startsWith("tests/fixtures/")
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_EXTERNAL_LITERAL_PATH",
        `${path}.path`,
        "Checked-in literal paths must remain repository-relative under tests/fixtures.",
      );
      continue;
    }
    const absolutePath = resolve(REPOSITORY_ROOT, relativePath);
    if (!absolutePath.startsWith(`${repositoryPath}/`)) {
      addFinding(
        findings,
        "EDIT_PLAN_EXTERNAL_LITERAL_ESCAPE",
        `${path}.path`,
        "Checked-in literal path may not escape the repository.",
      );
      continue;
    }
    try {
      const bytes = new Uint8Array(await readFile(absolutePath));
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (
        hasUtf8Bom(bytes) ||
        source.includes("\r") ||
        !source.endsWith("\n") ||
        source.endsWith("\n\n")
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_TEXT_CANONICAL",
          path,
          "External literal must be canonical UTF-8 without BOM/CR and with exactly one final LF.",
        );
      }
      if (sha256(bytes) !== descriptor["sha256"]) {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_BYTE_DIGEST",
          `${path}.sha256`,
          "External literal bytes differ from the packet's exact SHA-256.",
        );
      }
      if (findDuplicateJsonKeys(source).length > 0) {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_DUPLICATE_KEY",
          path,
          "External checked-in literals may not contain duplicate JSON keys.",
        );
      }
      const decoded: unknown = JSON.parse(source);
      const pointer = descriptor["jsonPointer"];
      const materialized =
        pointer === ""
          ? decoded
          : typeof pointer === "string"
            ? valueAtPointer(decoded, pointer)
            : undefined;
      if (!isObject(materialized)) {
        throw new Error(
          "external literal pointer did not resolve to an object",
        );
      }
      if (descriptor["materializeAs"] !== "ValidatedDocument") {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_TYPE",
          `${path}.materializeAs`,
          "Document catalog literals must explicitly materialize as ValidatedDocument.",
        );
      }
      if (sha256(stableJson(materialized)) !== descriptor["canonicalSha256"]) {
        addFinding(
          findings,
          "EDIT_PLAN_EXTERNAL_LITERAL_CANONICAL_DIGEST",
          `${path}.canonicalSha256`,
          "External literal canonical semantics differ from the packet pin.",
        );
      }
      documents[literalId] = materialized;
    } catch (error) {
      addFinding(
        findings,
        "EDIT_PLAN_EXTERNAL_LITERAL_READ",
        path,
        `External checked-in literal could not be hydrated: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
  return hydrated;
}

function decodePointerToken(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function pointerTokens(pointer: string): string[] | null {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;
  return pointer.slice(1).split("/").map(decodePointerToken);
}

function valueAtPointer(value: unknown, pointer: string): unknown {
  const tokens = pointerTokens(pointer);
  if (tokens === null) return undefined;
  let cursor: unknown = value;
  for (const token of tokens) {
    if (Array.isArray(cursor)) {
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index < 0 || index >= cursor.length) {
        return undefined;
      }
      cursor = cursor[index];
    } else if (isObject(cursor) && Object.hasOwn(cursor, token)) {
      cursor = cursor[token];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function cloneJson<Value>(value: Value): Value {
  return structuredClone(value);
}

function isAbsentMarker(value: unknown): boolean {
  return hasExactKeys(value, ["$absent"]) && value["$absent"] === true;
}

function setAtPointer(
  root: unknown,
  pointer: string,
  operation: string,
  from: unknown,
  to: unknown,
): unknown {
  const tokens = pointerTokens(pointer);
  if (tokens === null || tokens.length === 0) {
    if (operation === "assert") return root;
    if (operation === "remove") return undefined;
    return cloneJson(to);
  }
  const next = cloneJson(root);
  let cursor: unknown = next;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(cursor)) cursor = cursor[Number(token)];
    else if (isObject(cursor)) cursor = cursor[token];
    else throw new Error("patch parent missing");
  }
  const finalToken = tokens[tokens.length - 1] as string;
  const current = Array.isArray(cursor)
    ? cursor[Number(finalToken)]
    : isObject(cursor)
      ? cursor[finalToken]
      : undefined;
  if (
    isAbsentMarker(from) ? current !== undefined : !jsonDeepEqual(current, from)
  ) {
    throw new Error("patch from mismatch");
  }
  if (operation === "assert") return next;
  if (Array.isArray(cursor)) {
    const itemIndex = Number(finalToken);
    if (operation === "remove") cursor.splice(itemIndex, 1);
    else if (operation === "add") cursor.splice(itemIndex, 0, cloneJson(to));
    else cursor[itemIndex] = cloneJson(to);
    return next;
  }
  if (!isObject(cursor)) throw new Error("patch target missing");
  if (operation === "remove") delete cursor[finalToken];
  else cursor[finalToken] = cloneJson(to);
  return next;
}

function resolveCatalogRef(ref: string, catalog: JsonObject): unknown {
  const hashParts = ref.split("#");
  if (hashParts.length > 2) return undefined;
  const catalogPath = hashParts[0] ?? "";
  const pointer = hashParts[1] ?? "";
  const normalized = catalogPath.replace(/^\/?/u, "");
  const slashParts = normalized.split("/").filter((part) => part.length > 0);
  const dotParts = normalized.split(".").filter((part) => part.length > 0);
  const parts = slashParts.length >= 2 ? slashParts : dotParts;
  if (parts[0] === "literalCatalog") parts.shift();
  if (parts.length < 2) return undefined;
  let cursor: unknown = catalog;
  for (const part of parts) {
    if (!isObject(cursor) || !Object.hasOwn(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return pointer.length === 0 ? cursor : valueAtPointer(cursor, pointer);
}

function materializeLiteral(
  value: unknown,
  catalog: JsonObject,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => materializeLiteral(item, catalog, visiting));
  }
  if (!isObject(value)) return value;
  if (Object.hasOwn(value, "$literalRef")) {
    if (!hasExactKeys(value, ["$literalRef", "patches"])) {
      throw new Error("literal reference has extra or missing keys");
    }
    const ref = value["$literalRef"];
    const patches = value["patches"];
    if (typeof ref !== "string" || !Array.isArray(patches)) {
      throw new Error("literal reference is malformed");
    }
    if (visiting.has(ref)) throw new Error("literal reference cycle");
    const referenced = resolveCatalogRef(ref, catalog);
    if (referenced === undefined) throw new Error(`missing literal ${ref}`);
    const nextVisiting = new Set(visiting);
    nextVisiting.add(ref);
    let materialized = materializeLiteral(referenced, catalog, nextVisiting);
    for (const patch of patches) {
      if (
        !hasExactKeys(patch, ["op", "jsonPointer", "from", "to"]) ||
        !["replace", "add", "remove", "assert"].includes(String(patch["op"])) ||
        typeof patch["jsonPointer"] !== "string"
      ) {
        throw new Error("literal patch is malformed");
      }
      materialized = setAtPointer(
        materialized,
        patch["jsonPointer"],
        String(patch["op"]),
        materializeLiteral(patch["from"], catalog, nextVisiting),
        materializeLiteral(patch["to"], catalog, nextVisiting),
      );
    }
    return materialized;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      materializeLiteral(child, catalog, visiting),
    ]),
  );
}

function checkExactKeys(
  value: unknown,
  keys: readonly string[],
  code: string,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!hasExactKeys(value, keys)) {
    addFinding(
      findings,
      code,
      path,
      `Expected exact ordered keys ${keys.join(", ")}.`,
    );
  }
}

function checkReferenceIds(
  ids: unknown,
  target: ReadonlyMap<string, unknown>,
  code: string,
  path: string,
  findings: A0U1EditPlanContractFinding[],
  requireNonempty = true,
): void {
  if (!Array.isArray(ids) || (requireNonempty && ids.length === 0)) {
    addFinding(findings, code, path, "Expected a nonempty reference array.");
    return;
  }
  if (!ids.every((id) => typeof id === "string")) {
    addFinding(findings, code, path, "Reference IDs must all be strings.");
    return;
  }
  if (new Set(ids).size !== ids.length) {
    addFinding(findings, code, path, "Reference IDs must be duplicate-free.");
  }
  for (const id of ids) {
    if (!target.has(id as string)) {
      addFinding(
        findings,
        code,
        `${path}.${String(id)}`,
        "Referenced ID is missing from its authority ledger.",
      );
    }
  }
}

function recursiveForbiddenKeys(
  value: unknown,
  forbidden: ReadonlySet<string>,
  path = "$",
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      recursiveForbiddenKeys(item, forbidden, `${path}[${String(index)}]`),
    );
  }
  if (!isObject(value)) return [];
  const findings: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbidden.has(key)) findings.push(childPath);
    findings.push(...recursiveForbiddenKeys(child, forbidden, childPath));
  }
  return findings;
}

function encodePointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

type LiteralDeltaEntry = Readonly<{
  jsonPointer: string;
  before: unknown;
  after: unknown;
}>;

/**
 * Independent structural delta: objects and equal-length arrays recurse;
 * additions/removals and length-changing arrays remain one literal subtree.
 */
function computeRecursiveLiteralDelta(
  before: unknown,
  after: unknown,
  path = "",
): LiteralDeltaEntry[] {
  if (jsonDeepEqual(before, after)) return [];
  if (isObject(before) && isObject(after)) {
    const keys = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].sort(codeUnitCompare);
    return keys.flatMap((key) => {
      const childPath = `${path}/${encodePointerToken(key)}`;
      const beforePresent = Object.hasOwn(before, key);
      const afterPresent = Object.hasOwn(after, key);
      if (!beforePresent || !afterPresent) {
        return [
          Object.freeze({
            jsonPointer: childPath,
            before: beforePresent ? before[key] : { $absent: true },
            after: afterPresent ? after[key] : { $absent: true },
          }),
        ];
      }
      return computeRecursiveLiteralDelta(before[key], after[key], childPath);
    });
  }
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.length === after.length
  ) {
    return before.flatMap((item, index) =>
      computeRecursiveLiteralDelta(
        item,
        after[index],
        `${path}/${String(index)}`,
      ),
    );
  }
  return [Object.freeze({ jsonPointer: path, before, after })];
}

type ExactRational = Readonly<{ numerator: bigint; denominator: bigint }>;

function bigintGcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function normalizeRational(
  numerator: bigint,
  denominator: bigint,
): ExactRational | null {
  if (denominator === 0n) return null;
  const sign = denominator < 0n ? -1n : 1n;
  const gcd = bigintGcd(numerator, denominator);
  return Object.freeze({
    numerator: (sign * numerator) / gcd,
    denominator: (sign * denominator) / gcd,
  });
}

function addRationals(
  left: ExactRational,
  right: ExactRational,
): ExactRational {
  return normalizeRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  ) as ExactRational;
}

function subtractRationals(
  left: ExactRational,
  right: ExactRational,
): ExactRational {
  return addRationals(
    left,
    Object.freeze({
      numerator: -right.numerator,
      denominator: right.denominator,
    }),
  );
}

function durationRational(value: unknown): ExactRational | null {
  if (!isObject(value)) return null;
  const numerator = value["numerator"];
  const denominator = value["denominator"];
  if (
    typeof numerator !== "number" ||
    !Number.isSafeInteger(numerator) ||
    typeof denominator !== "number" ||
    !Number.isSafeInteger(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  return normalizeRational(BigInt(numerator), BigInt(denominator));
}

function rationalText(value: ExactRational): string {
  return `${String(value.numerator)}/${String(value.denominator)}`;
}

function documentSections(document: unknown): JsonObject[] {
  return isObject(document) ? recordsAt(document["sections"]) : [];
}

function sectionMeasures(section: unknown): JsonObject[] {
  return isObject(section) ? recordsAt(section["measures"]) : [];
}

function measureEvents(measure: unknown): JsonObject[] {
  return isObject(measure) ? recordsAt(measure["events"]) : [];
}

function documentEventOrder(document: unknown): string[] {
  return documentSections(document).flatMap((section) =>
    sectionMeasures(section).flatMap((measure) =>
      measureEvents(measure).map((event) => String(event["id"])),
    ),
  );
}

function documentSectionOrder(document: unknown): string[] {
  return documentSections(document).map((section) => String(section["id"]));
}

function documentMeasureOrder(document: unknown): string[] {
  return documentSections(document).flatMap((section) =>
    sectionMeasures(section).map((measure) => String(measure["id"])),
  );
}

function findEventLocation(
  document: unknown,
  eventId: unknown,
): Readonly<{
  section: JsonObject;
  measure: JsonObject;
  event: JsonObject;
  eventIndex: number;
}> | null {
  for (const section of documentSections(document)) {
    for (const measure of sectionMeasures(section)) {
      const events = measureEvents(measure);
      const eventIndex = events.findIndex((event) => event["id"] === eventId);
      if (eventIndex >= 0) {
        return {
          section,
          measure,
          event: events[eventIndex] as JsonObject,
          eventIndex,
        };
      }
    }
  }
  return null;
}

function findSectionLocation(
  document: unknown,
  sectionId: unknown,
): Readonly<{ section: JsonObject; index: number }> | null {
  const sections = documentSections(document);
  const index = sections.findIndex((section) => section["id"] === sectionId);
  return index < 0 ? null : { section: sections[index] as JsonObject, index };
}

function objectProjection(
  value: JsonObject,
  omitted: ReadonlySet<string>,
): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omitted.has(key)),
  );
}

function sectionMetadataProjection(section: JsonObject): JsonObject {
  return Object.fromEntries(
    ["name", "annotation", "keyOverride", "voiceLeadingBoundary"].map((key) => [
      key,
      section[key],
    ]),
  );
}

function requireOperationLaw(
  condition: boolean,
  code: string,
  path: string,
  message: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!condition) addFinding(findings, code, path, message);
}

function validateCommittedOperationLaw(
  before: JsonObject,
  after: JsonObject,
  command: JsonObject,
  operation: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const beforeDocument = before["document"];
  const afterDocument = after["document"];
  const plan = isObject(command["plan"]) ? command["plan"] : {};
  if (operation === "insert-fragment") {
    const beforeIds = new Set(documentEventOrder(beforeDocument));
    const newEvents = documentSections(afterDocument).flatMap((section) =>
      sectionMeasures(section).flatMap((measure) =>
        measureEvents(measure).filter(
          (event) => !beforeIds.has(String(event["id"])),
        ),
      ),
    );
    requireOperationLaw(
      newEvents.length > 0,
      "EDIT_PLAN_INSERTED_EVENT_MISSING",
      path,
      "A committed fragment insertion must add at least one event.",
      findings,
    );
    for (const event of newEvents) {
      requireExact(
        event["voicing"],
        A0_U1_NEW_EVENT_AUTO_VOICING,
        "EDIT_PLAN_INSERTED_VOICING",
        `${path}.event.${String(event["id"])}.voicing`,
        "Every inserted event must use the exact reviewed Auto voicing.",
        findings,
      );
    }
    return;
  }
  if (operation === "split-event-duration") {
    const source = findEventLocation(beforeDocument, plan["eventId"]);
    const retained = findEventLocation(afterDocument, plan["eventId"]);
    const beforeIds = new Set(documentEventOrder(beforeDocument));
    const createdIds = documentEventOrder(afterDocument).filter(
      (id) => !beforeIds.has(id),
    );
    const created =
      createdIds.length === 1
        ? findEventLocation(afterDocument, createdIds[0])
        : null;
    requireOperationLaw(
      source !== null &&
        retained !== null &&
        created !== null &&
        retained.measure["id"] === source.measure["id"] &&
        created.measure["id"] === source.measure["id"] &&
        created.eventIndex === retained.eventIndex + 1,
      "EDIT_PLAN_SPLIT_EVENT_IDENTITY",
      path,
      "Split event must retain the original as left and allocate exactly one adjacent right event.",
      findings,
    );
    if (source !== null && retained !== null && created !== null) {
      requireExact(
        retained.event["duration"],
        plan["firstDuration"],
        "EDIT_PLAN_SPLIT_FIRST_DURATION",
        path,
        "Retained split duration differs from the command.",
        findings,
      );
      requireExact(
        created.event["duration"],
        plan["secondDuration"],
        "EDIT_PLAN_SPLIT_SECOND_DURATION",
        path,
        "Created split duration differs from the command.",
        findings,
      );
      requireExact(
        objectProjection(retained.event, new Set(["duration"])),
        objectProjection(source.event, new Set(["duration"])),
        "EDIT_PLAN_SPLIT_LEFT_CONTENT",
        path,
        "Split left event must retain every non-duration field.",
        findings,
      );
      requireExact(
        objectProjection(
          created.event,
          new Set(["id", "duration", "annotation"]),
        ),
        objectProjection(
          source.event,
          new Set(["id", "duration", "annotation"]),
        ),
        "EDIT_PLAN_SPLIT_RIGHT_CONTENT",
        path,
        "Split right event must copy exact chord and voicing.",
        findings,
      );
      requireExact(
        created.event["annotation"],
        "",
        "EDIT_PLAN_SPLIT_RIGHT_ANNOTATION",
        path,
        "Split right annotation must be empty.",
        findings,
      );
      requireExact(
        retained.measure["completion"],
        source.measure["completion"],
        "EDIT_PLAN_SPLIT_COMPLETION",
        path,
        "Split duration must preserve completion exactly.",
        findings,
      );
      const sourceDuration = durationRational(source.event["duration"]);
      const first = durationRational(plan["firstDuration"]);
      const second = durationRational(plan["secondDuration"]);
      requireOperationLaw(
        sourceDuration !== null &&
          first !== null &&
          second !== null &&
          jsonDeepEqual(addRationals(first, second), sourceDuration),
        "EDIT_PLAN_SPLIT_SUM",
        path,
        "Split durations must sum exactly to the source duration.",
        findings,
      );
    }
    return;
  }
  if (operation === "join-event-durations") {
    const left = findEventLocation(beforeDocument, plan["leftEventId"]);
    const right = findEventLocation(beforeDocument, plan["rightEventId"]);
    const survivor = findEventLocation(afterDocument, plan["leftEventId"]);
    const removed = findEventLocation(afterDocument, plan["rightEventId"]);
    requireOperationLaw(
      left !== null &&
        right !== null &&
        survivor !== null &&
        removed === null &&
        left.measure["id"] === right.measure["id"] &&
        right.eventIndex === left.eventIndex + 1,
      "EDIT_PLAN_JOIN_EVENT_IDENTITY",
      path,
      "Join must consume immediate same-measure siblings and retain only the left ID.",
      findings,
    );
    if (left !== null && right !== null && survivor !== null) {
      requireExact(
        objectProjection(left.event, new Set(["id", "duration", "annotation"])),
        objectProjection(
          right.event,
          new Set(["id", "duration", "annotation"]),
        ),
        "EDIT_PLAN_JOIN_CONTENT_PRECONDITION",
        path,
        "Joined events must have exact chord and voicing equality.",
        findings,
      );
      requireExact(
        right.event["annotation"],
        "",
        "EDIT_PLAN_JOIN_RIGHT_ANNOTATION",
        path,
        "Join requires an empty right annotation.",
        findings,
      );
      requireExact(
        objectProjection(survivor.event, new Set(["duration"])),
        objectProjection(left.event, new Set(["duration"])),
        "EDIT_PLAN_JOIN_SURVIVOR_CONTENT",
        path,
        "Joined left survivor must retain every non-duration field.",
        findings,
      );
      requireExact(
        survivor.event["duration"],
        plan["joinedDuration"],
        "EDIT_PLAN_JOIN_DURATION",
        path,
        "Joined duration differs from the command.",
        findings,
      );
      requireExact(
        survivor.measure["completion"],
        left.measure["completion"],
        "EDIT_PLAN_JOIN_COMPLETION",
        path,
        "Join duration must preserve completion exactly.",
        findings,
      );
      const leftDuration = durationRational(left.event["duration"]);
      const rightDuration = durationRational(right.event["duration"]);
      const joined = durationRational(plan["joinedDuration"]);
      requireOperationLaw(
        leftDuration !== null &&
          rightDuration !== null &&
          joined !== null &&
          jsonDeepEqual(addRationals(leftDuration, rightDuration), joined),
        "EDIT_PLAN_JOIN_SUM",
        path,
        "Joined duration must equal the exact sum of both inputs.",
        findings,
      );
    }
    return;
  }
  if (operation === "split-section") {
    const source = findSectionLocation(beforeDocument, plan["sectionId"]);
    const retained = findSectionLocation(afterDocument, plan["sectionId"]);
    const beforeIds = new Set(documentSectionOrder(beforeDocument));
    const createdIds = documentSectionOrder(afterDocument).filter(
      (id) => !beforeIds.has(id),
    );
    const created =
      createdIds.length === 1
        ? findSectionLocation(afterDocument, createdIds[0])
        : null;
    if (source === null || retained === null || created === null) {
      addFinding(
        findings,
        "EDIT_PLAN_SPLIT_SECTION_IDENTITY",
        path,
        "Split section must retain one leading ID and allocate exactly one suffix ID.",
      );
      return;
    }
    const beforeMeasures = sectionMeasures(source.section);
    const splitIndex = beforeMeasures.findIndex(
      (measure) => measure["id"] === plan["beforeMeasureId"],
    );
    requireOperationLaw(
      splitIndex > 0 && splitIndex < beforeMeasures.length,
      "EDIT_PLAN_SPLIT_SECTION_BOUNDARY",
      path,
      "Section split boundary must be strict interior.",
      findings,
    );
    requireExact(
      sectionMetadataProjection(retained.section),
      sectionMetadataProjection(source.section),
      "EDIT_PLAN_SPLIT_SECTION_METADATA",
      path,
      "Leading section metadata must survive exactly.",
      findings,
    );
    requireExact(
      sectionMetadataProjection(created.section),
      plan["newSectionMetadata"],
      "EDIT_PLAN_SPLIT_SECTION_NEW_METADATA",
      path,
      "Suffix section metadata must equal the command.",
      findings,
    );
    requireExact(
      sectionMeasures(retained.section),
      beforeMeasures.slice(0, splitIndex),
      "EDIT_PLAN_SPLIT_SECTION_PREFIX",
      path,
      "Leading measures must be the exact source prefix.",
      findings,
    );
    requireExact(
      sectionMeasures(created.section),
      beforeMeasures.slice(splitIndex),
      "EDIT_PLAN_SPLIT_SECTION_SUFFIX",
      path,
      "Suffix measures must move without any identity or value change.",
      findings,
    );
    return;
  }
  if (operation === "join-sections") {
    const left = findSectionLocation(beforeDocument, plan["leftSectionId"]);
    const right = findSectionLocation(beforeDocument, plan["rightSectionId"]);
    const survivor = findSectionLocation(afterDocument, plan["leftSectionId"]);
    const removed = findSectionLocation(afterDocument, plan["rightSectionId"]);
    requireOperationLaw(
      left !== null &&
        right !== null &&
        survivor !== null &&
        removed === null &&
        right.index === left.index + 1,
      "EDIT_PLAN_JOIN_SECTION_IDENTITY",
      path,
      "Join sections must consume immediate right adjacency and retain only the left ID.",
      findings,
    );
    if (left !== null && right !== null && survivor !== null) {
      requireExact(
        sectionMetadataProjection(left.section),
        plan["expectedLeftMetadata"],
        "EDIT_PLAN_JOIN_LEFT_SNAPSHOT",
        path,
        "Expected left metadata must match the literal before-state.",
        findings,
      );
      requireExact(
        sectionMetadataProjection(right.section),
        plan["expectedRightMetadata"],
        "EDIT_PLAN_JOIN_RIGHT_SNAPSHOT",
        path,
        "Expected right metadata must match the literal before-state.",
        findings,
      );
      requireExact(
        sectionMetadataProjection(survivor.section),
        plan["resultMetadata"],
        "EDIT_PLAN_JOIN_RESULT_METADATA",
        path,
        "Survivor metadata must equal the explicit result.",
        findings,
      );
      requireExact(
        sectionMeasures(survivor.section),
        [...sectionMeasures(left.section), ...sectionMeasures(right.section)],
        "EDIT_PLAN_JOIN_SECTION_MEASURES",
        path,
        "Joined measures must preserve exact left-then-right values and identities.",
        findings,
      );
    }
  }
}

function validatePublicationEvidence(
  before: JsonObject,
  after: JsonObject,
  expected: JsonObject,
  phase: unknown,
  result: JsonObject | null,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const effects = expected["effects"];
  if (!Array.isArray(effects)) {
    addFinding(
      findings,
      "EDIT_PLAN_EFFECTS_LITERAL",
      `${path}.effects`,
      "Effects must be a complete literal array.",
    );
    return;
  }
  if (result?.["ok"] === false) {
    requireExact(
      effects,
      [],
      "EDIT_PLAN_REFUSAL_EFFECTS",
      `${path}.effects`,
      "Refusal must emit no effects.",
      findings,
    );
    requireExact(
      objectProjection(after, new Set(["notices", "nextSequence"])),
      objectProjection(before, new Set(["notices", "nextSequence"])),
      "EDIT_PLAN_REFUSAL_ATOMICITY",
      `${path}.afterState`,
      "Refusal may change only bounded notice and sequence bookkeeping.",
      findings,
    );
    requireExact(
      after["revision"],
      before["revision"],
      "EDIT_PLAN_REFUSAL_REVISION",
      `${path}.afterState.revision`,
      "Refusal must not advance revision.",
      findings,
    );
    return;
  }
  if (result?.["ok"] !== true) return;
  const expectedKinds = [
    "queue-recovery",
    "compile-playback-plan",
    "restore-focus",
    "announce",
  ];
  requireExact(
    effects.map((effect) => (isObject(effect) ? effect["kind"] : null)),
    expectedKinds,
    "EDIT_PLAN_SUCCESS_EFFECTS",
    `${path}.effects`,
    "Successful edit, undo, and redo transitions must emit the exact playback-relevant effect sequence.",
    findings,
  );
  for (const [index, effect] of effects.entries()) {
    if (!isObject(effect) || effect["revision"] !== after["revision"]) {
      addFinding(
        findings,
        "EDIT_PLAN_EFFECT_REVISION",
        `${path}.effects[${String(index)}]`,
        "Every effect must target the committed after-state revision.",
      );
    }
  }
  const quickEntry = isObject(after["quickEntry"]) ? after["quickEntry"] : {};
  if (
    quickEntry["text"] !== "" ||
    quickEntry["status"] !== "idle" ||
    !jsonDeepEqual(quickEntry["issueCodes"], []) ||
    quickEntry["baseRevision"] !== after["revision"] ||
    !jsonDeepEqual(
      quickEntry["target"],
      isObject(after["bookmarks"])
        ? after["bookmarks"]["insertion"]
        : undefined,
    )
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_QUICK_ENTRY_PUBLICATION",
      `${path}.afterState.quickEntry`,
      "Successful publication must clear Quick Entry at the committed revision and retain the new insertion bookmark as target.",
    );
  }
  if (phase === "apply") {
    const beforeHistory = isObject(before["history"]) ? before["history"] : {};
    const afterHistory = isObject(after["history"]) ? after["history"] : {};
    const beforeUndo = Array.isArray(beforeHistory["undo"])
      ? beforeHistory["undo"]
      : [];
    const afterUndo = Array.isArray(afterHistory["undo"])
      ? afterHistory["undo"]
      : [];
    requireOperationLaw(
      afterUndo.length === beforeUndo.length + 1 &&
        Array.isArray(afterHistory["redo"]) &&
        afterHistory["redo"].length === 0,
      "EDIT_PLAN_ONE_HISTORY_ENTRY",
      `${path}.afterState.history`,
      "A committed plan must append exactly one undo entry and clear redo.",
      findings,
    );
    const entry = afterUndo[afterUndo.length - 1];
    if (!isObject(entry)) {
      addFinding(
        findings,
        "EDIT_PLAN_HISTORY_ENTRY_LITERAL",
        `${path}.afterState.history.undo`,
        "Committed history must contain the complete literal new entry.",
      );
    } else {
      requireExact(
        entry["before"],
        before["document"],
        "EDIT_PLAN_HISTORY_BEFORE",
        `${path}.afterState.history.undo.before`,
        "History before document must equal the complete before-state document.",
        findings,
      );
      requireExact(
        entry["after"],
        after["document"],
        "EDIT_PLAN_HISTORY_AFTER",
        `${path}.afterState.history.undo.after`,
        "History after document must equal the complete after-state document.",
        findings,
      );
      requireExact(
        entry["beforeBookmarks"],
        before["bookmarks"],
        "EDIT_PLAN_HISTORY_BEFORE_BOOKMARKS",
        `${path}.afterState.history.undo.beforeBookmarks`,
        "History before bookmarks must be literal.",
        findings,
      );
      requireExact(
        entry["afterBookmarks"],
        after["bookmarks"],
        "EDIT_PLAN_HISTORY_AFTER_BOOKMARKS",
        `${path}.afterState.history.undo.afterBookmarks`,
        "History after bookmarks must be literal.",
        findings,
      );
    }
  }
}

function completionMeasureIdsForPlan(plan: JsonObject): unknown[] {
  const declarations =
    plan["kind"] === "insert-fragment" && isObject(plan["placement"])
      ? plan["placement"]["completionDeclarations"]
      : plan["completionDeclarations"];
  return recordsAt(declarations).map((row) => row["measureId"]);
}

function expectedTimelineDisposition(plan: JsonObject): string | null {
  switch (plan["kind"]) {
    case "insert-fragment":
      return isObject(plan["source"]) &&
        plan["source"]["kind"] === "recovered-chord"
        ? "insert-one-recovered-chord-at-declared-boundary"
        : "splice-source-order-at-declared-boundary";
    case "split-event-duration":
      return "replace-one-span-with-two-exact-sum-spans";
    case "join-event-durations":
      return "replace-two-equal-content-spans-with-one-exact-sum-span";
    case "split-section":
    case "join-sections":
      return "preserve-flattened-event-order-and-durations";
    default:
      return null;
  }
}

function expectedSurvivorId(plan: JsonObject): unknown {
  switch (plan["kind"]) {
    case "split-event-duration":
      return plan["eventId"];
    case "join-event-durations":
      return plan["leftEventId"];
    case "split-section":
      return plan["sectionId"];
    case "join-sections":
      return plan["leftSectionId"];
    default:
      return null;
  }
}

function identityRecords(document: unknown): Readonly<{
  sections: readonly string[];
  measures: readonly string[];
  events: readonly string[];
}> {
  return {
    sections: documentSectionOrder(document),
    measures: documentMeasureOrder(document),
    events: documentEventOrder(document),
  };
}

function expectedAllocatedIdentityProjection(
  beforeDocument: unknown,
  afterDocument: unknown,
): JsonObject[] {
  const before = identityRecords(beforeDocument);
  const occupied = new Set([
    ...before.sections,
    ...before.measures,
    ...before.events,
  ]);
  const result: JsonObject[] = [];
  for (const section of documentSections(afterDocument)) {
    const sectionId = String(section["id"]);
    if (!occupied.has(sectionId))
      result.push({ kind: "section", id: sectionId });
    for (const measure of sectionMeasures(section)) {
      const measureId = String(measure["id"]);
      if (!occupied.has(measureId))
        result.push({ kind: "measure", id: measureId });
      for (const event of measureEvents(measure)) {
        const eventId = String(event["id"]);
        if (!occupied.has(eventId)) result.push({ kind: "event", id: eventId });
      }
    }
  }
  return result;
}

function expectedRemovedIdentityProjection(
  beforeDocument: unknown,
  afterDocument: unknown,
): JsonObject[] {
  const after = identityRecords(afterDocument);
  const retained = new Set([
    ...after.sections,
    ...after.measures,
    ...after.events,
  ]);
  const result: JsonObject[] = [];
  for (const section of documentSections(beforeDocument)) {
    const sectionId = String(section["id"]);
    if (!retained.has(sectionId))
      result.push({ kind: "section", id: sectionId });
    for (const event of sectionMeasures(section).flatMap(measureEvents)) {
      const eventId = String(event["id"]);
      if (!retained.has(eventId)) result.push({ kind: "event", id: eventId });
    }
  }
  return result;
}

function validateAtomicEditResultDetail(
  before: JsonObject,
  after: JsonObject,
  command: JsonObject,
  expected: JsonObject,
  result: JsonObject,
  phase: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const appliesEditPlan = command["kind"] === "apply-edit-plan";
  const outerCounters = isObject(expected["counters"])
    ? expected["counters"]["outer"]
    : undefined;
  requireExact(
    result["state"],
    after,
    "EDIT_PLAN_RESULT_STATE",
    `${path}.state`,
    "Result state must equal the complete literal after-state.",
    findings,
  );
  requireExact(
    result["effects"],
    expected["effects"],
    "EDIT_PLAN_RESULT_EFFECTS",
    `${path}.effects`,
    "Result effects must equal the complete expected effects.",
    findings,
  );
  requireExact(
    result["counters"],
    outerCounters,
    "EDIT_PLAN_RESULT_OUTER_COUNTERS",
    `${path}.counters`,
    "Result counters must equal the outer A0 work record.",
    findings,
  );

  if (result["ok"] === true) {
    checkExactKeys(
      result,
      appliesEditPlan && phase === "apply"
        ? EXPECTED_SUCCESS_RESULT_KEYS
        : ["ok", "state", "outcome", "effects", "counters"],
      "EDIT_PLAN_SUCCESS_RESULT_KEYS",
      path,
      findings,
    );
    if (!appliesEditPlan || phase !== "apply") return;
    if (result["outcome"] !== "committed") {
      addFinding(
        findings,
        "EDIT_PLAN_SUCCESS_OUTCOME",
        `${path}.outcome`,
        "Noncoalescing atomic edit plans have exactly the committed outcome.",
      );
    }
    const receipt = isObject(result["editPlanReceipt"])
      ? result["editPlanReceipt"]
      : {};
    checkExactKeys(
      receipt,
      EXPECTED_RECEIPT_KEYS,
      "EDIT_PLAN_RECEIPT_KEYS",
      `${path}.editPlanReceipt`,
      findings,
    );
    const plan = isObject(command["plan"]) ? command["plan"] : {};
    requireExact(
      receipt["schema"],
      A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
      "EDIT_PLAN_RECEIPT_SCHEMA",
      `${path}.editPlanReceipt.schema`,
      "Receipt schema changed.",
      findings,
    );
    requireExact(
      receipt["commandKind"],
      "apply-edit-plan",
      "EDIT_PLAN_RECEIPT_COMMAND_KIND",
      `${path}.editPlanReceipt.commandKind`,
      "Receipt command kind must be exact.",
      findings,
    );
    requireExact(
      receipt["commandId"],
      command["id"],
      "EDIT_PLAN_RECEIPT_COMMAND_ID",
      `${path}.editPlanReceipt.commandId`,
      "Receipt command ID must equal the envelope.",
      findings,
    );
    requireExact(
      receipt["planKind"],
      plan["kind"],
      "EDIT_PLAN_RECEIPT_PLAN_KIND",
      `${path}.editPlanReceipt.planKind`,
      "Receipt plan kind must equal the closed plan discriminant.",
      findings,
    );
    requireExact(
      receipt["documentId"],
      isObject(after["document"]) ? after["document"]["id"] : undefined,
      "EDIT_PLAN_RECEIPT_DOCUMENT",
      `${path}.editPlanReceipt.documentId`,
      "Receipt document ID must equal the published document.",
      findings,
    );
    requireExact(
      receipt["baseRevision"],
      before["revision"],
      "EDIT_PLAN_RECEIPT_BASE_REVISION",
      `${path}.editPlanReceipt.baseRevision`,
      "Receipt base revision must equal the before-state.",
      findings,
    );
    requireExact(
      receipt["committedRevision"],
      after["revision"],
      "EDIT_PLAN_RECEIPT_COMMITTED_REVISION",
      `${path}.editPlanReceipt.committedRevision`,
      "Receipt committed revision must equal the after-state.",
      findings,
    );
    const projectedAllocated = recordsAt(receipt["allocatedIdentities"]).map(
      (row) => ({ kind: row["kind"], id: row["id"] }),
    );
    const projectedRemoved = recordsAt(receipt["removedIdentities"]).map(
      (row) => ({ kind: row["kind"], id: row["id"] }),
    );
    requireExact(
      projectedAllocated,
      expectedAllocatedIdentityProjection(
        before["document"],
        after["document"],
      ),
      "EDIT_PLAN_RECEIPT_ALLOCATED_IDENTITIES",
      `${path}.editPlanReceipt.allocatedIdentities`,
      "Receipt allocations must equal every fresh ID in structural preorder.",
      findings,
    );
    requireExact(
      projectedRemoved,
      expectedRemovedIdentityProjection(before["document"], after["document"]),
      "EDIT_PLAN_RECEIPT_REMOVED_IDENTITIES",
      `${path}.editPlanReceipt.removedIdentities`,
      "Receipt removals must equal every removed section/event ID in source order.",
      findings,
    );
    requireExact(
      receipt["survivorId"],
      expectedSurvivorId(plan),
      "EDIT_PLAN_RECEIPT_SURVIVOR",
      `${path}.editPlanReceipt.survivorId`,
      "Receipt survivor must match the operation policy.",
      findings,
    );
    requireExact(
      receipt["completionMeasureIds"],
      completionMeasureIdsForPlan(plan),
      "EDIT_PLAN_RECEIPT_COMPLETIONS",
      `${path}.editPlanReceipt.completionMeasureIds`,
      "Receipt completion IDs must equal the closed command declarations.",
      findings,
    );
    requireExact(
      receipt["timelineDisposition"],
      expectedTimelineDisposition(plan),
      "EDIT_PLAN_RECEIPT_TIMELINE",
      `${path}.editPlanReceipt.timelineDisposition`,
      "Receipt timeline disposition must match the plan kind/lane.",
      findings,
    );
    checkExactKeys(
      receipt["bookmarks"],
      [
        "selectionPolicy",
        "selectionReplacements",
        "insertionPolicy",
        "insertionRewrite",
        "rangePolicy",
        "rangeBoundaryRewrites",
        "rangeCleared",
        "focusPolicy",
      ],
      "EDIT_PLAN_RECEIPT_BOOKMARK_KEYS",
      `${path}.editPlanReceipt.bookmarks`,
      findings,
    );
    requireExact(
      receipt["quickEntryDisposition"],
      "clear-to-idle-at-committed-revision",
      "EDIT_PLAN_RECEIPT_QUICK_ENTRY",
      `${path}.editPlanReceipt.quickEntryDisposition`,
      "Receipt must record exact Quick Entry clearing.",
      findings,
    );
    requireExact(
      receipt["historyEntriesAppended"],
      1,
      "EDIT_PLAN_RECEIPT_HISTORY_COUNT",
      `${path}.editPlanReceipt.historyEntriesAppended`,
      "Receipt must record exactly one history entry.",
      findings,
    );
    requireExact(
      receipt["structuralDecodeCalls"],
      1,
      "EDIT_PLAN_RECEIPT_F2_COUNT",
      `${path}.editPlanReceipt.structuralDecodeCalls`,
      "Receipt must record exactly one F2 call.",
      findings,
    );
    requireExact(
      receipt["semanticValidationCalls"],
      1,
      "EDIT_PLAN_RECEIPT_F3_COUNT",
      `${path}.editPlanReceipt.semanticValidationCalls`,
      "Receipt must record exactly one F3 call.",
      findings,
    );
    requireExact(
      receipt["effects"],
      ["queue-recovery", "compile-playback-plan", "restore-focus", "announce"],
      "EDIT_PLAN_RECEIPT_EFFECTS",
      `${path}.editPlanReceipt.effects`,
      "Receipt effect kinds must remain exact.",
      findings,
    );
    requireExact(
      receipt["work"],
      isObject(expected["counters"])
        ? expected["counters"]["editPlan"]
        : undefined,
      "EDIT_PLAN_RECEIPT_WORK",
      `${path}.editPlanReceipt.work`,
      "Receipt nested work must equal independently declared counters.",
      findings,
    );
    const receiptWork = isObject(receipt["work"]) ? receipt["work"] : {};
    const allocatedCount = recordsAt(receipt["allocatedIdentities"]).length;
    requireExact(
      receiptWork["idAllocationAttempts"],
      allocatedCount,
      "EDIT_PLAN_SUCCESS_ALLOCATION_ATTEMPTS",
      `${path}.editPlanReceipt.work.idAllocationAttempts`,
      "Successful allocation attempts must equal the exact fresh-identity count.",
      findings,
    );
    requireExact(
      receiptWork["idCollisionChecks"],
      allocatedCount,
      "EDIT_PLAN_SUCCESS_COLLISION_CHECKS",
      `${path}.editPlanReceipt.work.idCollisionChecks`,
      "Every successful returned ID must receive one collision check.",
      findings,
    );
    requireExact(
      receiptWork["peakAllocatedIdRecords"],
      allocatedCount,
      "EDIT_PLAN_SUCCESS_PEAK_ALLOCATIONS",
      `${path}.editPlanReceipt.work.peakAllocatedIdRecords`,
      "Successful peak allocated-ID records must equal the reserved fresh-identity count.",
      findings,
    );
    if (plan["kind"] === "insert-fragment") {
      const sourceText =
        isObject(plan["source"]) &&
        isObject(plan["source"]["quickEntrySnapshot"])
          ? plan["source"]["quickEntrySnapshot"]["sourceText"]
          : undefined;
      const codePoints =
        typeof sourceText === "string" ? [...sourceText].length : -1;
      const utf8Bytes =
        typeof sourceText === "string"
          ? new TextEncoder().encode(sourceText).length
          : -1;
      requireExact(
        receiptWork["sourceCodePointsObserved"],
        codePoints,
        "EDIT_PLAN_SUCCESS_SOURCE_CODE_POINTS",
        `${path}.editPlanReceipt.work.sourceCodePointsObserved`,
        "Committed insert source code-point work must equal the exact guarded text.",
        findings,
      );
      requireExact(
        receiptWork["sourceUtf8BytesObserved"],
        utf8Bytes,
        "EDIT_PLAN_SUCCESS_SOURCE_BYTES",
        `${path}.editPlanReceipt.work.sourceUtf8BytesObserved`,
        "Committed insert UTF-8 work must equal the exact guarded text.",
        findings,
      );
      requireExact(
        receiptWork["quickEntrySnapshotFieldsCompared"],
        A0_U1_ATOMIC_EDIT_LIMITS.quickEntrySnapshotFieldsCompared,
        "EDIT_PLAN_SUCCESS_SNAPSHOT_FIELDS",
        `${path}.editPlanReceipt.work.quickEntrySnapshotFieldsCompared`,
        "Committed insert must compare all Quick Entry snapshot fields.",
        findings,
      );
      requireExact(
        receiptWork["syntaxParseCalls"],
        1,
        "EDIT_PLAN_SUCCESS_PARSE_CALLS",
        `${path}.editPlanReceipt.work.syntaxParseCalls`,
        "Committed insert must call T0 exactly once.",
        findings,
      );
    } else {
      for (const counterName of [
        "sourceCodePointsObserved",
        "sourceUtf8BytesObserved",
        "quickEntrySnapshotFieldsCompared",
        "quickEntryIssueCodesCompared",
        "syntaxParseCalls",
        "warningAcknowledgementsCompared",
        "insertableChordsExamined",
        "recoveryFieldsCompared",
        "draftSectionsVisited",
        "draftMeasuresVisited",
        "draftEventsVisited",
      ]) {
        requireExact(
          receiptWork[counterName],
          0,
          "EDIT_PLAN_NONINSERT_SOURCE_WORK",
          `${path}.editPlanReceipt.work.${counterName}`,
          "Non-insert plans perform zero source/T0/recovery work.",
          findings,
        );
      }
    }
    const insertSource = isObject(plan["source"]) ? plan["source"] : null;
    const insertReceipt = receipt["insertSource"];
    if (plan["kind"] !== "insert-fragment") {
      requireExact(
        insertReceipt,
        null,
        "EDIT_PLAN_RECEIPT_INSERT_SOURCE",
        `${path}.editPlanReceipt.insertSource`,
        "Non-insert plans require a null insert receipt.",
        findings,
      );
    } else if (insertSource?.["kind"] === "complete-draft") {
      if (!isObject(insertReceipt)) {
        addFinding(
          findings,
          "EDIT_PLAN_RECEIPT_COMPLETE_SOURCE",
          `${path}.editPlanReceipt.insertSource`,
          "Complete insertion requires complete source receipt detail.",
        );
      } else {
        checkExactKeys(
          insertReceipt,
          [
            "kind",
            "parserOutcome",
            "quickEntrySnapshotMatched",
            "canonicalTargetMatched",
            "acknowledgedWarningCount",
          ],
          "EDIT_PLAN_RECEIPT_COMPLETE_SOURCE_KEYS",
          `${path}.editPlanReceipt.insertSource`,
          findings,
        );
        requireExact(
          insertReceipt["kind"],
          "complete-draft",
          "EDIT_PLAN_RECEIPT_COMPLETE_KIND",
          `${path}.editPlanReceipt.insertSource.kind`,
          "Complete receipt lane changed.",
          findings,
        );
        requireExact(
          insertReceipt["parserOutcome"],
          "success",
          "EDIT_PLAN_RECEIPT_COMPLETE_PARSE",
          `${path}.editPlanReceipt.insertSource.parserOutcome`,
          "Complete receipt must record T0 success.",
          findings,
        );
        requireExact(
          insertReceipt["quickEntrySnapshotMatched"],
          true,
          "EDIT_PLAN_RECEIPT_SNAPSHOT",
          `${path}.editPlanReceipt.insertSource.quickEntrySnapshotMatched`,
          "Committed insert must prove snapshot match.",
          findings,
        );
        requireExact(
          insertReceipt["canonicalTargetMatched"],
          true,
          "EDIT_PLAN_RECEIPT_TARGET",
          `${path}.editPlanReceipt.insertSource.canonicalTargetMatched`,
          "Committed insert must prove canonical target match.",
          findings,
        );
        requireExact(
          insertReceipt["acknowledgedWarningCount"],
          Array.isArray(insertSource["warningAcknowledgements"])
            ? insertSource["warningAcknowledgements"].length
            : -1,
          "EDIT_PLAN_RECEIPT_WARNING_COUNT",
          `${path}.editPlanReceipt.insertSource.acknowledgedWarningCount`,
          "Receipt warning count must equal the exact command array.",
          findings,
        );
        const snapshot = isObject(insertSource["quickEntrySnapshot"])
          ? insertSource["quickEntrySnapshot"]
          : {};
        requireExact(
          receiptWork["quickEntryIssueCodesCompared"],
          Array.isArray(snapshot["issueCodes"])
            ? snapshot["issueCodes"].length
            : -1,
          "EDIT_PLAN_RECEIPT_COMPLETE_ISSUE_WORK",
          `${path}.editPlanReceipt.work.quickEntryIssueCodesCompared`,
          "Complete insertion must compare the exact Quick Entry issue-code sequence.",
          findings,
        );
        requireExact(
          receiptWork["warningAcknowledgementsCompared"],
          Array.isArray(insertSource["warningAcknowledgements"])
            ? insertSource["warningAcknowledgements"].length
            : -1,
          "EDIT_PLAN_RECEIPT_COMPLETE_WARNING_WORK",
          `${path}.editPlanReceipt.work.warningAcknowledgementsCompared`,
          "Complete insertion warning work must equal the exact acknowledgement count.",
          findings,
        );
        requireExact(
          receiptWork["insertableChordsExamined"],
          0,
          "EDIT_PLAN_RECEIPT_COMPLETE_RECOVERY_WORK",
          `${path}.editPlanReceipt.work.insertableChordsExamined`,
          "Complete insertion examines no recovery chords.",
          findings,
        );
        requireExact(
          receiptWork["recoveryFieldsCompared"],
          0,
          "EDIT_PLAN_RECEIPT_COMPLETE_RECOVERY_FIELDS",
          `${path}.editPlanReceipt.work.recoveryFieldsCompared`,
          "Complete insertion compares no recovery fields.",
          findings,
        );
      }
    } else if (insertSource?.["kind"] === "recovered-chord") {
      if (!isObject(insertReceipt)) {
        addFinding(
          findings,
          "EDIT_PLAN_RECEIPT_RECOVERED_SOURCE",
          `${path}.editPlanReceipt.insertSource`,
          "Recovered insertion requires complete source receipt detail.",
        );
      } else {
        checkExactKeys(
          insertReceipt,
          [
            "kind",
            "parserOutcome",
            "quickEntrySnapshotMatched",
            "canonicalTargetMatched",
            "selectedGlobalOrdinal",
            "selectedRange",
            "durationSource",
            "siblingsApplied",
            "layoutLossAcknowledged",
          ],
          "EDIT_PLAN_RECEIPT_RECOVERED_SOURCE_KEYS",
          `${path}.editPlanReceipt.insertSource`,
          findings,
        );
        requireExact(
          insertReceipt["kind"],
          "recovered-chord",
          "EDIT_PLAN_RECEIPT_RECOVERED_KIND",
          `${path}.editPlanReceipt.insertSource.kind`,
          "Recovered receipt lane changed.",
          findings,
        );
        requireExact(
          insertReceipt["parserOutcome"],
          "failure",
          "EDIT_PLAN_RECEIPT_RECOVERED_PARSE",
          `${path}.editPlanReceipt.insertSource.parserOutcome`,
          "Recovery must record T0 failure.",
          findings,
        );
        requireExact(
          insertReceipt["selectedGlobalOrdinal"],
          insertSource["selectedGlobalOrdinal"],
          "EDIT_PLAN_RECEIPT_RECOVERED_ORDINAL",
          `${path}.editPlanReceipt.insertSource.selectedGlobalOrdinal`,
          "Receipt ordinal must equal the one selected command ordinal.",
          findings,
        );
        requireExact(
          insertReceipt["durationSource"],
          insertSource["callerDuration"] === null
            ? "t0-resolved"
            : "caller-required",
          "EDIT_PLAN_RECEIPT_RECOVERED_DURATION",
          `${path}.editPlanReceipt.insertSource.durationSource`,
          "Recovered duration source must match the exact caller branch.",
          findings,
        );
        requireExact(
          insertReceipt["siblingsApplied"],
          0,
          "EDIT_PLAN_RECEIPT_RECOVERED_SIBLINGS",
          `${path}.editPlanReceipt.insertSource.siblingsApplied`,
          "No recovery sibling may be applied.",
          findings,
        );
        requireExact(
          insertReceipt["layoutLossAcknowledged"],
          true,
          "EDIT_PLAN_RECEIPT_RECOVERED_LAYOUT",
          `${path}.editPlanReceipt.insertSource.layoutLossAcknowledged`,
          "Recovered receipt must prove layout-loss acknowledgement.",
          findings,
        );
        requireExact(
          insertReceipt["quickEntrySnapshotMatched"],
          true,
          "EDIT_PLAN_RECEIPT_SNAPSHOT",
          `${path}.editPlanReceipt.insertSource.quickEntrySnapshotMatched`,
          "Committed insert must prove snapshot match.",
          findings,
        );
        requireExact(
          insertReceipt["canonicalTargetMatched"],
          true,
          "EDIT_PLAN_RECEIPT_TARGET",
          `${path}.editPlanReceipt.insertSource.canonicalTargetMatched`,
          "Committed insert must prove canonical target match.",
          findings,
        );
        checkExactKeys(
          insertReceipt["selectedRange"],
          A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sourceRange,
          "EDIT_PLAN_RECEIPT_RECOVERED_RANGE",
          `${path}.editPlanReceipt.insertSource.selectedRange`,
          findings,
        );
        const snapshot = isObject(insertSource["quickEntrySnapshot"])
          ? insertSource["quickEntrySnapshot"]
          : {};
        requireExact(
          receiptWork["quickEntryIssueCodesCompared"],
          Array.isArray(snapshot["issueCodes"])
            ? snapshot["issueCodes"].length
            : -1,
          "EDIT_PLAN_RECEIPT_RECOVERED_ISSUE_WORK",
          `${path}.editPlanReceipt.work.quickEntryIssueCodesCompared`,
          "Recovery must compare the exact Quick Entry issue-code sequence.",
          findings,
        );
        requireExact(
          receiptWork["warningAcknowledgementsCompared"],
          0,
          "EDIT_PLAN_RECEIPT_RECOVERED_WARNING_WORK",
          `${path}.editPlanReceipt.work.warningAcknowledgementsCompared`,
          "Recovered insertion has no success-warning acknowledgement work.",
          findings,
        );
        requireExact(
          receiptWork["insertableChordsExamined"],
          typeof insertSource["selectedGlobalOrdinal"] === "number"
            ? insertSource["selectedGlobalOrdinal"] + 1
            : -1,
          "EDIT_PLAN_RECEIPT_RECOVERED_SCAN_WORK",
          `${path}.editPlanReceipt.work.insertableChordsExamined`,
          "Recovered insertion scans exactly through the selected global ordinal.",
          findings,
        );
        requireExact(
          receiptWork["recoveryFieldsCompared"],
          A0_U1_ATOMIC_EDIT_LIMITS.recoveryFieldsCompared,
          "EDIT_PLAN_RECEIPT_RECOVERED_FIELD_WORK",
          `${path}.editPlanReceipt.work.recoveryFieldsCompared`,
          "Committed recovery compares every closed recovery field.",
          findings,
        );
      }
    }
    return;
  }

  if (result["ok"] !== false) return;
  checkExactKeys(
    result,
    appliesEditPlan
      ? EXPECTED_FAILURE_RESULT_KEYS
      : ["ok", "state", "refusal", "notice", "effects", "counters"],
    "EDIT_PLAN_FAILURE_RESULT_KEYS",
    path,
    findings,
  );
  if (!appliesEditPlan) return;
  const outerRefusal = isObject(result["refusal"]) ? result["refusal"] : {};
  const nested = result["editPlanRefusal"];
  const prePlanCodes = new Set<string>(
    A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES,
  );
  if (prePlanCodes.has(String(outerRefusal["code"]))) {
    requireExact(
      nested,
      null,
      "EDIT_PLAN_PREPLAN_REFUSAL_DETAIL",
      `${path}.editPlanRefusal`,
      "A0 envelope refusal occurs before nested edit-plan work.",
      findings,
    );
  } else if (!isObject(nested)) {
    addFinding(
      findings,
      "EDIT_PLAN_NESTED_REFUSAL_MISSING",
      `${path}.editPlanRefusal`,
      "Post-envelope edit-plan refusal requires complete nested detail.",
    );
  } else {
    checkExactKeys(
      nested,
      ["code", "outerCode", "path", "diagnostics", "work"],
      "EDIT_PLAN_NESTED_REFUSAL_KEYS",
      `${path}.editPlanRefusal`,
      findings,
    );
    const diagnostics = recordsAt(nested["diagnostics"]);
    if (
      !Array.isArray(nested["diagnostics"]) ||
      diagnostics.length > A0_U1_ATOMIC_EDIT_LIMITS.retainedDiagnostics
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_NESTED_DIAGNOSTIC_LIMIT",
        `${path}.editPlanRefusal.diagnostics`,
        "Nested refusal diagnostics must be a bounded literal array.",
      );
    }
    for (const [index, diagnostic] of diagnostics.entries()) {
      checkExactKeys(
        diagnostic,
        [
          "code",
          "owner",
          "path",
          "sourceRange",
          "syntaxCode",
          "observed",
          "maximum",
        ],
        "EDIT_PLAN_NESTED_DIAGNOSTIC_KEYS",
        `${path}.editPlanRefusal.diagnostics[${String(index)}]`,
        findings,
      );
      if (
        !A0_U1_ATOMIC_EDIT_REFUSAL_CODES.includes(diagnostic["code"] as never)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_NESTED_DIAGNOSTIC_CODE",
          `${path}.editPlanRefusal.diagnostics[${String(index)}].code`,
          "Diagnostic code must use the exact nested refusal vocabulary.",
        );
      }
    }
    requireExact(
      nested["outerCode"],
      outerRefusal["code"],
      "EDIT_PLAN_NESTED_OUTER_CODE",
      `${path}.editPlanRefusal.outerCode`,
      "Nested outerCode must equal the actual A0 refusal code.",
      findings,
    );
    const nestedCode = String(nested["code"]);
    const allowedOuterCodes = expectedAllowedOuterCodesForRefusal(nestedCode);
    if (!allowedOuterCodes.includes(String(outerRefusal["code"]))) {
      addFinding(
        findings,
        "EDIT_PLAN_NESTED_OUTER_FAMILY",
        `${path}.editPlanRefusal.outerCode`,
        "Nested refusal code is paired with an outer code outside its normative family.",
      );
    }
    requireExact(
      nested["path"],
      outerRefusal["path"],
      "EDIT_PLAN_NESTED_OUTER_PATH",
      `${path}.editPlanRefusal.path`,
      "Nested and outer refusal paths must match exactly.",
      findings,
    );
    requireExact(
      nested["work"],
      isObject(expected["counters"])
        ? expected["counters"]["editPlan"]
        : undefined,
      "EDIT_PLAN_NESTED_REFUSAL_WORK",
      `${path}.editPlanRefusal.work`,
      "Nested refusal work must equal independently declared counters.",
      findings,
    );
    if (!A0_U1_ATOMIC_EDIT_REFUSAL_CODES.includes(nested["code"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_NESTED_REFUSAL_CODE",
        `${path}.editPlanRefusal.code`,
        "Nested refusal code is outside the exact precedence vocabulary.",
      );
    }
  }
}

function documentTotalDuration(document: unknown): ExactRational | null {
  let total: ExactRational = Object.freeze({ numerator: 0n, denominator: 1n });
  for (const section of documentSections(document)) {
    for (const measure of sectionMeasures(section)) {
      for (const event of measureEvents(measure)) {
        const duration = durationRational(event["duration"]);
        if (duration === null) return null;
        total = addRationals(total, duration);
      }
    }
  }
  return total;
}

function validateTransitionMusicalEvidence(
  before: JsonObject,
  after: JsonObject,
  expected: JsonObject,
  operation: unknown,
  result: JsonObject | null,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const beforeDocument = before["document"];
  const afterDocument = after["document"];
  const sections = documentSections(afterDocument);
  const measures = sections.flatMap(sectionMeasures);
  const events = measures.flatMap(measureEvents);
  const allIds = [
    isObject(afterDocument) ? afterDocument["id"] : undefined,
    ...sections.map((section) => section["id"]),
    ...measures.map((measure) => measure["id"]),
    ...events.map((event) => event["id"]),
  ];
  if (
    allIds.some((id) => typeof id !== "string") ||
    new Set(allIds).size !== allIds.length
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_GLOBAL_ID_NAMESPACE",
      `${path}.afterState.document`,
      "Every after-document must have one global duplicate-free stable-ID namespace.",
    );
  }
  if (
    sections.length > A0_U1_ATOMIC_EDIT_LIMITS.fragmentSections ||
    sections.some(
      (section) =>
        sectionMeasures(section).length >
        A0_U1_ATOMIC_EDIT_LIMITS.fragmentMeasuresPerSection,
    ) ||
    events.length > A0_U1_ATOMIC_EDIT_LIMITS.fragmentEvents
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_FINAL_COLLECTION_LIMIT",
      `${path}.afterState.document`,
      "After-document collections exceed an exact domain maximum.",
    );
  }
  requireExact(
    expected["eventOrder"],
    documentEventOrder(afterDocument),
    "EDIT_PLAN_EVENT_ORDER_LITERAL",
    `${path}.eventOrder`,
    "Expected event order must equal the independently flattened after-document order.",
    findings,
  );
  const time = expected["exactTimeEvidence"];
  checkExactKeys(
    time,
    [
      "beforeTotal",
      "afterTotal",
      "difference",
      "insertedDuration",
      "floatingPointUsed",
    ],
    "EDIT_PLAN_EXACT_TIME_KEYS",
    `${path}.exactTimeEvidence`,
    findings,
  );
  if (!isObject(time)) return;
  const beforeTotal = documentTotalDuration(beforeDocument);
  const afterTotal = documentTotalDuration(afterDocument);
  if (beforeTotal === null || afterTotal === null) {
    addFinding(
      findings,
      "EDIT_PLAN_EXACT_TIME_DOCUMENT",
      `${path}.exactTimeEvidence`,
      "Before and after documents must contain independently summable exact durations.",
    );
    return;
  }
  const difference = subtractRationals(afterTotal, beforeTotal);
  if (
    afterTotal.numerator >
    BigInt(A0_U1_ATOMIC_EDIT_LIMITS.finalTimelineQuarterNoteBeats) *
      afterTotal.denominator
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_FINAL_TIMELINE_LIMIT",
      `${path}.afterState.document`,
      "After-document exact duration exceeds the domain timeline maximum.",
    );
  }
  requireExact(
    time["beforeTotal"],
    rationalText(beforeTotal),
    "EDIT_PLAN_BEFORE_TOTAL",
    `${path}.exactTimeEvidence.beforeTotal`,
    "Before total does not match the literal document.",
    findings,
  );
  requireExact(
    time["afterTotal"],
    rationalText(afterTotal),
    "EDIT_PLAN_AFTER_TOTAL",
    `${path}.exactTimeEvidence.afterTotal`,
    "After total does not match the literal document.",
    findings,
  );
  requireExact(
    time["difference"],
    rationalText(difference),
    "EDIT_PLAN_TIME_DIFFERENCE",
    `${path}.exactTimeEvidence.difference`,
    "Exact time difference must be independently recomputed.",
    findings,
  );
  const committedInsertion =
    operation === "insert-fragment" &&
    result?.["ok"] === true &&
    result["outcome"] === "committed" &&
    difference.numerator > 0n;
  requireExact(
    time["insertedDuration"],
    committedInsertion ? rationalText(difference) : null,
    "EDIT_PLAN_INSERTED_DURATION",
    `${path}.exactTimeEvidence.insertedDuration`,
    "Only a committed insertion may declare the independently computed positive inserted duration.",
    findings,
  );
  if (time["floatingPointUsed"] !== false) {
    addFinding(
      findings,
      "EDIT_PLAN_FLOATING_TIME",
      `${path}.exactTimeEvidence.floatingPointUsed`,
      "Exact musical time evidence may never use floating point.",
    );
  }
  if (
    result?.["ok"] === true &&
    operation !== "insert-fragment" &&
    difference.numerator !== 0n
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_TIMELINE_NOT_PRESERVED",
      `${path}.exactTimeEvidence.difference`,
      "Split/join event and section operations must preserve exact total duration.",
    );
  }
}

function validateNonnegativeIntegerRecord(
  value: unknown,
  exactKeys: readonly string[],
  code: string,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(value, exactKeys, code, path, findings);
  if (!isObject(value)) return;
  for (const key of exactKeys) {
    const observed = value[key];
    if (
      typeof observed !== "number" ||
      !Number.isSafeInteger(observed) ||
      observed < 0
    ) {
      addFinding(
        findings,
        code,
        `${path}.${key}`,
        "Every deterministic work counter must be a nonnegative safe integer.",
      );
    }
  }
}

function validateTransitionWorkCounters(
  value: unknown,
  phase: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    value,
    ["outer", "editPlan"],
    "EDIT_PLAN_COUNTER_ENVELOPE",
    path,
    findings,
  );
  if (!isObject(value)) return;
  validateNonnegativeIntegerRecord(
    value["outer"],
    APPLICATION_WORK_COUNTER_NAMES,
    "EDIT_PLAN_OUTER_COUNTERS",
    `${path}.outer`,
    findings,
  );
  const editPlan = value["editPlan"];
  if (phase === "undo" || phase === "redo") {
    if (editPlan !== null) {
      addFinding(
        findings,
        "EDIT_PLAN_HISTORY_COUNTER_SCOPE",
        `${path}.editPlan`,
        "Undo and redo do not rerun an edit plan and therefore require a null nested counter record.",
      );
    }
    return;
  }
  if (editPlan === null) {
    if (phase === "apply") {
      addFinding(
        findings,
        "EDIT_PLAN_COMMIT_COUNTER_SCOPE",
        `${path}.editPlan`,
        "Committed edit plans require complete nested work evidence.",
      );
    }
    return;
  }
  if (!isObject(editPlan)) {
    addFinding(
      findings,
      "EDIT_PLAN_NESTED_COUNTERS",
      `${path}.editPlan`,
      "Command/refusal transitions require a complete nested edit-plan work record.",
    );
    return;
  }
  const { termination, ...numericCounters } = editPlan;
  validateNonnegativeIntegerRecord(
    numericCounters,
    A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
    "EDIT_PLAN_NESTED_COUNTERS",
    `${path}.editPlan`,
    findings,
  );
  if (
    ![
      "complete",
      "input-refusal",
      "allocation-refusal",
      "publication-refusal",
      "history-refusal",
    ].includes(String(termination))
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_TERMINATION",
      `${path}.editPlan.termination`,
      "Nested work evidence must end in one closed deterministic termination.",
    );
  }
  const counterMaxima: Readonly<Record<string, number>> = {
    planNodesVisited: A0_U1_ATOMIC_EDIT_LIMITS.planNodeRecords + 1,
    sourceCodePointsObserved:
      A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceCodePoints + 1,
    sourceUtf8BytesObserved:
      A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceUtf8Bytes + 1,
    quickEntrySnapshotFieldsCompared:
      A0_U1_ATOMIC_EDIT_LIMITS.quickEntrySnapshotFieldsCompared,
    quickEntryIssueCodesCompared:
      A0_U1_ATOMIC_EDIT_LIMITS.quickEntryIssueCodes + 1,
    syntaxParseCalls: 1,
    warningAcknowledgementsCompared:
      A0_U1_ATOMIC_EDIT_LIMITS.retainedWarningAcknowledgements + 1,
    insertableChordsExamined:
      A0_U1_ATOMIC_EDIT_LIMITS.insertableChordsExamined + 1,
    recoveryFieldsCompared: A0_U1_ATOMIC_EDIT_LIMITS.recoveryFieldsCompared,
    draftSectionsVisited: A0_U1_ATOMIC_EDIT_LIMITS.fragmentSections + 1,
    draftMeasuresVisited: A0_U1_ATOMIC_EDIT_LIMITS.fragmentMeasures + 1,
    draftEventsVisited: A0_U1_ATOMIC_EDIT_LIMITS.fragmentEvents + 1,
    completionDeclarationsVisited:
      A0_U1_ATOMIC_EDIT_LIMITS.completionDeclarations + 1,
    metadataFieldsCompared: A0_U1_ATOMIC_EDIT_LIMITS.metadataFieldsCompared + 1,
    exactBeatAdditions: A0_U1_ATOMIC_EDIT_LIMITS.exactBeatAdditions + 1,
    exactBeatComparisons: A0_U1_ATOMIC_EDIT_LIMITS.exactBeatComparisons + 1,
    idAllocationAttempts: A0_U1_ATOMIC_EDIT_LIMITS.idAllocationAttempts,
    idCollisionChecks: A0_U1_ATOMIC_EDIT_LIMITS.idAllocationAttempts,
    bookmarkRecordsExamined:
      A0_U1_ATOMIC_EDIT_LIMITS.bookmarkRecordsExamined + 1,
    bookmarkRecordsRewritten: A0_U1_ATOMIC_EDIT_LIMITS.bookmarkRecordsExamined,
    peakPlanNodeRecords: A0_U1_ATOMIC_EDIT_LIMITS.planNodeRecords,
    peakAllocatedIdRecords: A0_U1_ATOMIC_EDIT_LIMITS.idAllocationAttempts,
    peakDiagnosticRecords: A0_U1_ATOMIC_EDIT_LIMITS.retainedDiagnostics,
  };
  for (const [counterName, maximum] of Object.entries(counterMaxima)) {
    const observed = numericCounters[counterName];
    if (typeof observed === "number" && observed > maximum) {
      addFinding(
        findings,
        "EDIT_PLAN_COUNTER_BOUND",
        `${path}.editPlan.${counterName}`,
        `Counter exceeds its deterministic maximum or maximum-plus-one witness ${String(maximum)}.`,
      );
    }
  }
}

function reciprocalIncludes(
  record: JsonObject,
  field: string,
  id: string,
): boolean {
  return stringsAt(record[field]).includes(id);
}

function operationAllowed(value: unknown): boolean {
  return (
    value === "pipeline" ||
    A0_U1_ATOMIC_EDIT_PLAN_KINDS.includes(
      value as (typeof A0_U1_ATOMIC_EDIT_PLAN_KINDS)[number],
    )
  );
}

function validateBeatDurationShape(
  value: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    value,
    ["numerator", "denominator"],
    "EDIT_PLAN_DURATION_KEYS",
    path,
    findings,
  );
  if (!isObject(value)) return;
  const numerator = value["numerator"];
  const denominator = value["denominator"];
  if (
    typeof numerator !== "number" ||
    !Number.isSafeInteger(numerator) ||
    numerator <= 0 ||
    typeof denominator !== "number" ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0 ||
    960 % denominator !== 0
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_DURATION_VALUE",
      path,
      "Command durations must be positive safe-integer canonical PPQ divisors.",
    );
  }
}

function validateBoundaryShape(
  value: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!isObject(value)) {
    addFinding(
      findings,
      "EDIT_PLAN_BOUNDARY_SHAPE",
      path,
      "Boundary must be an object.",
    );
    return;
  }
  const kind = value["kind"];
  const keys =
    kind === "document-start" || kind === "document-end"
      ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.documentBoundary
      : [
            "before-section",
            "after-section",
            "section-start",
            "section-end",
          ].includes(String(kind))
        ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionBoundary
        : [
              "before-measure",
              "after-measure",
              "measure-start",
              "measure-end",
            ].includes(String(kind))
          ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.measureBoundary
          : kind === "before-event" || kind === "after-event"
            ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.eventBoundary
            : null;
  if (keys === null) {
    addFinding(
      findings,
      "EDIT_PLAN_BOUNDARY_KIND",
      `${path}.kind`,
      "Quick Entry target is outside the stable boundary vocabulary.",
    );
    return;
  }
  checkExactKeys(value, keys, "EDIT_PLAN_BOUNDARY_KEYS", path, findings);
}

function validateCompletionDeclarations(
  value: unknown,
  expectedLength: number,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    addFinding(
      findings,
      "EDIT_PLAN_COMPLETION_COUNT",
      path,
      `Expected exactly ${String(expectedLength)} completion declarations.`,
    );
    return;
  }
  for (const [index, declaration] of value.entries()) {
    checkExactKeys(
      declaration,
      A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completionDeclaration,
      "EDIT_PLAN_COMPLETION_KEYS",
      `${path}[${String(index)}]`,
      findings,
    );
  }
}

function validateSectionMetadata(
  value: unknown,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    value,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionMetadata,
    "EDIT_PLAN_SECTION_METADATA_KEYS",
    path,
    findings,
  );
}

function canonicalTargetForPlacement(placement: JsonObject): unknown {
  if (placement["kind"] === "into-measure") {
    return placement["beforeEventId"] === null
      ? { kind: "measure-end", measureId: placement["measureId"] }
      : { kind: "before-event", eventId: placement["beforeEventId"] };
  }
  if (placement["kind"] === "into-section") {
    return placement["beforeMeasureId"] === null
      ? { kind: "section-end", sectionId: placement["sectionId"] }
      : { kind: "before-measure", measureId: placement["beforeMeasureId"] };
  }
  if (placement["kind"] === "into-document") {
    return placement["beforeSectionId"] === null
      ? { kind: "document-end" }
      : { kind: "before-section", sectionId: placement["beforeSectionId"] };
  }
  return undefined;
}

function validateInsertFragmentPlan(
  plan: JsonObject,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  const source = isObject(plan["source"]) ? plan["source"] : {};
  const placement = isObject(plan["placement"]) ? plan["placement"] : {};
  const sourceKind = source["kind"];
  const complete = sourceKind === "complete-draft";
  const recovered = sourceKind === "recovered-chord";
  checkExactKeys(
    plan,
    complete
      ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completeDraftPlan
      : A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.recoveredChordPlan,
    "EDIT_PLAN_INSERT_KEYS",
    path,
    findings,
  );
  if (!complete && !recovered) {
    addFinding(
      findings,
      "EDIT_PLAN_INSERT_LANE",
      `${path}.source.kind`,
      "Insert source must select exactly complete-draft or recovered-chord.",
    );
    return;
  }
  checkExactKeys(
    source,
    complete
      ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completeDraftSource
      : A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.recoveredChordSource,
    "EDIT_PLAN_INSERT_SOURCE_KEYS",
    `${path}.source`,
    findings,
  );
  const snapshot = isObject(source["quickEntrySnapshot"])
    ? source["quickEntrySnapshot"]
    : {};
  checkExactKeys(
    snapshot,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.quickEntrySnapshot,
    "EDIT_PLAN_QUICK_ENTRY_KEYS",
    `${path}.source.quickEntrySnapshot`,
    findings,
  );
  const sourceText = snapshot["sourceText"];
  const sourceCodePoints =
    typeof sourceText === "string"
      ? [...sourceText].length
      : Number.POSITIVE_INFINITY;
  const sourceBytes =
    typeof sourceText === "string"
      ? new TextEncoder().encode(sourceText).length
      : Number.POSITIVE_INFINITY;
  if (
    sourceCodePoints > A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceCodePoints ||
    sourceBytes > A0_U1_ATOMIC_EDIT_LIMITS.fragmentSourceUtf8Bytes
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SOURCE_LIMIT",
      `${path}.source.quickEntrySnapshot.sourceText`,
      "Quick Entry source exceeds the exact code-point or UTF-8 byte bound.",
    );
  }
  requireExact(
    snapshot["expectedStatus"],
    complete ? "ready" : "invalid",
    "EDIT_PLAN_QUICK_ENTRY_STATUS",
    `${path}.source.quickEntrySnapshot.expectedStatus`,
    "Quick Entry status must be correlated with the selected source lane.",
    findings,
  );
  requireExact(
    snapshot["expectedLane"],
    sourceKind,
    "EDIT_PLAN_QUICK_ENTRY_LANE",
    `${path}.source.quickEntrySnapshot.expectedLane`,
    "The snapshot's expected lane must equal the source discriminant.",
    findings,
  );
  if (
    !Array.isArray(snapshot["issueCodes"]) ||
    !snapshot["issueCodes"].every((code) => typeof code === "string") ||
    snapshot["issueCodes"].length >
      A0_U1_ATOMIC_EDIT_LIMITS.quickEntryIssueCodes
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_QUICK_ENTRY_ISSUES",
      `${path}.source.quickEntrySnapshot.issueCodes`,
      "Issue codes must be a bounded exact string array.",
    );
  }
  validateBoundaryShape(
    snapshot["target"],
    `${path}.source.quickEntrySnapshot.target`,
    findings,
  );
  requireExact(
    snapshot["target"],
    canonicalTargetForPlacement(placement),
    "EDIT_PLAN_QUICK_ENTRY_TARGET",
    `${path}.source.quickEntrySnapshot.target`,
    "The captured stable target must equal the placement's canonical target.",
    findings,
  );
  requireExact(
    plan["voicingPolicy"],
    A0_U1_NEW_EVENT_POLICY_ID,
    "EDIT_PLAN_VOICING_POLICY",
    `${path}.voicingPolicy`,
    "Every new event must use the single reviewed Auto-voicing policy ID.",
    findings,
  );

  if (complete) {
    const acknowledgements = source["warningAcknowledgements"];
    if (!Array.isArray(acknowledgements)) {
      addFinding(
        findings,
        "EDIT_PLAN_WARNING_ACKNOWLEDGEMENTS",
        `${path}.source.warningAcknowledgements`,
        "Warning acknowledgements must be an exact array.",
      );
    } else {
      for (const [index, acknowledgement] of acknowledgements.entries()) {
        checkExactKeys(
          acknowledgement,
          A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.warningAcknowledgement,
          "EDIT_PLAN_WARNING_KEYS",
          `${path}.source.warningAcknowledgements[${String(index)}]`,
          findings,
        );
        const range = isObject(acknowledgement)
          ? acknowledgement["range"]
          : undefined;
        checkExactKeys(
          range,
          A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sourceRange,
          "EDIT_PLAN_SOURCE_RANGE_KEYS",
          `${path}.source.warningAcknowledgements[${String(index)}].range`,
          findings,
        );
      }
    }
  } else {
    if (
      typeof source["selectedGlobalOrdinal"] !== "number" ||
      !Number.isSafeInteger(source["selectedGlobalOrdinal"]) ||
      (source["selectedGlobalOrdinal"] as number) < 0
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_RECOVERY_ORDINAL",
        `${path}.source.selectedGlobalOrdinal`,
        "Recovered-chord selection must use one nonnegative global ordinal.",
      );
    }
    requireExact(
      source["layoutLossAcknowledgement"],
      A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
      "EDIT_PLAN_RECOVERY_LAYOUT_ACK",
      `${path}.source.layoutLossAcknowledgement`,
      "Recovered insertion requires the exact reviewed layout-loss acknowledgement.",
      findings,
    );
    if (source["callerDuration"] !== null) {
      validateBeatDurationShape(
        source["callerDuration"],
        `${path}.source.callerDuration`,
        findings,
      );
    }
  }

  if (placement["kind"] === "into-measure") {
    const expectedKeys = recovered
      ? A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.recoveredChordIntoMeasurePlacement
      : A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.completeDraftIntoMeasurePlacement;
    checkExactKeys(
      placement,
      expectedKeys,
      "EDIT_PLAN_PLACEMENT_KEYS",
      `${path}.placement`,
      findings,
    );
    requireExact(
      placement["layoutDisposition"],
      recovered ? "insert-one-recovered-chord" : "flatten-one-implicit-measure",
      "EDIT_PLAN_PLACEMENT_LAYOUT",
      `${path}.placement.layoutDisposition`,
      "Into-measure layout disposition must match the exact source lane.",
      findings,
    );
    validateCompletionDeclarations(
      placement["completionDeclarations"],
      1,
      `${path}.placement.completionDeclarations`,
      findings,
    );
  } else if (complete && placement["kind"] === "into-section") {
    checkExactKeys(
      placement,
      A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.intoSectionPlacement,
      "EDIT_PLAN_PLACEMENT_KEYS",
      `${path}.placement`,
      findings,
    );
    requireExact(
      placement["layoutDisposition"],
      "preserve-implicit-measures",
      "EDIT_PLAN_PLACEMENT_LAYOUT",
      `${path}.placement.layoutDisposition`,
      "Into-section insertion must preserve implicit measure layout.",
      findings,
    );
    validateCompletionDeclarations(
      placement["completionDeclarations"],
      0,
      `${path}.placement.completionDeclarations`,
      findings,
    );
  } else if (complete && placement["kind"] === "into-document") {
    checkExactKeys(
      placement,
      A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.intoDocumentPlacement,
      "EDIT_PLAN_PLACEMENT_KEYS",
      `${path}.placement`,
      findings,
    );
    requireExact(
      placement["layoutDisposition"],
      "preserve-named-sections",
      "EDIT_PLAN_PLACEMENT_LAYOUT",
      `${path}.placement.layoutDisposition`,
      "Into-document insertion must preserve named-section layout.",
      findings,
    );
    const declarations = placement["sectionDeclarations"];
    if (!Array.isArray(declarations) || declarations.length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_SECTION_DECLARATIONS",
        `${path}.placement.sectionDeclarations`,
        "Named-section insertion requires one explicit declaration per source section.",
      );
    } else {
      for (const [index, declaration] of declarations.entries()) {
        checkExactKeys(
          declaration,
          A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.sectionDeclaration,
          "EDIT_PLAN_SECTION_DECLARATION_KEYS",
          `${path}.placement.sectionDeclarations[${String(index)}]`,
          findings,
        );
      }
    }
    validateCompletionDeclarations(
      placement["completionDeclarations"],
      0,
      `${path}.placement.completionDeclarations`,
      findings,
    );
  } else {
    addFinding(
      findings,
      "EDIT_PLAN_PLACEMENT_LANE",
      `${path}.placement`,
      "Placement kind is not permitted for the selected insert source lane.",
    );
  }
}

function quickEntrySnapshotMatchesState(
  command: JsonObject,
  state: JsonObject,
): boolean | null {
  const plan = isObject(command["plan"]) ? command["plan"] : null;
  if (plan?.["kind"] !== "insert-fragment") return null;
  const source = isObject(plan["source"]) ? plan["source"] : null;
  const snapshot = isObject(source?.["quickEntrySnapshot"])
    ? source?.["quickEntrySnapshot"]
    : null;
  const quickEntry = isObject(state["quickEntry"]) ? state["quickEntry"] : null;
  if (snapshot === null || quickEntry === null) return false;
  return (
    snapshot["sourceText"] === quickEntry["text"] &&
    snapshot["baseRevision"] === quickEntry["baseRevision"] &&
    jsonDeepEqual(snapshot["target"], quickEntry["target"]) &&
    jsonDeepEqual(snapshot["issueCodes"], quickEntry["issueCodes"]) &&
    snapshot["expectedStatus"] === quickEntry["status"] &&
    snapshot["expectedLane"] === source?.["kind"]
  );
}

function validateApplyEditPlanShape(
  command: JsonObject,
  path: string,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    command,
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.envelope,
    "EDIT_PLAN_ENVELOPE_KEYS",
    path,
    findings,
  );
  if (command["coalescing"] !== null) {
    addFinding(
      findings,
      "EDIT_PLAN_COALESCING",
      `${path}.coalescing`,
      "Every atomic edit plan is noncoalescing.",
    );
  }
  const plan = isObject(command["plan"]) ? command["plan"] : {};
  const planPath = `${path}.plan`;
  switch (plan["kind"]) {
    case "insert-fragment":
      validateInsertFragmentPlan(plan, planPath, findings);
      break;
    case "split-event-duration":
      checkExactKeys(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.splitEventDurationPlan,
        "EDIT_PLAN_SPLIT_EVENT_KEYS",
        planPath,
        findings,
      );
      validateBeatDurationShape(
        plan["firstDuration"],
        `${planPath}.firstDuration`,
        findings,
      );
      validateBeatDurationShape(
        plan["secondDuration"],
        `${planPath}.secondDuration`,
        findings,
      );
      validateCompletionDeclarations(
        plan["completionDeclarations"],
        1,
        `${planPath}.completionDeclarations`,
        findings,
      );
      requireExact(
        plan["identityPolicy"],
        "retain-source-first-allocate-second",
        "EDIT_PLAN_POLICY",
        `${planPath}.identityPolicy`,
        "Split-event survivor policy changed.",
        findings,
      );
      requireExact(
        plan["contentPolicy"],
        "copy-exact-chord-and-voicing",
        "EDIT_PLAN_POLICY",
        `${planPath}.contentPolicy`,
        "Split-event content policy changed.",
        findings,
      );
      requireExact(
        plan["annotationPolicy"],
        "retain-source-first-clear-second",
        "EDIT_PLAN_POLICY",
        `${planPath}.annotationPolicy`,
        "Split-event annotation policy changed.",
        findings,
      );
      break;
    case "join-event-durations":
      checkExactKeys(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.joinEventDurationsPlan,
        "EDIT_PLAN_JOIN_EVENT_KEYS",
        planPath,
        findings,
      );
      validateBeatDurationShape(
        plan["joinedDuration"],
        `${planPath}.joinedDuration`,
        findings,
      );
      validateCompletionDeclarations(
        plan["completionDeclarations"],
        1,
        `${planPath}.completionDeclarations`,
        findings,
      );
      requireExact(
        plan["identityPolicy"],
        "retain-left-remove-right",
        "EDIT_PLAN_POLICY",
        `${planPath}.identityPolicy`,
        "Join-event survivor policy changed.",
        findings,
      );
      requireExact(
        plan["contentPolicy"],
        "require-exact-chord-and-voicing",
        "EDIT_PLAN_POLICY",
        `${planPath}.contentPolicy`,
        "Join-event equality policy changed.",
        findings,
      );
      requireExact(
        plan["annotationPolicy"],
        "require-right-empty-retain-left",
        "EDIT_PLAN_POLICY",
        `${planPath}.annotationPolicy`,
        "Join-event annotation policy changed.",
        findings,
      );
      break;
    case "split-section":
      checkExactKeys(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.splitSectionPlan,
        "EDIT_PLAN_SPLIT_SECTION_KEYS",
        planPath,
        findings,
      );
      validateSectionMetadata(
        plan["newSectionMetadata"],
        `${planPath}.newSectionMetadata`,
        findings,
      );
      validateCompletionDeclarations(
        plan["completionDeclarations"],
        0,
        `${planPath}.completionDeclarations`,
        findings,
      );
      requireExact(
        plan["identityPolicy"],
        "retain-source-prefix-allocate-suffix",
        "EDIT_PLAN_POLICY",
        `${planPath}.identityPolicy`,
        "Split-section survivor policy changed.",
        findings,
      );
      requireExact(
        plan["measurePolicy"],
        "move-suffix-preserve-identities",
        "EDIT_PLAN_POLICY",
        `${planPath}.measurePolicy`,
        "Split-section measure policy changed.",
        findings,
      );
      break;
    case "join-sections":
      checkExactKeys(
        plan,
        A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.joinSectionsPlan,
        "EDIT_PLAN_JOIN_SECTION_KEYS",
        planPath,
        findings,
      );
      validateSectionMetadata(
        plan["expectedLeftMetadata"],
        `${planPath}.expectedLeftMetadata`,
        findings,
      );
      validateSectionMetadata(
        plan["expectedRightMetadata"],
        `${planPath}.expectedRightMetadata`,
        findings,
      );
      validateSectionMetadata(
        plan["resultMetadata"],
        `${planPath}.resultMetadata`,
        findings,
      );
      validateCompletionDeclarations(
        plan["completionDeclarations"],
        0,
        `${planPath}.completionDeclarations`,
        findings,
      );
      requireExact(
        plan["identityPolicy"],
        "retain-left-remove-right",
        "EDIT_PLAN_POLICY",
        `${planPath}.identityPolicy`,
        "Join-section survivor policy changed.",
        findings,
      );
      requireExact(
        plan["measurePolicy"],
        "left-then-right-preserve-identities",
        "EDIT_PLAN_POLICY",
        `${planPath}.measurePolicy`,
        "Join-section measure policy changed.",
        findings,
      );
      requireExact(
        plan["metadataPolicy"],
        "compare-both-then-apply-explicit-result",
        "EDIT_PLAN_POLICY",
        `${planPath}.metadataPolicy`,
        "Join-section metadata policy changed.",
        findings,
      );
      requireExact(
        plan["internalBoundaryPolicy"],
        "remove-right-entry-boundary-confirmed",
        "EDIT_PLAN_POLICY",
        `${planPath}.internalBoundaryPolicy`,
        "Join-section boundary policy changed.",
        findings,
      );
      break;
    default:
      addFinding(
        findings,
        "EDIT_PLAN_KIND",
        `${planPath}.kind`,
        "Plan discriminant must be one of the five closed variants.",
      );
  }
}

function validateRootContract(
  contract: JsonObject,
  findings: A0U1EditPlanContractFinding[],
): void {
  checkExactKeys(
    contract,
    EXPECTED_ROOT_KEYS,
    "EDIT_PLAN_ROOT_KEYS",
    "a0-u1-edit-plan-contract.json",
    findings,
  );
  requireExact(
    contract["commandKinds"],
    ["apply-edit-plan"],
    "EDIT_PLAN_COMMAND_KINDS",
    "a0-u1-edit-plan-contract.json.commandKinds",
    "The addendum must name exactly one prospective command kind.",
    findings,
  );
  requireExact(
    contract["planKinds"],
    A0_U1_ATOMIC_EDIT_PLAN_KINDS,
    "EDIT_PLAN_PLAN_KINDS",
    "a0-u1-edit-plan-contract.json.planKinds",
    "The five closed plan variants and order must match the source contract.",
    findings,
  );
  requireExact(
    contract["refusalCodes"],
    A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
    "EDIT_PLAN_REFUSAL_CODES",
    "a0-u1-edit-plan-contract.json.refusalCodes",
    "Refusal vocabulary must match the source contract exactly.",
    findings,
  );
  requireExact(
    contract["applicationContractSchema"],
    A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA,
    "EDIT_PLAN_APPLICATION_CONTRACT_SCHEMA",
    "a0-u1-edit-plan-contract.json.applicationContractSchema",
    "The packet must identify the exact additive source-contract schema.",
    findings,
  );
  requireExact(
    contract["receiptSchema"],
    A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
    "EDIT_PLAN_RECEIPT_SCHEMA",
    "a0-u1-edit-plan-contract.json.receiptSchema",
    "The packet must freeze the exact additive success-receipt schema.",
    findings,
  );
  requireExact(
    contract["outerRefusalCodes"],
    A0_U1_ATOMIC_EDIT_OUTER_REFUSAL_CODES,
    "EDIT_PLAN_OUTER_REFUSAL_CODES",
    "a0-u1-edit-plan-contract.json.outerRefusalCodes",
    "Post-plan outer refusal codes must match the source contract exactly.",
    findings,
  );
  requireExact(
    contract["preplanOuterRefusalCodes"],
    A0_U1_ATOMIC_EDIT_PREPLAN_OUTER_REFUSAL_CODES,
    "EDIT_PLAN_PREPLAN_REFUSAL_CODES",
    "a0-u1-edit-plan-contract.json.preplanOuterRefusalCodes",
    "Envelope-only refusal codes must match the source contract exactly.",
    findings,
  );
  const expectedOuterCodeMapping = Object.fromEntries(
    A0_U1_ATOMIC_EDIT_REFUSAL_CODES.map((code) => [
      code,
      expectedAllowedOuterCodesForRefusal(code),
    ]),
  );
  requireExact(
    A0_U1_ATOMIC_EDIT_ALLOWED_OUTER_CODES_BY_REFUSAL_CODE,
    expectedOuterCodeMapping,
    "EDIT_PLAN_SOURCE_REFUSAL_OUTER_MAPPING",
    "src/application/application-edit-plan-contract.ts",
    "The source nested-to-outer refusal mapping must match the normative independent families.",
    findings,
  );
  requireExact(
    contract["allowedOuterCodesByRefusalCode"],
    expectedOuterCodeMapping,
    "EDIT_PLAN_PACKET_REFUSAL_OUTER_MAPPING",
    "a0-u1-edit-plan-contract.json.allowedOuterCodesByRefusalCode",
    "The packet must freeze every nested-to-outer refusal mapping.",
    findings,
  );
  requireExact(
    contract["outerWorkCounterNames"],
    APPLICATION_WORK_COUNTER_NAMES,
    "EDIT_PLAN_OUTER_WORK_COUNTERS",
    "a0-u1-edit-plan-contract.json.outerWorkCounterNames",
    "Outer transition work evidence must retain the accepted A0 counter tuple.",
    findings,
  );
  requireExact(
    contract["workCounterNames"],
    A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES,
    "EDIT_PLAN_WORK_COUNTERS",
    "a0-u1-edit-plan-contract.json.workCounterNames",
    "Edit-plan work evidence must match the source contract exactly.",
    findings,
  );
  requireExact(
    contract["limits"],
    A0_U1_ATOMIC_EDIT_LIMITS,
    "EDIT_PLAN_LIMITS",
    "a0-u1-edit-plan-contract.json.limits",
    "All exact edit-plan limits must match the source contract.",
    findings,
  );
  requireExact(
    contract["lawIds"],
    A0_U1_ATOMIC_EDIT_LAW_IDS,
    "EDIT_PLAN_LAW_IDS",
    "a0-u1-edit-plan-contract.json.lawIds",
    "The exact 17-law inventory must match the declarative source.",
    findings,
  );
  requireExact(
    contract["coverageFamilies"],
    EXPECTED_COVERAGE_FAMILIES,
    "EDIT_PLAN_COVERAGE_FAMILIES",
    "a0-u1-edit-plan-contract.json.coverageFamilies",
    "All required evidence families must remain explicit and ordered.",
    findings,
  );
  requireExact(
    contract["counts"],
    EXPECTED_COUNTS,
    "EDIT_PLAN_DECLARED_COUNTS",
    "a0-u1-edit-plan-contract.json.counts",
    "Declared packet counts must match the independently reviewed inventory.",
    findings,
  );
  const expectedEnvelope = [
    "id",
    "label",
    "expectedDocumentId",
    "expectedRevision",
    "logicalTimeMs",
    "coalescing",
    "kind",
    "plan",
  ];
  const envelope = contract["commandEnvelope"];
  checkExactKeys(
    envelope,
    [
      "fieldsInOrder",
      "kind",
      "coalescing",
      "singleCommand",
      "nestedCommandsAllowed",
      "candidateDocumentAllowed",
    ],
    "EDIT_PLAN_COMMAND_ENVELOPE_KEYS",
    "a0-u1-edit-plan-contract.json.commandEnvelope",
    findings,
  );
  const envelopeFields = isObject(envelope) ? envelope["fieldsInOrder"] : null;
  requireExact(
    envelopeFields,
    expectedEnvelope,
    "EDIT_PLAN_COMMAND_ENVELOPE",
    "a0-u1-edit-plan-contract.json.commandEnvelope.fieldsInOrder",
    "The proposed command must reuse the exact A0 envelope and add only kind/plan.",
    findings,
  );
  if (
    !isObject(envelope) ||
    envelope["kind"] !== "apply-edit-plan" ||
    envelope["coalescing"] !== null ||
    envelope["singleCommand"] !== true ||
    envelope["nestedCommandsAllowed"] !== false ||
    envelope["candidateDocumentAllowed"] !== false
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_COMMAND_ENVELOPE_POLICY",
      "a0-u1-edit-plan-contract.json.commandEnvelope",
      "The envelope must be one noncoalescing apply-edit-plan with no nested command or candidate document.",
    );
  }
  requireExact(
    contract["refusalPrecedence"],
    A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
    "EDIT_PLAN_REFUSAL_PRECEDENCE",
    "a0-u1-edit-plan-contract.json.refusalPrecedence",
    "The nested refusal tuple is itself the exact precedence order.",
    findings,
  );
  if (
    contract["implementationStatus"] !==
      A0_U1_ATOMIC_EDIT_IMPLEMENTATION_STATUS ||
    contract["productionImplementationClaim"] !== false ||
    contract["u1UiCompletionClaim"] !== false ||
    contract["humanAcceptanceClaim"] !== false ||
    contract["expertReviewClaim"] !== false ||
    contract["productionOutputUsedAsOracle"] !== false ||
    contract["expectedValuesGenerated"] !== false
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SCOPE_CLAIM",
      "a0-u1-edit-plan-contract.json",
      "The packet must remain a proposed, independent, unimplemented A0 contract with no UI, human, expert, or production-oracle claim.",
    );
  }
  if (
    A0_U1_ATOMIC_EDIT_PLAN_CONTRACT_SCHEMA !==
    "changes.application.atomic-edit-plan-contract.v1"
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SOURCE_SCHEMA",
      "src/application/application-edit-plan-contract.ts",
      "The declarative source schema changed unexpectedly.",
    );
  }
  requireExact(
    A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
    [...APPLICATION_COMMAND_KINDS, "apply-edit-plan"],
    "EDIT_PLAN_ADDITIVE_COMMAND_ORDER",
    "src/application/application-edit-plan-contract.ts",
    "The proposed list must append one kind without reordering accepted A0 kinds.",
    findings,
  );
  requireExact(
    APPLICATION_COMMAND_KINDS,
    [
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
    ],
    "EDIT_PLAN_EXISTING_A0_DRIFT",
    "src/application/application-state-contract.ts.APPLICATION_COMMAND_KINDS",
    "This specification leaf must not mutate the accepted production command union.",
    findings,
  );
  const decisions = isObject(contract["decisions"])
    ? contract["decisions"]
    : {};
  checkExactKeys(
    decisions,
    EXPECTED_DECISION_KEYS,
    "EDIT_PLAN_DECISION_KEYS",
    "a0-u1-edit-plan-contract.json.decisions",
    findings,
  );
  const insertDecision = isObject(decisions["insertFragment"])
    ? decisions["insertFragment"]
    : {};
  if (
    !stableJson(insertDecision).includes("complete-draft") ||
    !stableJson(insertDecision).includes("recovered-chord") ||
    !stableJson(insertDecision).includes("layout") ||
    !stableJson(insertDecision).includes("warning")
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_INSERT_DECISION",
      "a0-u1-edit-plan-contract.json.decisions.insertFragment",
      "Insertion must freeze complete-draft and single recovered-chord lanes, explicit layout/warning acknowledgement, and the reviewed Auto voicing default.",
    );
  }
  requireExact(
    insertDecision["defaultVoicing"],
    A0_U1_NEW_EVENT_AUTO_VOICING,
    "EDIT_PLAN_INSERT_VOICING_DECISION",
    "a0-u1-edit-plan-contract.json.decisions.insertFragment.defaultVoicing",
    "The root decision must publish the exact reviewed new-event Auto voicing.",
    findings,
  );
  const snapshotDecision = isObject(insertDecision["liveQuickEntrySnapshot"])
    ? insertDecision["liveQuickEntrySnapshot"]
    : {};
  requireExact(
    snapshotDecision["exactKeysInOrder"],
    A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.quickEntrySnapshot,
    "EDIT_PLAN_QUICK_ENTRY_DECISION",
    "a0-u1-edit-plan-contract.json.decisions.insertFragment.liveQuickEntrySnapshot.exactKeysInOrder",
    "The root decision must freeze every public Quick Entry snapshot field.",
    findings,
  );
  const ordering = isObject(contract["ordering"]) ? contract["ordering"] : {};
  checkExactKeys(
    ordering,
    EXPECTED_ORDERING_KEYS,
    "EDIT_PLAN_ORDERING_KEYS",
    "a0-u1-edit-plan-contract.json.ordering",
    findings,
  );
  requireExact(
    ordering["runnerStages"],
    A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER,
    "EDIT_PLAN_RUNNER_ORDER",
    "a0-u1-edit-plan-contract.json.ordering.runnerStages",
    "Runner stages must match the source contract exactly.",
    findings,
  );
  requireExact(
    ordering["idAllocation"],
    A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER,
    "EDIT_PLAN_ID_ORDER",
    "a0-u1-edit-plan-contract.json.ordering.idAllocation",
    "ID allocation order must match the source contract exactly.",
    findings,
  );
  requireExact(
    ordering["diagnostics"],
    A0_U1_ATOMIC_EDIT_PLAN_DIAGNOSTIC_ORDER,
    "EDIT_PLAN_DIAGNOSTIC_ORDER",
    "a0-u1-edit-plan-contract.json.ordering.diagnostics",
    "Diagnostic ordering must match the source contract exactly.",
    findings,
  );
  requireExact(
    ordering["effects"],
    ["queue-recovery", "compile-playback-plan", "restore-focus", "announce"],
    "EDIT_PLAN_EFFECT_ORDER",
    "a0-u1-edit-plan-contract.json.ordering.effects",
    "Successful plans must publish the exact existing effect order.",
    findings,
  );
  requireExact(
    ordering["bookmarks"],
    A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES,
    "EDIT_PLAN_BOOKMARK_POLICIES",
    "a0-u1-edit-plan-contract.json.ordering.bookmarks",
    "Bookmark policies must remain operation-specific and exact.",
    findings,
  );
  requireExact(
    ordering["quickEntryTargetMatch"],
    A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY,
    "EDIT_PLAN_TARGET_MATCH_POLICIES",
    "a0-u1-edit-plan-contract.json.ordering.quickEntryTargetMatch",
    "Quick Entry target matching must remain exact for every placement.",
    findings,
  );
  const proofRequirements = isObject(contract["proofRequirements"])
    ? contract["proofRequirements"]
    : {};
  checkExactKeys(
    proofRequirements,
    EXPECTED_PROOF_REQUIREMENT_KEYS,
    "EDIT_PLAN_PROOF_REQUIREMENT_KEYS",
    "a0-u1-edit-plan-contract.json.proofRequirements",
    findings,
  );
  for (const forbiddenTrue of [
    "productionOutputMayAuthorExpectedValues",
    "wallTimeMayAffectOutcome",
  ]) {
    if (proofRequirements[forbiddenTrue] !== false) {
      addFinding(
        findings,
        "EDIT_PLAN_FORBIDDEN_PROOF",
        `a0-u1-edit-plan-contract.json.proofRequirements.${forbiddenTrue}`,
        "Production output and wall time may not author or select musical outcomes.",
      );
    }
  }
  for (const requiredTrue of Object.keys(proofRequirements).filter(
    (key) =>
      ![
        "productionOutputMayAuthorExpectedValues",
        "wallTimeMayAffectOutcome",
      ].includes(key),
  )) {
    if (proofRequirements[requiredTrue] !== true) {
      addFinding(
        findings,
        "EDIT_PLAN_REQUIRED_PROOF",
        `a0-u1-edit-plan-contract.json.proofRequirements.${requiredTrue}`,
        "Every declared positive proof obligation must remain true.",
      );
    }
  }
}

function validateCases(
  root: JsonObject,
  findings: A0U1EditPlanContractFinding[],
): Readonly<{
  catalog: JsonObject;
  cases: Map<string, JsonObject>;
  transitions: Map<string, JsonObject>;
  applicability: Map<string, JsonObject>;
  transposition: Map<string, JsonObject>;
}> {
  const catalog = isObject(root["literalCatalog"])
    ? root["literalCatalog"]
    : {};
  checkExactKeys(
    catalog,
    EXPECTED_LITERAL_CATALOG_KEYS,
    "EDIT_PLAN_LITERAL_CATALOG_KEYS",
    "edit-plan-cases.json.literalCatalog",
    findings,
  );
  const caseRows = recordsAt(root["caseGroups"]);
  const cases = indexById(
    caseRows,
    "edit-plan-cases.json.caseGroups",
    findings,
  );
  const transitionRecord = isObject(catalog["transitions"])
    ? catalog["transitions"]
    : {};
  const transitionRows = Object.entries(transitionRecord).map(
    ([key, value]) => {
      if (!isObject(value)) return { id: key, malformed: true };
      if (value["id"] !== key) {
        addFinding(
          findings,
          "EDIT_PLAN_TRANSITION_KEY",
          `edit-plan-cases.json.literalCatalog.transitions.${key}`,
          "Transition map key and embedded ID must match exactly.",
        );
      }
      return value;
    },
  );
  const transitions = indexById(
    transitionRows,
    "edit-plan-cases.json.literalCatalog.transitions",
    findings,
  );
  const applicabilityRows = recordsAt(root["applicabilityRows"]);
  const applicability = indexById(
    applicabilityRows,
    "edit-plan-cases.json.applicabilityRows",
    findings,
  );
  const transpositionRows = recordsAt(root["transpositionWitnesses"]);
  const transposition = indexById(
    transpositionRows,
    "edit-plan-cases.json.transpositionWitnesses",
    findings,
  );

  for (const [caseId, row] of cases) {
    checkExactKeys(
      row,
      EXPECTED_CASE_KEYS,
      "EDIT_PLAN_CASE_KEYS",
      `edit-plan-cases.json.caseGroups.${caseId}`,
      findings,
    );
    if (!operationAllowed(row["operation"])) {
      addFinding(
        findings,
        "EDIT_PLAN_CASE_OPERATION",
        `edit-plan-cases.json.caseGroups.${caseId}.operation`,
        "Case operation must be pipeline or one of the five plan variants.",
      );
    }
    if (!EXPECTED_COVERAGE_FAMILIES.includes(row["category"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_CASE_CATEGORY",
        `edit-plan-cases.json.caseGroups.${caseId}.category`,
        "Case category is outside the closed coverage vocabulary.",
      );
    }
    checkReferenceIds(
      row["transitionIds"],
      transitions,
      "EDIT_PLAN_CASE_TRANSITION_REF",
      `edit-plan-cases.json.caseGroups.${caseId}.transitionIds`,
      findings,
    );
    if (stringsAt(row["proofKinds"]).length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_CASE_PROOF_EMPTY",
        `edit-plan-cases.json.caseGroups.${caseId}.proofKinds`,
        "Every decision case needs at least one explicit proof kind.",
      );
    }
  }
  for (const [transitionId, row] of transitions) {
    checkExactKeys(
      row,
      EXPECTED_TRANSITION_KEYS,
      "EDIT_PLAN_TRANSITION_KEYS",
      `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
      findings,
    );
    if (!["apply", "undo", "redo"].includes(String(row["phase"]))) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_PHASE",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.phase`,
        "Transition phase must be apply, undo, or redo.",
      );
    }
    const caseId = row["caseId"];
    const parentCase =
      typeof caseId === "string" ? cases.get(caseId) : undefined;
    if (
      parentCase === undefined ||
      !stringsAt(parentCase["transitionIds"]).includes(transitionId)
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_CASE_RECIPROCAL",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.caseId`,
        "Every transition must link reciprocally to exactly one case group.",
      );
    }
    if (
      parentCase !== undefined &&
      parentCase["operation"] !== row["operation"]
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_CASE_OPERATION",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.operation`,
        "Transition operation must equal its parent case-group operation.",
      );
    }
    if (!operationAllowed(row["operation"])) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_OPERATION",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.operation`,
        "Transition operation is outside the closed operation vocabulary.",
      );
    }
    const lawIds = stringsAt(row["lawIds"]);
    if (
      lawIds.length === 0 ||
      lawIds.some(
        (lawId) => !A0_U1_ATOMIC_EDIT_LAW_IDS.includes(lawId as never),
      )
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSITION_LAWS",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.lawIds`,
        "Every transition must cite only declared laws and cite at least one.",
      );
    }
    checkExactKeys(
      row["expected"],
      EXPECTED_TRANSITION_RESULT_KEYS,
      "EDIT_PLAN_TRANSITION_EXPECTED_KEYS",
      `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected`,
      findings,
    );
    try {
      const before = materializeLiteral(row["beforeState"], catalog);
      const command = materializeLiteral(row["command"], catalog);
      const expected = materializeLiteral(row["expected"], catalog);
      if (
        before === undefined ||
        command === undefined ||
        expected === undefined
      ) {
        throw new Error("undefined materialization");
      }
      if (!isObject(before) || !isObject(command) || !isObject(expected)) {
        throw new Error("transition must materialize object literals");
      }
      const afterState = expected["afterState"];
      if (!isObject(afterState)) {
        throw new Error("expected afterState must be a complete state object");
      }
      const computedDelta = computeRecursiveLiteralDelta(before, afterState);
      if (!jsonDeepEqual(expected["exactDelta"], computedDelta)) {
        addFinding(
          findings,
          "EDIT_PLAN_RECURSIVE_DELTA",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.exactDelta`,
          "The checked-in exact delta must equal an independent recursive comparison of beforeState and afterState.",
        );
      }
      requireExact(
        expected["bookmarks"],
        afterState["bookmarks"],
        "EDIT_PLAN_BOOKMARK_LITERAL",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.bookmarks`,
        "Expected bookmarks must be the literal bookmarks in the complete after-state.",
        findings,
      );
      requireExact(
        expected["focusRequest"],
        afterState["focusRequest"],
        "EDIT_PLAN_FOCUS_LITERAL",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.focusRequest`,
        "Expected focus must be the literal focus request in the complete after-state.",
        findings,
      );
      requireExact(
        expected["history"],
        afterState["history"],
        "EDIT_PLAN_HISTORY_LITERAL",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.history`,
        "Expected history must be the literal history value in the complete after-state.",
        findings,
      );
      validateTransitionWorkCounters(
        expected["counters"],
        row["phase"],
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.counters`,
        findings,
      );
      const result = expected["result"];
      if (!isObject(result)) {
        addFinding(
          findings,
          "EDIT_PLAN_RESULT_LITERAL",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.result`,
          "Expected result must be one complete literal transition-result object.",
        );
      } else {
        validateAtomicEditResultDetail(
          before,
          afterState,
          command,
          expected,
          result,
          row["phase"],
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected.result`,
          findings,
        );
      }
      validateTransitionMusicalEvidence(
        before,
        afterState,
        expected,
        row["operation"],
        isObject(result) ? result : null,
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected`,
        findings,
      );
      validatePublicationEvidence(
        before,
        afterState,
        expected,
        row["phase"],
        isObject(result) ? result : null,
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.expected`,
        findings,
      );
      if (
        isObject(result) &&
        result["ok"] === true &&
        row["phase"] === "apply" &&
        (typeof before["revision"] !== "number" ||
          afterState["revision"] !== before["revision"] + 1)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_ONE_REVISION",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
          "A committed edit plan must advance the document revision exactly once.",
        );
      }
      const quickEntrySnapshotMatch = quickEntrySnapshotMatchesState(
        command,
        before,
      );
      if (
        isObject(result) &&
        result["ok"] === true &&
        row["phase"] === "apply" &&
        quickEntrySnapshotMatch === false
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_STALE_QUICK_ENTRY_COMMITTED",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
          "A successful fragment insertion must bind every Quick Entry snapshot field to the complete before-state.",
        );
      }
      if (
        isObject(result) &&
        result["ok"] === true &&
        command["kind"] === "apply-edit-plan"
      ) {
        validateApplyEditPlanShape(
          command,
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.command`,
          findings,
        );
        if (row["phase"] === "apply") {
          validateCommittedOperationLaw(
            before,
            afterState,
            command,
            row["operation"],
            `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
            findings,
          );
        }
        const forbidden = recursiveForbiddenKeys(
          command["plan"],
          new Set([
            "candidate",
            "commands",
            "batch",
            "patch",
            "patches",
            "requestId",
            "retirement",
            "undoDisposition",
            "derivedPatch",
            "appState",
            "currentState",
            "nestedPlan",
          ]),
        );
        for (const path of forbidden) {
          addFinding(
            findings,
            "EDIT_PLAN_GENERIC_BACKDOOR",
            `${transitionId}:${path}`,
            "An apply-edit-plan payload may not smuggle a candidate, batch, generic patch, import, request, state, or nested plan.",
          );
        }
        if (
          !isObject(command["plan"]) ||
          command["plan"]["kind"] !== row["operation"]
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_COMMAND_DISCRIMINANT",
            `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.command.plan.kind`,
            "Apply transition and plan discriminants must agree exactly.",
          );
        }
      }
    } catch (error) {
      addFinding(
        findings,
        "EDIT_PLAN_LITERAL_MATERIALIZATION",
        `edit-plan-cases.json.literalCatalog.transitions.${transitionId}`,
        `Literal materialization failed: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }

  for (const [rowId, row] of applicability) {
    checkExactKeys(
      row,
      EXPECTED_APPLICABILITY_KEYS,
      "EDIT_PLAN_APPLICABILITY_KEYS",
      `edit-plan-cases.json.applicabilityRows.${rowId}`,
      findings,
    );
    if (!A0_U1_ATOMIC_EDIT_PLAN_KINDS.includes(row["operation"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_APPLICABILITY_OPERATION",
        `edit-plan-cases.json.applicabilityRows.${rowId}.operation`,
        "Each plan kind needs one exact applicability row.",
      );
    }
    if (row["wallTimeCutoff"] !== "forbidden") {
      addFinding(
        findings,
        "EDIT_PLAN_WALL_TIME",
        `edit-plan-cases.json.applicabilityRows.${rowId}.wallTimeCutoff`,
        "Wall time is evidence only and may never choose an edit outcome.",
      );
    }
    checkReferenceIds(
      row["caseIds"],
      cases,
      "EDIT_PLAN_APPLICABILITY_CASE_REF",
      `edit-plan-cases.json.applicabilityRows.${rowId}.caseIds`,
      findings,
    );
    checkReferenceIds(
      row["transitionIds"],
      transitions,
      "EDIT_PLAN_APPLICABILITY_TRANSITION_REF",
      `edit-plan-cases.json.applicabilityRows.${rowId}.transitionIds`,
      findings,
    );
  }
  requireExact(
    [...applicability.values()].map((row) => row["operation"]),
    A0_U1_ATOMIC_EDIT_PLAN_KINDS,
    "EDIT_PLAN_APPLICABILITY_COMPLETENESS",
    "edit-plan-cases.json.applicabilityRows",
    "Applicability rows must cover every plan kind exactly once in contract order.",
    findings,
  );

  for (const [witnessId, row] of transposition) {
    checkExactKeys(
      row,
      EXPECTED_TRANSPOSITION_KEYS,
      "EDIT_PLAN_TRANSPOSITION_KEYS",
      `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
      findings,
    );
    if (!A0_U1_ATOMIC_EDIT_PLAN_KINDS.includes(row["operation"] as never)) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSPOSITION_OPERATION",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.operation`,
        "Transposition witness operation is outside the five-plan union.",
      );
    }
    const baseId = row["baseTransitionId"];
    const transposedId = row["transposedTransitionId"];
    if (
      typeof baseId !== "string" ||
      typeof transposedId !== "string" ||
      !transitions.has(baseId) ||
      !transitions.has(transposedId)
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSPOSITION_TRANSITION_REF",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
        "Base and transposed transition references must both exist.",
      );
    }
    for (const digestField of [
      "sourceCanonicalSha256",
      "targetCanonicalSha256",
      "inverseCanonicalSha256",
    ]) {
      if (!SHA256_PATTERN.test(String(row[digestField]))) {
        addFinding(
          findings,
          "EDIT_PLAN_TRANSPOSITION_DIGEST",
          `edit-plan-cases.json.transpositionWitnesses.${witnessId}.${digestField}`,
          "Every transposition witness digest must be lowercase SHA-256.",
        );
      }
    }
    try {
      const sourceDocument = materializeLiteral(
        row["sourceDocumentRef"],
        catalog,
      );
      const targetDocument = materializeLiteral(
        row["targetDocumentRef"],
        catalog,
      );
      if (!isObject(sourceDocument) || !isObject(targetDocument)) {
        throw new Error("document references did not materialize as objects");
      }
      const sourceDigest = sha256(stableJson(sourceDocument));
      const targetDigest = sha256(stableJson(targetDocument));
      requireExact(
        row["sourceCanonicalSha256"],
        sourceDigest,
        "EDIT_PLAN_TRANSPOSITION_SOURCE_DIGEST",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.sourceCanonicalSha256`,
        "Source transposition digest must be independently recomputed.",
        findings,
      );
      requireExact(
        row["targetCanonicalSha256"],
        targetDigest,
        "EDIT_PLAN_TRANSPOSITION_TARGET_DIGEST",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.targetCanonicalSha256`,
        "Target transposition digest must be independently recomputed.",
        findings,
      );
      requireExact(
        row["inverseCanonicalSha256"],
        sourceDigest,
        "EDIT_PLAN_TRANSPOSITION_INVERSE_DIGEST",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}.inverseCanonicalSha256`,
        "Inverse transposition must recover the exact source canonical digest.",
        findings,
      );
      for (const field of ["manualPitchBytes", "frozenPitchBytes"] as const) {
        const evidence = row[field];
        const evidencePath = `edit-plan-cases.json.transpositionWitnesses.${witnessId}.${field}`;
        checkExactKeys(
          evidence,
          [
            "jsonPointer",
            "sourceCanonicalJsonUtf8Hex",
            "targetCanonicalJsonUtf8Hex",
            "inverseCanonicalJsonUtf8Hex",
          ],
          "EDIT_PLAN_TRANSPOSITION_PITCH_KEYS",
          evidencePath,
          findings,
        );
        if (
          !isObject(evidence) ||
          typeof evidence["jsonPointer"] !== "string"
        ) {
          continue;
        }
        const sourcePitches = valueAtPointer(
          sourceDocument,
          evidence["jsonPointer"],
        );
        const targetPitches = valueAtPointer(
          targetDocument,
          evidence["jsonPointer"],
        );
        if (!Array.isArray(sourcePitches) || !Array.isArray(targetPitches)) {
          addFinding(
            findings,
            "EDIT_PLAN_TRANSPOSITION_PITCH_POINTER",
            `${evidencePath}.jsonPointer`,
            "Pitch-byte evidence must point to literal source and target pitch arrays.",
          );
          continue;
        }
        const sourceHex = utf8Hex(sourcePitches);
        const targetHex = utf8Hex(targetPitches);
        requireExact(
          evidence["sourceCanonicalJsonUtf8Hex"],
          sourceHex,
          "EDIT_PLAN_TRANSPOSITION_SOURCE_PITCH_BYTES",
          `${evidencePath}.sourceCanonicalJsonUtf8Hex`,
          "Source pitch bytes must be independently recomputed.",
          findings,
        );
        requireExact(
          evidence["targetCanonicalJsonUtf8Hex"],
          targetHex,
          "EDIT_PLAN_TRANSPOSITION_TARGET_PITCH_BYTES",
          `${evidencePath}.targetCanonicalJsonUtf8Hex`,
          "Target pitch bytes must be independently recomputed.",
          findings,
        );
        requireExact(
          evidence["inverseCanonicalJsonUtf8Hex"],
          sourceHex,
          "EDIT_PLAN_TRANSPOSITION_INVERSE_PITCH_BYTES",
          `${evidencePath}.inverseCanonicalJsonUtf8Hex`,
          "Inverse pitch bytes must recover the exact source spelling and ordering.",
          findings,
        );
      }
    } catch (error) {
      addFinding(
        findings,
        "EDIT_PLAN_TRANSPOSITION_MATERIALIZATION",
        `edit-plan-cases.json.transpositionWitnesses.${witnessId}`,
        `Transposition literal materialization failed: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
  requireExact(
    [...transposition.values()].map((row) => row["operation"]),
    A0_U1_ATOMIC_EDIT_PLAN_KINDS,
    "EDIT_PLAN_TRANSPOSITION_COMPLETENESS",
    "edit-plan-cases.json.transpositionWitnesses",
    "Every plan kind needs one transposition/applicability witness in contract order.",
    findings,
  );

  return { catalog, cases, transitions, applicability, transposition };
}

function validateControlsTracesAndAuthorities(
  mutationRoot: JsonObject,
  traceRoot: JsonObject,
  provenanceRoot: JsonObject,
  cases: ReadonlyMap<string, JsonObject>,
  transitions: ReadonlyMap<string, JsonObject>,
  applicability: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): Readonly<{
  controls: Map<string, JsonObject>;
  traces: Map<string, JsonObject>;
  lawCoverage: Map<string, JsonObject>;
  authorities: Map<string, JsonObject>;
}> {
  const controls = indexById(
    recordsAt(mutationRoot["controls"]),
    "mutation-controls.json.controls",
    findings,
  );
  const traces = indexById(
    recordsAt(traceRoot["traces"]),
    "trace-ledger.json.traces",
    findings,
  );
  const lawRows = recordsAt(traceRoot["lawCoverage"]);
  const lawCoverage = new Map<string, JsonObject>();
  for (const [index, row] of lawRows.entries()) {
    const lawId = row["lawId"];
    if (typeof lawId !== "string" || lawId.length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_COVERAGE_ID",
        `trace-ledger.json.lawCoverage[${String(index)}].lawId`,
        "Every law coverage row needs one declared law ID.",
      );
      continue;
    }
    if (lawCoverage.has(lawId)) {
      addFinding(
        findings,
        "EDIT_PLAN_LAW_COVERAGE_DUPLICATE",
        `trace-ledger.json.lawCoverage.${lawId}`,
        "Every law must have exactly one coverage row.",
      );
    }
    lawCoverage.set(lawId, row);
  }
  const authorities = indexById(
    recordsAt(provenanceRoot["authorities"]),
    "provenance-ledger.json.authorities",
    findings,
  );

  for (const [controlId, control] of controls) {
    checkExactKeys(
      control,
      EXPECTED_CONTROL_KEYS,
      "EDIT_PLAN_CONTROL_KEYS",
      `mutation-controls.json.controls.${controlId}`,
      findings,
    );
    if (!operationAllowed(control["operation"])) {
      addFinding(
        findings,
        "EDIT_PLAN_CONTROL_OPERATION",
        `mutation-controls.json.controls.${controlId}.operation`,
        "Mutation control operation is outside the closed vocabulary.",
      );
    }
    const baselineId = control["baselineTransitionId"];
    const killerId = control["killerTransitionId"];
    if (
      typeof baselineId !== "string" ||
      typeof killerId !== "string" ||
      baselineId === killerId ||
      !transitions.has(baselineId) ||
      !transitions.has(killerId)
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_CONTROL_TRANSITIONS",
        `mutation-controls.json.controls.${controlId}`,
        "Each control needs distinct existing baseline and killer transitions.",
      );
    }
    const mutation = isObject(control["mutation"]) ? control["mutation"] : {};
    const observation = isObject(control["observation"])
      ? control["observation"]
      : {};
    checkExactKeys(
      mutation,
      [
        "materialization",
        "operator",
        "jsonPointer",
        "from",
        "to",
        "exactChangedFieldCount",
      ],
      "EDIT_PLAN_MUTATION_KEYS",
      `mutation-controls.json.controls.${controlId}.mutation`,
      findings,
    );
    checkExactKeys(
      observation,
      ["materialization", "jsonPointer", "baselineValue", "killerValue"],
      "EDIT_PLAN_OBSERVATION_KEYS",
      `mutation-controls.json.controls.${controlId}.observation`,
      findings,
    );
    if (
      mutation["exactChangedFieldCount"] !== 1 ||
      jsonDeepEqual(mutation["from"], mutation["to"])
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_ONE_FIELD_MUTATION",
        `mutation-controls.json.controls.${controlId}.mutation`,
        "A control must change exactly one field from a distinct literal value.",
      );
    }
    if (
      mutation["materialization"] === observation["materialization"] &&
      mutation["jsonPointer"] === observation["jsonPointer"]
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_MUTATION_OBSERVATION_TAUTOLOGY",
        `mutation-controls.json.controls.${controlId}`,
        "The independently observed consequence cannot be the mutation target itself.",
      );
    }
    if (
      jsonDeepEqual(observation["baselineValue"], observation["killerValue"])
    ) {
      addFinding(
        findings,
        "EDIT_PLAN_MUTATION_OBSERVATION_EQUAL",
        `mutation-controls.json.controls.${controlId}.observation`,
        "Baseline and killer observations must differ.",
      );
    }
    requireExact(
      control["exactExpectedDifference"],
      "one-recursive-input-delta-at-declared-pointer",
      "EDIT_PLAN_CONTROL_EXPECTED_DIFFERENCE",
      `mutation-controls.json.controls.${controlId}.exactExpectedDifference`,
      "Mutation controls use one closed exact-difference declaration.",
      findings,
    );
    requireExact(
      control["oracleExpectation"],
      "baseline-accepted-killer-rejected-by-independent-semantic-oracle",
      "EDIT_PLAN_CONTROL_ORACLE",
      `mutation-controls.json.controls.${controlId}.oracleExpectation`,
      "Mutation controls must state the independent baseline/killer oracle outcome exactly.",
      findings,
    );
    checkReferenceIds(
      control["linkedCaseIds"],
      cases,
      "EDIT_PLAN_CONTROL_CASE_REF",
      `mutation-controls.json.controls.${controlId}.linkedCaseIds`,
      findings,
    );
    checkReferenceIds(
      control["traceIds"],
      traces,
      "EDIT_PLAN_CONTROL_TRACE_REF",
      `mutation-controls.json.controls.${controlId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      control["authorityIds"],
      authorities,
      "EDIT_PLAN_CONTROL_AUTHORITY_REF",
      `mutation-controls.json.controls.${controlId}.authorityIds`,
      findings,
    );
    for (const lawId of stringsAt(control["lawIds"])) {
      if (!A0_U1_ATOMIC_EDIT_LAW_IDS.includes(lawId as never)) {
        addFinding(
          findings,
          "EDIT_PLAN_CONTROL_LAW_REF",
          `mutation-controls.json.controls.${controlId}.lawIds.${lawId}`,
          "Mutation control cites an undeclared law.",
        );
      }
    }
  }

  for (const [traceId, trace] of traces) {
    checkExactKeys(
      trace,
      EXPECTED_TRACE_KEYS,
      "EDIT_PLAN_TRACE_KEYS",
      `trace-ledger.json.traces.${traceId}`,
      findings,
    );
    checkReferenceIds(
      trace["caseIds"],
      cases,
      "EDIT_PLAN_TRACE_CASE_REF",
      `trace-ledger.json.traces.${traceId}.caseIds`,
      findings,
    );
    checkReferenceIds(
      trace["transitionIds"],
      transitions,
      "EDIT_PLAN_TRACE_TRANSITION_REF",
      `trace-ledger.json.traces.${traceId}.transitionIds`,
      findings,
    );
    checkReferenceIds(
      trace["controlIds"],
      controls,
      "EDIT_PLAN_TRACE_CONTROL_REF",
      `trace-ledger.json.traces.${traceId}.controlIds`,
      findings,
    );
    checkReferenceIds(
      trace["authorityIds"],
      authorities,
      "EDIT_PLAN_TRACE_AUTHORITY_REF",
      `trace-ledger.json.traces.${traceId}.authorityIds`,
      findings,
    );
    if (stringsAt(trace["proofKinds"]).length === 0) {
      addFinding(
        findings,
        "EDIT_PLAN_TRACE_PROOF_EMPTY",
        `trace-ledger.json.traces.${traceId}.proofKinds`,
        "Every trace needs explicit proof kinds.",
      );
    }
  }

  requireExact(
    [...lawCoverage.keys()],
    A0_U1_ATOMIC_EDIT_LAW_IDS,
    "EDIT_PLAN_LAW_COVERAGE_COMPLETENESS",
    "trace-ledger.json.lawCoverage",
    "Law coverage must contain each declared law exactly once in contract order.",
    findings,
  );
  for (const [lawId, row] of lawCoverage) {
    checkExactKeys(
      row,
      EXPECTED_LAW_COVERAGE_KEYS,
      "EDIT_PLAN_LAW_COVERAGE_KEYS",
      `trace-ledger.json.lawCoverage.${lawId}`,
      findings,
    );
    checkReferenceIds(
      row["positiveTransitionIds"],
      transitions,
      "EDIT_PLAN_LAW_POSITIVE_REF",
      `trace-ledger.json.lawCoverage.${lawId}.positiveTransitionIds`,
      findings,
    );
    checkReferenceIds(
      row["negativeOrNearMissTransitionIds"],
      transitions,
      "EDIT_PLAN_LAW_NEGATIVE_REF",
      `trace-ledger.json.lawCoverage.${lawId}.negativeOrNearMissTransitionIds`,
      findings,
    );
    checkReferenceIds(
      row["boundaryTransitionIds"],
      transitions,
      "EDIT_PLAN_LAW_BOUNDARY_REF",
      `trace-ledger.json.lawCoverage.${lawId}.boundaryTransitionIds`,
      findings,
    );
    checkReferenceIds(
      row["applicabilityRowIds"],
      applicability,
      "EDIT_PLAN_LAW_APPLICABILITY_REF",
      `trace-ledger.json.lawCoverage.${lawId}.applicabilityRowIds`,
      findings,
    );
    checkReferenceIds(
      row["mutationControlIds"],
      controls,
      "EDIT_PLAN_LAW_CONTROL_REF",
      `trace-ledger.json.lawCoverage.${lawId}.mutationControlIds`,
      findings,
    );
    checkReferenceIds(
      row["traceIds"],
      traces,
      "EDIT_PLAN_LAW_TRACE_REF",
      `trace-ledger.json.lawCoverage.${lawId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      row["authorityIds"],
      authorities,
      "EDIT_PLAN_LAW_AUTHORITY_REF",
      `trace-ledger.json.lawCoverage.${lawId}.authorityIds`,
      findings,
    );
  }

  if (
    provenanceRoot["expertReviewClaim"] !== false ||
    provenanceRoot["humanAcceptanceClaim"] !== false
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_PROVENANCE_CLAIM",
      "provenance-ledger.json",
      "Mechanical specification evidence cannot claim expert or human acceptance.",
    );
  }
  const independence = isObject(provenanceRoot["independence"])
    ? provenanceRoot["independence"]
    : {};
  if (
    independence["productionOutputUsedAsOracle"] !== false ||
    independence["expectedValuesGenerated"] !== false
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_PROVENANCE_INDEPENDENCE",
      "provenance-ledger.json.independence",
      "Expected values must be independently authored and never generated from production.",
    );
  }
  for (const [authorityId, authority] of authorities) {
    checkExactKeys(
      authority,
      EXPECTED_AUTHORITY_KEYS,
      "EDIT_PLAN_AUTHORITY_KEYS",
      `provenance-ledger.json.authorities.${authorityId}`,
      findings,
    );
    checkReferenceIds(
      authority["caseIds"],
      cases,
      "EDIT_PLAN_AUTHORITY_CASE_REF",
      `provenance-ledger.json.authorities.${authorityId}.caseIds`,
      findings,
    );
    checkReferenceIds(
      authority["transitionIds"],
      transitions,
      "EDIT_PLAN_AUTHORITY_TRANSITION_REF",
      `provenance-ledger.json.authorities.${authorityId}.transitionIds`,
      findings,
    );
    checkReferenceIds(
      authority["controlIds"],
      controls,
      "EDIT_PLAN_AUTHORITY_CONTROL_REF",
      `provenance-ledger.json.authorities.${authorityId}.controlIds`,
      findings,
    );
    checkReferenceIds(
      authority["traceIds"],
      traces,
      "EDIT_PLAN_AUTHORITY_TRACE_REF",
      `provenance-ledger.json.authorities.${authorityId}.traceIds`,
      findings,
    );
  }

  for (const [caseId, row] of cases) {
    checkReferenceIds(
      row["mutationControlIds"],
      controls,
      "EDIT_PLAN_CASE_CONTROL_REF",
      `edit-plan-cases.json.caseGroups.${caseId}.mutationControlIds`,
      findings,
      false,
    );
    checkReferenceIds(
      row["traceIds"],
      traces,
      "EDIT_PLAN_CASE_TRACE_REF",
      `edit-plan-cases.json.caseGroups.${caseId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      row["authorityIds"],
      authorities,
      "EDIT_PLAN_CASE_AUTHORITY_REF",
      `edit-plan-cases.json.caseGroups.${caseId}.authorityIds`,
      findings,
    );
    for (const controlId of stringsAt(row["mutationControlIds"])) {
      const control = controls.get(controlId);
      if (
        control !== undefined &&
        !stringsAt(control["linkedCaseIds"]).includes(caseId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CASE_CONTROL_RECIPROCAL",
          `edit-plan-cases.json.caseGroups.${caseId}.mutationControlIds.${controlId}`,
          "Case and mutation-control links must be reciprocal.",
        );
      }
    }
    for (const traceId of stringsAt(row["traceIds"])) {
      const trace = traces.get(traceId);
      if (
        trace !== undefined &&
        !reciprocalIncludes(trace, "caseIds", caseId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CASE_TRACE_RECIPROCAL",
          `edit-plan-cases.json.caseGroups.${caseId}.traceIds.${traceId}`,
          "Case and trace links must be reciprocal.",
        );
      }
    }
    for (const authorityId of stringsAt(row["authorityIds"])) {
      const authority = authorities.get(authorityId);
      if (
        authority !== undefined &&
        !reciprocalIncludes(authority, "caseIds", caseId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CASE_AUTHORITY_RECIPROCAL",
          `edit-plan-cases.json.caseGroups.${caseId}.authorityIds.${authorityId}`,
          "Case and provenance links must be reciprocal.",
        );
      }
    }
  }
  for (const [controlId, control] of controls) {
    for (const traceId of stringsAt(control["traceIds"])) {
      const trace = traces.get(traceId);
      if (
        trace !== undefined &&
        !reciprocalIncludes(trace, "controlIds", controlId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CONTROL_TRACE_RECIPROCAL",
          `mutation-controls.json.controls.${controlId}.traceIds.${traceId}`,
          "Control and trace links must be reciprocal.",
        );
      }
    }
    for (const authorityId of stringsAt(control["authorityIds"])) {
      const authority = authorities.get(authorityId);
      if (
        authority !== undefined &&
        !reciprocalIncludes(authority, "controlIds", controlId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CONTROL_AUTHORITY_RECIPROCAL",
          `mutation-controls.json.controls.${controlId}.authorityIds.${authorityId}`,
          "Control and provenance links must be reciprocal.",
        );
      }
    }
  }
  for (const [traceId, trace] of traces) {
    for (const authorityId of stringsAt(trace["authorityIds"])) {
      const authority = authorities.get(authorityId);
      if (
        authority !== undefined &&
        !reciprocalIncludes(authority, "traceIds", traceId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_TRACE_AUTHORITY_RECIPROCAL",
          `trace-ledger.json.traces.${traceId}.authorityIds.${authorityId}`,
          "Trace and provenance links must be reciprocal.",
        );
      }
    }
  }
  return { controls, traces, lawCoverage, authorities };
}

function transitionMaterialization(
  transition: JsonObject,
  selector: unknown,
  catalog: JsonObject,
): unknown {
  if (selector === "command" || selector === "beforeState") {
    return materializeLiteral(transition[selector], catalog);
  }
  if (
    typeof selector === "string" &&
    [
      "expected.result",
      "expected.counters",
      "expected.afterState",
      "expected.exactDelta",
      "expected.bookmarks",
      "expected.history",
    ].includes(selector)
  ) {
    const expected = materializeLiteral(transition["expected"], catalog);
    const field = selector.slice("expected.".length);
    return isObject(expected) ? expected[field] : undefined;
  }
  return undefined;
}

function pointerValueOrAbsent(value: unknown, pointer: unknown): unknown {
  if (typeof pointer !== "string") return undefined;
  const observed = valueAtPointer(value, pointer);
  return observed === undefined ? { $absent: true } : observed;
}

function validateMutationMaterializations(
  controls: ReadonlyMap<string, JsonObject>,
  transitions: ReadonlyMap<string, JsonObject>,
  catalog: JsonObject,
  findings: A0U1EditPlanContractFinding[],
): void {
  for (const [controlId, control] of controls) {
    const baseline = transitions.get(String(control["baselineTransitionId"]));
    const killer = transitions.get(String(control["killerTransitionId"]));
    if (baseline === undefined || killer === undefined) continue;
    const mutation = isObject(control["mutation"]) ? control["mutation"] : {};
    const observation = isObject(control["observation"])
      ? control["observation"]
      : {};
    const path = `mutation-controls.json.controls.${controlId}`;
    try {
      const baselineMutation = transitionMaterialization(
        baseline,
        mutation["materialization"],
        catalog,
      );
      const killerMutation = transitionMaterialization(
        killer,
        mutation["materialization"],
        catalog,
      );
      if (baselineMutation === undefined || killerMutation === undefined) {
        throw new Error("mutation component selector did not resolve");
      }
      const computedMutation = computeRecursiveLiteralDelta(
        baselineMutation,
        killerMutation,
      );
      const pointer = mutation["jsonPointer"];
      const from = pointerValueOrAbsent(baselineMutation, pointer);
      const to = pointerValueOrAbsent(killerMutation, pointer);
      requireExact(
        mutation["from"],
        from,
        "EDIT_PLAN_MUTATION_FROM",
        `${path}.mutation.from`,
        "Mutation from-value must be independently resolved from the baseline transition.",
        findings,
      );
      requireExact(
        mutation["to"],
        to,
        "EDIT_PLAN_MUTATION_TO",
        `${path}.mutation.to`,
        "Mutation to-value must be independently resolved from the killer transition.",
        findings,
      );
      if (
        computedMutation.length !== 1 ||
        computedMutation[0]?.jsonPointer !== pointer ||
        !jsonDeepEqual(computedMutation[0]?.before, from) ||
        !jsonDeepEqual(computedMutation[0]?.after, to)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_MUTATION_NOT_ONE_FIELD",
          `${path}.mutation`,
          "Baseline and killer input materializations must differ at exactly the declared one field.",
        );
      }

      const baselineObservation = transitionMaterialization(
        baseline,
        observation["materialization"],
        catalog,
      );
      const killerObservation = transitionMaterialization(
        killer,
        observation["materialization"],
        catalog,
      );
      if (
        baselineObservation === undefined ||
        killerObservation === undefined
      ) {
        throw new Error("observation component selector did not resolve");
      }
      const baselineValue = pointerValueOrAbsent(
        baselineObservation,
        observation["jsonPointer"],
      );
      const killerValue = pointerValueOrAbsent(
        killerObservation,
        observation["jsonPointer"],
      );
      requireExact(
        observation["baselineValue"],
        baselineValue,
        "EDIT_PLAN_OBSERVATION_BASELINE",
        `${path}.observation.baselineValue`,
        "Observed baseline consequence must be independently resolved.",
        findings,
      );
      requireExact(
        observation["killerValue"],
        killerValue,
        "EDIT_PLAN_OBSERVATION_KILLER",
        `${path}.observation.killerValue`,
        "Observed killer consequence must be independently resolved.",
        findings,
      );
      if (jsonDeepEqual(baselineValue, killerValue)) {
        addFinding(
          findings,
          "EDIT_PLAN_OBSERVATION_NO_CONSEQUENCE",
          `${path}.observation`,
          "The one-field killer must produce a distinct independently observed consequence.",
        );
      }
    } catch (error) {
      addFinding(
        findings,
        "EDIT_PLAN_MUTATION_MATERIALIZATION",
        path,
        `Mutation materialization failed: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
}

function validateAuxiliaryLinks(
  applicability: ReadonlyMap<string, JsonObject>,
  transposition: ReadonlyMap<string, JsonObject>,
  traces: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): void {
  requireExact(
    [...traces.values()].map((trace) => trace["scope"]),
    ["pipeline", ...A0_U1_ATOMIC_EDIT_PLAN_KINDS],
    "EDIT_PLAN_TRACE_SCOPE_COMPLETENESS",
    "trace-ledger.json.traces",
    "Trace ledger must contain pipeline then one operation-owned trace per plan kind.",
    findings,
  );
  for (const [rowId, row] of applicability) {
    checkReferenceIds(
      row["traceIds"],
      traces,
      "EDIT_PLAN_APPLICABILITY_TRACE_REF",
      `edit-plan-cases.json.applicabilityRows.${rowId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      row["authorityIds"],
      authorities,
      "EDIT_PLAN_APPLICABILITY_AUTHORITY_REF",
      `edit-plan-cases.json.applicabilityRows.${rowId}.authorityIds`,
      findings,
    );
  }
  for (const [witnessId, row] of transposition) {
    checkReferenceIds(
      row["traceIds"],
      traces,
      "EDIT_PLAN_TRANSPOSITION_TRACE_REF",
      `edit-plan-cases.json.transpositionWitnesses.${witnessId}.traceIds`,
      findings,
    );
    checkReferenceIds(
      row["authorityIds"],
      authorities,
      "EDIT_PLAN_TRANSPOSITION_AUTHORITY_REF",
      `edit-plan-cases.json.transpositionWitnesses.${witnessId}.authorityIds`,
      findings,
    );
  }
}

function validateFixtureShells(
  loaded: ReadonlyMap<SpecFilename, LoadedFixture>,
  findings: A0U1EditPlanContractFinding[],
): void {
  for (const filename of A0_U1_EDIT_PLAN_SPEC_FILES) {
    const fixture = loaded.get(filename);
    const root = fixture?.root;
    if (root?.["schema"] !== EXPECTED_SCHEMAS[filename]) {
      addFinding(
        findings,
        "EDIT_PLAN_SCHEMA",
        `${filename}.schema`,
        "Fixture schema differs from the closed A0/U1 packet vocabulary.",
      );
    }
    if (root?.["reviewState"] !== EXPECTED_REVIEW_STATES[filename]) {
      addFinding(
        findings,
        "EDIT_PLAN_REVIEW_STATE",
        `${filename}.reviewState`,
        "Fixture review state must describe an independent proposed specification.",
      );
    }
    if (root?.["pinState"] !== "reviewed-byte-and-semantic-pinned") {
      addFinding(
        findings,
        "EDIT_PLAN_PIN_STATE",
        `${filename}.pinState`,
        "Every reviewed fixture must declare the final byte-and-semantic pin state.",
      );
    }
    if (filename === "a0-u1-edit-plan-contract.json") {
      if (root !== undefined) validateRootContract(root, findings);
      continue;
    }
    checkExactKeys(
      root,
      EXPECTED_TOP_LEVEL_KEYS[filename],
      "EDIT_PLAN_COMPANION_KEYS",
      filename,
      findings,
    );
  }
}

function validateCoverageCrossProduct(
  cases: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): void {
  for (const operation of A0_U1_ATOMIC_EDIT_PLAN_KINDS) {
    for (const family of EXPECTED_COVERAGE_FAMILIES) {
      const matching = [...cases.values()].filter(
        (row) => row["operation"] === operation && row["category"] === family,
      );
      if (matching.length !== 1) {
        addFinding(
          findings,
          "EDIT_PLAN_COVERAGE_CROSS_PRODUCT",
          `edit-plan-cases.json.caseGroups.${operation}.${family}`,
          "The 50-case inventory must contain exactly one group for every plan-kind and coverage-family pair.",
        );
      }
    }
  }
}

function validateLawReciprocity(
  transitions: ReadonlyMap<string, JsonObject>,
  controls: ReadonlyMap<string, JsonObject>,
  traces: ReadonlyMap<string, JsonObject>,
  lawCoverage: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: A0U1EditPlanContractFinding[],
): void {
  const transitionCoverageFields = [
    "positiveTransitionIds",
    "negativeOrNearMissTransitionIds",
    "boundaryTransitionIds",
  ] as const;
  for (const [transitionId, transition] of transitions) {
    for (const lawId of stringsAt(transition["lawIds"])) {
      const law = lawCoverage.get(lawId);
      if (
        law === undefined ||
        !transitionCoverageFields.some((field) =>
          stringsAt(law[field]).includes(transitionId),
        )
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_TRANSITION_LAW_RECIPROCAL",
          `edit-plan-cases.json.literalCatalog.transitions.${transitionId}.lawIds.${lawId}`,
          "Transition-to-law links must appear in one of the law row's typed transition lists.",
        );
      }
    }
  }
  for (const [lawId, law] of lawCoverage) {
    for (const field of transitionCoverageFields) {
      for (const transitionId of stringsAt(law[field])) {
        if (
          !stringsAt(transitions.get(transitionId)?.["lawIds"]).includes(lawId)
        ) {
          addFinding(
            findings,
            "EDIT_PLAN_LAW_TRANSITION_RECIPROCAL",
            `trace-ledger.json.lawCoverage.${lawId}.${field}.${transitionId}`,
            "Law-to-transition links must be reciprocal.",
          );
        }
      }
    }
    for (const controlId of stringsAt(law["mutationControlIds"])) {
      if (!stringsAt(controls.get(controlId)?.["lawIds"]).includes(lawId)) {
        addFinding(
          findings,
          "EDIT_PLAN_LAW_CONTROL_RECIPROCAL",
          `trace-ledger.json.lawCoverage.${lawId}.mutationControlIds.${controlId}`,
          "Law and mutation-control links must be reciprocal.",
        );
      }
    }
    for (const traceId of stringsAt(law["traceIds"])) {
      if (!stringsAt(traces.get(traceId)?.["lawIds"]).includes(lawId)) {
        addFinding(
          findings,
          "EDIT_PLAN_LAW_TRACE_RECIPROCAL",
          `trace-ledger.json.lawCoverage.${lawId}.traceIds.${traceId}`,
          "Law and trace links must be reciprocal.",
        );
      }
    }
    for (const authorityId of stringsAt(law["authorityIds"])) {
      if (
        !stringsAt(authorities.get(authorityId)?.["lawIds"]).includes(lawId)
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_LAW_AUTHORITY_RECIPROCAL",
          `trace-ledger.json.lawCoverage.${lawId}.authorityIds.${authorityId}`,
          "Law and provenance-authority links must be reciprocal.",
        );
      }
    }
  }
  for (const [controlId, control] of controls) {
    for (const lawId of stringsAt(control["lawIds"])) {
      if (
        !stringsAt(lawCoverage.get(lawId)?.["mutationControlIds"]).includes(
          controlId,
        )
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_CONTROL_LAW_RECIPROCAL",
          `mutation-controls.json.controls.${controlId}.lawIds.${lawId}`,
          "Mutation-control and law links must be reciprocal.",
        );
      }
    }
  }
  for (const [traceId, trace] of traces) {
    for (const lawId of stringsAt(trace["lawIds"])) {
      if (!stringsAt(lawCoverage.get(lawId)?.["traceIds"]).includes(traceId)) {
        addFinding(
          findings,
          "EDIT_PLAN_TRACE_LAW_RECIPROCAL",
          `trace-ledger.json.traces.${traceId}.lawIds.${lawId}`,
          "Trace and law links must be reciprocal.",
        );
      }
    }
  }
  for (const [authorityId, authority] of authorities) {
    for (const lawId of stringsAt(authority["lawIds"])) {
      if (
        !stringsAt(lawCoverage.get(lawId)?.["authorityIds"]).includes(
          authorityId,
        )
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_AUTHORITY_LAW_RECIPROCAL",
          `provenance-ledger.json.authorities.${authorityId}.lawIds.${lawId}`,
          "Provenance authority and law links must be reciprocal.",
        );
      }
    }
  }
}

function validateCompanionDigests(
  contract: JsonObject,
  loaded: ReadonlyMap<SpecFilename, LoadedFixture>,
  findings: A0U1EditPlanContractFinding[],
): void {
  const declared = isObject(contract["companionSha256"])
    ? contract["companionSha256"]
    : {};
  const companionNames = A0_U1_EDIT_PLAN_SPEC_FILES.filter(
    (filename) => filename !== "a0-u1-edit-plan-contract.json",
  );
  checkExactKeys(
    declared,
    companionNames,
    "EDIT_PLAN_COMPANION_DIGEST_KEYS",
    "a0-u1-edit-plan-contract.json.companionSha256",
    findings,
  );
  for (const filename of companionNames) {
    const digest = loaded.get(filename);
    if (digest !== undefined && declared[filename] !== sha256(digest.bytes)) {
      addFinding(
        findings,
        "EDIT_PLAN_COMPANION_DIGEST",
        `a0-u1-edit-plan-contract.json.companionSha256.${filename}`,
        "Root companion digest must equal the exact checked-in companion bytes.",
      );
    }
  }
}

export async function validateA0U1EditPlanContract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
  options: A0U1EditPlanContractValidationOptions = {},
): Promise<A0U1EditPlanContractValidationReport> {
  const findings: A0U1EditPlanContractFinding[] = [];
  const loaded = new Map<SpecFilename, LoadedFixture>();
  let actualFiles: string[] = [];
  try {
    actualFiles = (await readdir(fixtureRoot)).sort(codeUnitCompare);
  } catch {
    addFinding(
      findings,
      "EDIT_PLAN_FIXTURE_ROOT",
      fixtureRoot,
      "The A0/U1 fixture root must exist and be readable.",
    );
  }
  requireExact(
    actualFiles,
    [...A0_U1_EDIT_PLAN_SPEC_FILES],
    "EDIT_PLAN_FILE_INVENTORY",
    fixtureRoot,
    "Fixture inventory must contain exactly the five reviewed packet files.",
    findings,
  );

  const expectedByteDigests =
    options.expectedByteDigests ?? A0_U1_EDIT_PLAN_SPEC_BYTE_DIGESTS;
  for (const filename of A0_U1_EDIT_PLAN_SPEC_FILES) {
    const path = resolve(fixtureRoot, filename);
    try {
      const bytes = new Uint8Array(await readFile(path));
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (
        hasUtf8Bom(bytes) ||
        source.includes("\r") ||
        !source.endsWith("\n") ||
        source.endsWith("\n\n")
      ) {
        addFinding(
          findings,
          "EDIT_PLAN_TEXT_CANONICAL",
          filename,
          "Fixture must be UTF-8 without BOM/CR and have exactly one final LF.",
        );
      }
      let duplicates: string[] = [];
      try {
        duplicates = findDuplicateJsonKeys(source);
      } catch {
        addFinding(
          findings,
          "EDIT_PLAN_JSON_LEXICAL",
          filename,
          "Fixture must pass the independent strict JSON lexical scan.",
        );
      }
      for (const duplicate of duplicates) {
        addFinding(
          findings,
          "EDIT_PLAN_JSON_DUPLICATE_KEY",
          `${filename}${duplicate.slice(1)}`,
          "Duplicate JSON object keys are forbidden.",
        );
      }
      const parsed: unknown = JSON.parse(source);
      if (!isObject(parsed)) {
        addFinding(
          findings,
          "EDIT_PLAN_JSON_ROOT",
          filename,
          "Fixture root must be a JSON object.",
        );
      } else {
        loaded.set(filename, { filename, bytes, source, root: parsed });
      }
      if (sha256(bytes) !== expectedByteDigests[filename]) {
        addFinding(
          findings,
          "EDIT_PLAN_BYTE_DIGEST",
          filename,
          "Fixture bytes differ from the independently reviewed byte pin.",
        );
      }
    } catch {
      addFinding(
        findings,
        "EDIT_PLAN_FILE_READ",
        filename,
        "Fixture must be readable, valid UTF-8, and valid JSON.",
      );
    }
  }

  validateFixtureShells(loaded, findings);
  const semanticPacket = Object.fromEntries(
    A0_U1_EDIT_PLAN_SPEC_FILES.map((filename) => [
      filename,
      loaded.get(filename)?.root ?? null,
    ]),
  );
  if (
    sha256(stableJson(semanticPacket)) !== A0_U1_EDIT_PLAN_SPEC_SEMANTIC_DIGEST
  ) {
    addFinding(
      findings,
      "EDIT_PLAN_SEMANTIC_DIGEST",
      fixtureRoot,
      "Parsed contract, cases, controls, provenance, and traces differ from the reviewed semantic pin.",
    );
  }

  const contract = loaded.get("a0-u1-edit-plan-contract.json")?.root ?? {};
  const casesRoot = await hydrateCheckedInDocumentLiterals(
    loaded.get("edit-plan-cases.json")?.root ?? {},
    findings,
  );
  const mutationRoot = loaded.get("mutation-controls.json")?.root ?? {};
  const provenanceRoot = loaded.get("provenance-ledger.json")?.root ?? {};
  const traceRoot = loaded.get("trace-ledger.json")?.root ?? {};
  const caseIndexes = validateCases(casesRoot, findings);
  const linkedIndexes = validateControlsTracesAndAuthorities(
    mutationRoot,
    traceRoot,
    provenanceRoot,
    caseIndexes.cases,
    caseIndexes.transitions,
    caseIndexes.applicability,
    findings,
  );
  validateCoverageCrossProduct(caseIndexes.cases, findings);
  validateLawReciprocity(
    caseIndexes.transitions,
    linkedIndexes.controls,
    linkedIndexes.traces,
    linkedIndexes.lawCoverage,
    linkedIndexes.authorities,
    findings,
  );
  validateMutationMaterializations(
    linkedIndexes.controls,
    caseIndexes.transitions,
    caseIndexes.catalog,
    findings,
  );
  validateAuxiliaryLinks(
    caseIndexes.applicability,
    caseIndexes.transposition,
    linkedIndexes.traces,
    linkedIndexes.authorities,
    findings,
  );
  validateCompanionDigests(contract, loaded, findings);

  const counts = Object.freeze({
    files: actualFiles.length,
    commandKinds: Array.isArray(contract["commandKinds"])
      ? contract["commandKinds"].length
      : 0,
    planKinds: Array.isArray(contract["planKinds"])
      ? contract["planKinds"].length
      : 0,
    lawRows: linkedIndexes.lawCoverage.size,
    caseGroups: caseIndexes.cases.size,
    literalTransitions: caseIndexes.transitions.size,
    applicabilityRows: caseIndexes.applicability.size,
    transpositionWitnesses: caseIndexes.transposition.size,
    mutationControls: linkedIndexes.controls.size,
    traces: linkedIndexes.traces.size,
    authorities: linkedIndexes.authorities.size,
  });
  requireExact(
    counts,
    EXPECTED_COUNTS,
    "EDIT_PLAN_COUNTS",
    fixtureRoot,
    "Actual packet inventory differs from the frozen 5/1/5/17/50/70/5/5/30/6/6 closure.",
    findings,
  );
  requireExact(
    APPLICATION_WORK_COUNTER_NAMES,
    [
      "sectionsVisited",
      "measuresVisited",
      "eventsVisited",
      "stableIdsIndexed",
      "historyEntriesVisited",
      "historyBytesEstimated",
      "bookmarksRepaired",
      "requestsCompared",
      "transportNotificationsCompared",
      "validationCalls",
    ],
    "EDIT_PLAN_EXISTING_A0_COUNTER_DRIFT",
    "src/application/application-state-contract.ts.APPLICATION_WORK_COUNTER_NAMES",
    "The spec leaf must not modify the accepted A0 work-counter surface.",
    findings,
  );

  findings.sort(
    (left, right) =>
      codeUnitCompare(left.path, right.path) ||
      codeUnitCompare(left.code, right.code) ||
      codeUnitCompare(left.message, right.message),
  );
  return Object.freeze({
    schema: "changes.validation.a0-u1-edit-plan-contract.v1",
    package: "A0/U1 atomic edit plan",
    outcome: findings.length === 0 ? "pass" : "fail",
    reviewState: "proposed-independent-spec",
    counts,
    existingA0CommandKindsUnchanged: jsonDeepEqual(
      A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS,
      [...APPLICATION_COMMAND_KINDS, "apply-edit-plan"],
    ),
    productionImplementationClaim: false,
    u1UiCompletionClaim: false,
    humanAcceptanceClaim: false,
    expertReviewClaim: false,
    findings: Object.freeze(findings),
  });
}

if (import.meta.main) {
  const report = await validateA0U1EditPlanContract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
