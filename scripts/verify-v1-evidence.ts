import { createHash } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname } from "node:path";

import ts from "typescript";

import assignmentFixture from
  "../tests/fixtures/voice-assignment/assignment-cases.json";
import contractFixture from
  "../tests/fixtures/voice-assignment/v1-voice-assignment-contract.json";
import lawFixture from "../tests/fixtures/voice-assignment/law-cases.json";
import limitFixture from "../tests/fixtures/voice-assignment/limit-cases.json";
import mutationFixture from
  "../tests/fixtures/voice-assignment/mutation-controls.json";
import operationFixture from
  "../tests/fixtures/voice-assignment/operation-state-cases.json";
import provenanceFixture from
  "../tests/fixtures/voice-assignment/provenance-ledger.json";
import traceFixture from
  "../tests/fixtures/voice-assignment/trace-ledger.json";

type JsonRecord = Record<string, unknown>;
type ObservationKind =
  | "production"
  | "mutation"
  | "accounting"
  | "transposition";

export type V1EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  traceId: string | null;
}>;

type InputComponent = Readonly<{
  group: string;
  path: string;
  bytes: number;
  sha256: string;
}>;

export type V1InputSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly InputComponent[];
}>;

export type V1JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
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
  resourceUsage: Readonly<{
    measurement: "Bun.Subprocess.resourceUsage";
    maxRssRaw: number | null;
    maxRssRawUnit: "bytes" | "kilobytes" | "runtime-defined";
    maxRssBytes: number | null;
    cpuUserMicros: number | null;
    cpuSystemMicros: number | null;
    gating: false;
  }>;
}>;

export const V1_PRODUCTION_MARKER =
  "V1_PRODUCTION_OBSERVATION " as const;
export const V1_MUTATION_MARKER =
  "V1_MUTATION_OBSERVATION " as const;
export const V1_ACCOUNTING_MARKER =
  "V1_ACCOUNTING_OBSERVATION " as const;
export const V1_TRANSPOSITION_MARKER =
  "V1_TRANSPOSITION_OBSERVATION " as const;

export const V1_PRODUCTION_SCHEMA =
  "changes.evidence.v1-production-conformance-observation.v1" as const;
export const V1_MUTATION_SCHEMA =
  "changes.evidence.v1-mutation-conformance-observation.v1" as const;
export const V1_ACCOUNTING_SCHEMA =
  "changes.test-support.v1-accounting-probes.v1" as const;
export const V1_TRANSPOSITION_SCHEMA =
  "changes.evidence.v1-transposition-laws.v1" as const;

export const V1_PRODUCTION_PRODUCER = Object.freeze({
  file: "tests/conformance/v1-production-conformance.test.ts",
  testcase:
    "executes every reviewed V1 assignment case with exact replay and immutable detached results",
} as const);

export const V1_MUTATION_PRODUCER = Object.freeze({
  file: "tests/conformance/v1-mutation-controls.test.ts",
  testcase:
    "kills every reviewed V1 semantic counterfactual through its linked independent cases",
} as const);

export const V1_FIXTURE_FILES = Object.freeze([
  "tests/fixtures/voice-assignment/assignment-cases.json",
  "tests/fixtures/voice-assignment/assignment-policy.json",
  "tests/fixtures/voice-assignment/law-cases.json",
  "tests/fixtures/voice-assignment/limit-cases.json",
  "tests/fixtures/voice-assignment/mutation-controls.json",
  "tests/fixtures/voice-assignment/operation-state-cases.json",
  "tests/fixtures/voice-assignment/provenance-ledger.json",
  "tests/fixtures/voice-assignment/trace-ledger.json",
  "tests/fixtures/voice-assignment/v1-voice-assignment-contract.json",
] as const);

export const V1_FOCUSED_TEST_FILES = Object.freeze([
  "tests/conformance/v1-mutation-controls.test.ts",
  "tests/conformance/v1-production-conformance.test.ts",
  "tests/property/v1-assignment-oracle.test.ts",
  "tests/property/v1-transposition-laws.test.ts",
  "tests/static/v1-contract.test.ts",
  "tests/static/v1-evidence.test.ts",
  "tests/static/v1-type-contract.test.ts",
  "tests/unit/v1-accounting-probes.test.ts",
  "tests/unit/v1-voice-assignment-validation.test.ts",
  "tests/unit/v1-voice-assignment.test.ts",
] as const);

export const V1_EXPECTED_COUNTS = Object.freeze({
  fixtureFiles: 9,
  voiceSets: 20,
  assignmentCases: 18,
  lawCases: 12,
  operationStateCases: 17,
  publicLimitCases: 9,
  matrixGoldens: 4,
  derivedLimitProbes: 29,
  workCounters: 14,
  memoryCounters: 15,
  mutationControls: 37,
  mutationLinks: 54,
  traces: 15,
  authorities: 6,
  legacyRegressions: 2,
} as const);

export const V1_APPLICABILITY = Object.freeze([
  Object.freeze({
    id: "browser",
    applicability: "not-applicable:pure-theory-value-operation",
    owner: "U3/Q0",
    proof: "V1 has no rendered surface or browser adapter.",
  }),
  Object.freeze({
    id: "audio",
    applicability: "not-applicable:no-audio-adapter-call",
    owner: "P0/X0/X1",
    proof: "V1 returns immutable assignment values only.",
  }),
  Object.freeze({
    id: "storage",
    applicability: "not-applicable:no-persistence-adapter-call",
    owner: "A1/E0",
    proof: "V1 has no persistence or export side effect.",
  }),
  Object.freeze({
    id: "network",
    applicability: "forbidden:offline-pure-theory",
    owner: "V1/F0",
    proof: "Static boundary evidence rejects ambient network references.",
  }),
  Object.freeze({
    id: "cancellation",
    applicability: "not-applicable:bounded-synchronous-operation",
    owner: "V2",
    proof: "Pairwise V1 termination is determined only by exact counters.",
  }),
  Object.freeze({
    id: "resume",
    applicability: "not-applicable:no-resumable-state",
    owner: "V2",
    proof: "V1 returns one all-or-nothing value or typed refusal.",
  }),
  Object.freeze({
    id: "stale-revision",
    applicability: "request-lock-staleness-only",
    owner: "V1/A0/U3",
    proof: "V1 proves stale request locks; document revision gating is downstream.",
  }),
  Object.freeze({
    id: "wall-time-cutoff",
    applicability: "forbidden:work-and-memory-counters-only",
    owner: "V1",
    proof: "Elapsed time is recorded as evidence and cannot select a path.",
  }),
] as const);

export const V1_REQUIRED_JUNIT_CASES = Object.freeze([
  V1_PRODUCTION_PRODUCER,
  V1_MUTATION_PRODUCER,
  Object.freeze({
    file: "tests/unit/v1-accounting-probes.test.ts",
    testcase: "executes all 29 reviewed exact-plus-one accounting probes",
  }),
  Object.freeze({
    file: "tests/unit/v1-accounting-probes.test.ts",
    testcase:
      "replays byte-identical machine-readable diagnostics and keeps the seam private",
  }),
  Object.freeze({
    file: "tests/property/v1-assignment-oracle.test.ts",
    testcase: "reviewed small-case coverage exercises every declared dimension",
  }),
  Object.freeze({
    file: "tests/property/v1-assignment-oracle.test.ts",
    testcase: "maximum leap is reported but cannot outrank canonical gap count",
  }),
  Object.freeze({
    file: "tests/property/v1-transposition-laws.test.ts",
    testcase:
      "transposes gap, lock, role, motion, identity, oracle, and maximum-bound scenarios without changing invariant semantics",
  }),
  Object.freeze({
    file: "tests/property/v1-transposition-laws.test.ts",
    testcase:
      "binds every V1 law to at least one applicable transposition scenario",
  }),
  Object.freeze({
    file: "tests/static/v1-contract.test.ts",
    testcase: "validates the complete independently authored package",
  }),
  Object.freeze({
    file: "tests/static/v1-type-contract.test.ts",
    testcase:
      "rejects impossible cardinality, arc, identity, lock, and termination states",
  }),
  Object.freeze({
    file: "tests/unit/v1-voice-assignment-validation.test.ts",
    testcase:
      "V1-OP-006 lets equal MIDI reach duplicate detection and checks exact pitch projection",
  }),
  Object.freeze({
    file: "tests/unit/v1-voice-assignment-validation.test.ts",
    testcase:
      "V1-OP-014/015 keeps eligible locks hard and checks ID capacity only after selection",
  }),
  Object.freeze({
    file: "tests/unit/v1-voice-assignment.test.ts",
    testcase:
      "V1-ASN-001 initializes canonical request-local identities without aliasing input",
  }),
] as const);

export const V1_INPUT_GROUPS = Object.freeze({
  contracts: Object.freeze([
    "AGENTS.md",
    "docs/ARCHITECTURE.md",
    "docs/REBUILD_PLAN.md",
    "docs/THEORY_IDEA_WIZARD.md",
    "docs/V1_VOICE_ASSIGNMENT_CONTRACT.md",
    "package.json",
    "bun.lock",
    "bunfig.toml",
  ]),
  production: Object.freeze([
    "src/domain/chord.ts",
    "src/domain/index.ts",
    "src/domain/pitch.ts",
    "src/theory/index.ts",
    "src/theory/resolution-contract.ts",
    "src/theory/voice-assignment-contract.ts",
    "src/theory/voice-assignment.ts",
    "src/theory/voicing-candidates-contract.ts",
    "src/theory/voicing-engine-primitives.ts",
  ]),
  authority: V1_FIXTURE_FILES,
  harness: Object.freeze([
    "src/test-support/v1-accounting-probes.ts",
    "tests/support/v1-assignment-fixtures.ts",
    "tests/support/v1-conformance.ts",
    "tests/support/v1-independent-oracle.ts",
    "tests/support/v1-public-boundaries.ts",
    ...V1_FOCUSED_TEST_FILES,
  ]),
  review: Object.freeze([
    "docs/evidence/V1_INDEPENDENT_TRACE_REVIEW.md",
  ]),
  tooling: Object.freeze([
    "scripts/validate-v1-contract.ts",
    "scripts/verify-v1-evidence.ts",
    "tsconfig.app.json",
    "tsconfig.base.json",
    "tsconfig.tests.json",
    "tsconfig.tools.json",
    "tsconfig.v1-tests.json",
    "tsconfig.v1-unit-tests.json",
    "eslint.config.mjs",
  ]),
} as const);

const TOOL_VERSION = "changes.evidence.v1-verifier.v1" as const;
const OUTPUT_PATH = "test-results/v1-evidence.json" as const;
const OBSERVATION_MARKERS = Object.freeze({
  production: V1_PRODUCTION_MARKER,
  mutation: V1_MUTATION_MARKER,
  accounting: V1_ACCOUNTING_MARKER,
  transposition: V1_TRANSPOSITION_MARKER,
} as const);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
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

export function stableV1EvidenceJson(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

export function v1EvidenceDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)), "utf8")
    .digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function finding(
  code: string,
  path: string,
  message: string,
  traceId: string | null = null,
): V1EvidenceFinding {
  return Object.freeze({ code, path, message, traceId });
}

function withoutKey(value: JsonRecord, omitted: string): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omitted),
  );
}

function exactStrings(actual: unknown, expected: readonly string[]): boolean {
  return JSON.stringify(strings(actual)) === JSON.stringify(expected);
}

function exactRecord(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected));
}

function exactDigestMap(value: unknown, expectedKeys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return JSON.stringify(Object.keys(value).sort(compare)) ===
      JSON.stringify([...expectedKeys].sort(compare)) &&
    Object.values(value).every(isSha256);
}

function assignmentCaseIds(): readonly string[] {
  return assignmentFixture.cases.map(({ id }) => id);
}

function mutationControlIds(): readonly string[] {
  return mutationFixture.controls.map(({ id }) => id);
}

function mutationLinks(): readonly Readonly<{
  controlId: string;
  caseId: string;
}>[] {
  return mutationFixture.controls.flatMap(({ id, killedByCaseIds }) =>
    killedByCaseIds.map((caseId) => ({ controlId: id, caseId }))
  );
}

function publicLimitIds(): readonly string[] {
  return limitFixture.publicBoundaries.map(({ id }) => id);
}

function validateProductionObservation(
  value: JsonRecord,
): readonly V1EvidenceFinding[] {
  const findings: V1EvidenceFinding[] = [];
  const ids = assignmentCaseIds();
  const rows = records(value["caseObservations"]);
  const rowIds = rows.map((row) => String(row["caseId"]));
  const digestMap = isRecord(value["caseObservationDigests"])
    ? value["caseObservationDigests"]
    : {};
  if (
    value["schema"] !== V1_PRODUCTION_SCHEMA ||
    value["suite"] !== "v1-production-conformance" ||
    !exactRecord(value["producer"], V1_PRODUCTION_PRODUCER) ||
    !exactStrings(value["caseIds"], ids) ||
    JSON.stringify(rowIds) !== JSON.stringify(ids) ||
    !exactDigestMap(digestMap, ids) ||
    value["deterministicReplays"] !== V1_EXPECTED_COUNTS.assignmentCases ||
    value["inputMutations"] !== 0 ||
    value["mutableResultRecords"] !== 0 ||
    value["callerOwnedAliases"] !== 0 ||
    value["wallTimeSemanticCutoff"] !== false ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "V1_EVIDENCE_PRODUCTION",
      "observations.production",
      "The exact V1 production producer must execute all 18 reviewed assignment cases with replay, immutable detached results, and unchanged inputs.",
      "V1-TRACE-DETERMINISM",
    ));
  }

  for (const [index, row] of rows.entries()) {
    const caseId = ids[index];
    const fixtureRow = assignmentFixture.cases[index];
    const path = `observations.production.caseObservations[${String(index)}]`;
    if (caseId === undefined || fixtureRow === undefined) {
      findings.push(finding(
        "V1_EVIDENCE_PRODUCTION_CASE",
        path,
        "Unexpected production case observation.",
      ));
      continue;
    }
    const digest = row["observationDigest"];
    if (
      row["caseId"] !== caseId ||
      row["fixtureRecordSha256"] !== v1EvidenceDigest(fixtureRow) ||
      !isSha256(row["requestSha256"]) ||
      !isSha256(row["resultSha256"]) ||
      row["replayResultSha256"] !== row["resultSha256"] ||
      !isSha256(row["expectedProjectionSha256"]) ||
      row["actualProjectionSha256"] !== row["expectedProjectionSha256"] ||
      row["deterministicReplay"] !== true ||
      row["inputUnchanged"] !== true ||
      row["recursivelyFrozen"] !== true ||
      row["detachedFromInputs"] !== true ||
      row["outcome"] !== "pass" ||
      !isSha256(digest) ||
      digest !== v1EvidenceDigest(withoutKey(row, "observationDigest")) ||
      digestMap[caseId] !== digest
    ) {
      findings.push(finding(
        "V1_EVIDENCE_PRODUCTION_CASE",
        path,
        `${caseId} must bind its literal fixture, request/result replay, expected projection, immutability, and input ownership evidence.`,
      ));
    }
  }

  const limitIds = publicLimitIds();
  const limitRows = records(value["publicBoundaryObservations"]);
  const limitDigestMap = isRecord(value["publicBoundaryObservationDigests"])
    ? value["publicBoundaryObservationDigests"]
    : {};
  if (
    JSON.stringify(limitRows.map((row) => row["caseId"])) !==
      JSON.stringify(limitIds) ||
    !exactDigestMap(limitDigestMap, limitIds)
  ) {
    findings.push(finding(
      "V1_EVIDENCE_PUBLIC_LIMIT_INVENTORY",
      "observations.production.publicBoundaryObservations",
      "All nine reviewed public exact/near boundaries require runtime-bound observations.",
      "V1-TRACE-LIMITS",
    ));
  }
  for (const [index, row] of limitRows.entries()) {
    const fixtureRow = limitFixture.publicBoundaries[index];
    const caseId = limitIds[index];
    const path =
      `observations.production.publicBoundaryObservations[${String(index)}]`;
    if (fixtureRow === undefined || caseId === undefined) continue;
    const digest = row["observationDigest"];
    if (
      row["caseId"] !== caseId ||
      row["fixtureRecordSha256"] !== v1EvidenceDigest(fixtureRow) ||
      !isSha256(row["exactOutcomeSha256"]) ||
      !isSha256(row["nearMissOutcomeSha256"]) ||
      row["exactAccepted"] !== true ||
      row["nearMissAccepted"] !== false ||
      row["outcome"] !== "pass" ||
      !isSha256(digest) ||
      digest !== v1EvidenceDigest(withoutKey(row, "observationDigest")) ||
      limitDigestMap[caseId] !== digest
    ) {
      findings.push(finding(
        "V1_EVIDENCE_PUBLIC_LIMIT_CASE",
        path,
        `${caseId} must bind its exact accepted edge and independently expected near-miss refusal.`,
        "V1-TRACE-LIMITS",
      ));
    }
  }
  return findings;
}

function validateMutationObservation(
  value: JsonRecord,
): readonly V1EvidenceFinding[] {
  const findings: V1EvidenceFinding[] = [];
  const controlIds = mutationControlIds();
  const links = mutationLinks();
  const rows = records(value["counterfactualExecutions"]);
  const expectedKeys = links.map(({ controlId, caseId }) =>
    `${controlId}\u0000${caseId}`
  );
  const actualKeys = rows.map((row) =>
    `${String(row["controlId"])}\u0000${String(row["caseId"])}`
  );
  const controlDigests = isRecord(value["controlExecutionDigests"])
    ? value["controlExecutionDigests"]
    : {};
  if (
    value["schema"] !== V1_MUTATION_SCHEMA ||
    value["suite"] !== "v1-mutation-controls" ||
    !exactRecord(value["producer"], V1_MUTATION_PRODUCER) ||
    !exactStrings(value["controlIds"], controlIds) ||
    value["controlsDefined"] !== V1_EXPECTED_COUNTS.mutationControls ||
    value["controlsExecuted"] !== V1_EXPECTED_COUNTS.mutationControls ||
    value["controlsKilled"] !== V1_EXPECTED_COUNTS.mutationControls ||
    value["controlsSurvived"] !== 0 ||
    value["reviewedKillerLinks"] !== V1_EXPECTED_COUNTS.mutationLinks ||
    value["killerLinksExecuted"] !== V1_EXPECTED_COUNTS.mutationLinks ||
    value["killerLinksKilled"] !== V1_EXPECTED_COUNTS.mutationLinks ||
    value["killerLinksSurvived"] !== 0 ||
    JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys) ||
    !exactDigestMap(controlDigests, controlIds) ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "V1_EVIDENCE_MUTATION",
      "observations.mutation",
      "All 37 semantic counterfactuals and 54 reviewed killer links must execute and be killed in fixture order.",
    ));
  }
  for (const [index, row] of rows.entries()) {
    const link = links[index];
    const control = mutationFixture.controls.find(({ id }) =>
      id === link?.controlId
    );
    const path = `observations.mutation.counterfactualExecutions[${String(index)}]`;
    if (link === undefined || control === undefined) continue;
    const digest = row["executionDigest"];
    if (
      row["controlId"] !== link.controlId ||
      row["caseId"] !== link.caseId ||
      row["operator"] !== control.operator ||
      row["fixtureRecordSha256"] !== v1EvidenceDigest(control) ||
      row["executionKind"] !== "executable-semantic-counterfactual" ||
      !isSha256(row["runtimeRequestSha256"]) ||
      !isSha256(row["expectedProjectionSha256"]) ||
      row["baselineProjectionSha256"] !== row["expectedProjectionSha256"] ||
      !isSha256(row["mutantProjectionSha256"]) ||
      row["mutantProjectionSha256"] === row["expectedProjectionSha256"] ||
      !isSha256(row["baselineResultSha256"]) ||
      !isSha256(row["mutantResultSha256"]) ||
      row["baselineResultSha256"] === row["mutantResultSha256"] ||
      row["oracleDecision"] !== "killed" ||
      !isSha256(row["beforeSha256"]) ||
      !isSha256(row["afterSha256"]) ||
      row["beforeSha256"] === row["afterSha256"] ||
      !Array.isArray(row["changedFields"]) ||
      row["changedFields"].length === 0 ||
      !row["changedFields"].every((item) => typeof item === "string") ||
      row["killed"] !== true ||
      !isSha256(digest) ||
      digest !== v1EvidenceDigest(withoutKey(row, "executionDigest"))
    ) {
      findings.push(finding(
        "V1_EVIDENCE_MUTATION_LINK",
        path,
        `${link.controlId}/${link.caseId} requires a changed semantic result and an exact killed observation digest.`,
      ));
    }
  }
  for (const controlId of controlIds) {
    const expected = v1EvidenceDigest(
      rows.filter((row) => row["controlId"] === controlId),
    );
    if (controlDigests[controlId] !== expected) {
      findings.push(finding(
        "V1_EVIDENCE_MUTATION_CONTROL_DIGEST",
        `observations.mutation.controlExecutionDigests#${controlId}`,
        "Control digest must bind every reviewed execution row for that control.",
      ));
    }
  }
  return findings;
}

function validateAccountingObservation(
  value: JsonRecord,
): readonly V1EvidenceFinding[] {
  const rows = records(value["cases"]);
  const expectedRows = limitFixture.derivedAccountingProbes;
  const counts = isRecord(value["counts"]) ? value["counts"] : {};
  const findings: V1EvidenceFinding[] = [];
  if (
    value["schema"] !== V1_ACCOUNTING_SCHEMA ||
    value["package"] !== "V1" ||
    value["outcome"] !== "pass" ||
    counts["requested"] !== V1_EXPECTED_COUNTS.derivedLimitProbes ||
    counts["executed"] !== V1_EXPECTED_COUNTS.derivedLimitProbes ||
    counts["passed"] !== V1_EXPECTED_COUNTS.derivedLimitProbes ||
    counts["failed"] !== 0 ||
    counts["workCounters"] !== V1_EXPECTED_COUNTS.workCounters ||
    counts["memoryCounters"] !== V1_EXPECTED_COUNTS.memoryCounters ||
    !Array.isArray(value["findings"]) ||
    value["findings"].length !== 0 ||
    rows.length !== V1_EXPECTED_COUNTS.derivedLimitProbes
  ) {
    findings.push(finding(
      "V1_EVIDENCE_ACCOUNTING",
      "observations.accounting",
      "All 29 exact-plus-one work and memory probes must pass with no partial result.",
      "V1-TRACE-LIMITS",
    ));
  }
  for (const [index, row] of rows.entries()) {
    const expected = expectedRows[index];
    if (expected === undefined) continue;
    const exact = isRecord(row["exactLimit"]) ? row["exactLimit"] : {};
    const plusOne = isRecord(row["exactPlusOne"])
      ? row["exactPlusOne"]
      : {};
    const refusal = isRecord(plusOne["refusal"]) ? plusOne["refusal"] : {};
    const evidence = isRecord(plusOne["evidence"]) ? plusOne["evidence"] : {};
    const expectedKind = Object.hasOwn(contractFixture.workLimits, expected.counter)
      ? "work"
      : "memory";
    if (
      row["id"] !== expected.id ||
      row["counter"] !== expected.counter ||
      row["counterKind"] !== expectedKind ||
      row["maximum"] !== expected.maximum ||
      row["received"] !== expected.received ||
      exact["accepted"] !== true ||
      exact["recorded"] !== expected.maximum ||
      plusOne["accepted"] !== false ||
      plusOne["recorded"] !== expected.maximum ||
      refusal["code"] !== "limit.voice_assignment_work_exceeded" ||
      refusal["counter"] !== expected.counter ||
      refusal["maximum"] !== expected.maximum ||
      refusal["received"] !== expected.received ||
      refusal["partialResult"] !== false ||
      evidence["termination"] !== "work-limit-exceeded" ||
      evidence[expected.counter] !== expected.maximum ||
      row["firstProspectiveExcessWins"] !== true ||
      Object.hasOwn(plusOne, "value") ||
      Object.hasOwn(plusOne, "frame") ||
      Object.hasOwn(plusOne, "arcs")
    ) {
      findings.push(finding(
        "V1_EVIDENCE_ACCOUNTING_CASE",
        `observations.accounting.cases[${String(index)}]`,
        `${expected.id} must accept the exact maximum and refuse maximum plus one before publishing a partial result.`,
        "V1-TRACE-LIMITS",
      ));
    }
  }
  return findings;
}

export const V1_TRANSPOSITION_CASE_IDS = Object.freeze([
  ...new Set(
    lawFixture.cases.flatMap(({ transpositionCaseIds }) =>
      transpositionCaseIds
    ),
  ),
]);

export const V1_TRANSPOSITION_LAW_CHECKS = Object.freeze({
  "V1-LAW-001": "deterministic-replay",
  "V1-LAW-002": "metamorphic-invariant-projection",
  "V1-LAW-003": "metamorphic-invariant-projection",
  "V1-LAW-004": "metamorphic-invariant-projection",
  "V1-LAW-005": "metamorphic-invariant-projection",
  "V1-LAW-006": "metamorphic-invariant-projection",
  "V1-LAW-007": "metamorphic-invariant-projection",
  "V1-LAW-008": "metamorphic-invariant-projection",
  "V1-LAW-009": "metamorphic-invariant-projection",
  "V1-LAW-010": "immutable-detached-results",
  "V1-LAW-011": "metamorphic-invariant-projection",
  "V1-LAW-012": "independent-small-case-oracle",
} as const);

function validateTranspositionObservation(
  value: JsonRecord,
): readonly V1EvidenceFinding[] {
  const findings: V1EvidenceFinding[] = [];
  const rows = records(value["observations"]);
  const rowIds = rows.map((row) => row["caseId"]);
  if (
    value["schema"] !== V1_TRANSPOSITION_SCHEMA ||
    value["semitones"] !== 12 ||
    JSON.stringify(rowIds) !== JSON.stringify(V1_TRANSPOSITION_CASE_IDS) ||
    value["status"] !== "pass"
  ) {
    findings.push(finding(
      "V1_EVIDENCE_TRANSPOSITION",
      "observations.transposition",
      "All 11 reviewed octave-transposition scenarios and 12 law bindings must preserve invariant semantics.",
      "V1-TRACE-DETERMINISM",
    ));
  }
  const rowsById = new Map<string, JsonRecord>();
  for (const [index, row] of rows.entries()) {
    const caseId = V1_TRANSPOSITION_CASE_IDS[index];
    const digest = row["observationDigest"];
    const oracleCase = caseId === "V1-ASN-016";
    if (
      caseId === undefined ||
      row["caseId"] !== caseId ||
      !isSha256(row["baseResultSha256"]) ||
      row["baseReplayResultSha256"] !== row["baseResultSha256"] ||
      !isSha256(row["transposedResultSha256"]) ||
      row["transposedReplayResultSha256"] !==
        row["transposedResultSha256"] ||
      !isSha256(row["baseInvariantProjectionSha256"]) ||
      row["transposedInvariantProjectionSha256"] !==
        row["baseInvariantProjectionSha256"] ||
      row["invariantPreserved"] !== true ||
      row["baseInputUnchanged"] !== true ||
      row["transposedInputUnchanged"] !== true ||
      row["baseRecursivelyFrozen"] !== true ||
      row["transposedRecursivelyFrozen"] !== true ||
      row["baseDetachedFromInput"] !== true ||
      row["transposedDetachedFromInput"] !== true ||
      (oracleCase
        ? !isSha256(row["baseOracleProjectionSha256"]) ||
          row["transposedOracleProjectionSha256"] !==
            row["baseOracleProjectionSha256"] ||
          row["independentOracleMatched"] !== true
        : row["baseOracleProjectionSha256"] !== null ||
          row["transposedOracleProjectionSha256"] !== null ||
          row["independentOracleMatched"] !== null) ||
      !isSha256(digest) ||
      digest !== v1EvidenceDigest(withoutKey(row, "observationDigest"))
    ) {
      findings.push(finding(
        "V1_EVIDENCE_TRANSPOSITION_CASE",
        `observations.transposition.observations[${String(index)}]`,
        `${caseId ?? "unknown"} must bind replay, immutable ownership, equal base/shifted invariant projections, and its independent oracle where applicable.`,
        "V1-TRACE-DETERMINISM",
      ));
    }
    if (caseId !== undefined) rowsById.set(caseId, row);
  }

  const bindings = records(value["lawBindings"]);
  if (
    JSON.stringify(bindings.map((row) => row["lawId"])) !==
      JSON.stringify(lawFixture.cases.map(({ id }) => id))
  ) {
    findings.push(finding(
      "V1_EVIDENCE_TRANSPOSITION_BINDING_INVENTORY",
      "observations.transposition.lawBindings",
      "The transposition observation must bind all 12 fixture-authored laws in fixture order.",
      "V1-TRACE-DETERMINISM",
    ));
  }
  for (const [index, binding] of bindings.entries()) {
    const law = lawFixture.cases[index];
    if (law === undefined) continue;
    const expectedDigests = law.transpositionCaseIds.map((caseId) =>
      rowsById.get(caseId)?.["observationDigest"]
    );
    const digest = binding["bindingDigest"];
    if (
      binding["lawId"] !== law.id ||
      binding["law"] !== law.law ||
      !exactStrings(binding["scenarioCaseIds"], law.transpositionCaseIds) ||
      !exactRecord(
        binding["scenarioObservationSha256"],
        expectedDigests,
      ) ||
      binding["check"] !==
        V1_TRANSPOSITION_LAW_CHECKS[
          law.id as keyof typeof V1_TRANSPOSITION_LAW_CHECKS
        ] ||
      binding["checkPassed"] !== true ||
      !isSha256(digest) ||
      digest !== v1EvidenceDigest(withoutKey(binding, "bindingDigest"))
    ) {
      findings.push(finding(
        "V1_EVIDENCE_TRANSPOSITION_BINDING",
        `observations.transposition.lawBindings[${String(index)}]`,
        `${law.id} must bind its fixture-authored scenarios to actual observation digests and its law-specific check.`,
        "V1-TRACE-DETERMINISM",
      ));
    }
  }
  return findings;
}

export function validateV1ObservationRecords(
  observations: Readonly<Partial<Record<ObservationKind, JsonRecord>>>,
): readonly V1EvidenceFinding[] {
  return [
    ...validateProductionObservation(observations.production ?? {}),
    ...validateMutationObservation(observations.mutation ?? {}),
    ...validateAccountingObservation(observations.accounting ?? {}),
    ...validateTranspositionObservation(observations.transposition ?? {}),
  ].sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
}

export function parseV1Observations(output: string): Readonly<{
  observations: Partial<Record<ObservationKind, JsonRecord>>;
  findings: readonly V1EvidenceFinding[];
}> {
  const observations: Partial<Record<ObservationKind, JsonRecord>> = {};
  const findings: V1EvidenceFinding[] = [];
  for (const [kind, marker] of Object.entries(OBSERVATION_MARKERS) as Array<
    [ObservationKind, string]
  >) {
    const lines = output.split(/\r?\n/u).filter((line) => line.startsWith(marker));
    if (lines.length !== 1) {
      findings.push(finding(
        "V1_EVIDENCE_OBSERVATION_INVENTORY",
        `observations.${kind}`,
        `Expected exactly one ${kind} observation, received ${String(lines.length)}.`,
      ));
      continue;
    }
    try {
      const line = lines[0];
      if (line === undefined) throw new Error("missing observation line");
      observations[kind] = record(JSON.parse(line.slice(marker.length)), kind);
    } catch (error) {
      findings.push(finding(
        "V1_EVIDENCE_OBSERVATION_JSON",
        `observations.${kind}`,
        error instanceof Error ? error.message : "Invalid observation JSON.",
      ));
    }
  }
  if (Object.keys(observations).length === 4) {
    findings.push(...validateV1ObservationRecords(observations));
  }
  return { observations, findings };
}

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

function countAttribute(value: string | undefined, name: string): number {
  if (value === undefined || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`invalid ${name} count`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${name} count`);
  return parsed;
}

export function inspectV1JUnit(xml: string): Readonly<{
  summary: V1JUnitSummary | null;
  findings: readonly V1EvidenceFinding[];
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
    const errors = countAttribute(root.get("errors") ?? "0", "errors");
    const skipped = countAttribute(root.get("skipped"), "skipped");
    const cases: Array<{ file: string; name: string }> = [];
    let observedFailures = 0;
    let observedErrors = 0;
    let observedSkipped = 0;
    const pattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
      const attributes = xmlAttributes(match[1] ?? "");
      const file = attributes.get("file")?.replaceAll("\\", "/");
      const name = attributes.get("name");
      if (file === undefined || name === undefined) {
        throw new Error("testcase requires file and name");
      }
      const body = match[2] ?? "";
      observedFailures += (body.match(/<failure\b/gu) ?? []).length;
      observedErrors += (body.match(/<error\b/gu) ?? []).length;
      observedSkipped += (body.match(/<skipped\b/gu) ?? []).length;
      cases.push({ file, name });
    }
    if (
      tests !== cases.length ||
      failures !== observedFailures ||
      errors !== observedErrors ||
      skipped !== observedSkipped
    ) throw new Error("JUnit counts do not match testcase bodies");
    const identities = cases.map(({ file, name }) => `${file}\u0000${name}`);
    if (new Set(identities).size !== identities.length) {
      throw new Error("duplicate testcase identity");
    }
    return {
      summary: {
        tests,
        assertions,
        failures,
        errors,
        skipped,
        files: [...new Set(cases.map(({ file }) => file))].sort(compare),
        cases: cases.sort((left, right) => compare(
          `${left.file}\u0000${left.name}`,
          `${right.file}\u0000${right.name}`,
        )),
      },
      findings: [],
    };
  } catch (error) {
    return {
      summary: null,
      findings: [finding(
        "V1_EVIDENCE_JUNIT",
        "suite.junit",
        error instanceof Error ? error.message : "Invalid JUnit.",
      )],
    };
  }
}

export function sanitizeV1JUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/gu,
    "$1",
  );
  if (/\bhostname\s*=/u.test(sanitized)) {
    throw new Error("V1_EVIDENCE_JUNIT_HOSTNAME");
  }
  return sanitized;
}

export function inspectV1TestControls(
  path: string,
  source: string,
): readonly V1EvidenceFinding[] {
  const findings: V1EvidenceFinding[] = [];
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const report = (node: ts.Node, code: string, message: string): void => {
    const position = parsed.getLineAndCharacterOfPosition(node.getStart());
    findings.push(finding(
      code,
      `${path}:${String(position.line + 1)}:${String(position.character + 1)}`,
      message,
    ));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && ["xit", "xdescribe"].includes(node.text)) {
      report(node, "V1_EVIDENCE_QUARANTINE", "x-prefixed test is forbidden.");
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ["failing", "only", "skip", "skipIf", "todo", "todoIf"].includes(
        node.name.text,
      )
    ) {
      report(
        node,
        node.name.text.startsWith("todo")
          ? "V1_EVIDENCE_TODO"
          : "V1_EVIDENCE_QUARANTINE",
        `Forbidden ${node.name.text} test control.`,
      );
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        /^(?:quarantine|quarantined)$/u.test(node.expression.text)
      ) {
        report(node, "V1_EVIDENCE_QUARANTINE", "Quarantine is forbidden.");
      }
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            property.name.getText(parsed).replaceAll(/["']/gu, "") === "retry"
          ) {
            report(property, "V1_EVIDENCE_RETRY", "Per-test retry is forbidden.");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return findings;
}

const ALLOWED_V1_RUNTIME_IMPORTS = Object.freeze([
  "../domain",
  "./resolution-contract",
  "./voice-assignment-contract",
  "./voicing-candidates-contract",
  "./voicing-engine-primitives",
] as const);

export function inspectV1ProductionBoundary(
  sources: Readonly<Record<string, string>>,
): Readonly<{
  observation: JsonRecord;
  findings: readonly V1EvidenceFinding[];
}> {
  const findings: V1EvidenceFinding[] = [];
  const imports: Record<string, readonly string[]> = {};
  const forbiddenReferences: Array<Readonly<{
    file: string;
    token: string;
    line: number;
    column: number;
  }>> = [];
  for (const [path, source] of Object.entries(sources).sort(([left], [right]) =>
    compare(left, right)
  )) {
    const parsed = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const fileImports: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;
        fileImports.push(specifier);
        if (!ALLOWED_V1_RUNTIME_IMPORTS.includes(
          specifier as (typeof ALLOWED_V1_RUNTIME_IMPORTS)[number],
        )) {
          const position = parsed.getLineAndCharacterOfPosition(node.getStart());
          findings.push(finding(
            "V1_EVIDENCE_PRODUCTION_IMPORT",
            `${path}:${String(position.line + 1)}:${String(position.character + 1)}`,
            `V1 production import ${specifier} is outside the pure theory boundary.`,
            "V1-TRACE-BOUNDARY",
          ));
        }
      }
      if (ts.isIdentifier(node) && [
        "AudioContext",
        "Date",
        "EventSource",
        "Math",
        "SharedWorker",
        "WebSocket",
        "Worker",
        "XMLHttpRequest",
        "fetch",
        "indexedDB",
        "localStorage",
        "navigator",
        "performance",
        "sessionStorage",
      ].includes(node.text)) {
        const parent = node.parent;
        const harmlessMath = node.text === "Math" &&
          ts.isPropertyAccessExpression(parent) && parent.name.text !== "random";
        if (!harmlessMath) {
          const position = parsed.getLineAndCharacterOfPosition(node.getStart());
          forbiddenReferences.push({
            file: path,
            token: node.text,
            line: position.line + 1,
            column: position.character + 1,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    imports[path] = Object.freeze(fileImports);
  }
  if (forbiddenReferences.length > 0) {
    findings.push(finding(
      "V1_EVIDENCE_AMBIENT_REFERENCE",
      "production",
      "V1 production must not depend on clocks, randomness, browser, audio, storage, worker, or network state.",
      "V1-TRACE-BOUNDARY",
    ));
  }
  return {
    observation: {
      schema: "changes.evidence.v1-static-boundary-observation.v1",
      productionFiles: Object.keys(sources).sort(compare),
      productionFileDigests: Object.fromEntries(
        Object.entries(sources).sort(([left], [right]) => compare(left, right))
          .map(([path, source]) => [path, v1EvidenceDigest(source)]),
      ),
      runtimeImports: imports,
      allowedRuntimeImports: ALLOWED_V1_RUNTIME_IMPORTS,
      forbiddenReferences,
      wallTimeSemanticReferences: forbiddenReferences.filter(({ token }) =>
        token === "Date" || token === "performance"
      ).length,
      randomSemanticReferences: forbiddenReferences.filter(({ token }) =>
        token === "Math"
      ).length,
      runtimeAiOrNetworkReferences: forbiddenReferences.filter(({ token }) =>
        ["EventSource", "WebSocket", "XMLHttpRequest", "fetch"].includes(token)
      ).length,
      status: findings.length === 0 ? "pass" : "fail",
    },
    findings,
  };
}

function observationRecord(
  observations: Partial<Record<ObservationKind, JsonRecord>>,
  key: ObservationKind,
): JsonRecord {
  return observations[key] ?? {};
}

export function buildV1TraceEvidence(
  observations: Partial<Record<ObservationKind, JsonRecord>>,
): readonly JsonRecord[] {
  const production = observationRecord(observations, "production");
  const mutation = observationRecord(observations, "mutation");
  const assignmentDigests = isRecord(production["caseObservationDigests"])
    ? production["caseObservationDigests"]
    : {};
  const boundaryDigests = isRecord(
      production["publicBoundaryObservationDigests"],
    )
    ? production["publicBoundaryObservationDigests"]
    : {};
  const mutationRows = records(mutation["counterfactualExecutions"]);
  const mutationCaseDigests = Object.fromEntries(
    [...new Set(mutationRows.map((row) => String(row["caseId"])))]
      .sort(compare)
      .map((caseId) => [
        caseId,
        v1EvidenceDigest(mutationRows.filter((row) => row["caseId"] === caseId)),
      ]),
  );
  const caseDigests: JsonRecord = {
    ...mutationCaseDigests,
    ...assignmentDigests,
    ...boundaryDigests,
  };
  const controlDigests = isRecord(mutation["controlExecutionDigests"])
    ? mutation["controlExecutionDigests"]
    : {};
  return traceFixture.traces.map((trace) => {
    const missingCaseIds = trace.caseIds.filter((id) => !isSha256(caseDigests[id]));
    const missingControlIds = trace.mutationControlIds.filter((id) =>
      !isSha256(controlDigests[id])
    );
    const caseEvidenceSha256 = Object.fromEntries(
      trace.caseIds.filter((id) => isSha256(caseDigests[id])).map((id) => [
        id,
        caseDigests[id],
      ]),
    );
    const controlEvidenceSha256 = Object.fromEntries(
      trace.mutationControlIds.filter((id) => isSha256(controlDigests[id]))
        .map((id) => [id, controlDigests[id]]),
    );
    const row = {
      id: trace.id,
      invariant: trace.invariant,
      caseIds: trace.caseIds,
      mutationControlIds: trace.mutationControlIds,
      authorityIds: trace.authorityIds,
      caseEvidenceSha256,
      controlEvidenceSha256,
      missingCaseIds,
      missingControlIds,
      outcome:
        missingCaseIds.length === 0 && missingControlIds.length === 0
          ? "pass"
          : "fail",
    };
    return { ...row, evidenceSha256: v1EvidenceDigest(row) };
  });
}

function junitHas(
  junit: V1JUnitSummary | null,
  expected: Readonly<{ file: string; testcase: string }>,
): boolean {
  return junit !== null && junit.cases.some(({ file, name }) =>
    file === expected.file && name.includes(expected.testcase)
  );
}

export function validateV1RequiredJUnitCases(
  junit: V1JUnitSummary | null,
): readonly V1EvidenceFinding[] {
  return V1_REQUIRED_JUNIT_CASES.filter((expected) => !junitHas(junit, expected))
    .map((expected) => finding(
      "V1_EVIDENCE_REQUIRED_TEST",
      `${expected.file}#${expected.testcase}`,
      "Required V1 evidence owner did not execute in the focused JUnit suite.",
    ));
}

export function buildV1NamedCriteria(
  observations: Partial<Record<ObservationKind, JsonRecord>>,
  traces: readonly JsonRecord[],
  junit: V1JUnitSummary | null,
  staticObservation: JsonRecord,
  validatorPassed: boolean,
): readonly JsonRecord[] {
  const production = observationRecord(observations, "production");
  const mutation = observationRecord(observations, "mutation");
  const accounting = observationRecord(observations, "accounting");
  const transposition = observationRecord(observations, "transposition");
  const passingTraceIds = new Set(
    traces.filter((trace) => trace["outcome"] === "pass")
      .map((trace) => String(trace["id"])),
  );
  const traceCriterion = (id: string, required: readonly string[]): JsonRecord => {
    const missing = required.filter((traceId) => !passingTraceIds.has(traceId));
    return {
      id,
      evidenceKind: "trace-ledger",
      requiredTraceIds: required,
      missingTraceIds: missing,
      outcome: missing.length === 0 ? "pass" : "fail",
    };
  };
  const rows: JsonRecord[] = [
    {
      id: "V1-CRITERION-CONTRACT",
      evidenceKind: "independent-validator",
      validatorPassed,
      outcome: validatorPassed ? "pass" : "fail",
    },
    {
      id: "V1-CRITERION-ASSIGNMENT-CASES",
      evidenceKind: "runtime-observation",
      expected: V1_EXPECTED_COUNTS.assignmentCases,
      observed: records(production["caseObservations"]).length,
      outcome:
        records(production["caseObservations"]).length ===
            V1_EXPECTED_COUNTS.assignmentCases &&
          validateProductionObservation(production).filter(({ code }) =>
            code === "V1_EVIDENCE_PRODUCTION" ||
            code === "V1_EVIDENCE_PRODUCTION_CASE"
          ).length === 0
          ? "pass"
          : "fail",
    },
    {
      id: "V1-CRITERION-PUBLIC-BOUNDARIES",
      evidenceKind: "runtime-exact-near-observation",
      expected: V1_EXPECTED_COUNTS.publicLimitCases,
      observed: records(production["publicBoundaryObservations"]).length,
      outcome:
        records(production["publicBoundaryObservations"]).length ===
            V1_EXPECTED_COUNTS.publicLimitCases &&
          validateProductionObservation(production).filter(({ code }) =>
            code.startsWith("V1_EVIDENCE_PUBLIC_LIMIT")
          ).length === 0
          ? "pass"
          : "fail",
    },
    {
      id: "V1-CRITERION-BRUTE-FORCE-ORACLE",
      evidenceKind: "independent-all-path-oracle",
      owner: "tests/property/v1-assignment-oracle.test.ts",
      outcome: junitHas(junit, V1_REQUIRED_JUNIT_CASES[4]) ? "pass" : "fail",
    },
    {
      id: "V1-CRITERION-TRANSPOSITION",
      evidenceKind: "metamorphic-octave-transposition",
      expectedScenarios: V1_TRANSPOSITION_CASE_IDS.length,
      observed: records(transposition["observations"]).length,
      outcome: validateTranspositionObservation(transposition).length === 0 &&
          junitHas(junit, V1_REQUIRED_JUNIT_CASES[6]) &&
          junitHas(junit, V1_REQUIRED_JUNIT_CASES[7])
        ? "pass"
        : "fail",
    },
    {
      id: "V1-CRITERION-ACCOUNTING",
      evidenceKind: "exact-plus-one-test-seam",
      expected: V1_EXPECTED_COUNTS.derivedLimitProbes,
      observed: records(accounting["cases"]).length,
      outcome: validateAccountingObservation(accounting).length === 0
        ? "pass"
        : "fail",
    },
    {
      id: "V1-CRITERION-MUTATIONS",
      evidenceKind: "semantic-counterfactual",
      expectedControls: V1_EXPECTED_COUNTS.mutationControls,
      expectedLinks: V1_EXPECTED_COUNTS.mutationLinks,
      outcome: validateMutationObservation(mutation).length === 0
        ? "pass"
        : "fail",
    },
    {
      id: "V1-CRITERION-DETERMINISTIC-REPLAY",
      evidenceKind: "byte-equivalent-result-digests",
      replays: production["deterministicReplays"],
      seed: {
        kind: "none",
        reason:
          "V1 uses reviewed literal fixtures and exhaustive finite enumeration; no random input participates.",
      },
      outcome:
        production["deterministicReplays"] ===
          V1_EXPECTED_COUNTS.assignmentCases
          ? "pass"
          : "fail",
    },
    {
      id: "V1-CRITERION-BOUNDARY",
      evidenceKind: "typescript-ast-boundary",
      outcome: staticObservation["status"] === "pass" ? "pass" : "fail",
    },
    traceCriterion("V1-CRITERION-IDENTITY", [
      "V1-TRACE-IDENTITY",
      "V1-TRACE-VOICE-IDS",
      "V1-TRACE-LEGACY",
    ]),
    traceCriterion("V1-CRITERION-LOCKS-REFUSALS", [
      "V1-TRACE-LOCKS",
      "V1-TRACE-REFUSALS",
    ]),
    traceCriterion("V1-CRITERION-MOTION-COSTS", [
      "V1-TRACE-COSTS",
      "V1-TRACE-GAPS",
      "V1-TRACE-GUIDE-TONES",
      "V1-TRACE-MOTION",
    ]),
    traceCriterion("V1-CRITERION-DP-TIES", [
      "V1-TRACE-DP-ORDER",
      "V1-TRACE-TIES",
    ]),
    traceCriterion("V1-CRITERION-IMMUTABILITY", [
      "V1-TRACE-IMMUTABILITY",
      "V1-TRACE-DETERMINISM",
    ]),
    traceCriterion("V1-CRITERION-LIMITS", ["V1-TRACE-LIMITS"]),
  ];
  return rows.map((row) => ({
    ...row,
    evidenceSha256: v1EvidenceDigest(row),
  }));
}

export async function snapshotV1EvidenceInputs(): Promise<Readonly<{
  snapshot: V1InputSnapshot;
  findings: readonly V1EvidenceFinding[];
  controls: readonly V1EvidenceFinding[];
}>> {
  const pathsByGroup = new Map<string, string>();
  const findings: V1EvidenceFinding[] = [];
  const controls: V1EvidenceFinding[] = [];
  for (const [group, paths] of Object.entries(V1_INPUT_GROUPS)) {
    for (const path of paths) {
      const previous = pathsByGroup.get(path);
      if (previous !== undefined) {
        findings.push(finding(
          "V1_EVIDENCE_INPUT_DUPLICATE",
          path,
          `Input appears in ${previous} and ${group}.`,
        ));
      } else {
        pathsByGroup.set(path, group);
      }
    }
  }
  const components: InputComponent[] = [];
  for (const [path, group] of [...pathsByGroup].sort(([left], [right]) =>
    compare(left, right)
  )) {
    const file = Bun.file(path);
    if (!await file.exists()) {
      findings.push(finding(
        "V1_EVIDENCE_INPUT_MISSING",
        path,
        `Required ${group} input is missing.`,
      ));
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    components.push({
      group,
      path,
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    });
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) {
      controls.push(...inspectV1TestControls(
        path,
        new TextDecoder().decode(bytes),
      ));
    }
    if (
      path === "bunfig.toml" &&
      !/^retry\s*=\s*0\s*$/mu.test(new TextDecoder().decode(bytes))
    ) {
      controls.push(finding(
        "V1_EVIDENCE_RETRY",
        "bunfig.toml:[test].retry",
        "Focused V1 evidence requires retry = 0.",
      ));
    }
  }
  return {
    snapshot: {
      algorithm: "sha256-component-manifest-v1",
      digest: v1EvidenceDigest(components),
      components,
    },
    findings,
    controls,
  };
}

function parseValidatorOutput(output: string): Readonly<{
  value: JsonRecord | null;
  findings: readonly V1EvidenceFinding[];
}> {
  try {
    const value = record(JSON.parse(output), "validator output");
    const counts = record(value["counts"], "validator counts");
    if (
      value["schema"] !== "changes.validation.v1-contract.v1" ||
      value["package"] !== "V1" ||
      value["outcome"] !== "pass" ||
      counts["files"] !== V1_EXPECTED_COUNTS.fixtureFiles ||
      counts["voiceSets"] !== V1_EXPECTED_COUNTS.voiceSets ||
      counts["assignmentCases"] !== V1_EXPECTED_COUNTS.assignmentCases ||
      counts["lawCases"] !== V1_EXPECTED_COUNTS.lawCases ||
      counts["operationStateCases"] !==
        V1_EXPECTED_COUNTS.operationStateCases ||
      counts["publicLimitCases"] !== V1_EXPECTED_COUNTS.publicLimitCases ||
      counts["derivedLimitProbes"] !==
        V1_EXPECTED_COUNTS.derivedLimitProbes ||
      counts["mutationControls"] !== V1_EXPECTED_COUNTS.mutationControls ||
      counts["traces"] !== V1_EXPECTED_COUNTS.traces ||
      counts["authorities"] !== V1_EXPECTED_COUNTS.authorities ||
      !Array.isArray(value["findings"]) ||
      value["findings"].length !== 0
    ) throw new Error("validator identity, counts, or findings are not exact");
    return { value, findings: [] };
  } catch (error) {
    return {
      value: null,
      findings: [finding(
        "V1_EVIDENCE_VALIDATOR_OUTPUT",
        "validator.stdout",
        error instanceof Error ? error.message : "Invalid validator output.",
      )],
    };
  }
}

export function v1EvidenceRunId(inputDigest: string): string {
  return v1EvidenceDigest({
    toolVersion: TOOL_VERSION,
    inputDigest,
    fixtureVersion: contractFixture.fixtureVersion,
    engineVersion: contractFixture.identity.engineVersionTag,
  }).slice(0, 24);
}

export function v1EvidencePaths(runId: string): Readonly<{
  directory: string;
  junit: string;
  stdout: string;
  stderr: string;
  validatorStdout: string;
  validatorStderr: string;
  metadata: string;
}> {
  const directory = `test-results/v1/${runId}`;
  return Object.freeze({
    directory,
    junit: `${directory}/suite.junit.xml`,
    stdout: `${directory}/suite.stdout.log`,
    stderr: `${directory}/suite.stderr.log`,
    validatorStdout: `${directory}/validator.stdout.json`,
    validatorStderr: `${directory}/validator.stderr.log`,
    metadata: `${directory}/run-metadata.json`,
  });
}

function runEnvironment(runId: string): Readonly<Record<string, string>> {
  return Object.freeze({
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    V1_EVIDENCE_RUN_ID: runId,
  });
}

function environmentEvidence(): JsonRecord {
  const processors = cpus();
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return {
    bun: Bun.version,
    nodeCompatibility: process.versions.node,
    typescript: ts.version,
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

export function focusedV1SuiteCommand(runId: string): readonly string[] {
  return Object.freeze([
    "bun",
    "test",
    ...V1_FOCUSED_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--reporter=junit",
    `--reporter-outfile=${v1EvidencePaths(runId).junit}`,
  ]);
}

function validatorCommand(): readonly string[] {
  return Object.freeze(["bun", "scripts/validate-v1-contract.ts"]);
}

async function atomicWrite(
  path: string,
  value: string | Uint8Array,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await Bun.write(temporary, value);
  await rename(temporary, path);
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
    env: { ...process.env, ...environment },
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
    ? "kilobytes"
    : platform() === "darwin" ? "bytes" : "runtime-defined";
  const maxRssBytes = maxRssRaw === null
    ? null
    : maxRssRawUnit === "kilobytes"
    ? maxRssRaw * 1_024
    : maxRssRawUnit === "bytes" ? maxRssRaw : null;
  return {
    command,
    environment,
    stdoutPath,
    stderrPath,
    stdoutSha256: sha256Bytes(stdout),
    stderrSha256: sha256Bytes(stderr),
    exitCode,
    signal: child.signalCode,
    elapsedMs: Math.round((performance.now() - started) * 1_000) / 1_000,
    resourceUsage: {
      measurement: "Bun.Subprocess.resourceUsage",
      maxRssRaw,
      maxRssRawUnit,
      maxRssBytes,
      cpuUserMicros: safeUsageNumber(usage?.cpuTime.user),
      cpuSystemMicros: safeUsageNumber(usage?.cpuTime.system),
      gating: false,
    },
    stdout,
    stderr,
  };
}

function withoutBuffers(
  value: RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>,
): RawExecution {
  const { stdout: _stdout, stderr: _stderr, ...rest } = value;
  void _stdout;
  void _stderr;
  return rest;
}

function componentDigestMap(
  snapshot: V1InputSnapshot,
  group: string,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    snapshot.components.filter((component) => component.group === group)
      .map(({ path, sha256 }) => [path, sha256]),
  );
}

function productionBoundarySources(
  snapshot: V1InputSnapshot,
): Promise<Readonly<Record<string, string>>> {
  const paths = snapshot.components
    .filter(({ path }) =>
      path === "src/theory/voice-assignment-contract.ts" ||
      path === "src/theory/voice-assignment.ts"
    )
    .map(({ path }) => path)
    .sort(compare);
  return Promise.all(paths.map(async (path) => [
    path,
    await Bun.file(path).text(),
  ] as const)).then((entries) => Object.freeze(Object.fromEntries(entries)));
}

export const V1_NAMED_CRITERION_IDS = Object.freeze([
  "V1-CRITERION-CONTRACT",
  "V1-CRITERION-ASSIGNMENT-CASES",
  "V1-CRITERION-PUBLIC-BOUNDARIES",
  "V1-CRITERION-BRUTE-FORCE-ORACLE",
  "V1-CRITERION-TRANSPOSITION",
  "V1-CRITERION-ACCOUNTING",
  "V1-CRITERION-MUTATIONS",
  "V1-CRITERION-DETERMINISTIC-REPLAY",
  "V1-CRITERION-BOUNDARY",
  "V1-CRITERION-IDENTITY",
  "V1-CRITERION-LOCKS-REFUSALS",
  "V1-CRITERION-MOTION-COSTS",
  "V1-CRITERION-DP-TIES",
  "V1-CRITERION-IMMUTABILITY",
  "V1-CRITERION-LIMITS",
] as const);

function evidenceRowsAccepted(
  value: unknown,
  expectedIds: readonly string[],
): boolean {
  const rows = records(value);
  return JSON.stringify(rows.map((row) => row["id"])) ===
      JSON.stringify(expectedIds) &&
    rows.every((row) =>
      row["outcome"] === "pass" &&
      isSha256(row["evidenceSha256"]) &&
      row["evidenceSha256"] ===
        v1EvidenceDigest(withoutKey(row, "evidenceSha256"))
    );
}

export function validateV1EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): readonly V1EvidenceFinding[] {
  if (!isRecord(candidate)) {
    return [finding(
      "V1_EVIDENCE_LEDGER_SHAPE",
      OUTPUT_PATH,
      "Evidence ledger must be an object.",
    )];
  }
  const findings: V1EvidenceFinding[] = [];
  if (
    candidate["schema"] !== "changes.evidence.v1.v1" ||
    candidate["schemaVersion"] !== 1 ||
    candidate["package"] !== "V1" ||
    candidate["toolVersion"] !== TOOL_VERSION ||
    candidate["outcome"] !== "pass" ||
    !Array.isArray(candidate["findings"]) ||
    candidate["findings"].length !== 0
  ) {
    findings.push(finding(
      "V1_EVIDENCE_LEDGER_IDENTITY",
      OUTPUT_PATH,
      "Evidence identity or passing status is invalid.",
    ));
  }
  const expectedRunId = v1EvidenceRunId(currentInputDigest);
  if (candidate["runId"] !== expectedRunId) {
    findings.push(finding(
      "V1_EVIDENCE_RUN_ID",
      `${OUTPUT_PATH}#runId`,
      "Run ID must derive from current inputs and V1 identities.",
    ));
  }
  const input = isRecord(candidate["input"]) ? candidate["input"] : {};
  const pre = isRecord(input["pre"]) ? input["pre"] : {};
  const post = isRecord(input["post"]) ? input["post"] : {};
  if (
    pre["digest"] !== currentInputDigest ||
    post["digest"] !== currentInputDigest
  ) {
    findings.push(finding(
      "V1_EVIDENCE_INPUT_STALE",
      `${OUTPUT_PATH}#input`,
      "Pre, post, and current input snapshots must match.",
    ));
  }
  if (!exactRecord(candidate["applicability"], V1_APPLICABILITY)) {
    findings.push(finding(
      "V1_EVIDENCE_APPLICABILITY",
      `${OUTPUT_PATH}#applicability`,
      "Pure-operation applicability and downstream ownership drifted.",
    ));
  }
  const seed = isRecord(candidate["seed"]) ? candidate["seed"] : {};
  if (
    seed["kind"] !== "none" ||
    seed["randomInputs"] !== 0 ||
    seed["wallTimeAffectedSelection"] !== false ||
    seed["oracle"] !== "exhaustive-reviewed-small-cases"
  ) {
    findings.push(finding(
      "V1_EVIDENCE_SEED",
      `${OUTPUT_PATH}#seed`,
      "V1 must record that no random seed or wall-time cutoff participates in assignment.",
      "V1-TRACE-DETERMINISM",
    ));
  }
  const suite = isRecord(candidate["suite"]) ? candidate["suite"] : {};
  if (
    suite["exitCode"] !== 0 ||
    suite["failures"] !== 0 ||
    suite["errors"] !== 0 ||
    suite["skipped"] !== 0 ||
    suite["retries"] !== 0 ||
    suite["quarantined"] !== 0 ||
    !exactRecord(suite["files"], V1_FOCUSED_TEST_FILES) ||
    !Array.isArray(suite["cases"])
  ) {
    findings.push(finding(
      "V1_EVIDENCE_SUITE",
      `${OUTPUT_PATH}#suite`,
      "The exact focused suite must pass without skip, retry, or quarantine.",
    ));
  }
  const candidateJunit: V1JUnitSummary | null = Array.isArray(suite["cases"])
    ? {
        tests: Number(suite["tests"]),
        assertions: Number(suite["assertions"]),
        failures: Number(suite["failures"]),
        errors: Number(suite["errors"]),
        skipped: Number(suite["skipped"]),
        files: strings(suite["files"]),
        cases: records(suite["cases"]).flatMap((row) =>
          typeof row["file"] === "string" && typeof row["name"] === "string"
            ? [{ file: row["file"], name: row["name"] }]
            : []
        ),
      }
    : null;
  findings.push(...validateV1RequiredJUnitCases(candidateJunit));
  const validator = isRecord(candidate["validator"])
    ? candidate["validator"]
    : {};
  if (
    validator["exitCode"] !== 0 ||
    validator["schema"] !== "changes.validation.v1-contract.v1" ||
    validator["outcome"] !== "pass"
  ) {
    findings.push(finding(
      "V1_EVIDENCE_VALIDATOR",
      `${OUTPUT_PATH}#validator`,
      "Independent V1 contract validation must pass with exact counts.",
    ));
  }
  const observations = isRecord(candidate["observations"])
    ? candidate["observations"]
    : {};
  findings.push(...validateV1ObservationRecords({
    production: isRecord(observations["production"])
      ? observations["production"]
      : {},
    mutation: isRecord(observations["mutation"])
      ? observations["mutation"]
      : {},
    accounting: isRecord(observations["accounting"])
      ? observations["accounting"]
      : {},
    transposition: isRecord(observations["transposition"])
      ? observations["transposition"]
      : {},
  }));
  if (!evidenceRowsAccepted(
    candidate["traces"],
    traceFixture.traces.map(({ id }) => id),
  )) {
    findings.push(finding(
      "V1_EVIDENCE_TRACES",
      `${OUTPUT_PATH}#traces`,
      "All 15 trace rows must bind runtime case and counterfactual evidence.",
    ));
  }
  if (!evidenceRowsAccepted(candidate["criteria"], V1_NAMED_CRITERION_IDS)) {
    findings.push(finding(
      "V1_EVIDENCE_CRITERIA",
      `${OUTPUT_PATH}#criteria`,
      "Every named V1 success criterion requires passing bound evidence.",
    ));
  }
  const authorityIds = provenanceFixture.authorities.map(({ id }) => id);
  if (!exactStrings(candidate["authorityIds"], authorityIds)) {
    findings.push(finding(
      "V1_EVIDENCE_AUTHORITIES",
      `${OUTPUT_PATH}#authorityIds`,
      "All six reviewed authority classes must remain bound.",
    ));
  }
  const staticObservation = isRecord(candidate["staticBoundary"])
    ? candidate["staticBoundary"]
    : {};
  if (
    staticObservation["schema"] !==
      "changes.evidence.v1-static-boundary-observation.v1" ||
    staticObservation["status"] !== "pass" ||
    !Array.isArray(staticObservation["forbiddenReferences"]) ||
    staticObservation["forbiddenReferences"].length !== 0
  ) {
    findings.push(finding(
      "V1_EVIDENCE_STATIC_BOUNDARY",
      `${OUTPUT_PATH}#staticBoundary`,
      "V1 production must remain pure, synchronous, local, and ambient-state free.",
      "V1-TRACE-BOUNDARY",
    ));
  }
  const hashes = isRecord(candidate["hashes"]) ? candidate["hashes"] : {};
  if (
    !isRecord(hashes["contracts"]) ||
    !isRecord(hashes["fixtures"]) ||
    Object.keys(hashes["fixtures"]).length !== V1_EXPECTED_COUNTS.fixtureFiles ||
    !Object.values(hashes["contracts"]).every(isSha256) ||
    !Object.values(hashes["fixtures"]).every(isSha256)
  ) {
    findings.push(finding(
      "V1_EVIDENCE_HASH_INVENTORY",
      `${OUTPUT_PATH}#hashes`,
      "Exact contract and nine-file fixture hashes are required.",
    ));
  }
  const semanticDigest = candidate["semanticDigest"];
  if (
    semanticDigest !== v1EvidenceDigest(withoutKey(candidate, "semanticDigest"))
  ) {
    findings.push(finding(
      "V1_EVIDENCE_DIGEST",
      `${OUTPUT_PATH}#semanticDigest`,
      "Ledger digest does not bind its canonical payload.",
    ));
  }
  return findings.sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
}

export async function verifyV1Evidence(): Promise<JsonRecord> {
  const pre = await snapshotV1EvidenceInputs();
  const runId = v1EvidenceRunId(pre.snapshot.digest);
  const runPaths = v1EvidencePaths(runId);
  await mkdir(runPaths.directory, { recursive: true });
  const environment = runEnvironment(runId);
  const metadata = {
    schema: "changes.evidence.v1.run-metadata.v1",
    runId,
    commands: {
      validator: validatorCommand(),
      suite: focusedV1SuiteCommand(runId),
    },
    environment,
    inputDigest: pre.snapshot.digest,
    seed: {
      kind: "none",
      randomInputs: 0,
      oracle: "exhaustive-reviewed-small-cases",
      wallTimeAffectedSelection: false,
    },
  };
  await atomicWrite(runPaths.metadata, stableV1EvidenceJson(metadata));

  const validatorRun = await runRaw(
    validatorCommand(),
    environment,
    runPaths.validatorStdout,
    runPaths.validatorStderr,
  );
  const validatorParsed = parseValidatorOutput(
    new TextDecoder().decode(validatorRun.stdout),
  );
  const suiteRun = await runRaw(
    focusedV1SuiteCommand(runId),
    environment,
    runPaths.stdout,
    runPaths.stderr,
  );
  let junit = "";
  const junitFile = Bun.file(runPaths.junit);
  if (await junitFile.exists()) {
    junit = sanitizeV1JUnit(await junitFile.text());
    await atomicWrite(runPaths.junit, junit);
  }
  const inspected = inspectV1JUnit(junit);
  const parsedObservations = parseV1Observations(
    new TextDecoder().decode(suiteRun.stdout),
  );
  const post = await snapshotV1EvidenceInputs();
  const boundary = inspectV1ProductionBoundary(
    await productionBoundarySources(post.snapshot),
  );
  const traces = buildV1TraceEvidence(parsedObservations.observations);
  const validatorPassed = validatorRun.exitCode === 0 &&
    validatorParsed.value?.["outcome"] === "pass";
  const criteria = buildV1NamedCriteria(
    parsedObservations.observations,
    traces,
    inspected.summary,
    boundary.observation,
    validatorPassed,
  );
  const summary = inspected.summary;
  const suiteSummaryValid = summary !== null &&
    summary.failures === 0 &&
    summary.errors === 0 &&
    summary.skipped === 0 &&
    JSON.stringify(summary.files) === JSON.stringify(V1_FOCUSED_TEST_FILES);
  const structuralFindings = [
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...validatorParsed.findings,
    ...inspected.findings,
    ...parsedObservations.findings,
    ...boundary.findings,
    ...validateV1RequiredJUnitCases(summary),
    ...(pre.snapshot.digest === post.snapshot.digest
      ? []
      : [finding(
          "V1_EVIDENCE_INPUT_CHANGED",
          "input",
          "Evidence inputs changed during execution.",
        )]),
    ...(validatorRun.exitCode === 0
      ? []
      : [finding(
          "V1_EVIDENCE_VALIDATOR_EXIT",
          "validator",
          `Validator exited ${String(validatorRun.exitCode)}.`,
        )]),
    ...(suiteRun.exitCode === 0
      ? []
      : [finding(
          "V1_EVIDENCE_SUITE_EXIT",
          "suite",
          `Focused suite exited ${String(suiteRun.exitCode)}.`,
        )]),
    ...(suiteSummaryValid
      ? []
      : [finding(
          "V1_EVIDENCE_SUITE_SUMMARY",
          "suite.junit",
          "JUnit must contain the exact focused files with zero failure, error, or skip.",
        )]),
    ...traces.filter((trace) => trace["outcome"] !== "pass").map((trace) =>
      finding(
        "V1_EVIDENCE_TRACE",
        `traces#${String(trace["id"])}`,
        "Trace is missing required runtime case or mutation evidence.",
        String(trace["id"]),
      )
    ),
    ...criteria.filter((criterion) => criterion["outcome"] !== "pass")
      .map((criterion) => finding(
        "V1_EVIDENCE_CRITERION",
        `criteria#${String(criterion["id"])}`,
        "Named package criterion is missing complete independent evidence.",
      )),
  ];
  const uniqueFindings = [...new Map(structuralFindings.map((item) => [
    `${item.code}\u0000${item.path}\u0000${item.message}`,
    item,
  ])).values()].sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
  const validatorRecord = {
    ...withoutBuffers(validatorRun),
    schema: validatorParsed.value?.["schema"] ?? null,
    outcome: validatorParsed.value?.["outcome"] ?? "fail",
    counts: validatorParsed.value?.["counts"] ?? null,
  };
  const suiteRecord = {
    ...withoutBuffers(suiteRun),
    junitPath: runPaths.junit,
    junitSha256: sha256Bytes(new TextEncoder().encode(junit)),
    tests: summary?.tests ?? null,
    assertions: summary?.assertions ?? null,
    failures: summary?.failures ?? null,
    errors: summary?.errors ?? null,
    skipped: summary?.skipped ?? null,
    files: summary?.files ?? [],
    cases: summary?.cases ?? [],
    retries: 0,
    quarantined: 0,
  };
  const payload: JsonRecord = {
    schema: "changes.evidence.v1.v1",
    schemaVersion: 1,
    package: "V1",
    toolVersion: TOOL_VERSION,
    runId,
    outcome: uniqueFindings.length === 0 ? "pass" : "fail",
    findings: uniqueFindings,
    environment: environmentEvidence(),
    seed: {
      kind: "none",
      randomInputs: 0,
      oracle: "exhaustive-reviewed-small-cases",
      wallTimeAffectedSelection: false,
      deterministicFixtureOrder: true,
    },
    applicability: V1_APPLICABILITY,
    input: { pre: pre.snapshot, post: post.snapshot },
    hashes: {
      contracts: componentDigestMap(post.snapshot, "contracts"),
      fixtures: componentDigestMap(post.snapshot, "authority"),
      production: componentDigestMap(post.snapshot, "production"),
      harness: componentDigestMap(post.snapshot, "harness"),
      review: componentDigestMap(post.snapshot, "review"),
      tooling: componentDigestMap(post.snapshot, "tooling"),
    },
    validator: validatorRecord,
    suite: suiteRecord,
    observations: parsedObservations.observations,
    staticBoundary: boundary.observation,
    traces,
    criteria,
    authorityIds: provenanceFixture.authorities.map(({ id }) => id),
    inventory: {
      assignmentCaseIds: assignmentCaseIds(),
      lawCaseIds: lawFixture.cases.map(({ id }) => id),
      operationStateCaseIds: operationFixture.cases.map(({ id }) => id),
      publicLimitCaseIds: publicLimitIds(),
      derivedLimitProbeIds:
        limitFixture.derivedAccountingProbes.map(({ id }) => id),
      mutationControlIds: mutationControlIds(),
      traceIds: traceFixture.traces.map(({ id }) => id),
      legacyRegressionIds:
        contractFixture.legacyRegressionOwnership.map(({ id }) => id),
    },
    runMetadata: {
      path: runPaths.metadata,
      sha256: sha256Bytes(
        new Uint8Array(await Bun.file(runPaths.metadata).arrayBuffer()),
      ),
    },
  };
  return { ...payload, semanticDigest: v1EvidenceDigest(payload) };
}

if (import.meta.main) {
  const evidence = await verifyV1Evidence();
  await atomicWrite(OUTPUT_PATH, stableV1EvidenceJson(evidence));
  const current = await snapshotV1EvidenceInputs();
  const findings = [
    ...current.findings,
    ...current.controls,
    ...validateV1EvidenceCandidate(evidence, current.snapshot.digest),
  ];
  console.log(stableV1EvidenceJson({
    schema: "changes.evidence.v1-verification-result.v1",
    package: "V1",
    outcome: findings.length === 0 ? "pass" : "fail",
    runId: evidence["runId"],
    evidencePath: OUTPUT_PATH,
    counts: V1_EXPECTED_COUNTS,
    findings,
  }));
  if (findings.length > 0) process.exitCode = 1;
}
