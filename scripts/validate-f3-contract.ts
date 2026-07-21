import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type F3ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type F3ContractValidationReport = Readonly<{
  schema: "changes.validation.f3-contract.v1";
  package: "F3";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    documentCases: number;
    operationStateCases: number;
    mutationControls: number;
    traces: number;
    authorities: number;
    issueCodesCovered: number;
  }>;
  findings: readonly F3ContractFinding[];
}>;

type ParsedFixture = Readonly<{
  filename: string;
  source: string;
  root: JsonObject;
  byteDigest: string;
}>;

type LinkedRecord = Readonly<{
  id: string;
  path: string;
  record: JsonObject;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

const CONTRACT_FILENAME = "f3-publication-contract.json";

export const F3_REVIEWED_COMPANIONS = [
  "document-cases.json",
  "mutation-controls.json",
  "operation-state-cases.json",
  "provenance-ledger.json",
  "trace-ledger.json",
] as const;

const EXPECTED_FILES = [CONTRACT_FILENAME, ...F3_REVIEWED_COMPANIONS] as const;
type ExpectedFilename = (typeof EXPECTED_FILES)[number];
type CompanionFilename = (typeof F3_REVIEWED_COMPANIONS)[number];

const EXPECTED_SCHEMAS: Readonly<Record<ExpectedFilename, string>> = {
  "f3-publication-contract.json":
    "changes.fixtures.f3-publication-contract.v1",
  "document-cases.json": "changes.fixtures.f3-document-cases.v1",
  "mutation-controls.json": "changes.fixtures.f3-mutation-controls.v1",
  "operation-state-cases.json":
    "changes.fixtures.f3-operation-state-cases.v1",
  "provenance-ledger.json": "changes.fixtures.f3-provenance-ledger.v1",
  "trace-ledger.json": "changes.fixtures.f3-trace-ledger.v1",
};

const EXPECTED_TOP_LEVEL_KEYS: Readonly<
  Record<ExpectedFilename, readonly string[]>
> = {
  "f3-publication-contract.json": [
    "applicability",
    "beadId",
    "companions",
    "contractVersion",
    "coverageSummary",
    "description",
    "expectedValuesGenerated",
    "handoff",
    "identities",
    "independence",
    "issueCodes",
    "limits",
    "ordering",
    "package",
    "policies",
    "productionOutputUsed",
    "publicSurface",
    "reviewedFileSha256",
    "schema",
    "terminations",
    "workCounterOrder",
  ],
  "document-cases.json": [
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "materializationProtocol",
    "productionOutputUsed",
    "schema",
    "templates",
  ],
  "mutation-controls.json": [
    "claim",
    "controls",
    "executionOwner",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
  ],
  "operation-state-cases.json": [
    "applicabilityVocabulary",
    "cases",
    "expectedValuesGenerated",
    "fixtureVersion",
    "productionOutputUsed",
    "schema",
  ],
  "provenance-ledger.json": [
    "authoringStatement",
    "authorities",
    "classificationPolicy",
    "expectedValuesGenerated",
    "ledgerVersion",
    "productionOutputUsed",
    "reviewState",
    "schema",
  ],
  "trace-ledger.json": ["fixtureVersion", "schema", "tracePolicy", "traces"],
};

export const F3_REVIEWED_BYTE_DIGESTS: Readonly<
  Record<CompanionFilename, string>
> = {
  "document-cases.json":
    "1b82c3fc3775ca87fd30f38a2a95d10226b0ff052b3095320f05e1e21f6b163f",
  "mutation-controls.json":
    "fb79dbeac2b4b80da57e6d935363cee0eed4f3c7b9d472f131cf5ccfba0f6ee8",
  "operation-state-cases.json":
    "c84e522503e808b8521f3684882962a70b7b33d6ea1eaa575792240e8b4ccc1d",
  "provenance-ledger.json":
    "75e45e512491445ca3dee6f52aadfa2bd8d3134711db880af721c27edc5fa3de",
  "trace-ledger.json":
    "4b1361684b3c061700e643d0d4c305fbc16e16a1035336b71ff7724ebdce408d",
};

export const F3_REVIEWED_PUBLIC_SURFACE = {
  module: "src/application/document-validation-contract.ts",
  implementationModule: "src/application/document-validation.ts",
  contractSchema: "changes.application.document-validation-contract.v1",
  operationOrder: ["validateDocumentSemantics"],
  signature:
    "(candidate:ProgressionDocumentShapeV2)=>DocumentSemanticValidationResult",
  successOwnKeys: ["ok", "value", "warnings"],
  failureOwnKeys: ["ok", "errors"],
  issueOwnKeys: ["code", "path", "message"],
  warnings: "exact-empty-tuple",
  soleCastFile: "src/application/document-validation.ts",
  evidenceReexportedFromApplicationIndex: false,
} as const;

export const F3_REVIEWED_IDENTITIES = {
  semanticPolicy: { id: "changes.document-semantics", version: 1 },
  sourceAstPolicy: {
    id: "changes.document-source-ast-equivalence",
    version: 1,
  },
  storedPitchPolicy: {
    id: "changes.document-stored-pitch-correspondence",
    version: 1,
  },
  measurePolicy: { id: "changes.document-measure-semantics", version: 1 },
} as const;

export const F3_REVIEWED_ISSUE_CODES = [
  "chord.source_semantic_mismatch",
  "custom.pitch_voicing_mismatch",
  "measure.empty_has_events",
  "measure.nonempty_has_no_events",
  "measure.complete_duration_mismatch",
  "measure.duration_over_capacity",
  "measure.expected_duration_not_short",
  "measure.expected_duration_not_positive",
  "measure.expected_duration_mismatch",
  "measure.reason_blank",
] as const;

export const F3_REVIEWED_ORDERING = {
  eventCheckOrder: ["source-ast", "resolution", "stored-or-auto-voicing"],
  measureCheckOrder: [
    "event-cardinality",
    "completion",
    "capacity-crossing",
    "expected-duration",
    "reason",
  ],
  finalDiagnosticOrder: ["path", "code"],
  duplicatePolicy: "collapse-exact-code-and-path-only",
  independentFindingsCollected: true,
} as const;

export const F3_REVIEWED_POLICIES = {
  sourceParseAccidentalStyle: "ascii",
  sourceAstFields: [
    "root",
    "triad",
    "sixth",
    "seventh",
    "extensions",
    "additions",
    "alterations",
    "omissions",
    "bass",
    "colorPolicy",
  ],
  storedPitchComparison: "exact-written-pitch-class-set",
  slashBassProjection: "exclude-exact-spelled-lowest-included-bass-unisons",
  autoRange: "inclusive-midi-cardinality-at-least-voice-count",
  alteredDominant: "preserve-four-realizations-without-selection",
  custom: "never-parse-display-text-and-never-auto-voice",
  familyAvailabilityOwner: "V0",
  measureCapacity: "beatsPerBar * 4 / beatUnit in exact quarter-note beats",
  repair: "forbidden",
  diagnosticPrivacy: "no-chart-text-ids-labels-annotations-or-hostile-values",
} as const;

export const F3_REVIEWED_LIMITS = {
  sectionsVisited: 64,
  measuresVisited: 65_536,
  eventsVisited: 8_192,
  symbolParseCalls: 8_192,
  resolutionCalls: 8_192,
  voicingChecks: 8_192,
  exactBeatAdditions: 16_384,
  publicationNodeVisits: 73_793,
  issuesPerEvent: 3,
  issuesPerMeasure: 4,
  semanticIssues: 286_720,
  trackedRecords: 368_705,
} as const;

export const F3_REVIEWED_WORK_COUNTER_ORDER = [
  "sectionsVisited",
  "measuresVisited",
  "eventsVisited",
  "symbolParseCalls",
  "resolutionCalls",
  "voicingChecks",
  "exactBeatAdditions",
  "publicationNodeVisits",
  "issuesEmitted",
] as const;

export const F3_REVIEWED_TERMINATIONS = [
  "complete-success",
  "complete-refusal",
] as const;

export const F3_REVIEWED_APPLICABILITY = {
  cancellation: "not-applicable:synchronous-bounded",
  staleRevision: "not-applicable:revision-free-value-operation",
  resume: "not-applicable:non-resumable",
  wallTimeCutoff: "forbidden:counts-only",
} as const;

const REVIEWED_COVERAGE = {
  documentCases: 45,
  operationStateCases: 8,
  mutationControls: 37,
  traces: 12,
  authorities: 8,
  issueCodesCovered: 10,
  positiveCases: 17,
  refusalOrStageBoundaryCases: 28,
} as const;

const REVIEWED_INDEPENDENCE = {
  fixturesPrecedeProductionImplementation: true,
  productionValidatorMayGenerateExpectedValues: false,
  productionParserOrResolverMayGenerateExpectedValues: false,
  productionOutputMayCertifyItself: false,
  expectedIssueSequencesAreLiteral: true,
  mutationExecutionOwner: "F3/verify",
} as const;

const REVIEWED_HANDOFF = {
  specificationOwner: "F3/spec",
  productionOwner: "F3/build",
  independentProofOwner: "F3/verify",
  requiredDocument: "docs/F3_PUBLICATION_CONTRACT.md",
  forbiddenShortcuts: [
    "cast before every check completes",
    "treat F2 success as publication",
    "parse Custom display text",
    "compare spelling by pitch class",
    "select or union altered realizations",
    "duplicate V0 family availability",
    "use floating point or wall time for measure truth",
    "return only the first error",
    "repair persisted data",
    "mutate application state or call adapters",
  ],
} as const;

const DOCUMENT_CASE_IDS = Array.from(
  { length: REVIEWED_COVERAGE.documentCases },
  (_, index) => `F3-DOC-${String(index + 1).padStart(3, "0")}`,
);
const OPERATION_CASE_IDS = Array.from(
  { length: REVIEWED_COVERAGE.operationStateCases },
  (_, index) => `F3-OPSTATE-${String(index + 1).padStart(3, "0")}`,
);
const MUTATION_IDS = Array.from(
  { length: REVIEWED_COVERAGE.mutationControls },
  (_, index) => `F3-MUT-${String(index + 1).padStart(3, "0")}`,
);
const TRACE_IDS = [
  "F3-TRACE-BOUNDARY",
  "F3-TRACE-SOURCE-AST",
  "F3-TRACE-RESOLUTION",
  "F3-TRACE-ALT",
  "F3-TRACE-STORED-PITCH",
  "F3-TRACE-CUSTOM",
  "F3-TRACE-AUTO-RANGE",
  "F3-TRACE-MEASURE",
  "F3-TRACE-DIAGNOSTICS",
  "F3-TRACE-TRANSACTION",
  "F3-TRACE-BOUNDS",
  "F3-TRACE-LEGACY",
] as const;
const AUTHORITY_IDS = [
  "F3-AUTH-ARCHITECTURE",
  "F3-AUTH-DOMAIN",
  "F3-AUTH-SYNTAX",
  "F3-AUTH-RESOLUTION",
  "F3-AUTH-MEASURE",
  "F3-AUTH-VOICING",
  "F3-AUTH-INDEPENDENCE",
  "F3-AUTH-LEGACY",
] as const;

const ALLOWED_AUTHORITY_CLASSES = new Set([
  "reviewed-project-policy",
  "reviewed-domain-law",
  "reviewed-theory-law",
  "independent-adversarial-design",
]);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) && value.every(isObject) ? value : [];
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function idOf(value: JsonObject): string | null {
  return typeof value["id"] === "string" ? value["id"] : null;
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function finding(
  findings: F3ContractFinding[],
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
  findings: F3ContractFinding[],
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    finding(findings, code, path, message);
  }
}

function pathString(path: readonly (string | number)[]): string {
  return path.length === 0
    ? "$"
    : `$${path.map((item) => `[${JSON.stringify(item)}]`).join("")}`;
}

/** Detect decoded duplicate keys before JSON.parse applies last-key-wins. */
function duplicateJsonKeys(source: string): readonly string[] {
  let cursor = 0;
  const duplicates: string[] = [];

  const whitespace = (): void => {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  };

  const stringToken = (): Readonly<{
    decoded: string;
    start: number;
  }> | null => {
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
    while (cursor < source.length && !/[\s,\]}]/u.test(source[cursor] ?? "")) {
      cursor += 1;
    }
  };

  value([]);
  return duplicates.sort();
}

function findingOrder(
  left: F3ContractFinding,
  right: F3ContractFinding,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function compareDomainPath(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart - rightPart;
    }
    if (typeof leftPart === "string" && typeof rightPart === "string") {
      return leftPart < rightPart ? -1 : 1;
    }
    return typeof leftPart === "number" ? -1 : 1;
  }
  return left.length - right.length;
}

function domainPath(value: unknown): readonly (string | number)[] | null {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) =>
        (typeof item === "string" && item.length > 0) ||
        (typeof item === "number" && Number.isSafeInteger(item) && item >= 0),
    )
  ) {
    return null;
  }
  return value as readonly (string | number)[];
}

function uniqueStrings(
  value: unknown,
  code: string,
  path: string,
  findings: F3ContractFinding[],
): readonly string[] {
  const result = strings(value);
  if (
    result === null ||
    result.length === 0 ||
    new Set(result).size !== result.length
  ) {
    finding(
      findings,
      code,
      path,
      "Expected a nonempty duplicate-free string array.",
    );
    return [];
  }
  return result;
}

function linkedRecords(
  values: JsonObject[],
  filename: string,
  collection: string,
  expectedIds: readonly string[],
  findings: F3ContractFinding[],
): LinkedRecord[] {
  requireExact(
    values.map(idOf),
    expectedIds,
    "F3_CONTRACT_ID_SEQUENCE",
    `${filename}.${collection}`,
    "Reviewed IDs or their declaration order changed.",
    findings,
  );
  const seen = new Set<string>();
  const records: LinkedRecord[] = [];
  values.forEach((record, index) => {
    const path = `${filename}.${collection}[${String(index)}]`;
    const id = idOf(record);
    if (id === null || seen.has(id)) {
      finding(
        findings,
        "F3_CONTRACT_ID",
        `${path}.id`,
        "Every record requires one unique stable ID.",
      );
      return;
    }
    seen.add(id);
    records.push({
      id,
      path,
      record,
      traceIds: uniqueStrings(
        record["traceIds"],
        "F3_CONTRACT_TRACE",
        `${path}.traceIds`,
        findings,
      ),
      authorityIds: uniqueStrings(
        record["authorityIds"],
        "F3_CONTRACT_AUTHORITY",
        `${path}.authorityIds`,
        findings,
      ),
    });
  });
  return records;
}

function checkManifest(
  contract: JsonObject,
  findings: F3ContractFinding[],
): void {
  requireExact(
    {
      contractVersion: contract["contractVersion"],
      package: contract["package"],
      beadId: contract["beadId"],
      companions: contract["companions"],
    },
    {
      contractVersion: "1.0.0",
      package: "F3",
      beadId: "jcpe-milestone-foundation-vc2.6.1",
      companions: F3_REVIEWED_COMPANIONS,
    },
    "F3_CONTRACT_MANIFEST",
    CONTRACT_FILENAME,
    "F3 identity or reviewed companion inventory changed.",
    findings,
  );
  const comparisons: readonly [string, unknown, unknown][] = [
    ["publicSurface", contract["publicSurface"], F3_REVIEWED_PUBLIC_SURFACE],
    ["identities", contract["identities"], F3_REVIEWED_IDENTITIES],
    ["issueCodes", contract["issueCodes"], F3_REVIEWED_ISSUE_CODES],
    ["ordering", contract["ordering"], F3_REVIEWED_ORDERING],
    ["policies", contract["policies"], F3_REVIEWED_POLICIES],
    ["limits", contract["limits"], F3_REVIEWED_LIMITS],
    [
      "workCounterOrder",
      contract["workCounterOrder"],
      F3_REVIEWED_WORK_COUNTER_ORDER,
    ],
    ["terminations", contract["terminations"], F3_REVIEWED_TERMINATIONS],
    ["applicability", contract["applicability"], F3_REVIEWED_APPLICABILITY],
    ["coverageSummary", contract["coverageSummary"], REVIEWED_COVERAGE],
    ["independence", contract["independence"], REVIEWED_INDEPENDENCE],
    ["handoff", contract["handoff"], REVIEWED_HANDOFF],
    [
      "reviewedFileSha256",
      contract["reviewedFileSha256"],
      F3_REVIEWED_BYTE_DIGESTS,
    ],
  ];
  for (const [field, actual, expected] of comparisons) {
    requireExact(
      actual,
      expected,
      field === "independence"
        ? "F3_CONTRACT_INDEPENDENCE"
        : "F3_CONTRACT_MANIFEST",
      `${CONTRACT_FILENAME}.${field}`,
      `Reviewed ${field} changed.`,
      findings,
    );
  }
  if (
    typeof contract["description"] !== "string" ||
    contract["description"].trim().length === 0
  ) {
    finding(
      findings,
      "F3_CONTRACT_MANIFEST",
      `${CONTRACT_FILENAME}.description`,
      "The reviewed handoff requires a nonempty description.",
    );
  }
}

function checkExpectedDocumentResult(
  record: LinkedRecord,
  issueCoverage: Set<string>,
  findings: F3ContractFinding[],
): "success" | "refusal" | "stage-boundary" | "invalid" {
  const expected = record.record["expected"];
  if (!isObject(expected)) {
    finding(
      findings,
      "F3_CONTRACT_EXPECTED",
      `${record.path}.expected`,
      "Every document case requires a literal expected object.",
    );
    return "invalid";
  }
  if (expected["ok"] === true) {
    if (
      expected["publication"] !== true ||
      expected["termination"] !== "complete-success" ||
      !Array.isArray(expected["warnings"]) ||
      expected["warnings"].length !== 0
    ) {
      finding(
        findings,
        "F3_CONTRACT_EXPECTED",
        `${record.path}.expected`,
        "A publication success requires true publication, exact empty warnings, and complete-success.",
      );
    }
    return "success";
  }
  if (expected["ok"] === false) {
    const errors = objects(expected["errors"]);
    if (
      errors.length === 0 ||
      expected["partialValue"] !== false ||
      expected["termination"] !== "complete-refusal"
    ) {
      finding(
        findings,
        "F3_CONTRACT_EXPECTED",
        `${record.path}.expected`,
        "A semantic refusal requires nonempty literal errors, no partial value, and complete-refusal.",
      );
    }
    let previous:
      | Readonly<{ path: readonly (string | number)[]; code: string }>
      | undefined;
    const pairs = new Set<string>();
    errors.forEach((error, index) => {
      const path = `${record.path}.expected.errors[${String(index)}]`;
      requireExact(
        Object.keys(error).sort(),
        ["code", "path"],
        "F3_CONTRACT_DIAGNOSTIC",
        path,
        "Independent expected diagnostics contain only literal code and path.",
        findings,
      );
      const code = error["code"];
      const issuePath = domainPath(error["path"]);
      if (
        typeof code !== "string" ||
        !F3_REVIEWED_ISSUE_CODES.includes(
          code as (typeof F3_REVIEWED_ISSUE_CODES)[number],
        ) ||
        issuePath === null ||
        issuePath.length === 0
      ) {
        finding(
          findings,
          "F3_CONTRACT_DIAGNOSTIC",
          path,
          "Diagnostic code and nonempty domain path must use the reviewed F3 vocabulary.",
        );
        return;
      }
      issueCoverage.add(code);
      const pair = `${stableJson(issuePath)}\u0000${code}`;
      if (pairs.has(pair)) {
        finding(
          findings,
          "F3_CONTRACT_DIAGNOSTIC_ORDER",
          path,
          "Exact code/path duplicates must already be collapsed.",
        );
      }
      pairs.add(pair);
      if (
        previous !== undefined &&
        (compareDomainPath(previous.path, issuePath) > 0 ||
          (compareDomainPath(previous.path, issuePath) === 0 &&
            previous.code >= code))
      ) {
        finding(
          findings,
          "F3_CONTRACT_DIAGNOSTIC_ORDER",
          path,
          "Expected errors must be strictly sorted by domain path then code.",
        );
      }
      previous = { path: issuePath, code };
    });
    return "refusal";
  }
  if (expected["stage"] === "F2" && expected["f3Invoked"] === false) {
    let reviewed: JsonObject | null = null;
    switch (record.id) {
      case "F3-DOC-040":
        reviewed = {
          stage: "F2",
          f3Invoked: false,
          code: "limit.events_per_document_exceeded",
          path: ["sections"],
        };
        break;
      case "F3-DOC-044":
        reviewed = {
          stage: "F2",
          f3Invoked: false,
          code: "custom.auto_voicing_forbidden",
          path: [
            "sections",
            0,
            "measures",
            0,
            "events",
            0,
            "voicing",
            "mode",
          ],
        };
        break;
      case "F3-DOC-045":
        reviewed = {
          stage: "F2",
          f3Invoked: false,
          code: "voicing.external_without_slash_bass",
          path: [
            "sections",
            0,
            "measures",
            0,
            "events",
            0,
            "voicing",
            "bassPolicy",
          ],
        };
        break;
    }
    requireExact(
      expected,
      reviewed,
      "F3_CONTRACT_EXPECTED",
      `${record.path}.expected`,
      "The pre-F3 boundary must match its reviewed F2 refusal exactly.",
      findings,
    );
    return "stage-boundary";
  }
  finding(
    findings,
    "F3_CONTRACT_EXPECTED",
    `${record.path}.expected`,
    "Expected result is neither publication, semantic refusal, nor the reviewed F2 boundary.",
  );
  return "invalid";
}

function checkDocumentCases(
  root: JsonObject,
  findings: F3ContractFinding[],
): Readonly<{
  records: LinkedRecord[];
  issueCoverage: Set<string>;
  successes: number;
  refusals: number;
  boundaries: number;
}> {
  requireExact(
    Object.keys(isObject(root["templates"]) ? root["templates"] : {}).sort(),
    [
      "representativeAlteredAuto",
      "representativeCustomManual",
      "representativeDbSlashManual",
      "representativeParsedAuto",
      "representativePartial",
    ],
    "F3_CONTRACT_CASE",
    "document-cases.json.templates",
    "The five independently authored document templates changed.",
    findings,
  );
  const records = linkedRecords(
    objects(root["cases"]),
    "document-cases.json",
    "cases",
    DOCUMENT_CASE_IDS,
    findings,
  );
  const templateNames = new Set(
    Object.keys(isObject(root["templates"]) ? root["templates"] : {}),
  );
  const issueCoverage = new Set<string>();
  let successes = 0;
  let refusals = 0;
  let boundaries = 0;
  for (const record of records) {
    requireExact(
      Object.keys(record.record).sort(),
      [
        "authorityIds",
        "category",
        "description",
        "expected",
        "id",
        "input",
        "traceIds",
      ],
      "F3_CONTRACT_CASE",
      record.path,
      "Document case field inventory changed.",
      findings,
    );
    if (
      typeof record.record["category"] !== "string" ||
      typeof record.record["description"] !== "string" ||
      !isObject(record.record["input"])
    ) {
      finding(
        findings,
        "F3_CONTRACT_CASE",
        record.path,
        "Document cases require category, description, and input authority.",
      );
    }
    const input = isObject(record.record["input"]) ? record.record["input"] : {};
    if (
      Object.hasOwn(input, "template") &&
      (typeof input["template"] !== "string" ||
        !templateNames.has(input["template"]))
    ) {
      finding(
        findings,
        "F3_CONTRACT_CASE_REF",
        `${record.path}.input.template`,
        "Input references an unknown reviewed template.",
      );
    }
    if (Object.hasOwn(input, "operations")) {
      const operations = objects(input["operations"]);
      if (!Array.isArray(input["operations"])) {
        finding(
          findings,
          "F3_CONTRACT_CASE",
          `${record.path}.input.operations`,
          "Materialization operations must be an array.",
        );
      }
      operations.forEach((operation, index) => {
        const operationPath = `${record.path}.input.operations[${String(index)}]`;
        if (
          (operation["op"] !== "set" && operation["op"] !== "insert") ||
          domainPath(operation["path"]) === null ||
          (domainPath(operation["path"])?.length ?? 0) === 0 ||
          !Object.hasOwn(operation, "value")
        ) {
          finding(
            findings,
            "F3_CONTRACT_CASE",
            operationPath,
            "Every operation is a set or insert with a nonempty exact path and literal value.",
          );
        }
      });
    }
    const kind = checkExpectedDocumentResult(record, issueCoverage, findings);
    if (kind === "success") successes += 1;
    if (kind === "refusal") refusals += 1;
    if (kind === "stage-boundary") boundaries += 1;
  }
  requireExact(
    { successes, refusals, boundaries },
    { successes: 17, refusals: 25, boundaries: 3 },
    "F3_CONTRACT_COVERAGE",
    "document-cases.json.cases",
    "Publication, refusal, or F2-boundary case counts changed.",
    findings,
  );
  requireExact(
    [...issueCoverage].sort(),
    [...F3_REVIEWED_ISSUE_CODES].sort(),
    "F3_CONTRACT_COVERAGE",
    "document-cases.json.cases.expected.errors",
    "Every reviewed semantic issue code requires literal independent coverage.",
    findings,
  );
  return { records, issueCoverage, successes, refusals, boundaries };
}

function checkOperationCases(
  root: JsonObject,
  findings: F3ContractFinding[],
): LinkedRecord[] {
  requireExact(
    root["applicabilityVocabulary"],
    ["applicable", ...Object.values(F3_REVIEWED_APPLICABILITY)],
    "F3_CONTRACT_MANIFEST",
    "operation-state-cases.json.applicabilityVocabulary",
    "Operation-state applicability vocabulary changed.",
    findings,
  );
  const records = linkedRecords(
    objects(root["cases"]),
    "operation-state-cases.json",
    "cases",
    OPERATION_CASE_IDS,
    findings,
  );
  for (const record of records) {
    const keys = Object.keys(record.record).sort();
    const validKeys = [
      [
        "authorityIds",
        "expected",
        "id",
        "inputRef",
        "operation",
        "scenario",
        "traceIds",
      ],
      [
        "authorityIds",
        "expected",
        "id",
        "inputRefs",
        "operation",
        "scenario",
        "traceIds",
      ],
    ];
    if (!validKeys.some((candidate) => stableJson(keys) === stableJson(candidate))) {
      finding(
        findings,
        "F3_CONTRACT_CASE",
        record.path,
        "Operation-state case field inventory changed.",
      );
    }
    if (
      record.record["operation"] !== "validateDocumentSemantics" ||
      typeof record.record["scenario"] !== "string" ||
      !isObject(record.record["expected"])
    ) {
      finding(
        findings,
        "F3_CONTRACT_CASE",
        record.path,
        "Every operation-state case targets the sole F3 operation with literal expected state.",
      );
    }
  }
  return records;
}

function checkLinkedLedgers(
  caseRecords: readonly LinkedRecord[],
  traces: JsonObject[],
  controls: JsonObject[],
  authorities: JsonObject[],
  findings: F3ContractFinding[],
): void {
  requireExact(
    traces.map(idOf),
    TRACE_IDS,
    "F3_CONTRACT_ID_SEQUENCE",
    "trace-ledger.json.traces",
    "Reviewed trace IDs or declaration order changed.",
    findings,
  );
  requireExact(
    controls.map(idOf),
    MUTATION_IDS,
    "F3_CONTRACT_ID_SEQUENCE",
    "mutation-controls.json.controls",
    "Reviewed mutation IDs or declaration order changed.",
    findings,
  );
  requireExact(
    authorities.map(idOf),
    AUTHORITY_IDS,
    "F3_CONTRACT_ID_SEQUENCE",
    "provenance-ledger.json.authorities",
    "Reviewed authority IDs or declaration order changed.",
    findings,
  );

  const casesById = new Map(caseRecords.map((record) => [record.id, record]));
  const tracesById = new Map(
    traces
      .map((record) => [idOf(record), record] as const)
      .filter((pair): pair is readonly [string, JsonObject] => pair[0] !== null),
  );
  const controlsById = new Map(
    controls
      .map((record) => [idOf(record), record] as const)
      .filter((pair): pair is readonly [string, JsonObject] => pair[0] !== null),
  );
  const authoritiesById = new Map(
    authorities
      .map((record) => [idOf(record), record] as const)
      .filter((pair): pair is readonly [string, JsonObject] => pair[0] !== null),
  );
  const casesSeenInTraces = new Set<string>();
  const controlsSeenInTraces = new Set<string>();
  const authoritiesSeenInCases = new Set<string>();

  for (const record of caseRecords) {
    for (const traceId of record.traceIds) {
      const trace = tracesById.get(traceId);
      if (trace === undefined) {
        finding(
          findings,
          "F3_CONTRACT_TRACE",
          `${record.path}.traceIds`,
          `Unknown trace ${JSON.stringify(traceId)}.`,
        );
      } else if (!(strings(trace["requiredCaseIds"]) ?? []).includes(record.id)) {
        finding(
          findings,
          "F3_CONTRACT_TRACE_BACKLINK",
          `${record.path}.traceIds`,
          `Trace ${JSON.stringify(traceId)} does not link back to case ${JSON.stringify(record.id)}.`,
        );
      }
    }
    for (const authorityId of record.authorityIds) {
      authoritiesSeenInCases.add(authorityId);
      if (!authoritiesById.has(authorityId)) {
        finding(
          findings,
          "F3_CONTRACT_AUTHORITY",
          `${record.path}.authorityIds`,
          `Unknown authority ${JSON.stringify(authorityId)}.`,
        );
      }
    }
  }

  traces.forEach((trace, index) => {
    const path = `trace-ledger.json.traces[${String(index)}]`;
    requireExact(
      Object.keys(trace).sort(),
      [
        "id",
        "mutationControlIds",
        "parentClause",
        "proofKinds",
        "requiredCaseIds",
        "sourceRefs",
      ],
      "F3_CONTRACT_TRACE",
      path,
      "Trace field inventory changed.",
      findings,
    );
    const traceId = idOf(trace);
    const requiredCaseIds = uniqueStrings(
      trace["requiredCaseIds"],
      "F3_CONTRACT_TRACE",
      `${path}.requiredCaseIds`,
      findings,
    );
    const mutationControlIds = uniqueStrings(
      trace["mutationControlIds"],
      "F3_CONTRACT_MUTATION",
      `${path}.mutationControlIds`,
      findings,
    );
    if (
      traceId === null ||
      typeof trace["parentClause"] !== "string" ||
      trace["parentClause"].trim().length === 0
    ) {
      finding(
        findings,
        "F3_CONTRACT_TRACE",
        path,
        "Trace requires a stable ID and nonempty parent clause.",
      );
    }
    uniqueStrings(
      trace["proofKinds"],
      "F3_CONTRACT_TRACE",
      `${path}.proofKinds`,
      findings,
    );
    uniqueStrings(
      trace["sourceRefs"],
      "F3_CONTRACT_TRACE",
      `${path}.sourceRefs`,
      findings,
    );
    for (const caseId of requiredCaseIds) {
      casesSeenInTraces.add(caseId);
      const record = casesById.get(caseId);
      if (record === undefined) {
        finding(
          findings,
          "F3_CONTRACT_CASE_REF",
          `${path}.requiredCaseIds`,
          `Unknown case ${JSON.stringify(caseId)}.`,
        );
      } else if (traceId !== null && !record.traceIds.includes(traceId)) {
        finding(
          findings,
          "F3_CONTRACT_TRACE_BACKLINK",
          `${path}.requiredCaseIds`,
          `Case ${JSON.stringify(caseId)} does not link back to trace ${JSON.stringify(traceId)}.`,
        );
      }
    }
    for (const controlId of mutationControlIds) {
      controlsSeenInTraces.add(controlId);
      const control = controlsById.get(controlId);
      if (control === undefined) {
        finding(
          findings,
          "F3_CONTRACT_MUTATION",
          `${path}.mutationControlIds`,
          `Unknown mutation control ${JSON.stringify(controlId)}.`,
        );
      } else if (
        traceId !== null &&
        !(strings(control["traceIds"]) ?? []).includes(traceId)
      ) {
        finding(
          findings,
          "F3_CONTRACT_MUTATION_BACKLINK",
          `${path}.mutationControlIds`,
          `Mutation ${JSON.stringify(controlId)} does not link back to trace ${JSON.stringify(traceId)}.`,
        );
      }
    }
  });

  controls.forEach((control, index) => {
    const path = `mutation-controls.json.controls[${String(index)}]`;
    requireExact(
      Object.keys(control).sort(),
      ["fault", "id", "killerCaseIds", "traceIds"],
      "F3_CONTRACT_MUTATION",
      path,
      "Mutation-control field inventory changed.",
      findings,
    );
    const controlId = idOf(control);
    if (
      controlId === null ||
      typeof control["fault"] !== "string" ||
      control["fault"].trim().length === 0
    ) {
      finding(
        findings,
        "F3_CONTRACT_MUTATION",
        path,
        "Mutation control requires a stable ID and nonempty fault.",
      );
    }
    const killerCaseIds = uniqueStrings(
      control["killerCaseIds"],
      "F3_CONTRACT_MUTATION",
      `${path}.killerCaseIds`,
      findings,
    );
    const traceIds = uniqueStrings(
      control["traceIds"],
      "F3_CONTRACT_MUTATION",
      `${path}.traceIds`,
      findings,
    );
    for (const caseId of killerCaseIds) {
      if (!casesById.has(caseId)) {
        finding(
          findings,
          "F3_CONTRACT_CASE_REF",
          `${path}.killerCaseIds`,
          `Unknown killing case ${JSON.stringify(caseId)}.`,
        );
      }
    }
    for (const traceId of traceIds) {
      const trace = tracesById.get(traceId);
      if (trace === undefined) {
        finding(
          findings,
          "F3_CONTRACT_TRACE",
          `${path}.traceIds`,
          `Unknown trace ${JSON.stringify(traceId)}.`,
        );
      } else if (
        controlId !== null &&
        !(strings(trace["mutationControlIds"]) ?? []).includes(controlId)
      ) {
        finding(
          findings,
          "F3_CONTRACT_MUTATION_BACKLINK",
          `${path}.traceIds`,
          `Trace ${JSON.stringify(traceId)} does not link back to mutation ${JSON.stringify(controlId)}.`,
        );
      }
    }
  });

  authorities.forEach((authority, index) => {
    const path = `provenance-ledger.json.authorities[${String(index)}]`;
    requireExact(
      Object.keys(authority).sort(),
      ["authorityClass", "covers", "id", "sourceRefs"],
      "F3_CONTRACT_AUTHORITY",
      path,
      "Authority field inventory changed.",
      findings,
    );
    if (
      idOf(authority) === null ||
      typeof authority["authorityClass"] !== "string" ||
      !ALLOWED_AUTHORITY_CLASSES.has(authority["authorityClass"]) ||
      typeof authority["covers"] !== "string" ||
      authority["covers"].trim().length === 0
    ) {
      finding(
        findings,
        "F3_CONTRACT_AUTHORITY",
        path,
        "Authority requires a stable ID, allowed class, and nonempty coverage statement.",
      );
    }
    uniqueStrings(
      authority["sourceRefs"],
      "F3_CONTRACT_AUTHORITY",
      `${path}.sourceRefs`,
      findings,
    );
  });

  requireExact(
    [...casesSeenInTraces].sort(),
    [...casesById.keys()].sort(),
    "F3_CONTRACT_COVERAGE",
    "trace-ledger.json.traces.requiredCaseIds",
    "Every document and operation-state case must appear in a trace.",
    findings,
  );
  requireExact(
    [...controlsSeenInTraces].sort(),
    [...controlsById.keys()].sort(),
    "F3_CONTRACT_COVERAGE",
    "trace-ledger.json.traces.mutationControlIds",
    "Every future mutation control must appear in a trace.",
    findings,
  );
  requireExact(
    [...authoritiesSeenInCases].sort(),
    [...authoritiesById.keys()].sort(),
    "F3_CONTRACT_COVERAGE",
    "document-and-operation-cases.authorityIds",
    "Every reviewed authority must support at least one case.",
    findings,
  );
}

export async function validateF3Contract(
  fixtureRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../tests/fixtures/publication",
  ),
): Promise<F3ContractValidationReport> {
  const findings: F3ContractFinding[] = [];
  const fixtures = new Map<string, ParsedFixture>();
  let entries: string[] = [];
  try {
    entries = (await readdir(fixtureRoot))
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    finding(
      findings,
      "F3_CONTRACT_FILE_SET",
      fixtureRoot,
      `Unable to read fixture directory: ${String(error)}`,
    );
  }
  requireExact(
    entries,
    [...EXPECTED_FILES].sort(),
    "F3_CONTRACT_FILE_SET",
    fixtureRoot,
    "Publication fixture directory must contain exactly the six reviewed JSON files.",
    findings,
  );

  for (const filename of EXPECTED_FILES) {
    let source: string;
    try {
      source = await readFile(join(fixtureRoot, filename), "utf8");
    } catch (error) {
      finding(
        findings,
        "F3_CONTRACT_FILE_SET",
        filename,
        `Unable to read required fixture: ${String(error)}`,
      );
      continue;
    }
    for (const duplicate of duplicateJsonKeys(source)) {
      finding(
        findings,
        "F3_CONTRACT_DUPLICATE_KEY",
        `${filename}:${duplicate}`,
        "Duplicate decoded JSON object key is forbidden.",
      );
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(source) as unknown;
    } catch (error) {
      finding(
        findings,
        "F3_CONTRACT_JSON_PARSE",
        filename,
        `Invalid JSON: ${String(error)}`,
      );
      continue;
    }
    if (!isObject(decoded)) {
      finding(
        findings,
        "F3_CONTRACT_JSON_PARSE",
        filename,
        "Fixture root must be a JSON object.",
      );
      continue;
    }
    const fixture = {
      filename,
      source,
      root: decoded,
      byteDigest: sha256(source),
    };
    fixtures.set(filename, fixture);
    if (decoded["schema"] !== EXPECTED_SCHEMAS[filename]) {
      finding(
        findings,
        "F3_CONTRACT_SCHEMA",
        `${filename}.schema`,
        `Expected schema ${JSON.stringify(EXPECTED_SCHEMAS[filename])}.`,
      );
    }
    requireExact(
      Object.keys(decoded).sort(),
      [...EXPECTED_TOP_LEVEL_KEYS[filename]].sort(),
      "F3_CONTRACT_SCHEMA",
      filename,
      "Top-level field inventory changed.",
      findings,
    );
    if (Object.hasOwn(decoded, "productionOutputUsed")) {
      if (decoded["productionOutputUsed"] !== false) {
        finding(
          findings,
          "F3_CONTRACT_INDEPENDENCE",
          `${filename}.productionOutputUsed`,
          "Production output cannot certify an independent F3 fixture.",
        );
      }
    }
    if (
      Object.hasOwn(decoded, "expectedValuesGenerated") &&
      decoded["expectedValuesGenerated"] !== false
    ) {
      finding(
        findings,
        "F3_CONTRACT_INDEPENDENCE",
        `${filename}.expectedValuesGenerated`,
        "Generated expected values cannot certify an independent F3 fixture.",
      );
    }
    if (
      filename !== CONTRACT_FILENAME &&
      fixture.byteDigest !==
        F3_REVIEWED_BYTE_DIGESTS[filename]
    ) {
      finding(
        findings,
        "F3_CONTRACT_BYTE_DIGEST",
        filename,
        `Reviewed byte digest mismatch: ${fixture.byteDigest}.`,
      );
    }
  }

  const contract = fixtures.get(CONTRACT_FILENAME)?.root ?? {};
  const documentCases = fixtures.get("document-cases.json")?.root ?? {};
  const operationCases =
    fixtures.get("operation-state-cases.json")?.root ?? {};
  const mutationControls =
    fixtures.get("mutation-controls.json")?.root ?? {};
  const traceLedger = fixtures.get("trace-ledger.json")?.root ?? {};
  const provenanceLedger =
    fixtures.get("provenance-ledger.json")?.root ?? {};

  checkManifest(contract, findings);
  const document = checkDocumentCases(documentCases, findings);
  const operations = checkOperationCases(operationCases, findings);
  const controls = objects(mutationControls["controls"]);
  const traces = objects(traceLedger["traces"]);
  const authorities = objects(provenanceLedger["authorities"]);
  checkLinkedLedgers(
    [...document.records, ...operations],
    traces,
    controls,
    authorities,
    findings,
  );

  if (
    mutationControls["claim"] !== "named-future-mutation-control-authority" ||
    mutationControls["executionOwner"] !== "F3/verify"
  ) {
    finding(
      findings,
      "F3_CONTRACT_MUTATION",
      "mutation-controls.json",
      "Mutation controls remain named future authority owned by F3/verify.",
    );
  }
  if (provenanceLedger["reviewState"] !== "reviewed-contract-authority") {
    finding(
      findings,
      "F3_CONTRACT_AUTHORITY",
      "provenance-ledger.json.reviewState",
      "Provenance ledger must remain reviewed contract authority.",
    );
  }

  findings.sort(findingOrder);
  return {
    schema: "changes.validation.f3-contract.v1",
    package: "F3",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      companions: F3_REVIEWED_COMPANIONS.length,
      documentCases: document.records.length,
      operationStateCases: operations.length,
      mutationControls: controls.length,
      traces: traces.length,
      authorities: authorities.length,
      issueCodesCovered: document.issueCoverage.size,
    },
    findings,
  };
}

if (import.meta.main) {
  const report = await validateF3Contract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exit(1);
}
