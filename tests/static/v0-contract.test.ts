import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_VOICING_CONSTRAINT_OBSERVATION_COMPARISONS,
  MAX_VOICING_HARD_CONSTRAINT_CHECKS,
  MAX_VOICING_OUTPUT_VOICE_RECORDS,
  MAX_VOICING_PAIRWISE_CANDIDATE_COMPARISONS,
  MAX_VOICING_PEAK_SEARCH_STATES,
  MAX_VOICING_RAW_CANDIDATES,
  MAX_VOICING_RAW_VOICE_RECORDS,
  MAX_VOICING_REGISTER_PLACEMENTS,
  MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
  MAX_VOICING_RETAINED_CANDIDATES,
  MAX_VOICING_SEARCH_STATE_EXPANSIONS,
  MAX_VOICING_TEMPLATE_DEGREE_SLOTS,
  MAX_VOICING_TEMPLATE_ROWS,
  MAX_VOICING_TRACKED_RECORDS,
  QUARTAL_ALLOWED_ADJACENCY_SEMITONES,
  VOICING_CANDIDATES_CONTRACT_SCHEMA,
  VOICING_CANDIDATE_IDS,
  VOICING_CANDIDATE_ORDER,
  VOICING_CANDIDATE_PAYLOAD_LIMITS,
  VOICING_CANDIDATE_SCHEMA,
  VOICING_CONSTRAINT_OBSERVATION_POLICY_ID,
  VOICING_CONSTRAINT_OBSERVATION_POLICY_VERSION,
  VOICING_CONSTRAINT_PRECEDENCE,
  VOICING_EVIDENCE_CODES,
  VOICING_FAMILIES,
  VOICING_FAMILY_REGISTER_POLICY_IDS,
  VOICING_IDENTIFIER_LIMITS,
  VOICING_LOCAL_SCORE_AXIS_ORDER,
  VOICING_LOW_REGISTER_SPACING_BANDS,
  VOICING_MEMORY_LIMITS,
  VOICING_OPERATION_NAMES,
  VOICING_QUALITY_CLASSES,
  VOICING_REGISTER_SLOT_ORDER_POLICIES,
  VOICING_REFUSAL_PRECEDENCE,
  VOICING_REQUEST_SCHEMA,
  VOICING_RESULT_SCHEMA,
  VOICING_TEMPLATE_SCHEMA,
  VOICING_TEMPLATE_SELECTION_MODES,
  VOICING_TERMINATIONS,
  VOICING_TRACKED_RECORD_ACCOUNTING,
  VOICING_TRACKED_RECORD_POPULATION_LIMITS,
  VOICING_TRACKED_RECORD_POPULATIONS,
  VOICING_WORK_LIMITS,
} from "../../src/theory";
import {
  V0_REVIEWED_COMPANIONS,
  validateV0Contract,
  type V0ContractValidationReport,
} from "../../scripts/validate-v0-contract";
import {
  evaluateV0NegativeWitnessExecutionEvidence,
  executeV0LawWitness,
} from "../support/v0-conformance-harness";

setDefaultTimeout(60_000);

type MutableJsonObject = Record<string, unknown>;

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/voicing", import.meta.url),
);

function mutableObject(value: unknown): MutableJsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a mutable JSON object.");
  }
  return value as MutableJsonObject;
}

function mutableObjects(value: unknown): MutableJsonObject[] {
  if (!Array.isArray(value)) throw new TypeError("Expected a mutable JSON array.");
  return value.map(mutableObject);
}

async function editFixtureJson(
  root: string,
  filename: string,
  edit: (document: MutableJsonObject) => void,
): Promise<void> {
  const path = join(root, filename);
  const document = mutableObject(
    JSON.parse(await readFile(path, "utf8")) as unknown,
  );
  edit(document);
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

async function validateFixtureCopy(
  edit: (root: string) => Promise<void>,
): Promise<V0ContractValidationReport> {
  const root = await mkdtemp(join(tmpdir(), "changes-v0-contract-"));
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await edit(root);
    return await validateV0Contract(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function findingCodes(report: V0ContractValidationReport): readonly string[] {
  return report.findings.map((finding) => finding.code);
}

describe("V0 public voicing-candidate contract", () => {
  test("exports the exact identities, ordered vocabularies, and structural bounds", () => {
    expect({
      contract: VOICING_CANDIDATES_CONTRACT_SCHEMA,
      request: VOICING_REQUEST_SCHEMA,
      result: VOICING_RESULT_SCHEMA,
      candidate: VOICING_CANDIDATE_SCHEMA,
      template: VOICING_TEMPLATE_SCHEMA,
    }).toEqual({
      contract: "changes.theory.voicing-candidates-contract.v1",
      request: "changes.theory.voicing-request.v1",
      result: "changes.theory.voicing-result.v1",
      candidate: "changes.theory.voicing-candidate.v1",
      template: "changes.theory.voicing-family-template.v1",
    });
    expect(VOICING_OPERATION_NAMES).toEqual(["realizeVoicing"]);
    expect(VOICING_FAMILIES).toEqual([
      "balanced",
      "shell",
      "rootless-a",
      "rootless-b",
      "open",
      "drop2",
      "quartal",
    ]);
    expect(VOICING_QUALITY_CLASSES).toHaveLength(16);
    expect(VOICING_TEMPLATE_SELECTION_MODES).toEqual([
      "realization-roles",
      "fixed-degree-sequence",
      "quartal-context-sequence",
    ]);
    expect(VOICING_FAMILY_REGISTER_POLICY_IDS).toEqual([
      "balanced-register-v1",
      "fixed-template-register-v1",
      "open-register-v1",
      "drop2-register-v1",
      "quartal-register-v1",
    ]);
    expect(VOICING_REGISTER_SLOT_ORDER_POLICIES).toEqual([
      "selected-degree-register-weave-v1",
      "template-low-to-high",
      "closed-source-low-to-high",
      "quartal-context-low-to-high",
    ]);
    expect(QUARTAL_ALLOWED_ADJACENCY_SEMITONES).toEqual([5, 6]);
    expect(VOICING_LOW_REGISTER_SPACING_BANDS).toEqual([
      { maximumLowerMidi: 35, minimumSemitones: 10 },
      { maximumLowerMidi: 47, minimumSemitones: 7 },
      { maximumLowerMidi: 59, minimumSemitones: 4 },
      { maximumLowerMidi: 127, minimumSemitones: 1 },
    ]);
    expect(VOICING_LOCAL_SCORE_AXIS_ORDER).toHaveLength(6);
    expect(VOICING_CANDIDATE_ORDER).toHaveLength(6);
    expect(VOICING_CONSTRAINT_PRECEDENCE).toEqual([
      "voicing.constraint.realization_membership",
      "voicing.constraint.template_degree_membership",
      "voicing.constraint.voice_count",
      "voicing.constraint.midi_range",
      "voicing.constraint.required_degrees",
      "voicing.constraint.guide_tones",
      "voicing.constraint.identity_tones",
      "voicing.constraint.bass_policy",
      "voicing.constraint.slash_bass_lowest",
      "voicing.constraint.external_bass_excluded",
      "voicing.constraint.rootless_root_omitted",
      "voicing.constraint.unique_midi",
      "voicing.constraint.permitted_doubling",
      "voicing.constraint.low_register_spacing",
      "voicing.constraint.family_structure",
      "voicing.constraint.quartal_context",
    ]);
    expect(VOICING_EVIDENCE_CODES).toEqual([
      "voicing.evidence.quality_classified",
      "voicing.evidence.template_selected",
      "voicing.evidence.realization_bound",
      "voicing.evidence.register_enumerated",
      "voicing.evidence.family_transform",
      "voicing.evidence.constraints_checked",
      "voicing.evidence.local_score",
      "voicing.evidence.stable_retention",
      "voicing.evidence.quartal_context",
    ]);
    expect(VOICING_REFUSAL_PRECEDENCE).toHaveLength(7);
    expect(VOICING_TERMINATIONS).toHaveLength(9);
    expect(VOICING_CANDIDATE_IDS).toHaveLength(24);
  });

  test("pins every generation, output, search, and memory limit", () => {
    expect({
      rawCandidates: MAX_VOICING_RAW_CANDIDATES,
      retainedCandidates: MAX_VOICING_RETAINED_CANDIDATES,
      registerPlacements: MAX_VOICING_REGISTER_PLACEMENTS,
      searchStateExpansions: MAX_VOICING_SEARCH_STATE_EXPANSIONS,
      peakSearchStates: MAX_VOICING_PEAK_SEARCH_STATES,
      hardConstraintChecks: MAX_VOICING_HARD_CONSTRAINT_CHECKS,
      constraintObservationComparisons:
        MAX_VOICING_CONSTRAINT_OBSERVATION_COMPARISONS,
      refusalConstraintObservations:
        MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
      pairwiseCandidateComparisons:
        MAX_VOICING_PAIRWISE_CANDIDATE_COMPARISONS,
      rawVoiceRecords: MAX_VOICING_RAW_VOICE_RECORDS,
      outputVoiceRecords: MAX_VOICING_OUTPUT_VOICE_RECORDS,
      templateRows: MAX_VOICING_TEMPLATE_ROWS,
      templateDegreeSlots: MAX_VOICING_TEMPLATE_DEGREE_SLOTS,
      trackedRecords: MAX_VOICING_TRACKED_RECORDS,
    }).toEqual({
      rawCandidates: 96,
      retainedCandidates: 24,
      registerPlacements: 176,
      searchStateExpansions: 8_192,
      peakSearchStates: 512,
      hardConstraintChecks: 131_072,
      constraintObservationComparisons: 2_228_224,
      refusalConstraintObservations: 16,
      pairwiseCandidateComparisons: 4_560,
      rawVoiceRecords: 672,
      outputVoiceRecords: 168,
      templateRows: 112,
      templateDegreeSlots: 7,
      trackedRecords: 1_792,
    });
    expect(VOICING_WORK_LIMITS).toEqual({
      realizationDegreeRecordsVisited: 16,
      templateRowsVisited: 112,
      templateDegreeSlotsVisited: 784,
      registerPlacementsVisited: 176,
      searchStatesExpanded: 8_192,
      structuralTransformsAttempted: 8_192,
      hardConstraintChecks: 131_072,
      rawCandidatesProduced: 96,
      candidateCanonicalizations: 96,
      duplicateCandidateComparisons: 4_560,
      localScoresComputed: 96,
      orderingComparisons: 4_560,
      retainedCandidatesProduced: 24,
      outputVoicesProduced: 168,
      constraintObservationComparisons: 2_228_224,
      constraintObservationsProduced: 16,
    });
    expect(VOICING_MEMORY_LIMITS).toEqual({
      peakRegisterPlacementRecords: 176,
      peakSearchStateRecords: 512,
      peakRawCandidateRecords: 96,
      peakRawVoiceRecords: 672,
      peakRetainedCandidateRecords: 24,
      peakOutputVoiceRecords: 168,
      peakTrackedRecords: 1_792,
      peakConstraintObservationRecords: 16,
    });
    expect(VOICING_IDENTIFIER_LIMITS).toEqual({
      minimumCodePoints: 1,
      maximumCodePoints: 256,
      maximumUtf8Bytes: 512,
      codePointMeasurement: "Array.from(value).length",
      utf8ByteMeasurement: "new TextEncoder().encode(value).byteLength",
      surfaces: [
        "quartalContext.evidenceId",
        "candidateEvidence.sourceId",
      ],
      quartalContextInvalidReason: "evidence-id-invalid",
      candidateEvidenceMayEmitInvalidSourceId: false,
    });
    expect(VOICING_CANDIDATE_PAYLOAD_LIMITS).toEqual({
      hardConstraintObservations: 16,
      hardConstraintCodeOrder: VOICING_CONSTRAINT_PRECEDENCE,
      nonQuartalEvidenceRecords: 8,
      quartalEvidenceRecords: 9,
      evidenceCodeOrder: VOICING_EVIDENCE_CODES,
      constraintObservationVoiceOrdinals: 7,
      constraintObservationDegrees: 7,
      constraintObservationMidiValues: 7,
      evidenceObservationVoiceOrdinals: 7,
      evidenceObservationDegrees: 7,
      explanationOrderedDegreesMinimum: 2,
      explanationOrderedDegreesMaximum: 7,
      explanationOmittedDegreesMaximum: 16,
      explanationDoubledDegreesMaximum: 2,
      explanationQuartalAdjacenciesMaximum: 4,
      drop2TransformVoicesMinimum: 4,
      drop2TransformVoicesMaximum: 7,
      drop2SourceAndTransformedLengthsEqual: true,
      resultCandidatesMinimum: 1,
      resultCandidatesMaximum: 24,
      availableRealizationIdsMinimum: 1,
      availableRealizationIdsMaximum: 4,
      refusalConstraintsMinimum: 1,
      refusalConstraintsMaximum: 16,
    });
    expect(VOICING_TRACKED_RECORD_POPULATIONS).toEqual([
      "selected-realization-degree",
      "template-row",
      "register-placement",
      "search-state",
      "raw-candidate",
      "raw-voice",
      "retained-candidate",
      "output-voice",
      "constraint-observation",
    ]);
    expect(VOICING_TRACKED_RECORD_POPULATION_LIMITS).toEqual({
      "selected-realization-degree": 16,
      "template-row": 112,
      "register-placement": 176,
      "search-state": 512,
      "raw-candidate": 96,
      "raw-voice": 672,
      "retained-candidate": 24,
      "output-voice": 168,
      "constraint-observation": 16,
    });
    expect(VOICING_TRACKED_RECORD_ACCOUNTING).toEqual({
      policyId: "changes.voicing-tracked-record-accounting",
      policyVersion: 2,
      populationOrder: VOICING_TRACKED_RECORD_POPULATIONS,
      populationLimits: VOICING_TRACKED_RECORD_POPULATION_LIMITS,
      aggregateMaximum: 1_792,
      sumOfPopulationLimits: 1_792,
      diagnosticPayloadOwnedByCandidateRecord: true,
      constraintObservationAccumulatorPopulation: "constraint-observation",
      independentDiagnosticSideCollectionsAllowed: false,
      ownershipLaw:
        "Successful constraint, evidence, score, and explanation projections are payload of their owning candidate. A no-result search may retain only the one declared operation-local constraint-observation population, transfer it into the refusal, and retain no parallel diagnostic side collection.",
    });
    expect({
      policyId: VOICING_CONSTRAINT_OBSERVATION_POLICY_ID,
      policyVersion: VOICING_CONSTRAINT_OBSERVATION_POLICY_VERSION,
    }).toEqual({
      policyId: "changes.voicing-constraint-observation-collection",
      policyVersion: 1,
    });
    expect(
      Object.keys(VOICING_WORK_LIMITS).length +
        Object.keys(VOICING_MEMORY_LIMITS).length,
    ).toBe(24);
  });
});

describe("V0 independently authored fixture contract", () => {
  test("passes deterministically with the exact reviewed inventory", async () => {
    const [first, second] = await Promise.all([
      validateV0Contract(),
      validateV0Contract(),
    ]);
    expect(first).toEqual(second);
    expect(first.outcome).toBe("pass");
    expect(first.findings).toEqual([]);
    expect(first.schema).toBe("changes.validation.v0-contract.v1");
    expect(first.package).toBe("V0");
    expect(first.counts).toEqual({
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
    });
    expect(V0_REVIEWED_COMPANIONS).toEqual([
      "family-templates.json",
      "availability-matrix.json",
      "candidate-cases.json",
      "law-cases.json",
      "operation-state-cases.json",
      "limit-cases.json",
      "transposition-seeds.json",
      "mutation-controls.json",
      "provenance-ledger.json",
      "trace-ledger.json",
    ]);
  });

  test("rejects law check inventory or checksum drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "law-cases.json", (document) => {
        const firstLaw = mutableObjects(document["cases"])[0];
        if (firstLaw === undefined) throw new Error("missing first V0 law");
        const checkIds = firstLaw["checkIds"];
        if (!Array.isArray(checkIds)) throw new Error("missing V0 law checks");
        checkIds[0] = "production-derived-replay-check";
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_LAW_CHECK_INVENTORY");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("checksum-binds the complete-result audit inventory", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "law-cases.json", (document) => {
        const policy = mutableObject(document["lawProofPolicy"]);
        const checkIds = policy["completeResultAuditCheckIds"];
        if (!Array.isArray(checkIds)) throw new Error("missing complete-result checks");
        checkIds[0] = "production-derived-result-check";
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_LAW_CHECK_INVENTORY");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("rejects negative-witness execution-class overclaim", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "law-cases.json", (document) => {
        const policy = mutableObject(document["lawProofPolicy"]);
        const execution = mutableObject(policy["negativeWitnessExecutionPolicy"]);
        const detectorIds = execution["detectorOnlyWitnessIds"];
        const productionIds = execution["productionExecutedWitnessIds"];
        if (!Array.isArray(detectorIds) || !Array.isArray(productionIds)) {
          throw new Error("missing negative-witness execution inventories");
        }
        const detectorRows = detectorIds as unknown[];
        const productionRows = productionIds as unknown[];
        const detectorOnly: unknown = detectorRows.shift();
        if (detectorOnly === undefined) throw new Error("missing detector-only witness");
        productionRows.push(detectorOnly);
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_LAW_POLICY");
  });

  test("rejects negative-witness execution branch specification drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "law-cases.json", (document) => {
        const policy = mutableObject(document["lawProofPolicy"]);
        const execution = mutableObject(policy["negativeWitnessExecutionPolicy"]);
        const specs = mutableObjects(execution["executionSpecs"]);
        const guide = specs.find(({ witnessId }) =>
          witnessId === "V0-GUIDE-NEAR-001"
        );
        if (guide === undefined) throw new Error("missing GUIDE execution spec");
        const row = mutableObjects(guide["production"])[0];
        if (row === undefined) throw new Error("missing GUIDE production branch");
        row["operation"] = "realizeVoicing-unrelated-valid-branch";
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_LAW_POLICY");
  });

  test("rejects negative-witness runtime request or result hash drift", async () => {
    const reports = await Promise.all([
      "runtimeRequestSha256",
      "runtimeResultSha256",
    ].map(async (field) => validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "law-cases.json", (document) => {
        const policy = mutableObject(document["lawProofPolicy"]);
        const execution = mutableObject(policy["negativeWitnessExecutionPolicy"]);
        const first = mutableObjects(execution["executionSpecs"])[0];
        if (first === undefined) throw new Error("missing execution hash spec");
        first[field] = "0".repeat(64);
      });
    })));
    for (const report of reports) {
      expect(report.outcome).toBe("fail");
      expect(findingCodes(report)).toContain("V0_LAW_POLICY");
    }
  });

  test("rejects unrelated non-null and valid-but-substituted production evidence", () => {
    const target = executeV0LawWitness("V0-GUIDE-NEAR-001");
    const donor = executeV0LawWitness("V0-SLASH-NEAR-001");

    expect(evaluateV0NegativeWitnessExecutionEvidence(target.caseId, {
      actualProjection: target.actualProjection,
      runtimeInput: donor.runtimeInput,
      runtimeOutput: donor.runtimeOutput,
    }).productionMutantExecuted).toBe(false);

    const runtimeInput = mutableObject(structuredClone(target.runtimeInput));
    const runtimeOutput = mutableObject(structuredClone(target.runtimeOutput));
    const donorInput = mutableObject(structuredClone(donor.runtimeInput));
    const donorOutput = mutableObject(structuredClone(donor.runtimeOutput));
    const targetInputRows = mutableObjects(
      mutableObject(runtimeInput["execution"])["production"],
    );
    const targetOutputRows = mutableObjects(
      mutableObject(runtimeOutput["execution"])["production"],
    );
    const donorInputRows = mutableObjects(
      mutableObject(donorInput["execution"])["production"],
    );
    const donorOutputRows = mutableObjects(
      mutableObject(donorOutput["execution"])["production"],
    );
    const targetInputRow = targetInputRows[0];
    const targetOutputRow = targetOutputRows[0];
    const donorInputRow = donorInputRows[0];
    const donorOutputRow = donorOutputRows[0];
    if (targetInputRow === undefined || targetOutputRow === undefined ||
        donorInputRow === undefined || donorOutputRow === undefined) {
      throw new Error("missing production execution row");
    }
    targetInputRow["input"] = donorInputRow["input"];
    targetOutputRow["result"] = donorOutputRow["result"];

    expect(evaluateV0NegativeWitnessExecutionEvidence(target.caseId, {
      actualProjection: target.actualProjection,
      runtimeInput,
      runtimeOutput,
    }).productionMutantExecuted).toBe(false);
  });

  test("digest-binds the complete normalized negative-witness runtime envelopes", () => {
    const target = executeV0LawWitness("V0-ROOTLESS-NEAR-001");
    expect(evaluateV0NegativeWitnessExecutionEvidence(target.caseId, {
      runtimeInput: target.runtimeInput,
      runtimeOutput: target.runtimeOutput,
    })).toEqual({
      productionMutantExecuted: true,
      detectorOnlyMutantEvaluated: true,
    });

    const requestDrift = mutableObject(structuredClone(target.runtimeInput));
    requestDrift["digestOnlyAdversary"] = true;
    expect(evaluateV0NegativeWitnessExecutionEvidence(target.caseId, {
      runtimeInput: requestDrift,
      runtimeOutput: target.runtimeOutput,
    })).toEqual({
      productionMutantExecuted: false,
      detectorOnlyMutantEvaluated: false,
    });

    const resultDrift = mutableObject(structuredClone(target.runtimeOutput));
    resultDrift["digestOnlyAdversary"] = true;
    expect(evaluateV0NegativeWitnessExecutionEvidence(target.caseId, {
      runtimeInput: target.runtimeInput,
      runtimeOutput: resultDrift,
    })).toEqual({
      productionMutantExecuted: false,
      detectorOnlyMutantEvaluated: false,
    });
  });

  test("rejects fabricated executors and detector claims without mutant payloads", () => {
    const production = executeV0LawWitness("V0-GUIDE-NEAR-001");
    const productionInput = mutableObject(structuredClone(production.runtimeInput));
    const productionOutput = mutableObject(structuredClone(production.runtimeOutput));
    const inputRow = mutableObjects(
      mutableObject(productionInput["execution"])["production"],
    )[0];
    const outputRow = mutableObjects(
      mutableObject(productionOutput["execution"])["production"],
    )[0];
    if (inputRow === undefined || outputRow === undefined) {
      throw new Error("missing production execution row");
    }
    inputRow["executor"] = "fabricated-but-self-consistent";
    outputRow["executor"] = "fabricated-but-self-consistent";
    expect(evaluateV0NegativeWitnessExecutionEvidence(production.caseId, {
      runtimeInput: productionInput,
      runtimeOutput: productionOutput,
    }).productionMutantExecuted).toBe(false);

    const detector = executeV0LawWitness("V0-SPELL-NEAR-002");
    const detectorInput = mutableObject(structuredClone(detector.runtimeInput));
    const detectorRow = mutableObjects(
      mutableObject(detectorInput["execution"])["detectors"],
    )[0];
    if (detectorRow === undefined) throw new Error("missing detector execution row");
    delete detectorRow["mutantInput"];
    expect(evaluateV0NegativeWitnessExecutionEvidence(detector.caseId, {
      runtimeInput: detectorInput,
      runtimeOutput: detector.runtimeOutput,
    }).detectorOnlyMutantEvaluated).toBe(false);
  });

  test("rejects extra detector input and output fields for every detector witness", () => {
    const detectorWitnessIds = [
      "V0-ALT-NEAR-001",
      "V0-COUNT-NEAR-001",
      "V0-COUNT-NEAR-002",
      "V0-DOUBLING-NEAR-002",
      "V0-DROP2-NEAR-001",
      "V0-DROP2-NEAR-002",
      "V0-IMMUTABLE-NEAR-001",
      "V0-SLASH-NEAR-002",
      "V0-SPELL-NEAR-002",
      "V0-WEAVE-NEAR-001",
      "V0-IDENTITY-NEAR-001",
      "V0-ORDER-NEAR-001",
      "V0-ROOTLESS-NEAR-001",
      "V0-SPELL-NEAR-001",
      "V0-TRANS-NEAR-001",
    ] as const;
    for (const caseId of detectorWitnessIds) {
      const target = executeV0LawWitness(caseId);
      const extraInput = mutableObject(structuredClone(target.runtimeInput));
      const inputRow = mutableObjects(
        mutableObject(extraInput["execution"])["detectors"],
      )[0];
      if (inputRow === undefined) throw new Error(`${caseId}: detector input row`);
      const mutantInput = inputRow["mutantInput"];
      if (Array.isArray(mutantInput)) {
        mutantInput.push({ unexpectedDetectorInput: true });
      } else {
        mutableObject(mutantInput)["unexpectedDetectorInput"] = true;
      }
      expect(evaluateV0NegativeWitnessExecutionEvidence(caseId, {
        runtimeInput: extraInput,
        runtimeOutput: target.runtimeOutput,
      }).detectorOnlyMutantEvaluated, `${caseId}: extra detector input`).toBe(false);

      const extraOutput = mutableObject(structuredClone(target.runtimeOutput));
      const outputRow = mutableObjects(
        mutableObject(extraOutput["execution"])["detectors"],
      )[0];
      if (outputRow === undefined) throw new Error(`${caseId}: detector output row`);
      mutableObject(outputRow["detectorOutput"])["unexpectedDetectorOutput"] = true;
      expect(evaluateV0NegativeWitnessExecutionEvidence(caseId, {
        runtimeInput: target.runtimeInput,
        runtimeOutput: extraOutput,
      }).detectorOnlyMutantEvaluated, `${caseId}: extra detector output`).toBe(false);
    }
  });

  test("rejects empty ALT sets and boolean-only transposition detector rows", () => {
    const altered = executeV0LawWitness("V0-ALT-NEAR-001");
    const alteredInput = mutableObject(structuredClone(altered.runtimeInput));
    const alteredRow = mutableObjects(
      mutableObject(alteredInput["execution"])["detectors"],
    )[0];
    if (alteredRow === undefined) throw new Error("missing ALT detector row");
    const alteredMutant = mutableObject(alteredRow["mutantInput"]);
    alteredMutant["leftPitchSet"] = [];
    alteredMutant["rightPitchSet"] = [];
    expect(evaluateV0NegativeWitnessExecutionEvidence(altered.caseId, {
      runtimeInput: alteredInput,
      runtimeOutput: altered.runtimeOutput,
    }).detectorOnlyMutantEvaluated).toBe(false);

    const transposition = executeV0LawWitness("V0-TRANS-NEAR-001");
    const transpositionInput = mutableObject(
      structuredClone(transposition.runtimeInput),
    );
    const transpositionRow = mutableObjects(
      mutableObject(transpositionInput["execution"])["detectors"],
    )[0];
    if (transpositionRow === undefined) {
      throw new Error("missing transposition detector row");
    }
    mutableObject(transpositionRow["mutantInput"])["pairs"] = [0, 1].map(() => ({
      soundingPitchClassEqual: true,
      rootSpellingsDistinct: true,
      outputSpellingsDistinct: true,
      inverseProjectionsEqual: true,
    }));
    expect(evaluateV0NegativeWitnessExecutionEvidence(transposition.caseId, {
      runtimeInput: transpositionInput,
      runtimeOutput: transposition.runtimeOutput,
    }).detectorOnlyMutantEvaluated).toBe(false);
  });

  test("rejects hostile-context substitution even when the musical result matches", () => {
    const target = executeV0LawWitness("V0-ORDER-NEAR-001");
    const runtimeInput = mutableObject(structuredClone(target.runtimeInput));
    const row = mutableObjects(
      mutableObject(runtimeInput["execution"])["production"],
    )[0];
    if (row === undefined) throw new Error("missing ORDER production row");
    const input = mutableObject(row["input"]);
    mutableObject(input["ambientOverride"])["value"] = 0;
    expect(evaluateV0NegativeWitnessExecutionEvidence(target.caseId, {
      runtimeInput,
      runtimeOutput: target.runtimeOutput,
    }).productionMutantExecuted).toBe(false);
  });

  test("keeps execution truth independent of expected-projection correctness", () => {
    const target = executeV0LawWitness("V0-GUIDE-NEAR-001");
    const expectedProjection = mutableObject(
      structuredClone(target.expectedProjection),
    );
    expectedProjection["guideOmissionReasonObserved"] = false;
    const baseline = evaluateV0NegativeWitnessExecutionEvidence(target.caseId, {
      actualProjection: target.actualProjection,
      runtimeInput: target.runtimeInput,
      runtimeOutput: target.runtimeOutput,
    });
    const withWrongExpected = evaluateV0NegativeWitnessExecutionEvidence(
      target.caseId,
      {
        actualProjection: target.actualProjection,
        expectedProjection,
        runtimeInput: target.runtimeInput,
        runtimeOutput: target.runtimeOutput,
      },
    );
    expect(baseline.productionMutantExecuted).toBe(true);
    expect(withWrongExpected).toEqual(baseline);
  });

  test("detects decoded duplicate object keys before JSON last-key-wins", async () => {
    const report = await validateFixtureCopy(async (root) => {
      const path = join(root, "v0-voicing-contract.json");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source.replace(
          "{\n",
          "{\n  \"\\u0073chema\": \"shadowed-by-reviewed-schema\",\n",
        ),
        "utf8",
      );
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_DUPLICATE_KEY");
  });

  test("rejects a missing cell from the exhaustive availability matrix", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "availability-matrix.json", (document) => {
        const cells = mutableObjects(document["cells"]);
        cells.pop();
        document["cells"] = cells;
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_MATRIX_CARDINALITY");
  });

  test("independently recomputes candidate MIDI from reviewed spelling", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "candidate-cases.json", (document) => {
        const first = mutableObjects(document["cases"])[0];
        const expected = mutableObject(mutableObject(first)["expected"]);
        const firstVoice = mutableObjects(expected["voices"])[0];
        mutableObject(firstVoice)["midi"] = 49;
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_CANDIDATE_MIDI");
  });

  test("rejects a broken reciprocal trace link", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "trace-ledger.json", (document) => {
        const firstTrace = mutableObjects(document["traces"])[0];
        const caseIds = mutableObject(firstTrace)["caseIds"];
        if (!Array.isArray(caseIds)) {
          throw new TypeError("Expected trace caseIds array.");
        }
        mutableObject(firstTrace)["caseIds"] = caseIds.slice(1);
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_TRACE_LINK");
  });

  test("rejects drift in an exact inclusive counter boundary", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "limit-cases.json", (document) => {
        const firstBoundary = mutableObjects(document["counterBoundaryCases"])[0];
        mutableObject(firstBoundary)["maximum"] = 15;
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_LIMIT_BOUNDARY");
  });

  test("recomputes identifier metrics and rejects a cap drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "limit-cases.json", (document) => {
          const identifierCases = mutableObjects(
            document["identifierBoundaryCases"],
          );
          const exactUtf8Boundary = mutableObject(identifierCases[4]);
          const expected = mutableObject(exactUtf8Boundary["expected"]);
          expected["measuredUtf8Bytes"] = 511;
        }),
        editFixtureJson(root, "v0-voicing-contract.json", (document) => {
          const identifierLimits = mutableObject(document["identifierLimits"]);
          identifierLimits["maximumUtf8Bytes"] = 513;
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_IDENTIFIER_BOUNDARY");
    expect(codes).toContain("V0_MANIFEST_IDENTIFIER_LIMITS");
  });

  test("rejects tracked-record population accounting drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "v0-voicing-contract.json", (document) => {
        const accounting = mutableObject(document["trackedRecordAccounting"]);
        const populationLimits = mutableObject(accounting["populationLimits"]);
        populationLimits["search-state"] = 511;
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_MANIFEST_ACCOUNTING");
  });

  test("rejects code-only constraint-observation identity", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "v0-voicing-contract.json", (document) => {
        const policy = mutableObject(document["constraintObservationPolicy"]);
        policy["duplicateDisposition"] = "collapse-first-record-per-code";
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_CONSTRAINT_OBSERVATION_POLICY");
  });

  test("independently rejects duplicate and same-code payload drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "operation-state-cases.json", (document) => {
        const refusal = mutableObjects(document["refusalCases"])[13];
        const trigger = mutableObject(mutableObject(refusal)["trigger"]);
        trigger["exactDuplicateCount"] = 0;
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain(
      "V0_CONSTRAINT_OBSERVATION_SEMANTICS",
    );
  });

  test("keeps the observation-search oracle independent of production theory", async () => {
    const validatorSource = await readFile(
      fileURLToPath(
        new URL("../../scripts/validate-v0-contract.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(validatorSource).toContain(
      "function independentlyEnumerateCmaj7ObservationSearch",
    );
    expect(validatorSource).not.toMatch(
      /from\s+["'][^"']*src\/theory(?:\/[^"']*)?["']/u,
    );
    expect(validatorSource).not.toMatch(/\brealizeVoicing\s*\(/u);
  });

  test("independently rejects reason-only identity or precedence drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "operation-state-cases.json", (document) => {
        const refusal = mutableObjects(document["refusalCases"])[13];
        const trigger = mutableObject(mutableObject(refusal)["trigger"]);
        trigger["reasonOnlyDistinctPayloadCount"] = 1;
        const expected = mutableObject(mutableObject(refusal)["expected"]);
        expected["reasonPrecedenceApplied"] = false;
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain(
      "V0_CONSTRAINT_OBSERVATION_SEMANTICS",
    );
  });

  test("re-enumerates late-legal and no-result evidence instead of trusting stored tuples", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "operation-state-cases.json", (document) => {
        const success = mutableObjects(document["successCases"])[3];
        const successExpected = mutableObject(
          mutableObject(success)["expected"],
        );
        successExpected["candidateMidiValues"] = [[36, 43, 52, 58]];
        const refusal = mutableObjects(document["refusalCases"])[15];
        const refusalExpected = mutableObject(
          mutableObject(refusal)["expected"],
        );
        const evidence = mutableObject(refusalExpected["evidence"]);
        evidence["constraintObservationComparisons"] = 162;
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain(
      "V0_CONSTRAINT_OBSERVATION_PROVISIONAL_CLEAR",
    );
    expect(codes).toContain("V0_CONSTRAINT_OBSERVATION_OVERFLOW");
  });

  test("rejects silent or malformed no-result observation overflow", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "operation-state-cases.json", (document) => {
        const refusal = mutableObjects(document["refusalCases"])[15];
        const expected = mutableObject(mutableObject(refusal)["expected"]);
        const payload = mutableObject(expected["refusal"]);
        payload["received"] = 18;
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain(
      "V0_CONSTRAINT_OBSERVATION_OVERFLOW",
    );
  });

  test("rejects terminal provisional overflow before a late legal candidate", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "operation-state-cases.json", (document) => {
        const success = mutableObjects(document["successCases"])[3];
        const expected = mutableObject(mutableObject(success)["expected"]);
        expected["provisionalObservationOverflowCleared"] = false;
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain(
      "V0_CONSTRAINT_OBSERVATION_PROVISIONAL_CLEAR",
    );
  });

  test("pins the observation law, transposition proof, and mutation controls", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await Promise.all([
        editFixtureJson(root, "law-cases.json", (document) => {
          const law = mutableObjects(document["cases"])[22];
          mutableObject(law)["predicate"] = "silently truncate after sixteen";
        }),
        editFixtureJson(root, "transposition-seeds.json", (document) => {
          const seed = mutableObjects(document["seeds"])[17];
          const proof = mutableObject(
            mutableObject(seed)["observationOverflowProof"],
          );
          proof["distinctExternalBassObservationPayloads"] = 16;
        }),
        editFixtureJson(root, "mutation-controls.json", (document) => {
          const mutation = mutableObjects(document["controls"])[47];
          mutableObject(mutation)["operator"] = "permit-early-terminal-limit";
        }),
      ]);
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_CONSTRAINT_OBSERVATION_LAW");
    expect(codes).toContain("V0_CONSTRAINT_OBSERVATION_TRANSPOSITION");
    expect(codes).toContain("V0_CONSTRAINT_OBSERVATION_MUTATIONS");
  });

  test("rejects removal of the reason-precedence mutation killer", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "mutation-controls.json", (document) => {
        const mutation = mutableObjects(document["controls"])[48];
        mutableObject(mutation)["operator"] =
          "ignore-reason-in-observation-identity-only";
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain(
      "V0_CONSTRAINT_OBSERVATION_MUTATIONS",
    );
  });

  test("keeps direct mutation killers disjoint from corroborative evidence", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "mutation-controls.json", (document) => {
        const control = mutableObjects(document["controls"]).find(
          ({ id }) => id === "V0-MUT-006",
        );
        if (control === undefined) throw new Error("missing spelling mutation");
        control["corroboratedByCaseIds"] = [
          "V0-CAND-012",
          "V0-TRANS-012",
        ];
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain(
      "V0_MUTATION_CORROBORATIVE_LINK",
    );
  });

  test("requires a stable reason and direct-then-corroborative review order", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "mutation-controls.json", (document) => {
        const control = mutableObjects(document["controls"]).find(
          ({ id }) => id === "V0-MUT-039",
        );
        if (control === undefined) {
          throw new Error("missing request-mutation control");
        }
        const link = mutableObjects(control["corroborativeLinks"])[0];
        if (link === undefined) throw new Error("missing corroborative link");
        link["reasonCode"] = "";
        control["reviewedCaseLinkOrder"] = [
          "V0-IMMUTABLE-NEAR-001",
          "V0-IMMUTABLE-001",
        ];
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_MUTATION_CORROBORATIVE_LINK");
    expect(codes).toContain("V0_MUTATION_LINK_ORDER");
  });

  test("binds every non-slash voice to its exact realization source index", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "candidate-cases.json", (document) => {
        const first = mutableObjects(document["cases"])[0];
        const expected = mutableObject(mutableObject(first)["expected"]);
        const firstVoice = mutableObjects(expected["voices"])[0];
        mutableObject(firstVoice)["sourceDegreeIndex"] = 2;
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_CANDIDATE_SOURCE_INDEX");
  });

  test("rejects an invalid template selection-mode correlation", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "family-templates.json", (document) => {
        const firstAdaptive = mutableObjects(document["adaptiveFamilies"])[0];
        mutableObject(firstAdaptive)["selectionMode"] = "fixed-degree-sequence";
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_TEMPLATE_SELECTION");
  });

  test("rejects register-weave authority or checksum drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "family-templates.json", (document) => {
        const balanced = mutableObjects(document["registerPolicies"])[0];
        mutableObject(balanced)["slotOrderPolicy"] = "template-low-to-high";
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_TEMPLATE_REGISTER");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("rejects manifest register-weave vocabulary drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "v0-voicing-contract.json", (document) => {
        const identity = mutableObject(document["identity"]);
        const registerPolicy = mutableObject(identity["familyRegisterPolicy"]);
        registerPolicy["slotOrderPolicies"] = [
          "template-low-to-high",
          "closed-source-low-to-high",
          "quartal-context-low-to-high",
        ];
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_MANIFEST_IDENTITY");
  });

  test("independently rejects a cyclic register-weave witness mutation", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "law-cases.json", (document) => {
        const witness = mutableObjects(document["witnesses"]).find(
          ({ id }) => id === "V0-WEAVE-NEAR-001",
        );
        if (witness === undefined) throw new Error("missing weave witness");
        const setup = mutableObject(witness["setup"]);
        setup["midiSortedDegreeOrder"] = ["1", "3", "5", "7"];
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_REGISTER_WEAVE");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("rejects semantic drift in the cyclic-prefilter mutation control", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "mutation-controls.json", (document) => {
        const control = mutableObjects(document["controls"]).find(
          ({ id }) => id === "V0-MUT-043",
        );
        if (control === undefined) throw new Error("missing weave mutation");
        control["operator"] = "accept-cyclic-rotation";
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_REGISTER_WEAVE");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("rejects drift in the spelling-aware register-weave transposition seed", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "transposition-seeds.json", (document) => {
        const seed = mutableObjects(document["seeds"]).find(
          ({ id }) => id === "V0-TRANS-017",
        );
        if (seed === undefined) throw new Error("missing weave transposition");
        const expected = mutableObject(seed["expected"]);
        expected["rawGenerationOrdinal"] = 5;
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_REGISTER_WEAVE");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("rejects promotion of realization cardinality into an adaptive minimum", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "family-templates.json", (document) => {
        const template = mutableObjects(document["adaptiveFamilies"]).find(
          ({ id }) => id === "balanced-adaptive-v1",
        );
        if (template === undefined) throw new Error("missing Balanced template");
        template["minimumVoiceCountRule"] =
          "max(3, number of required degrees)";
      });
    });
    expect(report.outcome).toBe("fail");
    expect(findingCodes(report)).toContain("V0_TEMPLATE_ADAPTIVE");
  });

  test("rejects the legacy raised-minimum decision in the named matrix cell", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "availability-matrix.json", (document) => {
        const cell = mutableObjects(document["cells"]).find(
          ({ id }) => id === "V0-AVAIL-alt-b9-b5-balanced-vc3",
        );
        if (cell === undefined) throw new Error("missing adaptive matrix cell");
        const expected = mutableObject(cell["expected"]);
        expected["refusal"] = {
          code: "voicing.constraints_unsatisfied",
          termination: "constraints-unsatisfied",
          primaryReason: "voice-count-below-template-minimum",
          reasons: ["voice-count-below-template-minimum"],
        };
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_MATRIX_DECISION");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("independently rejects adaptive omitted-suffix witness drift", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "law-cases.json", (document) => {
        const witness = mutableObjects(document["witnesses"]).find(
          ({ id }) => id === "V0-ADAPTIVE-SLOTS-NEAR-001",
        );
        if (witness === undefined) throw new Error("missing adaptive witness");
        const expected = mutableObject(witness["expected"]);
        expected["omittedRequiredDegrees"] = ["b9"];
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_ADAPTIVE_SLOT_DIAGNOSTICS");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("rejects semantic drift in the raised-minimum mutation control", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "mutation-controls.json", (document) => {
        const control = mutableObjects(document["controls"]).find(
          ({ id }) => id === "V0-MUT-044",
        );
        if (control === undefined) throw new Error("missing adaptive mutation");
        control["operator"] = "accept-raised-minimum";
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_ADAPTIVE_SLOT_DIAGNOSTICS");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("rejects drift in the spelling-aware adaptive refusal proof", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "transposition-seeds.json", (document) => {
        const seed = mutableObjects(document["seeds"]).find(
          ({ id }) => id === "V0-TRANS-010",
        );
        if (seed === undefined) throw new Error("missing adaptive transposition");
        const proof = mutableObject(seed["insufficientSlotRefusalProof"]);
        proof["omittedGuideToneDegrees"] = [];
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_ADAPTIVE_SLOT_DIAGNOSTICS");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("pins independently authored absolute source voices and realization alignment", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "transposition-seeds.json", (document) => {
        const seed = mutableObjects(document["seeds"]).find(
          ({ id }) => id === "V0-TRANS-003",
        );
        if (seed === undefined) throw new Error("missing independent source oracle");
        const oracle = mutableObject(seed["sourceOracle"]);
        const voice = mutableObjects(oracle["voices"])[0];
        const spelling = mutableObject(voice?.["spelling"]);
        spelling["octave"] = 5;
        if (voice === undefined) throw new Error("missing source voice");
        voice["sourceDegreeIndex"] = 2;
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_TRANSPOSITION_SOURCE_MIDI");
    expect(codes).toContain("V0_TRANSPOSITION_SOURCE_ALIGNMENT");
    expect(codes).toContain("V0_CHECKSUM");
  });

  test("rejects source policy, provenance, and inverse-scope weakening", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "transposition-seeds.json", (document) => {
        const seed = mutableObjects(document["seeds"]).find(
          ({ id }) => id === "V0-TRANS-001",
        );
        if (seed === undefined) throw new Error("missing generated source oracle");
        const oracle = mutableObject(seed["sourceOracle"]);
        const request = mutableObject(oracle["requestProjection"]);
        const policy = mutableObject(request["policy"]);
        policy["bassPolicy"] = "generated";
        const firstVoice = mutableObjects(oracle["voices"])[0];
        if (firstVoice === undefined) throw new Error("missing source voice");
        firstVoice["provenance"] = "slash-bass";
        oracle["inverseScope"] = mutableObjects([]);
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_TRANSPOSITION_SOURCE_POLICY");
    expect(codes).toContain("V0_TRANSPOSITION_SOURCE_PROVENANCE");
    expect(codes).toContain("V0_TRANSPOSITION_INVERSE_SCOPE");
  });

  test("keeps stored and refusal inverse applicability explicit and disjoint", async () => {
    const report = await validateFixtureCopy(async (root) => {
      await editFixtureJson(root, "transposition-seeds.json", (document) => {
        const seeds = mutableObjects(document["seeds"]);
        const stored = seeds.find(({ id }) => id === "V0-TRANS-016");
        const refusal = seeds.find(({ id }) => id === "V0-TRANS-018");
        if (stored === undefined || refusal === undefined) {
          throw new Error("missing applicability oracles");
        }
        mutableObject(stored["sourceOracle"])["applicability"] =
          "generated-candidate";
        mutableObject(refusal["sourceOracle"])["candidateVoicesApplicable"] = true;
      });
    });
    const codes = findingCodes(report);
    expect(report.outcome).toBe("fail");
    expect(codes).toContain("V0_TRANSPOSITION_SOURCE_ORACLE");
    expect(codes).toContain("V0_TRANSPOSITION_SOURCE_APPLICABILITY");
    expect(codes).toContain("V0_CHECKSUM");
  });
});
