import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";

import type {
  CompilePlaybackPlanRequest,
  CompilePlaybackPlanResult,
  PlaybackRealizationBinding,
} from "../../src/playback";
import { validateDocumentSemantics } from "../../src/application";
import { decodeDocumentShape } from "../../src/domain";
import { compilePlaybackPlan } from "../../src/playback/compile-playback-plan";
import {
  realizeVoicing,
  type AutoVoicingRequest,
  type VoicingCandidate,
  type VoicingFailure,
} from "../../src/theory";
import {
  materializeP0LoopCase,
  materializeP0RealizationBaseline,
  materializeP0RealizationCase,
} from "../support/p0-playback-fixtures";
import {
  buildV0AutoCandidateRequest,
  findV0CandidateWithExpectedVoices,
  v0CandidateCase,
} from "../support/v0-voicing-fixture";

type MutableRecord = Record<string, unknown>;

class AccessorBackedReadonlyMap<K, V> implements ReadonlyMap<K, V> {
  constructor(
    private readonly backing: ReadonlyMap<K, V>,
    private readonly observeSize: () => void,
  ) {}

  get size(): number {
    this.observeSize();
    return this.backing.size;
  }

  entries(): MapIterator<[K, V]> {
    return this.backing.entries();
  }

  forEach(
    callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.backing) {
      callback.call(thisArg, value, key, this);
    }
  }

  get(key: K): V | undefined {
    return this.backing.get(key);
  }

  has(key: K): boolean {
    return this.backing.has(key);
  }

  keys(): MapIterator<K> {
    return this.backing.keys();
  }

  values(): MapIterator<V> {
    return this.backing.values();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
}

const PLAYBACK_PRODUCTION_FILE_NAMES = Object.freeze([
  "compile-playback-plan.ts",
  "index.ts",
  "playback-plan-contract.ts",
] as const);

const FORBIDDEN_THEORY_RUNTIME_CALLS = new Set([
  "classifyVoicingQuality",
  "getVoicingFamilyPlan",
  "parseChordSymbol",
  "realizeVoicing",
  "resolveChord",
]);

const REAL_V0_FAILURE_CASE_IDS = Object.freeze([
  "V0-CAND-030",
  "V0-CAND-026",
  "V0-CAND-027",
  "V0-CAND-025",
] as const);

type PlaybackSourceUnit = Readonly<{
  fileName: string;
  sourceFile: ts.SourceFile;
}>;

function parseSource(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
}

function importIsTypeOnly(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause;
  if (clause === undefined) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  if (clause.name !== undefined || clause.namedBindings === undefined) {
    return false;
  }
  return ts.isNamedImports(clause.namedBindings) &&
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function calledName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text;
  }
  return null;
}

function playbackOwnershipFindings(
  units: readonly PlaybackSourceUnit[],
): readonly string[] {
  const findings = new Set<string>();
  for (const unit of units) {
    for (const statement of unit.sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteralLike(statement.moduleSpecifier)
      ) {
        continue;
      }
      const specifier = statement.moduleSpecifier.text;
      if (specifier.startsWith("../theory/")) {
        findings.add(`${unit.fileName}:deep-theory-import:${specifier}`);
      }
      if (specifier === "../theory" && !importIsTypeOnly(statement)) {
        findings.add(`${unit.fileName}:runtime-theory-import`);
      }
    }

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = calledName(node.expression);
        if (name !== null && FORBIDDEN_THEORY_RUNTIME_CALLS.has(name)) {
          findings.add(`${unit.fileName}:runtime-theory-call:${name}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(unit.sourceFile);
  }
  return [...findings].sort();
}

function publicBarrelFindings(unit: PlaybackSourceUnit): readonly string[] {
  const findings = new Set<string>();
  const forbiddenName = "probePlaybackPlanCounterForTest";
  for (const statement of unit.sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (statement.exportClause === undefined) {
      const specifier =
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteralLike(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : "local";
      if (specifier !== "./playback-plan-contract") {
        findings.add(`${unit.fileName}:star-reexport:${specifier}`);
      }
      continue;
    }
    if (
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some(
        (element) =>
          element.name.text === forbiddenName ||
          element.propertyName?.text === forbiddenName,
      )
    ) {
      findings.add(`${unit.fileName}:counter-probe-reexport`);
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === forbiddenName) {
      findings.add(`${unit.fileName}:counter-probe-reference`);
    }
    ts.forEachChild(node, visit);
  };
  visit(unit.sourceFile);
  return [...findings].sort();
}

function namedFunction(
  unit: PlaybackSourceUnit,
  functionName: string,
): ts.FunctionDeclaration & Readonly<{ body: ts.Block }> {
  const declaration = unit.sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName,
  );
  if (declaration === undefined || declaration.body === undefined) {
    throw new Error(`P0_DEFENSIVE_FUNCTION_MISSING:${functionName}`);
  }
  return declaration as ts.FunctionDeclaration & Readonly<{ body: ts.Block }>;
}

function retainedInventoryFindings(
  unit: PlaybackSourceUnit,
): readonly string[] {
  const findings: string[] = [];
  const scopes = [
    {
      declaration: namedFunction(unit, "enumerateBindings"),
      label: "binding-preflight",
      maximumMutableArrayAccumulators: 1,
    },
    {
      declaration: namedFunction(unit, "compilePlaybackPlanOwned"),
      label: "source-inventory",
      maximumMutableArrayAccumulators: Number.POSITIVE_INFINITY,
    },
  ] as const;

  for (const scope of scopes) {
    let mutableArrayAccumulators = 0;
    const growingIndexConstructors: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer !== undefined &&
        ts.isArrayLiteralExpression(node.initializer) &&
        node.initializer.elements.length === 0
      ) {
        mutableArrayAccumulators += 1;
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "Set" || node.expression.text === "Map")
      ) {
        growingIndexConstructors.push(node.expression.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(scope.declaration.body);

    if (
      mutableArrayAccumulators > scope.maximumMutableArrayAccumulators
    ) {
      findings.push(
        `${scope.label}:parallel-mutable-array-accumulators:${String(mutableArrayAccumulators)}`,
      );
    }
    for (const constructor of [...new Set(growingIndexConstructors)].sort()) {
      findings.push(`${scope.label}:parallel-growing-${constructor}-index`);
    }
  }
  return findings.sort();
}

function record(value: unknown, label: string): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`P0_DEFENSIVE_RECORD:${label}`);
  }
  return value as MutableRecord;
}

function soleBinding(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): PlaybackRealizationBinding {
  const binding = [...request.realizedVoicings.values()][0];
  if (binding === undefined) {
    throw new Error("P0_DEFENSIVE_BINDING_MISSING");
  }
  return binding;
}

function generatedCandidate(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): MutableRecord {
  const binding = record(soleBinding(request), "generated binding");
  const outcome = record(binding["outcome"], "generated outcome");
  return record(outcome["candidate"], "generated candidate");
}

function generatedRequest(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): MutableRecord {
  const binding = record(soleBinding(request), "generated request binding");
  return record(binding["request"], "generated request");
}

function generatedResolved(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): MutableRecord {
  return record(generatedRequest(request)["resolved"], "generated resolved");
}

function generatedOutcome(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): MutableRecord {
  const binding = record(soleBinding(request), "generated outcome binding");
  return record(binding["outcome"], "generated outcome");
}

function generatedExplanation(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): MutableRecord {
  return record(
    generatedCandidate(request)["explanation"],
    "generated explanation",
  );
}

function storedVoicing(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): MutableRecord {
  const binding = record(soleBinding(request), "stored voicing binding");
  const result = record(binding["result"], "stored voicing result");
  return record(result["voicing"], "stored voicing");
}

function storedGeneratedBy(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): MutableRecord {
  return record(storedVoicing(request)["generatedBy"], "stored generatedBy");
}

function generatedEvidence(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): unknown[] {
  const evidence = generatedCandidate(request)["evidence"];
  if (!Array.isArray(evidence)) {
    throw new Error("P0_DEFENSIVE_CANDIDATE_EVIDENCE_MISSING");
  }
  return evidence;
}

function forgeStableRetentionEvidence(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): void {
  const stableRetention = record(
    generatedEvidence(request).at(-1),
    "candidate stable-retention evidence",
  );
  if (
    !Reflect.set(
      stableRetention,
      "sourceId",
      "changes.forged-retention",
    )
  ) {
    throw new Error("P0_DEFENSIVE_EVIDENCE_MUTATION_REFUSED");
  }
}

type RealV0FailureWitness = Readonly<{
  caseId: string;
  request: AutoVoicingRequest;
  outcome: VoicingFailure;
}>;

function realV0FailureWitness(caseId: string): RealV0FailureWitness {
  const recipe = v0CandidateCase(caseId);
  if (!("sourceSymbol" in recipe)) {
    throw new Error(`${caseId}:P0_DEFENSIVE_EXPECTED_AUTO_FAILURE_RECIPE`);
  }
  if (recipe.expected.kind !== "refusal") {
    throw new Error(`${caseId}:P0_DEFENSIVE_EXPECTED_FAILURE_WITNESS`);
  }
  const request = buildV0AutoCandidateRequest(recipe);
  if (request.kind !== "auto") {
    throw new Error(`${caseId}:P0_DEFENSIVE_EXPECTED_AUTO_REQUEST`);
  }
  const outcome = realizeVoicing(request);
  if (outcome.ok) {
    throw new Error(`${caseId}:P0_DEFENSIVE_EXPECTED_V0_REFUSAL`);
  }
  if (
    outcome.refusal.code !== recipe.expected.code ||
    outcome.evidence.termination !== recipe.expected.termination
  ) {
    throw new Error(`${caseId}:P0_DEFENSIVE_V0_FAILURE_DRIFT`);
  }
  return Object.freeze({ caseId, request, outcome });
}

function soleEventRecord(documentValue: unknown): MutableRecord {
  const document = record(documentValue, "single-event document");
  const sections = document["sections"];
  if (!Array.isArray(sections)) {
    throw new Error("P0_DEFENSIVE_SINGLE_EVENT_SECTIONS_MISSING");
  }
  const section = record(sections[0], "single-event section");
  const measures = section["measures"];
  if (!Array.isArray(measures)) {
    throw new Error("P0_DEFENSIVE_SINGLE_EVENT_MEASURES_MISSING");
  }
  const measure = record(measures[0], "single-event measure");
  const events = measure["events"];
  if (!Array.isArray(events)) {
    throw new Error("P0_DEFENSIVE_SINGLE_EVENT_EVENTS_MISSING");
  }
  return record(events[0], "single event");
}

function playbackRequestForV0Failure(
  witness: RealV0FailureWitness,
  outcome: VoicingFailure = witness.outcome,
): CompilePlaybackPlanRequest {
  const playbackRequest = structuredClone(
    materializeP0RealizationBaseline("P0-REAL-001").request,
  );
  const documentInput = structuredClone(playbackRequest.document);
  const event = soleEventRecord(documentInput);
  if (
    !Reflect.set(event, "chord", structuredClone(witness.request.resolved.source)) ||
    !Reflect.set(event, "voicing", structuredClone(witness.request.policy))
  ) {
    throw new Error(`${witness.caseId}:P0_DEFENSIVE_DOCUMENT_MUTATION_REFUSED`);
  }
  const decoded = decodeDocumentShape(documentInput);
  if (!decoded.ok) {
    throw new Error(
      `${witness.caseId}:P0_DEFENSIVE_F2:${decoded.errors[0].code}`,
    );
  }
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) {
    throw new Error(
      `${witness.caseId}:P0_DEFENSIVE_F3:${validated.errors[0].code}`,
    );
  }
  if (!Reflect.set(playbackRequest, "document", validated.value)) {
    throw new Error(`${witness.caseId}:P0_DEFENSIVE_F3_REPLACE_REFUSED`);
  }
  const binding = record(soleBinding(playbackRequest), "V0 failure binding");
  if (
    !Reflect.set(binding, "request", structuredClone(witness.request)) ||
    !Reflect.set(binding, "outcome", structuredClone(outcome))
  ) {
    throw new Error(`${witness.caseId}:P0_DEFENSIVE_V0_REPLACE_REFUSED`);
  }
  return playbackRequest;
}

function compileDefensive(value: unknown): CompilePlaybackPlanResult {
  return compilePlaybackPlan(value as CompilePlaybackPlanRequest);
}

function expectRequestSchemaInvalid(result: CompilePlaybackPlanResult): void {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("P0_DEFENSIVE_EXPECTED_REQUEST_REFUSAL");
  expect(result.refusal.code).toBe("playback.request_schema_invalid");
  expect(result.evidence.termination).toBe("request-invalid");
  expect("plan" in result).toBe(false);
}

function expectGeneratedCandidateInvalid(
  result: CompilePlaybackPlanResult,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("P0_DEFENSIVE_EXPECTED_CANDIDATE_REFUSAL");
  expect(result.refusal).toMatchObject({
    code: "playback.generated_candidate_invalid",
    eventId: "event-p0-realization",
  });
  expect(result.evidence.termination).toBe("realization-invalid");
  expect("plan" in result).toBe(false);
}

function expectCallerOwnedRecordRemainsMutable(
  value: MutableRecord,
  nextLabel: string,
): void {
  expect(Object.isFrozen(value)).toBe(false);
  expect(Reflect.set(value, "label", nextLabel)).toBe(true);
  expect(value["label"]).toBe(nextLabel);
}

function replaceGeneratedCandidate(
  request: CompilePlaybackPlanRequest,
  candidate: VoicingCandidate,
): void {
  const binding = record(soleBinding(request), "candidate target binding");
  const outcome = record(binding["outcome"], "candidate target outcome");
  expect(Reflect.set(outcome, "candidate", structuredClone(candidate))).toBe(
    true,
  );
}

function realV0Candidate(caseId: string): VoicingCandidate {
  const recipe = v0CandidateCase(caseId);
  if (!("sourceSymbol" in recipe)) {
    throw new Error(`${caseId}:P0_DEFENSIVE_EXPECTED_AUTO_RECIPE`);
  }
  if (recipe.expected.kind !== "must-contain-candidate") {
    throw new Error(`${caseId}:P0_DEFENSIVE_EXPECTED_CANDIDATE_WITNESS`);
  }
  const voicingRequest = buildV0AutoCandidateRequest(recipe);
  if (voicingRequest.kind !== "auto") {
    throw new Error(`${caseId}:P0_DEFENSIVE_EXPECTED_AUTO_REQUEST`);
  }
  const outcome = realizeVoicing(voicingRequest);
  if (!outcome.ok) {
    throw new Error(`${caseId}:P0_DEFENSIVE_V0:${outcome.refusal.code}`);
  }
  const candidate = findV0CandidateWithExpectedVoices(
    outcome.value.candidates,
    recipe.expected,
  );
  if (candidate === undefined) {
    throw new Error(`${caseId}:P0_DEFENSIVE_V0_CANDIDATE_MISSING`);
  }
  return candidate;
}

describe("P0 defensive request and realization boundaries", () => {
  test("a generated binding with a forged schema refuses as malformed input", () => {
    const baseline = materializeP0RealizationBaseline("P0-REAL-001");
    const request = structuredClone(baseline.request);
    const binding = record(soleBinding(request), "schema binding");
    expect(
      Reflect.set(
        binding,
        "schema",
        "changes.playback.realization-binding.v999",
      ),
    ).toBe(true);

    const result = compilePlaybackPlan(request);
    expectRequestSchemaInvalid(result);
    if (result.ok) throw new Error("P0_DEFENSIVE_SCHEMA_ACCEPTED");
    expect(result.evidence).toMatchObject({
      bindingsVisited: 1,
      peakSourceEventIdentityRecords: 1,
      peakBindingRecords: 1,
      peakTrackedRecords: 2,
    });
  });

  for (const failure of [
    {
      code: "voicing.realization_unavailable",
      termination: "realization-unavailable",
    },
    {
      code: "voicing.quartal_context_unexpected",
      termination: "quartal-context-unexpected",
    },
    {
      code: "voicing.quartal_context_required",
      termination: "quartal-context-required",
    },
    {
      code: "voicing.quartal_context_invalid",
      termination: "quartal-context-invalid",
    },
    {
      code: "voicing.family_unavailable",
      termination: "family-unavailable",
    },
    {
      code: "voicing.constraints_unsatisfied",
      termination: "constraints-unsatisfied",
    },
    {
      code: "limit.voicing_work_exceeded",
      termination: "work-limit-exceeded",
    },
  ] as const) {
    test(`${failure.code} cannot masquerade as V0 using only a valid code and termination`, () => {
      const request = structuredClone(
        materializeP0RealizationBaseline("P0-REAL-001").request,
      );
      const binding = record(soleBinding(request), "minimal failure binding");
      expect(
        Reflect.set(binding, "outcome", {
          ok: false,
          refusal: { code: failure.code },
          evidence: { termination: failure.termination },
        }),
      ).toBe(true);

      expectRequestSchemaInvalid(compilePlaybackPlan(request));
    });
  }

  for (const caseId of REAL_V0_FAILURE_CASE_IDS) {
    test(`${caseId} genuine V0 failure is reflected only after real F2/F3 publication`, () => {
      const witness = realV0FailureWitness(caseId);
      const request = playbackRequestForV0Failure(witness);
      const result = compilePlaybackPlan(request);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error(`${caseId}:P0_DEFENSIVE_V0_FAILURE_ACCEPTED`);
      }
      expect(result.refusal).toMatchObject({
        code: "playback.realization_unavailable",
        eventId: "event-p0-realization",
        voicingRefusalCode: witness.outcome.refusal.code,
        voicingTermination: witness.outcome.evidence.termination,
      });
      expect(result.evidence.termination).toBe("realization-invalid");
      expect("plan" in result).toBe(false);
    });
  }

  for (let index = 0; index < REAL_V0_FAILURE_CASE_IDS.length; index += 1) {
    const requestCaseId = REAL_V0_FAILURE_CASE_IDS[index];
    const outcomeCaseId =
      REAL_V0_FAILURE_CASE_IDS[
        (index + 1) % REAL_V0_FAILURE_CASE_IDS.length
      ];
    if (requestCaseId === undefined || outcomeCaseId === undefined) {
      throw new Error("P0_DEFENSIVE_V0_SWAP_CASE_MISSING");
    }
    test(`${requestCaseId} rejects the genuine but unrelated ${outcomeCaseId} failure`, () => {
      const requestWitness = realV0FailureWitness(requestCaseId);
      const outcomeWitness = realV0FailureWitness(outcomeCaseId);
      const request = playbackRequestForV0Failure(
        requestWitness,
        outcomeWitness.outcome,
      );

      expectRequestSchemaInvalid(compilePlaybackPlan(request));
    });
  }

  for (const malformed of [
    {
      label: "a deleted request key",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(
          Reflect.deleteProperty(generatedRequest(request), "quartalContext"),
        ).toBe(true);
      },
    },
    {
      label: "an extra request key",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(
          Reflect.set(generatedRequest(request), "invented", true),
        ).toBe(true);
      },
    },
    {
      label: "a deleted resolved key",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(
          Reflect.deleteProperty(generatedResolved(request), "warnings"),
        ).toBe(true);
      },
    },
    {
      label: "an extra resolved key",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(
          Reflect.set(generatedResolved(request), "invented", true),
        ).toBe(true);
      },
    },
    {
      label: "a bogus resolved authority identity",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(
          Reflect.set(
            generatedResolved(request),
            "formulaTableId",
            "changes.forged-formulas",
          ),
        ).toBe(true);
      },
    },
    {
      label: "quartal context on a nonquartal request",
      mutate(request: CompilePlaybackPlanRequest): void {
        const recipe = v0CandidateCase("V0-CAND-009");
        if (!("sourceSymbol" in recipe)) {
          throw new Error("P0_DEFENSIVE_QUARTAL_RECIPE_KIND");
        }
        const quartalRequest = buildV0AutoCandidateRequest(recipe);
        if (quartalRequest.kind !== "auto") {
          throw new Error("P0_DEFENSIVE_QUARTAL_REQUEST_KIND");
        }
        if (quartalRequest.quartalContext === null) {
          throw new Error("P0_DEFENSIVE_QUARTAL_CONTEXT_MISSING");
        }
        expect(
          Reflect.set(
            generatedRequest(request),
            "quartalContext",
            structuredClone(quartalRequest.quartalContext),
          ),
        ).toBe(true);
      },
    },
    {
      label: "an invented semantic realization",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(
          Reflect.set(
            generatedRequest(request),
            "realizationId",
            "invented-realization",
          ),
        ).toBe(true);
      },
    },
  ] as const) {
    test(`${malformed.label} is refused by the generated-request envelope`, () => {
      const request = structuredClone(
        materializeP0RealizationBaseline("P0-REAL-001").request,
      );
      malformed.mutate(request);
      expectRequestSchemaInvalid(compilePlaybackPlan(request));
    });
  }

  for (const malformedCounter of [
    {
      label: "missing",
      mutate(evidence: MutableRecord): void {
        expect(
          Reflect.deleteProperty(evidence, "realizationDegreeRecordsVisited"),
        ).toBe(true);
      },
    },
    {
      label: "negative",
      mutate(evidence: MutableRecord): void {
        expect(
          Reflect.set(evidence, "realizationDegreeRecordsVisited", -1),
        ).toBe(true);
      },
    },
    {
      label: "unsafe-integer overflow",
      mutate(evidence: MutableRecord): void {
        expect(
          Reflect.set(
            evidence,
            "realizationDegreeRecordsVisited",
            Number.MAX_SAFE_INTEGER + 1,
          ),
        ).toBe(true);
      },
    },
  ] as const) {
    test(`a ${malformedCounter.label} V0 evidence counter is refused`, () => {
      const request = structuredClone(
        materializeP0RealizationCase("P0-REAL-013").request,
      );
      const outcome = generatedOutcome(request);
      const evidence = record(outcome["evidence"], "counter evidence");
      malformedCounter.mutate(evidence);

      expectRequestSchemaInvalid(compilePlaybackPlan(request));
    });
  }

  test("an accessor cannot change V0 termination after validation or alias caller state", () => {
    const request = structuredClone(
      materializeP0RealizationCase("P0-REAL-013").request,
    );
    const outcome = generatedOutcome(request);
    const evidence = record(outcome["evidence"], "accessor evidence");
    const callerOwned: MutableRecord = { label: "caller-owned" };
    callerOwned["self"] = callerOwned;
    let reads = 0;
    Object.defineProperty(evidence, "termination", {
      configurable: true,
      enumerable: true,
      get(): unknown {
        reads += 1;
        return reads === 1 ? "constraints-unsatisfied" : callerOwned;
      },
    });

    let result: CompilePlaybackPlanResult | undefined;
    expect(() => {
      result = compileDefensive(request);
    }).not.toThrow();
    if (result === undefined) {
      throw new Error("P0_DEFENSIVE_ACCESSOR_RESULT_MISSING");
    }
    expectRequestSchemaInvalid(result);
    if (result.ok) throw new Error("P0_DEFENSIVE_ACCESSOR_ACCEPTED");
    expect(Object.values(record(result.refusal, "accessor refusal"))).not.toContain(
      callerOwned,
    );
    expect(reads).toBeLessThanOrEqual(1);
    expectCallerOwnedRecordRemainsMutable(callerOwned, "still-caller-owned");
  });

  test("null is refused at the runtime request boundary without throwing", () => {
    let result: CompilePlaybackPlanResult | undefined;
    expect(() => {
      result = compileDefensive(null);
    }).not.toThrow();
    if (result === undefined) {
      throw new Error("P0_DEFENSIVE_NULL_RESULT_MISSING");
    }
    expectRequestSchemaInvalid(result);
    if (result.ok) throw new Error("P0_DEFENSIVE_NULL_ACCEPTED");
    expect(result.refusal.path).toEqual([]);
  });

  test("a null nested generated request refuses at its binding path without throwing", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const binding = record(soleBinding(request), "null request binding");
    expect(Reflect.set(binding, "request", null)).toBe(true);

    let result: CompilePlaybackPlanResult | undefined;
    expect(() => {
      result = compileDefensive(request);
    }).not.toThrow();
    if (result === undefined) {
      throw new Error("P0_DEFENSIVE_NESTED_NULL_RESULT_MISSING");
    }
    expectRequestSchemaInvalid(result);
    if (result.ok) throw new Error("P0_DEFENSIVE_NESTED_NULL_ACCEPTED");
    expect(result.refusal.path).toEqual([
      "realizedVoicings",
      "event-p0-realization",
      "request",
    ]);
  });

  for (const forged of [
    {
      label: "refusal code",
      mutate(outcome: MutableRecord): void {
        const refusal = record(outcome["refusal"], "unavailable refusal");
        refusal["code"] = "voicing.forged_unavailable";
      },
    },
    {
      label: "termination",
      mutate(outcome: MutableRecord): void {
        const evidence = record(outcome["evidence"], "unavailable evidence");
        evidence["termination"] = "complete-generated";
      },
    },
  ] as const) {
    test(`a forged unavailable ${forged.label} is not reflected into a playback refusal`, () => {
      const materialized = materializeP0RealizationCase("P0-REAL-013");
      const request = structuredClone(materialized.request);
      const binding = record(soleBinding(request), "unavailable binding");
      const outcome = record(binding["outcome"], "unavailable outcome");
      forged.mutate(outcome);

      expectRequestSchemaInvalid(compilePlaybackPlan(request));
    });
  }

  test("a complete real V0 candidate with another realization gets the dedicated mismatch", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const alternate = realV0Candidate("V0-CAND-012");
    expect(alternate.realizationId).not.toBe(
      generatedCandidate(request)["realizationId"],
    );
    replaceGeneratedCandidate(request, alternate);

    const result = compilePlaybackPlan(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_DEFENSIVE_REALIZATION_ACCEPTED");
    expect(result.refusal).toMatchObject({
      code: "playback.generated_candidate_realization_mismatch",
      eventId: "event-p0-realization",
      expected: "literal",
      received: "alt-b9-b5",
    });
  });

  test("a complete real V0 candidate from another family gets the dedicated mismatch", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const alternate = realV0Candidate("V0-CAND-003");
    expect(alternate.family).toBe("open");
    replaceGeneratedCandidate(request, alternate);

    const result = compilePlaybackPlan(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_DEFENSIVE_FAMILY_ACCEPTED");
    expect(result.refusal).toMatchObject({
      code: "playback.generated_candidate_policy_mismatch",
      eventId: "event-p0-realization",
      expectedFamily: "balanced",
      receivedFamily: "open",
    });
  });

  test("a locally forged family is candidate-invalid rather than a policy mismatch", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    expect(Reflect.set(generatedCandidate(request), "family", "open")).toBe(
      true,
    );

    expectGeneratedCandidateInvalid(compilePlaybackPlan(request));
  });

  test("forged evidence wins over a real alternate realization mismatch", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const alternate = realV0Candidate("V0-CAND-012");
    expect(alternate.realizationId).not.toBe(
      generatedCandidate(request)["realizationId"],
    );
    replaceGeneratedCandidate(request, alternate);
    forgeStableRetentionEvidence(request);

    expectGeneratedCandidateInvalid(compilePlaybackPlan(request));
  });

  test("a custom candidate pitch iterator cannot collapse emitted pitches", () => {
    const baselineRequest =
      materializeP0RealizationBaseline("P0-REAL-001").request;
    const request = structuredClone(baselineRequest);
    const candidate = generatedCandidate(request);
    const pitches = candidate["pitches"];
    if (!Array.isArray(pitches) || pitches.length < 2) {
      throw new Error("P0_DEFENSIVE_PITCH_ITERATOR_WITNESS_MISSING");
    }
    const first: unknown = pitches[0];
    let iteratorCalls = 0;
    Object.defineProperty(pitches, Symbol.iterator, {
      configurable: true,
      enumerable: false,
      writable: true,
      value(): IterableIterator<unknown> {
        iteratorCalls += 1;
        return [first][Symbol.iterator]();
      },
    });

    const baseline = compilePlaybackPlan(baselineRequest);
    const result = compilePlaybackPlan(request);
    expect(baseline.ok).toBe(true);
    expect(result.ok).toBe(true);
    if (!baseline.ok || !result.ok) {
      throw new Error("P0_DEFENSIVE_PITCH_ITERATOR_REFUSED");
    }
    const baselineEvent = baseline.plan.events[0];
    const resultEvent = result.plan.events[0];
    if (baselineEvent === undefined || resultEvent === undefined) {
      throw new Error("P0_DEFENSIVE_PITCH_ITERATOR_EVENT_MISSING");
    }
    expect(resultEvent.pitches).toEqual(baselineEvent.pitches);
    expect(resultEvent.midiPitches).toEqual(baselineEvent.midiPitches);
    expect(resultEvent.pitches).toHaveLength(4);
    expect(iteratorCalls).toBe(0);
  });

  test("a candidate pitch accessor cannot change value between validation and emission", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const candidate = generatedCandidate(request);
    const pitches = candidate["pitches"];
    if (!Array.isArray(pitches) || pitches[0] === undefined) {
      throw new Error("P0_DEFENSIVE_PITCH_ACCESSOR_WITNESS_MISSING");
    }
    const pitchSnapshot: unknown = pitches[0];
    const originalPitch: unknown = structuredClone(pitchSnapshot);
    const laterPitch = { step: "D", alter: 0, octave: 3 };
    let reads = 0;
    Object.defineProperty(pitches, "0", {
      configurable: true,
      enumerable: true,
      get(): unknown {
        reads += 1;
        return reads <= 8 ? originalPitch : laterPitch;
      },
    });

    expectGeneratedCandidateInvalid(compilePlaybackPlan(request));
    expect(reads).toBeLessThanOrEqual(1);
  });

  for (const forgery of [
    {
      label: "quality class",
      mutate(explanation: MutableRecord): void {
        expect(
          Reflect.set(explanation, "qualityClass", "dominant-seventh"),
        ).toBe(true);
      },
    },
    {
      label: "empty drop-2 evidence",
      mutate(explanation: MutableRecord): void {
        expect(Reflect.set(explanation, "drop2", {})).toBe(true);
      },
    },
    {
      label: "invented quartal adjacency",
      mutate(explanation: MutableRecord): void {
        expect(
          Reflect.set(explanation, "quartalAdjacencies", [{ forged: true }]),
        ).toBe(true);
      },
    },
    {
      label: "excessive doubled degrees",
      mutate(explanation: MutableRecord): void {
        const orderedDegrees = explanation["orderedDegrees"];
        if (!Array.isArray(orderedDegrees) || orderedDegrees[0] === undefined) {
          throw new Error("P0_DEFENSIVE_ORDERED_DEGREE_MISSING");
        }
        const degree: unknown = orderedDegrees[0];
        expect(
          Reflect.set(explanation, "doubledDegrees", [
            structuredClone(degree),
            structuredClone(degree),
            structuredClone(degree),
          ]),
        ).toBe(true);
      },
    },
  ] as const) {
    test(`forged candidate ${forgery.label} is candidate-invalid`, () => {
      const request = structuredClone(
        materializeP0RealizationBaseline("P0-REAL-001").request,
      );
      forgery.mutate(generatedExplanation(request));

      expectGeneratedCandidateInvalid(compilePlaybackPlan(request));
    });
  }

  for (const inconsistent of [
    {
      label: "omitted degree that is actually voiced",
      key: "omittedDegrees",
      orderedDegreeIndex: 0,
    },
    {
      label: "doubled degree that occurs only once",
      key: "doubledDegrees",
      orderedDegreeIndex: 1,
    },
  ] as const) {
    test(`shape-valid ${inconsistent.label} is candidate-invalid`, () => {
      const request = structuredClone(
        materializeP0RealizationBaseline("P0-REAL-001").request,
      );
      const explanation = generatedExplanation(request);
      const orderedDegrees = explanation["orderedDegrees"];
      if (!Array.isArray(orderedDegrees)) {
        throw new Error("P0_DEFENSIVE_EXPLANATION_DEGREES_MISSING");
      }
      const degree: unknown =
        orderedDegrees[inconsistent.orderedDegreeIndex];
      if (degree === undefined) {
        throw new Error("P0_DEFENSIVE_EXPLANATION_DEGREE_MISSING");
      }
      expect(
        Reflect.set(explanation, inconsistent.key, [structuredClone(degree)]),
      ).toBe(true);

      expectGeneratedCandidateInvalid(compilePlaybackPlan(request));
    });
  }

  for (const drop2Forgery of [
    {
      label: "closed source",
      key: "closedSourceMidi",
      mutate(values: unknown[]): void {
        values[0] = 56;
      },
    },
    {
      label: "transformed output",
      key: "transformedMidi",
      mutate(values: unknown[]): void {
        values[0] = 49;
      },
    },
  ] as const) {
    test(`a real drop-2 candidate with a wrong ${drop2Forgery.label} transform is candidate-invalid`, () => {
      const controlRequest = structuredClone(
        materializeP0RealizationBaseline("P0-REAL-001").request,
      );
      const alternate = realV0Candidate("V0-CAND-004");
      expect(alternate.family).toBe("drop2");
      replaceGeneratedCandidate(controlRequest, alternate);
      const control = compilePlaybackPlan(controlRequest);
      expect(control.ok).toBe(false);
      if (control.ok) throw new Error("P0_DEFENSIVE_DROP2_CONTROL_ACCEPTED");
      expect(control.refusal.code).toBe(
        "playback.generated_candidate_policy_mismatch",
      );

      const request = structuredClone(controlRequest);
      const explanation = generatedExplanation(request);
      const drop2 = record(explanation["drop2"], "drop-2 transform");
      const values = drop2[drop2Forgery.key];
      if (!Array.isArray(values)) {
        throw new Error("P0_DEFENSIVE_DROP2_VALUES_MISSING");
      }
      drop2Forgery.mutate(values);

      expectGeneratedCandidateInvalid(compilePlaybackPlan(request));
    });
  }

  for (const quartalForgery of [
    {
      label: "degree pairing",
      mutate(adjacency: MutableRecord): void {
        expect(
          Reflect.set(adjacency, "lowerDegree", {
            number: 1,
            alter: 0,
          }),
        ).toBe(true);
      },
    },
    {
      label: "pitch pairing",
      mutate(adjacency: MutableRecord): void {
        expect(
          Reflect.set(adjacency, "lowerPitch", {
            step: "C",
            alter: 0,
            octave: 4,
          }),
        ).toBe(true);
      },
    },
    {
      label: "semitone pairing",
      mutate(adjacency: MutableRecord): void {
        expect(Reflect.set(adjacency, "semitones", 6)).toBe(true);
        expect(Reflect.set(adjacency, "kind", "augmented-fourth")).toBe(true);
      },
    },
  ] as const) {
    test(`a real quartal candidate with a wrong ${quartalForgery.label} is candidate-invalid`, () => {
      const controlRequest = structuredClone(
        materializeP0RealizationBaseline("P0-REAL-001").request,
      );
      const alternate = realV0Candidate("V0-CAND-009");
      expect(alternate.family).toBe("quartal");
      replaceGeneratedCandidate(controlRequest, alternate);
      const control = compilePlaybackPlan(controlRequest);
      expect(control.ok).toBe(false);
      if (control.ok) throw new Error("P0_DEFENSIVE_QUARTAL_CONTROL_ACCEPTED");
      expect(control.refusal.code).toBe(
        "playback.generated_candidate_policy_mismatch",
      );

      const request = structuredClone(controlRequest);
      const explanation = generatedExplanation(request);
      const adjacencies = explanation["quartalAdjacencies"];
      if (!Array.isArray(adjacencies)) {
        throw new Error("P0_DEFENSIVE_QUARTAL_ADJACENCIES_MISSING");
      }
      const adjacency = record(adjacencies[0], "quartal adjacency");
      quartalForgery.mutate(adjacency);

      expectGeneratedCandidateInvalid(compilePlaybackPlan(request));
    });
  }

  test("forged evidence wins over combined voice and pitch truncation", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const candidate = generatedCandidate(request);
    const voices = candidate["voices"];
    const pitches = candidate["pitches"];
    if (!Array.isArray(voices) || !Array.isArray(pitches)) {
      throw new Error("P0_DEFENSIVE_TRUNCATION_ARRAY_MISSING");
    }
    voices.splice(3);
    pitches.splice(3);
    forgeStableRetentionEvidence(request);

    expectGeneratedCandidateInvalid(compilePlaybackPlan(request));
  });

  test("forged evidence wins over an otherwise dedicated pitch mismatch", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const candidate = generatedCandidate(request);
    const pitches = candidate["pitches"];
    if (!Array.isArray(pitches) || pitches[2] === undefined) {
      throw new Error("P0_DEFENSIVE_PITCH_MISMATCH_WITNESS_MISSING");
    }
    pitches[2] = { step: "C", alter: -1, octave: 4 };
    forgeStableRetentionEvidence(request);

    expectGeneratedCandidateInvalid(compilePlaybackPlan(request));
  });

  test("cyclic identity values are sanitized without freezing caller state", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const cyclicIdentity: MutableRecord = { label: "caller-owned" };
    cyclicIdentity["self"] = cyclicIdentity;
    expect(Reflect.set(request, "compilerId", cyclicIdentity)).toBe(true);

    let result: CompilePlaybackPlanResult | undefined;
    expect(() => {
      result = compileDefensive(request);
    }).not.toThrow();
    if (result === undefined) {
      throw new Error("P0_DEFENSIVE_IDENTITY_RESULT_MISSING");
    }
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_DEFENSIVE_IDENTITY_ACCEPTED");
    expect(result.refusal).toMatchObject({
      code: "playback.compiler_identity_invalid",
      path: ["compilerId"],
      receivedId: "object",
    });
    expect(record(result.refusal, "identity refusal")["receivedId"]).not.toBe(
      cyclicIdentity,
    );
    expect(Object.isFrozen(cyclicIdentity)).toBe(false);
    expect(Reflect.set(cyclicIdentity, "label", "still caller-owned")).toBe(
      true,
    );
  });

  test("a cyclic document id is refused without freezing caller state", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const cyclicId: MutableRecord = { label: "caller-document-id" };
    cyclicId["self"] = cyclicId;
    const document = record(request.document, "cyclic document");
    expect(Reflect.set(document, "id", cyclicId)).toBe(true);

    let result: CompilePlaybackPlanResult | undefined;
    expect(() => {
      result = compileDefensive(request);
    }).not.toThrow();
    if (result === undefined) {
      throw new Error("P0_DEFENSIVE_DOCUMENT_ID_RESULT_MISSING");
    }
    expectRequestSchemaInvalid(result);
    expectCallerOwnedRecordRemainsMutable(cyclicId, "still-document-id");
  });

  test("an accessor document id is refused before a second read", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const document = record(request.document, "accessor document");
    const callerOwned: MutableRecord = { label: "accessor-document-id" };
    callerOwned["self"] = callerOwned;
    let reads = 0;
    Object.defineProperty(document, "id", {
      configurable: true,
      enumerable: true,
      get(): unknown {
        reads += 1;
        return reads === 1 ? "doc-p0-realization" : callerOwned;
      },
    });

    let result: CompilePlaybackPlanResult | undefined;
    expect(() => {
      result = compileDefensive(request);
    }).not.toThrow();
    if (result === undefined) {
      throw new Error("P0_DEFENSIVE_DOCUMENT_ACCESSOR_RESULT_MISSING");
    }
    expectRequestSchemaInvalid(result);
    expect(reads).toBeLessThanOrEqual(1);
    expectCallerOwnedRecordRemainsMutable(callerOwned, "still-accessor-id");
  });

  for (const emitted of [
    {
      label: "section id",
      target(request: CompilePlaybackPlanRequest): MutableRecord {
        const document = record(request.document, "section document");
        const sections = document["sections"];
        if (!Array.isArray(sections)) {
          throw new Error("P0_DEFENSIVE_SECTIONS_MISSING");
        }
        return record(sections[0], "section");
      },
      key: "id",
    },
    {
      label: "measure id",
      target(request: CompilePlaybackPlanRequest): MutableRecord {
        const document = record(request.document, "measure document");
        const sections = document["sections"];
        if (!Array.isArray(sections)) {
          throw new Error("P0_DEFENSIVE_SECTIONS_MISSING");
        }
        const section = record(sections[0], "measure section");
        const measures = section["measures"];
        if (!Array.isArray(measures)) {
          throw new Error("P0_DEFENSIVE_MEASURES_MISSING");
        }
        return record(measures[0], "measure");
      },
      key: "id",
    },
    {
      label: "event id",
      target(request: CompilePlaybackPlanRequest): MutableRecord {
        const document = record(request.document, "event document");
        const sections = document["sections"];
        if (!Array.isArray(sections)) {
          throw new Error("P0_DEFENSIVE_SECTIONS_MISSING");
        }
        const section = record(sections[0], "event section");
        const measures = section["measures"];
        if (!Array.isArray(measures)) {
          throw new Error("P0_DEFENSIVE_MEASURES_MISSING");
        }
        const measure = record(measures[0], "event measure");
        const events = measure["events"];
        if (!Array.isArray(events)) {
          throw new Error("P0_DEFENSIVE_EVENTS_MISSING");
        }
        return record(events[0], "event");
      },
      key: "id",
    },
    {
      label: "tempo",
      target(request: CompilePlaybackPlanRequest): MutableRecord {
        return record(request.document, "tempo document");
      },
      key: "tempoBpm",
    },
  ] as const) {
    test(`an object-valued ${emitted.label} is refused without freezing caller state`, () => {
      const request = structuredClone(
        materializeP0RealizationBaseline("P0-REAL-001").request,
      );
      const callerOwned: MutableRecord = {
        label: `caller-${emitted.label}`,
      };
      callerOwned["self"] = callerOwned;
      expect(Reflect.set(emitted.target(request), emitted.key, callerOwned)).toBe(
        true,
      );

      let result: CompilePlaybackPlanResult | undefined;
      expect(() => {
        result = compileDefensive(request);
      }).not.toThrow();
      if (result === undefined) {
        throw new Error("P0_DEFENSIVE_EMITTED_VALUE_RESULT_MISSING");
      }
      expectRequestSchemaInvalid(result);
      expectCallerOwnedRecordRemainsMutable(
        callerOwned,
        `still-caller-${emitted.label}`,
      );
    });
  }

  for (const storedExtra of [
    {
      label: "stored binding",
      target(request: CompilePlaybackPlanRequest): MutableRecord {
        return record(soleBinding(request), "stored binding extra-key target");
      },
    },
    {
      label: "stored bypass result",
      target(request: CompilePlaybackPlanRequest): MutableRecord {
        const binding = record(
          soleBinding(request),
          "stored result extra-key binding",
        );
        return record(binding["result"], "stored bypass result");
      },
    },
  ] as const) {
    test(`an enumerable extra key on the ${storedExtra.label} is refused`, () => {
      const request = structuredClone(
        materializeP0RealizationBaseline("P0-REAL-002").request,
      );
      expect(
        Reflect.set(storedExtra.target(request), "forgedExtra", true),
      ).toBe(true);

      expectRequestSchemaInvalid(compilePlaybackPlan(request));
    });
  }

  for (const malformedStored of [
    {
      label: "manual voicing with an extra own key",
      caseId: "P0-REAL-002",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(Reflect.set(storedVoicing(request), "forgedExtra", true)).toBe(
          true,
        );
      },
    },
    {
      label: "manual voicing missing its bass policy",
      caseId: "P0-REAL-002",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(
          Reflect.deleteProperty(storedVoicing(request), "bassPolicy"),
        ).toBe(true);
      },
    },
    {
      label: "frozen voicing missing its bass policy",
      caseId: "P0-REAL-003",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(
          Reflect.deleteProperty(storedVoicing(request), "bassPolicy"),
        ).toBe(true);
      },
    },
    {
      label: "frozen generatedBy with an extra own key",
      caseId: "P0-REAL-003",
      mutate(request: CompilePlaybackPlanRequest): void {
        expect(
          Reflect.set(storedGeneratedBy(request), "forgedExtra", true),
        ).toBe(true);
      },
    },
    {
      label: "manual pitch record with an extra own key",
      caseId: "P0-REAL-002",
      mutate(request: CompilePlaybackPlanRequest): void {
        const pitches = storedVoicing(request)["pitches"];
        if (!Array.isArray(pitches)) {
          throw new Error("P0_DEFENSIVE_STORED_PITCHES_MISSING");
        }
        const pitch = record(pitches[0], "stored pitch record");
        expect(Reflect.set(pitch, "cents", 0)).toBe(true);
      },
    },
  ] as const) {
    test(`${malformedStored.label} is request-schema-invalid`, () => {
      const request = structuredClone(
        materializeP0RealizationBaseline(malformedStored.caseId).request,
      );
      malformedStored.mutate(request);

      expectRequestSchemaInvalid(compilePlaybackPlan(request));
    });
  }

  test("an exact but different stored voicing remains a stale semantic refusal", () => {
    const request = structuredClone(
      materializeP0RealizationCase("P0-REAL-018").request,
    );
    const result = compilePlaybackPlan(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_DEFENSIVE_STORED_STALE_ACCEPTED");
    expect(result.refusal).toMatchObject({
      code: "playback.realization_source_voicing_stale",
      eventId: "event-p0-realization",
    });
    expect(result.evidence.termination).toBe("realization-invalid");
  });

  test("the smallest complete plan counts all simultaneous retained populations", () => {
    const result = compilePlaybackPlan(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("P0_DEFENSIVE_MEMORY_WITNESS_REFUSED");
    }
    expect(result.evidence).toMatchObject({
      peakSourceEventIdentityRecords: 1,
      peakBindingRecords: 1,
      peakOutputEventRecords: 1,
      peakOutputPitchRecords: 4,
      peakTrackedRecords: 7,
    });
    expect(result.evidence.peakTrackedRecords).toBe(
      result.evidence.peakSourceEventIdentityRecords +
        result.evidence.peakBindingRecords +
        result.evidence.peakOutputEventRecords +
        result.evidence.peakOutputPitchRecords,
    );
  });

  test("an extra binding outranks an earlier source-key identity mismatch", () => {
    const request = structuredClone(
      materializeP0RealizationBaseline("P0-REAL-001").request,
    );
    const sourceBinding = soleBinding(request);
    const extraBinding = structuredClone(sourceBinding);
    const extraEventId =
      "zz-extra" as PlaybackRealizationBinding["eventId"];
    expect(
      Reflect.set(
        record(sourceBinding, "precedence source binding"),
        "eventId",
        "event-mismatched",
      ),
    ).toBe(true);
    expect(
      Reflect.set(
        record(extraBinding, "precedence extra binding"),
        "eventId",
        extraEventId,
      ),
    ).toBe(true);
    const bindings = new Map<
      PlaybackRealizationBinding["eventId"],
      PlaybackRealizationBinding
    >(request.realizedVoicings);
    bindings.set(extraEventId, extraBinding);
    expect(Reflect.set(request, "realizedVoicings", bindings)).toBe(true);

    const result = compileDefensive(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_DEFENSIVE_EXTRA_PRECEDENCE_ACCEPTED");
    expect(result.refusal).toEqual({
      code: "playback.realization_binding_extra",
      path: ["realizedVoicings", extraEventId],
      eventId: extraEventId,
    });
    expect(result.evidence.termination).toBe("realization-invalid");
  });

  test("an inherited ReadonlyMap size accessor is derived from bounded entries", () => {
    const baseline = materializeP0RealizationBaseline("P0-REAL-001");
    let sizeReads = 0;
    const accessorBacked = new AccessorBackedReadonlyMap(
      baseline.request.realizedVoicings,
      () => {
        sizeReads += 1;
      },
    );
    const request: CompilePlaybackPlanRequest = {
      ...baseline.request,
      realizedVoicings: accessorBacked,
    };

    const expected = compilePlaybackPlan(baseline.request);
    const actual = compilePlaybackPlan(request);
    expect(actual).toEqual(expected);
    expect(sizeReads).toBe(0);
  });

  for (const accessorSlot of [
    { label: "entry key", index: 0 },
    { label: "binding value", index: 1 },
  ] as const) {
    test(`a map ${accessorSlot.label} accessor is refused without a TOCTOU read`, () => {
      const baseline = materializeP0RealizationBaseline("P0-REAL-001");
      const binding = soleBinding(baseline.request);
      const pair: unknown[] = ["event-p0-realization", binding];
      const laterBinding = structuredClone(binding);
      expect(
        Reflect.set(
          record(laterBinding, "map accessor later binding"),
          "eventId",
          "event-p0-later",
        ),
      ).toBe(true);
      let reads = 0;
      Object.defineProperty(pair, String(accessorSlot.index), {
        configurable: true,
        enumerable: true,
        get(): unknown {
          reads += 1;
          if (accessorSlot.index === 0) {
            return reads === 1
              ? "event-p0-fake"
              : "event-p0-realization";
          }
          return reads === 1 ? binding : laterBinding;
        },
      });
      let yielded = false;
      const mapLike = {
        size: 1,
        get(key: string): PlaybackRealizationBinding | undefined {
          return key === "event-p0-realization" ? binding : undefined;
        },
        entries(): IterableIterator<unknown> {
          return {
            next(): IteratorResult<unknown> {
              if (yielded) return { done: true, value: undefined };
              yielded = true;
              return { done: false, value: pair };
            },
            [Symbol.iterator](): IterableIterator<unknown> {
              return this;
            },
          };
        },
      };
      const request = {
        ...baseline.request,
        realizedVoicings: mapLike,
      };

      const result = compileDefensive(request);
      expectRequestSchemaInvalid(result);
      if (result.ok) throw new Error("P0_DEFENSIVE_MAP_ACCESSOR_ACCEPTED");
      expect(result.refusal.path).toEqual([
        "realizedVoicings",
        "entries",
        0,
      ]);
      expect(reads).toBe(0);
    });
  }

  for (const accessorSurface of [
    "size",
    "entries",
    "next",
    "done",
  ] as const) {
    test(`a map ${accessorSurface} accessor is rejected after at most one snapshot read`, () => {
      const baseline = materializeP0RealizationBaseline("P0-REAL-001");
      const binding = soleBinding(baseline.request);
      const pair: readonly [string, PlaybackRealizationBinding] = Object.freeze([
        "event-p0-realization",
        binding,
      ]);
      let yielded = false;
      let reads = 0;
      const firstResult: IteratorResult<unknown> = {
        done: false,
        value: pair,
      };
      const nextImpl = (): IteratorResult<unknown> => {
        if (yielded) return { done: true, value: undefined };
        yielded = true;
        return firstResult;
      };
      const iterator = {
        next: nextImpl,
        [Symbol.iterator](): IterableIterator<unknown> {
          return this;
        },
      };
      const entriesImpl = (): IterableIterator<unknown> => iterator;
      const mapLike = {
        size: 1,
        get(key: string): PlaybackRealizationBinding | undefined {
          return key === "event-p0-realization" ? binding : undefined;
        },
        entries: entriesImpl,
      };

      switch (accessorSurface) {
        case "size":
          Object.defineProperty(mapLike, "size", {
            configurable: true,
            enumerable: true,
            get(): number {
              reads += 1;
              return 1;
            },
          });
          break;
        case "entries":
          Object.defineProperty(mapLike, "entries", {
            configurable: true,
            enumerable: true,
            get(): typeof entriesImpl {
              reads += 1;
              return entriesImpl;
            },
          });
          break;
        case "next":
          Object.defineProperty(iterator, "next", {
            configurable: true,
            enumerable: true,
            get(): typeof nextImpl {
              reads += 1;
              return nextImpl;
            },
          });
          break;
        case "done":
          Object.defineProperty(firstResult, "done", {
            configurable: true,
            enumerable: true,
            get(): false {
              reads += 1;
              return false;
            },
          });
          break;
      }
      const request = {
        ...baseline.request,
        realizedVoicings: mapLike,
      };

      const result = compileDefensive(request);
      expect(reads).toBeLessThanOrEqual(1);
      expectRequestSchemaInvalid(result);
    });
  }

  test("a lying map iterator stops at the first binding beyond the public limit", () => {
    const baseline = materializeP0RealizationBaseline("P0-REAL-001");
    const binding = soleBinding(baseline.request);
    let entriesCalls = 0;
    let entryReads = 0;
    const mapLike = {
      size: 0,
      get(): undefined {
        throw new Error("P0_DEFENSIVE_MAP_LOOKUP_BEFORE_LIMIT");
      },
      entries(): IterableIterator<readonly [string, PlaybackRealizationBinding]> {
        entriesCalls += 1;
        return {
          next(): IteratorResult<
            readonly [string, PlaybackRealizationBinding]
          > {
            if (entryReads >= 8_193) {
              throw new Error("P0_DEFENSIVE_MAP_READ_PAST_8193");
            }
            const ordinal = entryReads;
            entryReads += 1;
            return {
              done: false,
              value: [`event-p0-sentinel-${String(ordinal)}`, binding],
            };
          },
          [Symbol.iterator](): IterableIterator<
            readonly [string, PlaybackRealizationBinding]
          > {
            return this;
          },
        };
      },
    };
    const request = {
      ...baseline.request,
      realizedVoicings: mapLike,
    };

    let result: CompilePlaybackPlanResult | undefined;
    expect(() => {
      result = compileDefensive(request);
    }).not.toThrow();
    if (result === undefined) {
      throw new Error("P0_DEFENSIVE_MAP_RESULT_MISSING");
    }
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_DEFENSIVE_MAP_LIMIT_ACCEPTED");
    expect(result.refusal).toEqual({
      code: "playback.realization_binding_limit",
      path: ["realizedVoicings"],
      received: 8_193,
      maximum: 8_192,
    });
    expect(result.evidence.termination).toBe("realization-invalid");
    expect(entriesCalls).toBe(1);
    expect(entryReads).toBe(8_193);
  });
});

describe("P0 defensive loop accounting and layer ownership", () => {
  test("inherited boundaries cannot disguise unrelated own loop keys", () => {
    const request = structuredClone(
      materializeP0LoopCase("P0-LOOP-001").request,
    );
    const validLoop = materializeP0LoopCase("P0-LOOP-003").request.loop;
    if (validLoop === null) {
      throw new Error("P0_DEFENSIVE_INHERITED_LOOP_WITNESS_MISSING");
    }
    const inheritedLoop = Object.create({
      start: structuredClone(validLoop.start),
      end: structuredClone(validLoop.end),
    }) as MutableRecord;
    inheritedLoop["unrelatedStart"] = true;
    inheritedLoop["unrelatedEnd"] = true;
    expect(Object.keys(inheritedLoop)).toEqual([
      "unrelatedStart",
      "unrelatedEnd",
    ]);
    expect(Reflect.set(request, "loop", inheritedLoop)).toBe(true);

    const result = compileDefensive(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("P0_DEFENSIVE_INHERITED_LOOP_ACCEPTED");
    expect(result.refusal).toMatchObject({
      code: "playback.loop_invalid",
      path: ["loop"],
      reason: "not-normalized",
    });
    expect(result.evidence.termination).toBe("loop-invalid");
  });

  test("a negative loop still accounts for both requested boundary projections", () => {
    const baselineRequest = materializeP0LoopCase("P0-LOOP-001").request;
    const request = structuredClone(
      materializeP0LoopCase("P0-LOOP-002").request,
    );
    const loop = record(request.loop, "negative loop");
    const start = record(loop["start"], "negative loop start");
    expect(Reflect.set(start, "numerator", -1)).toBe(true);

    const baseline = compilePlaybackPlan(baselineRequest);
    const invalidLoop = compileDefensive(request);
    expect(baseline.ok).toBe(true);
    expect(invalidLoop.ok).toBe(false);
    if (!baseline.ok || invalidLoop.ok) {
      throw new Error("P0_DEFENSIVE_NEGATIVE_LOOP_WITNESS_INVALID");
    }
    expect(invalidLoop.refusal).toMatchObject({
      code: "playback.loop_invalid",
      reason: "not-normalized",
    });
    expect(invalidLoop.evidence.tickProjections).toBe(
      baseline.evidence.tickProjections + 2,
    );
  });

  test("an invalid normalized loop still records both boundary projections", () => {
    const baseline = materializeP0RealizationBaseline("P0-REAL-001");
    const requestedLoop = materializeP0LoopCase("P0-LOOP-010").request.loop;
    const withoutLoop = compilePlaybackPlan(
      baseline.request,
    );
    const invalidLoop = compilePlaybackPlan(
      { ...baseline.request, loop: requestedLoop },
    );
    expect(withoutLoop.ok).toBe(true);
    expect(invalidLoop.ok).toBe(false);
    if (!withoutLoop.ok || invalidLoop.ok) {
      throw new Error("P0_DEFENSIVE_LOOP_WITNESS_INVALID");
    }
    expect(invalidLoop.refusal).toMatchObject({
      code: "playback.loop_invalid",
      reason: "empty",
    });
    expect(invalidLoop.evidence.tickProjections).toBe(
      withoutLoop.evidence.tickProjections + 2,
    );
    expect(invalidLoop.evidence.tickProjections).toBe(4);
  });

  test("binding and source inventories retain no parallel growing indexes", async () => {
    const fileName = "compile-playback-plan.ts";
    const source = await readFile(
      new URL(`../../src/playback/${fileName}`, import.meta.url),
      "utf8",
    );
    const unit: PlaybackSourceUnit = Object.freeze({
      fileName,
      sourceFile: parseSource(fileName, source),
    });

    expect(retainedInventoryFindings(unit)).toEqual([]);
  });

  test("production playback owns no runtime theory dependency or generation", async () => {
    const playbackDirectory = new URL("../../src/playback/", import.meta.url);
    const productionFileNames = (await readdir(playbackDirectory))
      .filter((fileName) => fileName.endsWith(".ts"))
      .sort();
    expect(productionFileNames).toEqual([...PLAYBACK_PRODUCTION_FILE_NAMES]);

    const units = await Promise.all(
      PLAYBACK_PRODUCTION_FILE_NAMES.map(
        async (fileName): Promise<PlaybackSourceUnit> => {
          const source = await readFile(new URL(fileName, playbackDirectory), "utf8");
          return Object.freeze({
            fileName,
            sourceFile: parseSource(fileName, source),
          });
        },
      ),
    );
    expect(playbackOwnershipFindings(units)).toEqual([]);

    const publicBarrel = units.find(({ fileName }) => fileName === "index.ts");
    if (publicBarrel === undefined) {
      throw new Error("P0_DEFENSIVE_PUBLIC_BARREL_MISSING");
    }
    expect(publicBarrelFindings(publicBarrel)).toEqual([]);
  });
});
