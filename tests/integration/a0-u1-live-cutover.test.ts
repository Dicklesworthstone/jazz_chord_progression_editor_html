import { expect, test } from "bun:test";

import {
  APPLICATION_COMMAND_KINDS,
  redoDocumentCommand,
  runDocumentCommand,
  undoDocumentCommand,
} from "../../src/application";
import { createA0U1Scenario } from "../support/a0-u1-edit-plan-fixture";

/**
 * Live-cutover witnesses for the accepted A0/U1 amendment: the sixteenth
 * `apply-edit-plan` kind dispatches through the live `runDocumentCommand`
 * surface and replays through the live history ports, while the fifteen
 * historical paths and their precedence remain untouched.
 */

test("the live tuple is the historical fifteen kinds plus the sole accepted suffix", () => {
  expect(APPLICATION_COMMAND_KINDS).toHaveLength(16);
  expect(APPLICATION_COMMAND_KINDS[15]).toBe("apply-edit-plan");
});

test("apply-edit-plan commits through the live runDocumentCommand surface", () => {
  const scenario = createA0U1Scenario("complete-draft-into-section");
  const result = runDocumentCommand({
    state: scenario.state,
    command: scenario.command,
    dependencies: scenario.dependencies,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal.code);
  expect(result.outcome).toBe("committed");
  const topEntry = result.state.history.undo.at(-1);
  expect(topEntry?.commandKind).toBe("apply-edit-plan");
  expect(result.state.revision).toBe(scenario.state.revision + 1);
  expect("editPlanReceipt" in result).toBe(true);
  expect(scenario.calls.parser).toBe(1);
  expect(scenario.calls.structuralDecode).toBe(1);
  expect(scenario.calls.semanticValidation).toBe(1);
});

test("the live history ports replay the committed atomic edit exactly", () => {
  const scenario = createA0U1Scenario("complete-draft-into-section");
  const applied = runDocumentCommand({
    state: scenario.state,
    command: scenario.command,
    dependencies: scenario.dependencies,
  });
  expect(applied.ok).toBe(true);
  if (!applied.ok) throw new Error(applied.refusal.code);

  const undone = undoDocumentCommand({ state: applied.state });
  expect(undone.ok).toBe(true);
  if (!undone.ok) throw new Error(undone.refusal.code);
  expect(undone.outcome).toBe("undone");
  expect(undone.state.document).toEqual(scenario.state.document);
  expect(undone.state.bookmarks).toEqual(scenario.state.bookmarks);

  const redone = redoDocumentCommand({ state: undone.state });
  expect(redone.ok).toBe(true);
  if (!redone.ok) throw new Error(redone.refusal.code);
  expect(redone.outcome).toBe("redone");
  expect(redone.state.document).toEqual(applied.state.document);
  expect(redone.state.bookmarks).toEqual(applied.state.bookmarks);
});

test("a stale apply-edit-plan refuses through the live surface without publication", () => {
  const scenario = createA0U1Scenario("complete-draft-into-section");
  const staleCommand = Object.freeze({
    ...scenario.command,
    expectedRevision: scenario.command.expectedRevision + 1,
  });
  const result = runDocumentCommand({
    state: scenario.state,
    command: staleCommand,
    dependencies: scenario.dependencies,
  });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected refusal");
  expect(result.refusal.code).toBe("command.stale_revision");
  expect(result.state.document).toEqual(scenario.state.document);
  expect(result.state.revision).toBe(scenario.state.revision);
  expect(scenario.calls.parser).toBe(0);
  expect(scenario.calls.structuralDecode).toBe(0);
});

test("a historical fifteen-kind command still runs unchanged beside the new path", () => {
  const scenario = createA0U1Scenario("complete-draft-into-section");
  const result = runDocumentCommand({
    state: scenario.state,
    command: Object.freeze({
      id: "command-live-cutover-set-text",
      label: "Rename document",
      expectedDocumentId: scenario.state.document.id,
      expectedRevision: scenario.state.revision,
      logicalTimeMs: 5_000,
      coalescing: Object.freeze({
        kind: "text-field" as const,
        key: "title",
        focusSessionId: "focus-live-cutover",
      }),
      kind: "set-text",
      target: Object.freeze({ kind: "document-title" as const }),
      value: "Live Cutover Witness",
    }),
    dependencies: scenario.dependencies,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal.code);
  expect(result.state.document.title).toBe("Live Cutover Witness");
  expect(result.state.history.undo.at(-1)?.commandKind).toBe("set-text");
  expect(scenario.calls.parser).toBe(0);
});
