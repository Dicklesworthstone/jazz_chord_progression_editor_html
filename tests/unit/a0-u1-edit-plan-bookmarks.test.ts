import { expect, test } from "bun:test";

import { runAtomicEditPlan } from "../../src/application";
import { createA0U1Scenario } from "../support/a0-u1-edit-plan-fixture";

test("insert publication remains total when the existing insertion bookmark is null", () => {
  const scenario = createA0U1Scenario("complete-draft-into-measure");
  const plan = scenario.command.plan;
  if (
    plan.kind !== "insert-fragment" ||
    plan.placement.kind !== "into-measure"
  ) {
    throw new Error("A0_U1_NULL_INSERTION_SCENARIO");
  }
  const state = Object.freeze({
    ...scenario.state,
    bookmarks: Object.freeze({
      ...scenario.state.bookmarks,
      insertion: null,
    }),
  });

  const result = runAtomicEditPlan({
    state,
    command: scenario.command,
    dependencies: scenario.dependencies,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(
      `A0_U1_NULL_INSERTION_REFUSAL:${result.editPlanRefusal?.code ?? result.refusal.code}`,
    );
  }
  const inserted = result.editPlanReceipt.allocatedIdentities[0];
  if (inserted?.kind !== "event") {
    throw new Error("A0_U1_NULL_INSERTION_EVENT");
  }
  const afterInsertion = Object.freeze({
    kind: "after-event" as const,
    eventId: inserted.id,
  });

  expect(result.state.bookmarks.insertion).toEqual(afterInsertion);
  expect(result.editPlanReceipt.bookmarks.insertionPolicy).toBe(
    "create-after-last-inserted",
  );
  expect(result.editPlanReceipt.bookmarks.insertionRewrite).toBeNull();
  if (
    result.editPlanReceipt.bookmarks.insertionPolicy !==
    "create-after-last-inserted"
  ) {
    throw new Error("A0_U1_NULL_INSERTION_POLICY");
  }
  expect(result.editPlanReceipt.bookmarks.insertionCreated).toEqual(
    afterInsertion,
  );
  expect(result.editPlanReceipt.bookmarks.insertionCleared).toBe(false);
  expect(
    Object.keys(result.editPlanReceipt.bookmarks),
  ).toContain("insertionCreated");
  expect(result.editPlanReceipt.work).toMatchObject({
    bookmarkRecordsExamined: 1,
    bookmarkRecordsRewritten: 1,
    structuralDecodeCalls: 1,
    semanticValidationCalls: 1,
    termination: "complete",
  });
  expect(result.state.history.undo[0]?.beforeBookmarks.insertion).toBeNull();
  expect(result.state.history.undo[0]?.afterBookmarks.insertion).toEqual(
    afterInsertion,
  );
  expect(scenario.calls).toEqual({
    parser: 1,
    structuralDecode: 1,
    semanticValidation: 1,
    historyEstimate: 1,
    idKinds: ["event"],
  });
});
