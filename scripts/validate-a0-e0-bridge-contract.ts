import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as ts from "typescript";

import { validateDocumentSemantics } from "../src/application";
import { decodeDocumentShape } from "../src/domain";

import {
  E0_ACCEPTED_BYTE_DIGESTS,
  E0_ACCEPTED_SEMANTIC_DIGEST,
  validateE0Contract,
} from "./validate-e0-contract";

type JsonObject = Record<string, unknown>;

export type A0E0BridgeContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type A0E0BridgeContractValidationReport = Readonly<{
  schema: "changes.validation.a0-e0-bridge-contract.v2";
  package: "A0 interchange owner ports";
  outcome: "pass" | "fail";
  reviewState: "proposed-independent-spec";
  counts: Readonly<{
    files: number;
    replacementCases: number;
    identityCases: number;
    markerCases: number;
    applicabilityRows: number;
    mutationControls: number;
    traces: number;
    authorities: number;
  }>;
  acceptedE0V1PinnedUnmodified: boolean;
  semanticCompatibilityClaim: false;
  productionImplementationClaim: false;
  humanAcceptanceClaim: false;
  findings: readonly A0E0BridgeContractFinding[];
}>;

export type A0E0BridgeContractValidationOptions = Readonly<{
  /** Test-only seam proving the semantic lock survives refreshed byte pins. */
  expectedByteDigests?: Readonly<Record<string, string>>;
}>;

const REPOSITORY_ROOT = new URL("../", import.meta.url).pathname;
const DEFAULT_FIXTURE_ROOT = resolve(
  REPOSITORY_ROOT,
  "tests/fixtures/a0-e0-bridge",
);

export const A0_E0_BRIDGE_SPEC_FILES = Object.freeze([
  "a0-e0-bridge-contract.json",
  "mutation-controls.json",
  "owner-port-cases.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const);

const EXPECTED_SCHEMAS: Readonly<Record<string, string>> = Object.freeze({
  "a0-e0-bridge-contract.json": "changes.fixtures.a0-e0-bridge-contract.v2",
  "mutation-controls.json":
    "changes.fixtures.a0-e0-bridge-mutation-controls.v2",
  "owner-port-cases.json": "changes.fixtures.a0-e0-bridge-owner-port-cases.v2",
  "provenance-ledger.json":
    "changes.fixtures.a0-e0-bridge-provenance-ledger.v2",
  "trace-ledger.json": "changes.fixtures.a0-e0-bridge-trace-ledger.v2",
});

const EXPECTED_REVIEW_STATES: Readonly<Record<string, string>> = Object.freeze({
  "a0-e0-bridge-contract.json": "proposed-independent-spec",
  "mutation-controls.json": "proposed-independent-literal-spec",
  "owner-port-cases.json": "proposed-independent-literal-spec",
  "provenance-ledger.json": "proposed-independent-spec",
  "trace-ledger.json": "proposed-independent-literal-spec",
});

export const A0_E0_BRIDGE_SPEC_BYTE_DIGESTS: Readonly<Record<string, string>> =
  Object.freeze({
    "a0-e0-bridge-contract.json":
      "74945e0b324aa878cc9a4f7ab019fbb986f4a78ae4fd6675064cd9302383876a",
  "mutation-controls.json":
    "6c545eb277bd6888f62824a745cf317b0408cbb1eebae16532ab2da0bee9c15b",
  "owner-port-cases.json":
    "b00b4d9feabc9b4d1120380b92cc8070f7cf2223f327303a9ab6af9148e2a705",
    "provenance-ledger.json":
      "b8a1de9b67e940ab1a9bf6d8404129a3ae34aad8b7b9beedbdf8d7f374c93ca0",
  "trace-ledger.json":
    "fcf586dcec97100145423a419fb26848b8a2202b19805a22ffb8e50c76304827",
  });

export const A0_E0_BRIDGE_SPEC_SEMANTIC_DIGEST =
  "88218ae3ea827fe399dbe2722b0e31796261d59175546463ef4582601d54cb9f";

export const A0_E0_BRIDGE_ACCEPTED_E0_BYTE_MANIFEST_DIGEST =
  "8c48f2ab156c702e877f3bec7f3acd51763dc1448cc696232a4761160ba7a9e9";

export const A0_E0_BRIDGE_OWNER_OPERATION_NAMES = Object.freeze([
  "prepareImportReplacementPublication",
  "discardImportReplacementPublication",
  "publishImportReplacement",
  "readCurrentApplicationDocumentIdentity",
  "publishCanonicalExportRevision",
] as const);

const EXPECTED_COUNTS = Object.freeze({
  files: 5,
  replacementCases: 30,
  identityCases: 6,
  markerCases: 12,
  applicabilityRows: 5,
  mutationControls: 24,
  traces: 5,
  authorities: 5,
});

const COVERAGE_FAMILIES = Object.freeze([
  "positive",
  "negative-near-miss",
  "stale-concurrent",
  "malformed-throw",
  "replay",
  "transposition-applicability",
  "mutation",
] as const);

const DISCARD_REASONS = Object.freeze([
  "preparation-protocol-invalid",
  "retirement-refused",
  "retirement-protocol-invalid",
  "publication-protocol-invalid",
] as const);

const ACCEPTED_E0_INPUT_LEDGER_PATH =
  "tests/fixtures/interchange/input-fixture-ledger.json";
const ACCEPTED_E0_INPUT_LEDGER_SHA256 =
  "693d3e39db3e82e5c24980d363566943360687bdf2dcd523185f56a028b0f714";

const ACCEPTED_E0_V1_ARTIFACT_PINS = Object.freeze([
  {
    role: "documentation",
    path: "docs/E0_INTERCHANGE_CONTRACT.md",
    sha256: "b46824f731fe2a632f994e09aa8bb19e510c83f572a73a23b7c2c09f455d1ca3",
  },
  {
    role: "export-source",
    path: "src/export/interchange-contract.ts",
    sha256: "5c7a0a962ece42ea140a602c53a9c7c3853b38ded99bea77b0001c56d08524de",
  },
  {
    role: "application-source",
    path: "src/application/e0-interchange-contract.ts",
    sha256: "32a51ef9eac0948a069fc3498348562f70e7703b430f9e1ad9c9961fe53cf10a",
  },
  {
    role: "validator",
    path: "scripts/validate-e0-contract.ts",
    sha256: "d0e7c80b0a7cea1e1ce11443b148eadcdfd7c02a0855f06ab5761580c7a12e4b",
  },
  {
    role: "static-test",
    path: "tests/static/e0-contract.test.ts",
    sha256: "13422e127091fa6c9118439c52fe0725e6ff74ab94b89be347aedafae0b80063",
  },
  {
    role: "test-support",
    path: "tests/support/e0-interchange-fixture.ts",
    sha256: "cda73a5421b2635d1feb845ad39e1681920eddbf9d09f51b0ed624b19e06d522",
  },
  {
    role: "acceptance-review",
    path: "docs/evidence/E0_GOLDEN_PACKET_REVIEW.md",
    sha256: "a11d79fe73811364d3d631f2a5b2d9d1fcce0f79fdc3ed64472d5980a2397693",
  },
] as const);

const ACCEPTED_E0_V1_CONFLICT_IDS = Object.freeze([
  "E0V1-CONFLICT-IMPORT-REQUEST-CURRENT-STATE",
  "E0V1-CONFLICT-IMPORT-PREVIEW-PROJECTION",
  "E0V1-CONFLICT-IMPORT-SUCCESS-PUBLICATION-STATE",
  "E0V1-CONFLICT-IMPORT-REFUSAL-STATE",
  "E0V1-CONFLICT-PUBLICATION-PROTOCOL-LAST-KNOWN-STATE",
  "E0V1-CONFLICT-RAW-MARKER-STATES",
  "E0V1-CONFLICT-WIDENED-PREPARATION-REFUSALS",
  "E0V1-CONFLICT-REPLACEMENT-PUBLICATION-REFUSALS",
  "E0V1-CONFLICT-PUBLIC-MARKER-REQUEST-STATE",
] as const);
const ACCEPTED_E0_V1_CONFLICT_INVENTORY_DIGEST =
  "e22fd076556902ddc68402b410ea5de5ea1f3396d5f4bdae08e08e489246e5e9";
const OWNER_PORT_RECORDS_DIGEST =
  "e060d06ed1700333e767673707a27ec9f333c6dda7a8224eb3c2af8bbf021181";

const OWNER_IMPORT_TOPOLOGY = Object.freeze({
  "../domain": ["DocumentId", "ValidatedDocument"],
  "./application-state-contract": [
    "AppRevision",
    "ApplicationEffect",
    "ApplicationReplacementOrigin",
    "ApplicationRequestId",
    "ApplicationWorkCounters",
    "CommandId",
    "DocumentTransitionState",
    "ReplacementRetirementReceipt",
    "TransportGeneration",
  ],
} as const);

const EXPECTED_OWNER_RESULT_COUNTER_KEYS = Object.freeze([
  "prepareImportReplacementPublication",
  "discardImportReplacementPublication",
  "publishImportReplacement",
  "readCurrentApplicationDocumentIdentity",
  "publishCanonicalExportRevision",
  "e0V2ConsumerNormalizer",
  "f2DecodeDocumentShape",
  "f3ValidateDocumentSemantics",
  "historyEstimator",
  "bookmarkRepair",
  "controllerStateReads",
  "controllerStateInstalls",
  "listenerCallbacks",
  "registryLookups",
  "registryAllocations",
  "registryInvalidations",
  "registryConsumptions",
] as const);

const E0_V2_OWNED_CASE_IDS = new Set([
  "BRIDGE-REP-025",
  "BRIDGE-REP-026",
  "BRIDGE-ID-005",
  "BRIDGE-ID-006",
  "BRIDGE-MARK-006",
  "BRIDGE-MARK-007",
]);

const FORWARD_E0_V2_TRACE_EXCLUSION = Object.freeze({
  ownerLeaf: "jcpe-94yu.1",
  futureOwnerLeaf: "jcpe-milestone-reliable-studio-l3a.8.4",
  excludedFrom: [
    "A0-owner-case-count",
    "A0-owner-run-count",
    "A0-owner-mutation-proof",
    "typed-producer-conformance",
  ],
  rationale:
    "Malformed unknown-return normalization and thrown consumer ports belong only to the future E0 v2 semantic binding.",
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return `{"$specialNumber":${JSON.stringify(
      Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity",
    )}}`;
  }
  if (value === undefined) return '{"$undefined":true}';
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort(codeUnitCompare)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => jsonDeepEqual(item, right[index]))
    );
  }
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) && jsonDeepEqual(left[key], right[key]),
    )
  );
}

function recordsAt(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function stringsAt(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function addFinding(
  findings: A0E0BridgeContractFinding[],
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
  findings: A0E0BridgeContractFinding[],
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    addFinding(findings, code, path, message);
  }
}

/**
 * Small strict JSON lexical pass used only to reject duplicate object keys.
 * JSON.parse remains the semantic parser after this independent check.
 */
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

function indexById(
  records: readonly JsonObject[],
  path: string,
  findings: A0E0BridgeContractFinding[],
): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const [index, record] of records.entries()) {
    const id = record["id"];
    if (typeof id !== "string" || id.length === 0) {
      addFinding(
        findings,
        "BRIDGE_ID_MISSING",
        `${path}[${String(index)}].id`,
        "Every ledger row needs a stable nonempty ID.",
      );
      continue;
    }
    if (result.has(id)) {
      addFinding(
        findings,
        "BRIDGE_ID_DUPLICATE",
        `${path}.${id}`,
        "Ledger IDs must be unique.",
      );
    }
    result.set(id, record);
  }
  return result;
}

function decodeJsonPointer(pointer: string): string[] | null {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function valueAtJsonPointer(value: unknown, pointer: string): unknown {
  const tokens = decodeJsonPointer(pointer);
  if (tokens === null) return undefined;
  return tokens.reduce<unknown>((current, token) => {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return undefined;
      return current[Number(token)];
    }
    return isObject(current) ? current[token] : undefined;
  }, value);
}

function pointerForPath(path: readonly (string | number)[]): string {
  return path.length === 0
    ? ""
    : `/${path
        .map((segment) =>
          String(segment).replaceAll("~", "~0").replaceAll("/", "~1"),
        )
        .join("/")}`;
}

function jsonDiffPointers(
  left: unknown,
  right: unknown,
  path: readonly (string | number)[] = [],
): string[] {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [pointerForPath(path)];
    return left.flatMap((item, index) =>
      jsonDiffPointers(item, right[index], [...path, index]),
    );
  }
  if (!isObject(left) || !isObject(right)) return [pointerForPath(path)];
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(
    codeUnitCompare,
  );
  return keys.flatMap((key) => {
    if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
      return [pointerForPath([...path, key])];
    }
    return jsonDiffPointers(left[key], right[key], [...path, key]);
  });
}

function shallowCloneContainer(value: unknown): unknown[] | JsonObject {
  if (Array.isArray(value)) return [...value];
  if (isObject(value)) return { ...value };
  throw new Error("BRIDGE_PATCH_PARENT");
}

function childAtContainer(container: unknown, token: string): unknown {
  if (Array.isArray(container)) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) {
      throw new Error("BRIDGE_PATCH_ARRAY_INDEX");
    }
    return container[Number(token)];
  }
  if (isObject(container)) return container[token];
  throw new Error("BRIDGE_PATCH_PARENT");
}

function setContainerChild(
  container: unknown,
  token: string,
  value: unknown,
): void {
  if (Array.isArray(container)) {
    const index = Number(token);
    if (!Number.isSafeInteger(index) || index < 0 || index >= container.length) {
      throw new Error("BRIDGE_PATCH_REPLACE_INDEX");
    }
    container[index] = value;
    return;
  }
  if (!isObject(container) || !Object.hasOwn(container, token)) {
    throw new Error("BRIDGE_PATCH_REPLACE_TARGET");
  }
  container[token] = value;
}

function applyPointerMutation(
  root: unknown,
  operator: string,
  pointer: string,
  expectedBefore: unknown,
  value: unknown,
): unknown {
  const tokens = decodeJsonPointer(pointer);
  if (tokens === null || tokens.length === 0) {
    throw new Error("BRIDGE_PATCH_POINTER");
  }
  const rootCopy = shallowCloneContainer(root);
  let sourceParent: unknown = root;
  let targetParent: unknown = rootCopy;
  for (const token of tokens.slice(0, -1)) {
    const sourceChild = childAtContainer(sourceParent, token);
    const targetChild = shallowCloneContainer(sourceChild);
    setContainerChild(targetParent, token, targetChild);
    sourceParent = sourceChild;
    targetParent = targetChild;
  }
  const token = tokens.at(-1) as string;
  const current = childAtContainer(sourceParent, token);
  if (operator === "assert") {
    if (!jsonDeepEqual(current, expectedBefore)) {
      throw new Error("BRIDGE_PATCH_ASSERT");
    }
    return root;
  }
  if (!jsonDeepEqual(current, expectedBefore)) {
    throw new Error(`BRIDGE_PATCH_FROM:${pointer}`);
  }
  if (operator === "replace") {
    setContainerChild(targetParent, token, value);
    return rootCopy;
  }
  if (operator === "append") {
    if (!Array.isArray(current)) throw new Error("BRIDGE_PATCH_APPEND_TARGET");
    setContainerChild(targetParent, token, [...current, value]);
    return rootCopy;
  }
  if (operator === "remove") {
    if (Array.isArray(targetParent)) {
      const index = Number(token);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= targetParent.length
      ) {
        throw new Error("BRIDGE_PATCH_REMOVE_INDEX");
      }
      targetParent.splice(index, 1);
    } else if (isObject(targetParent) && Object.hasOwn(targetParent, token)) {
      delete targetParent[token];
    } else {
      throw new Error("BRIDGE_PATCH_REMOVE_TARGET");
    }
    return rootCopy;
  }
  throw new Error("BRIDGE_PATCH_OPERATOR");
}

function containsForbiddenStateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenStateKey);
  if (!isObject(value)) return false;
  const expectedF3ValidationCalls = [...documentValidationCache.values()].filter(
    (entry) => entry.stage !== "f2-refused" && entry.stage !== "f2-repaired",
  ).length;
  if (
    ["currentState", "lastKnownState", "observedBefore", "state"].some(
      (key) => Object.hasOwn(value, key),
    )
  ) {
    return true;
  }
  return Object.values(value).some(containsForbiddenStateKey);
}

function isFullAppStateLiteral(value: unknown): boolean {
  if (!isObject(value) || !isObject(value["document"])) return false;
  const requiredKeys = [
    "document",
    "revision",
    "exportRevision",
    "recovery",
    "history",
    "bookmarks",
    "panels",
    "dialogs",
    "quickEntry",
    "importDraft",
    "transport",
    "pendingRequests",
    "documentTransition",
    "focusRequest",
    "notices",
    "nextSequence",
  ];
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    typeof value["document"]["id"] === "string" &&
    Number.isSafeInteger(value["revision"]) &&
    Number(value["revision"]) >= 0
  );
}

function isCompleteDocumentLiteral(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    value["schema"] === "changes.progression.v2" &&
    typeof value["id"] === "string" &&
    typeof value["title"] === "string" &&
    Array.isArray(value["sections"])
  );
}

type AcceptedE0MaterializationContext = Readonly<{
  ledger: JsonObject;
  sharedBases: JsonObject;
  fixturesById: ReadonlyMap<string, JsonObject>;
  loadedFiles: ReadonlyMap<string, unknown>;
}>;

function materializeAcceptedRepetitionRecipe(value: JsonObject): unknown {
  if (
    value["kind"] !==
      "test-owned-validated-document-repetition-materialization" ||
    !isObject(value["recipe"])
  ) {
    return undefined;
  }
  const recipe = value["recipe"];
  const sectionCount = recipe["sectionCount"];
  const measuresPerSection = recipe["measuresPerSection"];
  const totalMeasures = recipe["totalMeasures"];
  const completeMeasureCount = recipe["completeMeasureCount"];
  const description = isObject(recipe["description"])
    ? recipe["description"]
    : {};
  const sectionTemplate = isObject(recipe["section"])
    ? recipe["section"]
    : {};
  const eventTemplate = isObject(recipe["completeMeasureEvent"])
    ? recipe["completeMeasureEvent"]
    : {};
  if (
    !Number.isSafeInteger(sectionCount) ||
    !Number.isSafeInteger(measuresPerSection) ||
    !Number.isSafeInteger(totalMeasures) ||
    !Number.isSafeInteger(completeMeasureCount) ||
    Number(sectionCount) * Number(measuresPerSection) !== totalMeasures ||
    typeof description["scalar"] !== "string" ||
    !Number.isSafeInteger(description["repeatCodePoints"])
  ) {
    throw new Error("BRIDGE_E0_REPETITION_RECIPE");
  }
  const sections = Array.from({ length: Number(sectionCount) }, (_, sectionIndex) => ({
    id: `s${String(sectionIndex)}`,
    ...structuredClone(sectionTemplate),
    measures: Array.from(
      { length: Number(measuresPerSection) },
      (_, measureIndex) => {
        const globalMeasure =
          sectionIndex * Number(measuresPerSection) + measureIndex;
        const containsEvent = globalMeasure < Number(completeMeasureCount);
        return {
          id: `m${String(globalMeasure)}`,
          events: containsEvent
            ? [
                {
                  id: `e${String(globalMeasure)}`,
                  ...structuredClone(eventTemplate),
                },
              ]
            : [],
          completion: { kind: containsEvent ? "complete" : "empty" },
        };
      },
    ),
  }));
  return {
    schema: recipe["schema"],
    id: recipe["documentId"],
    title: recipe["title"],
    description: description["scalar"].repeat(
      Number(description["repeatCodePoints"]),
    ),
    meter: structuredClone(recipe["meter"]),
    tempoBpm: recipe["tempoBpm"],
    key: structuredClone(recipe["key"]),
    sections,
    playback: structuredClone(recipe["playback"]),
  };
}

function materializeAcceptedE0Value(
  value: unknown,
  context: AcceptedE0MaterializationContext,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      materializeAcceptedE0Value(item, context, visiting),
    );
  }
  if (!isObject(value)) return structuredClone(value);
  const repeatedDocument = materializeAcceptedRepetitionRecipe(value);
  if (repeatedDocument !== undefined) return repeatedDocument;
  const sharedBaseId = value["sharedBase"];
  if (typeof sharedBaseId === "string") {
    if (visiting.has(`shared:${sharedBaseId}`)) {
      throw new Error("BRIDGE_E0_SHARED_BASE_CYCLE");
    }
    const base = context.sharedBases[sharedBaseId];
    if (base === undefined) throw new Error("BRIDGE_E0_SHARED_BASE_MISSING");
    const next = new Set(visiting);
    next.add(`shared:${sharedBaseId}`);
    const materializedBase = materializeAcceptedE0Value(
      isObject(base) && Object.hasOwn(base, "value") ? base["value"] : base,
      context,
      next,
    );
    const overrides = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "sharedBase"),
    );
    if (Object.keys(overrides).length === 0) return materializedBase;
    if (!isObject(materializedBase)) {
      throw new Error("BRIDGE_E0_SHARED_BASE_OVERRIDE");
    }
    return {
      ...materializedBase,
      ...Object.fromEntries(
        Object.entries(overrides).map(([key, child]) => [
          key,
          materializeAcceptedE0Value(child, context, next),
        ]),
      ),
    };
  }
  const fixtureId = value["fixtureId"];
  if (typeof fixtureId === "string") {
    const acceptedFixture = context.fixturesById.get(fixtureId);
    const loaded = context.loadedFiles.get(fixtureId);
    if (acceptedFixture !== undefined) {
      return materializeAcceptedE0Fixture(fixtureId, context, visiting);
    }
    if (loaded !== undefined) return structuredClone(loaded);
  }
  if (Object.hasOwn(value, "value") && typeof value["materializeAs"] === "string") {
    return materializeAcceptedE0Value(value["value"], context, visiting);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      materializeAcceptedE0Value(child, context, visiting),
    ]),
  );
}

function applyAcceptedE0Mutations(
  base: unknown,
  mutations: readonly JsonObject[],
  context: AcceptedE0MaterializationContext,
): unknown {
  let current = base;
  for (const mutation of mutations) {
    const operation = mutation["operation"];
    const path = mutation["path"];
    if (
      typeof operation !== "string" ||
      !Array.isArray(path) ||
      path.length === 0 ||
      !path.every(
        (segment) =>
          typeof segment === "string" || Number.isSafeInteger(segment),
      )
    ) {
      throw new Error("BRIDGE_E0_MUTATION_SHAPE");
    }
    const pointer = pointerForPath(path as (string | number)[]);
    const before = valueAtJsonPointer(current, pointer);
    if (
      Object.hasOwn(mutation, "from") &&
      !jsonDeepEqual(
        before,
        materializeAcceptedE0Value(mutation["from"], context),
      )
    ) {
      throw new Error("BRIDGE_E0_MUTATION_FROM");
    }
    if (operation === "set") {
      current = applyPointerMutation(
        current,
        "replace",
        pointer,
        before,
        materializeAcceptedE0Value(mutation["to"], context),
      );
      continue;
    }
    if (operation === "append") {
      current = applyPointerMutation(
        current,
        "append",
        pointer,
        before,
        materializeAcceptedE0Value(mutation["value"], context),
      );
      continue;
    }
    if (operation === "remove") {
      current = applyPointerMutation(
        current,
        "remove",
        pointer,
        before,
        undefined,
      );
      continue;
    }
    throw new Error("BRIDGE_E0_MUTATION_OPERATION");
  }
  return current;
}

function materializeAcceptedE0Fixture(
  fixtureId: string,
  context: AcceptedE0MaterializationContext,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (visiting.has(`fixture:${fixtureId}`)) {
    throw new Error("BRIDGE_E0_FIXTURE_CYCLE");
  }
  const fixture = context.fixturesById.get(fixtureId);
  if (fixture === undefined) {
    const loaded = context.loadedFiles.get(fixtureId);
    if (loaded === undefined) throw new Error("BRIDGE_E0_FIXTURE_MISSING");
    return structuredClone(loaded);
  }
  if (fixture["kind"] === "local-golden") {
    const path = fixture["path"];
    if (typeof path !== "string" || !context.loadedFiles.has(path)) {
      throw new Error("BRIDGE_E0_LOCAL_GOLDEN_MISSING");
    }
    return structuredClone(context.loadedFiles.get(path));
  }
  const next = new Set(visiting);
  next.add(`fixture:${fixtureId}`);
  if (Object.hasOwn(fixture, "value")) {
    return materializeAcceptedE0Value(fixture["value"], context, next);
  }
  const baseReference = fixture["base"];
  let base: unknown;
  if (typeof baseReference === "string") {
    base = materializeAcceptedE0Fixture(baseReference, context, next);
  } else if (isObject(baseReference)) {
    if (typeof baseReference["sharedBase"] === "string") {
      base = materializeAcceptedE0Value(baseReference, context, next);
    } else if (typeof baseReference["fixtureId"] === "string") {
      base = materializeAcceptedE0Fixture(
        baseReference["fixtureId"],
        context,
        next,
      );
    }
  }
  if (base === undefined) throw new Error("BRIDGE_E0_FIXTURE_BASE");
  return applyAcceptedE0Mutations(
    base,
    recordsAt(fixture["orderedMutations"]),
    context,
  );
}

type BridgeLiteralContext = Readonly<{
  catalog: JsonObject;
  acceptedE0: AcceptedE0MaterializationContext;
  cache?: Map<string, unknown>;
}>;

function materializeBridgeTemplate(
  value: unknown,
  context: BridgeLiteralContext,
  stateContext: unknown,
  visiting: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      materializeBridgeTemplate(item, context, stateContext, visiting),
    );
  }
  if (!isObject(value)) return structuredClone(value);
  if (Object.keys(value).length === 1 && Object.hasOwn(value, "$literalValue")) {
    return materializeBridgeTemplate(
      value["$literalValue"],
      context,
      stateContext,
      visiting,
    );
  }
  const referencedLiteral = value["$literalRef"];
  if (Object.keys(value).length === 1 && typeof referencedLiteral === "string") {
    return materializeBridgeLiteral(
      referencedLiteral,
      context,
      stateContext,
      visiting,
    );
  }
  if (Object.keys(value).length === 1 && typeof value["$statePointer"] === "string") {
    const selected = valueAtJsonPointer(stateContext, value["$statePointer"]);
    if (selected === undefined) throw new Error("BRIDGE_STATE_POINTER");
    return structuredClone(selected);
  }
  if (Object.keys(value).length === 1 && typeof value["$specialNumber"] === "string") {
    if (value["$specialNumber"] === "NaN") return Number.NaN;
    if (value["$specialNumber"] === "Infinity") return Number.POSITIVE_INFINITY;
    if (value["$specialNumber"] === "-Infinity") return Number.NEGATIVE_INFINITY;
    throw new Error("BRIDGE_SPECIAL_NUMBER");
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      materializeBridgeTemplate(child, context, stateContext, visiting),
    ]),
  );
}

function materializeBridgeLiteral(
  literalId: string,
  context: BridgeLiteralContext,
  stateContext: unknown = undefined,
  visiting: ReadonlySet<string> = new Set(),
): unknown {
  if (context.cache?.has(literalId) === true) {
    return context.cache.get(literalId);
  }
  if (visiting.has(literalId)) throw new Error("BRIDGE_LITERAL_CYCLE");
  const entry = context.catalog[literalId];
  if (!isObject(entry)) throw new Error("BRIDGE_LITERAL_MISSING");
  const next = new Set(visiting);
  next.add(literalId);
  if (entry["kind"] === "inline") {
    const materialized = materializeBridgeTemplate(
      entry["value"],
      context,
      stateContext,
      next,
    );
    context.cache?.set(literalId, materialized);
    return materialized;
  }
  if (entry["kind"] === "accepted-e0-v1-reference") {
    const path = entry["path"];
    if (typeof path !== "string" || typeof entry["jsonPointer"] !== "string") {
      throw new Error("BRIDGE_LITERAL_ACCEPTED_REFERENCE");
    }
    const prefix = "tests/fixtures/interchange/";
    if (!path.startsWith(prefix) || path.includes("..")) {
      throw new Error("BRIDGE_LITERAL_ACCEPTED_PATH");
    }
    const relativePath = path.slice(prefix.length);
    const expectedSha = E0_ACCEPTED_BYTE_DIGESTS[relativePath];
    if (expectedSha === undefined || entry["sha256"] !== expectedSha) {
      throw new Error("BRIDGE_LITERAL_ACCEPTED_DIGEST");
    }
    const authority =
      path === ACCEPTED_E0_INPUT_LEDGER_PATH
        ? context.acceptedE0.ledger
        : context.acceptedE0.loadedFiles.get(relativePath);
    const referenced = valueAtJsonPointer(authority, entry["jsonPointer"]);
    if (referenced === undefined) throw new Error("BRIDGE_LITERAL_JSON_POINTER");
    let materialized: unknown;
    if (isObject(referenced) && typeof referenced["id"] === "string") {
      const fixture = context.acceptedE0.fixturesById.get(referenced["id"]);
      if (fixture === referenced || fixture !== undefined) {
        materialized = materializeAcceptedE0Fixture(
          referenced["id"],
          context.acceptedE0,
        );
      }
    }
    materialized ??= materializeAcceptedE0Value(
      referenced,
      context.acceptedE0,
    );
    const resolved = applyBridgePatches(
      materialized,
      entry["materializationPatches"],
      context,
      materialized,
    );
    context.cache?.set(literalId, resolved);
    return resolved;
  }
  throw new Error("BRIDGE_LITERAL_KIND");
}

function materializePatchValue(
  value: unknown,
  context: BridgeLiteralContext,
  stateContext: unknown,
): unknown {
  return materializeBridgeTemplate(value, context, stateContext, new Set());
}

function applyBridgePatches(
  base: unknown,
  patches: unknown,
  context: BridgeLiteralContext,
  stateContext: unknown,
): unknown {
  const patchRecords = recordsAt(patches);
  if (patchRecords.length === 0) return base;
  let current = base;
  for (const patch of patchRecords) {
    const operator = patch["op"];
    const pointer = patch["jsonPointer"];
    if (typeof operator !== "string" || typeof pointer !== "string") {
      throw new Error("BRIDGE_PATCH_SHAPE");
    }
    const actualBefore = valueAtJsonPointer(current, pointer);
    if (actualBefore === undefined) {
      throw new Error(`BRIDGE_PATCH_TARGET:${pointer}`);
    }
    if (operator === "assert") {
      const expected = materializePatchValue(
        patch["value"],
        context,
        stateContext,
      );
      if (!jsonDeepEqual(actualBefore, expected)) {
        throw new Error("BRIDGE_PATCH_ASSERT");
      }
      continue;
    }
    if (operator === "append") {
      if (!Array.isArray(actualBefore)) throw new Error("BRIDGE_PATCH_APPEND");
      if (
        Object.hasOwn(patch, "fromCount") &&
        patch["fromCount"] !== actualBefore.length
      ) {
        throw new Error("BRIDGE_PATCH_APPEND_COUNT");
      }
      current = applyPointerMutation(
        current,
        "append",
        pointer,
        actualBefore,
        materializePatchValue(patch["value"], context, stateContext),
      );
      continue;
    }
    const expectedBefore = materializePatchValue(
      patch["from"],
      context,
      stateContext,
    );
    if (operator === "replace") {
      const to = materializePatchValue(patch["to"], context, stateContext);
      const value = materializePatchValue(
        patch["value"],
        context,
        stateContext,
      );
      if (!jsonDeepEqual(to, value)) {
        throw new Error("BRIDGE_PATCH_TO_VALUE");
      }
      current = applyPointerMutation(
        current,
        "replace",
        pointer,
        expectedBefore,
        value,
      );
      continue;
    }
    if (operator !== "remove") throw new Error("BRIDGE_PATCH_OPERATOR");
    current = applyPointerMutation(
      current,
      operator,
      pointer,
      expectedBefore,
      undefined,
    );
  }
  return current;
}

function materializeDescriptor(
  descriptor: unknown,
  context: BridgeLiteralContext,
  stateContext: unknown = undefined,
): unknown {
  if (!isObject(descriptor)) throw new Error("BRIDGE_DESCRIPTOR_SHAPE");
  const literalId = descriptor["literalId"];
  let base: unknown;
  if (typeof literalId === "string") {
    base = materializeBridgeLiteral(literalId, context, stateContext);
  } else if (Object.hasOwn(descriptor, "value")) {
    base = materializeBridgeTemplate(
      descriptor["value"],
      context,
      stateContext,
      new Set(),
    );
  } else {
    throw new Error("BRIDGE_DESCRIPTOR_VALUE");
  }
  return applyBridgePatches(
    base,
    descriptor["patches"],
    context,
    stateContext ?? base,
  );
}

function reverseReplacementPatches(
  value: unknown,
  patches: unknown,
  context: BridgeLiteralContext,
): unknown {
  let current = value;
  const records = recordsAt(patches);
  for (const patch of [...records].reverse()) {
    if (patch["op"] !== "replace" || typeof patch["jsonPointer"] !== "string") {
      throw new Error("BRIDGE_INVERSE_PATCH_OPERATOR");
    }
    const forwardValue = materializePatchValue(
      patch["value"],
      context,
      current,
    );
    const forwardTo = materializePatchValue(patch["to"], context, current);
    if (!jsonDeepEqual(forwardValue, forwardTo)) {
      throw new Error("BRIDGE_INVERSE_PATCH_TO");
    }
    current = applyPointerMutation(
      current,
      "replace",
      patch["jsonPointer"],
      forwardValue,
      materializePatchValue(patch["from"], context, current),
    );
  }
  return current;
}

type MaterializedRunProjection = Readonly<{
  caseId: string;
  runId: string;
  operation: string;
  runRole: "conformance" | "mutation-killer";
  ownerProof: boolean;
  e0V2Owned: boolean;
  rawCall: JsonObject;
  controllerStateBefore: unknown;
  controllerStateAfter: unknown;
  registryBefore: unknown;
  registryAfter: unknown;
  exactTypedResult: unknown;
  exactCounters: unknown;
  synchronousEventOrder: unknown;
  workBound: unknown;
  exactControllerStateDelta: readonly JsonObject[];
  mutationProbe: JsonObject | null;
  historyEstimatorLawInput: unknown;
  ownerLawFlags: JsonObject;
  ownerLawOracle: JsonObject;
  scenarioFinalState: unknown;
  comparisonInput: JsonObject;
}>;

function projectionForMutationTarget(
  run: MaterializedRunProjection,
  materialization: string,
): unknown {
  switch (materialization) {
    case "comparisonInput":
      return run.comparisonInput;
    case "rawCall":
      return run.rawCall;
    case "controllerStateBefore":
      return run.controllerStateBefore;
    case "controllerStateAfter":
      return run.controllerStateAfter;
    case "registryBefore":
      return run.registryBefore;
    case "registryLawInput": {
      const registry = isObject(run.registryBefore) ? run.registryBefore : {};
      const entries = recordsAt(registry["entries"]);
      return {
        capacity: registry["capacity"],
        liveEntries: entries.filter((entry) => entry["status"] === "prepared")
          .length,
      };
    }
    case "registryAfter":
      return run.registryAfter;
    case "exactTypedResult":
      return run.exactTypedResult;
    case "exactCounters":
      return run.exactCounters;
    case "synchronousEventOrder":
      return run.synchronousEventOrder;
    case "workBound":
      return run.workBound;
    case "historyEstimatorLawInput":
      return run.historyEstimatorLawInput;
    case "ownerLawFlags":
      return run.ownerLawFlags;
    case "ownerLawOracle":
      return run.ownerLawOracle;
    case "scenarioFinalState":
      return run.scenarioFinalState;
    default:
      return undefined;
  }
}

export async function validateA0E0BridgeContract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
  options: A0E0BridgeContractValidationOptions = {},
): Promise<A0E0BridgeContractValidationReport> {
  const findings: A0E0BridgeContractFinding[] = [];
  const loaded = new Map<string, JsonObject>();

  let actualFiles: string[] = [];
  try {
    actualFiles = (await readdir(fixtureRoot)).sort(codeUnitCompare);
  } catch {
    addFinding(
      findings,
      "BRIDGE_FIXTURE_ROOT",
      fixtureRoot,
      "Bridge fixture root must exist and be readable.",
    );
  }
  requireExact(
    actualFiles,
    [...A0_E0_BRIDGE_SPEC_FILES],
    "BRIDGE_FILE_INVENTORY",
    fixtureRoot,
    "Bridge fixture inventory must contain exactly the five pinned companions.",
    findings,
  );

  for (const filename of A0_E0_BRIDGE_SPEC_FILES) {
    const path = resolve(fixtureRoot, filename);
    try {
      const bytes = new Uint8Array(await readFile(path));
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (
        source.startsWith("\uFEFF") ||
        source.includes("\r") ||
        !source.endsWith("\n") ||
        source.endsWith("\n\n")
      ) {
        addFinding(
          findings,
          "BRIDGE_TEXT_CANONICAL",
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
          "BRIDGE_JSON_LEXICAL",
          filename,
          "Fixture must pass the strict independent JSON lexical scan.",
        );
      }
      for (const duplicate of duplicates) {
        addFinding(
          findings,
          "BRIDGE_JSON_DUPLICATE_KEY",
          `${filename}${duplicate.slice(1)}`,
          "Duplicate JSON object keys are forbidden.",
        );
      }
      const value: unknown = JSON.parse(source);
      if (!isObject(value)) {
        addFinding(
          findings,
          "BRIDGE_JSON_ROOT",
          filename,
          "Fixture root must be a JSON object.",
        );
      } else {
        loaded.set(filename, value);
      }
      const expectedByteDigests =
        options.expectedByteDigests ?? A0_E0_BRIDGE_SPEC_BYTE_DIGESTS;
      if (sha256(bytes) !== expectedByteDigests[filename]) {
        addFinding(
          findings,
          "BRIDGE_BYTE_DIGEST",
          filename,
          "Fixture bytes differ from the independently pinned spec packet.",
        );
      }
    } catch {
      addFinding(
        findings,
        "BRIDGE_FILE_READ",
        filename,
        "Fixture must be readable, valid UTF-8, and valid JSON.",
      );
    }
  }

  for (const filename of A0_E0_BRIDGE_SPEC_FILES) {
    const value = loaded.get(filename);
    if (value?.["schema"] !== EXPECTED_SCHEMAS[filename]) {
      addFinding(
        findings,
        "BRIDGE_SCHEMA",
        `${filename}.schema`,
        "Fixture schema differs from the closed bridge vocabulary.",
      );
    }
    if (value?.["reviewState"] !== EXPECTED_REVIEW_STATES[filename]) {
      addFinding(
        findings,
        "BRIDGE_REVIEW_STATE",
        `${filename}.reviewState`,
        "Spec fixtures must not claim implementation or human acceptance.",
      );
    }
  }

  const semanticPacket = Object.fromEntries(
    A0_E0_BRIDGE_SPEC_FILES.map((filename) => [
      filename,
      loaded.get(filename) ?? null,
    ]),
  );
  if (
    sha256(new TextEncoder().encode(stableJson(semanticPacket))) !==
    A0_E0_BRIDGE_SPEC_SEMANTIC_DIGEST
  ) {
    addFinding(
      findings,
      "BRIDGE_SEMANTIC_DIGEST",
      fixtureRoot,
      "Parsed bridge contract, cases, controls, provenance, and traces differ from the independent semantic pin.",
    );
  }

  let acceptedE0Materialization: AcceptedE0MaterializationContext = {
    ledger: {},
    sharedBases: {},
    fixturesById: new Map(),
    loadedFiles: new Map(),
  };
  try {
    const acceptedRoot = resolve(REPOSITORY_ROOT, "tests/fixtures/interchange");
    const ledgerBytes = new Uint8Array(
      await readFile(resolve(REPOSITORY_ROOT, ACCEPTED_E0_INPUT_LEDGER_PATH)),
    );
    if (sha256(ledgerBytes) !== ACCEPTED_E0_INPUT_LEDGER_SHA256) {
      throw new Error("BRIDGE_ACCEPTED_LEDGER_DIGEST");
    }
    const ledgerValue: unknown = JSON.parse(new TextDecoder().decode(ledgerBytes));
    if (!isObject(ledgerValue)) throw new Error("BRIDGE_ACCEPTED_LEDGER_ROOT");
    const loadedFiles = new Map<string, unknown>();
    for (const relativePath of Object.keys(E0_ACCEPTED_BYTE_DIGESTS)) {
      if (!relativePath.endsWith(".json")) continue;
      const value: unknown = JSON.parse(
        await readFile(resolve(acceptedRoot, relativePath), "utf8"),
      );
      loadedFiles.set(relativePath, value);
    }
    const fixtureRows = recordsAt(ledgerValue["fixtures"]);
    const fixturesById = new Map<string, JsonObject>();
    for (const fixture of fixtureRows) {
      if (typeof fixture["id"] === "string") {
        fixturesById.set(fixture["id"], fixture);
      }
    }
    acceptedE0Materialization = {
      ledger: ledgerValue,
      sharedBases: isObject(ledgerValue["sharedBases"])
        ? ledgerValue["sharedBases"]
        : {},
      fixturesById,
      loadedFiles,
    };
  } catch {
    addFinding(
      findings,
      "BRIDGE_ACCEPTED_E0_LITERAL_AUTHORITY",
      ACCEPTED_E0_INPUT_LEDGER_PATH,
      "The exact accepted E0 v1 input ledger and referenced JSON authorities must be readable and byte-pinned before bridge literals resolve.",
    );
  }

  const contract = loaded.get("a0-e0-bridge-contract.json") ?? {};
  requireExact(
    contract["operationNames"],
    A0_E0_BRIDGE_OWNER_OPERATION_NAMES,
    "BRIDGE_OPERATION_NAMES",
    "a0-e0-bridge-contract.json.operationNames",
    "The owner boundary must expose exactly five operations in contract order.",
    findings,
  );
  if (
    contract["package"] !== "A0 interchange owner ports" ||
    contract["owner"] !== "A0" ||
    contract["ownerLeaf"] !== "jcpe-94yu.1" ||
    contract["prospectiveConsumer"] !== "E0-v2" ||
    contract["semanticBindingLeaf"] !==
      "jcpe-milestone-reliable-studio-l3a.8.4" ||
    contract["semanticBindingStatus"] !==
      "unbound-pending-explicit-project-owner-acceptance" ||
    contract["productionImplementationAvailableWhenAuthored"] !== false ||
    contract["productionOutputUsedAsOracle"] !== false ||
    contract["expectedValuesGenerated"] !== false
  ) {
    addFinding(
      findings,
      "BRIDGE_BOUNDARY_CLAIM",
      "a0-e0-bridge-contract.json",
      "The packet must remain an unbound A0-only proposal for a separately accepted E0 v2 and claim no production or generated oracle.",
    );
  }

  const ports = isObject(contract["ports"]) ? contract["ports"] : {};
  requireExact(
    Object.keys(ports),
    A0_E0_BRIDGE_OWNER_OPERATION_NAMES,
    "BRIDGE_PORT_KEYS",
    "a0-e0-bridge-contract.json.ports",
    "The exact five operation records must be present in declaration order.",
    findings,
  );
  for (const operation of A0_E0_BRIDGE_OWNER_OPERATION_NAMES) {
    const port = isObject(ports[operation]) ? ports[operation] : {};
    if (port["synchronous"] !== true || typeof port["authority"] !== "string") {
      addFinding(
        findings,
        "BRIDGE_PORT_SYNCHRONOUS",
        `a0-e0-bridge-contract.json.ports.${operation}`,
        "Each owner operation is synchronous and names its controller authority.",
      );
    }
    if (
      operation === "discardImportReplacementPublication"
        ? port["consumerReturn"] !==
            "DiscardImportReplacementPublicationResult" ||
          port["typedProducerRefusal"] !== false ||
          port["consumerRawResultRequiresValidation"] !== false
        : port["consumerReturn"] !== "unknown" ||
          port["consumerRawResultRequiresValidation"] !== true ||
          port["typedProducerRefusal"] !==
            (operation !== "readCurrentApplicationDocumentIdentity")
    ) {
      addFinding(
        findings,
        "BRIDGE_PORT_RETURN",
        `a0-e0-bridge-contract.json.ports.${operation}`,
        "Typed producer refusals and raw-result validation are distinct; only total cleanup returns its exact typed result.",
      );
    }
  }
  if (
    sha256(new TextEncoder().encode(stableJson(ports))) !==
    OWNER_PORT_RECORDS_DIGEST
  ) {
    addFinding(
      findings,
      "BRIDGE_PORT_RECORDS",
      "a0-e0-bridge-contract.json.ports",
      "All five port timing, producer, consumer-validation, return, and authority fields are exactly pinned.",
    );
  }

  const registry = isObject(contract["replacementRegistry"])
    ? contract["replacementRegistry"]
    : {};
  requireExact(
    registry,
    {
      keyFields: ["requestId", "documentId", "baseRevision"],
      maximumLiveEntries: 1,
      states: ["empty", "prepared"],
      allocateOnlyAfterAllFallibleChecks: true,
      discardUsesOriginalRequestIdentity: true,
      discardIsTotalSynchronousIdempotentNonthrowing: true,
      publishConsumesBeforeReturning: true,
      replayAndStructuralLookalikeRefused: true,
      terminalLiveForRequest: 0,
    },
    "BRIDGE_REGISTRY",
    "a0-e0-bridge-contract.json.replacementRegistry",
    "The private replacement registry lifecycle changed.",
    findings,
  );

  const markerCas = isObject(contract["markerCas"])
    ? contract["markerCas"]
    : {};
  requireExact(
    markerCas["orderedSteps"],
    [
      "validate-publication-envelope",
      "read-controller-current-state",
      "compare-document-id-and-revision",
      "replace-exportRevision-only",
      "install-current-state",
      "notify-after-install",
    ],
    "BRIDGE_MARKER_ORDER",
    "a0-e0-bridge-contract.json.markerCas.orderedSteps",
    "The atomic marker critical-section order changed.",
    findings,
  );
  if (
    markerCas["awaitBetweenCompareAndWriteAllowed"] !== false ||
    markerCas["historicalStateSpreadAllowed"] !== false ||
    markerCas["successAndRefusalAreStateFree"] !== true ||
    stringsAt(markerCas["preservedFields"]).length !== 15
  ) {
    addFinding(
      findings,
      "BRIDGE_MARKER_LAWS",
      "a0-e0-bridge-contract.json.markerCas",
      "Marker CAS must be state-free, await-free, historical-spread-free, and preserve all fifteen unrelated fields.",
    );
  }
  requireExact(
    contract["coverageFamilies"],
    COVERAGE_FAMILIES,
    "BRIDGE_COVERAGE_FAMILIES",
    "a0-e0-bridge-contract.json.coverageFamilies",
    "Every required bridge proof family must stay explicit.",
    findings,
  );

  const latestIdentity = isObject(contract["latestIdentity"])
    ? contract["latestIdentity"]
    : {};
  requireExact(
    latestIdentity,
    {
      fields: ["documentId", "revision"],
      source: "controller-closure-current-AppState-at-call-time",
      promiseAllowed: false,
      callerSnapshotAllowed: false,
      selectorCacheAllowed: false,
    },
    "BRIDGE_LATEST_IDENTITY",
    "a0-e0-bridge-contract.json.latestIdentity",
    "Latest identity must be an exact synchronous call-time controller read.",
    findings,
  );

  requireExact(
    contract["ownerStateIsolationAndVersionBoundary"],
    {
      AppStateAllowedInOwnerRequest: false,
      AppStateAllowedInOwnerResult: false,
      stateFieldAllowedInOwnerResult: false,
      observedBeforeFieldAllowedAcrossOwnerPort: false,
      publicAsyncE0ResultPolicySpecifiedByThisLeaf: false,
      acceptedE0V1PublicAsyncResultsContainAppState: true,
      acceptedE0V1PublicationProtocolFailureContainsLastKnownState: true,
    },
    "BRIDGE_STATE_ISOLATION",
    "a0-e0-bridge-contract.json.ownerStateIsolationAndVersionBoundary",
    "The owner boundary is state-free without rewriting accepted E0 v1's state-bearing public results.",
    findings,
  );

  const versionBoundary = isObject(contract["acceptedE0V1VersionBoundary"])
    ? contract["acceptedE0V1VersionBoundary"]
    : {};
  if (
    versionBoundary["acceptedVersion"] !== "E0-v1" ||
    versionBoundary["acceptedCommit"] !==
      "a91b5bc5e70c2bf40dff97211d3c0f4ba63f58fd" ||
    versionBoundary["acceptanceRecord"] !==
      "docs/evidence/E0_GOLDEN_PACKET_REVIEW.md" ||
    versionBoundary["archivalAuthorityStatus"] !==
      "immutable-accepted-by-project-owner" ||
    versionBoundary["bridgeMayReinterpret"] !== false ||
    versionBoundary["bridgeMaySupersede"] !== false ||
    versionBoundary["bridgeMayAmend"] !== false ||
    versionBoundary["semanticCompatibilityClaim"] !== false ||
    versionBoundary["semanticBindingLeaf"] !==
      "jcpe-milestone-reliable-studio-l3a.8.4" ||
    versionBoundary["semanticBindingRequiresExplicitProjectOwnerAcceptance"] !==
      true
  ) {
    addFinding(
      findings,
      "BRIDGE_E0_V1_VERSION_BOUNDARY",
      "a0-e0-bridge-contract.json.acceptedE0V1VersionBoundary",
      "Accepted E0 v1 must remain immutable archival authority with no reinterpretation, supersession, amendment, or compatibility claim.",
    );
  }
  requireExact(
    versionBoundary["immutableAuthorityClasses"],
    ["documentation", "source", "validator", "tests", "support", "fixtures", "review"],
    "BRIDGE_E0_V1_AUTHORITY_CLASSES",
    "a0-e0-bridge-contract.json.acceptedE0V1VersionBoundary.immutableAuthorityClasses",
    "All seven accepted E0 v1 authority classes must remain explicit.",
    findings,
  );
  requireExact(
    versionBoundary["immutableArtifactPins"],
    ACCEPTED_E0_V1_ARTIFACT_PINS,
    "BRIDGE_E0_V1_ARTIFACT_PINS",
    "a0-e0-bridge-contract.json.acceptedE0V1VersionBoundary.immutableArtifactPins",
    "The seven accepted E0 v1 non-fixture artifacts must remain exactly pinned.",
    findings,
  );

  const conflicts = recordsAt(contract["acceptedE0V1ConflictInventory"]);
  requireExact(
    conflicts.map((conflict) => conflict["id"]),
    ACCEPTED_E0_V1_CONFLICT_IDS,
    "BRIDGE_E0_V1_CONFLICT_INVENTORY",
    "a0-e0-bridge-contract.json.acceptedE0V1ConflictInventory",
    "The complete nine-item unresolved E0 v1 semantic conflict inventory is mandatory.",
    findings,
  );
  for (const conflict of conflicts) {
    if (conflict["status"] !== "unresolved-versioned-semantic-delta") {
      addFinding(
        findings,
        "BRIDGE_E0_V1_CONFLICT_STATUS",
        `a0-e0-bridge-contract.json.acceptedE0V1ConflictInventory.${String(conflict["id"])}`,
        "Every conflict remains unresolved until the separately accepted E0 v2 amendment.",
      );
    }
  }
  if (
    sha256(new TextEncoder().encode(stableJson(conflicts))) !==
    ACCEPTED_E0_V1_CONFLICT_INVENTORY_DIGEST
  ) {
    addFinding(
      findings,
      "BRIDGE_E0_V1_CONFLICT_DETAIL",
      "a0-e0-bridge-contract.json.acceptedE0V1ConflictInventory",
      "Every accepted-v1 and proposed-owner field, type, refusal, count, and unresolved disposition in the nine-item inventory is pinned.",
    );
  }

  requireExact(
    contract["proofRequirements"],
    {
      literalBeforeRequestResultAfter: true,
      fullStateReferencesMustResolveToValidatedLiterals: true,
      computedBeforeAfterDiffMustEqualDeclaredExactDelta: true,
      exactRegistryTransitionSequenceRequired: true,
      preparedRegistryMustContainCompletePrecomputedPublicationMaterial: true,
      literalEventOrderRequired: true,
      completeExactWorkCountersRequired: true,
      baseTransposedAndInverseHashesRequired: true,
      manualAndFrozenPitchBytesRequired: true,
      literalMutationBaselineAndChangedObservationsRequired: true,
      mutationTargetAndDerivedObservationMustBeDistinct: true,
      mutationObservationMustBeIndependentlyRecomputed: true,
      mutationKillerFixtureMayServeAsItsOwnOracle: false,
      forwardE0V2RowsExcludedFromA0OwnerProof: true,
      proseOrBareIdsAreProof: false,
    },
    "BRIDGE_PROOF_REQUIREMENTS",
    "a0-e0-bridge-contract.json.proofRequirements",
    "Literal proof requirements must remain complete and reject prose substitutes.",
    findings,
  );

  const cases = loaded.get("owner-port-cases.json") ?? {};
  const replacementCases = recordsAt(cases["replacementCases"]);
  const identityCases = recordsAt(cases["identityCases"]);
  const markerCases = recordsAt(cases["markerCases"]);
  const applicabilityRows = recordsAt(cases["applicabilityMatrix"]);
  const allCases = [...replacementCases, ...identityCases, ...markerCases];
  const caseById = indexById(allCases, "owner-port-cases", findings);

  const controlsRoot = loaded.get("mutation-controls.json") ?? {};
  const controls = recordsAt(controlsRoot["controls"]);
  const controlById = indexById(controls, "mutation-controls", findings);
  const traceRoot = loaded.get("trace-ledger.json") ?? {};
  const traces = recordsAt(traceRoot["traces"]);
  const traceById = indexById(traces, "trace-ledger", findings);
  const provenance = loaded.get("provenance-ledger.json") ?? {};
  const authorities = recordsAt(provenance["authorities"]);
  const authorityById = indexById(authorities, "provenance-ledger", findings);

  const literalCatalog = isObject(cases["literalCatalog"])
    ? cases["literalCatalog"]
    : {};
  const materializedCatalog = new Map<string, unknown>();
  const literalContext: BridgeLiteralContext = {
    catalog: literalCatalog,
    acceptedE0: acceptedE0Materialization,
    cache: materializedCatalog,
  };
  type DocumentValidationObservation = Readonly<{
    stage: "accepted" | "f2-refused" | "f2-repaired" | "f3-refused" | "f3-repaired";
    code: string | null;
  }>;
  const documentValidationCache = new Map<
    string,
    DocumentValidationObservation
  >();
  const acceptedE0DocumentObjects = new WeakSet<object>();
  const realValidatedDocumentObjects = new WeakSet<object>();
  let f2DocumentValidationCalls = 0;
  let f3DocumentValidationCalls = 0;
  let expectedAcceptedDocumentOccurrences = 0;
  let acceptedE0AuthorityDocumentOccurrences = 0;
  const observeDocumentValidation = (
    document: unknown,
  ): DocumentValidationObservation => {
    expectedAcceptedDocumentOccurrences += 1;
    if (isObject(document) && acceptedE0DocumentObjects.has(document)) {
      acceptedE0AuthorityDocumentOccurrences += 1;
      return { stage: "accepted", code: null };
    }
    if (isObject(document) && realValidatedDocumentObjects.has(document)) {
      return { stage: "accepted", code: null };
    }
    const canonical = stableJson(document);
    const cached = documentValidationCache.get(canonical);
    if (cached !== undefined) {
      if (cached.stage === "accepted" && isObject(document)) {
        realValidatedDocumentObjects.add(document);
      }
      return cached;
    }
    f2DocumentValidationCalls += 1;
    const decoded = decodeDocumentShape(document);
    if (!decoded.ok) {
      const observation: DocumentValidationObservation = {
        stage: "f2-refused",
        code: decoded.errors[0]?.code ?? "unknown",
      };
      documentValidationCache.set(canonical, observation);
      return observation;
    }
    if (!jsonDeepEqual(decoded.value, document)) {
      const observation: DocumentValidationObservation = {
        stage: "f2-repaired",
        code: null,
      };
      documentValidationCache.set(canonical, observation);
      return observation;
    }
    f3DocumentValidationCalls += 1;
    const validated = validateDocumentSemantics(decoded.value);
    if (!validated.ok) {
      const observation: DocumentValidationObservation = {
        stage: "f3-refused",
        code: validated.errors[0]?.code ?? "unknown",
      };
      documentValidationCache.set(canonical, observation);
      return observation;
    }
    if (!jsonDeepEqual(validated.value, document)) {
      const observation: DocumentValidationObservation = {
        stage: "f3-repaired",
        code: null,
      };
      documentValidationCache.set(canonical, observation);
      return observation;
    }
    const observation: DocumentValidationObservation = {
      stage: "accepted",
      code: null,
    };
    documentValidationCache.set(canonical, observation);
    if (isObject(document)) realValidatedDocumentObjects.add(document);
    return observation;
  };
  const assertAcceptedDocument = (document: unknown, path: string): void => {
    const observation = observeDocumentValidation(document);
    if (observation.stage !== "accepted") {
      throw new Error(
        `BRIDGE_DOCUMENT_${observation.stage.toUpperCase()}:${observation.code ?? "none"}:${path}`,
      );
    }
  };
  const assertNestedAcceptedDocuments = (
    value: unknown,
    path: string,
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        assertNestedAcceptedDocuments(item, `${path}/${String(index)}`),
      );
      return;
    }
    if (!isObject(value)) return;
    if (value["schema"] === "changes.progression.v2") {
      assertAcceptedDocument(value, path);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      assertNestedAcceptedDocuments(child, `${path}/${key}`);
    }
  };
  const markAcceptedE0Documents = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(markAcceptedE0Documents);
      return;
    }
    if (!isObject(value)) return;
    if (value["schema"] === "changes.progression.v2") {
      acceptedE0DocumentObjects.add(value);
      return;
    }
    Object.values(value).forEach(markAcceptedE0Documents);
  };
  for (const [literalId, entryValue] of Object.entries(literalCatalog)) {
    if (!isObject(entryValue)) {
      addFinding(
        findings,
        "BRIDGE_LITERAL_ENTRY",
        `owner-port-cases.json.literalCatalog.${literalId}`,
        "Every catalog entry must be a typed inline literal or an exact accepted-E0-v1 reference.",
      );
      continue;
    }
    try {
      const materialized = materializeBridgeLiteral(literalId, literalContext);
      materializedCatalog.set(literalId, materialized);
      const materializeAs = entryValue["materializeAs"];
      if (typeof materializeAs !== "string" || materializeAs.length === 0) {
        throw new Error("BRIDGE_LITERAL_MATERIALIZE_AS");
      }
      if (materializeAs === "AppState" && !isFullAppStateLiteral(materialized)) {
        throw new Error("BRIDGE_LITERAL_APP_STATE");
      }
      if (
        materializeAs === "ValidatedDocument" &&
        !isCompleteDocumentLiteral(materialized)
      ) {
        throw new Error("BRIDGE_LITERAL_DOCUMENT");
      }
      if (
        entryValue["kind"] === "accepted-e0-v1-reference" &&
        recordsAt(entryValue["materializationPatches"]).length === 0
      ) {
        markAcceptedE0Documents(materialized);
      }
      if (materializeAs === "AppState" || materializeAs === "ValidatedDocument") {
        assertNestedAcceptedDocuments(
          materialized,
          `literalCatalog/${literalId}`,
        );
      }
      if (materializeAs === "PrivateImportReplacementRegistry") {
        const registryLiteral = isObject(materialized) ? materialized : {};
        const entries = registryLiteral["entries"];
        if (
          registryLiteral["capacity"] !== 1 ||
          !Array.isArray(entries) ||
          entries.length > 1 ||
          entries.some(
            (item) =>
              !isObject(item) ||
              !isObject(item["key"]) ||
              typeof item["key"]["requestId"] !== "number" ||
              typeof item["key"]["documentId"] !== "string" ||
              typeof item["key"]["baseRevision"] !== "number",
          )
        ) {
          throw new Error("BRIDGE_LITERAL_REGISTRY");
        }
      }
      const canonicalBytes = new TextEncoder().encode(stableJson(materialized));
      if (
        Object.hasOwn(entryValue, "expectedCanonicalMaterializedSha256") &&
        entryValue["expectedCanonicalMaterializedSha256"] !==
          sha256(canonicalBytes)
      ) {
        throw new Error("BRIDGE_LITERAL_CANONICAL_SHA");
      }
      if (
        Object.hasOwn(entryValue, "expectedCanonicalMaterializedByteLength") &&
        entryValue["expectedCanonicalMaterializedByteLength"] !==
          canonicalBytes.byteLength
      ) {
        throw new Error("BRIDGE_LITERAL_CANONICAL_LENGTH");
      }
    } catch (error) {
      addFinding(
        findings,
        "BRIDGE_LITERAL_MATERIALIZATION",
        `owner-port-cases.json.literalCatalog.${literalId}`,
        `Literal must resolve deterministically from exact checked-in bytes and validate as its declared type (${error instanceof Error ? error.message : "unknown"}).`,
      );
    }
  }

  const transpositionWitness = isObject(cases["transpositionWitness"])
    ? cases["transpositionWitness"]
    : {};
  const sourceWitness = isObject(transpositionWitness["source"])
    ? transpositionWitness["source"]
    : {};
  const targetWitness = isObject(transpositionWitness["target"])
    ? transpositionWitness["target"]
    : {};
  const pitchText = (value: unknown): string | null => {
    if (!isObject(value)) return null;
    const step = value["step"];
    const alter = value["alter"];
    const octave = value["octave"];
    if (
      typeof step !== "string" ||
      typeof alter !== "number" ||
      typeof octave !== "number"
    ) {
      return null;
    }
    const accidental =
      alter === -2 ? "bb" : alter === -1 ? "b" : alter === 0 ? "" : alter === 1 ? "#" : alter === 2 ? "##" : null;
    return accidental === null ? null : `${step}${accidental}${String(octave)}`;
  };
  const collectVoicingWitness = (document: unknown) => {
    const sourceTexts: string[] = [];
    const manualPitches: string[] = [];
    const frozenPitches: string[] = [];
    if (!isObject(document)) return { sourceTexts, manualPitches, frozenPitches };
    for (const section of recordsAt(document["sections"])) {
      for (const measure of recordsAt(section["measures"])) {
        for (const event of recordsAt(measure["events"])) {
          const voicing = isObject(event["voicing"]) ? event["voicing"] : {};
          if (voicing["mode"] !== "manual" && voicing["mode"] !== "frozen") {
            continue;
          }
          const chord = isObject(event["chord"]) ? event["chord"] : {};
          if (typeof chord["sourceText"] === "string") {
            sourceTexts.push(chord["sourceText"]);
          }
          const target = voicing["mode"] === "manual" ? manualPitches : frozenPitches;
          for (const pitch of recordsAt(voicing["pitches"])) {
            const rendered = pitchText(pitch);
            if (rendered !== null) target.push(rendered);
          }
        }
      }
    }
    return { sourceTexts, manualPitches, frozenPitches };
  };
  try {
    const sourceId = sourceWitness["literalId"];
    const targetId = targetWitness["literalId"];
    if (typeof sourceId !== "string" || typeof targetId !== "string") {
      throw new Error("BRIDGE_TRANSPOSITION_LITERAL_IDS");
    }
    const sourceDocument = materializedCatalog.get(sourceId);
    const targetDocument = materializedCatalog.get(targetId);
    if (
      !isCompleteDocumentLiteral(sourceDocument) ||
      !isCompleteDocumentLiteral(targetDocument)
    ) {
      throw new Error("BRIDGE_TRANSPOSITION_DOCUMENTS");
    }
    const sourceCollected = collectVoicingWitness(sourceDocument);
    const targetCollected = collectVoicingWitness(targetDocument);
    for (const [label, witness, collected] of [
      ["source", sourceWitness, sourceCollected],
      ["target", targetWitness, targetCollected],
    ] as const) {
      requireExact(
        witness["sourceTexts"],
        collected.sourceTexts,
        "BRIDGE_TRANSPOSITION_SOURCE_TEXTS",
        `owner-port-cases.json.transpositionWitness.${label}.sourceTexts`,
        "Transposition source spellings must be extracted from the materialized document.",
        findings,
      );
      requireExact(
        witness["manualPitches"],
        collected.manualPitches,
        "BRIDGE_TRANSPOSITION_MANUAL_PITCHES",
        `owner-port-cases.json.transpositionWitness.${label}.manualPitches`,
        "Manual pitches must be byte-explicit in the transposition witness.",
        findings,
      );
      requireExact(
        witness["frozenPitches"],
        collected.frozenPitches,
        "BRIDGE_TRANSPOSITION_FROZEN_PITCHES",
        `owner-port-cases.json.transpositionWitness.${label}.frozenPitches`,
        "Frozen pitches must be byte-explicit in the transposition witness.",
        findings,
      );
      const expectedBytes = [
        ...collected.sourceTexts,
        collected.manualPitches.join(","),
        collected.frozenPitches.join(","),
      ].join("\n");
      if (
        witness["exactSpellingBytesUtf8"] !== expectedBytes ||
        witness["exactSpellingBytesSha256"] !==
          sha256(new TextEncoder().encode(expectedBytes))
      ) {
        addFinding(
          findings,
          "BRIDGE_TRANSPOSITION_SPELLING_BYTES",
          `owner-port-cases.json.transpositionWitness.${label}`,
          "Source text plus Manual/Frozen pitch bytes and SHA-256 must match the materialized document exactly.",
        );
      }
    }
    const sourceEntry = literalCatalog[sourceId];
    const targetEntry = literalCatalog[targetId];
    if (!isObject(sourceEntry) || !isObject(targetEntry)) {
      throw new Error("BRIDGE_TRANSPOSITION_CATALOG");
    }
    const sourceBytes = new TextEncoder().encode(stableJson(sourceDocument));
    const targetBytes = new TextEncoder().encode(stableJson(targetDocument));
    if (
      sourceWitness["acceptedPrettyFileSha256"] !== sourceEntry["sha256"] ||
      sourceWitness["canonicalMaterializedSha256"] !== sha256(sourceBytes) ||
      sourceWitness["canonicalMaterializedByteLength"] !==
        sourceBytes.byteLength ||
      sourceEntry["expectedCanonicalMaterializedSha256"] !==
        sha256(sourceBytes) ||
      sourceEntry["expectedCanonicalMaterializedByteLength"] !==
        sourceBytes.byteLength ||
      targetWitness["canonicalMaterializedSha256"] !== sha256(targetBytes) ||
      targetWitness["canonicalMaterializedByteLength"] !==
        targetBytes.byteLength ||
      targetEntry["expectedCanonicalMaterializedSha256"] !==
        sha256(targetBytes) ||
      targetEntry["expectedCanonicalMaterializedByteLength"] !==
        targetBytes.byteLength ||
      stableJson(transpositionWitness["targetMaterializationPatches"]) !==
        stableJson(targetEntry["materializationPatches"])
    ) {
      throw new Error("BRIDGE_TRANSPOSITION_HASHES");
    }
    const computedInverse = reverseReplacementPatches(
      targetDocument,
      targetEntry["materializationPatches"],
      literalContext,
    );
    const declaredInverse = applyBridgePatches(
      targetDocument,
      targetEntry["inverseMaterializationPatches"],
      literalContext,
      targetDocument,
    );
    const inverseBytes = new TextEncoder().encode(stableJson(declaredInverse));
    const inverseWitness = isObject(
      transpositionWitness["inverseTargetToSource"],
    )
      ? transpositionWitness["inverseTargetToSource"]
      : {};
    if (
      stableJson(computedInverse) !== stableJson(sourceDocument) ||
      stableJson(declaredInverse) !== stableJson(sourceDocument) ||
      targetEntry["expectedInverseEqualsLiteralId"] !== sourceId ||
      targetEntry["expectedInverseMaterializedSha256"] !== sha256(inverseBytes) ||
      targetEntry["expectedInverseMaterializedByteLength"] !==
        inverseBytes.byteLength ||
      inverseWitness["targetLiteralId"] !== targetId ||
      inverseWitness["inversePatchList"] !==
        `literalCatalog.${targetId}.inverseMaterializationPatches` ||
      inverseWitness["expectedCanonicalMaterializedSha256"] !==
        sha256(inverseBytes) ||
      inverseWitness["expectedCanonicalMaterializedByteLength"] !==
        inverseBytes.byteLength ||
      inverseWitness["expectedEqualsLiteralId"] !== sourceId ||
      inverseWitness["compareHashTo"] !==
        "transpositionWitness.source.canonicalMaterializedSha256" ||
      inverseWitness["compareByteLengthTo"] !==
        "transpositionWitness.source.canonicalMaterializedByteLength"
    ) {
      throw new Error("BRIDGE_TRANSPOSITION_INVERSE");
    }
    requireExact(
      transpositionWitness["ownerDecisionInvariant"],
      {
        prepareSource: "prepared-one-live-entry",
        prepareTarget: "prepared-one-live-entry",
        publishSource: "committed-live-zero",
        publishTarget: "committed-live-zero",
      },
      "BRIDGE_TRANSPOSITION_DECISION",
      "owner-port-cases.json.transpositionWitness.ownerDecisionInvariant",
      "Source and target decisions remain invariant.",
      findings,
    );
  } catch (error) {
    addFinding(
      findings,
      "BRIDGE_TRANSPOSITION_WITNESS",
      "owner-port-cases.json.transpositionWitness",
      `Transposition requires literal documents, hashes, Manual/Frozen bytes, and executable inverse equality (${error instanceof Error ? error.message : "unknown"}).`,
    );
  }

  const runById = new Map<string, MaterializedRunProjection>();
  let a0OwnerProofCaseCount = 0;
  let excludedForwardE0V2CaseCount = 0;
  for (const record of allCases) {
    const caseId = String(record["id"]);
    const expectedE0V2Owned = E0_V2_OWNED_CASE_IDS.has(caseId);
    if (
      record["ownerProof"] !== !expectedE0V2Owned ||
      record["e0V2Owned"] !== expectedE0V2Owned
    ) {
      addFinding(
        findings,
        "BRIDGE_CASE_PROOF_OWNER",
        `owner-port-cases.json.${caseId}`,
        "Exactly six future-consumer normalization cases are excluded; every other case is A0 owner proof.",
      );
    }
    if (expectedE0V2Owned) excludedForwardE0V2CaseCount += 1;
    else a0OwnerProofCaseCount += 1;
    const runs = recordsAt(record["runs"]);
    if (runs.length === 0) {
      addFinding(
        findings,
        "BRIDGE_CASE_RUNS",
        `owner-port-cases.json.${caseId}.runs`,
        "Every case must carry at least one literal executable run.",
      );
    }
    for (const run of runs) {
      const runId = run["id"];
      const fullRunId = `${caseId}/${String(runId)}`;
      try {
        const runRole =
          run["runRole"] === undefined ? "conformance" : run["runRole"];
        if (
          typeof runId !== "string" ||
          (runRole !== "conformance" && runRole !== "mutation-killer") ||
          (runRole === "mutation-killer" && expectedE0V2Owned) ||
          run["ownerProof"] !== !expectedE0V2Owned ||
          run["e0V2Owned"] !== expectedE0V2Owned
        ) {
          throw new Error("BRIDGE_RUN_OWNER");
        }
        const before = materializeDescriptor(
          run["controllerStateBefore"],
          literalContext,
        );
        const after = materializeDescriptor(
          run["controllerStateAfter"],
          literalContext,
        );
        if (!isFullAppStateLiteral(before) || !isFullAppStateLiteral(after)) {
          throw new Error("BRIDGE_RUN_APP_STATE");
        }
        const registryBefore = materializeDescriptor(
          run["registryBefore"],
          literalContext,
          before,
        );
        const registryAfter = materializeDescriptor(
          run["registryAfter"],
          literalContext,
          after,
        );
        for (const registryValue of [registryBefore, registryAfter]) {
          if (
            !isObject(registryValue) ||
            registryValue["capacity"] !== 1 ||
            !Array.isArray(registryValue["entries"]) ||
            registryValue["entries"].length > 1
          ) {
            throw new Error("BRIDGE_RUN_REGISTRY");
          }
        }
        const rawCallValue = run["rawCall"];
        if (!isObject(rawCallValue)) throw new Error("BRIDGE_RUN_RAW_CALL");
        const argumentDescriptors = Array.isArray(rawCallValue["arguments"])
          ? rawCallValue["arguments"]
          : [];
        const rawCall: JsonObject = {
          target: rawCallValue["target"],
          operation: rawCallValue["operation"],
          invocation: rawCallValue["invocation"],
          arguments: argumentDescriptors.map((argument) =>
            materializeDescriptor(argument, literalContext, before),
          ),
        };
        if (
          (runRole === "conformance" &&
            rawCall["invocation"] !== "synchronous") ||
          (!expectedE0V2Owned &&
            runRole === "conformance" &&
            (rawCall["target"] !== "A0E0InterchangeOwnerOperations" ||
              rawCall["operation"] !== record["operation"]))
        ) {
          throw new Error("BRIDGE_RUN_CALL_TARGET");
        }
        const exactTypedResult = materializeDescriptor(
          run["exactTypedResult"],
          literalContext,
          after,
        );
        if (
          !expectedE0V2Owned &&
          runRole === "conformance" &&
          containsForbiddenStateKey(exactTypedResult)
        ) {
          throw new Error("BRIDGE_RUN_OWNER_RESULT_STATE");
        }
        const resultRecord = isObject(exactTypedResult)
          ? exactTypedResult
          : {};
        if (
          runRole === "conformance" &&
          Object.hasOwn(resultRecord, "liveForRequest") &&
          resultRecord["liveForRequest"] !== 0
        ) {
          throw new Error("BRIDGE_RUN_LIVE_FOR_REQUEST");
        }
        let mutationProbe: JsonObject | null = null;
        if (runRole === "mutation-killer") {
          const rawProbe = run["mutationProbe"];
          if (!isObject(rawProbe)) throw new Error("BRIDGE_RUN_MUTATION_PROBE");
          const downstreamObservation = isObject(
            rawProbe["downstreamObservation"],
          )
            ? rawProbe["downstreamObservation"]
            : null;
          const expectedOwnerLaw = isObject(rawProbe["expectedOwnerLaw"])
            ? rawProbe["expectedOwnerLaw"]
            : null;
          if (
            stableJson(Object.keys(rawProbe).sort(codeUnitCompare)) !==
              stableJson([
                "baselineLaw",
                "baselineRunId",
                "downstreamObservation",
                "expectedOwnerLaw",
                "mutatedLaw",
                "sourceMaterialization",
              ]) ||
            typeof rawProbe["baselineRunId"] !== "string" ||
            typeof rawProbe["sourceMaterialization"] !== "string" ||
            downstreamObservation === null ||
            stableJson(
              Object.keys(downstreamObservation).sort(codeUnitCompare),
            ) !==
              stableJson([
                "baselineValue",
                "jsonPointer",
                "killerValue",
                "materialization",
              ]) ||
            typeof downstreamObservation["materialization"] !== "string" ||
            typeof downstreamObservation["jsonPointer"] !== "string" ||
            expectedOwnerLaw === null ||
            (expectedOwnerLaw["outcome"] !== "pass" &&
              expectedOwnerLaw["outcome"] !== "killed") ||
            (expectedOwnerLaw["outcome"] === "pass"
              ? stableJson(expectedOwnerLaw) !== stableJson({ outcome: "pass" })
              : typeof expectedOwnerLaw["code"] !== "string" ||
                stableJson(Object.keys(expectedOwnerLaw).sort(codeUnitCompare)) !==
                  stableJson(["code", "outcome"]))
          ) {
            throw new Error("BRIDGE_RUN_MUTATION_PROBE_SHAPE");
          }
          mutationProbe = {
            baselineRunId: rawProbe["baselineRunId"],
            sourceMaterialization: rawProbe["sourceMaterialization"],
            baselineLaw: materializeBridgeTemplate(
              rawProbe["baselineLaw"],
              literalContext,
              before,
              new Set(),
            ),
            mutatedLaw: materializeBridgeTemplate(
              rawProbe["mutatedLaw"],
              literalContext,
              before,
              new Set(),
            ),
            downstreamObservation: materializeBridgeTemplate(
              downstreamObservation,
              literalContext,
              before,
              new Set(),
            ),
            expectedOwnerLaw: materializeBridgeTemplate(
              expectedOwnerLaw,
              literalContext,
              before,
              new Set(),
            ),
          };
        } else if (run["mutationProbe"] !== undefined && run["mutationProbe"] !== null) {
          throw new Error("BRIDGE_RUN_CONFORMANCE_MUTATION_PROBE");
        }
        for (const [projectionName, projectionValue] of [
          ["controllerStateBefore", before],
          ["controllerStateAfter", after],
          ["registryBefore", registryBefore],
          ["registryAfter", registryAfter],
          ["exactTypedResult", exactTypedResult],
        ] as const) {
          assertNestedAcceptedDocuments(
            projectionValue,
            `${fullRunId}/${projectionName}`,
          );
        }
        const exactCounters = run["exactCounters"];
        if (
          !isObject(exactCounters) ||
          stableJson(Object.keys(exactCounters)) !==
            stableJson(EXPECTED_OWNER_RESULT_COUNTER_KEYS) ||
          Object.values(exactCounters).some(
            (value) => !Number.isSafeInteger(value) || Number(value) < 0,
          )
        ) {
          throw new Error("BRIDGE_RUN_COUNTERS");
        }
        const operation = record["operation"];
        if (
          typeof operation !== "string" ||
          (runRole === "conformance" &&
            exactCounters[operation] !== (expectedE0V2Owned ? 0 : 1))
        ) {
          throw new Error("BRIDGE_RUN_OPERATION_COUNTER");
        }
        if (
          runRole === "conformance" &&
          (expectedE0V2Owned
            ? exactCounters["e0V2ConsumerNormalizer"] !== 1
            : exactCounters["e0V2ConsumerNormalizer"] !== 0)
        ) {
          throw new Error("BRIDGE_RUN_E0_V2_COUNTER");
        }
        const eventOrder = stringsAt(run["synchronousEventOrder"]);
        if (
          eventOrder.length === 0 ||
          eventOrder.length !==
            (Array.isArray(run["synchronousEventOrder"])
              ? run["synchronousEventOrder"].length
              : 0) ||
          eventOrder.some((event) => event.length === 0)
        ) {
          throw new Error("BRIDGE_RUN_EVENT_ORDER");
        }
        const workBound = run["workBound"];
        if (
          !isObject(workBound) ||
          typeof workBound["termination"] !== "string" ||
          (runRole === "conformance" &&
            workBound["wallTimeObservedOrUsed"] !== false) ||
          (runRole === "conformance" &&
            workBound["awaitOrMicrotaskBoundariesInsideOperation"] !== 0) ||
          Object.entries(workBound).some(
            ([key, value]) =>
              key.startsWith("maximum") &&
              (!Number.isSafeInteger(value) || Number(value) < 0),
          )
        ) {
          throw new Error("BRIDGE_RUN_WORK_BOUND");
        }
        const historyEstimatorLawInput =
          run["historyEstimatorLawInput"] === undefined
            ? null
            : materializeBridgeTemplate(
                run["historyEstimatorLawInput"],
                literalContext,
                before,
                new Set(),
              );
        const ownerLawFlagsValue =
          run["ownerLawFlags"] === undefined
            ? { historicalStateReinstall: false }
            : materializeBridgeTemplate(
                run["ownerLawFlags"],
                literalContext,
                before,
                new Set(),
              );
        if (
          !isObject(ownerLawFlagsValue) ||
          stableJson(Object.keys(ownerLawFlagsValue).sort(codeUnitCompare)) !==
            stableJson(["historicalStateReinstall"]) ||
          typeof ownerLawFlagsValue["historicalStateReinstall"] !== "boolean"
        ) {
          throw new Error("BRIDGE_RUN_OWNER_LAW_FLAGS");
        }
        const ownerLawOracle =
          rawCall["target"] !== "A0E0InterchangeOwnerOperations"
            ? {
                outcome: "killed",
                code: "BRIDGE_OWNER_LAW_RAW_DISPATCH_FORBIDDEN",
              }
            : rawCall["invocation"] !== "synchronous"
              ? {
                  outcome: "killed",
                  code: "BRIDGE_OWNER_LAW_IDENTITY_SYNC_REQUIRED",
                }
              : ownerLawFlagsValue["historicalStateReinstall"] === true
                ? {
                    outcome: "killed",
                    code: "BRIDGE_OWNER_LAW_HISTORICAL_REINSTALL_FORBIDDEN",
                  }
                : workBound["awaitOrMicrotaskBoundariesInsideOperation"] !== 0
                  ? {
                      outcome: "killed",
                      code: "BRIDGE_OWNER_LAW_MARKER_AWAIT_FORBIDDEN",
                    }
                  : workBound["wallTimeObservedOrUsed"] !== false
                    ? {
                        outcome: "killed",
                        code: "BRIDGE_OWNER_LAW_WALL_TIME_FORBIDDEN",
                      }
                    : { outcome: "pass", code: null };

        let deltaApplied = before;
        const deltas = recordsAt(run["exactControllerStateDelta"]);
        const materializedDeltas: JsonObject[] = [];
        if (
          deltas.length !==
          (Array.isArray(run["exactControllerStateDelta"])
            ? run["exactControllerStateDelta"].length
            : 0)
        ) {
          throw new Error("BRIDGE_RUN_STATE_DELTA_ARRAY");
        }
        const deltaPointers = new Set<string>();
        for (const delta of deltas) {
          if (
            delta["op"] !== "replace" ||
            typeof delta["jsonPointer"] !== "string" ||
            stableJson(delta["from"]) === stableJson(delta["to"]) ||
            (Object.hasOwn(delta, "exactChangedFieldCount") &&
              delta["exactChangedFieldCount"] !== 1) ||
            deltaPointers.has(delta["jsonPointer"])
          ) {
            throw new Error("BRIDGE_RUN_STATE_DELTA");
          }
          deltaPointers.add(delta["jsonPointer"]);
          const materializedFrom = materializePatchValue(
            delta["from"],
            literalContext,
            deltaApplied,
          );
          const materializedTo = materializePatchValue(
            delta["to"],
            literalContext,
            deltaApplied,
          );
          const materializedValue = materializePatchValue(
            delta["value"],
            literalContext,
            deltaApplied,
          );
          if (stableJson(materializedTo) !== stableJson(materializedValue)) {
            throw new Error("BRIDGE_RUN_STATE_DELTA_TO_VALUE");
          }
          if (stableJson(materializedFrom) === stableJson(materializedTo)) {
            throw new Error("BRIDGE_RUN_STATE_DELTA_NOOP");
          }
          materializedDeltas.push({
            op: "replace",
            jsonPointer: delta["jsonPointer"],
            from: materializedFrom,
            to: materializedTo,
            value: materializedValue,
          });
          deltaApplied = applyPointerMutation(
            deltaApplied,
            "replace",
            delta["jsonPointer"],
            materializedFrom,
            materializedTo,
          );
        }
        if (!jsonDeepEqual(deltaApplied, after)) {
          throw new Error("BRIDGE_RUN_STATE_DELTA_RESULT");
        }

        const phaseFieldNames = [
          "postReturnExternalEdit",
          "lateA1Settlement",
          "scenarioTotals",
        ] as const;
        let scenarioFinalState: unknown = null;
        if (fullRunId === "BRIDGE-MARK-010/marker-10") {
          const externalEdit = isObject(run["postReturnExternalEdit"])
            ? run["postReturnExternalEdit"]
            : null;
          const lateSettlement = isObject(run["lateA1Settlement"])
            ? run["lateA1Settlement"]
            : null;
          const scenarioTotals = isObject(run["scenarioTotals"])
            ? run["scenarioTotals"]
            : null;
          if (
            externalEdit === null ||
            lateSettlement === null ||
            scenarioTotals === null ||
            stableJson(Object.keys(externalEdit).sort(codeUnitCompare)) !==
              stableJson([
                "actor",
                "controllerStateAfter",
                "controllerStateBefore",
                "exactControllerStateDelta",
                "exactCounters",
              ]) ||
            stableJson(Object.keys(lateSettlement).sort(codeUnitCompare)) !==
              stableJson([
                "controllerStateInstalls",
                "historicalStateReinstall",
                "inputControllerStateLiteralId",
                "listenerCallbacks",
                "resultShape",
              ]) ||
            stableJson(Object.keys(scenarioTotals).sort(codeUnitCompare)) !==
              stableJson(["controllerStateInstalls", "listenerCallbacks"])
          ) {
            throw new Error("BRIDGE_LATE_A1_PHASE_SHAPE");
          }
          const externalBeforeDescriptor = externalEdit[
            "controllerStateBefore"
          ];
          const externalAfterDescriptor = externalEdit[
            "controllerStateAfter"
          ];
          const externalBefore = materializeDescriptor(
            externalBeforeDescriptor,
            literalContext,
          );
          const externalAfter = materializeDescriptor(
            externalAfterDescriptor,
            literalContext,
          );
          assertNestedAcceptedDocuments(
            externalBefore,
            `${fullRunId}/postReturnExternalEdit/controllerStateBefore`,
          );
          assertNestedAcceptedDocuments(
            externalAfter,
            `${fullRunId}/postReturnExternalEdit/controllerStateAfter`,
          );
          if (
            !isFullAppStateLiteral(externalBefore) ||
            !isFullAppStateLiteral(externalAfter) ||
            !jsonDeepEqual(externalBefore, after) ||
            externalEdit["actor"] !==
              "A0-document-command-outside-owner-operation"
          ) {
            throw new Error("BRIDGE_LATE_A1_EXTERNAL_LINK");
          }
          let externalDeltaApplied = externalBefore;
          const externalDeltas = recordsAt(
            externalEdit["exactControllerStateDelta"],
          );
          if (
            externalDeltas.length === 0 ||
            externalDeltas.length !==
              (Array.isArray(externalEdit["exactControllerStateDelta"])
                ? externalEdit["exactControllerStateDelta"].length
                : 0)
          ) {
            throw new Error("BRIDGE_LATE_A1_EXTERNAL_DELTA_ARRAY");
          }
          const externalPointers = new Set<string>();
          for (const delta of externalDeltas) {
            if (
              stableJson(Object.keys(delta).sort(codeUnitCompare)) !==
                stableJson(["from", "jsonPointer", "op", "to", "value"]) ||
              delta["op"] !== "replace" ||
              typeof delta["jsonPointer"] !== "string" ||
              externalPointers.has(delta["jsonPointer"])
            ) {
              throw new Error("BRIDGE_LATE_A1_EXTERNAL_DELTA_SHAPE");
            }
            externalPointers.add(delta["jsonPointer"]);
            const materializedFrom = materializePatchValue(
              delta["from"],
              literalContext,
              externalDeltaApplied,
            );
            const materializedTo = materializePatchValue(
              delta["to"],
              literalContext,
              externalDeltaApplied,
            );
            const materializedValue = materializePatchValue(
              delta["value"],
              literalContext,
              externalDeltaApplied,
            );
            if (
              stableJson(materializedFrom) === stableJson(materializedTo) ||
              stableJson(materializedTo) !== stableJson(materializedValue)
            ) {
              throw new Error("BRIDGE_LATE_A1_EXTERNAL_DELTA_VALUE");
            }
            externalDeltaApplied = applyPointerMutation(
              externalDeltaApplied,
              "replace",
              delta["jsonPointer"],
              materializedFrom,
              materializedTo,
            );
          }
          if (!jsonDeepEqual(externalDeltaApplied, externalAfter)) {
            throw new Error("BRIDGE_LATE_A1_EXTERNAL_DELTA_RESULT");
          }
          scenarioFinalState = externalAfter;
          const externalCounters = isObject(externalEdit["exactCounters"])
            ? externalEdit["exactCounters"]
            : {};
          if (
            stableJson(externalCounters) !==
            stableJson({ controllerStateInstalls: 1, listenerCallbacks: 1 })
          ) {
            throw new Error("BRIDGE_LATE_A1_EXTERNAL_COUNTERS");
          }
          const lateInputLiteralId =
            lateSettlement["inputControllerStateLiteralId"];
          const lateInput =
            typeof lateInputLiteralId === "string"
              ? materializedCatalog.get(lateInputLiteralId)
              : undefined;
          if (
            !isObject(externalAfterDescriptor) ||
            externalAfterDescriptor["literalId"] !== lateInputLiteralId ||
            !jsonDeepEqual(lateInput, externalAfter) ||
            lateSettlement["resultShape"] !== "state-free" ||
            lateSettlement["controllerStateInstalls"] !== 0 ||
            lateSettlement["listenerCallbacks"] !== 0 ||
            lateSettlement["historicalStateReinstall"] !== false
          ) {
            throw new Error("BRIDGE_LATE_A1_SETTLEMENT");
          }
          if (
            scenarioTotals["controllerStateInstalls"] !==
              Number(exactCounters["controllerStateInstalls"]) +
                Number(externalCounters["controllerStateInstalls"]) +
                Number(lateSettlement["controllerStateInstalls"]) ||
            scenarioTotals["listenerCallbacks"] !==
              Number(exactCounters["listenerCallbacks"]) +
                Number(externalCounters["listenerCallbacks"]) +
                Number(lateSettlement["listenerCallbacks"])
          ) {
            throw new Error("BRIDGE_LATE_A1_SCENARIO_TOTALS");
          }
        } else if (
          phaseFieldNames.some(
            (field) => run[field] !== undefined && run[field] !== null,
          )
        ) {
          throw new Error("BRIDGE_LATE_A1_PHASE_UNEXPECTED");
        }
        if (run["scenarioFinalState"] !== undefined) {
          scenarioFinalState = materializeDescriptor(
            run["scenarioFinalState"],
            literalContext,
          );
          if (!isFullAppStateLiteral(scenarioFinalState)) {
            throw new Error("BRIDGE_SCENARIO_FINAL_STATE");
          }
          assertNestedAcceptedDocuments(
            scenarioFinalState,
            `${fullRunId}/scenarioFinalState`,
          );
        }

        const projection: MaterializedRunProjection = {
          caseId,
          runId,
          operation: String(record["operation"]),
          runRole,
          ownerProof: !expectedE0V2Owned,
          e0V2Owned: expectedE0V2Owned,
          rawCall,
          controllerStateBefore: before,
          controllerStateAfter: after,
          registryBefore,
          registryAfter,
          exactTypedResult,
          exactCounters,
          synchronousEventOrder: eventOrder,
          workBound,
          exactControllerStateDelta: materializedDeltas,
          mutationProbe,
          historyEstimatorLawInput,
          ownerLawFlags: ownerLawFlagsValue,
          ownerLawOracle,
          scenarioFinalState,
          comparisonInput: {
            arguments: rawCall["arguments"],
            controllerState: before,
            registry: registryBefore,
          },
        };
        if (runById.has(fullRunId)) throw new Error("BRIDGE_RUN_DUPLICATE");
        runById.set(fullRunId, projection);
      } catch (error) {
        addFinding(
          findings,
          "BRIDGE_LITERAL_RUN",
          `owner-port-cases.json.${fullRunId}`,
          `Run must materialize exact before/request/result/after, registry, counters, events, and work bounds (${error instanceof Error ? error.message : "unknown"}).`,
        );
      }
    }
  }

  requireExact(
    cases["ownerProofSummary"],
    {
      beadId: "jcpe-94yu.1",
      productionImplementationAvailableWhenAuthored: false,
      acceptedE0V1BytesModified: false,
      replacementCaseCount: 30,
      identityCaseCount: 6,
      markerCaseCount: 12,
      a0OwnerProofCaseCount: a0OwnerProofCaseCount,
      excludedForwardE0V2CaseCount: excludedForwardE0V2CaseCount,
      excludedForwardE0V2CaseIds: [...E0_V2_OWNED_CASE_IDS],
      excludedForwardE0V2Rationale:
        "These rows exercise malformed unknown returns or thrown consumer ports. They are preserved only as forward references for jcpe-milestone-reliable-studio-l3a.8.4 and are excluded from every A0 typed-producer proof count and claim.",
      totalRunCount: allCases.reduce(
        (sum, record) => sum + recordsAt(record["runs"]).length,
        0,
      ),
      a0OwnerProofRunCount: allCases.reduce(
        (sum, record) =>
          sum +
          (E0_V2_OWNED_CASE_IDS.has(String(record["id"]))
            ? 0
            : recordsAt(record["runs"]).length),
        0,
      ),
      excludedForwardE0V2RunCount: allCases.reduce(
        (sum, record) =>
          sum +
          (E0_V2_OWNED_CASE_IDS.has(String(record["id"]))
            ? recordsAt(record["runs"]).length
            : 0),
        0,
      ),
    },
    "BRIDGE_OWNER_PROOF_SUMMARY",
    "owner-port-cases.json.ownerProofSummary",
    "The packet must count 42 A0 owner cases and visibly exclude exactly six future E0 v2 consumer cases.",
    findings,
  );

  const assertPreparedPrivatePublication = (
    run: MaterializedRunProjection,
    argument: JsonObject,
    result: JsonObject,
  ): void => {
    const before = isObject(run.controllerStateBefore)
      ? run.controllerStateBefore
      : {};
    const after = isObject(run.controllerStateAfter)
      ? run.controllerStateAfter
      : {};
    const entry = recordsAt(
      isObject(run.registryBefore) ? run.registryBefore["entries"] : undefined,
    )[0];
    const privateMaterial =
      entry !== undefined && isObject(entry["privateMaterial"])
        ? entry["privateMaterial"]
        : null;
    const prepared = isObject(argument["prepared"])
      ? argument["prepared"]
      : null;
    const retirement = isObject(argument["retirement"])
      ? argument["retirement"]
      : null;
    if (
      entry === undefined ||
      privateMaterial === null ||
      prepared === null ||
      retirement === null ||
      stableJson(Object.keys(privateMaterial).sort(codeUnitCompare)) !==
        stableJson([
          "bookmarksAndFocus",
          "candidate",
          "command",
          "disclosedImpact",
          "expectedRetirement",
          "history",
          "publication",
          "validation",
        ]) ||
      stableJson(entry["key"]) !== stableJson(prepared["identity"]) ||
      stableJson(entry["preparedEcho"]) !== stableJson(prepared) ||
      stableJson(privateMaterial["expectedRetirement"]) !==
        stableJson(retirement)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_ENVELOPE");
    }

    const matchingPreparations = [...runById.values()].filter(
      (candidate) =>
        candidate.runRole === "conformance" &&
        candidate.ownerProof &&
        candidate.operation === "prepareImportReplacementPublication" &&
        stableJson(candidate.registryAfter) === stableJson(run.registryBefore),
    );
    if (matchingPreparations.length !== 1) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_PREPARATION_COUNT");
    }
    const preparation = matchingPreparations[0] as MaterializedRunProjection;
    const preparationArguments = Array.isArray(preparation.rawCall["arguments"])
      ? preparation.rawCall["arguments"]
      : [];
    const preparationArgument = isObject(preparationArguments[0])
      ? preparationArguments[0]
      : {};
    const preparationResult = isObject(preparation.exactTypedResult)
      ? preparation.exactTypedResult
      : {};
    if (
      preparationResult["ok"] !== true ||
      stableJson(preparationResult["value"]) !== stableJson(prepared) ||
      stableJson(privateMaterial["disclosedImpact"]) !==
        stableJson(preparationArgument["disclosedImpact"])
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_PREPARATION_BINDING");
    }

    const candidate = isObject(privateMaterial["candidate"])
      ? privateMaterial["candidate"]
      : {};
    const candidateLiteralId = candidate["literalId"];
    const candidateDocument =
      typeof candidateLiteralId === "string"
        ? materializedCatalog.get(candidateLiteralId)
        : undefined;
    const candidateEntry =
      typeof candidateLiteralId === "string" &&
      isObject(literalCatalog[candidateLiteralId])
        ? literalCatalog[candidateLiteralId]
        : {};
    const candidateBytes = new TextEncoder().encode(
      stableJson(candidateDocument),
    );
    const afterDocument = after["document"];
    if (
      !isCompleteDocumentLiteral(candidateDocument) ||
      stableJson(candidateDocument) !== stableJson(afterDocument) ||
      candidate["documentId"] !==
        (isObject(afterDocument) ? afterDocument["id"] : undefined) ||
      candidate["canonicalMaterializedSha256"] !== sha256(candidateBytes) ||
      candidate["canonicalMaterializedByteLength"] !==
        candidateBytes.byteLength ||
      candidate["acceptedPrettyFileSha256"] !== candidateEntry["sha256"] ||
      candidate["preservationPolicy"] !==
        "validated-bytes-and-manual-frozen-spellings-preserved-without-repair"
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_CANDIDATE");
    }

    const command = isObject(privateMaterial["command"])
      ? privateMaterial["command"]
      : {};
    const commandSeed = isObject(preparationArgument["replacementCommandSeed"])
      ? preparationArgument["replacementCommandSeed"]
      : {};
    const preparationIdentity = isObject(preparationArgument["identity"])
      ? preparationArgument["identity"]
      : {};
    const undoDisposition = isObject(command["undoDisposition"])
      ? command["undoDisposition"]
      : {};
    if (
      command["id"] !== commandSeed["id"] ||
      command["label"] !== commandSeed["label"] ||
      command["logicalTimeMs"] !== commandSeed["logicalTimeMs"] ||
      command["expectedDocumentId"] !== preparationIdentity["documentId"] ||
      command["expectedRevision"] !== preparationIdentity["baseRevision"] ||
      command["requestId"] !== preparationIdentity["requestId"] ||
      command["kind"] !== "replace-document" ||
      command["origin"] !== preparationArgument["replacementOrigin"] ||
      command["coalescing"] !== null ||
      stableJson(command["candidate"]) !== stableJson(candidateDocument) ||
      stableJson(command["retirement"]) !== stableJson(retirement) ||
      (prepared["committingTransition"] as JsonObject | undefined)?.[
        "undoDisposition"
      ] !==
        (undoDisposition["kind"] === "retain"
          ? "retained"
          : undoDisposition["kind"])
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_COMMAND");
    }

    const validation = isObject(privateMaterial["validation"])
      ? privateMaterial["validation"]
      : {};
    const structuralDecode = isObject(validation["structuralDecode"])
      ? validation["structuralDecode"]
      : {};
    const semanticValidation = isObject(validation["semanticValidation"])
      ? validation["semanticValidation"]
      : {};
    const preparationCounters = isObject(preparation.exactCounters)
      ? preparation.exactCounters
      : {};
    if (
      structuralDecode["outcome"] !== "accepted" ||
      structuralDecode["callsDuringPreparation"] !==
        preparationCounters["f2DecodeDocumentShape"] ||
      structuralDecode["callsDuringPublication"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["f2DecodeDocumentShape"]
          : undefined) ||
      structuralDecode["repairs"] !== 0 ||
      semanticValidation["outcome"] !== "accepted" ||
      semanticValidation["callsDuringPreparation"] !==
        preparationCounters["f3ValidateDocumentSemantics"] ||
      semanticValidation["callsDuringPublication"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["f3ValidateDocumentSemantics"]
          : undefined) ||
      semanticValidation["repairs"] !== 0 ||
      validation["candidateCanonicalMaterializedSha256"] !==
        sha256(candidateBytes) ||
      validation["candidateCanonicalMaterializedByteLength"] !==
        candidateBytes.byteLength
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_VALIDATION");
    }

    const bookmarksAndFocus = isObject(privateMaterial["bookmarksAndFocus"])
      ? privateMaterial["bookmarksAndFocus"]
      : {};
    if (
      stableJson(bookmarksAndFocus["before"]) !==
        stableJson(before["bookmarks"]) ||
      stableJson(bookmarksAndFocus["after"]) !==
        stableJson(after["bookmarks"]) ||
      stableJson(bookmarksAndFocus["focusRequestAfter"]) !==
        stableJson(after["focusRequest"]) ||
      stableJson(bookmarksAndFocus["quickEntryAfter"]) !==
        stableJson(after["quickEntry"]) ||
      bookmarksAndFocus["repairCallsDuringPreparation"] !==
        preparationCounters["bookmarkRepair"] ||
      bookmarksAndFocus["repairCallsDuringPublication"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["bookmarkRepair"]
          : undefined)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_BOOKMARKS");
    }

    const history = isObject(privateMaterial["history"])
      ? privateMaterial["history"]
      : {};
    if (
      stableJson(history["after"]) !== stableJson(after["history"]) ||
      history["estimatorCallsDuringPreparation"] !==
        preparationCounters["historyEstimator"] ||
      history["estimatorCallsDuringPublication"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["historyEstimator"]
          : undefined) ||
      history["entryRetainedBytesEstimate"] !==
        (isObject(history["entry"])
          ? history["entry"]["retainedBytesEstimate"]
          : undefined) ||
      history["totalRetainedBytesAfterPublication"] !==
        (isObject(after["history"])
          ? after["history"]["retainedBytesEstimate"]
          : undefined)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_HISTORY");
    }
    if (history["retentionDecision"] === "retained") {
      const undo =
        isObject(after["history"]) && Array.isArray(after["history"]["undo"])
          ? after["history"]["undo"]
          : [];
      if (stableJson(undo.at(-1)) !== stableJson(history["entry"])) {
        throw new Error("BRIDGE_PRIVATE_MATERIAL_HISTORY_ENTRY");
      }
    } else if (
      history["retentionDecision"] !==
      "explicitly-unavailable-entry-omitted"
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_HISTORY_DECISION");
    }

    const publication = isObject(privateMaterial["publication"])
      ? privateMaterial["publication"]
      : {};
    const beforeLiteralId = publication["beforeStateLiteralId"];
    const afterLiteralId = publication["afterStateLiteralId"];
    const beforeLiteral =
      typeof beforeLiteralId === "string"
        ? materializedCatalog.get(beforeLiteralId)
        : undefined;
    const afterLiteral =
      typeof afterLiteralId === "string"
        ? materializedCatalog.get(afterLiteralId)
        : undefined;
    if (
      stableJson(beforeLiteral) !== stableJson(before) ||
      stableJson(afterLiteral) !== stableJson(after) ||
      stableJson(publication["exactControllerStateDelta"]) !==
        stableJson(run.exactControllerStateDelta) ||
      stableJson(publication["effects"]) !== stableJson(result["effects"]) ||
      stableJson(publication["counters"]) !== stableJson(result["counters"]) ||
      publication["installCount"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["controllerStateInstalls"]
          : undefined) ||
      publication["listenerNotificationCount"] !==
        (isObject(run.exactCounters)
          ? run.exactCounters["listenerCallbacks"]
          : undefined)
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_PUBLICATION");
    }
    const preservedPaths = stringsAt(publication["preservedTopLevelFields"]);
    if (
      !Array.isArray(publication["preservedTopLevelFields"]) ||
      preservedPaths.length !== publication["preservedTopLevelFields"].length ||
      preservedPaths.some((path) => {
        const pointer = pointerForPath(path.split("."));
        const beforeValue = valueAtJsonPointer(before, pointer);
        const afterValue = valueAtJsonPointer(after, pointer);
        return (
          beforeValue === undefined ||
          afterValue === undefined ||
          stableJson(beforeValue) !== stableJson(afterValue)
        );
      })
    ) {
      throw new Error("BRIDGE_PRIVATE_MATERIAL_PRESERVED_FIELDS");
    }
  };

  for (const run of runById.values()) {
    if (!run.ownerProof || run.runRole === "mutation-killer") continue;
    const caseRecord = caseById.get(run.caseId) ?? {};
    const operation = caseRecord["operation"];
    const argumentsValue = Array.isArray(run.rawCall["arguments"])
      ? run.rawCall["arguments"]
      : [];
    const argument = argumentsValue[0];
    const result = isObject(run.exactTypedResult)
      ? run.exactTypedResult
      : {};
    const before = isObject(run.controllerStateBefore)
      ? run.controllerStateBefore
      : {};
    const after = isObject(run.controllerStateAfter)
      ? run.controllerStateAfter
      : {};
    const registryBefore = isObject(run.registryBefore)
      ? run.registryBefore
      : {};
    const registryAfter = isObject(run.registryAfter) ? run.registryAfter : {};
    const runCounters = isObject(run.exactCounters) ? run.exactCounters : {};
    const beforeEntries = recordsAt(registryBefore["entries"]);
    const afterEntries = recordsAt(registryAfter["entries"]);
    try {
      if (operation === "prepareImportReplacementPublication") {
        if (!isObject(argument)) throw new Error("BRIDGE_PREPARE_ARGUMENT");
        if (result["ok"] === true) {
          const prepared = isObject(result["value"]) ? result["value"] : {};
          const entry = afterEntries[0] ?? {};
          if (
            beforeEntries.length !== 0 ||
            afterEntries.length !== 1 ||
            stableJson(prepared["identity"]) !==
              stableJson(argument["identity"]) ||
            stableJson(entry["key"]) !== stableJson(argument["identity"]) ||
            stableJson(entry["preparedEcho"]) !== stableJson(prepared)
          ) {
            throw new Error("BRIDGE_PREPARE_SUCCESS_BINDING");
          }
        } else if (
          result["ok"] !== false ||
          stableJson(registryBefore) !== stableJson(registryAfter) ||
          stableJson(before) !== stableJson(after)
        ) {
          throw new Error("BRIDGE_PREPARE_REFUSAL_EFFECT");
        }
      } else if (operation === "discardImportReplacementPublication") {
        if (
          !isObject(argument) ||
          result["outcome"] !== "invalidated-by-request" ||
          result["liveForRequest"] !== 0 ||
          stableJson(result["identity"]) !== stableJson(argument["identity"]) ||
          stableJson(before) !== stableJson(after)
        ) {
          throw new Error("BRIDGE_DISCARD_BINDING");
        }
      } else if (operation === "publishImportReplacement") {
        if (!isObject(argument) || !isObject(argument["prepared"])) {
          throw new Error("BRIDGE_PUBLISH_ARGUMENT");
        }
        if (
          stableJson(result["identity"]) !==
            stableJson(argument["prepared"]["identity"]) ||
          result["liveForRequest"] !== 0 ||
          afterEntries.length !== 0 ||
          [
            "f2DecodeDocumentShape",
            "f3ValidateDocumentSemantics",
            "historyEstimator",
            "bookmarkRepair",
          ].some((key) => runCounters[key] !== 0)
        ) {
          throw new Error("BRIDGE_PUBLISH_BINDING");
        }
        if (result["ok"] === true) {
          const afterDocument = isObject(after["document"])
            ? after["document"]
            : {};
          if (
            result["outcome"] !== "committed" ||
            result["documentId"] !== afterDocument["id"] ||
            result["revision"] !== after["revision"] ||
            stableJson(argument["prepared"]["candidateDocumentId"]) !==
              stableJson(afterDocument["id"])
          ) {
            throw new Error("BRIDGE_PUBLISH_SUCCESS_STATE");
          }
          assertPreparedPrivatePublication(run, argument, result);
        } else if (
          result["ok"] !== false ||
          result["observedDocumentId"] !==
            (isObject(before["document"]) ? before["document"]["id"] : undefined) ||
          result["observedRevision"] !== before["revision"] ||
          stableJson(before) !== stableJson(after)
        ) {
          throw new Error("BRIDGE_PUBLISH_REFUSAL_STATE");
        }
      } else if (operation === "readCurrentApplicationDocumentIdentity") {
        if (
          result["documentId"] !==
            (isObject(before["document"]) ? before["document"]["id"] : undefined) ||
          result["revision"] !== before["revision"] ||
          stableJson(before) !== stableJson(after) ||
          stableJson(registryBefore) !== stableJson(registryAfter)
        ) {
          throw new Error("BRIDGE_IDENTITY_LATEST_STATE");
        }
      } else if (operation === "publishCanonicalExportRevision") {
        if (!isObject(argument) || !isObject(argument["publication"])) {
          throw new Error("BRIDGE_MARKER_ARGUMENT");
        }
        const publication = argument["publication"];
        const beforeDocument = isObject(before["document"])
          ? before["document"]
          : {};
        if (result["ok"] === true) {
          if (
            result["outcome"] !== "published" ||
            result["documentId"] !== publication["documentId"] ||
            result["revision"] !== publication["revision"] ||
            publication["documentId"] !== beforeDocument["id"] ||
            publication["revision"] !== before["revision"] ||
            after["exportRevision"] !== publication["revision"]
          ) {
            throw new Error("BRIDGE_MARKER_SUCCESS_BINDING");
          }
        } else if (
          result["ok"] !== false ||
          result["observedDocumentId"] !== beforeDocument["id"] ||
          result["observedRevision"] !== before["revision"] ||
          stableJson(before) !== stableJson(after)
        ) {
          throw new Error("BRIDGE_MARKER_REFUSAL_BINDING");
        }
      }
    } catch (error) {
      addFinding(
        findings,
        "BRIDGE_LITERAL_RESULT_LAW",
        `owner-port-cases.json.${run.caseId}/${run.runId}`,
        `Literal request, result, state, registry, and recomputation counters must satisfy the owner law (${error instanceof Error ? error.message : "unknown"}).`,
      );
    }
  }

  for (const record of allCases) {
    const caseId = String(record["id"]);
    for (const run of recordsAt(record["runs"])) {
      const nearMiss = run["oneFieldNearMiss"];
      if (nearMiss === null) continue;
      if (!isObject(nearMiss)) {
        addFinding(
          findings,
          "BRIDGE_NEAR_MISS_SHAPE",
          `owner-port-cases.json.${caseId}/${String(run["id"])}`,
          "Near-miss evidence must be null or one exact replace mutation.",
        );
        continue;
      }
      const current = runById.get(`${caseId}/${String(run["id"])}`);
      const baselineId = nearMiss["baselineRunId"];
      const baseline =
        typeof baselineId === "string" ? runById.get(baselineId) : undefined;
      try {
        if (
          current === undefined ||
          baseline === undefined ||
          nearMiss["operator"] !== "replace" ||
          typeof nearMiss["jsonPointer"] !== "string" ||
          nearMiss["exactChangedFieldCount"] !== 1 ||
          stableJson(
            valueAtJsonPointer(
              baseline.comparisonInput,
              nearMiss["jsonPointer"],
            ),
          ) !== stableJson(nearMiss["from"]) ||
          stableJson(
            valueAtJsonPointer(
              current.comparisonInput,
              nearMiss["jsonPointer"],
            ),
          ) !== stableJson(nearMiss["to"])
        ) {
          throw new Error("BRIDGE_NEAR_MISS_POINTER");
        }
        const changed = jsonDiffPointers(
          baseline.comparisonInput,
          current.comparisonInput,
        );
        if (
          changed.length !== 1 ||
          changed[0] !== nearMiss["jsonPointer"]
        ) {
          throw new Error("BRIDGE_NEAR_MISS_CHANGE_COUNT");
        }
      } catch (error) {
        addFinding(
          findings,
          "BRIDGE_NEAR_MISS_LITERAL",
          `owner-port-cases.json.${caseId}/${String(run["id"])}.oneFieldNearMiss`,
          `Near miss must change exactly the declared materialized field from the baseline (${error instanceof Error ? error.message : "unknown"}).`,
        );
      }
    }
  }

  const allowedCategories = new Set([
    "positive",
    "negative-near-miss",
    "stale-concurrent",
    "malformed-throw",
    "replay",
    "transposition-applicability",
    "negative-mutation-control",
    "e0-v2-owned-consumer-normalization",
  ]);
  for (const record of allCases) {
    const id = String(record["id"]);
    const isForwardE0V2 = E0_V2_OWNED_CASE_IDS.has(id);
    const expectedMutationKills = stringsAt(record["expectedMutationKills"]);
    if (
      !A0_E0_BRIDGE_OWNER_OPERATION_NAMES.includes(
        record[
          "operation"
        ] as (typeof A0_E0_BRIDGE_OWNER_OPERATION_NAMES)[number],
      ) ||
      !allowedCategories.has(String(record["category"])) ||
      stringsAt(record["traceIds"]).length === 0 ||
      (isForwardE0V2
        ? expectedMutationKills.length !== 0
        : expectedMutationKills.length === 0)
    ) {
      addFinding(
        findings,
        "BRIDGE_CASE_INCOMPLETE",
        id,
        "Each case needs a closed operation/category, literal run, and reciprocal trace; A0 owner cases need mutation kills while forward E0 v2 rows must have none.",
      );
    }
    for (const traceId of stringsAt(record["traceIds"])) {
      const trace = traceById.get(traceId);
      const expectedTraceField = isForwardE0V2
        ? "forwardE0V2CaseIds"
        : "caseIds";
      const forbiddenTraceField = isForwardE0V2
        ? "caseIds"
        : "forwardE0V2CaseIds";
      if (
        trace === undefined ||
        !stringsAt(trace[expectedTraceField]).includes(id) ||
        stringsAt(trace[forbiddenTraceField]).includes(id)
      ) {
        addFinding(
          findings,
          "BRIDGE_CASE_TRACE_LINK",
          `${id}.traceIds.${traceId}`,
          "Case and trace links must be reciprocal in exactly the A0-owner or forward-E0-v2 collection.",
        );
      }
    }
    for (const controlId of expectedMutationKills) {
      const control = controlById.get(controlId);
      if (
        control === undefined ||
        !stringsAt(control["linkedCaseIds"]).includes(id)
      ) {
        addFinding(
          findings,
          "BRIDGE_CASE_CONTROL_LINK",
          `${id}.expectedMutationKills.${controlId}`,
          "Case and mutation links must be reciprocal.",
        );
      }
    }
  }

  for (const control of controls) {
    const id = String(control["id"]);
    const baselineRunId = control["baselineRunId"];
    const killerRunId = control["killerRunId"];
    const baseline =
      typeof baselineRunId === "string" ? runById.get(baselineRunId) : undefined;
    const killer =
      typeof killerRunId === "string" ? runById.get(killerRunId) : undefined;
    const mutation = isObject(control["mutation"]) ? control["mutation"] : {};
    const observation = isObject(control["observation"])
      ? control["observation"]
      : {};
    const expectedDifference = isObject(control["exactExpectedDifference"])
      ? control["exactExpectedDifference"]
      : {};
    const oracleExpectation = isObject(control["oracleExpectation"])
      ? control["oracleExpectation"]
      : {};
    const mutationMaterialization = mutation["materialization"];
    const observationMaterialization = observation["materialization"];
    const allowedMutationMaterializations = new Set([
      "comparisonInput",
      "rawCall",
      "controllerStateBefore",
      "registryBefore",
      "registryLawInput",
      "synchronousEventOrder",
      "workBound",
      "historyEstimatorLawInput",
      "ownerLawFlags",
    ]);
    const allowedObservationMaterializations = new Set([
      "exactTypedResult",
      "exactCounters",
      "registryAfter",
      "controllerStateAfter",
      "ownerLawOracle",
      "scenarioFinalState",
    ]);
    try {
      if (
        stableJson(Object.keys(control).sort(codeUnitCompare)) !==
          stableJson([
            "authorityIds",
            "baselineRunId",
            "category",
            "exactExpectedDifference",
            "id",
            "killerRunId",
            "linkedCaseIds",
            "mutation",
            "observation",
            "oracleExpectation",
          ]) ||
        typeof control["category"] !== "string" ||
        typeof baselineRunId !== "string" ||
        typeof killerRunId !== "string" ||
        baselineRunId === killerRunId ||
        baseline === undefined ||
        killer === undefined ||
        baseline === killer ||
        baseline.runRole !== "conformance" ||
        killer.runRole !== "mutation-killer" ||
        baseline.operation !== killer.operation ||
        !baseline.ownerProof ||
        !killer.ownerProof ||
        baseline.e0V2Owned ||
        killer.e0V2Owned ||
        stableJson(Object.keys(mutation).sort(codeUnitCompare)) !==
          stableJson([
            "exactChangedFieldCount",
            "from",
            "jsonPointer",
            "materialization",
            "operator",
            "to",
          ]) ||
        stableJson(Object.keys(observation).sort(codeUnitCompare)) !==
          stableJson([
            "baselineValue",
            "jsonPointer",
            "killerValue",
            "materialization",
          ]) ||
        (oracleExpectation["outcome"] === "pass"
          ? stableJson(oracleExpectation) !== stableJson({ outcome: "pass" })
          : oracleExpectation["outcome"] !== "killed" ||
            typeof oracleExpectation["code"] !== "string" ||
            stableJson(Object.keys(oracleExpectation).sort(codeUnitCompare)) !==
              stableJson(["code", "outcome"])) ||
        !allowedMutationMaterializations.has(String(mutationMaterialization)) ||
        !allowedObservationMaterializations.has(
          String(observationMaterialization),
        ) ||
        mutation["operator"] !== "replace" ||
        typeof mutation["jsonPointer"] !== "string" ||
        mutation["exactChangedFieldCount"] !== 1 ||
        typeof observation["jsonPointer"] !== "string" ||
        (mutationMaterialization === observationMaterialization &&
          mutation["jsonPointer"] === observation["jsonPointer"])
      ) {
        throw new Error("BRIDGE_CONTROL_SHAPE");
      }
      const mutationTarget = projectionForMutationTarget(
        baseline,
        String(mutationMaterialization),
      );
      if (
        stableJson(valueAtJsonPointer(mutationTarget, mutation["jsonPointer"])) !==
          stableJson(mutation["from"]) ||
        stableJson(mutation["from"]) === stableJson(mutation["to"])
      ) {
        throw new Error("BRIDGE_CONTROL_MUTATION_FROM_TO");
      }
      const mutated = applyPointerMutation(
        mutationTarget,
        "replace",
        mutation["jsonPointer"],
        mutation["from"],
        mutation["to"],
      );
      const mutationDiff = jsonDiffPointers(mutationTarget, mutated);
      if (
        mutationDiff.length !== 1 ||
        mutationDiff[0] !== mutation["jsonPointer"]
      ) {
        throw new Error("BRIDGE_CONTROL_MUTATION_COUNT");
      }
      const killerMutationTarget = projectionForMutationTarget(
        killer,
        String(mutationMaterialization),
      );
      if (stableJson(mutated) !== stableJson(killerMutationTarget)) {
        throw new Error("BRIDGE_CONTROL_KILLER_NOT_MUTATED_BASELINE");
      }
      const invariantMaterializations = [
        "rawCall",
        "controllerStateBefore",
        "registryBefore",
      ].filter((materialization) => {
        if (mutationMaterialization === "comparisonInput") {
          return ![
            "rawCall",
            "controllerStateBefore",
            "registryBefore",
          ].includes(materialization);
        }
        if (mutationMaterialization === "registryLawInput") {
          return materialization !== "registryBefore";
        }
        return materialization !== mutationMaterialization;
      });
      if (
        invariantMaterializations.some(
          (materialization) =>
            stableJson(
              projectionForMutationTarget(baseline, materialization),
            ) !==
            stableJson(projectionForMutationTarget(killer, materialization)),
        )
      ) {
        throw new Error("BRIDGE_CONTROL_UNDECLARED_INPUT_LAW_DRIFT");
      }
      const probe = killer.mutationProbe;
      const probeObservation =
        probe !== null && isObject(probe["downstreamObservation"])
          ? probe["downstreamObservation"]
          : {};
      if (
        probe === null ||
        probe["baselineRunId"] !== baselineRunId ||
        probe["sourceMaterialization"] !== mutationMaterialization ||
        stableJson(probe["baselineLaw"]) !== stableJson(mutationTarget) ||
        stableJson(probe["mutatedLaw"]) !== stableJson(killerMutationTarget) ||
        probeObservation["materialization"] !== observationMaterialization ||
        probeObservation["jsonPointer"] !== observation["jsonPointer"] ||
        stableJson(probeObservation["baselineValue"]) !==
          stableJson(observation["baselineValue"]) ||
        stableJson(probeObservation["killerValue"]) !==
          stableJson(observation["killerValue"]) ||
        stableJson(probe["expectedOwnerLaw"]) !==
          stableJson(oracleExpectation)
      ) {
        throw new Error("BRIDGE_CONTROL_MUTATION_PROBE_BINDING");
      }
      const recomputedBoundaryExpectation =
        killer.ownerLawOracle["outcome"] === "pass"
          ? { outcome: "pass" }
          : killer.ownerLawOracle;
      if (
        stableJson(recomputedBoundaryExpectation) !==
        stableJson(oracleExpectation)
      ) {
        throw new Error("BRIDGE_CONTROL_OWNER_LAW_ORACLE");
      }
      if (oracleExpectation["outcome"] === "killed") {
        if (
          stableJson(baseline.exactTypedResult) !==
            stableJson(killer.exactTypedResult) ||
          !jsonDeepEqual(
            baseline.controllerStateAfter,
            killer.controllerStateAfter,
          ) ||
          stableJson(baseline.registryAfter) !==
            stableJson(killer.registryAfter) ||
          stableJson(baseline.exactCounters) !==
            stableJson(killer.exactCounters) ||
          stableJson(baseline.synchronousEventOrder) !==
            stableJson(killer.synchronousEventOrder) ||
          stableJson(baseline.exactControllerStateDelta) !==
            stableJson(killer.exactControllerStateDelta)
        ) {
          throw new Error("BRIDGE_CONTROL_KILLED_RUNTIME_NOT_INVARIANT");
        }
      }
      const baselineObservationTarget = projectionForMutationTarget(
        baseline,
        String(observationMaterialization),
      );
      const killerObservationTarget = projectionForMutationTarget(
        killer,
        String(observationMaterialization),
      );
      const baselineObserved = valueAtJsonPointer(
        baselineObservationTarget,
        observation["jsonPointer"],
      );
      const killerObserved = valueAtJsonPointer(
        killerObservationTarget,
        observation["jsonPointer"],
      );
      if (
        baselineObserved === undefined ||
        killerObserved === undefined ||
        stableJson(baselineObserved) !== stableJson(observation["baselineValue"]) ||
        stableJson(killerObserved) !== stableJson(observation["killerValue"]) ||
        stableJson(baselineObserved) === stableJson(killerObserved)
      ) {
        throw new Error("BRIDGE_CONTROL_OBSERVATION");
      }
      requireExact(
        expectedDifference,
        {
          baselineValue: observation["baselineValue"],
          killerValue: observation["killerValue"],
        },
        "BRIDGE_CONTROL_EXPECTED_DIFFERENCE",
        `mutation-controls.json.${id}.exactExpectedDifference`,
        "Expected difference must pin the distinct derived baseline and killer observations.",
        findings,
      );
      const linked = stringsAt(control["linkedCaseIds"]);
      if (
        !linked.includes(baseline.caseId) ||
        !linked.includes(killer.caseId) ||
        stringsAt(control["authorityIds"]).length === 0
      ) {
        throw new Error("BRIDGE_CONTROL_LINKED_RUNS");
      }
    } catch (error) {
      addFinding(
        findings,
        "BRIDGE_CONTROL_LITERAL",
        `mutation-controls.json.${id}`,
        `Mutation controls require a one-field owner input/law mutation and a distinct exact derived observation on an owner-proof killer run (${error instanceof Error ? error.message : "unknown"}).`,
      );
    }
    for (const caseId of stringsAt(control["linkedCaseIds"])) {
      const record = caseById.get(caseId);
      if (
        record === undefined ||
        !stringsAt(record["expectedMutationKills"]).includes(id)
      ) {
        addFinding(
          findings,
          "BRIDGE_CONTROL_CASE_LINK",
          `${id}.linkedCaseIds.${caseId}`,
          "Mutation and case links must be reciprocal.",
        );
      }
    }
    for (const authorityId of stringsAt(control["authorityIds"])) {
      if (!authorityById.has(authorityId)) {
        addFinding(
          findings,
          "BRIDGE_CONTROL_AUTHORITY_LINK",
          `${id}.authorityIds.${authorityId}`,
          "Mutation cites an unknown authority.",
        );
      }
    }
  }

  for (const trace of traces) {
    const id = String(trace["id"]);
    const ownerCaseIds = stringsAt(trace["caseIds"]);
    const forwardE0V2CaseIds = stringsAt(trace["forwardE0V2CaseIds"]);
    const proofKinds = stringsAt(trace["proofKinds"]);
    const forwardE0V2ProofKinds = stringsAt(trace["forwardE0V2ProofKinds"]);
    const hasForwardE0V2Cases = forwardE0V2CaseIds.length > 0;
    if (
      typeof trace["requirement"] !== "string" ||
      !A0_E0_BRIDGE_OWNER_OPERATION_NAMES.includes(
        trace[
          "operation"
        ] as (typeof A0_E0_BRIDGE_OWNER_OPERATION_NAMES)[number],
      ) ||
      ownerCaseIds.length === 0 ||
      stringsAt(trace["controlIds"]).length === 0 ||
      stringsAt(trace["authorityIds"]).length === 0 ||
      proofKinds.length === 0 ||
      !Array.isArray(trace["forwardE0V2CaseIds"]) ||
      !Array.isArray(trace["forwardE0V2ProofKinds"]) ||
      (hasForwardE0V2Cases
        ? forwardE0V2ProofKinds.length === 0
        : forwardE0V2ProofKinds.length !== 0)
    ) {
      addFinding(
        findings,
        "BRIDGE_TRACE_INCOMPLETE",
        id,
        "Each operation trace needs A0 cases, controls, authorities, proof kinds, and explicit forward-E0-v2 collections.",
      );
    }
    requireExact(
      trace["forwardE0V2Exclusion"],
      hasForwardE0V2Cases ? FORWARD_E0_V2_TRACE_EXCLUSION : null,
      "BRIDGE_TRACE_FORWARD_E0_V2_EXCLUSION",
      `trace-ledger.json.${id}.forwardE0V2Exclusion`,
      "Forward E0 v2 rows require the exact exclusion scope; traces without such rows require null.",
      findings,
    );
    const overlap = ownerCaseIds.filter((caseId) =>
      forwardE0V2CaseIds.includes(caseId),
    );
    if (overlap.length !== 0) {
      addFinding(
        findings,
        "BRIDGE_TRACE_CASE_SCOPE_OVERLAP",
        `trace-ledger.json.${id}`,
        "A case cannot be both A0 owner proof and a forward E0 v2 row.",
      );
    }
    for (const caseId of ownerCaseIds) {
      const record = caseById.get(caseId);
      if (
        record === undefined ||
        E0_V2_OWNED_CASE_IDS.has(caseId) ||
        !stringsAt(record["traceIds"]).includes(id)
      ) {
        addFinding(
          findings,
          "BRIDGE_TRACE_CASE_LINK",
          `${id}.caseIds.${caseId}`,
          "Trace and case links must be reciprocal.",
        );
      }
    }
    for (const caseId of forwardE0V2CaseIds) {
      const record = caseById.get(caseId);
      if (
        record === undefined ||
        !E0_V2_OWNED_CASE_IDS.has(caseId) ||
        !stringsAt(record["traceIds"]).includes(id)
      ) {
        addFinding(
          findings,
          "BRIDGE_TRACE_FORWARD_E0_V2_CASE_LINK",
          `${id}.forwardE0V2CaseIds.${caseId}`,
          "Forward E0 v2 trace rows must be exactly classified and reciprocal.",
        );
      }
    }
    for (const controlId of stringsAt(trace["controlIds"])) {
      if (!controlById.has(controlId)) {
        addFinding(
          findings,
          "BRIDGE_TRACE_CONTROL_LINK",
          `${id}.controlIds.${controlId}`,
          "Trace cites an unknown mutation control.",
        );
      }
    }
    for (const authorityId of stringsAt(trace["authorityIds"])) {
      if (!authorityById.has(authorityId)) {
        addFinding(
          findings,
          "BRIDGE_TRACE_AUTHORITY_LINK",
          `${id}.authorityIds.${authorityId}`,
          "Trace cites an unknown authority.",
        );
      }
    }
  }

  requireExact(
    traces.flatMap((trace) => stringsAt(trace["forwardE0V2CaseIds"])),
    [...E0_V2_OWNED_CASE_IDS],
    "BRIDGE_TRACE_FORWARD_E0_V2_INVENTORY",
    "trace-ledger.json.traces.forwardE0V2CaseIds",
    "The trace ledger must exclude exactly the six forward E0 v2 rows from A0 owner proof in canonical order.",
    findings,
  );

  requireExact(
    applicabilityRows.map((row) => row["operation"]),
    A0_E0_BRIDGE_OWNER_OPERATION_NAMES,
    "BRIDGE_APPLICABILITY_ORDER",
    "owner-port-cases.json.applicabilityMatrix",
    "Applicability must cover all five ports in contract order.",
    findings,
  );
  for (const row of applicabilityRows) {
    if (
      row["wallTime"] !== "forbidden" ||
      typeof row["synchronization"] !== "string" ||
      typeof row["cancellation"] !== "string" ||
      typeof row["staleState"] !== "string" ||
      typeof row["replay"] !== "string" ||
      typeof row["transposition"] !== "string"
    ) {
      addFinding(
        findings,
        "BRIDGE_APPLICABILITY_ROW",
        String(row["operation"]),
        "Each applicability row closes synchronization, cancellation, staleness, replay, transposition, and wall-time semantics.",
      );
    }
  }

  const cleanupCase = caseById.get("BRIDGE-REP-027") ?? {};
  const cleanupRuns = recordsAt(cleanupCase["runs"]).filter(
    (run) => run["runRole"] !== "mutation-killer",
  );
  for (const reason of DISCARD_REASONS) {
    const first = runById.get(`BRIDGE-REP-027/${reason}-first`);
    const repeat = runById.get(`BRIDGE-REP-027/${reason}-repeat`);
    const firstArgument = Array.isArray(first?.rawCall["arguments"])
      ? first.rawCall["arguments"][0]
      : undefined;
    const repeatArgument = Array.isArray(repeat?.rawCall["arguments"])
      ? repeat.rawCall["arguments"][0]
      : undefined;
    if (
      first === undefined ||
      repeat === undefined ||
      !isObject(firstArgument) ||
      !isObject(repeatArgument) ||
      firstArgument["reason"] !== reason ||
      repeatArgument["reason"] !== reason
    ) {
      addFinding(
        findings,
        "BRIDGE_DISCARD_IDEMPOTENCE",
        `owner-port-cases.json.BRIDGE-REP-027.${reason}`,
        "Each exact cleanup reason must have literal first and repeat calls.",
      );
    }
  }
  if (cleanupRuns.length !== DISCARD_REASONS.length * 2) {
    addFinding(
      findings,
      "BRIDGE_DISCARD_RUN_COUNT",
      "owner-port-cases.json.BRIDGE-REP-027.runs",
      "Cleanup requires exactly eight runs: first and repeat for all four reasons.",
    );
  }
  for (const requiredCaseId of [
    "BRIDGE-REP-003",
    "BRIDGE-REP-028",
    "BRIDGE-REP-029",
    "BRIDGE-REP-030",
    "BRIDGE-ID-004",
    "BRIDGE-MARK-009",
    "BRIDGE-MARK-010",
    "BRIDGE-MARK-012",
  ]) {
    if (!caseById.has(requiredCaseId)) {
      addFinding(
        findings,
        "BRIDGE_REQUIRED_CASE",
        requiredCaseId,
        "Required transposition, isolation, replay, concurrency, or late-completion case is missing.",
      );
    }
  }

  const independence = isObject(provenance["independence"])
    ? provenance["independence"]
    : {};
  const expectedIndependence = {
    productionImportsForbidden: true,
    productionOutputUsedAsOracle: false,
    expectedValuesGenerated: false,
    fixturesHandAuthored: true,
    acceptedE0FixturesRewritten: false,
    acceptedE0BytePinsRecomputedToPermitDrift: false,
    acceptedE0V1DocsSourceValidatorTestsSupportOrReviewRewritten: false,
    acceptedE0V1SemanticsReinterpreted: false,
    semanticCompatibilityClaim: false,
    semanticE0BindingClaimed: false,
    semanticBindingDeferredTo: "jcpe-milestone-reliable-studio-l3a.8.4",
    semanticBindingRequiresExplicitProjectOwnerAcceptance: true,
    bridgeProductionImplementationAvailableWhenAuthored: false,
    controllerImplementationClaimed: false,
    browserOrRealAdapterProofClaimed: false,
    unknownFallibleReturnNormalizationClaimed: false,
    cleanupExactTotalOperation: true,
    proposedOwnerResultsContainAppState: false,
    wallTimeAffectsOutcome: false,
    musicalContentInspectedByIdentityOrMarkerPorts: false,
  } as const;
  requireExact(
    independence,
    expectedIndependence,
    "BRIDGE_INDEPENDENCE",
    "provenance-ledger.json.independence",
    "Fixture independence, implementation status, or state-isolation claims changed.",
    findings,
  );
  requireExact(
    provenance["versionBoundary"],
    {
      activeLeafScope: "A0-owner-only",
      acceptedE0V1Status: "immutable-archival-accepted-authority",
      semanticCompatibilityClaim: false,
      semanticBindingClaim: false,
      semanticBindingLeaf: "jcpe-milestone-reliable-studio-l3a.8.4",
      semanticBindingRequiresExplicitProjectOwnerAcceptance: true,
      productionClaim: false,
      browserClaim: false,
    },
    "BRIDGE_PROVENANCE_VERSION_BOUNDARY",
    "provenance-ledger.json.versionBoundary",
    "Provenance must claim only the A0 owner proposal and defer E0 binding to an explicitly accepted v2 packet.",
    findings,
  );
  const archivalE0Authority = authorityById.get("BRIDGE-AUTH-E0") ?? {};
  if (
    archivalE0Authority["authorityClass"] !==
      "archival-consumer-contract" ||
    archivalE0Authority["sourceKind"] !==
      "accepted-repository-contract" ||
    archivalE0Authority["sourceRef"] !== "docs/E0_INTERCHANGE_CONTRACT.md" ||
    archivalE0Authority["judgmentBearing"] !== false ||
    archivalE0Authority["reviewState"] !==
      "accepted-first-golden-by-project-owner" ||
    typeof archivalE0Authority["scope"] !== "string" ||
    !archivalE0Authority["scope"].includes("grants no compatibility")
  ) {
    addFinding(
      findings,
      "BRIDGE_ARCHIVAL_E0_AUTHORITY",
      "provenance-ledger.json.authorities.BRIDGE-AUTH-E0",
      "Accepted E0 v1 is non-judgment-bearing archival evidence and grants no semantic binding authority to this proposal.",
    );
  }
  if (
    provenance["expertReviewClaim"] !== false ||
    provenance["humanAcceptanceClaim"] !== false
  ) {
    addFinding(
      findings,
      "BRIDGE_REVIEW_CLAIM",
      "provenance-ledger.json",
      "This spec packet cannot claim expert or project-owner acceptance.",
    );
  }

  const sourcePath = resolve(
    REPOSITORY_ROOT,
    "src/application/application-interchange-owner-contract.ts",
  );
  const e0SourcePath = resolve(
    REPOSITORY_ROOT,
    "src/application/e0-interchange-contract.ts",
  );
  try {
    const [ownerSource, e0Source] = await Promise.all([
      readFile(sourcePath, "utf8"),
      readFile(e0SourcePath, "utf8"),
    ]);
    for (const token of [
      "export interface A0E0InterchangeOwnerPorts",
      '"specified-unimplemented"',
      "PrepareImportReplacementPublicationOperation",
      "PrepareImportReplacementPublicationPort",
      "DiscardImportReplacementPublicationOperation",
      "PublishImportReplacementOperation",
      "PublishImportReplacementPort",
      "ReadCurrentApplicationDocumentIdentityOperation",
      "ReadCurrentApplicationDocumentIdentityPort",
      "PublishCanonicalExportRevisionOperation",
      "PublishCanonicalExportRevisionPort",
    ]) {
      if (!ownerSource.includes(token)) {
        addFinding(
          findings,
          "BRIDGE_OWNER_SOURCE_TOKEN",
          sourcePath,
          `Owner type contract is missing ${token}.`,
        );
      }
    }

    const ownerSourceFile = ts.createSourceFile(
      sourcePath,
      ownerSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const imports = ownerSourceFile.statements.filter(ts.isImportDeclaration);
    const actualTopology = Object.fromEntries(
      imports.map((node) => {
        const modulePath = ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : "";
        const bindings = node.importClause?.namedBindings;
        const names =
          bindings !== undefined && ts.isNamedImports(bindings)
            ? bindings.elements.map((element) => element.name.text)
            : [];
        if (node.importClause?.isTypeOnly !== true) {
          addFinding(
            findings,
            "BRIDGE_OWNER_IMPORT_NOT_TYPE_ONLY",
            `${sourcePath}:${modulePath}`,
            "Every owner-contract import must be declaration-wide type-only.",
          );
        }
        return [modulePath, names];
      }),
    );
    requireExact(
      actualTopology,
      OWNER_IMPORT_TOPOLOGY,
      "BRIDGE_OWNER_IMPORT_TOPOLOGY",
      sourcePath,
      "The owner contract may import exactly the pinned domain and A0 type names.",
      findings,
    );
    const hasRuntimeImplementation = ownerSourceFile.statements.some(
      (node) =>
        ts.isClassDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        (ts.isVariableStatement(node) &&
          node.declarationList.declarations.some(
            (declaration) =>
              declaration.initializer !== undefined &&
              (ts.isArrowFunction(declaration.initializer) ||
                ts.isFunctionExpression(declaration.initializer) ||
                ts.isClassExpression(declaration.initializer)),
          )),
    );
    if (hasRuntimeImplementation || ownerSource.includes("e0-interchange-contract")) {
      addFinding(
        findings,
        "BRIDGE_OWNER_SOURCE_IMPLEMENTATION",
        sourcePath,
        "The A0 owner file must remain an unbound specification surface with no function, class, or E0 dependency.",
      );
    }

    const ownerInterface = ownerSourceFile.statements.find(
      (node): node is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(node) &&
        node.name.text === "A0E0InterchangeOwnerPorts",
    );
    const interfaceMembers =
      ownerInterface?.members.map((member) => {
        const name = member.name;
        return name !== undefined &&
          (ts.isIdentifier(name) || ts.isStringLiteral(name))
          ? name.text
          : null;
      }) ?? [];
    requireExact(
      interfaceMembers,
      A0_E0_BRIDGE_OWNER_OPERATION_NAMES,
      "BRIDGE_OWNER_INTERFACE",
      sourcePath,
      "A0E0InterchangeOwnerPorts must expose exactly five members in contract order.",
      findings,
    );

    const e0SourceFile = ts.createSourceFile(
      e0SourcePath,
      e0Source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const e0ImportsOwner = e0SourceFile.statements.some(
      (node) =>
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text ===
          "./application-interchange-owner-contract",
    );
    if (e0ImportsOwner) {
      addFinding(
        findings,
        "BRIDGE_ACCEPTED_E0_V1_BOUND_TO_OWNER",
        e0SourcePath,
        "Accepted E0 v1 must remain byte-pinned and must not import the proposed A0 owner surface.",
      );
    }
  } catch {
    addFinding(
      findings,
      "BRIDGE_SOURCE_READ",
      sourcePath,
      "Owner and E0 type-contract sources must be readable.",
    );
  }

  const acceptedE0Pins = isObject(contract["acceptedE0Pins"])
    ? contract["acceptedE0Pins"]
    : {};
  let acceptedE0V1PinnedUnmodified: boolean;
  try {
    const e0Report = await validateE0Contract();
    const e0ByteManifestDigest = sha256(
      new TextEncoder().encode(stableJson(E0_ACCEPTED_BYTE_DIGESTS)),
    );
    const acceptedFixtureRoot = resolve(
      REPOSITORY_ROOT,
      "tests/fixtures/interchange",
    );
    const fixtureHashesMatch = (
      await Promise.all(
        Object.entries(E0_ACCEPTED_BYTE_DIGESTS).map(
          async ([relativePath, expected]) =>
            sha256(
              new Uint8Array(
                await readFile(resolve(acceptedFixtureRoot, relativePath)),
              ),
            ) === expected,
        ),
      )
    ).every(Boolean);
    const artifactHashesMatch = (
      await Promise.all(
        ACCEPTED_E0_V1_ARTIFACT_PINS.map(
          async (pin) =>
            sha256(
              new Uint8Array(await readFile(resolve(REPOSITORY_ROOT, pin.path))),
            ) === pin.sha256,
        ),
      )
    ).every(Boolean);
    acceptedE0V1PinnedUnmodified =
      e0Report.outcome === "pass" &&
      Object.keys(E0_ACCEPTED_BYTE_DIGESTS).length === 16 &&
      fixtureHashesMatch &&
      artifactHashesMatch &&
      e0ByteManifestDigest === A0_E0_BRIDGE_ACCEPTED_E0_BYTE_MANIFEST_DIGEST &&
      e0ByteManifestDigest === acceptedE0Pins["byteManifestDigest"] &&
      E0_ACCEPTED_SEMANTIC_DIGEST === acceptedE0Pins["semanticDigest"] &&
      acceptedE0Pins["version"] === "E0-v1" &&
      acceptedE0Pins["fileCount"] === 16 &&
      acceptedE0Pins["fixtureBytesMayChangeForThisOwnerSpec"] === false;
  } catch {
    acceptedE0V1PinnedUnmodified = false;
  }
  if (!acceptedE0V1PinnedUnmodified) {
    addFinding(
      findings,
      "BRIDGE_ACCEPTED_E0_DRIFT",
      "tests/fixtures/interchange",
      "The accepted E0 v1 validator, 16 fixtures, seven non-fixture artifacts, byte manifest, and semantic digest must remain unchanged and valid.",
    );
  }

  if (
    expectedAcceptedDocumentOccurrences === 0 ||
    acceptedE0AuthorityDocumentOccurrences === 0 ||
    documentValidationCache.size === 0 ||
    f2DocumentValidationCalls !== documentValidationCache.size ||
    f3DocumentValidationCalls !== expectedF3ValidationCalls ||
    expectedAcceptedDocumentOccurrences < documentValidationCache.size
  ) {
    addFinding(
      findings,
      "BRIDGE_DOCUMENT_VALIDATION_CALLS",
      "owner-port-cases.json.literalCatalog",
      `Every materialized document occurrence must have an independent expected F2/F3 outcome; accepted E0 refs reuse its rerun gate, while each unique new/patched canonical document receives one real F2 and applicable F3 call (occurrences=${String(expectedAcceptedDocumentOccurrences)}, acceptedE0AuthorityOccurrences=${String(acceptedE0AuthorityDocumentOccurrences)}, uniqueNewOrPatched=${String(documentValidationCache.size)}, F2=${String(f2DocumentValidationCalls)}, F3=${String(f3DocumentValidationCalls)}).`,
    );
  }

  const counts = Object.freeze({
    files: actualFiles.length,
    replacementCases: replacementCases.length,
    identityCases: identityCases.length,
    markerCases: markerCases.length,
    applicabilityRows: applicabilityRows.length,
    mutationControls: controls.length,
    traces: traces.length,
    authorities: authorities.length,
  });
  requireExact(
    counts,
    EXPECTED_COUNTS,
    "BRIDGE_COUNTS",
    fixtureRoot,
    "Bridge packet counts differ from the independently authored closure.",
    findings,
  );
  requireExact(
    contract["counts"],
    {
      replacementCases: EXPECTED_COUNTS.replacementCases,
      identityCases: EXPECTED_COUNTS.identityCases,
      markerCases: EXPECTED_COUNTS.markerCases,
      applicabilityRows: EXPECTED_COUNTS.applicabilityRows,
      mutationControls: EXPECTED_COUNTS.mutationControls,
      traces: EXPECTED_COUNTS.traces,
      authorities: EXPECTED_COUNTS.authorities,
    },
    "BRIDGE_DECLARED_COUNTS",
    "a0-e0-bridge-contract.json.counts",
    "Root declared counts must match the ledgers.",
    findings,
  );

  findings.sort(
    (left, right) =>
      codeUnitCompare(left.path, right.path) ||
      codeUnitCompare(left.code, right.code) ||
      codeUnitCompare(left.message, right.message),
  );
  return Object.freeze({
    schema: "changes.validation.a0-e0-bridge-contract.v2",
    package: "A0 interchange owner ports",
    outcome: findings.length === 0 ? "pass" : "fail",
    reviewState: "proposed-independent-spec",
    counts,
    acceptedE0V1PinnedUnmodified,
    semanticCompatibilityClaim: false,
    productionImplementationClaim: false,
    humanAcceptanceClaim: false,
    findings: Object.freeze(findings),
  });
}

if (import.meta.main) {
  const report = await validateA0E0BridgeContract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
