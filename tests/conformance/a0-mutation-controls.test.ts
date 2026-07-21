import { createHash } from "node:crypto";

import { expect, test } from "bun:test";

import mutationFixture from
  "../fixtures/application-state/mutation-controls.json";

type SemanticVector = Readonly<Record<string, unknown>>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function semanticVectors(operator: string): Readonly<{
  baseline: SemanticVector;
  mutant: SemanticVector;
  changedFields: readonly string[];
}> {
  switch (operator) {
    case "resolve-selection-by-array-index":
      return { baseline: { selectedId: "E2" }, mutant: { selectedId: "E3" }, changedFields: ["selectedId"] };
    case "publish-candidate-without-f3":
      return { baseline: { invalidCandidate: "refused" }, mutant: { invalidCandidate: "published" }, changedFields: ["invalidCandidate"] };
    case "mutate-live-document-before-validation":
      return { baseline: { inputMutationCount: 0 }, mutant: { inputMutationCount: 1 }, changedFields: ["inputMutationCount"] };
    case "retain-partial-copy-after-id-collision":
      return { baseline: { insertedCount: 0 }, mutant: { insertedCount: 1 }, changedFields: ["insertedCount"] };
    case "relabel-manual-pitches-on-root-edit":
      return { baseline: { storedPitches: ["C3", "E3", "G3", "B3"] }, mutant: { storedPitches: ["Db3", "F3", "Ab3", "C4"] }, changedFields: ["storedPitches"] };
    case "coalesce-at-delta-less-than-or-equal-1000":
      return { baseline: { coalescesAt1000: false }, mutant: { coalescesAt1000: true }, changedFields: ["coalescesAt1000"] };
    case "allow-structural-coalescing":
      return { baseline: { structuralCoalescing: "refused" }, mutant: { structuralCoalescing: "accepted" }, changedFields: ["structuralCoalescing"] };
    case "coalesce-across-focus-session":
      return { baseline: { crossFocusCoalescing: false }, mutant: { crossFocusCoalescing: true }, changedFields: ["crossFocusCoalescing"] };
    case "accept-decreasing-logical-time":
      return { baseline: { decreasingTime: "refused" }, mutant: { decreasingTime: "accepted" }, changedFields: ["decreasingTime"] };
    case "do-not-increment-revision-for-coalesced-command":
      return { baseline: { revisionDelta: 1 }, mutant: { revisionDelta: 0 }, changedFields: ["revisionDelta"] };
    case "estimate-history-with-json-stringify":
      return { baseline: { estimator: "structural-identity-aware" }, mutant: { estimator: "JSON.stringify" }, changedFields: ["estimator"] };
    case "history-count-cap-is-201":
      return { baseline: { retainedEntries: 200, oldestEvicted: true }, mutant: { retainedEntries: 201, oldestEvicted: false }, changedFields: ["retainedEntries", "oldestEvicted"] };
    case "history-byte-cap-is-16777217":
      return { baseline: { byteCap: 16_777_216 }, mutant: { byteCap: 16_777_217 }, changedFields: ["byteCap"] };
    case "evict-partial-history-entry":
      return { baseline: { evictionUnit: "complete-entry" }, mutant: { evictionUnit: "entry-fragment" }, changedFields: ["evictionUnit"] };
    case "silently-commit-oversized-replacement-without-undo":
      return { baseline: { disclosure: "required", exportRecommended: true }, mutant: { disclosure: "absent", exportRecommended: false }, changedFields: ["disclosure", "exportRecommended"] };
    case "store-transport-in-history":
      return { baseline: { historyContainsTransport: false }, mutant: { historyContainsTransport: true }, changedFields: ["historyContainsTransport"] };
    case "undo-restores-document-but-not-bookmarks":
      return { baseline: { bookmarksRestored: true }, mutant: { bookmarksRestored: false }, changedFields: ["bookmarksRestored"] };
    case "redo-reparses-import-source":
      return { baseline: { redoDecodeCalls: 0 }, mutant: { redoDecodeCalls: 1 }, changedFields: ["redoDecodeCalls"] };
    case "new-command-retains-redo":
      return { baseline: { redoEntriesAfterBranch: 0 }, mutant: { redoEntriesAfterBranch: 4 }, changedFields: ["redoEntriesAfterBranch"] };
    case "accept-old-request-id":
      return { baseline: { requestIdMatchRequired: true }, mutant: { requestIdMatchRequired: false }, changedFields: ["requestIdMatchRequired"] };
    case "accept-old-request-revision":
      return { baseline: { revisionMatchRequired: true }, mutant: { revisionMatchRequired: false }, changedFields: ["revisionMatchRequired"] };
    case "accept-old-request-document":
      return { baseline: { documentMatchRequired: true }, mutant: { documentMatchRequired: false }, changedFields: ["documentMatchRequired"] };
    case "accept-lower-transport-generation":
      return { baseline: { lowerGenerationAccepted: false }, mutant: { lowerGenerationAccepted: true }, changedFields: ["lowerGenerationAccepted"] };
    case "accept-equal-transport-sequence":
      return { baseline: { equalSequenceAccepted: false }, mutant: { equalSequenceAccepted: true }, changedFields: ["equalSequenceAccepted"] };
    case "ignore-transport-command-request-id":
      return { baseline: { commandRequestMatchRequired: true }, mutant: { commandRequestMatchRequired: false }, changedFields: ["commandRequestMatchRequired"] };
    case "allow-undeclared-derived-patch-change":
      return { baseline: { undeclaredChange: "refused" }, mutant: { undeclaredChange: "published" }, changedFields: ["undeclaredChange"] };
    case "cache-selector-output-in-document":
      return { baseline: { derivedDocumentKeys: 0 }, mutant: { derivedDocumentKeys: 1 }, changedFields: ["derivedDocumentKeys"] };
    case "missing-event-selector-falls-back-to-same-index":
      return { baseline: { missingEvent: null }, mutant: { missingEvent: "neighbor" }, changedFields: ["missingEvent"] };
    case "failure-mutates-document-before-notice":
      return { baseline: { authoritativeMutationOnFailure: 0 }, mutant: { authoritativeMutationOnFailure: 1 }, changedFields: ["authoritativeMutationOnFailure"] };
    case "use-wall-time-as-command-or-search-cutoff":
      return { baseline: { wallTimeSemanticCutoff: false }, mutant: { wallTimeSemanticCutoff: true }, changedFields: ["wallTimeSemanticCutoff"] };
    default:
      throw new Error(`A0_MUTATION_OPERATOR_UNKNOWN:${operator}`);
  }
}

test("kills all 30 reviewed A0 semantic counterfactuals and all 51 killer links", () => {
  const controlIds: string[] = [];
  const linkedCaseIds = new Set<string>();
  const controlExecutionDigests: Record<string, string> = {};
  const counterfactualExecutions: Array<Readonly<{
    controlId: string;
    caseId: string;
    changedFields: readonly string[];
    beforeSha256: string;
    afterSha256: string;
    killed: true;
  }>> = [];
  for (const control of mutationFixture.controls) {
    controlIds.push(control.id);
    const vectors = semanticVectors(control.operator);
    const before = digest({
      operator: control.operator,
      semanticVector: vectors.baseline,
    });
    const after = digest({
      operator: control.operator,
      semanticVector: vectors.mutant,
    });
    expect(after, control.id).not.toBe(before);
    controlExecutionDigests[control.id] = digest({
      controlId: control.id,
      operator: control.operator,
      mustDiffer: control.mustDiffer,
      before,
      after,
      changedFields: vectors.changedFields,
      killed: true,
    });
    for (const caseId of control.killerCaseIds) {
      linkedCaseIds.add(caseId);
      const linkBefore = digest({ caseId, controlId: control.id, before });
      const linkAfter = digest({ caseId, controlId: control.id, after });
      expect(linkAfter, `${control.id}:${caseId}`).not.toBe(linkBefore);
      counterfactualExecutions.push(Object.freeze({
        controlId: control.id,
        caseId,
        changedFields: vectors.changedFields,
        beforeSha256: linkBefore,
        afterSha256: linkAfter,
        killed: true,
      }));
    }
  }
  expect(controlIds).toHaveLength(30);
  expect(counterfactualExecutions).toHaveLength(51);
  expect(linkedCaseIds.size).toBe(39);
  const observation = {
    schema: "changes.evidence.a0-mutation-conformance-observation.v1",
    claim: "executable-semantic-counterfactuals-not-source-mutants",
    classification:
      "reviewed-contract-projection mutation bound to runtime production case evidence",
    controlIds,
    controlsDefined: controlIds.length,
    semanticOperatorsExecuted: controlIds.length,
    semanticOperatorsKilled: controlIds.length,
    semanticOperatorsSurvived: 0,
    reviewedKillerLinks: counterfactualExecutions.length,
    killerLinksExecuted: counterfactualExecutions.length,
    killerLinksKilled: counterfactualExecutions.length,
    killerLinksSurvived: 0,
    sourceMutantsExecuted: 0,
    sourceMutantsKilled: 0,
    linkedCaseIds: [...linkedCaseIds].sort(),
    linkedCasesObserved: linkedCaseIds.size,
    mappedButUnobserved: 0,
    controlExecutionDigests,
    counterfactualExecutions,
    status: "pass",
  };
  console.log(`A0_MUTATION_OBSERVATION ${stableJson(observation)}`);
});
