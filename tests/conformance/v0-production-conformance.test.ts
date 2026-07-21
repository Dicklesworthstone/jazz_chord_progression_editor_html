import { describe, expect, test } from "bun:test";

import availabilityFixtureValue from "../fixtures/voicing/availability-matrix.json";
import lawFixtureValue from "../fixtures/voicing/law-cases.json";
import limitFixtureValue from "../fixtures/voicing/limit-cases.json";
import operationFixtureValue from "../fixtures/voicing/operation-state-cases.json";
import transpositionFixtureValue from "../fixtures/voicing/transposition-seeds.json";
import formulaFixtureValue from "../fixtures/resolution/formula-rules.json";

import {
  pitchClassOf,
  type AutoBassPolicy,
  type AutoVoiceCount,
  type AutoVoicingFamily,
  type ChordDegree,
  type TriadQuality,
} from "../../src/domain";
import {
  VOICING_FAMILIES,
  VOICING_MEMORY_COUNTER_NAMES,
  VOICING_MEMORY_LIMITS,
  VOICING_QUALITY_CLASSES,
  VOICING_TERMINATIONS,
  VOICING_WORK_COUNTER_NAMES,
  VOICING_WORK_LIMITS,
  parseChordSymbol,
  realizeVoicing,
  resolveChord,
  type AutoVoicingRequest,
  type QuartalAutoVoicingRequest,
  type RealizeVoicingResult,
  type SemanticRealization,
  type VoicingQualityClass,
} from "../../src/theory";
import {
  auditV0GeneratedResultSet,
  executeV0CandidateCase,
  executeV0ConformanceCase,
  executeV0LawWitness,
  executeV0LimitCase,
  executeV0OperationCase,
  executeV0TranspositionSeed,
  expectedV0ConformanceChannel,
} from "../support/v0-conformance-harness";
import { assessVoicingApplicability } from "../../src/theory/voicing-applicability";
import { getVoicingFamilyPlan } from "../../src/theory/voicing-family-authority";
import {
  V0_CANDIDATE_CASES,
  buildV0CandidateRequest,
  findV0CandidateWithExpectedVoices,
  v0CandidateCase,
  v0DegreeFromToken,
  v0DegreeToken,
  type V0AutoCandidateCaseRecipe,
  type V0CandidateRefusalExpectation,
  type V0CandidateSuccessExpectation,
} from "../support/v0-voicing-fixture";
import {
  V0_PRODUCTION_MARKER,
  V0_PRODUCTION_PRODUCER,
  V0_PRODUCTION_SCHEMA,
  V0_EXPANDED_PRODUCTION_CASE_IDS,
  buildV0CaseBindings,
  signV0EvidenceObservation,
  v0EvidenceDigest,
} from "../../scripts/verify-v0-evidence";

type JsonRecord = Record<string, unknown>;
type ProductionObservationChannel =
  | "availability-cell"
  | "candidate"
  | "family-bass-state"
  | "law-case"
  | "law-witness"
  | "limit"
  | "operation"
  | "semantic-position"
  | "transposition";
type ProductionCaseObservationRecord = Readonly<{
  caseId: string;
  channel: ProductionObservationChannel;
  actualProjection: unknown;
}>;
type ProductionObservationState = Readonly<{
  digests: Record<string, string>;
  records: ProductionCaseObservationRecord[];
}>;
type TerminationObservationRecord = Readonly<{
  caseId: string;
  channel: "candidate" | "operation" | "transposition";
  actualProjection: unknown;
}>;
type ResourceObservationRecord = Readonly<{
  caseId: string;
  actualProjection: unknown;
}>;

type MatrixSeed = Readonly<{
  id: string;
  selectedRealizationId: SemanticRealization["id"];
  formulaRuleId: SemanticRealization["formulaRuleId"];
  qualityClass: VoicingQualityClass;
  degrees: readonly string[];
  requiredDegrees: readonly string[];
  optionalDegrees: readonly string[];
  guideToneDegrees: readonly string[];
}>;

type MatrixCell = Readonly<{
  id: string;
  realizationSeedId: string;
  family: AutoVoicingFamily;
  voiceCount: AutoVoiceCount;
  expected: Readonly<{
    templateAvailability: "available" | "unavailable" | "context-gated";
    quartalContextPolicyId?: string;
    quartalContextPolicyVersion?: number;
    requestTimeSequenceValidationRequired?: boolean;
    refusal: unknown;
  }>;
}>;

type BoundSeed = Readonly<{
  realization: SemanticRealization;
  sourceTriad: TriadQuality;
}>;

const availabilityFixture = availabilityFixtureValue as unknown as Readonly<{
  realizationSeeds: readonly MatrixSeed[];
  cells: readonly MatrixCell[];
}>;

const formulaFixture = formulaFixtureValue as unknown as Readonly<{
  rules: readonly Readonly<{
    id: string;
    matrixSeed: true;
    symbolTemplate: string;
  }>[];
}>;

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  return value as JsonRecord;
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function observe(
  observations: ProductionObservationState,
  caseId: string,
  channel: ProductionObservationChannel,
  actual: unknown,
): void {
  expect(caseId.length).toBeGreaterThan(0);
  expect(observations.digests[caseId]).toBeUndefined();
  observations.digests[caseId] = v0EvidenceDigest({ caseId, actual });
  observations.records.push(Object.freeze({
    caseId,
    channel,
    actualProjection: actual,
  }));
}

function expectDeeplyFrozen(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeeplyFrozen(child, seen);
}

function degreeToken(degree: ChordDegree): string {
  return v0DegreeToken(degree);
}

function resolveSymbol(symbol: string): Readonly<{
  realizations: readonly SemanticRealization[];
  sourceTriad: TriadQuality;
}> {
  const parsed = parseChordSymbol(symbol, "ascii");
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(`V0 proof parse failed: ${symbol}`);
  const resolved = resolveChord(parsed.chord);
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error(`V0 proof resolution failed: ${symbol}`);
  return Object.freeze({
    realizations: resolved.value.realizations,
    sourceTriad: resolved.value.source.triad,
  });
}

function bindRealMatrixSeeds(): ReadonlyMap<string, BoundSeed> {
  const result = new Map<string, BoundSeed>();
  for (const rule of formulaFixture.rules) {
    const resolved = resolveSymbol(rule.symbolTemplate.replace("{root}", "C"));
    const realization = resolved.realizations[0];
    expect(resolved.realizations).toHaveLength(1);
    if (realization === undefined) throw new Error(`Missing seed ${rule.id}`);
    result.set(
      rule.id,
      Object.freeze({ realization, sourceTriad: resolved.sourceTriad }),
    );
  }
  const altered = resolveSymbol("C7alt");
  for (const realization of altered.realizations) {
    result.set(
      realization.id,
      Object.freeze({ realization, sourceTriad: altered.sourceTriad }),
    );
  }
  expect(result.size).toBe(37);
  return result;
}

function projectStaticRefusal(value: ReturnType<typeof assessVoicingApplicability>["refusal"]): unknown {
  if (value === null) return null;
  if (value.code === "voicing.family_unavailable") {
    return {
      code: value.code,
      termination: value.termination,
      reason: value.reason,
    };
  }
  return {
    code: value.code,
    termination: value.termination,
    primaryReason: value.primaryReason,
    reasons: [...value.reasons],
    ...(value.absentTemplateDegrees === undefined
      ? {}
      : { absentTemplateDegrees: value.absentTemplateDegrees.map(degreeToken) }),
  };
}

function executeSemanticPositions(observations: ProductionObservationState): void {
  let count = 0;
  for (const qualityClass of VOICING_QUALITY_CLASSES) {
    for (const family of VOICING_FAMILIES) {
      const plan = getVoicingFamilyPlan(qualityClass, family);
      const projection = {
        qualityClass,
        family,
        templateId: plan.template.id,
        availability: plan.template.availability,
        selectionMode:
          plan.template.availability === "unavailable"
            ? null
            : plan.template.selectionMode,
        registerPolicyId: plan.registerPolicy?.id ?? null,
      };
      observe(
        observations,
        `V0-SEMANTIC-${String(count + 1).padStart(3, "0")}`,
        "semantic-position",
        projection,
      );
      count += 1;
    }
  }
  expect(count).toBe(112);
}

function executeAvailabilityMatrix(observations: ProductionObservationState): void {
  const seeds = bindRealMatrixSeeds();
  expect(availabilityFixture.realizationSeeds).toHaveLength(37);
  for (const expected of availabilityFixture.realizationSeeds) {
    const bound = seeds.get(expected.id);
    if (bound === undefined) throw new Error(`Missing real T1 seed ${expected.id}`);
    expect(bound.realization.id).toBe(expected.selectedRealizationId);
    expect(bound.realization.formulaRuleId).toBe(expected.formulaRuleId);
    expect(bound.realization.degrees.map(degreeToken)).toEqual([...expected.degrees]);
    expect(bound.realization.requiredDegrees.map(degreeToken)).toEqual(
      [...expected.requiredDegrees],
    );
    expect(bound.realization.optionalDegrees.map(degreeToken)).toEqual(
      [...expected.optionalDegrees],
    );
    expect(bound.realization.guideToneDegrees.map(degreeToken)).toEqual(
      [...expected.guideToneDegrees],
    );
  }

  expect(availabilityFixture.cells).toHaveLength(1_295);
  for (const cell of availabilityFixture.cells) {
    const bound = seeds.get(cell.realizationSeedId);
    if (bound === undefined) throw new Error(`Missing matrix seed ${cell.id}`);
    const assessment = assessVoicingApplicability(
      bound.realization,
      bound.sourceTriad,
      cell.family,
      cell.voiceCount,
    );
    const actual: MatrixCell["expected"] = {
      templateAvailability: assessment.template.availability,
      ...(assessment.template.availability === "context-gated"
        ? {
            quartalContextPolicyId: assessment.template.quartalContextPolicyId,
            quartalContextPolicyVersion:
              assessment.template.quartalContextPolicyVersion,
            requestTimeSequenceValidationRequired: true,
          }
        : {}),
      refusal: projectStaticRefusal(assessment.refusal),
    };
    expect(actual).toEqual(cell.expected);
    observe(observations, cell.id, "availability-cell", actual);
  }
}

function assertCandidateSuccess(
  recipe: V0AutoCandidateCaseRecipe,
  expected: V0CandidateSuccessExpectation,
  result: RealizeVoicingResult,
): void {
  expect(result.ok).toBe(true);
  if (!result.ok || result.value.kind !== "generated") {
    throw new Error(`${recipe.id}: expected generated success`);
  }
  const candidate = findV0CandidateWithExpectedVoices(
    result.value.candidates,
    expected,
  );
  expect(candidate).toBeDefined();
  if (candidate === undefined) throw new Error(`${recipe.id}: exact candidate absent`);
  if (expected.rawCandidateCount !== undefined) {
    expect(result.value.rawCandidateCount).toBe(expected.rawCandidateCount);
  }
  if (expected.retainedCandidateCount !== undefined) {
    expect(result.value.candidates).toHaveLength(expected.retainedCandidateCount);
  }
  if (expected.templateId !== undefined) {
    expect(candidate.explanation.templateId).toBe(expected.templateId);
  }
  if (expected.localScore !== undefined) expect(candidate.localScore).toEqual(expected.localScore);
  expect(result.evidence.termination).toBe("complete-generated");
}

function unsatisfiedReasons(result: Extract<RealizeVoicingResult, { ok: false }>): readonly string[] {
  return result.refusal.code === "voicing.constraints_unsatisfied"
    ? result.refusal.constraints.map(({ reason }) => reason)
    : [];
}

function assertCandidateRefusal(
  recipe: V0AutoCandidateCaseRecipe,
  expected: V0CandidateRefusalExpectation,
  result: RealizeVoicingResult,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`${recipe.id}: expected refusal`);
  expect(result.refusal.code).toBe(expected.code);
  expect(result.evidence.termination).toBe(expected.termination);
  if (expected.primaryReason !== undefined) {
    expect(unsatisfiedReasons(result)[0]).toBe(expected.primaryReason);
  }
  if (expected.reasons !== undefined) {
    expect(unsatisfiedReasons(result)).toEqual(expected.reasons);
  }
  if (expected.reason !== undefined) {
    expect(result.refusal.code).toBe("voicing.quartal_context_invalid");
    if (result.refusal.code === "voicing.quartal_context_invalid") {
      expect(result.refusal.reason).toBe(expected.reason);
    }
  }
}

function executeCandidateCases(
  observations: ProductionObservationState,
  terminationRecords: TerminationObservationRecord[],
  storedBypassRecords: ResourceObservationRecord[],
): void {
  expect(V0_CANDIDATE_CASES).toHaveLength(38);
  for (const recipe of V0_CANDIDATE_CASES) {
    const request = buildV0CandidateRequest(recipe);
    const requestBefore = JSON.stringify(request);
    const result = realizeVoicing(request);
    expect(realizeVoicing(request)).toEqual(result);
    expect(JSON.stringify(request)).toBe(requestBefore);
    expectDeeplyFrozen(result);

    if ("sourceSymbol" in recipe) {
      if (recipe.expected.kind === "must-contain-candidate") {
        assertCandidateSuccess(recipe, recipe.expected, result);
      } else {
        assertCandidateRefusal(recipe, recipe.expected, result);
      }
    } else {
      if (request.kind !== "stored") {
        throw new Error(`${recipe.id}: stored recipe built an Auto request`);
      }
      expect(result.ok).toBe(true);
      if (!result.ok || result.value.kind !== "stored-bypass") {
        throw new Error(`${recipe.id}: expected stored bypass`);
      }
      expect(result.value.voicing).toBe(request.voicing);
      expect(result.value.candidateGenerationPerformed).toBe(false);
      for (const [counter, value] of Object.entries(result.evidence)) {
        if (counter !== "termination") expect(value).toBe(0);
      }
      expect(result.evidence.termination).toBe("complete-bypass");
    }

    const envelope = executeV0CandidateCase(recipe.id);
    expect(envelope.baselineAccepted).toBe(true);
    expect(envelope.runtimeOutput).toEqual(result);
    observe(observations, recipe.id, "candidate", envelope.actualProjection);
    terminationRecords.push(Object.freeze({
      caseId: recipe.id,
      channel: "candidate",
      actualProjection: envelope.actualProjection,
    }));
    if (recipe.id === "V0-CAND-031" || recipe.id === "V0-CAND-032") {
      storedBypassRecords.push(Object.freeze({
        caseId: recipe.id,
        actualProjection: envelope.actualProjection,
      }));
    }
  }
}

function resolvedChordFor(symbol: string): AutoVoicingRequest["resolved"] {
  const parsed = parseChordSymbol(symbol, "ascii");
  if (!parsed.ok) throw new Error(`V0 state proof parse failed: ${symbol}`);
  const resolved = resolveChord(parsed.chord);
  if (!resolved.ok) throw new Error(`V0 state proof resolution failed: ${symbol}`);
  return resolved.value;
}

function baseAutoRequest(caseId: string): AutoVoicingRequest {
  const request = buildV0CandidateRequest(v0CandidateCase(caseId));
  if (request.kind !== "auto") throw new Error(`${caseId} is not Auto`);
  return request;
}

function quartalContextWithDegrees(
  tokens: readonly string[],
  label: string,
): QuartalAutoVoicingRequest["quartalContext"] {
  const base = baseAutoRequest("V0-CAND-009");
  if (base.policy.family !== "quartal" || base.quartalContext === null) {
    throw new Error("V0-CAND-009 must carry Quartal context");
  }
  return Object.freeze({
    ...base.quartalContext,
    evidenceId: `v0-proof-${label}`,
    degreeSequence: Object.freeze(
      tokens.map((token) => v0DegreeFromToken(
        token as Parameters<typeof v0DegreeFromToken>[0],
        label,
      )),
    ) as QuartalAutoVoicingRequest["quartalContext"]["degreeSequence"],
  });
}

function familyStateRequest(
  family: AutoVoicingFamily,
  slash: boolean,
  bassPolicy: AutoBassPolicy,
): AutoVoicingRequest {
  const sourceSymbol = slash ? "Cmaj13/Eb" : "Cmaj13";
  const resolved = resolvedChordFor(sourceSymbol);
  const familyBaseId: Readonly<Record<AutoVoicingFamily, string>> = {
    balanced: "V0-CAND-001",
    shell: "V0-CAND-002",
    "rootless-a": "V0-CAND-006",
    "rootless-b": "V0-CAND-007",
    open: "V0-CAND-003",
    drop2: "V0-CAND-004",
    quartal: "V0-CAND-009",
  };
  const base = baseAutoRequest(familyBaseId[family]);
  const voiceCount: AutoVoiceCount = family === "shell" ? 3 : 4;
  const quartalTokens = slash && bassPolicy === "generated"
    ? ["7", "3", "13"]
    : ["7", "3", "13", "9"];
  return Object.freeze({
    ...base,
    resolved,
    realizationId: "literal",
    policy: Object.freeze({
      ...base.policy,
      family,
      voiceCount,
      range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
      bassPolicy,
    }),
    quartalContext:
      family === "quartal"
        ? quartalContextWithDegrees(
            quartalTokens,
            `${family}-${slash ? "slash" : "plain"}-${bassPolicy}`,
          )
        : null,
  }) as unknown as AutoVoicingRequest;
}

function resultHasReason(result: RealizeVoicingResult, reason: string): boolean {
  return !result.ok && result.refusal.code === "voicing.constraints_unsatisfied" &&
    result.refusal.constraints.some((constraint) => constraint.reason === reason);
}

function executeFamilyBassStates(observations: ProductionObservationState): void {
  let stateCount = 0;
  for (const family of VOICING_FAMILIES) {
    for (const slash of [false, true]) {
      for (const bassPolicy of ["generated", "external", "none"] as const) {
        const request = familyStateRequest(family, slash, bassPolicy);
        const result = realizeVoicing(request);
        let completeResultAudit: unknown = null;
        expect(realizeVoicing(request)).toEqual(result);
        expectDeeplyFrozen(result);

        if (slash && bassPolicy === "none") {
          expect(result.ok).toBe(false);
          expect(resultHasReason(result, "bass-policy-unsupported")).toBe(true);
        }
        if (
          (family === "rootless-a" || family === "rootless-b") &&
          bassPolicy !== "external"
        ) {
          expect(result.ok).toBe(false);
          expect(resultHasReason(result, "bass-policy-unsupported")).toBe(true);
        }
        if (!result.ok) {
          expect(result.refusal.code).not.toBe("voicing.family_unavailable");
        } else {
          completeResultAudit = auditV0GeneratedResultSet(request, result);
          const audit = asRecord(
            completeResultAudit,
            `${family}/${String(slash)}/${bassPolicy}.completeResultAudit`,
          );
          const auditChecks = audit["checks"];
          expect(Array.isArray(auditChecks)).toBe(true);
          if (!Array.isArray(auditChecks)) throw new TypeError("complete-result checks");
          expect(auditChecks).toHaveLength(12);
          for (const check of auditChecks) {
            expect(asRecord(check, "complete-result check")["accepted"]).toBe(true);
          }
          for (const candidate of result.value.candidates) {
            expect(candidate.family).toBe(family);
            expect(candidate.voices).toHaveLength(request.policy.voiceCount);
            if (slash && bassPolicy === "generated") {
              const lowest = candidate.voices[0];
              expect(lowest.provenance).toBe("slash-bass");
              expect(lowest.pitch).toMatchObject(request.resolved.bass ?? {});
            }
            if (bassPolicy === "external") {
              const external = request.resolved.bass ?? request.resolved.source.root;
              expect(
                candidate.voices.some(
                  ({ pitch }) => pitchClassOf(pitch) === pitchClassOf(external),
                ),
              ).toBe(false);
            }
          }
        }

        observe(
          observations,
          `V0-BASS-${String(stateCount + 1).padStart(3, "0")}`,
          "family-bass-state",
          { result, completeResultAudit },
        );
        stateCount += 1;
      }
    }
  }
  expect(stateCount).toBe(42);
}

function operationCases(key: string): readonly JsonRecord[] {
  const value = asRecord(operationFixtureValue, "operation fixture")[key];
  if (!Array.isArray(value)) throw new TypeError(`${key} must be an array`);
  return value.map((item, index) => asRecord(item, `${key}[${index.toString()}]`));
}

function executeOperationCases(
  observations: ProductionObservationState,
  terminationRecords: TerminationObservationRecord[],
): void {
  const successes = operationCases("successCases");
  const refusals = operationCases("refusalCases");
  const precedence = operationCases("precedenceCases");
  const notApplicable = operationCases("notApplicableCases");
  expect(successes).toHaveLength(4);
  expect(refusals).toHaveLength(16);
  expect(precedence).toHaveLength(7);
  expect(notApplicable).toHaveLength(5);

  for (const record of [...successes, ...refusals, ...precedence, ...notApplicable]) {
    const id = String(record["id"]);
    const envelope = executeV0OperationCase(id);
    expect(envelope.baselineAccepted, `${id}: exact operation semantics`).toBe(true);
    observe(observations, id, "operation", envelope.actualProjection);
    terminationRecords.push(Object.freeze({
      caseId: id,
      channel: "operation",
      actualProjection: envelope.actualProjection,
    }));
  }
}

function limitCases(key: string): readonly JsonRecord[] {
  const value = asRecord(limitFixtureValue, "limit fixture")[key];
  if (!Array.isArray(value)) throw new TypeError(`${key} must be an array`);
  return value.map((item, index) => asRecord(item, `${key}[${index.toString()}]`));
}

function executeLimitCases(
  observations: ProductionObservationState,
  counterBoundaryRecords: ResourceObservationRecord[],
  wallTimeRecords: ResourceObservationRecord[],
): void {
  const counters = limitCases("counterBoundaryCases");
  const retention = limitCases("retentionCases");
  const identifiers = limitCases("identifierBoundaryCases");
  const midi = limitCases("midiBoundaryCases");
  const wallTime = limitCases("wallTimeCases");
  expect(counters).toHaveLength(48);
  expect(retention).toHaveLength(4);
  expect(identifiers).toHaveLength(6);
  expect(midi).toHaveLength(4);
  expect(wallTime).toHaveLength(1);

  const execute = (record: JsonRecord): ResourceObservationRecord => {
    const caseId = String(record["id"]);
    const envelope = executeV0LimitCase(caseId);
    expect(envelope.channel).toBe("limit");
    expect(envelope.baselineAccepted, `${caseId}: independent limit oracle`)
      .toBe(true);
    observe(observations, caseId, "limit", envelope.actualProjection);
    return Object.freeze({ caseId, actualProjection: envelope.actualProjection });
  };
  for (const record of counters) {
    counterBoundaryRecords.push(execute(record));
  }
  for (const record of retention) {
    execute(record);
  }
  for (const record of identifiers) {
    execute(record);
  }
  for (const record of midi) {
    execute(record);
  }
  for (const record of wallTime) {
    expect(record["id"]).toBe("V0-WALL-TIME-001-NO-CUTOFF");
    wallTimeRecords.push(execute(record));
  }
}

function executeTranspositionSeeds(
  observations: ProductionObservationState,
  terminationRecords: TerminationObservationRecord[],
): void {
  const root = asRecord(transpositionFixtureValue, "transposition fixture");
  const seeds = root["seeds"];
  const roots = root["roots"];
  expect(Array.isArray(seeds)).toBe(true);
  expect(Array.isArray(roots)).toBe(true);
  if (!Array.isArray(seeds) || !Array.isArray(roots)) {
    throw new TypeError("V0 transposition fixture arrays missing");
  }
  expect(seeds).toHaveLength(18);
  expect(roots).toHaveLength(12);
  for (const value of seeds) {
    const seed = asRecord(value, "transposition seed");
    const caseId = String(seed["id"]);
    const envelope = executeV0TranspositionSeed(caseId);
    expect(envelope.baselineAccepted, `${caseId}: independent transposition oracle`)
      .toBe(true);
    const actual = asRecord(envelope.actualProjection, `${caseId}.projection`);
    expect(actual["rootCellCount"]).toBe(12);
    const cells = actual["cells"];
    expect(Array.isArray(cells)).toBe(true);
    if (!Array.isArray(cells)) throw new TypeError(`${caseId}: cells`);
    for (const cellValue of cells) {
      const cell = asRecord(cellValue, `${caseId}.cell`);
      if (caseId === "V0-TRANS-016") {
        expect(cell["inverseRequestProjectionRestored"]).toBe(true);
      } else if (caseId === "V0-TRANS-018") {
        expect(cell["forwardRefusalProjectionAccepted"]).toBe(true);
        expect(cell["inverseRequestProjectionRestored"]).toBe(true);
      } else {
        expect(cell["requestRootObserved"]).toBe(true);
        expect(cell["forwardProjectionAccepted"]).toBe(true);
        expect(cell["inverseProjectionRestored"]).toBe(true);
        expect(cell["inverseRequestProjectionRestored"]).toBe(true);
      }
    }
    observe(observations, caseId, "transposition", envelope.actualProjection);
    terminationRecords.push(Object.freeze({
      caseId,
      channel: "transposition",
      actualProjection: envelope.actualProjection,
    }));
  }
}

function executeLawWitnesses(observations: ProductionObservationState): void {
  const root = asRecord(lawFixtureValue, "law fixture");
  const witnesses = root["witnesses"];
  expect(Array.isArray(witnesses)).toBe(true);
  if (!Array.isArray(witnesses)) throw new TypeError("law witnesses missing");
  expect(witnesses).toHaveLength(44);
  for (const value of witnesses) {
    const witness = asRecord(value, "law witness");
    const caseId = String(witness["id"]);
    const envelope = executeV0LawWitness(caseId);
    expect(envelope.baselineAccepted, `${caseId}: independent witness oracle`)
      .toBe(true);
    observe(observations, caseId, "law-witness", envelope.actualProjection);
  }
}

function executeLawCases(observations: ProductionObservationState): void {
  const root = asRecord(lawFixtureValue, "law fixture");
  const laws = root["cases"];
  expect(Array.isArray(laws)).toBe(true);
  if (!Array.isArray(laws)) throw new TypeError("law cases missing");
  expect(laws).toHaveLength(23);
  for (const value of laws) {
    const law = asRecord(value, "law case");
    const caseId = String(law["id"]);
    const positive = law["positiveCaseIds"];
    const negative = law["negativeCaseIds"];
    const transposition = law["transpositionSeedIds"];
    const mutation = law["mutationControlIds"];
    if (!Array.isArray(positive) || !Array.isArray(negative) ||
        !Array.isArray(transposition) || !Array.isArray(mutation)) {
      throw new TypeError(`${caseId}: law references missing`);
    }
    const envelope = executeV0ConformanceCase(caseId);
    expect(envelope.channel).toBe("law-case");
    expect(envelope.baselineAccepted, `${caseId}: executable law predicate`)
      .toBe(true);
    const actual = asRecord(envelope.actualProjection, `${caseId}.projection`);
    expect(actual["lawId"]).toBe(law["lawId"]);
    expect(actual["predicate"]).toBe(law["predicate"]);
    expect(actual["mutationControlIds"]).toEqual(mutation);
    expect(mutation.length).toBeGreaterThan(0);

    const checks = actual["checks"];
    expect(Array.isArray(checks)).toBe(true);
    if (!Array.isArray(checks)) throw new TypeError(`${caseId}: checks missing`);
    expect(checks.length).toBeGreaterThan(0);
    for (const [index, checkValue] of checks.entries()) {
      const check = asRecord(
        checkValue,
        `${caseId}.checks[${index.toString()}]`,
      );
      expect(typeof check["id"]).toBe("string");
      expect(check["accepted"], `${caseId}/${String(check["id"])}`).toBe(true);
    }

    const assertBindings = (
      field: "positiveBindings" | "negativeBindings" | "transpositionBindings",
      expectedIds: readonly unknown[],
    ): void => {
      const bindings = actual[field];
      expect(Array.isArray(bindings)).toBe(true);
      if (!Array.isArray(bindings)) throw new TypeError(`${caseId}.${field}`);
      expect(bindings).toHaveLength(expectedIds.length);
      for (const [index, bindingValue] of bindings.entries()) {
        const binding = asRecord(
          bindingValue,
          `${caseId}.${field}[${index.toString()}]`,
        );
        const childCaseId = String(binding["caseId"]);
        expect(childCaseId).toBe(String(expectedIds[index]));
        expect(binding["channel"]).toBe(expectedV0ConformanceChannel(childCaseId));
        const observedDigest = observations.digests[childCaseId];
        expect(observedDigest, `${caseId}: observed ${childCaseId}`).toBeDefined();
        if (observedDigest === undefined) {
          throw new Error(`${caseId}: missing observed child ${childCaseId}`);
        }
        expect(v0EvidenceDigest({
          caseId: childCaseId,
          actual: binding["projection"],
        })).toBe(observedDigest);
      }
    };
    assertBindings("positiveBindings", positive);
    assertBindings("negativeBindings", negative);
    assertBindings("transpositionBindings", transposition);
    observe(observations, caseId, "law-case", envelope.actualProjection);
  }
}

function terminationCountsFromRecords(
  records: readonly TerminationObservationRecord[],
): Record<string, number> {
  const counts = Object.fromEntries(VOICING_TERMINATIONS.map((value) => [value, 0]));
  const add = (termination: unknown, label: string): void => {
    expect(typeof termination, `${label}: termination type`).toBe("string");
    if (typeof termination !== "string" || !(termination in counts)) {
      throw new Error(`${label}: unknown termination ${String(termination)}`);
    }
    counts[termination] = (counts[termination] ?? 0) + 1;
  };
  for (const source of records) {
    const projection = asRecord(
      source.actualProjection,
      `${source.caseId}.terminationProjection`,
    );
    if (source.channel !== "transposition") {
      add(projection["termination"], source.caseId);
      continue;
    }
    const cells = projection["cells"];
    if (!Array.isArray(cells)) throw new TypeError(`${source.caseId}: cells missing`);
    expect(cells).toHaveLength(12);
    for (const [index, value] of cells.entries()) {
      const cell = asRecord(value, `${source.caseId}.cells[${index.toString()}]`);
      add(cell["termination"], `${source.caseId}/${String(cell["rootId"])}`);
    }
  }
  for (const termination of VOICING_TERMINATIONS) {
    expect(counts[termination], `${termination}: observed production termination`)
      .toBeGreaterThan(0);
  }
  return counts;
}

function counterMaximaFromRecords(
  records: readonly ResourceObservationRecord[],
  kind: "work" | "memory",
): Record<string, number> {
  const names = kind === "work"
    ? VOICING_WORK_COUNTER_NAMES
    : VOICING_MEMORY_COUNTER_NAMES;
  const maxima: Record<string, number> = {};
  for (const counter of names) {
    const matching = records.map(({ actualProjection }) =>
      asRecord(actualProjection, `${kind}.${counter}`)
    ).filter((projection) =>
      projection["counterKind"] === kind && projection["counter"] === counter
    );
    expect(matching, `${kind}.${counter}: exact/+1 records`).toHaveLength(2);
    const observedMaxima = new Set(matching.map(({ maximum }) => Number(maximum)));
    expect(observedMaxima.size, `${kind}.${counter}: one maximum`).toBe(1);
    const maximum = Number(matching[0]?.["maximum"]);
    expect(Number.isSafeInteger(maximum) && maximum >= 0).toBe(true);
    const exact = matching.find(({ boundary }) => boundary === "exact-limit");
    const plusOne = matching.find(
      ({ boundary }) => boundary === "attempted-limit-plus-one",
    );
    expect(exact).toBeDefined();
    expect(plusOne).toBeDefined();
    if (exact === undefined || plusOne === undefined) {
      throw new Error(`${kind}.${counter}: boundary pair missing`);
    }
    for (const projection of [exact, plusOne]) {
      const exactAttempt = asRecord(
        projection["exactAttempt"],
        `${kind}.${counter}.exactAttempt`,
      );
      expect(projection["beforeExactValue"]).toBe(maximum - 1);
      expect(exactAttempt).toEqual({ ok: true, value: maximum });
      expect(projection["afterExactValue"]).toBe(maximum);
    }
    expect(exact["plusOneAttempt"]).toBeNull();
    expect(exact["afterPlusOneValue"]).toBeNull();
    const plusOneAttempt = asRecord(
      plusOne["plusOneAttempt"],
      `${kind}.${counter}.plusOneAttempt`,
    );
    const refusal = asRecord(
      plusOneAttempt["refusal"],
      `${kind}.${counter}.plusOneAttempt.refusal`,
    );
    expect(plusOneAttempt["ok"]).toBe(false);
    expect(refusal["counter"]).toBe(counter);
    expect(refusal["received"]).toBe(maximum + 1);
    expect(refusal["maximum"]).toBe(maximum);
    expect(refusal["partialResult"]).toBe(false);
    expect(plusOne["afterPlusOneValue"]).toBe(maximum);
    maxima[counter] = maximum;
  }
  return maxima;
}

function exactPlusOneLimitsFromRecords(
  records: readonly ResourceObservationRecord[],
): boolean {
  return records.length === 48 && records.every(({ actualProjection }) => {
    const projection = asRecord(actualProjection, "counter boundary projection");
    const maximum = Number(projection["maximum"]);
    const exactAttempt = asRecord(
      projection["exactAttempt"],
      "counter boundary exact attempt",
    );
    const exactTransitionAccepted =
      projection["beforeExactValue"] === maximum - 1 &&
      exactAttempt["ok"] === true &&
      exactAttempt["value"] === maximum &&
      projection["afterExactValue"] === maximum;
    if (!exactTransitionAccepted) return false;
    if (projection["boundary"] === "exact-limit") {
      return projection["plusOneAttempt"] === null &&
        projection["afterPlusOneValue"] === null;
    }
    if (projection["boundary"] !== "attempted-limit-plus-one") return false;
    const plusOneAttempt = asRecord(
      projection["plusOneAttempt"],
      "counter boundary plus-one attempt",
    );
    const refusal = asRecord(
      plusOneAttempt["refusal"],
      "counter boundary plus-one refusal",
    );
    return plusOneAttempt["ok"] === false &&
      refusal["counter"] === projection["counter"] &&
      refusal["received"] === maximum + 1 &&
      refusal["maximum"] === maximum &&
      refusal["partialResult"] === false &&
      projection["afterPlusOneValue"] === maximum;
  });
}

function storedBypassZeroFromRecords(
  records: readonly ResourceObservationRecord[],
): boolean {
  if (records.length !== 2) return false;
  return records.every(({ actualProjection }) => {
    const projection = asRecord(actualProjection, "stored bypass projection");
    const evidence = asRecord(
      projection["counterEvidence"],
      `${String(projection["caseId"])}.counterEvidence`,
    );
    return projection["kind"] === "stored-bypass" &&
      projection["termination"] === "complete-bypass" &&
      [...VOICING_WORK_COUNTER_NAMES, ...VOICING_MEMORY_COUNTER_NAMES].every(
        (counter) => evidence[counter] === 0,
      );
  });
}

function wallTimeGatingFromRecord(recordValue: ResourceObservationRecord): boolean {
  const projection = asRecord(recordValue.actualProjection, "wall-time projection");
  expect(projection["perturbations"]).toEqual(["Date.now", "Math.random"]);
  const baseline = asRecord(
    projection["baselineProjection"],
    "wall-time baseline projection",
  );
  const perturbed = asRecord(
    projection["perturbedProjection"],
    "wall-time perturbed projection",
  );
  const compactProjections = [
    ["baseline", baseline],
    ["perturbed", perturbed],
  ] as const;
  for (const [label, compact] of compactProjections) {
    expect(compact["termination"], `${label}: termination`)
      .toBe("complete-generated");
    expect(compact["resultKind"], `${label}: result kind`).toBe("generated");
    expect(compact["refusal"], `${label}: refusal`).toBeNull();
    expect(Number(compact["candidateCount"]), `${label}: candidate count`)
      .toBeGreaterThan(0);
    expect(compact["fullResultSemanticDigest"], `${label}: semantic digest`)
      .toMatch(/^[0-9a-f]{64}$/);
    const counterEvidence = asRecord(
      compact["counterEvidence"],
      `${label}: counter evidence`,
    );
    expect(Object.keys(counterEvidence).sort(codeUnitCompare)).toEqual(
      [...VOICING_WORK_COUNTER_NAMES, ...VOICING_MEMORY_COUNTER_NAMES]
        .sort(codeUnitCompare),
    );
    for (const value of Object.values(counterEvidence)) {
      expect(Number.isSafeInteger(value) && Number(value) >= 0).toBe(true);
    }
  }
  const exactProjectionEquality = JSON.stringify(baseline) === JSON.stringify(perturbed);
  expect(exactProjectionEquality).toBe(true);
  return !exactProjectionEquality;
}

function expectObservationRecordBindings(
  observations: ProductionObservationState,
  records: readonly ResourceObservationRecord[] | readonly TerminationObservationRecord[],
): void {
  for (const recordValue of records) {
    expect(observations.digests[recordValue.caseId]).toBe(
      v0EvidenceDigest({
        caseId: recordValue.caseId,
        actual: recordValue.actualProjection,
      }),
    );
  }
}

describe("V0 complete production authority", () => {
  test(
    "executes the complete independent V0 authority and emits one bound observation",
    () => {
      const observations: ProductionObservationState = {
        digests: {},
        records: [],
      };
      const terminationRecords: TerminationObservationRecord[] = [];
      const counterBoundaryRecords: ResourceObservationRecord[] = [];
      const storedBypassRecords: ResourceObservationRecord[] = [];
      const wallTimeRecords: ResourceObservationRecord[] = [];
      executeSemanticPositions(observations);
      executeFamilyBassStates(observations);
      executeAvailabilityMatrix(observations);
      executeCandidateCases(observations, terminationRecords, storedBypassRecords);
      executeOperationCases(observations, terminationRecords);
      executeLimitCases(observations, counterBoundaryRecords, wallTimeRecords);
      executeTranspositionSeeds(observations, terminationRecords);
      executeLawWitnesses(observations);
      executeLawCases(observations);

      const expectedCaseIds = [
        ...buildV0CaseBindings().map(({ caseId }) => caseId),
        ...V0_EXPANDED_PRODUCTION_CASE_IDS,
      ].sort(codeUnitCompare);
      expect(Object.keys(observations.digests).sort(codeUnitCompare)).toEqual(
        expectedCaseIds,
      );
      expect(expectedCaseIds).toHaveLength(1_667);

      const caseObservationDigests = Object.fromEntries(
        Object.entries(observations.digests).sort(([left], [right]) =>
          codeUnitCompare(left, right)
        ),
      );
      const caseObservationRecords = [...observations.records].sort(
        (left, right) => codeUnitCompare(left.caseId, right.caseId),
      );
      expect(caseObservationRecords).toHaveLength(1_667);
      expect(caseObservationRecords.map(({ caseId }) => caseId)).toEqual(
        expectedCaseIds,
      );
      for (const record of caseObservationRecords) {
        expect(caseObservationDigests[record.caseId]).toBe(v0EvidenceDigest({
          caseId: record.caseId,
          actual: record.actualProjection,
        }));
      }
      const orderedTerminationRecords = [...terminationRecords].sort(
        (left, right) => codeUnitCompare(left.caseId, right.caseId),
      );
      const orderedCounterBoundaryRecords = [...counterBoundaryRecords].sort(
        (left, right) => codeUnitCompare(left.caseId, right.caseId),
      );
      const orderedStoredBypassRecords = [...storedBypassRecords].sort(
        (left, right) => codeUnitCompare(left.caseId, right.caseId),
      );
      expect(orderedTerminationRecords).toHaveLength(88);
      expect(orderedCounterBoundaryRecords).toHaveLength(48);
      expect(orderedStoredBypassRecords).toHaveLength(2);
      expect(wallTimeRecords).toHaveLength(1);
      expectObservationRecordBindings(observations, orderedTerminationRecords);
      expectObservationRecordBindings(observations, orderedCounterBoundaryRecords);
      expectObservationRecordBindings(observations, orderedStoredBypassRecords);
      expectObservationRecordBindings(observations, wallTimeRecords);
      const workCounterMaxima = counterMaximaFromRecords(
        orderedCounterBoundaryRecords,
        "work",
      );
      const memoryCounterMaxima = counterMaximaFromRecords(
        orderedCounterBoundaryRecords,
        "memory",
      );
      expect(workCounterMaxima).toEqual(VOICING_WORK_LIMITS);
      expect(memoryCounterMaxima).toEqual(VOICING_MEMORY_LIMITS);
      const terminationCounts = terminationCountsFromRecords(
        orderedTerminationRecords,
      );
      const storedBypassZeroCounters = storedBypassZeroFromRecords(
        orderedStoredBypassRecords,
      );
      const exactPlusOneLimitsRefuseAtomically = exactPlusOneLimitsFromRecords(
        orderedCounterBoundaryRecords,
      );
      const wallTimeObservationRecord = wallTimeRecords[0];
      if (wallTimeObservationRecord === undefined) {
        throw new Error("V0 wall-time observation missing");
      }
      const wallTimeGating = wallTimeGatingFromRecord(wallTimeObservationRecord);
      expect(storedBypassZeroCounters).toBe(true);
      expect(exactPlusOneLimitsRefuseAtomically).toBe(true);
      expect(wallTimeGating).toBe(false);
      const payload = {
        schema: V0_PRODUCTION_SCHEMA,
        suite: "v0-production-conformance",
        producer: V0_PRODUCTION_PRODUCER,
        availabilityCellsObserved: 1_295,
        semanticApplicabilityPositionsObserved: 112,
        familyBassStatesObserved: 42,
        candidateCasesObserved: 38,
        lawCasesObserved: 23,
        lawWitnessesObserved: 44,
        operationStateCasesObserved: 32,
        limitCasesObserved: 63,
        transpositionRootCellsObserved: 216,
        transpositionForwardCellsObserved: 216,
        transpositionInverseCellsObserved: 216,
        workCounterMaxima,
        memoryCounterMaxima,
        terminationCounts,
        storedBypassZeroCounters,
        exactPlusOneLimitsRefuseAtomically,
        wallTimeGating,
        terminationObservationRecords: orderedTerminationRecords,
        counterBoundaryObservationRecords: orderedCounterBoundaryRecords,
        storedBypassObservationRecords: orderedStoredBypassRecords,
        wallTimeObservationRecord,
        caseObservationRecords,
        caseObservationDigests,
        caseObservationRecordInventoryDigest:
          v0EvidenceDigest(caseObservationRecords),
        caseObservationInventoryDigest: v0EvidenceDigest(
          Object.entries(caseObservationDigests),
        ),
        status: "pass",
      } as const;
      const signed = signV0EvidenceObservation(payload);
      expect(signed.semanticDigest).toBe(v0EvidenceDigest(payload));
      console.log(`${V0_PRODUCTION_MARKER}${JSON.stringify(signed)}`);
    },
    600_000,
  );
});
