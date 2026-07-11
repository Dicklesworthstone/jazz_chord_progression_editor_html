import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_BEAT_DENOMINATORS,
  AUTO_BASS_POLICIES,
  AUTO_VOICING_FAMILIES,
  DOMAIN_VALIDATION_ISSUE_CODES,
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_ENGINE_VERSION_CODE_POINTS,
  MAX_JSON_NESTING_DEPTH,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_MIDI_PITCH,
  MAX_NORMALIZED_BEAT_NUMERATOR,
  MAX_PLAYBACK_LEVEL,
  MAX_SECTION_MEASURES,
  MAX_SHORT_TEXT_CODE_POINTS,
  MAX_TEMPO_BPM,
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
  MAX_UTF8_IMPORT_BYTES,
  MAX_VOICING_PITCHES,
  MIDI_PPQ,
  MIN_MIDI_PITCH,
  MIN_PLAYBACK_LEVEL,
  MIN_TEMPO_BPM,
  PROGRESSION_DOCUMENT_SCHEMA,
  STABLE_ID_MAX_ASCII_LENGTH,
} from "../src/domain";

type JsonObject = Record<string, unknown>;

export type F1ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type F1ContractValidationReport = Readonly<{
  schema: "changes.validation.f1-contract.v1";
  package: "F1";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    cases: number;
    traces: number;
    authorities: number;
    seeds: number;
  }>;
  findings: readonly F1ContractFinding[];
}>;

type ParsedCompanion = Readonly<{
  path: string;
  schema: string;
  recordCollections: readonly string[];
  root: JsonObject;
}>;

type FixtureCase = Readonly<{
  id: string;
  path: string;
  record: JsonObject;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

const DEFAULT_FIXTURE_ROOT = fileURLToPath(
  new URL("../tests/fixtures/domain", import.meta.url),
);
const MANIFEST_FILENAME = "f1-domain-contract.json";
const EXPECTED_MANIFEST_IDENTITY = {
  schema: "changes.fixtures.f1-domain-contract.v1",
  contractVersion: "1.0.0",
  package: "F1",
  beadId: "jcpe-milestone-foundation-vc2.2.1",
  domainSchema: PROGRESSION_DOCUMENT_SCHEMA,
} as const;
const EXPECTED_FIXED_CONSTANTS: Readonly<JsonObject> = {
  midiPpq: MIDI_PPQ,
  allowedBeatDenominators: [...ALLOWED_BEAT_DENOMINATORS],
  maxBeatNumerator: MAX_NORMALIZED_BEAT_NUMERATOR,
  maxTimelineQuarterNoteBeats: MAX_TIMELINE_QUARTER_NOTE_BEATS,
  midiMinimum: MIN_MIDI_PITCH,
  midiMaximum: MAX_MIDI_PITCH,
  tempoMinimum: MIN_TEMPO_BPM,
  tempoMaximum: MAX_TEMPO_BPM,
  maxSections: MAX_DOCUMENT_SECTIONS,
  maxMeasuresPerSection: MAX_SECTION_MEASURES,
  maxEventsPerDocument: MAX_DOCUMENT_CHORD_EVENTS,
  maxVoicingNotes: MAX_VOICING_PITCHES,
  maxImportBytes: MAX_UTF8_IMPORT_BYTES,
  maxJsonDepth: MAX_JSON_NESTING_DEPTH,
  maxStableIdAsciiCharacters: STABLE_ID_MAX_ASCII_LENGTH,
  maxSymbolCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
  maxCustomLabelCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
  maxTitleCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
  maxSectionNameCodePoints: MAX_SHORT_TEXT_CODE_POINTS,
  maxAnnotationCodePoints: MAX_LONG_TEXT_CODE_POINTS,
  maxDescriptionCodePoints: MAX_LONG_TEXT_CODE_POINTS,
  maxPartialMeasureReasonCodePoints: MAX_LONG_TEXT_CODE_POINTS,
  maxEngineVersionCodePoints: MAX_ENGINE_VERSION_CODE_POINTS,
  minimumPlaybackLevel: MIN_PLAYBACK_LEVEL,
  maximumPlaybackLevel: MAX_PLAYBACK_LEVEL,
  countInBars: [0, 1, 2],
};
const EXPECTED_COMPANION_KEYS = [
  "path",
  "recordCollections",
  "role",
  "schema",
] as const;
const EXPECTED_COMPANIONS = [
  {
    path: "pitch-cases.json",
    schema: "changes.fixtures.f1-pitch.v1",
    recordCollections: ["cases"],
  },
  {
    path: "chord-shape-cases.json",
    schema: "changes.fixtures.f1-chord-shape.v1",
    recordCollections: ["cases"],
  },
  {
    path: "beat-value-cases.json",
    schema: "changes.fixtures.f1-beat-value.v1",
    recordCollections: ["divisorCases", "pairwiseClosureCases", "edgeCases"],
  },
  {
    path: "meter-measure-cases.json",
    schema: "changes.fixtures.f1-meter-measure.v1",
    recordCollections: ["capacityCases", "completionCases"],
  },
  {
    path: "identity-cases.json",
    schema: "changes.fixtures.f1-identity.v1",
    recordCollections: ["cases"],
  },
  {
    path: "voicing-custom-cases.json",
    schema: "changes.fixtures.f1-voicing-custom.v1",
    recordCollections: ["autoPolicyMatrix", "customAutoPolicyMatrix", "cases"],
  },
  {
    path: "document-boundary-cases.json",
    schema: "changes.fixtures.f1-document-boundary.v1",
    recordCollections: ["cases"],
  },
  {
    path: "operation-state-cases.json",
    schema: "changes.fixtures.f1-operation-state.v1",
    recordCollections: ["cases"],
  },
  {
    path: "trace-ledger.json",
    schema: "changes.fixtures.f1-trace-ledger.v1",
    recordCollections: ["traces"],
  },
  {
    path: "provenance-ledger.json",
    schema: "changes.fixtures.f1-provenance-ledger.v1",
    recordCollections: ["authorities"],
  },
] as const;
const EXPECTED_SEEDS = [
  ["F1-SEED-PITCH", 2_718_281_828],
  ["F1-SEED-BEAT", 3_141_592_653],
  ["F1-SEED-METER", 1_618_033_988],
  ["F1-SEED-IDENTITY", 1_414_213_562],
  ["F1-SEED-VOICING", 1_732_050_807],
  ["F1-SEED-BOUNDARY", 2_236_067_977],
] as const;
const EXPECTED_TRACE_IDS = [
  "F1-TRACE-ID-STABILITY",
  "F1-TRACE-ID-TRANSACTION",
  "F1-TRACE-PITCH-IDENTITY",
  "F1-TRACE-PITCH-MIDI",
  "F1-TRACE-PITCH-FREQUENCY",
  "F1-TRACE-DEGREE-IDENTITY",
  "F1-TRACE-VOICING-EXACT",
  "F1-TRACE-VOICING-CONDITIONAL",
  "F1-TRACE-TIME-DENOMINATORS",
  "F1-TRACE-TIME-ARITHMETIC",
  "F1-TRACE-TIME-LIMITS",
  "F1-TRACE-METER-CAPACITY",
  "F1-TRACE-MEASURE-STATE",
  "F1-TRACE-DOCUMENT-TYPES",
  "F1-TRACE-KEY-CONTEXT",
  "F1-TRACE-DECODER-RESULT",
  "F1-TRACE-BOUNDED-OPERATIONS",
  "F1-TRACE-PURE-BOUNDARY",
] as const;
const EXPECTED_AUTHORITY_IDS = [
  "F1-AUTH-ID",
  "F1-AUTH-PITCH",
  "F1-AUTH-TEMPERAMENT",
  "F1-AUTH-DEGREE",
  "F1-AUTH-VOICING",
  "F1-AUTH-TIME",
  "F1-AUTH-DOCUMENT",
  "F1-AUTH-KEY",
  "F1-AUTH-VALIDATION",
] as const;
const EXPECTED_COVERAGE_SUMMARY: Readonly<JsonObject> = {
  companionFiles: 10,
  fixtureCaseRecords: 297,
  traceRecords: 18,
  authorityRecords: 9,
  stableSeeds: 6,
  allowedBeatDivisors: 28,
  orderedPairwiseBeatClosureChecks: 784,
  coreMeterCapacityCases: 15,
  additionalCompoundMeterNearMisses: 1,
  autoVoicingPolicyMatrixCells: 42,
  customAutoRefusalMatrixCells: 42,
  expectedDiagnosticCodes: 84,
};
const EXPECTED_PAIRWISE_TICK_ORACLE: Readonly<JsonObject> = {
  oracleVersion: "ppq-integer-ticks-v1",
  tickSources: {
    left: "divisorCases.unitTicks",
    right: "divisorCases.unitTicks",
  },
  addition: {
    operation: "add-integer-ticks",
    result: "reduce-ticks-over-ppq",
  },
  subtraction: {
    operation: "subtract-integer-ticks",
    negativeWhen: "leftTicks<rightTicks",
    negativeCode: "beat.negative_result",
    result: "reduce-ticks-over-ppq",
  },
  comparison: {
    operation: "compare-integer-ticks",
    less: -1,
    equal: 0,
    greater: 1,
  },
  closure: {
    successfulDenominatorSet: "divisorCases.denominator",
  },
  expectedComparisonPartition: {
    less: 378,
    equal: 28,
    greater: 378,
  },
};
const ISSUE_CODE_VALUES = new Set<string>(
  Object.values(DOMAIN_VALIDATION_ISSUE_CODES),
);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort();
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return sameStringArray(leftKeys, rightKeys) &&
    leftKeys.every((key) => jsonEqual(left[key], right[key]));
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0 ? 1 : a;
}

function reduced(numerator: number, denominator: number): JsonObject {
  const divisor = gcd(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function nodeErrorCode(error: unknown): string | null {
  return isObject(error) && typeof error["code"] === "string"
    ? error["code"]
    : null;
}

function stringsFromUnknown(
  value: unknown,
  path: string,
  findings: F1ContractFinding[],
  options: Readonly<{ nonempty?: boolean; unique?: boolean }> = {},
): string[] {
  if (!Array.isArray(value)) {
    findings.push({
      code: "F1_CONTRACT_SHAPE",
      path,
      message: "Expected an array of strings.",
    });
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${String(index)}]`;
    if (typeof item !== "string" || item.length === 0) {
      findings.push({
        code: "F1_CONTRACT_SHAPE",
        path: itemPath,
        message: "Expected a non-empty string.",
      });
      return;
    }
    if (options.unique === true && seen.has(item)) {
      findings.push({
        code: "F1_CONTRACT_DUPLICATE",
        path: itemPath,
        message: `Duplicate string ${JSON.stringify(item)}.`,
      });
      return;
    }
    seen.add(item);
    result.push(item);
  });
  if (options.nonempty === true && result.length === 0) {
    findings.push({
      code: "F1_CONTRACT_SHAPE",
      path,
      message: "Expected at least one string.",
    });
  }
  return result;
}

async function parseJsonObject(
  fixtureRoot: string,
  filename: string,
  findings: F1ContractFinding[],
  missingCode: string,
): Promise<JsonObject | null> {
  const path = join(fixtureRoot, filename);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    findings.push({
      code: nodeErrorCode(error) === "ENOENT" ? missingCode : "F1_CONTRACT_READ",
      path: filename,
      message: nodeErrorCode(error) === "ENOENT"
        ? `Required JSON file ${JSON.stringify(filename)} is missing.`
        : error instanceof Error
          ? error.message
          : "Unable to read JSON file.",
    });
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    findings.push({
      code: "F1_CONTRACT_JSON",
      path: filename,
      message: error instanceof Error ? error.message : "Unable to parse JSON.",
    });
    return null;
  }
  if (!isObject(parsed)) {
    findings.push({
      code: "F1_CONTRACT_SHAPE",
      path: `${filename}:$`,
      message: "JSON root must be an object.",
    });
    return null;
  }
  return parsed;
}

function validateManifestIdentity(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): void {
  for (const [key, expected] of Object.entries(EXPECTED_MANIFEST_IDENTITY)) {
    if (manifest[key] !== expected) {
      findings.push({
        code: "F1_CONTRACT_IDENTITY",
        path: `${MANIFEST_FILENAME}:$.${key}`,
        message: `Expected ${JSON.stringify(expected)}; received ${JSON.stringify(manifest[key])}.`,
      });
    }
  }
}

function validateFixedConstants(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): void {
  const actual = manifest["fixedConstants"];
  if (!isObject(actual)) {
    findings.push({
      code: "F1_FIXED_CONSTANT",
      path: `${MANIFEST_FILENAME}:$.fixedConstants`,
      message: "Expected the complete fixed-constant object.",
    });
    return;
  }
  const expectedKeys = Object.keys(EXPECTED_FIXED_CONSTANTS).sort();
  const actualKeys = Object.keys(actual).sort();
  if (!sameStringArray(actualKeys, expectedKeys)) {
    findings.push({
      code: "F1_FIXED_CONSTANT",
      path: `${MANIFEST_FILENAME}:$.fixedConstants`,
      message: "Fixed constants must contain exactly the public F1 constant keys.",
    });
  }
  for (const key of expectedKeys) {
    if (!jsonEqual(actual[key], EXPECTED_FIXED_CONSTANTS[key])) {
      findings.push({
        code: "F1_FIXED_CONSTANT",
        path: `${MANIFEST_FILENAME}:$.fixedConstants.${key}`,
        message: `Fixed constant ${key} does not match the public domain contract.`,
      });
    }
  }
}

function validateAuthorityPolicy(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): void {
  const policy = manifest["authorityPolicy"];
  if (!isObject(policy)) {
    findings.push({
      code: "F1_AUTHORITY_POLICY",
      path: `${MANIFEST_FILENAME}:$.authorityPolicy`,
      message: "Authority policy must be an object.",
    });
    return;
  }
  const requiredFalseFlags = [
    "expectedValuesGeneratedByProduction",
    "productionModulesImported",
    "productionArtifactUsedAsAuthority",
  ] as const;
  for (const flag of requiredFalseFlags) {
    if (policy[flag] !== false) {
      findings.push({
        code: "F1_AUTHORITY_POLICY",
        path: `${MANIFEST_FILENAME}:$.authorityPolicy.${flag}`,
        message: `${flag} must remain false; production cannot certify independent fixtures.`,
      });
    }
  }
  if (
    typeof policy["authoringMethod"] !== "string" ||
    policy["authoringMethod"].trim().length === 0
  ) {
    findings.push({
      code: "F1_AUTHORITY_POLICY",
      path: `${MANIFEST_FILENAME}:$.authorityPolicy.authoringMethod`,
      message: "Independent authoring method must be declared.",
    });
  }
}

function validateSeeds(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): Set<string> {
  const determinism = manifest["determinism"];
  if (!isObject(determinism)) {
    findings.push({
      code: "F1_SEED_SHAPE",
      path: `${MANIFEST_FILENAME}:$.determinism`,
      message: "Determinism policy must be an object.",
    });
    return new Set();
  }
  if (determinism["propertyGenerator"] !== "xorshift32-v1") {
    findings.push({
      code: "F1_SEED_SHAPE",
      path: `${MANIFEST_FILENAME}:$.determinism.propertyGenerator`,
      message: "Expected the frozen xorshift32-v1 property generator.",
    });
  }
  const rawSeeds = determinism["stableSeeds"];
  if (!Array.isArray(rawSeeds)) {
    findings.push({
      code: "F1_SEED_SHAPE",
      path: `${MANIFEST_FILENAME}:$.determinism.stableSeeds`,
      message: "Stable seeds must be an array.",
    });
    return new Set();
  }
  const ids = new Set<string>();
  const values = new Set<number>();
  rawSeeds.forEach((raw, index) => {
    const path = `${MANIFEST_FILENAME}:$.determinism.stableSeeds[${String(index)}]`;
    if (!isObject(raw)) {
      findings.push({ code: "F1_SEED_SHAPE", path, message: "Seed must be an object." });
      return;
    }
    const id = raw["id"];
    const value = raw["value"];
    if (typeof id !== "string" || id.length === 0) {
      findings.push({ code: "F1_SEED_SHAPE", path: `${path}.id`, message: "Seed ID must be non-empty." });
    } else if (ids.has(id)) {
      findings.push({ code: "F1_SEED_DUPLICATE", path: `${path}.id`, message: `Duplicate seed ID ${id}.` });
    } else {
      ids.add(id);
    }
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value <= 0 ||
      value > 0xffff_ffff
    ) {
      findings.push({
        code: "F1_SEED_SHAPE",
        path: `${path}.value`,
        message: "xorshift32 seed must be an integer in 1...2^32-1.",
      });
    } else if (values.has(value)) {
      findings.push({ code: "F1_SEED_DUPLICATE", path: `${path}.value`, message: `Duplicate seed value ${String(value)}.` });
    } else {
      values.add(value);
    }
    if (typeof raw["purpose"] !== "string" || raw["purpose"].trim().length === 0) {
      findings.push({ code: "F1_SEED_SHAPE", path: `${path}.purpose`, message: "Seed purpose must be non-empty." });
    }
  });
  const actualSeedPairs = rawSeeds.map((raw) =>
    isObject(raw) ? [raw["id"], raw["value"]] : null
  );
  if (!jsonEqual(actualSeedPairs, EXPECTED_SEEDS)) {
    findings.push({
      code: "F1_SEED_INVENTORY",
      path: `${MANIFEST_FILENAME}:$.determinism.stableSeeds`,
      message: "Stable seed IDs, values, and order must match the reviewed F1 schedule.",
    });
  }
  return ids;
}

function companionDeclarations(
  manifest: JsonObject,
  findings: F1ContractFinding[],
): Array<Readonly<{ path: string; schema: string; recordCollections: string[] }>> {
  const rawCompanions = manifest["companions"];
  if (!Array.isArray(rawCompanions)) {
    findings.push({
      code: "F1_COMPANION_DECLARATION",
      path: `${MANIFEST_FILENAME}:$.companions`,
      message: "Companions must be an array.",
    });
    return [];
  }
  const declarations: Array<Readonly<{ path: string; schema: string; recordCollections: string[] }>> = [];
  const paths = new Set<string>();
  rawCompanions.forEach((raw, index) => {
    const path = `${MANIFEST_FILENAME}:$.companions[${String(index)}]`;
    if (!isObject(raw)) {
      findings.push({ code: "F1_COMPANION_DECLARATION", path, message: "Companion declaration must be an object." });
      return;
    }
    const keys = Object.keys(raw).sort();
    if (!sameStringArray(keys, [...EXPECTED_COMPANION_KEYS].sort())) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path,
        message: "Companion declaration must contain exactly path, schema, role, and recordCollections.",
      });
    }
    const filename = raw["path"];
    const schema = raw["schema"];
    const role = raw["role"];
    const collections = stringsFromUnknown(
      raw["recordCollections"],
      `${path}.recordCollections`,
      findings,
      { nonempty: true, unique: true },
    );
    if (
      typeof filename !== "string" ||
      filename.length === 0 ||
      basename(filename) !== filename ||
      !filename.endsWith(".json") ||
      filename === MANIFEST_FILENAME
    ) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path: `${path}.path`,
        message: "Companion path must be a safe sibling JSON filename.",
      });
      return;
    }
    if (paths.has(filename)) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path: `${path}.path`,
        message: `Duplicate companion declaration ${filename}.`,
      });
      return;
    }
    paths.add(filename);
    if (typeof schema !== "string" || schema.length === 0) {
      findings.push({ code: "F1_COMPANION_DECLARATION", path: `${path}.schema`, message: "Companion schema must be non-empty." });
      return;
    }
    if (typeof role !== "string" || role.trim().length === 0) {
      findings.push({ code: "F1_COMPANION_DECLARATION", path: `${path}.role`, message: "Companion role must be non-empty." });
    }
    declarations.push({ path: filename, schema, recordCollections: collections });
  });
  const actualByPath = new Map(declarations.map((item) => [item.path, item]));
  for (const expected of EXPECTED_COMPANIONS) {
    const actual = actualByPath.get(expected.path);
    if (
      actual === undefined ||
      actual.schema !== expected.schema ||
      !sameStringArray(actual.recordCollections, expected.recordCollections)
    ) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path: `${MANIFEST_FILENAME}:$.companions`,
        message: `Missing or altered companion declaration for ${expected.path}.`,
      });
    }
  }
  const expectedPaths: ReadonlySet<string> = new Set<string>(
    EXPECTED_COMPANIONS.map((item) => item.path),
  );
  for (const declaration of declarations) {
    if (!expectedPaths.has(declaration.path)) {
      findings.push({
        code: "F1_COMPANION_DECLARATION",
        path: `${MANIFEST_FILENAME}:$.companions`,
        message: `Unexpected companion declaration ${declaration.path}.`,
      });
    }
  }
  return declarations;
}

async function validateCompanionInventory(
  fixtureRoot: string,
  declarations: readonly Readonly<{ path: string; schema: string; recordCollections: string[] }>[],
  findings: F1ContractFinding[],
): Promise<ParsedCompanion[]> {
  let filenames: string[] = [];
  try {
    filenames = (await readdir(fixtureRoot))
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    findings.push({
      code: "F1_COMPANION_INVENTORY",
      path: ".",
      message: error instanceof Error ? error.message : "Unable to enumerate fixture root.",
    });
  }
  const declared = new Set(declarations.map((item) => item.path));
  for (const filename of filenames) {
    if (filename !== MANIFEST_FILENAME && !declared.has(filename)) {
      findings.push({
        code: "F1_COMPANION_UNDECLARED",
        path: filename,
        message: "JSON companion is not declared by the F1 manifest.",
      });
    }
  }

  const parsed: ParsedCompanion[] = [];
  for (const declaration of declarations) {
    const root = await parseJsonObject(
      fixtureRoot,
      declaration.path,
      findings,
      "F1_COMPANION_MISSING",
    );
    if (!root) continue;
    if (root["schema"] !== declaration.schema) {
      findings.push({
        code: "F1_COMPANION_SCHEMA",
        path: `${declaration.path}:$.schema`,
        message: `Expected ${JSON.stringify(declaration.schema)}.`,
      });
    }
    for (const collection of declaration.recordCollections) {
      if (!Array.isArray(root[collection])) {
        findings.push({
          code: "F1_COMPANION_COLLECTION",
          path: `${declaration.path}:$.${collection}`,
          message: "Declared record collection must be an array.",
        });
      }
    }
    parsed.push({ ...declaration, root });
  }
  return parsed;
}

function fixtureCases(
  companions: readonly ParsedCompanion[],
  seedIds: ReadonlySet<string>,
  findings: F1ContractFinding[],
): FixtureCase[] {
  const cases: FixtureCase[] = [];
  const seenIds = new Map<string, string>();
  for (const companion of companions) {
    if (!companion.path.endsWith("-cases.json")) continue;
    const defaultSeedId = companion.root["defaultSeedId"];
    if (typeof defaultSeedId !== "string" || !seedIds.has(defaultSeedId)) {
      findings.push({
        code: "F1_SEED_REFERENCE_UNKNOWN",
        path: `${companion.path}:$.defaultSeedId`,
        message: `Default seed ${JSON.stringify(defaultSeedId)} is not declared by the manifest.`,
      });
    }
    for (const collection of companion.recordCollections) {
      const rawRecords = companion.root[collection];
      if (!Array.isArray(rawRecords)) continue;
      const collectionIds: string[] = [];
      rawRecords.forEach((raw, index) => {
        const path = `${companion.path}:$.${collection}[${String(index)}]`;
        if (!isObject(raw) || typeof raw["id"] !== "string" || raw["id"].length === 0) {
          findings.push({ code: "F1_CASE_SHAPE", path, message: "Fixture case requires a non-empty string ID." });
          return;
        }
        const id = raw["id"];
        collectionIds.push(id);
        const previousPath = seenIds.get(id);
        if (previousPath !== undefined) {
          findings.push({
            code: "F1_CASE_ID_DUPLICATE",
            path: `${path}.id`,
            message: `Case ID ${id} already appears at ${previousPath}.`,
          });
        } else {
          seenIds.set(id, `${path}.id`);
        }
        const traceIds = stringsFromUnknown(raw["traceIds"], `${path}.traceIds`, findings, { nonempty: true, unique: true });
        const authorityIds = stringsFromUnknown(raw["authorityIds"], `${path}.authorityIds`, findings, { nonempty: true, unique: true });
        cases.push({ id, path, record: raw, traceIds, authorityIds });
      });
      const expected = sortedStrings(collectionIds);
      if (!sameStringArray(collectionIds, expected)) {
        findings.push({
          code: "F1_CASE_ID_ORDER",
          path: `${companion.path}:$.${collection}`,
          message: "Case IDs must be in stable lexical order within each declared case collection.",
        });
      }
      for (let index = 1; index < collectionIds.length; index += 1) {
        if ((collectionIds[index - 1] ?? "") >= (collectionIds[index] ?? "")) {
          findings.push({
            code: "F1_CASE_ID_ORDER",
            path: `${companion.path}:$.${collection}[${String(index)}].id`,
            message: "Case IDs must increase strictly; duplicates are not an ordering shortcut.",
          });
          break;
        }
      }
    }
  }
  return cases;
}

function ledgerRecords(
  companion: ParsedCompanion | undefined,
  collection: string,
  idCode: string,
  findings: F1ContractFinding[],
): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  if (!companion) return result;
  const records = companion.root[collection];
  if (!Array.isArray(records)) return result;
  records.forEach((raw, index) => {
    const path = `${companion.path}:$.${collection}[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string" || raw["id"].length === 0) {
      findings.push({ code: idCode, path, message: "Ledger record requires a non-empty string ID." });
      return;
    }
    if (result.has(raw["id"])) {
      findings.push({ code: idCode, path: `${path}.id`, message: `Duplicate ledger ID ${raw["id"]}.` });
      return;
    }
    result.set(raw["id"], raw);
  });
  return result;
}

function validateLedgerInventories(
  traces: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: F1ContractFinding[],
): void {
  if (!jsonEqual([...traces.keys()], EXPECTED_TRACE_IDS)) {
    findings.push({
      code: "F1_TRACE_INVENTORY",
      path: "trace-ledger.json:$.traces",
      message: "Trace IDs and order must match the complete reviewed F1 requirement inventory.",
    });
  }
  if (!jsonEqual([...authorities.keys()], EXPECTED_AUTHORITY_IDS)) {
    findings.push({
      code: "F1_AUTHORITY_INVENTORY",
      path: "provenance-ledger.json:$.authorities",
      message: "Authority IDs and order must match the reviewed project/external authority split.",
    });
  }

  for (const [id, trace] of traces) {
    const path = `trace-ledger.json:$.traces.${id}`;
    if (
      typeof trace["parentClause"] !== "string" ||
      trace["parentClause"].trim().length === 0
    ) {
      findings.push({ code: "F1_TRACE_LEDGER", path, message: "Trace requires a nonempty parent clause." });
    }
    stringsFromUnknown(trace["sourceRefs"], `${path}.sourceRefs`, findings, {
      nonempty: true,
      unique: true,
    });
    stringsFromUnknown(trace["proofKinds"], `${path}.proofKinds`, findings, {
      nonempty: true,
      unique: true,
    });
    const hasCases = Array.isArray(trace["requiredCaseIds"]) &&
      trace["requiredCaseIds"].length > 0;
    const hasPrefixes = Array.isArray(trace["requiredFixturePrefixes"]) &&
      trace["requiredFixturePrefixes"].length > 0;
    if (!hasCases && !hasPrefixes) {
      findings.push({
        code: "F1_TRACE_LEDGER",
        path,
        message: "Trace must name exact required cases or an all-match fixture prefix.",
      });
    }
  }

  for (const [id, authority] of authorities) {
    const path = `provenance-ledger.json:$.authorities.${id}`;
    const sourceRefs = stringsFromUnknown(
      authority["sourceRefs"],
      `${path}.sourceRefs`,
      findings,
      { nonempty: true, unique: true },
    );
    if (sourceRefs.some((sourceRef) => /\.md:\d+(?:-\d+)?$/.test(sourceRef))) {
      findings.push({
        code: "F1_AUTHORITY_STALE_REFERENCE",
        path: `${path}.sourceRefs`,
        message: "Authority references use stable section anchors, not drift-prone line numbers.",
      });
    }
    if (
      typeof authority["covers"] !== "string" ||
      authority["covers"].trim().length === 0 ||
      typeof authority["judgmentBearing"] !== "boolean"
    ) {
      findings.push({
        code: "F1_AUTHORITY_LEDGER",
        path,
        message: "Authority requires coverage text and an explicit judgment-bearing classification.",
      });
    }
  }
}

function validateProvenancePolicy(
  provenance: ParsedCompanion | undefined,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: F1ContractFinding[],
): void {
  if (!provenance) return;
  for (const flag of ["productionOutputUsed", "expectedValuesGenerated"] as const) {
    if (provenance.root[flag] !== false) {
      findings.push({
        code: "F1_AUTHORITY_POLICY",
        path: `${provenance.path}:$.${flag}`,
        message: `${flag} must remain false.`,
      });
    }
  }
  if (
    typeof provenance.root["authoringStatement"] !== "string" ||
    provenance.root["authoringStatement"].trim().length === 0
  ) {
    findings.push({
      code: "F1_AUTHORITY_POLICY",
      path: `${provenance.path}:$.authoringStatement`,
      message: "Independent fixture authoring statement is required.",
    });
  }
  for (const [id, authority] of authorities) {
    const authorityClass = authority["authorityClass"];
    if (typeof authorityClass !== "string" || authorityClass.trim().length === 0) {
      findings.push({
        code: "F1_AUTHORITY_POLICY",
        path: `${provenance.path}:$.authorities.${id}.authorityClass`,
        message: "Authority class must be declared.",
      });
    } else if (/production\s+(artifact|module|output)|production authority/i.test(authorityClass)) {
      findings.push({
        code: "F1_AUTHORITY_POLICY",
        path: `${provenance.path}:$.authorities.${id}.authorityClass`,
        message: "Production output or implementation cannot be fixture authority.",
      });
    }
  }
}

function validateTraceAndAuthorityReferences(
  cases: readonly FixtureCase[],
  traces: ReadonlyMap<string, JsonObject>,
  authorities: ReadonlyMap<string, JsonObject>,
  findings: F1ContractFinding[],
): void {
  const casesById = new Map(cases.map((item) => [item.id, item]));
  const traceUses = new Map<string, number>();
  const authorityUses = new Map<string, number>();
  for (const fixtureCase of cases) {
    for (const traceId of fixtureCase.traceIds) {
      if (!traces.has(traceId)) {
        findings.push({
          code: "F1_TRACE_UNKNOWN",
          path: `${fixtureCase.path}.traceIds`,
          message: `Unknown trace ID ${traceId}.`,
        });
      } else {
        traceUses.set(traceId, (traceUses.get(traceId) ?? 0) + 1);
      }
    }
    for (const authorityId of fixtureCase.authorityIds) {
      if (!authorities.has(authorityId)) {
        findings.push({
          code: "F1_AUTHORITY_UNKNOWN",
          path: `${fixtureCase.path}.authorityIds`,
          message: `Unknown authority ID ${authorityId}.`,
        });
      } else {
        authorityUses.set(authorityId, (authorityUses.get(authorityId) ?? 0) + 1);
      }
    }
  }
  for (const [traceId, trace] of traces) {
    if (!traceUses.has(traceId)) {
      findings.push({
        code: "F1_TRACE_ORPHAN",
        path: `trace-ledger.json:$.traces.${traceId}`,
        message: "Trace is not referenced by any fixture case.",
      });
    }
    const requiredCaseIds = trace["requiredCaseIds"];
    if (requiredCaseIds !== undefined) {
      const ids = stringsFromUnknown(
        requiredCaseIds,
        `trace-ledger.json:$.traces.${traceId}.requiredCaseIds`,
        findings,
        { unique: true },
      );
      for (const caseId of ids) {
        const fixtureCase = casesById.get(caseId);
        if (!fixtureCase) {
          findings.push({
            code: "F1_TRACE_CASE_UNKNOWN",
            path: `trace-ledger.json:$.traces.${traceId}.requiredCaseIds`,
            message: `Required case ${caseId} does not exist.`,
          });
        } else if (!fixtureCase.traceIds.includes(traceId)) {
          findings.push({
            code: "F1_TRACE_CASE_BACKLINK",
            path: `trace-ledger.json:$.traces.${traceId}.requiredCaseIds`,
            message: `Required case ${caseId} does not link back to ${traceId}.`,
          });
        }
      }
    }
    const prefixes = trace["requiredFixturePrefixes"];
    if (prefixes !== undefined) {
      for (const prefix of stringsFromUnknown(
        prefixes,
        `trace-ledger.json:$.traces.${traceId}.requiredFixturePrefixes`,
        findings,
        { unique: true },
      )) {
        const covered = cases.some(
          (item) => item.id.startsWith(prefix) && item.traceIds.includes(traceId),
        );
        if (!covered) {
          findings.push({
            code: "F1_TRACE_PREFIX_UNCOVERED",
            path: `trace-ledger.json:$.traces.${traceId}.requiredFixturePrefixes`,
            message: `No ${prefix}* case links to ${traceId}.`,
          });
        }
      }
    }
  }
  for (const authorityId of authorities.keys()) {
    if (!authorityUses.has(authorityId)) {
      findings.push({
        code: "F1_AUTHORITY_ORPHAN",
        path: `provenance-ledger.json:$.authorities.${authorityId}`,
        message: "Authority is not referenced by any fixture case.",
      });
    }
  }
}

function collectCodeProperties(value: unknown, path: string): Array<Readonly<{ code: string; path: string }>> {
  const result: Array<Readonly<{ code: string; path: string }>> = [];
  const visit = (current: unknown, currentPath: string): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${currentPath}[${String(index)}]`));
      return;
    }
    if (!isObject(current)) return;
    for (const [key, child] of Object.entries(current)) {
      const childPath = `${currentPath}.${key}`;
      if (key === "code" && typeof child === "string") {
        result.push({ code: child, path: childPath });
      }
      visit(child, childPath);
    }
  };
  visit(value, path);
  return result;
}

function collectInvalidStatuses(
  value: unknown,
  path: string,
): Array<Readonly<{ code: string; path: string }>> {
  const result: Array<Readonly<{ code: string; path: string }>> = [];
  const visit = (current: unknown, currentPath: string): void => {
    if (typeof current === "string" && current.startsWith("invalid:")) {
      result.push({
        code: current.slice("invalid:".length),
        path: currentPath,
      });
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${currentPath}[${String(index)}]`));
      return;
    }
    if (!isObject(current)) return;
    for (const [key, child] of Object.entries(current)) {
      visit(child, `${currentPath}.${key}`);
    }
  };
  visit(value, path);
  return result;
}

function validateExpectedIssueCodes(
  cases: readonly FixtureCase[],
  findings: F1ContractFinding[],
): void {
  for (const fixtureCase of cases) {
    const expected = fixtureCase.record["expected"];
    if (isObject(expected)) {
      const codes = collectCodeProperties(expected, `${fixtureCase.path}.expected`);
      if (expected["ok"] === true && codes.length > 0) {
        for (const item of codes) {
          findings.push({
            code: "F1_SUCCESS_CARRIES_ISSUE_CODE",
            path: item.path,
            message: `Successful expectation must not carry rejection code ${item.code}.`,
          });
        }
      } else {
        for (const item of codes) {
          if (!ISSUE_CODE_VALUES.has(item.code)) {
            findings.push({
              code: "F1_EXPECTED_ISSUE_CODE_UNKNOWN",
              path: item.path,
              message: `Expected rejection code ${item.code} is not exported by the public domain index.`,
            });
          }
        }
      }
    }
    for (const item of collectInvalidStatuses(fixtureCase.record, fixtureCase.path)) {
      if (!ISSUE_CODE_VALUES.has(item.code)) {
        findings.push({
          code: "F1_EXPECTED_ISSUE_CODE_UNKNOWN",
          path: item.path,
          message: `Expected rejection code ${item.code} is not exported by the public domain index.`,
        });
      }
    }
  }
}

function validateBeatCoverage(
  beat: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): void {
  if (!beat) return;
  if (beat.root["ppq"] !== MIDI_PPQ) {
    findings.push({ code: "F1_BEAT_DIVISOR_COVERAGE", path: `${beat.path}:$.ppq`, message: `Expected PPQ ${String(MIDI_PPQ)}.` });
  }
  const rawDivisors = beat.root["divisorCases"];
  if (!Array.isArray(rawDivisors)) return;
  const denominators: number[] = [];
  const divisorCaseIds: string[] = [];
  rawDivisors.forEach((raw, index) => {
    const path = `${beat.path}:$.divisorCases[${String(index)}]`;
    if (!isObject(raw)) return;
    if (typeof raw["denominator"] === "number") denominators.push(raw["denominator"]);
    if (typeof raw["id"] === "string") divisorCaseIds.push(raw["id"]);
    const denominator = raw["denominator"];
    if (typeof denominator !== "number" || !Number.isInteger(denominator) || denominator <= 0) {
      findings.push({ code: "F1_BEAT_DIVISOR_COVERAGE", path: `${path}.denominator`, message: "Divisor denominator must be a positive integer." });
      return;
    }
    if (raw["unitTicks"] !== MIDI_PPQ / denominator) {
      findings.push({ code: "F1_BEAT_DIVISOR_COVERAGE", path: `${path}.unitTicks`, message: "unitTicks must be the independent PPQ unit-fraction oracle." });
    }
    if (!jsonEqual(raw["doubleUnit"], reduced(2, denominator))) {
      findings.push({ code: "F1_BEAT_DIVISOR_COVERAGE", path: `${path}.doubleUnit`, message: "doubleUnit must be independently reduced." });
    }
  });
  if (!jsonEqual(denominators, [...ALLOWED_BEAT_DENOMINATORS])) {
    findings.push({
      code: "F1_BEAT_DIVISOR_COVERAGE",
      path: `${beat.path}:$.divisorCases`,
      message: "Divisor cases must cover the exact ordered 28-divisor PPQ set.",
    });
  }
  const pairwise = beat.root["pairwiseClosureCases"];
  if (!Array.isArray(pairwise) || pairwise.length !== 1 || !isObject(pairwise[0])) {
    findings.push({
      code: "F1_PAIRWISE_ORACLE",
      path: `${beat.path}:$.pairwiseClosureCases`,
      message: "Exactly one declared pairwise closure oracle is required.",
    });
    return;
  }
  const oracleRow = pairwise[0];
  if (
    oracleRow["kind"] !== "cartesian-unit-fraction-closure" ||
    oracleRow["orderedPairCount"] !== ALLOWED_BEAT_DENOMINATORS.length ** 2 ||
    !jsonEqual(oracleRow["leftAndRightCaseIds"], divisorCaseIds)
  ) {
    findings.push({
      code: "F1_PAIRWISE_ORACLE",
      path: `${beat.path}:$.pairwiseClosureCases[0]`,
      message: "Pairwise oracle must declare the complete ordered 28x28 Cartesian product (784 pairs).",
    });
  }
  const oracle = oracleRow["independentTickOracle"];
  const requiredKeys = [
    "addition",
    "closureExpectation",
    "comparison",
    "leftTicks",
    "rightTicks",
    "subtraction",
  ];
  if (
    !isObject(oracle) ||
    !sameStringArray(Object.keys(oracle).sort(), requiredKeys) ||
    requiredKeys.some((key) => typeof oracle[key] !== "string" || oracle[key].trim().length === 0)
  ) {
    findings.push({
      code: "F1_PAIRWISE_ORACLE",
      path: `${beat.path}:$.pairwiseClosureCases[0].independentTickOracle`,
      message: "Independent tick oracle must declare all six nonempty arithmetic rules.",
    });
  }
}

function expectedMeterGrid(): Array<Readonly<{ beatsPerBar: number; beatUnit: number }>> {
  const result: Array<Readonly<{ beatsPerBar: number; beatUnit: number }>> = [];
  for (const beatUnit of [2, 4, 8]) {
    for (let beatsPerBar = 2; beatsPerBar <= 6; beatsPerBar += 1) {
      result.push({ beatsPerBar, beatUnit });
    }
  }
  result.push({ beatsPerBar: 12, beatUnit: 8 });
  return result;
}

function validateMeterGrid(
  meter: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): void {
  if (!meter) return;
  const rawCases = meter.root["capacityCases"];
  if (!Array.isArray(rawCases)) return;
  const expectedGrid = expectedMeterGrid();
  const actualGrid: unknown[] = [];
  rawCases.forEach((raw, index) => {
    const path = `${meter.path}:$.capacityCases[${String(index)}]`;
    if (!isObject(raw) || !isObject(raw["meter"])) return;
    const beatsPerBar = raw["meter"]["beatsPerBar"];
    const beatUnit = raw["meter"]["beatUnit"];
    actualGrid.push({ beatsPerBar, beatUnit });
    if (typeof beatsPerBar !== "number" || typeof beatUnit !== "number") return;
    const expectedCapacity = reduced(beatsPerBar * 4, beatUnit);
    if (!jsonEqual(raw["expectedCapacity"], expectedCapacity)) {
      findings.push({
        code: "F1_METER_GRID",
        path: `${path}.expectedCapacity`,
        message: "Meter capacity must equal beatsPerBar * 4 / beatUnit in quarter-note beats.",
      });
    }
  });
  if (!jsonEqual(actualGrid, expectedGrid)) {
    findings.push({
      code: "F1_METER_GRID",
      path: `${meter.path}:$.capacityCases`,
      message: "Capacity cases must contain the exact 2/2...6/8 grid followed by the 12/8 near-miss.",
    });
  }
  const nearMisses = rawCases.filter(
    (raw) => isObject(raw) &&
      isObject(raw["meter"]) &&
      raw["meter"]["beatsPerBar"] === 12 &&
      raw["meter"]["beatUnit"] === 8 &&
      jsonEqual(raw["expectedCapacity"], { numerator: 6, denominator: 1 }) &&
      typeof raw["note"] === "string" &&
      /near-miss/i.test(raw["note"]),
  );
  if (nearMisses.length !== 1) {
    findings.push({
      code: "F1_METER_NEAR_MISS",
      path: `${meter.path}:$.capacityCases`,
      message: "Exactly one explicit 12/8 => 6 quarter-note-beat near-miss is required.",
    });
  }
}

function autoPolicyExpectation(family: string): JsonObject {
  const rootless = family === "rootless-a" || family === "rootless-b";
  const rootlessInvalid = "invalid:voicing.rootless_requires_external";
  return {
    noSlash: {
      generated: rootless ? rootlessInvalid : "valid",
      external: "valid",
      none: rootless ? rootlessInvalid : "valid",
    },
    slash: {
      generated: rootless ? rootlessInvalid : "valid",
      external: "valid",
      none: rootless
        ? rootlessInvalid
        : "invalid:voicing.slash_bass_policy_none",
    },
  };
}

function validateAutoBassMatrix(
  voicing: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): void {
  if (!voicing) return;
  const matrix = voicing.root["autoPolicyMatrix"];
  if (!Array.isArray(matrix)) return;
  const families: string[] = [];
  matrix.forEach((raw, index) => {
    const path = `${voicing.path}:$.autoPolicyMatrix[${String(index)}]`;
    if (!isObject(raw) || typeof raw["family"] !== "string") {
      findings.push({ code: "F1_AUTO_BASS_MATRIX", path, message: "Matrix row requires a family." });
      return;
    }
    families.push(raw["family"]);
    if (!jsonEqual(raw["expectedByChordBass"], autoPolicyExpectation(raw["family"]))) {
      findings.push({
        code: "F1_AUTO_BASS_MATRIX",
        path: `${path}.expectedByChordBass`,
        message: `Auto bass matrix is incomplete or incorrect for ${raw["family"]}.`,
      });
    }
    const statuses = raw["expectedByChordBass"];
    const visitStatuses = (value: unknown, valuePath: string): void => {
      if (typeof value === "string" && value.startsWith("invalid:")) {
        const issueCode = value.slice("invalid:".length);
        if (!ISSUE_CODE_VALUES.has(issueCode)) {
          findings.push({
            code: "F1_EXPECTED_ISSUE_CODE_UNKNOWN",
            path: valuePath,
            message: `Matrix rejection code ${issueCode} is not exported by the public domain index.`,
          });
        }
      } else if (isObject(value)) {
        for (const [key, child] of Object.entries(value)) {
          visitStatuses(child, `${valuePath}.${key}`);
        }
      }
    };
    visitStatuses(statuses, `${path}.expectedByChordBass`);
  });
  if (
    !sameStringArray(families, [...AUTO_VOICING_FAMILIES]) ||
    !sameStringArray([...AUTO_BASS_POLICIES], ["generated", "external", "none"])
  ) {
    findings.push({
      code: "F1_AUTO_BASS_MATRIX",
      path: `${voicing.path}:$.autoPolicyMatrix`,
      message: "Matrix must cover all seven public Auto families and all three bass policies in canonical order.",
    });
  }
}

function validateOperationStates(
  operationStates: ParsedCompanion | undefined,
  findings: F1ContractFinding[],
): void {
  if (!operationStates) return;
  if (!jsonEqual(operationStates.root["applicabilityVocabulary"], ["required", "not-applicable"])) {
    findings.push({
      code: "F1_OPERATION_STATE",
      path: `${operationStates.path}:$.applicabilityVocabulary`,
      message: "Operation-state applicability vocabulary is frozen.",
    });
  }
  const cases = operationStates.root["cases"];
  if (!Array.isArray(cases)) return;
  const requiredPureIds = new Set([
    "F1-OPSTATE-001",
    "F1-OPSTATE-002",
    "F1-OPSTATE-003",
    "F1-OPSTATE-004",
    "F1-OPSTATE-005",
  ]);
  const foundPureIds = new Set<string>();
  cases.forEach((raw, index) => {
    const path = `${operationStates.path}:$.cases[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string") return;
    const cancellation = raw["cancellation"];
    const stale = raw["staleRevision"];
    if (!isObject(cancellation) || cancellation["applicability"] !== "not-applicable") {
      findings.push({
        code: "F1_OPERATION_STATE",
        path: `${path}.cancellation`,
        message: "F1 and its declared downstream synchronous operations do not invent cancellation semantics.",
      });
    }
    if (requiredPureIds.has(raw["id"])) {
      foundPureIds.add(raw["id"]);
      if (!isObject(stale) || stale["applicability"] !== "not-applicable") {
        findings.push({
          code: "F1_OPERATION_STATE",
          path: `${path}.staleRevision`,
          message: "Pure F1 value operations have no revision and must declare staleness not applicable.",
        });
      }
    } else if (isObject(stale) && stale["applicability"] === "required") {
      if (stale["ownedBy"] === "F1" || typeof stale["ownedBy"] !== "string") {
        findings.push({
          code: "F1_OPERATION_STATE",
          path: `${path}.staleRevision.ownedBy`,
          message: "Any required stale check must name a downstream non-F1 owner.",
        });
      }
    }
  });
  if (!sameStringArray(sortedStrings([...foundPureIds]), sortedStrings([...requiredPureIds]))) {
    findings.push({
      code: "F1_OPERATION_STATE",
      path: `${operationStates.path}:$.cases`,
      message: "All five pure/bounded F1 operation classes require explicit cancellation/stale N/A declarations.",
    });
  }
}

function sortFindings(findings: F1ContractFinding[]): F1ContractFinding[] {
  return findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
}

export async function validateF1Contract(
  fixtureRoot = DEFAULT_FIXTURE_ROOT,
): Promise<F1ContractValidationReport> {
  const normalizedRoot = resolve(fixtureRoot);
  const findings: F1ContractFinding[] = [];
  const manifest = await parseJsonObject(
    normalizedRoot,
    MANIFEST_FILENAME,
    findings,
    "F1_MANIFEST_MISSING",
  );
  if (!manifest) {
    const sorted = sortFindings(findings);
    return {
      schema: "changes.validation.f1-contract.v1",
      package: "F1",
      outcome: "fail",
      counts: { companions: 0, cases: 0, traces: 0, authorities: 0, seeds: 0 },
      findings: sorted,
    };
  }

  validateManifestIdentity(manifest, findings);
  validateFixedConstants(manifest, findings);
  validateAuthorityPolicy(manifest, findings);
  const seedIds = validateSeeds(manifest, findings);
  const declarations = companionDeclarations(manifest, findings);
  const companions = await validateCompanionInventory(
    normalizedRoot,
    declarations,
    findings,
  );
  const cases = fixtureCases(companions, seedIds, findings);
  const traceCompanion = companions.find((item) => item.path === "trace-ledger.json");
  const provenanceCompanion = companions.find(
    (item) => item.path === "provenance-ledger.json",
  );
  const traces = ledgerRecords(
    traceCompanion,
    "traces",
    "F1_TRACE_LEDGER",
    findings,
  );
  const authorities = ledgerRecords(
    provenanceCompanion,
    "authorities",
    "F1_AUTHORITY_LEDGER",
    findings,
  );
  validateProvenancePolicy(provenanceCompanion, authorities, findings);
  validateTraceAndAuthorityReferences(cases, traces, authorities, findings);
  validateExpectedIssueCodes(cases, findings);
  validateBeatCoverage(
    companions.find((item) => item.path === "beat-value-cases.json"),
    findings,
  );
  validateMeterGrid(
    companions.find((item) => item.path === "meter-measure-cases.json"),
    findings,
  );
  validateAutoBassMatrix(
    companions.find((item) => item.path === "voicing-custom-cases.json"),
    findings,
  );
  validateOperationStates(
    companions.find((item) => item.path === "operation-state-cases.json"),
    findings,
  );

  const sorted = sortFindings(findings);
  return {
    schema: "changes.validation.f1-contract.v1",
    package: "F1",
    outcome: sorted.length === 0 ? "pass" : "fail",
    counts: {
      companions: companions.length,
      cases: cases.length,
      traces: traces.size,
      authorities: authorities.size,
      seeds: seedIds.size,
    },
    findings: sorted,
  };
}

function cliFixtureRoot(args: readonly string[]): string | null {
  if (args.length === 0) return DEFAULT_FIXTURE_ROOT;
  if (args.length === 2 && args[0] === "--fixture-root" && args[1] !== undefined) {
    return args[1];
  }
  return null;
}

if (import.meta.main) {
  const fixtureRoot = cliFixtureRoot(process.argv.slice(2));
  if (fixtureRoot === null) {
    const report: F1ContractValidationReport = {
      schema: "changes.validation.f1-contract.v1",
      package: "F1",
      outcome: "fail",
      counts: { companions: 0, cases: 0, traces: 0, authorities: 0, seeds: 0 },
      findings: [
        {
          code: "F1_CLI_ARGUMENTS",
          path: "$argv",
          message: "Usage: bun scripts/validate-f1-contract.ts [--fixture-root <directory>]",
        },
      ],
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
  } else {
    try {
      const report = await validateF1Contract(fixtureRoot);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.outcome === "pass" ? 0 : 1;
    } catch (error) {
      const report: F1ContractValidationReport = {
        schema: "changes.validation.f1-contract.v1",
        package: "F1",
        outcome: "fail",
        counts: { companions: 0, cases: 0, traces: 0, authorities: 0, seeds: 0 },
        findings: [
          {
            code: "F1_VALIDATOR_TOOL_FAILURE",
            path: "$tool",
            message: error instanceof Error ? error.message : "Unknown validator failure.",
          },
        ],
      };
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 2;
    }
  }
}
