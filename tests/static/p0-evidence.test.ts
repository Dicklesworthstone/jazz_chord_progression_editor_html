import { describe, expect, test } from "bun:test";

import {
  P0_EXPECTED_COUNTS,
  P0_FOCUSED_TEST_FILES,
  P0_PLANNED_EVIDENCE_OWNERS,
  buildP0NamedCriteria,
  buildP0TraceEvidence,
  inspectP0JUnit,
  inspectP0ProductionBoundary,
  inspectP0TestControls,
  p0EvidenceDigest,
  parseP0Observations,
  sanitizeP0JUnit,
  stableP0EvidenceJson,
  validateP0EvidenceCandidate,
  validateP0FocusedJUnit,
  validateP0MutationObservation,
  validateP0ProductionObservation,
  type P0JUnitSummary,
} from "../../scripts/verify-p0-evidence";
import lawFixture from "../fixtures/playback-plan/law-cases.json";
import limitFixture from "../fixtures/playback-plan/limit-cases.json";
import loopFixture from "../fixtures/playback-plan/loop-cases.json";
import mutationFixture from
  "../fixtures/playback-plan/mutation-controls.json";
import provenanceFixture from
  "../fixtures/playback-plan/provenance-ledger.json";
import realizationFixture from
  "../fixtures/playback-plan/realization-cases.json";
import timelineFixture from
  "../fixtures/playback-plan/timeline-cases.json";
import traceFixture from "../fixtures/playback-plan/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

const HASH_A = "a".repeat(64);

function namedCaseIds(): readonly string[] {
  return [
    ...timelineFixture.cases.map(({ id }) => id),
    ...realizationFixture.cases.map(({ id }) => id),
    ...loopFixture.cases.map(({ id }) => id),
    ...lawFixture.cases.map(({ id }) => id),
    ...limitFixture.structuralCases.map(({ id }) => id),
    ...limitFixture.counterBoundaries.map(({ id }) => id),
  ];
}

function validMutationObservation(): JsonRecord {
  const executions = mutationFixture.controls.flatMap((control) =>
    control.killerCaseIds.map((caseId) => {
      const fixture = fixtureCase(caseId);
      const baselineProjection = { caseId, baseline: true };
      const mutantProjection = { caseId, mutant: control.operator };
      const baselineProjectionSha256 = p0EvidenceDigest(baselineProjection);
      const mutantProjectionSha256 = p0EvidenceDigest(mutantProjection);
      const row = {
        controlId: control.id,
        caseId,
        operator: control.operator,
        faultFamily: control.faultFamily,
        executionKind: "executable-semantic-counterfactual",
        sourceMutationExecuted: false,
        fixtureRecordSha256: p0EvidenceDigest(control),
        caseFixturePath: fixture.path,
        caseFixtureRecordSha256: p0EvidenceDigest(fixture.row),
        expectedProjectionSha256: baselineProjectionSha256,
        baselineProjection,
        baselineProjectionSha256,
        mutantProjection,
        mutantProjectionSha256,
        baselineResultSha256: p0EvidenceDigest({ caseId, baseline: true }),
        mutantResultSha256: p0EvidenceDigest({ caseId, mutant: true }),
        oracleDecision: "killed",
        beforeSha256: baselineProjectionSha256,
        afterSha256: mutantProjectionSha256,
        changedFields: ["semantic-projection"],
        killed: true,
      };
      return { ...row, executionDigest: p0EvidenceDigest(row) };
    })
  );
  const payload = {
    schema: "changes.evidence.p0-mutation-conformance-observation.v1",
    suite: "p0-semantic-counterfactuals",
    producer: {
      file: "tests/conformance/playback-plan-conformance.test.ts",
      testcase:
        "kills all 42 reviewed semantic counterfactuals and all 96 killer links",
    },
    classification:
      "reviewed contract projection mutation with real production baselines and checked-in literal fixture oracles",
    controlIds: mutationFixture.controls.map(({ id }) => id),
    controlsDefined: 42,
    controlsExecuted: 42,
    controlsKilled: 42,
    controlsSurvived: 0,
    reviewedKillerLinks: 96,
    killerLinksExecuted: 96,
    killerLinksKilled: 96,
    killerLinksSurvived: 0,
    sourceMutantsExecuted: 0,
    counterfactualExecutions: executions,
    status: "pass",
  };
  return { ...payload, semanticDigest: p0EvidenceDigest(payload) };
}

function fixtureCase(caseId: string): Readonly<{ path: string; row: JsonRecord }> {
  const groups: readonly Readonly<{ path: string; rows: readonly JsonRecord[] }>[] = [
    { path: "tests/fixtures/playback-plan/timeline-cases.json", rows: timelineFixture.cases },
    { path: "tests/fixtures/playback-plan/realization-cases.json", rows: realizationFixture.cases },
    { path: "tests/fixtures/playback-plan/loop-cases.json", rows: loopFixture.cases },
    { path: "tests/fixtures/playback-plan/law-cases.json", rows: lawFixture.cases },
    {
      path: "tests/fixtures/playback-plan/limit-cases.json",
      rows: [...limitFixture.structuralCases, ...limitFixture.counterBoundaries],
    },
  ];
  for (const group of groups) {
    const row = group.rows.find((candidate) => candidate["id"] === caseId);
    if (row !== undefined) return { path: group.path, row };
  }
  throw new Error(`P0 test fixture case missing: ${caseId}`);
}

function validProductionObservation(): JsonRecord {
  const caseIds = [...new Set(mutationFixture.controls.flatMap(
    ({ killerCaseIds }) => killerCaseIds,
  ))].sort();
  const caseObservations = caseIds.map((caseId) => {
    const fixture = fixtureCase(caseId);
    const expectedProjection = { caseId, literal: true };
    const actualProjection = structuredClone(expectedProjection);
    return {
      caseId,
      fixturePath: fixture.path,
      fixtureRecordSha256: p0EvidenceDigest(fixture.row),
      expectedProjection,
      actualProjection,
      expectedProjectionSha256: p0EvidenceDigest(expectedProjection),
      actualProjectionSha256: p0EvidenceDigest(actualProjection),
      runtimeResultSha256: p0EvidenceDigest({ caseId, runtime: true }),
      matchedLiteralFixture: true,
    };
  });
  const payload = {
    schema: "changes.evidence.p0-production-conformance-observation.v1",
    suite: "p0-production-literal-baselines",
    producer: {
      file: "tests/conformance/playback-plan-conformance.test.ts",
      testcase:
        "executes every reviewed P0 mutation baseline against literal fixture authority",
    },
    caseIds,
    caseObservations,
    casesObserved: caseObservations.length,
    fixtureMismatches: 0,
    status: "pass",
  };
  return { ...payload, semanticDigest: p0EvidenceDigest(payload) };
}

function validJUnit(): P0JUnitSummary {
  const ownerCases = P0_FOCUSED_TEST_FILES.map((file) => ({
    file,
    name: `owner executes ${file}`,
  }));
  const namedCases = namedCaseIds().map((caseId) => ({
    file: "tests/conformance/playback-plan-conformance.test.ts",
    name: `${caseId} is independently observed`,
  }));
  const cases = [...ownerCases, ...namedCases];
  return {
    tests: cases.length,
    assertions: cases.length,
    failures: 0,
    errors: 0,
    skipped: 0,
    files: [...P0_FOCUSED_TEST_FILES].sort(),
    cases,
  };
}

function validCandidate(inputDigest: string): JsonRecord {
  const production = validProductionObservation();
  const mutation = validMutationObservation();
  const junit = validJUnit();
  const traces = buildP0TraceEvidence(junit, mutation);
  const criteria = buildP0NamedCriteria(traces);
  const payload: JsonRecord = {
    schema: "changes.evidence.p0.v1",
    package: "P0",
    toolVersion: "changes.evidence.p0-verifier.v1",
    outcome: "pass",
    findings: [],
    input: {
      pre: { digest: inputDigest },
      post: { digest: inputDigest },
    },
    suite: {
      exitCode: 0,
      failures: 0,
      errors: 0,
      skipped: 0,
      retries: 0,
      quarantined: 0,
      files: [...P0_FOCUSED_TEST_FILES].sort(),
    },
    observations: [production, mutation],
    traces,
    criteria,
    humanAcceptance: {
      schema: "changes.evidence.p0-human-acceptance.v1",
      status: "accepted",
      requiredByContract: true,
      missingChecklist: [],
      outcome: "pass",
    },
  };
  return { ...payload, semanticDigest: p0EvidenceDigest(payload) };
}

describe("P0 evidence verifier self-controls", () => {
  test("canonicalizes and hashes independently of object key order", () => {
    const left = { z: [3, { b: 2, a: 1 }], a: true };
    const right = { a: true, z: [3, { a: 1, b: 2 }] };
    expect(stableP0EvidenceJson(left)).toBe(stableP0EvidenceJson(right));
    expect(p0EvidenceDigest(left)).toBe(p0EvidenceDigest(right));
    expect(p0EvidenceDigest(left)).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("parses exact JUnit and rejects forged counts or duplicate identities", () => {
    const valid = '<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0"><testsuite hostname="private-host"><testcase name="proof" file="tests/proof.test.ts" /></testsuite></testsuites>';
    const sanitized = sanitizeP0JUnit(valid);
    expect(sanitized).not.toContain("private-host");
    expect(inspectP0JUnit(sanitized).summary).toEqual({
      tests: 1,
      assertions: 2,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: ["tests/proof.test.ts"],
      cases: [{ file: "tests/proof.test.ts", name: "proof" }],
    });
    expect(inspectP0JUnit(valid.replace('tests="1"', 'tests="2"')).summary)
      .toBeNull();
    const duplicate = valid.replace(
      "</testsuite>",
      '<testcase name="proof" file="tests/proof.test.ts" /></testsuite>',
    ).replace('tests="1"', 'tests="2"');
    expect(inspectP0JUnit(duplicate).summary).toBeNull();
  });

  test("detects focused skip, todo, only, quarantine, and retry calls", () => {
    const source = `
      test.skip("skip", () => {});
      test.todo("todo", () => {});
      describe.only("only", () => {});
      suite.retry(2);
      suite.quarantine("case");
    `;
    expect(inspectP0TestControls("synthetic.test.ts", source)).toHaveLength(5);
    expect(inspectP0TestControls(
      "clean.test.ts",
      'test("retry and quarantine are only words", () => {});',
    )).toEqual([]);
  });

  test("parses unique machine observations and rejects duplicate schemas", () => {
    const mutation = validMutationObservation();
    const line = `P0_MUTATION_OBSERVATION ${JSON.stringify(mutation)}`;
    expect(parseP0Observations(line).observations).toHaveLength(1);
    expect(parseP0Observations(`${line}\n${line}`).findings.map(({ code }) => code))
      .toContain("P0_EVIDENCE_OBSERVATION_DUPLICATE");
    expect(parseP0Observations("P0_BAD_OBSERVATION {not-json}").findings)
      .toHaveLength(1);
  });

  test("binds all 64 production baselines to literal fixtures and signed projections", () => {
    const valid = validProductionObservation();
    expect(validateP0ProductionObservation(valid)).toEqual([]);

    const forged = structuredClone(valid);
    const rows = forged["caseObservations"] as JsonRecord[];
    const first = rows[0];
    if (first === undefined) throw new Error("P0 production row missing");
    first["actualProjection"] = { forged: true };
    expect(validateP0ProductionObservation(forged).map(({ code }) => code))
      .toContain("P0_EVIDENCE_PRODUCTION_ROW");
  });

  test("requires all 42 controls and 96 real-baseline counterfactual links", () => {
    const valid = validMutationObservation();
    expect(validateP0MutationObservation(valid)).toEqual([]);

    const survived = structuredClone(valid);
    const rows = survived["counterfactualExecutions"] as JsonRecord[];
    const first = rows[0];
    if (first === undefined) throw new Error("P0 mutation row missing");
    first["mutantProjectionSha256"] = first["baselineProjectionSha256"];
    first["killed"] = false;
    expect(validateP0MutationObservation(survived).map(({ code }) => code))
      .toContain("P0_EVIDENCE_MUTATION_ROW");

    const missing = structuredClone(valid);
    (missing["counterfactualExecutions"] as unknown[]).pop();
    expect(validateP0MutationObservation(missing).map(({ code }) => code))
      .toContain("P0_EVIDENCE_MUTATION_INVENTORY");
  });

  test("binds every named case, frozen owner, control, authority, and trace", () => {
    const junit = validJUnit();
    const mutation = validMutationObservation();
    expect(validateP0FocusedJUnit(junit)).toEqual([]);
    const traces = buildP0TraceEvidence(junit, mutation);
    expect(traces).toHaveLength(20);
    expect(traces.every((trace) => trace["outcome"] === "pass")).toBe(true);
    const criteria = buildP0NamedCriteria(traces);
    expect(criteria).toHaveLength(8);
    expect(criteria.every((criterion) => criterion["outcome"] === "pass"))
      .toBe(true);
  });

  test("rejects a missing named case or frozen owner", () => {
    const valid = validJUnit();
    const missingCases = valid.cases.filter(({ name }) =>
      !name.includes("P0-LAW-004")
    );
    const missingCase: P0JUnitSummary = {
      ...valid,
      cases: missingCases,
      tests: missingCases.length,
    };
    expect(validateP0FocusedJUnit(missingCase).map(({ code }) => code))
      .toContain("P0_EVIDENCE_SUITE_CASES");

    const missingOwner: P0JUnitSummary = {
      ...valid,
      files: valid.files.slice(1),
    };
    expect(validateP0FocusedJUnit(missingOwner).map(({ code }) => code))
      .toContain("P0_EVIDENCE_SUITE_SUMMARY");
  });

  test("finds ambient capabilities and runtime theory imports through the AST", async () => {
    const paths = [
      "src/playback/compile-playback-plan.ts",
      "src/playback/index.ts",
      "src/playback/playback-plan-contract.ts",
    ] as const;
    const validSources: Record<string, string> = {};
    for (const path of paths) {
      validSources[path] = await Bun.file(path).text();
    }
    expect(inspectP0ProductionBoundary(validSources).findings).toEqual([]);

    const damaged = {
      ...validSources,
      "src/playback/compile-playback-plan.ts":
        'import { realizeVoicing } from "../theory"; fetch("https://example.invalid");',
    };
    const codes = inspectP0ProductionBoundary(damaged).findings.map(
      ({ code }) => code,
    );
    expect(codes).toContain("P0_EVIDENCE_PRODUCTION_BOUNDARY");
  });

  test("rejects stale, tampered, or not-yet-human-accepted ledgers", () => {
    const digest = "d".repeat(64);
    const valid = validCandidate(digest);
    expect(validateP0EvidenceCandidate(valid, digest)).toEqual([]);

    const stale = structuredClone(valid);
    (stale["input"] as JsonRecord)["post"] = { digest: "e".repeat(64) };
    const stalePayload = Object.fromEntries(
      Object.entries(stale).filter(([key]) => key !== "semanticDigest"),
    );
    stale["semanticDigest"] = p0EvidenceDigest(stalePayload);
    expect(validateP0EvidenceCandidate(stale, digest).map(({ code }) => code))
      .toContain("P0_EVIDENCE_LEDGER_STALE");

    const pending = structuredClone(valid);
    pending["humanAcceptance"] = {
      schema: "changes.evidence.p0-human-acceptance.v1",
      status: "pending",
      requiredByContract: true,
      missingChecklist: [],
      outcome: "pending",
    };
    pending["outcome"] = "pending-human-review";
    pending["findings"] = [{
      code: "P0_EVIDENCE_HUMAN_REVIEW_PENDING",
      path: "docs/evidence/P0_INDEPENDENT_TRACE_REVIEW.md",
      message: "pending",
      traceId: null,
    }];
    const pendingPayload = Object.fromEntries(
      Object.entries(pending).filter(([key]) => key !== "semanticDigest"),
    );
    pending["semanticDigest"] = p0EvidenceDigest(pendingPayload);
    expect(validateP0EvidenceCandidate(pending, digest).map(({ code }) => code))
      .toContain("P0_EVIDENCE_HUMAN_REVIEW_PENDING");

    const changedDuringRun = structuredClone(valid);
    ((changedDuringRun["input"] as JsonRecord)["pre"] as JsonRecord)["digest"] =
      "f".repeat(64);
    changedDuringRun["findings"] = [{
      code: "P0_EVIDENCE_INPUT_CHANGED",
      path: "input",
      message: "changed",
      traceId: null,
    }];
    changedDuringRun["outcome"] = "fail";
    changedDuringRun["semanticDigest"] = p0EvidenceDigest(
      Object.fromEntries(
        Object.entries(changedDuringRun).filter(
          ([key]) => key !== "semanticDigest",
        ),
      ),
    );
    const changedCodes = validateP0EvidenceCandidate(
      changedDuringRun,
      digest,
    ).map(({ code }) => code);
    expect(changedCodes).toContain("P0_EVIDENCE_LEDGER_INPUT_CHANGED");
    expect(changedCodes).toContain("P0_EVIDENCE_LEDGER_RECORDED_FINDINGS");

    const tampered = structuredClone(valid);
    tampered["semanticDigest"] = HASH_A;
    expect(validateP0EvidenceCandidate(tampered, digest).map(({ code }) => code))
      .toContain("P0_EVIDENCE_LEDGER_DIGEST");
  });

  test("freezes the independently authored inventory and its limitations", () => {
    expect(namedCaseIds()).toHaveLength(83);
    expect(mutationFixture.controls).toHaveLength(42);
    expect(
      mutationFixture.controls.reduce(
        (total, control) => total + control.killerCaseIds.length,
        0,
      ),
    ).toBe(96);
    expect(traceFixture.traces).toHaveLength(20);
    expect(provenanceFixture.authorities).toHaveLength(11);
    expect(P0_PLANNED_EVIDENCE_OWNERS).toHaveLength(12);
    expect(P0_EXPECTED_COUNTS.totalNamedCases).toBe(83);
    expect(provenanceFixture.authoringStatement.humanReviewClaimed).toBe(false);
    expect(provenanceFixture.authoringStatement.productionOracleUsed).toBe(false);
  });
});
