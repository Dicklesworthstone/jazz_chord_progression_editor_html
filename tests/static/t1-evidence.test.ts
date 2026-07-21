import { describe, expect, test } from "bun:test";

import { runNodeTool } from "../../scripts/run-node-tool";
import {
  T1_APPLICABILITY,
  T1_CORROBORATIVE_MUTATION_LINK_INVENTORY_SHA256,
  T1_DIRECT_MUTATION_LINK_INVENTORY_SHA256,
  T1_EXPECTED_COUNTS,
  T1_FIXTURE_FILES,
  T1_FOCUSED_TEST_FILES,
  T1_INPUT_GROUPS,
  T1_LAWS_PRODUCER,
  T1_PRODUCTION_PRODUCER,
  T1_REVIEWED_MUTATION_LINK_INVENTORY_SHA256,
  T1_VALIDATOR_COUNTS,
  buildT1CaseBindings,
  buildT1MutationEvidence,
  buildT1SemanticCounterfactualTestRecords,
  buildT1TraceEvidence,
  inspectT1JUnit,
  inspectT1ObservationRecords,
  inspectT1CaseObservationRecords,
  inspectT1ReviewedMutationLinkPartition,
  inspectT1TestControls,
  parseT1Observations,
  sanitizeT1JUnit,
  t1OperationEvidenceRows,
  t1CanonicalDigest,
  t1CaseObservationDigest,
  t1ObservationInventoryDigest,
  t1ProductionCaseIds,
  t1SemanticDigest,
  validateT1EvidenceCandidate,
  validateT1MutationEvidenceRows,
  validateT1TraceEvidenceRows,
} from "../../scripts/verify-t1-evidence";

import lawFixture from "../fixtures/resolution/law-cases.json";
import formulaFixture from "../fixtures/resolution/formula-rules.json";
import mutationFixture from "../fixtures/resolution/mutation-controls.json";
import provenanceFixture from "../fixtures/resolution/provenance-ledger.json";
import spellingFixture from "../fixtures/resolution/spelling-cases.json";
import traceFixture from "../fixtures/resolution/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function signed(value: JsonRecord): JsonRecord {
  return { ...value, semanticDigest: t1SemanticDigest(value) };
}

function resigned(value: JsonRecord): JsonRecord {
  return signed(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  ));
}

function resignCaseObservationRecord(value: JsonRecord): string {
  if (
    typeof value["caseId"] !== "string" ||
    !isRecord(value["producer"]) ||
    typeof value["producer"]["file"] !== "string" ||
    typeof value["producer"]["testcase"] !== "string"
  ) {
    throw new Error("case observation record identity missing");
  }
  const observationDigest = t1CaseObservationDigest({
    caseId: value["caseId"],
    producer: {
      file: value["producer"]["file"],
      testcase: value["producer"]["testcase"],
    },
    payload: value["payload"],
  });
  value["observationDigest"] = observationDigest;
  return observationDigest;
}

function observationRecord(
  caseId: string,
  producer: typeof T1_LAWS_PRODUCER | typeof T1_PRODUCTION_PRODUCER,
  payload: unknown,
) {
  return {
    caseId,
    producer,
    payload,
    observationDigest: t1CaseObservationDigest({ caseId, producer, payload }),
  };
}

function requiredDigest(digests: Readonly<Record<string, string>>, id: string): string {
  const value = digests[id];
  if (value === undefined) throw new Error(`digest missing for ${id}`);
  return value;
}

function requiredMapDigest(digests: ReadonlyMap<string, string>, id: string): string {
  const value = digests.get(id);
  if (value === undefined) throw new Error(`fixture digest missing for ${id}`);
  return value;
}

function syntheticSemanticPayload(caseId: string): unknown {
  return [
    {
      caseId,
      degrees: ["1", "3", "b3", "5", "b5", "#5", "b7", "7", "9", "11", "13", "bb7", "#9", "6", "b6"],
      required: ["1", "b5", "9", "11", "13"],
      optional: ["3"],
      guide: ["b7"],
      requiredDegrees: ["1", "b5", "9", "11", "13"],
      optionalDegrees: ["3"],
      guideToneDegrees: ["b7"],
      warnings: [{ code: "theory.omission_absent", path: ["omissions", 0] }],
      root: { step: "C", alter: 0 },
      degree: { number: 7, alter: -2 },
      spelled: { step: "G", alter: -2 },
      pitchClass: 9,
      spelledPitchNames: [
        { step: "C", alter: 0 },
        { step: "C", alter: 0 },
        { step: "E", alter: 0 },
      ],
      pitchClasses: [0, 0, 4],
      bass: { step: "D", alter: 0 },
      targetSnapshot: {
        root: { step: "D", alter: 0 },
        bass: { step: "E", alter: 0 },
      },
      inverseSnapshot: {
        root: { step: "C", alter: 0 },
        bass: { step: "D", alter: 0 },
      },
      realizations: [{ id: "a" }, { id: "b" }],
      variantOrder: ["a", "b"],
      ok: false,
      refusal: { code: "theory.unsupported", path: ["source", "triad"] },
      path: ["source", "triad"],
      cells: 1_750,
      successes: 1_700,
      refusals: 50,
      acceptedStates: 10,
      nested: {
        appendTarget: {
          degrees: ["1"],
          required: ["1"],
          optional: [],
          guide: [],
          requiredDegrees: ["1"],
          optionalDegrees: [],
          guideToneDegrees: [],
        },
        optionalFifth: {
          degrees: ["1", "5"],
          required: ["1"],
          optional: ["5"],
          requiredDegrees: ["1"],
          optionalDegrees: ["5"],
        },
        requiredFifth: {
          degrees: ["1", "5"],
          required: ["1", "5"],
          optional: [],
          requiredDegrees: ["1", "5"],
          optionalDegrees: [],
        },
        emptyWarnings: { warnings: [] },
        unsortedCustom: {
          spelledPitchNames: [
            { step: "E", alter: 0 },
            { step: "C", alter: 0 },
          ],
          pitchClasses: [4, 0],
        },
        formulaFreeCustom: {
          degrees: null,
          requiredDegrees: null,
          optionalDegrees: null,
          guideToneDegrees: null,
          pitchClasses: [0, 4],
        },
        acceptedResult: { ok: true, value: { degrees: ["1", "3"] } },
        bounds: [
          { field: "extensions", firstExcessIndex: 1, evidence: { inputDegreeRecordsVisited: 1 } },
          { field: "additions", firstExcessIndex: 7, evidence: { inputDegreeRecordsVisited: 7 } },
          { field: "alterations", firstExcessIndex: 8, evidence: { inputDegreeRecordsVisited: 8 } },
          { field: "omissions", firstExcessIndex: 2, evidence: { inputDegreeRecordsVisited: 2 } },
        ],
      },
    },
    { id: "precedence-near-miss", result: "second" },
  ];
}

let livePassingObservationCache: JsonRecord[] | null = null;

function livePassingObservations(): JsonRecord[] {
  if (livePassingObservationCache !== null) return livePassingObservationCache;
  const run = Bun.spawnSync({
    cmd: [
      process.execPath,
      "test",
      "tests/conformance/t1-laws-mutation-controls.test.ts",
      "tests/conformance/t1-production-conformance.test.ts",
    ],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (run.exitCode !== 0) {
    throw new Error(
      `live T1 conformance producers failed: ${run.stderr.toString().trim()}`,
    );
  }
  const marker = /^(?:T1_EVIDENCE_OBSERVATION |T1_CONFORMANCE_OBSERVATION )/;
  const records = run.stdout.toString().split(/\r?\n/).flatMap((line) => {
    if (!marker.test(line)) return [];
    const json = line.replace(marker, "");
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed)) throw new Error("live T1 observation is not an object");
    return [parsed];
  });
  const order = (record: JsonRecord): number => record["schema"] ===
      "changes.evidence.t1-production-conformance-observation.v1"
    ? 0
    : record["suite"] === "laws" ? 1 : 2;
  records.sort((left, right) => order(left) - order(right));
  if (records.length !== 3) {
    throw new Error(`expected 3 live T1 observations, received ${String(records.length)}`);
  }
  livePassingObservationCache = records;
  return records;
}

function passingObservations(): JsonRecord[] {
  if (process.env["JCPE_T1_STATIC_SYNTHETIC"] !== "1") {
    return livePassingObservations();
  }
  const bindings = buildT1CaseBindings();
  const bindingDigests = new Map(
    bindings.map(({ caseId, fixtureRecordSha256 }) => [caseId, fixtureRecordSha256]),
  );
  const productionCaseIds = t1ProductionCaseIds();
  const productionHashes = Object.fromEntries(
    productionCaseIds.map((caseId) => [
      caseId,
      requiredMapDigest(bindingDigests, caseId),
    ]),
  );
  const operationRows = t1OperationEvidenceRows();
  const operationEvidenceIds = operationRows.map((row) => {
    const id = row["id"];
    if (typeof id !== "string") throw new Error("operation row ID missing");
    return id;
  });
  const evidenceCountersById: Record<string, unknown> = Object.fromEntries(
    operationRows.map((row, index) => {
      const id = operationEvidenceIds[index];
      if (id === undefined) throw new Error("operation evidence ID missing");
      return [id, row["expectedEvidence"]] as const;
    }),
  );
  const operationEvidenceRecords = operationRows.map((row, index) => {
    const id = operationEvidenceIds[index];
    if (id === undefined) throw new Error("operation evidence ID missing");
    return observationRecord(id, T1_PRODUCTION_PRODUCER, {
      id,
      expectedEvidence: row["expectedEvidence"],
    });
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  const operationEvidenceDigests: Record<string, string> = Object.fromEntries(
    operationEvidenceRecords.map(({ caseId, observationDigest }) => [
      caseId,
      observationDigest,
    ]),
  );

  const lawIds = lawFixture.cases.map(({ id }) => id);
  const positiveCaseIds = lawFixture.cases.flatMap(({ positiveCaseIds }) => positiveCaseIds);
  const nearMissCaseIds = lawFixture.cases.flatMap(({ nearMissCaseIds }) => nearMissCaseIds);
  const transpositionCaseIds = lawFixture.cases.map(
    ({ transpositionCaseId }) => transpositionCaseId,
  );
  const observedCaseIds = bindings.map(({ caseId }) => caseId).sort();
  const lawObservationRecords = observedCaseIds.map((caseId) =>
    observationRecord(caseId, T1_LAWS_PRODUCER, syntheticSemanticPayload(caseId))
  );
  const observationDigests: Record<string, string> = Object.fromEntries(
    lawObservationRecords.map(({ caseId, observationDigest }) => [
      caseId,
      observationDigest,
    ]),
  );
  const lawObservationDigests = Object.fromEntries(
    lawIds.map((caseId) => [caseId, requiredDigest(observationDigests, caseId)]),
  );
  const traceCaseIds = [
    ...new Set(traceFixture.traces.flatMap(({ caseIds }) => caseIds)),
  ].sort();
  const lawProofRecords = lawFixture.cases.map((lawCase) => {
    const preimage = {
      lawCaseId: lawCase.id,
      producer: T1_LAWS_PRODUCER,
      positive: lawCase.positiveCaseIds.map((caseId) => ({
        caseId,
        observationDigest: requiredDigest(observationDigests, caseId),
      })),
      nearMiss: lawCase.nearMissCaseIds.map((caseId) => ({
        caseId,
        observationDigest: requiredDigest(observationDigests, caseId),
      })),
      transposition: {
        caseId: lawCase.transpositionCaseId,
        observationDigest: requiredDigest(
          observationDigests,
          lawCase.transpositionCaseId,
        ),
      },
      mutationControlIds: lawCase.mutationControlIds,
    };
    return { ...preimage, lawProofDigest: t1CanonicalDigest(preimage) };
  });
  const traceProofRecords = traceFixture.traces.map((trace) => {
    const preimage = {
      traceId: trace.id,
      requirement: trace.requirement,
      sourceRefs: trace.sourceRefs,
      producer: T1_LAWS_PRODUCER,
      cases: trace.caseIds.map((caseId) => ({
        caseId,
        observationDigest: requiredDigest(observationDigests, caseId),
      })),
      mutationControlIds: trace.mutationControlIds,
    };
    return { ...preimage, traceProofDigest: t1CanonicalDigest(preimage) };
  });
  const authorityProofRecords = provenanceFixture.authorities.map((authority) => {
    const preimage = {
      authorityId: authority.id,
      authorityClass: authority.authorityClass,
      sourceKind: authority.sourceKind,
      reviewState: authority.reviewState,
      sourceRefs: authority.sourceRefs,
      covers: authority.covers,
      producer: T1_LAWS_PRODUCER,
      cases: authority.caseIds.map((caseId) => ({
        caseId,
        observationDigest: requiredDigest(observationDigests, caseId),
      })),
      mutationControlIds: authority.mutationControlIds,
    };
    return { ...preimage, authorityProofDigest: t1CanonicalDigest(preimage) };
  });

  const mutationPartition = inspectT1ReviewedMutationLinkPartition();
  const linkedCaseIds = [
    ...new Set(mutationPartition.reviewedLinks.map(({ caseId }) => caseId)),
  ].sort();
  const mutationObservationDigests: Record<string, string> = Object.fromEntries(
    linkedCaseIds.map((caseId) => [
      caseId,
      requiredDigest(observationDigests, caseId),
    ]),
  );
  const mutationObservationRecords = linkedCaseIds.map((caseId) => {
    const record = lawObservationRecords.find((candidate) => candidate.caseId === caseId);
    if (record === undefined) throw new Error(`observation missing for ${caseId}`);
    return record;
  });
  const counterfactualExecutions = buildT1SemanticCounterfactualTestRecords(
    lawObservationRecords,
  );
  const controlExecutionDigests: Record<string, string> = {};
  for (const record of counterfactualExecutions) {
    const controlId = record["controlId"];
    const executionDigest = record["executionDigest"];
    if (typeof controlId !== "string" || typeof executionDigest !== "string") {
      throw new Error("counterfactual execution identity missing");
    }
    controlExecutionDigests[controlId] = executionDigest;
  }

  const productionCorpusDigests = {
    literalResults: "1".repeat(64),
    customResults: "2".repeat(64),
    allRootResults: "3".repeat(64),
    familyStatePublicOutcomes:
      formulaFixture.familyStateMatrix.expected.orderedPublicOutcomeSemanticSha256,
    publicDegreeSpellingOutcomes:
      spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256,
    precedenceResults: "4".repeat(64),
    operationEvidence: t1CanonicalDigest(operationEvidenceRecords),
  };

  return [
    signed({
      schema: "changes.evidence.t1-production-conformance-observation.v1",
      producer: T1_PRODUCTION_PRODUCER,
      fixtureCaseIds: productionCaseIds,
      fixtureCaseHashes: productionHashes,
      counts: {
        literalCases: 88,
        customCases: 9,
        allRootCells: 396,
        familyStates: 896,
        publicDegreeSpellingCells: 1_750,
        operationStateCases: 10,
        evidenceRows: 12,
      },
      executionCounts: {
        precedenceRows: 24,
        standaloneSpellingEvidenceRows: 2,
        resolutionEvidenceRows: 12,
        operationEvidenceRows: 14,
      },
      evidenceCountersById,
      operationEvidenceIds,
      operationEvidenceDigests,
      operationEvidenceRecords,
      corpusDigests: productionCorpusDigests,
      combinedCorpusDigest: t1CanonicalDigest(productionCorpusDigests),
      reviewedFamilyStatePublicOutcomeDigest:
        formulaFixture.familyStateMatrix.expected.orderedPublicOutcomeSemanticSha256,
      reviewedPublicDegreeSpellingDigest:
        spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256,
      status: "pass",
    }),
    signed({
      schema: "changes.evidence.t1-conformance-observation.v1",
      suite: "laws",
      producer: T1_LAWS_PRODUCER,
      seed: "changes.t1-laws.seed.v1:5411c0de",
      deterministicReplayRuns: 2,
      lawIds,
      lawsObserved: lawIds.length,
      positiveCaseIds,
      nearMissCaseIds,
      transpositionCaseIds,
      formulaMatrixCells: 396,
      familyStateCells: 896,
      standaloneSpellingCells: 1_750,
      formulaMatrixSemanticDigest:
        formulaFixture.familyStateMatrix.expected.orderedCellSemanticSha256,
      familyStatePublicSemanticDigest:
        formulaFixture.familyStateMatrix.expected.orderedPublicOutcomeSemanticSha256,
      standaloneSpellingSemanticDigest:
        spellingFixture.publicDegreeMatrix.expected.orderedCellSemanticSha256,
      traceCaseIds,
      traceCasesObserved: traceCaseIds.length,
      traceCasesUnaccounted: [],
      observedCaseIds,
      observationRecords: lawObservationRecords,
      observationDigests,
      lawObservationDigests,
      observationInventoryDigest: t1ObservationInventoryDigest(lawObservationRecords),
      lawProofRecords,
      traceProofRecords,
      authorityProofRecords,
      runtimeExecutions: {
        parser: 1,
        resolver: 1,
        evidenceResolver: 1,
        speller: 1,
        domainConstructor: 1,
      },
      assertionCount: 1,
      status: "pass",
    }),
    signed({
      schema: "changes.evidence.t1-conformance-observation.v1",
      suite: "mutation-controls",
      producer: T1_LAWS_PRODUCER,
      fixtureSchema: mutationFixture.schema,
      fixtureVersion: mutationFixture.fixtureVersion,
      productionOutputUsed: mutationFixture.productionOutputUsed,
      expectedValuesGenerated: mutationFixture.expectedValuesGenerated,
      reviewState: mutationFixture.reviewState,
      claim: "executable-semantic-counterfactuals-not-source-mutants",
      classification: "executable-semantic-counterfactuals-not-source-mutants",
      seed: "changes.t1-laws.seed.v1:5411c0de",
      controlIds: mutationFixture.controls.map(({ id }) => id),
      controlsDefined: mutationFixture.controls.length,
      reviewedControlsDischarged: mutationFixture.controls.length,
      mappedButUnobserved: 0,
      semanticCounterfactualsExecuted: mutationFixture.controls.length,
      semanticCounterfactualsKilled: mutationFixture.controls.length,
      semanticCounterfactualsSurvived: 0,
      sourceMutantsExecuted: 0,
      sourceMutantsKilled: 0,
      requiredFaultFamilies: mutationFixture.requiredFaultFamilies,
      faultFamiliesObserved: [
        ...new Set(mutationFixture.controls.map(({ faultFamily }) => faultFamily)),
      ].sort(),
      counterfactualExecutions,
      linkedCaseIds,
      linkedCaseLinks: mutationPartition.reviewedLinks.length,
      reviewedCaseLinks: mutationPartition.reviewedLinks.length,
      reviewedCaseLinkInventorySha256:
        mutationPartition.reviewedLinkInventorySha256,
      directKillerLinksReviewed: mutationPartition.directLinks.length,
      directKillerLinksExecuted: mutationPartition.directLinks.length,
      directKillerLinksKilled: mutationPartition.directLinks.length,
      directKillerLinksSurvived: 0,
      directKillerLinkInventorySha256: mutationPartition.directLinkInventorySha256,
      corroborativeLinksReviewed: mutationPartition.corroborativeLinks.length,
      corroborativeLinksObserved: mutationPartition.corroborativeLinks.length,
      corroborativeLinksUnobserved: 0,
      corroborativeLinkInventorySha256:
        mutationPartition.corroborativeLinkInventorySha256,
      linkedCasesObserved: linkedCaseIds.length,
      linkedCasesUnaccounted: [],
      observationDigests: mutationObservationDigests,
      caseObservationRecords: mutationObservationRecords,
      observationInventoryDigest:
        t1ObservationInventoryDigest(mutationObservationRecords),
      controlExecutionDigests,
      runtimeExecutions: 3,
      runtimeExecutionCounts: {
        parser: 1,
        resolver: 1,
        evidenceResolver: 1,
        speller: 1,
        domainConstructor: 1,
      },
      status: "pass",
    }),
  ];
}

function focusedSummary() {
  const cases = [
    {
      file: "tests/conformance/t1-laws-mutation-controls.test.ts",
      name: T1_LAWS_PRODUCER.testcase,
    },
    {
      file: "tests/conformance/t1-production-conformance.test.ts",
      name: T1_PRODUCTION_PRODUCER.testcase,
    },
  ];
  return {
    tests: cases.length,
    assertions: cases.length,
    failures: 0,
    errors: 0,
    skipped: 0,
    files: cases.map(({ file }) => file),
    cases,
  };
}

describe("T1 evidence verifier self-controls", () => {
  test("binds the dedicated TypeScript project to the exact focused suite", async () => {
    const config = await Bun.file(
      new URL("../../tsconfig.t1-tests.json", import.meta.url),
    ).json() as { include?: unknown; files?: unknown };
    expect(config.include).toEqual([]);
    expect(config.files).toEqual([...T1_FOCUSED_TEST_FILES]);
    expect(await runNodeTool("tsc", [
      "-p",
      "tsconfig.t1-tests.json",
      "--noEmit",
      "--pretty",
      "false",
    ])).toBe(0);
  }, 600_000);

  test("keeps the focused authority, fixture, count, and applicability inventories exact", () => {
    expect(T1_FOCUSED_TEST_FILES).toHaveLength(12);
    expect([...T1_FOCUSED_TEST_FILES]).toEqual([...T1_FOCUSED_TEST_FILES].sort());
    expect(T1_FIXTURE_FILES).toHaveLength(11);
    expect(T1_INPUT_GROUPS.production).toEqual(["src/**/*"]);
    expect(T1_INPUT_GROUPS.tools).toContain("scripts/run-node-tool.ts");
    expect(T1_INPUT_GROUPS.fixtures).toContain("tests/fixtures/resolution/**/*");
    expect(T1_INPUT_GROUPS.fixtures).toContain("tests/fixtures/foundation/*.json");
    expect(T1_INPUT_GROUPS.fixtures).toContain("tests/fixtures/typescript/*.d.ts");
    const sharedValidatorCounts = Object.fromEntries(
      Object.entries(T1_VALIDATOR_COUNTS).filter(([key]) => ![
        "mutationDirectKillerLinks",
        "mutationCorroborativeLinks",
        "mutationReviewedCaseLinks",
      ].includes(key)),
    );
    expect(T1_EXPECTED_COUNTS as unknown).toEqual({
      ...sharedValidatorCounts,
      resolutionEvidenceRows: 12,
      operationEvidenceRows: 14,
      mutationLinkedCases: 90,
      mutationDirectLinks: 124,
      mutationCorroborativeLinks: 16,
      mutationLinks: 140,
    });
    expect(traceFixture.traces).toHaveLength(13);
    expect(mutationFixture.controls).toHaveLength(53);
    expect(T1_REVIEWED_MUTATION_LINK_INVENTORY_SHA256).toBe(
      "fbf7124754ba69ec01ef246d4f42ba637b0f75effc95745d39a2cff55430b261",
    );
    const partition = inspectT1ReviewedMutationLinkPartition();
    expect(partition.findings).toEqual([]);
    expect(partition.reviewedLinks).toHaveLength(140);
    expect(partition.directLinks).toHaveLength(124);
    expect(partition.corroborativeLinks).toHaveLength(16);
    expect(partition.reviewedLinkInventorySha256).toBe(
      T1_REVIEWED_MUTATION_LINK_INVENTORY_SHA256,
    );
    expect(partition.directLinkInventorySha256).toBe(
      T1_DIRECT_MUTATION_LINK_INVENTORY_SHA256,
    );
    expect(partition.corroborativeLinkInventorySha256).toBe(
      T1_CORROBORATIVE_MUTATION_LINK_INVENTORY_SHA256,
    );
    expect(t1OperationEvidenceRows()).toHaveLength(14);
    expect(T1_APPLICABILITY.find(({ id }) => id === "network")?.applicability)
      .toBe("not-applicable");
    expect(T1_APPLICABILITY.find(({ id }) => id === "semantic-publication")?.owner)
      .toBe("F3");
  });

  test("removes hostnames and rejects forged JUnit summaries", () => {
    const raw = '<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0"><testsuite name="proof" hostname="private-host"><testcase file="tests/proof.test.ts" name="works" /></testsuite></testsuites>';
    const sanitized = sanitizeT1JUnit(raw);
    expect(sanitized).not.toContain("private-host");
    expect(inspectT1JUnit(sanitized)).toEqual({
      summary: {
        tests: 1,
        assertions: 2,
        failures: 0,
        errors: 0,
        skipped: 0,
        files: ["tests/proof.test.ts"],
        cases: [{ file: "tests/proof.test.ts", name: "works" }],
      },
      findings: [],
    });
    expect(inspectT1JUnit(raw.replace('tests="1"', 'tests="2"')).summary).toBeNull();
    expect(inspectT1JUnit(raw.replace("</testsuites>", "")).summary).toBeNull();
  });

  test("rejects skipped, todo, exclusive, failing, quarantine, retry, and expected-failure controls", () => {
    const findings = inspectT1TestControls("synthetic.test.ts", `
      import { test as spec } from "bun:test";
      import * as bt from "bun:test";
      const alias = spec;
      alias.skip("skip", () => {});
      spec.todo("todo");
      bt.test["only"]("only", () => {});
      spec.failing("failing", () => {});
      quarantine("known flaky");
      spec("retry", () => {}, { retry: 2 });
      spec("expected", () => {}, { expectedFailure: true });
    `);
    const codes = findings.map(({ code }) => code);
    expect(codes).toContain("T1_EVIDENCE_TODO");
    expect(codes).toContain("T1_EVIDENCE_QUARANTINE");
    expect(codes).toContain("T1_EVIDENCE_RETRY");
    expect(codes).toContain("T1_EVIDENCE_EXPECTED_FAILURE");
  });

  test("requires exactly signed production, law, and reviewed-control observations", () => {
    const records = passingObservations();
    expect(inspectT1ObservationRecords(records)).toEqual([]);
    const output = [
      `T1_EVIDENCE_OBSERVATION ${JSON.stringify(records[0])}`,
      `T1_CONFORMANCE_OBSERVATION ${JSON.stringify(records[1])}`,
      `T1_CONFORMANCE_OBSERVATION ${JSON.stringify(records[2])}`,
    ].join("\n");
    expect(parseT1Observations(output).findings).toEqual([]);
    const lawRecords = records[1]?.["observationRecords"];
    expect(inspectT1CaseObservationRecords(lawRecords, T1_LAWS_PRODUCER).findings)
      .toEqual([]);

    const forgedRuntime = structuredClone(records);
    const forgedLaw = forgedRuntime[1];
    if (forgedLaw === undefined || !Array.isArray(forgedLaw["observationRecords"])) {
      throw new Error("law observation records missing");
    }
    const forgedRecord: unknown = forgedLaw["observationRecords"][0];
    if (!isRecord(forgedRecord) || typeof forgedRecord["caseId"] !== "string") {
      throw new Error("law observation record malformed");
    }
    const fixtureHash = buildT1CaseBindings().find(({ caseId }) =>
      caseId === forgedRecord["caseId"]
    )?.fixtureRecordSha256;
    if (fixtureHash === undefined) throw new Error("fixture hash missing");
    forgedRecord["observationDigest"] = fixtureHash;
    forgedRuntime[1] = resigned(forgedLaw);
    expect(inspectT1ObservationRecords(forgedRuntime).map(({ code }) => code))
      .toContain("T1_EVIDENCE_OBSERVATION_PREIMAGE");

    const arbitraryDigest = structuredClone(records);
    const arbitraryLaw = arbitraryDigest[1];
    if (arbitraryLaw === undefined || !Array.isArray(arbitraryLaw["observationRecords"])) {
      throw new Error("law observation records missing");
    }
    const arbitraryRecord: unknown = arbitraryLaw["observationRecords"][0];
    if (!isRecord(arbitraryRecord)) {
      throw new Error("law observation record malformed");
    }
    arbitraryRecord["observationDigest"] = "a".repeat(64);
    arbitraryDigest[1] = resigned(arbitraryLaw);
    expect(inspectT1ObservationRecords(arbitraryDigest).map(({ code }) => code))
      .toContain("T1_EVIDENCE_OBSERVATION_PREIMAGE");

    const productionTampered = structuredClone(records);
    const production = productionTampered[0];
    if (production === undefined) throw new Error("production observation missing");
    const counters = production["evidenceCountersById"];
    if (typeof counters !== "object" || counters === null || Array.isArray(counters)) {
      throw new Error("operation counter inventory missing");
    }
    const firstCounter = Object.keys(counters)[0];
    if (firstCounter === undefined) throw new Error("operation counter missing");
    production["evidenceCountersById"] = {
      ...counters,
      [firstCounter]: { termination: "complete" },
    };
    productionTampered[0] = resigned(production);
    expect(inspectT1ObservationRecords(productionTampered).map(({ code }) => code))
      .toContain("T1_EVIDENCE_PRODUCTION_INVENTORY");

    for (const field of ["result", "evidence"] as const) {
      const operationTampered = structuredClone(records);
      const operationProduction = operationTampered[0];
      const operationRecords = operationProduction?.["operationEvidenceRecords"];
      const operationDigests = operationProduction?.["operationEvidenceDigests"];
      if (
        operationProduction === undefined ||
        !Array.isArray(operationRecords) ||
        !isRecord(operationDigests)
      ) {
        throw new Error("operation evidence inventory missing");
      }
      const operationRecord: unknown = operationRecords[0];
      if (
        !isRecord(operationRecord) ||
        typeof operationRecord["caseId"] !== "string" ||
        !isRecord(operationRecord["payload"])
      ) {
        throw new Error("operation evidence record malformed");
      }
      operationRecord["payload"][field] = field === "result"
        ? { ok: false, refusal: { code: "forged.rehashed.result" } }
        : { termination: "complete" };
      const observationDigest = resignCaseObservationRecord(operationRecord);
      operationProduction["operationEvidenceDigests"] = {
        ...operationDigests,
        [operationRecord["caseId"]]: observationDigest,
      };
      operationTampered[0] = resigned(operationProduction);
      expect(inspectT1ObservationRecords(operationTampered).map(({ code }) => code))
        .toContain("T1_EVIDENCE_PRODUCTION_INVENTORY");
    }

    const familyTampered = structuredClone(records);
    const familyProduction = familyTampered[0];
    if (familyProduction === undefined ||
      !isRecord(familyProduction["familyStateOutcomeCounts"])) {
      throw new Error("family-state outcome inventory missing");
    }
    familyProduction["familyStateOutcomeCounts"] = {
      ...familyProduction["familyStateOutcomeCounts"],
      accepted: 65,
    };
    familyTampered[0] = resigned(familyProduction);
    expect(inspectT1ObservationRecords(familyTampered).map(({ code }) => code))
      .toContain("T1_EVIDENCE_PRODUCTION_INVENTORY");

    const trapTampered = structuredClone(records);
    const trapProduction = trapTampered[0];
    const trapObservations = trapProduction?.["firstExcessTailReadTrapObservations"];
    const trapCorpus = trapProduction?.["corpusDigests"];
    if (trapProduction === undefined || !Array.isArray(trapObservations) ||
      !isRecord(trapCorpus) || !isRecord(trapObservations[0]) ||
      !isRecord(trapObservations[0]["publicReads"])) {
      throw new Error("first-excess read-trap inventory missing");
    }
    trapObservations[0]["publicReads"]["extensions"] = 3;
    trapCorpus["firstExcessTailReadTraps"] = t1CanonicalDigest(trapObservations);
    trapProduction["combinedCorpusDigest"] = t1CanonicalDigest(trapCorpus);
    trapTampered[0] = resigned(trapProduction);
    expect(inspectT1ObservationRecords(trapTampered).map(({ code }) => code))
      .toContain("T1_EVIDENCE_PRODUCTION_INVENTORY");

    const corpusTampered = structuredClone(records);
    const corpusProduction = corpusTampered[0];
    if (corpusProduction === undefined || !isRecord(corpusProduction["corpusDigests"])) {
      throw new Error("production corpus inventory missing");
    }
    corpusProduction["corpusDigests"]["operationEvidence"] = "f".repeat(64);
    corpusProduction["combinedCorpusDigest"] = t1CanonicalDigest(
      corpusProduction["corpusDigests"],
    );
    corpusTampered[0] = resigned(corpusProduction);
    expect(inspectT1ObservationRecords(corpusTampered).map(({ code }) => code))
      .toContain("T1_EVIDENCE_PRODUCTION_INVENTORY");

    const lawTampered = structuredClone(records);
    const law = lawTampered[1];
    if (law === undefined) throw new Error("law observation missing");
    const observedIds = law["observedCaseIds"];
    const observedDigests = law["observationDigests"];
    if (!Array.isArray(observedIds) || typeof observedDigests !== "object" ||
      observedDigests === null || Array.isArray(observedDigests)) {
      throw new Error("law case inventory missing");
    }
    law["observedCaseIds"] = observedIds.filter((id) => id !== "T1-OPSTATE-010");
    law["observationDigests"] = Object.fromEntries(
      Object.entries(observedDigests).filter(([id]) => id !== "T1-OPSTATE-010"),
    );
    lawTampered[1] = resigned(law);
    expect(inspectT1ObservationRecords(lawTampered).map(({ code }) => code))
      .toContain("T1_EVIDENCE_LAW_INVENTORY");

    const predicateSubstituted = structuredClone(records);
    const substitutedLaw = predicateSubstituted[1];
    if (substitutedLaw === undefined ||
      !Array.isArray(substitutedLaw["observationRecords"]) ||
      !isRecord(substitutedLaw["observationDigests"]) ||
      !isRecord(substitutedLaw["lawObservationDigests"]) ||
      !Array.isArray(substitutedLaw["lawProofRecords"]) ||
      !Array.isArray(substitutedLaw["traceProofRecords"]) ||
      !Array.isArray(substitutedLaw["authorityProofRecords"])) {
      throw new Error("law predicate dependency graph missing");
    }
    const lawCaseId = "T1-LAW-001";
    const substitutedObservation = (
      substitutedLaw["observationRecords"] as unknown[]
    ).find(
      (candidate) => isRecord(candidate) && candidate["caseId"] === lawCaseId,
    );
    if (!isRecord(substitutedObservation) ||
      !isRecord(substitutedObservation["payload"]) ||
      !isRecord(substitutedObservation["payload"]["semanticPredicate"]) ||
      !isRecord(
        substitutedObservation["payload"]["semanticPredicate"]["evidence"],
      )) {
      throw new Error("reviewed law predicate preimage missing");
    }
    const substitutedPredicate = {
      ...substitutedObservation["payload"]["semanticPredicate"],
      evidence: {
        ...substitutedObservation["payload"]["semanticPredicate"]["evidence"],
        fullyRehashedSubstitution: true,
      },
    };
    substitutedObservation["payload"]["semanticPredicate"] = substitutedPredicate;
    const substitutedObservationDigest = resignCaseObservationRecord(
      substitutedObservation,
    );
    substitutedLaw["observationDigests"][lawCaseId] =
      substitutedObservationDigest;
    substitutedLaw["lawObservationDigests"][lawCaseId] = t1CanonicalDigest(
      substitutedObservation["payload"],
    );
    substitutedLaw["observationInventoryDigest"] = t1CanonicalDigest(
      substitutedLaw["observationRecords"],
    );
    const rehashProof = (record: JsonRecord, digestKey: string): void => {
      record[digestKey] = t1CanonicalDigest(Object.fromEntries(
        Object.entries(record).filter(([key]) => key !== digestKey),
      ));
    };
    const substitutedLawProof = (
      substitutedLaw["lawProofRecords"] as unknown[]
    ).find(
      (candidate) => isRecord(candidate) && candidate["lawCaseId"] === lawCaseId,
    );
    if (!isRecord(substitutedLawProof)) {
      throw new Error("reviewed law proof missing");
    }
    substitutedLawProof["lawObservationDigest"] = substitutedObservationDigest;
    substitutedLawProof["semanticPredicate"] = substitutedPredicate;
    substitutedLawProof["semanticPredicateDigest"] =
      t1CanonicalDigest(substitutedPredicate);
    rehashProof(substitutedLawProof, "lawProofDigest");
    for (const [proofs, digestKey] of [
      [substitutedLaw["traceProofRecords"], "traceProofDigest"],
      [substitutedLaw["authorityProofRecords"], "authorityProofDigest"],
    ] as const) {
      for (const proof of proofs) {
        if (!isRecord(proof) || !Array.isArray(proof["cases"])) continue;
        let changed = false;
        for (const linkedCase of proof["cases"]) {
          if (isRecord(linkedCase) && linkedCase["caseId"] === lawCaseId) {
            linkedCase["observationDigest"] = substitutedObservationDigest;
            changed = true;
          }
        }
        if (changed) rehashProof(proof, digestKey);
      }
    }
    predicateSubstituted[1] = resigned(substitutedLaw);
    expect(inspectT1ObservationRecords(predicateSubstituted).map(({ code }) => code))
      .toEqual(["T1_EVIDENCE_LAW_INVENTORY"]);

    const mutationTampered = structuredClone(records);
    const mutation = mutationTampered[2];
    if (mutation === undefined) throw new Error("mutation observation missing");
    const controlDigests = mutation["controlExecutionDigests"];
    if (typeof controlDigests !== "object" || controlDigests === null ||
      Array.isArray(controlDigests)) {
      throw new Error("control digest inventory missing");
    }
    const firstControl = Object.keys(controlDigests)[0];
    if (firstControl === undefined) throw new Error("control digest missing");
    mutation["controlExecutionDigests"] = {
      ...controlDigests,
      [firstControl]: "f".repeat(64),
    };
    mutationTampered[2] = resigned(mutation);
    expect(inspectT1ObservationRecords(mutationTampered).map(({ code }) => code))
      .toContain("T1_EVIDENCE_MUTATION_INVENTORY");

    const unsignedTamper = structuredClone(records);
    const first = unsignedTamper[0];
    if (first === undefined) throw new Error("production observation missing");
    first["status"] = "fail";
    expect(inspectT1ObservationRecords(unsignedTamper).map(({ code }) => code))
      .toContain("T1_EVIDENCE_OBSERVATION_DIGEST");
    expect(inspectT1ObservationRecords(records.slice(0, 2)).map(({ code }) => code))
      .toContain("T1_EVIDENCE_OBSERVATION_INVENTORY");
  }, 180_000);

  test("hashes the complete fixture inventory and recomputes all 13 traces", () => {
    const bindings = buildT1CaseBindings();
    expect(bindings).toHaveLength(340);
    expect(new Set(bindings.map(({ caseId }) => caseId)).size).toBe(bindings.length);
    expect(bindings.every(({ fixtureRecordSha256 }) =>
      /^[a-f0-9]{64}$/.test(fixtureRecordSha256)
    )).toBe(true);
    const traces = buildT1TraceEvidence(
      passingObservations(),
      bindings,
      focusedSummary(),
      "pass",
    );
    expect(traces).toHaveLength(13);
    expect(traces.every(({ outcome }) => outcome === "pass")).toBe(true);
    const first = traces[0];
    if (first === undefined) throw new Error("trace evidence missing");
    expect(validateT1TraceEvidenceRows([...traces, first], traces).map(({ code }) => code))
      .toContain("T1_EVIDENCE_TRACE_INVENTORY");
    const tampered = traces.map((row, index) => index === 0
      ? {
          ...row,
          mutationObservationSha256: "e".repeat(64),
        }
      : row);
    expect(validateT1TraceEvidenceRows(tampered, traces)[0]?.traceId).toBe(first.traceId);
  }, 180_000);

  test("recomputes all 53 reviewed controls and rejects duplicate or altered rows", () => {
    const mutation = buildT1MutationEvidence(
      passingObservations(),
      buildT1CaseBindings(),
    );
    expect(mutation.reviewedControls).toBe(53);
    expect(mutation.reviewedControlsDischarged).toBe(53);
    expect(mutation.reviewedControlsUndischarged).toBe(0);
    expect(mutation.reviewedControlsUnobserved).toBe(0);
    expect(mutation.reviewedControlsInvalid).toBe(0);
    expect(mutation.semanticCounterfactualsExecuted).toBe(53);
    expect(mutation.semanticCounterfactualsKilled).toBe(53);
    expect(mutation.semanticCounterfactualsSurvived).toBe(0);
    expect(mutation.directKillerLinksReviewed).toBe(124);
    expect(mutation.directKillerLinksExecuted).toBe(124);
    expect(mutation.directKillerLinksKilled).toBe(124);
    expect(mutation.directKillerLinksSurvived).toBe(0);
    expect(mutation.corroborativeLinksReviewed).toBe(16);
    expect(mutation.corroborativeLinksObserved).toBe(16);
    expect(mutation.corroborativeLinksUnobserved).toBe(0);
    expect(mutation.reviewedCaseLinks).toBe(140);
    expect(mutation.sourceMutantsExecuted).toBe(0);
    expect(mutation.sourceMutantsKilled).toBe(0);
    expect(mutation.outcome).toBe("pass");
    expect(new Set(mutation.rows.map(({ controlObservationSha256 }) =>
      controlObservationSha256
    )).size).toBe(53);
    const first = mutation.rows[0];
    if (first === undefined) throw new Error("mutation row missing");
    expect(validateT1MutationEvidenceRows({
      ...mutation,
      rows: [...mutation.rows, first],
    }, mutation).map(({ code }) => code)).toContain("T1_EVIDENCE_MUTATION_INVENTORY");
    expect(validateT1MutationEvidenceRows({
      ...mutation,
      rows: mutation.rows.map((row, index) => index === 0
        ? { ...row, controlObservationSha256: "d".repeat(64) }
        : row),
    }, mutation)[0]?.path).toContain(first.controlId);
  }, 180_000);

  test("rejects malformed or identity-free ledgers", () => {
    expect(validateT1EvidenceCandidate({}, "a".repeat(64)).map(({ code }) => code))
      .toContain("T1_EVIDENCE_LEDGER_IDENTITY");
    expect(validateT1EvidenceCandidate(null, "a".repeat(64)).map(({ code }) => code))
      .toEqual(["T1_EVIDENCE_LEDGER_SHAPE"]);
  });
});
