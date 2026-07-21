import { describe, expect, test } from "bun:test";

import {
  V1_ACCOUNTING_MARKER,
  V1_EXPECTED_COUNTS,
  V1_MUTATION_MARKER,
  V1_MUTATION_PRODUCER,
  V1_MUTATION_SCHEMA,
  V1_PRODUCTION_MARKER,
  V1_PRODUCTION_PRODUCER,
  V1_PRODUCTION_SCHEMA,
  V1_REQUIRED_JUNIT_CASES,
  V1_TRANSPOSITION_CASE_IDS,
  V1_TRANSPOSITION_LAW_CHECKS,
  V1_TRANSPOSITION_MARKER,
  V1_TRANSPOSITION_SCHEMA,
  buildV1NamedCriteria,
  buildV1TraceEvidence,
  inspectV1JUnit,
  inspectV1ProductionBoundary,
  inspectV1TestControls,
  parseV1Observations,
  sanitizeV1JUnit,
  stableV1EvidenceJson,
  v1EvidenceDigest,
  validateV1EvidenceCandidate,
  validateV1ObservationRecords,
  validateV1RequiredJUnitCases,
  type V1JUnitSummary,
} from "../../scripts/verify-v1-evidence";
import { buildV1AccountingProbeReport } from
  "../../src/test-support/v1-accounting-probes";
import assignmentFixture from
  "../fixtures/voice-assignment/assignment-cases.json";
import limitFixture from "../fixtures/voice-assignment/limit-cases.json";
import lawFixture from "../fixtures/voice-assignment/law-cases.json";
import mutationFixture from
  "../fixtures/voice-assignment/mutation-controls.json";
import {
  allV1ProductionObservations,
  v1EvidenceDigest as harnessDigest,
} from "../support/v1-conformance";
import { buildV1PublicBoundaryObservations } from
  "../support/v1-public-boundaries";

type JsonRecord = Record<string, unknown>;

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function validProductionObservation(): JsonRecord {
  const cases = allV1ProductionObservations();
  const boundaries = buildV1PublicBoundaryObservations();
  return {
    schema: V1_PRODUCTION_SCHEMA,
    suite: "v1-production-conformance",
    producer: V1_PRODUCTION_PRODUCER,
    caseIds: cases.map(({ caseId }) => caseId),
    caseObservations: cases,
    caseObservationDigests: Object.fromEntries(
      cases.map(({ caseId, observationDigest }) => [caseId, observationDigest]),
    ),
    publicBoundaryObservations: boundaries,
    publicBoundaryObservationDigests: Object.fromEntries(
      boundaries.map(({ caseId, observationDigest }) => [
        caseId,
        observationDigest,
      ]),
    ),
    deterministicReplays: 18,
    inputMutations: 0,
    mutableResultRecords: 0,
    callerOwnedAliases: 0,
    wallTimeSemanticCutoff: false,
    status: "pass",
  };
}

function validMutationObservation(): JsonRecord {
  const rows = mutationFixture.controls.flatMap((control) =>
    control.killedByCaseIds.map((caseId) => {
      const row = {
        controlId: control.id,
        caseId,
        operator: control.operator,
        fixtureRecordSha256: v1EvidenceDigest(control),
        executionKind: "executable-semantic-counterfactual",
        runtimeRequestSha256: v1EvidenceDigest({ caseId, request: true }),
        expectedProjectionSha256: HASH_A,
        baselineProjectionSha256: HASH_A,
        mutantProjectionSha256: HASH_B,
        baselineResultSha256: v1EvidenceDigest({ caseId, baseline: true }),
        mutantResultSha256: v1EvidenceDigest({ caseId, mutant: true }),
        oracleDecision: "killed",
        beforeSha256: HASH_A,
        afterSha256: HASH_B,
        changedFields: ["semantic-projection"],
        killed: true,
      };
      return { ...row, executionDigest: v1EvidenceDigest(row) };
    })
  );
  return {
    schema: V1_MUTATION_SCHEMA,
    suite: "v1-mutation-controls",
    producer: V1_MUTATION_PRODUCER,
    controlIds: mutationFixture.controls.map(({ id }) => id),
    controlsDefined: V1_EXPECTED_COUNTS.mutationControls,
    controlsExecuted: V1_EXPECTED_COUNTS.mutationControls,
    controlsKilled: V1_EXPECTED_COUNTS.mutationControls,
    controlsSurvived: 0,
    reviewedKillerLinks: V1_EXPECTED_COUNTS.mutationLinks,
    killerLinksExecuted: V1_EXPECTED_COUNTS.mutationLinks,
    killerLinksKilled: V1_EXPECTED_COUNTS.mutationLinks,
    killerLinksSurvived: 0,
    counterfactualExecutions: rows,
    controlExecutionDigests: Object.fromEntries(
      mutationFixture.controls.map(({ id }) => [
        id,
        v1EvidenceDigest(rows.filter(({ controlId }) => controlId === id)),
      ]),
    ),
    status: "pass",
  };
}

function validAccountingObservation(): JsonRecord {
  return buildV1AccountingProbeReport(
    limitFixture.derivedAccountingProbes,
  );
}

function validTranspositionObservation(): JsonRecord {
  const observations = V1_TRANSPOSITION_CASE_IDS.map((caseId) => {
    const invariantSha256 = v1EvidenceDigest({ caseId, invariant: true });
    const oracleCase = caseId === "V1-ASN-016";
    const row = {
      caseId,
      baseResultSha256: HASH_A,
      baseReplayResultSha256: HASH_A,
      transposedResultSha256: HASH_B,
      transposedReplayResultSha256: HASH_B,
      baseInvariantProjectionSha256: invariantSha256,
      transposedInvariantProjectionSha256: invariantSha256,
      invariantPreserved: true,
      baseInputUnchanged: true,
      transposedInputUnchanged: true,
      baseRecursivelyFrozen: true,
      transposedRecursivelyFrozen: true,
      baseDetachedFromInput: true,
      transposedDetachedFromInput: true,
      baseOracleProjectionSha256: oracleCase ? invariantSha256 : null,
      transposedOracleProjectionSha256: oracleCase ? invariantSha256 : null,
      independentOracleMatched: oracleCase ? true : null,
    };
    return { ...row, observationDigest: v1EvidenceDigest(row) };
  });
  const byCaseId = new Map(
    observations.map((row) => [row.caseId, row.observationDigest]),
  );
  const lawBindings = lawFixture.cases.map((law) => {
    const binding = {
      lawId: law.id,
      law: law.law,
      scenarioCaseIds: law.transpositionCaseIds,
      scenarioObservationSha256: law.transpositionCaseIds.map((caseId) =>
        byCaseId.get(caseId)
      ),
      check: V1_TRANSPOSITION_LAW_CHECKS[
        law.id as keyof typeof V1_TRANSPOSITION_LAW_CHECKS
      ],
      checkPassed: true,
    };
    return { ...binding, bindingDigest: v1EvidenceDigest(binding) };
  });
  return {
    schema: V1_TRANSPOSITION_SCHEMA,
    semitones: 12,
    observations,
    lawBindings,
    status: "pass",
  };
}

function firstObject(value: unknown, label: string): object {
  if (!Array.isArray(value)) throw new Error(`missing ${label} rows`);
  const rows: readonly unknown[] = value;
  const first = rows[0];
  if (typeof first !== "object" || first === null) {
    throw new Error(`missing first ${label} row`);
  }
  return first;
}

function validObservations(): Readonly<{
  production: JsonRecord;
  mutation: JsonRecord;
  accounting: JsonRecord;
  transposition: JsonRecord;
}> {
  return {
    production: validProductionObservation(),
    mutation: validMutationObservation(),
    accounting: validAccountingObservation(),
    transposition: validTranspositionObservation(),
  };
}

function requiredJUnit(): V1JUnitSummary {
  const cases = V1_REQUIRED_JUNIT_CASES.map(({ file, testcase }) => ({
    file,
    name: testcase,
  }));
  return {
    tests: cases.length,
    assertions: cases.length,
    failures: 0,
    errors: 0,
    skipped: 0,
    files: [...new Set(cases.map(({ file }) => file))].sort(),
    cases,
  };
}

describe("V1 evidence verifier self-controls", () => {
  test("canonicalizes and hashes independently of object key order", () => {
    const left = { z: [3, { b: 2, a: 1 }], a: true };
    const right = { a: true, z: [3, { a: 1, b: 2 }] };
    expect(stableV1EvidenceJson(left)).toBe(stableV1EvidenceJson(right));
    expect(v1EvidenceDigest(left)).toBe(v1EvidenceDigest(right));
    expect(v1EvidenceDigest(left)).toBe(harnessDigest(left));
    expect(v1EvidenceDigest(left)).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("parses exact JUnit and rejects forged counts or duplicate identities", () => {
    const valid = '<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0"><testsuite hostname="private-host"><testcase name="proof" file="tests/proof.test.ts" /></testsuite></testsuites>';
    const sanitized = sanitizeV1JUnit(valid);
    expect(sanitized).not.toContain("private-host");
    expect(inspectV1JUnit(sanitized).summary).toEqual({
      tests: 1,
      assertions: 2,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: ["tests/proof.test.ts"],
      cases: [{ file: "tests/proof.test.ts", name: "proof" }],
    });
    expect(inspectV1JUnit(valid.replace('tests="1"', 'tests="2"')).summary)
      .toBeNull();
    const duplicate = valid.replace(
      "</testsuite>",
      '<testcase name="proof" file="tests/proof.test.ts" /></testsuite>',
    ).replace('tests="1"', 'tests="2"');
    expect(inspectV1JUnit(duplicate).summary).toBeNull();
  });

  test("detects skip, todo, only, quarantine, and retry relaxations", () => {
    const findings = inspectV1TestControls("synthetic.test.ts", `
      import { test as spec, describe } from "bun:test";
      spec.skip("skip", () => {});
      spec.todo("todo");
      describe.only("only", () => {});
      quarantine("known issue");
      spec("retry", () => {}, { retry: 2 });
      xit("disabled", () => {});
    `);
    expect(findings).toHaveLength(6);
    expect(findings.map(({ code }) => code)).toContain("V1_EVIDENCE_TODO");
    expect(findings.map(({ code }) => code)).toContain(
      "V1_EVIDENCE_QUARANTINE",
    );
    expect(findings.map(({ code }) => code)).toContain("V1_EVIDENCE_RETRY");
  });

  test("requires exactly one valid production, mutation, accounting, and transposition marker", () => {
    const observations = validObservations();
    const output = [
      `${V1_PRODUCTION_MARKER}${JSON.stringify(observations.production)}`,
      `${V1_MUTATION_MARKER}${JSON.stringify(observations.mutation)}`,
      `${V1_ACCOUNTING_MARKER}${JSON.stringify(observations.accounting)}`,
      `${V1_TRANSPOSITION_MARKER}${JSON.stringify(observations.transposition)}`,
    ].join("\n");
    expect(parseV1Observations(output).findings).toEqual([]);
    const missing = parseV1Observations(
      `${V1_ACCOUNTING_MARKER}${JSON.stringify(observations.accounting)}\n`,
    );
    expect(missing.findings.filter(({ code }) =>
      code === "V1_EVIDENCE_OBSERVATION_INVENTORY"
    )).toHaveLength(3);
  });

  test("rejects forged replay, boundary, counterfactual, and accounting rows", () => {
    const observations = structuredClone(validObservations());
    const firstProduction = firstObject(
      observations.production["caseObservations"],
      "production",
    );
    Reflect.set(firstProduction, "replayResultSha256", HASH_B);
    const firstMutation = firstObject(
      observations.mutation["counterfactualExecutions"],
      "mutation",
    );
    Reflect.set(firstMutation, "killed", false);
    const firstAccounting = firstObject(
      observations.accounting["cases"],
      "accounting",
    );
    Reflect.set(firstAccounting, "received", 999);
    const codes = validateV1ObservationRecords(observations)
      .map(({ code }) => code);
    expect(codes).toContain("V1_EVIDENCE_PRODUCTION_CASE");
    expect(codes).toContain("V1_EVIDENCE_MUTATION_LINK");
    expect(codes).toContain("V1_EVIDENCE_ACCOUNTING_CASE");
  });

  test("rejects mismatched transposition projections and forged law bindings", () => {
    const observations = structuredClone(validObservations());
    const firstScenario = firstObject(
      observations.transposition["observations"],
      "transposition scenario",
    );
    Reflect.set(firstScenario, "transposedInvariantProjectionSha256", HASH_B);
    const firstBinding = firstObject(
      observations.transposition["lawBindings"],
      "transposition binding",
    );
    Reflect.set(firstBinding, "scenarioCaseIds", ["V1-ASN-999"]);
    const codes = validateV1ObservationRecords(observations)
      .map(({ code }) => code);
    expect(codes).toContain("V1_EVIDENCE_TRANSPOSITION_CASE");
    expect(codes).toContain("V1_EVIDENCE_TRANSPOSITION_BINDING");
  });

  test("binds all trace rows to runtime cases and mutation executions", () => {
    const observations = validObservations();
    const traces = buildV1TraceEvidence(observations);
    expect(traces).toHaveLength(V1_EXPECTED_COUNTS.traces);
    expect(traces.every((trace) => trace["outcome"] === "pass")).toBe(true);
    const damaged = structuredClone(observations);
    const digests = damaged.mutation["controlExecutionDigests"];
    if (typeof digests !== "object" || digests === null) {
      throw new Error("missing case digests");
    }
    Reflect.deleteProperty(digests, "V1-MUT-009");
    const damagedTraces = buildV1TraceEvidence(damaged);
    expect(damagedTraces.some((trace) => trace["outcome"] === "fail"))
      .toBe(true);
  });

  test("requires every named JUnit owner and criterion", () => {
    const junit = requiredJUnit();
    expect(validateV1RequiredJUnitCases(junit)).toEqual([]);
    expect(validateV1RequiredJUnitCases({ ...junit, cases: [] }))
      .toHaveLength(V1_REQUIRED_JUNIT_CASES.length);
    const observations = validObservations();
    const traces = buildV1TraceEvidence(observations);
    const criteria = buildV1NamedCriteria(
      observations,
      traces,
      junit,
      { status: "pass" },
      true,
    );
    expect(criteria).toHaveLength(15);
    expect(criteria.every((criterion) => criterion["outcome"] === "pass"))
      .toBe(true);
  });

  test("detects ambient state and illegal imports through the TypeScript AST", () => {
    const clean = inspectV1ProductionBoundary({
      "src/theory/voice-assignment.ts":
        'import { x } from "./voice-assignment-contract"; export const y = Math.abs(x);',
    });
    expect(clean.findings).toEqual([]);
    const damaged = inspectV1ProductionBoundary({
      "src/theory/voice-assignment.ts":
        'import { x } from "../ui"; export const y = Date.now() + Math.random(); void fetch(x);',
    });
    expect(damaged.findings.map(({ code }) => code)).toContain(
      "V1_EVIDENCE_PRODUCTION_IMPORT",
    );
    expect(damaged.findings.map(({ code }) => code)).toContain(
      "V1_EVIDENCE_AMBIENT_REFERENCE",
    );
  });

  test("rejects malformed, stale, or unsigned stored ledgers", () => {
    const findings = validateV1EvidenceCandidate({}, HASH_B);
    const codes = findings.map(({ code }) => code);
    expect(codes).toContain("V1_EVIDENCE_LEDGER_IDENTITY");
    expect(codes).toContain("V1_EVIDENCE_RUN_ID");
    expect(codes).toContain("V1_EVIDENCE_INPUT_STALE");
    expect(codes).toContain("V1_EVIDENCE_PRODUCTION");
    expect(codes).toContain("V1_EVIDENCE_DIGEST");
  });

  test("fixture inventories remain independently authored and exact", () => {
    expect(assignmentFixture.cases).toHaveLength(18);
    expect(limitFixture.publicBoundaries).toHaveLength(9);
    expect(limitFixture.derivedAccountingProbes).toHaveLength(29);
    expect(mutationFixture.controls).toHaveLength(37);
    expect(
      mutationFixture.controls.reduce(
        (sum, control) => sum + control.killedByCaseIds.length,
        0,
      ),
    ).toBe(54);
  });
});
