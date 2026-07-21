import { mkdir } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";

import ts from "typescript";

import { atomicWrite, sha256Hex, stableJson } from "./foundation-io";
import { findRealNode } from "./toolchain-doctor";

import allRootFixture from "../tests/fixtures/resolution/all-root-cases.json";
import customFixture from "../tests/fixtures/resolution/custom-cases.json";
import formulaFixture from "../tests/fixtures/resolution/formula-rules.json";
import lawFixture from "../tests/fixtures/resolution/law-cases.json";
import literalFixture from "../tests/fixtures/resolution/literal-cases.json";
import manifestFixture from "../tests/fixtures/resolution/t1-resolution-contract.json";
import mutationFixture from "../tests/fixtures/resolution/mutation-controls.json";
import operationFixture from "../tests/fixtures/resolution/operation-state-cases.json";
import provenanceFixture from "../tests/fixtures/resolution/provenance-ledger.json";
import spellingFixture from "../tests/fixtures/resolution/spelling-cases.json";
import traceFixture from "../tests/fixtures/resolution/trace-ledger.json";

type JsonRecord = Record<string, unknown>;
type Outcome = "pass" | "fail";

export type T1ObservationProducer = Readonly<{
  file: string;
  testcase: string;
}>;

export type T1CaseObservationRecord = Readonly<{
  caseId: string;
  producer: T1ObservationProducer;
  payload: unknown;
  observationDigest: string;
}>;

export type T1EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
  traceId: string | null;
}>;

export type T1JUnitSummary = Readonly<{
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

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
  signal: string | null;
  elapsedMs: number;
  resourceUsage: ProcessResourceUsage;
}>;

type SuiteEvidence = RawExecution & Readonly<{
  junitPath: string;
  junitSha256: string;
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  todos: number;
  retries: number;
  quarantined: number;
  expectedFailures: number;
  files: readonly string[];
  cases: readonly Readonly<{ file: string; name: string }>[];
}>;

export type T1CaseBinding = Readonly<{
  caseId: string;
  fixturePath: string;
  fixtureRecordSha256: string;
}>;

export type T1TraceEvidence = Readonly<{
  traceId: string;
  requirement: string;
  sourceRefs: readonly string[];
  requiredCaseIds: readonly string[];
  requiredMutationControlIds: readonly string[];
  caseEvidence: readonly Readonly<{
    caseId: string;
    fixturePath: string;
    fixtureRecordSha256: string;
    evidenceKind: "runtime-observation";
    evidenceSha256: string;
    producerFile: string;
    producerTestcase: string;
  }>[];
  mutationObservationSha256: string;
  testFiles: readonly string[];
  evidencePaths: readonly string[];
  observedTests: number;
  outcome: Outcome;
}>;

export type T1MutationEvidenceRow = Readonly<{
  controlId: string;
  operator: string;
  mutatedFault: string;
  expectedDetection: string;
  killedByCaseIds: readonly string[];
  corroboratedByCaseIds: readonly string[];
  directKillEvidence: readonly Readonly<{
    caseId: string;
    fixturePath: string;
    fixtureRecordSha256: string;
    observationSha256: string;
    producerFile: string;
    producerTestcase: string;
  }>[];
  corroborativeEvidence: readonly Readonly<{
    caseId: string;
    fixturePath: string;
    fixtureRecordSha256: string;
    observationSha256: string;
    producerFile: string;
    producerTestcase: string;
    reasonCode: string;
    reason: string;
  }>[];
  controlObservationSha256: string;
  semanticCounterfactualExecutionSha256: string;
  semanticCounterfactualKilled: boolean;
  outcome: Outcome;
}>;

export type T1EvidenceLedger = Readonly<{
  schema: "changes.evidence.t1.v1";
  schemaVersion: 1;
  package: "T1";
  traceId: "T1";
  contractVersion: string;
  contractSchema: string;
  runId: string;
  toolVersion: "jcpe.verify-t1-evidence.v1";
  mode: "focused-package";
  outcome: Outcome;
  findings: readonly T1EvidenceFinding[];
  artifact: Readonly<{
    path: "jazz_chord_progression_editor.html";
    sha256: string;
    bytes: number;
  }>;
  browserVersions: readonly [];
  input: Readonly<{ pre: InputSnapshot; post: InputSnapshot }>;
  fixtureBindings: readonly InputComponent[];
  caseBindings: readonly T1CaseBinding[];
  environment: Readonly<{
    bun: string;
    nodeCompatibility: string;
    compilerNodePath: string;
    compilerNodeVersion: string;
    compilerNodeMajor: number;
    compilerNodeBytes: number;
    compilerNodeSha256: string;
    platform: string;
    release: string;
    architecture: string;
    cpuCount: number;
    cpuModel: string;
    totalMemoryBytes: number;
    locale: string;
    timeZone: string;
  }>;
  versions: readonly Readonly<{ name: string; version: string }>[];
  reviewedCounts: Readonly<Record<string, number>>;
  applicability: readonly Readonly<{
    id: string;
    applicability: "applicable" | "not-applicable" | "deferred";
    owner: string;
    reason: string;
  }>[];
  runMetadata: Readonly<{
    schema: "changes.evidence.t1.run-metadata.v1";
    path: string;
    sha256: string;
  }>;
  validator: RawExecution & Readonly<{
    schema: string;
    outcome: Outcome;
    counts: Readonly<Record<string, number>>;
    findings: readonly unknown[];
  }>;
  suite: SuiteEvidence;
  observations: readonly JsonRecord[];
  traces: readonly T1TraceEvidence[];
  mutationEvidence: Readonly<{
    classification: "executable-semantic-counterfactuals-with-corroborative-observations-not-source-mutant-execution";
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
    reviewedLinkInventorySha256: string;
    directLinkInventorySha256: string;
    corroborativeLinkInventorySha256: string;
    sourceMutantsExecuted: 0;
    sourceMutantsKilled: 0;
    rows: readonly T1MutationEvidenceRow[];
    outcome: Outcome;
  }>;
}>;

const TOOL_VERSION = "jcpe.verify-t1-evidence.v1" as const;
const OUTPUT_PATH = "test-results/t1-evidence-ledger.json";
const PRODUCTION_MARKER = "T1_EVIDENCE_OBSERVATION ";
const CONFORMANCE_MARKER = "T1_CONFORMANCE_OBSERVATION ";
const PRODUCTION_SCHEMA =
  "changes.evidence.t1-production-conformance-observation.v1";
const CONFORMANCE_SCHEMA = "changes.evidence.t1-conformance-observation.v1";

export const T1_PRODUCTION_PRODUCER = Object.freeze({
  file: "tests/conformance/t1-production-conformance.test.ts",
  testcase: "executes the complete independent T1 authority and emits one bound observation",
} as const);

export const T1_LAWS_PRODUCER = Object.freeze({
  file: "tests/conformance/t1-laws-mutation-controls.test.ts",
  testcase: "executes every law witness and discharges every reviewed control deterministically",
} as const);

export const T1_FIXTURE_FILES = Object.freeze([
  "tests/fixtures/resolution/all-root-cases.json",
  "tests/fixtures/resolution/custom-cases.json",
  "tests/fixtures/resolution/formula-rules.json",
  "tests/fixtures/resolution/law-cases.json",
  "tests/fixtures/resolution/literal-cases.json",
  "tests/fixtures/resolution/mutation-controls.json",
  "tests/fixtures/resolution/operation-state-cases.json",
  "tests/fixtures/resolution/provenance-ledger.json",
  "tests/fixtures/resolution/spelling-cases.json",
  "tests/fixtures/resolution/t1-resolution-contract.json",
  "tests/fixtures/resolution/trace-ledger.json",
] as const);

export const T1_FOCUSED_TEST_FILES = Object.freeze([
  "tests/conformance/t1-laws-mutation-controls.test.ts",
  "tests/conformance/t1-production-conformance.test.ts",
  "tests/integration/t1-formula-matrix.test.ts",
  "tests/integration/t1-resolution-evidence.test.ts",
  "tests/integration/t1-theory-package.test.ts",
  "tests/static/dependency-boundaries.test.ts",
  "tests/static/t1-contract.test.ts",
  "tests/static/t1-evidence.test.ts",
  "tests/static/t1-type-contract.test.ts",
  "tests/static/validated-document-cast-policy.test.ts",
  "tests/unit/t1-chord-resolution.test.ts",
  "tests/unit/t1-degree-spelling.test.ts",
] as const);

export const T1_EXPECTED_COUNTS = Object.freeze({
  companions: 10,
  formulaRules: 33,
  modifierRules: 8,
  alteredDominantVariants: 4,
  roots: 12,
  familySeeds: 33,
  allRootCells: 396,
  allRootDegreeSpellings: 1_824,
  publicDegreeSpellingCells: 1_750,
  literalPlanCases: 88,
  spellingCases: 16,
  customCases: 9,
  lawCases: 12,
  operationStateCases: 10,
  resolutionEvidenceRows: 12,
  operationEvidenceRows: 14,
  totalLinkedCases: 229,
  traces: 13,
  authorities: 6,
  mutationControls: 53,
  mutationLinkedCases: 90,
  mutationDirectLinks: 124,
  mutationCorroborativeLinks: 16,
  mutationLinks: 140,
});

export const T1_REVIEWED_MUTATION_LINK_INVENTORY_SHA256 =
  "fbf7124754ba69ec01ef246d4f42ba637b0f75effc95745d39a2cff55430b261" as const;
export const T1_DIRECT_MUTATION_LINK_INVENTORY_SHA256 =
  "37d96875c299e1d1411b778a9959af77ee278bff0b5bc7d60f4350db31f22bee" as const;
export const T1_CORROBORATIVE_MUTATION_LINK_INVENTORY_SHA256 =
  "d363a0332871b0b9d37b672563fb5198e834aea3b2503f45eb6b36c066cd6009" as const;

export const T1_VALIDATOR_COUNTS = Object.freeze({
  companions: 10,
  formulaRules: 33,
  modifierRules: 8,
  alteredDominantVariants: 4,
  roots: 12,
  familySeeds: 33,
  allRootCells: 396,
  allRootDegreeSpellings: 1_824,
  publicDegreeSpellingCells: 1_750,
  literalPlanCases: 88,
  spellingCases: 16,
  customCases: 9,
  lawCases: 12,
  operationStateCases: 10,
  totalLinkedCases: 229,
  traces: 13,
  authorities: 6,
  mutationControls: 53,
  mutationDirectKillerLinks: 124,
  mutationCorroborativeLinks: 16,
  mutationReviewedCaseLinks: 140,
});

export const T1_APPLICABILITY = Object.freeze([
  { id: "resolution-runtime", applicability: "applicable", owner: "T1", reason: "Both public operations and their package-private deterministic evidence seams execute against the reviewed T1 authorities." },
  { id: "deterministic-replay", applicability: "applicable", owner: "T1/verify", reason: "Complete inputs, canonical observations, termination counters, fixture records, and reviewed-control implications are hash-bound." },
  { id: "performance-observation", applicability: "applicable", owner: "T1/verify", reason: "Elapsed time, host identity, and subprocess resource usage are recorded but non-gating and portable across check hosts; semantic runtime versions and deterministic work/memory counters are gating." },
  { id: "browser", applicability: "not-applicable", owner: "U2-Q0", reason: "T1 is pure theory and names no browser adapter." },
  { id: "audio", applicability: "not-applicable", owner: "X0-X1", reason: "T1 returns immutable theory data and does not construct or call audio objects." },
  { id: "accessibility", applicability: "not-applicable", owner: "U0-Q0", reason: "T1 has no user-interface surface." },
  { id: "network", applicability: "not-applicable", owner: "F0-Q0", reason: "T1 is synchronous, offline, and imports no network capability." },
  { id: "cancellation", applicability: "not-applicable", owner: "search/application packages", reason: "T1 operations are synchronous and accept no cancellation token." },
  { id: "resume", applicability: "not-applicable", owner: "search/application packages", reason: "T1 has no resumable state or continuation." },
  { id: "stale-revision", applicability: "not-applicable", owner: "A0", reason: "T1 reads no document revision; later commands revalidate before Apply." },
  { id: "cleanup", applicability: "not-applicable", owner: "browser/audio/application packages", reason: "Pure T1 operations acquire no timer, listener, node, URL, handle, or external resource." },
  { id: "semantic-publication", applicability: "deferred", owner: "F3", reason: "F3 combines T1 with structural decoding and owns the opaque document-publication gate." },
] as const);

export const T1_INPUT_GROUPS = Object.freeze({
  contracts: [
    "AGENTS.md",
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/REBUILD_PLAN.md",
    "docs/T1_RESOLUTION_CONTRACT.md",
  ],
  artifact: ["jazz_chord_progression_editor.html"],
  configuration: [
    "bun.lock",
    "bunfig.toml",
    "package.json",
    "tsconfig*.json",
  ],
  tools: [
    "scripts/foundation-io.ts",
    "scripts/run-node-tool.ts",
    "scripts/source-policy.ts",
    "scripts/toolchain-doctor.ts",
    "scripts/validate-t1-contract.ts",
    "scripts/verify-t1-evidence.ts",
    "scripts/verify.ts",
  ],
  fixtures: [
    "tests/fixtures/foundation/*.json",
    "tests/fixtures/resolution/**/*",
    "tests/fixtures/typescript/*.d.ts",
  ],
  production: ["src/**/*"],
  tests: [...T1_FOCUSED_TEST_FILES],
});

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  return stableJson(Object.keys(value).sort(compare)) ===
    stableJson([...keys].sort(compare));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compare);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sha256Sync(value: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonicalJsonValue(item)]),
  );
}

export function t1SemanticDigest(value: JsonRecord): string {
  const unsigned = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  );
  return sha256Sync(JSON.stringify(canonicalJsonValue(unsigned)));
}

export function t1CaseObservationDigest(
  value: Pick<T1CaseObservationRecord, "caseId" | "producer" | "payload">,
): string {
  return sha256Sync(JSON.stringify(canonicalJsonValue({
    caseId: value.caseId,
    producer: value.producer,
    payload: value.payload,
  })));
}

export function t1CanonicalDigest(value: unknown): string {
  return sha256Sync(JSON.stringify(canonicalJsonValue(value)));
}

export type T1ReviewedMutationLink = Readonly<{
  controlId: string;
  caseId: string;
}>;

export type T1CorroborativeMutationLink = T1ReviewedMutationLink & Readonly<{
  reasonCode: string;
  reason: string;
}>;

export type T1ReviewedMutationLinkPartition = Readonly<{
  reviewedLinks: readonly T1ReviewedMutationLink[];
  directLinks: readonly T1ReviewedMutationLink[];
  corroborativeLinks: readonly T1CorroborativeMutationLink[];
  reviewedLinkInventorySha256: string;
  directLinkInventorySha256: string;
  corroborativeLinkInventorySha256: string;
  findings: readonly T1EvidenceFinding[];
}>;

export function inspectT1ReviewedMutationLinkPartition():
  T1ReviewedMutationLinkPartition {
  const findings: T1EvidenceFinding[] = [];
  const reviewedLinks: T1ReviewedMutationLink[] = [];
  const directLinks: T1ReviewedMutationLink[] = [];
  const corroborativeLinks: T1CorroborativeMutationLink[] = [];

  for (const [index, importedControl] of mutationFixture.controls.entries()) {
    const control = importedControl as unknown;
    const path = `tests/fixtures/resolution/mutation-controls.json.controls[${String(index)}]`;
    if (!isRecord(control) || typeof control["id"] !== "string") {
      findings.push(finding(
        "T1_EVIDENCE_REVIEWED_LINK_PARTITION",
        path,
        "Every reviewed mutation control must have a string ID.",
      ));
      continue;
    }
    const controlId = control["id"];
    const directCaseIds = stringArray(control["killedByCaseIds"]);
    const corroboratedCaseIds = control["corroboratedByCaseIds"] === undefined
      ? []
      : stringArray(control["corroboratedByCaseIds"]);
    const reviewedCaseLinkOrder = control["reviewedCaseLinkOrder"] === undefined
      ? directCaseIds
      : stringArray(control["reviewedCaseLinkOrder"]);
    const corroborativeReasonValues = control["corroborativeLinks"] === undefined
      ? []
      : Array.isArray(control["corroborativeLinks"])
        ? control["corroborativeLinks"]
        : [];
    const reasons = corroborativeReasonValues.flatMap((value) =>
      isRecord(value) &&
        exactKeys(value, ["caseId", "reasonCode", "reason"]) &&
        typeof value["caseId"] === "string" &&
        typeof value["reasonCode"] === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value["reasonCode"]) &&
        typeof value["reason"] === "string" &&
        value["reason"].trim() === value["reason"] &&
        value["reason"].length > 0
        ? [{
            controlId,
            caseId: value["caseId"],
            reasonCode: value["reasonCode"],
            reason: value["reason"],
          }]
        : []
    );
    const directSet = new Set(directCaseIds);
    const corroboratedSet = new Set(corroboratedCaseIds);
    const recombined = [...directCaseIds, ...corroboratedCaseIds];
    const recombinedSet = new Set(recombined);
    if (
      directCaseIds.length === 0 ||
      directSet.size !== directCaseIds.length ||
      corroboratedSet.size !== corroboratedCaseIds.length ||
      recombinedSet.size !== recombined.length ||
      reviewedCaseLinkOrder.length !== recombined.length ||
      new Set(reviewedCaseLinkOrder).size !== reviewedCaseLinkOrder.length ||
      reviewedCaseLinkOrder.some((caseId) => !recombinedSet.has(caseId)) ||
      reasons.length !== corroboratedCaseIds.length ||
      !corroboratedCaseIds.every((caseId, reasonIndex) =>
        reasons[reasonIndex]?.caseId === caseId
      )
    ) {
      findings.push(finding(
        "T1_EVIDENCE_REVIEWED_LINK_PARTITION",
        path,
        "Direct kills and corroborative links must form a disjoint, reasoned, lossless partition with at least one direct kill.",
      ));
    }
    directLinks.push(...directCaseIds.map((caseId) => ({ controlId, caseId })));
    corroborativeLinks.push(...reasons);
    reviewedLinks.push(...reviewedCaseLinkOrder.map((caseId) => ({
      controlId,
      caseId,
    })));
  }

  const reviewedLinkInventorySha256 = t1CanonicalDigest(reviewedLinks);
  const uniqueReviewedPairCount = new Set(
    reviewedLinks.map(({ controlId, caseId }) => `${controlId}\u0000${caseId}`),
  ).size;
  const uniqueReviewedCaseCount = new Set(
    reviewedLinks.map(({ caseId }) => caseId),
  ).size;
  const directLinkInventorySha256 = t1CanonicalDigest(directLinks);
  const corroborativeLinkInventorySha256 = t1CanonicalDigest(corroborativeLinks);
  if (
    reviewedLinks.length !== T1_EXPECTED_COUNTS.mutationLinks ||
    directLinks.length !== T1_EXPECTED_COUNTS.mutationDirectLinks ||
    corroborativeLinks.length !== T1_EXPECTED_COUNTS.mutationCorroborativeLinks ||
    uniqueReviewedPairCount !== reviewedLinks.length ||
    uniqueReviewedCaseCount !== T1_EXPECTED_COUNTS.mutationLinkedCases ||
    reviewedLinkInventorySha256 !== T1_REVIEWED_MUTATION_LINK_INVENTORY_SHA256 ||
    directLinkInventorySha256 !== T1_DIRECT_MUTATION_LINK_INVENTORY_SHA256 ||
    corroborativeLinkInventorySha256 !==
      T1_CORROBORATIVE_MUTATION_LINK_INVENTORY_SHA256
  ) {
    findings.push(finding(
      "T1_EVIDENCE_REVIEWED_LINK_CONSERVATION",
      "tests/fixtures/resolution/mutation-controls.json.controls",
      "The reviewed 140-link inventory must be conserved exactly while partitioning 124 direct kills from 16 corroborative observations.",
    ));
  }
  return {
    reviewedLinks,
    directLinks,
    corroborativeLinks,
    reviewedLinkInventorySha256,
    directLinkInventorySha256,
    corroborativeLinkInventorySha256,
    findings: sortFindings(findings),
  };
}

function corroboratedCaseIdsForControl(control: unknown): readonly string[] {
  return isRecord(control) && control["corroboratedByCaseIds"] !== undefined
    ? stringArray(control["corroboratedByCaseIds"])
    : [];
}

function corroborativeReasonsForControl(
  control: unknown,
): readonly Readonly<{ caseId: string; reasonCode: string; reason: string }>[] {
  if (!isRecord(control) || !Array.isArray(control["corroborativeLinks"])) return [];
  return control["corroborativeLinks"].flatMap((value) =>
    isRecord(value) &&
      typeof value["caseId"] === "string" &&
      typeof value["reasonCode"] === "string" &&
      typeof value["reason"] === "string"
      ? [{
          caseId: value["caseId"],
          reasonCode: value["reasonCode"],
          reason: value["reason"],
        }]
      : []
  );
}

export function t1DigestWithoutKey(value: JsonRecord, omittedKey: string): string {
  return t1CanonicalDigest(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omittedKey),
  ));
}

export function t1ObservationInventoryDigest(
  records: readonly T1CaseObservationRecord[],
): string {
  return t1CanonicalDigest(records);
}

function sanitizeMessage(value: string): string {
  let result = value.replaceAll(process.cwd(), ".");
  const home = process.env["HOME"];
  if (home !== undefined && home.length > 0) {
    result = result.replaceAll(home, "~");
  }
  return result.replaceAll("\\", "/");
}

function finding(
  code: string,
  path: string,
  message: string,
  traceId: string | null = null,
): T1EvidenceFinding {
  return { code, path, message: sanitizeMessage(message), traceId };
}

function findingKey(value: T1EvidenceFinding): string {
  return [value.traceId ?? "", value.code, value.path, value.message].join("\u0000");
}

function sortFindings(values: readonly T1EvidenceFinding[]): T1EvidenceFinding[] {
  return [...new Map(values.map((value) => [findingKey(value), value])).values()]
    .sort((left, right) => compare(findingKey(left), findingKey(right)));
}

function xmlUnescape(value: string): string {
  return value.replaceAll("&quot;", "\"").replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function xmlAttributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;
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
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`invalid ${name} count`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${name} count`);
  return parsed;
}

export function sanitizeT1JUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/g,
    "$1",
  );
  if (/\bhostname\s*=/.test(sanitized)) {
    throw new Error("T1_EVIDENCE_JUNIT_HOSTNAME: hostname was not sanitized");
  }
  return sanitized;
}

export function inspectT1JUnit(xml: string): Readonly<{
  summary: T1JUnitSummary | null;
  findings: readonly T1EvidenceFinding[];
}> {
  const findings: T1EvidenceFinding[] = [];
  try {
    const rootMatch = /<testsuites\b([^>]*)>/.exec(xml);
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
    const pattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let item: RegExpExecArray | null;
    let bodyFailures = 0;
    let bodyErrors = 0;
    let bodySkipped = 0;
    while ((item = pattern.exec(xml)) !== null) {
      const attributes = xmlAttributes(item[1] ?? "");
      const file = attributes.get("file");
      const name = attributes.get("name");
      if (file === undefined || file.length === 0 || name === undefined || name.length === 0) {
        throw new Error("testcase requires file and name attributes");
      }
      const body = item[2] ?? "";
      bodyFailures += (body.match(/<failure\b/g) ?? []).length;
      bodyErrors += (body.match(/<error\b/g) ?? []).length;
      bodySkipped += (body.match(/<skipped\b/g) ?? []).length;
      cases.push({ file: file.replaceAll("\\", "/"), name });
    }
    const identities = cases.map(({ file, name }) => `${file}\u0000${name}`);
    if (new Set(identities).size !== identities.length) {
      throw new Error("duplicate testcase identity");
    }
    if (
      tests !== cases.length ||
      failures !== bodyFailures ||
      errors !== bodyErrors ||
      (skipped !== bodySkipped && (skipped === 0 || bodySkipped > skipped))
    ) {
      throw new Error("JUnit summary does not match testcase bodies");
    }
    return {
      summary: {
        tests,
        assertions,
        failures,
        errors,
        skipped,
        files: sortedUnique(cases.map(({ file }) => file)),
        cases: cases.sort((left, right) =>
          compare(`${left.file}\u0000${left.name}`, `${right.file}\u0000${right.name}`),
        ),
      },
      findings,
    };
  } catch (error) {
    findings.push(finding(
      "T1_EVIDENCE_JUNIT_INVALID",
      "suite.junit",
      error instanceof Error ? error.message : "JUnit report is invalid.",
    ));
    return { summary: null, findings };
  }
}

export function inspectT1TestControls(
  filePath: string,
  source: string,
): T1EvidenceFinding[] {
  const findings: T1EvidenceFinding[] = [];
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
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
    ) return ["test", "it", "describe"].includes(expression.argumentExpression.text);
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
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
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
          ? "T1_EVIDENCE_TODO"
          : "T1_EVIDENCE_QUARANTINE",
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
            ? "T1_EVIDENCE_TODO"
            : "T1_EVIDENCE_QUARANTINE",
          `Forbidden ${node.argumentExpression.text} test control.`,
        );
      } else if (!ts.isStringLiteral(node.argumentExpression)) {
        report(node, "T1_EVIDENCE_QUARANTINE", "Dynamic test-builder member access is forbidden.");
      }
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        /^(?:quarantine|quarantined|xit|xdescribe|xtest|xfail|expectedFailure)$/.test(
          node.expression.text,
        )
      ) {
        report(
          node,
          node.expression.text === "xfail" || node.expression.text === "expectedFailure"
            ? "T1_EVIDENCE_EXPECTED_FAILURE"
            : "T1_EVIDENCE_QUARANTINE",
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
            report(property, "T1_EVIDENCE_RETRY", "Per-test retry configuration is forbidden.");
          }
          if (text === "expectedFailure") {
            report(property, "T1_EVIDENCE_EXPECTED_FAILURE", "Expected-failure controls are forbidden.");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sortFindings(findings);
}

const FIXTURE_VALUES: readonly Readonly<{ path: string; value: unknown }>[] = [
  { path: T1_FIXTURE_FILES[0], value: allRootFixture },
  { path: T1_FIXTURE_FILES[1], value: customFixture },
  { path: T1_FIXTURE_FILES[2], value: formulaFixture },
  { path: T1_FIXTURE_FILES[3], value: lawFixture },
  { path: T1_FIXTURE_FILES[4], value: literalFixture },
  { path: T1_FIXTURE_FILES[5], value: mutationFixture },
  { path: T1_FIXTURE_FILES[6], value: operationFixture },
  { path: T1_FIXTURE_FILES[7], value: provenanceFixture },
  { path: T1_FIXTURE_FILES[8], value: spellingFixture },
  { path: T1_FIXTURE_FILES[9], value: manifestFixture },
  { path: T1_FIXTURE_FILES[10], value: traceFixture },
];

function collectCaseBindings(
  value: unknown,
  fixturePath: string,
  rows: Map<string, T1CaseBinding>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectCaseBindings(item, fixturePath, rows);
    return;
  }
  if (!isRecord(value)) return;
  const id = value["id"];
  if (typeof id === "string" && /^(?:T1-|alt-)/.test(id)) {
    if (rows.has(id)) throw new Error(`duplicate fixture case ${id}`);
    rows.set(id, {
      caseId: id,
      fixturePath,
      fixtureRecordSha256: sha256Sync(JSON.stringify(canonicalJsonValue(value))),
    });
  }
  for (const item of Object.values(value)) {
    collectCaseBindings(item, fixturePath, rows);
  }
}

export function buildT1CaseBindings(): T1CaseBinding[] {
  const rows = new Map<string, T1CaseBinding>();
  for (const fixture of FIXTURE_VALUES) {
    collectCaseBindings(fixture.value, fixture.path, rows);
  }
  return [...rows.values()].sort((left, right) => compare(left.caseId, right.caseId));
}

export function t1ProductionCaseIds(): string[] {
  const excluded = new Set<string>([
    T1_FIXTURE_FILES[3],
    T1_FIXTURE_FILES[5],
    T1_FIXTURE_FILES[7],
    T1_FIXTURE_FILES[10],
  ]);
  return buildT1CaseBindings()
    .filter(({ fixturePath }) => !excluded.has(fixturePath))
    .map(({ caseId }) => caseId);
}

function expectedLawWitnesses(): Readonly<{
  lawIds: readonly string[];
  positiveCaseIds: readonly string[];
  nearMissCaseIds: readonly string[];
  transpositionCaseIds: readonly string[];
  allCaseIds: readonly string[];
}> {
  const rows = lawFixture.cases;
  const lawIds = rows.map(({ id }) => id);
  const positiveCaseIds = rows.flatMap(({ positiveCaseIds }) => positiveCaseIds);
  const nearMissCaseIds = rows.flatMap(({ nearMissCaseIds }) => nearMissCaseIds);
  const transpositionCaseIds = rows.map(({ transpositionCaseId }) => transpositionCaseId);
  return {
    lawIds,
    positiveCaseIds,
    nearMissCaseIds,
    transpositionCaseIds,
    allCaseIds: sortedUnique([
      ...lawIds,
      ...positiveCaseIds,
      ...nearMissCaseIds,
      ...transpositionCaseIds,
    ]),
  };
}

const T1_DIATONIC_STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const T1_NATURAL_PITCH_BY_STEP: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const T1_MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

function t1ReviewedFormulaMatrixSemanticDigest(): string {
  const cells = allRootFixture.roots.flatMap((root) => {
    const rootStepIndex = T1_DIATONIC_STEPS.indexOf(
      root.spelled.step as typeof T1_DIATONIC_STEPS[number],
    );
    const rootNaturalPitch = T1_NATURAL_PITCH_BY_STEP[root.spelled.step];
    if (rootStepIndex < 0 || rootNaturalPitch === undefined) {
      throw new Error(`${root.id} reviewed root spelling is invalid`);
    }
    return formulaFixture.rules.map((formula) => {
      const spellings = formula.degrees.map((degreeToken) => {
        const degree = t1DegreeParts(degreeToken);
        const zeroBasedDegree = degree.number - 1;
        const targetStepOffset = rootStepIndex + zeroBasedDegree;
        const targetStep = T1_DIATONIC_STEPS[
          ((targetStepOffset % T1_DIATONIC_STEPS.length) +
            T1_DIATONIC_STEPS.length) % T1_DIATONIC_STEPS.length
        ];
        const scaleSemitones = T1_MAJOR_SCALE_SEMITONES[
          zeroBasedDegree % T1_MAJOR_SCALE_SEMITONES.length
        ];
        if (targetStep === undefined || scaleSemitones === undefined) {
          throw new Error(`${formula.id}/${degreeToken} reviewed spelling is invalid`);
        }
        const targetStepNaturalPitch = T1_NATURAL_PITCH_BY_STEP[targetStep];
        if (targetStepNaturalPitch === undefined) {
          throw new Error(`${formula.id}/${degreeToken} target step is invalid`);
        }
        const targetNaturalPitch = targetStepNaturalPitch +
          (12 * Math.floor(targetStepOffset / T1_DIATONIC_STEPS.length));
        const targetPitch = rootNaturalPitch + root.spelled.alter + scaleSemitones +
          (12 * Math.floor(zeroBasedDegree / T1_DIATONIC_STEPS.length)) +
          degree.alter;
        return {
          spelled: { step: targetStep, alter: targetPitch - targetNaturalPitch },
          pitchClass: ((targetPitch % 12) + 12) % 12,
        };
      });
      return {
        rootId: root.id,
        formulaId: formula.id,
        formulaRuleId: (formulaFixture.publicRuleAssignments as Readonly<
          Record<string, string>
        >)[formula.familyId],
        degrees: formula.degrees,
        required: formula.required,
        optional: formula.optional,
        guide: formula.guide,
        spelledPitchNames: spellings.map(({ spelled }) => spelled),
        pitchClasses: spellings.map(({ pitchClass }) => pitchClass),
      };
    });
  });
  return t1CanonicalDigest(cells);
}

export function t1OperationEvidenceRows(): readonly JsonRecord[] {
  const spelling = operationFixture.cases.find(({ id }) => id === "T1-OPSTATE-001");
  const resolution = operationFixture.cases.find(({ id }) => id === "T1-OPSTATE-009");
  return [...(spelling?.evidenceRows ?? []), ...(resolution?.rows ?? [])];
}

const T1_MODIFIER_ARRAY_FIELDS = Object.freeze([
  "extensions",
  "additions",
  "alterations",
  "omissions",
] as const);

type T1ModifierArrayField = (typeof T1_MODIFIER_ARRAY_FIELDS)[number];

const T1_POST_EXCESS_SENTINELS: Readonly<Record<T1ModifierArrayField, unknown>> =
  Object.freeze({
    extensions: Object.freeze({ number: 9, alter: 0 }),
    additions: Object.freeze({ number: 2, alter: 0 }),
    alterations: Object.freeze({ number: 11, alter: 1 }),
    omissions: 3,
  });

function t1OperationState(id: string): JsonRecord | null {
  const candidate: unknown = operationFixture.cases.find((value) => value.id === id);
  return isRecord(candidate) ? candidate : null;
}

export function t1ExpectedFirstExcessTailReadTrapObservations(): readonly unknown[] {
  const state = t1OperationState("T1-OPSTATE-007");
  if (state === null || !Array.isArray(state["rows"])) return [];
  return state["rows"].flatMap((candidate) => {
    if (!isRecord(candidate) ||
      typeof candidate["field"] !== "string" ||
      !T1_MODIFIER_ARRAY_FIELDS.includes(
        candidate["field"] as T1ModifierArrayField,
      ) ||
      typeof candidate["firstExcessIndex"] !== "number" ||
      !Number.isSafeInteger(candidate["firstExcessIndex"]) ||
      candidate["firstExcessIndex"] < 0 ||
      !isRecord(candidate["inputRecipe"]) ||
      !isRecord(candidate["expectedRefusal"])) return [];
    const field = candidate["field"] as T1ModifierArrayField;
    const firstExcessIndex = candidate["firstExcessIndex"];
    const decisivePosition = T1_MODIFIER_ARRAY_FIELDS.indexOf(field);
    const recipe = candidate["inputRecipe"];
    const collections = Object.fromEntries(T1_MODIFIER_ARRAY_FIELDS.map(
      (candidateField) => {
        const importedCollection: unknown = recipe[candidateField];
        return [
          candidateField,
          Array.isArray(importedCollection) ? Array.from(importedCollection) : [],
        ];
      },
    )) as Record<T1ModifierArrayField, unknown[]>;
    const tailSeed = collections[field][0];
    if (tailSeed === undefined) return [];
    collections[field].push(tailSeed, tailSeed, tailSeed);
    const firstForbiddenIndexes: Record<T1ModifierArrayField, number | null> = {
      extensions: null,
      additions: null,
      alterations: null,
      omissions: null,
    };
    const reads: Record<T1ModifierArrayField, number> = {
      extensions: 0,
      additions: 0,
      alterations: 0,
      omissions: 0,
    };
    const recordReads: Record<string, Readonly<{ number: number; alter: number }>> = {};
    for (const [position, candidateField] of T1_MODIFIER_ARRAY_FIELDS.entries()) {
      if (position > decisivePosition && collections[candidateField].length === 0) {
        collections[candidateField].push(T1_POST_EXCESS_SENTINELS[candidateField]);
      }
      firstForbiddenIndexes[candidateField] = position < decisivePosition
        ? null
        : candidateField === field ? firstExcessIndex + 1 : 0;
      reads[candidateField] = candidateField === field
        ? firstExcessIndex + 1
        : position < decisivePosition ? collections[candidateField].length : 0;
      for (const [index, value] of collections[candidateField].entries()) {
        if (!isRecord(value)) continue;
        const wasRead = position < decisivePosition ||
          (candidateField === field && index <= firstExcessIndex);
        recordReads[`${candidateField}[${String(index)}]`] = wasRead
          ? { number: 1, alter: 1 }
          : { number: 0, alter: 0 };
      }
    }
    const readState = {
      decisiveRecordFetched: true,
      decisiveReadComplete: true,
    };
    return [{
      field,
      firstExcessIndex,
      firstForbiddenIndexes,
      publicReads: reads,
      privateReads: reads,
      publicRecordReads: recordReads,
      privateRecordReads: recordReads,
      publicReadState: readState,
      privateReadState: readState,
      result: { ok: false, refusal: candidate["expectedRefusal"] },
      evidence: {
        inputDegreeRecordsVisited: firstExcessIndex + 1,
        formulaPhaseTransitions: 0,
        candidateDegreesObserved: 0,
        duplicateDegreesCanonicalized: 0,
        realizationsProduced: 0,
        spellingAttempts: 0,
        degreesProduced: 0,
        warningsProduced: 0,
        peakCandidateDegreeRecords: 0,
        termination: "formula-refusal",
      },
    }];
  });
}

function exactDigestMap(
  value: unknown,
  expectedIds: readonly string[],
): value is JsonRecord {
  return isRecord(value) &&
    stableJson(Object.keys(value).sort(compare)) === stableJson([...expectedIds].sort(compare)) &&
    Object.values(value).every(isSha256);
}

function exactPositiveCounterMap(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) &&
    exactKeys(value, keys) &&
    Object.values(value).every((item) =>
      typeof item === "number" && Number.isSafeInteger(item) && item > 0
    );
}

export function inspectT1CaseObservationRecords(
  value: unknown,
  expectedProducer: T1ObservationProducer,
  path = "suite.observations.records",
): Readonly<{
  records: readonly T1CaseObservationRecord[];
  digests: Readonly<Record<string, string>>;
  findings: readonly T1EvidenceFinding[];
}> {
  const findings: T1EvidenceFinding[] = [];
  if (!Array.isArray(value)) {
    return {
      records: [],
      digests: {},
      findings: [finding(
        "T1_EVIDENCE_OBSERVATION_PREIMAGE",
        path,
        "Canonical per-case observation records are required.",
      )],
    };
  }
  const fixtureHashes = new Map(
    buildT1CaseBindings().map(({ caseId, fixtureRecordSha256 }) => [
      caseId,
      fixtureRecordSha256,
    ]),
  );
  const records: T1CaseObservationRecord[] = [];
  for (const [index, candidate] of value.entries()) {
    const recordPath = `${path}[${String(index)}]`;
    if (
      !isRecord(candidate) ||
      !exactKeys(candidate, ["caseId", "producer", "payload", "observationDigest"]) ||
      typeof candidate["caseId"] !== "string" ||
      !isRecord(candidate["producer"]) ||
      !exactKeys(candidate["producer"], ["file", "testcase"]) ||
      stableJson(candidate["producer"]) !== stableJson(expectedProducer) ||
      !isSha256(candidate["observationDigest"])
    ) {
      findings.push(finding(
        "T1_EVIDENCE_OBSERVATION_PREIMAGE",
        recordPath,
        "Observation record identity, producer, payload, and digest shape must be exact.",
      ));
      continue;
    }
    const record: T1CaseObservationRecord = {
      caseId: candidate["caseId"],
      producer: {
        file: candidate["producer"]["file"] as string,
        testcase: candidate["producer"]["testcase"] as string,
      },
      payload: candidate["payload"],
      observationDigest: candidate["observationDigest"],
    };
    const recomputed = t1CaseObservationDigest(record);
    if (
      record.observationDigest !== recomputed ||
      record.observationDigest === fixtureHashes.get(record.caseId)
    ) {
      findings.push(finding(
        "T1_EVIDENCE_OBSERVATION_PREIMAGE",
        recordPath,
        "Observation digest must recompute from its canonical runtime payload and may not substitute the fixture-record hash.",
      ));
    }
    records.push(record);
  }
  const caseIds = records.map(({ caseId }) => caseId);
  if (
    records.length !== value.length ||
    new Set(caseIds).size !== caseIds.length ||
    stableJson(caseIds) !== stableJson([...caseIds].sort(compare))
  ) {
    findings.push(finding(
      "T1_EVIDENCE_OBSERVATION_PREIMAGE_INVENTORY",
      path,
      "Observation records must be complete, unique, and sorted by case ID.",
    ));
  }
  return {
    records,
    digests: Object.fromEntries(
      records.map(({ caseId, observationDigest }) => [caseId, observationDigest]),
    ),
    findings: sortFindings(findings),
  };
}

function normalizedT1OperationResult(value: unknown, row?: JsonRecord): unknown {
  if (!isRecord(value) || value["ok"] !== true || !isRecord(value["value"])) {
    return value;
  }
  const resolved = value["value"];
  const normalizedWarnings = Array.isArray(resolved["warnings"])
    ? {
        warnings: (resolved["warnings"] as readonly unknown[]).map((warning) =>
          isRecord(warning)
            ? Object.fromEntries(
                Object.entries(warning).filter(([key]) => key !== "message"),
              )
            : warning
        ),
      }
    : {};
  const recipe = isRecord(row?.["inputRecipe"])
    ? row["inputRecipe"]
    : null;
  const source = isRecord(resolved["source"])
    ? resolved["source"]
    : null;
  const normalizedSource = source !== null &&
      typeof recipe?.["base"] === "string"
    ? { ...source, sourceText: recipe["base"] }
    : source;
  return {
    ...value,
    value: {
      ...resolved,
      ...(normalizedSource === null ? {} : { source: normalizedSource }),
      ...normalizedWarnings,
    },
  };
}

function expectedT1CustomOperationResult(caseId: string): unknown {
  const fixture = customFixture.cases.find(({ id }) => id === caseId);
  if (!isRecord(fixture) || !isRecord(fixture["input"]) ||
    !isRecord(fixture["expected"])) return undefined;
  const input = fixture["input"];
  const expected = fixture["expected"];
  const shared = customFixture.sharedExpected;
  return {
    ok: true,
    value: {
      ...shared.resolvedChordMetadata,
      source: input,
      realizations: [{
        kind: shared.kind,
        id: shared.id,
        formulaRuleId: shared.formulaRuleId,
        degrees: shared.degrees,
        requiredDegrees: shared.requiredDegrees,
        optionalDegrees: shared.optionalDegrees,
        guideToneDegrees: shared.guideToneDegrees,
        spelledPitchNames: expected["spelledPitchNames"],
        pitchClasses: expected["pitchClasses"],
        limitations: shared.limitations,
      }],
      bass: input["bass"],
      warnings: shared.warnings,
    },
  };
}

function operationEvidenceIsExact(
  production: JsonRecord,
  referenceObservations: ReadonlyMap<string, T1CaseObservationRecord>,
): boolean {
  const rows = t1OperationEvidenceRows();
  const ids = rows.flatMap((row) => typeof row["id"] === "string" ? [row["id"]] : []);
  const observed = production["evidenceCountersById"];
  const digests = production["operationEvidenceDigests"];
  const inspectedRecords = inspectT1CaseObservationRecords(
    production["operationEvidenceRecords"],
    T1_PRODUCTION_PRODUCER,
    "suite.observations.production.operationEvidenceRecords",
  );
  if (
    stableJson(production["producer"]) !== stableJson(T1_PRODUCTION_PRODUCER) ||
    stableJson(stringArray(production["operationEvidenceIds"])) !== stableJson(ids) ||
    !isRecord(observed) ||
    !exactDigestMap(digests, ids) ||
    inspectedRecords.findings.length !== 0 ||
    stableJson(inspectedRecords.records.map(({ caseId }) => caseId)) !==
      stableJson([...ids].sort(compare)) ||
    stableJson(inspectedRecords.digests) !== stableJson(digests)
  ) return false;
  if (stableJson(Object.keys(observed).sort(compare)) !== stableJson([...ids].sort(compare))) {
    return false;
  }
  for (const row of rows) {
    const id = row["id"];
    if (typeof id !== "string") return false;
    const expected = row["expectedEvidence"];
    if (stableJson(observed[id]) !== stableJson(expected)) return false;
    const observationRecord = inspectedRecords.records.find(({ caseId }) => caseId === id);
    const expectedResultRef = row["expectedResultRef"];
    const reference = typeof expectedResultRef === "string"
      ? referenceObservations.get(expectedResultRef)
      : undefined;
    const expectedResult = typeof expectedResultRef === "string" &&
        expectedResultRef.startsWith("T1-CUSTOM-")
      ? expectedT1CustomOperationResult(expectedResultRef)
      : reference === undefined
      ? (isRecord(row["expectedRefusal"])
        ? { ok: false, refusal: row["expectedRefusal"] }
        : undefined)
      : normalizedT1OperationResult(reference.payload, row);
    if (
      observationRecord === undefined ||
      expectedResult === undefined ||
      stableJson(observationRecord.payload) !== stableJson({
        id,
        result: expectedResult,
        evidence: expected,
        expectedEvidence: expected,
      })
    ) return false;
    if (!isRecord(expected)) return false;
    const termination = expected["termination"];
    if (![
      "complete",
      "formula-refusal",
      "spelling-refusal",
      "output-limit-refusal",
    ].includes(String(termination))) return false;
    for (const [key, value] of Object.entries(expected)) {
      if (key === "termination") continue;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        return false;
      }
    }
  }
  return true;
}

function t1OperationEvidenceCorpusDigest(production: JsonRecord): string | null {
  if (!Array.isArray(production["operationEvidenceRecords"])) return null;
  const byId = new Map<string, JsonRecord>();
  for (const candidate of production["operationEvidenceRecords"]) {
    if (!isRecord(candidate) || typeof candidate["caseId"] !== "string" ||
      !isRecord(candidate["payload"])) return null;
    byId.set(candidate["caseId"], candidate["payload"]);
  }
  const observations: unknown[] = [];
  for (const row of t1OperationEvidenceRows()) {
    const id = row["id"];
    if (typeof id !== "string") return null;
    const payload = byId.get(id);
    if (payload === undefined || payload["id"] !== id ||
      payload["result"] === undefined || payload["evidence"] === undefined) return null;
    observations.push({
      id,
      result: payload["result"],
      evidence: payload["evidence"],
    });
  }
  return t1CanonicalDigest(observations);
}

const T1_EVIDENCE_COUNTER_KEYS = Object.freeze([
  "inputDegreeRecordsVisited",
  "formulaPhaseTransitions",
  "candidateDegreesObserved",
  "duplicateDegreesCanonicalized",
  "realizationsProduced",
  "spellingAttempts",
  "degreesProduced",
  "warningsProduced",
  "peakCandidateDegreeRecords",
] as const);

type T1EvidenceCounterKey = (typeof T1_EVIDENCE_COUNTER_KEYS)[number];

function t1ProductionEvidenceCounterMaximaAreValid(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, T1_EVIDENCE_COUNTER_KEYS)) return false;
  const limits: Readonly<Record<T1EvidenceCounterKey, number>> = {
    inputDegreeRecordsVisited: manifestFixture.limits.inputDegreeRecordsVisited,
    formulaPhaseTransitions: manifestFixture.limits.phaseTransitions,
    candidateDegreesObserved: manifestFixture.limits.candidateInsertions,
    duplicateDegreesCanonicalized: manifestFixture.limits.candidateInsertions,
    realizationsProduced: manifestFixture.limits.realizationsPerChord,
    spellingAttempts: manifestFixture.limits.spellingAttempts,
    degreesProduced: manifestFixture.limits.semanticOutputRecords,
    warningsProduced: manifestFixture.limits.warnings,
    peakCandidateDegreeRecords: manifestFixture.limits.peakCandidateDegrees,
  };
  const lowerBounds = Object.fromEntries(
    T1_EVIDENCE_COUNTER_KEYS.map((key) => [key, 0]),
  ) as Record<T1EvidenceCounterKey, number>;
  for (const row of t1OperationEvidenceRows()) {
    if (!isRecord(row["expectedEvidence"])) return false;
    for (const key of T1_EVIDENCE_COUNTER_KEYS) {
      const count = row["expectedEvidence"][key];
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
        return false;
      }
      lowerBounds[key] = Math.max(lowerBounds[key], count);
    }
  }
  for (const key of T1_EVIDENCE_COUNTER_KEYS) {
    const count = value[key];
    if (typeof count !== "number" || !Number.isSafeInteger(count) ||
      count < lowerBounds[key] || count > limits[key]) return false;
  }
  return Number(value["duplicateDegreesCanonicalized"]) <=
    Number(value["candidateDegreesObserved"]);
}

function t1ProductionExecutionCountsAreExact(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, [
    "customResolutionExecutions",
    "customDomainBoundaryCases",
    "firstExcessRows",
    "reasonPrecedenceRows",
    "globalAndConflictPrecedenceRows",
    "precedenceRows",
    "firstExcessTailRows",
    "firstExcessTailReadTrapRows",
    "standaloneSpellingEvidenceRows",
    "resolutionEvidenceRows",
    "operationEvidenceRows",
    "publicResolveExecutions",
    "privateResolveExecutions",
    "publicSpellExecutions",
    "privateSpellExecutions",
  ])) return false;
  const stateSeven = t1OperationState("T1-OPSTATE-007");
  const stateTen = t1OperationState("T1-OPSTATE-010");
  const spellingState = t1OperationState("T1-OPSTATE-001");
  const resolutionState = t1OperationState("T1-OPSTATE-009");
  if (stateSeven === null || stateTen === null || spellingState === null ||
    resolutionState === null || !Array.isArray(stateSeven["rows"]) ||
    !Array.isArray(stateSeven["reasonPrecedenceRows"]) ||
    !Array.isArray(stateTen["rows"]) || !Array.isArray(spellingState["evidenceRows"]) ||
    !Array.isArray(resolutionState["rows"])) return false;
  const firstExcessRows = stateSeven["rows"].length;
  const reasonRows = stateSeven["reasonPrecedenceRows"].length;
  const globalRows = stateTen["rows"].length;
  const spellingRows = spellingState["evidenceRows"].length;
  const resolutionRows = resolutionState["rows"].length;
  const exact = {
    customResolutionExecutions: customFixture.cases.length,
    customDomainBoundaryCases: 1,
    firstExcessRows,
    reasonPrecedenceRows: reasonRows,
    globalAndConflictPrecedenceRows: globalRows,
    precedenceRows: firstExcessRows + reasonRows + globalRows,
    firstExcessTailRows: firstExcessRows,
    firstExcessTailReadTrapRows: firstExcessRows,
    standaloneSpellingEvidenceRows: spellingRows,
    resolutionEvidenceRows: resolutionRows,
    operationEvidenceRows: spellingRows + resolutionRows,
  };
  if (!Object.entries(exact).every(([key, expected]) => value[key] === expected)) {
    return false;
  }
  const publicResolveExecutions = value["publicResolveExecutions"];
  const privateResolveExecutions = value["privateResolveExecutions"];
  const publicSpellExecutions = value["publicSpellExecutions"];
  const privateSpellExecutions = value["privateSpellExecutions"];
  return typeof publicResolveExecutions === "number" &&
    Number.isSafeInteger(publicResolveExecutions) && publicResolveExecutions > 0 &&
    publicResolveExecutions === privateResolveExecutions &&
    typeof publicSpellExecutions === "number" &&
    Number.isSafeInteger(publicSpellExecutions) &&
    publicSpellExecutions >= T1_EXPECTED_COUNTS.publicDegreeSpellingCells &&
    privateSpellExecutions === spellingRows;
}

type T1ReviewedLawPredicateDigest = Readonly<{
  lawCaseId: string;
  lawId: string;
  semanticPredicateDigest: string;
}>;

const T1_LAW_PREDICATE_CANONICALIZATION =
  "SHA-256 of UTF-8 compact JSON after recursively sorting object keys by code-unit order; array order is preserved";

function t1ReviewedLawPredicateDigests(): readonly T1ReviewedLawPredicateDigest[] {
  const review: unknown = manifestFixture.lawPredicateReview;
  if (!isRecord(review) || !exactKeys(review, [
    "canonicalization",
    "predicateCount",
    "inventory",
  ]) || review["canonicalization"] !== T1_LAW_PREDICATE_CANONICALIZATION ||
    review["predicateCount"] !== lawFixture.cases.length ||
    !Array.isArray(review["inventory"]) ||
    review["inventory"].length !== lawFixture.cases.length) return [];
  const inventory: T1ReviewedLawPredicateDigest[] = [];
  for (const [index, lawCase] of lawFixture.cases.entries()) {
    const row: unknown = review["inventory"][index];
    if (!isRecord(row) || !exactKeys(row, [
      "lawCaseId",
      "lawId",
      "semanticPredicateDigest",
    ]) || row["lawCaseId"] !== lawCase.id || row["lawId"] !== lawCase.lawId ||
      !isSha256(row["semanticPredicateDigest"])) return [];
    inventory.push({
      lawCaseId: row["lawCaseId"],
      lawId: row["lawId"],
      semanticPredicateDigest: row["semanticPredicateDigest"],
    });
  }
  return inventory;
}

function lawProofRecordsAreExact(
  value: unknown,
  observationDigests: Readonly<Record<string, string>>,
  observationRecords: ReadonlyMap<string, T1CaseObservationRecord>,
): boolean {
  if (!Array.isArray(value) || value.length !== lawFixture.cases.length) return false;
  const reviewedPredicateDigests = t1ReviewedLawPredicateDigests();
  if (reviewedPredicateDigests.length !== lawFixture.cases.length) return false;
  const predicateIds: Readonly<Record<string, string>> = {
    "T1-LAW-001": "legacy-formula-identities-roles-spellings-all-roots",
    "T1-LAW-002": "degree-number-plus-alteration-identity",
    "T1-LAW-003": "directed-letter-and-accidental-before-projection",
    "T1-LAW-004": "spelled-transpose-exact-inverse",
    "T1-LAW-005": "projection-commutes-modulo-twelve",
    "T1-LAW-006": "altered-plural-stable-order",
    "T1-LAW-007": "all-modifier-phases-and-conflict-near-misses",
    "T1-LAW-008": "ordered-role-partition",
    "T1-LAW-009": "numeric-omission-all-members-and-exact-warning",
    "T1-LAW-010": "slash-bass-separate-fact",
    "T1-LAW-011": "custom-exact-literal-projection",
    "T1-LAW-012": "transactional-refusal-shape",
  };
  return lawFixture.cases.every((lawCase, index) => {
    const candidate: unknown = value[index];
    const reviewedPredicate = reviewedPredicateDigests[index];
    const lawObservation = observationRecords.get(lawCase.id);
    const lawPayload = t1MutableRecord(lawObservation?.payload);
    const semanticPredicate = isRecord(candidate)
      ? candidate["semanticPredicate"]
      : undefined;
    if (
      !isRecord(candidate) ||
      !exactKeys(candidate, [
        "lawCaseId",
        "lawId",
        "statement",
        "producer",
        "lawObservationDigest",
        "semanticPredicate",
        "semanticPredicateDigest",
        "positive",
        "nearMiss",
        "transposition",
        "mutationControlIds",
        "lawProofDigest",
      ]) ||
      candidate["lawCaseId"] !== lawCase.id ||
      candidate["lawId"] !== lawCase.lawId ||
      candidate["statement"] !== lawCase.statement ||
      stableJson(candidate["producer"]) !== stableJson(T1_LAWS_PRODUCER) ||
      lawObservation === undefined ||
      lawPayload === null ||
      candidate["lawObservationDigest"] !== lawObservation.observationDigest ||
      candidate["lawObservationDigest"] !== observationDigests[lawCase.id] ||
      lawPayload["lawId"] !== lawCase.lawId ||
      lawPayload["statement"] !== lawCase.statement ||
      stableJson(lawPayload["mutationControlIds"]) !==
        stableJson(lawCase.mutationControlIds) ||
      !isRecord(semanticPredicate) ||
      !exactKeys(semanticPredicate, ["predicateId", "passed", "evidence"]) ||
      semanticPredicate["predicateId"] !== predicateIds[lawCase.id] ||
      semanticPredicate["passed"] !== true ||
      stableJson(lawPayload["semanticPredicate"]) !== stableJson(semanticPredicate) ||
      candidate["semanticPredicateDigest"] !==
        t1CanonicalDigest(semanticPredicate) ||
      reviewedPredicate === undefined ||
      reviewedPredicate.lawCaseId !== lawCase.id ||
      reviewedPredicate.lawId !== lawCase.lawId ||
      candidate["semanticPredicateDigest"] !==
        reviewedPredicate.semanticPredicateDigest ||
      !isSha256(candidate["lawProofDigest"]) ||
      candidate["lawProofDigest"] !== t1DigestWithoutKey(candidate, "lawProofDigest") ||
      stableJson(candidate["mutationControlIds"]) !== stableJson(lawCase.mutationControlIds)
    ) return false;
    const expectedWitnesses = (caseIds: readonly string[]): readonly JsonRecord[] =>
      caseIds.map((caseId) => ({
        caseId,
        observationDigest: observationDigests[caseId],
      }));
    return stableJson(candidate["positive"]) ===
        stableJson(expectedWitnesses(lawCase.positiveCaseIds)) &&
      stableJson(candidate["nearMiss"]) ===
        stableJson(expectedWitnesses(lawCase.nearMissCaseIds)) &&
      stableJson(candidate["transposition"]) === stableJson({
        caseId: lawCase.transpositionCaseId,
        observationDigest: observationDigests[lawCase.transpositionCaseId],
      });
  });
}

function traceProofRecordsAreExact(
  value: unknown,
  observationDigests: Readonly<Record<string, string>>,
): boolean {
  if (!Array.isArray(value) || value.length !== traceFixture.traces.length) return false;
  return traceFixture.traces.every((trace, index) => {
    const candidate: unknown = value[index];
    if (!isRecord(candidate)) return false;
    const expectedPreimage = {
      traceId: trace.id,
      requirement: trace.requirement,
      sourceRefs: trace.sourceRefs,
      producer: T1_LAWS_PRODUCER,
      cases: trace.caseIds.map((caseId) => ({
        caseId,
        observationDigest: observationDigests[caseId],
      })),
      mutationControlIds: trace.mutationControlIds,
    };
    return exactKeys(candidate, [...Object.keys(expectedPreimage), "traceProofDigest"]) &&
      stableJson(Object.fromEntries(
        Object.entries(candidate).filter(([key]) => key !== "traceProofDigest"),
      )) === stableJson(expectedPreimage) &&
      candidate["traceProofDigest"] === t1CanonicalDigest(expectedPreimage);
  });
}

function authorityProofRecordsAreExact(
  value: unknown,
  observationDigests: Readonly<Record<string, string>>,
): boolean {
  if (
    !Array.isArray(value) ||
    value.length !== provenanceFixture.authorities.length
  ) return false;
  return provenanceFixture.authorities.every((authority, index) => {
    const candidate: unknown = value[index];
    if (!isRecord(candidate)) return false;
    const expectedPreimage = {
      authorityId: authority.id,
      authorityClass: authority.authorityClass,
      sourceKind: authority.sourceKind,
      reviewState: authority.reviewState,
      sourceRefs: authority.sourceRefs,
      covers: authority.covers,
      producer: T1_LAWS_PRODUCER,
      cases: authority.caseIds.map((caseId) => ({
        caseId,
        observationDigest: observationDigests[caseId],
      })),
      mutationControlIds: authority.mutationControlIds,
    };
    return exactKeys(candidate, [...Object.keys(expectedPreimage), "authorityProofDigest"]) &&
      stableJson(Object.fromEntries(
        Object.entries(candidate).filter(([key]) => key !== "authorityProofDigest"),
      )) === stableJson(expectedPreimage) &&
      candidate["authorityProofDigest"] === t1CanonicalDigest(expectedPreimage);
  });
}

type InspectedSemanticMutants = Readonly<{
  executionDigests: ReadonlyMap<string, string>;
  killedControlIds: ReadonlySet<string>;
  killerLinksExecuted: number;
  killerLinksKilled: number;
  corroborativeLinksObserved: number;
  findings: readonly T1EvidenceFinding[];
}>;

type T1SemanticOperatorSpec = Readonly<{
  controlId: string;
  algorithm: string;
  parameters: JsonRecord;
}>;

const t1SemanticOperator = (
  controlId: string,
  algorithm: string,
  parameters: JsonRecord = {},
): T1SemanticOperatorSpec => ({ controlId, algorithm, parameters });

const T1_SEMANTIC_OPERATOR_REGISTRY = Object.freeze([
  t1SemanticOperator("T1-MUT-001", "rewrite-degree-identity", {
    from: "3",
    to: "b3",
    matrixFormulaId: "T1-FORMULA-001",
  }),
  t1SemanticOperator("T1-MUT-002", "rewrite-degree-identity", {
    from: "b3",
    to: "3",
    matrixFormulaId: "T1-FORMULA-002",
  }),
  t1SemanticOperator("T1-MUT-003", "move-degree-role", { degree: "5", from: "optional", to: "required" }),
  t1SemanticOperator("T1-MUT-004", "rewrite-degree-identity", { from: "7", to: "b7" }),
  t1SemanticOperator("T1-MUT-005", "remove-degree", {
    degrees: ["b7"],
    matrixFormulaId: "T1-FORMULA-020",
  }),
  t1SemanticOperator("T1-MUT-006", "remove-degree", {
    degrees: ["9", "11"],
    matrixFormulaId: "T1-FORMULA-024",
  }),
  t1SemanticOperator("T1-MUT-007", "rewrite-degree-identity", {
    from: "6",
    to: "b6",
    matrixFormulaId: "T1-FORMULA-009",
  }),
  t1SemanticOperator("T1-MUT-008", "append-semantic-degree", { degree: "b7", role: "guide" }),
  t1SemanticOperator("T1-MUT-009", "rewrite-degree-identity", { from: "bb7", to: "6" }),
  t1SemanticOperator("T1-MUT-010", "move-degree-role", { degree: "b5", from: "required", to: "optional" }),
  t1SemanticOperator("T1-MUT-011", "rewrite-degree-identity", { from: "#5", to: "5" }),
  t1SemanticOperator("T1-MUT-012", "retain-suspension-third"),
  t1SemanticOperator("T1-MUT-013", "collapse-equal-pitch-class-records"),
  t1SemanticOperator("T1-MUT-014", "rewrite-degree-identity", { from: "#9", to: "b3" }),
  t1SemanticOperator("T1-MUT-015", "rewrite-degree-identity", { from: "bb7", to: "6" }),
  t1SemanticOperator("T1-MUT-016", "reuse-root-letter"),
  t1SemanticOperator("T1-MUT-017", "pitch-class-first-enharmonic"),
  t1SemanticOperator("T1-MUT-018", "accept-accidental-overflow", { clamp: false }),
  t1SemanticOperator("T1-MUT-019", "accept-accidental-overflow", { clamp: true }),
  t1SemanticOperator("T1-MUT-020", "drop-diatonic-transposition"),
  t1SemanticOperator("T1-MUT-021", "leave-slash-bass-untransposed"),
  t1SemanticOperator("T1-MUT-022", "keep-first-altered-realization"),
  t1SemanticOperator("T1-MUT-023", "reverse-altered-realization-order"),
  t1SemanticOperator("T1-MUT-024", "append-semantic-degree", { degree: "5", role: "optional" }),
  t1SemanticOperator("T1-MUT-025", "merge-equal-altered-realizations"),
  t1SemanticOperator("T1-MUT-026", "remove-explicit-add-three"),
  t1SemanticOperator("T1-MUT-027", "append-semantic-degree", { degree: "5", role: "optional" }),
  t1SemanticOperator("T1-MUT-028", "retain-extension-natural-closure", { degrees: ["9", "11"] }),
  t1SemanticOperator("T1-MUT-029", "retain-one-omitted-alteration", { degree: "#5" }),
  t1SemanticOperator("T1-MUT-030", "addition-implies-extension-closure"),
  t1SemanticOperator("T1-MUT-031", "move-highest-extension-to-optional"),
  t1SemanticOperator("T1-MUT-032", "move-identity-fifth-to-optional"),
  t1SemanticOperator("T1-MUT-033", "append-guide-degree", { degree: "3" }),
  t1SemanticOperator("T1-MUT-034", "suppress-omission-warning"),
  t1SemanticOperator("T1-MUT-035", "emit-warning-for-present-omission"),
  t1SemanticOperator("T1-MUT-036", "insert-slash-bass-into-membership"),
  t1SemanticOperator("T1-MUT-037", "discard-slash-bass"),
  t1SemanticOperator("T1-MUT-038", "deduplicate-custom-pitches"),
  t1SemanticOperator("T1-MUT-039", "sort-custom-pitches-by-pitch-class"),
  t1SemanticOperator("T1-MUT-040", "infer-custom-formula"),
  t1SemanticOperator("T1-MUT-041", "expose-partial-refusal-output"),
  t1SemanticOperator("T1-MUT-042", "rewrite-refusal-path-to-generated-output"),
  t1SemanticOperator("T1-MUT-043", "advance-first-excess-bound", { field: "extensions" }),
  t1SemanticOperator("T1-MUT-044", "advance-first-excess-bound", { field: "additions" }),
  t1SemanticOperator("T1-MUT-045", "advance-first-excess-bound", { field: "alterations" }),
  t1SemanticOperator("T1-MUT-046", "advance-first-excess-bound", { field: "omissions" }),
  t1SemanticOperator("T1-MUT-047", "reject-parsed-modifier-vocabulary"),
  t1SemanticOperator("T1-MUT-048", "duplicate-cross-category-degree"),
  t1SemanticOperator("T1-MUT-049", "accept-seventeenth-semantic-degree"),
  t1SemanticOperator("T1-MUT-050", "rewrite-abdim7-directed-spelling"),
  t1SemanticOperator("T1-MUT-051", "fallback-unsupported-family"),
  t1SemanticOperator("T1-MUT-052", "reverse-refusal-precedence"),
  t1SemanticOperator("T1-MUT-053", "restrict-public-spelling-domain"),
] satisfies readonly T1SemanticOperatorSpec[]);

function t1MutableJsonClone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(canonicalJsonValue(value))) as unknown;
}

function t1MutableRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function t1ReplaceRecordContents(
  target: Record<string, unknown>,
  replacement: Readonly<Record<string, unknown>>,
): void {
  for (const key of Object.keys(target)) Reflect.deleteProperty(target, key);
  Object.assign(target, replacement);
}

function t1WalkMutable(
  value: unknown,
  visit: (record: Record<string, unknown>, path: string) => number,
  path = "$",
): number {
  let affected = 0;
  const current = t1MutableRecord(value);
  if (current !== null) affected += visit(current, path);
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      affected += t1WalkMutable(child, visit, `${path}[${String(index)}]`);
    });
  } else if (current !== null) {
    for (const [key, child] of Object.entries(current)) {
      affected += t1WalkMutable(child, visit, `${path}.${key}`);
    }
  }
  return affected;
}

function t1DegreeParts(value: string): Readonly<{ number: number; alter: number }> {
  const match = /^(bb|b|##|#)?(1|2|3|4|5|6|7|9|11|13)$/.exec(value);
  if (match === null) throw new Error(`invalid verifier degree ${value}`);
  return {
    number: Number(match[2]),
    alter: match[1] === "bb" ? -2 : match[1] === "b" ? -1
      : match[1] === "#" ? 1 : match[1] === "##" ? 2 : 0,
  };
}

function t1DegreeToken(
  degree: Readonly<{ number: number; alter: number }>,
): string {
  const accidental = degree.alter === -2
    ? "bb"
    : degree.alter === -1
      ? "b"
      : degree.alter === 1
        ? "#"
        : degree.alter === 2
          ? "##"
          : "";
  return `${accidental}${degree.number.toString()}`;
}

function t1DegreeMatches(value: unknown, degree: string): boolean {
  if (value === degree) return true;
  const candidate = t1MutableRecord(value);
  if (candidate === null) return false;
  const expected = t1DegreeParts(degree);
  return candidate["number"] === expected.number &&
    candidate["alter"] === expected.alter;
}

function t1DegreeValueLike(example: unknown, degree: string): unknown {
  return typeof example === "string" ? degree : { ...t1DegreeParts(degree) };
}

function t1ChordDegreeValue(
  value: unknown,
): Readonly<{ number: number; alter: number }> | null {
  if (typeof value === "string") return t1DegreeParts(value);
  const body = t1MutableRecord(value);
  const number = body?.["number"];
  const alter = body?.["alter"];
  if (
    typeof number !== "number" ||
    ![1, 2, 3, 4, 5, 6, 7, 9, 11, 13].includes(number) ||
    typeof alter !== "number" || !Number.isInteger(alter)
  ) return null;
  return { number, alter };
}

function t1SpelledPitchValue(
  value: unknown,
): Readonly<{ step: string; alter: number }> | null {
  const body = t1MutableRecord(value);
  const step = body?.["step"];
  const alter = body?.["alter"];
  return typeof step === "string" && T1_DIATONIC_STEPS.includes(
    step as typeof T1_DIATONIC_STEPS[number],
  ) && typeof alter === "number"
    ? { step, alter }
    : null;
}

function t1PitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}

function t1SpelledPitchClass(value: unknown): number | null {
  const pitch = t1SpelledPitchValue(value);
  if (pitch === null) return null;
  const natural = T1_NATURAL_PITCH_BY_STEP[pitch.step];
  return natural === undefined ? null : t1PitchClass(natural + pitch.alter);
}

const T1_CONVENIENCE_SPELLINGS = Object.freeze([
  { step: "C", alter: 0 }, { step: "C", alter: 1 },
  { step: "D", alter: 0 }, { step: "E", alter: -1 },
  { step: "E", alter: 0 }, { step: "F", alter: 0 },
  { step: "F", alter: 1 }, { step: "G", alter: 0 },
  { step: "A", alter: -1 }, { step: "A", alter: 0 },
  { step: "B", alter: -1 }, { step: "B", alter: 0 },
] as const);

function t1ConvenienceSpelling(
  pitchClass: number,
): Readonly<{ step: string; alter: number }> {
  const spelling = T1_CONVENIENCE_SPELLINGS[t1PitchClass(pitchClass)];
  if (spelling === undefined) throw new RangeError("missing convenience spelling");
  return { ...spelling };
}

const T1_DEGREE_ARRAY_KEYS = new Set([
  "degrees",
  "required",
  "optional",
  "guide",
  "requiredDegrees",
  "optionalDegrees",
  "guideToneDegrees",
]);

function t1RolePairs() {
  return [
    ["required", "optional"],
    ["requiredDegrees", "optionalDegrees"],
  ] as const;
}

function t1RootForSemanticEntry(
  entry: Record<string, unknown>,
  inheritedRoot: Readonly<{ step: string; alter: number }> | null,
): Readonly<{ step: string; alter: number }> | null {
  const sourceRoot = t1SpelledPitchValue(t1MutableRecord(entry["source"])?.["root"]);
  if (sourceRoot !== null) return sourceRoot;
  const rootId = entry["rootId"];
  if (typeof rootId === "string") {
    const fixtureRoot = allRootFixture.roots.find(({ id }) => id === rootId);
    if (fixtureRoot !== undefined) return fixtureRoot.spelled;
  }
  return inheritedRoot ?? t1SpelledPitchValue(entry["root"]);
}

function t1ReconcileDerivedDegreeSpellings(
  value: unknown,
  inheritedRoot: Readonly<{ step: string; alter: number }> | null = null,
): number {
  if (Array.isArray(value)) {
    return (value as unknown[]).reduce<number>(
      (sum, item) => sum + t1ReconcileDerivedDegreeSpellings(item, inheritedRoot),
      0,
    );
  }
  const entry = t1MutableRecord(value);
  if (entry === null) return 0;
  const root = t1RootForSemanticEntry(entry, inheritedRoot);
  let changed = 0;
  const degrees = entry["degrees"];
  if (
    root !== null && Array.isArray(degrees) &&
    Array.isArray(entry["spelledPitchNames"]) &&
    Array.isArray(entry["pitchClasses"])
  ) {
    const outcomes = (degrees as unknown[]).map((degree) => {
      const parsed = t1ChordDegreeValue(degree);
      if (parsed === null) throw new TypeError("verifier mutant degree invalid");
      return t1DirectedSpelling(root, parsed);
    });
    const spellings = outcomes.map(({ spelled }) => spelled);
    const pitchClasses = outcomes.map(({ pitchClass }) => pitchClass);
    if (stableJson(entry["spelledPitchNames"]) !== stableJson(spellings)) {
      entry["spelledPitchNames"] = spellings;
      changed += 1;
    }
    if (stableJson(entry["pitchClasses"]) !== stableJson(pitchClasses)) {
      entry["pitchClasses"] = pitchClasses;
      changed += 1;
    }
  }
  const degree = t1ChordDegreeValue(entry["degree"]);
  if (
    root !== null && degree !== null &&
    t1MutableRecord(entry["spelled"]) !== null &&
    typeof entry["pitchClass"] === "number"
  ) {
    const outcome = t1DirectedSpelling(root, degree);
    if (stableJson(entry["spelled"]) !== stableJson(outcome.spelled)) {
      entry["spelled"] = outcome.spelled;
      changed += 1;
    }
    if (entry["pitchClass"] !== outcome.pitchClass) {
      entry["pitchClass"] = outcome.pitchClass;
      changed += 1;
    }
  }
  for (const child of Object.values(entry)) {
    changed += t1ReconcileDerivedDegreeSpellings(child, root);
  }
  return changed;
}

function t1CompareDegreeValues(left: unknown, right: unknown): number {
  const leftDegree = t1ChordDegreeValue(left);
  const rightDegree = t1ChordDegreeValue(right);
  if (leftDegree === null || rightDegree === null) {
    throw new TypeError("verifier canonical degree sort received non-degree");
  }
  return leftDegree.number - rightDegree.number || leftDegree.alter - rightDegree.alter;
}

function t1CanonicalizeSemanticDegreeArrays(root: unknown): number {
  return t1WalkMutable(root, (entry) => {
    let changed = 0;
    const degrees = entry["degrees"];
    if (
      Array.isArray(degrees) &&
      (degrees as unknown[]).every((degree) => t1ChordDegreeValue(degree) !== null)
    ) {
      const degreeValues = degrees as unknown[];
      const order = degreeValues.map((degree, index) => ({ degree, index }))
        .sort((left, right) =>
          t1CompareDegreeValues(left.degree, right.degree) || left.index - right.index
        ).map(({ index }) => index);
      if (!order.every((index, position) => index === position)) {
        entry["degrees"] = order.map((index) => degreeValues[index]);
        changed += 1;
        for (const key of ["spelledPitchNames", "pitchClasses"]) {
          const values = entry[key];
          if (Array.isArray(values) && values.length === degreeValues.length) {
            const aligned = values as unknown[];
            entry[key] = order.map((index) => aligned[index]);
            changed += 1;
          }
        }
      }
    }
    for (const key of [
      "required", "optional", "guide", "requiredDegrees",
      "optionalDegrees", "guideToneDegrees",
    ]) {
      const values = entry[key];
      if (
        !Array.isArray(values) ||
        !(values as unknown[]).every((degree) => t1ChordDegreeValue(degree) !== null)
      ) continue;
      const sorted = [...(values as unknown[])].sort(t1CompareDegreeValues);
      if (stableJson(values) !== stableJson(sorted)) {
        entry[key] = sorted;
        changed += 1;
      }
    }
    return changed;
  });
}

function t1RewriteDegreeIdentity(root: unknown, from: string, to: string): number {
  return t1WalkMutable(root, (entry, path) => {
    let affected = 0;
    const source = t1DegreeParts(from);
    const outputDegreeRecord = path.endsWith(".degree") || [
      ".degrees[",
      ".requiredDegrees[",
      ".optionalDegrees[",
      ".guideToneDegrees[",
    ].some((segment) => path.includes(segment));
    if (outputDegreeRecord && entry["number"] === source.number &&
      entry["alter"] === source.alter) {
      const replacement = t1DegreeParts(to);
      entry["number"] = replacement.number;
      entry["alter"] = replacement.alter;
      affected += 2;
    }
    for (const [key, value] of Object.entries(entry)) {
      if (!T1_DEGREE_ARRAY_KEYS.has(key) || !Array.isArray(value)) continue;
      value.forEach((item, index) => {
        if (typeof item === "string" && item === from) {
          value[index] = to;
          affected += 1;
        }
      });
    }
    return affected;
  });
}

function t1RemoveDegrees(root: unknown, degrees: readonly string[]): number {
  return t1WalkMutable(root, (entry) => {
    let affected = 0;
    for (const [key, value] of Object.entries(entry)) {
      if (!T1_DEGREE_ARRAY_KEYS.has(key) || !Array.isArray(value)) continue;
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (degrees.some((degree) => t1DegreeMatches(value[index], degree))) {
          value.splice(index, 1);
          affected += 1;
        }
      }
    }
    return affected;
  });
}

function t1MoveDegreeRole(
  root: unknown,
  degree: string,
  from: "required" | "optional",
  to: "required" | "optional",
): number {
  return t1WalkMutable(root, (entry) => {
    let affected = 0;
    for (const [requiredKey, optionalKey] of [
      ["required", "optional"],
      ["requiredDegrees", "optionalDegrees"],
    ] as const) {
      const fromKey = from === "required" ? requiredKey : optionalKey;
      const toKey = to === "required" ? requiredKey : optionalKey;
      const source = entry[fromKey];
      const target = entry[toKey];
      if (!Array.isArray(source) || !Array.isArray(target)) continue;
      const sourceValues = source as unknown[];
      const targetValues = target as unknown[];
      const index = sourceValues.findIndex((item) => t1DegreeMatches(item, degree));
      if (index < 0 || targetValues.some((item) => t1DegreeMatches(item, degree))) {
        continue;
      }
      const moved: unknown = sourceValues.splice(index, 1)[0];
      targetValues.push(moved);
      affected += 2;
    }
    return affected;
  });
}

function t1AppendDegree(root: unknown, degree: string, role: string): number {
  return t1WalkMutable(root, (entry) => {
    const degrees = entry["degrees"];
    if (!Array.isArray(degrees) ||
      degrees.some((item) => t1DegreeMatches(item, degree))) return 0;
    const degreeValues = degrees as unknown[];
    const example: unknown = degreeValues[0] ?? degree;
    degreeValues.push(t1DegreeValueLike(example, degree));
    let affected = 1;
    const roleKeys = role === "guide"
      ? ["required", "guide", "requiredDegrees", "guideToneDegrees"]
      : role === "required"
        ? ["required", "requiredDegrees"]
        : ["optional", "optionalDegrees"];
    for (const key of roleKeys) {
      const values = entry[key];
      if (Array.isArray(values) &&
        !values.some((item) => t1DegreeMatches(item, degree))) {
        values.push(t1DegreeValueLike(values[0] ?? example, degree));
        affected += 1;
      }
    }
    return affected;
  });
}

function t1AlterArrayOrder(root: unknown, key: string, keepFirst: boolean): number {
  return t1WalkMutable(root, (entry) => {
    const value = entry[key];
    if (!Array.isArray(value) || value.length < 2) return 0;
    const items = value as unknown[];
    entry[key] = keepFirst ? items.slice(0, 1) : [...items].reverse();
    return value.length;
  });
}

function t1MutatePaths(root: unknown): number {
  return t1WalkMutable(root, (entry) => {
    const value = entry["path"];
    if (!Array.isArray(value) || value[0] === "realizations") return 0;
    entry["path"] = ["realizations", 0, ...(value as unknown[])];
    return 1;
  });
}

function t1ReplaceStandaloneSpelling(
  root: unknown,
  replacement: (
    entry: Record<string, unknown>,
  ) => Readonly<{ step: string; alter: number }> | null,
): number {
  return t1WalkMutable(root, (entry) => {
    if (typeof entry["pitchClass"] !== "number" ||
      t1MutableRecord(entry["spelled"]) === null) return 0;
    const spelled = replacement(entry);
    if (spelled === null) return 0;
    entry["spelled"] = spelled;
    entry["pitchClass"] = t1SpelledPitchClass(spelled);
    return 2;
  });
}

type T1SelectedSemanticTarget = Readonly<{
  targetId: string;
  path: string;
  value: unknown;
}>;

type T1SemanticTargetSelection = Readonly<{
  selectorId: string;
  targets: readonly T1SelectedSemanticTarget[];
}>;

function t1FindSemanticTargets(
  value: unknown,
  predicate: (entry: Record<string, unknown>, path: string) => boolean,
  path = "$",
): readonly T1SelectedSemanticTarget[] {
  const targets: T1SelectedSemanticTarget[] = [];
  const visit = (candidate: unknown, candidatePath: string): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((child, index) => {
        visit(child, `${candidatePath}[${String(index)}]`);
      });
      return;
    }
    const entry = t1MutableRecord(candidate);
    if (entry === null) return;
    if (predicate(entry, candidatePath)) {
      targets.push({
        targetId: typeof entry["id"] === "string"
          ? entry["id"]
          : typeof entry["caseId"] === "string"
            ? entry["caseId"]
            : candidatePath,
        path: candidatePath,
        value: entry,
      });
      return;
    }
    for (const [key, child] of Object.entries(entry)) {
      visit(child, `${candidatePath}.${key}`);
    }
  };
  visit(value, path);
  return targets;
}

function t1SelectSemanticTargets(
  spec: T1SemanticOperatorSpec,
  caseId: string,
  candidate: unknown,
): T1SemanticTargetSelection {
  if (caseId.startsWith("T1-FORMULA-") && Array.isArray(candidate)) {
    return {
      selectorId: "formula-homogeneous-root-cells",
      targets: (candidate as readonly unknown[]).map((value, index) => ({
        targetId: `${caseId}/${String(index)}`,
        path: `$[${String(index)}]`,
        value,
      })),
    };
  }
  if (caseId === "T1-ROOT-MATRIX-001") {
    const formulaId = spec.parameters["matrixFormulaId"];
    if (typeof formulaId !== "string") {
      throw new Error(`${spec.controlId} root-matrix selector requires matrixFormulaId`);
    }
    const cells = t1MutableRecord(candidate)?.["cells"];
    if (!Array.isArray(cells)) {
      throw new TypeError(`${spec.controlId} root-matrix cells missing`);
    }
    return {
      selectorId: `root-matrix-formula:${formulaId}`,
      targets: (cells as readonly unknown[]).flatMap((value, index) => {
        const cell = t1MutableRecord(value);
        return cell?.["formulaId"] === formulaId
          ? [{
              targetId: `${String(cell["rootId"])}/${formulaId}`,
              path: `$.cells[${String(index)}]`,
              value: cell,
            }]
          : [];
      }),
    };
  }
  if (caseId === "T1-LAW-004" && (
    spec.algorithm === "drop-diatonic-transposition" ||
    spec.algorithm === "leave-slash-bass-untransposed"
  )) {
    const targets = t1FindSemanticTargets(candidate, (entry) =>
      "targetSnapshot" in entry
    ).map((target) => ({
      targetId: `${target.targetId}/targetSnapshot`,
      path: `${target.path}.targetSnapshot`,
      value: t1MutableRecord(target.value)?.["targetSnapshot"],
    }));
    return { selectorId: "law-four-transposed-target-snapshots", targets };
  }
  if (caseId === "T1-LAW-005" &&
    spec.algorithm === "drop-diatonic-transposition") {
    return {
      selectorId: "law-five-source-target-pairs",
      targets: t1FindSemanticTargets(candidate, (entry) =>
        t1MutableRecord(entry["source"]) !== null &&
        t1MutableRecord(entry["target"]) !== null
      ),
    };
  }
  if (caseId === "T1-LAW-007" &&
    spec.algorithm === "duplicate-cross-category-degree") {
    return {
      selectorId: "law-seven-cross-category-duplicate-witness",
      targets: t1FindSemanticTargets(candidate, (entry) =>
        entry["caseId"] === "T1-LIT-079" && Array.isArray(entry["degrees"])
      ),
    };
  }
  if (caseId === "T1-LAW-012" &&
    spec.algorithm === "fallback-unsupported-family") {
    const fallbackIds = new Set(["T1-LIT-060", "T1-LIT-061", "T1-LIT-071"]);
    return {
      selectorId: "law-twelve-nearest-family-refusal-witnesses",
      targets: t1FindSemanticTargets(candidate, (entry) =>
        typeof entry["caseId"] === "string" &&
        fallbackIds.has(entry["caseId"]) &&
        t1MutableRecord(entry["payload"]) !== null
      ).map((target) => ({
        targetId: target.targetId,
        path: `${target.path}.payload`,
        value: t1MutableRecord(target.value)?.["payload"],
      })),
    };
  }
  if (caseId === "T1-OPSTATE-007" &&
    spec.algorithm === "advance-first-excess-bound") {
    return {
      selectorId: `operation-first-excess:${String(spec.parameters["field"])}`,
      targets: t1FindSemanticTargets(candidate, (entry) => {
        const proof = t1MutableRecord(entry["firstExcessProof"]);
        return proof !== null && proof["field"] === spec.parameters["field"];
      }),
    };
  }
  if (caseId === "T1-OPSTATE-009" &&
    spec.algorithm === "accept-seventeenth-semantic-degree") {
    return {
      selectorId: "operation-output-limit-row",
      targets: t1FindSemanticTargets(candidate, (entry) =>
        entry["id"] === "T1-EVIDENCE-OUTPUT-LIMIT-REFUSAL"
      ),
    };
  }
  if (caseId === "T1-OPSTATE-010" &&
    spec.algorithm === "reverse-refusal-precedence") {
    return {
      selectorId: "operation-first-global-precedence-row",
      targets: t1FindSemanticTargets(candidate, (entry) =>
        entry["id"] === "T1-PRECEDENCE-001"
      ),
    };
  }
  if (caseId === "T1-OPSTATE-007" &&
    spec.algorithm === "rewrite-refusal-path-to-generated-output") {
    return {
      selectorId: "operation-first-excess-refusal-records",
      targets: t1FindSemanticTargets(candidate, (entry) =>
        t1MutableRecord(entry["refusal"]) !== null
      ),
    };
  }
  if (caseId === "T1-OPSTATE-008" &&
    spec.algorithm === "rewrite-refusal-path-to-generated-output") {
    return {
      selectorId: "operation-refusal-path-matrix",
      targets: [{ targetId: caseId, path: "$", value: candidate }],
    };
  }
  return {
    selectorId: caseId === "T1-FAMILY-STATE-MATRIX-001"
      ? "family-state-coupled-summary"
      : "single-reviewed-case-payload",
    targets: [{ targetId: caseId, path: "$", value: candidate }],
  };
}

function t1DirectedSpelling(
  root: Readonly<{ step: string; alter: number }>,
  degree: Readonly<{ number: number; alter: number }>,
): Readonly<{ spelled: Readonly<{ step: string; alter: number }>; pitchClass: number }> {
  const rootStepIndex = T1_DIATONIC_STEPS.indexOf(
    root.step as typeof T1_DIATONIC_STEPS[number],
  );
  const rootNaturalPitch = T1_NATURAL_PITCH_BY_STEP[root.step];
  const zeroBasedDegree = degree.number - 1;
  const targetStepOffset = rootStepIndex + zeroBasedDegree;
  const targetStep = T1_DIATONIC_STEPS[
    ((targetStepOffset % T1_DIATONIC_STEPS.length) + T1_DIATONIC_STEPS.length) %
      T1_DIATONIC_STEPS.length
  ];
  const scaleSemitones = T1_MAJOR_SCALE_SEMITONES[
    zeroBasedDegree % T1_MAJOR_SCALE_SEMITONES.length
  ];
  if (rootStepIndex < 0 || rootNaturalPitch === undefined ||
    targetStep === undefined || scaleSemitones === undefined) {
    throw new Error("reviewed directed spelling input is invalid");
  }
  const targetStepNaturalPitch = T1_NATURAL_PITCH_BY_STEP[targetStep];
  if (targetStepNaturalPitch === undefined) {
    throw new Error("reviewed directed spelling target is invalid");
  }
  const targetNaturalPitch = targetStepNaturalPitch +
    (12 * Math.floor(targetStepOffset / T1_DIATONIC_STEPS.length));
  const targetPitch = rootNaturalPitch + root.alter + scaleSemitones +
    (12 * Math.floor(zeroBasedDegree / T1_DIATONIC_STEPS.length)) + degree.alter;
  return {
    spelled: { step: targetStep, alter: targetPitch - targetNaturalPitch },
    pitchClass: ((targetPitch % 12) + 12) % 12,
  };
}

function t1OverflowSpellingSuccess(
  caseId: string,
  clamp: boolean,
): Readonly<{ ok: true; value: JsonRecord }> {
  const fixture = spellingFixture.cases.find(({ id }) => id === caseId);
  const refusal = t1MutableRecord(fixture?.expected.refusal);
  if (fixture === undefined ||
    refusal === null || typeof refusal["requiredAlteration"] !== "number") {
    throw new Error(`${caseId} overflow fixture missing`);
  }
  const exact = t1DirectedSpelling(fixture.root, fixture.degree);
  const requiredAlteration = refusal["requiredAlteration"];
  const emittedAlteration = clamp
    ? Math.max(-2, Math.min(2, requiredAlteration))
    : requiredAlteration;
  const emittedPitchClass = clamp
    ? ((Number(T1_NATURAL_PITCH_BY_STEP[exact.spelled.step]) + emittedAlteration) %
      12 + 12) % 12
    : exact.pitchClass;
  return {
    ok: true,
    value: {
      policyId: "changes.degree-spelling",
      policyVersion: 1,
      root: fixture.root,
      degree: fixture.degree,
      spelled: { step: exact.spelled.step, alter: emittedAlteration },
      pitchClass: emittedPitchClass,
    },
  };
}

type T1SpellingMatrixCounterfactual =
  | "clamp-one-overflow"
  | "reject-one-non-formula-degree";

function t1IndependentSpellingResult(
  root: Readonly<{ step: string; alter: number }>,
  degree: Readonly<{ number: number; alter: number }>,
): Readonly<Record<string, unknown>> {
  const directed = t1DirectedSpelling(root, degree);
  const requiredAlteration = directed.spelled.alter;
  if (requiredAlteration < -2 || requiredAlteration > 2) {
    return {
      ok: false,
      refusal: {
        code: "theory.spelling_accidental_out_of_range",
        path: ["degree"],
        phase: "spelling",
        degreeSpellingPolicyId: "changes.degree-spelling",
        degreeSpellingPolicyVersion: 1,
        root,
        degree,
        requiredAlteration,
        minimum: -2,
        maximum: 2,
      },
    };
  }
  return {
    ok: true,
    value: {
      policyId: "changes.degree-spelling",
      policyVersion: 1,
      root,
      degree,
      spelled: directed.spelled,
      pitchClass: directed.pitchClass,
    },
  };
}

function t1SpellingMatrixCounterfactualSummary(
  counterfactual: T1SpellingMatrixCounterfactual,
): Readonly<{
  cells: number;
  successes: number;
  refusals: number;
  minimumRequiredAlteration: number;
  maximumRequiredAlteration: number;
  semanticDigest: string;
}> {
  const matrix = spellingFixture.publicDegreeMatrix;
  const orderedCells: unknown[] = [];
  let successes = 0;
  let refusals = 0;
  let minimumRequiredAlteration = Number.POSITIVE_INFINITY;
  let maximumRequiredAlteration = Number.NEGATIVE_INFINITY;
  let transitionedCells = 0;
  for (const step of matrix.rootSteps) {
    for (const rootAlter of matrix.rootAlterations) {
      const root = { step, alter: rootAlter };
      for (const number of matrix.degreeNumbers) {
        for (const degreeAlter of matrix.degreeAlterations) {
          const degree = { number, alter: degreeAlter };
          const baseline = t1IndependentSpellingResult(root, degree);
          let expected: unknown = baseline;
          if (
            counterfactual === "clamp-one-overflow" &&
            step === "C" && rootAlter === 2 && number === 9 && degreeAlter === 1
          ) {
            if (baseline["ok"] !== false) {
              throw new Error("reviewed verifier clamp cell must refuse");
            }
            const directed = t1DirectedSpelling(root, degree);
            const emittedAlteration = Math.max(-2, Math.min(
              2,
              directed.spelled.alter,
            ));
            expected = {
              ok: true,
              value: {
                policyId: "changes.degree-spelling",
                policyVersion: 1,
                root,
                degree,
                spelled: { step: directed.spelled.step, alter: emittedAlteration },
                pitchClass: t1PitchClass(
                  Number(T1_NATURAL_PITCH_BY_STEP[directed.spelled.step]) +
                    emittedAlteration,
                ),
              },
            };
            transitionedCells += 1;
          } else if (
            counterfactual === "reject-one-non-formula-degree" &&
            step === "C" && rootAlter === 0 && number === 2 && degreeAlter === 1
          ) {
            if (baseline["ok"] !== true) {
              throw new Error("reviewed verifier non-formula cell must succeed");
            }
            expected = {
              ok: false,
              refusal: {
                code: "theory.spelling_degree_unsupported",
                path: ["degree"],
                phase: "spelling",
                degreeSpellingPolicyId: "changes.degree-spelling",
                degreeSpellingPolicyVersion: 1,
                root,
                degree,
                reason: "degree-identity-not-emitted-by-formula-table",
              },
            };
            transitionedCells += 1;
          }
          const body = t1MutableRecord(expected);
          if (body?.["ok"] === true) {
            successes += 1;
          } else {
            refusals += 1;
            const requiredAlteration = t1MutableRecord(body?.["refusal"])
              ?.["requiredAlteration"];
            if (typeof requiredAlteration === "number") {
              minimumRequiredAlteration = Math.min(
                minimumRequiredAlteration,
                requiredAlteration,
              );
              maximumRequiredAlteration = Math.max(
                maximumRequiredAlteration,
                requiredAlteration,
              );
            }
          }
          orderedCells.push({ input: { root, degree }, expected });
        }
      }
    }
  }
  if (transitionedCells !== 1) {
    throw new Error(
      `${counterfactual} changed ${transitionedCells.toString()} verifier cells`,
    );
  }
  return {
    cells: orderedCells.length,
    successes,
    refusals,
    minimumRequiredAlteration,
    maximumRequiredAlteration,
    semanticDigest: t1CanonicalDigest(orderedCells),
  };
}

function t1ExposePartialRefusalOutput(root: unknown): number {
  return t1WalkMutable(root, (entry) => {
    if (entry["ok"] !== false || !("refusal" in entry) || "value" in entry) return 0;
    entry["value"] = {
      realizations: [],
      warnings: [],
      candidateDegrees: [],
    };
    return 1;
  });
}

function t1MutateLawFiveTransposedTarget(pair: unknown): number {
  const body = t1MutableRecord(pair);
  const target = t1MutableRecord(body?.["target"]);
  const targetValue = t1MutableRecord(target?.["value"]);
  const pitchClass = targetValue?.["pitchClass"];
  if (targetValue === null || typeof pitchClass !== "number" ||
    t1MutableRecord(targetValue["spelled"]) === null) return 0;
  const replacement = t1ConvenienceSpelling(pitchClass);
  if (stableJson(targetValue["spelled"]) === stableJson(replacement)) return 0;
  targetValue["spelled"] = replacement;
  return 1;
}

function t1MutateSemitoneOnlySnapshot(snapshot: unknown): number {
  const target = t1MutableRecord(snapshot);
  const pitchClasses = target?.["pitchClasses"];
  const spellings = target?.["spelledPitchNames"];
  if (target === null || !Array.isArray(pitchClasses) ||
    !Array.isArray(spellings) || pitchClasses.length === 0) return 0;
  let changed = 0;
  const rewritten = pitchClasses.map((pitchClass, index) => {
    if (typeof pitchClass !== "number") {
      throw new TypeError("verifier semitone-only pitch class missing");
    }
    const replacement = t1ConvenienceSpelling(pitchClass);
    if (stableJson(spellings[index]) !== stableJson(replacement)) changed += 1;
    return replacement;
  });
  target["spelledPitchNames"] = rewritten;
  const root = t1ConvenienceSpelling(Number(pitchClasses[0]));
  if (stableJson(target["root"]) !== stableJson(root)) changed += 1;
  target["root"] = root;
  const bass = t1MutableRecord(target["bass"]);
  if (bass !== null) {
    const bassPitchClass = t1SpelledPitchClass(bass);
    if (bassPitchClass === null) {
      throw new TypeError("verifier semitone-only bass spelling invalid");
    }
    const convenientBass = t1ConvenienceSpelling(bassPitchClass);
    if (stableJson(target["bass"]) !== stableJson(convenientBass)) changed += 1;
    target["bass"] = convenientBass;
  }
  return changed;
}

function t1MergeEqualAlteredRealizations(root: unknown): number {
  return t1WalkMutable(root, (entry) => {
    const realizations = entry["realizations"];
    if (!Array.isArray(realizations) || realizations.length !== 4) return 0;
    const representatives: unknown[] = [];
    const ninthGroups = new Set<number>();
    for (const realization of realizations as readonly unknown[]) {
      const degrees = t1MutableRecord(realization)?.["degrees"];
      if (!Array.isArray(degrees)) continue;
      const ninth = (degrees as readonly unknown[]).find((degree) =>
        t1MutableRecord(degree)?.["number"] === 9
      );
      const alteration = t1MutableRecord(ninth)?.["alter"];
      if (typeof alteration !== "number" || ninthGroups.has(alteration)) continue;
      ninthGroups.add(alteration);
      representatives.push(realization);
    }
    if (representatives.length !== 2) return 0;
    entry["realizations"] = representatives;
    return realizations.length - representatives.length;
  });
}

function t1RetainSharpFiveInOriginalVariants(root: unknown): number {
  return t1WalkMutable(root, (entry) => {
    const id = entry["id"];
    return typeof id === "string" && id.startsWith("alt-") &&
        id.endsWith("-sharp5")
      ? t1AppendDegree(entry, "#5", "required")
      : 0;
  });
}

function t1RetainFirstAlteredVariant(root: unknown): number {
  return t1WalkMutable(root, (entry) => {
    const realizations = entry["realizations"];
    if (Array.isArray(realizations) && realizations.length > 1) {
      entry["realizations"] = realizations.slice(0, 1);
      return realizations.length - 1;
    }
    const variantOrder = entry["variantOrder"];
    if (typeof realizations !== "number" || realizations <= 1 ||
      !Array.isArray(variantOrder) || variantOrder.length !== realizations) {
      return 0;
    }
    const semanticOutputRecords = entry["semanticOutputRecords"];
    const spellingAttempts = entry["spellingAttempts"];
    if (typeof semanticOutputRecords !== "number" ||
      typeof spellingAttempts !== "number") return 0;
    entry["realizations"] = 1;
    entry["variantOrder"] = variantOrder.slice(0, 1);
    entry["semanticOutputRecords"] = semanticOutputRecords / realizations;
    entry["spellingAttempts"] = spellingAttempts / realizations;
    return 4;
  });
}

function t1InsertSlashBassMembership(root: unknown): number {
  return t1WalkMutable(root, (entry, path) => {
    if (path.includes(".source") || t1SpelledPitchValue(entry["bass"]) === null) {
      return 0;
    }
    const bass = t1SpelledPitchValue(entry["bass"]);
    if (bass === null) return 0;
    const bassPitchClass = t1SpelledPitchClass(bass);
    if (bassPitchClass === null) return 0;
    const directSpellings = entry["spelledPitchNames"];
    const directPitchClasses = entry["pitchClasses"];
    if (Array.isArray(directSpellings) && Array.isArray(directPitchClasses) &&
      entry["degrees"] === null) {
      directSpellings.push(t1MutableJsonClone(bass));
      directPitchClasses.push(bassPitchClass);
      return 2;
    }
    const realizations = entry["realizations"];
    if (!Array.isArray(realizations)) return 0;
    let changed = 0;
    for (const realizationValue of realizations) {
      const realization = t1MutableRecord(realizationValue);
      const spellings = realization?.["spelledPitchNames"];
      const pitchClasses = realization?.["pitchClasses"];
      if (realization === null || !Array.isArray(spellings) ||
        !Array.isArray(pitchClasses)) continue;
      const degrees = realization["degrees"];
      if (degrees === null) {
        spellings.push(t1MutableJsonClone(bass));
        pitchClasses.push(bassPitchClass);
        changed += 2;
        continue;
      }
      if (!Array.isArray(degrees) || degrees.length !== spellings.length ||
        spellings.length !== pitchClasses.length) continue;
      const memberIndex = spellings.findIndex((spelling) =>
        stableJson(spelling) === stableJson(bass)
      );
      if (memberIndex < 0) {
        throw new Error("reviewed verifier slash bass must match a member");
      }
      const degree: unknown = degrees[memberIndex];
      const parsedDegree = t1ChordDegreeValue(degree);
      if (parsedDegree === null) {
        throw new TypeError("reviewed verifier slash-bass degree invalid");
      }
      const degreeToken = t1DegreeToken(parsedDegree);
      degrees.push(t1MutableJsonClone(degree));
      spellings.push(t1MutableJsonClone(bass));
      pitchClasses.push(bassPitchClass);
      changed += 3;
      for (const [requiredKey, optionalKey] of t1RolePairs()) {
        const required = realization[requiredKey];
        const optional = realization[optionalKey];
        if (!Array.isArray(required) || !Array.isArray(optional)) continue;
        const role = required.some((item) => t1DegreeMatches(item, degreeToken))
          ? required
          : optional;
        role.push(t1MutableJsonClone(degree));
        changed += 1;
      }
      for (const key of ["guide", "guideToneDegrees"]) {
        const guide = realization[key];
        if (Array.isArray(guide) && guide.some((item) =>
          stableJson(item) === stableJson(degree)
        )) {
          guide.push(t1MutableJsonClone(degree));
          changed += 1;
        }
      }
    }
    return changed;
  });
}

function t1DuplicateReviewedCrossCategoryDegree(
  target: T1SelectedSemanticTarget,
): number {
  const duplicateInList = (degreeList: unknown[]): number => {
    const index = degreeList.findIndex((degree) => t1DegreeMatches(degree, "9"));
    if (index < 0) return 0;
    degreeList.splice(index + 1, 0, t1MutableJsonClone(degreeList[index]));
    return 1;
  };
  const selectedDegrees = t1MutableRecord(target.value)?.["degrees"];
  if (Array.isArray(selectedDegrees) && selectedDegrees.length > 0 &&
    Array.isArray(selectedDegrees[0])) {
    return duplicateInList(selectedDegrees[0] as unknown[]);
  }
  let changed = 0;
  t1WalkMutable(target.value, (entry) => {
    if (changed > 0 || typeof entry["formulaRuleId"] !== "string") return 0;
    const degrees = entry["degrees"];
    if (!Array.isArray(degrees) || degrees.some(Array.isArray)) return 0;
    changed += duplicateInList(degrees as unknown[]);
    return 0;
  });
  return changed;
}

function t1SyntheticParsedSuccess(
  source: JsonRecord,
  formulaRuleId: string,
  degrees: readonly string[],
  required: readonly string[],
  optional: readonly string[],
  guide: readonly string[],
): JsonRecord {
  const root = t1MutableRecord(source["root"]);
  if (root === null || typeof root["step"] !== "string" ||
    typeof root["alter"] !== "number") {
    throw new Error("synthetic source root missing");
  }
  const degreeRecords = degrees.map(t1DegreeParts);
  const spellings = degreeRecords.map((degree) => t1DirectedSpelling({
    step: root["step"] as string,
    alter: root["alter"] as number,
  }, degree));
  return {
    ok: true,
    value: {
      ...literalFixture.expectedMetadata,
      source,
      realizations: [{
        kind: "semantic",
        id: "literal",
        formulaRuleId,
        degrees: degreeRecords,
        requiredDegrees: required.map(t1DegreeParts),
        optionalDegrees: optional.map(t1DegreeParts),
        guideToneDegrees: guide.map(t1DegreeParts),
        spelledPitchNames: spellings.map(({ spelled }) => spelled),
        pitchClasses: spellings.map(({ pitchClass }) => pitchClass),
      }],
      bass: source["bass"],
      warnings: [],
    },
  };
}

function t1SeventeenthDegreeSuccess(): JsonRecord {
  const additions = ["2", "3", "4", "6", "9", "11", "13"].map(t1DegreeParts);
  const alterations = ["#5", "b9", "#9", "b11", "#11", "b13", "#13"]
    .map(t1DegreeParts);
  const degrees = [
    "1", "2", "b3", "3", "4", "b5", "#5", "6", "b9", "9", "#9",
    "b11", "11", "#11", "b13", "13", "#13",
  ];
  return t1SyntheticParsedSuccess({
    kind: "parsed",
    sourceText: "Cdim",
    root: { step: "C", alter: 0 },
    triad: "diminished",
    sixth: null,
    seventh: null,
    extensions: [],
    additions,
    alterations,
    omissions: [],
    bass: null,
    colorPolicy: "none",
  }, "base-diminished", degrees, degrees, [], ["b3"]);
}

function t1FallbackSuccess(caseId: string): JsonRecord {
  if (caseId === "T1-LIT-060") {
    return t1SyntheticParsedSuccess({
      kind: "parsed", sourceText: "Cm(maj7)", root: { step: "C", alter: 0 },
      triad: "minor", sixth: null, seventh: "major",
      extensions: [{ number: 9, alter: 0 }], additions: [], alterations: [],
      omissions: [], bass: null, colorPolicy: "none",
    }, "seventh-minor-major", ["1", "b3", "5", "7"],
    ["1", "b3", "7"], ["5"], ["b3", "7"]);
  }
  if (caseId === "T1-LIT-061") {
    return t1SyntheticParsedSuccess({
      kind: "parsed", sourceText: "Cdim", root: { step: "C", alter: 0 },
      triad: "diminished", sixth: null, seventh: "diminished",
      extensions: [{ number: 9, alter: 0 }], additions: [], alterations: [],
      omissions: [], bass: null, colorPolicy: "none",
    }, "seventh-diminished", ["1", "b3", "b5", "bb7"],
    ["1", "b3", "b5", "bb7"], [], ["b3", "bb7"]);
  }
  if (caseId === "T1-LIT-071") {
    return t1SyntheticParsedSuccess({
      kind: "parsed", sourceText: "C5", root: { step: "C", alter: 0 },
      triad: "power", sixth: null, seventh: "minor", extensions: [],
      additions: [], alterations: [], omissions: [], bass: null,
      colorPolicy: "none",
    }, "base-power", ["1", "5"], ["1", "5"], [], []);
  }
  throw new Error(`${caseId} has no reviewed fallback counterfactual`);
}

function t1MutateFamilyStateFallback(root: unknown): number {
  const entry = t1MutableRecord(root);
  if (entry === null || typeof entry["acceptedStates"] !== "number") return 0;
  const outcomeCounts = t1MutableRecord(entry["outcomeCounts"]);
  const reasons = t1MutableRecord(entry["reasonAndConflictCounts"]);
  const acceptedRules = t1MutableRecord(entry["acceptedRuleIdCounts"]);
  const refusalRules = t1MutableRecord(entry["refusalRuleIdCounts"]);
  const unsupportedRules = t1MutableRecord(
    refusalRules?.["theory.formula_family_unsupported"],
  );
  const orderedPublicOutcomes = entry["orderedPublicOutcomes"];
  if (outcomeCounts === null || reasons === null || acceptedRules === null ||
    refusalRules === null || unsupportedRules === null ||
    !Array.isArray(orderedPublicOutcomes) ||
    typeof outcomeCounts["accepted"] !== "number" ||
    typeof outcomeCounts["theory.formula_family_unsupported"] !== "number" ||
    typeof reasons["unsupported-seventh"] !== "number" ||
    typeof unsupportedRules["base-power"] !== "number") return 0;
  const targetFacts = {
    triad: "power",
    sixth: null,
    seventh: "minor",
    extension: null,
    naturalNineAddition: false,
    colorPolicy: "none",
  };
  const changedIndex = orderedPublicOutcomes.findIndex((value) => {
    const cell = t1MutableRecord(value);
    const expected = t1MutableRecord(cell?.["expected"]);
    const refusal = t1MutableRecord(expected?.["refusal"]);
    return stableJson(cell?.["facts"]) === stableJson(targetFacts) &&
      expected?.["ok"] === false &&
      refusal?.["code"] === "theory.formula_family_unsupported" &&
      refusal["ruleId"] === "base-power";
  });
  if (changedIndex < 0) {
    throw new Error("verifier family fallback target cell missing");
  }
  const changedCell = t1MutableRecord(orderedPublicOutcomes[changedIndex]);
  if (changedCell === null) {
    throw new TypeError("verifier family fallback target malformed");
  }
  if (changedIndex !== 800) {
    throw new Error(
      `verifier family fallback expected cell 800, received ${changedIndex.toString()}`,
    );
  }
  const baselineExpected = t1MutableJsonClone(changedCell["expected"]);
  const mutantExpected = t1SyntheticParsedSuccess({
    ...formulaFixture.familyStateMatrix.sourceDefaults,
    triad: "power",
    sixth: null,
    seventh: "minor",
    extensions: [],
    additions: [],
    colorPolicy: "none",
  }, "base-power", ["1", "5"], ["1", "5"], [], []);
  const baselineDigest = entry["semanticDigest"];
  changedCell["expected"] = mutantExpected;
  entry["acceptedStates"] += 1;
  outcomeCounts["accepted"] += 1;
  outcomeCounts["theory.formula_family_unsupported"] -= 1;
  reasons["unsupported-seventh"] -= 1;
  acceptedRules["base-power"] = Number(acceptedRules["base-power"] ?? 0) + 1;
  unsupportedRules["base-power"] -= 1;
  const mutantDigest = t1CanonicalDigest(orderedPublicOutcomes);
  entry["semanticDigest"] = mutantDigest;
  entry["counterfactualDigestProof"] = {
    preimageKind: "ordered-public-family-state-outcomes",
    preimageLength: orderedPublicOutcomes.length,
    changedCellCount: 1,
    changedIndex,
    changedFacts: t1MutableJsonClone(changedCell["facts"]),
    baselineExpected,
    mutantExpected: t1MutableJsonClone(mutantExpected),
    baselineDigest,
    mutantDigest,
  };
  return 10;
}

function t1FirstExcessFixtureRow(field: string): JsonRecord {
  const operation = operationFixture.cases.find(({ id }) =>
    id === "T1-OPSTATE-007"
  );
  const row = operation?.rows?.find((candidate) =>
    t1MutableRecord(candidate)?.["field"] === field
  );
  if (row === undefined) {
    throw new Error(`verifier first-excess fixture row ${field} missing`);
  }
  const body = t1MutableRecord(row);
  if (body === null) throw new TypeError("verifier first-excess row malformed");
  return body;
}

function t1FormulaRefusalEvidence(
  inputDegreeRecordsVisited: number,
): JsonRecord {
  return {
    inputDegreeRecordsVisited,
    formulaPhaseTransitions: 0,
    candidateDegreesObserved: 0,
    duplicateDegreesCanonicalized: 0,
    realizationsProduced: 0,
    spellingAttempts: 0,
    degreesProduced: 0,
    warningsProduced: 0,
    peakCandidateDegreeRecords: 0,
    termination: "formula-refusal",
  };
}

function t1AdvanceFirstExcessOutcome(rowValue: unknown, field: string): number {
  const row = t1MutableRecord(rowValue);
  const proof = t1MutableRecord(row?.["firstExcessProof"]);
  const fixtureRow = t1FirstExcessFixtureRow(field);
  const firstExcessIndex = fixtureRow["firstExcessIndex"];
  const inputRecipe = t1MutableRecord(fixtureRow["inputRecipe"]);
  const expectedRefusal = t1MutableRecord(fixtureRow["expectedRefusal"]);
  if (row === null || proof === null || typeof firstExcessIndex !== "number" ||
    !Array.isArray(inputRecipe?.[field]) || expectedRefusal === null) return 0;
  const originalSourceRefusal = {
    ...(t1MutableJsonClone(expectedRefusal) as JsonRecord),
    reason: "number",
  };
  proof["firstExcessIndex"] = null;
  proof["countRefusalObserved"] = false;
  proof["invalidationReason"] =
    "semantic-validation-before-raised-count-bound";
  proof["result"] = { ok: false, refusal: originalSourceRefusal };
  proof["evidence"] = t1FormulaRefusalEvidence(firstExcessIndex + 1);
  row["result"] = { ok: false, refusal: originalSourceRefusal };
  row["evidence"] = t1FormulaRefusalEvidence(firstExcessIndex + 1);
  return 7;
}

type T1AppliedCounterfactual = Readonly<{
  mutatedProjection: unknown;
  affectedCount: number;
  selectorId: string;
  selectedTargets: readonly Readonly<{ targetId: string; path: string }>[];
}>;

function t1ApplyRuntimeCounterfactual(
  spec: T1SemanticOperatorSpec,
  caseId: string,
  baseline: unknown,
): T1AppliedCounterfactual {
  const mutant = t1MutableJsonClone(baseline);
  const selection = t1SelectSemanticTargets(spec, caseId, mutant);
  if (selection.targets.length === 0) {
    throw new Error(
      `${spec.controlId}/${caseId} selector ${selection.selectorId} matched no targets`,
    );
  }
  const mutateSelected = (
    mutation: (target: T1SelectedSemanticTarget) => number,
  ): number => selection.targets.reduce(
    (sum, target) => sum + mutation(target),
    0,
  );
  const parameter = (key: string): unknown => spec.parameters[key];
  const derivedTargets: Array<Readonly<{ targetId: string; path: string }>> = [];
  let affected: number;
  switch (spec.algorithm) {
    case "rewrite-degree-identity":
      affected = mutateSelected(({ value }) => t1RewriteDegreeIdentity(
        value, String(parameter("from")), String(parameter("to")),
      ));
      break;
    case "move-degree-role":
      affected = mutateSelected(({ value }) => t1MoveDegreeRole(
        value,
        String(parameter("degree")),
        parameter("from") as "required" | "optional",
        parameter("to") as "required" | "optional",
      ));
      break;
    case "remove-degree":
      affected = mutateSelected(({ value }) =>
        t1RemoveDegrees(value, parameter("degrees") as readonly string[])
      );
      break;
    case "append-semantic-degree":
      affected = mutateSelected(({ value }) => t1AppendDegree(
        value,
        String(parameter("degree")),
        String(parameter("role")),
      ));
      break;
    case "retain-suspension-third":
      affected = caseId === "T1-LIT-055"
        ? mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
            if (!Array.isArray(entry["warnings"]) || entry["warnings"].length === 0) {
              return 0;
            }
            entry["warnings"] = [];
            return 1;
          }))
        : mutateSelected(({ value }) => t1AppendDegree(value, "3", "guide"));
      break;
    case "collapse-equal-pitch-class-records":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
        const pitches = entry["spelledPitchNames"];
        const classes = entry["pitchClasses"];
        if (!Array.isArray(pitches) || !Array.isArray(classes) || classes.length < 2) {
          return 0;
        }
        const duplicate = classes.findIndex((item, index) =>
          classes.indexOf(item) < index
        );
        if (duplicate < 0) return 0;
        pitches.splice(duplicate, 1);
        classes.splice(duplicate, 1);
        return 2;
      }));
      break;
    case "reuse-root-letter":
      affected = mutateSelected(({ value }) =>
        t1ReplaceStandaloneSpelling(value, (entry) => {
        const root = t1MutableRecord(entry["root"]);
        const step = root?.["step"];
        const pitchClass = entry["pitchClass"];
        if (typeof step !== "string" || typeof pitchClass !== "number") {
          return null;
        }
        const natural = T1_NATURAL_PITCH_BY_STEP[step];
        if (natural === undefined) return null;
        let alter = t1PitchClass(pitchClass) - natural;
        if (alter > 6) alter -= 12;
        if (alter < -6) alter += 12;
        return { step, alter };
      }));
      break;
    case "pitch-class-first-enharmonic": {
      const choices: Readonly<Record<string, Readonly<{
        step: string;
        alter: number;
      }>>> = {
        "T1-SPELL-001": { step: "B", alter: 0 },
        "T1-SPELL-002": { step: "F", alter: 0 },
        "T1-SPELL-003": { step: "E", alter: -1 },
        "T1-SPELL-006": { step: "F", alter: 0 },
      };
      affected = mutateSelected(({ value }) =>
        t1ReplaceStandaloneSpelling(value, () => choices[caseId] ?? null)
      );
      break;
    }
    case "accept-accidental-overflow":
      affected = caseId === "T1-SPELL-PUBLIC-MATRIX-001"
        ? mutateSelected(({ value }) => {
            const entry = t1MutableRecord(value);
            if (entry === null) return 0;
            Object.assign(
              entry,
              t1SpellingMatrixCounterfactualSummary("clamp-one-overflow"),
            );
            return 3;
          })
        : mutateSelected(({ value }) => {
            const target = t1MutableRecord(value);
            if (target === null || target["ok"] !== false) return 0;
            const success = t1OverflowSpellingSuccess(
              caseId,
              parameter("clamp") === true,
            );
            t1ReplaceRecordContents(target, success);
            return 1;
          });
      break;
    case "drop-diatonic-transposition":
      affected = caseId === "T1-LAW-005"
        ? mutateSelected(({ value }) => t1MutateLawFiveTransposedTarget(value))
        : mutateSelected(({ value }) => t1MutateSemitoneOnlySnapshot(value));
      break;
    case "leave-slash-bass-untransposed":
      affected = mutateSelected(({ value }) => {
        const target = t1MutableRecord(value);
        if (target === null || target["bass"] === undefined) return 0;
        target["bass"] = { step: "G", alter: 0 };
        return 1;
      });
      break;
    case "keep-first-altered-realization":
      affected = mutateSelected(({ value }) =>
        t1RetainFirstAlteredVariant(value)
      );
      break;
    case "reverse-altered-realization-order":
      affected = mutateSelected(({ value }) =>
        t1AlterArrayOrder(value, "realizations", false) +
        t1AlterArrayOrder(value, "variantOrder", false)
      );
      break;
    case "merge-equal-altered-realizations":
      affected = mutateSelected(({ value }) =>
        t1MergeEqualAlteredRealizations(value)
      );
      break;
    case "remove-explicit-add-three":
      affected = mutateSelected(({ value }) => t1RemoveDegrees(value, ["3"]));
      break;
    case "retain-extension-natural-closure":
      affected = mutateSelected(({ value }) =>
        (parameter("degrees") as readonly string[]).reduce(
          (sum, degree) => sum + t1AppendDegree(value, degree, "optional"),
          0,
        )
      );
      break;
    case "retain-one-omitted-alteration":
      affected = mutateSelected(({ value }) =>
        t1RetainSharpFiveInOriginalVariants(value)
      );
      break;
    case "addition-implies-extension-closure":
      affected = mutateSelected(({ value }) =>
        t1AppendDegree(value, "b7", "guide") +
        t1AppendDegree(value, "9", "optional")
      );
      break;
    case "move-highest-extension-to-optional":
      affected = mutateSelected(({ value }) =>
        ["13", "11", "9"].reduce(
          (sum, degree) =>
            sum + t1MoveDegreeRole(value, degree, "required", "optional"),
          0,
        )
      );
      break;
    case "move-identity-fifth-to-optional":
      affected = mutateSelected(({ value }) =>
        ["5", "b5", "#5"].reduce(
          (sum, degree) =>
            sum + t1MoveDegreeRole(value, degree, "required", "optional"),
          0,
        )
      );
      break;
    case "append-guide-degree":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
        let changed = 0;
        for (const key of ["guide", "guideToneDegrees"]) {
          const values = entry[key];
          if (!Array.isArray(values) || values.some((item) =>
            t1DegreeMatches(item, String(parameter("degree")))
          )) continue;
          values.push(t1DegreeValueLike(
            values[0] ?? "3",
            String(parameter("degree")),
          ));
          changed += 1;
        }
        return changed;
      }));
      break;
    case "suppress-omission-warning":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
        if (!Array.isArray(entry["warnings"]) || entry["warnings"].length === 0) {
          return 0;
        }
        entry["warnings"] = [];
        return 1;
      }));
      break;
    case "emit-warning-for-present-omission":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
        if (!Array.isArray(entry["warnings"]) || entry["warnings"].length !== 0) {
          return 0;
        }
        entry["warnings"] = [{
          code: "theory.omission_absent",
          path: ["omissions", 0],
          degreeNumber: 3,
          message: "The requested third omission had no matching degree to remove.",
        }];
        return 1;
      }));
      break;
    case "insert-slash-bass-into-membership":
      affected = mutateSelected(({ value }) =>
        t1InsertSlashBassMembership(value)
      );
      break;
    case "discard-slash-bass":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry, path) => {
        if (path.includes(".source") || entry["bass"] === null ||
          entry["bass"] === undefined) return 0;
        entry["bass"] = null;
        return 1;
      }));
      break;
    case "deduplicate-custom-pitches":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
        const pitches = entry["spelledPitchNames"];
        const classes = entry["pitchClasses"];
        if (!Array.isArray(pitches)) return 0;
        const seen = new Set<string>();
        const keep = pitches.map((pitch) => {
          const key = stableJson(pitch);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (keep.every(Boolean)) return 0;
        entry["spelledPitchNames"] = pitches.filter((_, index) => keep[index]);
        if (Array.isArray(classes)) {
          entry["pitchClasses"] = classes.filter((_, index) => keep[index]);
        }
        return 2;
      }));
      break;
    case "sort-custom-pitches-by-pitch-class":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
        const pitches = entry["spelledPitchNames"];
        const classes = entry["pitchClasses"];
        if (!Array.isArray(pitches) || !Array.isArray(classes) || pitches.length < 2) {
          return 0;
        }
        const pitchValues = pitches as unknown[];
        const classValues = classes as unknown[];
        const order = classValues.map((pitchClass, index) => ({ pitchClass, index }))
          .sort((left, right) =>
            Number(left.pitchClass) - Number(right.pitchClass) ||
            left.index - right.index
          )
          .map(({ index }) => index);
        if (order.every((index, position) => index === position)) return 0;
        entry["spelledPitchNames"] = order.map((index) => pitchValues[index]);
        entry["pitchClasses"] = order.map((index) => classValues[index]);
        return 2;
      }));
      break;
    case "infer-custom-formula":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
        if (entry["degrees"] !== null || !Array.isArray(entry["pitchClasses"])) {
          return 0;
        }
        const majorSeventh = caseId === "T1-CUSTOM-007";
        const degrees = majorSeventh ? ["1", "3", "5", "7"] : ["1", "b3", "5"];
        const required = majorSeventh ? ["1", "3", "7"] : ["1", "b3"];
        const optional = ["5"];
        const guide = majorSeventh ? ["3", "7"] : ["b3"];
        entry["kind"] = "semantic";
        entry["id"] = "literal";
        entry["formulaRuleId"] = majorSeventh ? "seventh-major" : "base-minor";
        entry["degrees"] = degrees.map(t1DegreeParts);
        entry["requiredDegrees"] = required.map(t1DegreeParts);
        entry["optionalDegrees"] = optional.map(t1DegreeParts);
        entry["guideToneDegrees"] = guide.map(t1DegreeParts);
        Reflect.deleteProperty(entry, "limitations");
        return 8;
      }));
      break;
    case "expose-partial-refusal-output":
      affected = mutateSelected(({ value }) => t1ExposePartialRefusalOutput(value));
      break;
    case "rewrite-refusal-path-to-generated-output":
      affected = mutateSelected(({ value }) => {
        let changed = t1MutatePaths(value);
        if (changed === 0 && Array.isArray(value)) {
          for (const path of value as unknown[]) {
            if (Array.isArray(path) && path[0] !== "realizations") {
              path.unshift("realizations", 0);
              changed += 1;
            }
          }
        }
        return changed;
      });
      break;
    case "advance-first-excess-bound":
      affected = mutateSelected(({ value }) =>
        t1AdvanceFirstExcessOutcome(value, String(parameter("field")))
      );
      break;
    case "reject-parsed-modifier-vocabulary":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
        if (entry["ok"] !== true || !("value" in entry)) return 0;
        delete entry["value"];
        entry["ok"] = false;
        const degree = caseId === "T1-LIT-038"
          ? { number: 11, alter: -1 }
          : { number: 13, alter: 1 };
        entry["refusal"] = {
          code: "theory.alteration_invalid",
          path: ["alterations", 0],
          phase: "color-alterations",
          ruleId: "seventh-dominant",
          received: degree,
          reason: "alteration",
        };
        return 3;
      }));
      break;
    case "duplicate-cross-category-degree":
      affected = mutateSelected((target) =>
        t1DuplicateReviewedCrossCategoryDegree(target)
      );
      break;
    case "accept-seventeenth-semantic-degree":
      affected = mutateSelected(({ targetId, value }) => {
        const success = t1SeventeenthDegreeSuccess();
        const target = t1MutableRecord(value);
        if (target === null) return 0;
        if (targetId === "T1-EVIDENCE-OUTPUT-LIMIT-REFUSAL") {
          const result = t1MutableRecord(target["result"]);
          if (result?.["ok"] !== false) return 0;
          target["result"] = success;
          target["evidence"] = {
            inputDegreeRecordsVisited: 14,
            formulaPhaseTransitions: 8,
            candidateDegreesObserved: 17,
            duplicateDegreesCanonicalized: 0,
            realizationsProduced: 1,
            spellingAttempts: 17,
            degreesProduced: 17,
            warningsProduced: 0,
            peakCandidateDegreeRecords: 17,
            termination: "complete",
          };
          return 2;
        }
        if (target["ok"] !== false) return 0;
        t1ReplaceRecordContents(target, success);
        return 1;
      });
      break;
    case "rewrite-abdim7-directed-spelling":
      affected = mutateSelected(({ value }) => t1WalkMutable(value, (entry) => {
        const spelled = t1MutableRecord(entry["spelled"]);
        if (spelled?.["step"] !== "G" || spelled["alter"] !== -2) return 0;
        spelled["step"] = "F";
        spelled["alter"] = -1;
        entry["pitchClass"] = 4;
        return 3;
      }));
      break;
    case "fallback-unsupported-family":
      affected = caseId === "T1-FAMILY-STATE-MATRIX-001"
        ? mutateSelected(({ value }) => t1MutateFamilyStateFallback(value))
        : mutateSelected(({ targetId, value }) => {
          const target = t1MutableRecord(value);
          if (target === null || target["ok"] !== false) return 0;
          const success = t1FallbackSuccess(targetId);
          t1ReplaceRecordContents(target, success);
          return 1;
        });
      break;
    case "reverse-refusal-precedence":
      affected = mutateSelected(({ value }) => {
        const row = t1MutableRecord(value);
        if (row?.["id"] !== "T1-PRECEDENCE-001") return 0;
        row["result"] = {
          ok: false,
          refusal: {
            code: "theory.extension_invalid",
            path: ["extensions", 0],
            phase: "base",
            ruleId: "base-major",
            received: { number: 7, alter: 0 },
            reason: "number",
          },
        };
        return 1;
      });
      break;
    case "restrict-public-spelling-domain":
      affected = mutateSelected(({ value }) => {
        const entry = t1MutableRecord(value);
        if (entry === null) return 0;
        Object.assign(
          entry,
          t1SpellingMatrixCounterfactualSummary(
            "reject-one-non-formula-degree",
          ),
        );
        return 3;
      });
      break;
    default:
      throw new Error(`${spec.controlId} unknown verifier algorithm ${spec.algorithm}`);
  }
  if (new Set([
    "rewrite-degree-identity",
    "remove-degree",
    "append-semantic-degree",
    "retain-suspension-third",
    "remove-explicit-add-three",
    "retain-extension-natural-closure",
    "retain-one-omitted-alteration",
    "addition-implies-extension-closure",
  ]).has(spec.algorithm)) {
    affected += mutateSelected(({ value }) =>
      t1ReconcileDerivedDegreeSpellings(value)
    );
  }
  affected += mutateSelected(({ value }) =>
    t1CanonicalizeSemanticDegreeArrays(value)
  );

  const mutantObservation = t1MutableRecord(mutant);
  if (caseId.startsWith("T1-LAW-") && mutantObservation !== null) {
    const semanticPredicate = t1MutableRecord(
      mutantObservation["semanticPredicate"],
    );
    if (semanticPredicate?.["passed"] === true) {
      semanticPredicate["passed"] = false;
      affected += 1;
      derivedTargets.push({
        targetId: `${caseId}/semanticPredicate.passed`,
        path: "$.semanticPredicate.passed",
      });
    }
  }
  if (caseId === "T1-OPSTATE-005" &&
    spec.algorithm === "expose-partial-refusal-output" &&
    mutantObservation !== null) {
    const result = t1MutableRecord(mutantObservation["result"]);
    const view = t1MutableRecord(mutantObservation["view"]);
    const partialValue = result !== null && "value" in result;
    const partial = partialValue ? t1MutableRecord(result["value"]) : null;
    if (result !== null && view !== null) {
      const derivedView = {
        partialValue,
        partialRealizations: partial !== null && "realizations" in partial,
        partialWarnings: partial !== null && "warnings" in partial,
        altSelection: partial !== null && "chosenVariant" in partial,
      };
      for (const [key, value] of Object.entries(derivedView)) {
        if (view[key] === value) continue;
        view[key] = value;
        affected += 1;
        derivedTargets.push({
          targetId: `${caseId}/view.${key}`,
          path: `$.view.${key}`,
        });
      }
    }
  }
  const mutantBody = t1MutableRecord(mutant);
  if (mutantBody !== null && Array.isArray(mutantBody["cells"]) &&
    typeof mutantBody["degreeSpellings"] === "number" &&
    typeof mutantBody["semanticDigest"] === "string") {
    const digest = t1CanonicalDigest(mutantBody["cells"]);
    if (mutantBody["semanticDigest"] !== digest) {
      mutantBody["semanticDigest"] = digest;
      affected += 1;
      derivedTargets.push({
        targetId: `${caseId}/semanticDigest`,
        path: "$.semanticDigest",
      });
    }
  }
  return {
    mutatedProjection: canonicalJsonValue(mutant),
    affectedCount: affected,
    selectorId: selection.selectorId,
    selectedTargets: [
      ...selection.targets.map(({ targetId, path }) => ({ targetId, path })),
      ...derivedTargets,
    ],
  };
}

function t1SemanticMismatchPaths(
  baseline: unknown,
  mutant: unknown,
  path = "$",
): readonly string[] {
  if (Object.is(baseline, mutant)) return [];
  if (Array.isArray(baseline) && Array.isArray(mutant)) {
    return sortedUnique(Array.from(
      { length: Math.max(baseline.length, mutant.length) },
      (_, index) => t1SemanticMismatchPaths(
        baseline[index],
        mutant[index],
        `${path}[${String(index)}]`,
      ),
    ).flat());
  }
  const left = t1MutableRecord(baseline);
  const right = t1MutableRecord(mutant);
  if (left !== null && right !== null) {
    const keys = sortedUnique([...Object.keys(left), ...Object.keys(right)]);
    return sortedUnique(keys.flatMap((key) =>
      t1SemanticMismatchPaths(left[key], right[key], `${path}.${key}`)
    ));
  }
  return [path];
}

function t1MismatchIsWithinSelectedTarget(
  mismatchPath: string,
  selectedPath: string,
): boolean {
  return selectedPath === "$" || mismatchPath === selectedPath ||
    mismatchPath.startsWith(`${selectedPath}.`) ||
    mismatchPath.startsWith(`${selectedPath}[`);
}

const T1_ORACLE_FIELDS_BY_ALGORITHM: Readonly<Record<string, readonly string[]>> = {
  "rewrite-degree-identity": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees", "degree"],
  "move-degree-role": ["required", "optional", "requiredDegrees", "optionalDegrees"],
  "remove-degree": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "append-semantic-degree": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "retain-suspension-third": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees", "warnings"],
  "collapse-equal-pitch-class-records": ["spelledPitchNames", "pitchClasses"],
  "reuse-root-letter": ["root", "degree", "spelled", "pitchClass"],
  "pitch-class-first-enharmonic": ["root", "degree", "spelled", "pitchClass"],
  "accept-accidental-overflow": ["ok", "refusal", "value", "cells", "successes", "refusals", "minimumRequiredAlteration", "maximumRequiredAlteration", "semanticDigest"],
  "drop-diatonic-transposition": ["recipeObservation", "semanticPredicate", "targetSnapshot", "inverseSnapshot", "source", "target", "root", "spelled", "spelledPitchNames", "pitchClasses", "bass"],
  "leave-slash-bass-untransposed": ["targetSnapshot", "inverseSnapshot", "bass", "semanticPredicate"],
  "keep-first-altered-realization": ["realizations", "semanticOutputRecords", "spellingAttempts", "chosenVariant", "variantOrder"],
  "reverse-altered-realization-order": ["realizations", "variantOrder"],
  "merge-equal-altered-realizations": ["realizations", "variantOrder"],
  "remove-explicit-add-three": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "retain-extension-natural-closure": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "retain-one-omitted-alteration": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "addition-implies-extension-closure": ["degrees", "required", "optional", "guide", "requiredDegrees", "optionalDegrees", "guideToneDegrees"],
  "move-highest-extension-to-optional": ["required", "optional", "requiredDegrees", "optionalDegrees"],
  "move-identity-fifth-to-optional": ["required", "optional", "requiredDegrees", "optionalDegrees"],
  "append-guide-degree": ["guide", "guideToneDegrees"],
  "suppress-omission-warning": ["warnings"],
  "emit-warning-for-present-omission": ["warnings"],
  "insert-slash-bass-into-membership": ["bass", "spelledPitchNames", "pitchClasses", "degrees"],
  "discard-slash-bass": ["bass"],
  "deduplicate-custom-pitches": ["spelledPitchNames", "pitchClasses"],
  "sort-custom-pitches-by-pitch-class": ["spelledPitchNames", "pitchClasses"],
  "infer-custom-formula": ["kind", "id", "formulaRuleId", "degrees", "requiredDegrees", "optionalDegrees", "guideToneDegrees", "limitations", "spelledPitchNames", "pitchClasses"],
  "expose-partial-refusal-output": ["ok", "refusal", "value", "view", "partialValue", "partialRealizations", "partialWarnings", "altSelection"],
  "rewrite-refusal-path-to-generated-output": ["path", "refusal"],
  "advance-first-excess-bound": ["field", "firstExcessIndex", "countRefusalObserved", "invalidationReason", "evidence", "result"],
  "reject-parsed-modifier-vocabulary": ["ok", "value", "refusal", "degrees"],
  "duplicate-cross-category-degree": ["degrees", "required", "optional", "requiredDegrees", "optionalDegrees", "semanticPredicate"],
  "accept-seventeenth-semantic-degree": ["ok", "refusal", "value", "evidence"],
  "rewrite-abdim7-directed-spelling": ["degree", "spelled", "pitchClass"],
  "fallback-unsupported-family": ["ok", "refusal", "value", "acceptedStates", "outcomeCounts", "reasonAndConflictCounts", "acceptedRuleIdCounts", "refusalRuleIdCounts", "orderedPublicOutcomes", "semanticDigest", "counterfactualDigestProof", "semanticPredicate"],
  "reverse-refusal-precedence": ["result", "refusal", "id"],
  "restrict-public-spelling-domain": ["cells", "successes", "refusals", "semanticDigest"],
};

function t1CollectOracleFields(
  value: unknown,
  fieldNames: ReadonlySet<string>,
  path = "$",
): readonly Readonly<{ path: string; value: unknown }>[] {
  const fields: Array<Readonly<{ path: string; value: unknown }>> = [];
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      fields.push(...t1CollectOracleFields(
        child,
        fieldNames,
        `${path}[${String(index)}]`,
      ));
    });
    return fields;
  }
  const body = t1MutableRecord(value);
  if (body === null) return fields;
  for (const [key, child] of Object.entries(body)) {
    const childPath = `${path}.${key}`;
    if (fieldNames.has(key)) fields.push({ path: childPath, value: child });
    fields.push(...t1CollectOracleFields(child, fieldNames, childPath));
  }
  return fields;
}

function t1SemanticOracleProjection(
  spec: T1SemanticOperatorSpec,
  caseId: string,
  candidate: unknown,
): unknown {
  const selection = t1SelectSemanticTargets(spec, caseId, candidate);
  const fieldNames = T1_ORACLE_FIELDS_BY_ALGORITHM[spec.algorithm];
  if (fieldNames === undefined) {
    throw new Error(`${spec.controlId} verifier semantic oracle fields missing`);
  }
  return canonicalJsonValue(selection.targets.map(({ targetId, path, value }) => ({
    targetId,
    path,
    projection: spec.algorithm === "reverse-refusal-precedence" ||
      (spec.algorithm === "rewrite-refusal-path-to-generated-output" &&
        caseId === "T1-OPSTATE-008")
      ? value
      : t1CollectOracleFields(value, new Set(fieldNames)),
  })));
}

function t1NestedRecords(value: unknown): readonly Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const body = t1MutableRecord(item);
    if (body === null) return;
    output.push(body);
    Object.values(body).forEach(visit);
  };
  visit(value);
  return output;
}

function t1SemanticDegreeCount(
  candidate: unknown,
  degree: string,
  keys = T1_DEGREE_ARRAY_KEYS,
): number {
  const includeStandaloneDegreeRecords = keys === T1_DEGREE_ARRAY_KEYS;
  return t1NestedRecords(candidate).reduce((sum, entry) =>
    sum +
    (includeStandaloneDegreeRecords && t1DegreeMatches(entry["degree"], degree)
      ? 1
      : 0) +
    Object.entries(entry).reduce((entrySum, [key, value]) =>
      entrySum + (keys.has(key) && Array.isArray(value)
        ? value.filter((item) => t1DegreeMatches(item, degree)).length
        : 0), 0), 0);
}

function t1RoleDegreeCount(
  candidate: unknown,
  degree: string,
  role: "required" | "optional" | "guide",
): number {
  const keys = role === "required"
    ? new Set(["required", "requiredDegrees"])
    : role === "optional"
      ? new Set(["optional", "optionalDegrees"])
      : new Set(["guide", "guideToneDegrees"]);
  return t1SemanticDegreeCount(candidate, degree, keys);
}

function t1FixtureExpectationSource(caseId: string): string {
  if (caseId.startsWith("T1-FORMULA-") || caseId === "T1-ROOT-MATRIX-001") {
    return `formula-rules.json+all-root-cases.json:${caseId}`;
  }
  if (caseId.startsWith("T1-LIT-")) {
    return `literal-cases.json:${caseId}.expected`;
  }
  if (caseId.startsWith("T1-SPELL-")) {
    return `spelling-cases.json:${caseId}.expected`;
  }
  if (caseId.startsWith("T1-CUSTOM-")) {
    return `custom-cases.json:${caseId}.expected`;
  }
  if (caseId.startsWith("T1-OPSTATE-")) {
    return `operation-state-cases.json:${caseId}`;
  }
  if (caseId.startsWith("T1-LAW-")) return `law-cases.json:${caseId}`;
  return `reviewed-resolution-corpus:${caseId}`;
}

function t1ReviewedFixtureExpectation(caseId: string): unknown {
  if (caseId.startsWith("T1-FORMULA-")) {
    return formulaFixture.rules.find(({ id }) => id === caseId);
  }
  if (caseId === "T1-ROOT-MATRIX-001") {
    return {
      matrix: allRootFixture.matrixCase,
      roots: allRootFixture.roots,
      formulas: formulaFixture.rules,
    };
  }
  if (caseId === "T1-FAMILY-STATE-MATRIX-001") {
    return formulaFixture.familyStateMatrix.expected;
  }
  if (caseId === spellingFixture.publicDegreeMatrix.id) {
    return spellingFixture.publicDegreeMatrix.expected;
  }
  if (caseId === "T1-CORRECTION-ABDIM7") {
    return spellingFixture.cases.filter(({ id }) =>
      id === "T1-SPELL-006" || id === "T1-SPELL-007"
    );
  }
  if (caseId.startsWith("T1-LIT-")) {
    return literalFixture.cases.find(({ id }) => id === caseId)?.expected;
  }
  if (caseId.startsWith("T1-SPELL-")) {
    return spellingFixture.cases.find(({ id }) => id === caseId)?.expected;
  }
  if (caseId.startsWith("T1-CUSTOM-")) {
    const fixture = customFixture.cases.find(({ id }) => id === caseId);
    return fixture === undefined ? undefined : {
      input: fixture.input,
      sourceInput: fixture.sourceInput,
      transposedInput: fixture.transposedInput,
      expected: fixture.expected,
    };
  }
  if (caseId.startsWith("T1-OPSTATE-")) {
    return operationFixture.cases.find(({ id }) => id === caseId);
  }
  if (caseId.startsWith("T1-LAW-")) {
    return lawFixture.cases.find(({ id }) => id === caseId);
  }
  return { caseId };
}

function t1IndependentSemanticAccepted(
  spec: T1SemanticOperatorSpec,
  caseId: string,
  candidate: unknown,
): boolean {
  const parameter = (key: string): unknown => spec.parameters[key];
  const selection = t1SelectSemanticTargets(spec, caseId, candidate);
  candidate = selection.targets.length === 1
    ? selection.targets[0]?.value
    : selection.targets.map(({ value }) => value);
  const records = t1NestedRecords(candidate);
  switch (spec.algorithm) {
    case "rewrite-degree-identity":
      return t1SemanticDegreeCount(candidate, String(parameter("from"))) > 0;
    case "move-degree-role":
      return t1RoleDegreeCount(
        candidate,
        String(parameter("degree")),
        parameter("from") as "required" | "optional",
      ) > 0;
    case "remove-degree":
      return (parameter("degrees") as readonly string[]).every((degree) =>
        t1SemanticDegreeCount(candidate, degree) > 0
      );
    case "append-semantic-degree":
      return t1SemanticDegreeCount(candidate, String(parameter("degree"))) === 0;
    case "retain-suspension-third":
      return caseId === "T1-LIT-055"
        ? records.some((entry) =>
            Array.isArray(entry["warnings"]) && entry["warnings"].some((warning) =>
              t1MutableRecord(warning)?.["code"] === "theory.omission_absent"
            )
          )
        : t1SemanticDegreeCount(candidate, "3") === 0;
    case "collapse-equal-pitch-class-records":
      return records.some((entry) =>
        Array.isArray(entry["spelledPitchNames"]) &&
        Array.isArray(entry["pitchClasses"]) &&
        entry["spelledPitchNames"].length === 2 &&
        entry["pitchClasses"].length === 2 &&
        entry["pitchClasses"][0] === entry["pitchClasses"][1]
      );
    case "reuse-root-letter":
      return records.some((entry) => {
        const root = t1MutableRecord(entry["root"]);
        const spelled = t1MutableRecord(entry["spelled"]);
        return root?.["step"] !== undefined && spelled?.["step"] !== root["step"];
      });
    case "pitch-class-first-enharmonic": {
      const fixture = spellingFixture.cases.find(({ id }) => id === caseId);
      const expected = isRecord(fixture) && isRecord(fixture["expected"])
        ? fixture["expected"]["spelled"]
        : undefined;
      return expected !== undefined && records.some((entry) =>
        stableJson(entry["spelled"]) === stableJson(expected)
      );
    }
    case "accept-accidental-overflow":
      return caseId === "T1-SPELL-PUBLIC-MATRIX-001"
        ? records.some((entry) =>
            entry["cells"] ===
              spellingFixture.publicDegreeMatrix.expected.totalCells &&
            entry["successes"] ===
              spellingFixture.publicDegreeMatrix.expected.successCells &&
            entry["refusals"] ===
              spellingFixture.publicDegreeMatrix.expected.refusalCells &&
            entry["minimumRequiredAlteration"] ===
              spellingFixture.publicDegreeMatrix.expected.minimumRequiredAlteration &&
            entry["maximumRequiredAlteration"] ===
              spellingFixture.publicDegreeMatrix.expected.maximumRequiredAlteration &&
            entry["semanticDigest"] ===
              spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256
          )
        : records.some((entry) =>
            entry["ok"] === false &&
            t1MutableRecord(entry["refusal"])?.["code"] ===
              "theory.spelling_accidental_out_of_range"
          );
    case "drop-diatonic-transposition": {
      const law = lawFixture.cases.find(({ id }) => id === caseId);
      const lawRecord = isRecord(law) ? law : null;
      const recipe = t1MutableRecord(lawRecord?.["transpositionRecipe"]);
      if (recipe === null) return false;
      if (caseId === "T1-LAW-004") {
        return selection.targets.every(({ value }) =>
          stableJson(value) === stableJson(recipe["reviewedTargetSnapshot"])
        );
      }
      const rows = recipe["reviewedProjectionRows"];
      return Array.isArray(rows) && rows.every((row) => {
        const expected = t1MutableRecord(row);
        if (expected === null) return false;
        return records.some((entry) => {
          const source = t1MutableRecord(entry["source"]);
          const sourceValue = t1MutableRecord(source?.["value"]);
          const sourceSpelled = t1MutableRecord(sourceValue?.["spelled"]);
          const target = t1MutableRecord(entry["target"]);
          const targetValue = t1MutableRecord(target?.["value"]);
          return stableJson(sourceSpelled) === stableJson(expected["sourceSpelling"]) &&
            stableJson(targetValue?.["spelled"]) ===
              stableJson(expected["targetSpelling"]);
        });
      });
    }
    case "leave-slash-bass-untransposed": {
      const law = lawFixture.cases.find(({ id }) => id === caseId);
      const lawRecord = isRecord(law) ? law : null;
      const recipe = t1MutableRecord(lawRecord?.["transpositionRecipe"]);
      const expected = recipe?.["reviewedTargetSnapshot"];
      return expected !== undefined && selection.targets.every(({ value }) =>
        stableJson(value) === stableJson(expected)
      );
    }
    case "keep-first-altered-realization": {
      const expectedOrder = [
        "alt-b9-b5",
        "alt-b9-sharp5",
        "alt-sharp9-b5",
        "alt-sharp9-sharp5",
      ];
      return records.some((entry) =>
        (Array.isArray(entry["realizations"]) &&
          entry["realizations"].length === 4) ||
        (entry["realizations"] === 4 &&
          stableJson(entry["variantOrder"]) === stableJson(expectedOrder) &&
          typeof entry["semanticOutputRecords"] === "number" &&
          entry["semanticOutputRecords"] > 0 &&
          entry["semanticOutputRecords"] === entry["spellingAttempts"] &&
          entry["chosenVariant"] === null)
      );
    }
    case "merge-equal-altered-realizations":
      return records.some((entry) =>
        Array.isArray(entry["realizations"]) && entry["realizations"].length === 4
      );
    case "reverse-altered-realization-order": {
      const expected = [
        "alt-b9-b5",
        "alt-b9-sharp5",
        "alt-sharp9-b5",
        "alt-sharp9-sharp5",
      ];
      return records.some((entry) =>
        stableJson(entry["variantOrder"]) === stableJson(expected) ||
        (Array.isArray(entry["realizations"]) &&
          stableJson(entry["realizations"].map((value) =>
            t1MutableRecord(value)?.["id"]
          )) === stableJson(expected))
      );
    }
    case "remove-explicit-add-three":
      return t1SemanticDegreeCount(candidate, "3", new Set(T1_DEGREE_ARRAY_KEYS)) > 0;
    case "retain-extension-natural-closure":
      return (parameter("degrees") as readonly string[]).every((degree) =>
        t1SemanticDegreeCount(candidate, degree) === 0
      );
    case "retain-one-omitted-alteration": {
      const variants = records.filter((entry) => {
        const id = entry["id"];
        return typeof id === "string" && id.startsWith("alt-");
      });
      return variants.length === 4 && variants.every((entry) =>
        Array.isArray(entry["degrees"]) && entry["degrees"].every((degree) =>
          !t1DegreeMatches(degree, String(parameter("degree"))) &&
          !t1DegreeMatches(degree, "b5")
        )
      );
    }
    case "addition-implies-extension-closure":
      return t1SemanticDegreeCount(candidate, "b7") === 0 ||
        t1SemanticDegreeCount(candidate, "9") === 0;
    case "move-highest-extension-to-optional":
      return ["13", "11", "9"].some((degree) =>
        t1RoleDegreeCount(candidate, degree, "required") > 0
      );
    case "move-identity-fifth-to-optional":
      return ["5", "b5", "#5"].some((degree) =>
        t1RoleDegreeCount(candidate, degree, "required") > 0
      );
    case "append-guide-degree":
      return t1RoleDegreeCount(candidate, String(parameter("degree")), "guide") === 0;
    case "suppress-omission-warning":
      return records.some((entry) =>
        Array.isArray(entry["warnings"]) && entry["warnings"].some((warning) =>
          t1MutableRecord(warning)?.["code"] === "theory.omission_absent"
        )
      );
    case "emit-warning-for-present-omission":
      {
        const warningLists = records.filter((entry) =>
          Array.isArray(entry["warnings"])
        );
        return warningLists.length > 0 && warningLists.every((entry) =>
          stableJson(entry["warnings"]) === stableJson([])
        );
      }
    case "insert-slash-bass-into-membership": {
      if (caseId.startsWith("T1-CUSTOM-")) {
        const fixture = customFixture.cases.find(({ id }) => id === caseId);
        const body = t1MutableRecord(candidate);
        const bass = body?.["bass"];
        const spellings = body?.["spelledPitchNames"];
        const pitchClasses = body?.["pitchClasses"];
        return fixture?.input !== undefined && body?.["degrees"] === null &&
          stableJson(spellings) === stableJson(fixture.input.pitchNames) &&
          stableJson(pitchClasses) === stableJson(fixture.expected["pitchClasses"]) &&
          Array.isArray(spellings) && !spellings.some((spelling) =>
            stableJson(spelling) === stableJson(bass)
          );
      }
      const fixture = literalFixture.cases.find(({ id }) => id === caseId);
      const formulaId = fixture?.expected["formulaId"];
      const expectedDegrees = Array.isArray(fixture?.expected["degrees"])
        ? fixture.expected["degrees"]
        : typeof formulaId === "string"
          ? formulaFixture.rules.find(({ id }) => id === formulaId)?.degrees
          : undefined;
      if (!Array.isArray(expectedDegrees)) return false;
      const membershipLists = records.filter((entry) =>
        Array.isArray(entry["spelledPitchNames"]) &&
        Array.isArray(entry["pitchClasses"])
      );
      return membershipLists.length > 0 && membershipLists.every((entry) => {
        const spellings = entry["spelledPitchNames"] as unknown[];
        const pitchClasses = entry["pitchClasses"] as unknown[];
        const degrees = entry["degrees"];
        if (!Array.isArray(degrees) || degrees.length !== expectedDegrees.length ||
          spellings.length !== expectedDegrees.length ||
          pitchClasses.length !== expectedDegrees.length) return false;
        const degreeValues = degrees as unknown[];
        const tuples = spellings.map((spelling, index) => ({
          degree: degreeValues[index],
          spelling,
          pitchClass: pitchClasses[index],
        }));
        return new Set(tuples.map(stableJson)).size === tuples.length;
      });
    }
    case "discard-slash-bass": {
      const body = t1MutableRecord(candidate);
      const value = t1MutableRecord(body?.["value"]);
      const bass = body?.["ok"] === true ? value?.["bass"] : body?.["bass"];
      return bass !== null && bass !== undefined;
    }
    case "deduplicate-custom-pitches":
    case "sort-custom-pitches-by-pitch-class": {
      const fixture = customFixture.cases.find(({ id }) => id === caseId);
      const fixtureRecord = isRecord(fixture) ? fixture : null;
      const input = t1MutableRecord(fixtureRecord?.["input"]);
      const pitchNames = input?.["pitchNames"];
      return Array.isArray(pitchNames) && records.some((entry) =>
        stableJson(entry["spelledPitchNames"]) === stableJson(pitchNames)
      );
    }
    case "infer-custom-formula":
      return records.some((entry) =>
        entry["kind"] === "custom" && entry["id"] === "custom" &&
        entry["formulaRuleId"] === "custom" && entry["degrees"] === null &&
        entry["requiredDegrees"] === null &&
        entry["optionalDegrees"] === null &&
        entry["guideToneDegrees"] === null && stableJson(entry["limitations"]) ===
          stableJson(["custom.no_degree_analysis", "custom.no_auto_voicing"])
      );
    case "expose-partial-refusal-output":
      return records.some((entry) => entry["ok"] === false && !("value" in entry));
    case "rewrite-refusal-path-to-generated-output":
      return caseId === "T1-OPSTATE-008"
        ? Array.isArray(candidate) && candidate.every((path) =>
            Array.isArray(path) && !path.includes("realizations")
          )
        : records.some((entry) =>
            Array.isArray(entry["path"]) && !entry["path"].includes("realizations")
          );
    case "advance-first-excess-bound": {
      const field = String(parameter("field"));
      const fixtureRow = t1FirstExcessFixtureRow(field);
      const expectedIndex = fixtureRow["firstExcessIndex"];
      const expectedRefusal = fixtureRow["expectedRefusal"];
      const selectedRow = t1MutableRecord(selection.targets[0]?.value);
      const proof = t1MutableRecord(selectedRow?.["firstExcessProof"]);
      const evidence = t1MutableRecord(proof?.["evidence"]);
      return typeof expectedIndex === "number" && selectedRow !== null &&
        proof !== null && proof["field"] === field &&
        proof["firstExcessIndex"] === expectedIndex &&
        stableJson(selectedRow["result"]) === stableJson({
          ok: false,
          refusal: expectedRefusal,
        }) && stableJson(proof["result"]) === stableJson({
          ok: false,
          refusal: expectedRefusal,
        }) && evidence !== null &&
        evidence["inputDegreeRecordsVisited"] === expectedIndex + 1 &&
        evidence["termination"] === "formula-refusal" &&
        !("evidence" in selectedRow);
    }
    case "reject-parsed-modifier-vocabulary":
      return records.some((entry) => entry["ok"] === true && "value" in entry);
    case "duplicate-cross-category-degree":
      return selection.targets.every((target) => {
        const directDegrees = t1MutableRecord(target.value)?.["degrees"];
        const lists = Array.isArray(directDegrees) && directDegrees.length > 0 &&
            Array.isArray(directDegrees[0])
          ? [directDegrees[0] as unknown[]]
          : t1NestedRecords(target.value).flatMap((entry) =>
              typeof entry["formulaRuleId"] === "string" &&
                Array.isArray(entry["degrees"])
                ? [entry["degrees"] as unknown[]]
                : []
            );
        return lists.length > 0 && lists.every((list) =>
          list.filter((degree) => t1DegreeMatches(degree, "9")).length === 1
        );
      });
    case "accept-seventeenth-semantic-degree":
      return records.some((entry) =>
        entry["ok"] === false &&
        t1MutableRecord(entry["refusal"])?.["code"] ===
          "limit.theory_realization_degrees_exceeded"
      );
    case "rewrite-abdim7-directed-spelling":
      return records.some((entry) => {
        const spelled = t1MutableRecord(entry["spelled"]);
        return spelled?.["step"] === "G" && spelled["alter"] === -2;
      });
    case "fallback-unsupported-family":
      return caseId === "T1-FAMILY-STATE-MATRIX-001"
        ? records.some((entry) =>
            entry["acceptedStates"] ===
              formulaFixture.familyStateMatrix.expected.acceptedStates &&
            stableJson(entry["outcomeCounts"]) === stableJson(
              formulaFixture.familyStateMatrix.expected.outcomeCounts,
            ) &&
            stableJson(entry["reasonAndConflictCounts"]) === stableJson(
              formulaFixture.familyStateMatrix.expected.reasonAndConflictCounts,
            ) &&
            stableJson(entry["acceptedRuleIdCounts"]) === stableJson(
              formulaFixture.familyStateMatrix.expected.acceptedRuleIdCounts,
            ) &&
            stableJson(entry["refusalRuleIdCounts"]) === stableJson(
              formulaFixture.familyStateMatrix.expected.refusalRuleIdCounts,
            ) &&
            entry["semanticDigest"] ===
              formulaFixture.familyStateMatrix.expected.orderedPublicOutcomeSemanticSha256
          )
        : selection.targets.every(({ targetId, value }) => {
            const fixture = literalFixture.cases.find(({ id }) => id === targetId);
            return fixture !== undefined && stableJson(value) === stableJson({
              ok: false,
              refusal: fixture.expected["refusal"],
            });
          });
    case "reverse-refusal-precedence": {
      const fixture = operationFixture.cases.find(({ id }) => id === caseId);
      const expectedRow = ([
        ...(fixture?.rows ?? []),
        ...(fixture?.reasonPrecedenceRows ?? []),
      ] as readonly unknown[]).map(t1MutableRecord).find((row) =>
        row?.["id"] === "T1-PRECEDENCE-001"
      );
      const selectedRow = t1MutableRecord(selection.targets[0]?.value);
      return expectedRow !== undefined && selectedRow !== null &&
        expectedRow !== null && selectedRow["id"] === expectedRow["id"] &&
        stableJson(selectedRow["result"]) === stableJson({
          ok: false,
          refusal: expectedRow["expectedWinner"],
        });
    }
    case "restrict-public-spelling-domain":
      return records.some((entry) =>
        entry["cells"] === spellingFixture.publicDegreeMatrix.expected.totalCells &&
        entry["successes"] ===
          spellingFixture.publicDegreeMatrix.expected.successCells &&
        entry["refusals"] ===
          spellingFixture.publicDegreeMatrix.expected.refusalCells &&
        entry["minimumRequiredAlteration"] ===
          spellingFixture.publicDegreeMatrix.expected.minimumRequiredAlteration &&
        entry["maximumRequiredAlteration"] ===
          spellingFixture.publicDegreeMatrix.expected.maximumRequiredAlteration &&
        entry["semanticDigest"] ===
          spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256
      );
    default:
      throw new Error(`${spec.controlId} independent verifier semantic oracle missing`);
  }
}

type T1CounterfactualCoherenceReport = Readonly<{
  accepted: boolean;
  spellingProjectionChecks: number;
  parallelTupleChecks: number;
  directedSpellingChecks: number;
  canonicalOrderChecks: number;
  rolePartitionChecks: number;
  resultUnionChecks: number;
  aggregateCouplingChecks: number;
  derivedStateChecks: number;
  refusalPathChecks: number;
  warningShapeChecks: number;
  namedExemptions: readonly string[];
  issues: readonly string[];
}>;

function t1DegreeTokenList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const tokens: string[] = [];
  for (const item of value) {
    const degree = t1ChordDegreeValue(item);
    if (degree === null) return null;
    tokens.push(t1DegreeToken(degree));
  }
  return tokens;
}

function t1CounterfactualCoherenceReport(
  spec: T1SemanticOperatorSpec,
  caseId: string,
  baseline: unknown,
  candidate: unknown,
): T1CounterfactualCoherenceReport {
  const issues: string[] = [];
  const namedExemptions: string[] = [];
  let spellingProjectionChecks = 0;
  let parallelTupleChecks = 0;
  let directedSpellingChecks = 0;
  let canonicalOrderChecks = 0;
  let rolePartitionChecks = 0;
  let resultUnionChecks = 0;
  let aggregateCouplingChecks = 0;
  let derivedStateChecks = 0;
  let refusalPathChecks = 0;
  let warningShapeChecks = 0;
  const projectionFault = new Set([
    "reuse-root-letter",
    "pitch-class-first-enharmonic",
    "accept-accidental-overflow",
    "drop-diatonic-transposition",
    "rewrite-abdim7-directed-spelling",
  ]).has(spec.algorithm);
  const duplicateDegreeFault =
    spec.algorithm === "duplicate-cross-category-degree";
  const slashBassMembershipFault =
    spec.algorithm === "insert-slash-bass-into-membership";
  if (projectionFault) {
    namedExemptions.push("directed-spelling-policy-is-the-named-fault");
  }
  if (duplicateDegreeFault) {
    namedExemptions.push("cross-category-degree-duplication-is-the-named-fault");
  }
  if (slashBassMembershipFault) {
    namedExemptions.push("slash-bass-membership-duplication-is-the-named-fault");
  }
  if (spec.algorithm === "expose-partial-refusal-output") {
    namedExemptions.push("partial-refusal-value-is-the-named-fault");
  }
  if (spec.algorithm === "rewrite-refusal-path-to-generated-output") {
    namedExemptions.push("generated-output-refusal-path-is-the-named-fault");
  }

  const issue = (path: string, message: string): void => {
    issues.push(`${path}: ${message}`);
  };
  const visit = (
    value: unknown,
    path: string,
    inheritedRoot: Readonly<{ step: string; alter: number }> | null,
  ): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, `${path}[${String(index)}]`, inheritedRoot);
      });
      return;
    }
    const entry = t1MutableRecord(value);
    if (entry === null) return;
    const firstSpelling = Array.isArray(entry["spelledPitchNames"])
      ? t1SpelledPitchValue(entry["spelledPitchNames"][0])
      : null;
    const root = t1RootForSemanticEntry(entry, inheritedRoot) ??
      (spec.algorithm === "infer-custom-formula" ? firstSpelling : null);
    if ("spelled" in entry || "pitchClass" in entry) {
      const projected = t1SpelledPitchClass(entry["spelled"]);
      if (projected !== null && typeof entry["pitchClass"] === "number") {
        spellingProjectionChecks += 1;
        if (projected !== t1PitchClass(entry["pitchClass"])) {
          issue(path, "spelled pitch does not project to pitchClass");
        }
      } else if ("spelled" in entry && "pitchClass" in entry) {
        issue(path, "spelled/pitchClass pair is malformed");
      }
    }
    const spellings = entry["spelledPitchNames"];
    const pitchClasses = entry["pitchClasses"];
    if ("spelledPitchNames" in entry) {
      if (!Array.isArray(spellings) || !Array.isArray(pitchClasses)) {
        issue(path, "parallel spelling and pitch-class arrays are not both arrays");
      } else {
        parallelTupleChecks += 1;
        if (spellings.length !== pitchClasses.length) {
          issue(path, "spelling and pitch-class arity differs");
        }
        const degrees = t1DegreeTokenList(entry["degrees"]);
        if (!duplicateDegreeFault && degrees !== null &&
          degrees.length !== spellings.length) {
          issue(path, "degree, spelling, and pitch-class arity differs");
        }
        const tupleCount = Math.min(spellings.length, pitchClasses.length);
        for (let index = 0; index < tupleCount; index += 1) {
          const projected = t1SpelledPitchClass(spellings[index]);
          spellingProjectionChecks += 1;
          if (projected === null || typeof pitchClasses[index] !== "number" ||
            projected !== t1PitchClass(Number(pitchClasses[index]))) {
            issue(
              `${path}.spelledPitchNames[${String(index)}]`,
              "spelling does not project to paired pitch class",
            );
          }
          if (!projectionFault && !duplicateDegreeFault && root !== null &&
            degrees !== null && index < degrees.length) {
            const degree = t1ChordDegreeValue(
              (entry["degrees"] as unknown[])[index],
            );
            if (degree !== null) {
              const expected = t1IndependentSpellingResult(root, degree);
              const expectedValue = t1MutableRecord(expected["value"]);
              directedSpellingChecks += 1;
              if (expected["ok"] !== true || expectedValue === null ||
                stableJson(spellings[index]) !==
                  stableJson(expectedValue["spelled"]) ||
                pitchClasses[index] !== expectedValue["pitchClass"]) {
                issue(
                  `${path}.degrees[${String(index)}]`,
                  "derived spelling tuple disagrees with root and degree",
                );
              }
            }
          }
        }
      }
    }
    for (const key of T1_DEGREE_ARRAY_KEYS) {
      const tokens = t1DegreeTokenList(entry[key]);
      if (tokens === null) continue;
      canonicalOrderChecks += 1;
      const canonicalTokens = [...tokens].sort(t1CompareDegreeValues);
      if (stableJson(tokens) !== stableJson(canonicalTokens)) {
        issue(`${path}.${key}`, "degree list is not in canonical number/alteration order");
      }
      const duplicates = tokens.filter((degree, index) =>
        tokens.indexOf(degree) !== index
      );
      if (duplicates.length > 0 && !duplicateDegreeFault &&
        !slashBassMembershipFault) {
        issue(
          `${path}.${key}`,
          `degree list contains unexempted duplicates: ${[...new Set(duplicates)].join(",")}`,
        );
      }
    }
    if (!duplicateDegreeFault) {
      const degrees = t1DegreeTokenList(entry["degrees"]);
      if (degrees !== null) {
        for (const [requiredKey, optionalKey] of t1RolePairs()) {
          const required = t1DegreeTokenList(entry[requiredKey]);
          const optional = t1DegreeTokenList(entry[optionalKey]);
          if (required === null || optional === null) continue;
          rolePartitionChecks += 1;
          if (stableJson([...required, ...optional].sort(t1CompareDegreeValues)) !==
            stableJson([...degrees].sort(t1CompareDegreeValues))) {
            issue(
              path,
              `${requiredKey}/${optionalKey} does not partition degree membership`,
            );
          }
          if (required.some((degree) => optional.includes(degree))) {
            issue(path, `${requiredKey}/${optionalKey} overlap`);
          }
        }
        for (const [guideKey, requiredKey] of [
          ["guide", "required"],
          ["guideToneDegrees", "requiredDegrees"],
        ] as const) {
          const guides = t1DegreeTokenList(entry[guideKey]);
          const required = t1DegreeTokenList(entry[requiredKey]);
          if (guides === null || required === null) continue;
          rolePartitionChecks += 1;
          const requiredCounts = new Map<string, number>();
          required.forEach((degree) => requiredCounts.set(
            degree,
            (requiredCounts.get(degree) ?? 0) + 1,
          ));
          const guideCounts = new Map<string, number>();
          guides.forEach((degree) => guideCounts.set(
            degree,
            (guideCounts.get(degree) ?? 0) + 1,
          ));
          if ([...guideCounts].some(([degree, count]) =>
            count > (requiredCounts.get(degree) ?? 0)
          )) {
            issue(path, `${guideKey} is not a ${requiredKey} multiset subset`);
          }
        }
      }
    }
    if (entry["kind"] === "semantic") {
      aggregateCouplingChecks += 1;
      if (!Array.isArray(entry["degrees"]) ||
        !Array.isArray(entry["requiredDegrees"]) ||
        !Array.isArray(entry["optionalDegrees"]) ||
        !Array.isArray(entry["guideToneDegrees"]) || "limitations" in entry) {
        issue(path, "semantic realization metadata shape is incoherent");
      }
    }
    if (entry["kind"] === "custom" && "spelledPitchNames" in entry) {
      aggregateCouplingChecks += 1;
      if (entry["formulaRuleId"] !== "custom" || entry["degrees"] !== null ||
        entry["requiredDegrees"] !== null || entry["optionalDegrees"] !== null ||
        entry["guideToneDegrees"] !== null || stableJson(entry["limitations"]) !==
          stableJson(["custom.no_degree_analysis", "custom.no_auto_voicing"])) {
        issue(path, "custom realization metadata shape is incoherent");
      }
    }
    if (typeof entry["ok"] === "boolean") {
      resultUnionChecks += 1;
      if (entry["ok"] && (!("value" in entry) || "refusal" in entry)) {
        issue(path, "successful result union is malformed");
      }
      if (!entry["ok"] && (!("refusal" in entry) ||
        ("value" in entry &&
          spec.algorithm !== "expose-partial-refusal-output"))) {
        issue(path, "refusal result union is malformed");
      }
    }
    const warnings = entry["warnings"];
    if (Array.isArray(warnings)) {
      for (const [index, warningValue] of warnings.entries()) {
        const warning = t1MutableRecord(warningValue);
        warningShapeChecks += 1;
        if (warning?.["code"] !== "theory.omission_absent" ||
          stableJson(warning["path"]) !== stableJson(["omissions", 0]) ||
          warning["degreeNumber"] !== 3 ||
          typeof warning["message"] !== "string" ||
          warning["message"].length === 0) {
          issue(
            `${path}.warnings[${String(index)}]`,
            "theory warning shape is incomplete",
          );
        }
      }
    }
    if (typeof entry["cells"] === "number" &&
      typeof entry["successes"] === "number" &&
      typeof entry["refusals"] === "number") {
      aggregateCouplingChecks += 1;
      if (entry["cells"] !== entry["successes"] + entry["refusals"]) {
        issue(path, "cell outcomes do not sum to cells");
      }
      if (typeof entry["semanticDigest"] !== "string" ||
        entry["semanticDigest"].length !== 64) {
        issue(path, "cell semantic digest missing");
      }
    }
    if (typeof entry["realizations"] === "number" &&
      Array.isArray(entry["variantOrder"])) {
      aggregateCouplingChecks += 1;
      if (entry["realizations"] !== entry["variantOrder"].length) {
        issue(path, "realization count differs from variant order");
      }
      if (typeof entry["semanticOutputRecords"] === "number" &&
        typeof entry["spellingAttempts"] === "number" &&
        entry["semanticOutputRecords"] !== entry["spellingAttempts"]) {
        issue(path, "altered semantic-output and spelling work counts differ");
      }
    }
    for (const [key, child] of Object.entries(entry)) {
      visit(child, `${path}.${key}`, root);
    }
  };
  visit(candidate, "$", null);

  const compareDigestCoupling = (
    left: unknown,
    right: unknown,
    path: string,
  ): void => {
    if (Array.isArray(left) && Array.isArray(right)) {
      const count = Math.min(left.length, right.length);
      for (let index = 0; index < count; index += 1) {
        compareDigestCoupling(left[index], right[index], `${path}[${String(index)}]`);
      }
      return;
    }
    const before = t1MutableRecord(left);
    const after = t1MutableRecord(right);
    if (before === null || after === null) return;
    if (typeof before["semanticDigest"] === "string" &&
      typeof after["semanticDigest"] === "string") {
      const beforeBody = { ...before };
      const afterBody = { ...after };
      delete beforeBody["semanticDigest"];
      delete afterBody["semanticDigest"];
      if (stableJson(beforeBody) !== stableJson(afterBody)) {
        aggregateCouplingChecks += 1;
        if (before["semanticDigest"] === after["semanticDigest"]) {
          issue(path, "changed aggregate retained its semantic digest");
        }
      }
    }
    for (const key of Object.keys(before).filter((candidateKey) =>
      candidateKey in after
    )) {
      compareDigestCoupling(before[key], after[key], `${path}.${key}`);
    }
  };
  compareDigestCoupling(baseline, candidate, "$");

  if (spec.algorithm === "rewrite-refusal-path-to-generated-output") {
    const compareGeneratedPathMutation = (
      beforeValue: unknown,
      afterValue: unknown,
      path: string,
    ): void => {
      if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
        if (!Array.isArray(beforeValue) || !Array.isArray(afterValue)) {
          issue(path, "generated-path mutant changed non-path array shape");
          return;
        }
        const standaloneSourcePath = beforeValue.every((segment) =>
          typeof segment === "string" || typeof segment === "number"
        ) && stableJson(afterValue) ===
          stableJson(["realizations", 0, ...beforeValue]);
        if (standaloneSourcePath) {
          refusalPathChecks += 1;
          return;
        }
        if (beforeValue.length !== afterValue.length) {
          issue(path, "generated-path mutant changed non-path array shape");
          return;
        }
        beforeValue.forEach((child, index) => {
          compareGeneratedPathMutation(
            child,
            afterValue[index],
            `${path}[${String(index)}]`,
          );
        });
        return;
      }
      const beforeEntry = t1MutableRecord(beforeValue);
      const afterEntry = t1MutableRecord(afterValue);
      if (beforeEntry !== null || afterEntry !== null) {
        if (beforeEntry === null || afterEntry === null) {
          issue(path, "generated-path mutant changed non-path object shape");
          return;
        }
        const beforeKeys = Object.keys(beforeEntry).sort();
        const afterKeys = Object.keys(afterEntry).sort();
        if (stableJson(beforeKeys) !== stableJson(afterKeys)) {
          issue(path, "generated-path mutant changed non-path object keys");
          return;
        }
        for (const key of beforeKeys) {
          if (key === "path" && Array.isArray(beforeEntry[key]) &&
            Array.isArray(afterEntry[key])) {
            const beforePath = beforeEntry[key] as unknown[];
            const afterPath = afterEntry[key] as unknown[];
            refusalPathChecks += 1;
            if (stableJson(afterPath) !==
              stableJson(["realizations", 0, ...beforePath])) {
              issue(
                `${path}.path`,
                "generated-output path is not the exact named prefix mutation",
              );
            }
            continue;
          }
          compareGeneratedPathMutation(
            beforeEntry[key],
            afterEntry[key],
            `${path}.${key}`,
          );
        }
        return;
      }
      if (!Object.is(beforeValue, afterValue)) {
        issue(path, "generated-path mutant changed a non-path value");
      }
    };
    compareGeneratedPathMutation(baseline, candidate, "$");
    if (refusalPathChecks === 0) {
      issue("$", "generated-output path mutant checked no source paths");
    }
  }

  if (caseId.startsWith("T1-LAW-")) {
    const beforePredicate = t1MutableRecord(
      t1MutableRecord(baseline)?.["semanticPredicate"],
    );
    const afterPredicate = t1MutableRecord(
      t1MutableRecord(candidate)?.["semanticPredicate"],
    );
    derivedStateChecks += 1;
    const beforeEvidence = beforePredicate === null ? null : { ...beforePredicate };
    const afterEvidence = afterPredicate === null ? null : { ...afterPredicate };
    if (beforeEvidence !== null) delete beforeEvidence["passed"];
    if (afterEvidence !== null) delete afterEvidence["passed"];
    if (beforePredicate?.["passed"] !== true ||
      afterPredicate?.["passed"] !== false || beforeEvidence === null ||
      afterEvidence === null || stableJson(beforeEvidence) === stableJson(afterEvidence)) {
      issue(
        "$.semanticPredicate",
        "mutated law evidence is not coupled to passed=false",
      );
    }
  }

  if (caseId === "T1-OPSTATE-005" &&
    spec.algorithm === "expose-partial-refusal-output") {
    const observation = t1MutableRecord(candidate);
    const result = t1MutableRecord(observation?.["result"]);
    const partial = t1MutableRecord(result?.["value"]);
    const view = t1MutableRecord(observation?.["view"]);
    derivedStateChecks += 1;
    if (result?.["ok"] !== false || partial === null || view === null ||
      view["partialValue"] !== true ||
      view["partialRealizations"] !== ("realizations" in partial) ||
      view["partialWarnings"] !== ("warnings" in partial) ||
      view["altSelection"] !== ("chosenVariant" in partial) ||
      view["stateMutation"] !== "none" || view["sourceUnchanged"] !== true) {
      issue(
        "$.view",
        "transactional-refusal view is stale relative to the partial result",
      );
    }
  }

  if (caseId === "T1-FAMILY-STATE-MATRIX-001" &&
    spec.algorithm === "fallback-unsupported-family") {
    const beforeEntry = t1MutableRecord(baseline);
    const afterEntry = t1MutableRecord(candidate);
    const beforeOutcomes = beforeEntry?.["orderedPublicOutcomes"];
    const afterOutcomes = afterEntry?.["orderedPublicOutcomes"];
    const proof = t1MutableRecord(afterEntry?.["counterfactualDigestProof"]);
    aggregateCouplingChecks += 1;
    if (beforeEntry === null || afterEntry === null ||
      !Array.isArray(beforeOutcomes) || !Array.isArray(afterOutcomes) ||
      beforeOutcomes.length !== 896 || afterOutcomes.length !== 896) {
      issue(
        "$.orderedPublicOutcomes",
        "family counterfactual did not retain the exact 896-cell preimage",
      );
    } else {
      const changedIndices = beforeOutcomes.flatMap((value, index) =>
        stableJson(value) === stableJson(afterOutcomes[index]) ? [] : [index]
      );
      const beforeCell = t1MutableRecord(beforeOutcomes[800]);
      const afterCell = t1MutableRecord(afterOutcomes[800]);
      const beforeExpected = t1MutableRecord(beforeCell?.["expected"]);
      const beforeRefusal = t1MutableRecord(beforeExpected?.["refusal"]);
      const afterExpected = t1MutableRecord(afterCell?.["expected"]);
      const afterValue = t1MutableRecord(afterExpected?.["value"]);
      const expectedSource = {
        ...formulaFixture.familyStateMatrix.sourceDefaults,
        triad: "power",
        sixth: null,
        seventh: "minor",
        extensions: [],
        additions: [],
        colorPolicy: "none",
      };
      if (stableJson(changedIndices) !== stableJson([800]) ||
        beforeCell === null || afterCell === null ||
        stableJson(beforeCell["facts"]) !== stableJson(afterCell["facts"]) ||
        beforeExpected?.["ok"] !== false ||
        beforeRefusal?.["code"] !== "theory.formula_family_unsupported" ||
        beforeRefusal["ruleId"] !== "base-power" ||
        afterExpected?.["ok"] !== true ||
        stableJson(afterValue?.["source"]) !== stableJson(expectedSource) ||
        t1CanonicalDigest(beforeOutcomes) !== beforeEntry["semanticDigest"] ||
        t1CanonicalDigest(afterOutcomes) !== afterEntry["semanticDigest"] ||
        proof?.["preimageKind"] !== "ordered-public-family-state-outcomes" ||
        proof["preimageLength"] !== 896 || proof["changedCellCount"] !== 1 ||
        proof["changedIndex"] !== 800 ||
        stableJson(proof["changedFacts"]) !== stableJson(afterCell["facts"]) ||
        stableJson(proof["baselineExpected"]) !==
          stableJson(beforeCell["expected"]) ||
        stableJson(proof["mutantExpected"]) !==
          stableJson(afterCell["expected"]) ||
        proof["baselineDigest"] !== beforeEntry["semanticDigest"] ||
        proof["mutantDigest"] !== afterEntry["semanticDigest"]) {
        issue(
          "$.counterfactualDigestProof",
          "family digest proof is not an exact replayable one-cell preimage mutation",
        );
      }

      const expectedOutcomeCounts = t1MutableJsonClone(beforeEntry["outcomeCounts"]);
      const expectedReasons = t1MutableJsonClone(
        beforeEntry["reasonAndConflictCounts"],
      );
      const expectedAcceptedRules = t1MutableJsonClone(
        beforeEntry["acceptedRuleIdCounts"],
      );
      const expectedRefusalRules = t1MutableJsonClone(
        beforeEntry["refusalRuleIdCounts"],
      );
      const expectedOutcomesBody = t1MutableRecord(expectedOutcomeCounts);
      const expectedReasonsBody = t1MutableRecord(expectedReasons);
      const expectedAcceptedBody = t1MutableRecord(expectedAcceptedRules);
      const expectedRefusalBody = t1MutableRecord(
        t1MutableRecord(expectedRefusalRules)
          ?.["theory.formula_family_unsupported"],
      );
      if (expectedOutcomesBody === null || expectedReasonsBody === null ||
        expectedAcceptedBody === null || expectedRefusalBody === null) {
        issue("$", "baseline family summary maps are malformed");
      } else {
        expectedOutcomesBody["accepted"] =
          Number(expectedOutcomesBody["accepted"]) + 1;
        expectedOutcomesBody["theory.formula_family_unsupported"] =
          Number(expectedOutcomesBody["theory.formula_family_unsupported"]) - 1;
        expectedReasonsBody["unsupported-seventh"] =
          Number(expectedReasonsBody["unsupported-seventh"]) - 1;
        expectedAcceptedBody["base-power"] =
          Number(expectedAcceptedBody["base-power"] ?? 0) + 1;
        expectedRefusalBody["base-power"] =
          Number(expectedRefusalBody["base-power"]) - 1;
        if (afterEntry["totalStates"] !== beforeEntry["totalStates"] ||
          afterEntry["acceptedStates"] !== Number(beforeEntry["acceptedStates"]) + 1 ||
          stableJson(afterEntry["outcomeCounts"]) !==
            stableJson(expectedOutcomeCounts) ||
          stableJson(afterEntry["reasonAndConflictCounts"]) !==
            stableJson(expectedReasons) ||
          stableJson(afterEntry["acceptedRuleIdCounts"]) !==
            stableJson(expectedAcceptedRules) ||
          stableJson(afterEntry["refusalRuleIdCounts"]) !==
            stableJson(expectedRefusalRules)) {
          issue("$", "family aggregate deltas do not match the one-cell fallback");
        }
      }
    }
  }

  if (spec.algorithm === "advance-first-excess-bound") {
    const field = String(spec.parameters["field"]);
    const fixtureRow = t1FirstExcessFixtureRow(field);
    const oldIndex = Number(fixtureRow["firstExcessIndex"]);
    const expectedRefusal = t1MutableRecord(fixtureRow["expectedRefusal"]);
    const selected = t1SelectSemanticTargets(spec, caseId, candidate).targets[0];
    const row = t1MutableRecord(selected?.value);
    const proof = t1MutableRecord(row?.["firstExcessProof"]);
    const proofRefusal = t1MutableRecord(
      t1MutableRecord(proof?.["result"])?.["refusal"],
    );
    const rowRefusal = t1MutableRecord(
      t1MutableRecord(row?.["result"])?.["refusal"],
    );
    const proofEvidence = t1MutableRecord(proof?.["evidence"]);
    const rowEvidence = t1MutableRecord(row?.["evidence"]);
    aggregateCouplingChecks += 1;
    if (expectedRefusal === null || row === null || proof === null ||
      proof["firstExcessIndex"] !== null ||
      proof["countRefusalObserved"] !== false ||
      proof["invalidationReason"] !==
        "semantic-validation-before-raised-count-bound" ||
      stableJson(proofRefusal?.["path"]) !==
        stableJson(expectedRefusal["path"]) ||
      stableJson(proofRefusal?.["received"]) !==
        stableJson(expectedRefusal["received"]) ||
      proofRefusal?.["reason"] !== "number" ||
      proofEvidence?.["inputDegreeRecordsVisited"] !== oldIndex + 1 ||
      proofEvidence["termination"] !== "formula-refusal" ||
      stableJson(rowRefusal?.["path"]) !==
        stableJson(expectedRefusal["path"]) ||
      stableJson(rowRefusal?.["received"]) !==
        stableJson(expectedRefusal["received"]) ||
      rowRefusal?.["reason"] !== "number" ||
      rowEvidence?.["inputDegreeRecordsVisited"] !== oldIndex + 1 ||
      rowEvidence["termination"] !== "formula-refusal" ||
      stableJson(proof["result"]) !== stableJson(row["result"]) ||
      stableJson(proof["evidence"]) !== stableJson(row["evidence"])) {
      issue("$", "first-excess row/proof outcome is not coherently coupled");
    }
  }
  if (spec.algorithm === "retain-one-omitted-alteration") {
    const variants = t1NestedRecords(candidate).filter((entry) => {
      const id = entry["id"];
      return typeof id === "string" && id.startsWith("alt-");
    });
    aggregateCouplingChecks += 1;
    if (variants.length !== 4 || variants.some((entry) => {
      const id = entry["id"];
      if (typeof id !== "string") return true;
      const degrees = entry["degrees"];
      const sharpCount = Array.isArray(degrees)
        ? degrees.filter((degree) => t1DegreeMatches(degree, "#5")).length
        : 0;
      return id.endsWith("-sharp5") ? sharpCount !== 1 : sharpCount !== 0;
    })) {
      issue("$", "retained fifth does not match the original altered-variant ID");
    }
  }

  return {
    accepted: issues.length === 0,
    spellingProjectionChecks,
    parallelTupleChecks,
    directedSpellingChecks,
    canonicalOrderChecks,
    rolePartitionChecks,
    resultUnionChecks,
    aggregateCouplingChecks,
    derivedStateChecks,
    refusalPathChecks,
    warningShapeChecks,
    namedExemptions,
    issues,
  };
}

type T1SemanticOracleResult = Readonly<{
  accepted: boolean;
  reviewedInvariantAccepted: boolean;
  exactExpectedProjectionMatch: boolean;
  projectionDigest: string;
  expectedProjectionDigest: string;
  reason: string;
  expectationSource: string;
  reviewedExpectationDigest: string;
}>;

function t1EvaluateSemanticOracle(
  spec: T1SemanticOperatorSpec,
  caseId: string,
  candidate: unknown,
  fixtureValidatedExpectedProjection: unknown,
): T1SemanticOracleResult {
  const projection = t1SemanticOracleProjection(spec, caseId, candidate);
  const reviewedInvariantAccepted = t1IndependentSemanticAccepted(
    spec,
    caseId,
    candidate,
  );
  const exactExpectedProjectionMatch = stableJson(projection) ===
    stableJson(fixtureValidatedExpectedProjection);
  const accepted = reviewedInvariantAccepted && exactExpectedProjectionMatch;
  const expectationSource = t1FixtureExpectationSource(caseId);
  const reviewedExpectation = t1ReviewedFixtureExpectation(caseId);
  if (reviewedExpectation === undefined) {
    throw new Error(`${spec.controlId}/${caseId} reviewed fixture expectation missing`);
  }
  return {
    accepted,
    reviewedInvariantAccepted,
    exactExpectedProjectionMatch,
    projectionDigest: t1CanonicalDigest(projection),
    expectedProjectionDigest: t1CanonicalDigest(fixtureValidatedExpectedProjection),
    reason: accepted
      ? `${spec.algorithm} satisfies the reviewed fixture invariant and its exact selected projection from ${expectationSource}`
      : `${spec.algorithm} violates the reviewed fixture invariant or its exact selected projection from ${expectationSource}`,
    expectationSource,
    reviewedExpectationDigest: t1CanonicalDigest(reviewedExpectation),
  };
}

/** Builds independent verifier fixtures for the static self-controls only. */
export function buildT1SemanticCounterfactualTestRecords(
  observationRecords: readonly T1CaseObservationRecord[],
): readonly JsonRecord[] {
  const observations = new Map(
    observationRecords.map((record) => [record.caseId, record]),
  );
  const specs = new Map(
    T1_SEMANTIC_OPERATOR_REGISTRY.map((spec) => [spec.controlId, spec]),
  );
  return mutationFixture.controls.map((control) => {
    const spec = specs.get(control.id);
    if (spec === undefined) throw new Error(`${control.id} test operator missing`);
    const directKillerExecutions = control.killedByCaseIds.map((caseId) => {
      const runtime = observations.get(caseId);
      if (runtime === undefined) throw new Error(`${control.id}/${caseId} test baseline missing`);
      const applied = t1ApplyRuntimeCounterfactual(spec, caseId, runtime.payload);
      const mismatchPaths = t1SemanticMismatchPaths(
        runtime.payload,
        applied.mutatedProjection,
      );
      const counterfactualCoherence = t1CounterfactualCoherenceReport(
        spec,
        caseId,
        runtime.payload,
        applied.mutatedProjection,
      );
      const fixtureValidatedExpectedProjection = t1SemanticOracleProjection(
        spec,
        caseId,
        runtime.payload,
      );
      const baselineOracle = t1EvaluateSemanticOracle(
        spec,
        caseId,
        runtime.payload,
        fixtureValidatedExpectedProjection,
      );
      const mutantOracle = t1EvaluateSemanticOracle(
        spec,
        caseId,
        applied.mutatedProjection,
        fixtureValidatedExpectedProjection,
      );
      const outOfScopeMismatchPaths = mismatchPaths.filter((mismatchPath) =>
        !applied.selectedTargets.some(({ path }) =>
          t1MismatchIsWithinSelectedTarget(mismatchPath, path)
        )
      );
      if (applied.affectedCount <= 0 || mismatchPaths.length === 0 ||
        outOfScopeMismatchPaths.length !== 0 ||
        !counterfactualCoherence.accepted ||
        !baselineOracle.accepted || mutantOracle.accepted ||
        baselineOracle.projectionDigest === mutantOracle.projectionDigest) {
        throw new Error(
          `${control.id}/${caseId} test baseline is not killable: ${stableJson({
            affectedCount: applied.affectedCount,
            mismatchPaths,
            outOfScopeMismatchPaths,
            counterfactualCoherence,
            baselineOracle,
            mutantOracle,
          })}`,
        );
      }
      const preimage = {
        caseId,
        operatorId: control.id,
        applicability: {
          matched: true,
          affectedCount: applied.affectedCount,
          affectedPaths: mismatchPaths,
          selectorId: applied.selectorId,
          selectedTargets: applied.selectedTargets,
          outOfScopeMismatchPaths,
          counterfactualCoherence,
        },
        baselineProjection: runtime.payload,
        mutatedProjection: applied.mutatedProjection,
        mutationOperation: {
          algorithm: spec.algorithm,
          parameters: spec.parameters,
          selectorId: applied.selectorId,
          selectedTargets: applied.selectedTargets,
        },
        detector: {
          oracleId:
            "reviewed-fixture-invariant-plus-fixture-validated-exact-selected-projection",
          expectationSource: baselineOracle.expectationSource,
          reviewedExpectationDigest: baselineOracle.reviewedExpectationDigest,
          fixtureValidatedExpectedProjection,
          expectedProjectionDigest: baselineOracle.expectedProjectionDigest,
          baselineAccepted: baselineOracle.accepted,
          baselineReviewedInvariantAccepted:
            baselineOracle.reviewedInvariantAccepted,
          baselineExactExpectedProjectionMatch:
            baselineOracle.exactExpectedProjectionMatch,
          baselineProjectionDigest: baselineOracle.projectionDigest,
          baselineReason: baselineOracle.reason,
          mutantAccepted: mutantOracle.accepted,
          mutantReviewedInvariantAccepted: mutantOracle.reviewedInvariantAccepted,
          mutantExactExpectedProjectionMatch:
            mutantOracle.exactExpectedProjectionMatch,
          mutantProjectionDigest: mutantOracle.projectionDigest,
          mutantReason: mutantOracle.reason,
          detectorRelevantProjectionChanged:
            baselineOracle.projectionDigest !== mutantOracle.projectionDigest,
          mismatchPaths,
          selectedTargets: applied.selectedTargets,
          outOfScopeMismatchPaths,
          counterfactualCoherence,
          expectedDetection: control.expectedDetection,
        },
        baselineObservationDigest: runtime.observationDigest,
      };
      return { ...preimage, executionDigest: t1CanonicalDigest(preimage) };
    });
    const corroborativeObservations = corroborativeReasonsForControl(control).map(
      (reason) => {
        const runtime = observations.get(reason.caseId);
        if (runtime === undefined) {
          throw new Error(`${control.id}/${reason.caseId} test corroboration missing`);
        }
        return {
          ...reason,
          observationDigest: runtime.observationDigest,
          observed: true as const,
        };
      },
    );
    const preimage = {
      controlId: control.id,
      faultFamily: control.faultFamily,
      operator: control.operator,
      mutatedFault: control.mutatedFault,
      expectedDetection: control.expectedDetection,
      executionClass: "semantic-output-counterfactual" as const,
      directKillerExecutions,
      corroborativeObservations,
      directLinksExecuted: directKillerExecutions.length,
      directLinksKilled: directKillerExecutions.length,
      directLinksSurvived: 0,
      corroborativeLinksObserved: corroborativeObservations.length,
      killed: true as const,
    };
    return { ...preimage, executionDigest: t1CanonicalDigest(preimage) };
  });
}

function semanticDirectExecutionIsExact(
  value: unknown,
  control: (typeof mutationFixture.controls)[number],
  spec: T1SemanticOperatorSpec,
  expectedCaseId: string,
  observations: ReadonlyMap<string, T1CaseObservationRecord>,
): value is JsonRecord {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "caseId",
      "operatorId",
      "applicability",
      "baselineProjection",
      "mutatedProjection",
      "mutationOperation",
      "detector",
      "baselineObservationDigest",
      "executionDigest",
    ]) ||
    value["caseId"] !== expectedCaseId ||
    value["operatorId"] !== control.id
  ) return false;
  const baseline = observations.get(expectedCaseId);
  if (baseline === undefined ||
    value["baselineObservationDigest"] !== baseline.observationDigest ||
    stableJson(value["baselineProjection"]) !== stableJson(baseline.payload)) {
    return false;
  }
  const applied = t1ApplyRuntimeCounterfactual(spec, expectedCaseId, baseline.payload);
  if (stableJson(value["mutationOperation"]) !== stableJson({
      algorithm: spec.algorithm,
      parameters: spec.parameters,
      selectorId: applied.selectorId,
      selectedTargets: applied.selectedTargets,
    })) return false;

  const mismatchPaths = t1SemanticMismatchPaths(
    baseline.payload,
    applied.mutatedProjection,
  );
  const counterfactualCoherence = t1CounterfactualCoherenceReport(
    spec,
    expectedCaseId,
    baseline.payload,
    applied.mutatedProjection,
  );
  const outOfScopeMismatchPaths = mismatchPaths.filter((mismatchPath) =>
    !applied.selectedTargets.some(({ path }) =>
      t1MismatchIsWithinSelectedTarget(mismatchPath, path)
    )
  );
  const fixtureValidatedExpectedProjection = t1SemanticOracleProjection(
    spec,
    expectedCaseId,
    baseline.payload,
  );
  const baselineOracle = t1EvaluateSemanticOracle(
    spec,
    expectedCaseId,
    baseline.payload,
    fixtureValidatedExpectedProjection,
  );
  const mutantOracle = t1EvaluateSemanticOracle(
    spec,
    expectedCaseId,
    applied.mutatedProjection,
    fixtureValidatedExpectedProjection,
  );
  const expectedApplicability = {
    matched: applied.affectedCount > 0,
    affectedCount: applied.affectedCount,
    affectedPaths: mismatchPaths,
    selectorId: applied.selectorId,
    selectedTargets: applied.selectedTargets,
    outOfScopeMismatchPaths,
    counterfactualCoherence,
  };
  const expectedDetector = {
    oracleId:
      "reviewed-fixture-invariant-plus-fixture-validated-exact-selected-projection",
    expectationSource: baselineOracle.expectationSource,
    reviewedExpectationDigest: baselineOracle.reviewedExpectationDigest,
    fixtureValidatedExpectedProjection,
    expectedProjectionDigest: baselineOracle.expectedProjectionDigest,
    baselineAccepted: baselineOracle.accepted,
    baselineReviewedInvariantAccepted: baselineOracle.reviewedInvariantAccepted,
    baselineExactExpectedProjectionMatch:
      baselineOracle.exactExpectedProjectionMatch,
    baselineProjectionDigest: baselineOracle.projectionDigest,
    baselineReason: baselineOracle.reason,
    mutantAccepted: mutantOracle.accepted,
    mutantReviewedInvariantAccepted: mutantOracle.reviewedInvariantAccepted,
    mutantExactExpectedProjectionMatch: mutantOracle.exactExpectedProjectionMatch,
    mutantProjectionDigest: mutantOracle.projectionDigest,
    mutantReason: mutantOracle.reason,
    detectorRelevantProjectionChanged:
      baselineOracle.projectionDigest !== mutantOracle.projectionDigest,
    mismatchPaths,
    selectedTargets: applied.selectedTargets,
    outOfScopeMismatchPaths,
    counterfactualCoherence,
    expectedDetection: control.expectedDetection,
  };
  return applied.affectedCount > 0 &&
    mismatchPaths.length > 0 &&
    outOfScopeMismatchPaths.length === 0 &&
    counterfactualCoherence.accepted &&
    baselineOracle.accepted &&
    !mutantOracle.accepted &&
    baselineOracle.projectionDigest !== mutantOracle.projectionDigest &&
    stableJson(value["applicability"]) === stableJson(expectedApplicability) &&
    stableJson(value["mutatedProjection"]) ===
      stableJson(applied.mutatedProjection) &&
    stableJson(value["detector"]) === stableJson(expectedDetector) &&
    isSha256(value["executionDigest"]) &&
    value["executionDigest"] === t1DigestWithoutKey(value, "executionDigest");
}

function inspectSemanticMutants(
  value: unknown,
  observations: ReadonlyMap<string, T1CaseObservationRecord>,
): InspectedSemanticMutants {
  const findings: T1EvidenceFinding[] = [];
  const executionDigests = new Map<string, string>();
  const killedControlIds = new Set<string>();
  let killerLinksExecuted = 0;
  let killerLinksKilled = 0;
  let corroborativeLinksObserved = 0;
  if (!Array.isArray(value)) {
    return {
      executionDigests,
      killedControlIds,
      killerLinksExecuted,
      killerLinksKilled,
      corroborativeLinksObserved,
      findings: [finding(
        "T1_EVIDENCE_SEMANTIC_MUTANT",
        "suite.observations.mutation-controls.counterfactualExecutions",
        "Executable semantic-counterfactual records are required.",
      )],
    };
  }
  const specs = new Map(
    T1_SEMANTIC_OPERATOR_REGISTRY.map((spec) => [spec.controlId, spec]),
  );
  for (const [index, control] of mutationFixture.controls.entries()) {
    const candidate: unknown = value[index];
    const path = `suite.observations.mutation-controls.counterfactualExecutions[${String(index)}]`;
    const directExecutionsValue: unknown = isRecord(candidate)
      ? candidate["directKillerExecutions"]
      : undefined;
    const directExecutions: readonly unknown[] = Array.isArray(directExecutionsValue)
      ? directExecutionsValue
      : [];
    const spec = specs.get(control.id);
    const directExecutionsAreExact = spec !== undefined &&
      directExecutions.length === control.killedByCaseIds.length &&
      control.killedByCaseIds.every((caseId, killerIndex) =>
        semanticDirectExecutionIsExact(
          directExecutions[killerIndex],
          control,
          spec,
          caseId,
          observations,
        )
      );
    const corroboratedByCaseIds = corroboratedCaseIdsForControl(control);
    const corroborativeReasons = corroborativeReasonsForControl(control);
    const corroborativeValue = isRecord(candidate)
      ? candidate["corroborativeObservations"]
      : undefined;
    const corroborativeObservations: readonly unknown[] =
      Array.isArray(corroborativeValue) ? corroborativeValue : [];
    const corroborativeAreExact =
      corroborativeObservations.length === corroborativeReasons.length &&
      corroborativeReasons.every((reason, reasonIndex) => {
        const observed: unknown = corroborativeObservations[reasonIndex];
        const baseline = observations.get(reason.caseId);
        return isRecord(observed) && baseline !== undefined &&
          exactKeys(observed, [
            "caseId",
            "reasonCode",
            "reason",
            "observationDigest",
            "observed",
          ]) &&
          stableJson(observed) === stableJson({
            ...reason,
            observationDigest: baseline.observationDigest,
            observed: true,
          });
      });
    if (
      !isRecord(candidate) ||
      !exactKeys(candidate, [
        "controlId",
        "faultFamily",
        "operator",
        "mutatedFault",
        "expectedDetection",
        "executionClass",
        "directKillerExecutions",
        "corroborativeObservations",
        "directLinksExecuted",
        "directLinksKilled",
        "directLinksSurvived",
        "corroborativeLinksObserved",
        "killed",
        "executionDigest",
      ]) ||
      candidate["controlId"] !== control.id ||
      candidate["faultFamily"] !== control.faultFamily ||
      candidate["operator"] !== control.operator ||
      candidate["mutatedFault"] !== control.mutatedFault ||
      candidate["expectedDetection"] !== control.expectedDetection ||
      candidate["executionClass"] !== "semantic-output-counterfactual" ||
      !directExecutionsAreExact ||
      !corroborativeAreExact ||
      candidate["directLinksExecuted"] !== control.killedByCaseIds.length ||
      candidate["directLinksKilled"] !== control.killedByCaseIds.length ||
      candidate["directLinksSurvived"] !== 0 ||
      candidate["corroborativeLinksObserved"] !== corroboratedByCaseIds.length ||
      candidate["killed"] !== true ||
      !isSha256(candidate["executionDigest"]) ||
      candidate["executionDigest"] !== t1DigestWithoutKey(candidate, "executionDigest")
    ) {
      findings.push(finding(
        "T1_EVIDENCE_SEMANTIC_MUTANT",
        path,
        "Semantic counterfactual must independently transform the bound runtime payload, recompute applicability and oracle results, and bind every direct and corroborative link exactly.",
      ));
      continue;
    }
    executionDigests.set(control.id, candidate["executionDigest"]);
    killedControlIds.add(control.id);
    killerLinksExecuted += control.killedByCaseIds.length;
    killerLinksKilled += control.killedByCaseIds.length;
    corroborativeLinksObserved += corroboratedByCaseIds.length;
  }
  if (
    value.length !== mutationFixture.controls.length ||
    executionDigests.size !== mutationFixture.controls.length
  ) {
    findings.push(finding(
      "T1_EVIDENCE_SEMANTIC_MUTANT_INVENTORY",
      "suite.observations.mutation-controls.counterfactualExecutions",
      "Exactly one valid executable semantic counterfactual is required for every reviewed control.",
    ));
  }
  return {
    executionDigests,
    killedControlIds,
    killerLinksExecuted,
    killerLinksKilled,
    corroborativeLinksObserved,
    findings: sortFindings(findings),
  };
}

const T1_SEMANTIC_MUTANT_INSPECTION_CACHE = new Map<
  string,
  InspectedSemanticMutants
>();

function inspectSemanticMutantsCached(
  value: unknown,
  observations: ReadonlyMap<string, T1CaseObservationRecord>,
): InspectedSemanticMutants {
  const cacheKey = t1CanonicalDigest({
    counterfactualExecutions: value,
    observations: [...observations.entries()].sort(([left], [right]) =>
      compare(left, right)
    ),
  });
  const cached = T1_SEMANTIC_MUTANT_INSPECTION_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;
  const inspected = inspectSemanticMutants(value, observations);
  if (T1_SEMANTIC_MUTANT_INSPECTION_CACHE.size >= 8) {
    const oldest = T1_SEMANTIC_MUTANT_INSPECTION_CACHE.keys().next().value;
    if (typeof oldest === "string") {
      T1_SEMANTIC_MUTANT_INSPECTION_CACHE.delete(oldest);
    }
  }
  T1_SEMANTIC_MUTANT_INSPECTION_CACHE.set(cacheKey, inspected);
  return inspected;
}

export function inspectT1ObservationRecords(
  records: readonly unknown[],
): T1EvidenceFinding[] {
  const findings: T1EvidenceFinding[] = [];
  if (records.length !== 3 || records.some((record) => !isRecord(record))) {
    return [finding(
      "T1_EVIDENCE_OBSERVATION_INVENTORY",
      "suite.observations",
      "Exactly one production, one laws, and one mutation-controls observation are required.",
    )];
  }
  const typed = records.filter(isRecord);
  const production = typed.filter((record) => record["schema"] === PRODUCTION_SCHEMA);
  const conformance = typed.filter((record) => record["schema"] === CONFORMANCE_SCHEMA);
  if (production.length !== 1 || conformance.length !== 2) {
    findings.push(finding(
      "T1_EVIDENCE_OBSERVATION_SCHEMA",
      "suite.observations",
      "Observation schema inventory is not exact.",
    ));
  }
  const suites = conformance.map((record) => record["suite"]);
  if (
    new Set(suites).size !== 2 ||
    !suites.includes("laws") ||
    !suites.includes("mutation-controls")
  ) {
    findings.push(finding(
      "T1_EVIDENCE_OBSERVATION_SUITE",
      "suite.observations",
      "Conformance observations must identify laws and mutation-controls exactly.",
    ));
  }
  for (const [index, record] of typed.entries()) {
    if (
      !isSha256(record["semanticDigest"]) ||
      record["semanticDigest"] !== t1SemanticDigest(record)
    ) {
      findings.push(finding(
        "T1_EVIDENCE_OBSERVATION_DIGEST",
        `suite.observations[${String(index)}]`,
        "Observation semantic digest is missing or does not bind its canonical payload.",
      ));
    }
  }

  const law = conformance.find((record) => record["suite"] === "laws");
  const preliminaryLawRecords = inspectT1CaseObservationRecords(
    law?.["observationRecords"],
    T1_LAWS_PRODUCER,
  );
  const preliminaryLawRecordMap = new Map(
    preliminaryLawRecords.records.map((record) => [record.caseId, record]),
  );
  const productionRecord = production[0];
  if (productionRecord !== undefined) {
    const expectedIds = t1ProductionCaseIds();
    const bindingHashes = new Map(
      buildT1CaseBindings().map(({ caseId, fixtureRecordSha256 }) => [
        caseId,
        fixtureRecordSha256,
      ]),
    );
    const expectedHashes = Object.fromEntries(
      expectedIds.map((caseId) => [caseId, bindingHashes.get(caseId)]),
    );
    const expectedCounts = {
      literalCases: 88,
      customCases: 9,
      allRootCells: 396,
      familyStates: 896,
      publicDegreeSpellingCells: 1_750,
      operationStateCases: 10,
      evidenceRows: 12,
    };
    const executionCounts = productionRecord["executionCounts"];
    const corpusDigests = productionRecord["corpusDigests"];
    const expectedReadTraps = t1ExpectedFirstExcessTailReadTrapObservations();
    const expectedFamilyState = formulaFixture.familyStateMatrix.expected;
    const productionKeysAreExact = exactKeys(productionRecord, [
      "schema",
      "producer",
      "fixtureCaseIds",
      "fixtureCaseHashes",
      "counts",
      "executionCounts",
      "familyStateOutcomeCounts",
      "familyStateAcceptedRuleIdCounts",
      "familyStateRefusalRuleIdCounts",
      "evidenceCounterMaxima",
      "evidenceCountersById",
      "operationEvidenceIds",
      "operationEvidenceDigests",
      "operationEvidenceRecords",
      "firstExcessTailReadTrapObservations",
      "corpusDigests",
      "combinedCorpusDigest",
      "reviewedFamilyStatePublicOutcomeDigest",
      "reviewedPublicDegreeSpellingDigest",
      "status",
      "semanticDigest",
    ]);
    if (
      !productionKeysAreExact ||
      stableJson(stringArray(productionRecord["fixtureCaseIds"])) !== stableJson(expectedIds) ||
      stableJson(productionRecord["fixtureCaseHashes"]) !== stableJson(expectedHashes) ||
      stableJson(productionRecord["counts"]) !== stableJson(expectedCounts) ||
      !t1ProductionExecutionCountsAreExact(executionCounts) ||
      stableJson(productionRecord["familyStateOutcomeCounts"]) !==
        stableJson(expectedFamilyState.outcomeCounts) ||
      stableJson(productionRecord["familyStateAcceptedRuleIdCounts"]) !==
        stableJson(expectedFamilyState.acceptedRuleIdCounts) ||
      stableJson(productionRecord["familyStateRefusalRuleIdCounts"]) !==
        stableJson(expectedFamilyState.refusalRuleIdCounts) ||
      !t1ProductionEvidenceCounterMaximaAreValid(
        productionRecord["evidenceCounterMaxima"],
      ) ||
      stableJson(productionRecord["firstExcessTailReadTrapObservations"]) !==
        stableJson(expectedReadTraps) ||
      !isRecord(corpusDigests) ||
      !exactKeys(corpusDigests, [
        "literalResults",
        "customResults",
        "allRootResults",
        "familyStatePublicOutcomes",
        "publicDegreeSpellingOutcomes",
        "precedenceResults",
        "firstExcessTailResults",
        "firstExcessTailReadTraps",
        "operationEvidence",
      ]) ||
      !Object.values(corpusDigests).every(isSha256) ||
      productionRecord["combinedCorpusDigest"] !== t1CanonicalDigest(corpusDigests) ||
      corpusDigests["familyStatePublicOutcomes"] !==
        formulaFixture.familyStateMatrix.expected.orderedPublicOutcomeSemanticSha256 ||
      corpusDigests["publicDegreeSpellingOutcomes"] !==
        spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256 ||
      corpusDigests["firstExcessTailReadTraps"] !==
        t1CanonicalDigest(expectedReadTraps) ||
      corpusDigests["operationEvidence"] !==
        t1OperationEvidenceCorpusDigest(productionRecord) ||
      productionRecord["reviewedFamilyStatePublicOutcomeDigest"] !==
        formulaFixture.familyStateMatrix.expected.orderedPublicOutcomeSemanticSha256 ||
      productionRecord["reviewedPublicDegreeSpellingDigest"] !==
        spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256 ||
      productionRecord["status"] !== "pass" ||
      !operationEvidenceIsExact(productionRecord, preliminaryLawRecordMap)
    ) {
      findings.push(finding(
        "T1_EVIDENCE_PRODUCTION_INVENTORY",
        "suite.observations.production",
        "Production observation must bind every reviewed T1 case, exhaustive matrix count, and all 14 exact operation-evidence rows.",
      ));
    }
  }

  const witnesses = expectedLawWitnesses();
  const lawObservedCaseIds = law === undefined
    ? []
    : stringArray(law["observedCaseIds"]);
  const traceCaseIds = sortedUnique(
    traceFixture.traces.flatMap(({ caseIds }) => caseIds),
  );
  const requiredLawExecutionIds = sortedUnique([
    ...traceCaseIds,
    ...Array.from(
      { length: T1_EXPECTED_COUNTS.operationStateCases },
      (_, index) => `T1-OPSTATE-${String(index + 1).padStart(3, "0")}`,
    ),
  ]);
  const lawObservationDigests = law?.["observationDigests"];
  const lawDigests = law?.["lawObservationDigests"];
  const knownCaseIds = new Set(buildT1CaseBindings().map(({ caseId }) => caseId));
  const inspectedLawRecords = inspectT1CaseObservationRecords(
    law?.["observationRecords"],
    T1_LAWS_PRODUCER,
    "suite.observations.laws.observationRecords",
  );
  findings.push(...inspectedLawRecords.findings);
  const inspectedLawRecordMap = new Map(
    inspectedLawRecords.records.map((record) => [record.caseId, record]),
  );
  const lawIdentityAndWitnessesExact = law !== undefined &&
    stableJson(law["producer"]) === stableJson(T1_LAWS_PRODUCER) &&
    stableJson(stringArray(law["lawIds"])) === stableJson(witnesses.lawIds) &&
    stableJson(stringArray(law["positiveCaseIds"])) ===
      stableJson(witnesses.positiveCaseIds) &&
    stableJson(stringArray(law["nearMissCaseIds"])) ===
      stableJson(witnesses.nearMissCaseIds) &&
    stableJson(stringArray(law["transpositionCaseIds"])) ===
      stableJson(witnesses.transpositionCaseIds) &&
    lawObservedCaseIds.length === new Set(lawObservedCaseIds).size &&
    stableJson(lawObservedCaseIds) ===
      stableJson([...lawObservedCaseIds].sort(compare)) &&
    witnesses.allCaseIds.every((caseId) => lawObservedCaseIds.includes(caseId)) &&
    !lawObservedCaseIds.some((caseId) => !knownCaseIds.has(caseId));
  const lawExecutionClosureExact = law !== undefined &&
    requiredLawExecutionIds.every((caseId) => lawObservedCaseIds.includes(caseId)) &&
    stableJson(stringArray(law["traceCaseIds"])) === stableJson(traceCaseIds) &&
    law["traceCasesObserved"] === traceCaseIds.length &&
    stableJson(law["traceCasesUnaccounted"]) === stableJson([]);
  const lawObservationInventoryExact = law !== undefined &&
    exactDigestMap(lawObservationDigests, lawObservedCaseIds) &&
    stableJson(lawObservationDigests) === stableJson(inspectedLawRecords.digests) &&
    exactDigestMap(lawDigests, witnesses.lawIds) &&
    witnesses.lawIds.every((caseId) =>
      lawDigests[caseId] === t1CanonicalDigest(
        inspectedLawRecordMap.get(caseId)?.payload,
      )
    ) &&
    law["observationInventoryDigest"] ===
      t1ObservationInventoryDigest(inspectedLawRecords.records);
  const lawProofInventoryExact = law !== undefined &&
    lawProofRecordsAreExact(
      law["lawProofRecords"],
      inspectedLawRecords.digests,
      inspectedLawRecordMap,
    ) &&
    traceProofRecordsAreExact(law["traceProofRecords"], inspectedLawRecords.digests) &&
    authorityProofRecordsAreExact(
      law["authorityProofRecords"],
      inspectedLawRecords.digests,
    );
  const lawDeterminismAndMatricesExact = law !== undefined &&
    law["seed"] === "changes.t1-laws.seed.v1:5411c0de" &&
    law["deterministicReplayRuns"] === 2 &&
    law["formulaMatrixSemanticDigest"] ===
      t1ReviewedFormulaMatrixSemanticDigest() &&
    law["familyStatePublicSemanticDigest"] ===
      formulaFixture.familyStateMatrix.expected.orderedPublicOutcomeSemanticSha256 &&
    law["standaloneSpellingSemanticDigest"] ===
      spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256;
  const lawCountersAndStatusExact = law !== undefined &&
    exactPositiveCounterMap(law["runtimeExecutions"], [
      "parser",
      "resolver",
      "evidenceResolver",
      "speller",
      "domainConstructor",
    ]) &&
    typeof law["assertionCount"] === "number" &&
    Number.isSafeInteger(law["assertionCount"]) &&
    law["assertionCount"] > 0 &&
    law["lawsObserved"] === T1_EXPECTED_COUNTS.lawCases &&
    law["formulaMatrixCells"] === T1_EXPECTED_COUNTS.allRootCells &&
    law["familyStateCells"] === 896 &&
    law["standaloneSpellingCells"] === T1_EXPECTED_COUNTS.publicDegreeSpellingCells &&
    law["status"] === "pass";
  const lawInventoryChecks: readonly (readonly [string, boolean])[] = [
    ["identity-and-witnesses", lawIdentityAndWitnessesExact],
    ["execution-closure", lawExecutionClosureExact],
    ["observation-inventory", lawObservationInventoryExact],
    ["proof-inventory", lawProofInventoryExact],
    ["determinism-and-matrices", lawDeterminismAndMatricesExact],
    ["counters-and-status", lawCountersAndStatusExact],
  ];
  const lawInventoryFailures = lawInventoryChecks.flatMap(([name, exact]) =>
    exact ? [] : [name]
  );
  if (law !== undefined && lawInventoryFailures.length > 0) {
    findings.push(finding(
      "T1_EVIDENCE_LAW_INVENTORY",
      "suite.observations.laws",
      `Law observation must bind all 12 laws and every named positive, near-miss, and transposition witness; failed groups: ${lawInventoryFailures.join(", ")}.`,
    ));
  }

  const mutation = conformance.find((record) => record["suite"] === "mutation-controls");
  const expectedControlIds = mutationFixture.controls.map(({ id }) => id);
  const reviewedMutationPartition = inspectT1ReviewedMutationLinkPartition();
  findings.push(...reviewedMutationPartition.findings);
  const expectedLinkedCaseIds = sortedUnique(
    reviewedMutationPartition.reviewedLinks.map(({ caseId }) => caseId),
  );
  const linkedCaseIds = mutation === undefined
    ? []
    : stringArray(mutation["linkedCaseIds"]);
  const mutationObservationDigests = mutation?.["observationDigests"];
  const mutationControlDigests = mutation?.["controlExecutionDigests"];
  const inspectedMutationRecords = inspectT1CaseObservationRecords(
    mutation?.["caseObservationRecords"],
    T1_LAWS_PRODUCER,
    "suite.observations.mutation-controls.caseObservationRecords",
  );
  findings.push(...inspectedMutationRecords.findings);
  const lawRecordMap = new Map(
    inspectedLawRecords.records.map((record) => [record.caseId, record]),
  );
  const expectedMutationRecords = expectedLinkedCaseIds.flatMap((caseId) => {
    const record = lawRecordMap.get(caseId);
    return record === undefined ? [] : [record];
  });
  const semanticMutants = inspectSemanticMutantsCached(
    mutation?.["counterfactualExecutions"],
    lawRecordMap,
  );
  findings.push(...semanticMutants.findings);
  const exactControlDigests = isRecord(mutationControlDigests) &&
    exactDigestMap(mutationControlDigests, expectedControlIds) &&
    stableJson(mutationControlDigests) === stableJson(Object.fromEntries(
      expectedControlIds.flatMap((controlId) => {
        const digest = semanticMutants.executionDigests.get(controlId);
        return digest === undefined ? [] : [[controlId, digest]];
      }),
    ));
  const expectedFaultFamilies = sortedUnique(
    mutationFixture.controls.map(({ faultFamily }) => faultFamily),
  );
  const runtimeCounts = mutation?.["runtimeExecutionCounts"];
  const expectedRuntimeExecutions = isRecord(runtimeCounts) &&
      ["resolver", "evidenceResolver", "speller"].every((key) =>
        typeof runtimeCounts[key] === "number"
      )
    ? ["resolver", "evidenceResolver", "speller"].reduce(
        (total, key) => total + Number(runtimeCounts[key]),
        0,
      )
    : -1;
  const exactMutationKeys = mutation !== undefined && exactKeys(mutation, [
    "schema",
    "suite",
    "producer",
    "fixtureSchema",
    "fixtureVersion",
    "productionOutputUsed",
    "expectedValuesGenerated",
    "reviewState",
    "claim",
    "classification",
    "seed",
    "controlIds",
    "controlsDefined",
    "reviewedControlsDischarged",
    "mappedButUnobserved",
    "semanticCounterfactualsExecuted",
    "semanticCounterfactualsKilled",
    "semanticCounterfactualsSurvived",
    "sourceMutantsExecuted",
    "sourceMutantsKilled",
    "requiredFaultFamilies",
    "faultFamiliesObserved",
    "counterfactualExecutions",
    "linkedCaseIds",
    "linkedCaseLinks",
    "reviewedCaseLinks",
    "reviewedCaseLinkInventorySha256",
    "directKillerLinksReviewed",
    "directKillerLinksExecuted",
    "directKillerLinksKilled",
    "directKillerLinksSurvived",
    "directKillerLinkInventorySha256",
    "corroborativeLinksReviewed",
    "corroborativeLinksObserved",
    "corroborativeLinksUnobserved",
    "corroborativeLinkInventorySha256",
    "linkedCasesObserved",
    "linkedCasesUnaccounted",
    "observationDigests",
    "caseObservationRecords",
    "observationInventoryDigest",
    "controlExecutionDigests",
    "runtimeExecutions",
    "runtimeExecutionCounts",
    "status",
    "semanticDigest",
  ]);
  if (
    mutation !== undefined && (
      !exactMutationKeys ||
      stableJson(mutation["producer"]) !== stableJson(T1_LAWS_PRODUCER) ||
      mutation["fixtureSchema"] !== mutationFixture.schema ||
      mutation["fixtureVersion"] !== mutationFixture.fixtureVersion ||
      mutation["productionOutputUsed"] !== mutationFixture.productionOutputUsed ||
      mutation["expectedValuesGenerated"] !== mutationFixture.expectedValuesGenerated ||
      mutation["reviewState"] !== mutationFixture.reviewState ||
      mutation["seed"] !== "changes.t1-laws.seed.v1:5411c0de" ||
      stableJson(stringArray(mutation["controlIds"])) !== stableJson(expectedControlIds) ||
      mutation["claim"] !== "executable-semantic-counterfactuals-not-source-mutants" ||
      mutation["classification"] !==
        "executable-semantic-counterfactuals-not-source-mutants" ||
      mutation["controlsDefined"] !== T1_EXPECTED_COUNTS.mutationControls ||
      mutation["reviewedControlsDischarged"] !== T1_EXPECTED_COUNTS.mutationControls ||
      mutation["mappedButUnobserved"] !== 0 ||
      mutation["semanticCounterfactualsExecuted"] !==
        T1_EXPECTED_COUNTS.mutationControls ||
      mutation["semanticCounterfactualsKilled"] !==
        T1_EXPECTED_COUNTS.mutationControls ||
      mutation["semanticCounterfactualsSurvived"] !== 0 ||
      mutation["sourceMutantsExecuted"] !== 0 ||
      mutation["sourceMutantsKilled"] !== 0 ||
      stableJson(mutation["requiredFaultFamilies"]) !==
        stableJson(mutationFixture.requiredFaultFamilies) ||
      stableJson(mutation["faultFamiliesObserved"]) !==
        stableJson(expectedFaultFamilies) ||
      stableJson(linkedCaseIds) !== stableJson(expectedLinkedCaseIds) ||
      linkedCaseIds.length !== T1_EXPECTED_COUNTS.mutationLinkedCases ||
      mutation["linkedCasesObserved"] !== T1_EXPECTED_COUNTS.mutationLinkedCases ||
      mutation["linkedCaseLinks"] !== T1_EXPECTED_COUNTS.mutationLinks ||
      mutation["reviewedCaseLinks"] !== T1_EXPECTED_COUNTS.mutationLinks ||
      mutation["reviewedCaseLinkInventorySha256"] !==
        T1_REVIEWED_MUTATION_LINK_INVENTORY_SHA256 ||
      mutation["directKillerLinksReviewed"] !==
        T1_EXPECTED_COUNTS.mutationDirectLinks ||
      mutation["directKillerLinksExecuted"] !==
        T1_EXPECTED_COUNTS.mutationDirectLinks ||
      mutation["directKillerLinksKilled"] !==
        T1_EXPECTED_COUNTS.mutationDirectLinks ||
      mutation["directKillerLinksSurvived"] !== 0 ||
      mutation["directKillerLinkInventorySha256"] !==
        T1_DIRECT_MUTATION_LINK_INVENTORY_SHA256 ||
      mutation["corroborativeLinksReviewed"] !==
        T1_EXPECTED_COUNTS.mutationCorroborativeLinks ||
      mutation["corroborativeLinksObserved"] !==
        T1_EXPECTED_COUNTS.mutationCorroborativeLinks ||
      mutation["corroborativeLinksUnobserved"] !== 0 ||
      mutation["corroborativeLinkInventorySha256"] !==
        T1_CORROBORATIVE_MUTATION_LINK_INVENTORY_SHA256 ||
      stableJson(mutation["linkedCasesUnaccounted"]) !== stableJson([]) ||
      !exactDigestMap(mutationObservationDigests, linkedCaseIds) ||
      stableJson(mutationObservationDigests) !==
        stableJson(inspectedMutationRecords.digests) ||
      stableJson(inspectedMutationRecords.records) !== stableJson(expectedMutationRecords) ||
      mutation["observationInventoryDigest"] !==
        t1ObservationInventoryDigest(inspectedMutationRecords.records) ||
      !exactControlDigests ||
      semanticMutants.executionDigests.size !== T1_EXPECTED_COUNTS.mutationControls ||
      semanticMutants.killedControlIds.size !== T1_EXPECTED_COUNTS.mutationControls ||
      semanticMutants.killerLinksExecuted !==
        T1_EXPECTED_COUNTS.mutationDirectLinks ||
      semanticMutants.killerLinksKilled !== T1_EXPECTED_COUNTS.mutationDirectLinks ||
      !exactPositiveCounterMap(mutation["runtimeExecutionCounts"], [
        "parser",
        "resolver",
        "evidenceResolver",
        "speller",
        "domainConstructor",
      ]) ||
      mutation["runtimeExecutions"] !== expectedRuntimeExecutions ||
      mutation["status"] !== "pass"
    )
  ) {
    findings.push(finding(
      "T1_EVIDENCE_MUTATION_INVENTORY",
      "suite.observations.mutation-controls",
      "Mutation observation must independently kill 53 controls across 124 direct links, observe 16 exact corroborative links, conserve all 140 reviewed links, and claim no source-mutant execution.",
    ));
  }
  return sortFindings(findings);
}

export function parseT1Observations(output: string): Readonly<{
  observations: readonly JsonRecord[];
  findings: readonly T1EvidenceFinding[];
}> {
  const findings: T1EvidenceFinding[] = [];
  const records: JsonRecord[] = [];
  for (const [index, line] of output.split(/\r?\n/).entries()) {
    const marker = line.startsWith(PRODUCTION_MARKER)
      ? PRODUCTION_MARKER
      : line.startsWith(CONFORMANCE_MARKER)
        ? CONFORMANCE_MARKER
        : null;
    if (marker === null) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(marker.length));
      if (!isRecord(parsed)) throw new Error("observation must be an object");
      records.push(parsed);
    } catch (error) {
      findings.push(finding(
        "T1_EVIDENCE_OBSERVATION_JSON",
        `suite.output:${String(index + 1)}`,
        error instanceof Error ? error.message : "Observation JSON is invalid.",
      ));
    }
  }
  findings.push(...inspectT1ObservationRecords(records));
  return { observations: records, findings: sortFindings(findings) };
}

function observationMaps(observations: readonly JsonRecord[]): Readonly<{
  cases: Map<string, T1CaseObservationRecord>;
  mutationCases: Map<string, T1CaseObservationRecord>;
  controls: Map<string, string>;
  semanticCounterfactuals: Map<string, string>;
  directKillerLinksExecuted: number;
  directKillerLinksKilled: number;
  corroborativeLinksObserved: number;
}> {
  const cases = new Map<string, T1CaseObservationRecord>();
  const mutationCases = new Map<string, T1CaseObservationRecord>();
  const controls = new Map<string, string>();
  const semanticCounterfactuals = new Map<string, string>();
  let directKillerLinksExecuted = 0;
  let directKillerLinksKilled = 0;
  let corroborativeLinksObserved = 0;
  const law = observations.find((observation) => observation["suite"] === "laws");
  const inspectedLaw = inspectT1CaseObservationRecords(
    law?.["observationRecords"],
    T1_LAWS_PRODUCER,
  );
  for (const record of inspectedLaw.records) cases.set(record.caseId, record);
  const mutation = observations.find((observation) =>
    observation["suite"] === "mutation-controls"
  );
  const inspectedMutation = inspectT1CaseObservationRecords(
    mutation?.["caseObservationRecords"],
    T1_LAWS_PRODUCER,
  );
  for (const record of inspectedMutation.records) {
    mutationCases.set(record.caseId, record);
  }
  if (mutation !== undefined) {
    const controlDigests = mutation["controlExecutionDigests"];
    if (isRecord(controlDigests)) {
      for (const [id, digest] of Object.entries(controlDigests)) {
        if (isSha256(digest)) controls.set(id, digest);
      }
    }
    const inspectedMutants = inspectSemanticMutantsCached(
      mutation["counterfactualExecutions"],
      cases,
    );
    for (const [id, digest] of inspectedMutants.executionDigests) {
      semanticCounterfactuals.set(id, digest);
    }
    directKillerLinksExecuted = inspectedMutants.killerLinksExecuted;
    directKillerLinksKilled = inspectedMutants.killerLinksKilled;
    corroborativeLinksObserved = inspectedMutants.corroborativeLinksObserved;
  }
  return {
    cases,
    mutationCases,
    controls,
    semanticCounterfactuals,
    directKillerLinksExecuted,
    directKillerLinksKilled,
    corroborativeLinksObserved,
  };
}

export function buildT1TraceEvidence(
  observations: readonly JsonRecord[],
  caseBindings: readonly T1CaseBinding[],
  summary: T1JUnitSummary,
  suiteOutcome: Outcome,
): T1TraceEvidence[] {
  const maps = observationMaps(observations);
  const bindings = new Map(caseBindings.map((row) => [row.caseId, row]));
  return traceFixture.traces.map((trace): T1TraceEvidence => {
    const requiredCaseIds = trace.caseIds;
    const requiredMutationControlIds = trace.mutationControlIds;
    const caseEvidence = requiredCaseIds.flatMap((caseId) => {
      const binding = bindings.get(caseId);
      const observation = maps.mutationCases.get(caseId) ?? maps.cases.get(caseId);
      return binding === undefined || observation === undefined
        ? []
        : [{
            ...binding,
            evidenceKind: "runtime-observation" as const,
            evidenceSha256: observation.observationDigest,
            producerFile: observation.producer.file,
            producerTestcase: observation.producer.testcase,
          }];
    });
    const mutationObservations = requiredMutationControlIds.flatMap((controlId) => {
      const controlObservationDigest = maps.controls.get(controlId);
      const semanticCounterfactualExecutionDigest =
        maps.semanticCounterfactuals.get(controlId);
      return controlObservationDigest === undefined ||
          semanticCounterfactualExecutionDigest === undefined
        ? []
        : [{
            controlId,
            controlObservationDigest,
            semanticCounterfactualExecutionDigest,
          }];
    });
    const producerIdentities = [
      ...caseEvidence.map(({ producerFile: file, producerTestcase: testcase }) => ({
        file,
        testcase,
      })),
      ...(requiredMutationControlIds.length === 0
        ? []
        : [T1_LAWS_PRODUCER]),
    ].filter((producer, index, values) =>
      values.findIndex((candidate) =>
        candidate.file === producer.file && candidate.testcase === producer.testcase
      ) === index
    );
    const testFiles = sortedUnique(producerIdentities.map(({ file }) => file));
    const observedTests = producerIdentities.filter((producer) =>
      summary.cases.some(({ file, name }) =>
        file === producer.file && name === producer.testcase
      )
    ).length;
    const evidencePaths = sortedUnique([
      "docs/T1_RESOLUTION_CONTRACT.md",
      "tests/fixtures/resolution/trace-ledger.json",
      ...caseEvidence.map(({ fixturePath }) => fixturePath),
      ...testFiles,
    ]);
    const pass = suiteOutcome === "pass" &&
      observedTests > 0 &&
      caseEvidence.length === requiredCaseIds.length &&
      observedTests === producerIdentities.length &&
      mutationObservations.length === requiredMutationControlIds.length;
    return {
      traceId: trace.id,
      requirement: trace.requirement,
      sourceRefs: trace.sourceRefs,
      requiredCaseIds,
      requiredMutationControlIds,
      caseEvidence,
      mutationObservationSha256: t1CanonicalDigest({
        traceId: trace.id,
        controls: mutationObservations,
      }),
      testFiles,
      evidencePaths,
      observedTests,
      outcome: pass ? "pass" : "fail",
    };
  }).sort((left, right) => compare(left.traceId, right.traceId));
}

export function buildT1MutationEvidence(
  observations: readonly JsonRecord[],
  caseBindings: readonly T1CaseBinding[],
): T1EvidenceLedger["mutationEvidence"] {
  const maps = observationMaps(observations);
  const bindings = new Map(caseBindings.map((row) => [row.caseId, row]));
  const partition = inspectT1ReviewedMutationLinkPartition();
  const rows = mutationFixture.controls.map((control): T1MutationEvidenceRow => {
    const corroboratedByCaseIds = corroboratedCaseIdsForControl(control);
    const corroborativeReasons = corroborativeReasonsForControl(control);
    const directKillEvidence = control.killedByCaseIds.flatMap((caseId) => {
      const binding = bindings.get(caseId);
      const observation = maps.mutationCases.get(caseId);
      return binding === undefined || observation === undefined
        ? []
        : [{
            ...binding,
            observationSha256: observation.observationDigest,
            producerFile: observation.producer.file,
            producerTestcase: observation.producer.testcase,
          }];
    });
    const corroborativeEvidence = corroborativeReasons.flatMap((reason) => {
      const binding = bindings.get(reason.caseId);
      const observation = maps.mutationCases.get(reason.caseId);
      return binding === undefined || observation === undefined
        ? []
        : [{
            ...binding,
            observationSha256: observation.observationDigest,
            producerFile: observation.producer.file,
            producerTestcase: observation.producer.testcase,
            reasonCode: reason.reasonCode,
            reason: reason.reason,
          }];
    });
    const controlObservationSha256 = maps.controls.get(control.id) ?? "unavailable";
    const semanticCounterfactualExecutionSha256 =
      maps.semanticCounterfactuals.get(control.id) ?? "unavailable";
    return {
      controlId: control.id,
      operator: control.operator,
      mutatedFault: control.mutatedFault,
      expectedDetection: control.expectedDetection,
      killedByCaseIds: control.killedByCaseIds,
      corroboratedByCaseIds,
      directKillEvidence,
      corroborativeEvidence,
      controlObservationSha256,
      semanticCounterfactualExecutionSha256,
      semanticCounterfactualKilled:
        isSha256(semanticCounterfactualExecutionSha256),
      outcome:
        directKillEvidence.length === control.killedByCaseIds.length &&
        corroborativeEvidence.length === corroboratedByCaseIds.length &&
        controlObservationSha256 === semanticCounterfactualExecutionSha256 &&
        isSha256(semanticCounterfactualExecutionSha256)
          ? "pass"
          : "fail",
    };
  }).sort((left, right) => compare(left.controlId, right.controlId));
  const discharged = rows.filter(({ outcome }) => outcome === "pass").length;
  const unobserved = rows.filter(
    ({
      killedByCaseIds,
      corroboratedByCaseIds,
      directKillEvidence,
      corroborativeEvidence,
      controlObservationSha256,
      semanticCounterfactualExecutionSha256,
    }) =>
      directKillEvidence.length !== killedByCaseIds.length ||
      corroborativeEvidence.length !== corroboratedByCaseIds.length ||
      !isSha256(controlObservationSha256) ||
      !isSha256(semanticCounterfactualExecutionSha256),
  ).length;
  const invalid = rows.length - discharged - unobserved;
  const semanticCounterfactualsExecuted = rows.filter(({
    semanticCounterfactualExecutionSha256,
  }) =>
    isSha256(semanticCounterfactualExecutionSha256)
  ).length;
  const semanticCounterfactualsKilled = rows.filter(({
    semanticCounterfactualKilled,
  }) =>
    semanticCounterfactualKilled
  ).length;
  return {
    classification:
      "executable-semantic-counterfactuals-with-corroborative-observations-not-source-mutant-execution",
    reviewedControls: rows.length,
    reviewedControlsDischarged: discharged,
    reviewedControlsUndischarged: rows.length - discharged,
    reviewedControlsUnobserved: unobserved,
    reviewedControlsInvalid: invalid,
    semanticCounterfactualsExecuted,
    semanticCounterfactualsKilled,
    semanticCounterfactualsSurvived:
      semanticCounterfactualsExecuted - semanticCounterfactualsKilled,
    directKillerLinksReviewed: partition.directLinks.length,
    directKillerLinksExecuted: maps.directKillerLinksExecuted,
    directKillerLinksKilled: maps.directKillerLinksKilled,
    directKillerLinksSurvived:
      maps.directKillerLinksExecuted - maps.directKillerLinksKilled,
    corroborativeLinksReviewed: partition.corroborativeLinks.length,
    corroborativeLinksObserved: maps.corroborativeLinksObserved,
    corroborativeLinksUnobserved:
      partition.corroborativeLinks.length - maps.corroborativeLinksObserved,
    reviewedCaseLinks: partition.reviewedLinks.length,
    reviewedLinkInventorySha256: partition.reviewedLinkInventorySha256,
    directLinkInventorySha256: partition.directLinkInventorySha256,
    corroborativeLinkInventorySha256: partition.corroborativeLinkInventorySha256,
    sourceMutantsExecuted: 0,
    sourceMutantsKilled: 0,
    rows,
    outcome:
      rows.length === T1_EXPECTED_COUNTS.mutationControls &&
      discharged === T1_EXPECTED_COUNTS.mutationControls &&
      unobserved === 0 &&
      invalid === 0 &&
      semanticCounterfactualsExecuted === T1_EXPECTED_COUNTS.mutationControls &&
      semanticCounterfactualsKilled === T1_EXPECTED_COUNTS.mutationControls &&
      maps.directKillerLinksExecuted === T1_EXPECTED_COUNTS.mutationDirectLinks &&
      maps.directKillerLinksKilled === T1_EXPECTED_COUNTS.mutationDirectLinks &&
      maps.corroborativeLinksObserved ===
        T1_EXPECTED_COUNTS.mutationCorroborativeLinks &&
      partition.findings.length === 0
        ? "pass"
        : "fail",
  };
}

export function validateT1TraceEvidenceRows(
  candidate: unknown,
  expected: readonly T1TraceEvidence[],
): T1EvidenceFinding[] {
  if (!Array.isArray(candidate)) {
    return [finding(
      "T1_EVIDENCE_TRACE_COVERAGE",
      "traces",
      "Trace evidence must be an array.",
    )];
  }
  const entries = candidate.flatMap((row): Array<[string, unknown]> =>
    isRecord(row) && typeof row["traceId"] === "string"
      ? [[row["traceId"], row]]
      : []
  );
  const ids = entries.map(([id]) => id);
  const rows = new Map(entries);
  const findings: T1EvidenceFinding[] = [];
  for (const row of expected) {
    if (stableJson(rows.get(row.traceId)) !== stableJson(row)) {
      findings.push(finding(
        "T1_EVIDENCE_TRACE_ROW",
        `traces#${row.traceId}`,
        "Stored trace row differs from independently recomputed case/control evidence.",
        row.traceId,
      ));
    }
  }
  if (
    candidate.length !== expected.length ||
    new Set(ids).size !== ids.length ||
    rows.size !== expected.length
  ) {
    findings.push(finding(
      "T1_EVIDENCE_TRACE_INVENTORY",
      "traces",
      "Trace evidence contains an unknown, duplicate, or missing row.",
    ));
  }
  return sortFindings(findings);
}

export function validateT1MutationEvidenceRows(
  candidate: unknown,
  expected: T1EvidenceLedger["mutationEvidence"],
): T1EvidenceFinding[] {
  if (!isRecord(candidate) || !Array.isArray(candidate["rows"])) {
    return [finding(
      "T1_EVIDENCE_MUTATION_AUDIT",
      "mutationEvidence",
      "Mutation evidence and rows are required.",
    )];
  }
  const entries = candidate["rows"].flatMap((row): Array<[string, unknown]> =>
    isRecord(row) && typeof row["controlId"] === "string"
      ? [[row["controlId"], row]]
      : []
  );
  const ids = entries.map(([id]) => id);
  const rows = new Map(entries);
  const findings: T1EvidenceFinding[] = [];
  for (const row of expected.rows) {
    if (stableJson(rows.get(row.controlId)) !== stableJson(row)) {
      findings.push(finding(
        "T1_EVIDENCE_MUTATION_ROW",
        `mutationEvidence.rows#${row.controlId}`,
        "Stored reviewed-control evidence differs from recomputed metadata and killer observations.",
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
    candidate["rows"].length !== expected.rows.length ||
    new Set(ids).size !== ids.length ||
    rows.size !== expected.rows.length ||
    stableJson(candidateHeader) !== stableJson(expectedHeader)
  ) {
    findings.push(finding(
      "T1_EVIDENCE_MUTATION_INVENTORY",
      "mutationEvidence",
      "Mutation audit inventory or summary is not exact.",
    ));
  }
  return sortFindings(findings);
}

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

async function snapshotInputs(): Promise<Readonly<{
  snapshot: InputSnapshot;
  findings: readonly T1EvidenceFinding[];
  controls: readonly T1EvidenceFinding[];
}>> {
  const findings: T1EvidenceFinding[] = [];
  const controls: T1EvidenceFinding[] = [];
  const paths = new Map<string, string>();
  for (const [group, patterns] of Object.entries(T1_INPUT_GROUPS)) {
    for (const pattern of patterns) {
      const matches = await expandPattern(pattern);
      if (matches.length === 0) {
        findings.push(finding(
          "T1_EVIDENCE_INPUT_MISSING",
          pattern,
          `Required ${group} input is missing.`,
        ));
      }
      for (const filePath of matches) {
        const previous = paths.get(filePath);
        if (previous === undefined) paths.set(filePath, group);
        else {
          findings.push(finding(
            "T1_EVIDENCE_INPUT_DUPLICATE",
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
    components.push({
      group,
      path: filePath,
      bytes: bytes.byteLength,
      sha256: await sha256Hex(bytes),
    });
    const source = new TextDecoder().decode(bytes);
    const importedFixture = FIXTURE_VALUES.find(({ path }) => path === filePath);
    if (importedFixture !== undefined) {
      try {
        const parsed: unknown = JSON.parse(source);
        if (stableJson(parsed) !== stableJson(importedFixture.value)) {
          findings.push(finding(
            "T1_EVIDENCE_FIXTURE_IMPORT_DRIFT",
            filePath,
            "Fixture bytes differ from the module snapshot used to build case evidence.",
          ));
        }
      } catch (error) {
        findings.push(finding(
          "T1_EVIDENCE_FIXTURE_IMPORT_DRIFT",
          filePath,
          error instanceof Error ? error.message : "Fixture JSON is invalid.",
        ));
      }
    }
    if (group === "tests") {
      controls.push(...inspectT1TestControls(filePath, source));
    }
    if (filePath === "bunfig.toml" && !/^retry\s*=\s*0\s*$/m.test(source)) {
      controls.push(finding(
        "T1_EVIDENCE_RETRY",
        filePath,
        "Focused evidence requires [test] retry = 0.",
      ));
    }
  }
  return {
    snapshot: {
      algorithm: "sha256-component-manifest-v1",
      digest: await sha256Hex(stableJson(components)),
      components,
    },
    findings: sortFindings(findings),
    controls: sortFindings(controls),
  };
}

function runIdFor(inputDigest: string): string {
  return sha256Sync(stableJson({ toolVersion: TOOL_VERSION, inputDigest })).slice(0, 24);
}

function suitePaths(runId: string): Readonly<{
  directory: string;
  junitPath: string;
  stdoutPath: string;
  stderrPath: string;
  validatorStdoutPath: string;
  validatorStderrPath: string;
  metadataPath: string;
}> {
  const directory = `test-results/t1-evidence-runs/${runId}`;
  return {
    directory,
    junitPath: `${directory}/focused-tests.junit.xml`,
    stdoutPath: `${directory}/focused-tests.stdout.txt`,
    stderrPath: `${directory}/focused-tests.stderr.txt`,
    validatorStdoutPath: `${directory}/contract-validator.stdout.json`,
    validatorStderrPath: `${directory}/contract-validator.stderr.txt`,
    metadataPath: `${directory}/run-metadata.json`,
  };
}

function runEnvironment(
  runId: string,
  compilerNodePath: string,
): Readonly<Record<string, string>> {
  return {
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
    T1_EVIDENCE_RUN_ID: runId,
  };
}

function validatorCommand(): readonly string[] {
  return ["bun", "scripts/validate-t1-contract.ts"];
}

function focusedSuiteCommand(runId: string): readonly string[] {
  return [
    "bun",
    "test",
    ...T1_FOCUSED_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--reporter=junit",
    `--reporter-outfile=${suitePaths(runId).junitPath}`,
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
): Promise<RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>> {
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
    ? "kilobytes"
    : platform() === "darwin"
      ? "bytes"
      : "runtime-defined";
  const maxRssBytes = maxRssRaw === null
    ? null
    : maxRssRawUnit === "kilobytes"
      ? maxRssRaw * 1_024
      : maxRssRawUnit === "bytes"
        ? maxRssRaw
        : null;
  return {
    command,
    environment,
    stdoutPath,
    stderrPath,
    stdoutSha256: await sha256Hex(stdout),
    stderrSha256: await sha256Hex(stderr),
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

function executionRecord(
  value: RawExecution & Readonly<{ stdout: Uint8Array; stderr: Uint8Array }>,
): RawExecution {
  return {
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
  };
}

async function environmentEvidence(
  compilerNode: Awaited<ReturnType<typeof findRealNode>>,
): Promise<T1EvidenceLedger["environment"]> {
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

async function packageVersions(
  compilerNode?: Awaited<ReturnType<typeof findRealNode>>,
): Promise<
  ReadonlyArray<{ name: string; version: string }>
> {
  const packageValue: unknown = await Bun.file("package.json").json();
  const versions = new Map<string, string>();
  if (isRecord(packageValue)) {
    for (const field of ["dependencies", "devDependencies"] as const) {
      const record = packageValue[field];
      if (!isRecord(record)) continue;
      for (const [name, version] of Object.entries(record)) {
        if (typeof version === "string") versions.set(name, version);
      }
    }
  }
  versions.set("bun", Bun.version);
  versions.set("compiler-node", (compilerNode ?? await findRealNode()).version);
  versions.set("node-compatibility", process.versions.node);
  return [...versions]
    .sort(([left], [right]) => compare(left, right))
    .map(([name, version]) => ({ name, version }));
}

function inputSnapshotCandidate(
  value: unknown,
  path: string,
  findings: T1EvidenceFinding[],
): InputSnapshot | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["algorithm", "digest", "components"]) ||
    !Array.isArray(value["components"])
  ) {
    findings.push(finding(
      "T1_EVIDENCE_INPUT_SHAPE",
      path,
      "Input snapshot must have exact algorithm, digest, and component fields.",
    ));
    return null;
  }
  const components: InputComponent[] = [];
  for (const [index, component] of value["components"].entries()) {
    if (
      !isRecord(component) ||
      !exactKeys(component, ["group", "path", "bytes", "sha256"]) ||
      typeof component["group"] !== "string" ||
      typeof component["path"] !== "string" ||
      typeof component["bytes"] !== "number" ||
      !Number.isSafeInteger(component["bytes"]) ||
      component["bytes"] < 0 ||
      !isSha256(component["sha256"])
    ) {
      findings.push(finding(
        "T1_EVIDENCE_INPUT_COMPONENT",
        `${path}.components[${String(index)}]`,
        "Input component is malformed.",
      ));
      continue;
    }
    components.push({
      group: component["group"],
      path: component["path"],
      bytes: component["bytes"],
      sha256: component["sha256"],
    });
  }
  const componentPaths = components.map(({ path: componentPath }) => componentPath);
  if (
    components.length !== value["components"].length ||
    new Set(componentPaths).size !== componentPaths.length ||
    stableJson(componentPaths) !== stableJson([...componentPaths].sort(compare)) ||
    componentPaths.some((componentPath) => componentPath.startsWith("test-results/"))
  ) {
    findings.push(finding(
      "T1_EVIDENCE_INPUT_INVENTORY",
      path,
      "Input components must be complete, unique, sorted, and non-circular.",
    ));
  }
  const digest = value["digest"];
  if (
    value["algorithm"] !== "sha256-component-manifest-v1" ||
    !isSha256(digest) ||
    digest !== sha256Sync(stableJson(components))
  ) {
    findings.push(finding(
      "T1_EVIDENCE_INPUT_DIGEST",
      path,
      "Input component-manifest digest is invalid.",
    ));
    return null;
  }
  return { algorithm: "sha256-component-manifest-v1", digest, components };
}

function validResourceUsage(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "measurement",
      "maxRssRaw",
      "maxRssRawUnit",
      "maxRssBytes",
      "cpuUserMicros",
      "cpuSystemMicros",
      "gating",
    ])
  ) return false;
  const raw = value["maxRssRaw"];
  const unit = value["maxRssRawUnit"];
  const nullableInteger = (item: unknown): boolean =>
    item === null ||
    (typeof item === "number" && Number.isSafeInteger(item) && item >= 0);
  const bytes = raw === null
    ? null
    : unit === "kilobytes" && typeof raw === "number"
      ? raw * 1_024
      : unit === "bytes"
        ? raw
        : null;
  return value["measurement"] === "Bun.Subprocess.resourceUsage" &&
    value["gating"] === false &&
    nullableInteger(raw) &&
    ["bytes", "kilobytes", "runtime-defined"].includes(String(unit)) &&
    nullableInteger(value["maxRssBytes"]) &&
    value["maxRssBytes"] === bytes &&
    nullableInteger(value["cpuUserMicros"]) &&
    nullableInteger(value["cpuSystemMicros"]);
}

function fixtureBindingsFrom(snapshot: InputSnapshot): InputComponent[] {
  return snapshot.components.filter(({ path }) =>
    T1_FIXTURE_FILES.includes(path as (typeof T1_FIXTURE_FILES)[number])
  );
}

function inspectRuntimeMetadata(candidate: JsonRecord): T1EvidenceFinding[] {
  const findings: T1EvidenceFinding[] = [];
  const environment = candidate["environment"];
  if (
    !isRecord(environment) ||
    !exactKeys(environment, [
      "bun",
      "nodeCompatibility",
      "compilerNodePath",
      "compilerNodeVersion",
      "compilerNodeMajor",
      "compilerNodeBytes",
      "compilerNodeSha256",
      "platform",
      "release",
      "architecture",
      "cpuCount",
      "cpuModel",
      "totalMemoryBytes",
      "locale",
      "timeZone",
    ]) ||
    [
      "bun",
      "nodeCompatibility",
      "compilerNodePath",
      "compilerNodeVersion",
      "platform",
      "release",
      "architecture",
      "cpuModel",
      "locale",
      "timeZone",
    ].some((field) =>
      typeof environment[field] !== "string" || environment[field].length === 0
    ) ||
    typeof environment["compilerNodeMajor"] !== "number" ||
    !Number.isSafeInteger(environment["compilerNodeMajor"]) ||
    ![22, 24, 26].includes(environment["compilerNodeMajor"]) ||
    Number(String(environment["compilerNodeVersion"]).split(".")[0]) !==
      environment["compilerNodeMajor"] ||
    typeof environment["compilerNodeBytes"] !== "number" ||
    !Number.isSafeInteger(environment["compilerNodeBytes"]) ||
    environment["compilerNodeBytes"] <= 0 ||
    !isSha256(environment["compilerNodeSha256"]) ||
    typeof environment["cpuCount"] !== "number" ||
    !Number.isSafeInteger(environment["cpuCount"]) ||
    environment["cpuCount"] <= 0 ||
    typeof environment["totalMemoryBytes"] !== "number" ||
    !Number.isSafeInteger(environment["totalMemoryBytes"]) ||
    environment["totalMemoryBytes"] <= 0
  ) {
    findings.push(finding(
      "T1_EVIDENCE_ENVIRONMENT",
      "environment",
      "Complete compiler identity and observational host/runtime metadata are required.",
    ));
  }
  const versions = candidate["versions"];
  const names = Array.isArray(versions)
    ? versions.flatMap((value) =>
        isRecord(value) && typeof value["name"] === "string"
          ? [value["name"]]
          : []
      )
    : [];
  if (
    !Array.isArray(versions) ||
    versions.length === 0 ||
    versions.some((value) =>
      !isRecord(value) ||
      !exactKeys(value, ["name", "version"]) ||
      typeof value["name"] !== "string" ||
      value["name"].length === 0 ||
      typeof value["version"] !== "string" ||
      value["version"].length === 0
    ) ||
    new Set(names).size !== versions.length ||
    stableJson(names) !== stableJson([...names].sort(compare)) ||
    !names.includes("bun") ||
    !names.includes("compiler-node") ||
    !names.includes("node-compatibility")
  ) {
    findings.push(finding(
      "T1_EVIDENCE_VERSIONS",
      "versions",
      "Sorted unique package and runtime versions are required.",
    ));
  }
  for (const field of ["validator", "suite"] as const) {
    const execution = candidate[field];
    if (
      !isRecord(execution) ||
      typeof execution["elapsedMs"] !== "number" ||
      !Number.isFinite(execution["elapsedMs"]) ||
      execution["elapsedMs"] < 0 ||
      !isSha256(execution["stdoutSha256"]) ||
      !isSha256(execution["stderrSha256"]) ||
      (field === "suite" && !isSha256(execution["junitSha256"])) ||
      !validResourceUsage(execution["resourceUsage"])
    ) {
      findings.push(finding(
        "T1_EVIDENCE_EXECUTION_METADATA",
        field,
        `${field} hashes, elapsed time, or resource metadata are invalid.`,
      ));
    }
  }
  return findings;
}

async function validateCurrentRuntime(candidate: unknown): Promise<T1EvidenceFinding[]> {
  if (!isRecord(candidate)) return [];
  const findings: T1EvidenceFinding[] = [];
  const environment = candidate["environment"];
  if (
    !isRecord(environment) ||
    environment["bun"] !== Bun.version ||
    environment["nodeCompatibility"] !== process.versions.node
  ) {
    findings.push(finding(
      "T1_EVIDENCE_ENVIRONMENT_DRIFT",
      "environment",
      "Stored semantic Bun/Node runtime differs from the current verifier runtime; host/resource metadata is intentionally observational.",
    ));
  }
  if (stableJson(candidate["versions"]) !== stableJson(await packageVersions())) {
    findings.push(finding(
      "T1_EVIDENCE_VERSION_DRIFT",
      "versions",
      "Stored versions differ from the current package/tool inventory.",
    ));
  }
  return findings;
}

function suiteSummaryFrom(candidate: JsonRecord): T1JUnitSummary {
  const suite = candidate["suite"];
  if (!isRecord(suite)) {
    return {
      tests: 0,
      assertions: 0,
      failures: 1,
      errors: 1,
      skipped: 1,
      files: [],
      cases: [],
    };
  }
  return {
    tests: typeof suite["tests"] === "number" ? suite["tests"] : 0,
    assertions: typeof suite["assertions"] === "number" ? suite["assertions"] : 0,
    failures: typeof suite["failures"] === "number" ? suite["failures"] : 1,
    errors: typeof suite["errors"] === "number" ? suite["errors"] : 1,
    skipped: typeof suite["skipped"] === "number" ? suite["skipped"] : 1,
    files: stringArray(suite["files"]),
    cases: Array.isArray(suite["cases"])
      ? suite["cases"].flatMap((item) =>
          isRecord(item) &&
            typeof item["file"] === "string" &&
            typeof item["name"] === "string"
            ? [{ file: item["file"], name: item["name"] }]
            : []
        )
      : [],
  };
}

export function validateT1EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): T1EvidenceFinding[] {
  const findings: T1EvidenceFinding[] = [];
  if (!isRecord(candidate)) {
    return [finding(
      "T1_EVIDENCE_LEDGER_SHAPE",
      OUTPUT_PATH,
      "Evidence ledger must be an object.",
    )];
  }
  if (
    candidate["schema"] !== "changes.evidence.t1.v1" ||
    candidate["schemaVersion"] !== 1 ||
    candidate["package"] !== "T1" ||
    candidate["traceId"] !== "T1" ||
    candidate["toolVersion"] !== TOOL_VERSION ||
    candidate["mode"] !== "focused-package"
  ) {
    findings.push(finding(
      "T1_EVIDENCE_LEDGER_IDENTITY",
      OUTPUT_PATH,
      "Ledger schema, package, tool, and mode identity are not exact.",
    ));
  }
  if (
    candidate["contractVersion"] !== manifestFixture.fixtureVersion ||
    candidate["contractSchema"] !== manifestFixture.schema
  ) {
    findings.push(finding(
      "T1_EVIDENCE_CONTRACT_IDENTITY",
      OUTPUT_PATH,
      "Contract version/schema do not match the reviewed T1 manifest.",
    ));
  }
  if (
    stableJson(candidate["browserVersions"]) !== stableJson([]) ||
    stableJson(candidate["applicability"]) !== stableJson(T1_APPLICABILITY)
  ) {
    findings.push(finding(
      "T1_EVIDENCE_APPLICABILITY",
      OUTPUT_PATH,
      "Browser inventory and applicability/deferred ownership are not exact.",
    ));
  }
  const input = candidate["input"];
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
    post.digest !== currentInputDigest
  ) {
    findings.push(finding(
      "T1_EVIDENCE_INPUT_STALE",
      "input",
      "Pre/post/current input digests must be byte-identical.",
    ));
  }
  if (
    pre !== null &&
    stableJson(candidate["fixtureBindings"]) !== stableJson(fixtureBindingsFrom(pre))
  ) {
    findings.push(finding(
      "T1_EVIDENCE_FIXTURE_BINDING",
      "fixtureBindings",
      "Fixture byte hashes must be the exact reviewed input components.",
    ));
  }
  const artifact = candidate["artifact"];
  const artifactComponent = pre?.components.find(({ path }) =>
    path === "jazz_chord_progression_editor.html"
  );
  if (
    !isRecord(artifact) ||
    artifactComponent === undefined ||
    artifact["path"] !== artifactComponent.path ||
    artifact["sha256"] !== artifactComponent.sha256 ||
    artifact["bytes"] !== artifactComponent.bytes
  ) {
    findings.push(finding(
      "T1_EVIDENCE_ARTIFACT_IDENTITY",
      "artifact",
      "Artifact path, bytes, and SHA-256 must match the input snapshot exactly.",
    ));
  }
  const caseBindings = buildT1CaseBindings();
  if (stableJson(candidate["caseBindings"]) !== stableJson(caseBindings)) {
    findings.push(finding(
      "T1_EVIDENCE_CASE_BINDING",
      "caseBindings",
      "Per-case canonical hashes differ from the reviewed fixtures.",
    ));
  }
  if (stableJson(candidate["reviewedCounts"]) !== stableJson(T1_EXPECTED_COUNTS)) {
    findings.push(finding(
      "T1_EVIDENCE_REVIEWED_INVENTORY",
      OUTPUT_PATH,
      "Reviewed T1 counts are not exact.",
    ));
  }
  const runId = candidate["runId"];
  if (
    typeof runId !== "string" ||
    !/^[a-f0-9]{24}$/.test(runId) ||
    pre === null ||
    runId !== runIdFor(pre.digest)
  ) {
    findings.push(finding(
      "T1_EVIDENCE_RUN_ID",
      "runId",
      "Run ID is not the deterministic input identity.",
    ));
  }
  if (typeof runId === "string" && /^[a-f0-9]{24}$/.test(runId)) {
    const paths = suitePaths(runId);
    const recordedEnvironment = candidate["environment"];
    const compilerNodePath = isRecord(recordedEnvironment) &&
        typeof recordedEnvironment["compilerNodePath"] === "string"
      ? recordedEnvironment["compilerNodePath"]
      : "";
    const environment = runEnvironment(runId, compilerNodePath);
    const validator = candidate["validator"];
    if (
      !isRecord(validator) ||
      stableJson(validator["command"]) !== stableJson(validatorCommand()) ||
      stableJson(validator["environment"]) !== stableJson(environment) ||
      validator["stdoutPath"] !== paths.validatorStdoutPath ||
      validator["stderrPath"] !== paths.validatorStderrPath ||
      validator["exitCode"] !== 0 ||
      validator["signal"] !== null ||
      validator["schema"] !== "changes.validation.t1-contract.v1" ||
      validator["outcome"] !== "pass" ||
      stableJson(validator["counts"]) !== stableJson(T1_VALIDATOR_COUNTS) ||
      stableJson(validator["findings"]) !== stableJson([]) ||
      !validResourceUsage(validator["resourceUsage"])
    ) {
      findings.push(finding(
        "T1_EVIDENCE_VALIDATOR",
        "validator",
        "Validator identity, result, counts, findings, or resources are invalid.",
      ));
    }
    const versionsValue: unknown = candidate["versions"];
    const versions: readonly unknown[] = Array.isArray(versionsValue) ? versionsValue : [];
    const compilerNodeVersion: unknown = versions.length > 0
      ? versions.find((value) =>
          isRecord(value) && value["name"] === "compiler-node"
        )
      : undefined;
    if (
      !isRecord(recordedEnvironment) ||
      !isRecord(compilerNodeVersion) ||
      compilerNodeVersion["version"] !== recordedEnvironment["compilerNodeVersion"]
    ) {
      findings.push(finding(
        "T1_EVIDENCE_NODE_IDENTITY",
        "environment.compilerNodeVersion",
        "The explicitly selected compiler Node identity must match the recorded version inventory.",
      ));
    }
    const suite = candidate["suite"];
    if (
      !isRecord(suite) ||
      stableJson(suite["command"]) !== stableJson(focusedSuiteCommand(runId)) ||
      stableJson(suite["environment"]) !== stableJson(environment) ||
      suite["stdoutPath"] !== paths.stdoutPath ||
      suite["stderrPath"] !== paths.stderrPath ||
      suite["junitPath"] !== paths.junitPath ||
      suite["exitCode"] !== 0 ||
      suite["signal"] !== null ||
      suite["failures"] !== 0 ||
      suite["errors"] !== 0 ||
      suite["skipped"] !== 0 ||
      suite["todos"] !== 0 ||
      suite["retries"] !== 0 ||
      suite["quarantined"] !== 0 ||
      suite["expectedFailures"] !== 0 ||
      stableJson(suite["files"]) !== stableJson([...T1_FOCUSED_TEST_FILES]) ||
      !validResourceUsage(suite["resourceUsage"])
    ) {
      findings.push(finding(
        "T1_EVIDENCE_SUITE",
        "suite",
        "Focused suite command, inventory, strict controls, result, or resources are invalid.",
      ));
    }
    const metadata = candidate["runMetadata"];
    if (
      !isRecord(metadata) ||
      metadata["schema"] !== "changes.evidence.t1.run-metadata.v1" ||
      metadata["path"] !== paths.metadataPath ||
      !isSha256(metadata["sha256"])
    ) {
      findings.push(finding(
        "T1_EVIDENCE_RUN_METADATA",
        "runMetadata",
        "Run metadata identity is invalid.",
      ));
    }
  }
  const observations = Array.isArray(candidate["observations"])
    ? candidate["observations"].filter(isRecord)
    : [];
  findings.push(...inspectT1ObservationRecords(observations));
  const suiteSummary = suiteSummaryFrom(candidate);
  for (const producer of [T1_PRODUCTION_PRODUCER, T1_LAWS_PRODUCER]) {
    if (!suiteSummary.cases.some(({ file, name }) =>
      file === producer.file && name === producer.testcase
    )) {
      findings.push(finding(
        "T1_EVIDENCE_OBSERVATION_PRODUCER",
        `${producer.file}#${producer.testcase}`,
        "The exact observation-producing testcase is absent from the focused JUnit inventory.",
      ));
    }
  }
  const expectedTraces = buildT1TraceEvidence(
    observations,
    caseBindings,
    suiteSummary,
    "pass",
  );
  findings.push(...validateT1TraceEvidenceRows(candidate["traces"], expectedTraces));
  if (
    expectedTraces.length !== T1_EXPECTED_COUNTS.traces ||
    expectedTraces.some(({ outcome }) => outcome !== "pass")
  ) {
    findings.push(finding(
      "T1_EVIDENCE_TRACE_COVERAGE",
      "traces",
      "All 13 traces must recompute as passing from executed case/control observations.",
    ));
  }
  const expectedMutation = buildT1MutationEvidence(observations, caseBindings);
  findings.push(...validateT1MutationEvidenceRows(
    candidate["mutationEvidence"],
    expectedMutation,
  ));
  if (expectedMutation.outcome !== "pass") {
    findings.push(finding(
      "T1_EVIDENCE_MUTATION_AUDIT",
      "mutationEvidence",
      "All 53 reviewed controls must recompute as discharged with zero source-mutant claims.",
    ));
  }
  findings.push(...inspectRuntimeMetadata(candidate));
  if (
    candidate["outcome"] !== "pass" ||
    stableJson(candidate["findings"]) !== stableJson([])
  ) {
    findings.push(finding(
      "T1_EVIDENCE_STORED_OUTCOME",
      OUTPUT_PATH,
      "A stored passing ledger must contain no findings.",
    ));
  }
  return sortFindings(findings);
}

async function validateStoredRawEvidence(candidate: unknown): Promise<T1EvidenceFinding[]> {
  const findings: T1EvidenceFinding[] = [];
  if (!isRecord(candidate) || typeof candidate["runId"] !== "string") {
    return findings;
  }
  const suite = candidate["suite"];
  const validator = candidate["validator"];
  const metadata = candidate["runMetadata"];
  if (!isRecord(suite) || !isRecord(validator) || !isRecord(metadata)) {
    return findings;
  }
  const paths = suitePaths(candidate["runId"]);
  const expected = [
    [suite["stdoutPath"], paths.stdoutPath, suite["stdoutSha256"]],
    [suite["stderrPath"], paths.stderrPath, suite["stderrSha256"]],
    [suite["junitPath"], paths.junitPath, suite["junitSha256"]],
    [validator["stdoutPath"], paths.validatorStdoutPath, validator["stdoutSha256"]],
    [validator["stderrPath"], paths.validatorStderrPath, validator["stderrSha256"]],
    [metadata["path"], paths.metadataPath, metadata["sha256"]],
  ] as const;
  const loaded = new Map<string, Uint8Array>();
  for (const [declaredPath, expectedPath, declaredHash] of expected) {
    if (declaredPath !== expectedPath || !isSha256(declaredHash)) {
      findings.push(finding(
        "T1_EVIDENCE_RAW_PATH",
        expectedPath,
        "Raw evidence path/hash escaped its deterministic run directory.",
      ));
      continue;
    }
    try {
      const bytes = new Uint8Array(await Bun.file(expectedPath).arrayBuffer());
      loaded.set(expectedPath, bytes);
      if (await sha256Hex(bytes) !== declaredHash) {
        findings.push(finding(
          "T1_EVIDENCE_RAW_HASH",
          expectedPath,
          "Raw evidence bytes differ from the ledger hash.",
        ));
      }
    } catch (error) {
      findings.push(finding(
        "T1_EVIDENCE_RAW_MISSING",
        expectedPath,
        error instanceof Error ? error.message : "Raw evidence is missing.",
      ));
    }
  }
  const junitBytes = loaded.get(paths.junitPath);
  if (junitBytes !== undefined) {
    const junit = new TextDecoder().decode(junitBytes);
    if (sanitizeT1JUnit(junit) !== junit) {
      findings.push(finding(
        "T1_EVIDENCE_JUNIT_HOST",
        paths.junitPath,
        "Stored JUnit still contains a machine hostname.",
      ));
    }
    const inspected = inspectT1JUnit(junit);
    findings.push(...inspected.findings);
    if (inspected.summary !== null) {
      for (const field of [
        "tests",
        "assertions",
        "failures",
        "errors",
        "skipped",
      ] as const) {
        if (suite[field] !== inspected.summary[field]) {
          findings.push(finding(
            "T1_EVIDENCE_JUNIT_DRIFT",
            paths.junitPath,
            `Ledger ${field} differs from JUnit.`,
          ));
        }
      }
      if (
        stableJson(suite["files"]) !== stableJson(inspected.summary.files) ||
        stableJson(suite["cases"]) !== stableJson(inspected.summary.cases)
      ) {
        findings.push(finding(
          "T1_EVIDENCE_JUNIT_DRIFT",
          paths.junitPath,
          "Ledger test inventory differs from JUnit.",
        ));
      }
    }
  }
  const stdout = loaded.get(paths.stdoutPath);
  const stderr = loaded.get(paths.stderrPath);
  if (stdout !== undefined && stderr !== undefined) {
    const parsed = parseT1Observations(
      `${new TextDecoder().decode(stdout)}\n${new TextDecoder().decode(stderr)}`,
    );
    findings.push(...parsed.findings);
    if (stableJson(parsed.observations) !== stableJson(candidate["observations"])) {
      findings.push(finding(
        "T1_EVIDENCE_OBSERVATION_DRIFT",
        "observations",
        "Ledger observations differ from raw focused-suite output.",
      ));
    }
  }
  const validatorBytes = loaded.get(paths.validatorStdoutPath);
  if (validatorBytes !== undefined) {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(validatorBytes));
      if (
        !isRecord(parsed) ||
        parsed["schema"] !== validator["schema"] ||
        parsed["outcome"] !== validator["outcome"] ||
        stableJson(parsed["counts"]) !== stableJson(validator["counts"]) ||
        stableJson(parsed["findings"]) !== stableJson(validator["findings"])
      ) {
        findings.push(finding(
          "T1_EVIDENCE_VALIDATOR_DRIFT",
          paths.validatorStdoutPath,
          "Validator ledger summary differs from raw JSON.",
        ));
      }
    } catch (error) {
      findings.push(finding(
        "T1_EVIDENCE_VALIDATOR_RAW",
        paths.validatorStdoutPath,
        error instanceof Error ? error.message : "Validator output is not JSON.",
      ));
    }
  }
  const metadataBytes = loaded.get(paths.metadataPath);
  if (metadataBytes !== undefined) {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(metadataBytes));
      const expectedMetadata = {
        schema: "changes.evidence.t1.run-metadata.v1",
        runId: candidate["runId"],
        environment: candidate["environment"],
        versions: candidate["versions"],
        validator: {
          elapsedMs: validator["elapsedMs"],
          resourceUsage: validator["resourceUsage"],
        },
        suite: {
          elapsedMs: suite["elapsedMs"],
          resourceUsage: suite["resourceUsage"],
        },
      };
      if (stableJson(parsed) !== stableJson(expectedMetadata)) {
        findings.push(finding(
          "T1_EVIDENCE_RUN_METADATA_DRIFT",
          paths.metadataPath,
          "Run metadata differs from stored runtime/resource evidence.",
        ));
      }
    } catch (error) {
      findings.push(finding(
        "T1_EVIDENCE_RUN_METADATA_INVALID",
        paths.metadataPath,
        error instanceof Error ? error.message : "Run metadata is invalid.",
      ));
    }
  }
  return sortFindings(findings);
}

function parseJsonBytes(bytes: Uint8Array): JsonRecord {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

export async function verifyT1Evidence(): Promise<T1EvidenceLedger> {
  const pre = await snapshotInputs();
  const runId = runIdFor(pre.snapshot.digest);
  const paths = suitePaths(runId);
  await mkdir(paths.directory, { recursive: true });
  const compilerNode = await findRealNode();
  const environment = runEnvironment(runId, compilerNode.path);
  const validatorRun = await runRaw(
    validatorCommand(),
    environment,
    paths.validatorStdoutPath,
    paths.validatorStderrPath,
  );
  const validatorJson = parseJsonBytes(validatorRun.stdout);
  const suiteRun = await runRaw(
    focusedSuiteCommand(runId),
    environment,
    paths.stdoutPath,
    paths.stderrPath,
  );
  let junit: string;
  try {
    junit = sanitizeT1JUnit(await Bun.file(paths.junitPath).text());
    await atomicWrite(paths.junitPath, junit);
  } catch {
    junit = "";
  }
  const inspected = inspectT1JUnit(junit);
  const summary: T1JUnitSummary = inspected.summary ?? {
    tests: 0,
    assertions: 0,
    failures: 0,
    errors: 0,
    skipped: 0,
    files: [],
    cases: [],
  };
  const parsedObservations = parseT1Observations(
    `${new TextDecoder().decode(suiteRun.stdout)}\n${new TextDecoder().decode(suiteRun.stderr)}`,
  );
  const caseBindings = buildT1CaseBindings();
  const suiteOutcome: Outcome = suiteRun.exitCode === 0 &&
      summary.failures === 0 &&
      summary.errors === 0 &&
      summary.skipped === 0
    ? "pass"
    : "fail";
  const traces = buildT1TraceEvidence(
    parsedObservations.observations,
    caseBindings,
    summary,
    suiteOutcome,
  );
  const mutationEvidence = buildT1MutationEvidence(
    parsedObservations.observations,
    caseBindings,
  );
  const versions = await packageVersions(compilerNode);
  const hostEnvironment = await environmentEvidence(compilerNode);
  const runMetadataValue = {
    schema: "changes.evidence.t1.run-metadata.v1",
    runId,
    environment: hostEnvironment,
    versions,
    validator: {
      elapsedMs: validatorRun.elapsedMs,
      resourceUsage: validatorRun.resourceUsage,
    },
    suite: {
      elapsedMs: suiteRun.elapsedMs,
      resourceUsage: suiteRun.resourceUsage,
    },
  };
  const runMetadataJson = stableJson(runMetadataValue);
  await atomicWrite(paths.metadataPath, runMetadataJson);
  const post = await snapshotInputs();
  const controlFindings = [...pre.controls, ...post.controls];
  const artifact = pre.snapshot.components.find(({ path }) =>
    path === "jazz_chord_progression_editor.html"
  );
  const validatorCounts = isRecord(validatorJson["counts"])
    ? Object.fromEntries(
        Object.entries(validatorJson["counts"]).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      )
    : {};
  const preliminary: T1EvidenceLedger = {
    schema: "changes.evidence.t1.v1",
    schemaVersion: 1,
    package: "T1",
    traceId: "T1",
    contractVersion: manifestFixture.fixtureVersion,
    contractSchema: manifestFixture.schema,
    runId,
    toolVersion: TOOL_VERSION,
    mode: "focused-package",
    outcome: "pass",
    findings: [],
    artifact: {
      path: "jazz_chord_progression_editor.html",
      sha256: artifact?.sha256 ?? "unavailable",
      bytes: artifact?.bytes ?? 0,
    },
    browserVersions: [],
    input: { pre: pre.snapshot, post: post.snapshot },
    fixtureBindings: fixtureBindingsFrom(pre.snapshot),
    caseBindings,
    environment: hostEnvironment,
    versions,
    reviewedCounts: T1_EXPECTED_COUNTS,
    applicability: T1_APPLICABILITY,
    runMetadata: {
      schema: "changes.evidence.t1.run-metadata.v1",
      path: paths.metadataPath,
      sha256: await sha256Hex(runMetadataJson),
    },
    validator: {
      ...executionRecord(validatorRun),
      schema: typeof validatorJson["schema"] === "string"
        ? validatorJson["schema"]
        : "unavailable",
      outcome: validatorJson["outcome"] === "pass" ? "pass" : "fail",
      counts: validatorCounts,
      findings: Array.isArray(validatorJson["findings"])
        ? validatorJson["findings"]
        : [],
    },
    suite: {
      ...executionRecord(suiteRun),
      junitPath: paths.junitPath,
      junitSha256: await sha256Hex(junit),
      tests: summary.tests,
      assertions: summary.assertions,
      failures: summary.failures,
      errors: summary.errors,
      skipped: summary.skipped,
      todos: controlFindings.filter(({ code }) => code === "T1_EVIDENCE_TODO").length,
      retries: controlFindings.filter(({ code }) => code === "T1_EVIDENCE_RETRY").length,
      quarantined: controlFindings.filter(({ code }) =>
        code === "T1_EVIDENCE_QUARANTINE"
      ).length,
      expectedFailures: controlFindings.filter(({ code }) =>
        code === "T1_EVIDENCE_EXPECTED_FAILURE"
      ).length,
      files: summary.files,
      cases: summary.cases,
    },
    observations: parsedObservations.observations,
    traces,
    mutationEvidence,
  };
  const rawFindings = await validateStoredRawEvidence(preliminary);
  const settled = await snapshotInputs();
  const settledControls = [...controlFindings, ...settled.controls];
  const settledCandidate: T1EvidenceLedger = {
    ...preliminary,
    input: { pre: pre.snapshot, post: settled.snapshot },
    suite: {
      ...preliminary.suite,
      todos: settledControls.filter(({ code }) => code === "T1_EVIDENCE_TODO").length,
      retries: settledControls.filter(({ code }) => code === "T1_EVIDENCE_RETRY").length,
      quarantined: settledControls.filter(({ code }) =>
        code === "T1_EVIDENCE_QUARANTINE"
      ).length,
      expectedFailures: settledControls.filter(({ code }) =>
        code === "T1_EVIDENCE_EXPECTED_FAILURE"
      ).length,
    },
  };
  const runtimeFindings = await validateCurrentRuntime(settledCandidate);
  const candidateFindings = validateT1EvidenceCandidate(
    settledCandidate,
    settled.snapshot.digest,
  );
  const rawAfterValidation = await validateStoredRawEvidence(settledCandidate);
  const postValidation = await snapshotInputs();
  const findings = sortFindings([
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...settled.findings,
    ...settled.controls,
    ...postValidation.findings,
    ...postValidation.controls,
    ...inspected.findings,
    ...parsedObservations.findings,
    ...rawFindings,
    ...rawAfterValidation,
    ...runtimeFindings,
    ...candidateFindings,
    ...(settled.snapshot.digest === postValidation.snapshot.digest
      ? []
      : [finding(
          "T1_EVIDENCE_INPUT_STALE",
          "input",
          "Inputs changed after final candidate validation.",
        )]),
  ]);
  const ledger: T1EvidenceLedger = {
    ...settledCandidate,
    outcome:
      findings.length === 0 &&
        validatorRun.exitCode === 0 &&
        suiteRun.exitCode === 0 &&
        traces.length === T1_EXPECTED_COUNTS.traces &&
        traces.every(({ outcome }) => outcome === "pass") &&
        mutationEvidence.outcome === "pass"
        ? "pass"
        : "fail",
    findings,
  };
  await atomicWrite(OUTPUT_PATH, stableJson(ledger));
  const postWriteRawFindings = await validateStoredRawEvidence(ledger);
  const postWrite = await snapshotInputs();
  if (
    postWrite.snapshot.digest === postValidation.snapshot.digest &&
    postWriteRawFindings.length === 0
  ) return ledger;
  const failedAfterWrite: T1EvidenceLedger = {
    ...ledger,
    input: { pre: pre.snapshot, post: postWrite.snapshot },
    outcome: "fail",
    findings: sortFindings([
      ...ledger.findings,
      ...postWriteRawFindings,
      ...postWrite.findings,
      ...postWrite.controls,
      ...(postWrite.snapshot.digest === postValidation.snapshot.digest
        ? []
        : [finding(
            "T1_EVIDENCE_INPUT_STALE",
            "input",
            "Inputs changed after the evidence ledger was written.",
          )]),
    ]),
  };
  await atomicWrite(OUTPUT_PATH, stableJson(failedAfterWrite));
  return failedAfterWrite;
}

async function checkExisting(): Promise<
  Readonly<{ outcome: Outcome; findings: readonly T1EvidenceFinding[] }>
> {
  let candidate: unknown;
  try {
    candidate = await Bun.file(OUTPUT_PATH).json() as unknown;
  } catch (error) {
    return {
      outcome: "fail",
      findings: [finding(
        "T1_EVIDENCE_LEDGER_MISSING",
        OUTPUT_PATH,
        error instanceof Error ? error.message : "Ledger is unreadable.",
      )],
    };
  }
  const current = await snapshotInputs();
  const raw = await validateStoredRawEvidence(candidate);
  const runtime = await validateCurrentRuntime(candidate);
  const settled = await snapshotInputs();
  const candidateFindings = validateT1EvidenceCandidate(
    candidate,
    settled.snapshot.digest,
  );
  const postValidation = await snapshotInputs();
  const rawAfterValidation = await validateStoredRawEvidence(candidate);
  const final = await snapshotInputs();
  const findings = sortFindings([
    ...current.findings,
    ...current.controls,
    ...raw,
    ...runtime,
    ...settled.findings,
    ...settled.controls,
    ...postValidation.findings,
    ...postValidation.controls,
    ...rawAfterValidation,
    ...final.findings,
    ...final.controls,
    ...(current.snapshot.digest === settled.snapshot.digest &&
        settled.snapshot.digest === postValidation.snapshot.digest &&
        postValidation.snapshot.digest === final.snapshot.digest
      ? []
      : [finding(
          "T1_EVIDENCE_INPUT_STALE",
          "input",
          "Inputs changed during stored evidence verification.",
        )]),
    ...candidateFindings,
  ]);
  return { outcome: findings.length === 0 ? "pass" : "fail", findings };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
      throw new Error("Usage: bun scripts/verify-t1-evidence.ts [--check]");
    }
    if (args[0] === "--check") {
      const result = await checkExisting();
      console.log(stableJson({
        schema: "changes.evidence.t1.summary.v1",
        mode: "check",
        ledgerPath: OUTPUT_PATH,
        outcome: result.outcome,
        findings: result.findings,
      }).trimEnd());
      process.exitCode = result.outcome === "pass" ? 0 : 1;
    } else {
      const evidence = await verifyT1Evidence();
      console.log(stableJson({
        schema: "changes.evidence.t1.summary.v1",
        mode: evidence.mode,
        ledgerPath: OUTPUT_PATH,
        outcome: evidence.outcome,
        runId: evidence.runId,
        tests: evidence.suite.tests,
        assertions: evidence.suite.assertions,
        tracesPassed: evidence.traces.filter(({ outcome }) => outcome === "pass").length,
        tracesRequired: evidence.traces.length,
        reviewedControlsDischarged:
          evidence.mutationEvidence.reviewedControlsDischarged,
        semanticCounterfactualsExecuted:
          evidence.mutationEvidence.semanticCounterfactualsExecuted,
        semanticCounterfactualsKilled:
          evidence.mutationEvidence.semanticCounterfactualsKilled,
        directKillerLinksKilled: evidence.mutationEvidence.directKillerLinksKilled,
        corroborativeLinksObserved:
          evidence.mutationEvidence.corroborativeLinksObserved,
        sourceMutantsExecuted: evidence.mutationEvidence.sourceMutantsExecuted,
        findings: evidence.findings,
      }).trimEnd());
      process.exitCode = evidence.outcome === "pass" ? 0 : 1;
    }
  } catch (error) {
    console.error(stableJson({
      schema: "changes.evidence.t1.summary.v1",
      outcome: "fail",
      findings: [finding(
        "T1_EVIDENCE_TOOL_FAILURE",
        OUTPUT_PATH,
        error instanceof Error ? error.message : "Unknown tool failure.",
      )],
    }).trimEnd());
    process.exitCode = 2;
  }
}
