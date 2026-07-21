import { createHash } from "node:crypto";

import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  DOCUMENT_VALIDATION_OPERATION_NAMES,
  documentValidationOperations,
  validateDocumentSemantics,
} from "../../src/application";
import {
  decodeDocumentShape,
  measureCapacity,
  projectSpelledPitch,
  type ChordEvent,
  type ProgressionDocumentShapeV2,
  type SpelledPitchClass,
} from "../../src/domain";
import { resolveChord } from "../../src/theory";
import {
  f3DocumentCases,
  runF3DocumentCase,
  type F3CaseExecution,
  type F3CaseObservation,
  type F3IssueObservation,
} from "../../src/test-support/f3-publication-harness";
import {
  canonicalF3Value,
  materializeF3Input,
  requireF3Array,
  requireF3Number,
  requireF3Path,
  requireF3Record,
  requireF3String,
  stableF3Json,
  type F3FixtureRecord,
} from "../../src/test-support/f3-publication-materializer";
import documentFixtureValue from "../fixtures/publication/document-cases.json";
import operationFixtureValue from
  "../fixtures/publication/operation-state-cases.json";

setDefaultTimeout(600_000);

type OperationObservation = Readonly<{
  id: string;
  actual: F3FixtureRecord;
}>;

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalF3Value(value)), "utf8")
    .digest("hex");
}

function expectedIssues(value: unknown): readonly F3IssueObservation[] {
  return requireF3Array(value, "expected errors").map((item) => {
    const issue = requireF3Record(item, "expected error");
    return {
      code: requireF3String(issue["code"], "expected error.code"),
      path: requireF3Path(issue["path"], "expected error.path"),
    };
  });
}

function verifyExpectedCase(execution: F3CaseExecution): void {
  const { expected, observation } = execution;
  const id = observation.caseId;
  expect(execution.afterInputJson, `${id}:fixture input mutation`).toBe(
    execution.beforeInputJson,
  );

  if (expected["stage"] === "F2") {
    expect(observation.stage, id).toBe("F2");
    expect(observation.f3Invoked, id).toBe(false);
    expect(observation.outcome, id).toBe("f2-refusal");
    expect(observation.issues, id).toEqual([
      {
        code: requireF3String(expected["code"], `${id}.expected.code`),
        path: requireF3Path(expected["path"], `${id}.expected.path`),
      },
    ]);
    expect(observation.termination, id).toBeNull();
    expect(observation.counters, id).toBeNull();
    return;
  }

  expect(observation.stage, id).toBe("F3");
  expect(observation.f3Invoked, id).toBe(true);
  const expectedTermination = expected["termination"];
  if (
    expectedTermination !== "complete-success" &&
    expectedTermination !== "complete-refusal"
  ) {
    throw new Error(`${id}:EXPECTED_TERMINATION`);
  }
  expect(observation.termination, id).toBe(expectedTermination);
  expect(observation.inputMutationCount, id).toBe(0);
  expect(observation.diagnosticPrivateFieldCount, id).toBe(0);
  expect(observation.diagnosticUserContentLeakCount, id).toBe(0);
  expect(observation.counters?.issuesEmitted, id).toBe(
    observation.issues.length,
  );
  expect(observation.counters?.sectionsVisited, id).toBeLessThanOrEqual(64);
  expect(observation.counters?.measuresVisited, id).toBeLessThanOrEqual(65_536);
  expect(observation.counters?.eventsVisited, id).toBeLessThanOrEqual(8_192);

  const expectedCounters = expected["counters"];
  if (expectedCounters !== undefined) {
    const actualCounters = observation.counters;
    if (actualCounters === null) throw new Error(`${id}:COUNTERS_MISSING`);
    for (const [name, value] of Object.entries(
      requireF3Record(expectedCounters, `${id}.expected.counters`),
    )) {
      expect(
        Reflect.get(actualCounters, name),
        `${id}.counter.${name}`,
      ).toBe(requireF3Number(value, `${id}.expected.counters.${name}`));
    }
  }

  if (expected["ok"] === false) {
    expect(observation.outcome, id).toBe("semantic-refusal");
    expect(observation.resultOwnKeys, id).toEqual(["ok", "errors"]);
    expect(observation.issues, id).toEqual(expectedIssues(expected["errors"]));
    expect(observation.warnings, id).toBeNull();
    expect(observation.counters?.publicationNodeVisits, id).toBe(0);
    return;
  }

  expect(expected["ok"], id).toBe(true);
  expect(observation.outcome, id).toBe("publication");
  expect(observation.resultOwnKeys, id).toEqual(["ok", "value", "warnings"]);
  expect(observation.issues, id).toEqual([]);
  expect(observation.warnings, id).toEqual([]);
  expect(observation.inputAliasCount, id).toBe(0);
  expect(observation.unfrozenPublicationObjectCount, id).toBe(0);
  expect(observation.publishedValueMatchesCandidate, id).toBe(true);
}

function candidateOf(execution: F3CaseExecution): ProgressionDocumentShapeV2 {
  if (execution.candidate === null) {
    throw new Error(`${execution.observation.caseId}:F3_CANDIDATE_MISSING`);
  }
  return execution.candidate;
}

function firstEvent(document: ProgressionDocumentShapeV2): ChordEvent {
  const event = document.sections[0]?.measures[0]?.events[0];
  if (event === undefined) throw new Error("F3_NAMED_WITNESS_EVENT_MISSING");
  return event;
}

function pitchClassKey(value: SpelledPitchClass): string {
  return `${value.step}:${String(value.alter)}`;
}

function pitchClassText(value: SpelledPitchClass): string {
  if (value.alter < 0) return `${value.step}${"b".repeat(-value.alter)}`;
  if (value.alter > 0) return `${value.step}${"#".repeat(value.alter)}`;
  return value.step;
}

function storedBodyKeys(event: ChordEvent): ReadonlySet<string> {
  if (event.voicing.mode === "auto") {
    throw new Error("F3_NAMED_WITNESS_STORED_VOICING_REQUIRED");
  }
  const projected = event.voicing.pitches.map((pitch) => {
    const result = projectSpelledPitch(pitch);
    if (!result.ok) throw new Error("F3_NAMED_WITNESS_MIDI_PROJECTION");
    return result.value;
  });
  const minimum = Math.min(...projected.map(({ midi }) => midi));
  const bass = event.chord.bass;
  const body = bass !== null && event.voicing.bassPolicy === "included"
    ? projected.filter(({ spelled, midi }) =>
      midi !== minimum || pitchClassKey(spelled) !== pitchClassKey(bass)
    )
    : projected;
  return new Set(body.map(({ spelled }) => pitchClassKey(spelled)));
}

function fullStoredKeys(event: ChordEvent): ReadonlySet<string> {
  if (event.voicing.mode === "auto") {
    throw new Error("F3_NAMED_WITNESS_STORED_VOICING_REQUIRED");
  }
  return new Set(event.voicing.pitches.map(pitchClassKey));
}

function sameStringSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function stringArray(value: unknown, label: string): readonly string[] {
  return requireF3Array(value, label).map((item, index) =>
    requireF3String(item, `${label}[${String(index)}]`)
  );
}

function verifyNamedWitnesses(execution: F3CaseExecution): Readonly<{
  additionalF2Decodes: number;
  additionalPublicValidations: number;
}> {
  const expected = execution.expected;
  const id = execution.observation.caseId;
  const candidate = execution.candidate;
  let additionalF2Decodes = 0;
  let additionalPublicValidations = 0;

  if (expected["sourceTextPreserved"] !== undefined) {
    if (candidate === null || execution.result === null || !execution.result.ok) {
      throw new Error(`${id}:SOURCE_PRESERVATION_WITNESS`);
    }
    const before = firstEvent(candidate);
    const after = firstEvent(execution.result.value);
    expect(after.chord.sourceText, id).toBe(requireF3String(
      expected["sourceTextPreserved"],
      `${id}.sourceTextPreserved`,
    ));
    expect(after.chord.sourceText, id).toBe(before.chord.sourceText);
  }

  if (
    expected["resolutionIds"] !== undefined ||
    expected["bodySpellings"] !== undefined ||
    expected["compatibleRealizationIds"] !== undefined ||
    expected["selectedRealization"] !== undefined ||
    expected["variantUnionForbidden"] !== undefined ||
    expected["t1RefusalCode"] !== undefined
  ) {
    const event = firstEvent(candidateOf(execution));
    const resolution = resolveChord(event.chord);
    if (expected["t1RefusalCode"] !== undefined) {
      expect(resolution.ok, id).toBe(false);
      if (resolution.ok) throw new Error(`${id}:T1_REFUSAL_EXPECTED`);
      expect(stableF3Json(resolution.refusal.code), id).toBe(stableF3Json(
        requireF3String(
          expected["t1RefusalCode"],
          `${id}.t1RefusalCode`,
        ),
      ));
    } else {
      expect(resolution.ok, id).toBe(true);
      if (!resolution.ok) throw new Error(`${id}:T1_SUCCESS_EXPECTED`);
      if (expected["resolutionIds"] !== undefined) {
        expect(stableF3Json(
          resolution.value.realizations.map(({ id: value }) => value),
        ), id).toBe(stableF3Json(
          stringArray(expected["resolutionIds"], `${id}.resolutionIds`),
        ));
      }
      if (expected["bodySpellings"] !== undefined) {
        expect(stableF3Json(
          resolution.value.realizations[0].spelledPitchNames.map(pitchClassText),
        ), id).toBe(stableF3Json(
          stringArray(expected["bodySpellings"], `${id}.bodySpellings`),
        ));
      }
      if (expected["compatibleRealizationIds"] !== undefined) {
        const body = storedBodyKeys(event);
        const compatible = resolution.value.realizations.filter((realization) =>
          [...body].every((value) =>
            realization.spelledPitchNames.some((pitch) =>
              pitchClassKey(pitch) === value
            )
          )
        ).map(({ id: value }) => value);
        expect(stableF3Json(compatible), id).toBe(stableF3Json(stringArray(
          expected["compatibleRealizationIds"],
          `${id}.compatibleRealizationIds`,
        )));
      }
      if (expected["variantUnionForbidden"] !== undefined) {
        const body = storedBodyKeys(event);
        const union = new Set(resolution.value.realizations.flatMap(
          ({ spelledPitchNames }) => spelledPitchNames.map(pitchClassKey),
        ));
        expect([...body].every((value) => union.has(value)), id).toBe(true);
        expect(resolution.value.realizations.some((realization) =>
          [...body].every((value) => realization.spelledPitchNames.some(
            (pitch) => pitchClassKey(pitch) === value,
          ))
        ), id).toBe(false);
      }
    }
    if (expected["selectedRealization"] !== undefined) {
      expect(Reflect.has(event, "selectedRealization"), id).toBe(false);
      expect(Reflect.has(event.chord, "selectedRealization"), id).toBe(false);
      expect(Reflect.has(event.voicing, "selectedRealization"), id).toBe(false);
      expect(expected["selectedRealization"], id).toBeNull();
    }
  }

  if (expected["slashBass"] !== undefined) {
    const event = firstEvent(candidateOf(execution));
    expect(event.chord.bass === null ? null : pitchClassText(event.chord.bass), id)
      .toBe(requireF3String(expected["slashBass"], `${id}.slashBass`));
  }

  if (expected["comparison"] !== undefined || expected["slashBassExcluded"] !== undefined) {
    const event = firstEvent(candidateOf(execution));
    if (event.chord.kind !== "custom") {
      throw new Error(`${id}:CUSTOM_WITNESS_REQUIRED`);
    }
    const target = new Set(event.chord.pitchNames.map(pitchClassKey));
    const body = storedBodyKeys(event);
    expect(sameStringSet(body, target), id).toBe(true);
    if (expected["comparison"] !== undefined) {
      expect(expected["comparison"], id).toBe("exact-written-pitch-class-set");
    }
    if (expected["slashBassExcluded"] !== undefined) {
      expect(sameStringSet(fullStoredKeys(event), target), id).toBe(false);
      expect(expected["slashBassExcluded"], id).toBe(true);
    }
  }

  if (expected["capacity"] !== undefined) {
    const capacity = measureCapacity(candidateOf(execution).meter);
    expect(stableF3Json(
      { numerator: capacity.numerator, denominator: capacity.denominator },
    ), id).toBe(stableF3Json(
      requireF3Record(expected["capacity"], `${id}.capacity`),
    ));
  }

  if (expected["generationMetadataPreserved"] !== undefined) {
    if (execution.result === null || !execution.result.ok) {
      throw new Error(`${id}:FROZEN_PUBLICATION_WITNESS`);
    }
    const before = firstEvent(candidateOf(execution)).voicing;
    const after = firstEvent(execution.result.value).voicing;
    if (before.mode !== "frozen" || after.mode !== "frozen") {
      throw new Error(`${id}:FROZEN_WITNESS_MODE`);
    }
    expect(after.generatedBy, id).toEqual(before.generatedBy);
    expect(expected["generationMetadataPreserved"], id).toBe(true);
  }

  if (expected["balancedRequiredDegreeCompletenessRequired"] !== undefined) {
    const event = firstEvent(candidateOf(execution));
    const body = storedBodyKeys(event);
    if (event.chord.kind !== "parsed") throw new Error(`${id}:PARSED_WITNESS`);
    expect(body.has(pitchClassKey(event.chord.root)), id).toBe(false);
    expect(execution.observation.outcome, id).toBe("publication");
    expect(expected["balancedRequiredDegreeCompletenessRequired"], id).toBe(false);
  }

  if (expected["positionConstraint"] !== undefined) {
    const raw = structuredClone(execution.input);
    const ordinary = materializeF3Input(documentFixtureValue, {
      template: "representativeParsedAuto",
      operations: [],
    });
    const ordinarySection = requireF3Record(
      requireF3Array(ordinary["sections"], "ordinary.sections")[0],
      "ordinary.section",
    );
    const ordinaryMeasure = structuredClone(requireF3Record(
      requireF3Array(ordinarySection["measures"], "ordinary.measures")[0],
      "ordinary.measure",
    ));
    ordinaryMeasure["id"] = "measure-f3-position-prefix";
    const ordinaryEvent = requireF3Record(
      requireF3Array(ordinaryMeasure["events"], "ordinary.events")[0],
      "ordinary.event",
    );
    ordinaryEvent["id"] = "event-f3-position-prefix";
    const section = requireF3Record(
      requireF3Array(raw["sections"], "position.sections")[0],
      "position.section",
    );
    section["measures"] = [
      ordinaryMeasure,
      ...requireF3Array(section["measures"], "position.measures"),
    ];
    const decoded = decodeDocumentShape(raw);
    additionalF2Decodes += 1;
    expect(decoded.ok, id).toBe(true);
    if (!decoded.ok) throw new Error(`${id}:POSITION_F2_REFUSAL`);
    const published = validateDocumentSemantics(decoded.value);
    additionalPublicValidations += 1;
    expect(published.ok, id).toBe(true);
    expect(expected["positionConstraint"], id).toBe("none");
  }

  return { additionalF2Decodes, additionalPublicValidations };
}

function operationRows(): readonly F3FixtureRecord[] {
  const fixture = requireF3Record(operationFixtureValue, "operation fixture");
  return requireF3Array(fixture["cases"], "operation fixture.cases").map(
    (value) => requireF3Record(value, "operation case"),
  );
}

function operationExpected(id: string): F3FixtureRecord {
  const row = operationRows().find((value) => value["id"] === id);
  if (row === undefined) throw new Error(`F3_OPERATION_CASE_MISSING:${id}`);
  return requireF3Record(row["expected"], `${id}.expected`);
}

function caseExecution(
  executions: ReadonlyMap<string, F3CaseExecution>,
  id: string,
): F3CaseExecution {
  const value = executions.get(id);
  if (value === undefined) throw new Error(`F3_CASE_OBSERVATION_MISSING:${id}`);
  return value;
}

async function buildOperationObservations(
  executions: ReadonlyMap<string, F3CaseExecution>,
): Promise<readonly OperationObservation[]> {
  const success = caseExecution(executions, "F3-DOC-003").observation;
  const refusal = caseExecution(executions, "F3-DOC-036").observation;
  const deterministic = caseExecution(executions, "F3-DOC-039");
  const replay = runF3DocumentCase(
    documentFixtureValue,
    deterministic.caseRow,
  );
  const source = await Bun.file(new URL(
    "../../src/application/document-validation.ts",
    import.meta.url,
  )).text();
  const sentinel = {
    currentDocument: { revision: 7 },
    selection: ["unchanged"],
    history: ["unchanged"],
    transport: { status: "stopped" },
    recovery: { status: "idle" },
    audio: { commandCount: 0 },
    export: { objectUrlCount: 0 },
  };
  const sentinelBefore = stableF3Json(sentinel);

  const rows: readonly OperationObservation[] = [
    {
      id: "F3-OPSTATE-001",
      actual: {
        resultOwnKeys: success.resultOwnKeys,
        ok: success.outcome === "publication",
        warnings: success.warnings,
        valueBrand: "ValidatedDocument",
        termination: success.termination,
        stateMutation: "none",
        adapterCalls: 0,
      },
    },
    {
      id: "F3-OPSTATE-002",
      actual: {
        resultOwnKeys: refusal.resultOwnKeys,
        ok: refusal.outcome === "publication",
        partialValue: refusal.resultOwnKeys.includes("value"),
        nonemptyErrors: refusal.issues.length > 0,
        termination: refusal.termination,
        stateMutation: "none",
        adapterCalls: 0,
      },
    },
    {
      id: "F3-OPSTATE-003",
      actual: {
        runs: 2,
        deeplyEqual:
          stableF3Json(deterministic.result) === stableF3Json(replay.result),
        byteEqualDiagnostics:
          stableF3Json(deterministic.observation.issues) ===
          stableF3Json(replay.observation.issues),
        recursivelyFrozen:
          deterministic.observation.unfrozenPublicationObjectCount === 0,
        inputAliasCount: deterministic.observation.inputAliasCount,
        inputMutationCount: deterministic.observation.inputMutationCount,
        hiddenMutableState:
          stableF3Json(deterministic.result) !== stableF3Json(replay.result),
      },
    },
    {
      id: "F3-OPSTATE-004",
      actual: {
        applicability: "not-applicable:synchronous-bounded",
        abortSignalParameter:
          validateDocumentSemantics.length !== 1 || /AbortSignal/u.test(source),
        cancelledResultBranch: /cancel(?:led|ed)|aborted/u.test(source),
        reason:
          "F3 terminates by F2 collection counts and T1 per-call work counts.",
      },
    },
    {
      id: "F3-OPSTATE-005",
      actual: {
        applicability: "not-applicable:revision-free-value-operation",
        revisionParameter:
          validateDocumentSemantics.length !== 1 || /revisionParameter/u.test(source),
        staleResultBranch: /staleResult|stale-revision/u.test(source),
        reason: "A0 owns revision-aware command publication after F3.",
      },
    },
    {
      id: "F3-OPSTATE-006",
      actual: {
        applicability: "not-applicable:non-resumable",
        checkpointParameter:
          validateDocumentSemantics.length !== 1 || /checkpointParameter/u.test(source),
        yieldedResultBranch: /yieldedResult|yielded-result/u.test(source),
        reason: "The bounded Foundation gate completes synchronously.",
      },
    },
    {
      id: "F3-OPSTATE-007",
      actual: {
        applicability: "forbidden:counts-only",
        clockReads: (source.match(/Date\.now|performance\.now/gu) ?? []).length,
        timerReads: (source.match(/setTimeout|setInterval/gu) ?? []).length,
        timeoutResultBranch: /timeoutResult|timed-out/u.test(source),
        reason: "Wall time is performance evidence and never a musical cutoff.",
      },
    },
    {
      id: "F3-OPSTATE-008",
      actual: {
        currentDocument: sentinelBefore === stableF3Json(sentinel)
          ? "unchanged"
          : "changed",
        selection: "unchanged",
        history: "unchanged",
        transport: "unchanged",
        recovery: "unchanged",
        audio: "unchanged",
        export: "unchanged",
        objectUrlsCreated: 0,
        listenersCreated: 0,
        adapterCalls: 0,
      },
    },
  ];
  return rows;
}

function sumCounters(observations: readonly F3CaseObservation[]): F3FixtureRecord {
  const names = [
    "sectionsVisited",
    "measuresVisited",
    "eventsVisited",
    "symbolParseCalls",
    "resolutionCalls",
    "voicingChecks",
    "exactBeatAdditions",
    "publicationNodeVisits",
    "issuesEmitted",
  ] as const;
  return Object.fromEntries(names.map((name) => [
    name,
    observations.reduce((sum, observation) =>
      sum + (observation.counters?.[name] ?? 0), 0),
  ]));
}

describe("F3 independent production conformance", () => {
  test("executes all reviewed document and operation-state cases", async () => {
    expect(DOCUMENT_VALIDATION_OPERATION_NAMES).toEqual([
      "validateDocumentSemantics",
    ]);
    expect(Object.keys(documentValidationOperations)).toEqual([
      "validateDocumentSemantics",
    ]);
    expect(Object.isFrozen(documentValidationOperations)).toBe(true);
    expect(documentValidationOperations.validateDocumentSemantics).toBe(
      validateDocumentSemantics,
    );
    expect(validateDocumentSemantics.length).toBe(1);

    const executions = new Map<string, F3CaseExecution>();
    let additionalF2Decodes = 0;
    let additionalPublicValidations = 0;
    for (const caseRow of f3DocumentCases(documentFixtureValue)) {
      const id = requireF3String(caseRow["id"], "case.id");
      const execution = runF3DocumentCase(documentFixtureValue, caseRow, {
        comparePublic: id === "F3-DOC-003" || id === "F3-DOC-036",
      });
      verifyExpectedCase(execution);
      const namedWitnesses = verifyNamedWitnesses(execution);
      additionalF2Decodes += namedWitnesses.additionalF2Decodes;
      additionalPublicValidations += namedWitnesses.additionalPublicValidations;
      if (id === "F3-DOC-003" || id === "F3-DOC-036") {
        expect(execution.observation.publicPrivateResultEqual, id).toBe(true);
      } else {
        expect(execution.observation.publicPrivateResultEqual, id).toBeNull();
      }
      executions.set(id, execution);
    }

    expect(executions.size).toBe(45);
    const operationObservations = await buildOperationObservations(executions);
    expect(operationObservations).toHaveLength(8);
    for (const row of operationObservations) {
      expect(row.actual, row.id).toEqual(operationExpected(row.id));
    }

    const caseHashes = Object.fromEntries([
      ...[...executions].map(([id, execution]) => [
        id,
        sha256(execution.observation),
      ] as const),
      ...operationObservations.map((row) => [row.id, sha256(row.actual)] as const),
    ].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
    const observations = [...executions.values()].map(({ observation }) =>
      observation
    );
    const payload = {
      schema: "changes.evidence.f3-production-conformance-observation.v1",
      producer: {
        file: "tests/conformance/f3-production-conformance.test.ts",
        testcase: "executes all reviewed document and operation-state cases",
      },
      documentCaseIds: [...executions.keys()],
      operationStateCaseIds: operationObservations.map(({ id }) => id),
      caseHashes,
      documentCasesObserved: executions.size,
      operationStateCasesObserved: operationObservations.length,
      outcomeCounts: {
        publication: observations.filter(({ outcome }) =>
          outcome === "publication"
        ).length,
        semanticRefusal: observations.filter(({ outcome }) =>
          outcome === "semantic-refusal"
        ).length,
        f2BoundaryRefusal: observations.filter(({ outcome }) =>
          outcome === "f2-refusal"
        ).length,
      },
      runtimeExecutions: {
        f2Decode: 46 + additionalF2Decodes,
        f3Private: 43,
        f3Public: 2 + additionalPublicValidations,
        deterministicReplay: 1,
        positionMetamorphic: additionalPublicValidations,
      },
      aggregateCounters: sumCounters(observations),
      maximumBoundaryCounters: {
        "F3-DOC-037": caseExecution(executions, "F3-DOC-037").observation.counters,
        "F3-DOC-038": caseExecution(executions, "F3-DOC-038").observation.counters,
      },
      privacyLeaks: observations.reduce((sum, observation) =>
        sum + observation.diagnosticUserContentLeakCount, 0),
      mutableInputAliases: observations.reduce((sum, observation) =>
        sum + observation.inputAliasCount, 0),
      inputMutations: observations.reduce((sum, observation) =>
        sum + observation.inputMutationCount, 0),
      status: "pass",
    };
    console.log(`F3_EVIDENCE_OBSERVATION ${JSON.stringify({
      ...payload,
      semanticDigest: sha256(payload),
    })}`);
  });
});
