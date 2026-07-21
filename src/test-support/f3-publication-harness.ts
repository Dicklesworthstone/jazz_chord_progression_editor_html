import { validateDocumentSemantics } from "../application";
import { validateDocumentSemanticsWithEvidence } from
  "../application/document-validation";
import {
  decodeDocumentShape,
  type ProgressionDocumentShapeV2,
} from "../domain";

import {
  f3ExpectedPublicationNodes,
  f3ObjectGraph,
  f3UnfrozenObjectCount,
  materializeF3Input,
  requireF3Array,
  requireF3Record,
  requireF3String,
  stableF3Json,
  type F3FixturePath,
  type F3FixtureRecord,
} from "./f3-publication-materializer";

export type F3IssueObservation = Readonly<{
  code: string;
  path: F3FixturePath;
}>;

export type F3CounterObservation = Readonly<{
  sectionsVisited: number;
  measuresVisited: number;
  eventsVisited: number;
  symbolParseCalls: number;
  resolutionCalls: number;
  voicingChecks: number;
  exactBeatAdditions: number;
  publicationNodeVisits: number;
  issuesEmitted: number;
}>;

export type F3CaseObservation = Readonly<{
  caseId: string;
  stage: "F2" | "F3";
  f3Invoked: boolean;
  outcome: "f2-refusal" | "semantic-refusal" | "publication";
  resultOwnKeys: readonly string[];
  issues: readonly F3IssueObservation[];
  warnings: readonly unknown[] | null;
  termination: "complete-success" | "complete-refusal" | null;
  counters: F3CounterObservation | null;
  inputMutationCount: number;
  inputAliasCount: number;
  unfrozenPublicationObjectCount: number;
  publishedValueMatchesCandidate: boolean;
  publicPrivateResultEqual: boolean | null;
  diagnosticPrivateFieldCount: number;
  diagnosticUserContentLeakCount: number;
}>;

export type F3CaseExecution = Readonly<{
  caseRow: F3FixtureRecord;
  expected: F3FixtureRecord;
  input: F3FixtureRecord;
  beforeInputJson: string;
  afterInputJson: string;
  candidate: ProgressionDocumentShapeV2 | null;
  observation: F3CaseObservation;
  result: ReturnType<typeof validateDocumentSemantics> | null;
}>;

function issueObservation(value: Readonly<{
  code: string;
  path: readonly (string | number)[];
}>): F3IssueObservation {
  return Object.freeze({
    code: value.code,
    path: Object.freeze([...value.path]),
  });
}

function candidateUserStrings(value: unknown): readonly string[] {
  const keys = new Set([
    "annotation",
    "description",
    "id",
    "label",
    "name",
    "sourceText",
    "title",
  ]);
  const found = new Set<string>();
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      current.forEach((item: unknown) => {
        pending.push(item);
      });
      continue;
    }
    if (typeof current !== "object" || current === null) continue;
    for (const [key, child] of Object.entries(current)) {
      if (keys.has(key) && typeof child === "string" && child.length >= 3) {
        found.add(child);
      }
      pending.push(child);
    }
  }
  return [...found];
}

function diagnosticPrivacy(
  errors: readonly Readonly<{
    code: string;
    path: readonly (string | number)[];
    message: string;
  }>[],
  input: unknown,
): Readonly<{
  privateFieldCount: number;
  userContentLeakCount: number;
}> {
  const userStrings = candidateUserStrings(input);
  let privateFieldCount = 0;
  let userContentLeakCount = 0;
  for (const issue of errors) {
    const keys = Object.keys(issue);
    privateFieldCount += keys.filter(
      (key) => key !== "code" && key !== "path" && key !== "message",
    ).length;
    userContentLeakCount += userStrings.filter((value) =>
      issue.message.includes(value)
    ).length;
  }
  return { privateFieldCount, userContentLeakCount };
}

function frozenCounters(value: F3CounterObservation): F3CounterObservation {
  return Object.freeze({ ...value });
}

export function runF3DocumentCase(
  fixtureValue: unknown,
  caseValue: unknown,
  options: Readonly<{ comparePublic?: boolean }> = {},
): F3CaseExecution {
  const caseRow = requireF3Record(caseValue, "case");
  const caseId = requireF3String(caseRow["id"], "case.id");
  const expected = requireF3Record(caseRow["expected"], `${caseId}.expected`);
  const input = materializeF3Input(fixtureValue, caseRow["input"]);
  const beforeInputJson = stableF3Json(input);
  const decoded = decodeDocumentShape(input);

  if (expected["stage"] === "F2") {
    const issues = decoded.ok
      ? []
      : decoded.errors.map(issueObservation);
    return Object.freeze({
      caseRow,
      expected,
      input,
      beforeInputJson,
      afterInputJson: stableF3Json(input),
      candidate: null,
      observation: Object.freeze({
        caseId,
        stage: "F2",
        f3Invoked: false,
        outcome: "f2-refusal",
        resultOwnKeys: decoded.ok ? Object.keys(decoded) : Object.keys(decoded),
        issues: Object.freeze(issues),
        warnings: null,
        termination: null,
        counters: null,
        inputMutationCount: 0,
        inputAliasCount: 0,
        unfrozenPublicationObjectCount: 0,
        publishedValueMatchesCandidate: false,
        publicPrivateResultEqual: null,
        diagnosticPrivateFieldCount: decoded.ok
          ? 0
          : decoded.errors.reduce((count, issue) =>
            count + Object.keys(issue).filter(
              (key) => key !== "code" && key !== "path" && key !== "message",
            ).length, 0),
        diagnosticUserContentLeakCount: 0,
      }),
      result: null,
    });
  }

  if (!decoded.ok) throw new Error(`${caseId}:EXPECTED_F2_SUCCESS`);
  const candidateGraph = f3ObjectGraph(decoded.value);
  const beforeCandidateJson = stableF3Json(decoded.value);
  const privateRun = validateDocumentSemanticsWithEvidence(decoded.value);
  const publicResult = options.comparePublic === true
    ? validateDocumentSemantics(decoded.value)
    : null;
  const afterCandidateJson = stableF3Json(decoded.value);
  const inputMutationCount = beforeCandidateJson === afterCandidateJson ? 0 : 1;
  const publicPrivateResultEqual = publicResult === null
    ? null
    : stableF3Json(publicResult) === stableF3Json(privateRun.result);

  if (!privateRun.result.ok) {
    const privacy = diagnosticPrivacy(privateRun.result.errors, input);
    return Object.freeze({
      caseRow,
      expected,
      input,
      beforeInputJson,
      afterInputJson: stableF3Json(input),
      candidate: decoded.value,
      observation: Object.freeze({
        caseId,
        stage: "F3",
        f3Invoked: true,
        outcome: "semantic-refusal",
        resultOwnKeys: Object.freeze(Object.keys(privateRun.result)),
        issues: Object.freeze(privateRun.result.errors.map(issueObservation)),
        warnings: null,
        termination: privateRun.evidence.termination,
        counters: frozenCounters(privateRun.evidence.counters),
        inputMutationCount,
        inputAliasCount: 0,
        unfrozenPublicationObjectCount: 0,
        publishedValueMatchesCandidate: false,
        publicPrivateResultEqual,
        diagnosticPrivateFieldCount: privacy.privateFieldCount,
        diagnosticUserContentLeakCount: privacy.userContentLeakCount,
      }),
      result: privateRun.result,
    });
  }

  const publishedGraph = f3ObjectGraph(privateRun.result.value);
  let inputAliasCount = 0;
  for (const node of publishedGraph) {
    if (candidateGraph.has(node)) inputAliasCount += 1;
  }
  return Object.freeze({
    caseRow,
    expected,
    input,
    beforeInputJson,
    afterInputJson: stableF3Json(input),
    candidate: decoded.value,
    observation: Object.freeze({
      caseId,
      stage: "F3",
      f3Invoked: true,
      outcome: "publication",
      resultOwnKeys: Object.freeze(Object.keys(privateRun.result)),
      issues: Object.freeze([]),
      warnings: privateRun.result.warnings,
      termination: privateRun.evidence.termination,
      counters: frozenCounters(privateRun.evidence.counters),
      inputMutationCount,
      inputAliasCount,
      unfrozenPublicationObjectCount: f3UnfrozenObjectCount(privateRun),
      publishedValueMatchesCandidate:
        stableF3Json(privateRun.result.value) === beforeCandidateJson &&
        privateRun.evidence.counters.publicationNodeVisits ===
          f3ExpectedPublicationNodes(decoded.value),
      publicPrivateResultEqual,
      diagnosticPrivateFieldCount: 0,
      diagnosticUserContentLeakCount: 0,
    }),
    result: privateRun.result,
  });
}

export function f3DocumentCases(fixtureValue: unknown): readonly F3FixtureRecord[] {
  const fixture = requireF3Record(fixtureValue, "fixture");
  return requireF3Array(fixture["cases"], "fixture.cases").map((value) =>
    requireF3Record(value, "fixture.case")
  );
}
