import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import {
  constants as zlibConstants,
  deflateRawSync,
  inflateRawSync,
} from "node:zlib";

import ts from "typescript";

import { atomicWrite, sha256Hex } from "./foundation-io";
import { findRealNode } from "./toolchain-doctor";

import packageFixture from "../package.json";

import availabilityFixture from
  "../tests/fixtures/voicing/availability-matrix.json";
import candidateFixture from "../tests/fixtures/voicing/candidate-cases.json";
import familyFixture from "../tests/fixtures/voicing/family-templates.json";
import lawFixture from "../tests/fixtures/voicing/law-cases.json";
import limitFixture from "../tests/fixtures/voicing/limit-cases.json";
import mutationFixture from "../tests/fixtures/voicing/mutation-controls.json";
import operationFixture from
  "../tests/fixtures/voicing/operation-state-cases.json";
import provenanceFixture from
  "../tests/fixtures/voicing/provenance-ledger.json";
import traceFixture from "../tests/fixtures/voicing/trace-ledger.json";
import transpositionFixture from
  "../tests/fixtures/voicing/transposition-seeds.json";
import contractFixture from
  "../tests/fixtures/voicing/v0-voicing-contract.json";

type JsonRecord = Record<string, unknown>;
type Outcome = "pass" | "fail";

export type V0EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  traceId: string | null;
}>;

export const V0_PRODUCTION_MARKER = "V0_EVIDENCE_OBSERVATION " as const;
export const V0_MUTATION_MARKER = "V0_CONFORMANCE_OBSERVATION " as const;
export const V0_STATIC_MARKER = "V0_STATIC_OBSERVATION " as const;

export const V0_PRODUCTION_SCHEMA =
  "changes.evidence.v0-production-conformance-observation.v1" as const;
export const V0_MUTATION_SCHEMA =
  "changes.evidence.v0-mutation-conformance-observation.v1" as const;
export const V0_STATIC_SCHEMA =
  "changes.evidence.v0-static-boundary-observation.v1" as const;

export const V0_PRODUCTION_PRODUCER = Object.freeze({
  file: "tests/conformance/v0-production-conformance.test.ts",
  testcase:
    "executes the complete independent V0 authority and emits one bound observation",
} as const);

export const V0_MUTATION_PRODUCER = Object.freeze({
  file: "tests/conformance/v0-laws-mutation-controls.test.ts",
  testcase:
    "executes every V0 law witness and kills every reviewed semantic counterfactual",
} as const);

export const V0_STATIC_PRODUCER = Object.freeze({
  file: "tests/static/v0-production-policy.test.ts",
  testcase: "keeps V0 pure, synchronous, local, and isolated from ambient state",
} as const);

export const V0_STATIC_SOURCE_FILES = Object.freeze([
  "src/theory/voicing-applicability.ts",
  "src/theory/voicing-candidates-contract.ts",
  "src/theory/voicing-candidates.ts",
  "src/theory/voicing-engine-primitives.ts",
  "src/theory/voicing-family-authority.ts",
  "src/theory/voicing-operations.ts",
] as const);

export const V0_STATIC_ALLOWED_RUNTIME_IMPORT_PREFIXES = Object.freeze([
  "../domain",
  "./resolution-contract",
] as const);

const TOOL_VERSION = "jcpe.verify-v0-evidence.v1" as const;
const OUTPUT_PATH = "test-results/v0-evidence-ledger.json" as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

export function stableV0EvidenceJson(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

export function canonicalV0EvidenceJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function v0EvidenceDigest(value: unknown): string {
  return createHash("sha256")
    .update(canonicalV0EvidenceJson(value), "utf8")
    .digest("hex");
}

export const V0_RUNTIME_PREIMAGE_ENCODING =
  "rfc1951-deflate-raw-base64-canonical-json.v1" as const;
export const V0_RUNTIME_PREIMAGE_COMPRESSOR =
  "node:zlib.deflateRawSync" as const;
export const V0_RUNTIME_PREIMAGE_COMPRESSOR_VERSION =
  process.versions.zlib;
export const V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS = Object.freeze({
  level: 9,
  memLevel: 8,
  strategy: "Z_DEFAULT_STRATEGY",
  windowBits: 15,
} as const);
export const V0_RUNTIME_PREIMAGE_POOL_MAX_REFERENCES = 512 as const;
export const V0_RUNTIME_PREIMAGE_POOL_MAX_ENTRIES = 256 as const;
export const V0_RUNTIME_PREIMAGE_POOL_MAX_CANONICAL_BYTES =
  128 * 1024 * 1024;
export const V0_RUNTIME_PREIMAGE_POOL_MAX_ENCODED_BYTES = 16 * 1024 * 1024;
export const V0_RUNTIME_PREIMAGE_MAX_CANONICAL_BYTES = 64 * 1024 * 1024;
export const V0_RUNTIME_PREIMAGE_MAX_ENCODED_BYTES = 8 * 1024 * 1024;

export type V0RuntimePreimagePoolEntry = Readonly<{
  sha256: string;
  encoding: typeof V0_RUNTIME_PREIMAGE_ENCODING;
  compressor: typeof V0_RUNTIME_PREIMAGE_COMPRESSOR;
  compressorVersion: string;
  level: typeof V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.level;
  memLevel: typeof V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.memLevel;
  strategy: typeof V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.strategy;
  windowBits: typeof V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.windowBits;
  canonicalBytes: number;
  encodedBytes: number;
  data: string;
}>;

export type V0RuntimePreimagePool = Readonly<{
  entries: readonly V0RuntimePreimagePoolEntry[];
  canonicalBytes: number;
  encodedBytes: number;
}>;

export function buildV0RuntimePreimagePool(
  payloads: readonly unknown[],
): V0RuntimePreimagePool {
  if (payloads.length > V0_RUNTIME_PREIMAGE_POOL_MAX_REFERENCES) {
    throw new Error("V0 runtime preimage payload inventory exceeds reference bound");
  }
  const canonicalByDigest = new Map<string, string>();
  let canonicalBytes = 0;
  for (const payload of payloads) {
    const canonicalJson = canonicalV0EvidenceJson(payload);
    const digest = v0EvidenceDigest(payload);
    const previous = canonicalByDigest.get(digest);
    if (previous !== undefined && previous !== canonicalJson) {
      throw new Error(`V0 runtime preimage digest collision: ${digest}`);
    }
    if (previous === undefined) {
      const entryCanonicalBytes = Buffer.byteLength(canonicalJson, "utf8");
      if (entryCanonicalBytes > V0_RUNTIME_PREIMAGE_MAX_CANONICAL_BYTES) {
        throw new Error(`${digest}: runtime preimage exceeds canonical byte bound`);
      }
      if (canonicalByDigest.size >= V0_RUNTIME_PREIMAGE_POOL_MAX_ENTRIES ||
        canonicalBytes + entryCanonicalBytes >
          V0_RUNTIME_PREIMAGE_POOL_MAX_CANONICAL_BYTES) {
        throw new Error("V0 runtime preimage pool exceeds canonical bounds");
      }
      canonicalByDigest.set(digest, canonicalJson);
      canonicalBytes += entryCanonicalBytes;
    }
  }
  const entries: V0RuntimePreimagePoolEntry[] = [];
  let encodedBytes = 0;
  for (const [sha256, canonicalJson] of [...canonicalByDigest.entries()]
    .sort(([left], [right]) => compare(left, right))) {
    const entryCanonicalBytes = Buffer.byteLength(canonicalJson, "utf8");
    const encoded = deflateRawSync(Buffer.from(canonicalJson, "utf8"), {
      level: V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.level,
      memLevel: V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.memLevel,
      strategy: zlibConstants.Z_DEFAULT_STRATEGY,
      windowBits: V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.windowBits,
    });
    if (encoded.byteLength > V0_RUNTIME_PREIMAGE_MAX_ENCODED_BYTES) {
      throw new Error(`${sha256}: runtime preimage exceeds encoded byte bound`);
    }
    if (encodedBytes + encoded.byteLength >
      V0_RUNTIME_PREIMAGE_POOL_MAX_ENCODED_BYTES) {
      throw new Error("V0 runtime preimage pool exceeds encoded byte bound");
    }
    encodedBytes += encoded.byteLength;
    entries.push(Object.freeze({
      sha256,
      encoding: V0_RUNTIME_PREIMAGE_ENCODING,
      compressor: V0_RUNTIME_PREIMAGE_COMPRESSOR,
      compressorVersion: V0_RUNTIME_PREIMAGE_COMPRESSOR_VERSION,
      ...V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS,
      canonicalBytes: entryCanonicalBytes,
      encodedBytes: encoded.byteLength,
      data: encoded.toString("base64"),
    }));
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    canonicalBytes,
    encodedBytes,
  });
}

export function v0DigestWithoutKey(
  value: JsonRecord,
  omittedKey: string,
): string {
  return v0EvidenceDigest(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omittedKey),
  ));
}

export function signV0EvidenceObservation<Value extends JsonRecord>(
  value: Value,
): Value & Readonly<{ semanticDigest: string }> {
  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  );
  return {
    ...value,
    semanticDigest: v0EvidenceDigest(payload),
  };
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function sanitizeMessage(value: string): string {
  let result = value.replaceAll(process.cwd(), ".");
  const home = process.env["HOME"];
  if (home !== undefined && home.length > 0) result = result.replaceAll(home, "~");
  return result.replaceAll("\\", "/");
}

function finding(
  code: string,
  path: string,
  message: string,
  traceId: string | null = null,
): V0EvidenceFinding {
  return Object.freeze({
    code,
    path,
    message: sanitizeMessage(message),
    traceId,
  });
}

function findingKey(value: V0EvidenceFinding): string {
  return [value.traceId ?? "", value.code, value.path, value.message]
    .join("\u0000");
}

function sortFindings(
  values: readonly V0EvidenceFinding[],
): V0EvidenceFinding[] {
  return [...new Map(values.map((value) => [findingKey(value), value])).values()]
    .sort((left, right) => compare(findingKey(left), findingKey(right)));
}

type V0RuntimePreimagePoolInspection = Readonly<{
  inputDigest: string | null;
  payloads: ReadonlyMap<string, unknown>;
  entryCount: number;
  canonicalBytes: number;
  encodedBytes: number;
  findings: readonly V0EvidenceFinding[];
}>;

const runtimePreimagePoolCache = new WeakMap<
  JsonRecord,
  Readonly<{
    inputDigest: string;
    inspection: V0RuntimePreimagePoolInspection;
  }>
>();

let sharedValidRuntimePreimagePoolCache: Readonly<{
  inputDigest: string;
  inspection: V0RuntimePreimagePoolInspection;
}> | null = null;

function runtimePreimagePoolCacheInputDigest(
  mutation: JsonRecord,
): string | null {
  const referenceInventory = (
    field: "caseObservations" | "lawWitnessObservations",
  ): readonly JsonRecord[] | null => {
    const value = mutation[field];
    if (!Array.isArray(value)) return null;
    const result: JsonRecord[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) return null;
      const row: unknown = value[index];
      if (!isRecord(row) || Object.getPrototypeOf(row) !== Object.prototype) {
        return null;
      }
      const request = Object.getOwnPropertyDescriptor(
        row,
        "runtimeRequestSha256",
      );
      const response = Object.getOwnPropertyDescriptor(
        row,
        "runtimeResultSha256",
      );
      if (request === undefined || response === undefined ||
        !request.enumerable || !response.enumerable ||
        !("value" in request) || !("value" in response)) return null;
      result.push({
        runtimeRequestSha256: request.value,
        runtimeResultSha256: response.value,
      });
    }
    return result;
  };
  const caseReferences = referenceInventory("caseObservations");
  const witnessReferences = referenceInventory("lawWitnessObservations");
  if (caseReferences === null || witnessReferences === null) return null;
  const input = {
    runtimePreimagePool: mutation["runtimePreimagePool"],
    runtimePreimagePoolEntries: mutation["runtimePreimagePoolEntries"],
    runtimePreimagePoolCanonicalBytes:
      mutation["runtimePreimagePoolCanonicalBytes"],
    runtimePreimagePoolEncodedBytes:
      mutation["runtimePreimagePoolEncodedBytes"],
    caseReferences,
    witnessReferences,
  };
  return isStrictJsonCacheValue(input) ? v0EvidenceDigest(input) : null;
}

function inspectRuntimePreimagePool(
  mutation: JsonRecord,
): V0RuntimePreimagePoolInspection {
  const inputDigest = runtimePreimagePoolCacheInputDigest(mutation);
  const cached = runtimePreimagePoolCache.get(mutation);
  if (inputDigest !== null && cached?.inputDigest === inputDigest) {
    return cached.inspection;
  }
  if (inputDigest !== null &&
    sharedValidRuntimePreimagePoolCache?.inputDigest === inputDigest) {
    runtimePreimagePoolCache.set(
      mutation,
      sharedValidRuntimePreimagePoolCache,
    );
    return sharedValidRuntimePreimagePoolCache.inspection;
  }
  const findings: V0EvidenceFinding[] = [];
  const rawCaseRows = mutation["caseObservations"];
  const rawWitnessRows = mutation["lawWitnessObservations"];
  const rowInventoryLengthsAccepted = Array.isArray(rawCaseRows) &&
    rawCaseRows.length === V0_EXPECTED_COUNTS.mutationLinkedCases &&
    Array.isArray(rawWitnessRows) &&
    rawWitnessRows.length === V0_EXPECTED_COUNTS.lawWitnesses;
  const caseRows = rowInventoryLengthsAccepted
    ? rawCaseRows.filter(isRecord)
    : [];
  const witnessRows = rowInventoryLengthsAccepted
    ? rawWitnessRows.filter(isRecord)
    : [];
  const rowReferenceInventoryAccepted = rowInventoryLengthsAccepted &&
    caseRows.length === V0_EXPECTED_COUNTS.mutationLinkedCases &&
    witnessRows.length === V0_EXPECTED_COUNTS.lawWitnesses;
  if (!rowReferenceInventoryAccepted) {
    findings.push(finding(
      "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL",
      "observations.mutation.runtimePreimagePool.references",
      "Runtime preimage references are traversed only from the exact bounded 86-case and 44-law-witness record inventories.",
    ));
  }
  const rawPool = mutation["runtimePreimagePool"];
  const rawPoolIsBoundedArray = Array.isArray(rawPool) &&
    rawPool.length <= V0_RUNTIME_PREIMAGE_POOL_MAX_ENTRIES;
  const entries = rawPoolIsBoundedArray ? rawPool.filter(isRecord) : [];
  const declaredEntryCount = mutation["runtimePreimagePoolEntries"];
  const declaredCanonicalTotal = mutation["runtimePreimagePoolCanonicalBytes"];
  const declaredEncodedTotal = mutation["runtimePreimagePoolEncodedBytes"];
  const payloads = new Map<string, unknown>();
  const canonicalPayloads = new Set<string>();
  let canonicalBytes = 0;
  let encodedBytes = 0;
  let previousSha256: string | null = null;
  let declaredCanonicalSum = 0;
  let declaredEncodedSum = 0;
  const entrySizePreflight = entries.map((entry) => {
    const canonicalSize = entry["canonicalBytes"];
    const encodedSize = entry["encodedBytes"];
    const data = entry["data"];
    const accepted = typeof canonicalSize === "number" &&
      Number.isSafeInteger(canonicalSize) && canonicalSize > 0 &&
      canonicalSize <= V0_RUNTIME_PREIMAGE_MAX_CANONICAL_BYTES &&
      typeof encodedSize === "number" &&
      Number.isSafeInteger(encodedSize) && encodedSize > 0 &&
      encodedSize <= V0_RUNTIME_PREIMAGE_MAX_ENCODED_BYTES &&
      typeof data === "string" &&
      data.length === 4 * Math.ceil(encodedSize / 3);
    if (accepted) {
      declaredCanonicalSum += canonicalSize;
      declaredEncodedSum += encodedSize;
    }
    return accepted;
  });
  const poolSizePreflightAccepted = rawPoolIsBoundedArray &&
    entries.length === rawPool.length &&
    entries.length <= V0_RUNTIME_PREIMAGE_POOL_MAX_ENTRIES &&
    entrySizePreflight.every(Boolean) &&
    declaredCanonicalSum <= V0_RUNTIME_PREIMAGE_POOL_MAX_CANONICAL_BYTES &&
    declaredEncodedSum <= V0_RUNTIME_PREIMAGE_POOL_MAX_ENCODED_BYTES &&
    typeof declaredEntryCount === "number" &&
    Number.isSafeInteger(declaredEntryCount) && declaredEntryCount >= 0 &&
    declaredEntryCount === entries.length &&
    typeof declaredCanonicalTotal === "number" &&
    Number.isSafeInteger(declaredCanonicalTotal) &&
    declaredCanonicalTotal >= 0 &&
    declaredCanonicalTotal <= V0_RUNTIME_PREIMAGE_POOL_MAX_CANONICAL_BYTES &&
    declaredCanonicalTotal === declaredCanonicalSum &&
    typeof declaredEncodedTotal === "number" &&
    Number.isSafeInteger(declaredEncodedTotal) &&
    declaredEncodedTotal >= 0 &&
    declaredEncodedTotal <= V0_RUNTIME_PREIMAGE_POOL_MAX_ENCODED_BYTES &&
    declaredEncodedTotal === declaredEncodedSum;
  if (!poolSizePreflightAccepted) {
    findings.push(finding(
      "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL",
      "observations.mutation.runtimePreimagePool.preflight",
      "Runtime preimage pool sizes must pass the exact entry, per-entry, aggregate, declared-total, and canonical-base64-length budgets before any entry is decoded.",
    ));
  }
  const poolDecodePreflightAccepted = poolSizePreflightAccepted &&
    rowReferenceInventoryAccepted;
  let remainingCanonicalBytes = poolDecodePreflightAccepted &&
      typeof declaredCanonicalTotal === "number"
    ? declaredCanonicalTotal
    : 0;
  let remainingEncodedBytes = poolDecodePreflightAccepted &&
      typeof declaredEncodedTotal === "number"
    ? declaredEncodedTotal
    : 0;
  for (const [index, entry] of entries.entries()) {
    const path = `observations.mutation.runtimePreimagePool[${String(index)}]`;
    let accepted = poolDecodePreflightAccepted &&
      entrySizePreflight[index] === true && hasExactKeys(entry, [
      "sha256",
      "encoding",
      "compressor",
      "compressorVersion",
      "level",
      "memLevel",
      "strategy",
      "windowBits",
      "canonicalBytes",
      "encodedBytes",
      "data",
    ]);
    const sha256 = entry["sha256"];
    const declaredCanonicalBytes = entry["canonicalBytes"];
    const declaredEncodedBytes = entry["encodedBytes"];
    const data = entry["data"];
    accepted = accepted && isSha256(sha256) &&
      entry["encoding"] === V0_RUNTIME_PREIMAGE_ENCODING &&
      entry["compressor"] === V0_RUNTIME_PREIMAGE_COMPRESSOR &&
      entry["compressorVersion"] ===
        V0_RUNTIME_PREIMAGE_COMPRESSOR_VERSION &&
      entry["level"] === V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.level &&
      entry["memLevel"] ===
        V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.memLevel &&
      entry["strategy"] ===
        V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.strategy &&
      entry["windowBits"] ===
        V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.windowBits &&
      typeof declaredCanonicalBytes === "number" &&
      typeof declaredEncodedBytes === "number" && typeof data === "string" &&
      (previousSha256 === null ||
        (typeof sha256 === "string" && compare(previousSha256, sha256) < 0));
    if (isSha256(sha256)) previousSha256 = sha256;
    if (accepted && typeof data === "string" &&
      typeof declaredCanonicalBytes === "number" &&
      typeof declaredEncodedBytes === "number" && isSha256(sha256)) {
      accepted = declaredCanonicalBytes <= remainingCanonicalBytes &&
        declaredEncodedBytes <= remainingEncodedBytes;
      if (accepted) {
        remainingCanonicalBytes -= declaredCanonicalBytes;
        remainingEncodedBytes -= declaredEncodedBytes;
      }
      try {
        const encoded = accepted
          ? Buffer.from(data, "base64")
          : Buffer.alloc(0);
        accepted = encoded.toString("base64") === data &&
          encoded.byteLength === declaredEncodedBytes;
        const decoded = accepted
          ? inflateRawSync(encoded, {
            maxOutputLength: declaredCanonicalBytes,
          })
          : Buffer.alloc(0);
        const canonicalJson = decoded.toString("utf8");
        const parsed = JSON.parse(canonicalJson) as unknown;
        const deterministicEncoding = deflateRawSync(decoded, {
          level: V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.level,
          memLevel: V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.memLevel,
          strategy: zlibConstants.Z_DEFAULT_STRATEGY,
          windowBits: V0_RUNTIME_PREIMAGE_COMPRESSION_OPTIONS.windowBits,
        });
        accepted = accepted && decoded.byteLength === declaredCanonicalBytes &&
          Buffer.byteLength(canonicalJson, "utf8") === decoded.byteLength &&
          Buffer.from(canonicalJson, "utf8").equals(decoded) &&
          canonicalV0EvidenceJson(parsed) === canonicalJson &&
          v0EvidenceDigest(parsed) === sha256 &&
          deterministicEncoding.equals(encoded) &&
          !payloads.has(sha256) &&
          !canonicalPayloads.has(canonicalJson);
        if (accepted) {
          payloads.set(sha256, parsed);
          canonicalPayloads.add(canonicalJson);
          canonicalBytes += decoded.byteLength;
          encodedBytes += encoded.byteLength;
        }
      } catch {
        accepted = false;
      }
    }
    if (!accepted) {
      findings.push(finding(
        "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL",
        path,
        "Each runtime preimage pool entry must be uniquely content-addressed, strictly SHA-sorted, canonically compressed, byte-bounded JSON whose inflated payload recomputes its declared digest.",
      ));
    }
  }
  const rowReferences = [...caseRows, ...witnessRows].flatMap((row) => [
    row["runtimeRequestSha256"],
    row["runtimeResultSha256"],
  ]).filter(isSha256);
  const uniqueReferences = new Set(rowReferences);
  const poolAccepted = poolDecodePreflightAccepted && Array.isArray(rawPool) &&
    entries.length === rawPool.length &&
    entries.length === payloads.size &&
    entries.length === canonicalPayloads.size &&
    entries.length === uniqueReferences.size &&
    entries.length <= V0_RUNTIME_PREIMAGE_POOL_MAX_ENTRIES &&
    canonicalBytes <= V0_RUNTIME_PREIMAGE_POOL_MAX_CANONICAL_BYTES &&
    encodedBytes <= V0_RUNTIME_PREIMAGE_POOL_MAX_ENCODED_BYTES &&
    declaredEntryCount === entries.length &&
    declaredCanonicalTotal === canonicalBytes &&
    declaredEncodedTotal === encodedBytes &&
    remainingCanonicalBytes === 0 && remainingEncodedBytes === 0 &&
    rowReferences.length > 0 &&
    rowReferences.every((digest) => payloads.has(digest)) &&
    [...payloads.keys()].every((digest) => uniqueReferences.has(digest));
  if (!poolAccepted) {
    findings.push(finding(
      "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL",
      "observations.mutation.runtimePreimagePool",
      "The runtime preimage pool must be exactly closed over all case and witness request/result references, with no missing, duplicate, unreferenced, reordered, or over-budget entry and exact recomputed totals.",
    ));
  }
  const inspection = Object.freeze({
    inputDigest,
    payloads,
    entryCount: entries.length,
    canonicalBytes,
    encodedBytes,
    findings: sortFindings(findings),
  });
  if (inputDigest === null) {
    runtimePreimagePoolCache.delete(mutation);
  } else {
    const cacheEntry = Object.freeze({
      inputDigest,
      inspection,
    });
    runtimePreimagePoolCache.set(mutation, cacheEntry);
    if (inspection.findings.length === 0) {
      sharedValidRuntimePreimagePoolCache = cacheEntry;
    }
  }
  return inspection;
}

export const V0_FIXTURE_FILES = Object.freeze([
  "tests/fixtures/voicing/availability-matrix.json",
  "tests/fixtures/voicing/candidate-cases.json",
  "tests/fixtures/voicing/family-templates.json",
  "tests/fixtures/voicing/law-cases.json",
  "tests/fixtures/voicing/limit-cases.json",
  "tests/fixtures/voicing/mutation-controls.json",
  "tests/fixtures/voicing/operation-state-cases.json",
  "tests/fixtures/voicing/provenance-ledger.json",
  "tests/fixtures/voicing/trace-ledger.json",
  "tests/fixtures/voicing/transposition-seeds.json",
  "tests/fixtures/voicing/v0-voicing-contract.json",
] as const);

export const V0_FOCUSED_TEST_FILES = Object.freeze([
  "tests/conformance/v0-laws-mutation-controls.test.ts",
  "tests/conformance/v0-production-conformance.test.ts",
  "tests/integration/v0-availability-matrix.test.ts",
  "tests/integration/v0-constraint-diagnostics.test.ts",
  "tests/integration/v0-ledger-lifecycle.test.ts",
  "tests/integration/v0-operation-state.test.ts",
  "tests/integration/v0-voicing-candidates.test.ts",
  "tests/static/dependency-boundaries.test.ts",
  "tests/static/v0-contract.test.ts",
  "tests/static/v0-evidence.test.ts",
  "tests/static/v0-production-policy.test.ts",
  "tests/static/v0-type-contract.test.ts",
  "tests/unit/v0-voicing-primitives.test.ts",
] as const);

export const V0_EXPECTED_COUNTS = Object.freeze({
  companions: 10,
  realizationClasses: 16,
  adaptiveTemplates: 3,
  fixedTemplates: 19,
  quartalTemplates: 5,
  registerPolicies: 5,
  availabilitySeeds: 37,
  availabilityCells: 1_295,
  semanticApplicabilityPositions: 112,
  familyBassStates: 42,
  candidateCases: 38,
  generatedCandidateCases: 21,
  refusalCandidateCases: 15,
  storedBypassCases: 2,
  lawCases: 23,
  lawWitnesses: 44,
  operationStateCases: 32,
  limitCases: 63,
  transpositionSeeds: 18,
  transpositionRootCells: 216,
  mutationControls: 51,
  mutationDirectLinks: 104,
  mutationCorroborativeLinks: 2,
  mutationReviewedLinks: 106,
  mutationLinkedCases: 86,
  traces: 15,
  authorities: 8,
  checkedInCaseBindings: 1_513,
  productionObservationBindings: 1_667,
} as const);

export const V0_EXPANDED_PRODUCTION_CASE_IDS = Object.freeze([
  ...Array.from(
    { length: V0_EXPECTED_COUNTS.semanticApplicabilityPositions },
    (_, index) => `V0-SEMANTIC-${String(index + 1).padStart(3, "0")}`,
  ),
  ...Array.from(
    { length: V0_EXPECTED_COUNTS.familyBassStates },
    (_, index) => `V0-BASS-${String(index + 1).padStart(3, "0")}`,
  ),
]);

const V0_VALIDATOR_COUNTS = Object.freeze({
  companions: 10,
  realizationClasses: 16,
  adaptiveTemplates: 3,
  fixedTemplates: 19,
  quartalTemplates: 5,
  registerPolicies: 5,
  availabilitySeeds: 37,
  availabilityCells: 1_295,
  candidateCases: 38,
  lawCases: 23,
  lawWitnesses: 44,
  operationStateCases: 32,
  limitCases: 63,
  transpositionSeeds: 18,
  transpositionRootCells: 216,
  mutationControls: 51,
  traces: 15,
  authorities: 8,
} as const);

export const V0_APPLICABILITY = Object.freeze([
  {
    id: "voicing-runtime",
    applicability: "applicable",
    owner: "V0",
    reason: "The public deterministic voicing operation executes against the independent V0 authority.",
  },
  {
    id: "deterministic-replay",
    applicability: "applicable",
    owner: "V0/verify",
    reason: "Requests, observations, exact counters, fixtures, and reviewed semantic counterfactuals are hash-bound.",
  },
  {
    id: "performance-observation",
    applicability: "applicable",
    owner: "V0/verify",
    reason: "Host elapsed time and resource usage are recorded but never gate musical behavior.",
  },
  {
    id: "browser",
    applicability: "not-applicable",
    owner: "U0/U2/Q0",
    reason: "V0 is pure theory and renders no browser surface.",
  },
  {
    id: "audio",
    applicability: "not-applicable",
    owner: "P0/X0/X1",
    reason: "V0 returns immutable values and calls no audio or playback adapter.",
  },
  {
    id: "storage",
    applicability: "not-applicable",
    owner: "E0/R0",
    reason: "V0 has no persistence or export adapter.",
  },
  {
    id: "network-ai",
    applicability: "not-applicable",
    owner: "Foundation",
    reason: "V0 is synchronous, offline, local, and imports no network, content, or model capability.",
  },
  {
    id: "cancellation",
    applicability: "not-applicable",
    owner: "progression-level search/application runner",
    reason: "The bounded V0 call is synchronous and accepts no cancellation token.",
  },
  {
    id: "resume",
    applicability: "not-applicable",
    owner: "progression-level search/application runner",
    reason: "V0 has no continuation or resumable state.",
  },
  {
    id: "stale-revision",
    applicability: "not-applicable",
    owner: "application request/revision boundary",
    reason: "V0 reads no document revision and publishes no application command.",
  },
  {
    id: "cleanup",
    applicability: "not-applicable",
    owner: "browser/audio/application packages",
    reason: "Pure V0 operations acquire no timers, listeners, nodes, URLs, handles, or external resources.",
  },
  {
    id: "pairwise-context",
    applicability: "deferred",
    owner: "V1",
    reason: "Neighbors, voice IDs, locks, and transition costs belong to pairwise progression search.",
  },
] as const);

export const V0_INPUT_GROUPS = Object.freeze({
  contracts: [
    "AGENTS.md",
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/REBUILD_PLAN.md",
    "docs/V0_VOICING_CONTRACT.md",
    "tests/conformance/V0_COVERAGE.md",
    "tests/conformance/V0_DISCREPANCIES.md",
  ],
  artifact: ["jazz_chord_progression_editor.html"],
  configuration: [
    "bun.lock",
    "bunfig.toml",
    "package.json",
    "tsconfig*.json",
  ],
  tooling: [
    "scripts/foundation-io.ts",
    "scripts/run-node-tool.ts",
    "scripts/source-policy.ts",
    "scripts/toolchain-doctor.ts",
    "scripts/validate-v0-contract.ts",
    "scripts/verify-v0-evidence.ts",
    "scripts/verify.ts",
  ],
  fixtures: [
    "tests/fixtures/voicing/*.json",
    "tests/fixtures/resolution/formula-rules.json",
  ],
  production: ["src/**/*"],
  harness: [
    "tests/support/v0-conformance-harness.ts",
    "tests/support/v0-mutation-materializer.ts",
    "tests/support/v0-voicing-fixture.ts",
  ],
  tests: [...V0_FOCUSED_TEST_FILES],
} as const);

const FIXTURE_VALUES: readonly Readonly<{
  path: (typeof V0_FIXTURE_FILES)[number];
  value: unknown;
}>[] = [
  { path: V0_FIXTURE_FILES[0], value: availabilityFixture },
  { path: V0_FIXTURE_FILES[1], value: candidateFixture },
  { path: V0_FIXTURE_FILES[2], value: familyFixture },
  { path: V0_FIXTURE_FILES[3], value: lawFixture },
  { path: V0_FIXTURE_FILES[4], value: limitFixture },
  { path: V0_FIXTURE_FILES[5], value: mutationFixture },
  { path: V0_FIXTURE_FILES[6], value: operationFixture },
  { path: V0_FIXTURE_FILES[7], value: provenanceFixture },
  { path: V0_FIXTURE_FILES[8], value: traceFixture },
  { path: V0_FIXTURE_FILES[9], value: transpositionFixture },
  { path: V0_FIXTURE_FILES[10], value: contractFixture },
];

export const V0_DIRECT_MUTATION_LINK_INVENTORY_SHA256 =
  "ebba6597f779841137b538f4f43d7171d36b45b0decf155fc25338c9737c8e01" as const;
export const V0_CORROBORATIVE_MUTATION_LINK_INVENTORY_SHA256 =
  "17a66e4b0500a7337e4e84a52af33b35245ef4c2481cf78f4ddca363e9da1948" as const;
export const V0_REVIEWED_MUTATION_LINK_INVENTORY_SHA256 =
  "513e16e7a79552d2348c2b78a89a8183f886a85c0c9f71352ecfdcdce55e6866" as const;

export type V0CaseBinding = Readonly<{
  caseId: string;
  fixturePath: string;
  fixtureRecordSha256: string;
}>;

type V0ProductionObservationChannel =
  | "availability-cell"
  | "candidate"
  | "family-bass-state"
  | "law-case"
  | "law-witness"
  | "limit"
  | "operation"
  | "semantic-position"
  | "transposition";

type FixtureCaseGroup = Readonly<{
  fixturePath: string;
  rows: readonly JsonRecord[];
}>;

function fixtureCaseGroups(): readonly FixtureCaseGroup[] {
  const candidate = candidateFixture as unknown as JsonRecord;
  const laws = lawFixture as unknown as JsonRecord;
  const operations = operationFixture as unknown as JsonRecord;
  const limits = limitFixture as unknown as JsonRecord;
  const transpositions = transpositionFixture as unknown as JsonRecord;
  const availability = availabilityFixture as unknown as JsonRecord;
  return [
    {
      fixturePath: "tests/fixtures/voicing/candidate-cases.json",
      rows: records(candidate["cases"]),
    },
    {
      fixturePath: "tests/fixtures/voicing/law-cases.json",
      rows: [...records(laws["cases"]), ...records(laws["witnesses"])],
    },
    {
      fixturePath: "tests/fixtures/voicing/operation-state-cases.json",
      rows: [
        ...records(operations["successCases"]),
        ...records(operations["refusalCases"]),
        ...records(operations["precedenceCases"]),
        ...records(operations["notApplicableCases"]),
      ],
    },
    {
      fixturePath: "tests/fixtures/voicing/limit-cases.json",
      rows: [
        ...records(limits["counterBoundaryCases"]),
        ...records(limits["retentionCases"]),
        ...records(limits["identifierBoundaryCases"]),
        ...records(limits["midiBoundaryCases"]),
        ...records(limits["wallTimeCases"]),
      ],
    },
    {
      fixturePath: "tests/fixtures/voicing/transposition-seeds.json",
      rows: records(transpositions["seeds"]),
    },
    {
      fixturePath: "tests/fixtures/voicing/availability-matrix.json",
      rows: records(availability["cells"]),
    },
  ];
}

export function buildV0CaseBindings(): V0CaseBinding[] {
  const result = new Map<string, V0CaseBinding>();
  for (const group of fixtureCaseGroups()) {
    for (const row of group.rows) {
      const id = row["id"];
      if (typeof id !== "string" || !/^V0-/u.test(id)) {
        throw new Error(`${group.fixturePath} contains a case without a V0 ID`);
      }
      if (result.has(id)) throw new Error(`duplicate V0 case identity ${id}`);
      result.set(id, Object.freeze({
        caseId: id,
        fixturePath: group.fixturePath,
        fixtureRecordSha256: v0EvidenceDigest(row),
      }));
    }
  }
  return [...result.values()].sort((left, right) =>
    compare(left.caseId, right.caseId)
  );
}

function productionObservationChannel(
  caseId: string,
  fixturePath: string | null = null,
): V0ProductionObservationChannel | null {
  if (/^V0-SEMANTIC-[0-9]{3}$/u.test(caseId)) return "semantic-position";
  if (/^V0-BASS-[0-9]{3}$/u.test(caseId)) return "family-bass-state";
  switch (fixturePath) {
    case "tests/fixtures/voicing/availability-matrix.json":
      return "availability-cell";
    case "tests/fixtures/voicing/candidate-cases.json":
      return "candidate";
    case "tests/fixtures/voicing/law-cases.json":
      return /^V0-LAW-[0-9]{3}$/u.test(caseId)
        ? "law-case"
        : "law-witness";
    case "tests/fixtures/voicing/limit-cases.json":
      return "limit";
    case "tests/fixtures/voicing/operation-state-cases.json":
      return "operation";
    case "tests/fixtures/voicing/transposition-seeds.json":
      return "transposition";
    default:
      return null;
  }
}

type MutationLink = Readonly<{
  controlId: string;
  caseId: string;
}>;

type CorroborativeMutationLink = MutationLink & Readonly<{
  reasonCode: string;
  reason: string;
}>;

export type V0MutationLinkPartition = Readonly<{
  directLinks: readonly MutationLink[];
  corroborativeLinks: readonly CorroborativeMutationLink[];
  reviewedLinks: readonly MutationLink[];
  linkedCaseIds: readonly string[];
  directLinkInventorySha256: string;
  corroborativeLinkInventorySha256: string;
  reviewedLinkInventorySha256: string;
  findings: readonly V0EvidenceFinding[];
}>;

export function inspectV0MutationLinkPartition(): V0MutationLinkPartition {
  const fixture = mutationFixture as unknown as JsonRecord;
  const controls = records(fixture["controls"]);
  const directLinks: MutationLink[] = [];
  const corroborativeLinks: CorroborativeMutationLink[] = [];
  const reviewedLinks: MutationLink[] = [];
  const findings: V0EvidenceFinding[] = [];
  for (const [index, control] of controls.entries()) {
    const path = `mutation-controls.json.controls[${String(index)}]`;
    const controlId = control["id"];
    if (typeof controlId !== "string") {
      findings.push(finding(
        "V0_EVIDENCE_MUTATION_PARTITION",
        path,
        "Mutation control requires a string ID.",
      ));
      continue;
    }
    const directCaseIds = strings(control["killedByCaseIds"]);
    const corroboratedCaseIds = strings(control["corroboratedByCaseIds"]);
    const reasonRows = records(control["corroborativeLinks"]);
    const declaredReviewedOrder = strings(control["reviewedCaseLinkOrder"]);
    const reviewedOrder = corroboratedCaseIds.length === 0 &&
        control["reviewedCaseLinkOrder"] === undefined
      ? directCaseIds
      : declaredReviewedOrder;
    const reasons = reasonRows.flatMap((row) =>
      typeof row["caseId"] === "string" &&
        typeof row["reasonCode"] === "string" &&
        typeof row["reason"] === "string"
        ? [{
            controlId,
            caseId: row["caseId"],
            reasonCode: row["reasonCode"],
            reason: row["reason"],
          }]
        : []
    );
    const recombined = [...directCaseIds, ...corroboratedCaseIds];
    if (
      directCaseIds.length === 0 ||
      new Set(recombined).size !== recombined.length ||
      reviewedOrder.length !== recombined.length ||
      reviewedOrder.some((caseId) => !recombined.includes(caseId)) ||
      reasons.length !== corroboratedCaseIds.length ||
      !corroboratedCaseIds.every((caseId, reasonIndex) =>
        reasons[reasonIndex]?.caseId === caseId
      )
    ) {
      findings.push(finding(
        "V0_EVIDENCE_MUTATION_PARTITION",
        path,
        "Direct and corroborative links must form a disjoint, ordered, reasoned partition.",
      ));
    }
    directLinks.push(...directCaseIds.map((caseId) => ({ controlId, caseId })));
    corroborativeLinks.push(...reasons);
    reviewedLinks.push(...reviewedOrder.map((caseId) => ({ controlId, caseId })));
  }
  const directLinkInventorySha256 = v0EvidenceDigest(directLinks);
  const corroborativeLinkInventorySha256 = v0EvidenceDigest(corroborativeLinks);
  const reviewedLinkInventorySha256 = v0EvidenceDigest(reviewedLinks);
  const pairKeys = reviewedLinks.map(({ controlId, caseId }) =>
    `${controlId}\u0000${caseId}`
  );
  const linkedCaseIds = [...new Set(reviewedLinks.map(({ caseId }) => caseId))]
    .sort(compare);
  if (
    controls.length !== V0_EXPECTED_COUNTS.mutationControls ||
    directLinks.length !== V0_EXPECTED_COUNTS.mutationDirectLinks ||
    corroborativeLinks.length !==
      V0_EXPECTED_COUNTS.mutationCorroborativeLinks ||
    reviewedLinks.length !== V0_EXPECTED_COUNTS.mutationReviewedLinks ||
    new Set(pairKeys).size !== pairKeys.length ||
    linkedCaseIds.length !== V0_EXPECTED_COUNTS.mutationLinkedCases ||
    directLinkInventorySha256 !==
      V0_DIRECT_MUTATION_LINK_INVENTORY_SHA256 ||
    corroborativeLinkInventorySha256 !==
      V0_CORROBORATIVE_MUTATION_LINK_INVENTORY_SHA256 ||
    reviewedLinkInventorySha256 !==
      V0_REVIEWED_MUTATION_LINK_INVENTORY_SHA256
  ) {
    findings.push(finding(
      "V0_EVIDENCE_MUTATION_LINK_CONSERVATION",
      "tests/fixtures/voicing/mutation-controls.json.controls",
      "The reviewed 106-link inventory must conserve 104 direct kills and two reasoned corroborative links across 86 cases.",
    ));
  }
  return Object.freeze({
    directLinks,
    corroborativeLinks,
    reviewedLinks,
    linkedCaseIds,
    directLinkInventorySha256,
    corroborativeLinkInventorySha256,
    reviewedLinkInventorySha256,
    findings: sortFindings(findings),
  });
}

export type V0JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

function xmlUnescape(value: string): string {
  return value.replaceAll("&quot;", "\"").replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function xmlAttributes(source: string): Map<string, string> {
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

export function sanitizeV0JUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/gu,
    "$1",
  );
  if (/\bhostname\s*=/u.test(sanitized)) {
    throw new Error("V0_EVIDENCE_JUNIT_HOSTNAME");
  }
  return sanitized;
}

export function inspectV0JUnit(xml: string): Readonly<{
  summary: V0JUnitSummary | null;
  findings: readonly V0EvidenceFinding[];
}> {
  try {
    const rootMatch = /<testsuites\b([^>]*)>/u.exec(xml);
    if (rootMatch?.[1] === undefined || !xml.includes("</testsuites>")) {
      throw new Error("missing testsuites root");
    }
    const root = xmlAttributes(rootMatch[1]);
    const tests = countAttribute(root.get("tests"), "tests");
    const assertions = countAttribute(root.get("assertions"), "assertions");
    const failures = countAttribute(root.get("failures"), "failures");
    const errors = countAttribute(root.get("errors"), "errors", 0);
    const skipped = countAttribute(root.get("skipped"), "skipped");
    const cases: Array<{ file: string; name: string }> = [];
    const pattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu;
    let item: RegExpExecArray | null;
    let observedFailures = 0;
    let observedErrors = 0;
    let observedSkipped = 0;
    while ((item = pattern.exec(xml)) !== null) {
      const attributes = xmlAttributes(item[1] ?? "");
      const file = attributes.get("file");
      const name = attributes.get("name");
      if (
        file === undefined || file.length === 0 ||
        name === undefined || name.length === 0
      ) {
        throw new Error("testcase requires nonempty file and name attributes");
      }
      const body = item[2] ?? "";
      observedFailures += (body.match(/<failure\b/gu) ?? []).length;
      observedErrors += (body.match(/<error\b/gu) ?? []).length;
      observedSkipped += (body.match(/<skipped\b/gu) ?? []).length;
      cases.push({ file: file.replaceAll("\\", "/"), name });
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
      summary: Object.freeze({
        tests,
        assertions,
        failures,
        errors,
        skipped,
        files: [...new Set(cases.map(({ file }) => file))].sort(compare),
        cases: cases.sort((left, right) =>
          compare(`${left.file}\u0000${left.name}`, `${right.file}\u0000${right.name}`)
        ),
      }),
      findings: [],
    };
  } catch (error) {
    return {
      summary: null,
      findings: [finding(
        "V0_EVIDENCE_JUNIT_INVALID",
        "suite.junit",
        error instanceof Error ? error.message : "JUnit is invalid.",
      )],
    };
  }
}

export function inspectV0TestControls(
  filePath: string,
  source: string,
): V0EvidenceFinding[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: V0EvidenceFinding[] = [];
  const builders = new Set(["test", "it", "describe"]);
  const namespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "bun:test"
    ) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    else {
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (["test", "it", "describe"].includes(imported)) {
          builders.add(element.name.text);
        }
      }
    }
  }
  const isBuilder = (expression: ts.Expression): boolean => {
    if (ts.isIdentifier(expression)) return builders.has(expression.text);
    if (ts.isCallExpression(expression)) return isBuilder(expression.expression);
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isNonNullExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    ) return isBuilder(expression.expression);
    if (ts.isPropertyAccessExpression(expression)) {
      if (
        ts.isIdentifier(expression.expression) &&
        namespaces.has(expression.expression.text)
      ) return ["test", "it", "describe"].includes(expression.name.text);
      return isBuilder(expression.expression);
    }
    if (
      ts.isElementAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      namespaces.has(expression.expression.text) &&
      ts.isStringLiteral(expression.argumentExpression)
    ) {
      return ["test", "it", "describe"]
        .includes(expression.argumentExpression.text);
    }
    return false;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const collect = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        isBuilder(node.initializer) &&
        !builders.has(node.name.text)
      ) {
        builders.add(node.name.text);
        changed = true;
      }
      ts.forEachChild(node, collect);
    };
    collect(sourceFile);
  }
  const report = (node: ts.Node, code: string, message: string): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    findings.push(finding(
      code,
      `${filePath}:${String(position.line + 1)}:${String(position.character + 1)}`,
      message,
    ));
  };
  const forbidden = new Set([
    "skip", "todo", "only", "failing", "skipIf", "todoIf", "quarantine",
  ]);
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      forbidden.has(node.name.text) &&
      isBuilder(node.expression)
    ) {
      report(
        node,
        node.name.text.startsWith("todo")
          ? "V0_EVIDENCE_TODO"
          : node.name.text === "failing"
            ? "V0_EVIDENCE_EXPECTED_FAILURE"
            : "V0_EVIDENCE_QUARANTINE",
        `Forbidden ${node.name.text} test control.`,
      );
    }
    if (ts.isElementAccessExpression(node) && isBuilder(node.expression)) {
      if (
        ts.isStringLiteral(node.argumentExpression) &&
        forbidden.has(node.argumentExpression.text)
      ) {
        report(
          node,
          node.argumentExpression.text.startsWith("todo")
            ? "V0_EVIDENCE_TODO"
            : node.argumentExpression.text === "failing"
              ? "V0_EVIDENCE_EXPECTED_FAILURE"
              : "V0_EVIDENCE_QUARANTINE",
          `Forbidden ${node.argumentExpression.text} test control.`,
        );
      } else if (!ts.isStringLiteral(node.argumentExpression)) {
        report(
          node,
          "V0_EVIDENCE_QUARANTINE",
          "Dynamic test-builder member access is forbidden.",
        );
      }
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        /^(?:quarantine|quarantined|xit|xdescribe|xtest|xfail|expectedFailure)$/u
          .test(node.expression.text)
      ) {
        report(
          node,
          node.expression.text === "xfail" ||
              node.expression.text === "expectedFailure"
            ? "V0_EVIDENCE_EXPECTED_FAILURE"
            : "V0_EVIDENCE_QUARANTINE",
          `Forbidden ${node.expression.text} test control.`,
        );
      }
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          const name = property.name;
          const text = name !== undefined &&
              (ts.isIdentifier(name) || ts.isStringLiteral(name))
            ? name.text
            : null;
          if (text === "retry") {
            report(
              property,
              "V0_EVIDENCE_RETRY",
              "Per-test retry configuration is forbidden.",
            );
          }
          if (text === "expectedFailure") {
            report(
              property,
              "V0_EVIDENCE_EXPECTED_FAILURE",
              "Expected-failure controls are forbidden.",
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sortFindings(findings);
}

type V0Producer = Readonly<{ file: string; testcase: string }>;

type ObservationDescriptor = Readonly<{
  marker: string;
  schema: string;
  producer: V0Producer;
}>;

const OBSERVATION_DESCRIPTORS: readonly ObservationDescriptor[] = [
  {
    marker: V0_PRODUCTION_MARKER,
    schema: V0_PRODUCTION_SCHEMA,
    producer: V0_PRODUCTION_PRODUCER,
  },
  {
    marker: V0_MUTATION_MARKER,
    schema: V0_MUTATION_SCHEMA,
    producer: V0_MUTATION_PRODUCER,
  },
  {
    marker: V0_STATIC_MARKER,
    schema: V0_STATIC_SCHEMA,
    producer: V0_STATIC_PRODUCER,
  },
];

const V0_PRODUCTION_OBSERVATION_FIELDS = Object.freeze([
  "availabilityCellsObserved",
  "candidateCasesObserved",
  "caseObservationDigests",
  "caseObservationInventoryDigest",
  "caseObservationRecordInventoryDigest",
  "caseObservationRecords",
  "counterBoundaryObservationRecords",
  "exactPlusOneLimitsRefuseAtomically",
  "familyBassStatesObserved",
  "lawCasesObserved",
  "lawWitnessesObserved",
  "limitCasesObserved",
  "memoryCounterMaxima",
  "operationStateCasesObserved",
  "producer",
  "schema",
  "semanticApplicabilityPositionsObserved",
  "semanticDigest",
  "status",
  "storedBypassObservationRecords",
  "storedBypassZeroCounters",
  "suite",
  "terminationCounts",
  "terminationObservationRecords",
  "transpositionForwardCellsObserved",
  "transpositionInverseCellsObserved",
  "transpositionRootCellsObserved",
  "wallTimeGating",
  "wallTimeObservationRecord",
  "workCounterMaxima",
] as const);

const V0_MUTATION_OBSERVATION_FIELDS = Object.freeze([
  "caseObservationDigests",
  "caseObservations",
  "claim",
  "classification",
  "controlExecutionDigests",
  "controlIds",
  "controlsDefined",
  "corroborativeLinkInventorySha256",
  "corroborativeLinksObserved",
  "corroborativeLinksReviewed",
  "corroborativeObservations",
  "counterfactualExecutions",
  "deterministicReplayRuns",
  "directKillerLinksExecuted",
  "directKillerLinksKilled",
  "directKillerLinksReviewed",
  "directKillerLinksSurvived",
  "directLinkInventorySha256",
  "directLinksExecuted",
  "directLinksKilled",
  "directLinksReviewed",
  "directLinksSurvived",
  "faultFamiliesObserved",
  "fixtureSchema",
  "fixtureVersion",
  "lawFixtureSchema",
  "lawFixtureVersion",
  "lawWitnessObservationDigests",
  "lawWitnessObservations",
  "lawWitnessesObserved",
  "linkedCaseIds",
  "linkedCasesObserved",
  "linkedCasesUnaccounted",
  "oracleId",
  "producer",
  "requiredFaultFamilies",
  "reviewedCaseLinks",
  "reviewedLinkInventorySha256",
  "reviewedLinks",
  "runtimePreimagePool",
  "runtimePreimagePoolCanonicalBytes",
  "runtimePreimagePoolEncodedBytes",
  "runtimePreimagePoolEntries",
  "schema",
  "seed",
  "semanticDigest",
  "semanticOperatorsExecuted",
  "semanticOperatorsKilled",
  "semanticOperatorsSurvived",
  "sourceMutantsExecuted",
  "sourceMutantsKilled",
  "status",
  "suite",
  "totalReviewedLinks",
] as const);

const V0_STATIC_OBSERVATION_FIELDS = Object.freeze([
  "allowedRuntimeImportPrefixes",
  "ambientReplayDeeplyEqual",
  "applicability",
  "asyncOrGeneratorFunctions",
  "fixtureOrTestSupportImports",
  "forbiddenImports",
  "forbiddenRequestFields",
  "forbiddenRuntimeReferences",
  "inspectedRuntimeImports",
  "moduleMutableBindings",
  "operationSynchronous",
  "producer",
  "projectSourcePolicy",
  "schema",
  "semanticDigest",
  "sourceFiles",
  "status",
  "suite",
] as const);

function exactObservationFields(
  value: JsonRecord,
  expected: readonly string[],
  path: string,
): V0EvidenceFinding[] {
  return stableV0EvidenceJson(Object.keys(value).sort(compare)) ===
      stableV0EvidenceJson([...expected].sort(compare))
    ? []
    : [finding(
        "V0_EVIDENCE_OBSERVATION_SHAPE",
        path,
        "Observation must use the exact reviewed schema; unknown, missing, and extension fields are forbidden.",
      )];
}

function observationBySchema(
  values: readonly JsonRecord[],
  schema: string,
): JsonRecord | undefined {
  return values.find((value) => value["schema"] === schema);
}

function observationStatusIsPass(value: JsonRecord): boolean {
  return value["status"] === "pass" || value["outcome"] === "pass";
}

function exactProducer(value: unknown, expected: V0Producer): boolean {
  return isRecord(value) &&
    Object.keys(value).length === 2 &&
    value["file"] === expected.file &&
    value["testcase"] === expected.testcase;
}

function digestMap(value: unknown): ReadonlyMap<string, string> {
  if (!isRecord(value)) return new Map();
  return new Map(Object.entries(value).flatMap(([id, digest]) =>
    isSha256(digest) ? [[id, digest] as const] : []
  ));
}

function observationCaseDigests(
  values: readonly JsonRecord[],
): ReadonlyMap<string, Readonly<{ digest: string; producer: V0Producer }>> {
  const result = new Map<
    string,
    Readonly<{ digest: string; producer: V0Producer }>
  >();
  const orderedValues = [...values].sort((left, right) => {
    const leftIndex = OBSERVATION_DESCRIPTORS.findIndex(({ schema }) =>
      schema === left["schema"]
    );
    const rightIndex = OBSERVATION_DESCRIPTORS.findIndex(({ schema }) =>
      schema === right["schema"]
    );
    return leftIndex - rightIndex;
  });
  for (const value of orderedValues) {
    if (!isRecord(value["producer"])) continue;
    const file = value["producer"]["file"];
    const testcase = value["producer"]["testcase"];
    if (typeof file !== "string" || typeof testcase !== "string") continue;
    const producer = { file, testcase };
    const maps = [
      value["caseObservationDigests"],
      value["caseHashes"],
      value["observationDigests"],
    ];
    for (const candidate of maps) {
      for (const [id, digest] of digestMap(candidate)) {
        const previous = result.get(id);
        if (previous === undefined) result.set(id, { digest, producer });
      }
    }
    for (const row of records(value["caseObservationRecords"])) {
      const id = row["caseId"];
      const digest = row["observationDigest"];
      if (typeof id !== "string" || !isSha256(digest)) continue;
      const previous = result.get(id);
      if (previous === undefined) result.set(id, { digest, producer });
    }
  }
  return result;
}

function numericField(
  value: JsonRecord,
  field: string,
): unknown {
  if (value[field] !== undefined) return value[field];
  return isRecord(value["counts"]) ? value["counts"][field] : undefined;
}

type InspectedProductionCaseRecords = Readonly<{
  rows: readonly JsonRecord[];
  byId: ReadonlyMap<string, JsonRecord>;
  findings: readonly V0EvidenceFinding[];
}>;

function inspectProductionLawRecords(
  byId: ReadonlyMap<string, JsonRecord>,
): V0EvidenceFinding[] {
  const findings: V0EvidenceFinding[] = [];
  const laws = records((lawFixture as unknown as JsonRecord)["cases"]);
  const bindingFields = [
    ["positiveBindings", "positiveCaseIds"],
    ["negativeBindings", "negativeCaseIds"],
    ["transpositionBindings", "transpositionSeedIds"],
  ] as const;
  for (const law of laws) {
    const caseId = law["id"];
    if (typeof caseId !== "string") continue;
    const observation = byId.get(caseId);
    const projection = observation !== undefined &&
        isRecord(observation["actualProjection"])
      ? observation["actualProjection"]
      : null;
    let valid = projection !== null &&
      stableV0EvidenceJson(Object.keys(projection).sort(compare)) ===
        stableV0EvidenceJson([
          "authorityIds",
          "caseId",
          "checks",
          "lawId",
          "mutationControlIds",
          "negativeBindings",
          "positiveBindings",
          "predicate",
          "traceIds",
          "transpositionBindings",
        ]) &&
      projection["caseId"] === caseId &&
      projection["lawId"] === law["lawId"] &&
      projection["predicate"] === law["predicate"] &&
      stableV0EvidenceJson(projection["traceIds"]) ===
        stableV0EvidenceJson(law["traceIds"]) &&
      stableV0EvidenceJson(projection["authorityIds"]) ===
        stableV0EvidenceJson(law["authorityIds"]) &&
      stableV0EvidenceJson(projection["mutationControlIds"]) ===
        stableV0EvidenceJson(law["mutationControlIds"]);
    const checkIds = strings(law["checkIds"]);
    const checks = projection === null ? [] : records(projection["checks"]);
    valid = valid && checks.length === checkIds.length &&
      checks.every((check, index) =>
        stableV0EvidenceJson(Object.keys(check).sort(compare)) ===
          stableV0EvidenceJson(["accepted", "id"]) &&
        check["id"] === checkIds[index] && check["accepted"] === true
      );
    for (const [projectionField, fixtureField] of bindingFields) {
      const expectedIds = strings(law[fixtureField]);
      const bindings = projection === null
        ? []
        : records(projection[projectionField]);
      valid = valid && bindings.length === expectedIds.length &&
        bindings.every((binding, index) => {
          const childCaseId = expectedIds[index];
          const child = childCaseId === undefined
            ? undefined
            : byId.get(childCaseId);
          return childCaseId !== undefined && child !== undefined &&
            stableV0EvidenceJson(Object.keys(binding).sort(compare)) ===
              stableV0EvidenceJson(["caseId", "channel", "projection"]) &&
            binding["caseId"] === childCaseId &&
            binding["channel"] === child["channel"] &&
            stableV0EvidenceJson(binding["projection"]) ===
              stableV0EvidenceJson(child["actualProjection"]);
        });
    }
    if (!valid) {
      findings.push(finding(
        "V0_EVIDENCE_PRODUCTION_LAW_RECORD",
        `observations.production.caseObservationRecords#${caseId}`,
        "Each law observation must preserve its exact check inventory and bind every positive, negative, and transposition child to that child's executed projection and channel.",
      ));
    }
  }
  return findings;
}

function inspectProductionCaseRecords(
  value: JsonRecord,
  bindings = buildV0CaseBindings(),
): InspectedProductionCaseRecords {
  const findings: V0EvidenceFinding[] = [];
  const raw = value["caseObservationRecords"];
  const rows = Array.isArray(raw) ? raw.filter(isRecord) : [];
  const expectedChannels = new Map<string, V0ProductionObservationChannel>();
  for (const binding of bindings) {
    const channel = productionObservationChannel(
      binding.caseId,
      binding.fixturePath,
    );
    if (channel !== null) expectedChannels.set(binding.caseId, channel);
  }
  for (const caseId of V0_EXPANDED_PRODUCTION_CASE_IDS) {
    const channel = productionObservationChannel(caseId);
    if (channel !== null) expectedChannels.set(caseId, channel);
  }
  const expectedIds = [...expectedChannels.keys()].sort(compare);
  const ids = rows.flatMap((row) =>
    typeof row["caseId"] === "string" ? [row["caseId"]] : []
  );
  const byId = new Map(rows.flatMap((row): Array<[string, JsonRecord]> =>
    typeof row["caseId"] === "string" ? [[row["caseId"], row]] : []
  ));
  const rawDigests = value["caseObservationDigests"];
  const digestEntries = isRecord(rawDigests) ? Object.entries(rawDigests) : [];
  const digestById = digestMap(rawDigests);
  const valid = Array.isArray(raw) && rows.length === raw.length &&
    rows.length === V0_EXPECTED_COUNTS.productionObservationBindings &&
    byId.size === rows.length &&
    stableV0EvidenceJson(ids) === stableV0EvidenceJson(expectedIds) &&
    rows.every((row) => {
      const caseId = row["caseId"];
      return typeof caseId === "string" &&
        stableV0EvidenceJson(Object.keys(row).sort(compare)) ===
          stableV0EvidenceJson(["actualProjection", "caseId", "channel"]) &&
        isRecord(row["actualProjection"]) &&
        row["channel"] === expectedChannels.get(caseId) &&
        digestById.get(caseId) === v0EvidenceDigest({
          caseId,
          actual: row["actualProjection"],
        });
    }) &&
    value["caseObservationRecordInventoryDigest"] === v0EvidenceDigest(rows) &&
    value["caseObservationInventoryDigest"] === v0EvidenceDigest(
      [...digestEntries].sort(([left], [right]) => compare(left, right)),
    );
  if (!valid) {
    findings.push(finding(
      "V0_EVIDENCE_PRODUCTION_RECORDS",
      "observations.production.caseObservationRecords",
      "Production evidence must carry the exact sorted 1,667-case compact projection preimage inventory, with each map digest recomputed from its matching case record.",
    ));
  }
  if (valid) findings.push(...inspectProductionLawRecords(byId));
  return Object.freeze({ rows, byId, findings: sortFindings(findings) });
}

function validateProductionObservation(
  value: JsonRecord,
): V0EvidenceFinding[] {
  const findings: V0EvidenceFinding[] = exactObservationFields(
    value,
    V0_PRODUCTION_OBSERVATION_FIELDS,
    "observations.production",
  );
  const expectedFields = {
    availabilityCellsObserved: V0_EXPECTED_COUNTS.availabilityCells,
    semanticApplicabilityPositionsObserved:
      V0_EXPECTED_COUNTS.semanticApplicabilityPositions,
    familyBassStatesObserved: V0_EXPECTED_COUNTS.familyBassStates,
    candidateCasesObserved: V0_EXPECTED_COUNTS.candidateCases,
    lawCasesObserved: V0_EXPECTED_COUNTS.lawCases,
    lawWitnessesObserved: V0_EXPECTED_COUNTS.lawWitnesses,
    operationStateCasesObserved: V0_EXPECTED_COUNTS.operationStateCases,
    limitCasesObserved: V0_EXPECTED_COUNTS.limitCases,
    transpositionRootCellsObserved: V0_EXPECTED_COUNTS.transpositionRootCells,
  } as const;
  if (
    value["suite"] !== "v0-production-conformance" ||
    value["transpositionForwardCellsObserved"] !==
      V0_EXPECTED_COUNTS.transpositionRootCells ||
    value["transpositionInverseCellsObserved"] !==
      V0_EXPECTED_COUNTS.transpositionRootCells
  ) {
    findings.push(finding(
      "V0_EVIDENCE_PRODUCTION_INVENTORY",
      "observations.production.suite",
      "Production observation must bind the exact suite and complete forward/inverse transposition-cell counts.",
    ));
  }
  for (const [field, expected] of Object.entries(expectedFields)) {
    if (numericField(value, field) !== expected) {
      findings.push(finding(
        "V0_EVIDENCE_PRODUCTION_INVENTORY",
        `observations.production.${field}`,
        `${field} must equal ${String(expected)}.`,
      ));
    }
  }
  const rawHashes = value["caseObservationDigests"];
  const rawHashEntries = isRecord(rawHashes) ? Object.entries(rawHashes) : [];
  const hashes = digestMap(rawHashes);
  const bindings = buildV0CaseBindings();
  const expectedIds = [
    ...bindings.map(({ caseId }) => caseId),
    ...V0_EXPANDED_PRODUCTION_CASE_IDS,
  ].sort(compare);
  const observedIds = [...hashes.keys()].sort(compare);
  if (
    !isRecord(rawHashes) ||
    rawHashEntries.length !== V0_EXPECTED_COUNTS.productionObservationBindings ||
    rawHashEntries.some(([, digest]) => !isSha256(digest)) ||
    hashes.size !== V0_EXPECTED_COUNTS.productionObservationBindings ||
    stableV0EvidenceJson(observedIds) !== stableV0EvidenceJson(expectedIds)
  ) {
    findings.push(finding(
      "V0_EVIDENCE_PRODUCTION_CASES",
      "observations.production.caseObservationDigests",
      `Production evidence must bind all ${String(bindings.length)} checked-in cases plus all 154 expanded semantic positions with valid V0 IDs and SHA-256 observations.`,
    ));
  }
  findings.push(...inspectProductionCaseRecords(value, bindings).findings);
  const declaredInventoryDigest = value["caseObservationInventoryDigest"];
  if (
    declaredInventoryDigest !== v0EvidenceDigest(
      [...rawHashEntries].sort(([left], [right]) => compare(left, right)),
    )
  ) {
    findings.push(finding(
      "V0_EVIDENCE_PRODUCTION_CASES",
      "observations.production.caseObservationInventoryDigest",
      "Production observation inventory digest does not match its case map.",
    ));
  }
  if (semanticResourceEvidence([value])["outcome"] !== "pass") {
    findings.push(finding(
      "V0_EVIDENCE_PRODUCTION_RESOURCES",
      "observations.production.resourceObservationRecords",
      "Production resource summaries must recompute from the exact digest-bound termination, counter-boundary, stored-bypass, and wall-time records.",
    ));
  }
  return findings;
}

function mutationSummaryField(
  value: JsonRecord,
  names: readonly string[],
): unknown {
  for (const name of names) {
    const candidate = numericField(value, name);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

type V0NegativeWitnessExecutionMode =
  | "detector-only"
  | "mixed-production-and-detector"
  | "production-executed";

type V0NegativeWitnessExecutionPolicy = Readonly<{
  mode: V0NegativeWitnessExecutionMode;
  production: boolean;
  detectors: boolean;
  runtimeRequestSha256: string;
  runtimeResultSha256: string;
  productionSpec: readonly Readonly<{
    operation: string;
    executor: string;
  }>[];
  detectorSpec: readonly Readonly<{ detector: string }>[];
}>;

const V0_NEGATIVE_WITNESS_EXECUTORS = Object.freeze([
  "realizeVoicing",
  "realizeVoicingWithAmbient",
  "candidateIdentityKey",
  "lowRegisterSpacingViolations",
  "executeV0OperationCase",
] as const);

function hasExactKeys(
  value: JsonRecord,
  expected: readonly string[],
): boolean {
  return stableV0EvidenceJson(Object.keys(value).sort(compare)) ===
    stableV0EvidenceJson([...expected].sort(compare));
}

function negativeWitnessExecutionPolicy(
  caseId: string,
): V0NegativeWitnessExecutionPolicy | null {
  const root = lawFixture as unknown as JsonRecord;
  const proofPolicy = root["lawProofPolicy"];
  if (!isRecord(proofPolicy)) return null;
  const policy = proofPolicy["negativeWitnessExecutionPolicy"];
  if (!isRecord(policy)) return null;
  const matches = [
    {
      ids: strings(policy["detectorOnlyWitnessIds"]),
      mode: "detector-only" as const,
      production: false,
      detectors: true,
    },
    {
      ids: strings(policy["mixedWitnessIds"]),
      mode: "mixed-production-and-detector" as const,
      production: true,
      detectors: true,
    },
    {
      ids: strings(policy["productionExecutedWitnessIds"]),
      mode: "production-executed" as const,
      production: true,
      detectors: false,
    },
  ].filter(({ ids }) => ids.includes(caseId));
  const specMatches = records(policy["executionSpecs"]).filter((spec) =>
    spec["witnessId"] === caseId
  );
  if (matches.length !== 1 || specMatches.length !== 1) return null;
  const match = matches[0];
  const spec = specMatches[0];
  if (match === undefined || spec === undefined ||
    !hasExactKeys(spec, [
      "witnessId",
      "runtimeRequestSha256",
      "runtimeResultSha256",
      "production",
      "detectors",
    ]) ||
    !isSha256(spec["runtimeRequestSha256"]) ||
    !isSha256(spec["runtimeResultSha256"]) ||
    !Array.isArray(spec["production"]) ||
    !Array.isArray(spec["detectors"])) return null;
  const productionSpec = records(spec["production"]);
  const detectorSpec = records(spec["detectors"]);
  if (productionSpec.length !== spec["production"].length ||
    detectorSpec.length !== spec["detectors"].length ||
    productionSpec.some((row) =>
      !hasExactKeys(row, ["operation", "executor"]) ||
      typeof row["operation"] !== "string" || row["operation"].length === 0 ||
      typeof row["executor"] !== "string" ||
      !V0_NEGATIVE_WITNESS_EXECUTORS.some((executor) =>
        executor === row["executor"]
      )
    ) ||
    detectorSpec.some((row) =>
      !hasExactKeys(row, ["detector"]) ||
      typeof row["detector"] !== "string" || row["detector"].length === 0
    )) return null;
  return (productionSpec.length > 0) !== match.production ||
      (detectorSpec.length > 0) !== match.detectors
    ? null
    : Object.freeze({
      mode: match.mode,
      production: match.production,
      detectors: match.detectors,
      runtimeRequestSha256: spec["runtimeRequestSha256"],
      runtimeResultSha256: spec["runtimeResultSha256"],
      productionSpec: Object.freeze(productionSpec.map((row) =>
        Object.freeze({
          operation: row["operation"] as string,
          executor: row["executor"] as string,
        })
      )),
      detectorSpec: Object.freeze(detectorSpec.map((row) =>
        Object.freeze({ detector: row["detector"] as string })
      )),
    });
}

function strictJsonValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) {
    return Array.isArray(right) && left.length === right.length &&
      left.every((item, index) =>
        strictJsonValuesEqual(item, right[index])
      );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
    Object.hasOwn(right, key) && strictJsonValuesEqual(left[key], right[key])
  );
}

function canonicalPayloadContains(container: unknown, payload: unknown): boolean {
  const strictJsonComparison = isStrictJsonCacheValue(container) &&
    isStrictJsonCacheValue(payload);
  if (strictJsonComparison) {
    const contains = (candidate: unknown): boolean => {
      if (strictJsonValuesEqual(candidate, payload)) return true;
      if (Array.isArray(candidate)) return candidate.some(contains);
      return isRecord(candidate) && Object.values(candidate).some(contains);
    };
    return contains(container);
  }

  const payloadJson = canonicalV0EvidenceJson(payload);
  const contains = (candidate: unknown): boolean => {
    if (canonicalV0EvidenceJson(candidate) === payloadJson) return true;
    if (Array.isArray(candidate)) return candidate.some(contains);
    return isRecord(candidate) && Object.values(candidate).some(contains);
  };
  return contains(container);
}

function pairedNegativeWitnessRuntimeAccepted(
  caseId: string,
  runtimeRequest: unknown,
  runtimeResult: unknown,
  expectedPolicy: V0NegativeWitnessExecutionPolicy,
): boolean {
  if (!isRecord(runtimeRequest) || !isRecord(runtimeResult) ||
    !hasExactKeys(runtimeRequest, ["branchInput", "execution"]) ||
    !hasExactKeys(runtimeResult, ["branchOutput", "execution"]) ||
    runtimeRequest["branchInput"] === null ||
    runtimeRequest["branchInput"] === undefined ||
    runtimeResult["branchOutput"] === null ||
    runtimeResult["branchOutput"] === undefined) {
    return false;
  }
  const requestExecution = runtimeRequest["execution"];
  const resultExecution = runtimeResult["execution"];
  if (!isRecord(requestExecution) || !isRecord(resultExecution) ||
    !hasExactKeys(requestExecution, ["production", "detectors"]) ||
    !hasExactKeys(resultExecution, ["production", "detectors"]) ||
    !Array.isArray(requestExecution["production"]) ||
    !Array.isArray(resultExecution["production"]) ||
    !Array.isArray(requestExecution["detectors"]) ||
    !Array.isArray(resultExecution["detectors"])) {
    return false;
  }
  const productionInputs = records(requestExecution["production"]);
  const productionResults = records(resultExecution["production"]);
  const detectorInputs = records(requestExecution["detectors"]);
  const detectorResults = records(resultExecution["detectors"]);
  if (
    productionInputs.length !== requestExecution["production"].length ||
    productionResults.length !== resultExecution["production"].length ||
    detectorInputs.length !== requestExecution["detectors"].length ||
    detectorResults.length !== resultExecution["detectors"].length ||
    productionInputs.length !== productionResults.length ||
    detectorInputs.length !== detectorResults.length ||
    productionInputs.length !== expectedPolicy.productionSpec.length ||
    detectorInputs.length !== expectedPolicy.detectorSpec.length ||
    (expectedPolicy.production
      ? productionInputs.length === 0
      : productionInputs.length !== 0) ||
    (expectedPolicy.detectors
      ? detectorInputs.length === 0
      : detectorInputs.length !== 0)
  ) return false;
  const productionAccepted = productionInputs.every((input, index) => {
    const result = productionResults[index];
    const expected = expectedPolicy.productionSpec[index];
    return result !== undefined && expected !== undefined &&
      hasExactKeys(input, ["kind", "operation", "executor", "input"]) &&
      hasExactKeys(result, ["kind", "operation", "executor", "result"]) &&
      input["kind"] === `${caseId}/production` &&
      result["kind"] === input["kind"] &&
      input["operation"] === expected.operation &&
      result["operation"] === expected.operation &&
      input["executor"] === expected.executor &&
      result["executor"] === expected.executor &&
      Object.hasOwn(input, "input") && Object.hasOwn(result, "result") &&
      canonicalPayloadContains(runtimeRequest["branchInput"], input["input"]) &&
      canonicalPayloadContains(runtimeResult["branchOutput"], result["result"]);
  });
  const detectorsAccepted = detectorInputs.every((input, index) => {
    const result = detectorResults[index];
    const expected = expectedPolicy.detectorSpec[index];
    return result !== undefined && expected !== undefined &&
      hasExactKeys(input, ["kind", "detector", "mutantInput"]) &&
      hasExactKeys(result, ["kind", "detector", "detectorOutput"]) &&
      input["kind"] === `${caseId}/detector` &&
      result["kind"] === input["kind"] &&
      input["detector"] === expected.detector &&
      result["detector"] === expected.detector &&
      Object.hasOwn(input, "mutantInput") &&
      Object.hasOwn(result, "detectorOutput") &&
      input["mutantInput"] !== null && input["mutantInput"] !== undefined &&
      result["detectorOutput"] !== null &&
      result["detectorOutput"] !== undefined;
  });
  return productionAccepted && detectorsAccepted;
}

function mutationRuntimePreimagesAccepted(
  value: JsonRecord,
  binding: V0CaseBinding,
  runtimePreimages: ReadonlyMap<string, unknown>,
): boolean {
  const requestDigest = value["runtimeRequestSha256"];
  const resultDigest = value["runtimeResultSha256"];
  if (!isSha256(requestDigest) || !isSha256(resultDigest) ||
    !runtimePreimages.has(requestDigest) || !runtimePreimages.has(resultDigest)) {
    return false;
  }
  const runtimeRequest = runtimePreimages.get(requestDigest);
  const runtimeResult = runtimePreimages.get(resultDigest);
  const expectedPolicy = negativeWitnessExecutionPolicy(binding.caseId);
  const actualProjection = value["actualProjection"];
  const expectedProjection = value["expectedProjection"];
  const executionFields = [
    "mutationExecutionMode",
    "productionMutantExecuted",
    "detectorOnlyMutantEvaluated",
  ] as const;
  if (expectedPolicy === null) {
    return (!isRecord(actualProjection) ||
      executionFields.every((field) => !Object.hasOwn(actualProjection, field))) &&
      (!isRecord(expectedProjection) ||
        executionFields.every((field) => !Object.hasOwn(expectedProjection, field)));
  }
  return isRecord(actualProjection) && isRecord(expectedProjection) &&
    requestDigest === expectedPolicy.runtimeRequestSha256 &&
    resultDigest === expectedPolicy.runtimeResultSha256 &&
    actualProjection["mutationExecutionMode"] === expectedPolicy.mode &&
    expectedProjection["mutationExecutionMode"] === expectedPolicy.mode &&
    actualProjection["productionMutantExecuted"] ===
      expectedPolicy.production &&
    expectedProjection["productionMutantExecuted"] ===
      expectedPolicy.production &&
    actualProjection["detectorOnlyMutantEvaluated"] === expectedPolicy.detectors &&
    expectedProjection["detectorOnlyMutantEvaluated"] === expectedPolicy.detectors &&
    pairedNegativeWitnessRuntimeAccepted(
      binding.caseId,
      runtimeRequest,
      runtimeResult,
      expectedPolicy,
    );
}

function mutationCaseObservationAccepted(
  value: JsonRecord,
  binding: V0CaseBinding,
  runtimePreimages: ReadonlyMap<string, unknown>,
): boolean {
  const channel = productionObservationChannel(
    binding.caseId,
    binding.fixturePath,
  );
  return channel !== null &&
    stableV0EvidenceJson(Object.keys(value).sort(compare)) ===
      stableV0EvidenceJson([
        "actualProjection",
        "baselineAccepted",
        "caseId",
        "channel",
        "expectedProjection",
        "fixturePath",
        "fixtureRecordSha256",
        "observationDigest",
        "runtimeRequestSha256",
        "runtimeResultSha256",
      ]) &&
    value["caseId"] === binding.caseId &&
    value["fixturePath"] === binding.fixturePath &&
    value["fixtureRecordSha256"] === binding.fixtureRecordSha256 &&
    value["channel"] === channel &&
    value["baselineAccepted"] === true &&
    (isRecord(value["actualProjection"]) ||
      Array.isArray(value["actualProjection"])) &&
    (isRecord(value["expectedProjection"]) ||
      Array.isArray(value["expectedProjection"])) &&
    stableV0EvidenceJson(value["actualProjection"]) ===
      stableV0EvidenceJson(value["expectedProjection"]) &&
    isSha256(value["runtimeRequestSha256"]) &&
    isSha256(value["runtimeResultSha256"]) &&
    mutationRuntimePreimagesAccepted(value, binding, runtimePreimages) &&
    isSha256(value["observationDigest"]) &&
    value["observationDigest"] ===
      v0DigestWithoutKey(value, "observationDigest");
}

function boundMutationCaseProjection(
  observation: JsonRecord,
  binding: V0CaseBinding,
  field: "actualProjection" | "expectedProjection",
): JsonRecord {
  return {
    caseId: binding.caseId,
    fixtureRecordSha256: binding.fixtureRecordSha256,
    channel: observation["channel"],
    result: observation[field],
  };
}

function validateMutationObservationHeader(
  value: JsonRecord,
): V0EvidenceFinding[] {
  const findings: V0EvidenceFinding[] = exactObservationFields(
    value,
    V0_MUTATION_OBSERVATION_FIELDS,
    "observations.mutation",
  );
  const runtimePool = inspectRuntimePreimagePool(value);
  findings.push(...runtimePool.findings);
  const expectations: readonly Readonly<{
    names: readonly string[];
    expected: number;
    label: string;
  }>[] = [
    {
      names: ["controlsDefined", "reviewedControls"],
      expected: V0_EXPECTED_COUNTS.mutationControls,
      label: "reviewed controls",
    },
    {
      names: ["semanticOperatorsExecuted", "semanticCounterfactualsExecuted"],
      expected: V0_EXPECTED_COUNTS.mutationControls,
      label: "semantic operators executed",
    },
    {
      names: ["semanticOperatorsKilled", "semanticCounterfactualsKilled"],
      expected: V0_EXPECTED_COUNTS.mutationControls,
      label: "semantic operators killed",
    },
    {
      names: ["directKillerLinksReviewed", "reviewedDirectKillerLinks"],
      expected: V0_EXPECTED_COUNTS.mutationDirectLinks,
      label: "direct links reviewed",
    },
    {
      names: ["directKillerLinksExecuted", "killerLinksExecuted"],
      expected: V0_EXPECTED_COUNTS.mutationDirectLinks,
      label: "direct links executed",
    },
    {
      names: ["directKillerLinksKilled", "killerLinksKilled"],
      expected: V0_EXPECTED_COUNTS.mutationDirectLinks,
      label: "direct links killed",
    },
    {
      names: ["corroborativeLinksObserved"],
      expected: V0_EXPECTED_COUNTS.mutationCorroborativeLinks,
      label: "corroborative links observed",
    },
    {
      names: ["reviewedCaseLinks", "totalReviewedLinks"],
      expected: V0_EXPECTED_COUNTS.mutationReviewedLinks,
      label: "reviewed links",
    },
    {
      names: ["linkedCasesObserved"],
      expected: V0_EXPECTED_COUNTS.mutationLinkedCases,
      label: "linked cases",
    },
    {
      names: ["sourceMutantsExecuted"],
      expected: 0,
      label: "source mutants executed",
    },
    {
      names: ["sourceMutantsKilled"],
      expected: 0,
      label: "source mutants killed",
    },
  ];
  for (const expectation of expectations) {
    if (mutationSummaryField(value, expectation.names) !== expectation.expected) {
      findings.push(finding(
        "V0_EVIDENCE_MUTATION_INVENTORY",
        `observations.mutation.${expectation.names[0] ?? "unknown"}`,
        `${expectation.label} must equal ${String(expectation.expected)}.`,
      ));
    }
  }
  const mutationRoot = mutationFixture as unknown as JsonRecord;
  const lawRoot = lawFixture as unknown as JsonRecord;
  const partition = inspectV0MutationLinkPartition();
  const mutationControls = records(mutationRoot["controls"]);
  const expectedFaultFamilies = strings(mutationRoot["requiredFaultFamilies"]);
  const observedFaultFamilies = [...new Set(mutationControls.flatMap((control) =>
    typeof control["faultFamily"] === "string" ? [control["faultFamily"]] : []
  ))].sort(compare);
  const witnessIds = records(lawRoot["witnesses"]).flatMap((witness) =>
    typeof witness["id"] === "string" ? [witness["id"]] : []
  );
  const rawWitnessDigests = value["lawWitnessObservationDigests"];
  const witnessDigestEntries = isRecord(rawWitnessDigests)
    ? Object.entries(rawWitnessDigests)
    : [];
  if (
    value["suite"] !== "laws-and-mutation-controls" ||
    value["fixtureSchema"] !== mutationRoot["schema"] ||
    value["fixtureVersion"] !== mutationRoot["fixtureVersion"] ||
    value["lawFixtureSchema"] !== lawRoot["schema"] ||
    value["lawFixtureVersion"] !== lawRoot["fixtureVersion"] ||
    value["claim"] !==
      "executable-semantic-counterfactuals-not-source-mutants" ||
    value["classification"] !==
      "executable-semantic-counterfactuals-with-independent-fixture-oracles-not-source-mutants" ||
    value["oracleId"] !== "independent-v0-fixture-expectation-v1" ||
    value["seed"] !==
      "changes.v0-mutation-controls.seed.v2:exact-projections" ||
    value["deterministicReplayRuns"] !== 2 ||
    stableV0EvidenceJson(value["requiredFaultFamilies"]) !==
      stableV0EvidenceJson(expectedFaultFamilies) ||
    stableV0EvidenceJson(value["faultFamiliesObserved"]) !==
      stableV0EvidenceJson(observedFaultFamilies) ||
    value["semanticOperatorsSurvived"] !== 0 ||
    value["directLinksReviewed"] !== V0_EXPECTED_COUNTS.mutationDirectLinks ||
    value["directLinksExecuted"] !== V0_EXPECTED_COUNTS.mutationDirectLinks ||
    value["directLinksKilled"] !== V0_EXPECTED_COUNTS.mutationDirectLinks ||
    value["directLinksSurvived"] !== 0 ||
    value["directKillerLinksSurvived"] !== 0 ||
    value["corroborativeLinksReviewed"] !==
      V0_EXPECTED_COUNTS.mutationCorroborativeLinks ||
    value["reviewedLinks"] !== V0_EXPECTED_COUNTS.mutationReviewedLinks ||
    value["totalReviewedLinks"] !== V0_EXPECTED_COUNTS.mutationReviewedLinks ||
    stableV0EvidenceJson(value["linkedCaseIds"]) !==
      stableV0EvidenceJson(partition.linkedCaseIds) ||
    !Array.isArray(value["linkedCasesUnaccounted"]) ||
    value["linkedCasesUnaccounted"].length !== 0 ||
    value["lawWitnessesObserved"] !== witnessIds.length ||
    witnessDigestEntries.length !== witnessIds.length ||
    stableV0EvidenceJson(
      witnessDigestEntries.map(([id]) => id).sort(compare),
    ) !== stableV0EvidenceJson([...witnessIds].sort(compare)) ||
    witnessDigestEntries.some(([, digest]) => !isSha256(digest)) ||
    value["directLinkInventorySha256"] !==
      partition.directLinkInventorySha256 ||
    value["corroborativeLinkInventorySha256"] !==
      partition.corroborativeLinkInventorySha256 ||
    value["reviewedLinkInventorySha256"] !==
      partition.reviewedLinkInventorySha256
  ) {
    findings.push(finding(
      "V0_EVIDENCE_MUTATION_INVENTORY",
      "observations.mutation",
      "Mutation observation must preserve the exact suite, fixture/oracle identities, deterministic replay seed, fault families, zero-survivor summaries, link inventories, and law-witness digest inventory.",
    ));
  }
  const expectedControlIds = records(
    mutationRoot["controls"],
  ).map((control) => control["id"]);
  if (
    !expectedControlIds.every((id): id is string => typeof id === "string") ||
    stableV0EvidenceJson(strings(value["controlIds"])) !==
      stableV0EvidenceJson(expectedControlIds)
  ) {
    findings.push(finding(
      "V0_EVIDENCE_MUTATION_INVENTORY",
      "observations.mutation.controlIds",
      "Mutation observation must preserve the exact reviewed control order.",
    ));
  }
  const rawControlDigests = value["controlExecutionDigests"];
  const rawControlDigestEntries = isRecord(rawControlDigests)
    ? Object.entries(rawControlDigests)
    : [];
  const controlDigests = digestMap(rawControlDigests);
  if (
    !isRecord(rawControlDigests) ||
    rawControlDigestEntries.length !== V0_EXPECTED_COUNTS.mutationControls ||
    rawControlDigestEntries.some(([, digest]) => !isSha256(digest)) ||
    controlDigests.size !== V0_EXPECTED_COUNTS.mutationControls ||
    stableV0EvidenceJson(rawControlDigestEntries.map(([id]) => id)) !==
      stableV0EvidenceJson(expectedControlIds) ||
    expectedControlIds.some((id) => typeof id !== "string")
  ) {
    findings.push(finding(
      "V0_EVIDENCE_MUTATION_CONTROL_DIGESTS",
      "observations.mutation.controlExecutionDigests",
      "Every reviewed control requires exactly one signed execution digest.",
    ));
  }
  const expectedCaseIds = partition.linkedCaseIds;
  const caseBindings = new Map(buildV0CaseBindings().map((binding) => [
    binding.caseId,
    binding,
  ]));
  const caseRows = records(value["caseObservations"]);
  const linkedCaseRowsById = new Map(caseRows.flatMap(
    (row): Array<[string, JsonRecord]> =>
      typeof row["caseId"] === "string" ? [[row["caseId"], row]] : [],
  ));
  const caseIds = caseRows.flatMap((row) =>
    typeof row["caseId"] === "string" ? [row["caseId"]] : []
  );
  const rawCaseDigests = value["caseObservationDigests"];
  const rawCaseDigestEntries = isRecord(rawCaseDigests)
    ? Object.entries(rawCaseDigests)
    : [];
  const caseDigests = digestMap(rawCaseDigests);
  if (
    caseRows.length !== expectedCaseIds.length ||
    new Set(caseIds).size !== expectedCaseIds.length ||
    stableV0EvidenceJson([...new Set(caseIds)].sort(compare)) !==
      stableV0EvidenceJson([...expectedCaseIds].sort(compare)) ||
    !isRecord(rawCaseDigests) ||
    rawCaseDigestEntries.length !== expectedCaseIds.length ||
    rawCaseDigestEntries.some(([, digest]) => !isSha256(digest)) ||
    stableV0EvidenceJson(rawCaseDigestEntries.map(([id]) => id).sort(compare)) !==
      stableV0EvidenceJson([...expectedCaseIds].sort(compare)) ||
    caseDigests.size !== expectedCaseIds.length ||
    expectedCaseIds.some((caseId) => !caseDigests.has(caseId)) ||
    caseRows.some((row) =>
      typeof row["caseId"] !== "string" ||
      row["observationDigest"] !== caseDigests.get(row["caseId"]) ||
      caseBindings.get(row["caseId"]) === undefined ||
      !mutationCaseObservationAccepted(
        row,
        caseBindings.get(row["caseId"]) as V0CaseBinding,
        runtimePool.payloads,
      )
    )
  ) {
    findings.push(finding(
      "V0_EVIDENCE_MUTATION_CASE_INVENTORY",
      "observations.mutation.caseObservations",
      "Mutation evidence must contain the exact 86 unique reviewed runtime case projections, each with the exact fixture/channel binding, equal accepted actual/expected projections, request/result hashes, and matching digest map.",
    ));
  }
  const rawWitnessRows = value["lawWitnessObservations"];
  const witnessRows = records(rawWitnessRows);
  const witnessRowIds = witnessRows.flatMap((row) =>
    typeof row["caseId"] === "string" ? [row["caseId"]] : []
  );
  const witnessRowsById = new Map(witnessRows.flatMap(
    (row): Array<[string, JsonRecord]> =>
      typeof row["caseId"] === "string" ? [[row["caseId"], row]] : [],
  ));
  const witnessFixtureRows = records(lawRoot["witnesses"]);
  const negativeWitnessIds = witnessFixtureRows.flatMap((witness) =>
    witness["kind"] === "negative" && typeof witness["id"] === "string"
      ? [witness["id"]]
      : []
  );
  const proofPolicy = isRecord(lawRoot["lawProofPolicy"])
    ? lawRoot["lawProofPolicy"]
    : {};
  const executionPolicy = isRecord(proofPolicy["negativeWitnessExecutionPolicy"])
    ? proofPolicy["negativeWitnessExecutionPolicy"]
    : {};
  const classifiedWitnessIds = [
    ...strings(executionPolicy["detectorOnlyWitnessIds"]),
    ...strings(executionPolicy["mixedWitnessIds"]),
    ...strings(executionPolicy["productionExecutedWitnessIds"]),
  ];
  const executionSpecs = records(executionPolicy["executionSpecs"]);
  const executionSpecIds = executionSpecs.flatMap((spec) =>
    typeof spec["witnessId"] === "string" ? [spec["witnessId"]] : []
  );
  const witnessRowsValid = Array.isArray(rawWitnessRows) &&
    hasExactKeys(executionPolicy, [
      "projectionFields",
      "detectorOnlyWitnessIds",
      "mixedWitnessIds",
      "productionExecutedWitnessIds",
      "executionSpecs",
    ]) &&
    stableV0EvidenceJson(strings(executionPolicy["projectionFields"])) ===
      stableV0EvidenceJson([
        "mutationExecutionMode",
        "productionMutantExecuted",
        "detectorOnlyMutantEvaluated",
      ]) &&
    witnessRows.length === witnessIds.length &&
    witnessRows.length === rawWitnessRows.length &&
    new Set(witnessRowIds).size === witnessIds.length &&
    stableV0EvidenceJson(witnessRowIds) === stableV0EvidenceJson(witnessIds) &&
    classifiedWitnessIds.length === negativeWitnessIds.length &&
    new Set(classifiedWitnessIds).size === negativeWitnessIds.length &&
    stableV0EvidenceJson([...classifiedWitnessIds].sort(compare)) ===
      stableV0EvidenceJson([...negativeWitnessIds].sort(compare)) &&
    executionSpecs.length === negativeWitnessIds.length &&
    executionSpecs.length ===
      (Array.isArray(executionPolicy["executionSpecs"])
        ? executionPolicy["executionSpecs"].length
        : -1) &&
    new Set(executionSpecIds).size === negativeWitnessIds.length &&
    stableV0EvidenceJson(executionSpecIds) ===
      stableV0EvidenceJson(negativeWitnessIds) &&
    negativeWitnessIds.every((id) =>
      negativeWitnessExecutionPolicy(id) !== null
    ) &&
    witnessRows.every((row) => {
      const id = row["caseId"];
      if (typeof id !== "string") return false;
      const binding = caseBindings.get(id);
      if (binding === undefined ||
        !mutationCaseObservationAccepted(row, binding, runtimePool.payloads) ||
        row["observationDigest"] !==
          (isRecord(rawWitnessDigests) ? rawWitnessDigests[id] : undefined)) {
        return false;
      }
      const linkedRow = linkedCaseRowsById.get(id);
      return linkedRow === undefined ||
        stableV0EvidenceJson(linkedRow) === stableV0EvidenceJson(row);
    }) &&
    witnessIds.every((id) => witnessRowsById.has(id));
  if (!witnessRowsValid) {
    findings.push(finding(
      "V0_EVIDENCE_MUTATION_WITNESS_PREIMAGES",
      "observations.mutation.lawWitnessObservations",
      "Mutation evidence must carry all 44 law-witness observations in fixture order, bind every digest and linked duplicate, and expose exact runtime input/result preimages for every fixture-classified negative witness.",
    ));
  }
  return findings;
}

function v0ImportIsTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  if (clause.name !== undefined) return false;
  const bindings = clause.namedBindings;
  if (bindings === undefined || ts.isNamespaceImport(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every(
    ({ isTypeOnly }) => isTypeOnly,
  );
}

export function v0StaticRuntimeImports(): readonly string[] {
  return V0_STATIC_SOURCE_FILES.flatMap((filePath) => {
    const source = ts.sys.readFile(filePath);
    if (source === undefined) return [`${filePath}:<missing>`];
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    return sourceFile.statements.flatMap((statement) =>
      ts.isImportDeclaration(statement) &&
        ts.isStringLiteralLike(statement.moduleSpecifier) &&
        !v0ImportIsTypeOnly(statement)
        ? [`${filePath}:${statement.moduleSpecifier.text}`]
        : []
    );
  });
}

function validateStaticObservation(value: JsonRecord): V0EvidenceFinding[] {
  const findings: V0EvidenceFinding[] = exactObservationFields(
    value,
    V0_STATIC_OBSERVATION_FIELDS,
    "observations.static",
  );
  const zeroArrays = [
    "forbiddenImports",
    "forbiddenRuntimeReferences",
    "forbiddenRequestFields",
    "fixtureOrTestSupportImports",
  ] as const;
  for (const field of zeroArrays) {
    if (!Array.isArray(value[field]) || value[field].length !== 0) {
      findings.push(finding(
        "V0_EVIDENCE_STATIC_POLICY",
        `observations.static.${field}`,
        `${field} must be an observed empty array.`,
      ));
    }
  }
  for (const field of ["moduleMutableBindings", "asyncOrGeneratorFunctions"] as const) {
    if (value[field] !== 0) {
      findings.push(finding(
        "V0_EVIDENCE_STATIC_POLICY",
        `observations.static.${field}`,
        `${field} must equal zero.`,
      ));
    }
  }
  for (const field of ["operationSynchronous", "ambientReplayDeeplyEqual"] as const) {
    if (value[field] !== true) {
      findings.push(finding(
        "V0_EVIDENCE_STATIC_POLICY",
        `observations.static.${field}`,
        `${field} must be true.`,
      ));
    }
  }
  const applicability = value["applicability"];
  if (
    !isRecord(applicability) ||
    stableV0EvidenceJson(Object.keys(applicability).sort(compare)) !==
      stableV0EvidenceJson([
        "audio",
        "browser",
        "cancellation",
        "staleRevision",
        "storage",
      ]) ||
    ["cancellation", "staleRevision", "browser", "audio", "storage"]
      .some((field) => applicability[field] !== false)
  ) {
    findings.push(finding(
      "V0_EVIDENCE_STATIC_APPLICABILITY",
      "observations.static.applicability",
      "Static evidence must explicitly record all five inapplicable runtime surfaces as false.",
    ));
  }
  const projectSourcePolicy = value["projectSourcePolicy"];
  if (
    !isRecord(projectSourcePolicy) ||
    projectSourcePolicy["schema"] !== "jcpe.source-policy.v1" ||
    projectSourcePolicy["outcome"] !== "pass" ||
    typeof projectSourcePolicy["files"] !== "number" ||
    !Number.isSafeInteger(projectSourcePolicy["files"]) ||
    projectSourcePolicy["files"] <= 0 ||
    stableV0EvidenceJson(projectSourcePolicy["traceIds"]) !==
      stableV0EvidenceJson(["F0-BOUNDARY-01", "F0-DUPLICATE-01"]) ||
    !Array.isArray(projectSourcePolicy["findings"]) ||
    projectSourcePolicy["findings"].length !== 0
  ) {
    findings.push(finding(
      "V0_EVIDENCE_STATIC_POLICY",
      "observations.static.projectSourcePolicy",
      "Static evidence must bind a clean whole-source dependency and capability-policy scan.",
    ));
  }
  if (
    value["suite"] !== "v0-production-policy" ||
    stableV0EvidenceJson(value["inspectedRuntimeImports"]) !==
      stableV0EvidenceJson(v0StaticRuntimeImports()) ||
    stableV0EvidenceJson(value["sourceFiles"]) !==
      stableV0EvidenceJson(V0_STATIC_SOURCE_FILES) ||
    stableV0EvidenceJson(value["allowedRuntimeImportPrefixes"]) !==
      stableV0EvidenceJson(V0_STATIC_ALLOWED_RUNTIME_IMPORT_PREFIXES)
  ) {
    findings.push(finding(
      "V0_EVIDENCE_STATIC_POLICY",
      "observations.static.sourceFiles",
      `Static evidence must inspect the exact ${String(V0_STATIC_SOURCE_FILES.length)} V0 modules and their recomputed runtime imports under the exact permitted runtime import policy.`,
    ));
  }
  return findings;
}

export function inspectV0ObservationRecords(
  values: readonly JsonRecord[],
): V0EvidenceFinding[] {
  const findings: V0EvidenceFinding[] = [];
  for (const descriptor of OBSERVATION_DESCRIPTORS) {
    const matching = values.filter((value) =>
      value["schema"] === descriptor.schema
    );
    if (matching.length !== 1) {
      findings.push(finding(
        "V0_EVIDENCE_OBSERVATION_INVENTORY",
        `observations#${descriptor.schema}`,
        `Exactly one ${descriptor.schema} observation is required.`,
      ));
      continue;
    }
    const value = matching[0];
    if (value === undefined) continue;
    if (!exactProducer(value["producer"], descriptor.producer)) {
      findings.push(finding(
        "V0_EVIDENCE_OBSERVATION_PRODUCER",
        `observations#${descriptor.schema}.producer`,
        "Observation producer identity is not exact.",
      ));
    }
    if (
      !isSha256(value["semanticDigest"]) ||
      value["semanticDigest"] !== v0DigestWithoutKey(value, "semanticDigest")
    ) {
      findings.push(finding(
        "V0_EVIDENCE_OBSERVATION_DIGEST",
        `observations#${descriptor.schema}.semanticDigest`,
        "Observation semantic digest is missing or invalid.",
      ));
    }
    if (!observationStatusIsPass(value)) {
      findings.push(finding(
        "V0_EVIDENCE_OBSERVATION_STATUS",
        `observations#${descriptor.schema}.status`,
        "Observation must report pass.",
      ));
    }
  }
  if (
    values.length !== OBSERVATION_DESCRIPTORS.length ||
    values.some((value) =>
      !OBSERVATION_DESCRIPTORS.some(({ schema }) => value["schema"] === schema)
    )
  ) {
    findings.push(finding(
      "V0_EVIDENCE_OBSERVATION_INVENTORY",
      "observations",
      "Observation inventory must contain only the exact production, mutation, and static schemas.",
    ));
  }
  const production = observationBySchema(values, V0_PRODUCTION_SCHEMA);
  if (production !== undefined) {
    findings.push(...validateProductionObservation(production));
  }
  const mutation = observationBySchema(values, V0_MUTATION_SCHEMA);
  if (mutation !== undefined) {
    findings.push(...validateMutationObservationHeader(mutation));
  }
  const staticObservation = observationBySchema(values, V0_STATIC_SCHEMA);
  if (staticObservation !== undefined) {
    findings.push(...validateStaticObservation(staticObservation));
  }
  const maps = observationCaseDigests(values);
  for (const binding of buildV0CaseBindings()) {
    if (!isSha256(maps.get(binding.caseId)?.digest)) {
      findings.push(finding(
        "V0_EVIDENCE_CASE_OBSERVATION",
        `observations.caseDigests#${binding.caseId}`,
        "Every checked-in V0 case requires one non-conflicting runtime observation digest.",
      ));
    }
  }
  findings.push(...inspectV0MutationLinkPartition().findings);
  return sortFindings(findings);
}

export function parseV0Observations(output: string): Readonly<{
  observations: readonly JsonRecord[];
  findings: readonly V0EvidenceFinding[];
}> {
  const observations: JsonRecord[] = [];
  const findings: V0EvidenceFinding[] = [];
  for (const [index, line] of output.split(/\r?\n/u).entries()) {
    const descriptor = OBSERVATION_DESCRIPTORS.find(({ marker }) =>
      line.startsWith(marker)
    );
    if (descriptor === undefined) continue;
    try {
      const value: unknown = JSON.parse(line.slice(descriptor.marker.length));
      if (!isRecord(value)) throw new Error("observation must be an object");
      observations.push(value);
    } catch (error) {
      findings.push(finding(
        "V0_EVIDENCE_OBSERVATION_JSON",
        `suite.output:${String(index + 1)}`,
        error instanceof Error ? error.message : "Observation JSON is invalid.",
      ));
    }
  }
  findings.push(...inspectV0ObservationRecords(observations));
  return { observations, findings: sortFindings(findings) };
}

type InspectedCounterfactual = Readonly<{
  controlId: string;
  caseId: string;
  executionDigest: string;
  beforeDigest: string;
  afterDigest: string;
  detectorDigest: string;
  affectedCount: number;
  affectedPaths: readonly unknown[];
  valid: boolean;
}>;

export const V0_VALID_COUNTERFACTUAL_ROW_CACHE_MAX_ENTRIES = 256 as const;

type CachedValidCounterfactualRow = Omit<
  InspectedCounterfactual,
  "affectedPaths"
>;

const validCounterfactualRowCache = new Map<
  string,
  CachedValidCounterfactualRow
>();

const validCounterfactualCaseContextCache = new Map<string, true>();

function rememberValidCounterfactualCaseContext(key: string): void {
  validCounterfactualCaseContextCache.delete(key);
  validCounterfactualCaseContextCache.set(key, true);
  while (
    validCounterfactualCaseContextCache.size >
      V0_VALID_COUNTERFACTUAL_ROW_CACHE_MAX_ENTRIES
  ) {
    const oldest = validCounterfactualCaseContextCache.keys().next().value;
    if (oldest === undefined) break;
    validCounterfactualCaseContextCache.delete(oldest);
  }
}

function isStrictJsonCacheValue(
  value: unknown,
  ancestors = new Set<object>(),
): boolean {
  if (
    value === null || typeof value === "string" ||
    typeof value === "boolean"
  ) return true;
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return false;
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1 ||
        !ownKeys.every((key) =>
          key === "length" ||
          (typeof key === "string" && /^(0|[1-9][0-9]*)$/u.test(key) &&
            Number(key) < value.length)
        )) return false;
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (descriptor === undefined || !descriptor.enumerable ||
          !("value" in descriptor) ||
          !isStrictJsonCacheValue(descriptor.value, ancestors)) return false;
      }
      return true;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable ||
        !("value" in descriptor) ||
        !isStrictJsonCacheValue(descriptor.value, ancestors)) return false;
    }
    return true;
  } finally {
    ancestors.delete(value);
  }
}

function validCounterfactualRowCacheKey(
  executionDigest: unknown,
  caseObservationDigest: unknown,
  fixtureRecordSha256: unknown,
  expectedControlDigest: unknown,
): string | null {
  return isSha256(executionDigest) && isSha256(caseObservationDigest) &&
      isSha256(fixtureRecordSha256) && isSha256(expectedControlDigest)
    ? [
        executionDigest,
        caseObservationDigest,
        fixtureRecordSha256,
        expectedControlDigest,
      ].join("\u0000")
    : null;
}

function validCounterfactualCaseContextCacheKey(
  caseId: string,
  observationDigest: unknown,
  fixtureRecordSha256: unknown,
  runtimePreimagePoolInputDigest: unknown,
  negativeWitnessExecutionPolicyDigest: unknown,
): string | null {
  return isSha256(observationDigest) && isSha256(fixtureRecordSha256) &&
      isSha256(runtimePreimagePoolInputDigest) &&
      isSha256(negativeWitnessExecutionPolicyDigest)
    ? [
        caseId,
        observationDigest,
        fixtureRecordSha256,
        runtimePreimagePoolInputDigest,
        negativeWitnessExecutionPolicyDigest,
      ].join("\u0000")
    : null;
}

function rememberValidCounterfactualRow(
  key: string,
  row: InspectedCounterfactual,
): void {
  validCounterfactualRowCache.delete(key);
  validCounterfactualRowCache.set(key, Object.freeze({
    controlId: row.controlId,
    caseId: row.caseId,
    executionDigest: row.executionDigest,
    beforeDigest: row.beforeDigest,
    afterDigest: row.afterDigest,
    detectorDigest: row.detectorDigest,
    affectedCount: row.affectedCount,
    valid: row.valid,
  }));
  while (
    validCounterfactualRowCache.size >
      V0_VALID_COUNTERFACTUAL_ROW_CACHE_MAX_ENTRIES
  ) {
    const oldest = validCounterfactualRowCache.keys().next().value;
    if (oldest === undefined) break;
    validCounterfactualRowCache.delete(oldest);
  }
}

function reuseValidCounterfactualRow(
  key: string,
  value: JsonRecord,
): InspectedCounterfactual | null {
  const cached = validCounterfactualRowCache.get(key);
  if (cached === undefined) return null;
  validCounterfactualRowCache.delete(key);
  validCounterfactualRowCache.set(key, cached);
  return {
    ...cached,
    affectedPaths: normalizedPathStrings(
      Array.isArray(value["affectedPaths"])
        ? value["affectedPaths"]
        : typeof value["targetPath"] === "string"
          ? [value["targetPath"]]
          : [],
    ),
  };
}

function jsonLeafCount(value: unknown): number {
  if (Array.isArray(value)) {
    return (value as readonly unknown[]).reduce<number>(
      (sum, item) => sum + jsonLeafCount(item),
      0,
    );
  }
  if (isRecord(value)) {
    return Object.values(value).reduce<number>(
      (sum, item) => sum + jsonLeafCount(item),
      0,
    );
  }
  return 1;
}

function semanticMismatchPaths(
  before: unknown,
  after: unknown,
  path = "$",
): string[] {
  if (stableV0EvidenceJson(before) === stableV0EvidenceJson(after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    return Array.from({ length }, (_, index) => index)
      .flatMap((index) => semanticMismatchPaths(
        before[index],
        after[index],
        `${path}[${String(index)}]`,
      ));
  }
  if (isRecord(before) && isRecord(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort(compare)
      .flatMap((key) => semanticMismatchPaths(
        before[key],
        after[key],
        `${path}.${key}`,
      ));
  }
  return [path];
}

function normalizedPathStrings(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.length > 0) return [item];
    if (
      Array.isArray(item) &&
      item.every((part) => typeof part === "string" || typeof part === "number")
    ) {
      return [`$.${item.map(String).join(".")}`];
    }
    return [];
  });
}

function pathIsWithin(path: string, target: string): boolean {
  return path === target || path.startsWith(`${target}.`) ||
    path.startsWith(`${target}[`);
}

function genericScalarProjection(value: unknown): boolean {
  if (!isRecord(value)) return true;
  const keys = Object.keys(value).sort(compare);
  if (
    stableV0EvidenceJson(keys) === stableV0EvidenceJson([
      "caseId",
      "caseObservationDigest",
      "semantic",
    ]) &&
    isRecord(value["semantic"]) &&
    Object.keys(value["semantic"]).length === 1
  ) return true;
  return jsonLeafCount(value) < 4;
}

function digestAlias(
  value: JsonRecord,
  names: readonly string[],
): string | null {
  for (const name of names) {
    if (isSha256(value[name])) return value[name];
  }
  return null;
}

function inspectCounterfactualRows(
  mutation: JsonRecord,
): Readonly<{
  rows: readonly InspectedCounterfactual[];
  findings: readonly V0EvidenceFinding[];
}> {
  const findings: V0EvidenceFinding[] = [];
  const rows: InspectedCounterfactual[] = [];
  const runtimePool = inspectRuntimePreimagePool(mutation);
  const runtimePreimages = runtimePool.payloads;
  const expectedPairs = inspectV0MutationLinkPartition().directLinks;
  const expectedControls = new Map(records(
    (mutationFixture as unknown as JsonRecord)["controls"],
  ).flatMap((control): Array<[string, JsonRecord]> =>
    typeof control["id"] === "string" ? [[control["id"], control]] : []
  ));
  const expectedControlContexts = new Map([...expectedControls].map(
    ([controlId, control]) => [controlId, {
      digest: v0EvidenceDigest(control),
      strictJson: isStrictJsonCacheValue(control),
    }] as const,
  ));
  const expectedPairKeys = new Set(expectedPairs.map(({ controlId, caseId }) =>
    `${controlId}\u0000${caseId}`
  ));
  const observedPairKeys = new Set<string>();
  const caseDigestMap = digestMap(mutation["caseObservationDigests"]);
  const caseObservationMap = new Map(records(mutation["caseObservations"])
    .flatMap((row): Array<[string, JsonRecord]> =>
      typeof row["caseId"] === "string" ? [[row["caseId"], row]] : []
    ));
  const bindings = new Map(buildV0CaseBindings().map((row) => [
    row.caseId,
    row,
  ]));
  const lawRoot = lawFixture as unknown as JsonRecord;
  const lawProofPolicy = lawRoot["lawProofPolicy"];
  const negativeWitnessPolicy = isRecord(lawProofPolicy)
    ? lawProofPolicy["negativeWitnessExecutionPolicy"]
    : null;
  const negativeWitnessPolicyStrictJson =
    isStrictJsonCacheValue(negativeWitnessPolicy);
  const negativeWitnessPolicyDigest = negativeWitnessPolicyStrictJson
    ? v0EvidenceDigest(negativeWitnessPolicy)
    : null;
  const caseContextsHasDuplicateSentinel = new Set<string>();
  const caseContexts = new Map(expectedPairs.flatMap(({ caseId }) => {
    if (caseContextsHasDuplicateSentinel.has(caseId)) return [];
    caseContextsHasDuplicateSentinel.add(caseId);
    const observation = caseObservationMap.get(caseId);
    const binding = bindings.get(caseId);
    const observationDigest = observation?.["observationDigest"];
    const strictJson = isStrictJsonCacheValue(observation);
    const cacheKey = observation !== undefined && binding !== undefined &&
        strictJson && negativeWitnessPolicyStrictJson &&
        runtimePool.findings.length === 0 &&
        caseDigestMap.get(caseId) === observationDigest
      ? validCounterfactualCaseContextCacheKey(
          caseId,
          observationDigest,
          binding.fixtureRecordSha256,
          runtimePool.inputDigest,
          negativeWitnessPolicyDigest,
        )
      : null;
    const cached = cacheKey !== null &&
      validCounterfactualCaseContextCache.has(cacheKey) &&
      observation !== undefined && isSha256(observationDigest) &&
      observationDigest ===
        v0DigestWithoutKey(observation, "observationDigest");
    const valid = cached ||
      (observation !== undefined && binding !== undefined &&
        mutationCaseObservationAccepted(
          observation,
          binding,
          runtimePreimages,
        ) &&
        isSha256(observationDigest) &&
        caseDigestMap.get(caseId) === observationDigest);
    if (valid && cacheKey !== null) {
      rememberValidCounterfactualCaseContext(cacheKey);
    }
    return [[caseId, {
      observation,
      binding,
      observationDigest,
      valid,
      strictJson,
      boundActualProjection: observation !== undefined && binding !== undefined
        ? boundMutationCaseProjection(
            observation,
            binding,
            "actualProjection",
          )
        : null,
      boundExpectedProjection: observation !== undefined && binding !== undefined
        ? boundMutationCaseProjection(
            observation,
            binding,
            "expectedProjection",
          )
        : null,
    }] as const];
  }));
  for (const [index, value] of records(
    mutation["counterfactualExecutions"],
  ).entries()) {
    const path = `observations.mutation.counterfactualExecutions[${String(index)}]`;
    const controlId = value["controlId"];
    const caseId = value["caseId"];
    const pairKey = typeof controlId === "string" && typeof caseId === "string"
      ? `${controlId}\u0000${caseId}`
      : "invalid";
    const executionDigest = value["executionDigest"];
    const beforeDigest = digestAlias(value, ["beforeDigest", "beforeSha256"]);
    const afterDigest = digestAlias(value, ["afterDigest", "afterSha256"]);
    const detectorDigest = digestAlias(value, [
      "detectorDigest",
      "detectorSha256",
    ]);
    const expectedProjectionDigest = digestAlias(value, [
      "expectedProjectionDigest",
      "detectorBaselineDigest",
    ]) ?? (isRecord(value["detector"])
      ? digestAlias(value["detector"], [
          "expectedProjectionDigest",
          "reviewedExpectationDigest",
        ])
      : null);
    const baselineObservationDigest = digestAlias(value, [
      "baselineObservationDigest",
    ]);
    const caseContext = typeof caseId === "string"
      ? caseContexts.get(caseId)
      : undefined;
    const expectedControl = typeof controlId === "string"
      ? expectedControls.get(controlId)
      : undefined;
    const expectedControlContext = typeof controlId === "string"
      ? expectedControlContexts.get(controlId)
      : undefined;
    const expectedControlDigest = expectedControlContext?.digest ?? null;
    const cacheEligible = caseContext?.valid === true &&
      baselineObservationDigest === caseContext.observationDigest &&
      isStrictJsonCacheValue(value) &&
      caseContext.strictJson &&
      expectedControlContext?.strictJson === true;
    const cacheKey = cacheEligible
      ? validCounterfactualRowCacheKey(
          executionDigest,
          caseContext.observationDigest,
          caseContext.binding?.fixtureRecordSha256,
          expectedControlDigest,
        )
      : null;
    const cached = cacheKey === null
      ? null
      : validCounterfactualRowCache.get(cacheKey) ?? null;
    if (
      cacheKey !== null && cached !== null && expectedPairKeys.has(pairKey) &&
      !observedPairKeys.has(pairKey) &&
      executionDigest === v0DigestWithoutKey(value, "executionDigest")
    ) {
      const reusable = reuseValidCounterfactualRow(cacheKey, value);
      if (reusable === null) {
        throw new Error("valid counterfactual cache entry disappeared");
      }
      observedPairKeys.add(pairKey);
      rows.push(reusable);
      continue;
    }
    const expectedProjection = value["expectedProjection"];
    const baselineDetectorProjection = value["baselineDetectorProjection"];
    const mutantDetectorProjection = value["mutantDetectorProjection"];
    const computedBaselineAccepted =
      stableV0EvidenceJson(baselineDetectorProjection) ===
        stableV0EvidenceJson(expectedProjection);
    const computedMutantAccepted =
      stableV0EvidenceJson(mutantDetectorProjection) ===
        stableV0EvidenceJson(expectedProjection);
    const affectedCount = value["affectedCount"];
    const targetPath = typeof value["targetPath"] === "string"
      ? value["targetPath"]
      : null;
    const affectedPaths = normalizedPathStrings(
      Array.isArray(value["affectedPaths"])
        ? value["affectedPaths"]
        : targetPath === null
          ? []
          : [targetPath],
    );
    const beforeProjection = value["beforeProjection"];
    const afterProjection = value["afterProjection"];
    const mismatchPaths = semanticMismatchPaths(
      beforeProjection,
      afterProjection,
    );
    const outOfScopeMismatchPaths = mismatchPaths.filter((path) =>
      !affectedPaths.some((affectedPath) => pathIsWithin(path, affectedPath))
    );
    const coherence = value["coherence"];
    const coherenceValid = isRecord(coherence) &&
      stableV0EvidenceJson(Object.keys(coherence).sort(compare)) ===
        stableV0EvidenceJson([
          "accepted",
          "caseBindingPreserved",
          "issues",
          "noCollateralMutationOutsideTarget",
          "outOfScopeMismatchPaths",
        ]) &&
      coherence["accepted"] === true &&
      coherence["caseBindingPreserved"] === true &&
      Array.isArray(coherence["issues"]) && coherence["issues"].length === 0 &&
      Array.isArray(coherence["outOfScopeMismatchPaths"]) &&
      coherence["outOfScopeMismatchPaths"].length === 0 &&
      coherence["noCollateralMutationOutsideTarget"] === true;
    const baselineAccepted = value["baselineAccepted"];
    const mutantAccepted = value["mutantAccepted"];
    const detector = value["detector"];
    const detectorValid = isRecord(detector) &&
      stableV0EvidenceJson(Object.keys(detector).sort(compare)) ===
        stableV0EvidenceJson([
          "baselineAccepted",
          "expectedProjectionDigest",
          "mutantAccepted",
          "oracleId",
          "reviewedInvariant",
          "sameReviewedExpectation",
        ]) &&
      detector["oracleId"] ===
        "independent-v0-fixture-expectation-v1" &&
      typeof value["reviewedInvariant"] === "string" &&
      value["reviewedInvariant"].length > 0 &&
      detector["reviewedInvariant"] === value["reviewedInvariant"] &&
      detectorDigest !== null &&
      detectorDigest === v0EvidenceDigest(detector) &&
      detector["expectedProjectionDigest"] === expectedProjectionDigest &&
      detector["baselineAccepted"] === true &&
      detector["mutantAccepted"] === false &&
      detector["sameReviewedExpectation"] === true;
    const binding = caseContext?.binding;
    const caseObservationValid = caseContext?.valid === true &&
      baselineObservationDigest === caseContext.observationDigest;
    const boundActualProjection = caseContext?.boundActualProjection ?? null;
    const boundExpectedProjection = caseContext?.boundExpectedProjection ?? null;
    const expectationValid = binding !== undefined &&
      boundActualProjection !== null &&
      boundExpectedProjection !== null &&
      value["fixtureRecordSha256"] === binding.fixtureRecordSha256 &&
      value["expectationSource"] === binding.fixturePath &&
      expectedProjectionDigest !== null &&
      isRecord(expectedProjection) &&
      isRecord(baselineDetectorProjection) &&
      isRecord(mutantDetectorProjection) &&
      expectedProjection["caseId"] === caseId &&
      expectedProjection["fixtureRecordSha256"] ===
        binding.fixtureRecordSha256 &&
      baselineDetectorProjection["caseId"] === caseId &&
      baselineDetectorProjection["fixtureRecordSha256"] ===
        binding.fixtureRecordSha256 &&
      mutantDetectorProjection["caseId"] === caseId &&
      mutantDetectorProjection["fixtureRecordSha256"] ===
        binding.fixtureRecordSha256 &&
      !genericScalarProjection(expectedProjection) &&
      !genericScalarProjection(baselineDetectorProjection) &&
      !genericScalarProjection(mutantDetectorProjection) &&
      expectedProjectionDigest === v0EvidenceDigest(expectedProjection) &&
      stableV0EvidenceJson(beforeProjection) ===
        stableV0EvidenceJson(boundActualProjection) &&
      stableV0EvidenceJson(expectedProjection) ===
        stableV0EvidenceJson(boundExpectedProjection) &&
      stableV0EvidenceJson(baselineDetectorProjection) ===
        stableV0EvidenceJson(beforeProjection) &&
      stableV0EvidenceJson(mutantDetectorProjection) ===
        stableV0EvidenceJson(afterProjection) &&
      computedBaselineAccepted &&
      !computedMutantAccepted;
    const projectionsValid =
      (isRecord(beforeProjection) || Array.isArray(beforeProjection)) &&
      (isRecord(afterProjection) || Array.isArray(afterProjection)) &&
      !genericScalarProjection(beforeProjection) &&
      !genericScalarProjection(afterProjection) &&
      beforeDigest === v0EvidenceDigest(beforeProjection) &&
      afterDigest === v0EvidenceDigest(afterProjection) &&
      mismatchPaths.length > 0 &&
      stableV0EvidenceJson(affectedPaths) ===
        stableV0EvidenceJson(mismatchPaths) &&
      outOfScopeMismatchPaths.length === 0 &&
      targetPath !== null &&
      mismatchPaths.every((path) => pathIsWithin(path, targetPath));
    const semanticTargetTail = targetPath?.startsWith("$.semantic.") === true
      ? targetPath.slice("$.semantic.".length)
      : null;
    const genericSemanticScalarTarget = semanticTargetTail !== null &&
      !semanticTargetTail.includes(".") &&
      !semanticTargetTail.includes("[");
    const mutationOperation = value["mutationOperation"];
    const reviewedOperationValid = expectedControl !== undefined &&
      value["operator"] === expectedControl["operator"] &&
      value["algorithm"] === expectedControl["operator"] &&
      value["mutatedFault"] === expectedControl["mutatedFault"] &&
      value["faultFamily"] === expectedControl["faultFamily"] &&
      isRecord(mutationOperation) &&
      mutationOperation["algorithm"] === expectedControl["operator"] &&
      typeof mutationOperation["semanticFault"] === "string" &&
      mutationOperation["semanticFault"].length > 0 &&
      typeof mutationOperation["selectorContract"] === "string" &&
      mutationOperation["selectorContract"].length > 0 &&
      Array.isArray(mutationOperation["actions"]) &&
      mutationOperation["actions"].length > 0;
    const valid =
      typeof controlId === "string" &&
      typeof caseId === "string" &&
      expectedPairKeys.has(pairKey) &&
      !observedPairKeys.has(pairKey) &&
      typeof affectedCount === "number" &&
      Number.isSafeInteger(affectedCount) &&
      affectedCount > 0 &&
      affectedCount === mismatchPaths.length &&
      affectedPaths.length > 0 &&
      targetPath !== null &&
      (targetPath === "$.result" || targetPath.startsWith("$.result.") ||
        targetPath.startsWith("$.result[")) &&
      !genericSemanticScalarTarget &&
      beforeDigest !== null &&
      afterDigest !== null &&
      beforeDigest !== afterDigest &&
      detectorDigest !== null &&
      expectedProjectionDigest !== null &&
      value["killed"] === true &&
      value["executionClass"] === "semantic-output-counterfactual" &&
      baselineAccepted === true &&
      mutantAccepted === false &&
      coherenceValid &&
      reviewedOperationValid &&
      detectorValid &&
      caseObservationValid &&
      expectationValid &&
      projectionsValid &&
      Array.isArray(value["outOfScopeMismatchPaths"]) &&
      value["outOfScopeMismatchPaths"].length === 0 &&
      isSha256(executionDigest) &&
      executionDigest === v0DigestWithoutKey(value, "executionDigest");
    if (!valid) {
      findings.push(finding(
        "V0_EVIDENCE_COUNTERFACTUAL_INVALID",
        path,
        "Each reviewed direct link requires one targeted, coherent, digest-bound semantic counterfactual whose accepted baseline is rejected after mutation.",
      ));
    }
    if (pairKey !== "invalid") observedPairKeys.add(pairKey);
    if (
      typeof controlId === "string" &&
      typeof caseId === "string" &&
      typeof affectedCount === "number" &&
      beforeDigest !== null &&
      afterDigest !== null &&
      detectorDigest !== null &&
      isSha256(executionDigest)
    ) {
      const inspected = {
        controlId,
        caseId,
        executionDigest,
        beforeDigest,
        afterDigest,
        detectorDigest,
        affectedCount,
        affectedPaths,
        valid,
      };
      rows.push(inspected);
      if (valid && cacheEligible && cacheKey !== null) {
        rememberValidCounterfactualRow(cacheKey, inspected);
      }
    }
  }
  if (
    rows.length !== V0_EXPECTED_COUNTS.mutationDirectLinks ||
    observedPairKeys.size !== expectedPairKeys.size ||
    [...expectedPairKeys].some((key) => !observedPairKeys.has(key))
  ) {
    findings.push(finding(
      "V0_EVIDENCE_COUNTERFACTUAL_INVENTORY",
      "observations.mutation.counterfactualExecutions",
      "Counterfactual inventory must execute each of the 104 reviewed direct killer links exactly once.",
    ));
  }
  return { rows, findings: sortFindings(findings) };
}

type InspectedCorroboration = Readonly<{
  controlId: string;
  caseId: string;
  reasonCode: string;
  reason: string;
  observationDigest: string;
  valid: boolean;
}>;

function inspectCorroborativeRows(
  mutation: JsonRecord,
): Readonly<{
  rows: readonly InspectedCorroboration[];
  findings: readonly V0EvidenceFinding[];
}> {
  const expected = inspectV0MutationLinkPartition().corroborativeLinks;
  const expectedMap = new Map(expected.map((row) => [
    `${row.controlId}\u0000${row.caseId}`,
    row,
  ]));
  const seen = new Set<string>();
  const rows: InspectedCorroboration[] = [];
  const findings: V0EvidenceFinding[] = [];
  const runtimePreimages = inspectRuntimePreimagePool(mutation).payloads;
  const caseDigestMap = digestMap(mutation["caseObservationDigests"]);
  const caseObservationMap = new Map(records(mutation["caseObservations"])
    .flatMap((row): Array<[string, JsonRecord]> =>
      typeof row["caseId"] === "string" ? [[row["caseId"], row]] : []
    ));
  const bindings = new Map(buildV0CaseBindings().map((row) => [
    row.caseId,
    row,
  ]));
  for (const [index, value] of records(
    mutation["corroborativeObservations"],
  ).entries()) {
    const controlId = value["controlId"];
    const caseId = value["caseId"];
    const reasonCode = value["reasonCode"];
    const reason = value["reason"];
    const observationDigest = digestAlias(value, [
      "observationDigest",
      "evidenceDigest",
    ]);
    const key = typeof controlId === "string" && typeof caseId === "string"
      ? `${controlId}\u0000${caseId}`
      : "invalid";
    const expectedRow = expectedMap.get(key);
    const caseObservation = typeof caseId === "string"
      ? caseObservationMap.get(caseId)
      : undefined;
    const binding = typeof caseId === "string" ? bindings.get(caseId) : undefined;
    const caseObservationValid = caseObservation !== undefined &&
      binding !== undefined &&
      mutationCaseObservationAccepted(
        caseObservation,
        binding,
        runtimePreimages,
      ) &&
      observationDigest === caseObservation["observationDigest"] &&
      caseDigestMap.get(String(caseId)) === observationDigest;
    const valid = expectedRow !== undefined &&
      !seen.has(key) &&
      reasonCode === expectedRow.reasonCode &&
      reason === expectedRow.reason &&
      observationDigest !== null &&
      caseObservationValid;
    if (!valid) {
      findings.push(finding(
        "V0_EVIDENCE_CORROBORATION_INVALID",
        `observations.mutation.corroborativeObservations[${String(index)}]`,
        "Corroborative evidence must preserve the exact reviewed case and non-killing reason.",
      ));
    }
    if (key !== "invalid") seen.add(key);
    if (
      typeof controlId === "string" &&
      typeof caseId === "string" &&
      typeof reasonCode === "string" &&
      typeof reason === "string" &&
      observationDigest !== null
    ) {
      rows.push({
        controlId,
        caseId,
        reasonCode,
        reason,
        observationDigest,
        valid,
      });
    }
  }
  if (
    rows.length !== V0_EXPECTED_COUNTS.mutationCorroborativeLinks ||
    seen.size !== expectedMap.size ||
    [...expectedMap.keys()].some((key) => !seen.has(key))
  ) {
    findings.push(finding(
      "V0_EVIDENCE_CORROBORATION_INVENTORY",
      "observations.mutation.corroborativeObservations",
      "Both reviewed non-killing corroborative links must be observed exactly once.",
    ));
  }
  return { rows, findings: sortFindings(findings) };
}

export type V0MutationEvidenceRow = Readonly<{
  controlId: string;
  operator: string;
  mutatedFault: string;
  killedByCaseIds: readonly string[];
  corroboratedByCaseIds: readonly string[];
  directKillEvidence: readonly Readonly<{
    caseId: string;
    fixturePath: string;
    fixtureRecordSha256: string;
    baselineObservationSha256: string;
    beforeSha256: string;
    afterSha256: string;
    detectorSha256: string;
    counterfactualExecutionSha256: string;
    affectedCount: number;
    affectedPathsSha256: string;
  }>[];
  corroborativeEvidence: readonly Readonly<{
    caseId: string;
    reasonCode: string;
    reason: string;
    observationSha256: string;
  }>[];
  controlObservationSha256: string;
  outcome: Outcome;
}>;

export type V0MutationEvidence = Readonly<{
  classification:
    "executable-semantic-counterfactuals-with-independent-fixture-oracles-not-source-mutants";
  reviewedControls: number;
  reviewedControlsDischarged: number;
  reviewedControlsUndischarged: number;
  reviewedControlsUnobserved: number;
  reviewedControlsInvalid: number;
  semanticCounterfactualsExecuted: number;
  semanticCounterfactualsKilled: number;
  semanticCounterfactualsSurvived: number;
  directKillerLinksReviewed: number;
  directKillerLinksExecuted: number;
  directKillerLinksKilled: number;
  directKillerLinksSurvived: number;
  corroborativeLinksReviewed: number;
  corroborativeLinksObserved: number;
  corroborativeLinksUnobserved: number;
  reviewedCaseLinks: number;
  linkedCasesObserved: number;
  directLinkInventorySha256: string;
  corroborativeLinkInventorySha256: string;
  reviewedLinkInventorySha256: string;
  sourceMutantsExecuted: 0;
  sourceMutantsKilled: 0;
  rows: readonly V0MutationEvidenceRow[];
  outcome: Outcome;
}>;

export function buildV0MutationEvidence(
  observations: readonly JsonRecord[],
  caseBindings = buildV0CaseBindings(),
): V0MutationEvidence {
  const mutation = observationBySchema(observations, V0_MUTATION_SCHEMA) ?? {};
  const partition = inspectV0MutationLinkPartition();
  const inspectedDirect = inspectCounterfactualRows(mutation);
  const inspectedCorroborative = inspectCorroborativeRows(mutation);
  const directByPair = new Map(inspectedDirect.rows.map((row) => [
    `${row.controlId}\u0000${row.caseId}`,
    row,
  ]));
  const corroborativeByPair = new Map(inspectedCorroborative.rows.map((row) => [
    `${row.controlId}\u0000${row.caseId}`,
    row,
  ]));
  const bindings = new Map(caseBindings.map((row) => [row.caseId, row]));
  const observationDigests = digestMap(mutation["caseObservationDigests"]);
  const controlDigests = digestMap(mutation["controlExecutionDigests"]);
  const controls = records(
    (mutationFixture as unknown as JsonRecord)["controls"],
  );
  const rows: V0MutationEvidenceRow[] = controls.flatMap((control) => {
    const controlId = control["id"];
    const operator = control["operator"];
    const mutatedFault = control["mutatedFault"];
    if (
      typeof controlId !== "string" ||
      typeof operator !== "string" ||
      typeof mutatedFault !== "string"
    ) return [];
    const killedByCaseIds = strings(control["killedByCaseIds"]);
    const corroboratedByCaseIds = strings(control["corroboratedByCaseIds"]);
    const directKillEvidence = killedByCaseIds.flatMap((caseId) => {
      const execution = directByPair.get(`${controlId}\u0000${caseId}`);
      const binding = bindings.get(caseId);
      const baselineObservationSha256 = observationDigests.get(caseId);
      if (
        execution === undefined ||
        binding === undefined ||
        baselineObservationSha256 === undefined
      ) return [];
      return [{
        caseId,
        fixturePath: binding.fixturePath,
        fixtureRecordSha256: binding.fixtureRecordSha256,
        baselineObservationSha256,
        beforeSha256: execution.beforeDigest,
        afterSha256: execution.afterDigest,
        detectorSha256: execution.detectorDigest,
        counterfactualExecutionSha256: execution.executionDigest,
        affectedCount: execution.affectedCount,
        affectedPathsSha256: v0EvidenceDigest(execution.affectedPaths),
      }];
    });
    const corroborativeEvidence = corroboratedByCaseIds.flatMap((caseId) => {
      const row = corroborativeByPair.get(`${controlId}\u0000${caseId}`);
      return row === undefined
        ? []
        : [{
            caseId,
            reasonCode: row.reasonCode,
            reason: row.reason,
            observationSha256: row.observationDigest,
          }];
    });
    const observedControlExecutions = records(
      mutation["counterfactualExecutions"],
    ).filter((execution) => execution["controlId"] === controlId);
    const valid =
      directKillEvidence.length === killedByCaseIds.length &&
      killedByCaseIds.every((caseId) =>
        directByPair.get(`${controlId}\u0000${caseId}`)?.valid === true
      ) &&
      corroborativeEvidence.length === corroboratedByCaseIds.length &&
      corroboratedByCaseIds.every((caseId) =>
        corroborativeByPair.get(`${controlId}\u0000${caseId}`)?.valid === true
      ) &&
      controlDigests.get(controlId) ===
        v0EvidenceDigest(observedControlExecutions);
    return [Object.freeze({
      controlId,
      operator,
      mutatedFault,
      killedByCaseIds,
      corroboratedByCaseIds,
      directKillEvidence,
      corroborativeEvidence,
      controlObservationSha256: controlDigests.get(controlId) ?? "unavailable",
      outcome: valid ? "pass" as const : "fail" as const,
    })];
  });
  const discharged = rows.filter(({ outcome }) => outcome === "pass").length;
  const directExecuted = inspectedDirect.rows.length;
  const directKilled = inspectedDirect.rows.filter(({ valid }) => valid).length;
  const corroborativeObserved = inspectedCorroborative.rows
    .filter(({ valid }) => valid).length;
  const linkedCasesObserved = new Set([
    ...inspectedDirect.rows.map(({ caseId }) => caseId),
    ...inspectedCorroborative.rows.map(({ caseId }) => caseId),
  ]).size;
  const outcome: Outcome =
    partition.findings.length === 0 &&
      inspectedDirect.findings.length === 0 &&
      inspectedCorroborative.findings.length === 0 &&
      rows.length === V0_EXPECTED_COUNTS.mutationControls &&
      discharged === V0_EXPECTED_COUNTS.mutationControls &&
      linkedCasesObserved === V0_EXPECTED_COUNTS.mutationLinkedCases
      ? "pass"
      : "fail";
  return Object.freeze({
    classification:
      "executable-semantic-counterfactuals-with-independent-fixture-oracles-not-source-mutants",
    reviewedControls: rows.length,
    reviewedControlsDischarged: discharged,
    reviewedControlsUndischarged: rows.length - discharged,
    reviewedControlsUnobserved: rows.filter(({ controlObservationSha256 }) =>
      !isSha256(controlObservationSha256)
    ).length,
    reviewedControlsInvalid: rows.filter(({ outcome: rowOutcome }) =>
      rowOutcome !== "pass"
    ).length,
    semanticCounterfactualsExecuted:
      new Set(inspectedDirect.rows.map(({ controlId }) => controlId)).size,
    semanticCounterfactualsKilled:
      new Set(inspectedDirect.rows.filter(({ valid }) => valid)
        .map(({ controlId }) => controlId)).size,
    semanticCounterfactualsSurvived:
      V0_EXPECTED_COUNTS.mutationControls -
      new Set(inspectedDirect.rows.filter(({ valid }) => valid)
        .map(({ controlId }) => controlId)).size,
    directKillerLinksReviewed: partition.directLinks.length,
    directKillerLinksExecuted: directExecuted,
    directKillerLinksKilled: directKilled,
    directKillerLinksSurvived: directExecuted - directKilled,
    corroborativeLinksReviewed: partition.corroborativeLinks.length,
    corroborativeLinksObserved: corroborativeObserved,
    corroborativeLinksUnobserved:
      partition.corroborativeLinks.length - corroborativeObserved,
    reviewedCaseLinks: partition.reviewedLinks.length,
    linkedCasesObserved,
    directLinkInventorySha256: partition.directLinkInventorySha256,
    corroborativeLinkInventorySha256:
      partition.corroborativeLinkInventorySha256,
    reviewedLinkInventorySha256: partition.reviewedLinkInventorySha256,
    sourceMutantsExecuted: 0,
    sourceMutantsKilled: 0,
    rows,
    outcome,
  });
}

export function validateV0MutationEvidenceRows(
  candidate: unknown,
  expected: V0MutationEvidence,
): V0EvidenceFinding[] {
  if (!isRecord(candidate) || !Array.isArray(candidate["rows"])) {
    return [finding(
      "V0_EVIDENCE_MUTATION_AUDIT",
      "mutationEvidence",
      "Mutation evidence and rows are required.",
    )];
  }
  const findings: V0EvidenceFinding[] = [];
  const entries = candidate["rows"].flatMap((row): Array<[string, unknown]> =>
    isRecord(row) && typeof row["controlId"] === "string"
      ? [[row["controlId"], row]]
      : []
  );
  const candidateRows = new Map(entries);
  for (const row of expected.rows) {
    if (stableV0EvidenceJson(candidateRows.get(row.controlId)) !==
      stableV0EvidenceJson(row)) {
      findings.push(finding(
        "V0_EVIDENCE_MUTATION_ROW",
        `mutationEvidence.rows#${row.controlId}`,
        "Stored control evidence differs from recomputed counterfactual and fixture bindings.",
      ));
    }
  }
  const candidateHeader = Object.fromEntries(
    Object.entries(candidate).filter(([key]) => key !== "rows"),
  );
  const expectedHeader = Object.fromEntries(
    Object.entries(expected).filter(([key]) => key !== "rows"),
  );
  if (
    entries.length !== expected.rows.length ||
    candidateRows.size !== expected.rows.length ||
    stableV0EvidenceJson(candidateHeader) !== stableV0EvidenceJson(expectedHeader)
  ) {
    findings.push(finding(
      "V0_EVIDENCE_MUTATION_INVENTORY",
      "mutationEvidence",
      "Mutation evidence inventory or summary is not exact.",
    ));
  }
  return sortFindings(findings);
}

export type V0TraceEvidence = Readonly<{
  traceId: string;
  requirement: string;
  parentClaimIds: readonly string[];
  sourceRefs: readonly string[];
  matrixRef: string | null;
  requiredCaseIds: readonly string[];
  requiredMutationControlIds: readonly string[];
  requiredAuthorityIds: readonly string[];
  caseEvidence: readonly Readonly<{
    caseId: string;
    fixturePath: string;
    fixtureRecordSha256: string;
    observationSha256: string;
    producerFile: string;
    producerTestcase: string;
  }>[];
  mutationEvidence: readonly Readonly<{
    controlId: string;
    observationSha256: string;
  }>[];
  authorityEvidence: readonly Readonly<{
    authorityId: string;
    fixturePath: "tests/fixtures/voicing/provenance-ledger.json";
    authorityRecordSha256: string;
  }>[];
  testFiles: readonly string[];
  evidencePaths: readonly string[];
  observedTests: number;
  outcome: Outcome;
}>;

function traceRows(): readonly JsonRecord[] {
  return records((traceFixture as unknown as JsonRecord)["traces"]);
}

function parentClaimMap(): ReadonlyMap<string, JsonRecord> {
  return new Map(records(
    (traceFixture as unknown as JsonRecord)["parentClaims"],
  ).flatMap((row): Array<[string, JsonRecord]> =>
    typeof row["id"] === "string" ? [[row["id"], row]] : []
  ));
}

function authorityMap(): ReadonlyMap<string, JsonRecord> {
  return new Map(records(
    (provenanceFixture as unknown as JsonRecord)["authorities"],
  ).flatMap((row): Array<[string, JsonRecord]> =>
    typeof row["id"] === "string" ? [[row["id"], row]] : []
  ));
}

function producerPresent(
  summary: V0JUnitSummary,
  producer: V0Producer,
): boolean {
  return summary.cases.some(({ file, name }) =>
    file === producer.file && name === producer.testcase
  );
}

export function buildV0TraceEvidence(
  observations: readonly JsonRecord[],
  caseBindings = buildV0CaseBindings(),
  summary: V0JUnitSummary = {
    tests: 0,
    assertions: 0,
    failures: 0,
    errors: 0,
    skipped: 0,
    files: [],
    cases: [],
  },
  suiteOutcome: Outcome = "pass",
): V0TraceEvidence[] {
  const bindings = new Map(caseBindings.map((row) => [row.caseId, row]));
  const cases = observationCaseDigests(observations);
  const mutation = observationBySchema(observations, V0_MUTATION_SCHEMA) ?? {};
  const controls = digestMap(mutation["controlExecutionDigests"]);
  const parents = parentClaimMap();
  const authorities = authorityMap();
  const production = observationBySchema(observations, V0_PRODUCTION_SCHEMA);
  const allProducersPresent = [
    V0_PRODUCTION_PRODUCER,
    V0_MUTATION_PRODUCER,
    V0_STATIC_PRODUCER,
  ].every((producer) => producerPresent(summary, producer));
  return traceRows().flatMap((trace): V0TraceEvidence[] => {
    const traceId = trace["id"];
    if (typeof traceId !== "string") return [];
    const parentClaimIds = strings(trace["parentClaimIds"]);
    const requiredCaseIds = strings(trace["caseIds"]);
    const requiredMutationControlIds = strings(trace["mutationControlIds"]);
    const requiredAuthorityIds = strings(trace["authorityIds"]);
    const parentRows = parentClaimIds.flatMap((id) => {
      const row = parents.get(id);
      return row === undefined ? [] : [row];
    });
    const requirement = parentRows.map((row) =>
      typeof row["text"] === "string" ? row["text"] : ""
    )
      .join(" ");
    const sourceRefs = parentRows.map((row) =>
      typeof row["source"] === "string" ? row["source"] : ""
    );
    const caseEvidence = requiredCaseIds.flatMap((caseId) => {
      const binding = bindings.get(caseId);
      const observed = cases.get(caseId);
      if (
        binding === undefined ||
        observed === undefined ||
        !isSha256(observed.digest)
      ) return [];
      return [{
        caseId,
        fixturePath: binding.fixturePath,
        fixtureRecordSha256: binding.fixtureRecordSha256,
        observationSha256: observed.digest,
        producerFile: observed.producer.file,
        producerTestcase: observed.producer.testcase,
      }];
    });
    const mutationEvidence = requiredMutationControlIds.flatMap((controlId) => {
      const digest = controls.get(controlId);
      return digest === undefined ? [] : [{ controlId, observationSha256: digest }];
    });
    const authorityEvidence = requiredAuthorityIds.flatMap((authorityId) => {
      const row = authorities.get(authorityId);
      return row === undefined
        ? []
        : [{
            authorityId,
            fixturePath:
              "tests/fixtures/voicing/provenance-ledger.json" as const,
            authorityRecordSha256: v0EvidenceDigest(row),
          }];
    });
    const matrixRef = typeof trace["matrixRef"] === "string"
      ? trace["matrixRef"]
      : null;
    const matrixProved = matrixRef === null ||
      (production !== undefined &&
        numericField(production, "availabilityCellsObserved") ===
          V0_EXPECTED_COUNTS.availabilityCells);
    const outcome: Outcome =
      suiteOutcome === "pass" &&
        allProducersPresent &&
        parentRows.length === parentClaimIds.length &&
        caseEvidence.length === requiredCaseIds.length &&
        mutationEvidence.length === requiredMutationControlIds.length &&
        authorityEvidence.length === requiredAuthorityIds.length &&
        matrixProved
        ? "pass"
        : "fail";
    return [Object.freeze({
      traceId,
      requirement,
      parentClaimIds,
      sourceRefs,
      matrixRef,
      requiredCaseIds,
      requiredMutationControlIds,
      requiredAuthorityIds,
      caseEvidence,
      mutationEvidence,
      authorityEvidence,
      testFiles: [...new Set([
        ...caseEvidence.map(({ producerFile }) => producerFile),
        ...(requiredMutationControlIds.length === 0
          ? []
          : [V0_MUTATION_PRODUCER.file]),
      ])].sort(compare),
      evidencePaths: [...new Set([
        ...caseEvidence.map(({ fixturePath }) => fixturePath),
        ...(requiredMutationControlIds.length === 0
          ? []
          : ["tests/fixtures/voicing/mutation-controls.json"]),
        ...(requiredAuthorityIds.length === 0
          ? []
          : ["tests/fixtures/voicing/provenance-ledger.json"]),
      ])].sort(compare),
      observedTests: summary.tests,
      outcome,
    })];
  });
}

export function validateV0TraceEvidenceRows(
  candidate: unknown,
  expected: readonly V0TraceEvidence[],
): V0EvidenceFinding[] {
  if (!Array.isArray(candidate)) {
    return [finding(
      "V0_EVIDENCE_TRACE_INVENTORY",
      "traces",
      "Trace evidence must be an array.",
    )];
  }
  const entries = candidate.flatMap((row): Array<[string, unknown]> =>
    isRecord(row) && typeof row["traceId"] === "string"
      ? [[row["traceId"], row]]
      : []
  );
  const rows = new Map(entries);
  const findings: V0EvidenceFinding[] = [];
  for (const expectedRow of expected) {
    if (stableV0EvidenceJson(rows.get(expectedRow.traceId)) !==
      stableV0EvidenceJson(expectedRow)) {
      findings.push(finding(
        "V0_EVIDENCE_TRACE_ROW",
        `traces#${expectedRow.traceId}`,
        "Stored trace differs from recomputed fixture, observation, mutation, authority, or JUnit evidence.",
        expectedRow.traceId,
      ));
    }
  }
  if (
    entries.length !== expected.length ||
    rows.size !== expected.length ||
    expected.length !== V0_EXPECTED_COUNTS.traces
  ) {
    findings.push(finding(
      "V0_EVIDENCE_TRACE_INVENTORY",
      "traces",
      "Trace evidence must contain the exact 15 unique V0 trace rows.",
    ));
  }
  return sortFindings(findings);
}

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

async function expandPattern(pattern: string): Promise<string[]> {
  if (!pattern.includes("*")) {
    return await Bun.file(pattern).exists() ? [pattern] : [];
  }
  const paths: string[] = [];
  for await (const filePath of new Bun.Glob(pattern).scan({
    cwd: process.cwd(),
    dot: true,
    onlyFiles: true,
  })) {
    paths.push(filePath.replaceAll("\\", "/"));
  }
  return paths.sort(compare);
}

export async function snapshotV0EvidenceInputs(): Promise<Readonly<{
  snapshot: InputSnapshot;
  findings: readonly V0EvidenceFinding[];
  controls: readonly V0EvidenceFinding[];
}>> {
  const findings: V0EvidenceFinding[] = [];
  const controls: V0EvidenceFinding[] = [];
  const paths = new Map<string, string>();
  for (const [group, patterns] of Object.entries(V0_INPUT_GROUPS)) {
    for (const pattern of patterns) {
      const matches = await expandPattern(pattern);
      if (matches.length === 0) {
        findings.push(finding(
          "V0_EVIDENCE_INPUT_MISSING",
          pattern,
          `Required ${group} input is missing.`,
        ));
      }
      for (const filePath of matches) {
        const previous = paths.get(filePath);
        if (previous === undefined) paths.set(filePath, group);
        else {
          findings.push(finding(
            "V0_EVIDENCE_INPUT_DUPLICATE",
            filePath,
            `Input belongs to both ${previous} and ${group}.`,
          ));
        }
      }
    }
  }
  const components: InputComponent[] = [];
  for (const [filePath, group] of [...paths].sort(([left], [right]) =>
    compare(left, right)
  )) {
    const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
    components.push(Object.freeze({
      group,
      path: filePath,
      bytes: bytes.byteLength,
      sha256: await sha256Hex(bytes),
    }));
    const source = new TextDecoder().decode(bytes);
    const imported = FIXTURE_VALUES.find(({ path }) => path === filePath);
    if (imported !== undefined) {
      try {
        const parsed: unknown = JSON.parse(source);
        if (stableV0EvidenceJson(parsed) !== stableV0EvidenceJson(imported.value)) {
          findings.push(finding(
            "V0_EVIDENCE_FIXTURE_IMPORT_DRIFT",
            filePath,
            "Fixture bytes differ from the module snapshot used by the verifier.",
          ));
        }
      } catch (error) {
        findings.push(finding(
          "V0_EVIDENCE_FIXTURE_IMPORT_DRIFT",
          filePath,
          error instanceof Error ? error.message : "Fixture JSON is invalid.",
        ));
      }
    }
    if (group === "tests") {
      controls.push(...inspectV0TestControls(filePath, source));
    }
    if (filePath === "bunfig.toml" && !/^retry\s*=\s*0\s*$/mu.test(source)) {
      controls.push(finding(
        "V0_EVIDENCE_RETRY",
        filePath,
        "Focused evidence requires [test] retry = 0.",
      ));
    }
  }
  const snapshot: InputSnapshot = Object.freeze({
    algorithm: "sha256-component-manifest-v1",
    digest: v0EvidenceDigest(components),
    components,
  });
  return {
    snapshot,
    findings: sortFindings(findings),
    controls: sortFindings(controls),
  };
}

type ProcessResourceUsage = Readonly<{
  measurement: "Bun.Subprocess.resourceUsage";
  maxRssRaw: number | null;
  maxRssRawUnit: "bytes" | "kilobytes" | "runtime-defined";
  maxRssBytes: number | null;
  cpuUserMicros: number | null;
  cpuSystemMicros: number | null;
  gating: false;
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
  resourceUsage: ProcessResourceUsage;
}>;

export function v0EvidenceRunId(inputDigest: string): string {
  return v0EvidenceDigest({
    toolVersion: TOOL_VERSION,
    inputDigest,
    contractVersion: (contractFixture as { fixtureVersion: string })
      .fixtureVersion,
  }).slice(0, 24);
}

export function v0EvidencePaths(runId: string): Readonly<{
  directory: string;
  junitPath: string;
  stdoutPath: string;
  stderrPath: string;
  validatorStdoutPath: string;
  validatorStderrPath: string;
  metadataPath: string;
}> {
  const directory = `test-results/v0-evidence-runs/${runId}`;
  return Object.freeze({
    directory,
    junitPath: `${directory}/focused-tests.junit.xml`,
    stdoutPath: `${directory}/focused-tests.stdout.txt`,
    stderrPath: `${directory}/focused-tests.stderr.txt`,
    validatorStdoutPath: `${directory}/contract-validator.stdout.json`,
    validatorStderrPath: `${directory}/contract-validator.stderr.txt`,
    metadataPath: `${directory}/run-metadata.json`,
  });
}

function runEnvironment(
  runId: string,
  compilerNodePath: string,
): Readonly<Record<string, string>> {
  return Object.freeze({
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    JCPE_NODE: compilerNodePath,
    NODE_BINARY: "",
    PATH: "",
    HOME: "",
    TMPDIR: "/tmp",
    V0_EVIDENCE_RUN_ID: runId,
  });
}

function validatorCommand(): readonly string[] {
  return ["bun", "scripts/validate-v0-contract.ts"];
}

export function focusedV0SuiteCommand(runId: string): readonly string[] {
  return [
    "bun",
    "test",
    ...V0_FOCUSED_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--reporter=junit",
    `--reporter-outfile=${v0EvidencePaths(runId).junitPath}`,
  ];
}

function safeUsageNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (
    typeof value === "bigint" &&
    value >= 0n &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) return Number(value);
  return null;
}

async function runRaw(
  command: readonly string[],
  environment: Readonly<Record<string, string>>,
  stdoutPath: string,
  stderrPath: string,
): Promise<RawExecution & Readonly<{
  stdout: Uint8Array;
  stderr: Uint8Array;
}>> {
  const started = performance.now();
  const child = Bun.spawn({
    cmd: [process.execPath, ...command.slice(1)],
    cwd: process.cwd(),
    env: { ...environment },
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
    ? "kilobytes" as const
    : platform() === "darwin"
      ? "bytes" as const
      : "runtime-defined" as const;
  const maxRssBytes = maxRssRaw === null
    ? null
    : maxRssRawUnit === "kilobytes"
      ? maxRssRaw * 1_024
      : maxRssRawUnit === "bytes"
        ? maxRssRaw
        : null;
  return Object.freeze({
    command,
    environment,
    stdoutPath,
    stderrPath,
    stdoutSha256: await sha256Hex(stdout),
    stderrSha256: await sha256Hex(stderr),
    exitCode,
    signal: child.signalCode,
    elapsedMs: Math.round((performance.now() - started) * 1_000) / 1_000,
    resourceUsage: Object.freeze({
      measurement: "Bun.Subprocess.resourceUsage",
      maxRssRaw,
      maxRssRawUnit,
      maxRssBytes,
      cpuUserMicros: safeUsageNumber(usage?.cpuTime.user),
      cpuSystemMicros: safeUsageNumber(usage?.cpuTime.system),
      gating: false,
    }),
    stdout,
    stderr,
  });
}

function withoutBuffers(
  value: RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>,
): RawExecution {
  return Object.freeze({
    command: value.command,
    environment: value.environment,
    stdoutPath: value.stdoutPath,
    stderrPath: value.stderrPath,
    stdoutSha256: value.stdoutSha256,
    stderrSha256: value.stderrSha256,
    exitCode: value.exitCode,
    signal: value.signal,
    elapsedMs: value.elapsedMs,
    resourceUsage: value.resourceUsage,
  });
}

function parseJsonBytes(bytes: Uint8Array): JsonRecord {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function validatorCounts(value: JsonRecord): Readonly<Record<string, number>> {
  if (!isRecord(value["counts"])) return {};
  return Object.fromEntries(Object.entries(value["counts"]).flatMap(
    ([key, item]) => typeof item === "number" ? [[key, item]] : [],
  ));
}

function inspectValidatorValue(value: JsonRecord): V0EvidenceFinding[] {
  const findings: V0EvidenceFinding[] = [];
  if (
    value["schema"] !== "changes.validation.v0-contract.v1" ||
    value["package"] !== "V0" ||
    value["outcome"] !== "pass" ||
    !Array.isArray(value["findings"]) ||
    value["findings"].length !== 0
  ) {
    findings.push(finding(
      "V0_EVIDENCE_VALIDATOR",
      "validator",
      "V0 contract validator must emit the exact passing schema with no findings.",
    ));
  }
  const counts = validatorCounts(value);
  if (stableV0EvidenceJson(counts) !== stableV0EvidenceJson(V0_VALIDATOR_COUNTS)) {
    findings.push(finding(
      "V0_EVIDENCE_VALIDATOR_COUNTS",
      "validator.counts",
      "V0 validator counts differ from the reviewed evidence inventory.",
    ));
  }
  return findings;
}

async function environmentEvidence(
  compilerNode: Awaited<ReturnType<typeof findRealNode>>,
): Promise<JsonRecord> {
  const processors = cpus();
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const compilerNodeBytes = new Uint8Array(
    await Bun.file(compilerNode.path).arrayBuffer(),
  );
  return {
    bun: Bun.version,
    nodeCompatibility: process.versions.node,
    compilerNodePath: compilerNode.path,
    compilerNodeVersion: compilerNode.version,
    compilerNodeMajor: compilerNode.major,
    compilerNodeBytes: compilerNodeBytes.byteLength,
    compilerNodeSha256: await sha256Hex(compilerNodeBytes),
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

function packageVersions(
  compilerNode: Awaited<ReturnType<typeof findRealNode>>,
): readonly Readonly<{ name: string; version: string }>[] {
  return expectedPackageVersions(
    Bun.version,
    compilerNode.version,
    process.versions.node,
  );
}

function expectedPackageVersions(
  bunVersion: string,
  compilerNodeVersion: string,
  nodeCompatibilityVersion: string,
): readonly Readonly<{ name: string; version: string }>[] {
  const packageValue: unknown = packageFixture;
  const versions = new Map<string, string>();
  if (isRecord(packageValue)) {
    for (const field of ["dependencies", "devDependencies"] as const) {
      const dependencies = packageValue[field];
      if (!isRecord(dependencies)) continue;
      for (const [name, version] of Object.entries(dependencies)) {
        if (typeof version === "string") versions.set(name, version);
      }
    }
  }
  versions.set("bun", bunVersion);
  versions.set("compiler-node", compilerNodeVersion);
  versions.set("node-compatibility", nodeCompatibilityVersion);
  return [...versions].sort(([left], [right]) => compare(left, right))
    .map(([name, version]) => Object.freeze({ name, version }));
}

function expectedTranspositionFullResultSetAudit(
  caseId: string,
  applicability: unknown,
): JsonRecord | null {
  if (
    applicability !== "generated-candidate" &&
    applicability !== "stored-bypass" &&
    applicability !== "refusal"
  ) {
    return null;
  }
  const generated = applicability === "generated-candidate";
  const normalizedRange = generated && caseId === "V0-TRANS-017";
  return {
    applicability,
    independentGeneratedResultAudit: generated
      ? expectedGeneratedCompleteResultAudit()
      : null,
    rawOrdinalTranspositionScope: generated
      ? normalizedRange ? "normalized-range" : "root-local"
      : "not-applicable",
    comparisonScope: generated
      ? normalizedRange
        ? "complete-ordered-list"
        : "shared-inverse-transposed-subsequence"
      : "not-applicable",
    candidateListApplicable: generated,
    completeCandidateListAudited: generated,
    candidateCardinalityClass: generated
      ? "nonempty-bounded"
      : "zero-not-applicable",
    allCandidateShapesAccepted: true,
    allCandidateIdentitiesAccepted: true,
    allCandidateRangesAccepted: true,
    allCandidateFamiliesAccepted: true,
    allCandidateRealizationsAccepted: true,
    allCandidateTemplatesAccepted: true,
    allCandidateBassSemanticsAccepted: true,
    allCandidateProvenanceAccepted: true,
    allCandidateForwardTranspositionsAccepted: true,
    allCandidateInverseTranspositionsAccepted: true,
    candidatesStrictlyOrdered: true,
    candidateIdentityKeysUnique: true,
    candidateIdsAndOrdinalsAligned: true,
    allCandidateRawOrdinalsAccepted: true,
    candidateRawOrdinalsUnique: true,
    cardinalityInvariantAcrossRoots: true,
    orderedIdentityInvariantAcrossRoots: true,
    sharedOrderedIdentityInvariantAcrossRoots: true,
    completeOrderedIdentityInvariantAcrossRoots: normalizedRange ? true : null,
    normalizedRangeRawCountInvariantAcrossRoots: normalizedRange ? true : null,
    normalizedRangeRetainedCountInvariantAcrossRoots: normalizedRange
      ? true
      : null,
    normalizedRangeSelectedRawOrdinalInvariantAcrossRoots: normalizedRange
      ? true
      : null,
    normalizedRangeSelectedRetainedOrdinalInvariantAcrossRoots:
      normalizedRange ? true : null,
  };
}

function transpositionFullResultSetAuditAccepted(
  cell: JsonRecord,
  caseId: string,
  applicability: unknown,
): boolean {
  const expected = expectedTranspositionFullResultSetAudit(
    caseId,
    applicability,
  );
  return expected !== null && isRecord(cell["fullResultSetAudit"]) &&
    stableV0EvidenceJson(cell["fullResultSetAudit"]) ===
      stableV0EvidenceJson(expected);
}

function expectedGeneratedCompleteResultAudit(): JsonRecord | null {
  const root = lawFixture as unknown as JsonRecord;
  if (!isRecord(root["lawProofPolicy"])) return null;
  const ids = root["lawProofPolicy"]["completeResultAuditCheckIds"];
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    return null;
  }
  return {
    scope: "complete-generated-result-set",
    candidateCountWithinInclusiveBounds: true,
    auditedCandidateCountMatchesReturnedCount: true,
    checkCount: ids.length,
    checks: ids.map((id) => ({ id, accepted: true })),
  };
}

function generatedCompleteResultAuditAccepted(projection: JsonRecord): boolean {
  const expected = expectedGeneratedCompleteResultAudit();
  return expected !== null && isRecord(projection["completeResultAudit"]) &&
    stableV0EvidenceJson(projection["completeResultAudit"]) ===
      stableV0EvidenceJson(expected);
}

function semanticResourceEvidence(
  observations: readonly JsonRecord[],
): JsonRecord {
  const contract = contractFixture as unknown as JsonRecord;
  const production = observationBySchema(observations, V0_PRODUCTION_SCHEMA) ?? {};
  const workLimits = isRecord(contract["workLimits"])
    ? contract["workLimits"]
    : {};
  const memoryLimits = isRecord(contract["memoryLimits"])
    ? contract["memoryLimits"]
    : {};
  const caseDigests = digestMap(production["caseObservationDigests"]);
  const exactKeys = (value: JsonRecord, expected: readonly string[]): boolean =>
    stableV0EvidenceJson(Object.keys(value).sort(compare)) ===
      stableV0EvidenceJson([...expected].sort(compare));
  const boundProjection = (
    row: JsonRecord,
    expectedKeys: readonly string[],
  ): boolean => {
    const caseId = row["caseId"];
    return exactKeys(row, expectedKeys) &&
      typeof caseId === "string" &&
      isRecord(row["actualProjection"]) &&
      row["actualProjection"]["caseId"] === caseId &&
      caseDigests.get(caseId) === v0EvidenceDigest({
        caseId,
        actual: row["actualProjection"],
      });
  };
  const exactInventory = (
    field: string,
    expectedIds: readonly string[],
  ): readonly JsonRecord[] => {
    const raw = production[field];
    if (!Array.isArray(raw)) return [];
    const rows = raw.filter(isRecord);
    const ids = rows.flatMap((row) =>
      typeof row["caseId"] === "string" ? [row["caseId"]] : []
    );
    return rows.length === raw.length &&
        stableV0EvidenceJson(ids) === stableV0EvidenceJson(expectedIds)
      ? rows
      : [];
  };

  const candidateRows = records(
    (candidateFixture as unknown as JsonRecord)["cases"],
  );
  const candidateFixtureMap = new Map(candidateRows.flatMap((row) =>
    typeof row["id"] === "string" ? [[row["id"], row] as const] : []
  ));
  const operationRoot = operationFixture as unknown as JsonRecord;
  const operationRows = [
    ...records(operationRoot["successCases"]),
    ...records(operationRoot["refusalCases"]),
    ...records(operationRoot["precedenceCases"]),
    ...records(operationRoot["notApplicableCases"]),
  ];
  const operationFixtureMap = new Map(operationRows.flatMap((row) =>
    typeof row["id"] === "string" ? [[row["id"], row] as const] : []
  ));
  const transpositionRoot = transpositionFixture as unknown as JsonRecord;
  const transpositionRows = records(transpositionRoot["seeds"]);
  const transpositionFixtureMap = new Map(transpositionRows.flatMap((row) =>
    typeof row["id"] === "string" ? [[row["id"], row] as const] : []
  ));
  const rootIds = records(transpositionRoot["roots"]).flatMap((row) =>
    typeof row["id"] === "string" ? [row["id"]] : []
  );
  const terminationExpectations = new Map<string, Readonly<{
    channel: "candidate" | "operation" | "transposition";
    termination: string;
  }>>();
  for (const row of candidateRows) {
    if (typeof row["id"] !== "string" || !isRecord(row["expected"])) continue;
    const expected = row["expected"];
    const termination = expected["kind"] === "must-contain-candidate"
      ? "complete-generated"
      : expected["termination"];
    if (typeof termination === "string") {
      terminationExpectations.set(row["id"], {
        channel: "candidate",
        termination,
      });
    }
  }
  for (const row of operationRows) {
    if (typeof row["id"] !== "string" || !isRecord(row["expected"])) continue;
    const expected = row["expected"];
    const evidence = isRecord(expected["evidence"])
      ? expected["evidence"]
      : {};
    const termination = expected["evidenceTermination"] ??
      evidence["termination"] ?? expected["termination"] ??
      (row["id"].startsWith("V0-OP-NOT-APPLICABLE-")
        ? "complete-generated"
        : null);
    if (typeof termination === "string") {
      terminationExpectations.set(row["id"], {
        channel: "operation",
        termination,
      });
    }
  }
  for (const row of transpositionRows) {
    if (typeof row["id"] !== "string" || !isRecord(row["sourceOracle"])) continue;
    const termination = row["sourceOracle"]["expectedTermination"];
    if (typeof termination === "string") {
      terminationExpectations.set(row["id"], {
        channel: "transposition",
        termination,
      });
    }
  }
  const expectedTerminationIds = [...terminationExpectations.keys()].sort(compare);
  const terminationRows = exactInventory(
    "terminationObservationRecords",
    expectedTerminationIds,
  );
  const terminations = strings(contract["terminations"]);
  const terminationCounts: Record<string, number> = Object.fromEntries(
    terminations.map((termination) => [termination, 0]),
  );
  let terminationRecordsValid =
    terminationExpectations.size === V0_EXPECTED_COUNTS.candidateCases +
      V0_EXPECTED_COUNTS.operationStateCases +
      V0_EXPECTED_COUNTS.transpositionSeeds &&
    terminationRows.length === expectedTerminationIds.length;
  for (const row of terminationRows) {
    const caseId = typeof row["caseId"] === "string" ? row["caseId"] : "";
    const expectation = terminationExpectations.get(caseId);
    const projection = isRecord(row["actualProjection"])
      ? row["actualProjection"]
      : {};
    if (
      expectation === undefined ||
      row["channel"] !== expectation.channel ||
      !boundProjection(row, ["actualProjection", "caseId", "channel"])
    ) {
      terminationRecordsValid = false;
      continue;
    }
    if (expectation.channel !== "transposition") {
      const fixtureRow = expectation.channel === "candidate"
        ? candidateFixtureMap.get(caseId)
        : operationFixtureMap.get(caseId);
      const fixtureExpected = fixtureRow !== undefined &&
          isRecord(fixtureRow["expected"])
        ? fixtureRow["expected"]
        : {};
      let projectionShapeValid = false;
      if (expectation.channel === "candidate") {
        if (fixtureExpected["kind"] === "must-contain-candidate") {
          projectionShapeValid = projection["ok"] === true &&
            projection["kind"] === "generated" &&
            generatedCompleteResultAuditAccepted(projection);
        } else if (fixtureExpected["kind"] === "stored-bypass") {
          projectionShapeValid = projection["ok"] === true &&
            projection["kind"] === "stored-bypass";
        } else if (fixtureExpected["kind"] === "refusal") {
          projectionShapeValid = projection["ok"] === false &&
            projection["code"] === fixtureExpected["code"];
        }
      } else if (caseId.startsWith("V0-OP-SUCCESS-")) {
        projectionShapeValid = projection["ok"] === true &&
          projection["valueKind"] === fixtureExpected["valueKind"] &&
          (
            !["V0-OP-SUCCESS-001", "V0-OP-SUCCESS-004"].includes(caseId) ||
            generatedCompleteResultAuditAccepted(projection)
          );
      } else if (caseId.startsWith("V0-OP-REFUSAL-")) {
        projectionShapeValid = projection["ok"] === false &&
          stableV0EvidenceJson(projection["refusal"]) ===
            stableV0EvidenceJson(fixtureExpected["refusal"]);
      } else if (caseId.startsWith("V0-OP-PRECEDENCE-")) {
        projectionShapeValid = projection["winningCode"] ===
          fixtureExpected["winningCode"];
      } else if (caseId.startsWith("V0-OP-NOT-APPLICABLE-")) {
        projectionShapeValid = projection["applies"] === false &&
          projection["injectedAmbientFieldIgnored"] === true;
      }
      if (
        projection["termination"] !== expectation.termination ||
        !projectionShapeValid
      ) {
        terminationRecordsValid = false;
      } else {
        terminationCounts[expectation.termination] =
          (terminationCounts[expectation.termination] ?? 0) + 1;
      }
      continue;
    }
    const cells = projection["cells"];
    const transpositionFixtureRow = transpositionFixtureMap.get(caseId);
    const sourceOracle = transpositionFixtureRow !== undefined &&
        isRecord(transpositionFixtureRow["sourceOracle"])
      ? transpositionFixtureRow["sourceOracle"]
      : {};
    const applicability = sourceOracle["applicability"];
    const observedRootIds = Array.isArray(cells)
      ? cells.flatMap((cell) =>
          isRecord(cell) && typeof cell["rootId"] === "string"
            ? [cell["rootId"]]
            : []
        )
      : [];
    if (
      projection["rootCellCount"] !== rootIds.length ||
      !Array.isArray(cells) ||
      cells.length !== rootIds.length ||
      ![
        "generated-candidate",
        "stored-bypass",
        "refusal",
      ].includes(typeof applicability === "string" ? applicability : "") ||
      stableV0EvidenceJson(observedRootIds) !== stableV0EvidenceJson(rootIds) ||
      cells.some((cell) =>
        !isRecord(cell) ||
        cell["termination"] !== expectation.termination ||
        !transpositionFullResultSetAuditAccepted(
          cell,
          caseId,
          applicability,
        ) ||
        (applicability === "generated-candidate"
          ? cell["exactCandidatePresent"] !== true ||
            cell["requestRootObserved"] !== true ||
            cell["forwardProjectionAccepted"] !== true ||
            cell["inverseProjectionRestored"] !== true ||
            cell["inverseRequestProjectionRestored"] !== true
          : applicability === "stored-bypass"
            ? cell["kind"] !== "stored-bypass" ||
              cell["candidateGenerationPerformed"] !== false ||
              cell["sameObjectValue"] !== true ||
              cell["inverseRequestProjectionRestored"] !== true
            : applicability === "refusal"
              ? cell["ok"] !== false ||
                cell["forwardRefusalProjectionAccepted"] !== true ||
                cell["inverseRequestProjectionRestored"] !== true ||
                stableV0EvidenceJson(cell["refusal"]) !==
                  stableV0EvidenceJson(sourceOracle["refusalProjection"])
              : true)
      )
    ) {
      terminationRecordsValid = false;
      continue;
    }
    terminationCounts[expectation.termination] =
      (terminationCounts[expectation.termination] ?? 0) + cells.length;
  }

  const limitRoot = limitFixture as unknown as JsonRecord;
  const counterFixtureRows = records(limitRoot["counterBoundaryCases"]);
  const counterFixtureMap = new Map(counterFixtureRows.flatMap((row) =>
    typeof row["id"] === "string" ? [[row["id"], row] as const] : []
  ));
  const expectedCounterIds = [...counterFixtureMap.keys()].sort(compare);
  const counterRows = exactInventory(
    "counterBoundaryObservationRecords",
    expectedCounterIds,
  );
  const workCounterMaxima: Record<string, number> = {};
  const memoryCounterMaxima: Record<string, number> = {};
  let counterBoundaryRecordsValid =
    counterRows.length === V0_EXPECTED_COUNTS.limitCases - 15 &&
    counterRows.length === counterFixtureRows.length;
  for (const row of counterRows) {
    const caseId = typeof row["caseId"] === "string" ? row["caseId"] : "";
    const fixture = counterFixtureMap.get(caseId);
    const projection = isRecord(row["actualProjection"])
      ? row["actualProjection"]
      : {};
    const expected = fixture !== undefined && isRecord(fixture["expected"])
      ? fixture["expected"]
      : {};
    const boundary = fixture?.["boundary"];
    const maximum = fixture?.["maximum"];
    const counter = fixture?.["counter"];
    const counterKind = fixture?.["counterKind"];
    const exact = boundary === "exact-limit";
    const exactAttempt = isRecord(projection["exactAttempt"])
      ? projection["exactAttempt"]
      : {};
    const plusOneAttempt = isRecord(projection["plusOneAttempt"])
      ? projection["plusOneAttempt"]
      : null;
    const valid = fixture !== undefined &&
      boundProjection(row, ["actualProjection", "caseId"]) &&
      exactKeys(projection, [
        "afterExactValue",
        "afterPlusOneValue",
        "beforeExactValue",
        "boundary",
        "caseId",
        "counter",
        "counterKind",
        "exactAttempt",
        "maximum",
        "plusOneAttempt",
      ]) &&
      projection["counterKind"] === counterKind &&
      projection["counter"] === counter &&
      projection["maximum"] === maximum &&
      projection["boundary"] === boundary &&
      typeof maximum === "number" &&
      projection["beforeExactValue"] === maximum - 1 &&
      exactKeys(exactAttempt, ["ok", "value"]) &&
      exactAttempt["ok"] === true &&
      exactAttempt["value"] === maximum &&
      projection["afterExactValue"] === maximum &&
      (exact
        ? projection["plusOneAttempt"] === null &&
          projection["afterPlusOneValue"] === null
        : plusOneAttempt !== null &&
          exactKeys(plusOneAttempt, ["ok", "refusal"]) &&
          plusOneAttempt["ok"] === false &&
          stableV0EvidenceJson(plusOneAttempt["refusal"]) ===
            stableV0EvidenceJson(expected["refusal"]) &&
          projection["afterPlusOneValue"] === maximum);
    if (!valid || typeof maximum !== "number" ||
      typeof counter !== "string" ||
      (counterKind !== "work" && counterKind !== "memory")) {
      counterBoundaryRecordsValid = false;
      continue;
    }
    const maxima = counterKind === "work"
      ? workCounterMaxima
      : memoryCounterMaxima;
    const prior = maxima[counter];
    if (prior !== undefined && prior !== maximum) {
      counterBoundaryRecordsValid = false;
    }
    maxima[counter] = maximum;
  }

  const storedIds = candidateRows.flatMap((row) =>
    typeof row["id"] === "string" && isRecord(row["expected"]) &&
      row["expected"]["kind"] === "stored-bypass"
      ? [row["id"]]
      : []
  ).sort(compare);
  const storedRows = exactInventory("storedBypassObservationRecords", storedIds);
  const counterNames = [
    ...Object.keys(workLimits),
    ...Object.keys(memoryLimits),
  ];
  const storedBypassZeroCounters = storedRows.length === 2 &&
    storedRows.every((row) => {
      const projection = isRecord(row["actualProjection"])
        ? row["actualProjection"]
        : {};
      const evidence = isRecord(projection["counterEvidence"])
        ? projection["counterEvidence"]
        : {};
      return boundProjection(row, ["actualProjection", "caseId"]) &&
        projection["kind"] === "stored-bypass" &&
        projection["candidateGenerationPerformed"] === false &&
        projection["sameObjectValue"] === true &&
        projection["rawCandidateCount"] === 0 &&
        projection["retainedCandidateCount"] === 0 &&
        projection["allCounters"] === 0 &&
        projection["termination"] === "complete-bypass" &&
        evidence["termination"] === "complete-bypass" &&
        exactKeys(evidence, [...counterNames, "termination"]) &&
        counterNames.every((counter) => evidence[counter] === 0);
    });

  const wallTimeFixtureRows = records(limitRoot["wallTimeCases"]);
  const wallTimeRecord = isRecord(production["wallTimeObservationRecord"])
    ? production["wallTimeObservationRecord"]
    : {};
  const wallTimeProjection = isRecord(wallTimeRecord["actualProjection"])
    ? wallTimeRecord["actualProjection"]
    : {};
  const wallTimeCaseId = wallTimeFixtureRows[0]?.["id"];
  const baselineProjection = isRecord(wallTimeProjection["baselineProjection"])
    ? wallTimeProjection["baselineProjection"]
    : {};
  const perturbedProjection = isRecord(wallTimeProjection["perturbedProjection"])
    ? wallTimeProjection["perturbedProjection"]
    : {};
  const wallProjectionKeys = [
    "candidateCount",
    "counterEvidence",
    "fullResultSemanticDigest",
    "refusal",
    "resultKind",
    "termination",
  ] as const;
  const wallCounterEvidence = isRecord(baselineProjection["counterEvidence"])
    ? baselineProjection["counterEvidence"]
    : {};
  const wallTimeRecordValid = wallTimeFixtureRows.length === 1 &&
    typeof wallTimeCaseId === "string" &&
    wallTimeRecord["caseId"] === wallTimeCaseId &&
    boundProjection(wallTimeRecord, ["actualProjection", "caseId"]) &&
    exactKeys(wallTimeProjection, [
      "baselineProjection",
      "caseId",
      "perturbations",
      "perturbedProjection",
    ]) &&
    stableV0EvidenceJson(wallTimeProjection["perturbations"]) ===
      stableV0EvidenceJson(["Date.now", "Math.random"]) &&
    exactKeys(baselineProjection, wallProjectionKeys) &&
    exactKeys(perturbedProjection, wallProjectionKeys) &&
    stableV0EvidenceJson(baselineProjection) ===
      stableV0EvidenceJson(perturbedProjection) &&
    baselineProjection["termination"] === "complete-generated" &&
    baselineProjection["resultKind"] === "generated" &&
    baselineProjection["refusal"] === null &&
    typeof baselineProjection["candidateCount"] === "number" &&
    Number.isSafeInteger(baselineProjection["candidateCount"]) &&
    baselineProjection["candidateCount"] > 0 &&
    isSha256(baselineProjection["fullResultSemanticDigest"]) &&
    exactKeys(wallCounterEvidence, counterNames) &&
    counterNames.every((counter) =>
      typeof wallCounterEvidence[counter] === "number" &&
      Number.isSafeInteger(wallCounterEvidence[counter]) &&
      wallCounterEvidence[counter] >= 0
    );

  const exactPlusOneLimitsRefuseAtomically =
    counterBoundaryRecordsValid && counterRows.every((row) => {
      const projection = isRecord(row["actualProjection"])
        ? row["actualProjection"]
        : {};
      const maximum = projection["maximum"];
      const exactAttempt = isRecord(projection["exactAttempt"])
        ? projection["exactAttempt"]
        : {};
      const exactTransition = typeof maximum === "number" &&
        projection["beforeExactValue"] === maximum - 1 &&
        exactAttempt["ok"] === true &&
        exactAttempt["value"] === maximum &&
        projection["afterExactValue"] === maximum;
      if (!exactTransition) return false;
      if (projection["boundary"] === "exact-limit") {
        return projection["plusOneAttempt"] === null &&
          projection["afterPlusOneValue"] === null;
      }
      const plusOneAttempt = isRecord(projection["plusOneAttempt"])
        ? projection["plusOneAttempt"]
        : {};
      const refusal = isRecord(plusOneAttempt["refusal"])
        ? plusOneAttempt["refusal"]
        : {};
      return projection["boundary"] === "attempted-limit-plus-one" &&
        plusOneAttempt["ok"] === false &&
        refusal["counter"] === projection["counter"] &&
        refusal["received"] === maximum + 1 &&
        refusal["maximum"] === maximum &&
        refusal["partialResult"] === false &&
        projection["afterPlusOneValue"] === maximum;
    });
  const workWithinCaps = Object.entries(workLimits).every(([key, cap]) =>
    typeof cap === "number" &&
      typeof workCounterMaxima[key] === "number" &&
      Number.isSafeInteger(workCounterMaxima[key]) &&
      workCounterMaxima[key] >= 0 &&
      workCounterMaxima[key] === cap
  );
  const memoryWithinCaps = Object.entries(memoryLimits).every(([key, cap]) =>
    typeof cap === "number" &&
      typeof memoryCounterMaxima[key] === "number" &&
      Number.isSafeInteger(memoryCounterMaxima[key]) &&
      memoryCounterMaxima[key] >= 0 &&
      memoryCounterMaxima[key] === cap
  );
  const allTerminationsObserved = terminations.every((termination) =>
    typeof terminationCounts[termination] === "number" &&
      Number.isSafeInteger(terminationCounts[termination]) &&
      terminationCounts[termination] > 0
  );
  const declaredSummariesMatch =
    stableV0EvidenceJson(production["workCounterMaxima"]) ===
      stableV0EvidenceJson(workCounterMaxima) &&
    stableV0EvidenceJson(production["memoryCounterMaxima"]) ===
      stableV0EvidenceJson(memoryCounterMaxima) &&
    stableV0EvidenceJson(production["terminationCounts"]) ===
      stableV0EvidenceJson(terminationCounts) &&
    production["storedBypassZeroCounters"] === storedBypassZeroCounters &&
    production["exactPlusOneLimitsRefuseAtomically"] ===
      exactPlusOneLimitsRefuseAtomically &&
    production["wallTimeGating"] === !wallTimeRecordValid;
  const pass =
    terminationRecordsValid &&
    counterBoundaryRecordsValid &&
    storedBypassZeroCounters &&
    wallTimeRecordValid &&
    declaredSummariesMatch &&
    Object.keys(workCounterMaxima).length === Object.keys(workLimits).length &&
    Object.keys(memoryCounterMaxima).length === Object.keys(memoryLimits).length &&
    Object.keys(terminationCounts).length === terminations.length &&
    workWithinCaps &&
    memoryWithinCaps &&
    allTerminationsObserved &&
    exactPlusOneLimitsRefuseAtomically;
  return {
    semanticBounds: "deterministic-work-and-record-counts",
    observationRecordCounts: {
      termination: terminationRows.length,
      counterBoundary: counterRows.length,
      storedBypass: storedRows.length,
      wallTime: wallTimeRecordValid ? 1 : 0,
    },
    recordBindingsValid:
      terminationRecordsValid && counterBoundaryRecordsValid &&
      storedBypassZeroCounters && wallTimeRecordValid,
    declaredSummariesMatch,
    workLimits,
    workCounterMaxima,
    workWithinCaps,
    memoryLimits,
    memoryCounterMaxima,
    memoryWithinCaps,
    terminations,
    terminationCounts,
    allTerminationsObserved,
    storedBypassZeroCounters,
    exactPlusOneLimitsRefuseAtomically,
    wallTimeGating: !wallTimeRecordValid,
    outcome: pass ? "pass" : "fail",
  };
}

function inputSnapshotCandidate(
  value: unknown,
  path: string,
  findings: V0EvidenceFinding[],
): InputSnapshot | null {
  if (
    !isRecord(value) ||
    stableV0EvidenceJson(Object.keys(value).sort(compare)) !==
      stableV0EvidenceJson(["algorithm", "components", "digest"]) ||
    value["algorithm"] !== "sha256-component-manifest-v1" ||
    !Array.isArray(value["components"]) ||
    !isSha256(value["digest"])
  ) {
    findings.push(finding(
      "V0_EVIDENCE_INPUT_SHAPE",
      path,
      "Input snapshot requires exact algorithm, digest, and component fields.",
    ));
    return null;
  }
  const components: InputComponent[] = [];
  for (const [index, item] of value["components"].entries()) {
    if (
      !isRecord(item) ||
      typeof item["group"] !== "string" ||
      typeof item["path"] !== "string" ||
      typeof item["bytes"] !== "number" ||
      !Number.isSafeInteger(item["bytes"]) ||
      item["bytes"] < 0 ||
      !isSha256(item["sha256"]) ||
      stableV0EvidenceJson(Object.keys(item).sort(compare)) !==
        stableV0EvidenceJson(["bytes", "group", "path", "sha256"])
    ) {
      findings.push(finding(
        "V0_EVIDENCE_INPUT_COMPONENT",
        `${path}.components[${String(index)}]`,
        "Input component is malformed.",
      ));
      continue;
    }
    components.push({
      group: item["group"],
      path: item["path"],
      bytes: item["bytes"],
      sha256: item["sha256"],
    });
  }
  const componentPaths = components.map(({ path: componentPath }) =>
    componentPath
  );
  if (
    components.length !== value["components"].length ||
    new Set(componentPaths).size !== componentPaths.length ||
    stableV0EvidenceJson(componentPaths) !==
      stableV0EvidenceJson([...componentPaths].sort(compare)) ||
    componentPaths.some((componentPath) =>
      componentPath.startsWith("test-results/") ||
      componentPath.includes("../") ||
      componentPath.startsWith("/")
    ) ||
    value["digest"] !== v0EvidenceDigest(components)
  ) {
    findings.push(finding(
      "V0_EVIDENCE_INPUT_MANIFEST",
      path,
      "Input component manifest must be unique, sorted, source-relative, output-free, and digest-bound.",
    ));
  }
  return {
    algorithm: "sha256-component-manifest-v1",
    digest: value["digest"],
    components,
  };
}

function junitSummaryFromSuite(value: JsonRecord): V0JUnitSummary {
  return {
    tests: typeof value["tests"] === "number" ? value["tests"] : 0,
    assertions: typeof value["assertions"] === "number"
      ? value["assertions"]
      : 0,
    failures: typeof value["failures"] === "number" ? value["failures"] : 0,
    errors: typeof value["errors"] === "number" ? value["errors"] : 0,
    skipped: typeof value["skipped"] === "number" ? value["skipped"] : 0,
    files: strings(value["files"]),
    cases: records(value["cases"]).flatMap((row) =>
      typeof row["file"] === "string" && typeof row["name"] === "string"
        ? [{ file: row["file"], name: row["name"] }]
        : []
    ),
  };
}

function validateExecutionShape(
  value: unknown,
  path: string,
  findings: V0EvidenceFinding[],
): JsonRecord | null {
  if (!isRecord(value)) {
    findings.push(finding(
      "V0_EVIDENCE_EXECUTION_SHAPE",
      path,
      "Execution record is required.",
    ));
    return null;
  }
  const usage = value["resourceUsage"];
  const commonFields = [
    "command",
    "elapsedMs",
    "environment",
    "exitCode",
    "resourceUsage",
    "signal",
    "stderrPath",
    "stderrSha256",
    "stdoutPath",
    "stdoutSha256",
  ];
  const specializedFields = path === "validator"
    ? ["counts", "findings", "outcome", "schema"]
    : [
        "assertions",
        "cases",
        "errors",
        "expectedFailures",
        "failures",
        "files",
        "junitPath",
        "junitSha256",
        "quarantined",
        "retries",
        "skipped",
        "tests",
        "todos",
      ];
  const safeUsage = (item: unknown): boolean => item === null ||
    (typeof item === "number" && Number.isSafeInteger(item) && item >= 0);
  const usageFields = [
    "cpuSystemMicros",
    "cpuUserMicros",
    "gating",
    "maxRssBytes",
    "maxRssRaw",
    "maxRssRawUnit",
    "measurement",
  ];
  const usageShapeValid = isRecord(usage) &&
    stableV0EvidenceJson(Object.keys(usage).sort(compare)) ===
      stableV0EvidenceJson(usageFields) &&
    usage["measurement"] === "Bun.Subprocess.resourceUsage" &&
    usage["gating"] === false &&
    safeUsage(usage["maxRssRaw"]) &&
    safeUsage(usage["maxRssBytes"]) &&
    safeUsage(usage["cpuUserMicros"]) &&
    safeUsage(usage["cpuSystemMicros"]) &&
    ["bytes", "kilobytes", "runtime-defined"].includes(
      typeof usage["maxRssRawUnit"] === "string"
        ? usage["maxRssRawUnit"]
        : "",
    ) &&
    (usage["maxRssRaw"] === null
      ? usage["maxRssBytes"] === null
      : usage["maxRssRawUnit"] === "kilobytes"
        ? usage["maxRssBytes"] === Number(usage["maxRssRaw"]) * 1_024
        : usage["maxRssRawUnit"] === "bytes"
          ? usage["maxRssBytes"] === usage["maxRssRaw"]
          : usage["maxRssBytes"] === null);
  if (
    stableV0EvidenceJson(Object.keys(value).sort(compare)) !==
      stableV0EvidenceJson([...commonFields, ...specializedFields].sort(compare)) ||
    !Array.isArray(value["command"]) ||
    value["command"].length === 0 ||
    !value["command"].every((item) => typeof item === "string") ||
    !isRecord(value["environment"]) ||
    typeof value["stdoutPath"] !== "string" || value["stdoutPath"].length === 0 ||
    typeof value["stderrPath"] !== "string" || value["stderrPath"].length === 0 ||
    !isSha256(value["stdoutSha256"]) ||
    !isSha256(value["stderrSha256"]) ||
    typeof value["exitCode"] !== "number" ||
    !Number.isSafeInteger(value["exitCode"]) ||
    value["exitCode"] < 0 ||
    (value["signal"] !== null && typeof value["signal"] !== "string" &&
      (typeof value["signal"] !== "number" ||
        !Number.isSafeInteger(value["signal"]))) ||
    typeof value["elapsedMs"] !== "number" ||
    !Number.isFinite(value["elapsedMs"]) ||
    value["elapsedMs"] < 0 ||
    !usageShapeValid
  ) {
    findings.push(finding(
      "V0_EVIDENCE_EXECUTION_SHAPE",
      path,
      "Execution record must bind command, environment, raw paths/hashes, exit, elapsed time, and non-gating resource usage.",
    ));
  }
  return value;
}

function ledgerEnvironmentAccepted(value: unknown): value is JsonRecord {
  if (!isRecord(value)) return false;
  const processors = cpus();
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const exactFields = [
    "architecture",
    "bun",
    "compilerNodeBytes",
    "compilerNodeMajor",
    "compilerNodePath",
    "compilerNodeSha256",
    "compilerNodeVersion",
    "cpuCount",
    "cpuModel",
    "locale",
    "nodeCompatibility",
    "platform",
    "release",
    "timeZone",
    "totalMemoryBytes",
  ];
  const major = value["compilerNodeMajor"];
  const compilerVersion = value["compilerNodeVersion"];
  return stableV0EvidenceJson(Object.keys(value).sort(compare)) ===
      stableV0EvidenceJson(exactFields) &&
    value["bun"] === Bun.version &&
    value["nodeCompatibility"] === process.versions.node &&
    typeof value["compilerNodePath"] === "string" &&
    value["compilerNodePath"].length > 0 &&
    typeof compilerVersion === "string" &&
    typeof major === "number" &&
    Number.isSafeInteger(major) &&
    [22, 24, 26].includes(major) &&
    compilerVersion.startsWith(`${String(major)}.`) &&
    typeof value["compilerNodeBytes"] === "number" &&
    Number.isSafeInteger(value["compilerNodeBytes"]) &&
    value["compilerNodeBytes"] > 0 &&
    isSha256(value["compilerNodeSha256"]) &&
    value["platform"] === platform() &&
    value["architecture"] === process.arch &&
    value["release"] === release() &&
    value["cpuCount"] === processors.length &&
    value["cpuModel"] === (processors[0]?.model ?? "unavailable") &&
    value["totalMemoryBytes"] === totalmem() &&
    value["locale"] === resolved.locale &&
    value["timeZone"] === resolved.timeZone;
}

function ledgerVersionsAccepted(
  value: unknown,
  environment: JsonRecord,
): boolean {
  const bunVersion = environment["bun"];
  const compilerNodeVersion = environment["compilerNodeVersion"];
  const nodeCompatibilityVersion = environment["nodeCompatibility"];
  return typeof bunVersion === "string" &&
    typeof compilerNodeVersion === "string" &&
    typeof nodeCompatibilityVersion === "string" &&
    stableV0EvidenceJson(value) === stableV0EvidenceJson(
      expectedPackageVersions(
        bunVersion,
        compilerNodeVersion,
        nodeCompatibilityVersion,
      ),
    );
}

export function validateV0EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): V0EvidenceFinding[] {
  if (!isRecord(candidate)) {
    return [finding(
      "V0_EVIDENCE_LEDGER_SHAPE",
      OUTPUT_PATH,
      "V0 evidence ledger must be an object.",
    )];
  }
  const findings: V0EvidenceFinding[] = [];
  const ledgerFields = [
    "applicability",
    "artifact",
    "browserVersions",
    "caseBindings",
    "contractSchema",
    "contractVersion",
    "environment",
    "findings",
    "fixtureBindings",
    "input",
    "mode",
    "mutationEvidence",
    "observations",
    "outcome",
    "package",
    "reviewedCounts",
    "runId",
    "runMetadata",
    "schema",
    "schemaVersion",
    "semanticDigest",
    "semanticResourceEvidence",
    "suite",
    "terminationEvidence",
    "toolVersion",
    "traceId",
    "traces",
    "validator",
    "versions",
  ];
  if (stableV0EvidenceJson(Object.keys(candidate).sort(compare)) !==
    stableV0EvidenceJson(ledgerFields)) {
    findings.push(finding(
      "V0_EVIDENCE_LEDGER_SHAPE",
      OUTPUT_PATH,
      "Ledger must use the exact reviewed top-level schema; unknown, missing, or extension fields are forbidden.",
    ));
  }
  if (
    candidate["schema"] !== "changes.evidence.v0.v1" ||
    candidate["schemaVersion"] !== 1 ||
    candidate["package"] !== "V0" ||
    candidate["traceId"] !== "V0" ||
    candidate["toolVersion"] !== TOOL_VERSION ||
    candidate["mode"] !== "focused-package"
  ) {
    findings.push(finding(
      "V0_EVIDENCE_LEDGER_IDENTITY",
      OUTPUT_PATH,
      "Ledger identity, schema, tool, package, trace, or mode is invalid.",
    ));
  }
  if (
    candidate["contractSchema"] !==
      (contractFixture as { schema: string }).schema ||
    candidate["contractVersion"] !==
      (contractFixture as { fixtureVersion: string }).fixtureVersion
  ) {
    findings.push(finding(
      "V0_EVIDENCE_CONTRACT_BINDING",
      "contractSchema",
      "Ledger contract schema and version must exactly match the reviewed V0 contract fixture included in the input snapshot.",
    ));
  }
  const input = candidate["input"];
  if (
    !isRecord(input) ||
    stableV0EvidenceJson(Object.keys(input).sort(compare)) !==
      stableV0EvidenceJson(["post", "pre"])
  ) {
    findings.push(finding(
      "V0_EVIDENCE_INPUT_SHAPE",
      "input",
      "Input record must contain only the exact pre and post source snapshots.",
    ));
  }
  const pre = isRecord(input)
    ? inputSnapshotCandidate(input["pre"], "input.pre", findings)
    : null;
  const post = isRecord(input)
    ? inputSnapshotCandidate(input["post"], "input.post", findings)
    : null;
  if (
    pre === null ||
    post === null ||
    pre.digest !== post.digest ||
    pre.digest !== currentInputDigest
  ) {
    findings.push(finding(
      "V0_EVIDENCE_INPUT_STALE",
      "input",
      "Pre/post inputs must be identical and equal the current source digest.",
    ));
  }
  if (
    pre !== null &&
    (candidate["runId"] !== v0EvidenceRunId(pre.digest) ||
      typeof candidate["runId"] !== "string")
  ) {
    findings.push(finding(
      "V0_EVIDENCE_RUN_ID",
      "runId",
      "Run ID is not the deterministic digest of tool, inputs, and contract.",
    ));
  }
  const artifact = candidate["artifact"];
  const artifactComponents = pre?.components.filter(({ path }) =>
    path === "jazz_chord_progression_editor.html"
  ) ?? [];
  const artifactComponent = artifactComponents[0];
  if (
    !isRecord(artifact) ||
    stableV0EvidenceJson(Object.keys(artifact).sort(compare)) !==
      stableV0EvidenceJson(["bytes", "path", "sha256"]) ||
    artifact["path"] !== "jazz_chord_progression_editor.html" ||
    !isSha256(artifact["sha256"]) ||
    typeof artifact["bytes"] !== "number" ||
    !Number.isSafeInteger(artifact["bytes"]) ||
    artifact["bytes"] <= 0 ||
    artifactComponents.length !== 1 ||
    artifactComponent === undefined ||
    artifactComponent.group !== "artifact" ||
    artifact["sha256"] !== artifactComponent.sha256 ||
    artifact["bytes"] !== artifactComponent.bytes
  ) {
    findings.push(finding(
      "V0_EVIDENCE_ARTIFACT",
      "artifact",
      "Ledger artifact must exactly equal the sole tracked standalone-artifact component in the pre/post input manifest.",
    ));
  }
  const environment = candidate["environment"];
  const environmentAccepted = ledgerEnvironmentAccepted(environment);
  if (!environmentAccepted) {
    findings.push(finding(
      "V0_EVIDENCE_ENVIRONMENT",
      "environment",
      "Ledger environment must preserve the exact current Bun/Node identities, compiler binary binding, platform, architecture, and machine evidence fields.",
    ));
  } else if (!ledgerVersionsAccepted(candidate["versions"], environment)) {
    findings.push(finding(
      "V0_EVIDENCE_VERSIONS",
      "versions",
      "Version inventory must exactly equal package.json dependencies plus the bound Bun, compiler Node, and Node-compatibility versions.",
    ));
  }
  if (!Array.isArray(candidate["browserVersions"]) ||
    candidate["browserVersions"].length !== 0) {
    findings.push(finding(
      "V0_EVIDENCE_BROWSER_APPLICABILITY",
      "browserVersions",
      "Pure V0 evidence has no browser run or browser version inventory.",
    ));
  }
  if (stableV0EvidenceJson(candidate["reviewedCounts"]) !==
    stableV0EvidenceJson(V0_EXPECTED_COUNTS)) {
    findings.push(finding(
      "V0_EVIDENCE_REVIEWED_COUNTS",
      "reviewedCounts",
      "Reviewed count inventory drifted.",
    ));
  }
  if (stableV0EvidenceJson(candidate["applicability"]) !==
    stableV0EvidenceJson(V0_APPLICABILITY)) {
    findings.push(finding(
      "V0_EVIDENCE_APPLICABILITY",
      "applicability",
      "Applicability inventory drifted.",
    ));
  }
  const runId = typeof candidate["runId"] === "string"
    ? candidate["runId"]
    : null;
  const expectedPaths = runId === null ? null : v0EvidencePaths(runId);
  const expectedExecutionEnvironment = environmentAccepted && runId !== null
    ? runEnvironment(runId, String(environment["compilerNodePath"]))
    : null;
  const runMetadata = candidate["runMetadata"];
  if (
    !isRecord(runMetadata) ||
    stableV0EvidenceJson(Object.keys(runMetadata).sort(compare)) !==
      stableV0EvidenceJson(["path", "schema", "sha256"]) ||
    runMetadata["schema"] !== "changes.evidence.v0.run-metadata.v1" ||
    expectedPaths === null ||
    runMetadata["path"] !== expectedPaths.metadataPath ||
    !isSha256(runMetadata["sha256"])
  ) {
    findings.push(finding(
      "V0_EVIDENCE_RUN_METADATA_BINDING",
      "runMetadata",
      "Run-metadata descriptor must have the exact schema and hash-bound path in the deterministic run directory.",
    ));
  }
  const validator = validateExecutionShape(
    candidate["validator"],
    "validator",
    findings,
  );
  if (validator !== null) {
    if (
      validator["exitCode"] !== 0 ||
      validator["schema"] !== "changes.validation.v0-contract.v1" ||
      validator["outcome"] !== "pass" ||
      stableV0EvidenceJson(validator["counts"]) !==
        stableV0EvidenceJson(V0_VALIDATOR_COUNTS) ||
      !Array.isArray(validator["findings"]) ||
      validator["findings"].length !== 0
    ) {
      findings.push(finding(
        "V0_EVIDENCE_VALIDATOR",
        "validator",
        "Stored validator evidence is not the exact passing V0 report.",
      ));
    }
    if (
      expectedPaths === null ||
      expectedExecutionEnvironment === null ||
      stableV0EvidenceJson(validator["command"]) !==
        stableV0EvidenceJson(validatorCommand()) ||
      stableV0EvidenceJson(validator["environment"]) !==
        stableV0EvidenceJson(expectedExecutionEnvironment) ||
      validator["stdoutPath"] !== expectedPaths.validatorStdoutPath ||
      validator["stderrPath"] !== expectedPaths.validatorStderrPath ||
      validator["signal"] !== null
    ) {
      findings.push(finding(
        "V0_EVIDENCE_VALIDATOR_EXECUTION_BINDING",
        "validator",
        "Validator record must bind the exact command, deterministic environment, raw paths, and successful no-signal execution.",
      ));
    }
  }
  const suite = validateExecutionShape(candidate["suite"], "suite", findings);
  const summary = suite === null
    ? junitSummaryFromSuite({})
    : junitSummaryFromSuite(suite);
  if (suite !== null) {
    if (
      suite["exitCode"] !== 0 ||
      summary.failures !== 0 ||
      summary.errors !== 0 ||
      summary.skipped !== 0 ||
      suite["todos"] !== 0 ||
      suite["retries"] !== 0 ||
      suite["quarantined"] !== 0 ||
      suite["expectedFailures"] !== 0 ||
      stableV0EvidenceJson(summary.files) !==
        stableV0EvidenceJson(V0_FOCUSED_TEST_FILES) ||
      !isSha256(suite["junitSha256"]) ||
      expectedPaths === null ||
      suite["junitPath"] !== expectedPaths.junitPath ||
      suite["stdoutPath"] !== expectedPaths.stdoutPath ||
      suite["stderrPath"] !== expectedPaths.stderrPath
    ) {
      findings.push(finding(
        "V0_EVIDENCE_SUITE",
        "suite",
        "Focused suite must contain the exact files with zero failure, skip, retry, quarantine, todo, or expected failure and deterministic raw paths.",
      ));
    }
    if (
      runId === null ||
      expectedExecutionEnvironment === null ||
      stableV0EvidenceJson(suite["command"]) !==
        stableV0EvidenceJson(focusedV0SuiteCommand(runId)) ||
      stableV0EvidenceJson(suite["environment"]) !==
        stableV0EvidenceJson(expectedExecutionEnvironment) ||
      suite["signal"] !== null
    ) {
      findings.push(finding(
        "V0_EVIDENCE_SUITE_EXECUTION_BINDING",
        "suite",
        "Focused-suite record must bind the exact unrelaxed command, deterministic environment, and successful no-signal execution.",
      ));
    }
  }
  const observations = Array.isArray(candidate["observations"])
    ? candidate["observations"].filter(isRecord)
    : [];
  findings.push(...inspectV0ObservationRecords(observations));
  const suiteOutcome: Outcome = suite !== null &&
      suite["exitCode"] === 0 &&
      summary.failures === 0 &&
      summary.errors === 0 &&
      summary.skipped === 0
    ? "pass"
    : "fail";
  const expectedTraces = buildV0TraceEvidence(
    observations,
    buildV0CaseBindings(),
    summary,
    suiteOutcome,
  );
  findings.push(...validateV0TraceEvidenceRows(
    candidate["traces"],
    expectedTraces,
  ));
  if (
    expectedTraces.length !== V0_EXPECTED_COUNTS.traces ||
    expectedTraces.some(({ outcome }) => outcome !== "pass")
  ) {
    findings.push(finding(
      "V0_EVIDENCE_TRACE_COVERAGE",
      "traces",
      "All 15 V0 traces must recompute as passing from executed case/control evidence.",
    ));
  }
  const expectedMutation = buildV0MutationEvidence(observations);
  findings.push(...validateV0MutationEvidenceRows(
    candidate["mutationEvidence"],
    expectedMutation,
  ));
  if (expectedMutation.outcome !== "pass") {
    findings.push(finding(
      "V0_EVIDENCE_MUTATION_AUDIT",
      "mutationEvidence",
      "All 51 semantic operators, 104 direct links, and two corroborative links must be honestly discharged.",
    ));
  }
  const expectedResource = semanticResourceEvidence(observations);
  const expectedTerminationEvidence = {
    terminations: expectedResource["terminations"],
    terminationCounts: expectedResource["terminationCounts"],
    allTerminationsObserved: expectedResource["allTerminationsObserved"],
    wallTimeGating: expectedResource["wallTimeGating"],
    outcome: expectedResource["outcome"],
  };
  if (
    stableV0EvidenceJson(candidate["semanticResourceEvidence"]) !==
      stableV0EvidenceJson(expectedResource) ||
    stableV0EvidenceJson(candidate["terminationEvidence"]) !==
      stableV0EvidenceJson(expectedTerminationEvidence) ||
    expectedResource["outcome"] !== "pass"
  ) {
    findings.push(finding(
      "V0_EVIDENCE_RESOURCE",
      "semanticResourceEvidence",
      "Semantic work, memory, termination, atomic limit, bypass-zero, and wall-time evidence is incomplete.",
    ));
  }
  const fixtureBindings = pre?.components.filter(({ group }) =>
    group === "fixtures"
  ) ?? [];
  if (stableV0EvidenceJson(candidate["fixtureBindings"]) !==
    stableV0EvidenceJson(fixtureBindings)) {
    findings.push(finding(
      "V0_EVIDENCE_FIXTURE_BINDINGS",
      "fixtureBindings",
      "Fixture bindings must be the exact fixture components from the input manifest.",
    ));
  }
  if (stableV0EvidenceJson(candidate["caseBindings"]) !==
    stableV0EvidenceJson(buildV0CaseBindings())) {
    findings.push(finding(
      "V0_EVIDENCE_CASE_BINDINGS",
      "caseBindings",
      "Case bindings must contain all 1,513 exact independent fixture record hashes.",
    ));
  }
  if (
    !isSha256(candidate["semanticDigest"]) ||
    candidate["semanticDigest"] !==
      v0DigestWithoutKey(candidate, "semanticDigest")
  ) {
    findings.push(finding(
      "V0_EVIDENCE_SEMANTIC_DIGEST",
      "semanticDigest",
      "Ledger semantic digest is missing or invalid.",
    ));
  }
  if (
    candidate["outcome"] !== "pass" ||
    !Array.isArray(candidate["findings"]) ||
    candidate["findings"].length !== 0
  ) {
    findings.push(finding(
      "V0_EVIDENCE_STORED_OUTCOME",
      OUTPUT_PATH,
      "A stored passing ledger must report pass with no findings.",
    ));
  }
  return sortFindings(findings);
}

async function readAndHashRaw(
  declaredPath: unknown,
  expectedPath: string,
  declaredHash: unknown,
  findings: V0EvidenceFinding[],
): Promise<Uint8Array | null> {
  if (declaredPath !== expectedPath || !isSha256(declaredHash)) {
    findings.push(finding(
      "V0_EVIDENCE_RAW_PATH",
      expectedPath,
      "Raw evidence path/hash escaped its deterministic run directory.",
    ));
    return null;
  }
  try {
    const bytes = new Uint8Array(await Bun.file(expectedPath).arrayBuffer());
    if (await sha256Hex(bytes) !== declaredHash) {
      findings.push(finding(
        "V0_EVIDENCE_RAW_HASH",
        expectedPath,
        "Raw evidence bytes differ from the ledger SHA-256.",
      ));
    }
    return bytes;
  } catch (error) {
    findings.push(finding(
      "V0_EVIDENCE_RAW_MISSING",
      expectedPath,
      error instanceof Error ? error.message : "Raw evidence is missing.",
    ));
    return null;
  }
}

export function v0RunMetadataValueAccepted(
  candidate: unknown,
  value: unknown,
): boolean {
  if (
    !isRecord(candidate) ||
    typeof candidate["runId"] !== "string" ||
    !isRecord(value) ||
    !isRecord(candidate["suite"]) ||
    !isRecord(candidate["validator"]) ||
    !ledgerEnvironmentAccepted(candidate["environment"]) ||
    !isRecord(candidate["input"]) ||
    !isRecord(candidate["input"]["pre"]) ||
    typeof candidate["input"]["pre"]["digest"] !== "string"
  ) return false;
  const environment = candidate["environment"];
  const expectedEnvironment = runEnvironment(
    candidate["runId"],
    String(environment["compilerNodePath"]),
  );
  const expectedMetadata = {
    schema: "changes.evidence.v0.run-metadata.v1",
    runId: candidate["runId"],
    commands: {
      validator: validatorCommand(),
      suite: focusedV0SuiteCommand(candidate["runId"]),
    },
    environment: expectedEnvironment,
    inputDigest: candidate["input"]["pre"]["digest"],
  };
  return stableV0EvidenceJson(value) === stableV0EvidenceJson(expectedMetadata) &&
    stableV0EvidenceJson(value["commands"]) === stableV0EvidenceJson({
      validator: candidate["validator"]["command"],
      suite: candidate["suite"]["command"],
    }) &&
    stableV0EvidenceJson(value["environment"]) ===
      stableV0EvidenceJson(candidate["validator"]["environment"]) &&
    stableV0EvidenceJson(value["environment"]) ===
      stableV0EvidenceJson(candidate["suite"]["environment"]);
}

export async function validateStoredV0RawEvidence(
  candidate: unknown,
): Promise<V0EvidenceFinding[]> {
  const findings: V0EvidenceFinding[] = [];
  if (!isRecord(candidate) || typeof candidate["runId"] !== "string") {
    return findings;
  }
  const suite = candidate["suite"];
  const validator = candidate["validator"];
  const metadata = candidate["runMetadata"];
  if (!isRecord(suite) || !isRecord(validator) || !isRecord(metadata)) {
    return [finding(
      "V0_EVIDENCE_RAW_SHAPE",
      OUTPUT_PATH,
      "Suite, validator, and run metadata records are required.",
    )];
  }
  const environment = candidate["environment"];
  if (ledgerEnvironmentAccepted(environment)) {
    try {
      const compilerNode = await findRealNode();
      const compilerNodeBytes = new Uint8Array(await Bun.file(
        String(environment["compilerNodePath"]),
      ).arrayBuffer());
      if (
        compilerNode.path !== environment["compilerNodePath"] ||
        compilerNode.version !== environment["compilerNodeVersion"] ||
        compilerNode.major !== environment["compilerNodeMajor"] ||
        compilerNodeBytes.byteLength !== environment["compilerNodeBytes"] ||
        await sha256Hex(compilerNodeBytes) !==
          environment["compilerNodeSha256"]
      ) {
        findings.push(finding(
          "V0_EVIDENCE_COMPILER_NODE_BINDING",
          "environment.compilerNodePath",
          "Compiler Node path, byte count, and SHA-256 do not identify the same current binary.",
        ));
      }
    } catch (error) {
      findings.push(finding(
        "V0_EVIDENCE_COMPILER_NODE_BINDING",
        "environment.compilerNodePath",
        error instanceof Error
          ? error.message
          : "Compiler Node binary is unreadable.",
      ));
    }
  }
  const paths = v0EvidencePaths(candidate["runId"]);
  const [suiteStdout, suiteStderr, junit, validatorStdout, validatorStderr,
    metadataBytes] = await Promise.all([
    readAndHashRaw(
      suite["stdoutPath"],
      paths.stdoutPath,
      suite["stdoutSha256"],
      findings,
    ),
    readAndHashRaw(
      suite["stderrPath"],
      paths.stderrPath,
      suite["stderrSha256"],
      findings,
    ),
    readAndHashRaw(
      suite["junitPath"],
      paths.junitPath,
      suite["junitSha256"],
      findings,
    ),
    readAndHashRaw(
      validator["stdoutPath"],
      paths.validatorStdoutPath,
      validator["stdoutSha256"],
      findings,
    ),
    readAndHashRaw(
      validator["stderrPath"],
      paths.validatorStderrPath,
      validator["stderrSha256"],
      findings,
    ),
    readAndHashRaw(
      metadata["path"],
      paths.metadataPath,
      metadata["sha256"],
      findings,
    ),
  ]);
  void validatorStderr;
  if (junit !== null) {
    const xml = new TextDecoder().decode(junit);
    if (sanitizeV0JUnit(xml) !== xml) {
      findings.push(finding(
        "V0_EVIDENCE_JUNIT_HOST",
        paths.junitPath,
        "Stored JUnit still contains a machine hostname.",
      ));
    }
    const inspected = inspectV0JUnit(xml);
    findings.push(...inspected.findings);
    if (inspected.summary !== null) {
      const storedSummary = junitSummaryFromSuite(suite);
      if (stableV0EvidenceJson(inspected.summary) !==
        stableV0EvidenceJson(storedSummary)) {
        findings.push(finding(
          "V0_EVIDENCE_JUNIT_DRIFT",
          paths.junitPath,
          "Ledger test counts/inventory differ from raw JUnit.",
        ));
      }
    }
  }
  if (suiteStdout !== null && suiteStderr !== null) {
    const parsed = parseV0Observations(
      `${new TextDecoder().decode(suiteStdout)}\n${
        new TextDecoder().decode(suiteStderr)
      }`,
    );
    findings.push(...parsed.findings);
    if (stableV0EvidenceJson(parsed.observations) !==
      stableV0EvidenceJson(candidate["observations"])) {
      findings.push(finding(
        "V0_EVIDENCE_OBSERVATION_DRIFT",
        "observations",
        "Ledger observations differ from raw focused-suite output.",
      ));
    }
  }
  if (validatorStdout !== null) {
    const parsed = parseJsonBytes(validatorStdout);
    findings.push(...inspectValidatorValue(parsed));
    if (
      parsed["schema"] !== validator["schema"] ||
      parsed["outcome"] !== validator["outcome"] ||
      stableV0EvidenceJson(parsed["counts"]) !==
        stableV0EvidenceJson(validator["counts"]) ||
      stableV0EvidenceJson(parsed["findings"]) !==
        stableV0EvidenceJson(validator["findings"])
    ) {
      findings.push(finding(
        "V0_EVIDENCE_VALIDATOR_DRIFT",
        paths.validatorStdoutPath,
        "Stored validator summary differs from raw JSON.",
      ));
    }
  }
  if (metadataBytes !== null) {
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(metadataBytes));
      if (!v0RunMetadataValueAccepted(candidate, value)) {
        findings.push(finding(
          "V0_EVIDENCE_RUN_METADATA",
          paths.metadataPath,
          "Raw run metadata must exactly bind the deterministic validator/suite commands, shared run environment, run ID, and input digest.",
        ));
      }
    } catch (error) {
      findings.push(finding(
        "V0_EVIDENCE_RUN_METADATA",
        paths.metadataPath,
        error instanceof Error ? error.message : "Run metadata is invalid.",
      ));
    }
  }
  return sortFindings(findings);
}

export async function verifyV0Evidence(): Promise<JsonRecord> {
  const pre = await snapshotV0EvidenceInputs();
  const runId = v0EvidenceRunId(pre.snapshot.digest);
  const paths = v0EvidencePaths(runId);
  await mkdir(paths.directory, { recursive: true });
  const compilerNode = await findRealNode();
  const environment = runEnvironment(runId, compilerNode.path);
  const metadataValue = {
    schema: "changes.evidence.v0.run-metadata.v1",
    runId,
    commands: {
      validator: validatorCommand(),
      suite: focusedV0SuiteCommand(runId),
    },
    environment,
    inputDigest: pre.snapshot.digest,
  };
  const metadataJson = stableV0EvidenceJson(metadataValue);
  await atomicWrite(paths.metadataPath, metadataJson);
  const validatorRun = await runRaw(
    validatorCommand(),
    environment,
    paths.validatorStdoutPath,
    paths.validatorStderrPath,
  );
  const validatorValue = parseJsonBytes(validatorRun.stdout);
  const suiteRun = await runRaw(
    focusedV0SuiteCommand(runId),
    environment,
    paths.stdoutPath,
    paths.stderrPath,
  );
  let junit = "";
  const junitReadFindings: V0EvidenceFinding[] = [];
  try {
    junit = sanitizeV0JUnit(await Bun.file(paths.junitPath).text());
    await atomicWrite(paths.junitPath, junit);
  } catch (error) {
    junitReadFindings.push(finding(
      "V0_EVIDENCE_JUNIT_MISSING",
      paths.junitPath,
      error instanceof Error ? error.message : "JUnit is missing.",
    ));
  }
  const inspectedJunit = inspectV0JUnit(junit);
  const summary: V0JUnitSummary = inspectedJunit.summary ?? {
    tests: 0,
    assertions: 0,
    failures: 0,
    errors: 0,
    skipped: 0,
    files: [],
    cases: [],
  };
  const parsedObservations = parseV0Observations(
    `${new TextDecoder().decode(suiteRun.stdout)}\n${
      new TextDecoder().decode(suiteRun.stderr)
    }`,
  );
  const post = await snapshotV0EvidenceInputs();
  const allControls = [...pre.controls, ...post.controls];
  const suiteOutcome: Outcome =
    suiteRun.exitCode === 0 &&
      summary.failures === 0 &&
      summary.errors === 0 &&
      summary.skipped === 0 &&
      stableV0EvidenceJson(summary.files) ===
        stableV0EvidenceJson(V0_FOCUSED_TEST_FILES)
      ? "pass"
      : "fail";
  const traces = buildV0TraceEvidence(
    parsedObservations.observations,
    buildV0CaseBindings(),
    summary,
    suiteOutcome,
  );
  const mutationEvidence = buildV0MutationEvidence(
    parsedObservations.observations,
  );
  const resources = semanticResourceEvidence(parsedObservations.observations);
  const artifact = pre.snapshot.components.find(({ path }) =>
    path === "jazz_chord_progression_editor.html"
  );
  const runtimeEnvironment = await environmentEvidence(compilerNode);
  const versions = packageVersions(compilerNode);
  const executionFindings = sortFindings([
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...junitReadFindings,
    ...inspectedJunit.findings,
    ...parsedObservations.findings,
    ...inspectValidatorValue(validatorValue),
    ...(pre.snapshot.digest === post.snapshot.digest
      ? []
      : [finding(
          "V0_EVIDENCE_INPUT_CHANGED",
          "input",
          "Evidence inputs changed during execution.",
        )]),
    ...(validatorRun.exitCode === 0
      ? []
      : [finding(
          "V0_EVIDENCE_VALIDATOR_EXIT",
          "validator",
          `Validator exited ${String(validatorRun.exitCode)}.`,
        )]),
    ...(suiteOutcome === "pass"
      ? []
      : [finding(
          "V0_EVIDENCE_SUITE_EXIT",
          "suite",
          "Focused suite did not pass with the exact unrelaxed file inventory.",
        )]),
    ...traces.filter(({ outcome }) => outcome !== "pass").map(({ traceId }) =>
      finding(
        "V0_EVIDENCE_TRACE",
        `traces#${traceId}`,
        "Trace is missing required executed case, mutation, authority, matrix, or JUnit evidence.",
        traceId,
      )
    ),
    ...(mutationEvidence.outcome === "pass"
      ? []
      : [finding(
          "V0_EVIDENCE_MUTATION_AUDIT",
          "mutationEvidence",
          "Reviewed semantic counterfactual evidence is incomplete or invalid.",
        )]),
    ...(resources["outcome"] === "pass"
      ? []
      : [finding(
          "V0_EVIDENCE_RESOURCE",
          "semanticResourceEvidence",
          "Deterministic work/memory/termination evidence is incomplete.",
        )]),
  ]);
  const validatorRecord = {
    ...withoutBuffers(validatorRun),
    schema: validatorValue["schema"] ?? null,
    outcome: validatorValue["outcome"] ?? "fail",
    counts: validatorValue["counts"] ?? null,
    findings: validatorValue["findings"] ?? null,
  };
  const suiteRecord = {
    ...withoutBuffers(suiteRun),
    junitPath: paths.junitPath,
    junitSha256: await sha256Hex(junit),
    tests: summary.tests,
    assertions: summary.assertions,
    failures: summary.failures,
    errors: summary.errors,
    skipped: summary.skipped,
    todos: allControls.filter(({ code }) => code === "V0_EVIDENCE_TODO")
      .length,
    retries: allControls.filter(({ code }) => code === "V0_EVIDENCE_RETRY")
      .length,
    quarantined: allControls.filter(({ code }) =>
      code === "V0_EVIDENCE_QUARANTINE"
    ).length,
    expectedFailures: allControls.filter(({ code }) =>
      code === "V0_EVIDENCE_EXPECTED_FAILURE"
    ).length,
    files: summary.files,
    cases: summary.cases,
  };
  const base: JsonRecord = {
    schema: "changes.evidence.v0.v1",
    schemaVersion: 1,
    package: "V0",
    traceId: "V0",
    contractVersion: (contractFixture as { fixtureVersion: string })
      .fixtureVersion,
    contractSchema: (contractFixture as { schema: string }).schema,
    runId,
    toolVersion: TOOL_VERSION,
    mode: "focused-package",
    outcome: executionFindings.length === 0 ? "pass" : "fail",
    findings: executionFindings,
    artifact: {
      path: "jazz_chord_progression_editor.html",
      sha256: artifact?.sha256 ?? "unavailable",
      bytes: artifact?.bytes ?? 0,
    },
    browserVersions: [],
    input: { pre: pre.snapshot, post: post.snapshot },
    fixtureBindings: pre.snapshot.components.filter(({ group }) =>
      group === "fixtures"
    ),
    caseBindings: buildV0CaseBindings(),
    environment: runtimeEnvironment,
    versions,
    reviewedCounts: V0_EXPECTED_COUNTS,
    applicability: V0_APPLICABILITY,
    runMetadata: {
      schema: "changes.evidence.v0.run-metadata.v1",
      path: paths.metadataPath,
      sha256: await sha256Hex(metadataJson),
    },
    validator: validatorRecord,
    suite: suiteRecord,
    observations: parsedObservations.observations,
    traces,
    mutationEvidence,
    terminationEvidence: {
      terminations: resources["terminations"],
      terminationCounts: resources["terminationCounts"],
      allTerminationsObserved: resources["allTerminationsObserved"],
      wallTimeGating: resources["wallTimeGating"],
      outcome: resources["outcome"],
    },
    semanticResourceEvidence: resources,
  };
  let ledger: JsonRecord = signV0EvidenceObservation(base);
  const firstRawFindings = await validateStoredV0RawEvidence(ledger);
  const firstCandidateFindings = validateV0EvidenceCandidate(
    ledger,
    post.snapshot.digest,
  );
  const firstFindings = sortFindings([
    ...executionFindings,
    ...firstRawFindings,
    ...firstCandidateFindings,
  ]);
  if (firstFindings.length > 0) {
    const failed = {
      ...base,
      outcome: "fail",
      findings: firstFindings,
    };
    ledger = signV0EvidenceObservation(failed);
  }
  await atomicWrite(OUTPUT_PATH, stableV0EvidenceJson(ledger));
  const settled = await snapshotV0EvidenceInputs();
  const postWriteFindings = [
    ...await validateStoredV0RawEvidence(ledger),
    ...validateV0EvidenceCandidate(ledger, settled.snapshot.digest),
    ...settled.findings,
    ...settled.controls,
    ...(settled.snapshot.digest === post.snapshot.digest
      ? []
      : [finding(
          "V0_EVIDENCE_INPUT_STALE",
          "input",
          "Inputs changed after the evidence ledger was written.",
        )]),
  ];
  if (postWriteFindings.length > 0) {
    const failed = {
      ...ledger,
      outcome: "fail",
      findings: sortFindings([
        ...(Array.isArray(ledger["findings"])
          ? ledger["findings"].filter((item): item is V0EvidenceFinding =>
              isRecord(item) && typeof item["code"] === "string" &&
              typeof item["path"] === "string" &&
              typeof item["message"] === "string"
            )
          : []),
        ...postWriteFindings,
      ]),
    };
    ledger = signV0EvidenceObservation(Object.fromEntries(
      Object.entries(failed).filter(([key]) => key !== "semanticDigest"),
    ));
    await atomicWrite(OUTPUT_PATH, stableV0EvidenceJson(ledger));
  }
  return ledger;
}

async function checkExistingV0Evidence(): Promise<Readonly<{
  outcome: Outcome;
  findings: readonly V0EvidenceFinding[];
}>> {
  let candidate: unknown;
  try {
    candidate = await Bun.file(OUTPUT_PATH).json() as unknown;
  } catch (error) {
    return {
      outcome: "fail",
      findings: [finding(
        "V0_EVIDENCE_LEDGER_MISSING",
        OUTPUT_PATH,
        error instanceof Error ? error.message : "Ledger is unreadable.",
      )],
    };
  }
  const before = await snapshotV0EvidenceInputs();
  const raw = await validateStoredV0RawEvidence(candidate);
  const candidateFindings = validateV0EvidenceCandidate(
    candidate,
    before.snapshot.digest,
  );
  const after = await snapshotV0EvidenceInputs();
  const findings = sortFindings([
    ...before.findings,
    ...before.controls,
    ...raw,
    ...candidateFindings,
    ...after.findings,
    ...after.controls,
    ...(before.snapshot.digest === after.snapshot.digest
      ? []
      : [finding(
          "V0_EVIDENCE_INPUT_STALE",
          "input",
          "Inputs changed during stored evidence verification.",
        )]),
  ]);
  return { outcome: findings.length === 0 ? "pass" : "fail", findings };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
      throw new Error("Usage: bun scripts/verify-v0-evidence.ts [--check]");
    }
    if (args[0] === "--check") {
      const result = await checkExistingV0Evidence();
      console.log(stableV0EvidenceJson({
        schema: "changes.evidence.v0.summary.v1",
        mode: "check",
        ledgerPath: OUTPUT_PATH,
        outcome: result.outcome,
        findings: result.findings,
      }).trimEnd());
      process.exitCode = result.outcome === "pass" ? 0 : 1;
    } else {
      const evidence = await verifyV0Evidence();
      const suite = isRecord(evidence["suite"]) ? evidence["suite"] : {};
      const mutation = isRecord(evidence["mutationEvidence"])
        ? evidence["mutationEvidence"]
        : {};
      console.log(stableV0EvidenceJson({
        schema: "changes.evidence.v0.summary.v1",
        mode: evidence["mode"],
        ledgerPath: OUTPUT_PATH,
        outcome: evidence["outcome"],
        runId: evidence["runId"],
        tests: suite["tests"] ?? 0,
        assertions: suite["assertions"] ?? 0,
        tracesPassed: Array.isArray(evidence["traces"])
          ? evidence["traces"].filter((row) =>
              isRecord(row) && row["outcome"] === "pass"
            ).length
          : 0,
        tracesRequired: V0_EXPECTED_COUNTS.traces,
        reviewedControlsDischarged:
          mutation["reviewedControlsDischarged"] ?? 0,
        directKillerLinksKilled: mutation["directKillerLinksKilled"] ?? 0,
        corroborativeLinksObserved:
          mutation["corroborativeLinksObserved"] ?? 0,
        sourceMutantsExecuted: mutation["sourceMutantsExecuted"] ?? 0,
        findings: evidence["findings"],
      }).trimEnd());
      process.exitCode = evidence["outcome"] === "pass" ? 0 : 1;
    }
  } catch (error) {
    console.error(stableV0EvidenceJson({
      schema: "changes.evidence.v0.summary.v1",
      outcome: "fail",
      findings: [finding(
        "V0_EVIDENCE_TOOL_FAILURE",
        OUTPUT_PATH,
        error instanceof Error ? error.message : "Unknown tool failure.",
      )],
    }).trimEnd());
    process.exitCode = 2;
  }
}
