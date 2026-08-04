import { createHash } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname } from "node:path";

import ts from "typescript";

import contractFixture from
  "../tests/fixtures/application-state/a0-application-contract.json";
import mutationFixture from
  "../tests/fixtures/application-state/mutation-controls.json";
import provenanceFixture from
  "../tests/fixtures/application-state/provenance-ledger.json";
import sequenceFixture from
  "../tests/fixtures/application-state/sequence-cases.json";
import staleFixture from
  "../tests/fixtures/application-state/stale-and-transport-cases.json";
import stateFixture from
  "../tests/fixtures/application-state/state-matrix.json";
import traceFixture from
  "../tests/fixtures/application-state/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

export type A0EvidenceFinding = Readonly<{
  code: string;
  path: string;
  message: string;
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

type JUnitSummary = Readonly<{
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

const TOOL_VERSION = "changes.evidence.a0-verifier.v1";
const OUTPUT_PATH = "test-results/a0-evidence.json";

export const A0_FOCUSED_TEST_FILES = Object.freeze([
  "tests/conformance/a0-mutation-controls.test.ts",
  "tests/conformance/a0-named-sequences.test.ts",
  "tests/conformance/a0-production-observation.test.ts",
  "tests/conformance/a0-randomized-sequences.test.ts",
  "tests/conformance/a0-stale-transport-conformance.test.ts",
  "tests/conformance/a0-state-matrix-gaps.test.ts",
  "tests/integration/a0-application-state.test.ts",
  "tests/integration/chord-command.test.ts",
  "tests/property/stable-id-reorder.test.ts",
  "tests/static/a0-contract.test.ts",
  "tests/static/a0-evidence.test.ts",
  "tests/static/a0-production-policy.test.ts",
  "tests/static/dependency-boundaries.test.ts",
  "tests/static/validated-document-cast-policy.test.ts",
  "tests/unit/a0-randomized-shards.test.ts",
] as const);

export const A0_EXPECTED_COUNTS = Object.freeze({
  stateCases: 68,
  gapCases: 35,
  staleAndTransportCases: 20,
  namedSequences: 6,
  randomizedSequences: 1_000,
  randomizedPrimaryActions: 100_000,
  randomizedReplayActions: 100_000,
  randomizedF3Revalidations: 200_000,
  mutationControls: 32,
  mutationLinks: 54,
  mutationLinkedCases: 42,
  traces: 19,
  authorities: 7,
} as const);

const RANDOM_GOLDEN = Object.freeze({
  actionLogSha256:
    "3cf17988cc3faf04e72c854f95791702835689200fdbc1ddc56efc4323dc48ea",
  outcomeLogSha256:
    "22a707714cf8c94274fae03f7b7e8948c670951d76855eb68de5f0d5eddee53c",
  sequenceDigestSha256:
    "5db507dc74f50f332f609171fdb53b1cb6020a84c10660d13ef2205f00347dc1",
  actionCounts: Object.freeze({
    "delete-event": 9_122,
    "duplicate-event": 6_236,
    "insert-event": 12_625,
    "move-event": 9_450,
    redo: 7_741,
    "set-duration-valid": 12_611,
    "set-section": 9_498,
    "set-text": 15_609,
    "set-voicing-valid": 6_322,
    undo: 10_786,
  }),
} as const);

export const A0_APPLICABILITY = Object.freeze([
  {
    id: "browser",
    applicability: "deferred:typed-application-state-has-no-rendered-surface",
    owner: "U0/Q0/R0",
    proof: "A0 publishes typed state and effects only.",
  },
  {
    id: "audio",
    applicability: "typed-handoff-only:no-audio-adapter-call",
    owner: "P0/S0/AU0",
    proof: "Transport is a token-gated view projection and history excludes it.",
  },
  {
    id: "storage",
    applicability: "typed-handoff-only:no-storage-adapter-call",
    owner: "R0/E0",
    proof: "Recovery and export checkpoints are explicit state values.",
  },
  {
    id: "cancellation",
    applicability: "covered:request-and-replacement-cancel",
    owner: "A0",
    proof: "A0-STALE-008, A0-CMD-032, A0-SEQ-006",
  },
  {
    id: "stale-revision",
    applicability: "covered:exact-request-document-revision-gate",
    owner: "A0",
    proof: "A0-STALE-004..010 and A0-SEQ-005",
  },
  {
    id: "resume",
    applicability: "not-applicable:pure-non-resumable-transition",
    owner: "A0",
    proof: "Every operation terminates synchronously by deterministic counts.",
  },
  {
    id: "wall-time-cutoff",
    applicability: "forbidden:counts-and-fixed-actions-only",
    owner: "A0",
    proof: "A0-PROP-1000; elapsed time is evidence only.",
  },
] as const);

export const A0_INPUT_GROUPS = Object.freeze({
  contracts: [
    "docs/ARCHITECTURE.md",
    "docs/A0_APPLICATION_CONTRACT.md",
    "docs/REBUILD_PLAN.md",
    "package.json",
    "bun.lock",
    "bunfig.toml",
  ],
  production: [
    "src/application/application-bookmarks.ts",
    "src/application/application-derived-patch.ts",
    "src/application/application-document-commands.ts",
    "src/application/application-history.ts",
    "src/application/application-selectors.ts",
    "src/application/application-state-contract.ts",
    "src/application/application-state-helpers.ts",
    "src/application/application-state.ts",
    "src/application/index.ts",
  ],
  authority: [
    "tests/fixtures/application-state/a0-application-contract.json",
    "tests/fixtures/application-state/mutation-controls.json",
    "tests/fixtures/application-state/provenance-ledger.json",
    "tests/fixtures/application-state/sequence-cases.json",
    "tests/fixtures/application-state/stale-and-transport-cases.json",
    "tests/fixtures/application-state/state-matrix.json",
    "tests/fixtures/application-state/trace-ledger.json",
  ],
  harness: [
    "tests/support/a0-application-fixture.ts",
    "tests/support/a0-randomized-protocol.ts",
    "tests/support/a0-randomized-shard.ts",
    "tests/support/a0-reference-model.ts",
    ...A0_FOCUSED_TEST_FILES,
  ],
  tooling: [
    "scripts/validate-a0-contract.ts",
    "scripts/verify-a0-evidence.ts",
    "scripts/verify.ts",
    "tsconfig.app.json",
    "tsconfig.base.json",
    "tsconfig.tests.json",
    "tsconfig.tools.json",
    "eslint.config.mjs",
  ],
} as const);

const OBSERVATION_MARKERS = Object.freeze({
  production: "A0_PRODUCTION_OBSERVATION ",
  gaps: "A0_STATE_GAP_OBSERVATION ",
  stale: "A0_STALE_TRANSPORT_OBSERVATION ",
  named: "A0_NAMED_SEQUENCE_OBSERVATION ",
  random: "A0_RANDOM_OBSERVATION ",
  mutation: "A0_MUTATION_OBSERVATION ",
  static: "A0_STATIC_OBSERVATION ",
} as const);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
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

export function stableA0EvidenceJson(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

export function a0EvidenceDigest(value: unknown): string {
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

function finding(code: string, path: string, message: string): A0EvidenceFinding {
  return Object.freeze({ code, path, message });
}

function exactStrings(actual: unknown, expected: readonly string[]): boolean {
  return JSON.stringify(strings(actual)) === JSON.stringify(expected);
}

function exactDigestMap(value: unknown, expectedKeys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return (
    JSON.stringify(Object.keys(value).sort(compare)) ===
      JSON.stringify([...expectedKeys].sort(compare)) &&
    Object.values(value).every(isSha256)
  );
}

function fixtureIds(
  fixture: Readonly<{ cases: readonly Readonly<{ id: string }>[] }>,
): readonly string[] {
  return fixture.cases.map(({ id }) => id);
}

function mutationIds(): readonly string[] {
  return mutationFixture.controls.map(({ id }) => id);
}

function mutationLinks(): readonly Readonly<{
  controlId: string;
  caseId: string;
}>[] {
  return mutationFixture.controls.flatMap(({ id, killerCaseIds }) =>
    killerCaseIds.map((caseId) => ({ controlId: id, caseId }))
  );
}

function expectedGapIds(): readonly string[] {
  return Object.freeze([
    "A0-ATOMIC-001", "A0-ATOMIC-002", "A0-CMD-002", "A0-CMD-006",
    "A0-CMD-008", "A0-CMD-010", "A0-CMD-012", "A0-CMD-013",
    "A0-CMD-014", "A0-CMD-015", "A0-CMD-018", "A0-CMD-026",
    "A0-CMD-027", "A0-CMD-029", "A0-CMD-032", "A0-CMD-033",
    "A0-CMD-035", "A0-CMD-036", "A0-CMD-037", "A0-CMD-039",
    "A0-CMD-040", "A0-CMD-041", "A0-CMD-042", "A0-INIT-002",
    "A0-UI-001", "A0-UI-003", "A0-UI-004", "A0-UI-007",
    "A0-UI-008", "A0-UI-009", "A0-UI-010", "A0-UI-011",
    "A0-UI-012", "A0-UI-013", "A0-UI-014",
  ]);
}

function validateProduction(value: JsonRecord): A0EvidenceFinding[] {
  const ids = fixtureIds(stateFixture);
  const owners = value["caseOwners"];
  const ownerRows = isRecord(owners) ? Object.values(owners) : [];
  const ownersValid =
    isRecord(owners) &&
    JSON.stringify(Object.keys(owners).sort(compare)) ===
      JSON.stringify([...ids].sort(compare)) &&
    ownerRows.every((item) =>
      isRecord(item) &&
      typeof item["file"] === "string" &&
      typeof item["testcase"] === "string"
    );
  if (
    value["schema"] !==
      "changes.evidence.a0-production-conformance-observation.v1" ||
    !exactStrings(value["stateCaseIds"], ids) ||
    value["stateCasesObserved"] !== A0_EXPECTED_COUNTS.stateCases ||
    !exactDigestMap(value["caseHashes"], ids) ||
    !ownersValid ||
    value["runtimeOwnerTestCount"] !== 21 ||
    value["authoritativePartialMutations"] !== 0 ||
    value["mutableInputAliases"] !== 0 ||
    value["wallTimeSemanticCutoff"] !== false ||
    value["status"] !== "pass"
  ) {
    return [finding(
      "A0_EVIDENCE_PRODUCTION",
      "observations.production",
      "All 68 state cases must bind exact runtime owners and SHA-256 evidence.",
    )];
  }
  return [];
}

function validateGaps(value: JsonRecord): A0EvidenceFinding[] {
  const ids = expectedGapIds();
  if (
    value["schema"] !==
      "changes.evidence.a0-state-matrix-gap-observation.v1" ||
    !exactStrings(value["caseIds"], ids) ||
    !exactDigestMap(value["caseHashes"], ids) ||
    value["casesObserved"] !== A0_EXPECTED_COUNTS.gapCases ||
    value["authoritativePartialMutations"] !== 0 ||
    value["wallTimeSemanticCutoff"] !== false ||
    value["status"] !== "pass"
  ) {
    return [finding(
      "A0_EVIDENCE_GAPS",
      "observations.gaps",
      "All 35 independently executed state-matrix gap cases are required.",
    )];
  }
  return [];
}

function validateStale(value: JsonRecord): A0EvidenceFinding[] {
  const ids = fixtureIds(staleFixture);
  if (
    value["schema"] !==
      "changes.evidence.a0-stale-transport-observation.v1" ||
    !exactStrings(value["caseIds"], ids) ||
    !exactDigestMap(value["caseHashes"], ids) ||
    value["casesObserved"] !== A0_EXPECTED_COUNTS.staleAndTransportCases ||
    value["ignoredStaleCases"] !== 10 ||
    value["refusalCases"] !== 4 ||
    value["positiveOrCancellationCases"] !== 6 ||
    value["exactStateIdentityChecks"] !== 10 ||
    value["status"] !== "pass"
  ) {
    return [finding(
      "A0_EVIDENCE_STALE",
      "observations.stale",
      "All 20 exact request and transport token cases are required.",
    )];
  }
  return [];
}

function validateNamed(value: JsonRecord): A0EvidenceFinding[] {
  const ids = sequenceFixture.namedSequences.map(({ id }) => id);
  if (
    value["schema"] !==
      "changes.evidence.a0-named-sequences-observation.v1" ||
    !exactStrings(value["sequenceIds"], ids) ||
    !exactDigestMap(value["sequenceHashes"], ids) ||
    value["sequencesObserved"] !== A0_EXPECTED_COUNTS.namedSequences ||
    value["totalActions"] !== 29 ||
    value["exactReferenceRestorations"] !== 3 ||
    value["stalePublications"] !== 0 ||
    value["status"] !== "pass"
  ) {
    return [finding(
      "A0_EVIDENCE_NAMED",
      "observations.named",
      "All six reviewed multi-step sequences must execute exactly.",
    )];
  }
  return [];
}

function validateRandom(value: JsonRecord): A0EvidenceFinding[] {
  if (
    value["schema"] !==
      "changes.evidence.a0-randomized-sequences-observation.v1" ||
    value["protocolId"] !== "A0-PROP-1000" ||
    value["rootSeedHex"] !== "0x4348414e47455332" ||
    value["seedAlgorithm"] !== "splitmix64" ||
    value["sequencesExecuted"] !== A0_EXPECTED_COUNTS.randomizedSequences ||
    value["actionsPerSequence"] !== 100 ||
    value["primaryActionsExecuted"] !==
      A0_EXPECTED_COUNTS.randomizedPrimaryActions ||
    value["replayActionsExecuted"] !==
      A0_EXPECTED_COUNTS.randomizedReplayActions ||
    value["f3Revalidations"] !==
      A0_EXPECTED_COUNTS.randomizedF3Revalidations ||
    value["oracleComparisons"] !== 1_000_000 ||
    value["deterministicReplays"] !== 1_000 ||
    value["maximumEvents"] !== 64 ||
    value["failureLogs"] !== 0 ||
    value["wallTimeSemanticCutoff"] !== false ||
    value["actionLogSha256"] !== RANDOM_GOLDEN.actionLogSha256 ||
    value["outcomeLogSha256"] !== RANDOM_GOLDEN.outcomeLogSha256 ||
    value["sequenceDigestSha256"] !== RANDOM_GOLDEN.sequenceDigestSha256 ||
    JSON.stringify(canonical(value["actionCounts"])) !==
      JSON.stringify(canonical(RANDOM_GOLDEN.actionCounts)) ||
    value["status"] !== "pass"
  ) {
    return [finding(
      "A0_EVIDENCE_RANDOM",
      "observations.random",
      "The fixed 1000x100 primary/replay model protocol and golden digests must match exactly.",
    )];
  }
  return [];
}

function validateMutation(value: JsonRecord): A0EvidenceFinding[] {
  const ids = mutationIds();
  const links = mutationLinks();
  const linked = [...new Set(links.map(({ caseId }) => caseId))].sort(compare);
  const executions = Array.isArray(value["counterfactualExecutions"])
    ? value["counterfactualExecutions"]
    : [];
  const executionKeys = executions.map((item) => {
    if (!isRecord(item)) return "invalid";
    return `${String(item["controlId"])}\u0000${String(item["caseId"])}`;
  });
  const expectedKeys = links.map(({ controlId, caseId }) =>
    `${controlId}\u0000${caseId}`
  );
  const executionsValid =
    JSON.stringify(executionKeys) === JSON.stringify(expectedKeys) &&
    executions.every((item) =>
      isRecord(item) &&
      item["killed"] === true &&
      Array.isArray(item["changedFields"]) &&
      item["changedFields"].length > 0 &&
      isSha256(item["beforeSha256"]) &&
      isSha256(item["afterSha256"]) &&
      item["beforeSha256"] !== item["afterSha256"]
    );
  if (
    value["schema"] !==
      "changes.evidence.a0-mutation-conformance-observation.v1" ||
    value["claim"] !== "executable-semantic-counterfactuals-not-source-mutants" ||
    !exactStrings(value["controlIds"], ids) ||
    value["controlsDefined"] !== A0_EXPECTED_COUNTS.mutationControls ||
    value["semanticOperatorsExecuted"] !== A0_EXPECTED_COUNTS.mutationControls ||
    value["semanticOperatorsKilled"] !== A0_EXPECTED_COUNTS.mutationControls ||
    value["semanticOperatorsSurvived"] !== 0 ||
    value["reviewedKillerLinks"] !== A0_EXPECTED_COUNTS.mutationLinks ||
    value["killerLinksExecuted"] !== A0_EXPECTED_COUNTS.mutationLinks ||
    value["killerLinksKilled"] !== A0_EXPECTED_COUNTS.mutationLinks ||
    value["killerLinksSurvived"] !== 0 ||
    value["sourceMutantsExecuted"] !== 0 ||
    value["sourceMutantsKilled"] !== 0 ||
    !exactStrings(value["linkedCaseIds"], linked) ||
    value["linkedCasesObserved"] !== A0_EXPECTED_COUNTS.mutationLinkedCases ||
    value["mappedButUnobserved"] !== 0 ||
    !exactDigestMap(value["controlExecutionDigests"], ids) ||
    !executionsValid ||
    value["status"] !== "pass"
  ) {
    return [finding(
      "A0_EVIDENCE_MUTATION",
      "observations.mutation",
      "All 32 operators and 54 reviewed killer links must execute and be killed.",
    )];
  }
  return [];
}

function validateStatic(value: JsonRecord): A0EvidenceFinding[] {
  const production = A0_INPUT_GROUPS.production.filter((path) =>
    path.includes("application-") && path !== "src/application/index.ts"
  );
  if (
    value["schema"] !==
      "changes.evidence.a0-static-boundary-observation.v1" ||
    !exactStrings(value["productionFiles"], production) ||
    !exactDigestMap(value["productionFileDigests"], production) ||
    value["jsonHistorySerializationReferences"] !== 0 ||
    value["wallClockSemanticReferences"] !== 0 ||
    value["runtimeAiOrNetworkReferences"] !== 0 ||
    value["referenceModel"] !== "tests/support/a0-reference-model.ts" ||
    !exactStrings(value["referenceModelImports"], []) ||
    value["referenceModelProductionImports"] !== 0 ||
    value["validatedDocumentCastSitesOutsideF3"] !== 0 ||
    !exactStrings(value["forbiddenRuntimeReferences"], []) ||
    value["status"] !== "pass"
  ) {
    return [finding(
      "A0_EVIDENCE_STATIC",
      "observations.static",
      "A0 production and the independent reference model must retain exact static boundaries.",
    )];
  }
  return [];
}

export function validateA0ObservationRecords(
  observations: Readonly<Partial<
    Record<keyof typeof OBSERVATION_MARKERS, JsonRecord>
  >>,
): readonly A0EvidenceFinding[] {
  return [
    ...validateProduction(observations.production ?? {}),
    ...validateGaps(observations.gaps ?? {}),
    ...validateStale(observations.stale ?? {}),
    ...validateNamed(observations.named ?? {}),
    ...validateRandom(observations.random ?? {}),
    ...validateMutation(observations.mutation ?? {}),
    ...validateStatic(observations.static ?? {}),
  ].sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
}

export function parseA0Observations(output: string): Readonly<{
  observations: Partial<Record<keyof typeof OBSERVATION_MARKERS, JsonRecord>>;
  findings: readonly A0EvidenceFinding[];
}> {
  const parsed: Partial<Record<keyof typeof OBSERVATION_MARKERS, JsonRecord>> = {};
  const findings: A0EvidenceFinding[] = [];
  for (const [kind, marker] of Object.entries(OBSERVATION_MARKERS) as Array<
    [keyof typeof OBSERVATION_MARKERS, string]
  >) {
    const lines = output.split(/\r?\n/u).filter((line) => line.startsWith(marker));
    if (lines.length !== 1) {
      findings.push(finding(
        "A0_EVIDENCE_OBSERVATION_INVENTORY",
        `observations.${kind}`,
        `Expected exactly one ${kind} observation, received ${String(lines.length)}.`,
      ));
      continue;
    }
    try {
      const line = lines[0];
      if (line === undefined) throw new Error("missing observation line");
      parsed[kind] = record(JSON.parse(line.slice(marker.length)), kind);
    } catch (error) {
      findings.push(finding(
        "A0_EVIDENCE_OBSERVATION_JSON",
        `observations.${kind}`,
        error instanceof Error ? error.message : "Invalid observation JSON.",
      ));
    }
  }
  const complete = Object.keys(OBSERVATION_MARKERS).every((key) =>
    parsed[key as keyof typeof OBSERVATION_MARKERS] !== undefined
  );
  if (complete) {
    findings.push(...validateA0ObservationRecords(parsed));
  }
  return { observations: parsed, findings };
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

export function inspectA0JUnit(xml: string): Readonly<{
  summary: JUnitSummary | null;
  findings: readonly A0EvidenceFinding[];
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
    const errors = Number(root.get("errors") ?? "0");
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
        "A0_EVIDENCE_JUNIT",
        "suite.junit",
        error instanceof Error ? error.message : "Invalid JUnit.",
      )],
    };
  }
}

export function sanitizeA0JUnit(xml: string): string {
  const sanitized = xml.replace(
    /(<testsuite\b[^>]*?)\s+hostname\s*=\s*(?:"[^"]*"|'[^']*')/gu,
    "$1",
  );
  if (/\bhostname\s*=/u.test(sanitized)) {
    throw new Error("A0_EVIDENCE_JUNIT_HOSTNAME");
  }
  return sanitized;
}

export function inspectA0TestControls(
  path: string,
  source: string,
): readonly A0EvidenceFinding[] {
  const findings: A0EvidenceFinding[] = [];
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
      report(node, "A0_EVIDENCE_QUARANTINE", "x-prefixed test is forbidden.");
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
          ? "A0_EVIDENCE_TODO"
          : "A0_EVIDENCE_QUARANTINE",
        `Forbidden ${node.name.text} test control.`,
      );
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        /^(?:quarantine|quarantined)$/u.test(node.expression.text)
      ) {
        report(node, "A0_EVIDENCE_QUARANTINE", "Quarantine is forbidden.");
      }
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            property.name.getText(parsed).replaceAll(/["']/gu, "") === "retry"
          ) {
            report(property, "A0_EVIDENCE_RETRY", "Per-test retry is forbidden.");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return findings;
}

function observationRecord(
  observations: Partial<Record<keyof typeof OBSERVATION_MARKERS, JsonRecord>>,
  key: keyof typeof OBSERVATION_MARKERS,
): JsonRecord {
  return observations[key] ?? {};
}

export function buildA0TraceEvidence(
  observations: Partial<Record<keyof typeof OBSERVATION_MARKERS, JsonRecord>>,
): readonly JsonRecord[] {
  const production = observationRecord(observations, "production");
  const gaps = observationRecord(observations, "gaps");
  const stale = observationRecord(observations, "stale");
  const named = observationRecord(observations, "named");
  const random = observationRecord(observations, "random");
  const mutation = observationRecord(observations, "mutation");
  const caseHashes: JsonRecord = {
    ...(isRecord(production["caseHashes"]) ? production["caseHashes"] : {}),
    ...(isRecord(gaps["caseHashes"]) ? gaps["caseHashes"] : {}),
    ...(isRecord(stale["caseHashes"]) ? stale["caseHashes"] : {}),
    ...(isRecord(named["sequenceHashes"]) ? named["sequenceHashes"] : {}),
    "A0-PROP-1000": random["sequenceDigestSha256"],
  };
  const controlHashes = isRecord(mutation["controlExecutionDigests"])
    ? mutation["controlExecutionDigests"]
    : {};
  return traceFixture.traces.map((trace) => {
    const missingCaseIds = trace.caseIds.filter((id) => !isSha256(caseHashes[id]));
    const missingControlIds = trace.controlIds.filter((id) =>
      !isSha256(controlHashes[id])
    );
    return {
      id: trace.id,
      requirement: trace.requirement,
      caseIds: trace.caseIds,
      controlIds: trace.controlIds,
      caseEvidenceSha256: Object.fromEntries(
        trace.caseIds.filter((id) => isSha256(caseHashes[id])).map((id) => [
          id,
          caseHashes[id],
        ]),
      ),
      controlEvidenceSha256: Object.fromEntries(
        trace.controlIds.filter((id) => isSha256(controlHashes[id])).map((id) => [
          id,
          controlHashes[id],
        ]),
      ),
      missingCaseIds,
      missingControlIds,
      outcome:
        missingCaseIds.length === 0 && missingControlIds.length === 0
          ? "pass"
          : "fail",
    };
  });
}

function validateRuntimeOwners(
  production: JsonRecord,
  junit: JUnitSummary | null,
): readonly A0EvidenceFinding[] {
  if (junit === null || !Array.isArray(production["runtimeOwnerTests"])) {
    return [finding(
      "A0_EVIDENCE_RUNTIME_OWNER",
      "observations.production.runtimeOwnerTests",
      "Runtime owners require a valid JUnit inventory.",
    )];
  }
  const findings: A0EvidenceFinding[] = [];
  for (const item of production["runtimeOwnerTests"]) {
    if (!isRecord(item)) {
      findings.push(finding(
        "A0_EVIDENCE_RUNTIME_OWNER",
        "observations.production.runtimeOwnerTests",
        "Runtime owner row is malformed.",
      ));
      continue;
    }
    const file = item["file"];
    const testcase = item["testcase"];
    if (
      typeof file !== "string" ||
      typeof testcase !== "string" ||
      !junit.cases.some((candidate) =>
        candidate.file === file && candidate.name.includes(testcase)
      )
    ) {
      findings.push(finding(
        "A0_EVIDENCE_RUNTIME_OWNER",
        `${String(file)}#${String(testcase)}`,
        "Mapped runtime owner did not execute in the exact focused JUnit suite.",
      ));
    }
  }
  return findings;
}

function environment(runId: string): Readonly<Record<string, string>> {
  return Object.freeze({
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    A0_EVIDENCE_RUN_ID: runId,
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

function paths(runId: string) {
  const directory = `test-results/a0/${runId}`;
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

function suiteCommand(runId: string): readonly string[] {
  return Object.freeze([
    "bun",
    "test",
    ...A0_FOCUSED_TEST_FILES,
    "--max-concurrency=1",
    "--retry=0",
    "--reporter=junit",
    `--reporter-outfile=${paths(runId).junit}`,
  ]);
}

function validatorCommand(): readonly string[] {
  return Object.freeze(["bun", "scripts/validate-a0-contract.ts"]);
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
  runEnvironment: Readonly<Record<string, string>>,
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
    env: { ...process.env, ...runEnvironment },
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
    environment: runEnvironment,
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

async function snapshotInputs(): Promise<Readonly<{
  snapshot: InputSnapshot;
  findings: readonly A0EvidenceFinding[];
  controls: readonly A0EvidenceFinding[];
}>> {
  const pathsByGroup = new Map<string, string>();
  const findings: A0EvidenceFinding[] = [];
  const controls: A0EvidenceFinding[] = [];
  for (const [group, groupPaths] of Object.entries(A0_INPUT_GROUPS)) {
    for (const path of groupPaths) {
      if (pathsByGroup.has(path)) {
        findings.push(finding(
          "A0_EVIDENCE_INPUT_DUPLICATE",
          path,
          `Input appears in ${String(pathsByGroup.get(path))} and ${group}.`,
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
        "A0_EVIDENCE_INPUT_MISSING",
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
      controls.push(...inspectA0TestControls(
        path,
        new TextDecoder().decode(bytes),
      ));
    }
    if (
      path === "bunfig.toml" &&
      !/^retry\s*=\s*0\s*$/mu.test(new TextDecoder().decode(bytes))
    ) {
      controls.push(finding(
        "A0_EVIDENCE_RETRY",
        "bunfig.toml:[test].retry",
        "Focused A0 evidence requires retry = 0.",
      ));
    }
  }
  return {
    snapshot: {
      algorithm: "sha256-component-manifest-v1",
      digest: a0EvidenceDigest(components),
      components,
    },
    findings,
    controls,
  };
}

function parseValidatorOutput(output: string): Readonly<{
  value: JsonRecord | null;
  findings: readonly A0EvidenceFinding[];
}> {
  try {
    const value = record(JSON.parse(output), "validator output");
    const counts = record(value["counts"], "validator counts");
    if (
      value["schema"] !== "changes.validation.a0-contract.v1" ||
      value["package"] !== "A0" ||
      value["outcome"] !== "pass" ||
      counts["stateCases"] !== A0_EXPECTED_COUNTS.stateCases ||
      counts["staleAndTransportCases"] !==
        A0_EXPECTED_COUNTS.staleAndTransportCases ||
      counts["namedSequences"] !== A0_EXPECTED_COUNTS.namedSequences ||
      counts["randomizedSequences"] !== A0_EXPECTED_COUNTS.randomizedSequences ||
      counts["mutationControls"] !== A0_EXPECTED_COUNTS.mutationControls ||
      counts["traces"] !== A0_EXPECTED_COUNTS.traces ||
      counts["authorities"] !== A0_EXPECTED_COUNTS.authorities ||
      !Array.isArray(value["findings"]) ||
      value["findings"].length !== 0
    ) throw new Error("validator identity or counts are not exact");
    return { value, findings: [] };
  } catch (error) {
    return {
      value: null,
      findings: [finding(
        "A0_EVIDENCE_VALIDATOR_OUTPUT",
        "validator.stdout",
        error instanceof Error ? error.message : "Invalid validator output.",
      )],
    };
  }
}

function expectedRunId(inputDigest: string): string {
  return a0EvidenceDigest({
    toolVersion: TOOL_VERSION,
    inputDigest,
    contractVersion: contractFixture.contractVersion,
  }).slice(0, 24);
}

export function validateA0EvidenceCandidate(
  candidate: unknown,
  currentInputDigest: string,
): readonly A0EvidenceFinding[] {
  if (!isRecord(candidate)) {
    return [finding(
      "A0_EVIDENCE_LEDGER_SHAPE",
      OUTPUT_PATH,
      "Evidence ledger must be an object.",
    )];
  }
  const findings: A0EvidenceFinding[] = [];
  if (
    candidate["schema"] !== "changes.evidence.a0.v1" ||
    candidate["schemaVersion"] !== 1 ||
    candidate["package"] !== "A0" ||
    candidate["toolVersion"] !== TOOL_VERSION ||
    candidate["outcome"] !== "pass" ||
    !Array.isArray(candidate["findings"]) ||
    candidate["findings"].length !== 0
  ) {
    findings.push(finding(
      "A0_EVIDENCE_LEDGER_IDENTITY",
      OUTPUT_PATH,
      "Evidence identity or passing status is invalid.",
    ));
  }
  const runId = expectedRunId(currentInputDigest);
  if (candidate["runId"] !== runId) {
    findings.push(finding(
      "A0_EVIDENCE_RUN_ID",
      `${OUTPUT_PATH}#runId`,
      "Run ID must derive from current inputs and contract version.",
    ));
  }
  const input = candidate["input"];
  if (
    !isRecord(input) ||
    !isRecord(input["pre"]) ||
    !isRecord(input["post"]) ||
    input["pre"]["digest"] !== currentInputDigest ||
    input["post"]["digest"] !== currentInputDigest
  ) {
    findings.push(finding(
      "A0_EVIDENCE_INPUT_STALE",
      `${OUTPUT_PATH}#input`,
      "Pre, post, and current input snapshots must match.",
    ));
  }
  if (
    JSON.stringify(canonical(candidate["applicability"])) !==
      JSON.stringify(canonical(A0_APPLICABILITY))
  ) {
    findings.push(finding(
      "A0_EVIDENCE_APPLICABILITY",
      `${OUTPUT_PATH}#applicability`,
      "Applicability and downstream ownership drifted.",
    ));
  }
  const suite = candidate["suite"];
  if (
    !isRecord(suite) ||
    suite["exitCode"] !== 0 ||
    suite["failures"] !== 0 ||
    suite["errors"] !== 0 ||
    suite["skipped"] !== 0 ||
    suite["retries"] !== 0 ||
    suite["quarantined"] !== 0 ||
    JSON.stringify(suite["files"]) !== JSON.stringify(A0_FOCUSED_TEST_FILES)
  ) {
    findings.push(finding(
      "A0_EVIDENCE_SUITE",
      `${OUTPUT_PATH}#suite`,
      "Exact focused suite must pass with no relaxed controls.",
    ));
  }
  const validator = candidate["validator"];
  if (
    !isRecord(validator) ||
    validator["exitCode"] !== 0 ||
    validator["outcome"] !== "pass"
  ) {
    findings.push(finding(
      "A0_EVIDENCE_VALIDATOR",
      `${OUTPUT_PATH}#validator`,
      "Independent A0 contract validation must pass.",
    ));
  }
  const observations = candidate["observations"];
  if (!isRecord(observations)) {
    findings.push(finding(
      "A0_EVIDENCE_OBSERVATIONS",
      `${OUTPUT_PATH}#observations`,
      "All seven observation records are required.",
    ));
  } else {
    findings.push(...validateA0ObservationRecords(observations));
  }
  if (
    !Array.isArray(candidate["traces"]) ||
    candidate["traces"].length !== A0_EXPECTED_COUNTS.traces ||
    candidate["traces"].some((item) =>
      !isRecord(item) || item["outcome"] !== "pass"
    )
  ) {
    findings.push(finding(
      "A0_EVIDENCE_TRACES",
      `${OUTPUT_PATH}#traces`,
      "All 18 trace clauses require complete case and mutation evidence.",
    ));
  }
  const authorityIds = provenanceFixture.authorities.map(({ id }) => id);
  if (!exactStrings(candidate["authorityIds"], authorityIds)) {
    findings.push(finding(
      "A0_EVIDENCE_AUTHORITIES",
      `${OUTPUT_PATH}#authorityIds`,
      "All seven reviewed authorities must remain bound.",
    ));
  }
  const semanticDigest = candidate["semanticDigest"];
  const payload = Object.fromEntries(
    Object.entries(candidate).filter(([key]) => key !== "semanticDigest"),
  );
  if (semanticDigest !== a0EvidenceDigest(payload)) {
    findings.push(finding(
      "A0_EVIDENCE_DIGEST",
      `${OUTPUT_PATH}#semanticDigest`,
      "Ledger digest does not bind its canonical payload.",
    ));
  }
  return findings.sort((left, right) => compare(
    `${left.code}\u0000${left.path}`,
    `${right.code}\u0000${right.path}`,
  ));
}

async function verifyA0Evidence(): Promise<JsonRecord> {
  const pre = await snapshotInputs();
  const runId = expectedRunId(pre.snapshot.digest);
  const runPaths = paths(runId);
  await mkdir(runPaths.directory, { recursive: true });
  const runEnvironment = environment(runId);
  const metadata = {
    schema: "changes.evidence.a0.run-metadata.v1",
    runId,
    commands: {
      validator: validatorCommand(),
      suite: suiteCommand(runId),
    },
    environment: runEnvironment,
    inputDigest: pre.snapshot.digest,
  };
  await atomicWrite(runPaths.metadata, stableA0EvidenceJson(metadata));
  const validatorRun = await runRaw(
    validatorCommand(),
    runEnvironment,
    runPaths.validatorStdout,
    runPaths.validatorStderr,
  );
  const validatorParsed = parseValidatorOutput(
    new TextDecoder().decode(validatorRun.stdout),
  );
  const suiteRun = await runRaw(
    suiteCommand(runId),
    runEnvironment,
    runPaths.stdout,
    runPaths.stderr,
  );
  const rawJunit = await Bun.file(runPaths.junit).text();
  const junit = sanitizeA0JUnit(rawJunit);
  await atomicWrite(runPaths.junit, junit);
  const inspected = inspectA0JUnit(junit);
  const parsedObservations = parseA0Observations(
    new TextDecoder().decode(suiteRun.stdout),
  );
  const post = await snapshotInputs();
  const traces = buildA0TraceEvidence(parsedObservations.observations);
  const summary = inspected.summary;
  const production = parsedObservations.observations.production ?? {};
  const structuralFindings = [
    ...pre.findings,
    ...pre.controls,
    ...post.findings,
    ...post.controls,
    ...validatorParsed.findings,
    ...inspected.findings,
    ...parsedObservations.findings,
    ...validateRuntimeOwners(production, summary),
    ...(pre.snapshot.digest === post.snapshot.digest
      ? []
      : [finding(
          "A0_EVIDENCE_INPUT_CHANGED",
          "input",
          "Evidence inputs changed during execution.",
        )]),
    ...(validatorRun.exitCode === 0
      ? []
      : [finding(
          "A0_EVIDENCE_VALIDATOR_EXIT",
          "validator",
          `Validator exited ${String(validatorRun.exitCode)}.`,
        )]),
    ...(suiteRun.exitCode === 0
      ? []
      : [finding(
          "A0_EVIDENCE_SUITE_EXIT",
          "suite",
          `Focused suite exited ${String(suiteRun.exitCode)}.`,
        )]),
    ...(summary !== null &&
        summary.failures === 0 &&
        summary.errors === 0 &&
        summary.skipped === 0 &&
        JSON.stringify(summary.files) === JSON.stringify(A0_FOCUSED_TEST_FILES)
      ? []
      : [finding(
          "A0_EVIDENCE_SUITE_SUMMARY",
          "suite.junit",
          "JUnit must contain the exact focused files with zero failure, error, or skip.",
        )]),
    ...traces.filter((trace) => trace["outcome"] !== "pass").map((trace) =>
      finding(
        "A0_EVIDENCE_TRACE",
        `traces#${String(trace["id"])}`,
        "Trace is missing required case or mutation evidence.",
      )
    ),
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
    schema: "changes.evidence.a0.v1",
    schemaVersion: 1,
    package: "A0",
    toolVersion: TOOL_VERSION,
    runId,
    outcome: uniqueFindings.length === 0 ? "pass" : "fail",
    findings: uniqueFindings,
    environment: environmentEvidence(),
    applicability: A0_APPLICABILITY,
    input: { pre: pre.snapshot, post: post.snapshot },
    validator: validatorRecord,
    suite: suiteRecord,
    observations: parsedObservations.observations,
    traces,
    authorityIds: provenanceFixture.authorities.map(({ id }) => id),
    runMetadata: {
      path: runPaths.metadata,
      sha256: sha256Bytes(
        new Uint8Array(await Bun.file(runPaths.metadata).arrayBuffer()),
      ),
    },
  };
  return { ...payload, semanticDigest: a0EvidenceDigest(payload) };
}

if (import.meta.main) {
  const evidence = await verifyA0Evidence();
  await atomicWrite(OUTPUT_PATH, stableA0EvidenceJson(evidence));
  const current = await snapshotInputs();
  const findings = [
    ...current.findings,
    ...current.controls,
    ...validateA0EvidenceCandidate(evidence, current.snapshot.digest),
  ];
  console.log(stableA0EvidenceJson({
    schema: "changes.evidence.a0-verification-result.v1",
    package: "A0",
    outcome: findings.length === 0 ? "pass" : "fail",
    runId: evidence["runId"],
    evidencePath: OUTPUT_PATH,
    counts: {
      stateCases: A0_EXPECTED_COUNTS.stateCases,
      staleAndTransportCases: A0_EXPECTED_COUNTS.staleAndTransportCases,
      namedSequences: A0_EXPECTED_COUNTS.namedSequences,
      randomizedPrimaryActions: A0_EXPECTED_COUNTS.randomizedPrimaryActions,
      randomizedReplayActions: A0_EXPECTED_COUNTS.randomizedReplayActions,
      randomizedF3Revalidations: A0_EXPECTED_COUNTS.randomizedF3Revalidations,
      mutationControls: A0_EXPECTED_COUNTS.mutationControls,
      mutationLinks: A0_EXPECTED_COUNTS.mutationLinks,
      traces: A0_EXPECTED_COUNTS.traces,
      authorities: A0_EXPECTED_COUNTS.authorities,
    },
    findings,
  }));
  if (findings.length > 0) process.exitCode = 1;
}
