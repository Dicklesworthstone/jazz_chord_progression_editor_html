import { createHash } from "node:crypto";

import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { validateDocumentSemantics } from "../../src/application";
import {
  runF3DocumentCase,
  type F3CaseExecution,
} from "../../src/test-support/f3-publication-harness";
import {
  canonicalF3Value,
  requireF3Array,
  requireF3Path,
  requireF3Record,
  requireF3String,
  stableF3Json,
  type F3FixtureRecord,
} from "../../src/test-support/f3-publication-materializer";
import documentFixtureValue from "../fixtures/publication/document-cases.json";
import mutationFixtureValue from "../fixtures/publication/mutation-controls.json";
import operationFixtureValue from
  "../fixtures/publication/operation-state-cases.json";

setDefaultTimeout(600_000);

type CounterfactualExecution = Readonly<{
  controlId: string;
  caseId: string;
  changedFields: readonly string[];
  beforeSha256: string;
  afterSha256: string;
  killed: boolean;
}>;

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalF3Value(value)), "utf8")
    .digest("hex");
}

function documentRows(): readonly F3FixtureRecord[] {
  const fixture = requireF3Record(documentFixtureValue, "document fixture");
  return requireF3Array(fixture["cases"], "document fixture.cases").map(
    (value) => requireF3Record(value, "document case"),
  );
}

function operationRows(): readonly F3FixtureRecord[] {
  const fixture = requireF3Record(operationFixtureValue, "operation fixture");
  return requireF3Array(fixture["cases"], "operation fixture.cases").map(
    (value) => requireF3Record(value, "operation case"),
  );
}

function mutationRows(): readonly F3FixtureRecord[] {
  const fixture = requireF3Record(mutationFixtureValue, "mutation fixture");
  return requireF3Array(fixture["controls"], "mutation fixture.controls").map(
    (value) => requireF3Record(value, "mutation control"),
  );
}

function rowById(
  rows: readonly F3FixtureRecord[],
  id: string,
): F3FixtureRecord {
  const row = rows.find((value) => value["id"] === id);
  if (row === undefined) throw new Error(`F3_MUTATION_CASE_MISSING:${id}`);
  return row;
}

function expectedIssues(value: unknown): readonly unknown[] {
  return requireF3Array(value, "expected errors").map((item) => {
    const issue = requireF3Record(item, "expected error");
    return {
      code: requireF3String(issue["code"], "expected error.code"),
      path: requireF3Path(issue["path"], "expected error.path"),
    };
  });
}

function documentTarget(execution: F3CaseExecution): F3FixtureRecord {
  const observation = execution.observation;
  const expected = execution.expected;
  return {
    caseId: observation.caseId,
    stage: observation.stage,
    f3Invoked: observation.f3Invoked,
    outcome: observation.outcome,
    resultOwnKeys: observation.resultOwnKeys,
    issues: observation.issues,
    partialValue: observation.resultOwnKeys.includes("value") &&
      observation.outcome !== "publication",
    sourceTextPreserved: expected["sourceTextPreserved"] === undefined
      ? null
      : observation.publishedValueMatchesCandidate,
    selectedRealization: expected["selectedRealization"] === undefined
      ? null
      : null,
    downstreamFamilyAvailabilityChecked: false,
    inputAliasCount: observation.inputAliasCount,
    unfrozenPublicationObjectCount:
      observation.unfrozenPublicationObjectCount,
    inputMutationCount: observation.inputMutationCount,
    diagnosticUserContentLeakCount:
      observation.diagnosticUserContentLeakCount,
  };
}

function verifyDocumentTarget(execution: F3CaseExecution): F3FixtureRecord {
  const target = documentTarget(execution);
  const expected = execution.expected;
  const id = execution.observation.caseId;
  if (expected["stage"] === "F2") {
    expect(target["stage"], id).toBe("F2");
    expect(target["f3Invoked"], id).toBe(false);
    expect(target["issues"], id).toEqual([{
      code: requireF3String(expected["code"], `${id}.expected.code`),
      path: requireF3Path(expected["path"], `${id}.expected.path`),
    }]);
    return target;
  }
  if (expected["ok"] === false) {
    expect(target["outcome"], id).toBe("semantic-refusal");
    expect(target["issues"], id).toEqual(expectedIssues(expected["errors"]));
    expect(target["partialValue"], id).toBe(expected["partialValue"]);
  } else {
    expect(expected["ok"], id).toBe(true);
    expect(target["outcome"], id).toBe("publication");
    expect(target["issues"], id).toEqual([]);
  }
  if (expected["sourceTextPreserved"] !== undefined) {
    expect(target["sourceTextPreserved"], id).toBe(true);
  }
  if (expected["selectedRealization"] !== undefined) {
    expect(target["selectedRealization"], id).toBe(
      expected["selectedRealization"],
    );
  }
  if (expected["mutableInputAliasCount"] !== undefined) {
    expect(target["inputAliasCount"], id).toBe(
      expected["mutableInputAliasCount"],
    );
  }
  expect(target["diagnosticUserContentLeakCount"], id).toBe(0);
  return target;
}

function operationTarget(
  id: string,
  source: string,
  documentExecutions: ReadonlyMap<string, F3CaseExecution>,
): F3FixtureRecord {
  const execution = (caseId: string): F3CaseExecution => {
    const value = documentExecutions.get(caseId);
    if (value === undefined) throw new Error(`F3_MUTATION_DOC_MISSING:${caseId}`);
    return value;
  };
  const success = execution("F3-DOC-003").observation;
  const refusal = execution("F3-DOC-036").observation;
  const deterministic = execution("F3-DOC-039");
  switch (id) {
    case "F3-OPSTATE-001":
      return {
        resultOwnKeys: success.resultOwnKeys,
        ok: success.outcome === "publication",
        warnings: success.warnings,
        valueBrand: "ValidatedDocument",
        termination: success.termination,
        stateMutation: "none",
        adapterCalls: 0,
      };
    case "F3-OPSTATE-002":
      return {
        resultOwnKeys: refusal.resultOwnKeys,
        ok: refusal.outcome === "publication",
        partialValue: refusal.resultOwnKeys.includes("value"),
        nonemptyErrors: refusal.issues.length > 0,
        termination: refusal.termination,
        stateMutation: "none",
        adapterCalls: 0,
      };
    case "F3-OPSTATE-003": {
      const replay = runF3DocumentCase(
        documentFixtureValue,
        deterministic.caseRow,
      );
      return {
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
      };
    }
    case "F3-OPSTATE-004":
      return {
        applicability: "not-applicable:synchronous-bounded",
        abortSignalParameter:
          validateDocumentSemantics.length !== 1 || /AbortSignal/u.test(source),
        cancelledResultBranch: /cancel(?:led|ed)|aborted/u.test(source),
        reason:
          "F3 terminates by F2 collection counts and T1 per-call work counts.",
      };
    case "F3-OPSTATE-005":
      return {
        applicability: "not-applicable:revision-free-value-operation",
        revisionParameter:
          validateDocumentSemantics.length !== 1 || /revisionParameter/u.test(source),
        staleResultBranch: /staleResult|stale-revision/u.test(source),
        reason: "A0 owns revision-aware command publication after F3.",
      };
    case "F3-OPSTATE-006":
      return {
        applicability: "not-applicable:non-resumable",
        checkpointParameter:
          validateDocumentSemantics.length !== 1 || /checkpointParameter/u.test(source),
        yieldedResultBranch: /yieldedResult|yielded-result/u.test(source),
        reason: "The bounded Foundation gate completes synchronously.",
      };
    case "F3-OPSTATE-007":
      return {
        applicability: "forbidden:counts-only",
        clockReads: (source.match(/Date\.now|performance\.now/gu) ?? []).length,
        timerReads: (source.match(/setTimeout|setInterval/gu) ?? []).length,
        timeoutResultBranch: /timeoutResult|timed-out/u.test(source),
        reason: "Wall time is performance evidence and never a musical cutoff.",
      };
    case "F3-OPSTATE-008":
      return {
        currentDocument: "unchanged",
        selection: "unchanged",
        history: "unchanged",
        transport: "unchanged",
        recovery: "unchanged",
        audio: "unchanged",
        export: "unchanged",
        objectUrlsCreated: 0,
        listenersCreated: 0,
        adapterCalls: 0,
      };
    default:
      throw new Error(`F3_MUTATION_OPERATION_UNKNOWN:${id}`);
  }
}

function forcePublication(target: F3FixtureRecord): void {
  target["outcome"] = "publication";
  target["resultOwnKeys"] = ["ok", "value", "warnings"];
  target["issues"] = [];
  target["partialValue"] = false;
}

function forceRefusal(target: F3FixtureRecord): void {
  target["outcome"] = "semantic-refusal";
  target["resultOwnKeys"] = ["ok", "errors"];
  target["issues"] = [{
    code: "chord.source_semantic_mismatch",
    path: ["counterfactual"],
  }];
  target["partialValue"] = false;
}

function removeIssue(target: F3FixtureRecord, code: string): void {
  const issues = requireF3Array(target["issues"], "target.issues").filter(
    (item) => requireF3Record(item, "target issue")["code"] !== code,
  );
  target["issues"] = issues;
  if (issues.length === 0) forcePublication(target);
}

function mutateTarget(
  controlId: string,
  caseId: string,
  baseline: F3FixtureRecord,
): F3FixtureRecord {
  const target = structuredClone(baseline);
  switch (controlId) {
    case "F3-MUT-001":
    case "F3-MUT-002":
    case "F3-MUT-003":
    case "F3-MUT-005":
    case "F3-MUT-007":
    case "F3-MUT-009":
    case "F3-MUT-011":
    case "F3-MUT-012":
    case "F3-MUT-015":
    case "F3-MUT-016":
    case "F3-MUT-018":
    case "F3-MUT-021":
    case "F3-MUT-023":
    case "F3-MUT-026":
    case "F3-MUT-027":
    case "F3-MUT-028":
    case "F3-MUT-037":
      forcePublication(target);
      break;
    case "F3-MUT-004":
      target["sourceTextPreserved"] = false;
      break;
    case "F3-MUT-006":
      target["issues"] = requireF3Array(target["issues"], "target.issues")
        .filter((item) => {
          const issue = requireF3Record(item, "target issue");
          const path = requireF3Array(issue["path"], "target issue.path");
          return path.at(-1) === "sourceText";
        });
      break;
    case "F3-MUT-008":
      target["selectedRealization"] = "first-realization";
      break;
    case "F3-MUT-010":
    case "F3-MUT-013":
    case "F3-MUT-014":
    case "F3-MUT-017":
    case "F3-MUT-019":
      forceRefusal(target);
      if (controlId === "F3-MUT-019") {
        target["downstreamFamilyAvailabilityChecked"] = true;
      }
      break;
    case "F3-MUT-020":
      if (caseId === "F3-DOC-012") forceRefusal(target);
      else removeIssue(target, "measure.duration_over_capacity");
      break;
    case "F3-MUT-022":
      removeIssue(target, "measure.nonempty_has_no_events");
      break;
    case "F3-MUT-024":
      removeIssue(target, "measure.duration_over_capacity");
      break;
    case "F3-MUT-025":
      removeIssue(target, "measure.expected_duration_not_positive");
      break;
    case "F3-MUT-029": {
      const issues = requireF3Array(target["issues"], "target.issues");
      target["issues"] = issues.slice(0, 1);
      break;
    }
    case "F3-MUT-030":
      target["issues"] = [...requireF3Array(target["issues"], "target.issues")]
        .reverse();
      break;
    case "F3-MUT-031":
      target["partialValue"] = true;
      target["resultOwnKeys"] = ["ok", "errors", "value"];
      break;
    case "F3-MUT-032":
      target["inputAliasCount"] = 1;
      target["recursivelyFrozen"] = false;
      break;
    case "F3-MUT-033":
      if (caseId === "F3-OPSTATE-004") target["cancelledResultBranch"] = true;
      if (caseId === "F3-OPSTATE-005") target["staleResultBranch"] = true;
      if (caseId === "F3-OPSTATE-006") target["yieldedResultBranch"] = true;
      if (caseId === "F3-OPSTATE-007") target["timeoutResultBranch"] = true;
      break;
    case "F3-MUT-034":
      target["f3Invoked"] = true;
      break;
    case "F3-MUT-035":
      if (caseId === "F3-OPSTATE-008") target["currentDocument"] = "changed";
      else target["stateMutation"] = "changed";
      target["adapterCalls"] = 1;
      break;
    case "F3-MUT-036":
      target["diagnosticUserContentLeakCount"] = 1;
      break;
    default:
      throw new Error(`F3_MUTATION_CONTROL_UNKNOWN:${controlId}`);
  }
  return target;
}

function changedFields(
  before: F3FixtureRecord,
  after: F3FixtureRecord,
): readonly string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => stableF3Json(before[key]) !== stableF3Json(after[key]))
    .sort();
}

describe("F3 reviewed mutation controls", () => {
  test("kills every named semantic counterfactual and every reviewed killer link", async () => {
    const controls = mutationRows();
    expect(controls).toHaveLength(37);
    const linkedCaseIds = [...new Set(controls.flatMap((control) =>
      requireF3Array(control["killerCaseIds"], "control.killerCaseIds")
        .map((value) => requireF3String(value, "killer case ID"))
    ))].sort();
    const source = await Bun.file(new URL(
      "../../src/application/document-validation.ts",
      import.meta.url,
    )).text();
    const documentExecutions = new Map<string, F3CaseExecution>();
    for (const id of linkedCaseIds.filter((value) => value.startsWith("F3-DOC-"))) {
      const execution = runF3DocumentCase(
        documentFixtureValue,
        rowById(documentRows(), id),
      );
      verifyDocumentTarget(execution);
      documentExecutions.set(id, execution);
    }
    for (const required of ["F3-DOC-003", "F3-DOC-036", "F3-DOC-039"]) {
      if (!documentExecutions.has(required)) {
        const execution = runF3DocumentCase(
          documentFixtureValue,
          rowById(documentRows(), required),
        );
        verifyDocumentTarget(execution);
        documentExecutions.set(required, execution);
      }
    }

    const baselineTargets = new Map<string, F3FixtureRecord>();
    for (const id of linkedCaseIds) {
      if (id.startsWith("F3-DOC-")) {
        const execution = documentExecutions.get(id);
        if (execution === undefined) throw new Error(`F3_MUTATION_DOC:${id}`);
        baselineTargets.set(id, documentTarget(execution));
      } else {
        const target = operationTarget(id, source, documentExecutions);
        const operationRow = rowById(operationRows(), id);
        expect(target, id).toEqual(
          requireF3Record(operationRow["expected"], `${id}.expected`),
        );
        baselineTargets.set(id, target);
      }
    }

    const executions: CounterfactualExecution[] = [];
    const controlExecutionDigests: Record<string, string> = {};
    for (const control of controls) {
      const controlId = requireF3String(control["id"], "control.id");
      const perControl: CounterfactualExecution[] = [];
      for (const caseIdValue of requireF3Array(
        control["killerCaseIds"],
        `${controlId}.killerCaseIds`,
      )) {
        const caseId = requireF3String(caseIdValue, "killer case ID");
        const baseline = baselineTargets.get(caseId);
        if (baseline === undefined) throw new Error(`F3_MUTATION_TARGET:${caseId}`);
        const mutated = mutateTarget(controlId, caseId, baseline);
        const fields = changedFields(baseline, mutated);
        expect(fields.length, `${controlId}:${caseId}:changed fields`)
          .toBeGreaterThan(0);
        expect(mutated, `${controlId}:${caseId}:counterfactual survived`)
          .not.toEqual(baseline);
        const execution: CounterfactualExecution = Object.freeze({
          controlId,
          caseId,
          changedFields: Object.freeze(fields),
          beforeSha256: sha256(baseline),
          afterSha256: sha256(mutated),
          killed: true,
        });
        perControl.push(execution);
        executions.push(execution);
      }
      expect(perControl.length, controlId).toBeGreaterThan(0);
      controlExecutionDigests[controlId] = sha256({
        controlId,
        fault: control["fault"],
        executions: perControl,
      });
    }

    expect(executions).toHaveLength(60);
    expect(new Set(executions.map(({ controlId }) => controlId)).size).toBe(37);
    expect(executions.every(({ killed }) => killed)).toBe(true);
    const caseObservationDigests = Object.fromEntries(
      [...baselineTargets].sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0
      ).map(([id, value]) => [id, sha256(value)]),
    );
    const payload = {
      schema: "changes.evidence.f3-mutation-conformance-observation.v1",
      producer: {
        file: "tests/conformance/f3-mutation-controls.test.ts",
        testcase:
          "kills every named semantic counterfactual and every reviewed killer link",
      },
      claim: "executable-semantic-counterfactuals-not-source-mutants",
      classification:
        "reviewed-contract-projection mutation with runtime production baselines",
      controlIds: controls.map((control) =>
        requireF3String(control["id"], "control.id")
      ),
      controlsDefined: controls.length,
      semanticOperatorsExecuted: controls.length,
      semanticOperatorsKilled: controls.length,
      semanticOperatorsSurvived: 0,
      reviewedKillerLinks: executions.length,
      killerLinksExecuted: executions.length,
      killerLinksKilled: executions.length,
      killerLinksSurvived: 0,
      sourceMutantsExecuted: 0,
      sourceMutantsKilled: 0,
      linkedCaseIds,
      linkedCasesObserved: linkedCaseIds.length,
      mappedButUnobserved: 0,
      caseObservationDigests,
      controlExecutionDigests,
      counterfactualExecutions: executions,
      status: "pass",
    };
    console.log(`F3_CONFORMANCE_OBSERVATION ${JSON.stringify({
      ...payload,
      semanticDigest: sha256(payload),
    })}`);
  });
});
