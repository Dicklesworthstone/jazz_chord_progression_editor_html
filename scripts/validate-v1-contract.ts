import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type V1ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type V1ContractValidationReport = Readonly<{
  schema: "changes.validation.v1-contract.v1";
  package: "V1";
  outcome: "pass" | "fail";
  counts: Readonly<{
    files: number;
    voiceSets: number;
    assignmentCases: number;
    lawCases: number;
    operationStateCases: number;
    publicLimitCases: number;
    derivedLimitProbes: number;
    mutationControls: number;
    mutationDirectKillerLinks: number;
    traces: number;
    authorities: number;
  }>;
  findings: readonly V1ContractFinding[];
}>;

const DEFAULT_FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/voice-assignment",
);
const CONTRACT_FILENAME = "v1-voice-assignment-contract.json" as const;

/** Recursively freeze independently reviewed literal authority. */
function deepFreeze<const Value>(value: Value): Value {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
  return value;
}

export const V1_REVIEWED_COMPANIONS = deepFreeze([
  "assignment-policy.json",
  "assignment-cases.json",
  "law-cases.json",
  "operation-state-cases.json",
  "limit-cases.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const);

const EXPECTED_FILES = [CONTRACT_FILENAME, ...V1_REVIEWED_COMPANIONS] as const;
type V1FixtureFilename = (typeof EXPECTED_FILES)[number];

const EXPECTED_SCHEMAS: Readonly<Record<V1FixtureFilename, string>> = {
  "v1-voice-assignment-contract.json":
    "changes.fixtures.v1-voice-assignment-contract.v1",
  "assignment-policy.json": "changes.fixtures.v1-assignment-policy.v1",
  "assignment-cases.json": "changes.fixtures.v1-assignment-cases.v1",
  "law-cases.json": "changes.fixtures.v1-law-cases.v1",
  "operation-state-cases.json":
    "changes.fixtures.v1-operation-state-cases.v1",
  "limit-cases.json": "changes.fixtures.v1-limit-cases.v1",
  "mutation-controls.json": "changes.fixtures.v1-mutation-controls.v1",
  "provenance-ledger.json": "changes.fixtures.v1-provenance-ledger.v1",
  "trace-ledger.json": "changes.fixtures.v1-trace-ledger.v1",
};

const EXPECTED_TOP_LEVEL_KEYS: Readonly<
  Record<V1FixtureFilename, readonly string[]>
> = {
  "v1-voice-assignment-contract.json": [
    "authorityIds",
    "declaredFiles",
    "expectedValuesGenerated",
    "fixtureVersion",
    "identity",
    "identityQuestions",
    "independence",
    "inputLimits",
    "lockStatuses",
    "memoryLimits",
    "motionRelationKinds",
    "noAssignmentReasons",
    "operationNames",
    "operationOrder",
    "productionOutputUsed",
    "refusalCodeOrder",
    "reportedCostAxes",
    "schema",
    "selectionAxisOrder",
    "status",
    "terminations",
    "traceIds",
    "valueLimits",
    "workLimits",
    "legacyRegressionOwnership",
  ].sort(codeUnitCompare),
  "assignment-policy.json": [
    "alignmentPolicy",
    "authorityIds",
    "costPolicy",
    "expectedValuesGenerated",
    "fixtureVersion",
    "identityLifecycle",
    "identityPolicy",
    "independentOracle",
    "motionPolicy",
    "productionOutputUsed",
    "rolePolicy",
    "schema",
    "status",
    "traceIds",
    "trackedRecordPolicy",
  ],
  "assignment-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "independentOracle",
    "productionOutputUsed",
    "schema",
    "status",
    "voiceSets",
  ],
  "law-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "lawProofPolicy",
    "productionOutputUsed",
    "schema",
    "status",
  ],
  "operation-state-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "status",
  ],
  "limit-cases.json": [
    "authorityIds",
    "derivedAccountingProbes",
    "derivedProbePolicy",
    "expectedValuesGenerated",
    "fixtureVersion",
    "matrixGoldens",
    "memoryPopulationLimits",
    "productionOutputUsed",
    "publicBoundaries",
    "schema",
    "status",
    "traceIds",
    "valueLimits",
  ],
  "mutation-controls.json": [
    "controls",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "status",
  ],
  "provenance-ledger.json": [
    "authoringStatement",
    "authorities",
    "authorityClasses",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "status",
  ],
  "trace-ledger.json": [
    "caseLinkPolicy",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
    "stableTraceIdsOnly",
    "status",
    "traces",
  ],
};

// Pinned only after the complete independent corpus is semantically clean.
// Null is an explicit hard-failure state, never an auto-acceptance wildcard.
const EXPECTED_BYTE_DIGESTS: Readonly<
  Record<V1FixtureFilename, string | null>
> = {
  "v1-voice-assignment-contract.json":
    "38c470e90e2b09849b7fdecc3cf2558fcf155e71204cab900541fe72094b143d",
  "assignment-policy.json":
    "4fa91f176ab5b185126f70297a174077645d6629162608dd6ad9a3b0e6080a86",
  "assignment-cases.json":
    "0ee65f2b80ef0c414d23ed21c816cd08d243f51008b8de2a5e84bc96a1f2b88b",
  "law-cases.json":
    "2a861da932e4c05e4f7fdc0e89619c31249b54e216c804d68f8a1da0f1834676",
  "operation-state-cases.json":
    "3edc1be7ce3a1ba34c443c05e2110a2f6a4d02eaaf855dc23a91d51e9f6280ba",
  "limit-cases.json":
    "6e66a856bf1742e5af092dae351bf018c15d4aa55a39dbdd5edf9c1032dc1739",
  "mutation-controls.json":
    "9cdd59cb5035acc8afb8dead3f302d20b0caf024f7a65a0cbeaaeac19849750d",
  "provenance-ledger.json":
    "0a536dc919caa132593c72abc99dd41c45f12f3681ee8900591b95b50b04982a",
  "trace-ledger.json":
    "0034757b89228f1eb80782f26e623ef04660d42b0bae29d5879fae51bcb30404",
};
const EXPECTED_SEMANTIC_DIGESTS: Readonly<
  Record<V1FixtureFilename, string | null>
> = {
  "v1-voice-assignment-contract.json":
    "cca32c9fd066960d0c11085b933ade87ee43575de12338b7683ea3b4e7a642be",
  "assignment-policy.json":
    "e64192b474465ba4f6f82d189a51e0554460c121b9d4637c228fb22793cb9d38",
  "assignment-cases.json":
    "e5c887bb62b91bfbec994f9d557b00e25cc1b69558d0d250113456c1446482be",
  "law-cases.json":
    "d532417f7f6d10d8f5bba5465995693319d48d2d789fb3e6ebf57f5d82013b1d",
  "operation-state-cases.json":
    "7e540851ceafdcdb61d4e4f5b2a3be701e1c30545d848d5a1687407344f37765",
  "limit-cases.json":
    "f3246aaa7096c1a3fa057a86b30b299474d302c4707ce1cdc291d9db08007bea",
  "mutation-controls.json":
    "2d5dfa7eddacbb158acbb71f14da2f610755b777fba1aaf20d78a01cc0e2608d",
  "provenance-ledger.json":
    "ba3a96d5c951cb8896034fa81994c317735dc3532c1c9da24c518a2efbeccf83",
  "trace-ledger.json":
    "e4cf65b907a0ca1627d4c81fb1d941feda4b3543adb8d82442a46974728853cc",
};

export const V1_REVIEWED_TRACE_IDS = deepFreeze([
  "V1-TRACE-BOUNDARY",
  "V1-TRACE-COSTS",
  "V1-TRACE-DETERMINISM",
  "V1-TRACE-DP-ORDER",
  "V1-TRACE-GAPS",
  "V1-TRACE-GUIDE-TONES",
  "V1-TRACE-IDENTITY",
  "V1-TRACE-IMMUTABILITY",
  "V1-TRACE-LEGACY",
  "V1-TRACE-LIMITS",
  "V1-TRACE-LOCKS",
  "V1-TRACE-MOTION",
  "V1-TRACE-REFUSALS",
  "V1-TRACE-TIES",
  "V1-TRACE-VOICE-IDS",
] as const);

export const V1_REVIEWED_AUTHORITY_IDS = deepFreeze([
  "V1-AUTH-CONTRACT",
  "V1-AUTH-INDEPENDENCE",
  "V1-AUTH-LIMITS",
  "V1-AUTH-ORDER-PRESERVING",
  "V1-AUTH-PROJECT-POLICY",
  "V1-AUTH-V0-DOMAIN",
] as const);

export const V1_REVIEWED_PUBLIC_CONTRACT = deepFreeze({
  identity: {
    package: "V1",
    module: "src/theory/voice-assignment-contract.ts",
    contractSchema: "changes.theory.voice-assignment-contract.v1",
    requestSchema: "changes.theory.voice-assignment-request.v1",
    frameSchema: "changes.theory.voice-assignment-frame.v1",
    resultSchema: "changes.theory.voice-assignment-result.v1",
    arcSchema: "changes.theory.voice-arc.v1",
    lockSchema: "changes.theory.voice-lock.v1",
    engineId: "changes.voice-assignment",
    engineVersion: 1,
    engineVersionTag: "changes.voice-assignment.v1",
    policyId: "changes.voice-assignment.order-preserving-smooth",
    policyVersion: 1,
    identityPolicyId: "changes.voice-identity",
    identityPolicyVersion: 1,
    tieBreakPolicyId: "changes.voice-assignment.tie-break",
    tieBreakPolicyVersion: 1,
    rolePolicyId: "changes.voice-assignment.v0-template-roles",
    rolePolicyVersion: 1,
    lowRegisterPolicyId: "changes.voicing-low-register-spacing",
    lowRegisterPolicyVersion: 1,
  },
  operationNames: ["initializeVoiceFrame", "assignVoiceTransition"],
  operationOrder: ["match", "leave", "enter"],
  identityQuestions: [
    "exact-midi",
    "pitch-class",
    "spelled-pitch-class",
    "spelled-pitch",
    "degree",
  ],
  motionRelationKinds: [
    "stationary-pair",
    "oblique",
    "contrary",
    "parallel",
    "similar",
  ],
  selectionAxisOrder: [
    "alignmentCost",
    "commonTonesLost",
    "guideTonesLost",
    "gapCount",
    "negativeExactSustains",
    "negativeSpelledPitchContinuities",
    "operationPath",
  ],
  reportedCostAxes: [
    "totalAbsoluteMotion",
    "maximumAbsoluteLeap",
    "commonTonesLost",
    "crowdedLowIntervals",
    "doubledGuideTones",
    "omittedColors",
    "totalSpan",
  ],
  inputLimits: {
    minimumVoices: 3,
    maximumVoices: 7,
    maximumLocks: 7,
    maximumRoleDegreesPerList: 16,
    requestIdMinimumAsciiLength: 1,
    requestIdMaximumAsciiLength: 128,
    requestIdPattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    voiceIdPattern: "^voice-[0-9]{4}$",
    maximumVoiceSerial: 4095,
    maximumNextVoiceSerial: 4096,
    roleSourceIdMaximumCodePoints: 256,
    roleSourceIdMaximumUtf8Bytes: 512,
    roleSourceVersionMinimum: 1,
    roleSourceVersionMaximum: 65535,
  },
  valueLimits: {
    signedSemitones: { minimum: -127, maximum: 127 },
    absoluteSemitones: { minimum: 0, maximum: 127 },
    alignmentCost: { minimum: 0, maximum: 889 },
    gapCount: { minimum: 0, maximum: 14 },
    enteringVoices: { minimum: 0, maximum: 7 },
    leavingVoices: { minimum: 0, maximum: 7 },
    totalAbsoluteMotion: { minimum: 0, maximum: 889 },
    maximumAbsoluteLeap: { minimum: 0, maximum: 127 },
    voiceFactCount: { minimum: 0, maximum: 7 },
    crowdedLowIntervals: { minimum: 0, maximum: 6 },
    doubledGuideTones: { minimum: 0, maximum: 6 },
    omittedColors: { minimum: 0, maximum: 16 },
    totalSpan: { minimum: 0, maximum: 127 },
    orderKeyNegativeCount: { minimum: -7, maximum: 0 },
    operationPathSteps: { minimum: 3, maximum: 14 },
    sourceOrTargetOrdinal: { minimum: 0, maximum: 6 },
    arcOrdinal: { minimum: 0, maximum: 13 },
    relationCount: { minimum: 0, maximum: 21 },
    lockOrdinal: { minimum: 0, maximum: 6 },
    roleSourceId: {
      minimumCodePoints: 1,
      maximumCodePoints: 256,
      maximumUtf8Bytes: 512,
    },
    roleSourceVersion: { minimum: 1, maximum: 65535 },
  },
  workLimits: {
    sourceVoicesVisited: 7,
    targetVoicesVisited: 7,
    matrixCellsVisited: 64,
    transitionCandidatesEvaluated: 161,
    scoreComparisons: 98,
    backtraceSteps: 14,
    identityComparisons: 49,
    roleDegreesVisited: 64,
    roleMembershipComparisons: 448,
    roleOrderComparisons: 60,
    relationClassifications: 21,
    lockChecks: 7,
    voiceIdsAllocated: 7,
    arcsProduced: 14,
  },
  memoryLimits: {
    peakInputVoiceRecords: 14,
    peakInputRoleDegreeRecords: 64,
    peakMatrixCellRecords: 64,
    peakPredecessorRecords: 63,
    peakScoreRecords: 64,
    peakPathStepRecords: 14,
    peakArcRecords: 14,
    peakArcEndpointRecords: 14,
    peakArcIdentityRecords: 14,
    peakOutputVoiceRecords: 7,
    peakOutputRoleDegreeRecords: 32,
    peakRelationRecords: 21,
    peakLockRecords: 7,
    peakLockEvidenceRecords: 7,
    peakTrackedRecords: 399,
  },
  refusalCodeOrder: [
    "voice_assignment.schema_invalid",
    "voice_assignment.policy_invalid",
    "voice_assignment.request_id_invalid",
    "voice_assignment.event_identity_invalid",
    "voice_assignment.voice_count_invalid",
    "voice_assignment.voice_ordinal_invalid",
    "voice_assignment.voice_order_invalid",
    "voice_assignment.duplicate_midi",
    "voice_assignment.pitch_midi_mismatch",
    "voice_assignment.provenance_invalid",
    "voice_assignment.role_context_invalid",
    "voice_assignment.source_request_mismatch",
    "voice_assignment.voice_id_invalid",
    "voice_assignment.voice_id_duplicate",
    "voice_assignment.voice_serial_invalid",
    "voice_assignment.next_voice_serial_invalid",
    "voice_assignment.lock_limit_exceeded",
    "voice_assignment.lock_invalid",
    "voice_assignment.no_assignment",
    "limit.voice_assignment_work_exceeded",
  ],
  noAssignmentReasons: [
    "lock-conflict",
    "locked-order-crossing",
    "voice-id-space-exhausted",
  ],
  lockStatuses: [
    "eligible",
    "satisfied",
    "stale-request",
    "stale-event",
    "source-voice-missing",
    "target-pitch-missing",
    "target-degree-mismatch",
  ],
  terminations: [
    "complete-initialized",
    "complete-assigned",
    "request-invalid",
    "no-assignment",
    "work-limit-exceeded",
  ],
  traceIds: V1_REVIEWED_TRACE_IDS,
  authorityIds: V1_REVIEWED_AUTHORITY_IDS,
});

type ParsedFixture = Readonly<{
  filename: V1FixtureFilename;
  root: JsonObject;
  byteDigest: string;
  semanticDigest: string;
}>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectArray(value: unknown): JsonObject[] | null {
  return Array.isArray(value) && value.every(isObject) ? value : null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort(codeUnitCompare)
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function pathString(path: readonly (string | number)[]): string {
  return path.length === 0
    ? "$"
    : `$${path.map((item) => `[${JSON.stringify(item)}]`).join("")}`;
}

/** Detect decoded duplicate keys before JSON.parse can apply last-key-wins. */
function duplicateJsonKeys(source: string): readonly string[] {
  let cursor = 0;
  const duplicates: string[] = [];
  const whitespace = (): void => {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  };
  const stringToken = (): Readonly<{ decoded: string; start: number }> | null => {
    whitespace();
    if (source[cursor] !== '"') return null;
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const unit = source[cursor];
      if (unit === "\\") {
        cursor += 2;
        continue;
      }
      cursor += 1;
      if (unit === '"') {
        try {
          return {
            decoded: JSON.parse(source.slice(start, cursor)) as string,
            start,
          };
        } catch {
          return null;
        }
      }
    }
    return null;
  };
  const value = (path: readonly (string | number)[]): void => {
    whitespace();
    const unit = source[cursor];
    if (unit === "{") {
      cursor += 1;
      const seen = new Set<string>();
      whitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        const key = stringToken();
        if (key === null) return;
        if (seen.has(key.decoded)) {
          duplicates.push(
            `${pathString(path)}.${JSON.stringify(key.decoded)}@${String(key.start)}`,
          );
        }
        seen.add(key.decoded);
        whitespace();
        if (source[cursor] !== ":") return;
        cursor += 1;
        value([...path, key.decoded]);
        whitespace();
        if (source[cursor] === "}") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === "[") {
      cursor += 1;
      let index = 0;
      whitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        value([...path, index]);
        index += 1;
        whitespace();
        if (source[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") return;
        cursor += 1;
      }
      return;
    }
    if (unit === '"') {
      stringToken();
      return;
    }
    while (
      cursor < source.length &&
      !/[\s,\]}]/u.test(source[cursor] ?? "")
    ) {
      cursor += 1;
    }
  };
  value([]);
  return duplicates.sort(codeUnitCompare);
}

function findingOrder(
  left: V1ContractFinding,
  right: V1ContractFinding,
): number {
  return (
    codeUnitCompare(left.path, right.path) ||
    codeUnitCompare(left.code, right.code) ||
    codeUnitCompare(left.message, right.message)
  );
}

function addFinding(
  findings: V1ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

function requireExact(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  message: string,
  findings: V1ContractFinding[],
): void {
  if (!sameJson(actual, expected)) addFinding(findings, code, path, message);
}

function idOf(record: JsonObject): string | null {
  return typeof record["id"] === "string" && record["id"].length > 0
    ? record["id"]
    : null;
}

function reviewedRecords(
  root: JsonObject,
  field: string,
  path: string,
  findings: V1ContractFinding[],
): JsonObject[] {
  const records = objectArray(root[field]);
  if (records === null) {
    addFinding(
      findings,
      "V1_RECORD_ARRAY_SHAPE",
      path,
      `${field} must be an array of objects.`,
    );
    return [];
  }
  const ids: string[] = [];
  records.forEach((record, index) => {
    const id = idOf(record);
    if (id === null) {
      addFinding(
        findings,
        "V1_RECORD_ID_SHAPE",
        `${path}[${String(index)}].id`,
        "Every reviewed record requires a nonempty string ID.",
      );
    } else {
      ids.push(id);
    }
  });
  if (new Set(ids).size !== ids.length) {
    addFinding(
      findings,
      "V1_RECORD_ID_DUPLICATE",
      path,
      "Record IDs must be unique within their collection.",
    );
  }
  if (!sameJson(ids, [...ids].sort(codeUnitCompare))) {
    addFinding(
      findings,
      "V1_RECORD_ID_ORDER",
      path,
      "Record IDs must use deterministic UTF-16 code-unit order.",
    );
  }
  return records;
}

function requireSortedUniqueStringArray(
  value: unknown,
  path: string,
  findings: V1ContractFinding[],
  options: Readonly<{ allowEmpty?: boolean }> = {},
): string[] {
  const values = stringArray(value);
  if (values === null || (!options.allowEmpty && values.length === 0)) {
    addFinding(
      findings,
      "V1_LINK_ARRAY_SHAPE",
      path,
      "Link arrays must contain strings and satisfy the declared emptiness policy.",
    );
    return [];
  }
  if (new Set(values).size !== values.length) {
    addFinding(
      findings,
      "V1_LINK_ARRAY_DUPLICATE",
      path,
      "Link arrays must not repeat an ID.",
    );
  }
  if (!sameJson(values, [...values].sort(codeUnitCompare))) {
    addFinding(
      findings,
      "V1_LINK_ARRAY_ORDER",
      path,
      "Link arrays must use deterministic UTF-16 code-unit order.",
    );
  }
  return values;
}

function requireKnownLinks(
  links: readonly string[],
  known: ReadonlySet<string>,
  path: string,
  findings: V1ContractFinding[],
): void {
  links.forEach((link, index) => {
    if (!known.has(link)) {
      addFinding(
        findings,
        "V1_LINK_UNKNOWN",
        `${path}[${String(index)}]`,
        `Unknown linked ID ${JSON.stringify(link)}.`,
      );
    }
  });
}

function boundedJson(
  value: unknown,
  path: string,
  findings: V1ContractFinding[],
  depth = 0,
): void {
  if (depth > 24) {
    addFinding(
      findings,
      "V1_JSON_DEPTH",
      path,
      "Fixture nesting exceeds the reviewed depth 24.",
    );
    return;
  }
  if (typeof value === "string" && value.length > 4_096) {
    addFinding(
      findings,
      "V1_STRING_BOUND",
      path,
      "Fixture strings are bounded to 4,096 UTF-16 code units.",
    );
  } else if (Array.isArray(value)) {
    if (value.length > 512) {
      addFinding(
        findings,
        "V1_ARRAY_BOUND",
        path,
        "Fixture arrays are bounded to 512 records.",
      );
    }
    value.forEach((child, index) => {
      boundedJson(child, `${path}[${String(index)}]`, findings, depth + 1);
    });
  } else if (isObject(value)) {
    Object.entries(value).forEach(([key, child]) => {
      boundedJson(child, `${path}.${key}`, findings, depth + 1);
    });
  }
}

async function loadFixtures(
  fixtureRoot: string,
  findings: V1ContractFinding[],
): Promise<Map<V1FixtureFilename, ParsedFixture>> {
  const parsed = new Map<V1FixtureFilename, ParsedFixture>();
  let entries: Dirent[];
  try {
    entries = await readdir(fixtureRoot, { withFileTypes: true });
  } catch (error) {
    addFinding(
      findings,
      "V1_FIXTURE_ROOT_READ",
      fixtureRoot,
      error instanceof Error ? error.message : String(error),
    );
    return parsed;
  }

  const actualNames = entries.map((entry) => entry.name).sort(codeUnitCompare);
  const expectedNames = [...EXPECTED_FILES].sort(codeUnitCompare);
  requireExact(
    actualNames,
    expectedNames,
    "V1_FIXTURE_INVENTORY",
    fixtureRoot,
    "The fixture root must contain exactly the nine reviewed entries.",
    findings,
  );
  for (const entry of entries) {
    if (!entry.isFile()) {
      addFinding(
        findings,
        "V1_FIXTURE_ENTRY_KIND",
        `${fixtureRoot}/${entry.name}`,
        "Every declared fixture entry must be a regular file.",
      );
    }
  }

  for (const filename of EXPECTED_FILES) {
    const absolute = resolve(fixtureRoot, filename);
    let source: string;
    try {
      source = await readFile(absolute, "utf8");
    } catch (error) {
      addFinding(
        findings,
        "V1_FIXTURE_READ",
        filename,
        error instanceof Error ? error.message : String(error),
      );
      continue;
    }
    if (Buffer.byteLength(source, "utf8") > 262_144) {
      addFinding(
        findings,
        "V1_FIXTURE_BYTE_BOUND",
        filename,
        "Each reviewed fixture is bounded to 262,144 UTF-8 bytes.",
      );
    }
    for (const duplicate of duplicateJsonKeys(source)) {
      addFinding(
        findings,
        "V1_JSON_DUPLICATE_KEY",
        `${filename}:${duplicate}`,
        "Decoded duplicate JSON keys are forbidden.",
      );
    }
    let root: unknown;
    try {
      root = JSON.parse(source) as unknown;
    } catch (error) {
      addFinding(
        findings,
        "V1_JSON_PARSE",
        filename,
        error instanceof Error ? error.message : String(error),
      );
      continue;
    }
    if (!isObject(root)) {
      addFinding(
        findings,
        "V1_JSON_ROOT_SHAPE",
        filename,
        "Every fixture root must be an object.",
      );
      continue;
    }
    boundedJson(root, filename, findings);
    const byteDigest = sha256(source);
    const semanticDigest = sha256(stableJson(root));
    parsed.set(filename, { filename, root, byteDigest, semanticDigest });
  }
  return parsed;
}

function validateFixtureEnvelope(
  fixture: ParsedFixture,
  findings: V1ContractFinding[],
): void {
  const { filename, root } = fixture;
  requireExact(
    root["schema"],
    EXPECTED_SCHEMAS[filename],
    "V1_SCHEMA",
    `${filename}.schema`,
    "Fixture schema must equal the independently reviewed schema.",
    findings,
  );
  requireExact(
    root["fixtureVersion"],
    "1.0.0",
    "V1_FIXTURE_VERSION",
    `${filename}.fixtureVersion`,
    "Every V1 fixture uses semantic fixture version 1.0.0.",
    findings,
  );
  requireExact(
    root["status"],
    "independently-authored-pre-production",
    "V1_INDEPENDENCE_STATUS",
    `${filename}.status`,
    "Fixture authoring status must remain explicit.",
    findings,
  );
  requireExact(
    root["productionOutputUsed"],
    false,
    "V1_PRODUCTION_AUTHORITY",
    `${filename}.productionOutputUsed`,
    "Production output may not author fixture expectations.",
    findings,
  );
  requireExact(
    root["expectedValuesGenerated"],
    false,
    "V1_EXPECTATION_GENERATION",
    `${filename}.expectedValuesGenerated`,
    "Expected values must be literal reviewed data.",
    findings,
  );
  requireExact(
    Object.keys(root).sort(codeUnitCompare),
    [...EXPECTED_TOP_LEVEL_KEYS[filename]].sort(codeUnitCompare),
    "V1_TOP_LEVEL_KEYS",
    filename,
    "Fixture top-level keys must match the reviewed inventory exactly.",
    findings,
  );

  const expectedByte = EXPECTED_BYTE_DIGESTS[filename];
  const expectedSemantic = EXPECTED_SEMANTIC_DIGESTS[filename];
  if (expectedByte === null || expectedSemantic === null) {
    addFinding(
      findings,
      "V1_DIGEST_UNPINNED",
      filename,
      "Byte and semantic digests must be reviewed and pinned before the contract can pass.",
    );
  } else {
    requireExact(
      fixture.byteDigest,
      expectedByte,
      "V1_BYTE_DIGEST",
      filename,
      "Fixture bytes differ from the reviewed digest.",
      findings,
    );
    requireExact(
      fixture.semanticDigest,
      expectedSemantic,
      "V1_SEMANTIC_DIGEST",
      filename,
      "Fixture semantics differ from the reviewed canonical digest.",
      findings,
    );
  }
}

export async function validateV1Contract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
): Promise<V1ContractValidationReport> {
  const findings: V1ContractFinding[] = [];
  const fixtures = await loadFixtures(fixtureRoot, findings);
  for (const fixture of fixtures.values()) {
    validateFixtureEnvelope(fixture, findings);
  }

  const root = (filename: V1FixtureFilename): JsonObject =>
    fixtures.get(filename)?.root ?? {};
  const manifest = root(CONTRACT_FILENAME);
  const assignment = root("assignment-cases.json");
  const laws = root("law-cases.json");
  const operationStates = root("operation-state-cases.json");
  const limits = root("limit-cases.json");
  const mutations = root("mutation-controls.json");
  const provenance = root("provenance-ledger.json");
  const traceLedger = root("trace-ledger.json");

  for (const [key, expected] of Object.entries(V1_REVIEWED_PUBLIC_CONTRACT)) {
    requireExact(
      manifest[key],
      expected,
      "V1_PUBLIC_CONTRACT",
      `${CONTRACT_FILENAME}.${key}`,
      `Manifest field ${key} differs from reviewed independent authority.`,
      findings,
    );
  }
  requireExact(
    manifest["declaredFiles"],
    [...EXPECTED_FILES].sort(codeUnitCompare),
    "V1_DECLARED_FILES",
    `${CONTRACT_FILENAME}.declaredFiles`,
    "The manifest must declare exactly the reviewed sorted file inventory.",
    findings,
  );

  const voiceSets = reviewedRecords(
    assignment,
    "voiceSets",
    "assignment-cases.json.voiceSets",
    findings,
  );
  const assignmentCases = reviewedRecords(
    assignment,
    "cases",
    "assignment-cases.json.cases",
    findings,
  );
  const lawCases = reviewedRecords(
    laws,
    "cases",
    "law-cases.json.cases",
    findings,
  );
  const operationStateCases = reviewedRecords(
    operationStates,
    "cases",
    "operation-state-cases.json.cases",
    findings,
  );
  const publicLimitCases = reviewedRecords(
    limits,
    "publicBoundaries",
    "limit-cases.json.publicBoundaries",
    findings,
  );
  const derivedLimitProbes = reviewedRecords(
    limits,
    "derivedAccountingProbes",
    "limit-cases.json.derivedAccountingProbes",
    findings,
  );
  const mutationControls = reviewedRecords(
    mutations,
    "controls",
    "mutation-controls.json.controls",
    findings,
  );
  const traces = reviewedRecords(
    traceLedger,
    "traces",
    "trace-ledger.json.traces",
    findings,
  );
  const authorities = reviewedRecords(
    provenance,
    "authorities",
    "provenance-ledger.json.authorities",
    findings,
  );

  requireExact(
    assignmentCases.map(idOf),
    Array.from({ length: 18 }, (_, index) =>
      `V1-ASN-${String(index + 1).padStart(3, "0")}`,
    ),
    "V1_ASSIGNMENT_CASE_INVENTORY",
    "assignment-cases.json.cases",
    "The reviewed assignment matrix is exactly V1-ASN-001 through V1-ASN-018.",
    findings,
  );
  requireExact(
    lawCases.map(idOf),
    Array.from({ length: 12 }, (_, index) =>
      `V1-LAW-${String(index + 1).padStart(3, "0")}`,
    ),
    "V1_LAW_CASE_INVENTORY",
    "law-cases.json.cases",
    "The reviewed law inventory is exactly V1-LAW-001 through V1-LAW-012.",
    findings,
  );
  requireExact(
    operationStateCases.map(idOf),
    Array.from({ length: 17 }, (_, index) =>
      `V1-OP-${String(index + 1).padStart(3, "0")}`,
    ),
    "V1_OPERATION_CASE_INVENTORY",
    "operation-state-cases.json.cases",
    "The reviewed operation-state inventory is exactly V1-OP-001 through V1-OP-017.",
    findings,
  );
  requireExact(
    mutationControls.map(idOf),
    Array.from({ length: 37 }, (_, index) =>
      `V1-MUT-${String(index + 1).padStart(3, "0")}`,
    ),
    "V1_MUTATION_INVENTORY",
    "mutation-controls.json.controls",
    "The reviewed mutation inventory is exactly V1-MUT-001 through V1-MUT-037.",
    findings,
  );
  requireExact(
    traces.map(idOf),
    V1_REVIEWED_TRACE_IDS,
    "V1_TRACE_INVENTORY",
    "trace-ledger.json.traces",
    "Trace IDs must equal the stable reviewed inventory.",
    findings,
  );
  requireExact(
    authorities.map(idOf),
    V1_REVIEWED_AUTHORITY_IDS,
    "V1_AUTHORITY_INVENTORY",
    "provenance-ledger.json.authorities",
    "Authority IDs must equal the stable reviewed inventory.",
    findings,
  );
  requireExact(
    publicLimitCases.length,
    9,
    "V1_LIMIT_PUBLIC_COUNT",
    "limit-cases.json.publicBoundaries",
    "Nine public boundary records are required.",
    findings,
  );
  requireExact(
    derivedLimitProbes.length,
    29,
    "V1_LIMIT_PROBE_COUNT",
    "limit-cases.json.derivedAccountingProbes",
    "Every work and memory population needs a reviewed exact-plus-one probe.",
    findings,
  );

  const allCases = [...assignmentCases, ...lawCases, ...operationStateCases];
  const caseMap = new Map<string, JsonObject>();
  allCases.forEach((record) => {
    const id = idOf(record);
    if (id === null) return;
    if (caseMap.has(id)) {
      addFinding(
        findings,
        "V1_CASE_ID_DUPLICATE",
        id,
        "Case IDs must be unique across assignment, law, and operation corpora.",
      );
    }
    caseMap.set(id, record);
  });
  const caseIds = new Set(caseMap.keys());
  const traceMap = new Map(
    traces.flatMap((record) => {
      const id = idOf(record);
      return id === null ? [] : [[id, record] as const];
    }),
  );
  const authorityMap = new Map(
    authorities.flatMap((record) => {
      const id = idOf(record);
      return id === null ? [] : [[id, record] as const];
    }),
  );
  const mutationMap = new Map(
    mutationControls.flatMap((record) => {
      const id = idOf(record);
      return id === null ? [] : [[id, record] as const];
    }),
  );
  const traceIds = new Set(traceMap.keys());
  const authorityIds = new Set(authorityMap.keys());
  const mutationIds = new Set(mutationMap.keys());

  for (const [id, record] of caseMap) {
    const caseTraceIds = requireSortedUniqueStringArray(
      record["traceIds"],
      `${id}.traceIds`,
      findings,
    );
    const caseAuthorityIds = requireSortedUniqueStringArray(
      record["authorityIds"],
      `${id}.authorityIds`,
      findings,
    );
    requireKnownLinks(caseTraceIds, traceIds, `${id}.traceIds`, findings);
    requireKnownLinks(
      caseAuthorityIds,
      authorityIds,
      `${id}.authorityIds`,
      findings,
    );
  }

  let mutationDirectKillerLinks = 0;
  for (const [id, record] of mutationMap) {
    requireExact(
      Object.keys(record).sort(codeUnitCompare),
      [
        "authorityIds",
        "faultFamily",
        "id",
        "killedByCaseIds",
        "mutatedFault",
        "operator",
        "traceIds",
      ],
      "V1_MUTATION_KEYS",
      id,
      "Mutation records must have exactly the seven reviewed fields.",
      findings,
    );
    const killers = requireSortedUniqueStringArray(
      record["killedByCaseIds"],
      `${id}.killedByCaseIds`,
      findings,
    );
    const linkedTraces = requireSortedUniqueStringArray(
      record["traceIds"],
      `${id}.traceIds`,
      findings,
    );
    const linkedAuthorities = requireSortedUniqueStringArray(
      record["authorityIds"],
      `${id}.authorityIds`,
      findings,
    );
    mutationDirectKillerLinks += killers.length;
    requireKnownLinks(killers, caseIds, `${id}.killedByCaseIds`, findings);
    requireKnownLinks(linkedTraces, traceIds, `${id}.traceIds`, findings);
    requireKnownLinks(
      linkedAuthorities,
      authorityIds,
      `${id}.authorityIds`,
      findings,
    );
  }

  for (const record of lawCases) {
    const id = idOf(record) ?? "unknown-law";
    for (const field of [
      "positiveCaseIds",
      "nearMissCaseIds",
      "transpositionCaseIds",
    ] as const) {
      const links = requireSortedUniqueStringArray(
        record[field],
        `${id}.${field}`,
        findings,
      );
      requireKnownLinks(links, caseIds, `${id}.${field}`, findings);
    }
    const controls = requireSortedUniqueStringArray(
      record["mutationControlIds"],
      `${id}.mutationControlIds`,
      findings,
    );
    requireKnownLinks(controls, mutationIds, `${id}.mutationControlIds`, findings);
  }

  for (const [id, record] of traceMap) {
    const linkedCases = requireSortedUniqueStringArray(
      record["caseIds"],
      `${id}.caseIds`,
      findings,
    );
    const linkedMutations = requireSortedUniqueStringArray(
      record["mutationControlIds"],
      `${id}.mutationControlIds`,
      findings,
    );
    const linkedAuthorities = requireSortedUniqueStringArray(
      record["authorityIds"],
      `${id}.authorityIds`,
      findings,
    );
    requireKnownLinks(linkedCases, caseIds, `${id}.caseIds`, findings);
    requireKnownLinks(
      linkedMutations,
      mutationIds,
      `${id}.mutationControlIds`,
      findings,
    );
    requireKnownLinks(
      linkedAuthorities,
      authorityIds,
      `${id}.authorityIds`,
      findings,
    );
    linkedCases.forEach((caseId) => {
      const reciprocal = stringArray(caseMap.get(caseId)?.["traceIds"]);
      if (reciprocal === null || !reciprocal.includes(id)) {
        addFinding(
          findings,
          "V1_TRACE_CASE_RECIPROCAL",
          `${id}.caseIds`,
          `${caseId} does not link back to ${id}.`,
        );
      }
    });
    linkedMutations.forEach((mutationId) => {
      const reciprocal = stringArray(mutationMap.get(mutationId)?.["traceIds"]);
      if (reciprocal === null || !reciprocal.includes(id)) {
        addFinding(
          findings,
          "V1_TRACE_MUTATION_RECIPROCAL",
          `${id}.mutationControlIds`,
          `${mutationId} does not link back to ${id}.`,
        );
      }
    });
    linkedAuthorities.forEach((authorityId) => {
      const reciprocal = stringArray(authorityMap.get(authorityId)?.["traceIds"]);
      if (reciprocal === null || !reciprocal.includes(id)) {
        addFinding(
          findings,
          "V1_TRACE_AUTHORITY_RECIPROCAL",
          `${id}.authorityIds`,
          `${authorityId} does not link back to ${id}.`,
        );
      }
    });
  }

  for (const [id, record] of mutationMap) {
    const linkedTraces = stringArray(record["traceIds"]) ?? [];
    linkedTraces.forEach((traceId) => {
      const reciprocal = stringArray(
        traceMap.get(traceId)?.["mutationControlIds"],
      );
      if (reciprocal === null || !reciprocal.includes(id)) {
        addFinding(
          findings,
          "V1_MUTATION_TRACE_RECIPROCAL",
          `${id}.traceIds`,
          `${traceId} does not link back to ${id}.`,
        );
      }
    });
  }

  requireExact(
    (limits["derivedProbePolicy"] as JsonObject | undefined)?.["publiclyReachable"],
    false,
    "V1_LIMIT_PROBE_PUBLICATION",
    "limit-cases.json.derivedProbePolicy.publiclyReachable",
    "Derived exact-plus-one accounting probes must not masquerade as public requests.",
    findings,
  );
  requireExact(
    (limits["memoryPopulationLimits"] as JsonObject | undefined)?.[
      "peakTrackedRecords"
    ],
    399,
    "V1_TRACKED_RECORD_TOTAL",
    "limit-cases.json.memoryPopulationLimits.peakTrackedRecords",
    "The reviewed conservative tracked-record total is 399.",
    findings,
  );

  const report: V1ContractValidationReport = {
    schema: "changes.validation.v1-contract.v1",
    package: "V1",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      files: fixtures.size,
      voiceSets: voiceSets.length,
      assignmentCases: assignmentCases.length,
      lawCases: lawCases.length,
      operationStateCases: operationStateCases.length,
      publicLimitCases: publicLimitCases.length,
      derivedLimitProbes: derivedLimitProbes.length,
      mutationControls: mutationControls.length,
      mutationDirectKillerLinks,
      traces: traces.length,
      authorities: authorities.length,
    },
    findings: [...findings].sort(findingOrder),
  };
  return deepFreeze(report);
}

function parseFixtureRootArgument(args: readonly string[]): string {
  if (args.length === 0) return DEFAULT_FIXTURE_ROOT;
  if (args.length === 2 && args[0] === "--fixture-root") {
    return resolve(args[1] ?? "");
  }
  throw new Error("usage: bun scripts/validate-v1-contract.ts [--fixture-root PATH]");
}

if (import.meta.main) {
  try {
    const fixtureRoot = parseFixtureRootArgument(process.argv.slice(2));
    const report = await validateV1Contract(fixtureRoot);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.outcome === "pass" ? 0 : 1);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          schema: "changes.validation.v1-contract.v1",
          package: "V1",
          outcome: "error",
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }
}
