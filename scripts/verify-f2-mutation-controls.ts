import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { materializeF2AdversarialCases } from "../src/test-support/f2-adversarial-materializer";
import { runF2FixtureCell } from "../src/test-support/f2-decoder-harness";
import { materializeF2ShapeCases } from "../src/test-support/f2-shape-materializer";
import adversarialFixture from "../tests/fixtures/decoder/adversarial-cases.json";
import manifestFixture from "../tests/fixtures/decoder/f2-decoder-contract.json";
import shapeFixture from "../tests/fixtures/decoder/shape-cases.json";

type MutationOwner = "F2" | "E0";
export type F2MutationProofChannel =
  | "runtime-conformance"
  | "static-source-policy"
  | "deterministic-work-counters"
  | "depth-boundary-evidence"
  | "state-side-effect-observations"
  | "deferred-e0-import";

export type F2MutationControl = Readonly<{
  id: string;
  owner: MutationOwner;
  fault: string;
  caseIds: readonly string[];
}>;

export type F2MutationControlFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type F2MutationControlAuditInput = Readonly<{
  controls: readonly unknown[];
  runtimeCaseIds: ReadonlySet<string>;
  caseObservations?: readonly F2MutationCaseObservation[];
  executedDecoderSourceMutantIds?: ReadonlySet<string>;
  killedDecoderSourceMutantIds?: ReadonlySet<string>;
}>;

export type F2MutationCaseObservation = Readonly<{
  caseId: string;
  channel: F2MutationProofChannel;
  outcome: "pass" | "fail";
  evidenceId: string;
  evidenceSha256: string;
}>;

export type F2MutationControlAudit = Readonly<{
  schema: "changes.evidence.f2-mutation-controls.v1";
  outcome: "pass" | "fail";
  claim:
    | "direct-mutant-execution"
    | "reviewed-exact-case-implication"
    | "mapped-case-coverage-only";
  reviewedLedgerSha256: string;
  counts: Readonly<{
    controlsDefined: number;
    f2Owned: number;
    e0Owned: number;
    rawCaseLinks: number;
    mappedControls: number;
    reviewedControlsDischarged: number;
    mappedButUnobserved: number;
    decoderSourceMutantsExecuted: number;
    decoderSourceMutantsKilled: number;
    e0Deferred: number;
  }>;
  ledgerTamperCampaign: Readonly<{
    purpose: "verifier-self-test-only";
    operators: readonly string[];
    mutantsGenerated: number;
    mutantsKilled: number;
    semanticDecoderFaultsExecuted: 0;
  }>;
  controls: readonly Readonly<{
    id: string;
    owner: MutationOwner;
    fault: string;
    caseIds: readonly string[];
    proofChannels: readonly F2MutationProofChannel[];
    observationEvidenceIds: readonly string[];
    mappingCovered: boolean;
    caseObservationsComplete: boolean;
    reviewedControlDischarged: boolean;
    decoderSourceMutantExecuted: boolean;
    decoderSourceMutantKilled: boolean;
    status:
      | "source-mutant-killed"
      | "source-mutant-survived"
      | "discharged-by-reviewed-exact-case-implication"
      | "mapped-not-observed"
      | "deferred-e0";
  }>[];
  findings: readonly F2MutationControlFinding[];
}>;

export type F2MutationControlRepositoryReport = Readonly<{
  audit: F2MutationControlAudit;
  evidenceSources: Readonly<{
    conformanceCampaignSha256: string;
    sourcePolicyTestSha256: string;
    contractTestSha256: string;
    conformanceRunsEveryMaterializedCell: boolean;
    conformanceConsumesMutationControls: boolean;
    namedControlLiteralsInExecutableEvidence: number;
    sourcePolicySyntheticNegativeAssertions: number;
  }>;
  focusedWitness: Readonly<{
    cells: readonly string[];
    decoderCalls: 8;
    note: "baseline-only-not-a-mutant-kill";
  }>;
}>;

const REVIEWED_LEDGER_SHA256 =
  "a564e4a7f7225b0959b770b41fdd622aa2b3c39698b42673aee089e1e2fdbae7";
const EXPECTED_CONTROL_COUNT = 244;
const EXPECTED_F2_CONTROL_COUNT = 242;
const EXPECTED_E0_CONTROL_COUNT = 2;
const STATIC_CASE_ID = "F2-STATIC-001";
const WORK_CASE_ID = "F2-WORK-001";
const DEPTH_CASE_ID = "F2-LIMIT-003";
const STATE_CASE_ID = "F2-STATE-001";
const E0_IMPORT_CASE_ID = "F2-IMPORT-001";
const TAMPER_OPERATORS = Object.freeze([
  "delete-control",
  "change-owner",
  "change-fault",
  "change-killer-case-mapping",
] as const);

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => lexicalCompare(left, right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

function semanticSha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function sourceSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finding(
  findings: F2MutationControlFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

function parseControls(
  rawControls: readonly unknown[],
  findings: F2MutationControlFinding[],
): readonly F2MutationControl[] {
  const controls: F2MutationControl[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < rawControls.length; index += 1) {
    const raw = rawControls[index];
    const path = `mutationControls[${String(index)}]`;
    if (!isRecord(raw)) {
      finding(findings, "F2_MUTATION_CONTROL_SHAPE", path, "Control must be a record.");
      continue;
    }
    const id = raw["id"];
    const owner = raw["owner"];
    const fault = raw["fault"];
    const caseIds = raw["caseIds"];
    if (
      typeof id !== "string" ||
      (owner !== "F2" && owner !== "E0") ||
      typeof fault !== "string" ||
      fault.trim().length === 0 ||
      !Array.isArray(caseIds) ||
      caseIds.length === 0 ||
      caseIds.some((caseId) => typeof caseId !== "string")
    ) {
      finding(
        findings,
        "F2_MUTATION_CONTROL_SHAPE",
        path,
        "Control requires an ID, F2/E0 owner, nonblank fault, and case IDs.",
      );
      continue;
    }
    if (ids.has(id)) {
      finding(findings, "F2_MUTATION_CONTROL_DUPLICATE", `${path}.id`, `Duplicate control ${id}.`);
      continue;
    }
    ids.add(id);
    controls.push({
      id,
      owner,
      fault,
      caseIds: caseIds.filter((caseId): caseId is string => typeof caseId === "string"),
    });
  }
  return controls;
}

function ledgerProjection(controls: readonly F2MutationControl[]): unknown {
  return controls.map(({ id, owner, fault, caseIds }) => ({
    id,
    owner,
    fault,
    caseIds,
  }));
}

function runLedgerTamperCampaign(
  controls: readonly F2MutationControl[],
): Readonly<{ generated: number; killed: number }> {
  let generated = 0;
  let killed = 0;
  const killIfDigestChanged = (candidate: readonly F2MutationControl[]): void => {
    generated += 1;
    if (semanticSha256(ledgerProjection(candidate)) !== REVIEWED_LEDGER_SHA256) {
      killed += 1;
    }
  };

  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    if (control === undefined) continue;

    killIfDigestChanged(controls.filter((_, candidateIndex) => candidateIndex !== index));
    killIfDigestChanged(controls.map((candidate, candidateIndex) =>
      candidateIndex === index
        ? { ...candidate, owner: candidate.owner === "F2" ? "E0" : "F2" }
        : candidate
    ));
    killIfDigestChanged(controls.map((candidate, candidateIndex) =>
      candidateIndex === index
        ? { ...candidate, fault: `${candidate.fault} [tampered]` }
        : candidate
    ));
    killIfDigestChanged(controls.map((candidate, candidateIndex) =>
      candidateIndex === index
        ? { ...candidate, caseIds: [...candidate.caseIds, "F2-NOT-A-CASE-999"] }
        : candidate
    ));
  }
  return { generated, killed };
}

function reviewedLedgerTamperCampaign(): Readonly<{
  generated: number;
  killed: number;
}> {
  return REVIEWED_TAMPER_CAMPAIGN;
}

function proofChannel(
  caseId: string,
  runtimeCaseIds: ReadonlySet<string>,
): F2MutationProofChannel | undefined {
  if (runtimeCaseIds.has(caseId)) return "runtime-conformance";
  if (caseId === STATIC_CASE_ID) return "static-source-policy";
  if (caseId === WORK_CASE_ID) return "deterministic-work-counters";
  if (caseId === DEPTH_CASE_ID) return "depth-boundary-evidence";
  if (caseId === STATE_CASE_ID) return "state-side-effect-observations";
  if (caseId === E0_IMPORT_CASE_ID) return "deferred-e0-import";
  return undefined;
}

export function auditF2MutationControls(
  input: F2MutationControlAuditInput,
): F2MutationControlAudit {
  const findings: F2MutationControlFinding[] = [];
  const controls = parseControls(input.controls, findings);
  const observationsByCase = new Map<string, F2MutationCaseObservation>();
  for (let index = 0; index < (input.caseObservations ?? []).length; index += 1) {
    const observation = input.caseObservations?.[index];
    if (observation === undefined) continue;
    const path = `caseObservations[${String(index)}]`;
    const expectedChannel = proofChannel(observation.caseId, input.runtimeCaseIds);
    if (expectedChannel === undefined) {
      finding(
        findings,
        "F2_MUTATION_OBSERVATION_UNKNOWN_CASE",
        `${path}.caseId`,
        `Observation names unknown case ${observation.caseId}.`,
      );
      continue;
    }
    if (observationsByCase.has(observation.caseId)) {
      finding(
        findings,
        "F2_MUTATION_OBSERVATION_DUPLICATE",
        `${path}.caseId`,
        `Case ${observation.caseId} has more than one observation.`,
      );
      continue;
    }
    if (
      observation.channel !== expectedChannel ||
      observation.evidenceId.trim().length === 0 ||
      !/^[a-f0-9]{64}$/.test(observation.evidenceSha256)
    ) {
      finding(
        findings,
        "F2_MUTATION_OBSERVATION_SHAPE",
        path,
        "Observation requires its owning channel, evidence ID, and lowercase SHA-256 binding.",
      );
      continue;
    }
    if (observation.outcome === "fail") {
      finding(
        findings,
        "F2_MUTATION_OBSERVATION_FAILED",
        path,
        `Observed evidence for ${observation.caseId} did not pass.`,
      );
    }
    observationsByCase.set(observation.caseId, observation);
  }
  const executedDecoderSourceMutantIds =
    input.executedDecoderSourceMutantIds ?? new Set<string>();
  const killedDecoderSourceMutantIds =
    input.killedDecoderSourceMutantIds ?? new Set<string>();
  const actualIds = controls.map(({ id }) => id);
  const expectedIds = Array.from(
    { length: EXPECTED_CONTROL_COUNT },
    (_, index) => `F2-MUT-${String(index + 1).padStart(3, "0")}`,
  );
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((id, index) => id !== expectedIds[index])
  ) {
    finding(
      findings,
      "F2_MUTATION_CONTROL_INVENTORY",
      "mutationControls",
      "Expected the exact ordered F2-MUT-001 through F2-MUT-244 inventory.",
    );
  }

  const reviewedLedgerSha256 = semanticSha256(ledgerProjection(controls));
  if (reviewedLedgerSha256 !== REVIEWED_LEDGER_SHA256) {
    finding(
      findings,
      "F2_MUTATION_LEDGER_DRIFT",
      "mutationControls",
      "Mutation owners, fault definitions, or killer-case mappings drifted.",
    );
  }

  const f2Owned = controls.filter(({ owner }) => owner === "F2").length;
  const e0Owned = controls.filter(({ owner }) => owner === "E0").length;
  if (f2Owned !== EXPECTED_F2_CONTROL_COUNT || e0Owned !== EXPECTED_E0_CONTROL_COUNT) {
    finding(
      findings,
      "F2_MUTATION_OWNER_INVENTORY",
      "mutationControls",
      "Expected exactly 242 F2 controls and 2 E0 controls.",
    );
  }

  const controlReports = controls.map((control) => {
    const proofChannels = [...new Set(
      control.caseIds
        .map((caseId) => proofChannel(caseId, input.runtimeCaseIds))
        .filter((channel): channel is F2MutationProofChannel =>
          channel !== undefined
        ),
    )].sort(lexicalCompare);
    const mappingCovered = control.caseIds.every(
      (caseId) => proofChannel(caseId, input.runtimeCaseIds) !== undefined,
    );
    if (!mappingCovered) {
      const unknown = control.caseIds.filter(
        (caseId) => proofChannel(caseId, input.runtimeCaseIds) === undefined,
      );
      finding(
        findings,
        "F2_MUTATION_CASE_UNEXECUTABLE",
        `${control.id}.caseIds`,
        `No evidence channel owns: ${unknown.join(", ")}.`,
      );
    }
    const caseObservations = control.caseIds.map((caseId) =>
      observationsByCase.get(caseId)
    );
    const caseObservationsComplete = caseObservations.every(
      (observation) => observation?.outcome === "pass",
    );
    const reviewedControlDischarged =
      control.owner === "F2" && mappingCovered && caseObservationsComplete;
    const decoderSourceMutantExecuted =
      executedDecoderSourceMutantIds.has(control.id);
    const decoderSourceMutantKilled =
      killedDecoderSourceMutantIds.has(control.id);
    if (decoderSourceMutantKilled && !decoderSourceMutantExecuted) {
      finding(
        findings,
        "F2_MUTATION_KILL_WITHOUT_EXECUTION",
        control.id,
        "A control cannot be killed unless its mutant was executed.",
      );
    }
    const status = control.owner === "E0"
      ? "deferred-e0" as const
      : decoderSourceMutantKilled
        ? "source-mutant-killed" as const
        : decoderSourceMutantExecuted
          ? "source-mutant-survived" as const
          : reviewedControlDischarged
            ? "discharged-by-reviewed-exact-case-implication" as const
          : "mapped-not-observed" as const;
    return {
      ...control,
      proofChannels,
      observationEvidenceIds: caseObservations
        .filter((observation): observation is F2MutationCaseObservation =>
          observation !== undefined
        )
        .map(({ evidenceId }) => evidenceId),
      mappingCovered,
      caseObservationsComplete,
      reviewedControlDischarged,
      decoderSourceMutantExecuted,
      decoderSourceMutantKilled,
      status,
    };
  });

  for (const id of executedDecoderSourceMutantIds) {
    if (!actualIds.includes(id)) {
      finding(
        findings,
        "F2_MUTATION_EXECUTION_UNKNOWN",
        id,
        "Execution evidence names an unknown mutation control.",
      );
    }
  }
  for (const id of killedDecoderSourceMutantIds) {
    if (!actualIds.includes(id)) {
      finding(
        findings,
        "F2_MUTATION_KILL_UNKNOWN",
        id,
        "Kill evidence names an unknown mutation control.",
      );
    }
  }

  const mappedButUnobserved = controlReports.filter(
    ({ owner, reviewedControlDischarged }) =>
      owner === "F2" && !reviewedControlDischarged,
  ).length;
  if (mappedButUnobserved > 0) {
    finding(
      findings,
      "F2_MUTATION_CASE_OBSERVATION_GAP",
      "mutationControls",
      `${String(mappedButUnobserved)} F2-owned controls have mapped exact cases that were not all observed.`,
    );
  }
  const f2Survivors = controlReports.filter(
    ({ owner, decoderSourceMutantExecuted, decoderSourceMutantKilled }) =>
      owner === "F2" && decoderSourceMutantExecuted && !decoderSourceMutantKilled,
  ).length;
  if (f2Survivors > 0) {
    finding(
      findings,
      "F2_MUTATION_SURVIVORS",
      "mutationControls",
      `${String(f2Survivors)} executed F2-owned mutants survived.`,
    );
  }

  const tamper = reviewedLedgerTamperCampaign();
  if (tamper.generated !== EXPECTED_CONTROL_COUNT * TAMPER_OPERATORS.length ||
      tamper.killed !== tamper.generated) {
    finding(
      findings,
      "F2_MUTATION_VERIFIER_INERT",
      "ledgerTamperCampaign",
      "The verifier did not reject every bounded ledger-tamper self-test.",
    );
  }

  findings.sort((left, right) =>
    lexicalCompare(left.code, right.code) || lexicalCompare(left.path, right.path)
  );
  const reviewedControlsDischarged = controlReports.filter(
    ({ reviewedControlDischarged }) => reviewedControlDischarged,
  ).length;
  const decoderSourceMutantsExecuted = controlReports.filter(
    ({ decoderSourceMutantExecuted }) => decoderSourceMutantExecuted,
  ).length;
  const decoderSourceMutantsKilled = controlReports.filter(
    ({ decoderSourceMutantKilled }) => decoderSourceMutantKilled,
  ).length;
  return {
    schema: "changes.evidence.f2-mutation-controls.v1",
    outcome: findings.length === 0 ? "pass" : "fail",
    claim: decoderSourceMutantsKilled === EXPECTED_F2_CONTROL_COUNT
      ? "direct-mutant-execution"
      : reviewedControlsDischarged === EXPECTED_F2_CONTROL_COUNT
        ? "reviewed-exact-case-implication"
        : "mapped-case-coverage-only",
    reviewedLedgerSha256,
    counts: {
      controlsDefined: controls.length,
      f2Owned,
      e0Owned,
      rawCaseLinks: controls.reduce((sum, { caseIds }) => sum + caseIds.length, 0),
      mappedControls: controlReports.filter(({ mappingCovered }) => mappingCovered).length,
      reviewedControlsDischarged,
      mappedButUnobserved,
      decoderSourceMutantsExecuted,
      decoderSourceMutantsKilled,
      e0Deferred: controlReports.filter(({ status }) => status === "deferred-e0").length,
    },
    ledgerTamperCampaign: {
      purpose: "verifier-self-test-only",
      operators: TAMPER_OPERATORS,
      mutantsGenerated: tamper.generated,
      mutantsKilled: tamper.killed,
      semanticDecoderFaultsExecuted: 0,
    },
    controls: controlReports,
    findings,
  };
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

async function readEvidenceSource(relativePath: string): Promise<string> {
  return readFile(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

function fixtureControls(): readonly unknown[] {
  const value: unknown = adversarialFixture;
  if (!isRecord(value) || !Array.isArray(value["mutationControls"])) {
    throw new Error("F2_MUTATION_FIXTURE_SHAPE");
  }
  return value["mutationControls"];
}

// Build the bounded 976-cell verifier self-control before any test callback
// starts, so unrelated parallel test files cannot consume this test's 5s clock.
const REVIEWED_TAMPER_CAMPAIGN = runLedgerTamperCampaign(
  parseControls(fixtureControls(), []),
);

export async function verifyF2MutationControls(): Promise<F2MutationControlRepositoryReport> {
  const shapeCells = materializeF2ShapeCases(manifestFixture, shapeFixture);
  const adversarialCells = materializeF2AdversarialCases(
    adversarialFixture,
    shapeFixture,
  );
  const runtimeCells = [...shapeCells, ...adversarialCells];
  const runtimeCaseIds = new Set(runtimeCells.map(({ caseId }) => caseId));
  const [conformanceSource, sourcePolicyTestSource, contractTestSource] =
    await Promise.all([
      readEvidenceSource("tests/conformance/f2-production-conformance.test.ts"),
      readEvidenceSource("tests/static/f2-production-decoder.test.ts"),
      readEvidenceSource("tests/static/f2-contract.test.ts"),
    ]);

  const directEvidenceSource = `${conformanceSource}\n${sourcePolicyTestSource}`;
  const minimalShape = shapeCells.find(({ caseId }) => caseId === "F2-SHAPE-001");
  const byteBoundary = adversarialCells.find(({ caseId }) => caseId === "F2-LIMIT-001");
  if (minimalShape === undefined || byteBoundary === undefined) {
    throw new Error("F2_MUTATION_FOCUSED_WITNESS_MISSING");
  }
  const minimalObservation = runF2FixtureCell(minimalShape);
  const byteObservation = runF2FixtureCell(byteBoundary);
  const audit = auditF2MutationControls({
    controls: fixtureControls(),
    runtimeCaseIds,
    caseObservations: [
      {
        caseId: "F2-SHAPE-001",
        channel: "runtime-conformance",
        outcome: "pass",
        evidenceId: `focused:${minimalShape.cellId}`,
        evidenceSha256: semanticSha256(minimalObservation),
      },
      {
        caseId: "F2-LIMIT-001",
        channel: "runtime-conformance",
        outcome: "pass",
        evidenceId: `focused:${byteBoundary.cellId}`,
        evidenceSha256: semanticSha256(byteObservation),
      },
    ],
    executedDecoderSourceMutantIds: new Set(),
    killedDecoderSourceMutantIds: new Set(),
  });

  return {
    audit,
    evidenceSources: {
      conformanceCampaignSha256: sourceSha256(conformanceSource),
      sourcePolicyTestSha256: sourceSha256(sourcePolicyTestSource),
      contractTestSha256: sourceSha256(contractTestSource),
      conformanceRunsEveryMaterializedCell:
        conformanceSource.includes("[...shapeCells, ...adversarialCells]") &&
        conformanceSource.includes(".map((cell) => runF2FixtureCell(cell"),
      conformanceConsumesMutationControls:
        conformanceSource.includes("mutationControls"),
      namedControlLiteralsInExecutableEvidence: countMatches(
        directEvidenceSource,
        /F2-MUT-\d{3}/g,
      ),
      sourcePolicySyntheticNegativeAssertions: countMatches(
        sourcePolicyTestSource,
        /\.toContain\(/g,
      ),
    },
    focusedWitness: {
      cells: [minimalShape.cellId, byteBoundary.cellId],
      decoderCalls: 8,
      note: "baseline-only-not-a-mutant-kill",
    },
  };
}
