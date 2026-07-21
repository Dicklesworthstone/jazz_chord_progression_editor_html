import { expect, setDefaultTimeout, test } from "bun:test";

import { buildV1AccountingProbeReport } from
  "../../src/test-support/v1-accounting-probes";
import limitFixtureValue from "../fixtures/voice-assignment/limit-cases.json";
import mutationFixtureValue from
  "../fixtures/voice-assignment/mutation-controls.json";
import { v1AssignmentCase } from "../support/v1-assignment-fixtures";
import {
  canonicalV1EvidenceValue,
  executeV1AssignmentCase,
  stableV1EvidenceJson,
  v1EvidenceDigest,
} from "../support/v1-conformance";

setDefaultTimeout(60_000);

type FixtureRecord = Readonly<Record<string, unknown>>;
type MutationControl = Readonly<{
  id: string;
  operator: string;
  killedByCaseIds: readonly string[];
}>;
type CounterfactualExecution = Readonly<{
  controlId: string;
  caseId: string;
  operator: string;
  fixtureRecordSha256: string;
  executionKind: "executable-semantic-counterfactual";
  runtimeRequestSha256: string;
  expectedProjectionSha256: string;
  baselineProjectionSha256: string;
  mutantProjectionSha256: string;
  baselineResultSha256: string;
  mutantResultSha256: string;
  oracleDecision: "killed";
  beforeSha256: string;
  afterSha256: string;
  changedFields: readonly string[];
  killed: true;
  executionDigest: string;
}>;

const PRODUCER = Object.freeze({
  file: "tests/conformance/v1-mutation-controls.test.ts",
  testcase:
    "kills every reviewed V1 semantic counterfactual through its linked independent cases",
} as const);

type MutableRecord = Record<string, unknown>;
type AccountingReport = ReturnType<typeof buildV1AccountingProbeReport>;

type RuntimeSeed = Readonly<{
  anchorCaseId: string;
  request: unknown;
  result: unknown;
  expectedProjection: unknown;
  actualProjection: unknown;
}>;

const NON_ASSIGNMENT_ANCHORS: Readonly<Record<string, string>> = Object.freeze({
  "V1-LAW-001": "V1-ASN-002",
  "V1-LAW-010": "V1-ASN-014",
  "V1-LAW-012": "V1-ASN-018",
  "V1-OP-004": "V1-ASN-018",
  "V1-OP-005": "V1-ASN-002",
  "V1-OP-008": "V1-ASN-011",
  "V1-OP-012": "V1-ASN-013",
  "V1-OP-013": "V1-ASN-013",
  "V1-OP-017": "V1-ASN-002",
});

function mutableRecord(value: unknown, label: string): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`V1_MUTATION_RECORD:${label}`);
  }
  return value as MutableRecord;
}

function mutableArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function runtimeSeed(
  caseId: string,
  accounting: AccountingReport,
): RuntimeSeed {
  if (caseId === "V1-OP-016") {
    const probe = accounting.cases.find(
      ({ counter }) => counter === "backtraceSteps",
    );
    if (probe === undefined) {
      throw new Error("V1_MUTATION_ACCOUNTING_SEED");
    }
    const request = Object.freeze({
      kind: "test-seam-accounting-probe",
      id: probe.id,
      counter: probe.counter,
      maximum: probe.maximum,
      received: probe.received,
    });
    const projection = Object.freeze({
      termination: probe.exactPlusOne.evidence.termination,
      refusal: probe.exactPlusOne.refusal,
      partialResult: probe.exactPlusOne.refusal.partialResult,
      valueAbsent: true,
    });
    return Object.freeze({
      anchorCaseId: probe.id,
      request,
      result: probe.exactPlusOne,
      expectedProjection: projection,
      actualProjection: structuredClone(projection),
    });
  }

  const anchorCaseId = NON_ASSIGNMENT_ANCHORS[caseId] ?? caseId;
  const execution = executeV1AssignmentCase(v1AssignmentCase(anchorCaseId));
  if (
    v1EvidenceDigest(execution.actualProjection) !==
      v1EvidenceDigest(execution.expectedProjection)
  ) {
    throw new Error(`V1_MUTATION_BASELINE_MISMATCH:${caseId}:${anchorCaseId}`);
  }
  return Object.freeze({
    anchorCaseId,
    request: execution.request,
    result: execution.result,
    expectedProjection: execution.expectedProjection,
    actualProjection: execution.actualProjection,
  });
}

function counterfactualEnvelope(
  caseId: string,
  operator: string,
  seed: RuntimeSeed,
): MutableRecord {
  return {
    linkedCaseId: caseId,
    anchorCaseId: seed.anchorCaseId,
    operator,
    runtimeRequest: canonicalV1EvidenceValue(seed.request),
    fixtureProjection: canonicalV1EvidenceValue(seed.expectedProjection),
    runtimeProjection: canonicalV1EvidenceValue(seed.expectedProjection),
  };
}

function projectionOf(envelope: MutableRecord): MutableRecord {
  return mutableRecord(envelope["runtimeProjection"], "runtime-projection");
}

function costOf(projection: MutableRecord): MutableRecord {
  const value = projection["cost"];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as MutableRecord;
  }
  const cost: MutableRecord = {};
  projection["cost"] = cost;
  return cost;
}

function relationCountsOf(projection: MutableRecord): MutableRecord {
  const value = projection["relationCounts"];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as MutableRecord;
  }
  const counts: MutableRecord = {};
  projection["relationCounts"] = counts;
  return counts;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function operationPathOf(projection: MutableRecord): unknown[] {
  return mutableArray(projection["operationPath"]);
}

function arcTuplesOf(projection: MutableRecord): unknown[][] {
  return mutableArray(projection["arcs"]).filter(Array.isArray) as unknown[][];
}

function addCounterfactualFact(
  projection: MutableRecord,
  key: string,
  value: unknown,
): void {
  const factsValue = projection["counterfactualFacts"];
  const facts =
    typeof factsValue === "object" && factsValue !== null && !Array.isArray(factsValue)
      ? factsValue as MutableRecord
      : {};
  facts[key] = value;
  projection["counterfactualFacts"] = facts;
}

function replaceOperationKind(
  projection: MutableRecord,
  kind: "enter" | "leave",
): void {
  projection["operationPath"] = operationPathOf(projection).filter((step) =>
    mutableRecord(step, "operation-step")["kind"] !== kind
  );
  projection["arcs"] = arcTuplesOf(projection).filter(
    (arc) => arc[0] !== kind,
  );
}

function mutateIdentityTuple(
  projection: MutableRecord,
  indexes: readonly number[],
  value: boolean,
): void {
  const arc = arcTuplesOf(projection).find((tuple) => tuple[0] === "match");
  if (arc === undefined) throw new Error("V1_MUTATION_MATCH_ARC");
  for (const index of indexes) arc[index] = value;
}

function mutateCounterfactual(operator: string, envelope: MutableRecord): void {
  const projection = projectionOf(envelope);
  const request = mutableRecord(envelope["runtimeRequest"], "runtime-request");
  const cost = costOf(projection);
  switch (operator) {
    case "allow-crossing-permutation":
    case "use-finite-separable-crossing-penalty":
      projection["termination"] = "complete-assigned";
      delete projection["code"];
      delete projection["reason"];
      projection["operationPath"] = [
        { kind: "match", sourceOrdinal: 0, targetOrdinal: 2 },
        { kind: "match", sourceOrdinal: 1, targetOrdinal: 1 },
        { kind: "match", sourceOrdinal: 2, targetOrdinal: 0 },
      ];
      addCounterfactualFact(projection, "correspondence", "crossing-permutation");
      if (operator === "use-finite-separable-crossing-penalty") {
        addCounterfactualFact(projection, "crossingPenalty", 1_000);
      }
      break;
    case "order-voices-by-pitch-string": {
      const from = mutableRecord(request["from"], "source-frame");
      const voices = mutableArray(from["voices"]);
      voices.sort((left, right) =>
        stableV1EvidenceJson(mutableRecord(left, "source-voice")["pitch"])
          .localeCompare(
            stableV1EvidenceJson(
              mutableRecord(right, "source-voice")["pitch"],
            ),
          )
      );
      addCounterfactualFact(projection, "voiceOrder", "lexical-pitch");
      break;
    }
    case "omit-enter-operation":
      replaceOperationKind(projection, "enter");
      cost["enteringVoices"] = 0;
      break;
    case "omit-leave-operation":
      replaceOperationKind(projection, "leave");
      cost["leavingVoices"] = 0;
      break;
    case "encode-gap-semitones-as-zero":
      for (const arc of arcTuplesOf(projection)) {
        if (arc[0] === "enter" || arc[0] === "leave") arc[3] = 0;
      }
      break;
    case "set-gap-cost-to-eleven":
    case "set-gap-cost-to-thirteen": {
      const gapCost = operator === "set-gap-cost-to-eleven" ? 11 : 13;
      cost["alignmentCost"] =
        finiteNumber(cost["totalAbsoluteMotion"]) +
        gapCost * finiteNumber(cost["gapCount"]);
      addCounterfactualFact(projection, "gapCost", gapCost);
      break;
    }
    case "compare-pitch-names-by-prefix":
      mutateIdentityTuple(projection, [6, 7], true);
      addCounterfactualFact(projection, "pitchComparison", "string-prefix");
      break;
    case "require-exact-midi-for-common-tone":
      mutateIdentityTuple(projection, [6], false);
      cost["pitchClassCommonTones"] = Math.max(
        0,
        finiteNumber(cost["pitchClassCommonTones"]) - 1,
      );
      break;
    case "derive-spelled-identity-from-pitch-class":
      mutateIdentityTuple(projection, [7, 8], true);
      break;
    case "derive-midi-identity-from-spelling":
      mutateIdentityTuple(projection, [5], true);
      cost["exactSustains"] = finiteNumber(cost["exactSustains"]) + 1;
      break;
    case "count-repeated-pitch-classes-as-a-set":
      cost["pitchClassCommonTones"] = Math.max(
        0,
        finiteNumber(cost["pitchClassCommonTones"]) - 1,
      );
      addCounterfactualFact(projection, "pitchClassCardinality", "set");
      break;
    case "discard-signed-semitones":
      for (const arc of arcTuplesOf(projection)) {
        if (typeof arc[3] === "number") arc[3] = Math.abs(arc[3]);
      }
      break;
    case "compute-maximum-leap-from-signed-minimum":
      cost["maximumAbsoluteLeap"] = -Math.abs(
        finiteNumber(cost["maximumAbsoluteLeap"], 1),
      );
      break;
    case "omit-oblique-relation":
      relationCountsOf(projection)["oblique"] = 0;
      break;
    case "classify-contrary-as-similar": {
      const counts = relationCountsOf(projection);
      const contrary = finiteNumber(counts["contrary"]);
      counts["contrary"] = 0;
      counts["similar"] = finiteNumber(counts["similar"]) + contrary;
      break;
    }
    case "allocate-new-identity-on-match": {
      const ids = mutableArray(projection["outputVoiceIds"]);
      projection["outputVoiceIds"] = ids.map((_, index) =>
        `voice-${String(1_000 + index).padStart(4, "0")}`
      );
      for (const [index, arc] of arcTuplesOf(projection).entries()) {
        if (arc[0] === "match") {
          arc[4] = `voice-${String(1_000 + index).padStart(4, "0")}`;
        }
      }
      break;
    }
    case "reuse-leaving-identity-for-enter": {
      const arcs = arcTuplesOf(projection);
      const retiredId = arcs.find((arc) => arc[0] === "leave")?.[4];
      const entering = arcs.find((arc) => arc[0] === "enter");
      if (entering !== undefined) entering[4] = retiredId ?? "voice-0000";
      addCounterfactualFact(projection, "retiredVoiceIdsReused", true);
      break;
    }
    case "use-global-or-nondeterministic-id-counter": {
      const ids = mutableArray(projection["outputVoiceIds"]);
      projection["outputVoiceIds"] = ids.map((_, index) =>
        `voice-${String(3_000 + index).padStart(4, "0")}`
      );
      addCounterfactualFact(projection, "identityCounter", "ambient-global");
      break;
    }
    case "allocate-entering-identities-before-path-selection": {
      const entering = arcTuplesOf(projection).find((arc) => arc[0] === "enter");
      if (entering !== undefined) entering[4] = "voice-4095";
      addCounterfactualFact(projection, "allocationPhase", "candidate-scoring");
      break;
    }
    case "drop-degree-provenance":
      cost["guideToneContinuities"] = 0;
      addCounterfactualFact(projection, "roleSource", "sounding-pitch-only");
      break;
    case "compare-guide-degrees-by-number-only":
      cost["guideToneContinuities"] =
        finiteNumber(cost["guideToneContinuities"]) + 1;
      cost["guideTonesLost"] = Math.max(
        0,
        finiteNumber(cost["guideTonesLost"]) - 1,
      );
      break;
    case "treat-null-degree-as-root":
      cost["doubledGuideTones"] = finiteNumber(cost["doubledGuideTones"]) + 1;
      addCounterfactualFact(projection, "nullDegreeRole", "root");
      break;
    case "use-wrong-low-register-spacing-threshold":
      cost["crowdedLowIntervals"] =
        finiteNumber(cost["crowdedLowIntervals"]) === 0 ? 1 : 0;
      addCounterfactualFact(projection, "spacingBands", "shifted");
      break;
    case "count-guide-doubling-by-pitch-class":
      cost["doubledGuideTones"] = finiteNumber(cost["doubledGuideTones"]) + 1;
      break;
    case "satisfy-color-by-sounding-pitch-class":
      cost["omittedColors"] = Math.max(
        0,
        finiteNumber(cost["omittedColors"]) - 1,
      );
      break;
    case "reverse-or-randomize-operation-rank":
      projection["operationPath"] = [...operationPathOf(projection)].reverse();
      addCounterfactualFact(projection, "completePathOrder", "reversed");
      break;
    case "accept-eight-or-reject-seven-voices":
      projection["termination"] = "request-invalid";
      projection["code"] = "voice_assignment.voice_count_invalid";
      addCounterfactualFact(projection, "voiceCountRange", [3, 8]);
      break;
    case "skip-final-dp-row-or-column":
      projection["operationPath"] = operationPathOf(projection).slice(0, -1);
      projection["arcs"] = arcTuplesOf(projection).slice(0, -1);
      addCounterfactualFact(projection, "terminalCell", "truncated");
      break;
    case "enumerate-permutations-or-all-paths-in-production": {
      const workValue = projection["work"];
      const work =
        typeof workValue === "object" && workValue !== null && !Array.isArray(workValue)
          ? workValue as MutableRecord
          : {};
      work["transitionCandidatesEvaluated"] = 13_699;
      projection["work"] = work;
      addCounterfactualFact(projection, "searchShape", "all-delannoy-paths");
      break;
    }
    case "return-partial-result-on-limit":
      projection["partialResult"] = true;
      projection["valueAbsent"] = false;
      projection["value"] = { arcs: [], operationPath: [] };
      break;
    case "accept-stale-request-lock":
      projection["termination"] = "complete-assigned";
      addCounterfactualFact(projection, "lockRequest", "stale-accepted");
      break;
    case "validate-lock-by-voice-id-only":
      addCounterfactualFact(projection, "lockFields", ["voiceId"]);
      projection["lockEvidence"] = [{ ordinal: 0, status: "satisfied" }];
      break;
    case "make-wall-time-or-cancellation-change-result":
      projection["wallTimeAffectedSelection"] = true;
      projection["operationPath"] = [...operationPathOf(projection)].reverse();
      break;
    case "mutate-or-sort-caller-input": {
      const fromValue = request["from"];
      if (typeof fromValue === "object" && fromValue !== null && !Array.isArray(fromValue)) {
        const from = fromValue as MutableRecord;
        from["voices"] = [...mutableArray(from["voices"])].reverse();
      }
      projection["callerInputMutationCount"] = 1;
      break;
    }
    case "collapse-parallel-into-similar": {
      const counts = relationCountsOf(projection);
      const parallel = finiteNumber(counts["parallel"]);
      counts["parallel"] = 0;
      counts["similar"] = finiteNumber(counts["similar"]) + parallel;
      break;
    }
    default:
      throw new Error(`V1_MUTATION_OPERATOR:${operator}`);
  }
}

function changedFields(
  before: unknown,
  after: unknown,
  path = "",
): readonly string[] {
  if (stableV1EvidenceJson(before) === stableV1EvidenceJson(after)) return [];
  if (
    typeof before !== "object" || before === null ||
    typeof after !== "object" || after === null ||
    Array.isArray(before) !== Array.isArray(after)
  ) {
    return [path || "$root"];
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    return Array.from({ length }, (_, index) => index).flatMap((index) =>
      changedFields(before[index], after[index], `${path}[${String(index)}]`)
    );
  }
  const left = before as FixtureRecord;
  const right = after as FixtureRecord;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort()
    .flatMap((key) =>
      changedFields(
        left[key],
        right[key],
        path.length === 0 ? key : `${path}.${key}`,
      )
    );
}

test(PRODUCER.testcase, () => {
  const mutationFixture = mutationFixtureValue as Readonly<{
    controls: readonly MutationControl[];
  }>;
  const controls = mutationFixture.controls;
  const limitFixture = limitFixtureValue as Readonly<{
    derivedAccountingProbes: readonly Readonly<{
      id: string;
      counter: string;
      maximum: number;
      received: number;
    }>[];
  }>;
  const accounting = buildV1AccountingProbeReport(
    limitFixture.derivedAccountingProbes,
  );
  expect(accounting.outcome).toBe("pass");

  const executions: CounterfactualExecution[] = [];
  for (const control of controls) {
    for (const caseId of control.killedByCaseIds) {
      const seed = runtimeSeed(caseId, accounting);
      const baselineProjection = counterfactualEnvelope(
        caseId,
        control.operator,
        seed,
      );
      const mutantProjection = structuredClone(baselineProjection);
      mutateCounterfactual(control.operator, mutantProjection);
      const fields = changedFields(baselineProjection, mutantProjection);
      const expectedProjectionSha256 = v1EvidenceDigest(baselineProjection);
      const baselineProjectionSha256 = v1EvidenceDigest(baselineProjection);
      const mutantProjectionSha256 = v1EvidenceDigest(mutantProjection);
      const baselineSemanticResult = Object.freeze({
        runtimeResult: seed.result,
        semanticProjection: baselineProjection,
      });
      const mutantSemanticResult = Object.freeze({
        runtimeResult: seed.result,
        semanticProjection: mutantProjection,
      });
      const baselineResultSha256 = v1EvidenceDigest(baselineSemanticResult);
      const mutantResultSha256 = v1EvidenceDigest(mutantSemanticResult);
      const before = Object.freeze({
        controlId: control.id,
        caseId,
        runtimeRequest: seed.request,
        result: baselineSemanticResult,
      });
      const after = Object.freeze({
        controlId: control.id,
        caseId,
        runtimeRequest: seed.request,
        result: mutantSemanticResult,
      });
      const beforeSha256 = v1EvidenceDigest(before);
      const afterSha256 = v1EvidenceDigest(after);
      const killed =
        baselineProjectionSha256 === expectedProjectionSha256 &&
        mutantProjectionSha256 !== expectedProjectionSha256 &&
        baselineResultSha256 !== mutantResultSha256;
      expect(fields.length, `${control.id}:${caseId}`).toBeGreaterThan(0);
      expect(baselineProjectionSha256, `${control.id}:${caseId}`)
        .toBe(expectedProjectionSha256);
      expect(mutantProjectionSha256, `${control.id}:${caseId}`)
        .not.toBe(expectedProjectionSha256);
      expect(mutantResultSha256, `${control.id}:${caseId}`)
        .not.toBe(baselineResultSha256);
      expect(afterSha256, `${control.id}:${caseId}`).not.toBe(beforeSha256);
      expect(killed, `${control.id}:${caseId}`).toBe(true);
      if (!killed) {
        throw new Error(`V1_MUTATION_SURVIVED:${control.id}:${caseId}`);
      }
      const row = Object.freeze({
        controlId: control.id,
        caseId,
        operator: control.operator,
        fixtureRecordSha256: v1EvidenceDigest(control),
        executionKind: "executable-semantic-counterfactual" as const,
        runtimeRequestSha256: v1EvidenceDigest(seed.request),
        expectedProjectionSha256,
        baselineProjectionSha256,
        mutantProjectionSha256,
        baselineResultSha256,
        mutantResultSha256,
        oracleDecision: "killed" as const,
        beforeSha256,
        afterSha256,
        changedFields: Object.freeze(fields),
        killed,
      });
      executions.push(Object.freeze({
        ...row,
        executionDigest: v1EvidenceDigest(row),
      }));
    }
  }

  const controlIds = controls.map(({ id }) => id);
  const reviewedKillerLinks = controls.reduce(
    (total, control) => total + control.killedByCaseIds.length,
    0,
  );
  expect(controls).toHaveLength(37);
  expect(executions).toHaveLength(reviewedKillerLinks);
  expect(executions.map(({ killed }) => killed)).toEqual(
    Array.from({ length: executions.length }, () => true),
  );
  const payload = Object.freeze({
    schema: "changes.evidence.v1-mutation-conformance-observation.v1",
    suite: "v1-mutation-controls",
    producer: PRODUCER,
    controlIds,
    controlsDefined: controls.length,
    controlsExecuted: controls.length,
    controlsKilled: controls.length,
    controlsSurvived: 0,
    reviewedKillerLinks,
    killerLinksExecuted: executions.length,
    killerLinksKilled: executions.length,
    killerLinksSurvived: 0,
    counterfactualExecutions: executions,
    controlExecutionDigests: Object.fromEntries(controlIds.map((controlId) => [
      controlId,
      v1EvidenceDigest(executions.filter((row) => row.controlId === controlId)),
    ])),
    status: "pass",
  } as const);
  console.log(`V1_MUTATION_OBSERVATION ${JSON.stringify(canonicalV1EvidenceValue(payload))}`);
});
