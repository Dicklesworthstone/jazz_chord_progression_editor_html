import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

type JsonObject = Record<string, unknown>;

export type E0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type E0ContractValidationReport = Readonly<{
  schema: "changes.validation.e0-contract.v1";
  package: "E0";
  outcome: "pass" | "fail";
  reviewState: "proposed-pending-first-golden-human-acceptance";
  counts: Readonly<{
    companions: number;
    goldens: number;
    canonicalCases: number;
    chartTextCases: number;
    importCases: number;
    workflowAdapterCases: number;
    transportWorkflowCells: number;
    limitFamilies: number;
    limitCells: number;
    mutationControls: number;
    inheritedControls: number;
    authorities: number;
    traces: number;
    inputFixtures: number;
    requirements: number;
  }>;
  findings: readonly E0ContractFinding[];
}>;

export type E0ContractValidationOptions = Readonly<{
  /** Test-only seam for proving semantic locks survive refreshed byte pins. */
  expectedByteDigests?: Readonly<Record<string, string>>;
}>;

const CONTRACT_FILENAME = "e0-interchange-contract.json";

export const E0_PROPOSED_COMPANIONS = Object.freeze([
  "canonical-json-cases.json",
  "chart-text-cases.json",
  "import-cases.json",
  "workflow-adapter-cases.json",
  "limit-cases.json",
  "mutation-controls.json",
  "input-fixture-ledger.json",
  "provenance-ledger.json",
  "requirement-ledger.json",
  "trace-ledger.json",
] as const);

export const E0_PROPOSED_GOLDENS = Object.freeze([
  "goldens/minimal.changes.json",
  "goldens/negative-zero.changes.json",
  "goldens/nested.changes.json",
  "goldens/minimal.changes.txt",
  "goldens/rich.changes.txt",
] as const);

const EXPECTED_JSON_FILES = Object.freeze([
  CONTRACT_FILENAME,
  ...E0_PROPOSED_COMPANIONS,
] as const);

const EXPECTED_FILES = Object.freeze([
  ...EXPECTED_JSON_FILES,
  ...E0_PROPOSED_GOLDENS,
] as const);

export const E0_PROPOSED_BYTE_DIGESTS: Readonly<Record<string, string>> = {
  "canonical-json-cases.json":
    "e1c842d3738a076040eedbdc95a5255334a635c1453a26a58554aa0bdcbe10a5",
  "chart-text-cases.json":
    "b64b42c33b9df36541c4d023404ca6818f33915e39409e5e7902c9a7fa95bc06",
  "e0-interchange-contract.json":
    "7482b8b8666a2477358daa32e1898d70add5e35e91c8abbb1964adcc97780f0d",
  "import-cases.json":
    "9e287a812555c2838c54407027ea15cab7a99bcc8f3dceaa176bc65ea4043a74",
  "input-fixture-ledger.json":
    "2a926133a15509d4397e4d7f7a4d0d1ddb57fda2edc7c933b03815bacaddb238",
  "limit-cases.json":
    "a287b6edd6336eecfd87b81cdeb73dfe52d96838ca71ff42893046689170b249",
  "mutation-controls.json":
    "b1c7e49d15f65ab6e741da80353a476684286229db6af1bf0c703b6e6de5a2be",
  "provenance-ledger.json":
    "fcac8445a0d5c5e8ce1edc6feedc5d33752026d84638132f05824470059b9ae0",
  "requirement-ledger.json":
    "a7af9cc505be71c036911ad6a5a0923141a817b2ff3924b071e37ca0ef3b50a2",
  "trace-ledger.json":
    "14c6be7b1131ed58d034339ef00e67146266c1750174a84fbe17cc50c4a756c1",
  "workflow-adapter-cases.json":
    "8e3ce651670976349db3036f054ea326e4d3345eb24e0a398f4313e58bf43c9d",
  "goldens/minimal.changes.json":
    "c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5",
  "goldens/minimal.changes.txt":
    "0fc780c103673d387cc0497abbb4cf9baaf2ad6cb3ec224a4326c96030fc659e",
  "goldens/negative-zero.changes.json":
    "2a5515c11bc083b03fa36b6a802049355a7a5ff90fdc7505860ea788358f9aad",
  "goldens/nested.changes.json":
    "6e00aecaddd5a522ee1a608f7d3a6c2c35bab408b6b831bbce88b0c7271cc499",
  "goldens/rich.changes.txt":
    "e138e8b20e526f6fef3a4d81105d92a747422e166d678cc87594ba39ed516504",
};

export const E0_PROPOSED_SEMANTIC_DIGEST =
  "b21130041d6d3cff7d888f08e2bea0dfb301034eface4f6cdbdbecc92c4d1a70";

const EXPECTED_SCHEMAS: Readonly<Record<string, string>> = {
  "canonical-json-cases.json": "changes.fixtures.e0-canonical-json-cases.v1",
  "chart-text-cases.json": "changes.fixtures.e0-chart-text-cases.v1",
  "e0-interchange-contract.json": "changes.fixtures.e0-interchange-contract.v1",
  "import-cases.json": "changes.fixtures.e0-import-cases.v1",
  "input-fixture-ledger.json": "changes.fixtures.e0-input-fixture-ledger.v1",
  "limit-cases.json": "changes.fixtures.e0-limit-cases.v1",
  "mutation-controls.json": "changes.fixtures.e0-mutation-controls.v1",
  "provenance-ledger.json": "changes.fixtures.e0-provenance-ledger.v1",
  "requirement-ledger.json": "changes.fixtures.e0-requirement-ledger.v1",
  "trace-ledger.json": "changes.fixtures.e0-trace-ledger.v1",
  "workflow-adapter-cases.json":
    "changes.fixtures.e0-workflow-adapter-cases.v1",
};

export const E0_PROPOSED_COUNTS = Object.freeze({
  companions: 10,
  goldens: 5,
  canonicalCases: 19,
  chartTextCases: 21,
  importCases: 29,
  workflowAdapterCases: 71,
  transportWorkflowCells: 56,
  limitFamilies: 31,
  limitCells: 70,
  mutationControls: 83,
  inheritedControls: 2,
  authorities: 17,
  traces: 28,
  inputFixtures: 338,
  requirements: 53,
});

export const E0_PROPOSED_LIMITS = Object.freeze({
  acceptedImportUtf8Bytes: 2_097_152,
  observedImportBytes: 2_097_153,
  canonicalJsonExportBytes: 2_097_152,
  leadSheetTextExportBytes: 2_097_152,
  previewIssuesRetained: 64,
  previewReportItemsRetained: 256,
  chartImportIdRequests: 73_793,
  sectionsSummarized: 64,
  measuresSummarized: 65_536,
  eventsSummarized: 8_192,
  leadSheetLossItems: 16_515,
  objectUrlsPerAttempt: 1,
  preparedCanonicalExportEntries: 1,
  preparedCanonicalExportPrivateBytes: 2_097_152,
  preparedCanonicalExportTasks: 1,
  canonicalExportPreparationId: 9_007_199_254_740_991,
  replacementHandoffsPerConfirmation: 1,
});

const E0_PROPOSED_LIMIT_RESOURCES = Object.freeze([
  "utf8-import-bytes",
  "json-depth",
  "sections",
  "measures-per-section",
  "events-per-document",
  "domain-copy-graph-nodes",
  "auxiliary-graph-work",
  "voicing-pitches",
  "short-text-code-points",
  "long-text-code-points",
  "tempo-bpm",
  "meter-beats-per-bar",
  "meter-beat-unit",
  "normalized-beat-numerator",
  "beat-denominator",
  "timeline-quarter-note-beats",
  "midi",
  "unicode-scalars",
  "chart-tokens",
  "preview-issues",
  "preview-report-rows",
  "retained-memory",
  "wall-time-independence",
  "failure-stage-precedence",
  "stage-short-circuit",
  "lead-sheet-text-export-bytes",
  "lead-sheet-text-loss-items",
  "chart-import-id-requests",
  "prepared-canonical-export-private-bytes",
  "prepared-canonical-export-entries",
  "canonical-export-preparation-id",
] as const);

export const E0_PROPOSED_EXPORT_OPERATIONS = Object.freeze([
  "prepareCanonicalJsonExport",
  "prepareLeadSheetTextExport",
  "sanitizeExportFilename",
  "deliverExportArtifact",
] as const);

export const E0_PROPOSED_APPLICATION_OPERATIONS = Object.freeze([
  "readImportSource",
  "prepareImportPreview",
  "commitImportReplacement",
  "prepareCanonicalExportDelivery",
  "completeCanonicalExportMarkerSettlement",
] as const);

export const E0_PROPOSED_IMPORT_STAGE_ORDER = Object.freeze([
  "byte-observation",
  "byte-preflight",
  "utf8-decode",
  "format-classification",
  "json-lexical-preflight",
  "schema-route",
  "json-parse-or-legacy-migration",
  "chart-parse",
  "chart-candidate-construction",
  "structural-decode",
  "semantic-validation",
  "preview-publication",
] as const);

const REVIEW_STATE = "proposed-pending-first-golden-human-acceptance";

const REPOSITORY_ROOT = new URL("../", import.meta.url).pathname;

const E0_INPUT_MATRIX_FILES = Object.freeze([
  "canonical-json-cases.json",
  "chart-text-cases.json",
  "import-cases.json",
  "limit-cases.json",
  "workflow-adapter-cases.json",
] as const);

const E0_REQUIREMENT_KINDS = new Set([
  "required-implementation",
  "invariant-risk",
  "success-criterion",
  "named-test-evidence-family",
  "non-goal",
]);

const E0_INPUT_FIXTURE_KINDS = new Set([
  "action",
  "adapter-capability",
  "adapter-fault",
  "adapter-input",
  "adapter-result",
  "application-envelope",
  "artifact-binding",
  "binary-file",
  "delivery-result",
  "dependency-fault",
  "diagnostic-path-projection",
  "derived-delivery-result",
  "derived-document",
  "derived-issue-list",
  "derived-limit-document",
  "derived-report-list",
  "derived-scalar",
  "derived-text-export-request",
  "document-transition",
  "export-marker-state",
  "history-entry-parameter",
  "history-state-parameter",
  "instrumentation",
  "local-golden",
  "marker-settlement-parameter",
  "metadata",
  "parameter",
  "private-text",
  "raw-utf8",
  "replacement-impact",
  "retirement-receipt",
  "retirement-result",
  "scalar",
  "scenario-matrix",
  "scenario-parameter",
  "scenario-sequence",
  "state-snapshot",
  "text-export-request",
  "transport-handoff-state",
  "transport-state",
  "upstream-alias",
  "upstream-case",
  "upstream-derived-alias",
  "workflow-action",
  "workflow-callback",
  "workflow-preview",
]);

const E0_TRANSPORT_WORKFLOW_SOURCE_FORMATS = Object.freeze([
  "canonical-json-v2",
  "unversioned-legacy-json",
] as const);

const E0_APPLICATION_TRANSPORT_STATUSES = Object.freeze([
  "unavailable",
  "ready",
  "starting",
  "playing",
  "paused",
  "stopping",
  "failed",
] as const);

const E0_TRANSPORT_WORKFLOW_ACTIONS = Object.freeze([
  "preview",
  "apply",
  "cancel",
  "failure",
] as const);

const UPSTREAM_F2_ADVERSARIAL_FIXTURE = new URL(
  "../tests/fixtures/decoder/adversarial-cases.json",
  import.meta.url,
).pathname;

const EXPECTED_INHERITED_F2_CONTROLS = Object.freeze([
  Object.freeze({
    id: "F2-MUT-002",
    owner: "E0",
    caseIds: Object.freeze(["F2-IMPORT-001"]),
  }),
  Object.freeze({
    id: "F2-MUT-003",
    owner: "E0",
    caseIds: Object.freeze(["F2-IMPORT-001"]),
  }),
] as const);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectAt(value: unknown): JsonObject | null {
  return isObject(value) ? value : null;
}

function recordsAt(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => isObject(item))
    : [];
}

function stringsAt(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonemptyPropertyPath(
  value: unknown,
): value is readonly [string | number, ...(string | number)[]] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (segment: unknown) =>
        typeof segment === "string" || typeof segment === "number",
    )
  );
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort(codeUnitCompare)
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
  return duplicates.sort(codeUnitCompare);
}

const E0_EXACT_BYTE_CANONICAL_RECIPE = Object.freeze({
  schema: "changes.fixtures.e0-exact-byte-canonical-source.v1",
  documentTemplate: {
    schema: "changes.progression.v2",
    id: "d",
    title: "X",
    description: "",
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 120,
    key: null,
    section: {
      id: "s",
      name: "S",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "continue",
      measureId: "m",
    },
    playback: {
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.2,
      countInBars: 0,
    },
  },
  eventCount: 233,
  fullAnnotationEventCount: 232,
  eventIdPrefix: "e",
  indexEncoding: "unsigned-decimal-no-leading-zero",
  measureCompletion: { kind: "complete" },
  eventTemplate: {
    chord: {
      kind: "parsed",
      sourceText: "C",
      root: { step: "C", alter: 0 },
      triad: "major",
      sixth: null,
      seventh: null,
      extensions: [],
      additions: [],
      alterations: [],
      omissions: [],
      bass: null,
      colorPolicy: "none",
    },
    voicing: {
      mode: "auto",
      family: "balanced",
      voiceCount: 3,
      range: { lowMidi: 60, highMidi: 62 },
      bassPolicy: "generated",
    },
  },
  fullEvent: {
    duration: { numerator: 1, denominator: 240 },
    annotationCodePoint: "😀",
    annotationCodePoints: 2_000,
  },
  finalEvent: {
    index: 232,
    duration: { numerator: 91, denominator: 30 },
    annotationCodePoint: "😀",
    annotationCodePoints: 856,
  },
  serialization: {
    indentSpaces: 2,
    lineEnding: "LF",
    finalLfCount: 1,
    unicodeNormalization: "none",
  },
  expected: {
    finalAnnotationEmptyUtf8Bytes: 2_093_728,
    timelineQuarterNoteTicks: 3_840,
    utf16CodeUnits: 1_167_440,
    utf8Bytes: 2_097_152,
    sha256: "18d737f88c90ef3b4c0687f813d543571131c63fcd5e6ce0d485a23459566619",
    jsonRoute: "canonical-v2",
    structuralDecode: "success",
    semanticValidation: "success",
  },
});

export type E0ExactByteCanonicalImportMaterialization = Readonly<{
  document: unknown;
  sourceText: string;
  finalAnnotationEmptyUtf8Bytes: number;
  eventCount: number;
  fullAnnotationCount: number;
  finalAnnotationCodePoints: number;
  timelineQuarterNoteTicks: number;
  utf16CodeUnits: number;
  utf8Bytes: number;
  sha256: string;
}>;

/**
 * Independently constructs the exact-limit canonical import input. This is an
 * input-only boundary generator: it neither imports nor calls the E0 encoder.
 */
export function materializeE0ExactByteCanonicalImport(
  recipe: unknown,
): E0ExactByteCanonicalImportMaterialization {
  if (!sameJson(recipe, E0_EXACT_BYTE_CANONICAL_RECIPE)) {
    throw new Error("E0_EXACT_BYTE_CANONICAL_RECIPE_INVALID");
  }

  const events = Array.from(
    { length: E0_EXACT_BYTE_CANONICAL_RECIPE.eventCount },
    (_, index): JsonObject => ({
      id: `${E0_EXACT_BYTE_CANONICAL_RECIPE.eventIdPrefix}${String(index)}`,
      duration:
        index === E0_EXACT_BYTE_CANONICAL_RECIPE.finalEvent.index
          ? { numerator: 91, denominator: 30 }
          : { numerator: 1, denominator: 240 },
      annotation:
        index === E0_EXACT_BYTE_CANONICAL_RECIPE.finalEvent.index
          ? ""
          : E0_EXACT_BYTE_CANONICAL_RECIPE.fullEvent.annotationCodePoint.repeat(
              E0_EXACT_BYTE_CANONICAL_RECIPE.fullEvent.annotationCodePoints,
            ),
      chord: {
        kind: "parsed",
        sourceText: "C",
        root: { step: "C", alter: 0 },
        triad: "major",
        sixth: null,
        seventh: null,
        extensions: [],
        additions: [],
        alterations: [],
        omissions: [],
        bass: null,
        colorPolicy: "none",
      },
      voicing: {
        mode: "auto",
        family: "balanced",
        voiceCount: 3,
        range: { lowMidi: 60, highMidi: 62 },
        bassPolicy: "generated",
      },
    }),
  );
  const document: JsonObject = {
    schema: "changes.progression.v2",
    id: "d",
    title: "X",
    description: "",
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 120,
    key: null,
    sections: [
      {
        id: "s",
        name: "S",
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "continue",
        measures: [{ id: "m", events, completion: { kind: "complete" } }],
      },
    ],
    playback: {
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.2,
      countInBars: 0,
    },
  };
  const encode = (value: JsonObject): string =>
    `${JSON.stringify(value, null, 2)}\n`;
  const encoder = new TextEncoder();
  const finalAnnotationEmptyUtf8Bytes = encoder.encode(
    encode(document),
  ).byteLength;
  const finalEvent = events[E0_EXACT_BYTE_CANONICAL_RECIPE.finalEvent.index];
  if (finalEvent === undefined) {
    throw new Error("E0_EXACT_BYTE_CANONICAL_FINAL_EVENT_MISSING");
  }
  finalEvent["annotation"] =
    E0_EXACT_BYTE_CANONICAL_RECIPE.finalEvent.annotationCodePoint.repeat(
      E0_EXACT_BYTE_CANONICAL_RECIPE.finalEvent.annotationCodePoints,
    );
  const sourceText = encode(document);
  const encoded = encoder.encode(sourceText);
  const materialization = Object.freeze({
    document,
    sourceText,
    finalAnnotationEmptyUtf8Bytes,
    eventCount: events.length,
    fullAnnotationCount: events.filter(
      (event, index) =>
        index < E0_EXACT_BYTE_CANONICAL_RECIPE.fullAnnotationEventCount &&
        Array.from(String(event["annotation"])).length ===
          E0_EXACT_BYTE_CANONICAL_RECIPE.fullEvent.annotationCodePoints,
    ).length,
    finalAnnotationCodePoints: Array.from(String(finalEvent["annotation"]))
      .length,
    timelineQuarterNoteTicks:
      E0_EXACT_BYTE_CANONICAL_RECIPE.fullAnnotationEventCount * 4 + 91 * 32,
    utf16CodeUnits: sourceText.length,
    utf8Bytes: encoded.byteLength,
    sha256: sha256(encoded),
  });
  const expectedMetrics = E0_EXACT_BYTE_CANONICAL_RECIPE.expected;
  if (
    materialization.finalAnnotationEmptyUtf8Bytes !==
      expectedMetrics.finalAnnotationEmptyUtf8Bytes ||
    materialization.eventCount !== E0_EXACT_BYTE_CANONICAL_RECIPE.eventCount ||
    materialization.fullAnnotationCount !==
      E0_EXACT_BYTE_CANONICAL_RECIPE.fullAnnotationEventCount ||
    materialization.finalAnnotationCodePoints !==
      E0_EXACT_BYTE_CANONICAL_RECIPE.finalEvent.annotationCodePoints ||
    materialization.timelineQuarterNoteTicks !==
      expectedMetrics.timelineQuarterNoteTicks ||
    materialization.utf16CodeUnits !== expectedMetrics.utf16CodeUnits ||
    materialization.utf8Bytes !== expectedMetrics.utf8Bytes ||
    materialization.sha256 !== expectedMetrics.sha256
  ) {
    throw new Error("E0_EXACT_BYTE_CANONICAL_MATERIALIZATION_DRIFT");
  }
  return materialization;
}

function addFinding(
  findings: E0ContractFinding[],
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
  findings: E0ContractFinding[],
): void {
  if (!sameJson(actual, expected)) addFinding(findings, code, path, message);
}

function requireShapeKeys(
  value: unknown,
  keyOrders: JsonObject,
  shape: string,
  path: string,
  findings: E0ContractFinding[],
): JsonObject | null {
  const record = objectAt(value);
  const expected = stringsAt(keyOrders[shape]);
  if (record === null || expected.length === 0) {
    addFinding(
      findings,
      "E0_GOLDEN_NESTED_SHAPE",
      path,
      `Nested golden must materialize declared ${shape} shape.`,
    );
    return null;
  }
  requireExact(
    Object.keys(record),
    expected,
    "E0_GOLDEN_NESTED_ORDER",
    path,
    `Nested golden ${shape} keys must use the declared canonical order.`,
    findings,
  );
  return record;
}

function validateNestedGoldenOrder(
  document: JsonObject,
  keyOrders: JsonObject,
  findings: E0ContractFinding[],
): void {
  const pitchClass = (value: unknown, path: string): void => {
    requireShapeKeys(value, keyOrders, "spelledPitchClass", path, findings);
  };
  const pitch = (value: unknown, path: string): void => {
    requireShapeKeys(value, keyOrders, "spelledPitch", path, findings);
  };
  const degree = (value: unknown, path: string): void => {
    requireShapeKeys(value, keyOrders, "degree", path, findings);
  };
  const keyContext = (value: unknown, path: string): void => {
    if (value === null) return;
    const key = requireShapeKeys(
      value,
      keyOrders,
      "keyContext",
      path,
      findings,
    );
    if (key !== null) pitchClass(key["tonic"], `${path}.tonic`);
  };

  requireShapeKeys(
    document,
    keyOrders,
    "document",
    "nested.document",
    findings,
  );
  requireShapeKeys(
    document["meter"],
    keyOrders,
    "meter",
    "nested.document.meter",
    findings,
  );
  keyContext(document["key"], "nested.document.key");
  requireShapeKeys(
    document["playback"],
    keyOrders,
    "playback",
    "nested.document.playback",
    findings,
  );

  recordsAt(document["sections"]).forEach((section, sectionIndex) => {
    const sectionPath = `nested.document.sections[${String(sectionIndex)}]`;
    requireShapeKeys(section, keyOrders, "section", sectionPath, findings);
    keyContext(section["keyOverride"], `${sectionPath}.keyOverride`);
    recordsAt(section["measures"]).forEach((measure, measureIndex) => {
      const measurePath = `${sectionPath}.measures[${String(measureIndex)}]`;
      requireShapeKeys(measure, keyOrders, "measure", measurePath, findings);
      const completion = objectAt(measure["completion"]);
      if (completion !== null) {
        const shape =
          completion["kind"] === "pickup" || completion["kind"] === "incomplete"
            ? "completionPickupOrIncomplete"
            : "completionEmptyOrComplete";
        requireShapeKeys(
          completion,
          keyOrders,
          shape,
          `${measurePath}.completion`,
          findings,
        );
        if (shape === "completionPickupOrIncomplete") {
          requireShapeKeys(
            completion["expectedDuration"],
            keyOrders,
            "beat",
            `${measurePath}.completion.expectedDuration`,
            findings,
          );
        }
      }
      recordsAt(measure["events"]).forEach((event, eventIndex) => {
        const eventPath = `${measurePath}.events[${String(eventIndex)}]`;
        requireShapeKeys(event, keyOrders, "event", eventPath, findings);
        requireShapeKeys(
          event["duration"],
          keyOrders,
          "beat",
          `${eventPath}.duration`,
          findings,
        );
        const chord = objectAt(event["chord"]);
        if (chord !== null && chord["kind"] === "parsed") {
          requireShapeKeys(
            chord,
            keyOrders,
            "parsedChord",
            `${eventPath}.chord`,
            findings,
          );
          pitchClass(chord["root"], `${eventPath}.chord.root`);
          if (chord["sixth"] !== null)
            degree(chord["sixth"], `${eventPath}.chord.sixth`);
          for (const field of [
            "extensions",
            "additions",
            "alterations",
            "omissions",
          ] as const) {
            recordsAt(chord[field]).forEach((item, index) => {
              degree(item, `${eventPath}.chord.${field}[${String(index)}]`);
            });
          }
          if (chord["bass"] !== null)
            pitchClass(chord["bass"], `${eventPath}.chord.bass`);
        } else if (chord !== null) {
          requireShapeKeys(
            chord,
            keyOrders,
            "customChord",
            `${eventPath}.chord`,
            findings,
          );
          recordsAt(chord["pitchNames"]).forEach((item, index) => {
            pitchClass(item, `${eventPath}.chord.pitchNames[${String(index)}]`);
          });
          if (chord["bass"] !== null)
            pitchClass(chord["bass"], `${eventPath}.chord.bass`);
        }
        const voicing = objectAt(event["voicing"]);
        if (voicing === null) return;
        if (voicing["mode"] === "auto") {
          requireShapeKeys(
            voicing,
            keyOrders,
            "autoVoicing",
            `${eventPath}.voicing`,
            findings,
          );
          requireShapeKeys(
            voicing["range"],
            keyOrders,
            "midiRange",
            `${eventPath}.voicing.range`,
            findings,
          );
          return;
        }
        const shape =
          voicing["mode"] === "frozen" ? "frozenVoicing" : "storedVoicing";
        requireShapeKeys(
          voicing,
          keyOrders,
          shape,
          `${eventPath}.voicing`,
          findings,
        );
        recordsAt(voicing["pitches"]).forEach((item, index) => {
          pitch(item, `${eventPath}.voicing.pitches[${String(index)}]`);
        });
        if (shape === "frozenVoicing") {
          requireShapeKeys(
            voicing["generatedBy"],
            keyOrders,
            "generatedBy",
            `${eventPath}.voicing.generatedBy`,
            findings,
          );
        }
      });
    });
  });
}

function uniqueRecordIds(
  records: readonly JsonObject[],
  label: string,
  findings: E0ContractFinding[],
): Map<string, JsonObject> {
  const byId = new Map<string, JsonObject>();
  records.forEach((record, index) => {
    const id = record["id"];
    if (typeof id !== "string" || id.length === 0) {
      addFinding(
        findings,
        "E0_ID_MISSING",
        `${label}[${String(index)}].id`,
        "Every record must have one nonempty string ID.",
      );
      return;
    }
    if (byId.has(id)) {
      addFinding(
        findings,
        "E0_ID_DUPLICATE",
        `${label}.${id}`,
        "Record IDs must be unique within their ledger.",
      );
      return;
    }
    byId.set(id, record);
  });
  return byId;
}

function visitObjects(
  value: unknown,
  visit: (record: JsonObject) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) visitObjects(item, visit);
    return;
  }
  const record = objectAt(value);
  if (record === null) return;
  visit(record);
  for (const child of Object.values(record)) visitObjects(child, visit);
}

function recordsById(value: unknown, id: string): JsonObject[] {
  const results: JsonObject[] = [];
  visitObjects(value, (record) => {
    if (record["id"] === id) results.push(record);
  });
  return results;
}

function findRecordById(value: unknown, id: string): JsonObject | null {
  return recordsById(value, id)[0] ?? null;
}

function valueAtJsonPointer(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) return undefined;
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, token) => {
      if (Array.isArray(current)) {
        const index = /^(?:0|[1-9][0-9]*)$/u.test(token)
          ? Number(token)
          : Number.NaN;
        return Number.isSafeInteger(index) ? current[index] : undefined;
      }
      return objectAt(current)?.[token];
    }, value);
}

function valueAtDottedPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    return objectAt(current)?.[segment];
  }, value);
}

function materializeSetMutations(
  base: JsonObject,
  fixture: JsonObject,
  resolveCurrentValue: (
    value: JsonObject,
    path: readonly (string | number)[],
  ) => unknown = valueAtPropertyPath,
): JsonObject | null {
  const materialized = structuredClone(base);
  for (const mutation of recordsAt(fixture["orderedMutations"])) {
    if (mutation["operation"] !== "set") return null;
    const path = mutation["path"];
    if (!isNonemptyPropertyPath(path) || !("to" in mutation)) {
      return null;
    }
    if (
      "from" in mutation &&
      !sameJson(valueAtPropertyPath(materialized, path), mutation["from"]) &&
      !sameJson(resolveCurrentValue(materialized, path), mutation["from"])
    ) {
      return null;
    }
    let cursor: unknown = materialized;
    for (const segment of path.slice(0, -1)) {
      if (typeof segment === "number" && Array.isArray(cursor)) {
        cursor = cursor[segment];
      } else if (typeof segment === "string") {
        cursor = objectAt(cursor)?.[segment];
      } else {
        return null;
      }
      if (cursor === undefined) return null;
    }
    const last = path.at(-1);
    if (typeof last === "number" && Array.isArray(cursor)) {
      cursor[last] = structuredClone(mutation["to"]);
    } else if (typeof last === "string" && objectAt(cursor) !== null) {
      Object.assign(cursor as JsonObject, {
        [last]: structuredClone(mutation["to"]),
      });
    } else {
      return null;
    }
  }
  return materialized;
}

function materializeStateFixture(
  fixtureId: string,
  inputFixtureById: ReadonlyMap<string, JsonObject>,
  sharedBases: JsonObject,
  loaded: ReadonlyMap<string, JsonObject>,
  visiting: ReadonlySet<string> = new Set<string>(),
): JsonObject | null {
  if (visiting.has(fixtureId)) return null;
  const fixture = inputFixtureById.get(fixtureId);
  if (fixture === undefined) return null;
  const nextVisiting = new Set(visiting);
  nextVisiting.add(fixtureId);
  const baseReference = fixture["base"];
  let base: JsonObject | null = null;
  if (typeof baseReference === "string") {
    base = materializeStateFixture(
      baseReference,
      inputFixtureById,
      sharedBases,
      loaded,
      nextVisiting,
    );
  } else {
    const reference = objectAt(baseReference);
    const sharedBaseId = reference?.["sharedBase"];
    const fixtureBaseId = reference?.["fixtureId"];
    if (typeof sharedBaseId === "string") {
      const sharedBase = objectAt(sharedBases[sharedBaseId]);
      base = objectAt(sharedBase?.["value"]) ?? sharedBase;
    } else if (typeof fixtureBaseId === "string") {
      base = materializeStateFixture(
        fixtureBaseId,
        inputFixtureById,
        sharedBases,
        loaded,
        nextVisiting,
      );
    }
  }
  return base === null
    ? null
    : materializeSetMutations(base, fixture, (value, path) =>
        valueAtMaterializedStatePath(value, path, sharedBases, loaded),
      );
}

function expandSharedBaseReferences(
  value: unknown,
  sharedBases: JsonObject,
  visiting: ReadonlySet<string> = new Set<string>(),
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      expandSharedBaseReferences(item, sharedBases, visiting),
    );
  }
  const record = objectAt(value);
  if (record === null) return structuredClone(value);
  const sharedBaseId = record["sharedBase"];
  if (Object.keys(record).length === 1 && typeof sharedBaseId === "string") {
    if (visiting.has(sharedBaseId)) return null;
    const sharedBase = sharedBases[sharedBaseId];
    if (sharedBase === undefined) return null;
    const nextVisiting = new Set(visiting);
    nextVisiting.add(sharedBaseId);
    return expandSharedBaseReferences(
      objectAt(sharedBase)?.["value"] ?? sharedBase,
      sharedBases,
      nextVisiting,
    );
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      expandSharedBaseReferences(child, sharedBases, visiting),
    ]),
  );
}

function materializeInputFixturePayload(
  fixtureId: string,
  inputFixtureById: ReadonlyMap<string, JsonObject>,
  sharedBases: JsonObject,
  visiting: ReadonlySet<string> = new Set<string>(),
): JsonObject | null {
  if (visiting.has(fixtureId)) return null;
  const fixture = inputFixtureById.get(fixtureId);
  if (fixture === undefined) return null;
  const nextVisiting = new Set(visiting);
  nextVisiting.add(fixtureId);
  if ("value" in fixture) {
    return objectAt(expandSharedBaseReferences(fixture["value"], sharedBases));
  }
  const reference = objectAt(fixture["base"]);
  const fixtureBaseId = reference?.["fixtureId"];
  const sharedBaseId = reference?.["sharedBase"];
  let base: JsonObject | null = null;
  if (typeof fixtureBaseId === "string") {
    base = materializeInputFixturePayload(
      fixtureBaseId,
      inputFixtureById,
      sharedBases,
      nextVisiting,
    );
  } else if (typeof sharedBaseId === "string") {
    base = objectAt(
      expandSharedBaseReferences({ sharedBase: sharedBaseId }, sharedBases),
    );
  }
  return base === null ? null : materializeSetMutations(base, fixture);
}

function valueAtPropertyPath(
  value: unknown,
  path: readonly (string | number)[],
): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (typeof segment === "number" && Array.isArray(current)) {
      return current[segment];
    }
    return typeof segment === "string"
      ? objectAt(current)?.[segment]
      : undefined;
  }, value);
}

function resolveMaterializedStateReference(
  value: unknown,
  sharedBases: JsonObject,
  loaded: ReadonlyMap<string, JsonObject>,
  visiting: ReadonlySet<string> = new Set<string>(),
): unknown {
  const record = objectAt(value);
  if (record === null) return value;
  const sharedBaseId = record["sharedBase"];
  if (typeof sharedBaseId === "string") {
    if (visiting.has(sharedBaseId)) return undefined;
    const sharedBase = objectAt(sharedBases[sharedBaseId]);
    if (sharedBase === null) return undefined;
    const nextVisiting = new Set(visiting);
    nextVisiting.add(sharedBaseId);
    const resolvedBase = resolveMaterializedStateReference(
      objectAt(sharedBase["value"]) ?? sharedBase,
      sharedBases,
      loaded,
      nextVisiting,
    );
    const overrides = Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== "sharedBase"),
    );
    if (Object.keys(overrides).length === 0) return resolvedBase;
    const resolvedRecord = objectAt(resolvedBase);
    return resolvedRecord === null
      ? undefined
      : { ...resolvedRecord, ...overrides };
  }
  const fixtureId = record["fixtureId"];
  if (
    record["materializeAs"] === "ValidatedDocument" &&
    typeof fixtureId === "string"
  ) {
    return loaded.get(fixtureId);
  }
  return value;
}

function valueAtMaterializedStatePath(
  value: unknown,
  path: readonly (string | number)[],
  sharedBases: JsonObject,
  loaded: ReadonlyMap<string, JsonObject>,
): unknown {
  let current = value;
  for (const segment of path) {
    current = resolveMaterializedStateReference(current, sharedBases, loaded);
    if (typeof segment === "number" && Array.isArray(current)) {
      current = current[segment];
    } else if (typeof segment === "string") {
      current = objectAt(current)?.[segment];
    } else {
      return undefined;
    }
  }
  return resolveMaterializedStateReference(current, sharedBases, loaded);
}

function jsonDiffPaths(
  left: unknown,
  right: unknown,
  path: readonly (string | number)[] = [],
): readonly (readonly (string | number)[])[] {
  if (sameJson(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [path];
    return left.flatMap((item, index) =>
      jsonDiffPaths(item, right[index], [...path, index]),
    );
  }
  const leftRecord = objectAt(left);
  const rightRecord = objectAt(right);
  if (leftRecord === null || rightRecord === null) return [path];
  const keys = [
    ...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]),
  ].sort(codeUnitCompare);
  return keys.flatMap((key) => {
    if (!Object.hasOwn(leftRecord, key) || !Object.hasOwn(rightRecord, key)) {
      return [[...path, key]];
    }
    return jsonDiffPaths(leftRecord[key], rightRecord[key], [...path, key]);
  });
}

async function readFixtureAuthority(
  relativePath: string,
  cache: Map<string, JsonObject | null>,
  findings: E0ContractFinding[],
): Promise<JsonObject | null> {
  if (cache.has(relativePath)) return cache.get(relativePath) ?? null;
  if (
    !relativePath.startsWith("tests/fixtures/") ||
    relativePath.includes("..")
  ) {
    addFinding(
      findings,
      "E0_INPUT_SOURCE_PATH",
      relativePath,
      "Input-ledger authorities must be checked-in fixture paths inside tests/fixtures.",
    );
    cache.set(relativePath, null);
    return null;
  }
  const path = resolve(REPOSITORY_ROOT, relativePath);
  let source: string;
  try {
    const bytes = await readFile(path);
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    addFinding(
      findings,
      "E0_INPUT_SOURCE_UNREADABLE",
      relativePath,
      "Input-ledger authority must exist as readable UTF-8.",
    );
    cache.set(relativePath, null);
    return null;
  }
  for (const duplicate of duplicateJsonKeys(source)) {
    addFinding(
      findings,
      "E0_INPUT_SOURCE_DUPLICATE_KEY",
      `${relativePath}:${duplicate}`,
      "Input-ledger JSON authority cannot contain decoded duplicate keys.",
    );
  }
  try {
    const parsed: unknown = JSON.parse(source);
    const root = objectAt(parsed);
    if (root === null) throw new Error("root");
    cache.set(relativePath, root);
    return root;
  } catch {
    addFinding(
      findings,
      "E0_INPUT_SOURCE_JSON_INVALID",
      relativePath,
      "Input-ledger JSON authority must parse to an object root.",
    );
    cache.set(relativePath, null);
    return null;
  }
}

async function readDirectoryNames(path: string): Promise<string[]> {
  try {
    return (await readdir(path)).sort(codeUnitCompare);
  } catch {
    return [];
  }
}

async function readUpstreamF2MutationControls(
  findings: E0ContractFinding[],
): Promise<Map<string, JsonObject>> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(UPSTREAM_F2_ADVERSARIAL_FIXTURE);
  } catch {
    addFinding(
      findings,
      "E0_F2_AUTHORITY_UNREADABLE",
      UPSTREAM_F2_ADVERSARIAL_FIXTURE,
      "The reviewed F2 adversarial authority must be readable.",
    );
    return new Map();
  }

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    addFinding(
      findings,
      "E0_F2_AUTHORITY_UTF8_INVALID",
      UPSTREAM_F2_ADVERSARIAL_FIXTURE,
      "The reviewed F2 adversarial authority must be valid UTF-8.",
    );
    return new Map();
  }

  for (const duplicate of duplicateJsonKeys(source)) {
    addFinding(
      findings,
      "E0_F2_AUTHORITY_DUPLICATE_KEY",
      `${UPSTREAM_F2_ADVERSARIAL_FIXTURE}:${duplicate}`,
      "The reviewed F2 adversarial authority cannot contain decoded duplicate keys.",
    );
  }

  let root: JsonObject;
  try {
    const value: unknown = JSON.parse(source);
    if (!isObject(value)) {
      addFinding(
        findings,
        "E0_F2_AUTHORITY_ROOT_INVALID",
        UPSTREAM_F2_ADVERSARIAL_FIXTURE,
        "The reviewed F2 adversarial authority root must be an object.",
      );
      return new Map();
    }
    root = value;
  } catch {
    addFinding(
      findings,
      "E0_F2_AUTHORITY_JSON_INVALID",
      UPSTREAM_F2_ADVERSARIAL_FIXTURE,
      "The reviewed F2 adversarial authority must be valid JSON.",
    );
    return new Map();
  }

  if (root["schema"] !== "changes.fixtures.f2-adversarial-cases.v1") {
    addFinding(
      findings,
      "E0_F2_AUTHORITY_SCHEMA_INVALID",
      `${UPSTREAM_F2_ADVERSARIAL_FIXTURE}.schema`,
      "The inherited mutation cross-check requires the reviewed F2 schema.",
    );
  }
  return uniqueRecordIds(
    recordsAt(root["mutationControls"]),
    "f2MutationControls",
    findings,
  );
}

export async function validateE0Contract(
  fixtureRoot = new URL("../tests/fixtures/interchange", import.meta.url)
    .pathname,
  options: E0ContractValidationOptions = {},
): Promise<E0ContractValidationReport> {
  const findings: E0ContractFinding[] = [];
  const loaded = new Map<string, JsonObject>();
  const byteLengths = new Map<string, number>();
  const sources = new Map<string, string>();

  const expectedRootNames = [...EXPECTED_JSON_FILES, "goldens"].sort(
    codeUnitCompare,
  );
  requireExact(
    await readDirectoryNames(fixtureRoot),
    expectedRootNames,
    "E0_FILE_INVENTORY",
    fixtureRoot,
    "Fixture root must contain exactly the proposed contract, companions, and goldens directory.",
    findings,
  );
  requireExact(
    await readDirectoryNames(resolve(fixtureRoot, "goldens")),
    E0_PROPOSED_GOLDENS.map((name) => name.slice("goldens/".length)).sort(
      codeUnitCompare,
    ),
    "E0_GOLDEN_INVENTORY",
    resolve(fixtureRoot, "goldens"),
    "Golden directory must contain exactly the declared packet.",
    findings,
  );

  const expectedByteDigests =
    options.expectedByteDigests ?? E0_PROPOSED_BYTE_DIGESTS;
  for (const filename of EXPECTED_FILES) {
    const path = resolve(fixtureRoot, filename);
    let bytes: Uint8Array;
    try {
      bytes = await readFile(path);
    } catch {
      addFinding(
        findings,
        "E0_FILE_MISSING",
        filename,
        "Declared fixture file is missing.",
      );
      continue;
    }
    byteLengths.set(filename, bytes.byteLength);
    const digest = sha256(bytes);
    if (digest !== expectedByteDigests[filename]) {
      addFinding(
        findings,
        "E0_DIGEST_MISMATCH",
        filename,
        "Fixture bytes differ from the proposed packet pin.",
      );
    }
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      addFinding(
        findings,
        "E0_UTF8_INVALID",
        filename,
        "Fixture bytes must be valid UTF-8.",
      );
      continue;
    }
    sources.set(filename, source);
    if (source.includes("\r")) {
      addFinding(
        findings,
        "E0_LINE_ENDING",
        filename,
        "Fixture files use LF only.",
      );
    }
    if (!source.endsWith("\n") || source.endsWith("\n\n")) {
      addFinding(
        findings,
        "E0_FINAL_NEWLINE",
        filename,
        "Every packet file ends in exactly one LF.",
      );
    }
    if (!filename.endsWith(".json")) continue;
    for (const duplicate of duplicateJsonKeys(source)) {
      addFinding(
        findings,
        "E0_JSON_DUPLICATE_KEY",
        `${filename}:${duplicate}`,
        "Decoded duplicate JSON keys are forbidden.",
      );
    }
    try {
      const value: unknown = JSON.parse(source);
      if (!isObject(value)) {
        addFinding(
          findings,
          "E0_JSON_ROOT",
          filename,
          "Fixture JSON root must be an object.",
        );
      } else {
        loaded.set(filename, value);
      }
    } catch {
      addFinding(
        findings,
        "E0_JSON_SYNTAX",
        filename,
        "Fixture JSON must parse without a reviver.",
      );
    }
  }

  for (const filename of EXPECTED_JSON_FILES) {
    const value = loaded.get(filename);
    if (value?.["schema"] !== EXPECTED_SCHEMAS[filename]) {
      addFinding(
        findings,
        "E0_SCHEMA",
        `${filename}.schema`,
        "Fixture schema does not match the closed E0 packet vocabulary.",
      );
    }
    if (
      filename !== CONTRACT_FILENAME &&
      value?.["reviewState"] !== REVIEW_STATE
    ) {
      addFinding(
        findings,
        "E0_REVIEW_STATE",
        `${filename}.reviewState`,
        "The first E0 golden packet remains proposed until human acceptance.",
      );
    }
  }

  const contract = loaded.get(CONTRACT_FILENAME) ?? {};
  const semanticPacket = Object.fromEntries(
    EXPECTED_JSON_FILES.map((filename) => [
      filename,
      loaded.get(filename) ?? null,
    ]),
  );
  const semanticDigest = sha256(
    new TextEncoder().encode(stableJson(semanticPacket)),
  );
  if (semanticDigest !== E0_PROPOSED_SEMANTIC_DIGEST) {
    addFinding(
      findings,
      "E0_SEMANTIC_DIGEST",
      fixtureRoot,
      "Parsed contract, cases, limits, controls, provenance, and traces differ from the independent semantic pin.",
    );
  }
  requireExact(
    objectAt(contract["publicSurface"])?.["exportOperations"],
    E0_PROPOSED_EXPORT_OPERATIONS,
    "E0_EXPORT_OPERATIONS",
    `${CONTRACT_FILENAME}.publicSurface.exportOperations`,
    "Export operations must match the public handoff.",
    findings,
  );
  requireExact(
    objectAt(contract["publicSurface"])?.["applicationOperations"],
    E0_PROPOSED_APPLICATION_OPERATIONS,
    "E0_APPLICATION_OPERATIONS",
    `${CONTRACT_FILENAME}.publicSurface.applicationOperations`,
    "Application operations must match the public handoff.",
    findings,
  );
  requireExact(
    contract["publicSurface"],
    {
      exportModule: "src/export/interchange-contract.ts",
      applicationModule: "src/application/e0-interchange-contract.ts",
      exportOperations: E0_PROPOSED_EXPORT_OPERATIONS,
      applicationOperations: E0_PROPOSED_APPLICATION_OPERATIONS,
      exportCompositionFactory: "createE0ExportOperations",
      compositionFactory: "createE0InterchangeOperations",
      dependencyBinding: "application-composition-root-once",
      publicOperationsAcceptTrustedAdapters: false,
      applicationOperationParameters: {
        readImportSource: ["request", "signal"],
        prepareImportPreview: ["request"],
        commitImportReplacement: ["request"],
        prepareCanonicalExportDelivery: ["request"],
        completeCanonicalExportMarkerSettlement: ["request"],
      },
      exportOperationParameters: {
        prepareCanonicalJsonExport: ["request"],
        prepareLeadSheetTextExport: ["request"],
        sanitizeExportFilename: ["title", "format"],
        deliverExportArtifact: ["request"],
      },
      readImportSourcePerCallAuthority:
        "untrusted-bounded-byte-source-capability-only",
      sourcePolicyGates: [
        "no-ui-or-e0-callsite-constructs-or-submits-replace-document-through-general-runner",
        "no-ui-or-e0-callsite-dispatches-raw-mark-exported",
        "no-public-e0-operation-accepts-caller-supplied-trusted-dependency",
        "no-public-marker-operation-accepts-artifact-bytes-receipt-candidate-hash-timestamp-or-previous-marker",
        "marker-delivery-starts-before-first-await-or-microtask",
        "no-public-marker-result-contains-appstate",
      ],
      consumerAdapters: [
        "CanonicalJsonExportDependencies",
        "LeadSheetTextExportDependencies",
        "PrepareImportPreviewDependencies",
        "CommitImportReplacementDependencies.prepareImportReplacementPublication",
        "CommitImportReplacementDependencies.retireImportReplacement",
        "CommitImportReplacementDependencies.discardImportReplacementPublication",
        "CommitImportReplacementDependencies.publishImportReplacement",
        "CanonicalExportMarkerOrchestrationDependencies.prepareCanonicalJsonExport",
        "CanonicalExportMarkerOrchestrationDependencies.startPreparedExportDelivery",
        "CanonicalExportMarkerOrchestrationDependencies.readCurrentApplicationDocumentIdentity",
        "CanonicalExportMarkerOrchestrationDependencies.readExportTimestamp",
        "CanonicalExportMarkerSettlementAdapters.publishCanonicalExportRevision",
        "CanonicalExportMarkerSettlementAdapters.queueCanonicalExportMarkerPersistence",
      ],
    },
    "E0_PUBLIC_SURFACE",
    `${CONTRACT_FILENAME}.publicSurface`,
    "Trusted dependencies must be bound once and absent from public operation calls.",
    findings,
  );
  requireExact(
    contract["importDraftIntegration"],
    {
      a0PublicStateField: "AppState.importDraft",
      requiredType: "InterchangeImportDraft | null",
      legacyLooseImportDraftAllowed: false,
      candidateOnlyThroughReadyPreview: true,
      completeUpstreamReportsRetained: false,
      rawPayloadRetained: false,
      buildProof: "static-type-reducer-branch-and-forbidden-retention",
    },
    "E0_IMPORT_DRAFT_INTEGRATION",
    `${CONTRACT_FILENAME}.importDraftIntegration`,
    "E0/build must replace A0's loose import draft with the exclusive bounded E0 union.",
    findings,
  );
  requireExact(
    contract["importAcquisition"],
    {
      readMaximumBytesPlusOne: 2_097_153,
      sourceCapabilityTrust: "untrusted-bounded-byte-source-only",
      rawReturnBoundary: "unknown-until-validated-and-normalized",
      acceptedBytesType: "Uint8Array",
      observedByteLengthLaw:
        "nonnegative-safe-integer-equal-to-bytes.byteLength",
      oversizedReturnedArrayOutcome: "import.read_failed",
      malformedOrExceptionalOutcome: "import.read_failed",
      exactCancellationOutcome: "import.read_cancelled",
      acceptedBytesCopied: true,
      terminalSettlements: 1,
      rawValueRetained: false,
    },
    "E0_IMPORT_ACQUISITION",
    `${CONTRACT_FILENAME}.importAcquisition`,
    "The untrusted byte-source capability must be capped, copied, and normalized without raw retention.",
    findings,
  );
  requireExact(
    contract["adapterExceptionPolicy"],
    {
      rawThrownValueRetained: false,
      hashThrowRejectionOrMalformed:
        "export.hash_unavailable-no-raw-retention-no-partial-artifact",
      a0PreparationThrow:
        "preparation-protocol-invalid-request-identity-invalidation-before-return",
      x1ThrowOrRejection:
        "retirement-evidence-invalid-request-identity-invalidation-transport-reconciliation-required",
      a0PublicationThrow:
        "publication-result-invalid-request-identity-invalidation-application-transport-reconciliation-required",
      a0MarkerPublicationThrow:
        "publication-result-invalid-application-reconciliation-required-no-A1-call",
      a1MarkerPersistenceThrowOrRejection:
        "persistence-result-invalid-recovery-reconciliation-required",
      canonicalPreparationThrowOrRejection:
        "preparation-protocol-invalid-registry-empty-release-gate-failed",
      currentStateIdentityThrowOrMalformed:
        "state-identity-protocol-invalid-release-gate-failed-no-browser-A0-or-A1",
      deliveryStartOrCompletionProtocolInvalid:
        "cleanup-unknown-delivery-resource-reconciliation-required-no-A0-or-A1",
      clockThrowOrMalformed:
        "timestamp-invalid-no-application-reconciliation-no-A0-or-A1",
      canonicalPreparedRegistryCleanupThrow:
        "forbidden-by-total-E0-primitive-build-gate",
      preparedRegistryInvalidationThrow:
        "forbidden-by-total-A0-primitive-build-gate",
    },
    "E0_ADAPTER_EXCEPTION_POLICY",
    `${CONTRACT_FILENAME}.adapterExceptionPolicy`,
    "Every authority-boundary throw or rejection needs an exact normalized terminal outcome.",
    findings,
  );
  requireExact(
    contract["chartImportDefaults"],
    {
      parseMode: "document",
      parseAccidentalStyle: "ascii",
      callerMayChooseParseAccidentalStyle: false,
      title: "Imported lead sheet",
      description: "",
      tempoBpm: 120,
      key: null,
      playback: {
        instrumentId: "mellow-keys",
        masterVolume: 0.8,
        reverbAmount: 0.2,
        countInBars: 0,
      },
      sectionNamePrefix: "Section ",
      sectionKeyOverride: null,
      sectionVoiceLeadingBoundary: "reset",
      eventAnnotation: "",
      autoVoicing: {
        mode: "auto",
        family: "balanced",
        voiceCount: 4,
        range: { lowMidi: 48, highMidi: 84 },
        bassPolicy: "generated",
      },
      idAllocationOrder: [
        "document",
        "for-each-section:section",
        "for-each-measure-in-section:measure",
        "for-each-event-in-measure:event",
      ],
      replacementOrigin: "canonical-import",
      sourceFormat: "chart-text-v1",
    },
    "E0_CHART_IMPORT_DEFAULTS",
    `${CONTRACT_FILENAME}.chartImportDefaults`,
    "Chart import must freeze document mode, ASCII accidental style, disclosed defaults, and deterministic ID order.",
    findings,
  );
  requireExact(
    contract["previewRetention"],
    {
      rawSourceRetained: false,
      completeLegacyReportRetained: false,
      completeChartWarningsRetained: false,
      completeChartDiagnosticsRetained: false,
      issueProjection: "stage-path-code-first-64",
      reportProjection: "group-source-path-code-target-path-first-256",
      reportCodeType: "LegacyReportCode",
      publicPath: {
        maximumSegments: 32,
        maximumIndex: 65_536,
        unknownField: "<redacted-field>",
        invalidIndex: "<invalid-index>",
        truncated: "<path-truncated>",
        fieldVocabularySource:
          "deduplicated-canonical-json-and-reviewed-c0-fields",
      },
      transientEvidenceOwners: [
        "C0.complete-report",
        "T0.complete-diagnostics",
        "T0.complete-warnings",
      ],
    },
    "E0_PREVIEW_RETENTION_POLICY",
    `${CONTRACT_FILENAME}.previewRetention`,
    "Preview/refusal/application state must retain only bounded projections while complete C0/T0 evidence stays transient.",
    findings,
  );
  requireExact(
    contract["replacementRetirement"],
    {
      evidenceAuthority: "x1-serialized-transport",
      authorityBoundary:
        "production-bound-serialized-adapter-call-plus-exact-request-echo",
      requestFields: [
        "identity",
        "sourceFormat",
        "candidateDocumentId",
        "expectedTransportGeneration",
        "scope",
        "requiredPostcondition",
      ],
      scope: "progression-and-preview",
      requiredPostcondition: "zero-future-attack",
      adapterRefusalCodes: [
        "transport.replacement_retirement_unavailable",
        "transport.replacement_retirement_failed",
        "transport.replacement_retirement_stale",
      ],
      adapterRefusalEffect: "none",
      callerSuppliesEvidence: false,
      preflightBeforeAdapter: [
        "request-and-document-identity",
        "current-revision",
        "retiring-transition",
        "candidate-and-disposition",
        "confirmation",
        "replacement-impact",
      ],
      evidenceFields: ["schema", "authority", "request", "receipt"],
      receiptFields: [
        "requestId",
        "retiredTransportGeneration",
        "progressionRetired",
        "previewRetired",
        "noFutureAttack",
      ],
      invalidEvidenceDisposition: "reconciliation-required",
      preparationPort: "prepareImportReplacementPublication",
      preparationPortReturnBoundary: "unknown-until-validated-and-normalized",
      preparationProtocolInvalidCode:
        "import.replacement_preparation_result_invalid",
      preparedCapability:
        "private-single-use-A0-registry-entry-keyed-by-request-identity",
      preparedRegistryKey: "exact-import-request-identity",
      preparedRegistryBound: "one-per-active-document-transition-request",
      discardPort: "discardImportReplacementPublication",
      discardKey: "original-request-identity",
      discardPortContract: "trusted-total-synchronous-intra-A0-primitive",
      discardImplementationGate:
        "all-closed-reasons-idempotent-nonthrowing-liveForRequest-zero",
      discardResult: "invalidated-by-request-liveForRequest-zero",
      discardBeforePostPrepareRefusalReturn: true,
      postRetirementNonpublicationLiveCapabilities: 0,
      retirementPortReturnBoundary: "unknown-until-validated-and-normalized",
      publicationAfterEvidence: "synchronous-no-normal-refusal",
      publicationPortReturnBoundary: "unknown-until-validated-and-normalized",
      publicationProtocolInvalidCode:
        "import.replacement_publication_result_invalid",
      publicationProtocolInvalidDisposition:
        "reconciliation-required-no-claimed-post-state",
      successfulPreparationDisposition: "consumed",
      failedRetirementPreparationDisposition: "invalidated-by-request",
      failedPreflightPreparationDisposition: "not-created",
      rawReplacementCommandPublicCallsitesAllowed: false,
      publicOperationAcceptsDependencies: false,
      runtimeIntegrationOwner: "X1",
    },
    "E0_REPLACEMENT_RETIREMENT_BOUNDARY",
    `${CONTRACT_FILENAME}.replacementRetirement`,
    "Replacement must preflight before the serialized X1 call, validate exact evidence, and expose no caller-supplied authority or raw command path.",
    findings,
  );
  requireExact(
    contract["markerSettlementHandoffs"],
    {
      preparationOperation: "prepareCanonicalExportDelivery",
      publicOperation: "completeCanonicalExportMarkerSettlement",
      publicPreparationRequestFields: ["state"],
      publicCompletionRequestFields: [
        "state",
        "preparationId",
        "deliveryPreference",
      ],
      publicCompletionForbiddenAuthorityFields: [
        "previousMarker",
        "artifact",
        "bytes",
        "delivery",
        "candidate",
        "hash",
        "timestamp",
        "userGesture",
        "adapters",
      ],
      operationInvokesAdapters: true,
      currentIdentityReader:
        "bound-synchronous-controller-owned-unknown-until-validated",
      currentIdentityReadPoints: [
        "after-async-preparation-before-ready",
        "immediately-before-consume-and-browser-start",
      ],
      adapterOrder: ["A0", "A1"],
      candidateDerivationOrder: [
        "successful-bound-delivery",
        "strict-application-clock",
        "internal-candidate",
        "atomic-A0-CAS",
        "A1-persistence",
      ],
      internalSettlementDeliveryKinds: ["completed", "handed-off"],
      internalSettlementAcceptsPreviousMarker: false,
      currentIdentitySource: "atomic-A0-controller-latest-state-CAS",
      timestampPolicy: "exact-24-character-UTC-millisecond-toISOString",
      timestampInvalidApplicationReconciliation: false,
      timestampInvalidRetainsSuccessfulDelivery: true,
      markerStateFields: [
        "documentId",
        "revision",
        "exportedAt",
        "semanticDocumentHash",
        "canonicalPolicyVersion",
        "semanticHashPolicyVersion",
      ],
      a0PublicationFields: ["schema", "documentId", "revision"],
      a0PublicationOwner: "A0",
      a0PublicationRequestContainsClickTimeState: false,
      a0AtomicCas:
        "latest-controller-state-exact-document-and-revision-before-further-await",
      a0RawSuccessFields: ["ok", "outcome", "observedBefore", "state"],
      a0PublicSuccessReceiptFields: ["ok", "outcome", "documentId", "revision"],
      a0PublicRefusalReceiptFields: [
        "ok",
        "outcome",
        "code",
        "observedDocumentId",
        "observedRevision",
      ],
      a0RawStateRetainedAfterValidation: false,
      a0SuccessPreservesNewerEphemeralState: true,
      postDeliveryEditOutcome:
        "delivery-reported-A0-stale-latest-state-preserved-zero-A1",
      a0AdapterReturnBoundary: "unknown-until-validated-and-normalized",
      a0MutationPolicy: "checked-mark-exported-transition-only",
      a0PublicationRefusalCodes: [
        "export.marker_publication_stale",
        "export.marker_publication_failed",
      ],
      a1PersistenceFields: ["schema", "marker", "artifact"],
      a1PersistenceOwner: "A1",
      a1AdapterReturnBoundary: "unknown-until-validated-and-normalized",
      a1UnavailableCode: "recovery.marker_persistence_unavailable",
      a1FailureCode: "recovery.marker_persistence_failed",
      a1SuccessDurability: "recovery-persisted",
      a1CompletionEchoesMarker: false,
      a0ProtocolInvalidCode: "export.marker_publication_result_invalid",
      a1ProtocolInvalidCode: "recovery.marker_persistence_result_invalid",
      publicPreviousMarkerAccepted: false,
      noEffectResultReturnsAppStateSnapshot: false,
      publicMarkerResultsContainAppState: false,
      currentStateSource: "controller-selectors-only",
      editDuringA1CannotInstallHistoricalState: true,
      protocolInvalidPersistenceDurability: "reconciliation-required",
      protocolInvalidPublicDiagnostic: "closed-bounded-no-raw-result-retention",
      detachedPersistMarkerFlagAllowed: false,
      advancedRequiresA0Success: true,
      a1QueueRequiresA0Success: true,
      reloadSurvivalClaimBeforeA1Success: false,
      unchangedOutcomesReturnNullHandoffs: true,
      advancedResultDuplicatesStateOrMarker: false,
      rawMarkExportedPublicCallsitesAllowed: false,
      publicOperationAcceptsAdapters: false,
      publicationProtocolInvalidApplicationReconciliation: "required",
      persistenceProtocolInvalidRecoveryReconciliation: "required",
    },
    "E0_MARKER_SETTLEMENT_HANDOFFS",
    `${CONTRACT_FILENAME}.markerSettlementHandoffs`,
    "An advanced canonical marker must emit exact checked A0 and artifact-bound A1 handoffs without a premature durability claim.",
    findings,
  );
  requireExact(
    {
      deliveryBindingFields: contract["deliveryBindingFields"],
      deliveryCleanupFields: contract["deliveryCleanupFields"],
      deliveryCleanupPolicy: contract["deliveryCleanupPolicy"],
      cleanFailureChannelCorrelation:
        contract["cleanFailureChannelCorrelation"],
      deliveryCleanupFailure: contract["deliveryCleanupFailure"],
      deliveryProtocolInvalid: contract["deliveryProtocolInvalid"],
      artifactPayloadOwnership: contract["artifactPayloadOwnership"],
      deliveryActivation: contract["deliveryActivation"],
      preparedCanonicalExportRegistry:
        contract["preparedCanonicalExportRegistry"],
      deliveryOutcomes: contract["deliveryOutcomes"],
    },
    {
      deliveryBindingFields: [
        "kind",
        "sourceDocumentId",
        "filename",
        "byteLength",
        "bytesOffered",
        "semanticDocumentHash",
      ],
      deliveryCleanupFields: [
        "cleanup",
        "objectUrlsCreated",
        "objectUrlsRevoked",
        "outstandingOwnedResources",
      ],
      deliveryCleanupPolicy:
        "complete-correlated-created-revoked-zero-outstanding-or-typed-nonreceipt-reconciliation-required",
      cleanFailureChannelCorrelation: {
        null: "zero-object-urls",
        "file-system-access": "zero-object-urls",
        "object-url-download":
          "zero-before-create-or-one-created-and-one-revoked",
      },
      deliveryCleanupFailure: {
        outcome: "cleanup-failed",
        code: "export.delivery_cleanup_failed",
        artifact: null,
        failureKindOrder: [
          "writer-close",
          "writer-abort",
          "handle-release",
          "anchor-remove",
          "object-url-revoke",
        ],
        failureKindsUnique: true,
        maximumFailureKindsPerAttempt: 3,
        maximumOutstandingOwnedResources: 2,
        channelCorrelations: {
          "file-system-access": {
            allowedFailureKinds: [
              "writer-close",
              "writer-abort",
              "handle-release",
            ],
            objectUrlsCreated: 0,
            objectUrlsRevoked: 0,
          },
          "object-url-download": {
            allowedFailureKinds: ["anchor-remove", "object-url-revoke"],
            objectUrlsCreated: 1,
            objectUrlsRevokedLaw: "0-iff-revoke-failed-else-1",
          },
        },
        failureKindsOrderedUnique: true,
        outstandingCountsDistinctResourcesNotFailedCalls: true,
        markerAdvanceAuthorized: false,
        realAdapterReleaseGateFails: true,
      },
      deliveryProtocolInvalid: {
        outcome: "delivery-protocol-invalid",
        code: "export.delivery_result_invalid",
        cleanupKnowledge: "unknown",
        maximumPossibleOutstandingOwnedResources: 4,
        exactOutstandingResourceCountClaimed: false,
        cleanupFailureKindsClaimed: false,
        deliveryResourceReconciliation: "required",
        markerAdvanceAuthorized: false,
      },
      artifactPayloadOwnership: {
        publicPayload: "frozen-immutable-text-plus-exact-utf8-byteLength",
        publicMutableBytes: false,
        ordinaryDeliveryEncoding:
          "one-fresh-private-Uint8Array-before-browser-use",
        markerDeliveryEncoding:
          "one-private-Uint8Array-during-async-preparation-before-activation-task",
        markerPrivateBytesMaximum: 2_097_152,
        markerPrivateBytesOwnership:
          "single-use-registry-transfer-to-start-adapter-zeroed-on-terminal",
        preparedRegistryPayload: "text-free-binding-plus-private-bytes",
        startRequestContainsText: false,
        deliveryRevalidatesByteLength: true,
        callerOrConcurrentMutationCanChangeDeliveredBytes: false,
      },
      deliveryActivation: {
        requestContainsGestureAssertion: false,
        authority: "bound-browser-transient-user-activation-probe",
        observedSynchronouslyBeforeCapabilityUse: true,
        preparedDeliveryStartReturn:
          "synchronous-envelope-containing-completion-promise",
        requiredPreAwaitOrder: [
          "latest-document-identity-read",
          "consume-private-entry",
          "activation-probe",
          "picker-or-anchor-invocation",
          "return-completion-envelope",
          "first-await",
        ],
        forbiddenBeforeCapabilityInvocation: [
          "encode",
          "hash",
          "clock-read",
          "A0-call",
          "A1-call",
          "queued-microtask",
        ],
        missingCode: "export.delivery_user_gesture_required",
        missingActivationCreatesResources: 0,
      },
      preparedCanonicalExportRegistry: {
        owner: "E0-createE0InterchangeOperations-private",
        privateReadyValue:
          "text-free-canonical-delivery-binding-plus-single-owner-privateBytes",
        states: ["empty", "preparing", "ready", "delivering"],
        transitionOrder: ["empty", "preparing", "ready", "delivering", "empty"],
        maximumEntries: 1,
        maximumPrivateBytes: 2_097_152,
        preparationIdMinimum: 1,
        preparationIdMaximum: 9_007_199_254_740_991,
        initialPreparationId: 1,
        counterIncrement: "exactly-once-per-accepted-begin",
        generationRelation: "generation-equals-preparationId",
        maximumAllocatedOnceThen: "export.preparation_sequence_exhausted",
        wrapOrReuseAllowed: false,
        publicReadyFields: [
          "preparationId",
          "generation",
          "documentId",
          "revision",
          "filename",
          "byteLength",
          "semanticDocumentHash",
          "canonicalPolicyVersion",
          "semanticHashPolicyVersion",
        ],
        publicReadyForbiddenFields: [
          "artifact",
          "text",
          "bytes",
          "delivery",
          "candidate",
          "marker",
        ],
        beginPolicy: {
          preparingAnyIdentity: "export.preparation_busy",
          ready: "zero-old-bytes-then-begin-new",
          delivering: "export.preparation_busy",
        },
        singleFlightPreparation: true,
        maximumConcurrentPreparationTasks: 1,
        readyReplacement: "invalidate-and-zero-before-next-generation",
        lateCompletion: "generation-guarded-discard-and-zero",
        abandonPreparation:
          "matching-preparing-or-ready-generation-to-empty-and-zero-stale-id-exact-no-op",
        finishDelivery:
          "matching-delivering-generation-to-empty-and-zero-stale-id-exact-no-op",
        cleanupResultVocabulary: {
          abandonPreparation: ["abandoned", "ignored-stale"],
          finishDelivery: ["finished", "ignored-stale"],
        },
        unkeyedAsyncInvalidationAllowed: false,
        postPrepareCurrentIdentityCheck:
          "bound-synchronous-controller-read-before-ready-publication",
        documentRevisionChange:
          "entry-ineligible-lazy-discard-and-zero-on-next-prepare-or-complete",
        consumePolicy:
          "bound-latest-identity-read-then-exact-id-generation-document-revision-once-before-browser-with-no-await",
        invalidCurrentIdentityPolicy:
          "exact-request-id-keyed-abandon-and-zero-nonmatching-id-no-op-zero-browser-A0-A1",
        restoreAfterAttempt: false,
        successfulPreparationLiveEntries: 1,
        acceptedCompletionTerminalLiveEntries: 0,
        nonmatchingLocatorMayEraseReadyEntry: false,
        nonmatchingLocatorOutcome: "unavailable-preserve-unrelated-ready-entry",
        staleBeforeStartCalls: { browser: 0, A0: 0, A1: 0 },
        forgedStaleConsumedOrDoubleClickCalls: {
          browser: 0,
          A0: 0,
          A1: 0,
        },
      },
      deliveryOutcomes: [
        "completed",
        "handed-off",
        "cancelled",
        "failed",
        "cleanup-failed",
      ],
    },
    "E0_DELIVERY_CONTRACT",
    `${CONTRACT_FILENAME}.delivery`,
    "Delivery must own immutable text/private bytes and expose cleanup failure only as a bounded marker-ineligible nonreceipt.",
    findings,
  );
  requireExact(
    objectAt(contract["identities"])?.["importNonUndoableConfirmationSchema"],
    "changes.import-nonundoable-confirmation.v1",
    "E0_CONFIRMATION_SCHEMA",
    `${CONTRACT_FILENAME}.identities.importNonUndoableConfirmationSchema`,
    "Non-undoable confirmation requirement schema must remain explicit.",
    findings,
  );
  requireExact(
    contract["nonUndoableConfirmation"],
    {
      seedFields: ["confirmationId"],
      requirementFields: [
        "schema",
        "confirmationId",
        "identity",
        "candidateDocumentId",
        "commandId",
        "disclosedImpact",
      ],
      acknowledgementFields: ["kind", "requirement"],
      acknowledgementKind: "acknowledged",
      matchingPolicy: "field-identical-to-preview-requirement",
      commandConfirmationIdSource: "preview-requirement-only",
      oversizedImpactProof: {
        documentSharedBase: "workflow-document-history-oversized",
        stateSharedBase: "workflow-state-history-oversized-revision-7",
        estimator: "applicationHistoryRetainedByteEstimator",
        historyEntryRetainedBytes: 16_777_217,
        maximumHistoryRetainedBytes: 16_777_216,
        previewReassessmentAndCommitUseSameEstimator: true,
        bookmarkIdentityPolicy:
          "distinct-value-equal-current-and-replacement-bookmarks",
      },
    },
    "E0_CONFIRMATION_CONTRACT",
    `${CONTRACT_FILENAME}.nonUndoableConfirmation`,
    "Confirmation must be preview-owned, scoped, echoed exactly, and command-derived only from preview.",
    findings,
  );
  requireExact(
    contract["transportWorkflowMatrix"],
    {
      sourceFormats: E0_TRANSPORT_WORKFLOW_SOURCE_FORMATS,
      transportStatuses: E0_APPLICATION_TRANSPORT_STATUSES,
      actions: E0_TRANSPORT_WORKFLOW_ACTIONS,
      requiredCells: 56,
      equivalenceReductionAuthorized: false,
      applyFailureStatePolicy: "complete-format-specific-retiring-app-state",
      pendingRequestPolicy:
        "exactly-one-matching-running-document-transition-request",
      ordinaryFailure: "x1-no-effect-refusal",
      protocolNearMiss: "receipt.noFutureAttack-false-reconciliation-required",
      applyEvidence:
        "literal-14-row-format-status-request-echo-and-three-true-postconditions",
      preparationLifecycle:
        "allocate-before-X1-consume-on-success-invalidate-by-request-on-failure-zero-live-at-return",
      callerSuppliesEvidence: false,
      runtimeEvidenceMaterializationClaimedByE0: false,
    },
    "E0_TRANSPORT_MATRIX_CONTRACT",
    `${CONTRACT_FILENAME}.transportWorkflowMatrix`,
    "Public contract must name the literal 56-cell transport workflow proof.",
    findings,
  );
  requireExact(
    contract["replacementHandoffRefusalCodes"],
    [
      "import.confirmation_stale",
      "import.confirmation_wrong_document",
      "import.replacement_preparation_result_invalid",
      "transport.replacement_retirement_evidence_invalid",
      "transport.replacement_retirement_unavailable",
      "transport.replacement_retirement_failed",
      "transport.replacement_retirement_stale",
      "import.replacement_publication_result_invalid",
      "import.replacement_impact_unavailable",
      "import.confirmation_impact_mismatch",
      "import.confirmation_identity_mismatch",
      "history.nonundoable_confirmation_required",
    ],
    "E0_HANDOFF_REFUSAL_CODES",
    `${CONTRACT_FILENAME}.replacementHandoffRefusalCodes`,
    "Handoff refusal vocabulary must distinguish confirmation identity mismatch.",
    findings,
  );
  requireExact(
    contract["importStageOrder"],
    E0_PROPOSED_IMPORT_STAGE_ORDER,
    "E0_STAGE_ORDER",
    `${CONTRACT_FILENAME}.importStageOrder`,
    "Import failure precedence is closed and ordered.",
    findings,
  );
  requireExact(
    contract["limits"],
    E0_PROPOSED_LIMITS,
    "E0_LIMITS",
    `${CONTRACT_FILENAME}.limits`,
    "Public E0 limits must match the proposed semantic locks.",
    findings,
  );
  requireExact(
    contract["companions"],
    E0_PROPOSED_COMPANIONS,
    "E0_COMPANIONS",
    `${CONTRACT_FILENAME}.companions`,
    "Companion inventory must match the proposed packet.",
    findings,
  );
  requireExact(
    contract["goldens"],
    E0_PROPOSED_GOLDENS,
    "E0_GOLDENS",
    `${CONTRACT_FILENAME}.goldens`,
    "Golden inventory must match the proposed packet.",
    findings,
  );
  if (
    contract["reviewState"] !== REVIEW_STATE ||
    contract["humanAcceptanceClaim"] !== false
  ) {
    addFinding(
      findings,
      "E0_HUMAN_ACCEPTANCE_CLAIM",
      CONTRACT_FILENAME,
      "Validator locks bytes but cannot claim first-golden human acceptance.",
    );
  }
  for (const field of [
    "productionImplementationAvailableWhenAuthored",
    "productionOutputUsedAsOracle",
    "expectedValuesGenerated",
    "runtimeNetworkRequired",
  ] as const) {
    if (contract[field] !== false) {
      addFinding(
        findings,
        "E0_INDEPENDENCE",
        `${CONTRACT_FILENAME}.${field}`,
        "The proposed authority must remain independent and offline.",
      );
    }
  }

  const canonicalCases = recordsAt(
    loaded.get("canonical-json-cases.json")?.["cases"],
  );
  const chartTextCases = recordsAt(
    loaded.get("chart-text-cases.json")?.["cases"],
  );
  const importCases = recordsAt(loaded.get("import-cases.json")?.["cases"]);
  const workflowAdapterLedger = loaded.get("workflow-adapter-cases.json") ?? {};
  const workflowAdapterCases = recordsAt(workflowAdapterLedger["cases"]);
  const transportWorkflowMatrix = objectAt(
    workflowAdapterLedger["transportWorkflowMatrix"],
  );
  const transportWorkflowCells = recordsAt(transportWorkflowMatrix?.["cells"]);
  const limitFamilies = recordsAt(loaded.get("limit-cases.json")?.["cases"]);
  const limitCells = limitFamilies.flatMap((family) =>
    recordsAt(family["cells"]),
  );
  const ordinaryCases = [
    ...canonicalCases,
    ...chartTextCases,
    ...importCases,
    ...workflowAdapterCases,
  ];
  const topCases = [...ordinaryCases, ...limitFamilies];
  const allCaseEntities = [...topCases, ...limitCells];
  const caseById = uniqueRecordIds(allCaseEntities, "cases", findings);
  const topCaseById = uniqueRecordIds(topCases, "topCases", findings);

  const mutationLedger = loaded.get("mutation-controls.json") ?? {};
  const mutationControls = recordsAt(mutationLedger["controls"]);
  const inheritedControls = recordsAt(
    loaded.get("mutation-controls.json")?.["inheritedControls"],
  );
  const upstreamF2ControlById = await readUpstreamF2MutationControls(findings);
  const controlById = uniqueRecordIds(
    [...mutationControls, ...inheritedControls],
    "controls",
    findings,
  );
  const authorities = recordsAt(
    loaded.get("provenance-ledger.json")?.["authorities"],
  );
  const authorityById = uniqueRecordIds(authorities, "authorities", findings);
  const traces = recordsAt(loaded.get("trace-ledger.json")?.["traces"]);
  const traceById = uniqueRecordIds(traces, "traces", findings);
  const inputLedger = loaded.get("input-fixture-ledger.json") ?? {};
  const inputFixtures = recordsAt(inputLedger["fixtures"]);
  const inputFixtureById = uniqueRecordIds(
    inputFixtures,
    "inputFixtures",
    findings,
  );
  const requirementLedger = loaded.get("requirement-ledger.json") ?? {};
  const requirements = recordsAt(requirementLedger["requirements"]);
  const requirementById = uniqueRecordIds(
    requirements,
    "requirements",
    findings,
  );

  requireExact(
    {
      reviewState: inputLedger["reviewState"],
      expectedValuesGenerated: inputLedger["expectedValuesGenerated"],
      productionOutputUsedAsOracle: inputLedger["productionOutputUsedAsOracle"],
      matrixFiles: inputLedger["matrixFiles"],
      unresolvedTokens: inputLedger["unresolvedTokens"],
    },
    {
      reviewState: REVIEW_STATE,
      expectedValuesGenerated: false,
      productionOutputUsedAsOracle: false,
      matrixFiles: E0_INPUT_MATRIX_FILES,
      unresolvedTokens: [],
    },
    "E0_INPUT_LEDGER_POLICY",
    "input-fixture-ledger.json",
    "Input definitions must remain independently authored, fully resolved, and scoped to the five case matrices.",
    findings,
  );
  if (
    typeof inputLedger["authorship"] !== "string" ||
    inputLedger["authorship"].length === 0 ||
    objectAt(inputLedger["resolutionPolicy"]) === null ||
    objectAt(inputLedger["sharedBases"]) === null
  ) {
    addFinding(
      findings,
      "E0_INPUT_LEDGER_METADATA",
      "input-fixture-ledger.json",
      "Input ledger requires authorship, resolution policy, and shared-base metadata.",
    );
  }

  const usedInputFixtureIds = new Set<string>();
  const inputUseCaseIdsByFixture = new Map<string, Set<string>>();
  for (const filename of E0_INPUT_MATRIX_FILES) {
    visitObjects(loaded.get(filename), (record) => {
      if (!("inputFixtureIds" in record)) return;
      const ids = stringsAt(record["inputFixtureIds"]);
      if (
        !Array.isArray(record["inputFixtureIds"]) ||
        ids.length !== record["inputFixtureIds"].length
      ) {
        addFinding(
          findings,
          "E0_INPUT_USE_INVALID",
          `${filename}.inputFixtureIds`,
          "Every inputFixtureIds entry must be a string.",
        );
      }
      const caseId = record["id"];
      for (const id of ids) {
        usedInputFixtureIds.add(id);
        if (typeof caseId !== "string") continue;
        const caseIds = inputUseCaseIdsByFixture.get(id) ?? new Set<string>();
        caseIds.add(caseId);
        inputUseCaseIdsByFixture.set(id, caseIds);
      }
    });
  }
  const includeUsedFixtureDependencies = (
    fixtureId: string,
    visiting: ReadonlySet<string> = new Set<string>(),
  ): void => {
    if (visiting.has(fixtureId)) return;
    const fixture = inputFixtureById.get(fixtureId);
    if (fixture === undefined) return;
    const nextVisiting = new Set(visiting);
    nextVisiting.add(fixtureId);
    const dependencies = new Set<string>();
    visitObjects(fixture, (record) => {
      for (const [field, reference] of Object.entries(record)) {
        if (
          (field === "fixtureId" || field.endsWith("FixtureId")) &&
          typeof reference === "string" &&
          inputFixtureById.has(reference)
        ) {
          dependencies.add(reference);
        }
      }
    });
    if (
      typeof fixture["base"] === "string" &&
      inputFixtureById.has(fixture["base"])
    ) {
      dependencies.add(fixture["base"]);
    }
    for (const dependency of dependencies) {
      usedInputFixtureIds.add(dependency);
      includeUsedFixtureDependencies(dependency, nextVisiting);
    }
  };
  for (const fixtureId of [...usedInputFixtureIds]) {
    includeUsedFixtureDependencies(fixtureId);
  }
  requireExact(
    [...inputFixtureById.keys()].sort(codeUnitCompare),
    [...usedInputFixtureIds].sort(codeUnitCompare),
    "E0_INPUT_LEDGER_COVERAGE",
    "input-fixture-ledger.json.fixtures",
    "Every input token must have exactly one definition, with no unused definitions.",
    findings,
  );

  const sharedBases = objectAt(inputLedger["sharedBases"]) ?? {};
  const authorityCache = new Map<string, JsonObject | null>();
  const validateSourceDescriptor = async (
    fixtureId: string,
    label: string,
    value: unknown,
  ): Promise<void> => {
    const descriptor = objectAt(value);
    const relativePath = descriptor?.["path"];
    if (descriptor === null || typeof relativePath !== "string") {
      addFinding(
        findings,
        "E0_INPUT_SOURCE_MISSING",
        `${fixtureId}.${label}`,
        "Upstream input definitions require an exact checked-in source path.",
      );
      return;
    }
    const root = await readFixtureAuthority(
      relativePath,
      authorityCache,
      findings,
    );
    if (root === null) return;
    const caseId = descriptor["caseId"];
    const pointer = descriptor["jsonPointer"];
    const expectedCellIds = stringsAt(descriptor["cellIds"]);
    const selectorFamilies = [
      typeof caseId === "string",
      typeof pointer === "string",
      expectedCellIds.length > 0,
    ].filter(Boolean).length;
    if (selectorFamilies !== 1) {
      addFinding(
        findings,
        "E0_INPUT_SOURCE_SELECTOR_INVALID",
        `${fixtureId}.${label}`,
        "Upstream source must select exactly one case, JSON pointer, or reviewed cell set.",
      );
    }
    const caseRecords =
      typeof caseId === "string" ? recordsById(root, caseId) : [];
    const caseRecord = caseRecords[0] ?? null;
    if (typeof caseId === "string" && caseRecords.length !== 1) {
      addFinding(
        findings,
        "E0_INPUT_SOURCE_CASE_UNKNOWN",
        `${fixtureId}.${label}.caseId`,
        `Source fixture must contain exactly one ${caseId}; found ${String(caseRecords.length)}.`,
      );
    }
    const cellId = descriptor["cellId"];
    if (typeof cellId === "string" && typeof caseId !== "string") {
      addFinding(
        findings,
        "E0_INPUT_SOURCE_CELL_WITHOUT_CASE",
        `${fixtureId}.${label}.cellId`,
        "A cell selector must be scoped by one exact case ID.",
      );
    }
    if (
      typeof cellId === "string" &&
      recordsById(caseRecord ?? root, cellId).length !== 1
    ) {
      addFinding(
        findings,
        "E0_INPUT_SOURCE_CELL_UNKNOWN",
        `${fixtureId}.${label}.cellId`,
        `Source selection must contain exactly one ${cellId}.`,
      );
    }
    for (const expectedCellId of expectedCellIds) {
      if (recordsById(root, expectedCellId).length !== 1) {
        addFinding(
          findings,
          "E0_INPUT_SOURCE_CELL_UNKNOWN",
          `${fixtureId}.${label}.cellIds.${expectedCellId}`,
          `Source fixture must contain exactly one ${expectedCellId}.`,
        );
      }
    }
    if (
      typeof pointer === "string" &&
      valueAtJsonPointer(root, pointer) === undefined
    ) {
      addFinding(
        findings,
        "E0_INPUT_SOURCE_POINTER_UNKNOWN",
        `${fixtureId}.${label}.jsonPointer`,
        `Source fixture does not resolve ${pointer}.`,
      );
    }
  };

  for (const fixture of inputFixtures) {
    const id = String(fixture["id"]);
    const kind = fixture["kind"];
    if (typeof kind !== "string" || !E0_INPUT_FIXTURE_KINDS.has(kind)) {
      addFinding(
        findings,
        "E0_INPUT_KIND_MISSING",
        `${id}.kind`,
        "Every input definition requires one closed fixture kind.",
      );
    }
    if (kind === "local-golden") {
      requireExact(
        {
          id,
          relativeTo: fixture["relativeTo"],
          path: fixture["path"],
        },
        {
          id: fixture["path"],
          relativeTo: "tests/fixtures/interchange",
          path: fixture["path"],
        },
        "E0_INPUT_LOCAL_GOLDEN",
        id,
        "Local-golden definitions must resolve directly to their packet path.",
        findings,
      );
      const goldenPath = fixture["path"];
      if (
        typeof goldenPath !== "string" ||
        !(E0_PROPOSED_GOLDENS as readonly string[]).includes(goldenPath)
      ) {
        addFinding(
          findings,
          "E0_INPUT_LOCAL_GOLDEN_UNKNOWN",
          id,
          "Local-golden definition must name a declared E0 golden.",
        );
      }
    }
    if (typeof kind === "string" && kind.startsWith("upstream-")) {
      await validateSourceDescriptor(id, "source", fixture["source"]);
    }
    if (kind === "upstream-case") {
      const selection = objectAt(fixture["selection"]);
      const views = [
        ...(selection === null ? [] : [selection]),
        ...recordsAt(fixture["useProjections"]),
      ];
      const selectedCaseIds = new Set(
        views.flatMap((view) => stringsAt(view["e0CaseIds"])),
      );
      requireExact(
        [...selectedCaseIds].sort(codeUnitCompare),
        [...(inputUseCaseIdsByFixture.get(id) ?? [])].sort(codeUnitCompare),
        "E0_INPUT_PROJECTION_COVERAGE",
        `${id}.useProjections`,
        "Every use of an upstream case needs one explicit raw or validated-document projection.",
        findings,
      );
      const sourceDescriptor = objectAt(fixture["source"]);
      const sourcePath = sourceDescriptor?.["path"];
      const sourceCaseId = sourceDescriptor?.["caseId"];
      const sourceRoot =
        typeof sourcePath === "string"
          ? await readFixtureAuthority(sourcePath, authorityCache, findings)
          : null;
      const sourceCase =
        sourceRoot !== null && typeof sourceCaseId === "string"
          ? findRecordById(sourceRoot, sourceCaseId)
          : null;
      for (const view of views) {
        const projection = view["projection"];
        const sourceFields = stringsAt(view["sourceFields"]);
        if (
          typeof projection !== "string" ||
          sourceFields.length === 0 ||
          (projection === "validated-document-recipe" &&
            (typeof view["recipe"] !== "string" || view["recipe"].length === 0))
        ) {
          addFinding(
            findings,
            "E0_INPUT_PROJECTION_INCOMPLETE",
            id,
            "Each upstream projection needs source fields and validated-document projections need an independent recipe.",
          );
        }
        for (const sourceField of sourceFields) {
          if (valueAtDottedPath(sourceCase, sourceField) === undefined) {
            addFinding(
              findings,
              "E0_INPUT_PROJECTION_FIELD_UNKNOWN",
              `${id}.${sourceField}`,
              "Projection field must exist in the exact reviewed upstream case.",
            );
          }
        }
      }
    }
    if ("expectationSource" in fixture) {
      await validateSourceDescriptor(
        id,
        "expectationSource",
        fixture["expectationSource"],
      );
    }
    visitObjects(fixture, (record) => {
      for (const [field, reference] of Object.entries(record)) {
        if (
          (field === "fixtureId" || field.endsWith("FixtureId")) &&
          (typeof reference !== "string" || !inputFixtureById.has(reference))
        ) {
          addFinding(
            findings,
            "E0_INPUT_INTERNAL_REFERENCE_UNKNOWN",
            `${id}.${field}`,
            "Internal fixture reference must resolve to one ledger definition.",
          );
        }
        if (
          field === "sharedBase" &&
          (typeof reference !== "string" || !(reference in sharedBases))
        ) {
          addFinding(
            findings,
            "E0_INPUT_SHARED_BASE_UNKNOWN",
            `${id}.${field}`,
            "Shared-base reference must resolve inside the input ledger.",
          );
        }
      }
    });
    if (
      typeof fixture["base"] === "string" &&
      !inputFixtureById.has(fixture["base"])
    ) {
      addFinding(
        findings,
        "E0_INPUT_INTERNAL_REFERENCE_UNKNOWN",
        `${id}.base`,
        "String base must resolve to one ledger definition.",
      );
    }
    if (kind === "workflow-preview") {
      const base = objectAt(fixture["base"]);
      const overrides = objectAt(fixture["overrides"]);
      if (
        base?.["sharedBase"] !== "canonical-ready-import-preview" ||
        fixture["status"] !== "ready"
      ) {
        addFinding(
          findings,
          "E0_INPUT_PREVIEW_INCOMPLETE",
          id,
          "Ready workflow previews must compose the complete canonical ready-preview base.",
        );
      }
      if (
        overrides !== null &&
        ["legacyReport", "chartWarnings", "chartDiagnostics"].some(
          (field) => field in overrides,
        )
      ) {
        addFinding(
          findings,
          "E0_INPUT_PREVIEW_RETAINS_COMPLETE_EVIDENCE",
          id,
          "Workflow previews may override bounded projections but cannot retain complete C0/T0 evidence objects.",
        );
      }
    }
  }

  const previewBase = objectAt(sharedBases["canonical-ready-import-preview"]);
  const previewImpact = objectAt(previewBase?.["replacementImpact"]);
  const previewSeed = objectAt(previewBase?.["replacementCommandSeed"]);
  const previewCandidateId = previewBase?.["candidateFixtureId"];
  const previewCandidate =
    typeof previewCandidateId === "string"
      ? inputFixtureById.get(previewCandidateId)
      : undefined;
  if (
    previewBase === null ||
    previewBase["schema"] !== "changes.import-preview.v1" ||
    previewBase["policyId"] !== "changes.import-preview" ||
    previewBase["policyVersion"] !== 1 ||
    objectAt(previewBase["summary"]) === null ||
    objectAt(previewBase["issues"]) === null ||
    objectAt(previewBase["report"]) === null ||
    "legacyReport" in previewBase ||
    "chartWarnings" in previewBase ||
    "chartDiagnostics" in previewBase ||
    previewBase["rawSourceRetained"] !== false ||
    previewBase["autoApplyAuthorized"] !== false ||
    previewCandidate?.["kind"] !== "local-golden" ||
    typeof previewCandidate["path"] !== "string" ||
    !previewCandidate["path"].endsWith(".changes.json") ||
    previewSeed === null ||
    typeof previewSeed["id"] !== "string" ||
    typeof previewSeed["label"] !== "string" ||
    typeof previewSeed["logicalTimeMs"] !== "number" ||
    previewImpact === null ||
    previewImpact["confirmationRequired"] !== true ||
    previewImpact["undoDisposition"] !== "retained" ||
    previewImpact["exportRecommended"] !== false ||
    previewBase["nonUndoableConfirmationRequirement"] !== null
  ) {
    addFinding(
      findings,
      "E0_INPUT_PREVIEW_BASE_INVALID",
      "input-fixture-ledger.json.sharedBases.canonical-ready-import-preview",
      "Ready preview base must materialize the full typed preview, a validated JSON candidate, stored command seed, and correlated disclosed impact.",
    );
  }
  requireExact(
    {
      minimalDocumentSharedBase: sharedBases["workflow-document-minimal"],
      minimalGoldenDocumentId: loaded.get("goldens/minimal.changes.json")?.[
        "id"
      ],
      previewIdentity: previewBase?.["identity"],
      previewSourceFormat: previewBase?.["sourceFormat"],
      previewOrigin: previewBase?.["replacementOrigin"],
      previewCandidateFixtureId: previewBase?.["candidateFixtureId"],
    },
    {
      minimalDocumentSharedBase: {
        kind: "test-owned-validated-document-materialization",
        materializeAs: "ValidatedDocument",
        fixtureId: "goldens/minimal.changes.json",
      },
      minimalGoldenDocumentId: "document-e0-minimal",
      previewIdentity: { sharedBase: "request-identity-revision-7" },
      previewSourceFormat: "canonical-json-v2",
      previewOrigin: "canonical-import",
      previewCandidateFixtureId: "goldens/minimal.changes.json",
    },
    "E0_WORKFLOW_CANDIDATE_CORRELATION_INVALID",
    "input-fixture-ledger.json.sharedBases.canonical-ready-import-preview",
    "Preview candidate, validated-document source, document ID, request identity, source format, and replacement origin must remain exactly correlated.",
    findings,
  );

  const dependencyGraph = new Map<string, Set<string>>();
  const inspectInputReferences = (nodeId: string, value: unknown): void => {
    const dependencies = dependencyGraph.get(nodeId) ?? new Set<string>();
    dependencyGraph.set(nodeId, dependencies);
    visitObjects(value, (record) => {
      for (const [field, reference] of Object.entries(record)) {
        if (field === "fixtureId" || field.endsWith("FixtureId")) {
          if (
            typeof reference === "string" &&
            inputFixtureById.has(reference)
          ) {
            dependencies.add(`fixture:${reference}`);
          } else {
            addFinding(
              findings,
              "E0_INPUT_INTERNAL_REFERENCE_UNKNOWN",
              `${nodeId}.${field}`,
              "Internal fixture reference must resolve to one ledger definition.",
            );
          }
        }
        if (field === "sharedBase") {
          if (typeof reference === "string" && reference in sharedBases) {
            dependencies.add(`shared:${reference}`);
          } else {
            addFinding(
              findings,
              "E0_INPUT_SHARED_BASE_UNKNOWN",
              `${nodeId}.${field}`,
              "Shared-base reference must resolve inside the input ledger.",
            );
          }
        }
      }
    });
    const record = objectAt(value);
    if (typeof record?.["base"] === "string") {
      const reference = record["base"];
      if (inputFixtureById.has(reference)) {
        dependencies.add(`fixture:${reference}`);
      } else {
        addFinding(
          findings,
          "E0_INPUT_INTERNAL_REFERENCE_UNKNOWN",
          `${nodeId}.base`,
          "String base must resolve to one ledger definition.",
        );
      }
    }
  };
  for (const fixture of inputFixtures) {
    inspectInputReferences(`fixture:${String(fixture["id"])}`, fixture);
  }
  for (const [id, base] of Object.entries(sharedBases)) {
    inspectInputReferences(`shared:${id}`, base);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitDependency = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      addFinding(
        findings,
        "E0_INPUT_REFERENCE_CYCLE",
        nodeId,
        "Fixture and shared-base composition must be acyclic.",
      );
      return;
    }
    visiting.add(nodeId);
    for (const dependency of dependencyGraph.get(nodeId) ?? []) {
      visitDependency(dependency);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of dependencyGraph.keys()) visitDependency(nodeId);

  const allowedMutationOperations = new Set([
    "set",
    "append",
    "append-scalar",
    "rebuild-every-object",
  ]);
  visitObjects(inputLedger, (record) => {
    if (!("orderedMutations" in record)) return;
    const mutations = recordsAt(record["orderedMutations"]);
    if (
      !Array.isArray(record["orderedMutations"]) ||
      mutations.length !== record["orderedMutations"].length
    ) {
      addFinding(
        findings,
        "E0_INPUT_MUTATION_SEQUENCE_INVALID",
        "input-fixture-ledger.json.orderedMutations",
        "Derived inputs require an ordered array of mutation records; an explicit empty array is an identity recipe.",
      );
    }
    for (const mutation of mutations) {
      const operation = mutation["operation"];
      if (!allowedMutationOperations.has(String(operation))) {
        addFinding(
          findings,
          "E0_INPUT_MUTATION_OPERATION_UNKNOWN",
          "input-fixture-ledger.json.orderedMutations.operation",
          "Mutation recipes use only the closed deterministic operation vocabulary.",
        );
        continue;
      }
      if (operation === "rebuild-every-object") {
        if (
          (typeof mutation["keyOrder"] !== "string" &&
            objectAt(mutation["keyOrder"]) === null) ||
          (typeof mutation["scalarValues"] !== "string" &&
            objectAt(mutation["scalarValues"]) === null) ||
          (typeof mutation["arrayOrder"] !== "string" &&
            !Array.isArray(mutation["arrayOrder"]))
        ) {
          addFinding(
            findings,
            "E0_INPUT_MUTATION_REBUILD_INVALID",
            "input-fixture-ledger.json.orderedMutations",
            "Object rebuild mutations require key, scalar, and array-order recipes.",
          );
        }
        continue;
      }
      const path = mutation["path"];
      if (
        !Array.isArray(path) ||
        path.length === 0 ||
        path.some(
          (segment) =>
            typeof segment !== "string" &&
            (!Number.isSafeInteger(segment) || Number(segment) < 0),
        ) ||
        (!("to" in mutation) && !("value" in mutation))
      ) {
        addFinding(
          findings,
          "E0_INPUT_MUTATION_SHAPE_INVALID",
          "input-fixture-ledger.json.orderedMutations",
          "Set and append mutations require a nonempty typed path and exact target value.",
        );
      }
    }
  });

  const exactByteFixture = inputFixtureById.get("E0-IMPORT-CANONICAL-2097152");
  requireExact(
    exactByteFixture,
    {
      id: "E0-IMPORT-CANONICAL-2097152",
      kind: "derived-limit-document",
      recipe: E0_EXACT_BYTE_CANONICAL_RECIPE,
    },
    "E0_EXACT_BYTE_CANONICAL_RECIPE_INVALID",
    "E0-IMPORT-CANONICAL-2097152",
    "The accepted byte-boundary input must retain its complete independent canonical-document recipe.",
    findings,
  );
  try {
    const materialized = materializeE0ExactByteCanonicalImport(
      exactByteFixture?.["recipe"],
    );
    const parsed: unknown = JSON.parse(materialized.sourceText);
    if (
      materialized.utf8Bytes !== E0_PROPOSED_LIMITS.acceptedImportUtf8Bytes ||
      materialized.utf16CodeUnits >= materialized.utf8Bytes ||
      duplicateJsonKeys(materialized.sourceText).length !== 0 ||
      !isObject(parsed) ||
      parsed["schema"] !== "changes.progression.v2" ||
      recordsAt(parsed["sections"]).length !== 1 ||
      recordsAt(recordsAt(parsed["sections"])[0]?.["measures"]).length !== 1 ||
      recordsAt(
        recordsAt(recordsAt(parsed["sections"])[0]?.["measures"])[0]?.[
          "events"
        ],
      ).length !== 233 ||
      materialized.sha256 !== E0_EXACT_BYTE_CANONICAL_RECIPE.expected.sha256
    ) {
      addFinding(
        findings,
        "E0_EXACT_BYTE_CANONICAL_MATERIALIZATION_INVALID",
        "E0-IMPORT-CANONICAL-2097152.recipe",
        "The independent recipe must materialize one duplicate-free canonical-v2 source at exactly the accepted UTF-8 byte ceiling.",
      );
    }
  } catch {
    addFinding(
      findings,
      "E0_EXACT_BYTE_CANONICAL_MATERIALIZATION_INVALID",
      "E0-IMPORT-CANONICAL-2097152.recipe",
      "The independent exact-byte canonical source recipe must materialize without drift.",
    );
  }
  requireExact(
    {
      inputFixtureIds: topCaseById.get("E0-JI-013")?.["inputFixtureIds"],
      resultCategory: topCaseById.get("E0-JI-013")?.["resultCategory"],
      failureStage: topCaseById.get("E0-JI-013")?.["failureStage"],
      expectedIssueCodes: topCaseById.get("E0-JI-013")?.["expectedIssueCodes"],
      expectedMutationKills:
        topCaseById.get("E0-JI-013")?.["expectedMutationKills"],
    },
    {
      inputFixtureIds: ["E0-IMPORT-CANONICAL-2097152"],
      resultCategory: "PREVIEW_READY",
      failureStage: null,
      expectedIssueCodes: [],
      expectedMutationKills: ["E0-MUT-012", "F2-MUT-002"],
    },
    "E0_EXACT_BYTE_CANONICAL_CASE_INVALID",
    "E0-JI-013",
    "The positive import boundary case must use the independently materialized valid canonical-v2 source.",
    findings,
  );

  const nestedDuplicateFixtures = [
    {
      id: "E0-IMPORT-DUPLICATE-NESTED-LITERAL",
      escapeEvidence: false,
    },
    {
      id: "E0-IMPORT-DUPLICATE-NESTED-ESCAPED",
      escapeEvidence: true,
    },
  ] as const;
  for (const expectation of nestedDuplicateFixtures) {
    const fixture = inputFixtureById.get(expectation.id);
    const text = fixture?.["text"];
    const parsed: unknown = (() => {
      try {
        return typeof text === "string" ? (JSON.parse(text) as unknown) : null;
      } catch {
        return null;
      }
    })();
    const meter = objectAt(objectAt(parsed)?.["meter"]);
    const duplicates = typeof text === "string" ? duplicateJsonKeys(text) : [];
    if (
      fixture?.["kind"] !== "raw-utf8" ||
      typeof text !== "string" ||
      duplicates.length !== 1 ||
      !(duplicates[0] ?? "").startsWith('$["meter"]."beatsPerBar"@') ||
      text.includes("\\u0062eatsPerBar") !== expectation.escapeEvidence ||
      objectAt(parsed)?.["schema"] !== "changes.progression.v2" ||
      meter?.["beatsPerBar"] !== 3 ||
      meter["beatUnit"] !== 4
    ) {
      addFinding(
        findings,
        "E0_NESTED_DUPLICATE_FIXTURE_INVALID",
        expectation.id,
        "Each nested duplicate input must differ only through a literal or escape-equivalent duplicate inside the otherwise valid meter object.",
      );
    }
  }
  requireExact(
    {
      literalInputs: topCaseById.get("E0-JI-005")?.["inputFixtureIds"],
      literalMutationKills:
        topCaseById.get("E0-JI-005")?.["expectedMutationKills"],
      escapedInputs: topCaseById.get("E0-JI-006")?.["inputFixtureIds"],
      escapedMutationKills:
        topCaseById.get("E0-JI-006")?.["expectedMutationKills"],
      perObjectInputs: topCaseById.get("E0-JI-007")?.["inputFixtureIds"],
      perObjectMutationKills:
        topCaseById.get("E0-JI-007")?.["expectedMutationKills"],
    },
    {
      literalInputs: [
        "F2-IMPORT-DUPLICATE-LITERAL-KEY",
        "E0-IMPORT-DUPLICATE-NESTED-LITERAL",
      ],
      literalMutationKills: ["E0-MUT-015"],
      escapedInputs: [
        "F2-IMPORT-DUPLICATE-ESCAPED-KEY",
        "E0-IMPORT-DUPLICATE-NESTED-ESCAPED",
      ],
      escapedMutationKills: ["E0-MUT-015", "E0-MUT-016"],
      perObjectInputs: [
        "goldens/minimal.changes.json",
        "goldens/nested.changes.json",
        "instrumented:JSON.parse",
      ],
      perObjectMutationKills: ["E0-MUT-014", "E0-MUT-015"],
    },
    "E0_DUPLICATE_SCOPE_CASE_COVERAGE_INVALID",
    "import-cases.json.E0-JI-005..007",
    "Duplicate-key evidence must cover root and nested literal/escaped refusals plus valid repetition across distinct objects.",
    findings,
  );
  let nestedGoldenIdContainers = 0;
  visitObjects(loaded.get("goldens/nested.changes.json"), (record) => {
    if (typeof record["id"] === "string") nestedGoldenIdContainers += 1;
  });
  const nestedGoldenSource = sources.get("goldens/nested.changes.json") ?? "";
  if (
    nestedGoldenIdContainers < 3 ||
    duplicateJsonKeys(nestedGoldenSource).length !== 0
  ) {
    addFinding(
      findings,
      "E0_DUPLICATE_PER_OBJECT_POSITIVE_INVALID",
      "goldens/nested.changes.json",
      "The per-object positive must repeat ordinary decoded keys across at least three distinct objects without duplicating a key inside one object.",
    );
  }
  requireExact(
    controlById.get("E0-MUT-015"),
    {
      id: "E0-MUT-015",
      category: "json",
      mutation:
        "Implement decoded duplicate-key rejection incompletely or with the wrong object scope.",
      expectedMismatch:
        "A root or nested duplicate reaches host parse, or valid repetition across distinct objects is refused.",
      linkedCaseIds: ["E0-JI-005", "E0-JI-006", "E0-JI-007"],
      variants: [
        {
          id: "allow-literal-last-value-wins",
          mutation:
            "Allow a literal duplicate object key with last-value-wins behavior.",
          expectedMismatch: "The root literal duplicate reaches host parse.",
          linkedCaseIds: ["E0-JI-005"],
        },
        {
          id: "scan-root-object-only",
          mutation: "Track decoded keys only for the root object.",
          expectedMismatch:
            "A nested literal or escape-equivalent duplicate reaches host parse.",
          linkedCaseIds: ["E0-JI-005", "E0-JI-006"],
        },
        {
          id: "use-one-global-key-set",
          mutation:
            "Track one decoded-key set across all objects instead of one set per object.",
          expectedMismatch:
            "The valid nested canonical document is refused because ordinary keys repeat in distinct objects.",
          linkedCaseIds: ["E0-JI-007"],
        },
      ],
      authorityIds: ["E0-AUTH-ECMA-JSON"],
    },
    "E0_DUPLICATE_SCOPE_MUTATION_INVALID",
    "E0-MUT-015",
    "The duplicate-key mutation family must kill root-only and global-set scanner defects as well as last-value-wins behavior.",
    findings,
  );

  requireExact(
    {
      package: requirementLedger["package"],
      beadId: requirementLedger["beadId"],
      parentBeadId: requirementLedger["parentBeadId"],
      reviewState: requirementLedger["reviewState"],
    },
    {
      package: "E0",
      beadId: "jcpe-milestone-reliable-studio-l3a.8.1",
      parentBeadId: "jcpe-milestone-reliable-studio-l3a.8",
      reviewState: REVIEW_STATE,
    },
    "E0_REQUIREMENT_LEDGER_METADATA",
    "requirement-ledger.json",
    "Requirement ledger must remain attached to the active E0 specification leaf and proposed review state.",
    findings,
  );
  for (const requirement of requirements) {
    const id = String(requirement["id"]);
    const traceIds = stringsAt(requirement["requiredTraceIds"]);
    const proofKinds = stringsAt(requirement["requiredProofKinds"]);
    const coverageMode = requirement["coverageMode"] ?? "trace";
    const processEvidence = stringsAt(requirement["requiredProcessEvidence"]);
    const processObligation = coverageMode === "process-obligation";
    const transportMatrixObligation =
      coverageMode === "trace-and-cartesian-matrix";
    if (
      !E0_REQUIREMENT_KINDS.has(String(requirement["kind"])) ||
      typeof requirement["statement"] !== "string" ||
      requirement["statement"].length === 0 ||
      typeof requirement["sourceRef"] !== "string" ||
      requirement["sourceRef"].length === 0 ||
      (processObligation
        ? requirement["kind"] !== "non-goal" ||
          traceIds.length !== 0 ||
          proofKinds.length !== 0 ||
          processEvidence.length === 0
        : (coverageMode !== "trace" && !transportMatrixObligation) ||
          traceIds.length === 0 ||
          proofKinds.length === 0)
    ) {
      addFinding(
        findings,
        "E0_REQUIREMENT_INCOMPLETE",
        id,
        "Every requirement needs a closed kind, statement, source, and either reciprocal trace proofs or explicit process-only evidence.",
      );
    }
    if (processObligation) continue;
    if (transportMatrixObligation) {
      const expectedFormat =
        id === "E0-REQ-EVIDENCE-009"
          ? "canonical-json-v2"
          : id === "E0-REQ-EVIDENCE-010"
            ? "unversioned-legacy-json"
            : null;
      const matrixCellsForRequirement = transportWorkflowCells.filter(
        (cell) =>
          cell["requirementId"] === id &&
          cell["sourceFormat"] === expectedFormat,
      );
      if (
        expectedFormat === null ||
        requirement["transportWorkflowMatrixId"] !== "E0-WF-TRANSPORT-MATRIX" ||
        requirement["matrixSourceFormat"] !== expectedFormat ||
        requirement["requiredMatrixCells"] !== 28 ||
        matrixCellsForRequirement.length !== 28
      ) {
        addFinding(
          findings,
          "E0_REQUIREMENT_TRANSPORT_MATRIX_GAP",
          id,
          "Named every-transport-state evidence must bind its exact format to 28 literal matrix cells.",
        );
      }
    }
    const coveredProofKinds = new Set<string>();
    for (const traceId of traceIds) {
      const trace = traceById.get(traceId);
      if (trace === undefined) {
        addFinding(
          findings,
          "E0_REQUIREMENT_TRACE_UNKNOWN",
          `${id}.requiredTraceIds.${traceId}`,
          "Requirement cites an unknown trace.",
        );
        continue;
      }
      if (!stringsAt(trace["requirementIds"]).includes(id)) {
        addFinding(
          findings,
          "E0_REQUIREMENT_TRACE_BACKLINK",
          `${traceId}.requirementIds`,
          `Trace is missing requirement backlink ${id}.`,
        );
      }
      for (const proofKind of stringsAt(trace["proofKinds"])) {
        coveredProofKinds.add(proofKind);
      }
    }
    for (const proofKind of proofKinds) {
      if (!coveredProofKinds.has(proofKind)) {
        addFinding(
          findings,
          "E0_REQUIREMENT_PROOF_GAP",
          `${id}.requiredProofKinds.${proofKind}`,
          "Linked traces do not supply this required proof kind.",
        );
      }
    }
  }

  const traceAuthorityCoverage = new Set<string>();
  for (const trace of traces) {
    const id = String(trace["id"]);
    for (const requirementId of stringsAt(trace["requirementIds"])) {
      const requirement = requirementById.get(requirementId);
      if (requirement === undefined) {
        addFinding(
          findings,
          "E0_TRACE_REQUIREMENT_UNKNOWN",
          `${id}.requirementIds.${requirementId}`,
          "Trace cites an unknown stable requirement ID.",
        );
      } else if (!stringsAt(requirement["requiredTraceIds"]).includes(id)) {
        addFinding(
          findings,
          "E0_TRACE_REQUIREMENT_BACKLINK",
          `${requirementId}.requiredTraceIds`,
          `Requirement is missing trace backlink ${id}.`,
        );
      }
    }
    for (const authorityId of stringsAt(trace["authorityIds"])) {
      traceAuthorityCoverage.add(authorityId);
      if (!authorityById.has(authorityId)) {
        addFinding(
          findings,
          "E0_TRACE_AUTHORITY_UNKNOWN",
          `${id}.authorityIds.${authorityId}`,
          "Trace cites an unknown provenance authority.",
        );
      }
    }
  }
  requireExact(
    [...traceAuthorityCoverage].sort(codeUnitCompare),
    [...authorityById.keys()].sort(codeUnitCompare),
    "E0_TRACE_AUTHORITY_COVERAGE",
    "trace-ledger.json.traces.authorityIds",
    "Every reviewed authority must support at least one trace, with no unknown authority IDs.",
    findings,
  );

  requireExact(
    {
      productionMutantsExecutedAtSpecTime:
        mutationLedger["productionMutantsExecutedAtSpecTime"],
      claim: mutationLedger["claim"],
    },
    {
      productionMutantsExecutedAtSpecTime: false,
      claim:
        "links-are-frozen-build-and-verify-must-execute-the-production-mutants",
    },
    "E0_MUTATION_EXECUTION_CLAIM",
    "mutation-controls.json",
    "Spec fixtures freeze expected kill links without claiming production mutant execution.",
    findings,
  );

  const expectedInheritedControlIds = EXPECTED_INHERITED_F2_CONTROLS.map(
    ({ id }) => id,
  );
  requireExact(
    inheritedControls.map((control) => control["id"]),
    expectedInheritedControlIds,
    "E0_INHERITED_CONTROL_IDS",
    "mutation-controls.json.inheritedControls",
    "E0 must inherit the exact reviewed E0-owned F2 mutation controls.",
    findings,
  );
  requireExact(
    contract["inheritedMutationControls"],
    expectedInheritedControlIds,
    "E0_INHERITED_CONTROL_CONTRACT",
    `${CONTRACT_FILENAME}.inheritedMutationControls`,
    "The contract must name the exact reviewed E0-owned F2 controls.",
    findings,
  );
  for (const expected of EXPECTED_INHERITED_F2_CONTROLS) {
    const inherited = controlById.get(expected.id);
    requireExact(
      inherited?.["owner"],
      expected.owner,
      "E0_INHERITED_CONTROL_OWNER",
      `mutation-controls.json.inheritedControls.${expected.id}.owner`,
      "The inherited control must retain its upstream E0 owner.",
      findings,
    );
    const upstream = upstreamF2ControlById.get(expected.id);
    requireExact(
      upstream === undefined
        ? null
        : { owner: upstream["owner"], caseIds: upstream["caseIds"] },
      { owner: expected.owner, caseIds: expected.caseIds },
      "E0_INHERITED_CONTROL_UPSTREAM_MISMATCH",
      `${UPSTREAM_F2_ADVERSARIAL_FIXTURE}.mutationControls.${expected.id}`,
      "Inherited control identity, owner, and F2 case links must match the reviewed upstream authority.",
      findings,
    );
  }
  requireExact(
    inputFixtureById.get("E0-CHART-IMPORT-ASCII-ACCIDENTAL-CALL"),
    {
      id: "E0-CHART-IMPORT-ASCII-ACCIDENTAL-CALL",
      kind: "adapter-input",
      sourceFixtureId: "T0-CHART-014",
      operation: "parseChartText",
      arguments: {
        request: { mode: "document" },
        accidentalStyle: "ascii",
      },
      expectedCanonicalText: "@meter 4/4\n@key Db major\n[A]\n| C:4 |\n",
      unicodeNearMissCanonicalText: "@meter 4/4\n@key D♭ major\n[A]\n| C:4 |\n",
      outputsDiffer: true,
      callerMayOverrideStyle: false,
    },
    "E0_CHART_IMPORT_ASCII_CALL_INVALID",
    "E0-CHART-IMPORT-ASCII-ACCIDENTAL-CALL",
    "Chart-import evidence must use an accidental-bearing T0 case whose fixed ASCII output differs from the Unicode near miss.",
    findings,
  );

  const hostilePrivateText = inputFixtureById.get("E0-HOSTILE-PRIVATE-TEXT")?.[
    "value"
  ];
  const hostilePathProjection = inputFixtureById.get(
    "E0-HOSTILE-UNKNOWN-PATH-PROJECTION",
  );
  requireExact(
    hostilePathProjection,
    {
      id: "E0-HOSTILE-UNKNOWN-PATH-PROJECTION",
      kind: "diagnostic-path-projection",
      privateFieldFixtureId: "E0-HOSTILE-PRIVATE-TEXT",
      canonicalInput: {
        baseFixtureId: "goldens/minimal.changes.json",
        addUnknownOwnPropertyAt: [],
        unknownPropertyNameFromFixture: "E0-HOSTILE-PRIVATE-TEXT",
      },
      legacyInput: {
        baseFixtureId: "C0-PRESET-MIXED-001",
        addUnknownOwnPropertyAt: ["sections", 0],
        unknownPropertyNameFromFixture: "E0-HOSTILE-PRIVATE-TEXT",
      },
      expectedCanonicalIssuePath: ["<redacted-field>"],
      expectedLegacyReportSourcePath: ["sections", 0, "<redacted-field>"],
      expectedPrivateTextOccurrencesInRetainedResult: 0,
      maximumPublicPathSegments: 32,
      maximumPublicPathIndex: 65_536,
      boundaryRows: [
        {
          id: "maximum-index-preserved",
          inputPath: ["sections", 65_536],
          expectedPublicPath: ["sections", 65_536],
        },
        {
          id: "negative-index-redacted",
          inputPath: ["sections", -1],
          expectedPublicPath: ["sections", "<invalid-index>"],
        },
        {
          id: "fractional-index-redacted",
          inputPath: ["sections", 0.5],
          expectedPublicPath: ["sections", "<invalid-index>"],
        },
        {
          id: "excess-index-redacted",
          inputPath: ["sections", 65_537],
          expectedPublicPath: ["sections", "<invalid-index>"],
        },
        {
          id: "overlong-path-truncated",
          inputRecipe: { repeatSegment: "sections", count: 33 },
          expectedRecipe: {
            repeatSegment: "sections",
            count: 31,
            finalSegment: "<path-truncated>",
            totalSegments: 32,
          },
        },
      ],
      retainedPathVocabularyScan: {
        scopes: [
          "sharedBases.*-import-preview.issues",
          "sharedBases.*-import-preview.report",
          "fixtures.*.expectedCanonicalIssuePath",
          "fixtures.*.expectedLegacyReportSourcePath",
        ],
        expectedUnknownStrings: 0,
        expectedOverlongPaths: 0,
      },
    },
    "E0_HOSTILE_PATH_PROJECTION_INVALID",
    "E0-HOSTILE-UNKNOWN-PATH-PROJECTION",
    "Canonical and legacy unknown-property paths must use the fixed redaction sentinel with no private source-key retention.",
    findings,
  );
  if (
    typeof hostilePrivateText !== "string" ||
    hostilePrivateText.length === 0 ||
    JSON.stringify({
      canonical: hostilePathProjection?.["expectedCanonicalIssuePath"],
      legacy: hostilePathProjection?.["expectedLegacyReportSourcePath"],
    }).includes(hostilePrivateText)
  ) {
    addFinding(
      findings,
      "E0_HOSTILE_PATH_PRIVATE_TEXT_RETAINED",
      "E0-HOSTILE-UNKNOWN-PATH-PROJECTION",
      "The literal hostile source key must be absent from every retained expected path.",
    );
  }
  const retainedPublicPathFields = new Set<string>([
    "schema",
    "id",
    "title",
    "description",
    "meter",
    "tempoBpm",
    "key",
    "sections",
    "playback",
    "beatsPerBar",
    "beatUnit",
    "tonic",
    "mode",
    "letter",
    "accidental",
    "name",
    "annotation",
    "keyOverride",
    "voiceLeadingBoundary",
    "measures",
    "completion",
    "events",
    "kind",
    "expectedBeats",
    "actualBeats",
    "duration",
    "chord",
    "voicing",
    "bass",
    "quality",
    "extension",
    "alterations",
    "adds",
    "omits",
    "degree",
    "alter",
    "pitchNames",
    "mode",
    "family",
    "voiceCount",
    "range",
    "bassPolicy",
    "lowMidi",
    "highMidi",
    "pitches",
    "generatedBy",
    "algorithmId",
    "algorithmVersion",
    "masterVolume",
    "reverbAmount",
    "countInBars",
    "chords",
    "collapsed",
    "isEditingName",
    "editNameValue",
    "root",
    "type",
    "notes",
    "b5",
    "s5",
    "b9",
    "s9",
    "s11",
    "b13",
    "tensions",
    "voicingStyle",
    "baseOctave",
    "octaveSpan",
    "density",
    "<redacted-field>",
    "<invalid-index>",
    "<path-truncated>",
  ]);
  const retainedPathCandidates: Array<{
    readonly label: string;
    readonly path: unknown;
  }> = [
    {
      label: "E0-HOSTILE-UNKNOWN-PATH-PROJECTION.canonical",
      path: hostilePathProjection?.["expectedCanonicalIssuePath"],
    },
    {
      label: "E0-HOSTILE-UNKNOWN-PATH-PROJECTION.legacy",
      path: hostilePathProjection?.["expectedLegacyReportSourcePath"],
    },
  ];
  for (const fixture of inputFixtures) {
    const recipe = objectAt(fixture["recipe"]);
    const template = objectAt(recipe?.["itemTemplate"]);
    if (fixture["kind"] === "derived-issue-list") {
      retainedPathCandidates.push({
        label: `${String(fixture["id"])}.path`,
        path: template?.["path"],
      });
    } else if (fixture["kind"] === "derived-report-list") {
      retainedPathCandidates.push(
        {
          label: `${String(fixture["id"])}.sourcePath`,
          path: template?.["sourcePath"],
        },
        {
          label: `${String(fixture["id"])}.targetPath`,
          path: template?.["targetPath"],
        },
      );
    }
  }
  for (const candidate of retainedPathCandidates) {
    if (candidate.path === null) continue;
    if (
      !Array.isArray(candidate.path) ||
      candidate.path.length > 32 ||
      candidate.path.some(
        (segment) =>
          !(
            (typeof segment === "string" &&
              (retainedPublicPathFields.has(segment) ||
                segment === "{i:number}")) ||
            (typeof segment === "number" &&
              Number.isSafeInteger(segment) &&
              segment >= 0 &&
              segment <= 65_536)
          ),
      )
    ) {
      addFinding(
        findings,
        "E0_RETAINED_PUBLIC_PATH_INVALID",
        candidate.label,
        "Retained diagnostic paths must use only the closed field/sentinel vocabulary, safe bounded indices, and at most 32 segments.",
      );
    }
  }

  const workflowStateWrapper = objectAt(
    sharedBases["workflow-state-revision-7"],
  );
  const workflowState = objectAt(workflowStateWrapper?.["value"]);
  const appStateKeys = [
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
  if (
    workflowStateWrapper?.["kind"] !== "test-owned-app-state-materialization" ||
    workflowStateWrapper["materializeAs"] !== "AppState" ||
    workflowState === null
  ) {
    addFinding(
      findings,
      "E0_WORKFLOW_STATE_MATERIALIZATION",
      "input-fixture-ledger.json.sharedBases.workflow-state-revision-7",
      "Workflow state must be an explicit independently authored AppState materialization.",
    );
  } else {
    requireExact(
      Object.keys(workflowState),
      appStateKeys,
      "E0_WORKFLOW_STATE_FIELDS",
      "workflow-state-revision-7.value",
      "Workflow state must materialize every and only public AppState field.",
      findings,
    );
    requireExact(
      workflowState["document"],
      { sharedBase: "workflow-document-nested" },
      "E0_WORKFLOW_STATE_DOCUMENT",
      "workflow-state-revision-7.value.document",
      "Workflow state must resolve the reviewed nested ValidatedDocument.",
      findings,
    );
    const history = objectAt(workflowState["history"]);
    const undo = recordsAt(history?.["undo"]);
    const redo = recordsAt(history?.["redo"]);
    const historyEntryKeys = [
      "commandId",
      "commandKind",
      "label",
      "before",
      "after",
      "beforeBookmarks",
      "afterBookmarks",
      "retainedBytesEstimate",
      "coalescing",
      "firstLogicalTimeMs",
      "lastLogicalTimeMs",
    ];
    if (
      history === null ||
      undo.length !== 1 ||
      redo.length !== 1 ||
      !isNonnegativeSafeInteger(undo[0]?.["retainedBytesEstimate"]) ||
      !isNonnegativeSafeInteger(redo[0]?.["retainedBytesEstimate"]) ||
      history["retainedBytesEstimate"] !==
        undo[0]["retainedBytesEstimate"] + redo[0]["retainedBytesEstimate"]
    ) {
      addFinding(
        findings,
        "E0_WORKFLOW_HISTORY_INVALID",
        "workflow-state-revision-7.value.history",
        "Workflow history needs full undo/redo entries and an exact retained-byte sum.",
      );
    } else {
      requireExact(
        Object.keys(undo[0]),
        historyEntryKeys,
        "E0_WORKFLOW_HISTORY_ENTRY_FIELDS",
        "workflow-state-revision-7.value.history.undo.0",
        "Undo history entry must materialize the exact public HistoryEntry shape.",
        findings,
      );
      requireExact(
        Object.keys(redo[0]),
        historyEntryKeys,
        "E0_WORKFLOW_HISTORY_ENTRY_FIELDS",
        "workflow-state-revision-7.value.history.redo.0",
        "Redo history entry must materialize the exact public HistoryEntry shape.",
        findings,
      );
      requireExact(
        {
          undo: undo[0]["retainedBytesEstimate"],
          redo: redo[0]["retainedBytesEstimate"],
          total: history["retainedBytesEstimate"],
        },
        { undo: 9_199, redo: 9_194, total: 18_393 },
        "E0_WORKFLOW_HISTORY_ESTIMATES",
        "workflow-state-revision-7.value.history",
        "Independently authored A0 retained-byte estimates must remain exact.",
        findings,
      );
    }
    const bookmarks = objectAt(
      objectAt(sharedBases["workflow-bookmarks-nested"])?.["value"],
    );
    const emptyBookmarks = objectAt(
      objectAt(sharedBases["workflow-bookmarks-empty"])?.["value"],
    );
    requireExact(
      bookmarks,
      {
        selection: {
          kind: "events",
          eventIds: ["event-e0-auto"],
          anchorEventId: "event-e0-auto",
          focusEventId: "event-e0-auto",
        },
        insertion: { kind: "after-event", eventId: "event-e0-auto" },
        range: {
          anchor: { kind: "before-event", eventId: "event-e0-auto" },
          focus: { kind: "after-event", eventId: "event-e0-auto" },
        },
      },
      "E0_WORKFLOW_BOOKMARKS_INVALID",
      "workflow-bookmarks-nested.value",
      "Workflow bookmarks must use public discriminated stable-ID shapes.",
      findings,
    );
    requireExact(
      emptyBookmarks,
      {
        selection: { kind: "none" },
        insertion: { kind: "document-start" },
        range: null,
      },
      "E0_WORKFLOW_BOOKMARKS_INVALID",
      "workflow-bookmarks-empty.value",
      "Empty-document bookmarks must use public discriminated shapes.",
      findings,
    );
    const transport = objectAt(workflowState["transport"]);
    if (
      transport === null ||
      !isNonnegativeSafeInteger(transport["generation"]) ||
      !isNonnegativeSafeInteger(transport["commandRequestId"]) ||
      !isNonnegativeSafeInteger(transport["notificationSequence"])
    ) {
      addFinding(
        findings,
        "E0_WORKFLOW_TRANSPORT_INVALID",
        "workflow-state-revision-7.value.transport",
        "Workflow transport requires complete numeric A0 identities and sequences.",
      );
    } else {
      requireExact(
        Object.keys(transport),
        [
          "status",
          "generation",
          "commandRequestId",
          "notificationSequence",
          "documentId",
          "planRevision",
          "startBeat",
          "playhead",
          "failureCode",
        ],
        "E0_WORKFLOW_TRANSPORT_FIELDS",
        "workflow-state-revision-7.value.transport",
        "Workflow transport must have every and only public TransportViewState field.",
        findings,
      );
    }
  }

  const oversizedDocumentBase = objectAt(
    sharedBases["workflow-document-history-oversized"],
  );
  requireExact(
    oversizedDocumentBase,
    {
      kind: "test-owned-validated-document-repetition-materialization",
      materializeAs: "ValidatedDocument",
      materializeThrough: ["F2", "F3"],
      recipe: {
        schema: "changes.progression.v2",
        documentId: "oversized",
        title: "O",
        description: { scalar: "x", repeatCodePoints: 7 },
        meter: { beatsPerBar: 4, beatUnit: 4 },
        tempoBpm: 120,
        key: { tonic: { step: "C", alter: 0 }, mode: "major" },
        sectionCount: 48,
        measuresPerSection: 1_024,
        totalMeasures: 49_152,
        completeMeasureCount: 4_722,
        emptyMeasureCount: 44_430,
        chordEventCount: 4_722,
        idPolicy: {
          section: "s${sectionIndex}",
          measure: "m${globalMeasureIndex}",
          event: "e${globalMeasureIndex}",
        },
        section: {
          name: "S",
          annotation: "",
          keyOverride: null,
          voiceLeadingBoundary: "continue",
        },
        completeMeasureEvent: {
          duration: { numerator: 4, denominator: 1 },
          annotation: "",
          chord: {
            kind: "parsed",
            sourceText: "C",
            root: { step: "C", alter: 0 },
            triad: "major",
            sixth: null,
            seventh: null,
            extensions: [],
            additions: [],
            alterations: [],
            omissions: [],
            bass: null,
            colorPolicy: "none",
          },
          voicing: {
            mode: "auto",
            family: "balanced",
            voiceCount: 4,
            range: { lowMidi: 48, highMidi: 72 },
            bassPolicy: "generated",
          },
        },
        playback: {
          instrumentId: "mellow-keys",
          masterVolume: 0.8,
          reverbAmount: 0.2,
          countInBars: 0,
        },
      },
      historyEntryContext: {
        candidate: { sharedBase: "workflow-document-minimal" },
        beforeBookmarks: { sharedBase: "workflow-bookmarks-empty" },
        afterBookmarks: {
          sharedBase: "workflow-bookmarks-empty-replacement",
        },
        commandId: "command-e0-replace-1",
        commandKind: "replace-document",
        label: "Import Changes",
        coalescing: null,
        firstLogicalTimeMs: 9_000,
        lastLogicalTimeMs: 9_000,
      },
      expectedHistoryEntryRetainedBytes: 16_777_217,
      maximumHistoryRetainedBytes: 16_777_216,
    },
    "E0_HISTORY_OVERSIZED_RECIPE_INVALID",
    "input-fixture-ledger.json.sharedBases.workflow-document-history-oversized",
    "The non-undoable proof must freeze the exact F2/F3 repetition recipe whose independently executed A0 estimate is one byte over the history cap.",
    findings,
  );
  const originalEmptyBookmarks = objectAt(
    sharedBases["workflow-bookmarks-empty"],
  );
  const replacementEmptyBookmarks = objectAt(
    sharedBases["workflow-bookmarks-empty-replacement"],
  );
  requireExact(
    replacementEmptyBookmarks,
    {
      kind: "test-owned-stable-ui-bookmarks-materialization",
      materializeAs: "StableUiBookmarks",
      identityPolicy:
        "value-equal-to-workflow-bookmarks-empty-but-distinct-reference",
      value: {
        selection: { kind: "none" },
        insertion: { kind: "document-start" },
        range: null,
      },
    },
    "E0_HISTORY_OVERSIZED_REPLACEMENT_BOOKMARKS_INVALID",
    "input-fixture-ledger.json.sharedBases.workflow-bookmarks-empty-replacement",
    "The estimator proof must name a separately materialized replacement-bookmark object.",
    findings,
  );
  requireExact(
    replacementEmptyBookmarks?.["value"],
    originalEmptyBookmarks?.["value"],
    "E0_HISTORY_OVERSIZED_BOOKMARK_VALUES_DIFFER",
    "workflow-bookmarks-empty-replacement.value",
    "Current and replacement bookmarks must be value-equal so only object identity accounts for the estimator delta.",
    findings,
  );
  const historyEntryContext = objectAt(
    oversizedDocumentBase?.["historyEntryContext"],
  );
  const beforeBookmarksBaseId = objectAt(
    historyEntryContext?.["beforeBookmarks"],
  )?.["sharedBase"];
  const afterBookmarksBaseId = objectAt(
    historyEntryContext?.["afterBookmarks"],
  )?.["sharedBase"];
  const bookmarkBaseIdsAreDistinct =
    beforeBookmarksBaseId !== afterBookmarksBaseId;
  if (
    beforeBookmarksBaseId !== "workflow-bookmarks-empty" ||
    afterBookmarksBaseId !== "workflow-bookmarks-empty-replacement" ||
    !bookmarkBaseIdsAreDistinct
  ) {
    addFinding(
      findings,
      "E0_HISTORY_OVERSIZED_BOOKMARK_IDENTITIES_INVALID",
      "workflow-document-history-oversized.historyEntryContext",
      "The exact estimator recipe needs distinct current and replacement bookmark materialization identities.",
    );
  }

  const oversizedStateWrapper = objectAt(
    sharedBases["workflow-state-history-oversized-revision-7"],
  );
  const oversizedState = objectAt(oversizedStateWrapper?.["value"]);
  requireExact(
    oversizedStateWrapper,
    {
      kind: "test-owned-app-state-materialization",
      materializeAs: "AppState",
      value: {
        document: { sharedBase: "workflow-document-history-oversized" },
        revision: 7,
        exportRevision: 3,
        recovery: { kind: "clean", persistedRevision: 7 },
        history: { undo: [], redo: [], retainedBytesEstimate: 0 },
        bookmarks: { sharedBase: "workflow-bookmarks-empty" },
        panels: {
          open: ["chart", "inspector", "history"],
          active: "chart",
          leftRailCollapsed: false,
          rightRailCollapsed: false,
        },
        dialogs: [],
        quickEntry: {
          text: "",
          target: { kind: "document-start" },
          baseRevision: 7,
          status: "idle",
          issueCodes: [],
        },
        importDraft: null,
        transport: {
          status: "playing",
          generation: 11,
          commandRequestId: 11,
          notificationSequence: 11,
          documentId: "oversized",
          planRevision: 7,
          startBeat: { numerator: 0, denominator: 1 },
          playhead: { numerator: 1, denominator: 1 },
          failureCode: null,
        },
        pendingRequests: [],
        documentTransition: { kind: "idle" },
        focusRequest: null,
        notices: [],
        nextSequence: 12,
      },
    },
    "E0_HISTORY_OVERSIZED_STATE_INVALID",
    "input-fixture-ledger.json.sharedBases.workflow-state-history-oversized-revision-7",
    "The oversized proof must start from one full public AppState with zero pre-existing history and the exact oversized document identity.",
    findings,
  );
  if (
    oversizedState !== null &&
    !sameJson(Object.keys(oversizedState), appStateKeys)
  ) {
    addFinding(
      findings,
      "E0_HISTORY_OVERSIZED_STATE_FIELDS",
      "workflow-state-history-oversized-revision-7.value",
      "The oversized state must materialize every and only public AppState field.",
    );
  }

  for (const [index, sharedIdentityId] of [
    "request-identity-revision-7",
    "request-identity-revision-8",
  ].entries()) {
    const identity = objectAt(sharedBases[sharedIdentityId]);
    if (
      identity === null ||
      !isPositiveSafeInteger(identity["requestId"]) ||
      identity["requestId"] !== 101 + index ||
      identity["documentId"] !== "document-e0-nested" ||
      identity["baseRevision"] !== 7 + index
    ) {
      addFinding(
        findings,
        "E0_WORKFLOW_REQUEST_IDENTITY_INVALID",
        sharedIdentityId,
        "Import identities require numeric request IDs and exact document/revision binding.",
      );
    }
  }
  requireExact(
    sharedBases["request-identity-history-oversized"],
    { requestId: 101, documentId: "oversized", baseRevision: 7 },
    "E0_HISTORY_OVERSIZED_IDENTITY_INVALID",
    "input-fixture-ledger.json.sharedBases.request-identity-history-oversized",
    "The oversized preview, handoff, and A0 command must share one exact numeric request/document/revision identity.",
    findings,
  );

  const transportFixtureIds = E0_APPLICATION_TRANSPORT_STATUSES.map(
    (status) => `transport:${status}`,
  );
  for (const [
    statusIndex,
    status,
  ] of E0_APPLICATION_TRANSPORT_STATUSES.entries()) {
    const fixtureId = transportFixtureIds[statusIndex] ?? "";
    const fixture = inputFixtureById.get(fixtureId);
    const base = objectAt(fixture?.["base"]);
    const materialized =
      fixture === undefined
        ? null
        : materializeStateFixture(
            fixtureId,
            inputFixtureById,
            sharedBases,
            loaded,
          );
    const transport = objectAt(materialized?.["transport"]);
    if (
      fixture?.["kind"] !== "transport-state" ||
      base?.["sharedBase"] !== "workflow-state-revision-7" ||
      materialized === null ||
      !sameJson(Object.keys(materialized), appStateKeys) ||
      transport?.["status"] !== status ||
      (status === "failed"
        ? typeof transport["failureCode"] !== "string" ||
          transport["failureCode"].length === 0
        : transport["failureCode"] !== null)
    ) {
      addFinding(
        findings,
        "E0_TRANSPORT_STATE_MATERIALIZATION_INVALID",
        fixtureId,
        "Each matrix transport fixture must materialize a complete AppState with correlated status/failure fields.",
      );
    }
  }

  const expectedTransportMutations = (
    status: (typeof E0_APPLICATION_TRANSPORT_STATUSES)[number],
  ): readonly JsonObject[] => {
    const mutations: JsonObject[] = [
      { operation: "set", path: ["transport", "status"], to: status },
    ];
    if (status === "unavailable") {
      mutations.push(
        { operation: "set", path: ["transport", "generation"], to: 0 },
        {
          operation: "set",
          path: ["transport", "commandRequestId"],
          to: 0,
        },
        {
          operation: "set",
          path: ["transport", "notificationSequence"],
          to: 0,
        },
      );
    }
    if (status === "unavailable" || status === "ready") {
      mutations.push({
        operation: "set",
        path: ["transport", "playhead"],
        to: { numerator: 0, denominator: 1 },
      });
    }
    mutations.push({
      operation: "set",
      path: ["transport", "failureCode"],
      to: status === "failed" ? "transport.fixture_failure" : null,
    });
    return mutations;
  };

  for (const sourceFormat of E0_TRANSPORT_WORKFLOW_SOURCE_FORMATS) {
    const canonical = sourceFormat === "canonical-json-v2";
    const formatSlug = canonical ? "canonical" : "legacy";
    const stateFixtureId = `state:retiring-${formatSlug}-retained`;
    const transitionFixtureId = canonical
      ? "transition:retiring"
      : "transition:retiring-legacy";
    const origin = canonical ? "canonical-import" : "legacy-import";
    const previewFixtureId = canonical ? "preview:canonical" : "preview:legacy";
    requireExact(
      inputFixtureById.get(previewFixtureId),
      {
        id: previewFixtureId,
        kind: "workflow-preview",
        base: { sharedBase: "canonical-ready-import-preview" },
        scope: canonical
          ? "canonical-transport-workflow-matrix"
          : "legacy-transport-workflow-matrix",
        overrides: canonical
          ? {}
          : {
              sourceFormat: "unversioned-legacy-json",
              replacementOrigin: "legacy-import",
            },
        status: "ready",
      },
      "E0_TRANSPORT_HANDOFF_PREVIEW_INVALID",
      previewFixtureId,
      "Each format-specific handoff preview must retain the candidate and identity while selecting the exact format and origin.",
      findings,
    );
    const expectedTransition = {
      kind: "retiring-transport",
      requestId: 101,
      origin,
      baseRevision: 7,
      candidateDocumentId: "document-e0-minimal",
      undoDisposition: "retained",
    };
    const expectedPendingRequest = {
      kind: "document-transition",
      id: 101,
      documentId: "document-e0-nested",
      baseRevision: 7,
      status: "running",
    };
    const stateFixture = inputFixtureById.get(stateFixtureId);
    requireExact(
      stateFixture,
      {
        id: stateFixtureId,
        kind: "state-snapshot",
        base: { sharedBase: "workflow-state-revision-7" },
        orderedMutations: [
          {
            operation: "set",
            path: ["pendingRequests"],
            to: [expectedPendingRequest],
          },
          {
            operation: "set",
            path: ["documentTransition"],
            to: expectedTransition,
          },
        ],
      },
      "E0_TRANSPORT_HANDOFF_BASE_STATE_INVALID",
      stateFixtureId,
      "Each source format needs one exact retiring AppState with a matching running pending request and detached transition.",
      findings,
    );
    requireExact(
      objectAt(inputFixtureById.get(transitionFixtureId)?.["value"]),
      expectedTransition,
      "E0_TRANSPORT_HANDOFF_TRANSITION_INVALID",
      transitionFixtureId,
      "The detached retiring transition must be field-identical to the transition installed in currentState.",
      findings,
    );
    const retiringState = materializeStateFixture(
      stateFixtureId,
      inputFixtureById,
      sharedBases,
      loaded,
    );
    if (
      retiringState === null ||
      !sameJson(Object.keys(retiringState), appStateKeys) ||
      !sameJson(retiringState["document"], {
        sharedBase: "workflow-document-nested",
      }) ||
      retiringState["revision"] !== 7 ||
      !sameJson(retiringState["pendingRequests"], [expectedPendingRequest]) ||
      !sameJson(retiringState["documentTransition"], expectedTransition)
    ) {
      addFinding(
        findings,
        "E0_TRANSPORT_HANDOFF_BASE_MATERIALIZATION_INVALID",
        stateFixtureId,
        "The retained handoff base must recursively materialize the complete correlated public AppState.",
      );
    }
    for (const status of E0_APPLICATION_TRANSPORT_STATUSES) {
      const handoffFixtureId = `transport-handoff:${formatSlug}:${status}`;
      const handoffFixture = inputFixtureById.get(handoffFixtureId);
      requireExact(
        handoffFixture,
        {
          id: handoffFixtureId,
          kind: "transport-handoff-state",
          base: { fixtureId: stateFixtureId },
          orderedMutations: expectedTransportMutations(status),
        },
        "E0_TRANSPORT_HANDOFF_FIXTURE_INVALID",
        handoffFixtureId,
        "Each apply/failure transport input must derive only its status fields from the complete format-specific retiring state.",
        findings,
      );
      const handoffState = materializeStateFixture(
        handoffFixtureId,
        inputFixtureById,
        sharedBases,
        loaded,
      );
      const transport = objectAt(handoffState?.["transport"]);
      if (
        handoffState === null ||
        !sameJson(Object.keys(handoffState), appStateKeys) ||
        !sameJson(handoffState["document"], {
          sharedBase: "workflow-document-nested",
        }) ||
        handoffState["revision"] !== 7 ||
        !sameJson(handoffState["pendingRequests"], [expectedPendingRequest]) ||
        !sameJson(handoffState["documentTransition"], expectedTransition) ||
        transport === null ||
        !sameJson(Object.keys(transport), [
          "status",
          "generation",
          "commandRequestId",
          "notificationSequence",
          "documentId",
          "planRevision",
          "startBeat",
          "playhead",
          "failureCode",
        ]) ||
        transport["status"] !== status ||
        transport["documentId"] !== "document-e0-nested" ||
        transport["planRevision"] !== 7 ||
        (status === "failed"
          ? transport["failureCode"] !== "transport.fixture_failure"
          : transport["failureCode"] !== null)
      ) {
        addFinding(
          findings,
          "E0_TRANSPORT_HANDOFF_MATERIALIZATION_INVALID",
          handoffFixtureId,
          "Each handoff transport fixture must recursively materialize a complete AppState whose request, document, revision, candidate, origin, transition, and status all agree.",
        );
      }
    }
  }

  const confirmationRequirement = objectAt(
    sharedBases["nonundoable-confirmation-requirement"],
  );
  const unavailablePreview = inputFixtureById.get(
    "preview:explicitly-unavailable",
  );
  const unavailableOverrides = objectAt(unavailablePreview?.["overrides"]);
  const unavailableImpact = objectAt(
    unavailableOverrides?.["replacementImpact"],
  );
  const matchingConfirmationFixture = inputFixtureById.get(
    "confirmation:matching",
  );
  const matchingConfirmation = objectAt(matchingConfirmationFixture?.["value"]);
  const wrongConfirmationFixture = inputFixtureById.get("confirmation:wrong");
  const wrongConfirmation = objectAt(wrongConfirmationFixture?.["value"]);
  const expectedUnavailableImpact = {
    historyEntryRetainedBytes: 16_777_217,
    evictedUndoEntries: 0,
    redoEntriesCleared: 0,
    confirmationRequired: true,
    undoDisposition: "explicitly-unavailable",
    undoEntriesAfterCommit: 0,
    undoRetainedBytesAfterCommit: 0,
    exportRecommended: true,
  };
  const expectedConfirmationRequirement = {
    schema: "changes.import-nonundoable-confirmation.v1",
    confirmationId: "confirm-e0-impact-1",
    identity: { sharedBase: "request-identity-history-oversized" },
    candidateDocumentId: "document-e0-minimal",
    commandId: "command-e0-replace-1",
    disclosedImpact: expectedUnavailableImpact,
  };
  const expectedMaterializedConfirmationRequirement = {
    schema: "changes.import-nonundoable-confirmation.v1",
    confirmationId: "confirm-e0-impact-1",
    identity: {
      requestId: 101,
      documentId: "oversized",
      baseRevision: 7,
    },
    candidateDocumentId: "document-e0-minimal",
    commandId: "command-e0-replace-1",
    disclosedImpact: expectedUnavailableImpact,
  };
  const expectedMatchingAcknowledgement = {
    kind: "acknowledged",
    requirement: expectedMaterializedConfirmationRequirement,
  };
  const expectedWrongAcknowledgement = {
    kind: "acknowledged",
    requirement: {
      ...expectedMaterializedConfirmationRequirement,
      confirmationId: "confirm-e0-impact-wrong",
    },
  };
  requireExact(
    confirmationRequirement,
    expectedConfirmationRequirement,
    "E0_CONFIRMATION_REQUIREMENT_MATERIALIZATION_INVALID",
    "input-fixture-ledger.json.sharedBases.nonundoable-confirmation-requirement",
    "The preview-owned requirement must bind the exact oversized identity, candidate, command, and independently fixed impact.",
    findings,
  );
  requireExact(
    unavailablePreview,
    {
      id: "preview:explicitly-unavailable",
      kind: "workflow-preview",
      base: { sharedBase: "canonical-ready-import-preview" },
      scope: "nonundoable-confirmation-transaction",
      overrides: {
        identity: { sharedBase: "request-identity-history-oversized" },
        replacementImpact: expectedUnavailableImpact,
        nonUndoableConfirmationRequirement: {
          sharedBase: "nonundoable-confirmation-requirement",
        },
      },
      status: "ready",
    },
    "E0_CONFIRMATION_PREVIEW_MATERIALIZATION_INVALID",
    "preview:explicitly-unavailable",
    "The unavailable preview must bind the genuine oversized identity and exact assessor output without unrelated overrides.",
    findings,
  );
  requireExact(
    matchingConfirmationFixture,
    {
      id: "confirmation:matching",
      kind: "parameter",
      materializeAs: "ImportNonUndoableConfirmationAcknowledgement",
      value: expectedMatchingAcknowledgement,
    },
    "E0_CONFIRMATION_ACKNOWLEDGEMENT_MATERIALIZATION_INVALID",
    "confirmation:matching",
    "The positive acknowledgement must be a complete public value that echoes the exact preview-owned requirement.",
    findings,
  );
  requireExact(
    wrongConfirmationFixture,
    {
      id: "confirmation:wrong",
      kind: "parameter",
      materializeAs: "ImportNonUndoableConfirmationAcknowledgement",
      nearMissFrom: "confirmation:matching",
      onlyDifferentPath: ["requirement", "confirmationId"],
      value: expectedWrongAcknowledgement,
    },
    "E0_CONFIRMATION_WRONG_ACKNOWLEDGEMENT_INVALID",
    "confirmation:wrong",
    "The wrong-token near miss must be a complete public acknowledgement differing only in confirmationId.",
    findings,
  );
  const wrongRequirement = objectAt(wrongConfirmation?.["requirement"]);
  const normalizedWrongConfirmation =
    wrongConfirmation === null || wrongRequirement === null
      ? null
      : {
          ...wrongConfirmation,
          requirement: {
            ...wrongRequirement,
            confirmationId: "confirm-e0-impact-1",
          },
        };
  if (
    wrongRequirement?.["confirmationId"] ===
      expectedMaterializedConfirmationRequirement.confirmationId ||
    !sameJson(normalizedWrongConfirmation, matchingConfirmation)
  ) {
    addFinding(
      findings,
      "E0_CONFIRMATION_WRONG_ACKNOWLEDGEMENT_NOT_NEAR_MISS",
      "confirmation:wrong",
      "Wrong confirmation must differ from the matching acknowledgement at exactly requirement.confirmationId.",
    );
  }
  if (
    confirmationRequirement === null ||
    confirmationRequirement["schema"] !==
      "changes.import-nonundoable-confirmation.v1" ||
    confirmationRequirement["confirmationId"] !== "confirm-e0-impact-1" ||
    !sameJson(confirmationRequirement["identity"], {
      sharedBase: "request-identity-history-oversized",
    }) ||
    confirmationRequirement["candidateDocumentId"] !== "document-e0-minimal" ||
    confirmationRequirement["commandId"] !== "command-e0-replace-1" ||
    unavailablePreview?.["kind"] !== "workflow-preview" ||
    !sameJson(unavailableOverrides?.["identity"], {
      sharedBase: "request-identity-history-oversized",
    }) ||
    !sameJson(unavailableOverrides?.["nonUndoableConfirmationRequirement"], {
      sharedBase: "nonundoable-confirmation-requirement",
    }) ||
    unavailableImpact === null ||
    !sameJson(unavailableImpact, expectedUnavailableImpact) ||
    !sameJson(confirmationRequirement["disclosedImpact"], unavailableImpact) ||
    !sameJson(matchingConfirmation, expectedMatchingAcknowledgement)
  ) {
    addFinding(
      findings,
      "E0_CONFIRMATION_REQUIREMENT_INVALID",
      "input-fixture-ledger.json.nonundoable-confirmation",
      "Unavailable preview must own a scoped requirement and acknowledgement must echo that exact requirement.",
    );
  }

  const unavailableStateFixture = inputFixtureById.get(
    "state:retiring-explicitly-unavailable",
  );
  const unavailableState =
    unavailableStateFixture === undefined
      ? null
      : materializeStateFixture(
          "state:retiring-explicitly-unavailable",
          inputFixtureById,
          sharedBases,
          loaded,
        );
  const unavailableTransition = objectAt(
    inputFixtureById.get("transition:retiring-explicitly-unavailable")?.[
      "value"
    ],
  );
  const expectedUnavailableTransition = {
    kind: "retiring-transport",
    requestId: 101,
    origin: "canonical-import",
    baseRevision: 7,
    candidateDocumentId: "document-e0-minimal",
    undoDisposition: "explicitly-unavailable",
  };
  const expectedUnavailablePendingRequest = {
    kind: "document-transition",
    id: 101,
    documentId: "oversized",
    baseRevision: 7,
    status: "running",
  };
  requireExact(
    objectAt(
      inputFixtureById.get("transition:retiring-explicitly-unavailable")?.[
        "value"
      ],
    ),
    expectedUnavailableTransition,
    "E0_CONFIRMATION_TRANSITION_INVALID",
    "transition:retiring-explicitly-unavailable",
    "The unavailable transition must bind the oversized state, candidate, request, revision, origin, and undo disposition exactly.",
    findings,
  );
  requireExact(
    unavailableStateFixture,
    {
      id: "state:retiring-explicitly-unavailable",
      kind: "state-snapshot",
      base: {
        sharedBase: "workflow-state-history-oversized-revision-7",
      },
      orderedMutations: [
        {
          operation: "set",
          path: ["pendingRequests"],
          to: [expectedUnavailablePendingRequest],
        },
        {
          operation: "set",
          path: ["documentTransition"],
          to: expectedUnavailableTransition,
        },
      ],
    },
    "E0_CONFIRMATION_STATE_FIXTURE_INVALID",
    "state:retiring-explicitly-unavailable",
    "The unavailable currentState must derive only its one running request and matching transition from the zero-history oversized AppState.",
    findings,
  );
  if (
    unavailableState === null ||
    !sameJson(Object.keys(unavailableState), appStateKeys) ||
    !sameJson(unavailableState["document"], {
      sharedBase: "workflow-document-history-oversized",
    }) ||
    unavailableState["revision"] !== 7 ||
    !sameJson(unavailableState["history"], {
      undo: [],
      redo: [],
      retainedBytesEstimate: 0,
    }) ||
    !sameJson(unavailableState["documentTransition"], unavailableTransition) ||
    !sameJson(unavailableState["pendingRequests"], [
      expectedUnavailablePendingRequest,
    ]) ||
    !sameJson(unavailableTransition, expectedUnavailableTransition)
  ) {
    addFinding(
      findings,
      "E0_CONFIRMATION_STATE_INVALID",
      "state:retiring-explicitly-unavailable",
      "Unavailable commit state must materialize the exact pending request and retiring transition.",
    );
  }

  const wrongDocumentStateFixture = inputFixtureById.get(
    "state:retiring-explicitly-unavailable-wrong-document",
  );
  requireExact(
    wrongDocumentStateFixture,
    {
      id: "state:retiring-explicitly-unavailable-wrong-document",
      kind: "state-snapshot",
      base: { fixtureId: "state:retiring-explicitly-unavailable" },
      orderedMutations: [
        {
          operation: "set",
          path: ["document"],
          from: { sharedBase: "workflow-document-history-oversized" },
          to: { sharedBase: "workflow-document-minimal" },
        },
        {
          operation: "set",
          path: ["transport", "documentId"],
          from: "oversized",
          to: "document-e0-minimal",
        },
        {
          operation: "set",
          path: ["pendingRequests", 0, "documentId"],
          from: "oversized",
          to: "document-e0-minimal",
        },
      ],
      expectedMismatch: {
        previewIdentityDocumentId: "oversized",
        currentDocumentId: "document-e0-minimal",
        code: "import.confirmation_wrong_document",
      },
    },
    "E0_CONFIRMATION_WRONG_DOCUMENT_STATE_FIXTURE_INVALID",
    "state:retiring-explicitly-unavailable-wrong-document",
    "The wrong-document near miss must derive a complete correlated current AppState while leaving preview and confirmation bound to the prior document.",
    findings,
  );
  const wrongDocumentState = materializeStateFixture(
    "state:retiring-explicitly-unavailable-wrong-document",
    inputFixtureById,
    sharedBases,
    loaded,
  );
  const wrongDocumentTransport = objectAt(wrongDocumentState?.["transport"]);
  const wrongDocumentPending = recordsAt(
    wrongDocumentState?.["pendingRequests"],
  )[0];
  if (
    wrongDocumentState === null ||
    !sameJson(wrongDocumentState["document"], {
      sharedBase: "workflow-document-minimal",
    }) ||
    wrongDocumentTransport?.["documentId"] !== "document-e0-minimal" ||
    wrongDocumentPending?.["documentId"] !== "document-e0-minimal"
  ) {
    addFinding(
      findings,
      "E0_CONFIRMATION_WRONG_DOCUMENT_MATERIALIZATION_INVALID",
      "state:retiring-explicitly-unavailable-wrong-document",
      "The current state must move coherently to document-e0-minimal while the matching preview acknowledgement remains scoped to oversized.",
    );
  }

  const completeUnavailableInputs = [
    "state:retiring-explicitly-unavailable",
    "preview:explicitly-unavailable",
    "transition:retiring-explicitly-unavailable",
  ];
  const matchingConfirmationCase = caseById.get("E0-WF-017");
  requireExact(
    stringsAt(matchingConfirmationCase?.["inputFixtureIds"]),
    [
      ...completeUnavailableInputs,
      "prepared-import-replacement:explicitly-unavailable-playing",
      "x1-evidence-expectation:explicitly-unavailable-playing",
      "import-replacement-publication-handoff:explicitly-unavailable-playing",
      "confirmation:matching",
    ],
    "E0_CONFIRMATION_MATCHING_TRACE_INPUTS",
    "E0-WF-017.inputFixtureIds",
    "Matching confirmation trace must include complete state, preview, transition, receipt, and acknowledgement.",
    findings,
  );
  requireExact(
    objectAt(matchingConfirmationCase?.["expectedCommand"]),
    {
      id: "command-e0-replace-1",
      label: "Import Changes",
      expectedDocumentId: "oversized",
      expectedRevision: 7,
      logicalTimeMs: 9_000,
      coalescing: null,
      kind: "replace-document",
      origin: "canonical-import",
      candidateFixtureId: "goldens/minimal.changes.json",
      requestId: 101,
      retirementFixtureId: "receipt:no-future-attack",
      undoDisposition: {
        kind: "explicitly-unavailable",
        confirmationId: "confirm-e0-impact-1",
        exportRecommended: true,
      },
    },
    "E0_CONFIRMATION_MATCHING_COMMAND",
    "E0-WF-017.expectedCommand",
    "Matching acknowledgement must yield one fully formed A0 command whose confirmation ID comes from preview.",
    findings,
  );
  requireExact(
    objectAt(matchingConfirmationCase?.["expectedPostState"]),
    {
      documentId: "document-e0-minimal",
      revision: 8,
      history: {
        undoEntries: 0,
        redoEntries: 0,
        retainedBytesEstimate: 0,
      },
      bookmarks: { sharedBase: "workflow-bookmarks-empty" },
      importDraft: null,
      pendingRequests: [],
      documentTransition: { kind: "idle" },
      focusRequest: {
        sequence: 12,
        target: { kind: "chart" },
        reason: "replacement",
      },
      notice: {
        sequence: 13,
        level: "warning",
        code: "history.replacement_not_undoable",
      },
      nextSequence: 14,
      transportRelation: "reference-identical",
      requiredTransactionCompletion:
        "X1-installs-replacement-plan-ready-at-beat-zero",
      recoveryRelation: "reference-identical",
      panelsRelation: "reference-identical",
      exportRevision: 3,
    },
    "E0_CONFIRMATION_MATCHING_POST_STATE",
    "E0-WF-017.expectedPostState",
    "Matching non-undoable replacement must freeze the exact A0 post-state projection.",
    findings,
  );
  requireExact(
    matchingConfirmationCase?.["expectedEffects"],
    [
      "queue-recovery",
      "compile-playback-plan",
      "restore-focus",
      "announce",
      "recommend-export",
    ],
    "E0_CONFIRMATION_MATCHING_EFFECTS",
    "E0-WF-017.expectedEffects",
    "Oversized replacement effects must be exact and ordered.",
    findings,
  );
  const missingConfirmationCase = caseById.get("E0-WF-013");
  const wrongConfirmationCase = caseById.get("E0-WF-018");
  requireExact(
    stringsAt(missingConfirmationCase?.["inputFixtureIds"]),
    [...completeUnavailableInputs, "confirmation:null"],
    "E0_CONFIRMATION_MISSING_TRACE_INPUTS",
    "E0-WF-013.inputFixtureIds",
    "Missing-confirmation near miss must otherwise use the complete handoff request.",
    findings,
  );
  requireExact(
    stringsAt(wrongConfirmationCase?.["inputFixtureIds"]),
    [...completeUnavailableInputs, "confirmation:wrong"],
    "E0_CONFIRMATION_WRONG_TRACE_INPUTS",
    "E0-WF-018.inputFixtureIds",
    "Wrong-confirmation near miss must otherwise use the complete handoff request.",
    findings,
  );
  requireExact(
    wrongConfirmationCase?.["expectedIssueCodes"],
    ["import.confirmation_identity_mismatch"],
    "E0_CONFIRMATION_WRONG_RESULT",
    "E0-WF-018.expectedIssueCodes",
    "A syntactically valid wrong acknowledgement must have its own refusal.",
    findings,
  );

  requireExact(
    {
      id: transportWorkflowMatrix?.["id"],
      axes: transportWorkflowMatrix?.["axes"],
      requiredCellCount: transportWorkflowMatrix?.["requiredCellCount"],
      equivalenceReductionAuthorized:
        transportWorkflowMatrix?.["equivalenceReductionAuthorized"],
      evidenceBoundary: transportWorkflowMatrix?.["evidenceBoundary"],
    },
    {
      id: "E0-WF-TRANSPORT-MATRIX",
      axes: {
        sourceFormats: E0_TRANSPORT_WORKFLOW_SOURCE_FORMATS,
        transportStatuses: E0_APPLICATION_TRANSPORT_STATUSES,
        operations: E0_TRANSPORT_WORKFLOW_ACTIONS,
      },
      requiredCellCount: 56,
      equivalenceReductionAuthorized: false,
      evidenceBoundary: {
        callerSuppliesEvidence: false,
        adapterAuthority: "x1-serialized-transport",
        applyInput: "literal-14-row-format-status-evidence-matrix",
        ordinaryFailure: "adapter-refusal-with-retirementEffect-none",
        preparationLifecycle:
          "allocate-before-X1-consume-on-success-invalidate-by-request-on-failure-zero-live-at-return",
        protocolNearMiss: "separate-reconciliation-required-case",
        runtimeX1IntegrationClaimedByE0: false,
      },
    },
    "E0_TRANSPORT_MATRIX_AXES",
    "workflow-adapter-cases.json.transportWorkflowMatrix",
    "Transport proof must freeze the complete 2 x 7 x 4 Cartesian axes with no equivalence reduction.",
    findings,
  );

  const expectedTransportCombinations: string[] = [];
  const seenTransportCombinations = new Set<string>();
  const seenTransportCellIds = new Set<string>();
  for (const cell of transportWorkflowCells) {
    const sourceFormat = String(cell["sourceFormat"]);
    const status = String(cell["transportStatus"]);
    const action = String(cell["operation"]);
    const combination = `${sourceFormat}|${status}|${action}`;
    if (seenTransportCombinations.has(combination)) {
      addFinding(
        findings,
        "E0_TRANSPORT_MATRIX_COMBINATION_DUPLICATE",
        combination,
        "Each format/status/action combination must appear exactly once.",
      );
    }
    seenTransportCombinations.add(combination);
    const cellId = String(cell["id"]);
    if (seenTransportCellIds.has(cellId)) {
      addFinding(
        findings,
        "E0_TRANSPORT_MATRIX_CELL_ID_DUPLICATE",
        cellId,
        "Transport matrix cell IDs must be unique.",
      );
    }
    seenTransportCellIds.add(cellId);
  }

  for (const sourceFormat of E0_TRANSPORT_WORKFLOW_SOURCE_FORMATS) {
    const canonical = sourceFormat === "canonical-json-v2";
    const formatSlug = canonical ? "CANONICAL" : "LEGACY";
    const formatFixtureSlug = canonical ? "canonical" : "legacy";
    const requirementId = canonical
      ? "E0-REQ-EVIDENCE-009"
      : "E0-REQ-EVIDENCE-010";
    const previewId = canonical ? "preview:canonical" : "preview:legacy";
    const transitionId = canonical
      ? "transition:retiring"
      : "transition:retiring-legacy";
    for (const status of E0_APPLICATION_TRANSPORT_STATUSES) {
      for (const action of E0_TRANSPORT_WORKFLOW_ACTIONS) {
        const combination = `${sourceFormat}|${status}|${action}`;
        expectedTransportCombinations.push(combination);
        const matches = transportWorkflowCells.filter(
          (cell) =>
            cell["sourceFormat"] === sourceFormat &&
            cell["transportStatus"] === status &&
            cell["operation"] === action,
        );
        const cell = matches[0];
        if (matches.length !== 1 || cell === undefined) continue;
        const transitionWait =
          (status === "starting" || status === "stopping") &&
          (action === "apply" || action === "failure")
            ? 1
            : 0;
        let inputFixtureIds = [`transport:${status}`, previewId];
        let resultCategory = canonical
          ? "PREVIEW_READY"
          : "PREVIEW_READY_WITH_WARNINGS";
        let failureStage: string | null = null;
        let expectedIssueCodes: readonly string[] = [];
        let stateEffect = "DRAFT_ONLY";
        let expectedTransportRelation = "reference-identical";
        let terminationReason = "preview-ready";
        let exactStageCounts: JsonObject = {
          e0JsonParse: canonical ? 1 : 0,
          c0Migration: canonical ? 0 : 1,
          c0JsonParse: canonical ? 0 : 1,
          shapeDecode: 1,
          semanticValidation: 1,
          transportBarriers: 0,
          preExistingTransitionWaits: 0,
          retirementAttempts: 0,
          x1EvidenceExpectations: 0,
          retireProgression: 0,
          retirePreview: 0,
          zeroFutureAttackPostconditions: 0,
          replacementHandoffs: 0,
          replaceCommands: 0,
          historyEntriesAdded: 0,
        };
        if (action === "apply") {
          inputFixtureIds = [
            `transport-handoff:${formatFixtureSlug}:${status}`,
            previewId,
            transitionId,
            "prepared-import-replacement-matrix:all-formats-statuses",
            "x1-evidence-matrix:all-formats-statuses",
            "confirmation:null",
          ];
          resultCategory = "REPLACED_ONCE";
          stateEffect = "REPLACE_ONCE";
          expectedTransportRelation =
            "reference-identical-at-A0-publication-then-X1-plan-installation-required-before-transaction-complete";
          terminationReason = "replacement-committed";
          exactStageCounts = {
            e0JsonParse: 0,
            c0Migration: 0,
            c0JsonParse: 0,
            shapeDecode: 1,
            semanticValidation: 1,
            transportBarriers: 1,
            preExistingTransitionWaits: transitionWait,
            retirementAttempts: 1,
            x1EvidenceExpectations: 1,
            preparedCapabilitiesAllocated: 1,
            preparedCapabilitiesConsumed: 1,
            preparedCapabilitiesInvalidatedByRequest: 0,
            livePreparedCapabilities: 0,
            retireProgression: 1,
            retirePreview: 1,
            zeroFutureAttackPostconditions: 1,
            replacementHandoffs: 1,
            replaceCommands: 1,
            historyEntriesAdded: 1,
          };
        } else if (action === "cancel") {
          inputFixtureIds = [...inputFixtureIds, "action:cancel"];
          resultCategory = "CANCELLED_NOOP";
          stateEffect = "NONE";
          terminationReason = "cancelled";
          exactStageCounts = {
            e0JsonParse: 0,
            c0Migration: 0,
            c0JsonParse: 0,
            shapeDecode: 0,
            semanticValidation: 0,
            transportBarriers: 0,
            preExistingTransitionWaits: 0,
            retirementAttempts: 0,
            x1EvidenceExpectations: 0,
            retireProgression: 0,
            retirePreview: 0,
            zeroFutureAttackPostconditions: 0,
            replacementHandoffs: 0,
            replaceCommands: 0,
            historyEntriesAdded: 0,
          };
        } else if (action === "failure") {
          inputFixtureIds = [
            `transport-handoff:${formatFixtureSlug}:${status}`,
            previewId,
            transitionId,
            "prepared-import-replacement-matrix:all-formats-statuses",
            "x1-adapter:failed-no-effect",
            "confirmation:null",
          ];
          resultCategory = "REPLACEMENT_COMMIT_REFUSED";
          failureStage = "transport-retirement";
          expectedIssueCodes = ["transport.replacement_retirement_failed"];
          stateEffect = "NONE";
          terminationReason = "complete-refusal";
          exactStageCounts = {
            e0JsonParse: 0,
            c0Migration: 0,
            c0JsonParse: 0,
            shapeDecode: 0,
            semanticValidation: 0,
            transportBarriers: 1,
            preExistingTransitionWaits: transitionWait,
            retirementAttempts: 1,
            x1EvidenceExpectations: 0,
            preparedCapabilitiesAllocated: 1,
            preparedCapabilitiesConsumed: 0,
            preparedCapabilitiesInvalidatedByRequest: 1,
            livePreparedCapabilities: 0,
            retireProgression: 0,
            retirePreview: 0,
            zeroFutureAttackPostconditions: 0,
            replacementHandoffs: 0,
            replaceCommands: 0,
            historyEntriesAdded: 0,
          };
        }
        requireExact(
          cell,
          {
            id: `E0-WF-TM-${formatSlug}-${status.toUpperCase()}-${action.toUpperCase()}`,
            requirementId,
            sourceFormat,
            transportStatus: status,
            operation: action,
            inputFixtureIds,
            resultCategory,
            failureStage,
            expectedIssueCodes,
            stateEffect,
            markerEffect: "UNCHANGED",
            expectedTransportRelation,
            exactStageCounts,
            terminationReason,
          },
          "E0_TRANSPORT_MATRIX_CELL_INVALID",
          String(cell["id"]),
          "Every transport matrix cell must freeze exact format/status/action inputs, results, isolation, and work counts.",
          findings,
        );
      }
    }
  }
  requireExact(
    [...seenTransportCombinations].sort(codeUnitCompare),
    expectedTransportCombinations.sort(codeUnitCompare),
    "E0_TRANSPORT_MATRIX_COVERAGE",
    "workflow-adapter-cases.json.transportWorkflowMatrix.cells",
    "Transport matrix must contain every one of the 56 combinations with no extras.",
    findings,
  );

  const expectedPreparedMatrixRows: JsonObject[] = [];
  const expectedX1EvidenceMatrixRows: JsonObject[] = [];
  for (const sourceFormat of E0_TRANSPORT_WORKFLOW_SOURCE_FORMATS) {
    const canonical = sourceFormat === "canonical-json-v2";
    const fixtureSlug = canonical ? "canonical" : "legacy";
    const transitionOrigin = canonical ? "canonical-import" : "legacy-import";
    for (const transportStatus of E0_APPLICATION_TRANSPORT_STATUSES) {
      const generation = transportStatus === "unavailable" ? 0 : 11;
      const transportHandoffFixtureId = `transport-handoff:${fixtureSlug}:${transportStatus}`;
      expectedPreparedMatrixRows.push({
        sourceFormat,
        transportStatus,
        transportHandoffFixtureId,
        expectedTransportGeneration: generation,
        transitionOrigin,
      });
      expectedX1EvidenceMatrixRows.push({
        sourceFormat,
        transportStatus,
        transportHandoffFixtureId,
        expectedTransportGeneration: generation,
        retiredTransportGeneration: generation,
      });
    }
  }
  requireExact(
    inputFixtureById.get(
      "prepared-import-replacement-matrix:all-formats-statuses",
    ),
    {
      id: "prepared-import-replacement-matrix:all-formats-statuses",
      kind: "scenario-matrix",
      schema: "changes.prepared-import-replacement-publication.v1",
      commonIdentity: {
        requestId: 101,
        documentId: "document-e0-nested",
        baseRevision: 7,
      },
      candidateDocumentId: "document-e0-minimal",
      rows: expectedPreparedMatrixRows,
      expected: {
        rows: 14,
        maximumLivePerRequest: 1,
        successfulRowsConsumed: 14,
        ordinaryFailureRowsInvalidatedByRequest: 14,
        liveAfterEveryTerminalPath: 0,
      },
    },
    "E0_PREPARED_PUBLICATION_MATRIX_INVALID",
    "prepared-import-replacement-matrix:all-formats-statuses",
    "Every format/status path must freeze its exact prepared A0 capability binding and terminal registry disposition.",
    findings,
  );
  requireExact(
    inputFixtureById.get("x1-evidence-matrix:all-formats-statuses"),
    {
      id: "x1-evidence-matrix:all-formats-statuses",
      kind: "scenario-matrix",
      materialization: "evidence-expectation-only",
      runtimeEvidenceMaterialized: false,
      productionAuthority: "X1",
      envelope: {
        schema: "changes.x1-replacement-retirement-evidence.v1",
        authority: "x1-serialized-transport",
      },
      commonRequest: {
        identity: {
          requestId: 101,
          documentId: "document-e0-nested",
          baseRevision: 7,
        },
        candidateDocumentId: "document-e0-minimal",
        scope: "progression-and-preview",
        requiredPostcondition: "zero-future-attack",
      },
      commonReceipt: {
        requestId: 101,
        progressionRetired: true,
        previewRetired: true,
        noFutureAttack: true,
      },
      rows: expectedX1EvidenceMatrixRows,
      expected: {
        rows: 14,
        everyRequestEchoFieldCompared: true,
        everyReceiptFieldCompared: true,
        equivalenceReductionAuthorized: false,
      },
    },
    "E0_X1_EVIDENCE_MATRIX_INVALID",
    "x1-evidence-matrix:all-formats-statuses",
    "Every format/status apply path must own an exact request/evidence binding rather than reuse canonical-playing prose.",
    findings,
  );
  const expectedCanonicalPreparedPublication = {
    schema: "changes.prepared-import-replacement-publication.v1",
    identity: {
      requestId: 101,
      documentId: "document-e0-nested",
      baseRevision: 7,
    },
    sourceFormat: "canonical-json-v2",
    candidateDocumentId: "document-e0-minimal",
    expectedTransportGeneration: 11,
    committingTransition: {
      kind: "committing",
      requestId: 101,
      origin: "canonical-import",
      baseRevision: 7,
      candidateDocumentId: "document-e0-minimal",
      undoDisposition: "retained",
    },
  };
  requireExact(
    inputFixtureById.get("prepared-import-replacement:canonical-playing"),
    {
      id: "prepared-import-replacement:canonical-playing",
      kind: "adapter-result",
      operation: "prepareImportReplacementPublication",
      call: 1,
      requestFixtureIds: [
        "transport-handoff:canonical:playing",
        "preview:canonical",
        "transition:retiring",
        "confirmation:null",
      ],
      return: { ok: true, value: expectedCanonicalPreparedPublication },
      registryAfterReturn: {
        allocated: 1,
        consumed: 0,
        invalidatedByRequest: 0,
        liveForRequest: 1,
      },
    },
    "E0_PREPARED_PUBLICATION_FIXTURE_INVALID",
    "prepared-import-replacement:canonical-playing",
    "Representative A0 preparation must be a literal single-use capability bound to the complete canonical-playing request.",
    findings,
  );
  requireExact(
    inputFixtureById.get(
      "discard-prepared-import-replacement:canonical-playing",
    ),
    {
      id: "discard-prepared-import-replacement:canonical-playing",
      kind: "adapter-result",
      operation: "discardImportReplacementPublication",
      call: 1,
      request: {
        identity: {
          requestId: 101,
          documentId: "document-e0-nested",
          baseRevision: 7,
        },
        reason: "retirement-refused",
      },
      return: {
        outcome: "invalidated-by-request",
        identity: {
          requestId: 101,
          documentId: "document-e0-nested",
          baseRevision: 7,
        },
        liveForRequest: 0,
      },
      registryAfterReturn: {
        allocated: 1,
        consumed: 0,
        invalidatedByRequest: 1,
        liveForRequest: 0,
      },
    },
    "E0_PREPARED_PUBLICATION_DISCARD_INVALID",
    "discard-prepared-import-replacement:canonical-playing",
    "Post-prepare nonpublication must synchronously invalidate the exact capability and leave no live entry.",
    findings,
  );
  requireExact(
    inputFixtureById.get(
      "import-replacement-publication-handoff:canonical-playing",
    ),
    {
      id: "import-replacement-publication-handoff:canonical-playing",
      kind: "adapter-input",
      operation: "publishImportReplacement",
      orderedAfterFixtureId: "x1-evidence-expectation:no-future-attack",
      value: {
        preparedFixtureId: "prepared-import-replacement:canonical-playing",
        retirementFixtureId: "receipt:no-future-attack",
      },
      registryAfterReturn: {
        allocated: 1,
        consumed: 1,
        invalidatedByRequest: 0,
        liveForRequest: 0,
      },
    },
    "E0_REPLACEMENT_PUBLICATION_HANDOFF_INVALID",
    "import-replacement-publication-handoff:canonical-playing",
    "Publication must consume the exact prepared capability only after valid X1 evidence and leave no live entry.",
    findings,
  );

  const expectedUnavailablePreparedPublication = {
    schema: "changes.prepared-import-replacement-publication.v1",
    identity: {
      requestId: 101,
      documentId: "oversized",
      baseRevision: 7,
    },
    sourceFormat: "canonical-json-v2",
    candidateDocumentId: "document-e0-minimal",
    expectedTransportGeneration: 11,
    committingTransition: {
      kind: "committing",
      requestId: 101,
      origin: "canonical-import",
      baseRevision: 7,
      candidateDocumentId: "document-e0-minimal",
      undoDisposition: "explicitly-unavailable",
    },
  };
  requireExact(
    inputFixtureById.get(
      "prepared-import-replacement:explicitly-unavailable-playing",
    ),
    {
      id: "prepared-import-replacement:explicitly-unavailable-playing",
      kind: "adapter-result",
      operation: "prepareImportReplacementPublication",
      call: 1,
      requestFixtureIds: [
        "state:retiring-explicitly-unavailable",
        "preview:explicitly-unavailable",
        "transition:retiring-explicitly-unavailable",
        "confirmation:matching",
      ],
      return: { ok: true, value: expectedUnavailablePreparedPublication },
      registryAfterReturn: {
        allocated: 1,
        consumed: 0,
        invalidatedByRequest: 0,
        liveForRequest: 1,
      },
    },
    "E0_UNAVAILABLE_PREPARED_PUBLICATION_FIXTURE_INVALID",
    "prepared-import-replacement:explicitly-unavailable-playing",
    "The explicit-unavailable positive must freeze its own oversized identity, capability, committing transition, and live-entry count.",
    findings,
  );
  requireExact(
    inputFixtureById.get(
      "x1-evidence-expectation:explicitly-unavailable-playing",
    ),
    {
      id: "x1-evidence-expectation:explicitly-unavailable-playing",
      kind: "retirement-result",
      materialization: "evidence-expectation-only",
      runtimeEvidenceMaterialized: false,
      productionAuthority: "X1",
      expected: {
        schema: "changes.x1-replacement-retirement-evidence.v1",
        authority: "x1-serialized-transport",
        request: {
          identity: {
            requestId: 101,
            documentId: "oversized",
            baseRevision: 7,
          },
          sourceFormat: "canonical-json-v2",
          candidateDocumentId: "document-e0-minimal",
          expectedTransportGeneration: 11,
          scope: "progression-and-preview",
          requiredPostcondition: "zero-future-attack",
        },
        receiptFixtureId: "receipt:no-future-attack",
      },
    },
    "E0_UNAVAILABLE_X1_EVIDENCE_FIXTURE_INVALID",
    "x1-evidence-expectation:explicitly-unavailable-playing",
    "The explicit-unavailable positive must own its exact oversized request echo rather than reuse the retained canonical identity.",
    findings,
  );
  requireExact(
    inputFixtureById.get(
      "import-replacement-publication-handoff:explicitly-unavailable-playing",
    ),
    {
      id: "import-replacement-publication-handoff:explicitly-unavailable-playing",
      kind: "adapter-input",
      operation: "publishImportReplacement",
      orderedAfterFixtureId:
        "x1-evidence-expectation:explicitly-unavailable-playing",
      value: {
        preparedFixtureId:
          "prepared-import-replacement:explicitly-unavailable-playing",
        retirementFixtureId: "receipt:no-future-attack",
      },
      registryAfterReturn: {
        allocated: 1,
        consumed: 1,
        invalidatedByRequest: 0,
        liveForRequest: 0,
      },
    },
    "E0_UNAVAILABLE_PUBLICATION_HANDOFF_FIXTURE_INVALID",
    "import-replacement-publication-handoff:explicitly-unavailable-playing",
    "The explicit-unavailable publication must consume its exact prepared capability after its exact X1 evidence.",
    findings,
  );
  requireExact(
    inputFixtureById.get("prepared-import-replacement-binding-near-misses"),
    {
      id: "prepared-import-replacement-binding-near-misses",
      kind: "scenario-matrix",
      baseFixtureId: "prepared-import-replacement:canonical-playing",
      rows: [
        {
          id: "wrong-schema",
          path: ["return", "value", "schema"],
          from: "changes.prepared-import-replacement-publication.v1",
          to: "changes.prepared-import-replacement-publication.v0",
        },
        {
          id: "wrong-request",
          path: ["return", "value", "identity", "requestId"],
          from: 101,
          to: 102,
        },
        {
          id: "wrong-document",
          path: ["return", "value", "identity", "documentId"],
          from: "document-e0-nested",
          to: "document-e0-other",
        },
        {
          id: "wrong-revision",
          path: ["return", "value", "identity", "baseRevision"],
          from: 7,
          to: 8,
        },
        {
          id: "wrong-format",
          path: ["return", "value", "sourceFormat"],
          from: "canonical-json-v2",
          to: "unversioned-legacy-json",
        },
        {
          id: "wrong-candidate",
          path: ["return", "value", "candidateDocumentId"],
          from: "document-e0-minimal",
          to: "document-e0-other",
        },
        {
          id: "wrong-generation",
          path: ["return", "value", "expectedTransportGeneration"],
          from: 11,
          to: 12,
        },
        {
          id: "wrong-transition-kind",
          path: ["return", "value", "committingTransition", "kind"],
          from: "committing",
          to: "retiring-transport",
        },
        {
          id: "wrong-transition-request",
          path: ["return", "value", "committingTransition", "requestId"],
          from: 101,
          to: 102,
        },
        {
          id: "wrong-transition-origin",
          path: ["return", "value", "committingTransition", "origin"],
          from: "canonical-import",
          to: "legacy-import",
        },
        {
          id: "wrong-transition-revision",
          path: ["return", "value", "committingTransition", "baseRevision"],
          from: 7,
          to: 8,
        },
        {
          id: "wrong-transition-candidate",
          path: [
            "return",
            "value",
            "committingTransition",
            "candidateDocumentId",
          ],
          from: "document-e0-minimal",
          to: "document-e0-other",
        },
        {
          id: "wrong-transition-disposition",
          path: ["return", "value", "committingTransition", "undoDisposition"],
          from: "retained",
          to: "explicitly-unavailable",
        },
        {
          id: "replay-after-consume",
          lifecycle: "publish-then-publish",
          expectedSecondOutcome: "registry-entry-not-live",
        },
        {
          id: "replay-after-invalidation",
          lifecycle: "invalidate-by-request-then-publish",
          expectedSecondOutcome: "registry-entry-not-live",
        },
      ],
      expected: {
        rows: 15,
        bindingMutationRows: 13,
        lifecycleRows: 2,
        everyBindingMutationRejected: true,
        everyReplayRejected: true,
        maximumLivePerRequest: 1,
        liveAfterEveryTerminalPath: 0,
      },
    },
    "E0_PREPARED_PUBLICATION_BINDING_NEAR_MISSES_INVALID",
    "prepared-import-replacement-binding-near-misses",
    "Every prepared-capability binding and replay mutation must remain explicit and independently fixed.",
    findings,
  );

  const canonicalReplacementIdentity = {
    requestId: 101,
    documentId: "document-e0-nested",
    baseRevision: 7,
  };
  const expectedInvalidationFixture = (
    id: string,
    reason: string,
    registryAfterReturn: JsonObject,
  ): JsonObject => ({
    id,
    kind: "adapter-result",
    operation: "discardImportReplacementPublication",
    call: 1,
    request: { identity: canonicalReplacementIdentity, reason },
    return: {
      outcome: "invalidated-by-request",
      identity: canonicalReplacementIdentity,
      liveForRequest: 0,
    },
    registryAfterReturn,
  });
  for (const [fixtureId, reason, registryAfterReturn] of [
    [
      "invalidate-prepared-import-replacement:retirement-protocol-invalid",
      "retirement-protocol-invalid",
      { allocated: 1, consumed: 0, invalidatedByRequest: 1, liveForRequest: 0 },
    ],
    [
      "invalidate-prepared-import-replacement:preparation-protocol-invalid",
      "preparation-protocol-invalid",
      { allocated: 1, consumed: 0, invalidatedByRequest: 1, liveForRequest: 0 },
    ],
    [
      "invalidate-prepared-import-replacement:publication-protocol-invalid",
      "publication-protocol-invalid",
      {
        allocated: 1,
        consumed: "unknown-after-malformed-publication-result",
        invalidatedOrAlreadyConsumed: 1,
        liveForRequest: 0,
      },
    ],
  ] as const) {
    requireExact(
      inputFixtureById.get(fixtureId),
      expectedInvalidationFixture(fixtureId, reason, registryAfterReturn),
      "E0_REQUEST_IDENTITY_INVALIDATION_FIXTURE_INVALID",
      fixtureId,
      "Every malformed post-call path must invalidate by the original request identity and prove zero live authority.",
      findings,
    );
  }

  requireExact(
    inputFixtureById.get("a0-preparation:impact-unavailable"),
    {
      id: "a0-preparation:impact-unavailable",
      kind: "dependency-fault",
      override: {
        operation: "prepareImportReplacementPublication",
        call: 1,
        requestFixtureIds: [
          "transport-handoff:canonical:playing",
          "preview:canonical",
          "transition:retiring",
          "confirmation:null",
        ],
        return: {
          ok: false,
          code: "import.replacement_impact_unavailable",
        },
      },
      registryAfterReturn: {
        allocated: 0,
        consumed: 0,
        invalidatedByRequest: 0,
        liveForRequest: 0,
      },
    },
    "E0_PREPARATION_IMPACT_UNAVAILABLE_FIXTURE_INVALID",
    "a0-preparation:impact-unavailable",
    "Commit-time impact unavailability must be a normalized A0 preflight refusal with no capability allocation.",
    findings,
  );
  requireExact(
    inputFixtureById.get("x1-adapter:stale-no-effect"),
    {
      id: "x1-adapter:stale-no-effect",
      kind: "dependency-fault",
      override: {
        operation: "retireImportReplacement",
        call: 1,
        return: {
          ok: false,
          code: "transport.replacement_retirement_stale",
          retirementEffect: "none",
        },
      },
    },
    "E0_X1_STALE_NO_EFFECT_FIXTURE_INVALID",
    "x1-adapter:stale-no-effect",
    "The declared stale retirement branch must be an exact normalized no-effect X1 refusal.",
    findings,
  );
  requireExact(
    inputFixtureById.get("a0-preparation:protocol-invalid-wrong-format"),
    {
      id: "a0-preparation:protocol-invalid-wrong-format",
      kind: "dependency-fault",
      override: {
        operation: "prepareImportReplacementPublication",
        call: 1,
        requestFixtureIds: [
          "transport-handoff:canonical:playing",
          "preview:canonical",
          "transition:retiring",
          "confirmation:null",
        ],
        return: {
          ok: true,
          value: {
            ...expectedCanonicalPreparedPublication,
            sourceFormat: "unversioned-legacy-json",
          },
        },
      },
      invalidFields: ["return.value.sourceFormat"],
      actualRegistryEntry: {
        identity: canonicalReplacementIdentity,
        sourceFormat: "canonical-json-v2",
      },
      expectedCode: "import.replacement_preparation_result_invalid",
    },
    "E0_PREPARATION_PROTOCOL_INVALID_FIXTURE_INVALID",
    "a0-preparation:protocol-invalid-wrong-format",
    "A malformed returned binding must be rejected without using it as cleanup authority.",
    findings,
  );
  requireExact(
    inputFixtureById.get(
      "a0-replacement-publication:protocol-invalid-missing-state",
    ),
    {
      id: "a0-replacement-publication:protocol-invalid-missing-state",
      kind: "dependency-fault",
      override: {
        operation: "publishImportReplacement",
        call: 1,
        handoffFixtureId:
          "import-replacement-publication-handoff:canonical-playing",
        return: { ok: true, outcome: "committed" },
      },
      invalidFields: ["return.state", "return.effects", "return.counters"],
      expectedCode: "import.replacement_publication_result_invalid",
      expectedDisposition: "reconciliation-required-no-claimed-post-state",
    },
    "E0_PUBLICATION_PROTOCOL_INVALID_FIXTURE_INVALID",
    "a0-replacement-publication:protocol-invalid-missing-state",
    "A malformed post-X1 A0 publication result must retain no claimed post-state and require reconciliation.",
    findings,
  );

  requireExact(
    objectAt(inputFixtureById.get("receipt:no-future-attack")?.["value"]),
    {
      requestId: 101,
      retiredTransportGeneration: 11,
      progressionRetired: true,
      previewRetired: true,
      noFutureAttack: true,
    },
    "E0_TRANSPORT_RECEIPT_INVALID",
    "receipt:no-future-attack",
    "Apply cells require one exact no-future-attack receipt.",
    findings,
  );
  requireExact(
    inputFixtureById.get("x1-evidence-expectation:no-future-attack"),
    {
      id: "x1-evidence-expectation:no-future-attack",
      kind: "retirement-result",
      materialization: "evidence-expectation-only",
      runtimeEvidenceMaterialized: false,
      productionAuthority: "X1",
      expected: {
        schema: "changes.x1-replacement-retirement-evidence.v1",
        authority: "x1-serialized-transport",
        request: {
          identity: {
            requestId: 101,
            documentId: "document-e0-nested",
            baseRevision: 7,
          },
          sourceFormat: "canonical-json-v2",
          candidateDocumentId: "document-e0-minimal",
          expectedTransportGeneration: 11,
          scope: "progression-and-preview",
          requiredPostcondition: "zero-future-attack",
        },
        receiptFixtureId: "receipt:no-future-attack",
      },
      matrixCoverageFixtureId: "x1-evidence-matrix:all-formats-statuses",
      reason:
        "The E0 specification freezes an exact representative adapter result but does not claim a live X1 success before X1 exists.",
    },
    "E0_TRANSPORT_PROOF_EXPECTATION_INVALID",
    "x1-evidence-expectation:no-future-attack",
    "Apply evidence must freeze a complete representative request/receipt and require the same field binding for every matrix state without claiming a live X1 success.",
    findings,
  );
  requireExact(
    inputFixtureById.get("x1-evidence-near-miss:no-future-attack-false"),
    {
      id: "x1-evidence-near-miss:no-future-attack-false",
      kind: "retirement-result",
      requestEchoPresent: true,
      value: {
        schema: "changes.x1-replacement-retirement-evidence.v1",
        authority: "x1-serialized-transport",
        request: {
          identity: {
            requestId: 101,
            documentId: "document-e0-nested",
            baseRevision: 7,
          },
          sourceFormat: "canonical-json-v2",
          candidateDocumentId: "document-e0-minimal",
          expectedTransportGeneration: 11,
          scope: "progression-and-preview",
          requiredPostcondition: "zero-future-attack",
        },
        receipt: {
          requestId: 101,
          retiredTransportGeneration: 11,
          progressionRetired: true,
          previewRetired: true,
          noFutureAttack: false,
        },
      },
      invalidFields: ["value.receipt.noFutureAttack"],
      expectedDisposition: "reconciliation-required",
    },
    "E0_TRANSPORT_PROOF_NEAR_MISS_INVALID",
    "x1-evidence-near-miss:no-future-attack-false",
    "Protocol near miss must preserve the complete request and differ only at noFutureAttack, producing reconciliation-required rather than a false unchanged-state claim.",
    findings,
  );
  requireExact(
    inputFixtureById.get("x1-adapter:unavailable"),
    {
      id: "x1-adapter:unavailable",
      kind: "dependency-fault",
      override: {
        operation: "retireImportReplacement",
        call: 1,
        return: {
          ok: false,
          code: "transport.replacement_retirement_unavailable",
          retirementEffect: "none",
        },
      },
    },
    "E0_TRANSPORT_UNAVAILABLE_ADAPTER_INVALID",
    "x1-adapter:unavailable",
    "Until X1 is bound, the only honest adapter evidence is an explicit unavailable no-effect refusal with no publication.",
    findings,
  );
  requireExact(
    inputFixtureById.get("x1-adapter:failed-no-effect"),
    {
      id: "x1-adapter:failed-no-effect",
      kind: "dependency-fault",
      override: {
        operation: "retireImportReplacement",
        call: 1,
        return: {
          ok: false,
          code: "transport.replacement_retirement_failed",
          retirementEffect: "none",
        },
      },
    },
    "E0_TRANSPORT_FAILED_NO_EFFECT_ADAPTER_INVALID",
    "x1-adapter:failed-no-effect",
    "Ordinary matrix failures must use an explicit no-effect X1 refusal.",
    findings,
  );

  const hashFaultExpected = {
    ok: false,
    code: "export.hash_unavailable",
    rawValueRetained: false,
    partialArtifactPresent: false,
  };
  requireExact(
    [
      inputFixtureById.get("E0-FAULT-HASH-REJECTED"),
      inputFixtureById.get("E0-FAULT-HASH-THREW"),
      inputFixtureById.get("E0-FAULT-HASH-MALFORMED"),
    ],
    [
      {
        id: "E0-FAULT-HASH-REJECTED",
        kind: "dependency-fault",
        base: { fixtureId: "goldens/minimal.changes.json" },
        override: {
          operation: "hashBytes",
          call: 1,
          exception: {
            kind: "promise-rejection",
            rawValuePresent: false,
          },
        },
        expected: hashFaultExpected,
      },
      {
        id: "E0-FAULT-HASH-THREW",
        kind: "dependency-fault",
        base: { fixtureId: "goldens/minimal.changes.json" },
        override: {
          operation: "hashBytes",
          call: 1,
          exception: {
            kind: "synchronous-throw",
            rawValuePresent: false,
          },
        },
        expected: hashFaultExpected,
      },
      {
        id: "E0-FAULT-HASH-MALFORMED",
        kind: "dependency-fault",
        base: { fixtureId: "goldens/minimal.changes.json" },
        override: {
          operation: "hashBytes",
          call: 1,
          return: { ok: true, digest: "ABCDEF" },
        },
        expected: hashFaultExpected,
      },
    ],
    "E0_HASH_UNKNOWN_BOUNDARY_FIXTURES_INVALID",
    "input-fixture-ledger.json.hashBytes",
    "Hash rejection, synchronous throw, and malformed success must each normalize without raw retention or a partial artifact.",
    findings,
  );
  requireExact(
    caseById.get("E0-JX-019"),
    {
      id: "E0-JX-019",
      authorityIds: ["E0-AUTH-WEB-CRYPTO", "E0-AUTH-VERIFICATION"],
      traceIds: ["E0-TRACE-JSON-FAILURE-ISOLATION"],
      proofKinds: ["negative", "adapter", "mutation-link"],
      inputFixtureIds: [
        "E0-FAULT-HASH-REJECTED",
        "E0-FAULT-HASH-THREW",
        "E0-FAULT-HASH-MALFORMED",
      ],
      resultCategory: "REFUSED_SEMANTIC",
      failureStage: "semantic-validation",
      expectedIssueCodes: ["export.hash_unavailable"],
      expectedRelation:
        "hash-promise-rejection-synchronous-throw-and-malformed-success-envelope-are-each-normalized-with-no-raw-value-or-partial-artifact",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        hashFaultRows: 3,
        hashCallsPerRow: 1,
        deliveryCallsPerRow: 0,
      },
      terminationReason: "complete-refusal",
      expectedMutationKills: ["E0-MUT-082"],
    },
    "E0_HASH_UNKNOWN_BOUNDARY_CASE_INVALID",
    "E0-JX-019",
    "E0-JX-019 must retain the exact three-row HashBytes unknown-boundary proof.",
    findings,
  );

  const markerHash =
    "c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5";
  const acceptedMarker = {
    documentId: "document-e0-minimal",
    revision: 7,
    exportedAt: "2026-07-18T00:00:00.000Z",
    semanticDocumentHash: markerHash,
    canonicalPolicyVersion: 1,
    semanticHashPolicyVersion: 1,
  };
  const acceptedA0Publication = {
    schema: "changes.canonical-export-revision-publication.v1",
    documentId: "document-e0-minimal",
    revision: 7,
  };
  const acceptedA1Handoff = {
    schema: "changes.canonical-export-marker-persistence-handoff.v1",
    marker: acceptedMarker,
    artifact: {
      kind: "canonical-json",
      sourceDocumentId: "document-e0-minimal",
      byteLength: 352,
      filename: "Changes.changes.json",
      semanticDocumentHash: markerHash,
      canonicalPolicyVersion: 1,
      semanticHashPolicyVersion: 1,
    },
  };
  const requireMarkerFixture = (
    fixtureId: string,
    expected: JsonObject,
    code: string,
    message: string,
  ): void => {
    requireExact(
      inputFixtureById.get(fixtureId),
      expected,
      code,
      fixtureId,
      message,
      findings,
    );
  };

  requireMarkerFixture(
    "canonical-export-preparation-request:revision-7",
    {
      id: "canonical-export-preparation-request:revision-7",
      kind: "adapter-input",
      operation: "prepareCanonicalExportDelivery",
      value: { stateFixtureId: "state:marker-current-revision-7" },
      publicFieldPaths: [["state"]],
      forbiddenPublicFieldPaths: [
        ["preparationId"],
        ["generation"],
        ["artifact"],
        ["privateBytes"],
        ["preparedRegistry"],
      ],
    },
    "E0_MARKER_PREPARATION_REQUEST_INVALID",
    "Public preparation must accept only current AppState and expose no registry locator, artifact, or private bytes.",
  );
  requireMarkerFixture(
    "prepared-canonical-export-delivery:revision-7",
    {
      id: "prepared-canonical-export-delivery:revision-7",
      kind: "scenario-parameter",
      visibility: "E0-private-never-publicly-returned",
      schema: "changes.prepared-canonical-export-delivery.v1",
      identity: {
        preparationId: 1,
        generation: 1,
        documentId: "document-e0-minimal",
        revision: 7,
      },
      binding: {
        kind: "canonical-json",
        filename: "Changes.changes.json",
        byteLength: 352,
        semanticDocumentHash: markerHash,
        sourceDocumentId: "document-e0-minimal",
      },
      privateBytes: {
        encoding: "UTF-8",
        exactByteLength: 352,
        sha256: markerHash,
        ownership: "single-private-Uint8Array",
        aliasesArtifactTextOrCallerMemory: false,
        zeroedOnDiscardOrFinish: true,
      },
      privateEntryContainsText: false,
    },
    "E0_MARKER_PRIVATE_PREPARED_ENTRY_INVALID",
    "The one-slot prepared entry must bind exact identity and text-free single-owner bytes.",
  );
  requireMarkerFixture(
    "prepared-export-delivery-request:revision-7-fsa",
    {
      id: "prepared-export-delivery-request:revision-7-fsa",
      kind: "adapter-input",
      visibility: "composition-private",
      operation: "startPreparedExportDelivery",
      consumedRegistryFixtureId:
        "prepared-canonical-export-delivery:revision-7",
      value: {
        binding: { sharedBase: "canonical-artifact-binding" },
        privateBytes: {
          source: "transferred-from-prepared-registry-entry",
          exactByteLength: 352,
          sha256: markerHash,
          ownership: "single-transferred-Uint8Array",
        },
        preference: "prefer-file-system-access",
      },
      forbiddenValueFields: ["artifact", "text", "state", "preparationId"],
    },
    "E0_MARKER_PRIVATE_START_REQUEST_INVALID",
    "Only the composition-private start request may receive the transferred byte owner.",
  );
  requireMarkerFixture(
    "prepared-export-delivery-request:revision-7-blob",
    {
      id: "prepared-export-delivery-request:revision-7-blob",
      kind: "adapter-input",
      visibility: "composition-private",
      operation: "startPreparedExportDelivery",
      base: { fixtureId: "prepared-export-delivery-request:revision-7-fsa" },
      orderedMutations: [
        {
          operation: "set",
          path: ["preference"],
          from: "prefer-file-system-access",
          to: "download-only",
        },
      ],
    },
    "E0_MARKER_PRIVATE_START_REQUEST_INVALID",
    "Blob fallback must differ from the FSA private start request only by delivery preference.",
  );
  requireMarkerFixture(
    "canonical-export-preparation-result:prepared-revision-7",
    {
      id: "canonical-export-preparation-result:prepared-revision-7",
      kind: "adapter-result",
      operation: "prepareCanonicalExportDelivery",
      requestFixtureId: "canonical-export-preparation-request:revision-7",
      privateRegistryFixtureId: "prepared-canonical-export-delivery:revision-7",
      value: {
        ok: true,
        outcome: "prepared",
        binding: {
          preparationId: 1,
          generation: 1,
          documentId: "document-e0-minimal",
          revision: 7,
          filename: "Changes.changes.json",
          byteLength: 352,
          semanticDocumentHash: markerHash,
          canonicalPolicyVersion: 1,
          semanticHashPolicyVersion: 1,
        },
      },
      assertions: {
        privateBytesReturned: false,
        artifactTextReturned: false,
        bindingIsAuthority: false,
        liveRegistryEntries: 1,
      },
    },
    "E0_MARKER_PREPARATION_RESULT_INVALID",
    "Successful preparation returns only non-authoritative binding metadata while one private entry remains ready.",
  );
  requireMarkerFixture(
    "canonical-export-preparation-result:canonical-refused",
    {
      id: "canonical-export-preparation-result:canonical-refused",
      kind: "adapter-result",
      operation: "prepareCanonicalExportDelivery",
      requestFixtureId: "canonical-export-preparation-request:revision-7",
      dependencyFaultFixtureId: "E0-FAULT-HASH-REJECTED",
      value: {
        ok: false,
        outcome: "canonical-export-refused",
        refusal: { code: "export.hash_unavailable", path: [] },
      },
      terminalRegistryOperation: {
        operation: "abandonPreparation",
        preparationId: 1,
        outcome: "abandoned",
      },
      expectedRegistryState: "empty",
      livePrivateByteArrays: 0,
    },
    "E0_MARKER_CANONICAL_PREPARATION_REFUSAL_INVALID",
    "Canonical export refusal must abandon the exact preparation, retain no partial bytes, and forward only the bounded refusal.",
  );
  requireMarkerFixture(
    "canonical-export-preparation:artifact-protocol-invalid",
    {
      id: "canonical-export-preparation:artifact-protocol-invalid",
      kind: "dependency-fault",
      override: {
        operation: "prepareCanonicalJsonExport",
        call: 1,
        return: {
          ok: true,
          value: {
            schema: "changes.export.canonical-json-artifact.v1",
            kind: "canonical-json",
            mediaType: "application/json;charset=utf-8",
            filename: "Changes.changes.json",
            textFixtureId: "goldens/minimal.changes.json",
            byteLength: 351,
            semanticDocumentHash: markerHash,
            sourceDocumentId: "document-e0-minimal",
          },
        },
      },
      invalidFields: ["return.value.byteLength"],
      expectedCode: "export.prepared_canonical_artifact_invalid",
    },
    "E0_MARKER_CANONICAL_PREPARATION_PROTOCOL_FAULT_INVALID",
    "The canonical preparation protocol near miss must be an exact nominal success with only byteLength drift.",
  );

  requireExact(
    [
      inputFixtureById.get("canonical-export-preparation-request:revision-8"),
      inputFixtureById.get("prepared-canonical-export-delivery:revision-8"),
      inputFixtureById.get(
        "canonical-export-preparation-result:prepared-revision-8",
      ),
      inputFixtureById.get("prepared-registry:one-ready-entry"),
      inputFixtureById.get("prepared-registry:replacement-peak-one"),
      inputFixtureById.get("prepared-registry:id-max"),
      inputFixtureById.get("prepared-registry:id-exhausted"),
    ],
    [
      {
        id: "canonical-export-preparation-request:revision-8",
        kind: "adapter-input",
        operation: "prepareCanonicalExportDelivery",
        value: {
          stateFixtureId: "state:marker-current-revision-8",
        },
        publicFieldPaths: [["state"]],
      },
      {
        id: "prepared-canonical-export-delivery:revision-8",
        kind: "scenario-parameter",
        visibility: "E0-private-never-publicly-returned",
        base: {
          fixtureId: "prepared-canonical-export-delivery:revision-7",
        },
        orderedMutations: [
          {
            operation: "set",
            path: ["identity", "preparationId"],
            from: 1,
            to: 2,
          },
          {
            operation: "set",
            path: ["identity", "generation"],
            from: 1,
            to: 2,
          },
          {
            operation: "set",
            path: ["identity", "revision"],
            from: 7,
            to: 8,
          },
          {
            operation: "set",
            path: ["binding", "filename"],
            from: "Changes.changes.json",
            to: "Changes edited.changes.json",
          },
          {
            operation: "set",
            path: ["binding", "byteLength"],
            from: 352,
            to: 359,
          },
          {
            operation: "set",
            path: ["binding", "semanticDocumentHash"],
            from: "c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5",
            to: "1cde9a00387d67845b97b46b486f4c961db14d9d25e5823fe59717f05bfe26cf",
          },
          {
            operation: "set",
            path: ["privateBytes", "exactByteLength"],
            from: 352,
            to: 359,
          },
          {
            operation: "set",
            path: ["privateBytes", "sha256"],
            from: "c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5",
            to: "1cde9a00387d67845b97b46b486f4c961db14d9d25e5823fe59717f05bfe26cf",
          },
        ],
        derivedText: {
          baseFixtureId: "goldens/minimal.changes.json",
          exactReplacement: {
            from: '"title": "Changes"',
            to: '"title": "Changes edited"',
          },
          expectedByteLength: 359,
          expectedSha256:
            "1cde9a00387d67845b97b46b486f4c961db14d9d25e5823fe59717f05bfe26cf",
        },
      },
      {
        id: "canonical-export-preparation-result:prepared-revision-8",
        kind: "adapter-result",
        operation: "prepareCanonicalExportDelivery",
        requestFixtureId: "canonical-export-preparation-request:revision-8",
        privateRegistryFixtureId:
          "prepared-canonical-export-delivery:revision-8",
        value: {
          ok: true,
          outcome: "prepared",
          binding: {
            preparationId: 2,
            generation: 2,
            documentId: "document-e0-minimal",
            revision: 8,
            filename: "Changes edited.changes.json",
            byteLength: 359,
            semanticDocumentHash:
              "1cde9a00387d67845b97b46b486f4c961db14d9d25e5823fe59717f05bfe26cf",
            canonicalPolicyVersion: 1,
            semanticHashPolicyVersion: 1,
          },
        },
        assertions: {
          privateBytesReturned: false,
          artifactTextReturned: false,
          bindingIsAuthority: false,
          liveRegistryEntries: 1,
        },
      },
      {
        id: "prepared-registry:one-ready-entry",
        kind: "scenario-parameter",
        registryState: "ready",
        liveEntryFixtureIds: ["prepared-canonical-export-delivery:revision-7"],
        liveEntryCount: 1,
        maximumLiveEntryCount: 1,
        privateBytesLiveCopies: 1,
      },
      {
        id: "prepared-registry:replacement-peak-one",
        kind: "scenario-sequence",
        startingFixtureId: "prepared-canonical-export-delivery:revision-7",
        events: [
          {
            event: "begin-replaces-ready",
            preparationId: 2,
            generation: 2,
            replacedPreparationId: 1,
            oldPrivateBytesZeroedBeforeNewEntry: true,
            liveEntriesAfter: 1,
            stateAfter: "preparing",
          },
          {
            event: "publish",
            fixtureId: "prepared-canonical-export-delivery:revision-8",
            liveEntriesAfter: 1,
            stateAfter: "ready",
          },
        ],
        peakLiveEntries: 1,
        oldAndNewPrivateBytesSimultaneouslyLive: false,
      },
      {
        id: "prepared-registry:id-max",
        kind: "scenario-parameter",
        lastAllocatedPreparationId: 9007199254740990,
        beginStateIdentity: {
          documentId: "document-e0-minimal",
          revision: 7,
        },
        expected: {
          ok: true,
          preparationId: 9007199254740991,
          generation: 9007199254740991,
          state: "preparing",
        },
        allocations: 1,
        wraps: 0,
        reuses: 0,
      },
      {
        id: "prepared-registry:id-exhausted",
        kind: "scenario-parameter",
        lastAllocatedPreparationId: 9007199254740991,
        beginStateIdentity: {
          documentId: "document-e0-minimal",
          revision: 7,
        },
        expected: {
          ok: false,
          code: "export.preparation_sequence_exhausted",
          state: "empty",
        },
        allocations: 0,
        wraps: 0,
        reuses: 0,
      },
    ],
    "E0_MARKER_REGISTRY_BOUND_FIXTURES_INVALID",
    "input-fixture-ledger.json.prepared-registry-bounds",
    "Revision-8 replacement, one-ready capacity, zero-overlap replacement, and safe-integer exhaustion fixtures must remain exact.",
    findings,
  );

  const preparationBranchProjection = (
    fixtureId: string,
  ): JsonObject | null => {
    const fixture = inputFixtureById.get(fixtureId);
    if (fixture === undefined) return null;
    return {
      requestFixtureId: fixture["requestFixtureId"] ?? null,
      registryBefore: fixture["registryBefore"] ?? null,
      pendingIdentity: fixture["pendingIdentity"] ?? null,
      orderedCalls: fixture["orderedCalls"] ?? null,
      value: fixture["value"] ?? null,
      existingEntryPreserved: fixture["existingEntryPreserved"] ?? null,
      pendingEntryPreserved: fixture["pendingEntryPreserved"] ?? null,
      differentIdentityDoesNotSupersedeInflightPreparation:
        fixture["differentIdentityDoesNotSupersedeInflightPreparation"] ?? null,
      newPreparationIdsAllocated: fixture["newPreparationIdsAllocated"] ?? null,
      newEncoderCalls: fixture["newEncoderCalls"] ?? null,
      lastAllocatedPreparationId: fixture["lastAllocatedPreparationId"] ?? null,
      nextPreparationIdWouldExceed:
        fixture["nextPreparationIdWouldExceed"] ?? null,
      counterWrapped: fixture["counterWrapped"] ?? null,
      encoderCalls: fixture["encoderCalls"] ?? null,
      livePrivateByteArrays: fixture["livePrivateByteArrays"] ?? null,
      preparedArtifactPublishedToRegistry:
        fixture["preparedArtifactPublishedToRegistry"] ?? null,
      terminalRegistryOperation: fixture["terminalRegistryOperation"] ?? null,
      privateBytesZeroed: fixture["privateBytesZeroed"] ?? null,
      expectedRegistryState: fixture["expectedRegistryState"] ?? null,
      dependencyFaultFixtureId: fixture["dependencyFaultFixtureId"] ?? null,
    };
  };
  const preparationProjectionDefaults = (
    overrides: JsonObject,
  ): JsonObject => ({
    requestFixtureId: null,
    registryBefore: null,
    pendingIdentity: null,
    orderedCalls: null,
    value: null,
    existingEntryPreserved: null,
    pendingEntryPreserved: null,
    differentIdentityDoesNotSupersedeInflightPreparation: null,
    newPreparationIdsAllocated: null,
    newEncoderCalls: null,
    lastAllocatedPreparationId: null,
    nextPreparationIdWouldExceed: null,
    counterWrapped: null,
    encoderCalls: null,
    livePrivateByteArrays: null,
    preparedArtifactPublishedToRegistry: null,
    terminalRegistryOperation: null,
    privateBytesZeroed: null,
    expectedRegistryState: null,
    dependencyFaultFixtureId: null,
    ...overrides,
  });
  const busyValue = {
    ok: false,
    outcome: "preparation-unavailable",
    code: "export.preparation_busy",
  };
  const expectedPreparationBranches: Readonly<Record<string, JsonObject>> = {
    "canonical-export-preparation-result:busy-preparing":
      preparationProjectionDefaults({
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        registryBefore: "preparing",
        pendingIdentity: {
          preparationId: 1,
          generation: 1,
          documentId: "document-e0-minimal",
          revision: 7,
        },
        value: busyValue,
        pendingEntryPreserved: true,
        newPreparationIdsAllocated: 0,
        newEncoderCalls: 0,
      }),
    "canonical-export-preparation-result:busy-preparing-different-identity":
      preparationProjectionDefaults({
        requestFixtureId: "canonical-export-preparation-request:revision-8",
        registryBefore: "preparing",
        pendingIdentity: {
          preparationId: 1,
          generation: 1,
          documentId: "document-e0-minimal",
          revision: 7,
        },
        value: busyValue,
        pendingEntryPreserved: true,
        differentIdentityDoesNotSupersedeInflightPreparation: true,
        newPreparationIdsAllocated: 0,
        newEncoderCalls: 0,
      }),
    "canonical-export-preparation-result:busy-delivering":
      preparationProjectionDefaults({
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        registryBefore: "delivering",
        value: busyValue,
        existingEntryPreserved: true,
        newEncoderCalls: 0,
      }),
    "canonical-export-preparation-result:sequence-exhausted":
      preparationProjectionDefaults({
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        value: {
          ok: false,
          outcome: "preparation-unavailable",
          code: "export.preparation_sequence_exhausted",
        },
        lastAllocatedPreparationId: 9_007_199_254_740_991,
        nextPreparationIdWouldExceed: 9_007_199_254_740_991,
        counterWrapped: false,
        encoderCalls: 0,
        livePrivateByteArrays: 0,
      }),
    "canonical-export-preparation-result:stale": preparationProjectionDefaults({
      requestFixtureId: "canonical-export-preparation-request:revision-7",
      orderedCalls: [
        "prepareCanonicalJsonExport:revision-7",
        "a0-state-identity:revision-8",
      ],
      value: {
        ok: false,
        outcome: "preparation-stale",
        code: "export.prepared_canonical_stale",
      },
      preparedArtifactPublishedToRegistry: false,
      terminalRegistryOperation: {
        operation: "abandonPreparation",
        preparationId: 1,
        outcome: "abandoned",
      },
      privateBytesZeroed: true,
      expectedRegistryState: "empty",
    }),
    "canonical-export-preparation-result:artifact-protocol-invalid":
      preparationProjectionDefaults({
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        value: {
          ok: false,
          outcome: "preparation-protocol-invalid",
          code: "export.prepared_canonical_artifact_invalid",
          protocolDiagnostic: {
            boundary: "canonical-export-preparation",
            reason: "invalid-envelope-or-binding",
            rawResultRetained: false,
          },
          configurationDisposition: "release-gate-failed",
        },
        terminalRegistryOperation: {
          operation: "abandonPreparation",
          preparationId: 1,
          outcome: "abandoned",
        },
        expectedRegistryState: "empty",
        livePrivateByteArrays: 0,
        dependencyFaultFixtureId:
          "canonical-export-preparation:artifact-protocol-invalid",
      }),
    "canonical-export-preparation-result:state-identity-protocol-invalid":
      preparationProjectionDefaults({
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        value: {
          ok: false,
          outcome: "state-identity-protocol-invalid",
          code: "export.application_state_identity_invalid",
          protocolDiagnostic: {
            boundary: "A0-state-identity",
            reason: "invalid-envelope-or-binding",
            rawResultRetained: false,
          },
          configurationDisposition: "release-gate-failed",
        },
        terminalRegistryOperation: {
          operation: "abandonPreparation",
          preparationId: 1,
          outcome: "abandoned",
        },
        expectedRegistryState: "empty",
        livePrivateByteArrays: 0,
        dependencyFaultFixtureId: "a0-state-identity:protocol-invalid",
      }),
  };
  for (const [fixtureId, expected] of Object.entries(
    expectedPreparationBranches,
  )) {
    requireExact(
      preparationBranchProjection(fixtureId),
      expected,
      "E0_MARKER_PREPARATION_BRANCH_INVALID",
      fixtureId,
      "Preparation busy, exhaustion, stale, and protocol-invalid branches must settle the single-flight registry exactly.",
      findings,
    );
  }
  requireExact(
    Object.keys(expectedPreparationBranches).map((fixtureId) =>
      inputFixtureById.get(fixtureId),
    ),
    [
      {
        id: "canonical-export-preparation-result:busy-preparing",
        kind: "adapter-result",
        operation: "prepareCanonicalExportDelivery",
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        registryBefore: "preparing",
        pendingIdentity: {
          preparationId: 1,
          generation: 1,
          documentId: "document-e0-minimal",
          revision: 7,
        },
        value: busyValue,
        pendingEntryPreserved: true,
        newPreparationIdsAllocated: 0,
        newEncoderCalls: 0,
      },
      {
        id: "canonical-export-preparation-result:busy-preparing-different-identity",
        kind: "adapter-result",
        operation: "prepareCanonicalExportDelivery",
        requestFixtureId: "canonical-export-preparation-request:revision-8",
        registryBefore: "preparing",
        pendingIdentity: {
          preparationId: 1,
          generation: 1,
          documentId: "document-e0-minimal",
          revision: 7,
        },
        value: busyValue,
        pendingEntryPreserved: true,
        newPreparationIdsAllocated: 0,
        newEncoderCalls: 0,
        differentIdentityDoesNotSupersedeInflightPreparation: true,
      },
      {
        id: "canonical-export-preparation-result:busy-delivering",
        kind: "adapter-result",
        operation: "prepareCanonicalExportDelivery",
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        registryBefore: "delivering",
        value: busyValue,
        existingEntryPreserved: true,
        newEncoderCalls: 0,
      },
      {
        id: "canonical-export-preparation-result:sequence-exhausted",
        kind: "adapter-result",
        operation: "prepareCanonicalExportDelivery",
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        lastAllocatedPreparationId: 9_007_199_254_740_991,
        nextPreparationIdWouldExceed: 9_007_199_254_740_991,
        value: {
          ok: false,
          outcome: "preparation-unavailable",
          code: "export.preparation_sequence_exhausted",
        },
        counterWrapped: false,
        encoderCalls: 0,
        livePrivateByteArrays: 0,
      },
      {
        id: "canonical-export-preparation-result:stale",
        kind: "adapter-result",
        operation: "prepareCanonicalExportDelivery",
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        orderedCalls: [
          "prepareCanonicalJsonExport:revision-7",
          "a0-state-identity:revision-8",
        ],
        value: {
          ok: false,
          outcome: "preparation-stale",
          code: "export.prepared_canonical_stale",
        },
        preparedArtifactPublishedToRegistry: false,
        terminalRegistryOperation: {
          operation: "abandonPreparation",
          preparationId: 1,
          outcome: "abandoned",
        },
        privateBytesZeroed: true,
        expectedRegistryState: "empty",
      },
      {
        id: "canonical-export-preparation-result:artifact-protocol-invalid",
        kind: "adapter-result",
        operation: "prepareCanonicalExportDelivery",
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        dependencyFaultFixtureId:
          "canonical-export-preparation:artifact-protocol-invalid",
        value: {
          ok: false,
          outcome: "preparation-protocol-invalid",
          code: "export.prepared_canonical_artifact_invalid",
          protocolDiagnostic: {
            boundary: "canonical-export-preparation",
            reason: "invalid-envelope-or-binding",
            rawResultRetained: false,
          },
          configurationDisposition: "release-gate-failed",
        },
        terminalRegistryOperation: {
          operation: "abandonPreparation",
          preparationId: 1,
          outcome: "abandoned",
        },
        expectedRegistryState: "empty",
        livePrivateByteArrays: 0,
      },
      {
        id: "canonical-export-preparation-result:state-identity-protocol-invalid",
        kind: "adapter-result",
        operation: "prepareCanonicalExportDelivery",
        requestFixtureId: "canonical-export-preparation-request:revision-7",
        dependencyFaultFixtureId: "a0-state-identity:protocol-invalid",
        value: {
          ok: false,
          outcome: "state-identity-protocol-invalid",
          code: "export.application_state_identity_invalid",
          protocolDiagnostic: {
            boundary: "A0-state-identity",
            reason: "invalid-envelope-or-binding",
            rawResultRetained: false,
          },
          configurationDisposition: "release-gate-failed",
        },
        terminalRegistryOperation: {
          operation: "abandonPreparation",
          preparationId: 1,
          outcome: "abandoned",
        },
        expectedRegistryState: "empty",
        livePrivateByteArrays: 0,
      },
    ],
    "E0_MARKER_PREPARATION_BRANCH_WHOLE_FIXTURE_INVALID",
    "input-fixture-ledger.json.canonical-export-preparation-result:*",
    "Every nonprepared preparation branch must be an exact public result with no artifact, bytes, state, or unlisted private fields.",
    findings,
  );

  const expectedStateIdentityFixtures: Readonly<Record<string, JsonObject>> = {
    "a0-state-identity:revision-7": {
      id: "a0-state-identity:revision-7",
      kind: "adapter-result",
      operation: "readCurrentApplicationDocumentIdentity",
      call: 1,
      return: { documentId: "document-e0-minimal", revision: 7 },
    },
    "a0-state-identity:revision-8": {
      id: "a0-state-identity:revision-8",
      kind: "adapter-result",
      operation: "readCurrentApplicationDocumentIdentity",
      call: 1,
      return: { documentId: "document-e0-minimal", revision: 8 },
    },
    "a0-state-identity:protocol-invalid": {
      id: "a0-state-identity:protocol-invalid",
      kind: "dependency-fault",
      override: {
        operation: "readCurrentApplicationDocumentIdentity",
        call: 1,
        return: { documentId: "document-e0-minimal", revision: "7" },
      },
      expectedCode: "export.application_state_identity_invalid",
      expectedProtocolDiagnostic: {
        boundary: "A0-state-identity",
        reason: "invalid-envelope-or-binding",
        rawResultRetained: false,
      },
      expectedConfigurationDisposition: "release-gate-failed",
    },
    "a0-state-identity:synchronous-throw": {
      id: "a0-state-identity:synchronous-throw",
      kind: "dependency-fault",
      override: {
        operation: "readCurrentApplicationDocumentIdentity",
        call: 1,
        exception: {
          kind: "synchronous-throw",
          rawValuePresent: false,
        },
      },
      expectedCode: "export.application_state_identity_invalid",
      expectedProtocolDiagnostic: {
        boundary: "A0-state-identity",
        reason: "threw-or-rejected",
        rawResultRetained: false,
      },
      expectedConfigurationDisposition: "release-gate-failed",
    },
  };
  for (const [fixtureId, expected] of Object.entries(
    expectedStateIdentityFixtures,
  )) {
    requireMarkerFixture(
      fixtureId,
      expected,
      "E0_MARKER_STATE_IDENTITY_FIXTURE_INVALID",
      "Current document identity must be synchronous, strict, state-free, and normalize malformed or thrown values without raw retention.",
    );
  }

  const publicMarkerRequests: Readonly<Record<string, JsonObject>> = {
    "marker-settlement-request:accepted": {
      stateFixtureId: "state:marker-current-revision-7",
      preparationId: 1,
      deliveryPreference: "prefer-file-system-access",
    },
    "marker-settlement-request:blob-handed-off": {
      stateFixtureId: "state:marker-current-revision-7",
      preparationId: 1,
      deliveryPreference: "download-only",
    },
    "marker-settlement-request:cancelled": {
      stateFixtureId: "state:marker-current-revision-7",
      preparationId: 1,
      deliveryPreference: "prefer-file-system-access",
    },
    "marker-settlement-request:failed": {
      stateFixtureId: "state:marker-current-revision-7",
      preparationId: 1,
      deliveryPreference: "prefer-file-system-access",
    },
    "marker-settlement-request:binding-mismatch": {
      stateFixtureId: "state:marker-current-revision-7",
      preparationId: 1,
      deliveryPreference: "prefer-file-system-access",
    },
  };
  for (const [fixtureId, value] of Object.entries(publicMarkerRequests)) {
    requireMarkerFixture(
      fixtureId,
      {
        id: fixtureId,
        kind: "adapter-input",
        operation: "completeCanonicalExportMarkerSettlement",
        value,
      },
      "E0_MARKER_PUBLIC_REQUEST_INVALID",
      "Public marker settlement accepts only state, preparation locator, and delivery preference.",
    );
  }
  requireMarkerFixture(
    "marker-settlement-request:stale-revision",
    {
      id: "marker-settlement-request:stale-revision",
      kind: "adapter-input",
      operation: "completeCanonicalExportMarkerSettlement",
      value: {
        stateFixtureId: "state:marker-current-revision-7",
        preparationId: 1,
        deliveryPreference: "prefer-file-system-access",
      },
      scenario: "revision-advances-to-8-after-picker-opens-before-A0-CAS",
    },
    "E0_MARKER_PUBLIC_REQUEST_INVALID",
    "The stale-revision public request must still carry only click-time state, locator, and preference.",
  );
  requireMarkerFixture(
    "marker-settlement-stage-request:accepted",
    {
      id: "marker-settlement-stage-request:accepted",
      kind: "adapter-input",
      visibility: "internal-only",
      operation: "settleCanonicalExportMarker",
      derivedFromPublicRequestFixtureId: "marker-settlement-request:accepted",
      value: {
        baseDocumentId: "document-e0-minimal",
        baseRevision: 7,
        deliveryFixtureId: "delivery:canonical-fsa-completed",
        candidateFixtureId: "marker-candidate:derived-accepted",
      },
      exactValueFields: [
        "baseDocumentId",
        "baseRevision",
        "delivery",
        "candidate",
      ],
      forbiddenValueFields: [
        "state",
        "previousMarker",
        "preparationId",
        "deliveryPreference",
      ],
    },
    "E0_MARKER_INTERNAL_STAGE_REQUEST_INVALID",
    "Only the private coordinator derives delivery and candidate evidence after successful delivery.",
  );

  requireMarkerFixture(
    "marker-public-request-authority-matrix",
    {
      id: "marker-public-request-authority-matrix",
      kind: "scenario-matrix",
      baseFixtureId: "marker-settlement-request:accepted",
      publicAllowedValueFields: [
        "stateFixtureId",
        "preparationId",
        "deliveryPreference",
      ],
      rows: [
        {
          id: "caller-supplied-delivery-lookalike",
          forbiddenField: "delivery",
          expected: "not-in-public-request-type",
        },
        {
          id: "caller-supplied-candidate-lookalike",
          forbiddenField: "candidate",
          expected: "not-in-public-request-type",
        },
        {
          id: "caller-supplied-base-document",
          forbiddenField: "baseDocumentId",
          expected: "not-in-public-request-type",
        },
        {
          id: "caller-supplied-base-revision",
          forbiddenField: "baseRevision",
          expected: "not-in-public-request-type",
        },
        {
          id: "caller-supplied-user-gesture",
          forbiddenField: "userGesture",
          expected:
            "transient-activation-observed-only-by-bound-browser-adapter",
        },
        {
          id: "caller-supplied-previous-marker",
          forbiddenField: "previousMarker",
          expected: "A0-state-is-the-only-marker-publication-authority",
        },
        {
          id: "caller-supplied-prepared-artifact",
          forbiddenField: "artifact",
          expected: "private-one-slot-registry-only",
        },
        {
          id: "caller-supplied-prepared-bytes",
          forbiddenField: "privateBytes",
          expected: "private-one-slot-registry-only",
        },
        {
          id: "caller-supplied-prepared-registry",
          forbiddenField: "preparedRegistry",
          expected: "allocated-by-E0-composition-root",
        },
        {
          id: "caller-supplied-clock",
          forbiddenField: "readExportTimestamp",
          expected: "bound-once-at-composition",
        },
        {
          id: "caller-supplied-encoder",
          forbiddenField: "prepareCanonicalJsonExport",
          expected: "bound-once-at-composition",
        },
        {
          id: "caller-supplied-delivery-adapter",
          forbiddenField: "startPreparedExportDelivery",
          expected: "bound-once-at-composition",
        },
        {
          id: "replayed-internal-stage-request",
          forbiddenField: "settlementRequest",
          expected: "internal-coordinator-not-publicly-callable",
        },
      ],
      expected: {
        rows: 13,
        everyAuthorityInjectionRejectedStructurally: true,
        internalCandidateDerivedAfterSuccessfulDelivery: true,
        internalStageRequestReplayableFromPublicSurface: false,
        uiCanConstructDeliveryOrCandidateEvidence: false,
        uiCanAccessPrivatePreparedBytesOrRegistry: false,
      },
      sourcePolicyAssertions: [
        "only-the-application-composition-root-binds-orchestration-dependencies",
        "no-UI-or-public-callsite-imports-the-internal-settlement-coordinator",
        "no-public-operation-accepts-a-caller-supplied-artifact-delivery-or-marker-candidate",
        "public-preparation-binding-is-non-authoritative-metadata-only",
      ],
    },
    "E0_MARKER_PUBLIC_AUTHORITY_MATRIX_INVALID",
    "The authority matrix must reject every caller-supplied delivery, candidate, browser, clock, encoder, and registry authority.",
  );

  requireExact(
    {
      fixture: inputFixtureById.get("activation-probe:false"),
      case: caseById.get("E0-AD-004"),
    },
    {
      fixture: {
        id: "activation-probe:false",
        kind: "parameter",
        value: {
          boundBrowserActivationProbe: false,
          callerContextLookalike: { userGesture: true },
        },
        expected: {
          callerClaimTrusted: false,
          code: "export.delivery_user_gesture_required",
          pickerCalls: 0,
          anchorCalls: 0,
          markerActions: 0,
        },
      },
      case: {
        id: "E0-AD-004",
        authorityIds: ["E0-AUTH-FSA", "E0-AUTH-WHATWG-DOWNLOAD"],
        traceIds: ["E0-TRACE-USER-GESTURE"],
        proofKinds: ["negative", "adapter"],
        inputFixtureIds: ["activation-probe:false"],
        resultCategory: "DOWNLOAD_FAILED_CLEAN",
        failureStage: "delivery",
        expectedIssueCodes: ["export.delivery_user_gesture_required"],
        expectedRelation:
          "caller-context-lookalike-claims-activation-but-the-bound-browser-probe-is-false-so-no-picker-anchor-or-marker-action-occurs",
        stateEffect: "NONE",
        markerEffect: "UNCHANGED",
        exactStageCounts: {
          picker: 0,
          blob: 0,
          anchorCreate: 0,
          objectUrlCreate: 0,
        },
        terminationReason: "request-refused-before-adapter",
        expectedMutationKills: ["E0-MUT-049"],
      },
    },
    "E0_MARKER_BOUND_ACTIVATION_AUTHORITY_INVALID",
    "E0-AD-004/activation-probe:false",
    "A caller userGesture lookalike must never override a false browser-bound activation probe or start picker, anchor, or marker work.",
    findings,
  );

  const markerSatelliteFixtureIds = [
    "delivery:missing-activation-failed",
    "delivery:cleanup-failed-representative",
    "clock:canonical-export-timestamp-invalid",
    "clock:canonical-export-timestamp-throw",
    "marker-settlement-request:fabricated-preparation-id",
    "marker-settlement-request:consumed-preparation-replay",
    "marker-settlement-request:double-click-sequence",
    "prepared-canonical-export:mutated-public-readiness",
    "marker-settlement-request:missing-activation",
    "marker-settlement-request:prepared-unavailable",
    "marker-settlement-request:state-edit-invalidates",
    "marker-settlement-request:stale-document",
    "prepared-delivery-start:missing-activation",
    "prepared-canonical-export-request-lifecycle-near-misses",
  ] as const;
  requireExact(
    markerSatelliteFixtureIds.map((fixtureId) =>
      inputFixtureById.get(fixtureId),
    ),
    [
      {
        id: "delivery:missing-activation-failed",
        kind: "delivery-result",
        value: {
          ok: false,
          outcome: "failed",
          channel: null,
          code: "export.delivery_user_gesture_required",
          cleanup: "complete",
          objectUrlsCreated: 0,
          objectUrlsRevoked: 0,
          outstandingOwnedResources: 0,
          artifact: {
            sharedBase: "canonical-artifact-binding",
          },
        },
      },
      {
        id: "delivery:cleanup-failed-representative",
        kind: "delivery-result",
        sourceMatrixFixtureId: "delivery-cleanup-failure-matrix",
        sourceRowId: "fsa-close-then-abort-cleanup-failures",
        value: {
          ok: false,
          outcome: "cleanup-failed",
          channel: "file-system-access",
          code: "export.delivery_cleanup_failed",
          artifact: null,
          cleanup: "reconciliation-required",
          cleanupFailureKinds: [
            "writer-close",
            "writer-abort",
            "handle-release",
          ],
          objectUrlsCreated: 0,
          objectUrlsRevoked: 0,
          outstandingOwnedResources: 2,
        },
      },
      {
        id: "clock:canonical-export-timestamp-invalid",
        kind: "adapter-result",
        operation: "readExportTimestamp",
        call: 1,
        return: "2026-07-18T00:00:00Z",
        validation: {
          exactCodeUnitLength: 20,
          utcCalendarRoundTrip: false,
          accepted: false,
        },
        expectedCode: "export.marker_timestamp_invalid",
        rawResultRetained: false,
      },
      {
        id: "clock:canonical-export-timestamp-throw",
        kind: "dependency-fault",
        override: {
          operation: "readExportTimestamp",
          call: 1,
          exception: {
            kind: "synchronous-throw",
            rawValuePresent: false,
          },
        },
        expectedCode: "export.marker_timestamp_invalid",
        expectedProtocolDiagnostic: {
          boundary: "application-clock",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        },
        expectedConfigurationDisposition: "release-gate-failed",
      },
      {
        id: "marker-settlement-request:fabricated-preparation-id",
        kind: "adapter-input",
        operation: "completeCanonicalExportMarkerSettlement",
        base: {
          fixtureId: "marker-settlement-request:accepted",
        },
        nearMissFrom: "marker-settlement-request:accepted",
        onlyDifferentPath: ["preparationId"],
        orderedMutations: [
          {
            operation: "set",
            path: ["preparationId"],
            from: 1,
            to: 999,
          },
        ],
      },
      {
        id: "marker-settlement-request:consumed-preparation-replay",
        kind: "adapter-input",
        operation: "completeCanonicalExportMarkerSettlement",
        base: {
          fixtureId: "marker-settlement-request:accepted",
        },
        nearMissFrom: "marker-settlement-request:accepted",
        scenario: "same-preparationId-after-first-attempt-consumed",
        expectedRegistryOutcome: "unavailable",
      },
      {
        id: "marker-settlement-request:double-click-sequence",
        kind: "scenario-sequence",
        startingPrivateFixtureId:
          "prepared-canonical-export-delivery:revision-7",
        steps: [
          {
            call: 1,
            requestFixtureId: "marker-settlement-request:accepted",
            latestIdentityFixtureId: "a0-state-identity:revision-7",
            takeOutcome: "taken",
            registryStateAfterTake: "delivering",
            terminalResultFixtureId:
              "marker-settlement-result:advanced-persisted",
            registryStateAfterSettlement: "empty",
          },
          {
            call: 2,
            requestFixtureId:
              "marker-settlement-request:consumed-preparation-replay",
            latestIdentityFixtureId: "a0-state-identity:revision-7",
            takeOutcome: "unavailable",
            terminalResultFixtureId:
              "marker-settlement-result:prepared-export-unavailable",
            registryStateAfterSettlement: "empty",
          },
        ],
        exactTotals: {
          latestIdentityReads: 2,
          registryTakes: 2,
          successfulConsumes: 1,
          browserStarts: 1,
          a0PublicationCalls: 1,
          a1PersistenceCalls: 1,
          privateByteExposures: 0,
          liveRegistryEntries: 0,
        },
        retryRequiresReprepare: true,
      },
      {
        id: "prepared-canonical-export:mutated-public-readiness",
        kind: "scenario-parameter",
        operation: "attempt-public-binding-mutation",
        base: {
          fixtureId: "marker-settlement-request:accepted",
        },
        nearMissFrom: "marker-settlement-request:accepted",
        attemptedLookalikeMutation: {
          filename: "Forged.changes.json",
          byteLength: 1,
          semanticDocumentHash:
            "0000000000000000000000000000000000000000000000000000000000000000",
        },
        expectedPrivateRegistryMutation: "none",
      },
      {
        id: "marker-settlement-request:missing-activation",
        kind: "adapter-input",
        operation: "completeCanonicalExportMarkerSettlement",
        base: {
          fixtureId: "marker-settlement-request:accepted",
        },
        nearMissFrom: "marker-settlement-request:accepted",
        boundBrowserActivationProbe: false,
        expectedCode: "export.delivery_user_gesture_required",
      },
      {
        id: "marker-settlement-request:prepared-unavailable",
        kind: "adapter-input",
        operation: "completeCanonicalExportMarkerSettlement",
        base: {
          fixtureId: "marker-settlement-request:accepted",
        },
        nearMissFrom: "marker-settlement-request:accepted",
        onlyDifferentPath: ["preparationId"],
        orderedMutations: [
          {
            operation: "set",
            path: ["preparationId"],
            from: 1,
            to: 777,
          },
        ],
      },
      {
        id: "marker-settlement-request:state-edit-invalidates",
        kind: "adapter-input",
        operation: "completeCanonicalExportMarkerSettlement",
        base: {
          fixtureId: "marker-settlement-request:accepted",
        },
        onlyDifferentPath: ["stateFixtureId"],
        orderedMutations: [
          {
            operation: "set",
            path: ["stateFixtureId"],
            from: "state:marker-current-revision-7",
            to: "state:marker-current-revision-8",
          },
        ],
      },
      {
        id: "marker-settlement-request:stale-document",
        kind: "adapter-input",
        operation: "completeCanonicalExportMarkerSettlement",
        base: {
          fixtureId: "marker-settlement-request:accepted",
        },
        scenario:
          "document-changes-after-bound-artifact-delivery-before-internal-settlement",
      },
      {
        id: "prepared-delivery-start:missing-activation",
        kind: "adapter-result",
        operation: "startPreparedExportDelivery",
        requestFixtureId: "marker-settlement-request:missing-activation",
        events: [
          "latest-identity-read:revision-7",
          "registry.take",
          "activation-probe:false",
          "return-start-envelope",
          "finishDelivery:preparationId-1",
        ],
        return: {
          completion: {
            resolvedFixtureId: "delivery:missing-activation-failed",
          },
        },
        exactCalls: {
          picker: 0,
          blob: 0,
          objectUrl: 0,
          anchor: 0,
          a0Publication: 0,
          a1Persistence: 0,
        },
      },
      {
        id: "prepared-canonical-export-request-lifecycle-near-misses",
        kind: "scenario-matrix",
        baseRequestFixtureId: "marker-settlement-request:accepted",
        rows: [
          {
            id: "fabricated-preparation-id",
            requestFixtureId:
              "marker-settlement-request:fabricated-preparation-id",
            expectedOutcome: "prepared-export-unavailable",
            browserStarts: 0,
          },
          {
            id: "state-edit-invalidates-entry",
            requestFixtureId:
              "marker-settlement-request:state-edit-invalidates",
            expectedOutcome: "prepared-export-stale",
            browserStarts: 0,
          },
          {
            id: "consumed-preparation-replay",
            requestFixtureId:
              "marker-settlement-request:consumed-preparation-replay",
            expectedOutcome: "prepared-export-unavailable",
            browserStarts: 0,
          },
          {
            id: "double-click-consumes-only-once",
            requestFixtureId: "marker-settlement-request:double-click-sequence",
            expectedFirstOutcome: "advanced",
            expectedSecondOutcome: "prepared-export-unavailable",
            browserStarts: 1,
          },
          {
            id: "public-binding-mutation-has-no-private-effect",
            requestFixtureId:
              "prepared-canonical-export:mutated-public-readiness",
            expectedPrivateRegistryMutation: "none",
            expectedPrivateBytesExposed: false,
          },
          {
            id: "missing-activation-consumes-entry",
            requestFixtureId: "marker-settlement-request:missing-activation",
            expectedOutcome: "unchanged-failed",
            browserStarts: 0,
            retryRequiresReprepare: true,
          },
        ],
        expected: {
          rows: 6,
          publicAuthorityFields: [
            "state",
            "preparationId",
            "deliveryPreference",
          ],
          privateRegistryEntriesAtMost: 1,
          privateBytesEverReturnedPublicly: false,
          replayCanStartSecondBrowserDelivery: false,
          nonSuccessA0PublicationCalls: 0,
          nonSuccessA1PersistenceCalls: 0,
        },
      },
    ],
    "E0_MARKER_SATELLITE_FIXTURES_INVALID",
    "input-fixture-ledger.json.marker-satellites",
    "Derived public locators, lifecycle proof, missing activation, strict clock faults, and representative cleanup evidence must be bound by exact contents rather than IDs alone.",
    findings,
  );
  const markerCorePayloadFixtureIds = [
    "binding:exact",
    "delivery:canonical-fsa-completed",
    "delivery:canonical-blob-handed-off",
    "delivery:cancelled",
    "delivery:failed",
    "delivery:text-handed-off",
    "marker:accepted",
    "marker-candidate:derived-accepted",
    "marker-candidate:derived-accepted-blob",
    "marker-settlement-stage-request:blob-handed-off",
    "marker-settlement-stage-request:binding-mismatch",
    "marker-settlement-stage-request:stale-revision",
    "marker-settlement-stage-request:wrong-base-document",
    "marker-settlement-stage-request:wrong-base-revision",
    "marker-settlement-stage-request:stale-document",
    "marker-settlement-stage-request:edit-during-picker",
  ] as const;
  requireExact(
    markerCorePayloadFixtureIds.map((fixtureId) =>
      inputFixtureById.get(fixtureId),
    ),
    [
      {
        id: "binding:exact",
        kind: "artifact-binding",
        value: {
          sharedBase: "canonical-artifact-binding",
        },
      },
      {
        id: "delivery:canonical-fsa-completed",
        kind: "delivery-result",
        value: {
          ok: true,
          outcome: "completed",
          channel: "file-system-access",
          bytesOffered: 352,
          cleanup: "complete",
          objectUrlsCreated: 0,
          objectUrlsRevoked: 0,
          outstandingOwnedResources: 0,
          artifact: {
            sharedBase: "canonical-artifact-binding",
          },
        },
      },
      {
        id: "delivery:canonical-blob-handed-off",
        kind: "delivery-result",
        value: {
          ok: true,
          outcome: "handed-off",
          channel: "object-url-download",
          bytesOffered: 352,
          cleanup: "complete",
          objectUrlsCreated: 1,
          objectUrlsRevoked: 1,
          outstandingOwnedResources: 0,
          artifact: {
            sharedBase: "canonical-artifact-binding",
          },
        },
      },
      {
        id: "delivery:cancelled",
        kind: "delivery-result",
        value: {
          ok: true,
          outcome: "cancelled",
          channel: "file-system-access",
          cleanup: "complete",
          objectUrlsCreated: 0,
          objectUrlsRevoked: 0,
          outstandingOwnedResources: 0,
          artifact: {
            sharedBase: "canonical-artifact-binding",
          },
        },
      },
      {
        id: "delivery:failed",
        kind: "delivery-result",
        value: {
          ok: false,
          outcome: "failed",
          channel: "file-system-access",
          code: "export.delivery_write_failed",
          cleanup: "complete",
          objectUrlsCreated: 0,
          objectUrlsRevoked: 0,
          outstandingOwnedResources: 0,
          artifact: {
            sharedBase: "canonical-artifact-binding",
          },
        },
      },
      {
        id: "delivery:text-handed-off",
        kind: "delivery-result",
        value: {
          ok: true,
          outcome: "handed-off",
          channel: "object-url-download",
          bytesOffered: 60,
          cleanup: "complete",
          objectUrlsCreated: 1,
          objectUrlsRevoked: 1,
          outstandingOwnedResources: 0,
          artifact: {
            kind: "lead-sheet-text",
            sourceDocumentId: "document-e0-minimal",
            filename: "Changes.changes.txt",
            byteLength: 60,
            semanticDocumentHash: null,
          },
        },
      },
      {
        id: "marker:accepted",
        kind: "export-marker-state",
        value: {
          documentId: "document-e0-minimal",
          revision: 7,
          exportedAt: "2026-07-18T00:00:00.000Z",
          semanticDocumentHash:
            "c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5",
          canonicalPolicyVersion: 1,
          semanticHashPolicyVersion: 1,
        },
      },
      {
        id: "marker-candidate:derived-accepted",
        kind: "marker-settlement-parameter",
        orderedAfterFixtureIds: [
          "delivery:canonical-fsa-completed",
          "clock:canonical-export-timestamp-valid",
        ],
        derivationSources: {
          artifactFixtureId: "delivery:canonical-fsa-completed",
          preparedBindingFixtureId:
            "prepared-canonical-export-delivery:revision-7",
          timestampFixtureId: "clock:canonical-export-timestamp-valid",
          canonicalPolicyVersion: 1,
          semanticHashPolicyVersion: 1,
        },
        value: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
        assertions: [
          "derived-only-after-successful-bound-canonical-delivery",
          "document-hash-byte-length-and-filename-come-only-from-the-exact-artifact",
          "revision-comes-only-from-the-consumed-private-preparation-identity",
          "timestamp-comes-only-from-the-validated-bound-clock",
          "no-public-request-field-can-supply-or-override-the-candidate",
        ],
      },
      {
        id: "marker-candidate:derived-accepted-blob",
        kind: "marker-settlement-parameter",
        orderedAfterFixtureIds: [
          "delivery:canonical-blob-handed-off",
          "clock:canonical-export-timestamp-valid",
        ],
        derivationSources: {
          artifactFixtureId: "delivery:canonical-blob-handed-off",
          preparedBindingFixtureId:
            "prepared-canonical-export-delivery:revision-7",
          timestampFixtureId: "clock:canonical-export-timestamp-valid",
          canonicalPolicyVersion: 1,
          semanticHashPolicyVersion: 1,
        },
        value: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
      },
      {
        id: "marker-settlement-stage-request:blob-handed-off",
        kind: "adapter-input",
        visibility: "internal-only",
        operation: "settleCanonicalExportMarker",
        derivedFromPublicRequestFixtureId:
          "marker-settlement-request:blob-handed-off",
        value: {
          baseDocumentId: "document-e0-minimal",
          baseRevision: 7,
          deliveryFixtureId: "delivery:canonical-blob-handed-off",
          candidateFixtureId: "marker-candidate:derived-accepted-blob",
        },
      },
      {
        id: "marker-settlement-stage-request:binding-mismatch",
        kind: "adapter-input",
        visibility: "internal-defensive-proof-only",
        operation: "settleCanonicalExportMarker",
        derivedFromPublicRequestFixtureId:
          "marker-settlement-request:binding-mismatch",
        value: {
          baseDocumentId: "document-e0-minimal",
          baseRevision: 7,
          deliveryFixtureId: "delivery:canonical-wrong-hash",
          candidateFixtureId: "marker-candidate:derived-accepted",
        },
      },
      {
        id: "marker-settlement-stage-request:stale-revision",
        kind: "adapter-input",
        visibility: "internal-only",
        operation: "settleCanonicalExportMarker",
        derivedFromPublicRequestFixtureId:
          "marker-settlement-request:stale-revision",
        concurrentStateChange:
          "revision-advanced-after-bound-artifact-and-candidate",
        authoritativeLatestStateFixtureId: "state:marker-current-revision-8",
        value: {
          baseDocumentId: "document-e0-minimal",
          baseRevision: 7,
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          candidateFixtureId: "marker-candidate:derived-accepted",
        },
      },
      {
        id: "marker-settlement-stage-request:wrong-base-document",
        kind: "adapter-input",
        visibility: "internal-defensive-proof-only",
        operation: "settleCanonicalExportMarker",
        base: {
          fixtureId: "marker-settlement-stage-request:accepted",
        },
        nearMissFrom: "marker-settlement-stage-request:accepted",
        onlyDifferentPath: ["baseDocumentId"],
        orderedMutations: [
          {
            operation: "set",
            path: ["baseDocumentId"],
            from: "document-e0-minimal",
            to: "document-e0-other",
          },
        ],
      },
      {
        id: "marker-settlement-stage-request:wrong-base-revision",
        kind: "adapter-input",
        visibility: "internal-defensive-proof-only",
        operation: "settleCanonicalExportMarker",
        base: {
          fixtureId: "marker-settlement-stage-request:accepted",
        },
        nearMissFrom: "marker-settlement-stage-request:accepted",
        onlyDifferentPath: ["baseRevision"],
        orderedMutations: [
          {
            operation: "set",
            path: ["baseRevision"],
            from: 7,
            to: 8,
          },
        ],
      },
      {
        id: "marker-settlement-stage-request:stale-document",
        kind: "adapter-input",
        visibility: "internal-only",
        operation: "settleCanonicalExportMarker",
        derivedFromPublicRequestFixtureId:
          "marker-settlement-request:stale-document",
        concurrentStateChange:
          "document-changed-after-bound-artifact-and-candidate",
        authoritativeLatestStateFixtureId:
          "state:marker-current-other-document-revision-7",
        value: {
          baseDocumentId: "document-e0-minimal",
          baseRevision: 7,
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          candidateFixtureId: "marker-candidate:derived-accepted",
        },
      },
      {
        id: "marker-settlement-stage-request:edit-during-picker",
        kind: "adapter-input",
        visibility: "internal-only",
        operation: "settleCanonicalExportMarker",
        derivedFromPublicRequestFixtureId:
          "marker-settlement-request:stale-revision",
        authoritativeLatestStateAtA0FixtureId:
          "state:marker-current-revision-8",
        value: {
          baseDocumentId: "document-e0-minimal",
          baseRevision: 7,
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          candidateFixtureId: "marker-candidate:derived-accepted",
        },
        assertions: {
          rev7DeliveryReceiptRetained: true,
          clickTimeStateIsPublicationAuthority: false,
          expectedA0ResultFixtureId: "a0-marker-publication:stale",
          expectedA1Calls: 0,
        },
      },
    ],
    "E0_MARKER_CORE_PAYLOAD_FIXTURES_INVALID",
    "input-fixture-ledger.json.marker-core-payloads",
    "Canonical, blob, cancel, failure, and text delivery payloads plus exact binding, marker, derived candidate, and internal stage requests must be locked by contents rather than fixture IDs.",
    findings,
  );
  const preparedRevision7 = inputFixtureById.get(
    "prepared-canonical-export-delivery:revision-7",
  );
  const preparedRevision7Identity = objectAt(preparedRevision7?.["identity"]);
  const preparedRevision7PublicBinding = objectAt(
    objectAt(
      inputFixtureById.get(
        "canonical-export-preparation-result:prepared-revision-7",
      )?.["value"],
    )?.["binding"],
  );
  const completedFsaDelivery = materializeInputFixturePayload(
    "delivery:canonical-fsa-completed",
    inputFixtureById,
    sharedBases,
  );
  const completedFsaArtifact = objectAt(completedFsaDelivery?.["artifact"]);
  const canonicalArtifactBinding = {
    kind: "canonical-json",
    sourceDocumentId: "document-e0-minimal",
    filename: "Changes.changes.json",
    byteLength: 352,
    semanticDocumentHash: markerHash,
  };
  requireExact(
    [
      objectAt(
        expandSharedBaseReferences(
          { sharedBase: "canonical-artifact-binding" },
          sharedBases,
        ),
      ),
      materializeInputFixturePayload(
        "binding:exact",
        inputFixtureById,
        sharedBases,
      ),
      completedFsaArtifact,
      objectAt(
        materializeInputFixturePayload(
          "delivery:canonical-blob-handed-off",
          inputFixtureById,
          sharedBases,
        )?.["artifact"],
      ),
      objectAt(
        materializeInputFixturePayload(
          "delivery:cancelled",
          inputFixtureById,
          sharedBases,
        )?.["artifact"],
      ),
      objectAt(
        materializeInputFixturePayload(
          "delivery:failed",
          inputFixtureById,
          sharedBases,
        )?.["artifact"],
      ),
    ],
    Array.from({ length: 6 }, () => canonicalArtifactBinding),
    "E0_MARKER_CANONICAL_ARTIFACT_PRODUCT_INVALID",
    "canonical-artifact-binding",
    "The full canonical shared binding must equal every materialized success/cancel/failure artifact with no extra fields.",
    findings,
  );
  requireExact(
    {
      kind: acceptedA1Handoff.artifact.kind,
      sourceDocumentId: acceptedA1Handoff.artifact.sourceDocumentId,
      filename: acceptedA1Handoff.artifact.filename,
      byteLength: acceptedA1Handoff.artifact.byteLength,
      semanticDocumentHash: acceptedA1Handoff.artifact.semanticDocumentHash,
    },
    canonicalArtifactBinding,
    "E0_MARKER_CANONICAL_ARTIFACT_PRODUCT_INVALID",
    "a1-marker-persistence-handoff:accepted.artifact",
    "A1 persistence artifact identity must equal the exact materialized delivered canonical artifact.",
    findings,
  );
  const validClock = inputFixtureById.get(
    "clock:canonical-export-timestamp-valid",
  );
  const candidateProduct =
    preparedRevision7Identity === null ||
    preparedRevision7PublicBinding === null ||
    completedFsaArtifact === null ||
    typeof validClock?.["return"] !== "string"
      ? null
      : {
          artifactKind: completedFsaArtifact["kind"],
          sourceDocumentId: completedFsaArtifact["sourceDocumentId"],
          revision: preparedRevision7Identity["revision"],
          exportedAt: validClock["return"],
          semanticDocumentHash: completedFsaArtifact["semanticDocumentHash"],
          byteLength: completedFsaArtifact["byteLength"],
          filename: completedFsaArtifact["filename"],
          canonicalPolicyVersion:
            preparedRevision7PublicBinding["canonicalPolicyVersion"],
          semanticHashPolicyVersion:
            preparedRevision7PublicBinding["semanticHashPolicyVersion"],
        };
  requireExact(
    [
      objectAt(
        expandSharedBaseReferences(
          { sharedBase: "canonical-marker-candidate-revision-7" },
          sharedBases,
        ),
      ),
      materializeInputFixturePayload(
        "marker-candidate:derived-accepted",
        inputFixtureById,
        sharedBases,
      ),
      materializeInputFixturePayload(
        "marker-candidate:derived-accepted-blob",
        inputFixtureById,
        sharedBases,
      ),
    ],
    [candidateProduct, candidateProduct, candidateProduct],
    "E0_MARKER_DERIVED_CANDIDATE_PRODUCT_INVALID",
    "marker-candidate:derived-accepted",
    "FSA and blob candidates must equal the exact delivered artifact plus consumed private revision, strict bound clock timestamp, and prepared policy versions with no extra fields.",
    findings,
  );
  requireExact(
    candidateProduct,
    {
      artifactKind: "canonical-json",
      sourceDocumentId: "document-e0-minimal",
      revision: 7,
      exportedAt: "2026-07-18T00:00:00.000Z",
      semanticDocumentHash: markerHash,
      byteLength: 352,
      filename: "Changes.changes.json",
      canonicalPolicyVersion: 1,
      semanticHashPolicyVersion: 1,
    },
    "E0_MARKER_DERIVED_CANDIDATE_PRODUCT_INVALID",
    "canonical-marker-candidate-revision-7",
    "The independently authored candidate product must bind the exact canonical artifact, revision, timestamp, and policy values.",
    findings,
  );
  const acceptedMarkerFromCandidate =
    candidateProduct === null
      ? null
      : {
          documentId: candidateProduct.sourceDocumentId,
          revision: candidateProduct.revision,
          exportedAt: candidateProduct.exportedAt,
          semanticDocumentHash: candidateProduct.semanticDocumentHash,
          canonicalPolicyVersion: candidateProduct.canonicalPolicyVersion,
          semanticHashPolicyVersion: candidateProduct.semanticHashPolicyVersion,
        };
  requireExact(
    acceptedMarkerFromCandidate,
    acceptedMarker,
    "E0_MARKER_DERIVED_CANDIDATE_PRODUCT_INVALID",
    "marker:accepted",
    "The accepted marker must be exactly the materialized candidate projection, with no independent timestamp, identity, hash, or policy authority.",
    findings,
  );
  const publicMarkerRequestFixtureIds = [
    ...Object.keys(publicMarkerRequests),
    "marker-settlement-request:stale-revision",
    "marker-settlement-request:fabricated-preparation-id",
    "marker-settlement-request:consumed-preparation-replay",
    "marker-settlement-request:missing-activation",
    "marker-settlement-request:prepared-unavailable",
    "marker-settlement-request:state-edit-invalidates",
    "marker-settlement-request:stale-document",
  ];
  for (const fixtureId of publicMarkerRequestFixtureIds) {
    const materialized = materializeInputFixturePayload(
      fixtureId,
      inputFixtureById,
      sharedBases,
    );
    if (
      materialized === null ||
      !sameJson(Object.keys(materialized), [
        "stateFixtureId",
        "preparationId",
        "deliveryPreference",
      ]) ||
      typeof materialized["stateFixtureId"] !== "string" ||
      !isPositiveSafeInteger(materialized["preparationId"]) ||
      !["prefer-file-system-access", "download-only"].includes(
        String(materialized["deliveryPreference"]),
      )
    ) {
      addFinding(
        findings,
        "E0_MARKER_PUBLIC_REQUEST_MATERIALIZATION_INVALID",
        fixtureId,
        "Every direct or derived public request must materialize exactly stateFixtureId, preparationId, and deliveryPreference with no injected authority.",
      );
    }
  }

  const activationTraceProjection = (fixtureId: string): JsonObject | null => {
    const fixture = inputFixtureById.get(fixtureId);
    if (fixture === undefined) return null;
    return {
      publicRequestFixtureId: fixture["publicRequestFixtureId"],
      privatePreparedFixtureId: fixture["privatePreparedFixtureId"],
      privateStartRequestFixtureId: fixture["privateStartRequestFixtureId"],
      events: fixture["events"],
      assertions: fixture["assertions"],
    };
  };
  requireExact(
    activationTraceProjection("prepared-delivery-start-trace:fsa"),
    {
      publicRequestFixtureId: "marker-settlement-request:accepted",
      privatePreparedFixtureId: "prepared-canonical-export-delivery:revision-7",
      privateStartRequestFixtureId:
        "prepared-export-delivery-request:revision-7-fsa",
      events: [
        {
          ordinal: 1,
          event: "readCurrentApplicationDocumentIdentity",
          result: { documentId: "document-e0-minimal", revision: 7 },
        },
        {
          ordinal: 2,
          event: "registry.take",
          outcome: "taken",
          stateAfter: "delivering",
        },
        {
          ordinal: 3,
          event: "navigator.userActivation.isActive",
          result: true,
        },
        { ordinal: 4, event: "showSaveFilePicker", calls: 1 },
        {
          ordinal: 5,
          event: "return-start-envelope",
          shape: { completion: "Promise<unknown>" },
        },
        { ordinal: 6, event: "first-await-or-microtask-boundary" },
      ],
      assertions: {
        latestIdentityReadPrecedesTake: true,
        takePrecedesActivationProbe: true,
        pickerInvokedBeforeFirstAwait: true,
        privateBytesTransferredExactlyOnce: true,
        publicBindingConsultedForArtifactBytes: false,
        startReturnShape: { completion: "Promise<unknown>" },
      },
    },
    "E0_MARKER_ACTIVATION_TRACE_INVALID",
    "prepared-delivery-start-trace:fsa",
    "FSA capability invocation must occur synchronously after identity, take, and activation checks but before any await.",
    findings,
  );
  requireExact(
    activationTraceProjection("prepared-delivery-start-trace:blob"),
    {
      publicRequestFixtureId: "marker-settlement-request:blob-handed-off",
      privatePreparedFixtureId: "prepared-canonical-export-delivery:revision-7",
      privateStartRequestFixtureId:
        "prepared-export-delivery-request:revision-7-blob",
      events: [
        {
          ordinal: 1,
          event: "readCurrentApplicationDocumentIdentity",
          result: { documentId: "document-e0-minimal", revision: 7 },
        },
        {
          ordinal: 2,
          event: "registry.take",
          outcome: "taken",
          stateAfter: "delivering",
        },
        {
          ordinal: 3,
          event: "navigator.userActivation.isActive",
          result: true,
        },
        { ordinal: 4, event: "Blob", calls: 1 },
        { ordinal: 5, event: "URL.createObjectURL", calls: 1 },
        { ordinal: 6, event: "anchor.click", calls: 1 },
        {
          ordinal: 7,
          event: "return-start-envelope",
          shape: { completion: "Promise<unknown>" },
        },
        { ordinal: 8, event: "first-await-or-microtask-boundary" },
      ],
      assertions: {
        latestIdentityReadPrecedesTake: true,
        takePrecedesActivationProbe: true,
        anchorInvokedBeforeFirstAwait: true,
        privateBytesTransferredExactlyOnce: true,
        startReturnShape: { completion: "Promise<unknown>" },
      },
    },
    "E0_MARKER_ACTIVATION_TRACE_INVALID",
    "prepared-delivery-start-trace:blob",
    "Blob and anchor activation work must complete synchronously before any await.",
    findings,
  );

  requireMarkerFixture(
    "clock:canonical-export-timestamp-valid",
    {
      id: "clock:canonical-export-timestamp-valid",
      kind: "adapter-result",
      operation: "readExportTimestamp",
      call: 1,
      return: "2026-07-18T00:00:00.000Z",
      validation: {
        exactCodeUnitLength: 24,
        utcCalendarRoundTrip: true,
        accepted: true,
      },
    },
    "E0_MARKER_CLOCK_VALID_FIXTURE_INVALID",
    "Accepted export time must be exact 24-code-unit canonical UTC with calendar round-trip proof.",
  );
  requireMarkerFixture(
    "clock:canonical-export-strict-rejection-matrix",
    {
      id: "clock:canonical-export-strict-rejection-matrix",
      kind: "scenario-matrix",
      operation: "readExportTimestamp",
      baseDeliveryFixtureId: "delivery:canonical-fsa-completed",
      rows: [
        {
          id: "promise-object",
          rawReturn: {
            kind: "Promise",
            resolvesTo: "2026-07-18T00:00:00.000Z",
          },
          reason: "invalid-envelope-or-binding",
        },
        {
          id: "wrong-type",
          rawReturn: 1_784_332_800_000,
          reason: "invalid-envelope-or-binding",
        },
        {
          id: "invalid-calendar-date",
          rawReturn: "2026-02-30T00:00:00.000Z",
          reason: "invalid-envelope-or-binding",
        },
        {
          id: "offset-form",
          rawReturn: "2026-07-18T00:00:00.000+00:00",
          reason: "invalid-envelope-or-binding",
        },
        {
          id: "extra-fractional-precision",
          rawReturn: "2026-07-18T00:00:00.0000Z",
          reason: "invalid-envelope-or-binding",
        },
        {
          id: "noncanonical-equivalent",
          rawReturn: "2026-07-18t00:00:00.000Z",
          reason: "invalid-envelope-or-binding",
        },
        {
          id: "synchronous-throw",
          faultFixtureId: "clock:canonical-export-timestamp-throw",
          reason: "threw-or-rejected",
        },
      ],
      expected: {
        rows: 7,
        eachOutcome: "timestamp-protocol-invalid",
        eachCode: "export.marker_timestamp_invalid",
        eachDeliveryFixtureId: "delivery:canonical-fsa-completed",
        eachBoundary: "application-clock",
        eachRawResultRetained: false,
        eachConfigurationDisposition: "release-gate-failed",
        a0PublicationCallsPerRow: 0,
        a1PersistenceCallsPerRow: 0,
        applicationReconciliationsPerRow: 0,
        registryStateAfterEach: "empty",
      },
    },
    "E0_MARKER_CLOCK_REJECTION_MATRIX_INVALID",
    "Clock validation must reject promises, wrong types, invalid dates, offsets, noncanonical precision/case, and throws without marker calls.",
  );

  const deliveryProtocolFixtureIds = [
    "prepared-delivery-start:malformed-envelope",
    "prepared-delivery-start:synchronous-throw",
    "prepared-delivery-start:unexpected-rejection",
    "prepared-delivery-start:malformed-completion-result",
  ] as const;
  requireExact(
    deliveryProtocolFixtureIds.map((fixtureId) =>
      inputFixtureById.get(fixtureId),
    ),
    [
      {
        id: "prepared-delivery-start:malformed-envelope",
        kind: "dependency-fault",
        override: {
          operation: "startPreparedExportDelivery",
          call: 1,
          return: {
            completion: "not-a-Promise",
          },
        },
        expectedCode: "export.delivery_result_invalid",
        expectedCleanupKnowledge: "unknown",
        expectedMaximumPossibleOutstandingOwnedResources: 4,
      },
      {
        id: "prepared-delivery-start:synchronous-throw",
        kind: "dependency-fault",
        override: {
          operation: "startPreparedExportDelivery",
          call: 1,
          exception: {
            kind: "synchronous-throw",
            rawValuePresent: false,
          },
        },
        expectedCode: "export.delivery_result_invalid",
        expectedCleanupKnowledge: "unknown",
        expectedMaximumPossibleOutstandingOwnedResources: 4,
        expectedRegistryState: "empty",
        expectedProtocolDiagnostic: {
          boundary: "export-delivery",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        },
      },
      {
        id: "prepared-delivery-start:unexpected-rejection",
        kind: "dependency-fault",
        override: {
          operation: "startPreparedExportDelivery",
          call: 1,
          return: {
            completion: {
              kind: "promise-rejection",
              rawValuePresent: false,
            },
          },
        },
        expectedCode: "export.delivery_result_invalid",
        expectedCleanupKnowledge: "unknown",
        expectedMaximumPossibleOutstandingOwnedResources: 4,
        expectedProtocolDiagnostic: {
          boundary: "export-delivery",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        },
      },
      {
        id: "prepared-delivery-start:malformed-completion-result",
        kind: "dependency-fault",
        override: {
          operation: "startPreparedExportDelivery",
          call: 1,
          return: {
            completion: {
              kind: "promise-resolution",
              value: {
                ok: true,
                outcome: "completed",
                channel: "file-system-access",
                bytesOffered: 352,
                cleanup: "complete",
                objectUrlsCreated: 1,
                objectUrlsRevoked: 0,
                outstandingOwnedResources: 0,
                artifact: {
                  sharedBase: "canonical-artifact-binding",
                },
              },
            },
          },
        },
        invalidFields: [
          "completion.value.objectUrlsCreated",
          "completion.value.objectUrlsRevoked",
        ],
        expectedCode: "export.delivery_result_invalid",
        expectedCleanupKnowledge: "unknown",
        expectedMaximumPossibleOutstandingOwnedResources: 4,
        expectedProtocolDiagnostic: {
          boundary: "export-delivery",
          reason: "invalid-envelope-or-binding",
          rawResultRetained: false,
        },
      },
    ],
    "E0_MARKER_DELIVERY_PROTOCOL_MATRIX_INVALID",
    "prepared-delivery-start:*",
    "Malformed start envelopes, throws, rejections, and malformed completions must lock exact overrides, invalid fields, diagnostics, and cleanup-unknown bounds.",
    findings,
  );

  requireMarkerFixture(
    "delivery-byte-ownership-matrix",
    {
      id: "delivery-byte-ownership-matrix",
      kind: "scenario-matrix",
      operation: "deliverExportArtifact",
      rows: [
        {
          id: "canonical-source-mutated-before-delivery-call",
          artifactSourceFixtureId: "goldens/minimal.changes.json",
          sourceMutationTiming:
            "after-artifact-preparation-before-delivery-call",
          sourceMutation: {
            path: ["title"],
            from: "Changes",
            to: "Caller mutation",
          },
          expected: {
            artifactTextSnapshotUnchanged: true,
            utf8EncodingCalls: 1,
            freshPrivateByteCopies: 1,
            writerAliasesCallerMemory: false,
            bytesOffered: 352,
            semanticDocumentHash:
              "c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5",
          },
        },
        {
          id: "canonical-source-mutation-attempted-during-async-write",
          artifactSourceFixtureId: "goldens/minimal.changes.json",
          sourceMutationTiming: "after-write-start-before-write-settlement",
          sourceMutation: {
            path: ["description"],
            from: "",
            to: "Concurrent caller mutation",
          },
          expected: {
            artifactTextSnapshotUnchanged: true,
            utf8EncodingCalls: 1,
            freshPrivateByteCopies: 1,
            writerAliasesCallerMemory: false,
            bytesOffered: 352,
            semanticDocumentHash:
              "c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5",
          },
        },
        {
          id: "lead-sheet-source-mutation-attempted-during-async-write",
          artifactSourceFixtureId: "goldens/minimal.changes.txt",
          sourceMutationTiming: "after-write-start-before-write-settlement",
          sourceMutation: {
            path: ["sourceDocument", "title"],
            from: "Changes",
            to: "Concurrent caller mutation",
          },
          expected: {
            artifactTextSnapshotUnchanged: true,
            utf8EncodingCalls: 1,
            freshPrivateByteCopies: 1,
            writerAliasesCallerMemory: false,
            bytesOffered: 60,
            canonicalMarkerAction: "forbidden",
          },
        },
      ],
      expected: {
        rows: 3,
        freshPrivateByteCopies: 3,
        callerMemoryAliases: 0,
        textSnapshotMutations: 0,
        canonicalHashOrByteDrift: 0,
      },
    },
    "E0_MARKER_DELIVERY_BYTE_OWNERSHIP_INVALID",
    "Delivery must encode each prepared text snapshot once into fresh private bytes that never alias caller-owned memory.",
  );

  const cleanupMatrix = inputFixtureById.get("delivery-cleanup-failure-matrix");
  const cleanupRows = recordsAt(cleanupMatrix?.["rows"]);
  requireExact(
    {
      rows: cleanupRows.map((row) => ({
        id: row["id"],
        channel: row["channel"],
        faults: row["faults"],
        expected: row["expected"],
      })),
      expected: cleanupMatrix?.["expected"],
    },
    {
      rows: [
        {
          id: "fsa-close-then-abort-cleanup-failures",
          channel: "file-system-access",
          faults: [
            { operation: "writer.close", kind: "synchronous-throw" },
            { operation: "writer.abort", kind: "promise-rejection" },
            { operation: "handle.release", kind: "synchronous-throw" },
          ],
          expected: {
            ok: false,
            outcome: "cleanup-failed",
            code: "export.delivery_cleanup_failed",
            artifact: null,
            cleanup: "reconciliation-required",
            cleanupFailureKinds: [
              "writer-close",
              "writer-abort",
              "handle-release",
            ],
            objectUrlsCreated: 0,
            objectUrlsRevoked: 0,
            outstandingOwnedResources: 2,
            markerAction: "forbidden",
          },
        },
        {
          id: "fsa-abort-rejection",
          channel: "file-system-access",
          faults: [
            { operation: "writer.write", kind: "synchronous-throw" },
            { operation: "writer.abort", kind: "promise-rejection" },
          ],
          expected: {
            ok: false,
            outcome: "cleanup-failed",
            code: "export.delivery_cleanup_failed",
            artifact: null,
            cleanup: "reconciliation-required",
            cleanupFailureKinds: ["writer-abort"],
            objectUrlsCreated: 0,
            objectUrlsRevoked: 0,
            outstandingOwnedResources: 1,
            markerAction: "forbidden",
          },
        },
        {
          id: "blob-anchor-remove-throw",
          channel: "object-url-download",
          faults: [{ operation: "anchor.remove", kind: "synchronous-throw" }],
          expected: {
            ok: false,
            outcome: "cleanup-failed",
            code: "export.delivery_cleanup_failed",
            artifact: null,
            cleanup: "reconciliation-required",
            cleanupFailureKinds: ["anchor-remove"],
            objectUrlsCreated: 1,
            objectUrlsRevoked: 1,
            outstandingOwnedResources: 1,
            markerAction: "forbidden",
          },
        },
        {
          id: "blob-anchor-and-revoke-rejections",
          channel: "object-url-download",
          faults: [
            { operation: "anchor.remove", kind: "synchronous-throw" },
            {
              operation: "URL.revokeObjectURL",
              kind: "synchronous-throw",
            },
          ],
          expected: {
            ok: false,
            outcome: "cleanup-failed",
            code: "export.delivery_cleanup_failed",
            artifact: null,
            cleanup: "reconciliation-required",
            cleanupFailureKinds: ["anchor-remove", "object-url-revoke"],
            objectUrlsCreated: 1,
            objectUrlsRevoked: 0,
            outstandingOwnedResources: 2,
            markerAction: "forbidden",
          },
        },
      ],
      expected: {
        rows: 4,
        everyFailureKindArrayOrderedByContract: true,
        everyFailureKindArrayUnique: true,
        everyOutstandingCountWithinTypedRange1Through2: true,
        maximumOutstandingOwnedResourcesPerTypedCleanupFailure: 2,
        totalOutstandingDistinctOwnedResources: 6,
        everyArtifactNull: true,
        markerActions: 0,
        eachStateEffect: "DELIVERY_RESOURCE_RECONCILIATION_REQUIRED",
      },
    },
    "E0_MARKER_DELIVERY_CLEANUP_MATRIX_INVALID",
    "delivery-cleanup-failure-matrix",
    "Known cleanup failures must enumerate exact typed resources; unknown protocol cleanup must remain a separate bounded reconciliation branch.",
    findings,
  );

  const registryLifecycle = inputFixtureById.get(
    "prepared-canonical-export-registry-lifecycle-matrix",
  );
  const registryRows = recordsAt(registryLifecycle?.["rows"]);
  requireExact(
    registryLifecycle,
    {
      id: "prepared-canonical-export-registry-lifecycle-matrix",
      kind: "scenario-matrix",
      operation: "preparedCanonicalExportDeliveryRegistry",
      rows: [
        {
          id: "exact-take-is-atomic-and-single-use",
          startingFixtureId: "prepared-canonical-export-delivery:revision-7",
          events: [
            {
              event: "take",
              preparationId: 1,
              documentId: "document-e0-minimal",
              revision: 7,
              outcome: "taken",
              stateAfter: "delivering",
            },
            {
              event: "finishDelivery",
              preparationId: 1,
              outcome: "finished",
              registryState: "empty",
              privateBytesZeroed: true,
            },
            {
              event: "finishDelivery",
              preparationId: 1,
              outcome: "ignored-stale",
              registryState: "empty",
            },
            {
              event: "take",
              preparationId: 1,
              documentId: "document-e0-minimal",
              revision: 7,
              outcome: "unavailable",
              stateAfter: "empty",
            },
          ],
          browserStarts: 1,
          a0Calls: 1,
          a1Calls: 1,
        },
        {
          id: "fabricated-preparation-id-preserves-unrelated-ready-entry",
          startingFixtureId: "prepared-canonical-export-delivery:revision-7",
          take: {
            preparationId: 999,
            documentId: "document-e0-minimal",
            revision: 7,
          },
          expectedOutcome: "unavailable",
          expectedState: "ready",
          privateBytesExposed: false,
          privateBytesZeroed: false,
          unrelatedReadyEntryPreserved: true,
          browserStarts: 0,
          a0Calls: 0,
          a1Calls: 0,
        },
        {
          id: "state-edit-invalidates-prepared-entry",
          startingFixtureId: "prepared-canonical-export-delivery:revision-7",
          take: {
            preparationId: 1,
            documentId: "document-e0-minimal",
            revision: 8,
          },
          expectedOutcome: "discarded-stale",
          expectedState: "empty",
          privateBytesZeroed: true,
          browserStarts: 0,
          a0Calls: 0,
          a1Calls: 0,
        },
        {
          id: "document-switch-invalidates-prepared-entry",
          startingFixtureId: "prepared-canonical-export-delivery:revision-7",
          take: {
            preparationId: 1,
            documentId: "document-e0-nested",
            revision: 7,
          },
          expectedOutcome: "discarded-stale",
          expectedState: "empty",
          privateBytesZeroed: true,
          browserStarts: 0,
          a0Calls: 0,
          a1Calls: 0,
        },
        {
          id: "mutated-public-readiness-cannot-mutate-private-entry",
          startingFixtureId: "prepared-canonical-export-delivery:revision-7",
          attemptedPublicBindingMutationFixtureId:
            "prepared-canonical-export:mutated-public-readiness",
          privateEntryAfterFixtureId:
            "prepared-canonical-export-delivery:revision-7",
          privateFieldMutations: 0,
        },
        {
          id: "ready-entry-is-zeroed-before-next-preparation",
          startingFixtureId: "prepared-canonical-export-delivery:revision-7",
          events: [
            {
              event: "begin-replaces-ready",
              documentId: "document-e0-minimal",
              revision: 8,
              preparationId: 2,
              generation: 2,
              replacedPreparationId: 1,
              oldPrivateBytesZeroedBeforeNewEntry: true,
              stateAfter: "preparing",
            },
            {
              event: "publish",
              fixtureId: "prepared-canonical-export-delivery:revision-8",
              outcome: "ready",
              stateAfter: "ready",
            },
          ],
          liveEntriesAtEveryStepAtMost: 1,
          oldAndNewPrivateBytesSimultaneouslyLive: false,
          survivingFixtureId: "prepared-canonical-export-delivery:revision-8",
        },
        {
          id: "duplicate-stale-publish-cannot-clobber-newer-ready-generation",
          events: [
            {
              event: "begin",
              documentId: "document-e0-minimal",
              revision: 7,
              preparationId: 1,
              generation: 1,
              settlement: "pending",
            },
            {
              event: "begin",
              documentId: "document-e0-minimal",
              revision: 8,
              outcome: "busy",
              newPreparationIdsAllocated: 0,
              stateAfter: "preparing",
            },
            {
              event: "abandonPreparation",
              reason:
                "revision-7-preparation-settled-stale-against-current-revision-8",
              preparationId: 1,
              outcome: "abandoned",
              registryState: "empty",
              privateBytesZeroedBeforeReturn: true,
              asyncTaskStateAfter: "settled",
            },
            {
              event: "begin",
              documentId: "document-e0-minimal",
              revision: 8,
              preparationId: 2,
              generation: 2,
            },
            {
              event: "publish",
              fixtureId: "prepared-canonical-export-delivery:revision-8",
              outcome: "ready",
            },
            {
              event: "publish",
              callbackKind: "duplicate-stale-internal-terminal-callback",
              preparationId: 1,
              generation: 1,
              outcome: "discarded-stale",
              registryMutation: "none",
              registryState: "ready",
              privateBytesAlreadyZeroed: true,
            },
          ],
          survivingFixtureId: "prepared-canonical-export-delivery:revision-8",
          expectedState: "ready",
          liveEntries: 1,
          oldAsyncTaskPendingWhenGeneration2Began: false,
        },
        {
          id: "duplicate-stale-abandon-cannot-clear-newer-ready-generation",
          events: [
            {
              event: "begin",
              documentId: "document-e0-minimal",
              revision: 7,
              preparationId: 1,
              generation: 1,
              settlement: "pending",
            },
            {
              event: "begin",
              documentId: "document-e0-minimal",
              revision: 8,
              outcome: "busy",
              newPreparationIdsAllocated: 0,
              stateAfter: "preparing",
            },
            {
              event: "abandonPreparation",
              reason:
                "revision-7-preparation-settled-stale-against-current-revision-8",
              preparationId: 1,
              outcome: "abandoned",
              registryState: "empty",
              privateBytesZeroedBeforeReturn: true,
              asyncTaskStateAfter: "settled",
            },
            {
              event: "begin",
              documentId: "document-e0-minimal",
              revision: 8,
              preparationId: 2,
              generation: 2,
            },
            {
              event: "publish",
              fixtureId: "prepared-canonical-export-delivery:revision-8",
              outcome: "ready",
            },
            {
              event: "abandonPreparation",
              reason: "duplicate-stale-internal-terminal-callback",
              preparationId: 1,
              generation: 1,
              outcome: "ignored-stale",
              registryMutation: "none",
              registryState: "ready",
            },
          ],
          survivingFixtureId: "prepared-canonical-export-delivery:revision-8",
          expectedState: "ready",
          liveEntries: 1,
          oldAsyncTaskPendingWhenGeneration2Began: false,
        },
        {
          id: "current-preparation-failure-abandons-exact-generation",
          events: [
            {
              event: "begin",
              documentId: "document-e0-minimal",
              revision: 7,
              preparationId: 1,
              generation: 1,
              stateAfter: "preparing",
            },
            {
              event: "abandonPreparation",
              reason: "current-preparation-failed",
              preparationId: 1,
              generation: 1,
              outcome: "abandoned",
              registryState: "empty",
              privateBytesLiveAfter: 0,
            },
            {
              event: "abandonPreparation",
              reason: "duplicate-terminal-callback",
              preparationId: 1,
              generation: 1,
              outcome: "ignored-stale",
              registryState: "empty",
            },
          ],
          liveEntriesAfter: 0,
          lateCallbacksCanClearNewerGeneration: false,
        },
        {
          id: "missing-activation-still-consumes-attempt",
          startingFixtureId: "prepared-canonical-export-delivery:revision-7",
          events: [
            {
              event: "take",
              outcome: "taken",
              stateAfter: "delivering",
            },
            {
              event: "activation-probe",
              active: false,
            },
            {
              event: "finishDelivery",
              preparationId: 1,
              outcome: "finished",
              registryState: "empty",
              privateBytesZeroed: true,
            },
          ],
          pickerCalls: 0,
          anchorCalls: 0,
          a0Calls: 0,
          a1Calls: 0,
          retryRequiresNewPreparation: true,
        },
        {
          id: "all-terminal-delivery-branches-consume-entry",
          terminalOutcomes: [
            "completed",
            "handed-off",
            "cancelled",
            "failed",
            "cleanup-failed",
            "protocol-invalid",
          ],
          registryStateAfterEach: "empty",
          privateBytesLiveAfterEach: 0,
          retryRequiresNewPreparation: true,
          nonSuccessA0Calls: 0,
          nonSuccessA1Calls: 0,
        },
      ],
      expected: {
        rows: 11,
        capacity: 1,
        maximumConcurrentPreparationTasks: 1,
        publicRegistryAccess: false,
        publicPrivateByteAccess: false,
        olderCompletionCanClobberNewerGeneration: false,
        asyncTerminalCleanupUsesGenerationKeyedAbandonPreparation: true,
        deliveryTerminalCleanupUsesGenerationKeyedFinishDelivery: true,
        unkeyedInvalidateUsedForAsyncCompletion: false,
        everyAcceptedDeliveryAttemptConsumesBeforeBrowserInvocation: true,
        replayablePreparationIds: false,
      },
    },
    "E0_MARKER_REGISTRY_EXACT_FIXTURE_INVALID",
    "prepared-canonical-export-registry-lifecycle-matrix",
    "Every single-flight registry transition, locator outcome, keyed callback, byte-zeroing step, and terminal bound must remain exact.",
    findings,
  );
  requireExact(
    {
      rowIds: registryRows.map((row) => row["id"]),
      expected: registryLifecycle?.["expected"],
    },
    {
      rowIds: [
        "exact-take-is-atomic-and-single-use",
        "fabricated-preparation-id-preserves-unrelated-ready-entry",
        "state-edit-invalidates-prepared-entry",
        "document-switch-invalidates-prepared-entry",
        "mutated-public-readiness-cannot-mutate-private-entry",
        "ready-entry-is-zeroed-before-next-preparation",
        "duplicate-stale-publish-cannot-clobber-newer-ready-generation",
        "duplicate-stale-abandon-cannot-clear-newer-ready-generation",
        "current-preparation-failure-abandons-exact-generation",
        "missing-activation-still-consumes-attempt",
        "all-terminal-delivery-branches-consume-entry",
      ],
      expected: {
        rows: 11,
        capacity: 1,
        maximumConcurrentPreparationTasks: 1,
        publicRegistryAccess: false,
        publicPrivateByteAccess: false,
        olderCompletionCanClobberNewerGeneration: false,
        asyncTerminalCleanupUsesGenerationKeyedAbandonPreparation: true,
        deliveryTerminalCleanupUsesGenerationKeyedFinishDelivery: true,
        unkeyedInvalidateUsedForAsyncCompletion: false,
        everyAcceptedDeliveryAttemptConsumesBeforeBrowserInvocation: true,
        replayablePreparationIds: false,
      },
    },
    "E0_MARKER_REGISTRY_LIFECYCLE_INVALID",
    "prepared-canonical-export-registry-lifecycle-matrix",
    "The one-slot lifecycle matrix must cover exact take, stale locators, ready replacement, keyed late callbacks, missing activation, and all terminal branches.",
    findings,
  );
  const registryRowById = new Map(
    registryRows.map((row) => [String(row["id"]), row] as const),
  );
  requireExact(
    [
      registryRowById.get(
        "fabricated-preparation-id-preserves-unrelated-ready-entry",
      ),
      registryRowById.get("state-edit-invalidates-prepared-entry"),
      registryRowById.get("document-switch-invalidates-prepared-entry"),
      registryRowById.get("ready-entry-is-zeroed-before-next-preparation"),
      registryRowById.get("all-terminal-delivery-branches-consume-entry"),
    ],
    [
      {
        id: "fabricated-preparation-id-preserves-unrelated-ready-entry",
        startingFixtureId: "prepared-canonical-export-delivery:revision-7",
        take: {
          preparationId: 999,
          documentId: "document-e0-minimal",
          revision: 7,
        },
        expectedOutcome: "unavailable",
        expectedState: "ready",
        privateBytesExposed: false,
        privateBytesZeroed: false,
        unrelatedReadyEntryPreserved: true,
        browserStarts: 0,
        a0Calls: 0,
        a1Calls: 0,
      },
      {
        id: "state-edit-invalidates-prepared-entry",
        startingFixtureId: "prepared-canonical-export-delivery:revision-7",
        take: {
          preparationId: 1,
          documentId: "document-e0-minimal",
          revision: 8,
        },
        expectedOutcome: "discarded-stale",
        expectedState: "empty",
        privateBytesZeroed: true,
        browserStarts: 0,
        a0Calls: 0,
        a1Calls: 0,
      },
      {
        id: "document-switch-invalidates-prepared-entry",
        startingFixtureId: "prepared-canonical-export-delivery:revision-7",
        take: {
          preparationId: 1,
          documentId: "document-e0-nested",
          revision: 7,
        },
        expectedOutcome: "discarded-stale",
        expectedState: "empty",
        privateBytesZeroed: true,
        browserStarts: 0,
        a0Calls: 0,
        a1Calls: 0,
      },
      {
        id: "ready-entry-is-zeroed-before-next-preparation",
        startingFixtureId: "prepared-canonical-export-delivery:revision-7",
        events: [
          {
            event: "begin-replaces-ready",
            documentId: "document-e0-minimal",
            revision: 8,
            preparationId: 2,
            generation: 2,
            replacedPreparationId: 1,
            oldPrivateBytesZeroedBeforeNewEntry: true,
            stateAfter: "preparing",
          },
          {
            event: "publish",
            fixtureId: "prepared-canonical-export-delivery:revision-8",
            outcome: "ready",
            stateAfter: "ready",
          },
        ],
        liveEntriesAtEveryStepAtMost: 1,
        oldAndNewPrivateBytesSimultaneouslyLive: false,
        survivingFixtureId: "prepared-canonical-export-delivery:revision-8",
      },
      {
        id: "all-terminal-delivery-branches-consume-entry",
        terminalOutcomes: [
          "completed",
          "handed-off",
          "cancelled",
          "failed",
          "cleanup-failed",
          "protocol-invalid",
        ],
        registryStateAfterEach: "empty",
        privateBytesLiveAfterEach: 0,
        retryRequiresNewPreparation: true,
        nonSuccessA0Calls: 0,
        nonSuccessA1Calls: 0,
      },
    ],
    "E0_MARKER_REGISTRY_CRITICAL_ROWS_INVALID",
    "prepared-canonical-export-registry-lifecycle-matrix.rows",
    "Locator mismatch must preserve unrelated ready bytes, true identity staleness must discard and zero, ready replacement must not overlap, and every accepted terminal attempt must consume and zero.",
    findings,
  );
  requireExact(
    [
      "duplicate-stale-publish-cannot-clobber-newer-ready-generation",
      "duplicate-stale-abandon-cannot-clear-newer-ready-generation",
    ].map((rowId) => {
      const row = registryRowById.get(rowId);
      const events = recordsAt(row?.["events"]);
      return {
        rowId,
        initialBegin: events[0],
        concurrentBegin: events[1],
        oldAsyncTaskPendingWhenGeneration2Began:
          row?.["oldAsyncTaskPendingWhenGeneration2Began"],
      };
    }),
    [
      "duplicate-stale-publish-cannot-clobber-newer-ready-generation",
      "duplicate-stale-abandon-cannot-clear-newer-ready-generation",
    ].map((rowId) => ({
      rowId,
      initialBegin: {
        event: "begin",
        documentId: "document-e0-minimal",
        revision: 7,
        preparationId: 1,
        generation: 1,
        settlement: "pending",
      },
      concurrentBegin: {
        event: "begin",
        documentId: "document-e0-minimal",
        revision: 8,
        outcome: "busy",
        newPreparationIdsAllocated: 0,
        stateAfter: "preparing",
      },
      oldAsyncTaskPendingWhenGeneration2Began: false,
    })),
    "E0_MARKER_REGISTRY_SINGLE_FLIGHT_INVALID",
    "prepared-canonical-export-registry-lifecycle-matrix.single-flight",
    "Every preparing state must refuse a second identity without allocating an ID or overlapping async preparation tasks.",
    findings,
  );
  const cleanupEventProjection: JsonObject[] = [];
  for (const row of registryRows) {
    for (const event of recordsAt(row["events"])) {
      if (
        event["event"] !== "abandonPreparation" &&
        event["event"] !== "finishDelivery"
      ) {
        continue;
      }
      cleanupEventProjection.push({
        rowId: row["id"],
        event: event["event"],
        preparationId: event["preparationId"] ?? null,
        generation: event["generation"] ?? null,
        outcome: event["outcome"],
        registryState: event["registryState"],
        privateBytesZeroed: event["privateBytesZeroed"] ?? null,
        privateBytesZeroedBeforeReturn:
          event["privateBytesZeroedBeforeReturn"] ?? null,
        privateBytesLiveAfter: event["privateBytesLiveAfter"] ?? null,
      });
    }
  }
  requireExact(
    cleanupEventProjection,
    [
      {
        rowId: "exact-take-is-atomic-and-single-use",
        event: "finishDelivery",
        preparationId: 1,
        generation: null,
        outcome: "finished",
        registryState: "empty",
        privateBytesZeroed: true,
        privateBytesZeroedBeforeReturn: null,
        privateBytesLiveAfter: null,
      },
      {
        rowId: "exact-take-is-atomic-and-single-use",
        event: "finishDelivery",
        preparationId: 1,
        generation: null,
        outcome: "ignored-stale",
        registryState: "empty",
        privateBytesZeroed: null,
        privateBytesZeroedBeforeReturn: null,
        privateBytesLiveAfter: null,
      },
      {
        rowId: "duplicate-stale-publish-cannot-clobber-newer-ready-generation",
        event: "abandonPreparation",
        preparationId: 1,
        generation: null,
        outcome: "abandoned",
        registryState: "empty",
        privateBytesZeroed: null,
        privateBytesZeroedBeforeReturn: true,
        privateBytesLiveAfter: null,
      },
      {
        rowId: "duplicate-stale-abandon-cannot-clear-newer-ready-generation",
        event: "abandonPreparation",
        preparationId: 1,
        generation: null,
        outcome: "abandoned",
        registryState: "empty",
        privateBytesZeroed: null,
        privateBytesZeroedBeforeReturn: true,
        privateBytesLiveAfter: null,
      },
      {
        rowId: "duplicate-stale-abandon-cannot-clear-newer-ready-generation",
        event: "abandonPreparation",
        preparationId: 1,
        generation: 1,
        outcome: "ignored-stale",
        registryState: "ready",
        privateBytesZeroed: null,
        privateBytesZeroedBeforeReturn: null,
        privateBytesLiveAfter: null,
      },
      {
        rowId: "current-preparation-failure-abandons-exact-generation",
        event: "abandonPreparation",
        preparationId: 1,
        generation: 1,
        outcome: "abandoned",
        registryState: "empty",
        privateBytesZeroed: null,
        privateBytesZeroedBeforeReturn: null,
        privateBytesLiveAfter: 0,
      },
      {
        rowId: "current-preparation-failure-abandons-exact-generation",
        event: "abandonPreparation",
        preparationId: 1,
        generation: 1,
        outcome: "ignored-stale",
        registryState: "empty",
        privateBytesZeroed: null,
        privateBytesZeroedBeforeReturn: null,
        privateBytesLiveAfter: null,
      },
      {
        rowId: "missing-activation-still-consumes-attempt",
        event: "finishDelivery",
        preparationId: 1,
        generation: null,
        outcome: "finished",
        registryState: "empty",
        privateBytesZeroed: true,
        privateBytesZeroedBeforeReturn: null,
        privateBytesLiveAfter: null,
      },
    ],
    "E0_MARKER_REGISTRY_KEYED_CLEANUP_INVALID",
    "prepared-canonical-export-registry-lifecycle-matrix.rows",
    "Abandon and finish are total synchronous generation-keyed primitives whose duplicate callbacks are exact ignored-stale no-ops.",
    findings,
  );

  requireMarkerFixture(
    "a0-marker-publication-request:accepted",
    {
      id: "a0-marker-publication-request:accepted",
      kind: "adapter-input",
      operation: "publishCanonicalExportRevision",
      value: { publication: acceptedA0Publication },
      exactValueFields: ["publication"],
      forbiddenValueFields: [
        "state",
        "stateFixtureId",
        "previousMarker",
        "candidate",
        "delivery",
      ],
    },
    "E0_MARKER_A0_PUBLICATION_REQUEST_INVALID",
    "The public A0 CAS request must be state-free and carry only the exact publication identity.",
  );
  requireMarkerFixture(
    "a0-marker-publication:published",
    {
      id: "a0-marker-publication:published",
      kind: "adapter-result",
      operation: "publishCanonicalExportRevision",
      call: 1,
      requestFixtureId: "a0-marker-publication-request:accepted",
      return: {
        ok: true,
        outcome: "published",
        observedBeforeFixtureId: "state:marker-current-revision-7",
        stateFixtureId: "state:marker-published-revision-7",
      },
    },
    "E0_MARKER_A0_PUBLICATION_RESULT_INVALID",
    "The raw A0 result must bind both observed-before and published states for internal CAS validation.",
  );
  requireMarkerFixture(
    "a0-marker-publication:published-after-picker-ephemeral-change",
    {
      id: "a0-marker-publication:published-after-picker-ephemeral-change",
      kind: "adapter-result",
      operation: "publishCanonicalExportRevision",
      call: 1,
      requestFixtureId: "a0-marker-publication-request:accepted",
      return: {
        ok: true,
        outcome: "published",
        observedBeforeFixtureId:
          "state:marker-current-revision-7-picker-ephemeral-change",
        stateFixtureId:
          "state:marker-published-revision-7-picker-ephemeral-change",
      },
      assertions: {
        clickTimeStateFixtureId: "state:marker-current-revision-7",
        clickTimeStateUsedAsPublicationAuthority: false,
        ephemeralFieldsPreserved: true,
        onlyObservedBeforeToStateChangePath: ["exportRevision"],
      },
    },
    "E0_MARKER_A0_PUBLICATION_RESULT_INVALID",
    "A0 CAS must preserve the exact selector-observed ephemeral state while changing only exportRevision.",
  );
  requireMarkerFixture(
    "a0-marker-publication:stale-other-document",
    {
      id: "a0-marker-publication:stale-other-document",
      kind: "dependency-fault",
      override: {
        operation: "publishCanonicalExportRevision",
        call: 1,
        requestFixtureId: "a0-marker-publication-request:accepted",
        return: {
          ok: false,
          outcome: "refused",
          code: "export.marker_publication_stale",
          stateFixtureId: "state:marker-current-other-document-revision-7",
        },
      },
    },
    "E0_MARKER_A0_PUBLICATION_RESULT_INVALID",
    "A0 CAS must refuse a same-revision publication against a different current document.",
  );
  const normalizedA0Forbidden = [
    "state",
    "stateFixtureId",
    "observedBefore",
    "observedBeforeFixtureId",
    "exportRevision",
    "previousMarker",
  ];
  const normalizedA0Expected: Readonly<Record<string, JsonObject>> = {
    "a0-marker-publication-normalized:published": {
      id: "a0-marker-publication-normalized:published",
      kind: "adapter-result",
      operation: "normalizeCanonicalExportRevisionPublicationResult",
      rawAdapterResultFixtureId: "a0-marker-publication:published",
      value: {
        ok: true,
        outcome: "published",
        documentId: "document-e0-minimal",
        revision: 7,
      },
      forbiddenValueFields: normalizedA0Forbidden,
    },
    "a0-marker-publication-normalized:published-after-picker-ephemeral-change":
      {
        id: "a0-marker-publication-normalized:published-after-picker-ephemeral-change",
        kind: "adapter-result",
        operation: "normalizeCanonicalExportRevisionPublicationResult",
        rawAdapterResultFixtureId:
          "a0-marker-publication:published-after-picker-ephemeral-change",
        value: {
          ok: true,
          outcome: "published",
          documentId: "document-e0-minimal",
          revision: 7,
        },
        forbiddenValueFields: normalizedA0Forbidden,
      },
    "a0-marker-publication-normalized:stale": {
      id: "a0-marker-publication-normalized:stale",
      kind: "adapter-result",
      operation: "normalizeCanonicalExportRevisionPublicationResult",
      rawAdapterResultFixtureId: "a0-marker-publication:stale",
      value: {
        ok: false,
        outcome: "refused",
        code: "export.marker_publication_stale",
        observedDocumentId: "document-e0-minimal",
        observedRevision: 8,
      },
      forbiddenValueFields: normalizedA0Forbidden,
    },
    "a0-marker-publication-normalized:failed": {
      id: "a0-marker-publication-normalized:failed",
      kind: "adapter-result",
      operation: "normalizeCanonicalExportRevisionPublicationResult",
      rawAdapterResultFixtureId: "a0-marker-publication:failed",
      value: {
        ok: false,
        outcome: "refused",
        code: "export.marker_publication_failed",
        observedDocumentId: "document-e0-minimal",
        observedRevision: 7,
      },
      forbiddenValueFields: normalizedA0Forbidden,
    },
    "a0-marker-publication-normalized:stale-other-document": {
      id: "a0-marker-publication-normalized:stale-other-document",
      kind: "adapter-result",
      operation: "normalizeCanonicalExportRevisionPublicationResult",
      rawAdapterResultFixtureId: "a0-marker-publication:stale-other-document",
      value: {
        ok: false,
        outcome: "refused",
        code: "export.marker_publication_stale",
        observedDocumentId: "document-e0-nested",
        observedRevision: 7,
      },
      forbiddenValueFields: normalizedA0Forbidden,
    },
  };
  for (const [fixtureId, expected] of Object.entries(normalizedA0Expected)) {
    requireMarkerFixture(
      fixtureId,
      expected,
      "E0_MARKER_A0_NORMALIZED_RESULT_INVALID",
      "Normalized A0 results must expose only state-free publication identity or refusal observations.",
    );
  }
  requireMarkerFixture(
    "a1-marker-persistence-handoff:accepted",
    {
      id: "a1-marker-persistence-handoff:accepted",
      kind: "adapter-input",
      operation: "queueCanonicalExportMarkerPersistence",
      value: acceptedA1Handoff,
    },
    "E0_MARKER_A1_HANDOFF_INVALID",
    "A1 persistence must bind the exact accepted marker to the delivered canonical artifact.",
  );
  const expectedMarkerBoundaryAdapters: Readonly<Record<string, JsonObject>> = {
    "a0-marker-publication:stale": {
      id: "a0-marker-publication:stale",
      kind: "dependency-fault",
      override: {
        operation: "publishCanonicalExportRevision",
        call: 1,
        requestFixtureId: "a0-marker-publication-request:accepted",
        return: {
          ok: false,
          outcome: "refused",
          code: "export.marker_publication_stale",
          stateFixtureId: "state:marker-current-revision-8",
        },
      },
    },
    "a0-marker-publication:failed": {
      id: "a0-marker-publication:failed",
      kind: "dependency-fault",
      override: {
        operation: "publishCanonicalExportRevision",
        call: 1,
        requestFixtureId: "a0-marker-publication-request:accepted",
        return: {
          ok: false,
          outcome: "refused",
          code: "export.marker_publication_failed",
          stateFixtureId: "state:marker-current-revision-7",
        },
      },
    },
    "a0-marker-publication:protocol-invalid": {
      id: "a0-marker-publication:protocol-invalid",
      kind: "dependency-fault",
      override: {
        operation: "publishCanonicalExportRevision",
        call: 1,
        requestFixtureId: "a0-marker-publication-request:accepted",
        return: {
          ok: true,
          outcome: "published",
          observedBeforeFixtureId: "state:marker-current-revision-7",
          stateFixtureId: "state:marker-invalid-published-revision-7",
        },
      },
      invalidFields: ["return.state.exportRevision"],
      expectedCode: "export.marker_publication_result_invalid",
    },
    "a0-marker-publication:protocol-invalid-unrelated-state": {
      id: "a0-marker-publication:protocol-invalid-unrelated-state",
      kind: "dependency-fault",
      override: {
        operation: "publishCanonicalExportRevision",
        call: 1,
        requestFixtureId: "a0-marker-publication-request:accepted",
        return: {
          ok: true,
          outcome: "published",
          observedBeforeFixtureId: "state:marker-current-revision-7",
          stateFixtureId: "state:marker-invalid-published-unrelated-state",
        },
      },
      invalidFields: ["return.state.nextSequence"],
      expectedCode: "export.marker_publication_result_invalid",
    },
    "a0-marker-publication:synchronous-throw": {
      id: "a0-marker-publication:synchronous-throw",
      kind: "dependency-fault",
      override: {
        operation: "publishCanonicalExportRevision",
        call: 1,
        requestFixtureId: "a0-marker-publication-request:accepted",
        exception: {
          kind: "synchronous-throw",
          rawValuePresent: false,
        },
      },
      expectedCode: "export.marker_publication_result_invalid",
      expectedProtocolDiagnostic: {
        boundary: "A0-marker-publication",
        reason: "threw-or-rejected",
        rawResultRetained: false,
      },
    },
    "recovery-marker-persistence:failed": {
      id: "recovery-marker-persistence:failed",
      kind: "dependency-fault",
      override: {
        operation: "queueCanonicalExportMarkerPersistence",
        call: 1,
        handoffFixtureId: "a1-marker-persistence-handoff:accepted",
        return: {
          ok: false,
          outcome: "failed",
          code: "recovery.marker_persistence_failed",
          durability: "pending-failed",
        },
      },
    },
    "recovery-marker-persistence:unavailable": {
      id: "recovery-marker-persistence:unavailable",
      kind: "dependency-fault",
      override: {
        operation: "queueCanonicalExportMarkerPersistence",
        call: 1,
        handoffFixtureId: "a1-marker-persistence-handoff:accepted",
        return: {
          ok: false,
          outcome: "unavailable",
          code: "recovery.marker_persistence_unavailable",
          durability: "pending-failed",
        },
      },
    },
    "recovery-marker-persistence:persisted": {
      id: "recovery-marker-persistence:persisted",
      kind: "adapter-result",
      operation: "queueCanonicalExportMarkerPersistence",
      call: 1,
      handoffFixtureId: "a1-marker-persistence-handoff:accepted",
      return: {
        ok: true,
        outcome: "persisted",
        durability: "recovery-persisted",
      },
    },
    "recovery-marker-persistence:protocol-invalid": {
      id: "recovery-marker-persistence:protocol-invalid",
      kind: "dependency-fault",
      override: {
        operation: "queueCanonicalExportMarkerPersistence",
        call: 1,
        handoffFixtureId: "a1-marker-persistence-handoff:accepted",
        return: {
          ok: true,
          outcome: "persisted",
          durability: "pending-failed",
        },
      },
      invalidFields: ["return.durability"],
      expectedCode: "recovery.marker_persistence_result_invalid",
      expectedDurability: "reconciliation-required",
    },
    "recovery-marker-persistence:rejected-promise": {
      id: "recovery-marker-persistence:rejected-promise",
      kind: "dependency-fault",
      override: {
        operation: "queueCanonicalExportMarkerPersistence",
        call: 1,
        handoffFixtureId: "a1-marker-persistence-handoff:accepted",
        exception: {
          kind: "promise-rejection",
          rawValuePresent: false,
        },
      },
      expectedCode: "recovery.marker_persistence_result_invalid",
      expectedProtocolDiagnostic: {
        boundary: "A1-marker-persistence",
        reason: "threw-or-rejected",
        rawResultRetained: false,
      },
      expectedDurability: "reconciliation-required",
    },
  };
  for (const [fixtureId, expected] of Object.entries(
    expectedMarkerBoundaryAdapters,
  )) {
    requireMarkerFixture(
      fixtureId,
      expected,
      "E0_MARKER_ADAPTER_FIXTURE_INVALID",
      "A0 publication and A1 persistence adapters must preserve exact state validation, refusal, protocol normalization, and durability semantics.",
    );
  }

  const markerCurrentState = materializeStateFixture(
    "state:marker-current-revision-7",
    inputFixtureById,
    sharedBases,
    loaded,
  );
  const markerPublishedState = materializeStateFixture(
    "state:marker-published-revision-7",
    inputFixtureById,
    sharedBases,
    loaded,
  );
  const markerRevision8State = materializeStateFixture(
    "state:marker-current-revision-8",
    inputFixtureById,
    sharedBases,
    loaded,
  );
  const markerInvalidPublishedState = materializeStateFixture(
    "state:marker-invalid-published-revision-7",
    inputFixtureById,
    sharedBases,
    loaded,
  );
  const markerInvalidUnrelatedState = materializeStateFixture(
    "state:marker-invalid-published-unrelated-state",
    inputFixtureById,
    sharedBases,
    loaded,
  );
  const markerPickerEphemeralState = materializeStateFixture(
    "state:marker-current-revision-7-picker-ephemeral-change",
    inputFixtureById,
    sharedBases,
    loaded,
  );
  const markerPickerPublishedState = materializeStateFixture(
    "state:marker-published-revision-7-picker-ephemeral-change",
    inputFixtureById,
    sharedBases,
    loaded,
  );
  const markerPublishedThenEditedState = materializeStateFixture(
    "state:marker-published-then-edited-revision-8",
    inputFixtureById,
    sharedBases,
    loaded,
  );
  const markerCurrentQuickEntry = objectAt(markerCurrentState?.["quickEntry"]);
  const markerCurrentDocument = objectAt(markerCurrentState?.["document"]);
  const markerCurrentPanels = objectAt(markerCurrentState?.["panels"]);
  const materializedMarkerStateIdentity = (
    fixtureId: string,
  ): JsonObject | null => {
    const state = materializeStateFixture(
      fixtureId,
      inputFixtureById,
      sharedBases,
      loaded,
    );
    const documentId =
      valueAtMaterializedStatePath(
        state,
        ["document", "id"],
        sharedBases,
        loaded,
      ) ??
      valueAtMaterializedStatePath(
        state,
        ["document", "documentId"],
        sharedBases,
        loaded,
      );
    const revision = valueAtMaterializedStatePath(
      state,
      ["revision"],
      sharedBases,
      loaded,
    );
    return typeof documentId === "string" && isNonnegativeSafeInteger(revision)
      ? { documentId, revision }
      : null;
  };
  requireExact(
    [
      materializedMarkerStateIdentity("state:marker-current-revision-7"),
      materializedMarkerStateIdentity("state:marker-current-revision-8"),
      materializedMarkerStateIdentity(
        "state:marker-current-revision-7-picker-ephemeral-change",
      ),
      materializedMarkerStateIdentity(
        "state:marker-current-other-document-revision-7",
      ),
    ],
    [
      { documentId: "document-e0-minimal", revision: 7 },
      { documentId: "document-e0-minimal", revision: 8 },
      { documentId: "document-e0-minimal", revision: 7 },
      { documentId: "document-e0-nested", revision: 7 },
    ],
    "E0_MARKER_MATERIALIZED_STATE_IDENTITY_INVALID",
    "input-fixture-ledger.json.marker-state-identities",
    "Materialized marker states must expose the exact current document and revision consumed by preparation and A0 publication normalization.",
    findings,
  );
  if (
    markerCurrentState === null ||
    markerPublishedState === null ||
    markerRevision8State === null ||
    markerInvalidPublishedState === null ||
    markerInvalidUnrelatedState === null ||
    markerPickerEphemeralState === null ||
    markerPickerPublishedState === null ||
    markerPublishedThenEditedState === null ||
    markerCurrentQuickEntry === null ||
    markerCurrentDocument === null ||
    markerCurrentPanels === null ||
    markerCurrentState["exportRevision"] !== 3 ||
    !sameJson(
      { ...markerCurrentState, exportRevision: 7 },
      markerPublishedState,
    ) ||
    !sameJson(
      {
        ...markerCurrentState,
        revision: 8,
        document: { ...markerCurrentDocument, title: "Changes edited" },
        quickEntry: { ...markerCurrentQuickEntry, baseRevision: 8 },
      },
      markerRevision8State,
    ) ||
    !sameJson(
      { ...markerCurrentState, exportRevision: 6 },
      markerInvalidPublishedState,
    ) ||
    !sameJson(
      { ...markerPublishedState, nextSequence: 13 },
      markerInvalidUnrelatedState,
    ) ||
    !sameJson(
      {
        ...markerCurrentState,
        panels: { ...markerCurrentPanels, active: "inspector" },
      },
      markerPickerEphemeralState,
    ) ||
    !sameJson(
      { ...markerPickerEphemeralState, exportRevision: 7 },
      markerPickerPublishedState,
    ) ||
    !sameJson(
      {
        ...markerPublishedState,
        revision: 8,
        document: { ...markerCurrentDocument, title: "Changes edited" },
        quickEntry: { ...markerCurrentQuickEntry, baseRevision: 8 },
      },
      markerPublishedThenEditedState,
    )
  ) {
    addFinding(
      findings,
      "E0_MARKER_A0_ATOMIC_CAS_STATES_INVALID",
      "input-fixture-ledger.json.marker-A0-state-derivations",
      "A0 success may change only exportRevision, must preserve picker-time ephemeral state, and late A1 settlement must preserve the exact newer revision/title/quick-entry edit; stale and protocol near misses remain independent.",
    );
  }

  for (const normalizedFixtureId of Object.keys(normalizedA0Expected)) {
    const normalizedFixture = inputFixtureById.get(normalizedFixtureId);
    const normalizedValue = objectAt(normalizedFixture?.["value"]);
    const rawFixtureId = normalizedFixture?.["rawAdapterResultFixtureId"];
    const rawFixture =
      typeof rawFixtureId === "string"
        ? inputFixtureById.get(rawFixtureId)
        : undefined;
    const rawReturn =
      objectAt(rawFixture?.["return"]) ??
      objectAt(objectAt(rawFixture?.["override"])?.["return"]);
    const rawStateFixtureId = rawReturn?.["stateFixtureId"];
    const rawObservedBeforeFixtureId = rawReturn?.["observedBeforeFixtureId"];
    const rawStateIdentity =
      typeof rawStateFixtureId === "string"
        ? materializedMarkerStateIdentity(rawStateFixtureId)
        : null;
    const rawObservedBeforeIdentity =
      typeof rawObservedBeforeFixtureId === "string"
        ? materializedMarkerStateIdentity(rawObservedBeforeFixtureId)
        : null;
    const normalizedIdentity =
      normalizedValue?.["ok"] === true
        ? {
            documentId: normalizedValue["documentId"],
            revision: normalizedValue["revision"],
          }
        : {
            documentId: normalizedValue?.["observedDocumentId"],
            revision: normalizedValue?.["observedRevision"],
          };
    if (
      rawStateIdentity === null ||
      !sameJson(normalizedIdentity, rawStateIdentity) ||
      (normalizedValue?.["ok"] === true &&
        (rawObservedBeforeIdentity === null ||
          !sameJson(rawObservedBeforeIdentity, normalizedIdentity)))
    ) {
      addFinding(
        findings,
        "E0_MARKER_A0_RAW_NORMALIZED_IDENTITY_INVALID",
        normalizedFixtureId,
        "Every normalized A0 receipt must exactly match the materialized raw result state identity, and success must also match observed-before identity.",
      );
    }
  }

  const markerResultProjection = (fixtureId: string): JsonObject | null => {
    const fixture = inputFixtureById.get(fixtureId);
    const value = objectAt(fixture?.["value"]);
    if (fixture === undefined || value === null) return null;
    const a0 = objectAt(value["a0Publication"]);
    const a1 = objectAt(value["a1Persistence"]);
    return {
      requestFixtureId: fixture["requestFixtureId"] ?? null,
      orderedCalls: fixture["orderedCalls"] ?? null,
      outcome: value["outcome"] ?? null,
      code: value["code"] ?? null,
      deliveryFixtureId: value["deliveryFixtureId"] ?? null,
      deliveryIsNull: Object.hasOwn(value, "delivery")
        ? value["delivery"] === null
        : null,
      a0ResultFixtureId: a0?.["resultFixtureId"] ?? null,
      a0Diagnostic: a0?.["protocolDiagnostic"] ?? null,
      a1ResultFixtureId: a1?.["resultFixtureId"] ?? null,
      a1Diagnostic: a1?.["protocolDiagnostic"] ?? null,
      applicationReconciliation:
        value["applicationReconciliation"] ??
        fixture["applicationReconciliation"] ??
        null,
      deliveryResourceReconciliation:
        value["deliveryResourceReconciliation"] ?? null,
      cleanupKnowledge: value["cleanupKnowledge"] ?? null,
      maximumPossibleOutstandingOwnedResources:
        value["maximumPossibleOutstandingOwnedResources"] ?? null,
      durability: value["durability"] ?? null,
      terminalRegistryOperation: fixture["terminalRegistryOperation"] ?? null,
      expectedRegistryState: fixture["expectedRegistryState"] ?? null,
    };
  };
  const markerResultDefaults = (overrides: JsonObject): JsonObject => ({
    requestFixtureId: null,
    orderedCalls: null,
    outcome: null,
    code: null,
    deliveryFixtureId: null,
    deliveryIsNull: null,
    a0ResultFixtureId: null,
    a0Diagnostic: null,
    a1ResultFixtureId: null,
    a1Diagnostic: null,
    applicationReconciliation: null,
    deliveryResourceReconciliation: null,
    cleanupKnowledge: null,
    maximumPossibleOutstandingOwnedResources: null,
    durability: null,
    terminalRegistryOperation: null,
    expectedRegistryState: null,
    ...overrides,
  });
  const a0Call = "a0-marker-publication-request:accepted";
  const a1Call = "a1-marker-persistence-handoff:accepted";
  const advancedResult = (
    requestFixtureId: string,
    deliveryFixtureId: string,
    a1ResultFixtureId: string,
    durability: string,
    a0ResultFixtureId = "a0-marker-publication-normalized:published",
  ): JsonObject =>
    markerResultDefaults({
      requestFixtureId,
      orderedCalls: [a0Call, a1Call],
      outcome: "advanced",
      deliveryFixtureId,
      a0ResultFixtureId,
      a1ResultFixtureId,
      durability,
    });
  const expectedMarkerResults: Record<string, JsonObject> = {
    "marker-settlement-result:advanced-persisted": advancedResult(
      "marker-settlement-stage-request:accepted",
      "delivery:canonical-fsa-completed",
      "recovery-marker-persistence:persisted",
      "recovery-persisted",
    ),
    "marker-settlement-result:advanced-persisted-after-picker-ephemeral-change":
      advancedResult(
        "marker-settlement-stage-request:accepted",
        "delivery:canonical-fsa-completed",
        "recovery-marker-persistence:persisted",
        "recovery-persisted",
        "a0-marker-publication-normalized:published-after-picker-ephemeral-change",
      ),
    "marker-settlement-result:advanced-persisted-blob": advancedResult(
      "marker-settlement-stage-request:blob-handed-off",
      "delivery:canonical-blob-handed-off",
      "recovery-marker-persistence:persisted",
      "recovery-persisted",
    ),
    "marker-settlement-result:unchanged-cancelled": markerResultDefaults({
      requestFixtureId: "marker-settlement-request:cancelled",
      orderedCalls: [],
      outcome: "unchanged-cancelled",
      deliveryFixtureId: "delivery:cancelled",
      durability: "unchanged",
    }),
    "marker-settlement-result:unchanged-failed": markerResultDefaults({
      requestFixtureId: "marker-settlement-request:failed",
      orderedCalls: [],
      outcome: "unchanged-failed",
      deliveryFixtureId: "delivery:failed",
      durability: "unchanged",
    }),
    "marker-settlement-result:unchanged-binding-mismatch": markerResultDefaults(
      {
        requestFixtureId: "marker-settlement-stage-request:binding-mismatch",
        orderedCalls: [],
        outcome: "unchanged-binding-mismatch",
        code: "export.marker_artifact_mismatch",
        deliveryFixtureId: "delivery:canonical-wrong-hash",
        durability: "unchanged",
      },
    ),
    "marker-settlement-result:prepared-export-stale": markerResultDefaults({
      requestFixtureId: "marker-settlement-request:state-edit-invalidates",
      orderedCalls: ["a0-state-identity:revision-8"],
      outcome: "prepared-export-stale",
      code: "export.prepared_canonical_stale",
      deliveryIsNull: true,
      durability: "unchanged",
      expectedRegistryState: "empty",
    }),
    "marker-settlement-result:prepared-export-unavailable":
      markerResultDefaults({
        requestFixtureId: "marker-settlement-request:prepared-unavailable",
        orderedCalls: ["a0-state-identity:revision-7"],
        outcome: "prepared-export-unavailable",
        code: "export.prepared_canonical_unavailable",
        deliveryIsNull: true,
        durability: "unchanged",
      }),
    "marker-settlement-result:publication-refused-stale": markerResultDefaults({
      requestFixtureId: "marker-settlement-stage-request:stale-revision",
      orderedCalls: [a0Call],
      outcome: "publication-refused",
      deliveryFixtureId: "delivery:canonical-fsa-completed",
      a0ResultFixtureId: "a0-marker-publication-normalized:stale",
      durability: "unchanged",
    }),
    "marker-settlement-result:publication-refused-stale-document":
      markerResultDefaults({
        requestFixtureId: "marker-settlement-stage-request:stale-document",
        orderedCalls: [a0Call],
        outcome: "publication-refused",
        deliveryFixtureId: "delivery:canonical-fsa-completed",
        a0ResultFixtureId:
          "a0-marker-publication-normalized:stale-other-document",
        durability: "unchanged",
      }),
    "marker-settlement-result:publication-refused-failed": markerResultDefaults(
      {
        requestFixtureId: "marker-settlement-stage-request:accepted",
        orderedCalls: [a0Call],
        outcome: "publication-refused",
        deliveryFixtureId: "delivery:canonical-fsa-completed",
        a0ResultFixtureId: "a0-marker-publication-normalized:failed",
        durability: "unchanged",
      },
    ),
    "marker-settlement-result:advanced-failed": advancedResult(
      "marker-settlement-stage-request:accepted",
      "delivery:canonical-fsa-completed",
      "recovery-marker-persistence:failed",
      "pending-failed",
    ),
    "marker-settlement-result:advanced-unavailable": advancedResult(
      "marker-settlement-stage-request:accepted",
      "delivery:canonical-fsa-completed",
      "recovery-marker-persistence:unavailable",
      "pending-failed",
    ),
    "marker-settlement-result:persistence-protocol-invalid":
      markerResultDefaults({
        requestFixtureId: "marker-settlement-stage-request:accepted",
        orderedCalls: [a0Call, a1Call],
        outcome: "persistence-protocol-invalid",
        code: "recovery.marker_persistence_result_invalid",
        deliveryFixtureId: "delivery:canonical-fsa-completed",
        a0ResultFixtureId: "a0-marker-publication-normalized:published",
        a1Diagnostic: {
          boundary: "A1-marker-persistence",
          reason: "invalid-envelope-or-binding",
          rawResultRetained: false,
        },
        durability: "reconciliation-required",
      }),
    "marker-settlement-result:persistence-protocol-invalid-rejection":
      markerResultDefaults({
        requestFixtureId: "marker-settlement-stage-request:accepted",
        orderedCalls: [a0Call, a1Call],
        outcome: "persistence-protocol-invalid",
        code: "recovery.marker_persistence_result_invalid",
        deliveryFixtureId: "delivery:canonical-fsa-completed",
        a0ResultFixtureId: "a0-marker-publication-normalized:published",
        a1Diagnostic: {
          boundary: "A1-marker-persistence",
          reason: "threw-or-rejected",
          rawResultRetained: false,
        },
        durability: "reconciliation-required",
      }),
    "marker-settlement-result:state-identity-protocol-invalid":
      markerResultDefaults({
        requestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-state-identity:protocol-invalid",
          "abandonPreparation:preparationId-1",
        ],
        outcome: "state-identity-protocol-invalid",
        code: "export.application_state_identity_invalid",
        deliveryIsNull: true,
        durability: "unchanged",
        terminalRegistryOperation: {
          operation: "abandonPreparation",
          preparationId: 1,
          outcome: "abandoned",
          registryState: "empty",
          privateBytesZeroed: true,
        },
      }),
    "marker-settlement-result:unchanged-failed-missing-activation":
      markerResultDefaults({
        requestFixtureId: "marker-settlement-request:missing-activation",
        orderedCalls: [
          "a0-state-identity:revision-7",
          "prepared-delivery-start:missing-activation",
        ],
        outcome: "unchanged-failed",
        deliveryFixtureId: "delivery:missing-activation-failed",
        durability: "unchanged",
      }),
    "marker-settlement-result:delivery-cleanup-reconciliation-required":
      markerResultDefaults({
        requestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-state-identity:revision-7",
          "delivery:cleanup-failed-representative",
        ],
        outcome: "delivery-cleanup-reconciliation-required",
        code: "export.delivery_cleanup_failed",
        deliveryFixtureId: "delivery:cleanup-failed-representative",
        deliveryResourceReconciliation: "required",
        durability: "unchanged",
      }),
    "marker-settlement-result:unchanged-binding-mismatch-bytes-offered":
      markerResultDefaults({
        requestFixtureId: "marker-settlement-stage-request:accepted",
        orderedCalls: [],
        outcome: "unchanged-binding-mismatch",
        code: "export.marker_artifact_mismatch",
        deliveryFixtureId: "delivery:canonical-wrong-bytes-offered",
        durability: "unchanged",
      }),
  };
  const publicationProtocolResults = [
    [
      "marker-settlement-result:publication-protocol-invalid",
      "invalid-envelope-or-binding",
    ],
    [
      "marker-settlement-result:publication-protocol-invalid-unrelated-state",
      "invalid-envelope-or-binding",
    ],
    [
      "marker-settlement-result:publication-protocol-invalid-throw",
      "threw-or-rejected",
    ],
  ] as const;
  for (const [fixtureId, reason] of publicationProtocolResults) {
    expectedMarkerResults[fixtureId] = markerResultDefaults({
      requestFixtureId: "marker-settlement-stage-request:accepted",
      orderedCalls: [a0Call],
      outcome: "publication-protocol-invalid",
      code: "export.marker_publication_result_invalid",
      deliveryFixtureId: "delivery:canonical-fsa-completed",
      a0Diagnostic: {
        boundary: "A0-marker-publication",
        reason,
        rawResultRetained: false,
      },
      applicationReconciliation: "required",
      durability: "unchanged",
    });
  }
  const deliveryProtocolResults = [
    [
      "marker-settlement-result:delivery-protocol-invalid-malformed-start",
      "invalid-envelope-or-binding",
    ],
    [
      "marker-settlement-result:delivery-protocol-invalid-start-throw",
      "threw-or-rejected",
    ],
    [
      "marker-settlement-result:delivery-protocol-invalid-completion-rejection",
      "threw-or-rejected",
    ],
    [
      "marker-settlement-result:delivery-protocol-invalid-malformed-completion",
      "invalid-envelope-or-binding",
    ],
  ] as const;
  for (const [fixtureId, reason] of deliveryProtocolResults) {
    expectedMarkerResults[fixtureId] = markerResultDefaults({
      requestFixtureId: "marker-settlement-request:accepted",
      outcome: "delivery-protocol-invalid",
      code: "export.delivery_result_invalid",
      deliveryIsNull: true,
      deliveryResourceReconciliation: "required",
      cleanupKnowledge: "unknown",
      maximumPossibleOutstandingOwnedResources: 4,
      durability: "unchanged",
    });
    const actualFixture = inputFixtureById.get(fixtureId);
    const actualValue = objectAt(actualFixture?.["value"]);
    requireExact(
      actualValue?.["protocolDiagnostic"],
      {
        boundary: "export-delivery",
        reason,
        rawResultRetained: false,
      },
      "E0_MARKER_DELIVERY_PROTOCOL_RESULT_INVALID",
      fixtureId,
      "Every delivery protocol breach must carry the exact no-raw cleanup-unknown diagnostic.",
      findings,
    );
  }
  const timestampProtocolResults = [
    [
      "marker-settlement-result:timestamp-protocol-invalid",
      "invalid-envelope-or-binding",
    ],
    [
      "marker-settlement-result:timestamp-protocol-invalid-throw",
      "threw-or-rejected",
    ],
  ] as const;
  for (const [fixtureId, reason] of timestampProtocolResults) {
    expectedMarkerResults[fixtureId] = markerResultDefaults({
      requestFixtureId: "marker-settlement-request:accepted",
      outcome: "timestamp-protocol-invalid",
      code: "export.marker_timestamp_invalid",
      deliveryFixtureId: "delivery:canonical-fsa-completed",
      applicationReconciliation: "not-applicable",
      durability: "unchanged",
    });
    const actualFixture = inputFixtureById.get(fixtureId);
    const actualValue = objectAt(actualFixture?.["value"]);
    requireExact(
      actualValue?.["protocolDiagnostic"],
      {
        boundary: "application-clock",
        reason,
        rawResultRetained: false,
      },
      "E0_MARKER_TIMESTAMP_RESULT_INVALID",
      fixtureId,
      "Timestamp failures retain delivery but must create no marker candidate, A0/A1 call, or application reconciliation.",
      findings,
    );
  }
  requireExact(
    [...inputFixtureById.keys()].filter((fixtureId) =>
      fixtureId.startsWith("marker-settlement-result:"),
    ),
    [
      "marker-settlement-result:advanced-persisted",
      "marker-settlement-result:advanced-persisted-after-picker-ephemeral-change",
      "marker-settlement-result:advanced-persisted-blob",
      "marker-settlement-result:unchanged-cancelled",
      "marker-settlement-result:unchanged-failed",
      "marker-settlement-result:unchanged-binding-mismatch",
      "marker-settlement-result:prepared-export-stale",
      "marker-settlement-result:publication-refused-stale",
      "marker-settlement-result:publication-refused-stale-document",
      "marker-settlement-result:publication-refused-failed",
      "marker-settlement-result:publication-protocol-invalid",
      "marker-settlement-result:advanced-failed",
      "marker-settlement-result:advanced-unavailable",
      "marker-settlement-result:persistence-protocol-invalid",
      "marker-settlement-result:state-identity-protocol-invalid",
      "marker-settlement-result:prepared-export-unavailable",
      "marker-settlement-result:unchanged-failed-missing-activation",
      "marker-settlement-result:delivery-cleanup-reconciliation-required",
      "marker-settlement-result:delivery-protocol-invalid-malformed-start",
      "marker-settlement-result:delivery-protocol-invalid-start-throw",
      "marker-settlement-result:delivery-protocol-invalid-completion-rejection",
      "marker-settlement-result:delivery-protocol-invalid-malformed-completion",
      "marker-settlement-result:timestamp-protocol-invalid",
      "marker-settlement-result:timestamp-protocol-invalid-throw",
      "marker-settlement-result:unchanged-binding-mismatch-bytes-offered",
      "marker-settlement-result:publication-protocol-invalid-unrelated-state",
      "marker-settlement-result:publication-protocol-invalid-throw",
      "marker-settlement-result:persistence-protocol-invalid-rejection",
    ],
    "E0_MARKER_SETTLEMENT_RESULT_INVENTORY_INVALID",
    "input-fixture-ledger.json.marker-settlement-results",
    "The packet must retain the exact ordered inventory of state-free marker terminal results.",
    findings,
  );
  requireExact(
    [...inputFixtureById.entries()]
      .filter(([fixtureId]) =>
        fixtureId.startsWith("marker-settlement-result:"),
      )
      .map(([, fixture]) => fixture),
    [
      {
        id: "marker-settlement-result:advanced-persisted",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-marker-publication-request:accepted",
          "a1-marker-persistence-handoff:accepted",
        ],
        value: {
          outcome: "advanced",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId: "a0-marker-publication-normalized:published",
          },
          a1Persistence: {
            handoffFixtureId: "a1-marker-persistence-handoff:accepted",
            resultFixtureId: "recovery-marker-persistence:persisted",
          },
          durability: "recovery-persisted",
        },
      },
      {
        id: "marker-settlement-result:advanced-persisted-after-picker-ephemeral-change",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-marker-publication-request:accepted",
          "a1-marker-persistence-handoff:accepted",
        ],
        value: {
          outcome: "advanced",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId:
              "a0-marker-publication-normalized:published-after-picker-ephemeral-change",
          },
          a1Persistence: {
            handoffFixtureId: "a1-marker-persistence-handoff:accepted",
            resultFixtureId: "recovery-marker-persistence:persisted",
          },
          durability: "recovery-persisted",
        },
      },
      {
        id: "marker-settlement-result:advanced-persisted-blob",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:blob-handed-off",
        publicRequestFixtureId: "marker-settlement-request:blob-handed-off",
        orderedCalls: [
          "a0-marker-publication-request:accepted",
          "a1-marker-persistence-handoff:accepted",
        ],
        value: {
          outcome: "advanced",
          deliveryFixtureId: "delivery:canonical-blob-handed-off",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId: "a0-marker-publication-normalized:published",
          },
          a1Persistence: {
            handoffFixtureId: "a1-marker-persistence-handoff:accepted",
            resultFixtureId: "recovery-marker-persistence:persisted",
          },
          durability: "recovery-persisted",
        },
      },
      {
        id: "marker-settlement-result:unchanged-cancelled",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:cancelled",
        orderedCalls: [],
        value: {
          outcome: "unchanged-cancelled",
          deliveryFixtureId: "delivery:cancelled",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:unchanged-failed",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:failed",
        orderedCalls: [],
        value: {
          outcome: "unchanged-failed",
          deliveryFixtureId: "delivery:failed",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:unchanged-binding-mismatch",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:binding-mismatch",
        publicRequestFixtureId: "marker-settlement-request:binding-mismatch",
        orderedCalls: [],
        value: {
          outcome: "unchanged-binding-mismatch",
          code: "export.marker_artifact_mismatch",
          deliveryFixtureId: "delivery:canonical-wrong-hash",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:prepared-export-stale",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:state-edit-invalidates",
        orderedCalls: ["a0-state-identity:revision-8"],
        value: {
          outcome: "prepared-export-stale",
          code: "export.prepared_canonical_stale",
          delivery: null,
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        expectedRegistryState: "empty",
        privateBytesZeroed: true,
        browserStarts: 0,
      },
      {
        id: "marker-settlement-result:publication-refused-stale",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:stale-revision",
        publicRequestFixtureId: "marker-settlement-request:stale-revision",
        orderedCalls: ["a0-marker-publication-request:accepted"],
        value: {
          outcome: "publication-refused",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId: "a0-marker-publication-normalized:stale",
          },
          a1Persistence: null,
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:publication-refused-stale-document",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:stale-document",
        publicRequestFixtureId: "marker-settlement-request:stale-document",
        orderedCalls: ["a0-marker-publication-request:accepted"],
        value: {
          outcome: "publication-refused",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId:
              "a0-marker-publication-normalized:stale-other-document",
          },
          a1Persistence: null,
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:publication-refused-failed",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: ["a0-marker-publication-request:accepted"],
        value: {
          outcome: "publication-refused",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId: "a0-marker-publication-normalized:failed",
          },
          a1Persistence: null,
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:publication-protocol-invalid",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: ["a0-marker-publication-request:accepted"],
        value: {
          outcome: "publication-protocol-invalid",
          code: "export.marker_publication_result_invalid",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            protocolDiagnostic: {
              boundary: "A0-marker-publication",
              reason: "invalid-envelope-or-binding",
              rawResultRetained: false,
            },
          },
          a1Persistence: null,
          applicationReconciliation: "required",
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:advanced-failed",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-marker-publication-request:accepted",
          "a1-marker-persistence-handoff:accepted",
        ],
        value: {
          outcome: "advanced",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId: "a0-marker-publication-normalized:published",
          },
          a1Persistence: {
            handoffFixtureId: "a1-marker-persistence-handoff:accepted",
            resultFixtureId: "recovery-marker-persistence:failed",
          },
          durability: "pending-failed",
        },
      },
      {
        id: "marker-settlement-result:advanced-unavailable",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-marker-publication-request:accepted",
          "a1-marker-persistence-handoff:accepted",
        ],
        value: {
          outcome: "advanced",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId: "a0-marker-publication-normalized:published",
          },
          a1Persistence: {
            handoffFixtureId: "a1-marker-persistence-handoff:accepted",
            resultFixtureId: "recovery-marker-persistence:unavailable",
          },
          durability: "pending-failed",
        },
      },
      {
        id: "marker-settlement-result:persistence-protocol-invalid",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-marker-publication-request:accepted",
          "a1-marker-persistence-handoff:accepted",
        ],
        value: {
          outcome: "persistence-protocol-invalid",
          code: "recovery.marker_persistence_result_invalid",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId: "a0-marker-publication-normalized:published",
          },
          a1Persistence: {
            handoffFixtureId: "a1-marker-persistence-handoff:accepted",
            protocolDiagnostic: {
              boundary: "A1-marker-persistence",
              reason: "invalid-envelope-or-binding",
              rawResultRetained: false,
            },
          },
          durability: "reconciliation-required",
        },
      },
      {
        id: "marker-settlement-result:state-identity-protocol-invalid",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-state-identity:protocol-invalid",
          "abandonPreparation:preparationId-1",
        ],
        value: {
          outcome: "state-identity-protocol-invalid",
          code: "export.application_state_identity_invalid",
          delivery: null,
          protocolDiagnostic: {
            boundary: "A0-state-identity",
            reason: "invalid-envelope-or-binding",
            rawResultRetained: false,
          },
          configurationDisposition: "release-gate-failed",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        terminalRegistryOperation: {
          operation: "abandonPreparation",
          preparationId: 1,
          outcome: "abandoned",
          registryState: "empty",
          privateBytesZeroed: true,
        },
        registryEntryConsumed: false,
        registryEntryAbandoned: true,
        registryStateAfter: "empty",
        browserStarts: 0,
      },
      {
        id: "marker-settlement-result:prepared-export-unavailable",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:prepared-unavailable",
        orderedCalls: ["a0-state-identity:revision-7"],
        value: {
          outcome: "prepared-export-unavailable",
          code: "export.prepared_canonical_unavailable",
          delivery: null,
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        registryStateAfter: "empty",
        browserStarts: 0,
      },
      {
        id: "marker-settlement-result:unchanged-failed-missing-activation",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:missing-activation",
        orderedCalls: [
          "a0-state-identity:revision-7",
          "prepared-delivery-start:missing-activation",
        ],
        value: {
          outcome: "unchanged-failed",
          deliveryFixtureId: "delivery:missing-activation-failed",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        registryStateAfter: "empty",
      },
      {
        id: "marker-settlement-result:delivery-cleanup-reconciliation-required",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-state-identity:revision-7",
          "delivery:cleanup-failed-representative",
        ],
        value: {
          outcome: "delivery-cleanup-reconciliation-required",
          code: "export.delivery_cleanup_failed",
          deliveryFixtureId: "delivery:cleanup-failed-representative",
          deliveryResourceReconciliation: "required",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        registryStateAfter: "empty",
      },
      {
        id: "marker-settlement-result:delivery-protocol-invalid-malformed-start",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:accepted",
        dependencyFaultFixtureId: "prepared-delivery-start:malformed-envelope",
        value: {
          outcome: "delivery-protocol-invalid",
          code: "export.delivery_result_invalid",
          delivery: null,
          cleanupKnowledge: "unknown",
          maximumPossibleOutstandingOwnedResources: 4,
          deliveryResourceReconciliation: "required",
          protocolDiagnostic: {
            boundary: "export-delivery",
            reason: "invalid-envelope-or-binding",
            rawResultRetained: false,
          },
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        registryStateAfter: "empty",
      },
      {
        id: "marker-settlement-result:delivery-protocol-invalid-start-throw",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:accepted",
        dependencyFaultFixtureId: "prepared-delivery-start:synchronous-throw",
        value: {
          outcome: "delivery-protocol-invalid",
          code: "export.delivery_result_invalid",
          delivery: null,
          cleanupKnowledge: "unknown",
          maximumPossibleOutstandingOwnedResources: 4,
          deliveryResourceReconciliation: "required",
          protocolDiagnostic: {
            boundary: "export-delivery",
            reason: "threw-or-rejected",
            rawResultRetained: false,
          },
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        registryStateAfter: "empty",
      },
      {
        id: "marker-settlement-result:delivery-protocol-invalid-completion-rejection",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:accepted",
        dependencyFaultFixtureId:
          "prepared-delivery-start:unexpected-rejection",
        value: {
          outcome: "delivery-protocol-invalid",
          code: "export.delivery_result_invalid",
          delivery: null,
          cleanupKnowledge: "unknown",
          maximumPossibleOutstandingOwnedResources: 4,
          deliveryResourceReconciliation: "required",
          protocolDiagnostic: {
            boundary: "export-delivery",
            reason: "threw-or-rejected",
            rawResultRetained: false,
          },
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        registryStateAfter: "empty",
      },
      {
        id: "marker-settlement-result:delivery-protocol-invalid-malformed-completion",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:accepted",
        dependencyFaultFixtureId:
          "prepared-delivery-start:malformed-completion-result",
        value: {
          outcome: "delivery-protocol-invalid",
          code: "export.delivery_result_invalid",
          delivery: null,
          cleanupKnowledge: "unknown",
          maximumPossibleOutstandingOwnedResources: 4,
          deliveryResourceReconciliation: "required",
          protocolDiagnostic: {
            boundary: "export-delivery",
            reason: "invalid-envelope-or-binding",
            rawResultRetained: false,
          },
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        registryStateAfter: "empty",
      },
      {
        id: "marker-settlement-result:timestamp-protocol-invalid",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:accepted",
        clockFixtureId: "clock:canonical-export-timestamp-invalid",
        value: {
          outcome: "timestamp-protocol-invalid",
          code: "export.marker_timestamp_invalid",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          protocolDiagnostic: {
            boundary: "application-clock",
            reason: "invalid-envelope-or-binding",
            rawResultRetained: false,
          },
          configurationDisposition: "release-gate-failed",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        applicationReconciliation: "not-applicable",
        registryStateAfter: "empty",
      },
      {
        id: "marker-settlement-result:timestamp-protocol-invalid-throw",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-request:accepted",
        clockFixtureId: "clock:canonical-export-timestamp-throw",
        value: {
          outcome: "timestamp-protocol-invalid",
          code: "export.marker_timestamp_invalid",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          protocolDiagnostic: {
            boundary: "application-clock",
            reason: "threw-or-rejected",
            rawResultRetained: false,
          },
          configurationDisposition: "release-gate-failed",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
        applicationReconciliation: "not-applicable",
        registryStateAfter: "empty",
      },
      {
        id: "marker-settlement-result:unchanged-binding-mismatch-bytes-offered",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        deliveryFixtureId: "delivery:canonical-wrong-bytes-offered",
        orderedCalls: [],
        value: {
          outcome: "unchanged-binding-mismatch",
          code: "export.marker_artifact_mismatch",
          deliveryFixtureId: "delivery:canonical-wrong-bytes-offered",
          a0Publication: null,
          a1Persistence: null,
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:publication-protocol-invalid-unrelated-state",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: ["a0-marker-publication-request:accepted"],
        value: {
          outcome: "publication-protocol-invalid",
          code: "export.marker_publication_result_invalid",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            protocolDiagnostic: {
              boundary: "A0-marker-publication",
              reason: "invalid-envelope-or-binding",
              rawResultRetained: false,
            },
          },
          a1Persistence: null,
          applicationReconciliation: "required",
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:publication-protocol-invalid-throw",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: ["a0-marker-publication-request:accepted"],
        value: {
          outcome: "publication-protocol-invalid",
          code: "export.marker_publication_result_invalid",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            protocolDiagnostic: {
              boundary: "A0-marker-publication",
              reason: "threw-or-rejected",
              rawResultRetained: false,
            },
          },
          a1Persistence: null,
          applicationReconciliation: "required",
          durability: "unchanged",
        },
      },
      {
        id: "marker-settlement-result:persistence-protocol-invalid-rejection",
        kind: "adapter-result",
        operation: "completeCanonicalExportMarkerSettlement",
        requestFixtureId: "marker-settlement-stage-request:accepted",
        publicRequestFixtureId: "marker-settlement-request:accepted",
        orderedCalls: [
          "a0-marker-publication-request:accepted",
          "a1-marker-persistence-handoff:accepted",
        ],
        value: {
          outcome: "persistence-protocol-invalid",
          code: "recovery.marker_persistence_result_invalid",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
          a0Publication: {
            requestFixtureId: "a0-marker-publication-request:accepted",
            resultFixtureId: "a0-marker-publication-normalized:published",
          },
          a1Persistence: {
            handoffFixtureId: "a1-marker-persistence-handoff:accepted",
            protocolDiagnostic: {
              boundary: "A1-marker-persistence",
              reason: "threw-or-rejected",
              rawResultRetained: false,
            },
          },
          durability: "reconciliation-required",
        },
      },
    ],
    "E0_MARKER_SETTLEMENT_RESULT_EXACT_FIXTURES_INVALID",
    "input-fixture-ledger.json.marker-settlement-results",
    "Every marker result must preserve exact field presence versus null, public/internal request bindings, A0 request, A1 handoff, dependency faults, registry settlement, and terminal evidence.",
    findings,
  );
  for (const [fixtureId, expected] of Object.entries(expectedMarkerResults)) {
    requireExact(
      markerResultProjection(fixtureId),
      expected,
      "E0_MARKER_SETTLEMENT_RESULT_FIXTURE_INVALID",
      fixtureId,
      "Marker terminal results must retain exact delivery evidence, state-free A0/A1 receipts, ordering, cleanup classification, and durability.",
      findings,
    );
  }

  const forbiddenPublicStateFields = new Set([
    "state",
    "stateFixtureId",
    "lastKnownState",
    "observedBefore",
    "observedBeforeFixtureId",
    "previousMarker",
    "lastKnownMarker",
  ]);
  for (const [fixtureId, fixture] of inputFixtureById) {
    if (
      !fixtureId.startsWith("marker-settlement-result:") &&
      !fixtureId.startsWith("a0-marker-publication-normalized:")
    ) {
      continue;
    }
    const forbiddenFound = new Set<string>();
    visitObjects(fixture["value"], (record) => {
      for (const key of Object.keys(record)) {
        if (forbiddenPublicStateFields.has(key)) forbiddenFound.add(key);
      }
    });
    if (forbiddenFound.size > 0) {
      addFinding(
        findings,
        "E0_MARKER_PUBLIC_RESULT_STATE_AUTHORITY",
        fixtureId,
        "Public marker results must be state-free; forbidden recursive fields: " +
          [...forbiddenFound].sort(codeUnitCompare).join(", ") +
          ".",
      );
    }
    if (fixtureId.startsWith("marker-settlement-result:")) {
      const publicA0 = objectAt(objectAt(fixture["value"])?.["a0Publication"]);
      const publicA0ResultFixtureId = publicA0?.["resultFixtureId"];
      if (
        typeof publicA0ResultFixtureId === "string" &&
        !publicA0ResultFixtureId.startsWith("a0-marker-publication-normalized:")
      ) {
        addFinding(
          findings,
          "E0_MARKER_PUBLIC_RESULT_RAW_A0_AUTHORITY",
          fixtureId,
          "Public marker results may reference only normalized state-free A0 receipts, never raw A0 state results.",
        );
      }
    }
  }
  requireMarkerFixture(
    "marker-settlement:edit-during-a1-await",
    {
      id: "marker-settlement:edit-during-a1-await",
      kind: "scenario-sequence",
      startingStateFixtureId: "state:marker-current-revision-7",
      steps: [
        {
          ordinal: 1,
          event: "canonical-delivery-completed",
          deliveryFixtureId: "delivery:canonical-fsa-completed",
        },
        {
          ordinal: 2,
          event: "A0-atomic-publication",
          rawResultFixtureId: "a0-marker-publication:published",
          normalizedResultFixtureId:
            "a0-marker-publication-normalized:published",
        },
        {
          ordinal: 3,
          event: "A1-persistence-promise-pending",
          handoffFixtureId: "a1-marker-persistence-handoff:accepted",
        },
        {
          ordinal: 4,
          event: "controller-edit",
          authoritativeStateFixtureId:
            "state:marker-published-then-edited-revision-8",
        },
        {
          ordinal: 5,
          event: "A1-persistence-resolves",
          resultFixtureId: "recovery-marker-persistence:persisted",
        },
        {
          ordinal: 6,
          event: "public-settlement-resolves",
          resultFixtureId: "marker-settlement-result:advanced-persisted",
        },
      ],
      assertions: {
        rawA0ObservedBeforeAndStateValidatedInternally: true,
        rawA0StatesDiscardedBeforePublicResult: true,
        publicResultContainsAppState: false,
        publicResultContainsObservedBefore: false,
        publicResultCanInstallOrRevertState: false,
        authoritativeStateAfterSettlementFixtureId:
          "state:marker-published-then-edited-revision-8",
        a1PersistenceBoundToDeliveredRevision: 7,
        laterEditRevisionPreserved: 8,
      },
    },
    "E0_MARKER_EDIT_DURING_A1_SEQUENCE_INVALID",
    "A0 must atomically publish before A1, and a later controller edit must remain authoritative after the state-free A1/public settlements resolve.",
  );
  requireMarkerFixture(
    "marker-public-result-state-authority-matrix",
    {
      id: "marker-public-result-state-authority-matrix",
      kind: "scenario-matrix",
      rows: [
        {
          id: "advanced-persisted",
          resultFixtureId: "marker-settlement-result:advanced-persisted",
        },
        {
          id: "advanced-persistence-failed",
          resultFixtureId: "marker-settlement-result:advanced-failed",
        },
        {
          id: "advanced-persistence-unavailable",
          resultFixtureId: "marker-settlement-result:advanced-unavailable",
        },
        {
          id: "publication-stale",
          resultFixtureId: "marker-settlement-result:publication-refused-stale",
        },
        {
          id: "publication-failed",
          resultFixtureId:
            "marker-settlement-result:publication-refused-failed",
        },
        {
          id: "persistence-protocol-invalid",
          resultFixtureId:
            "marker-settlement-result:persistence-protocol-invalid",
        },
        {
          id: "edit-during-a1",
          scenarioFixtureId: "marker-settlement:edit-during-a1-await",
        },
      ],
      forbiddenRecursiveFields: [
        "state",
        "stateFixtureId",
        "lastKnownState",
        "observedBefore",
        "observedBeforeFixtureId",
        "previousMarker",
        "lastKnownMarker",
      ],
      expected: {
        rows: 7,
        eachPublicResultContainsAppState: false,
        selectorsRemainSoleCurrentStateSource: true,
        lateA1SettlementCanReinstallHistoricalState: false,
        normalizedA0SuccessFields: ["ok", "outcome", "documentId", "revision"],
        normalizedA0RefusalFields: [
          "ok",
          "outcome",
          "code",
          "observedDocumentId",
          "observedRevision",
        ],
      },
    },
    "E0_MARKER_PUBLIC_RESULT_MATRIX_INVALID",
    "The public result matrix must prove that late A1 completion cannot install historical AppState.",
  );

  const artifactBindingMatrix = inputFixtureById.get(
    "marker-artifact-binding-near-misses",
  );
  requireExact(
    {
      baseRequestFixtureId: artifactBindingMatrix?.["baseRequestFixtureId"],
      rows: recordsAt(artifactBindingMatrix?.["rows"]).map((row) => ({
        id: row["id"],
        fixtureId:
          row["deliveryFixtureId"] ??
          row["requestFixtureId"] ??
          row["candidateFixtureId"],
        mismatchField: row["mismatchField"],
        onlyDifferentPath: row["onlyDifferentPath"] ?? null,
        exactOneFieldNearMiss: row["exactOneFieldNearMiss"] ?? null,
      })),
      expected: artifactBindingMatrix?.["expected"],
    },
    {
      baseRequestFixtureId: "marker-settlement-stage-request:accepted",
      rows: [
        {
          id: "noncanonical-kind",
          fixtureId: "delivery:text-handed-off",
          mismatchField: "artifact.kind",
          onlyDifferentPath: null,
          exactOneFieldNearMiss: false,
        },
        {
          id: "delivery-wrong-document",
          fixtureId: "delivery:canonical-wrong-document",
          mismatchField: "artifact.sourceDocumentId",
          onlyDifferentPath: ["artifact", "sourceDocumentId"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "delivery-wrong-semantic-hash",
          fixtureId: "delivery:canonical-wrong-hash",
          mismatchField: "artifact.semanticDocumentHash",
          onlyDifferentPath: ["artifact", "semanticDocumentHash"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "delivery-wrong-byte-length",
          fixtureId: "delivery:canonical-wrong-length",
          mismatchField: "artifact.byteLength",
          onlyDifferentPath: ["artifact", "byteLength"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "delivery-wrong-filename",
          fixtureId: "delivery:canonical-wrong-filename",
          mismatchField: "artifact.filename",
          onlyDifferentPath: ["artifact", "filename"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "delivery-wrong-bytes-offered",
          fixtureId: "delivery:canonical-wrong-bytes-offered",
          mismatchField: "bytesOffered",
          onlyDifferentPath: ["bytesOffered"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "request-wrong-base-document",
          fixtureId: "marker-settlement-stage-request:wrong-base-document",
          mismatchField: "baseDocumentId",
          onlyDifferentPath: ["baseDocumentId"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "request-wrong-base-revision",
          fixtureId: "marker-settlement-stage-request:wrong-base-revision",
          mismatchField: "baseRevision",
          onlyDifferentPath: ["baseRevision"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "candidate-wrong-kind",
          fixtureId: "marker-candidate:wrong-kind",
          mismatchField: "candidate.artifactKind",
          onlyDifferentPath: ["candidate", "artifactKind"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "candidate-wrong-document",
          fixtureId: "marker-candidate:wrong-document",
          mismatchField: "candidate.sourceDocumentId",
          onlyDifferentPath: ["candidate", "sourceDocumentId"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "candidate-wrong-revision",
          fixtureId: "marker-candidate:wrong-revision",
          mismatchField: "candidate.revision",
          onlyDifferentPath: ["candidate", "revision"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "candidate-wrong-hash",
          fixtureId: "marker-candidate:wrong-hash",
          mismatchField: "candidate.semanticDocumentHash",
          onlyDifferentPath: ["candidate", "semanticDocumentHash"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "candidate-wrong-length",
          fixtureId: "marker-candidate:wrong-length",
          mismatchField: "candidate.byteLength",
          onlyDifferentPath: ["candidate", "byteLength"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "candidate-wrong-filename",
          fixtureId: "marker-candidate:wrong-filename",
          mismatchField: "candidate.filename",
          onlyDifferentPath: ["candidate", "filename"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "candidate-wrong-canonical-policy",
          fixtureId: "marker-candidate:wrong-canonical-policy",
          mismatchField: "candidate.canonicalPolicyVersion",
          onlyDifferentPath: ["candidate", "canonicalPolicyVersion"],
          exactOneFieldNearMiss: null,
        },
        {
          id: "candidate-wrong-semantic-hash-policy",
          fixtureId: "marker-candidate:wrong-semantic-hash-policy",
          mismatchField: "candidate.semanticHashPolicyVersion",
          onlyDifferentPath: ["candidate", "semanticHashPolicyVersion"],
          exactOneFieldNearMiss: null,
        },
      ],
      expected: {
        rows: 16,
        exactOneFieldNearMissRows: 15,
        eachOutcome: "unchanged-binding-mismatch",
        eachCode: "export.marker_artifact_mismatch",
        a0PublicationCallsPerRow: 0,
        a1PersistenceCallsPerRow: 0,
        publicCallerCanInjectAnyRow: false,
      },
    },
    "E0_MARKER_ARTIFACT_BINDING_NEAR_MISSES_INVALID",
    "marker-artifact-binding-near-misses",
    "Every independently checkable delivered/stage/candidate binding field needs an exact refusal, including bytesOffered; exportedAt authority is locked by the strict clock matrix.",
    findings,
  );
  const exactArtifactNearMissRows = recordsAt(
    artifactBindingMatrix?.["rows"],
  ).filter((row) => row["onlyDifferentPath"] !== undefined);
  const exactArtifactNearMissFixtureIds = exactArtifactNearMissRows.map((row) =>
    String(
      row["deliveryFixtureId"] ??
        row["requestFixtureId"] ??
        row["candidateFixtureId"],
    ),
  );
  requireExact(
    exactArtifactNearMissFixtureIds.map((fixtureId) =>
      inputFixtureById.get(fixtureId),
    ),
    [
      {
        id: "delivery:canonical-wrong-document",
        kind: "derived-delivery-result",
        base: {
          fixtureId: "delivery:canonical-blob-handed-off",
        },
        nearMissFrom: "delivery:canonical-blob-handed-off",
        onlyDifferentPath: ["artifact", "sourceDocumentId"],
        orderedMutations: [
          {
            operation: "set",
            path: ["artifact", "sourceDocumentId"],
            from: "document-e0-minimal",
            to: "document-e0-other",
          },
        ],
      },
      {
        id: "delivery:canonical-wrong-hash",
        kind: "derived-delivery-result",
        base: {
          fixtureId: "delivery:canonical-blob-handed-off",
        },
        nearMissFrom: "delivery:canonical-blob-handed-off",
        onlyDifferentPath: ["artifact", "semanticDocumentHash"],
        orderedMutations: [
          {
            operation: "set",
            path: ["artifact", "semanticDocumentHash"],
            from: "c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5",
            to: "0000000000000000000000000000000000000000000000000000000000000000",
          },
        ],
      },
      {
        id: "delivery:canonical-wrong-length",
        kind: "derived-delivery-result",
        base: {
          fixtureId: "delivery:canonical-blob-handed-off",
        },
        nearMissFrom: "delivery:canonical-blob-handed-off",
        onlyDifferentPath: ["artifact", "byteLength"],
        orderedMutations: [
          {
            operation: "set",
            path: ["artifact", "byteLength"],
            from: 352,
            to: 351,
          },
        ],
      },
      {
        id: "delivery:canonical-wrong-filename",
        kind: "derived-delivery-result",
        base: {
          fixtureId: "delivery:canonical-blob-handed-off",
        },
        nearMissFrom: "delivery:canonical-blob-handed-off",
        onlyDifferentPath: ["artifact", "filename"],
        orderedMutations: [
          {
            operation: "set",
            path: ["artifact", "filename"],
            from: "Changes.changes.json",
            to: "Other.changes.json",
          },
        ],
      },
      {
        id: "delivery:canonical-wrong-bytes-offered",
        kind: "derived-delivery-result",
        base: {
          fixtureId: "delivery:canonical-blob-handed-off",
        },
        nearMissFrom: "delivery:canonical-blob-handed-off",
        onlyDifferentPath: ["bytesOffered"],
        orderedMutations: [
          {
            operation: "set",
            path: ["bytesOffered"],
            from: 352,
            to: 351,
          },
        ],
      },
      {
        id: "marker-settlement-stage-request:wrong-base-document",
        kind: "adapter-input",
        visibility: "internal-defensive-proof-only",
        operation: "settleCanonicalExportMarker",
        base: {
          fixtureId: "marker-settlement-stage-request:accepted",
        },
        nearMissFrom: "marker-settlement-stage-request:accepted",
        onlyDifferentPath: ["baseDocumentId"],
        orderedMutations: [
          {
            operation: "set",
            path: ["baseDocumentId"],
            from: "document-e0-minimal",
            to: "document-e0-other",
          },
        ],
      },
      {
        id: "marker-settlement-stage-request:wrong-base-revision",
        kind: "adapter-input",
        visibility: "internal-defensive-proof-only",
        operation: "settleCanonicalExportMarker",
        base: {
          fixtureId: "marker-settlement-stage-request:accepted",
        },
        nearMissFrom: "marker-settlement-stage-request:accepted",
        onlyDifferentPath: ["baseRevision"],
        orderedMutations: [
          {
            operation: "set",
            path: ["baseRevision"],
            from: 7,
            to: 8,
          },
        ],
      },
      {
        id: "marker-candidate:wrong-kind",
        kind: "marker-settlement-parameter",
        base: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
        nearMissFrom: "canonical-marker-candidate-revision-7",
        onlyDifferentPath: ["artifactKind"],
        orderedMutations: [
          {
            operation: "set",
            path: ["artifactKind"],
            from: "canonical-json",
            to: "lead-sheet-text",
          },
        ],
      },
      {
        id: "marker-candidate:wrong-document",
        kind: "marker-settlement-parameter",
        base: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
        nearMissFrom: "canonical-marker-candidate-revision-7",
        onlyDifferentPath: ["sourceDocumentId"],
        orderedMutations: [
          {
            operation: "set",
            path: ["sourceDocumentId"],
            from: "document-e0-minimal",
            to: "document-e0-other",
          },
        ],
      },
      {
        id: "marker-candidate:wrong-revision",
        kind: "marker-settlement-parameter",
        base: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
        nearMissFrom: "canonical-marker-candidate-revision-7",
        onlyDifferentPath: ["revision"],
        orderedMutations: [
          {
            operation: "set",
            path: ["revision"],
            from: 7,
            to: 8,
          },
        ],
      },
      {
        id: "marker-candidate:wrong-hash",
        kind: "marker-settlement-parameter",
        base: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
        nearMissFrom: "canonical-marker-candidate-revision-7",
        onlyDifferentPath: ["semanticDocumentHash"],
        orderedMutations: [
          {
            operation: "set",
            path: ["semanticDocumentHash"],
            from: "c73321857e0ad8cc6ac03961ec872d456090d190d2d5c1a659883259c7f20fe5",
            to: "0000000000000000000000000000000000000000000000000000000000000000",
          },
        ],
      },
      {
        id: "marker-candidate:wrong-length",
        kind: "marker-settlement-parameter",
        base: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
        nearMissFrom: "canonical-marker-candidate-revision-7",
        onlyDifferentPath: ["byteLength"],
        orderedMutations: [
          {
            operation: "set",
            path: ["byteLength"],
            from: 352,
            to: 351,
          },
        ],
      },
      {
        id: "marker-candidate:wrong-filename",
        kind: "marker-settlement-parameter",
        base: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
        nearMissFrom: "canonical-marker-candidate-revision-7",
        onlyDifferentPath: ["filename"],
        orderedMutations: [
          {
            operation: "set",
            path: ["filename"],
            from: "Changes.changes.json",
            to: "Other.changes.json",
          },
        ],
      },
      {
        id: "marker-candidate:wrong-canonical-policy",
        kind: "marker-settlement-parameter",
        base: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
        nearMissFrom: "canonical-marker-candidate-revision-7",
        onlyDifferentPath: ["canonicalPolicyVersion"],
        orderedMutations: [
          {
            operation: "set",
            path: ["canonicalPolicyVersion"],
            from: 1,
            to: 2,
          },
        ],
      },
      {
        id: "marker-candidate:wrong-semantic-hash-policy",
        kind: "marker-settlement-parameter",
        base: {
          sharedBase: "canonical-marker-candidate-revision-7",
        },
        nearMissFrom: "canonical-marker-candidate-revision-7",
        onlyDifferentPath: ["semanticHashPolicyVersion"],
        orderedMutations: [
          {
            operation: "set",
            path: ["semanticHashPolicyVersion"],
            from: 1,
            to: 2,
          },
        ],
      },
    ],
    "E0_MARKER_ARTIFACT_NEAR_MISS_FIXTURES_INVALID",
    "marker-artifact-binding-near-misses.referenced-fixtures",
    "All fifteen declared one-field artifact, internal request, and derived candidate near misses must retain their exact fixture definitions.",
    findings,
  );
  for (const [index, row] of exactArtifactNearMissRows.entries()) {
    const fixtureId = exactArtifactNearMissFixtureIds[index];
    const fixture =
      fixtureId === undefined ? undefined : inputFixtureById.get(fixtureId);
    const mutations = recordsAt(fixture?.["orderedMutations"]);
    const mutation = mutations[0];
    const matrixPath = row["onlyDifferentPath"];
    const fixturePath = fixture?.["onlyDifferentPath"];
    const mutationPath = mutation?.["path"];
    const candidateFixture = typeof row["candidateFixtureId"] === "string";
    const localMatrixPath =
      candidateFixture && Array.isArray(matrixPath)
        ? matrixPath.slice(1)
        : matrixPath;
    const baseReference = objectAt(fixture?.["base"]);
    const fixtureBaseId = baseReference?.["fixtureId"];
    const sharedBaseId = baseReference?.["sharedBase"];
    const expectedNearMissFrom =
      typeof fixtureBaseId === "string" ? fixtureBaseId : sharedBaseId;
    const basePayload =
      typeof fixtureBaseId === "string"
        ? materializeInputFixturePayload(
            fixtureBaseId,
            inputFixtureById,
            sharedBases,
          )
        : typeof sharedBaseId === "string"
          ? objectAt(
              expandSharedBaseReferences(
                { sharedBase: sharedBaseId },
                sharedBases,
              ),
            )
          : null;
    const derivedPayload =
      fixtureId === undefined
        ? null
        : materializeInputFixturePayload(
            fixtureId,
            inputFixtureById,
            sharedBases,
          );
    const beforeForDiff =
      candidateFixture && basePayload !== null
        ? { candidate: basePayload }
        : basePayload;
    const afterForDiff =
      candidateFixture && derivedPayload !== null
        ? { candidate: derivedPayload }
        : derivedPayload;
    const computedDiffPaths =
      beforeForDiff === null || afterForDiff === null
        ? []
        : jsonDiffPaths(beforeForDiff, afterForDiff);
    if (
      fixture === undefined ||
      mutations.length !== 1 ||
      mutation === undefined ||
      mutation["operation"] !== "set" ||
      !isNonemptyPropertyPath(matrixPath) ||
      !isNonemptyPropertyPath(fixturePath) ||
      !isNonemptyPropertyPath(mutationPath) ||
      !sameJson(fixturePath, localMatrixPath) ||
      !sameJson(mutationPath, localMatrixPath) ||
      fixture["nearMissFrom"] !== expectedNearMissFrom ||
      basePayload === null ||
      derivedPayload === null ||
      !sameJson(
        valueAtPropertyPath(basePayload, mutationPath),
        mutation["from"],
      ) ||
      !sameJson(
        valueAtPropertyPath(derivedPayload, mutationPath),
        mutation["to"],
      ) ||
      sameJson(mutation["from"], mutation["to"]) ||
      !sameJson(computedDiffPaths, [matrixPath]) ||
      row["mismatchField"] !== matrixPath.join(".")
    ) {
      addFinding(
        findings,
        "E0_MARKER_ARTIFACT_NEAR_MISS_MATERIALIZATION_INVALID",
        "marker-artifact-binding-near-misses." + String(row["id"]),
        "Each declared exact near miss must resolve one base, apply one real set mutation from the observed value to a different value, and produce exactly the matrix path.",
      );
    }
  }
  requireMarkerFixture(
    "marker-handoff-binding-near-misses",
    {
      id: "marker-handoff-binding-near-misses",
      kind: "scenario-matrix",
      baseA0FixtureId: "a0-marker-publication-request:accepted",
      baseA1FixtureId: "a1-marker-persistence-handoff:accepted",
      rows: [
        {
          id: "a0-wrong-document",
          path: ["publication", "documentId"],
          from: "document-e0-minimal",
          to: "document-e0-other",
        },
        {
          id: "a0-wrong-revision",
          path: ["publication", "revision"],
          from: 7,
          to: 8,
        },
        {
          id: "a1-wrong-document",
          path: ["artifact", "sourceDocumentId"],
          from: "document-e0-minimal",
          to: "document-e0-other",
        },
        {
          id: "a1-wrong-filename",
          path: ["artifact", "filename"],
          from: "Changes.changes.json",
          to: "Other.changes.json",
        },
        {
          id: "a1-wrong-byte-length",
          path: ["artifact", "byteLength"],
          from: 352,
          to: 351,
        },
        {
          id: "a1-wrong-semantic-hash",
          path: ["artifact", "semanticDocumentHash"],
          from: markerHash,
          to: "0000000000000000000000000000000000000000000000000000000000000000",
        },
        {
          id: "a1-wrong-canonical-policy",
          path: ["artifact", "canonicalPolicyVersion"],
          from: 1,
          to: 2,
        },
        {
          id: "a1-wrong-semantic-hash-policy",
          path: ["artifact", "semanticHashPolicyVersion"],
          from: 1,
          to: 2,
        },
      ],
      expected: {
        a1QueuedBeforeA0Success: false,
        currentMarkerPresentedBeforeA0Success: false,
        everyRowRejected: true,
      },
    },
    "E0_MARKER_HANDOFF_NEAR_MISSES_INVALID",
    "A0/A1 binding and ordering near misses must be exact and independently rejected.",
  );
  const markerCaseProjections: Readonly<Record<string, JsonObject>> = {
    "E0-WF-008": {
      inputFixtureIds: [
        "preview:base-revision-7",
        "confirm:current-revision-8",
      ],
      resultCategory: "STALE_IGNORED",
      failureStage: "replacement-preflight",
      expectedIssueCodes: ["import.confirmation_stale"],
      expectedRelation:
        "stale-base-revision-is-refused-by-A0-preparation-before-capability-allocation-or-X1",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        x1AdapterCalls: 0,
        preparedCapabilitiesAllocated: 0,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 0,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        commands: 0,
        historyEntries: 0,
      },
      terminationReason: "ignored-stale",
      expectedMutationKills: ["E0-MUT-039"],
    },
    "E0-WF-013": {
      inputFixtureIds: [
        "state:retiring-explicitly-unavailable",
        "preview:explicitly-unavailable",
        "transition:retiring-explicitly-unavailable",
        "confirmation:null",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "replacement-preflight",
      expectedIssueCodes: ["history.nonundoable_confirmation_required"],
      expectedRelation:
        "missing-confirmation-creates-no-command-and-preserves-current-state",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        x1AdapterCalls: 0,
        preparedCapabilitiesAllocated: 0,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 0,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        replaceCommands: 0,
        historyEntries: 0,
      },
      terminationReason: "complete-refusal",
      expectedMutationKills: ["E0-MUT-071"],
    },
    "E0-WF-015": {
      inputFixtureIds: [
        "state:retiring-canonical-impact-mismatch",
        "preview:ready",
        "transition:retiring",
        "history:retained-entry",
        "replacement-impact:bookmark-drift-reassessment",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "replacement-preflight",
      expectedIssueCodes: ["import.confirmation_impact_mismatch"],
      expectedRelation:
        "bookmark-only-drift-keeps-document-revision-request-identical-but-recomputation-differs-exactly-at-historyEntryRetainedBytes-and-undoRetainedBytesAfterCommit-so-no-command-is-constructed",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        previewImpactAssessments: 1,
        confirmationImpactAssessments: 1,
        x1AdapterCalls: 0,
        preparedCapabilitiesAllocated: 0,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 0,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        replaceCommands: 0,
      },
      terminationReason: "complete-refusal",
      expectedMutationKills: ["E0-MUT-071", "E0-MUT-074"],
    },
    "E0-WF-018": {
      inputFixtureIds: [
        "state:retiring-explicitly-unavailable",
        "preview:explicitly-unavailable",
        "transition:retiring-explicitly-unavailable",
        "confirmation:wrong",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "replacement-preflight",
      expectedIssueCodes: ["import.confirmation_identity_mismatch"],
      expectedRelation:
        "wrong-confirmation-identity-creates-no-command-and-preserves-current-state",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        x1AdapterCalls: 0,
        preparedCapabilitiesAllocated: 0,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 0,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        replaceCommands: 0,
        historyEntries: 0,
      },
      terminationReason: "complete-refusal",
      expectedMutationKills: ["E0-MUT-071"],
    },
    "E0-WF-019": {
      inputFixtureIds: [
        "transport-handoff:canonical:playing",
        "preview:ready",
        "transition:retiring",
        "prepared-import-replacement:canonical-playing",
        "discard-prepared-import-replacement:canonical-playing",
        "x1-adapter:unavailable",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "transport-retirement",
      expectedIssueCodes: ["transport.replacement_retirement_unavailable"],
      expectedRelation:
        "unbound-X1-adapter-returns-a-no-effect-refusal-and-A0-invalidates-the-preparation-by-original-request-identity-before-return-with-no-publication-handoff-or-command",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        x1AdapterCalls: 1,
        runtimeX1EvidenceMaterialized: 0,
        preparedCapabilitiesAllocated: 1,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 1,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        replaceCommands: 0,
        historyEntries: 0,
      },
      terminationReason: "complete-refusal",
      expectedMutationKills: ["E0-MUT-040"],
    },
    "E0-WF-020": {
      inputFixtureIds: [
        "transport-handoff:canonical:playing",
        "preview:canonical",
        "transition:retiring",
        "prepared-import-replacement:canonical-playing",
        "invalidate-prepared-import-replacement:retirement-protocol-invalid",
        "x1-evidence-near-miss:no-future-attack-false",
        "confirmation:null",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "transport-retirement-evidence",
      expectedIssueCodes: ["transport.replacement_retirement_evidence_invalid"],
      expectedRelation:
        "exact-request-echo-differs-only-at-noFutureAttack-and-requires-safe-transport-reconciliation-without-publication",
      stateEffect: "TRANSPORT_RECONCILIATION_REQUIRED",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        x1AdapterCalls: 1,
        invalidEvidenceResults: 1,
        transportReconciliationsRequired: 1,
        preparedCapabilitiesAllocated: 1,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 1,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        replaceCommands: 0,
        historyEntries: 0,
      },
      terminationReason: "adapter-protocol-breach-reconciliation-required",
      expectedMutationKills: ["E0-MUT-040", "E0-MUT-048", "E0-MUT-078"],
    },
    "E0-WF-021": {
      inputFixtureIds: [
        "transport-handoff:canonical:playing",
        "preview:canonical",
        "transition:retiring",
        "prepared-import-replacement:canonical-playing",
        "discard-prepared-import-replacement:canonical-playing",
        "x1-adapter:stale-no-effect",
        "confirmation:null",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "transport-retirement",
      expectedIssueCodes: ["transport.replacement_retirement_stale"],
      expectedRelation:
        "composition-bound-X1-stale-no-effect-refusal-invalidates-by-original-request-identity-before-return-without-publication",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        confirmationImpactAssessments: 1,
        x1AdapterCalls: 1,
        x1NoEffectRefusals: 1,
        runtimeX1EvidenceMaterialized: 0,
        preparedCapabilitiesAllocated: 1,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 1,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        replaceCommands: 0,
        historyEntries: 0,
      },
      terminationReason: "complete-refusal",
      expectedMutationKills: ["E0-MUT-040"],
    },
    "E0-WF-022": {
      inputFixtureIds: [
        "state:retiring-explicitly-unavailable-wrong-document",
        "preview:explicitly-unavailable",
        "transition:retiring-explicitly-unavailable",
        "confirmation:matching",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "replacement-preflight",
      expectedIssueCodes: ["import.confirmation_wrong_document"],
      expectedRelation:
        "current-AppState-document-differs-from-the-preview-and-confirmation-document-and-is-refused-before-impact-reassessment-capability-allocation-or-X1",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        confirmationImpactAssessments: 0,
        x1AdapterCalls: 0,
        preparedCapabilitiesAllocated: 0,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 0,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        replaceCommands: 0,
        historyEntries: 0,
      },
      terminationReason: "complete-refusal",
      expectedMutationKills: ["E0-MUT-045"],
    },
    "E0-WF-023": {
      inputFixtureIds: [
        "transport-handoff:canonical:playing",
        "preview:canonical",
        "transition:retiring",
        "a0-preparation:impact-unavailable",
        "confirmation:null",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "replacement-preflight",
      expectedIssueCodes: ["import.replacement_impact_unavailable"],
      expectedRelation:
        "commit-time-A0-impact-reassessment-refuses-before-capability-allocation-retirement-or-publication",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        confirmationImpactAssessments: 1,
        x1AdapterCalls: 0,
        preparedCapabilitiesAllocated: 0,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 0,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        replaceCommands: 0,
        historyEntries: 0,
      },
      terminationReason: "complete-refusal",
      expectedMutationKills: ["E0-MUT-074"],
    },
    "E0-WF-024": {
      inputFixtureIds: [
        "transport-handoff:canonical:playing",
        "preview:canonical",
        "transition:retiring",
        "a0-preparation:protocol-invalid-wrong-format",
        "invalidate-prepared-import-replacement:preparation-protocol-invalid",
        "confirmation:null",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "replacement-preparation-result",
      expectedIssueCodes: ["import.replacement_preparation_result_invalid"],
      expectedRelation:
        "malformed-A0-preparation-binding-is-never-trusted-for-cleanup-and-request-identity-invalidation-proves-zero-live-capabilities-before-X1",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        preparationProtocolInvalidResults: 1,
        x1AdapterCalls: 0,
        preparedCapabilitiesAllocated: 1,
        preparedCapabilitiesConsumed: 0,
        preparedCapabilitiesInvalidatedByRequest: 1,
        livePreparedCapabilities: 0,
        replacementHandoffs: 0,
        replaceCommands: 0,
        historyEntries: 0,
      },
      terminationReason: "preparation-protocol-invalid",
      expectedMutationKills: ["E0-MUT-078"],
    },
    "E0-WF-025": {
      inputFixtureIds: [
        "transport-handoff:canonical:playing",
        "preview:canonical",
        "transition:retiring",
        "prepared-import-replacement:canonical-playing",
        "x1-evidence-expectation:no-future-attack",
        "import-replacement-publication-handoff:canonical-playing",
        "a0-replacement-publication:protocol-invalid-missing-state",
        "invalidate-prepared-import-replacement:publication-protocol-invalid",
        "confirmation:null",
      ],
      resultCategory: "REPLACEMENT_COMMIT_REFUSED",
      failureStage: "replacement-publication-result",
      expectedIssueCodes: ["import.replacement_publication_result_invalid"],
      expectedRelation:
        "after-valid-X1-evidence-a-malformed-A0-publication-result-exposes-no-claimed-post-state-invalidates-by-request-and-requires-application-plus-transport-reconciliation",
      stateEffect: "APPLICATION_TRANSPORT_RECONCILIATION_REQUIRED",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        preparationPortCalls: 1,
        x1AdapterCalls: 1,
        validX1EvidenceResults: 1,
        publicationPortCalls: 1,
        publicationProtocolInvalidResults: 1,
        preparedCapabilitiesAllocated: 1,
        preparedCapabilitiesInvalidatedByRequest: 1,
        livePreparedCapabilities: 0,
        applicationTransportReconciliationsRequired: 1,
      },
      terminationReason: "publication-protocol-invalid-reconciliation-required",
      expectedMutationKills: ["E0-MUT-078"],
    },
    "E0-MK-001": {
      authorityIds: ["E0-AUTH-PLAN", "E0-AUTH-A0", "E0-AUTH-A1"],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-USER-GESTURE"],
      proofKinds: ["positive", "transaction", "adapter"],
      inputFixtureIds: [
        "canonical-export-preparation-request:revision-7",
        "prepared-canonical-export-delivery:revision-7",
        "prepared-export-delivery-request:revision-7-fsa",
        "canonical-export-preparation-result:prepared-revision-7",
        "a0-state-identity:revision-7",
        "prepared-delivery-start-trace:fsa",
        "delivery:canonical-fsa-completed",
        "binding:exact",
        "marker-settlement-request:accepted",
        "clock:canonical-export-timestamp-valid",
        "marker-settlement-stage-request:accepted",
        "a0-marker-publication-request:accepted",
        "a0-marker-publication:published",
        "a0-marker-publication-normalized:published",
        "a1-marker-persistence-handoff:accepted",
        "recovery-marker-persistence:persisted",
        "marker-settlement-result:advanced-persisted",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: null,
      expectedIssueCodes: [],
      expectedRelation:
        "settlement-emits-exact-A0-publication-and-A1-persistence-handoffs-A0-publishes-before-marker-is-presented-current",
      stateEffect: "MARKER_ONLY",
      markerEffect: "ADVANCED_TO_BASE_REVISION",
      exactStageCounts: {
        preparationCalls: 1,
        privateRegistryTakes: 1,
        synchronousDeliveryStarts: 1,
        markerSettlements: 1,
        a0PublicationHandoffs: 1,
        a0Publications: 1,
        directExportRevisionWrites: 0,
        a1PersistenceHandoffs: 1,
        a1PersistenceQueues: 1,
        durableReloadClaims: 1,
        terminalRegistryEntries: 0,
      },
      terminationReason: "advanced-recovery-persisted",
      expectedMutationKills: [
        "E0-MUT-049",
        "E0-MUT-055",
        "E0-MUT-058",
        "E0-MUT-060",
      ],
    },
    "E0-MK-002": {
      authorityIds: [
        "E0-AUTH-WHATWG-DOWNLOAD",
        "E0-AUTH-E0-DECISIONS",
        "E0-AUTH-A0",
        "E0-AUTH-A1",
      ],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-USER-GESTURE"],
      proofKinds: ["positive", "transaction", "near-miss"],
      inputFixtureIds: [
        "canonical-export-preparation-request:revision-7",
        "prepared-canonical-export-delivery:revision-7",
        "prepared-export-delivery-request:revision-7-blob",
        "canonical-export-preparation-result:prepared-revision-7",
        "a0-state-identity:revision-7",
        "prepared-delivery-start-trace:blob",
        "delivery:canonical-blob-handed-off",
        "binding:exact",
        "marker-settlement-request:blob-handed-off",
        "clock:canonical-export-timestamp-valid",
        "marker-settlement-stage-request:blob-handed-off",
        "a0-marker-publication-request:accepted",
        "a0-marker-publication:published",
        "a0-marker-publication-normalized:published",
        "a1-marker-persistence-handoff:accepted",
        "recovery-marker-persistence:persisted",
        "marker-settlement-result:advanced-persisted-blob",
      ],
      resultCategory: "DOWNLOAD_HANDED_OFF",
      failureStage: null,
      expectedIssueCodes: [],
      expectedRelation:
        "object-URL-handoff-uses-the-blob-bound-settlement-request-and-advances-only-after-A0-publication-and-A1-persistence",
      stateEffect: "MARKER_ONLY",
      markerEffect: "ADVANCED_TO_BASE_REVISION",
      exactStageCounts: {
        preparationCalls: 1,
        privateRegistryTakes: 1,
        synchronousDeliveryStarts: 1,
        markerSettlements: 1,
        a0PublicationHandoffs: 1,
        a0Publications: 1,
        directExportRevisionWrites: 0,
        a1PersistenceHandoffs: 1,
        a1PersistenceQueues: 1,
        durableDiskClaims: 0,
        durableReloadClaims: 1,
        terminalRegistryEntries: 0,
      },
      terminationReason: "advanced-recovery-persisted",
      expectedMutationKills: [
        "E0-MUT-049",
        "E0-MUT-055",
        "E0-MUT-058",
        "E0-MUT-060",
      ],
    },
    "E0-MK-003": {
      authorityIds: ["E0-AUTH-PLAN", "E0-AUTH-FSA"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "cancellation", "transaction"],
      inputFixtureIds: [
        "canonical-export-preparation-result:prepared-revision-7",
        "prepared-canonical-export-delivery:revision-7",
        "a0-state-identity:revision-7",
        "prepared-delivery-start-trace:fsa",
        "delivery:cancelled",
        "marker-settlement-request:cancelled",
        "marker-settlement-result:unchanged-cancelled",
      ],
      resultCategory: "DOWNLOAD_CANCELLED",
      failureStage: "delivery",
      expectedIssueCodes: [],
      expectedRelation:
        "cancelled-delivery-is-retained-publicly-consumes-and-zeroes-the-private-entry-and-calls-neither-A0-nor-A1",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        privateRegistryConsumes: 1,
        terminalRegistryEntries: 0,
        markerAdvances: 0,
        a0PublicationHandoffs: 0,
        a1PersistenceHandoffs: 0,
        markerPersistenceQueues: 0,
      },
      terminationReason: "unchanged-cancelled",
      expectedMutationKills: ["E0-MUT-056"],
    },
    "E0-MK-004": {
      authorityIds: ["E0-AUTH-PLAN", "E0-AUTH-E0-DECISIONS"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "near-miss", "transaction"],
      inputFixtureIds: [
        "delivery:text-handed-off",
        "delivery:canonical-wrong-document",
        "delivery:canonical-wrong-hash",
        "delivery:canonical-wrong-length",
        "delivery:canonical-wrong-filename",
        "delivery:canonical-wrong-bytes-offered",
        "marker-artifact-binding-near-misses",
        "marker-settlement-request:binding-mismatch",
        "marker-settlement-result:unchanged-binding-mismatch",
        "marker-settlement-result:unchanged-binding-mismatch-bytes-offered",
      ],
      resultCategory: "DOWNLOAD_FAILED_CLEAN",
      failureStage: "marker-settlement",
      expectedIssueCodes: ["export.marker_artifact_mismatch"],
      expectedRelation:
        "sixteen-literal-success-stage-binding-near-misses-including-bytesOffered-retain-delivery-observation-and-call-neither-A0-nor-A1-while-exportedAt-authority-is-proved-by-the-strict-clock-matrix",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        bindingComparisons: 16,
        markerAdvances: 0,
        a0PublicationHandoffs: 0,
        a1PersistenceHandoffs: 0,
      },
      terminationReason: "unchanged-binding-mismatch",
      expectedMutationKills: [
        "E0-MUT-057",
        "E0-MUT-059",
        "E0-MUT-060",
        "E0-MUT-072",
      ],
    },
    "E0-MK-005": {
      authorityIds: ["E0-AUTH-A0", "E0-AUTH-PLAN"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "stale", "transaction"],
      inputFixtureIds: [
        "prepared-canonical-export-delivery:revision-7",
        "state:marker-current-revision-8",
        "a0-state-identity:revision-8",
        "marker-settlement-request:state-edit-invalidates",
        "marker-settlement-result:prepared-export-stale",
      ],
      resultCategory: "EXPORT_DELIVERY_PREPARATION_STALE",
      failureStage: "prepared-registry-take",
      expectedIssueCodes: ["export.prepared_canonical_stale"],
      expectedRelation:
        "latest-identity-revision-8-discards-and-zeroes-the-revision-7-private-entry-before-any-browser-or-marker-call",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        latestIdentityReads: 1,
        stalePreparedEntriesDiscarded: 1,
        privateByteArraysZeroed: 1,
        browserStarts: 0,
        markerAdvances: 0,
        a0PublicationHandoffs: 0,
        a1PersistenceHandoffs: 0,
      },
      terminationReason: "prepared-export-stale",
      expectedMutationKills: ["E0-MUT-058"],
    },
    "E0-MK-006": {
      authorityIds: ["E0-AUTH-PLAN", "E0-AUTH-A0", "E0-AUTH-A1"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "transaction", "adapter"],
      inputFixtureIds: [
        "marker:accepted",
        "marker-settlement-request:accepted",
        "a0-marker-publication-request:accepted",
        "a0-marker-publication:published",
        "a1-marker-persistence-handoff:accepted",
        "recovery-marker-persistence:failed",
        "marker-settlement-result:advanced-failed",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: null,
      expectedIssueCodes: ["recovery.marker_persistence_failed"],
      expectedRelation:
        "in-memory-marker-remains-accurate-durability-is-pending-failed-and-reload-survival-is-not-claimed",
      stateEffect: "MARKER_ONLY",
      markerEffect: "ADVANCED_TO_BASE_REVISION",
      exactStageCounts: {
        markerAdvances: 1,
        a0Publications: 1,
        a1PersistenceHandoffs: 1,
        a1PersistenceFailures: 1,
        durableReloadClaims: 0,
        warnings: 1,
      },
      terminationReason: "advanced-persistence-failed",
      expectedMutationKills: ["E0-MUT-060", "E0-MUT-061"],
    },
    "E0-MK-007": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "stale", "transaction", "adapter"],
      inputFixtureIds: [
        "canonical-export-preparation-result:prepared-revision-7",
        "prepared-canonical-export-delivery:revision-7",
        "a0-state-identity:revision-7",
        "prepared-delivery-start-trace:fsa",
        "delivery:canonical-fsa-completed",
        "state:marker-current-revision-8",
        "marker:accepted",
        "marker-settlement-request:stale-revision",
        "marker-settlement-stage-request:edit-during-picker",
        "a0-marker-publication-request:accepted",
        "a0-marker-publication:stale",
        "a0-marker-publication-normalized:stale",
        "marker-settlement-result:publication-refused-stale",
        "marker-settlement-result:publication-refused-stale-document",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: "marker-publication",
      expectedIssueCodes: ["export.marker_publication_stale"],
      expectedRelation:
        "rev7-artifact-delivery-is-retained-while-atomic-A0-CAS-observes-edited-rev8-refuses-stale-and-A1-is-not-queued",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        a0PublicationHandoffs: 1,
        a0PublicationRefusals: 1,
        deliveredRevision7Observations: 1,
        authoritativeRevision8StatesPreserved: 1,
        directExportRevisionWrites: 0,
        a1PersistenceQueues: 0,
        presentedCurrentMarkers: 0,
      },
      terminationReason: "publication-refused-stale",
      expectedMutationKills: ["E0-MUT-058"],
    },
    "E0-MK-008": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0", "E0-AUTH-A1"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "transaction", "adapter"],
      inputFixtureIds: [
        "marker:accepted",
        "marker-settlement-request:accepted",
        "a0-marker-publication-request:accepted",
        "a0-marker-publication:published",
        "a1-marker-persistence-handoff:accepted",
        "recovery-marker-persistence:unavailable",
        "marker-settlement-result:advanced-unavailable",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: null,
      expectedIssueCodes: ["recovery.marker_persistence_unavailable"],
      expectedRelation:
        "A0-published-in-memory-marker-remains-accurate-but-durability-is-pending-failed-and-reload-survival-is-not-claimed",
      stateEffect: "MARKER_ONLY",
      markerEffect: "ADVANCED_TO_BASE_REVISION",
      exactStageCounts: {
        a0Publications: 1,
        a1PersistenceHandoffs: 1,
        a1UnavailableCompletions: 1,
        durableReloadClaims: 0,
        warnings: 1,
      },
      terminationReason: "advanced-persistence-unavailable",
      expectedMutationKills: ["E0-MUT-060", "E0-MUT-061"],
    },
    "E0-MK-009": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0", "E0-AUTH-A1"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["positive", "transaction", "adapter"],
      inputFixtureIds: [
        "marker:accepted",
        "marker-settlement-request:accepted",
        "a0-marker-publication-request:accepted",
        "a0-marker-publication:published",
        "a1-marker-persistence-handoff:accepted",
        "recovery-marker-persistence:persisted",
        "marker-settlement-result:advanced-persisted",
        "marker-handoff-binding-near-misses",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: null,
      expectedIssueCodes: [],
      expectedRelation:
        "recovery-persisted-durability-is-claimed-only-after-A1-success-for-the-exact-handoff-marker",
      stateEffect: "MARKER_ONLY",
      markerEffect: "ADVANCED_TO_BASE_REVISION",
      exactStageCounts: {
        a0Publications: 1,
        a1PersistenceHandoffs: 1,
        a1PersistenceSuccesses: 1,
        durableReloadClaims: 1,
      },
      terminationReason: "advanced-recovery-persisted",
      expectedMutationKills: ["E0-MUT-060", "E0-MUT-061"],
    },
    "E0-MK-010": {
      authorityIds: ["E0-AUTH-PLAN", "E0-AUTH-FSA"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "transaction"],
      inputFixtureIds: [
        "delivery:failed",
        "marker-settlement-request:failed",
        "marker-settlement-result:unchanged-failed",
      ],
      resultCategory: "DOWNLOAD_FAILED_CLEAN",
      failureStage: "delivery",
      expectedIssueCodes: ["export.delivery_write_failed"],
      expectedRelation:
        "failed-delivery-is-retained-publicly-consumes-and-zeroes-the-private-entry-and-calls-neither-A0-nor-A1",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        privateRegistryConsumes: 1,
        terminalRegistryEntries: 0,
        markerAdvances: 0,
        a0PublicationHandoffs: 0,
        a1PersistenceHandoffs: 0,
        markerPersistenceQueues: 0,
      },
      terminationReason: "unchanged-failed",
      expectedMutationKills: ["E0-MUT-056"],
    },
    "E0-MK-011": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "transaction", "adapter"],
      inputFixtureIds: [
        "marker:accepted",
        "marker-settlement-request:accepted",
        "a0-marker-publication-request:accepted",
        "a0-marker-publication:failed",
        "marker-settlement-result:publication-refused-failed",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: "marker-publication",
      expectedIssueCodes: ["export.marker_publication_failed"],
      expectedRelation:
        "A0-publication-failure-returns-only-a-state-free-observation-and-makes-zero-A1-calls",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        a0PublicationHandoffs: 1,
        a0PublicationRefusals: 1,
        a1PersistenceQueues: 0,
        presentedCurrentMarkers: 0,
      },
      terminationReason: "publication-refused-failed",
      expectedMutationKills: ["E0-MUT-058"],
    },
    "E0-MK-012": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "near-miss", "adapter"],
      inputFixtureIds: [
        "marker:accepted",
        "marker-settlement-request:accepted",
        "a0-marker-publication-request:accepted",
        "a0-marker-publication:protocol-invalid",
        "marker-settlement-result:publication-protocol-invalid",
        "a0-marker-publication:protocol-invalid-unrelated-state",
        "marker-settlement-result:publication-protocol-invalid-unrelated-state",
        "a0-marker-publication:synchronous-throw",
        "marker-settlement-result:publication-protocol-invalid-throw",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: "marker-publication-result",
      expectedIssueCodes: ["export.marker_publication_result_invalid"],
      expectedRelation:
        "wrong-export-revision-unrelated-state-mutation-and-synchronous-throw-are-three-distinct-A0-protocol-invalid-rows-each-requiring-application-reconciliation-and-zero-A1-calls",
      stateEffect: "APPLICATION_RECONCILIATION_REQUIRED",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        a0ProtocolInvalidRows: 3,
        a0PublicationHandoffsPerRow: 1,
        a1PersistenceQueuesPerRow: 0,
        presentedCurrentMarkersPerRow: 0,
      },
      terminationReason: "publication-protocol-invalid",
      expectedMutationKills: ["E0-MUT-058", "E0-MUT-078"],
    },
    "E0-MK-013": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0", "E0-AUTH-A1"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "near-miss", "adapter"],
      inputFixtureIds: [
        "marker:accepted",
        "marker-settlement-request:accepted",
        "a0-marker-publication-request:accepted",
        "a0-marker-publication:published",
        "a1-marker-persistence-handoff:accepted",
        "recovery-marker-persistence:protocol-invalid",
        "marker-settlement-result:persistence-protocol-invalid",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: "marker-persistence-result",
      expectedIssueCodes: ["recovery.marker_persistence_result_invalid"],
      expectedRelation:
        "A0-marker-remains-current-but-malformed-A1-success-requires-recovery-reconciliation-and-makes-no-durability-claim",
      stateEffect: "RECOVERY_RECONCILIATION_REQUIRED",
      markerEffect: "ADVANCED_TO_BASE_REVISION",
      exactStageCounts: {
        a0Publications: 1,
        a1PersistenceHandoffs: 1,
        a1ProtocolInvalidResults: 1,
        durableReloadClaims: 0,
        recoveryReconciliationsRequired: 1,
      },
      terminationReason: "persistence-protocol-invalid",
      expectedMutationKills: ["E0-MUT-060", "E0-MUT-061", "E0-MUT-078"],
    },
    "E0-MK-014": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0", "E0-AUTH-PLAN"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["positive", "transaction", "resource-bound"],
      inputFixtureIds: [
        "canonical-export-preparation-request:revision-7",
        "a0-state-identity:revision-7",
        "prepared-canonical-export-delivery:revision-7",
        "canonical-export-preparation-result:prepared-revision-7",
        "prepared-registry:one-ready-entry",
      ],
      resultCategory: "EXPORT_DELIVERY_PREPARED",
      failureStage: null,
      expectedIssueCodes: [],
      expectedRelation:
        "preparation-returns-only-nonauthoritative-binding-metadata-while-one-text-free-private-byte-entry-remains-ready",
      stateEffect: "EXPORT_PREPARATION_ONLY",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        registryBegins: 1,
        canonicalEncoderCalls: 1,
        latestIdentityReads: 1,
        privateByteCopies: 1,
        publicPrivateByteFields: 0,
        liveReadyEntries: 1,
      },
      terminationReason: "prepared-ready",
      expectedMutationKills: ["E0-MUT-083"],
    },
    "E0-MK-015": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-PLAN"],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-FAILURE-ISOLATION"],
      proofKinds: ["negative", "adapter", "transaction"],
      inputFixtureIds: [
        "canonical-export-preparation-request:revision-7",
        "E0-FAULT-HASH-REJECTED",
        "canonical-export-preparation-result:canonical-refused",
      ],
      resultCategory: "EXPORT_DELIVERY_PREPARATION_REFUSED",
      failureStage: "canonical-export-preparation",
      expectedIssueCodes: ["export.hash_unavailable"],
      expectedRelation:
        "canonical-export-refusal-is-forwarded-with-no-partial-prepared-entry-or-private-bytes",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        canonicalEncoderCalls: 1,
        preparedEntriesPublished: 0,
        livePrivateByteArrays: 0,
        browserStarts: 0,
        a0PublicationCalls: 0,
        a1PersistenceCalls: 0,
      },
      terminationReason: "canonical-export-refused",
      expectedMutationKills: ["E0-MUT-082"],
    },
    "E0-MK-016": {
      authorityIds: ["E0-AUTH-E0-DECISIONS"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "near-miss", "resource-bound"],
      inputFixtureIds: [
        "canonical-export-preparation-result:busy-preparing",
        "canonical-export-preparation-result:busy-preparing-different-identity",
        "canonical-export-preparation-result:busy-delivering",
        "canonical-export-preparation-result:sequence-exhausted",
        "prepared-registry:id-max",
        "prepared-registry:id-exhausted",
      ],
      resultCategory: "EXPORT_DELIVERY_PREPARATION_UNAVAILABLE",
      failureStage: "prepared-registry-begin",
      expectedIssueCodes: [
        "export.preparation_busy",
        "export.preparation_sequence_exhausted",
      ],
      expectedRelation:
        "every-preparing-state-regardless-of-identity-and-any-delivering-state-refuse-busy-while-safe-integer-max-allocates-once-and-the-next-begin-refuses-without-wrap",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        busyRows: 3,
        peakConcurrentPreparationTasks: 1,
        maxPreparationIdsAllocated: 1,
        exhaustedRefusals: 1,
        counterWraps: 0,
        idReuses: 0,
        newEncoderCallsOnRefusal: 0,
      },
      terminationReason: "preparation-unavailable-matrix-complete",
      expectedMutationKills: ["E0-MUT-083"],
    },
    "E0-MK-017": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0"],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-CANCEL-STALE"],
      proofKinds: ["negative", "stale", "transaction"],
      inputFixtureIds: [
        "canonical-export-preparation-request:revision-7",
        "a0-state-identity:revision-8",
        "canonical-export-preparation-result:stale",
      ],
      resultCategory: "EXPORT_DELIVERY_PREPARATION_STALE",
      failureStage: "post-encode-latest-identity-check",
      expectedIssueCodes: ["export.prepared_canonical_stale"],
      expectedRelation:
        "revision-7-encoding-that-finishes-after-revision-8-is-current-is-zeroed-and-never-published-ready",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        canonicalEncoderCalls: 1,
        latestIdentityReads: 1,
        staleArtifactsDiscarded: 1,
        privateByteArraysZeroed: 1,
        readyEntries: 0,
      },
      terminationReason: "preparation-stale",
      expectedMutationKills: ["E0-MUT-058"],
    },
    "E0-MK-018": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-PLAN"],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-FAILURE-ISOLATION"],
      proofKinds: ["negative", "near-miss", "adapter"],
      inputFixtureIds: [
        "canonical-export-preparation:artifact-protocol-invalid",
        "canonical-export-preparation-result:artifact-protocol-invalid",
      ],
      resultCategory: "EXPORT_DELIVERY_PREPARATION_PROTOCOL_INVALID",
      failureStage: "canonical-export-preparation-result",
      expectedIssueCodes: ["export.prepared_canonical_artifact_invalid"],
      expectedRelation:
        "nominal-success-with-text-byte-length-drift-is-release-gate-invalid-and-publishes-no-private-entry",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        protocolInvalidResults: 1,
        rawValuesRetained: 0,
        preparedEntriesPublished: 0,
        livePrivateByteArrays: 0,
      },
      terminationReason: "preparation-protocol-invalid",
      expectedMutationKills: ["E0-MUT-078"],
    },
    "E0-MK-019": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0"],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-FAILURE-ISOLATION"],
      proofKinds: ["negative", "adapter", "transaction"],
      inputFixtureIds: [
        "a0-state-identity:protocol-invalid",
        "a0-state-identity:synchronous-throw",
        "canonical-export-preparation-result:state-identity-protocol-invalid",
        "marker-settlement-result:state-identity-protocol-invalid",
      ],
      resultCategory: "EXPORT_STATE_IDENTITY_PROTOCOL_INVALID",
      failureStage: "latest-application-state-identity",
      expectedIssueCodes: ["export.application_state_identity_invalid"],
      expectedRelation:
        "prepare-and-click-paths-normalize-invalid-or-throwing-latest-identity-results-and-key-abandon-each-matching-preparation-before-private-consumption-or-browser-start",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        coveredPublicOperations: 2,
        rawValuesRetained: 0,
        registryConsumes: 0,
        matchingPreparationAbandons: 2,
        browserStarts: 0,
        a0PublicationCalls: 0,
        a1PersistenceCalls: 0,
      },
      terminationReason: "state-identity-protocol-invalid",
      expectedMutationKills: ["E0-MUT-078", "E0-MUT-083"],
    },
    "E0-MK-020": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["negative", "near-miss", "transaction", "resource-bound"],
      inputFixtureIds: [
        "marker-public-request-authority-matrix",
        "marker-settlement-request:fabricated-preparation-id",
        "marker-settlement-request:consumed-preparation-replay",
        "marker-settlement-request:double-click-sequence",
        "marker-settlement-result:prepared-export-unavailable",
        "prepared-canonical-export-request-lifecycle-near-misses",
        "prepared-delivery-start:missing-activation",
        "marker-settlement-result:unchanged-failed-missing-activation",
      ],
      resultCategory: "EXPORT_DELIVERY_PREPARATION_UNAVAILABLE",
      failureStage: "prepared-registry-take",
      expectedIssueCodes: ["export.prepared_canonical_unavailable"],
      expectedRelation:
        "forged-consumed-and-double-click-locators-never-expose-bytes-and-only-the-first-exact-take-can-start-delivery",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        authorityNearMissRows: 13,
        doubleClickSuccessfulConsumes: 1,
        doubleClickBrowserStarts: 1,
        replayBrowserStarts: 0,
        publicPrivateByteExposures: 0,
      },
      terminationReason: "locator-lifecycle-matrix-complete",
      expectedMutationKills: ["E0-MUT-056", "E0-MUT-058", "E0-MUT-083"],
    },
    "E0-MK-021": {
      authorityIds: [
        "E0-AUTH-E0-DECISIONS",
        "E0-AUTH-FSA",
        "E0-AUTH-WHATWG-DOWNLOAD",
      ],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-FAILURE-ISOLATION"],
      proofKinds: ["negative", "exception", "near-miss", "resource-bound"],
      inputFixtureIds: [
        "prepared-delivery-start:malformed-envelope",
        "prepared-delivery-start:synchronous-throw",
        "prepared-delivery-start:unexpected-rejection",
        "prepared-delivery-start:malformed-completion-result",
        "marker-settlement-result:delivery-protocol-invalid-malformed-start",
        "marker-settlement-result:delivery-protocol-invalid-start-throw",
        "marker-settlement-result:delivery-protocol-invalid-completion-rejection",
        "marker-settlement-result:delivery-protocol-invalid-malformed-completion",
      ],
      resultCategory: "DOWNLOAD_PROTOCOL_RECONCILIATION_REQUIRED",
      failureStage: "prepared-delivery-start-or-completion",
      expectedIssueCodes: ["export.delivery_result_invalid"],
      expectedRelation:
        "malformed-start-throw-rejected-completion-and-malformed-resolved-completion-all-report-cleanup-unknown-with-bounded-maximum-four-and-zero-marker-actions",
      stateEffect: "DELIVERY_RESOURCE_RECONCILIATION_REQUIRED",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        protocolInvalidRows: 4,
        rawValuesRetained: 0,
        maximumPossibleOutstandingOwnedResourcesPerRow: 4,
        terminalRegistryEntriesPerRow: 0,
        a0PublicationCalls: 0,
        a1PersistenceCalls: 0,
      },
      terminationReason: "delivery-protocol-invalid-matrix-complete",
      expectedMutationKills: ["E0-MUT-078", "E0-MUT-080"],
    },
    "E0-MK-022": {
      authorityIds: [
        "E0-AUTH-E0-DECISIONS",
        "E0-AUTH-FSA",
        "E0-AUTH-WHATWG-DOWNLOAD",
      ],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-FAILURE-ISOLATION"],
      proofKinds: ["negative", "adapter", "resource-bound"],
      inputFixtureIds: [
        "delivery-cleanup-failure-matrix",
        "delivery:cleanup-failed-representative",
        "marker-settlement-result:delivery-cleanup-reconciliation-required",
      ],
      resultCategory: "DOWNLOAD_CLEANUP_RECONCILIATION_REQUIRED",
      failureStage: "delivery-cleanup",
      expectedIssueCodes: ["export.delivery_cleanup_failed"],
      expectedRelation:
        "typed-channel-exclusive-cleanup-failures-have-at-most-two-distinct-live-resources-retain-no-artifact-receipt-and-never-call-marker-adapters",
      stateEffect: "DELIVERY_RESOURCE_RECONCILIATION_REQUIRED",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        matrixRows: 4,
        totalOutstandingDistinctOwnedResources: 6,
        maximumOutstandingDistinctOwnedResourcesPerRow: 2,
        artifactReceipts: 0,
        a0PublicationCalls: 0,
        a1PersistenceCalls: 0,
      },
      terminationReason: "delivery-cleanup-reconciliation-required",
      expectedMutationKills: ["E0-MUT-080"],
    },
    "E0-MK-023": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-PLAN"],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-FAILURE-ISOLATION"],
      proofKinds: ["negative", "near-miss", "exception", "adapter"],
      inputFixtureIds: [
        "clock:canonical-export-strict-rejection-matrix",
        "clock:canonical-export-timestamp-invalid",
        "clock:canonical-export-timestamp-throw",
        "marker-settlement-result:timestamp-protocol-invalid",
        "marker-settlement-result:timestamp-protocol-invalid-throw",
      ],
      resultCategory: "MARKER_TIMESTAMP_INVALID",
      failureStage: "application-clock",
      expectedIssueCodes: ["export.marker_timestamp_invalid"],
      expectedRelation:
        "seven-strict-clock-rejections-retain-the-successful-delivery-but-create-no-candidate-publication-persistence-or-application-reconciliation",
      stateEffect: "NONE",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        strictClockRows: 7,
        retainedDeliveryObservations: 7,
        rawValuesRetained: 0,
        a0PublicationCalls: 0,
        a1PersistenceCalls: 0,
        applicationReconciliations: 0,
      },
      terminationReason: "timestamp-protocol-invalid-matrix-complete",
      expectedMutationKills: ["E0-MUT-078"],
    },
    "E0-MK-024": {
      authorityIds: ["E0-AUTH-E0-DECISIONS"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["positive", "negative", "transaction", "resource-bound"],
      inputFixtureIds: [
        "prepared-canonical-export-registry-lifecycle-matrix",
        "prepared-registry:one-ready-entry",
        "prepared-registry:replacement-peak-one",
        "prepared-registry:id-max",
        "prepared-registry:id-exhausted",
        "canonical-export-preparation-result:prepared-revision-8",
      ],
      resultCategory: "EXPORT_DELIVERY_PREPARED",
      failureStage: null,
      expectedIssueCodes: [],
      expectedRelation:
        "one-slot-FSA-covers-universal-preparing-busy-ready-replacement-keyed-abandon-and-finish-late-completion-guards-consumption-zeroing-and-safe-integer-exhaustion",
      stateEffect: "EXPORT_PREPARATION_ONLY",
      markerEffect: "UNCHANGED",
      exactStageCounts: {
        lifecycleRows: 11,
        peakLiveEntries: 1,
        peakConcurrentPreparationTasks: 1,
        oldNewPrivateByteOverlap: 0,
        counterWraps: 0,
        idReuses: 0,
      },
      terminationReason: "registry-lifecycle-matrix-complete",
      expectedMutationKills: ["E0-MUT-083"],
    },
    "E0-MK-025": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0", "E0-AUTH-A1"],
      traceIds: ["E0-TRACE-EXPORT-MARKER"],
      proofKinds: ["positive", "stale", "transaction", "state-isolation"],
      inputFixtureIds: [
        "state:marker-current-revision-7-picker-ephemeral-change",
        "state:marker-published-revision-7-picker-ephemeral-change",
        "a0-marker-publication:published-after-picker-ephemeral-change",
        "a0-marker-publication-normalized:published-after-picker-ephemeral-change",
        "marker-settlement-result:advanced-persisted-after-picker-ephemeral-change",
        "state:marker-published-then-edited-revision-8",
        "marker-settlement:edit-during-a1-await",
        "marker-public-result-state-authority-matrix",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: null,
      expectedIssueCodes: [],
      expectedRelation:
        "A0-preserves-legitimate-picker-time-ephemeral-state-and-late-A1-results-expose-no-AppState-capable-of-overwriting-a-newer-controller-edit",
      stateEffect: "MARKER_ONLY",
      markerEffect: "ADVANCED_TO_BASE_REVISION",
      exactStageCounts: {
        rawA0StatesValidatedInternally: 2,
        rawA0StatesExposedPublicly: 0,
        lateA1Settlements: 1,
        newerRevision8StatesPreserved: 1,
        historicalStateInstalls: 0,
      },
      terminationReason: "async-state-authority-preserved",
      expectedMutationKills: ["E0-MUT-058", "E0-MUT-060"],
    },
    "E0-MK-026": {
      authorityIds: ["E0-AUTH-E0-DECISIONS", "E0-AUTH-A0", "E0-AUTH-A1"],
      traceIds: ["E0-TRACE-EXPORT-MARKER", "E0-TRACE-FAILURE-ISOLATION"],
      proofKinds: ["negative", "exception", "adapter", "transaction"],
      inputFixtureIds: [
        "a0-marker-publication:published",
        "a0-marker-publication-normalized:published",
        "a1-marker-persistence-handoff:accepted",
        "recovery-marker-persistence:rejected-promise",
        "marker-settlement-result:persistence-protocol-invalid-rejection",
      ],
      resultCategory: "DOWNLOAD_COMPLETED",
      failureStage: "marker-persistence-result",
      expectedIssueCodes: ["recovery.marker_persistence_result_invalid"],
      expectedRelation:
        "A1-rejection-after-valid-A0-publication-retains-delivery-and-state-free-A0-receipt-with-recovery-reconciliation-required",
      stateEffect: "RECOVERY_RECONCILIATION_REQUIRED",
      markerEffect: "ADVANCED_TO_BASE_REVISION",
      exactStageCounts: {
        a0Publications: 1,
        a1PersistenceRejections: 1,
        rawRejectedValuesRetained: 0,
        recoveryReconciliationsRequired: 1,
        publicAppStates: 0,
      },
      terminationReason: "persistence-protocol-invalid-rejection",
      expectedMutationKills: ["E0-MUT-060", "E0-MUT-061", "E0-MUT-078"],
    },
  };
  requireExact(
    [...caseById.keys()].filter((caseId) => caseId.startsWith("E0-MK-")),
    Array.from(
      { length: 26 },
      (_, index) => "E0-MK-" + String(index + 1).padStart(3, "0"),
    ),
    "E0_MARKER_CASE_INVENTORY_INVALID",
    "workflow-adapter-cases.json.E0-MK",
    "The golden packet must contain exactly the ordered E0-MK-001 through E0-MK-026 marker cases.",
    findings,
  );
  for (const [caseId, expected] of Object.entries(markerCaseProjections)) {
    const candidate = caseById.get(caseId);
    requireExact(
      {
        ...(caseId.startsWith("E0-MK-")
          ? {
              authorityIds: candidate?.["authorityIds"],
              traceIds: candidate?.["traceIds"],
              proofKinds: candidate?.["proofKinds"],
            }
          : {}),
        inputFixtureIds: candidate?.["inputFixtureIds"],
        resultCategory: candidate?.["resultCategory"],
        failureStage: candidate?.["failureStage"],
        expectedIssueCodes: candidate?.["expectedIssueCodes"],
        expectedRelation: candidate?.["expectedRelation"],
        stateEffect: candidate?.["stateEffect"],
        markerEffect: candidate?.["markerEffect"],
        exactStageCounts: candidate?.["exactStageCounts"],
        terminationReason: candidate?.["terminationReason"],
        expectedMutationKills: candidate?.["expectedMutationKills"],
      },
      expected,
      "E0_BOUNDARY_CASE_INVALID",
      caseId,
      "X1-unavailable and E0-MK-001..026 boundary cases must retain their exact authority, trace, proof, fixture, handoff, refusal, reconciliation, and durability claims.",
      findings,
    );
  }

  const resultCategories = new Set(stringsAt(contract["resultCategories"]));
  const stateEffects = new Set(stringsAt(contract["stateEffects"]));
  const markerEffects = new Set(stringsAt(contract["markerEffects"]));
  const resultCoverage = new Set<string>();
  if (
    resultCategories.size !== stringsAt(contract["resultCategories"]).length
  ) {
    addFinding(
      findings,
      "E0_RESULT_CATEGORY_DUPLICATE",
      `${CONTRACT_FILENAME}.resultCategories`,
      "Result categories must be unique.",
    );
  }

  requireExact(
    limitFamilies.map((family) => family["resource"]),
    E0_PROPOSED_LIMIT_RESOURCES,
    "E0_LIMIT_RESOURCE_INVENTORY",
    "limit-cases.json.cases",
    "Every public inherited and E0-owned bound needs one ordered fixture family.",
    findings,
  );
  const retainedMemoryCase = limitFamilies.find(
    (family) => family["id"] === "E0-LIM-022",
  );
  requireExact(
    {
      retentionPolicy: retainedMemoryCase?.["retentionPolicy"],
      cells: retainedMemoryCase?.["cells"],
      expectedMutationKills: retainedMemoryCase?.["expectedMutationKills"],
    },
    {
      retentionPolicy:
        "bounded-projections-only-complete-upstream-evidence-transient",
      cells: [
        {
          id: "E0-LIM-022-READ",
          input: "2097153-byte-observation",
          resultCategory: "REFUSED_PREFLIGHT",
          failureStage: "byte-preflight",
          expectedIssueCodes: ["limit.import_bytes_exceeded"],
          exactWorkCounters: {
            retainedPayloadBytesMaximum: 2_097_153,
            rawPayloadCopiesInState: 0,
            completeLegacyReportsInState: 0,
            completeChartWarningsInState: 0,
            completeChartDiagnosticsInState: 0,
          },
        },
        {
          id: "E0-LIM-022-PREVIEW",
          input: "maximum-valid-preview",
          resultCategory: "PREVIEW_READY",
          failureStage: null,
          expectedIssueCodes: [],
          exactWorkCounters: {
            previewIssues: 64,
            previewReportRows: 256,
            rawPayloadCopiesInState: 0,
            completeLegacyReportsInState: 0,
            completeChartWarningsInState: 0,
            completeChartDiagnosticsInState: 0,
          },
        },
      ],
      expectedMutationKills: ["E0-MUT-052", "E0-MUT-065"],
    },
    "E0_RETAINED_MEMORY_BOUNDARY_INVALID",
    "E0-LIM-022",
    "Retained-memory evidence must count only bounded projections and explicitly forbid complete C0/T0 evidence objects in state.",
    findings,
  );

  for (const record of ordinaryCases) {
    const id = typeof record["id"] === "string" ? record["id"] : "<missing>";
    const result = record["resultCategory"];
    if (typeof result !== "string" || !resultCategories.has(result)) {
      addFinding(
        findings,
        "E0_CASE_RESULT",
        `${id}.resultCategory`,
        "Case result must use the closed result vocabulary.",
      );
    } else {
      resultCoverage.add(result);
    }
    if (!stateEffects.has(String(record["stateEffect"]))) {
      addFinding(
        findings,
        "E0_CASE_STATE_EFFECT",
        `${id}.stateEffect`,
        "Case state effect must use the closed state vocabulary.",
      );
    }
    if (!markerEffects.has(String(record["markerEffect"]))) {
      addFinding(
        findings,
        "E0_CASE_MARKER_EFFECT",
        `${id}.markerEffect`,
        "Case marker effect must use the closed marker vocabulary.",
      );
    }
    if (
      stringsAt(record["authorityIds"]).length === 0 ||
      stringsAt(record["traceIds"]).length === 0 ||
      stringsAt(record["proofKinds"]).length === 0 ||
      stringsAt(record["expectedMutationKills"]).length === 0 ||
      typeof record["terminationReason"] !== "string"
    ) {
      addFinding(
        findings,
        "E0_CASE_INCOMPLETE",
        id,
        "Every case needs authority, trace, proof, mutation, and termination fields.",
      );
    }
  }

  for (const family of limitFamilies) {
    const id = typeof family["id"] === "string" ? family["id"] : "<missing>";
    if (
      stringsAt(family["authorityIds"]).length === 0 ||
      stringsAt(family["traceIds"]).length === 0 ||
      stringsAt(family["proofKinds"]).length === 0 ||
      stringsAt(family["expectedMutationKills"]).length === 0 ||
      recordsAt(family["cells"]).length === 0
    ) {
      addFinding(
        findings,
        "E0_LIMIT_FAMILY_INCOMPLETE",
        id,
        "Every limit family needs authority, trace, proof, mutation, and cells.",
      );
    }
    for (const cell of recordsAt(family["cells"])) {
      const cellId = String(cell["id"]);
      const result = cell["resultCategory"];
      if (typeof result !== "string" || !resultCategories.has(result)) {
        addFinding(
          findings,
          "E0_LIMIT_RESULT",
          `${cellId}.resultCategory`,
          "Limit cell result must use the closed vocabulary.",
        );
      } else {
        resultCoverage.add(result);
      }
      const counters = objectAt(cell["exactWorkCounters"]);
      if (counters === null) {
        addFinding(
          findings,
          "E0_LIMIT_COUNTERS",
          `${cellId}.exactWorkCounters`,
          "Every limit cell freezes deterministic work evidence.",
        );
      } else if (
        Object.values(counters).some(
          (value) =>
            typeof value !== "number" ||
            !Number.isSafeInteger(value) ||
            value < 0,
        )
      ) {
        addFinding(
          findings,
          "E0_LIMIT_COUNTER_NONNUMERIC",
          `${cellId}.exactWorkCounters`,
          "Exact limit counters must be nonnegative safe integers, never prose placeholders.",
        );
      }
    }
  }

  for (const category of resultCategories) {
    if (!resultCoverage.has(category)) {
      addFinding(
        findings,
        "E0_RESULT_COVERAGE",
        `${CONTRACT_FILENAME}.resultCategories.${category}`,
        "Every declared terminal category needs at least one fixture cell.",
      );
    }
  }

  const limitParentByCell = new Map<string, JsonObject>();
  for (const family of limitFamilies) {
    for (const cell of recordsAt(family["cells"])) {
      if (typeof cell["id"] === "string")
        limitParentByCell.set(cell["id"], family);
    }
  }

  for (const record of topCases) {
    const id = String(record["id"]);
    for (const authorityId of stringsAt(record["authorityIds"])) {
      if (!authorityById.has(authorityId)) {
        addFinding(
          findings,
          "E0_AUTHORITY_UNKNOWN",
          `${id}.authorityIds.${authorityId}`,
          "Case cites an unknown authority.",
        );
      }
    }
    for (const traceId of stringsAt(record["traceIds"])) {
      const trace = traceById.get(traceId);
      if (trace === undefined) {
        addFinding(
          findings,
          "E0_TRACE_UNKNOWN",
          `${id}.traceIds.${traceId}`,
          "Case cites an unknown trace.",
        );
      } else if (!stringsAt(trace["caseIds"]).includes(id)) {
        addFinding(
          findings,
          "E0_TRACE_BACKLINK",
          `${traceId}.caseIds`,
          `Trace is missing the backlink to ${id}.`,
        );
      }
    }
    for (const controlId of stringsAt(record["expectedMutationKills"])) {
      const control = controlById.get(controlId);
      if (control === undefined) {
        addFinding(
          findings,
          "E0_CONTROL_UNKNOWN",
          `${id}.expectedMutationKills.${controlId}`,
          "Case cites an unknown mutation control.",
        );
        continue;
      }
      const links = [
        ...stringsAt(control["linkedCaseIds"]),
        ...stringsAt(control["e0LinkedCaseIds"]),
      ];
      const familyCells = recordsAt(record["cells"])
        .map((cell) => cell["id"])
        .filter((cellId): cellId is string => typeof cellId === "string");
      if (
        !links.includes(id) &&
        !familyCells.some((cellId) => links.includes(cellId))
      ) {
        addFinding(
          findings,
          "E0_CONTROL_BACKLINK",
          `${controlId}.linkedCaseIds`,
          `Mutation control is missing a backlink to ${id} or one of its cells.`,
        );
      }
    }
  }

  for (const trace of traces) {
    const id = String(trace["id"]);
    if (
      typeof trace["requirement"] !== "string" ||
      stringsAt(trace["requirementIds"]).length === 0 ||
      stringsAt(trace["authorityIds"]).length === 0 ||
      stringsAt(trace["caseIds"]).length === 0 ||
      stringsAt(trace["controlIds"]).length === 0 ||
      stringsAt(trace["proofKinds"]).length === 0
    ) {
      addFinding(
        findings,
        "E0_TRACE_INCOMPLETE",
        id,
        "Each trace needs stable requirements, authorities, cases, controls, and proof-kind coverage.",
      );
    }
    for (const caseId of stringsAt(trace["caseIds"])) {
      const record = topCaseById.get(caseId);
      if (record === undefined) {
        addFinding(
          findings,
          "E0_TRACE_CASE_UNKNOWN",
          `${id}.caseIds.${caseId}`,
          "Trace cites an unknown top-level case or limit family.",
        );
      } else if (!stringsAt(record["traceIds"]).includes(id)) {
        addFinding(
          findings,
          "E0_CASE_TRACE_BACKLINK",
          `${caseId}.traceIds`,
          `Case is missing the backlink to ${id}.`,
        );
      }
    }
    for (const controlId of stringsAt(trace["controlIds"])) {
      if (!controlById.has(controlId)) {
        addFinding(
          findings,
          "E0_TRACE_CONTROL_UNKNOWN",
          `${id}.controlIds.${controlId}`,
          "Trace cites an unknown mutation control.",
        );
      }
    }
  }

  for (const control of mutationControls) {
    const id = String(control["id"]);
    if (
      typeof control["category"] !== "string" ||
      typeof control["mutation"] !== "string" ||
      typeof control["expectedMismatch"] !== "string" ||
      stringsAt(control["linkedCaseIds"]).length === 0 ||
      stringsAt(control["authorityIds"]).length === 0
    ) {
      addFinding(
        findings,
        "E0_CONTROL_INCOMPLETE",
        id,
        "Each control needs category, mutation, expected mismatch, cases, and authorities.",
      );
    }
    for (const caseId of stringsAt(control["linkedCaseIds"])) {
      const record = caseById.get(caseId);
      if (record === undefined) {
        addFinding(
          findings,
          "E0_CONTROL_CASE_UNKNOWN",
          `${id}.linkedCaseIds.${caseId}`,
          "Control cites an unknown case or limit cell.",
        );
        continue;
      }
      const owner = limitParentByCell.get(caseId) ?? record;
      if (!stringsAt(owner["expectedMutationKills"]).includes(id)) {
        addFinding(
          findings,
          "E0_CASE_CONTROL_BACKLINK",
          `${String(owner["id"])}.expectedMutationKills`,
          `Case is missing the backlink to ${id}.`,
        );
      }
    }
    for (const authorityId of stringsAt(control["authorityIds"])) {
      if (!authorityById.has(authorityId)) {
        addFinding(
          findings,
          "E0_CONTROL_AUTHORITY_UNKNOWN",
          `${id}.authorityIds.${authorityId}`,
          "Control cites an unknown authority.",
        );
      }
    }
  }

  for (const control of inheritedControls) {
    const id = String(control["id"]);
    if (
      control["owner"] !== "E0" ||
      stringsAt(control["e0LinkedCaseIds"]).length === 0
    ) {
      addFinding(
        findings,
        "E0_INHERITED_CONTROL",
        id,
        "Inherited E0-owned F2 controls must retain owner and E0 case links.",
      );
    }
    for (const caseId of stringsAt(control["e0LinkedCaseIds"])) {
      if (!caseById.has(caseId)) {
        addFinding(
          findings,
          "E0_INHERITED_CASE_UNKNOWN",
          `${id}.e0LinkedCaseIds.${caseId}`,
          "Inherited control cites an unknown E0 case.",
        );
      }
    }
  }

  const provenance = loaded.get("provenance-ledger.json") ?? {};
  const independence = objectAt(provenance["independence"]) ?? {};
  for (const [field, expected] of Object.entries({
    productionImportsForbidden: true,
    productionOutputUsedAsOracle: false,
    expectedValuesGenerated: false,
    goldenBytesHandAuthored: true,
    boundaryGeneratorsMayConstructInputsOnly: true,
    callerMaySupplyTrustedInterchangeAdapters: false,
    untrustedImportSourceRawReturnValidatedAndCopied: true,
    unusedPreparedA0CapabilitiesInvalidatedByRequest: true,
    fallibleAdapterRawReturnsValidatedBeforeNormalization: true,
    preparedRegistryInvalidationIsTrustedTotalA0Primitive: true,
    preparedExportRegistryOwnedAndAllocatedByE0: true,
    preparedExportStartRequestContainsText: false,
    preparedExportBrowserInvocationBeforeFirstAwait: true,
    callerMarkerEvidenceAccepted: false,
    markerA0PublicationUsesLatestStateAtomicCas: true,
    publicMarkerResultsContainAppState: false,
    protocolInvalidRawResultsRetained: false,
    dynamicScrubbingForbidden: true,
    goldenUpdateRequiresVisibleDiff: true,
    firstGoldenRequiresHumanAcceptance: true,
    currentHumanAcceptanceClaim: false,
  })) {
    if (independence[field] !== expected) {
      addFinding(
        findings,
        "E0_PROVENANCE_INDEPENDENCE",
        `provenance-ledger.json.independence.${field}`,
        "Fixture independence policy changed.",
      );
    }
  }
  if (provenance["expertReviewClaim"] !== false) {
    addFinding(
      findings,
      "E0_EXPERT_REVIEW_CLAIM",
      "provenance-ledger.json.expertReviewClaim",
      "The proposed E0 packet has no expert-review claim.",
    );
  }
  const authorityClasses = new Set([
    "definition",
    "compatibility",
    "published-reference",
    "verification-policy",
  ]);
  for (const authority of authorities) {
    const id = String(authority["id"]);
    if (
      !authorityClasses.has(String(authority["authorityClass"])) ||
      typeof authority["sourceKind"] !== "string" ||
      authority["sourceKind"].length === 0 ||
      typeof authority["sourceRef"] !== "string" ||
      authority["sourceRef"].length === 0 ||
      typeof authority["scope"] !== "string" ||
      authority["scope"].length === 0 ||
      typeof authority["reviewState"] !== "string" ||
      authority["reviewState"].length === 0 ||
      typeof authority["judgmentBearing"] !== "boolean"
    ) {
      addFinding(
        findings,
        "E0_AUTHORITY_INCOMPLETE",
        id,
        "Every authority needs a closed class plus source, scope, review, and judgment metadata.",
      );
    }
  }

  const minimalJson = loaded.get("goldens/minimal.changes.json") ?? {};
  const negativeZeroJson =
    loaded.get("goldens/negative-zero.changes.json") ?? {};
  const nestedJson = loaded.get("goldens/nested.changes.json") ?? {};
  const keyOrder = objectAt(objectAt(contract["canonicalJson"])?.["keyOrder"]);
  requireExact(
    Object.keys(minimalJson),
    keyOrder?.["document"],
    "E0_GOLDEN_DOCUMENT_ORDER",
    "goldens/minimal.changes.json",
    "Minimal golden must exercise the exact document key order.",
    findings,
  );
  if (keyOrder === null) {
    addFinding(
      findings,
      "E0_GOLDEN_KEY_ORDER_MISSING",
      "e0-interchange-contract.json.canonicalJson.keyOrder",
      "Nested golden validation requires the complete declared key-order map.",
    );
  } else {
    validateNestedGoldenOrder(nestedJson, keyOrder, findings);
  }
  requireExact(
    Object.keys(objectAt(minimalJson["meter"]) ?? {}),
    keyOrder?.["meter"],
    "E0_GOLDEN_METER_ORDER",
    "goldens/minimal.changes.json.meter",
    "Minimal golden must exercise the exact meter key order.",
    findings,
  );
  requireExact(
    Object.keys(objectAt(minimalJson["playback"]) ?? {}),
    keyOrder?.["playback"],
    "E0_GOLDEN_PLAYBACK_ORDER",
    "goldens/minimal.changes.json.playback",
    "Minimal golden must exercise the exact playback key order.",
    findings,
  );
  const negativePlayback = objectAt(negativeZeroJson["playback"]) ?? {};
  if (
    !Object.is(negativePlayback["masterVolume"], -0) ||
    !Object.is(negativePlayback["reverbAmount"], -0) ||
    !(sources.get("goldens/negative-zero.changes.json") ?? "").includes(
      '"masterVolume": -0',
    )
  ) {
    addFinding(
      findings,
      "E0_NEGATIVE_ZERO_GOLDEN",
      "goldens/negative-zero.changes.json",
      "Signed zero tokens and Object.is semantics are independently frozen.",
    );
  }
  requireExact(
    {
      minimalJson: byteLengths.get("goldens/minimal.changes.json"),
      negativeZeroJson: byteLengths.get("goldens/negative-zero.changes.json"),
      nestedJson: byteLengths.get("goldens/nested.changes.json"),
      minimalText: byteLengths.get("goldens/minimal.changes.txt"),
      richText: byteLengths.get("goldens/rich.changes.txt"),
    },
    {
      minimalJson: 352,
      negativeZeroJson: 409,
      nestedJson: 5_606,
      minimalText: 60,
      richText: 153,
    },
    "E0_GOLDEN_BYTE_COUNTS",
    "goldens",
    "Golden byte counts must match the hand-authored packet.",
    findings,
  );

  const counts = Object.freeze({
    companions: E0_PROPOSED_COMPANIONS.length,
    goldens: E0_PROPOSED_GOLDENS.length,
    canonicalCases: canonicalCases.length,
    chartTextCases: chartTextCases.length,
    importCases: importCases.length,
    workflowAdapterCases: workflowAdapterCases.length,
    transportWorkflowCells: transportWorkflowCells.length,
    limitFamilies: limitFamilies.length,
    limitCells: limitCells.length,
    mutationControls: mutationControls.length,
    inheritedControls: inheritedControls.length,
    authorities: authorities.length,
    traces: traces.length,
    inputFixtures: inputFixtures.length,
    requirements: requirements.length,
  });
  requireExact(
    counts,
    E0_PROPOSED_COUNTS,
    "E0_COUNTS",
    fixtureRoot,
    "Packet counts must match the proposed semantic lock.",
    findings,
  );

  findings.sort(
    (left, right) =>
      codeUnitCompare(left.path, right.path) ||
      codeUnitCompare(left.code, right.code) ||
      codeUnitCompare(left.message, right.message),
  );
  return Object.freeze({
    schema: "changes.validation.e0-contract.v1",
    package: "E0",
    outcome: findings.length === 0 ? "pass" : "fail",
    reviewState: REVIEW_STATE,
    counts,
    findings: Object.freeze(findings),
  });
}

if (import.meta.main) {
  const root = process.argv[2];
  const report = await validateE0Contract(root);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
