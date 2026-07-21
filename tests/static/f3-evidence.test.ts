import { describe, expect, test } from "bun:test";

import {
  F3_APPLICABILITY,
  F3_EXPECTED_COUNTS,
  F3_FOCUSED_TEST_FILES,
  F3_INPUT_GROUPS,
  buildF3TraceEvidence,
  f3EvidenceDigest,
  inspectF3JUnit,
  inspectF3TestControls,
  parseF3Observations,
  sanitizeF3JUnit,
  validateF3EvidenceCandidate,
  validateF3ObservationRecords,
} from "../../scripts/verify-f3-evidence";
import documentFixture from "../fixtures/publication/document-cases.json";
import mutationFixture from "../fixtures/publication/mutation-controls.json";
import operationFixture from
  "../fixtures/publication/operation-state-cases.json";
import traceFixture from "../fixtures/publication/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

function signed(value: JsonRecord): JsonRecord {
  return { ...value, semanticDigest: f3EvidenceDigest(value) };
}

function resigned(value: JsonRecord): JsonRecord {
  return signed(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  ));
}

function caseIds(value: { cases: readonly { id: string }[] }): readonly string[] {
  return value.cases.map(({ id }) => id);
}

function passingObservations(): JsonRecord[] {
  const documents = caseIds(documentFixture);
  const operations = caseIds(operationFixture);
  const allCases = [...documents, ...operations].sort();
  const controls = mutationFixture.controls.map(({ id }) => id);
  const links = mutationFixture.controls.flatMap(({ id: controlId, killerCaseIds }) =>
    killerCaseIds.map((caseId) => ({ controlId, caseId }))
  );
  const linkedCases = [...new Set(links.map(({ caseId }) => caseId))].sort();
  const hash = "a".repeat(64);
  return [
    signed({
      schema: "changes.evidence.f3-production-conformance-observation.v1",
      producer: {
        file: "tests/conformance/f3-production-conformance.test.ts",
        testcase: "executes all reviewed document and operation-state cases",
      },
      documentCaseIds: documents,
      operationStateCaseIds: operations,
      caseHashes: Object.fromEntries(allCases.map((id) => [id, hash])),
      documentCasesObserved: 45,
      operationStateCasesObserved: 8,
      outcomeCounts: {
        publication: 17,
        semanticRefusal: 25,
        f2BoundaryRefusal: 3,
      },
      runtimeExecutions: {
        f2Decode: 47,
        f3Private: 43,
        f3Public: 3,
        deterministicReplay: 1,
        positionMetamorphic: 1,
      },
      aggregateCounters: {},
      maximumBoundaryCounters: {
        "F3-DOC-037": {
          sectionsVisited: 64,
          measuresVisited: 65_536,
          eventsVisited: 0,
        },
        "F3-DOC-038": {
          eventsVisited: 8_192,
          symbolParseCalls: 8_192,
          resolutionCalls: 8_192,
          voicingChecks: 8_192,
        },
      },
      privacyLeaks: 0,
      mutableInputAliases: 0,
      inputMutations: 0,
      status: "pass",
    }),
    signed({
      schema: "changes.evidence.f3-mutation-conformance-observation.v1",
      producer: {
        file: "tests/conformance/f3-mutation-controls.test.ts",
        testcase:
          "kills every named semantic counterfactual and every reviewed killer link",
      },
      claim: "executable-semantic-counterfactuals-not-source-mutants",
      classification:
        "reviewed-contract-projection mutation with runtime production baselines",
      controlIds: controls,
      controlsDefined: 37,
      semanticOperatorsExecuted: 37,
      semanticOperatorsKilled: 37,
      semanticOperatorsSurvived: 0,
      reviewedKillerLinks: 60,
      killerLinksExecuted: 60,
      killerLinksKilled: 60,
      killerLinksSurvived: 0,
      sourceMutantsExecuted: 0,
      sourceMutantsKilled: 0,
      linkedCaseIds: linkedCases,
      linkedCasesObserved: 46,
      mappedButUnobserved: 0,
      caseObservationDigests: Object.fromEntries(
        linkedCases.map((id) => [id, hash]),
      ),
      controlExecutionDigests: Object.fromEntries(
        controls.map((id) => [id, hash]),
      ),
      counterfactualExecutions: links.map(({ controlId, caseId }) => ({
        controlId,
        caseId,
        changedFields: ["outcome"],
        beforeSha256: "a".repeat(64),
        afterSha256: "b".repeat(64),
        killed: true,
      })),
      status: "pass",
    }),
    signed({
      schema: "changes.evidence.f3-static-boundary-observation.v1",
      producer: {
        file: "tests/static/f3-production-policy.test.ts",
        testcase:
          "keeps publication pure, synchronous, private, and singly branded",
      },
      allowedImports: [
        "../domain",
        "../theory",
        "./document-validation-contract",
      ],
      implementationExports: [
        "documentValidationOperations",
        "validateDocumentSemantics",
        "validateDocumentSemanticsWithEvidence",
      ],
      castSites: ["application/document-validation.ts"],
      allowedCastCount: 1,
      privateEvidenceIndexMentions: 0,
      moduleMutableBindings: 0,
      asyncOrGeneratorFunctions: 0,
      forbiddenRuntimeReferences: [],
      fixtureOrTestSupportImports: [],
      existingPublicationBypassPaths: 0,
      shapeAssignableToValidatedDocument: false,
      operationObjectExact: true,
      status: "pass",
    }),
  ];
}

describe("F3 evidence verifier self-controls", () => {
  test("parses a sanitized exact JUnit inventory", () => {
    const raw = '<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0"><testsuite hostname="private-host"><testcase name="proof" file="tests/proof.test.ts" /></testsuite></testsuites>';
    const sanitized = sanitizeF3JUnit(raw);
    expect(sanitized).not.toContain("private-host");
    expect(inspectF3JUnit(sanitized)).toEqual({
      summary: {
        tests: 1,
        assertions: 2,
        failures: 0,
        errors: 0,
        skipped: 0,
        files: ["tests/proof.test.ts"],
        cases: [{ file: "tests/proof.test.ts", name: "proof" }],
      },
      findings: [],
    });
  });

  test("rejects forged JUnit counts, hidden failures, duplicates, and open roots", () => {
    const valid = '<testsuites tests="1" assertions="1" failures="0" skipped="0"><testcase name="proof" file="tests/proof.test.ts" /></testsuites>';
    expect(inspectF3JUnit(valid.replace('tests="1"', 'tests="2"')).summary)
      .toBeNull();
    expect(inspectF3JUnit(valid.replace(" />", "><failure /></testcase>"))
      .summary).toBeNull();
    expect(inspectF3JUnit(valid.replace("</testsuites>", "")).summary)
      .toBeNull();
    const duplicate = valid.replace(
      "</testsuites>",
      '<testcase name="proof" file="tests/proof.test.ts" /></testsuites>',
    ).replace('tests="1"', 'tests="2"');
    expect(inspectF3JUnit(duplicate).summary).toBeNull();
  });

  test("rejects skip, todo, only, expected-failure, quarantine, and retry controls", () => {
    const findings = inspectF3TestControls("synthetic.test.ts", `
      import { test as spec, describe } from "bun:test";
      spec.skip("skip", () => {});
      spec.todo("todo");
      describe.only("only", () => {});
      spec.failing("failing", () => {});
      quarantine("known issue");
      spec("retry", () => {}, { retry: 2 });
      xit("disabled", () => {});
    `);
    expect(findings.map(({ code }) => code)).toContain("F3_EVIDENCE_TODO");
    expect(findings.map(({ code }) => code)).toContain(
      "F3_EVIDENCE_QUARANTINE",
    );
    expect(findings.map(({ code }) => code)).toContain("F3_EVIDENCE_RETRY");
    expect(findings).toHaveLength(7);
  });

  test("requires exactly signed production, mutation, and static observations", () => {
    const observations = passingObservations();
    expect(validateF3ObservationRecords(observations)).toEqual([]);
    const output = [
      `F3_EVIDENCE_OBSERVATION ${JSON.stringify(observations[0])}`,
      `F3_CONFORMANCE_OBSERVATION ${JSON.stringify(observations[1])}`,
      `F3_STATIC_OBSERVATION ${JSON.stringify(observations[2])}`,
    ].join("\n");
    expect(parseF3Observations(output).findings).toEqual([]);

    const digestTamper = structuredClone(observations);
    const production = digestTamper[0];
    if (production === undefined) throw new Error("production missing");
    production["documentCasesObserved"] = 44;
    expect(validateF3ObservationRecords(digestTamper).map(({ code }) => code))
      .toContain("F3_EVIDENCE_OBSERVATION_DIGEST");

    const resignedTamper = structuredClone(observations);
    const mutation = resignedTamper[1];
    if (mutation === undefined) throw new Error("mutation missing");
    resignedTamper[1] = resigned({ ...mutation, killerLinksKilled: 59 });
    const codes = validateF3ObservationRecords(resignedTamper)
      .map(({ code }) => code);
    expect(codes).toContain("F3_EVIDENCE_MUTATION_INVENTORY");
    expect(codes).not.toContain("F3_EVIDENCE_OBSERVATION_DIGEST");
  });

  test("binds every trace to all required cases and mutation controls", () => {
    const observations = passingObservations();
    const traces = buildF3TraceEvidence(observations);
    expect(traces).toHaveLength(12);
    expect(traces.every((trace) => trace["outcome"] === "pass")).toBe(true);
    expect(traceFixture.traces).toHaveLength(F3_EXPECTED_COUNTS.traces);

    const damaged = structuredClone(observations);
    const production = damaged[0];
    if (production === undefined) throw new Error("production missing");
    const hashes = production["caseHashes"];
    if (typeof hashes !== "object" || hashes === null || Array.isArray(hashes)) {
      throw new Error("case hashes missing");
    }
    Reflect.deleteProperty(hashes, "F3-DOC-003");
    expect(buildF3TraceEvidence(damaged).some((trace) =>
      trace["outcome"] === "fail"
    )).toBe(true);
  });

  test("keeps exact suite, authority, and non-applicability inventories explicit", async () => {
    expect(F3_FOCUSED_TEST_FILES).toHaveLength(7);
    expect([...F3_FOCUSED_TEST_FILES]).toEqual([...F3_FOCUSED_TEST_FILES].sort());
    expect(F3_INPUT_GROUPS.authority).toHaveLength(6);
    expect(F3_APPLICABILITY).toHaveLength(8);
    expect(mutationFixture.controls).toHaveLength(37);
    expect(mutationFixture.controls.flatMap(({ killerCaseIds }) => killerCaseIds))
      .toHaveLength(60);
    expect(documentFixture.cases).toHaveLength(45);
    expect(operationFixture.cases).toHaveLength(8);

    const packageValue = await Bun.file(new URL("../../package.json", import.meta.url))
      .json() as { scripts?: Record<string, string> };
    expect(packageValue.scripts?.["verify:f3-evidence"])
      .toBe("bun scripts/verify-f3-evidence.ts");
    const aggregate = await Bun.file(new URL("../../scripts/verify.ts", import.meta.url))
      .text();
    expect(aggregate.indexOf('id: "f3-evidence"'))
      .toBeGreaterThan(aggregate.indexOf('id: "t1-evidence"'));
    const architecture = await Bun.file(new URL(
      "../../docs/ARCHITECTURE.md",
      import.meta.url,
    )).text();
    expect(architecture).toContain("`bun run verify:f3-evidence`");
  });

  test("rejects an unbound or stale ledger candidate", () => {
    const codes = validateF3EvidenceCandidate({}, "a".repeat(64))
      .map(({ code }) => code);
    expect(codes).toContain("F3_EVIDENCE_LEDGER_IDENTITY");
    expect(codes).toContain("F3_EVIDENCE_INPUT_STALE");
    expect(codes).toContain("F3_EVIDENCE_SUITE");
    expect(codes).toContain("F3_EVIDENCE_VALIDATOR");
    expect(codes).toContain("F3_EVIDENCE_TRACE");
  });
});
