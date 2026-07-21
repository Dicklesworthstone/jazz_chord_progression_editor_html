import { expect, test } from "@playwright/test";

import {
  captureU0PageDiagnostics,
  createU0ArtifactServer,
  createU0BrowserHarness,
  evidenceError,
  openU0BrowserHarness,
  u0Binding,
  writeU0EvidenceCell,
  type U0ArtifactServer,
  type U0CompiledBrowserHarness,
} from "./u0-browser-test-kit";

const viewport = { height: 1000, width: 1280 } as const;
const expectedStates = [
  { action: "Open quick entry", id: "U0-STATE-001", text: "blank" },
  { action: "Focus chart", id: "U0-STATE-002", text: "Select a chord" },
  { action: "Create custom chord", id: "U0-STATE-003", text: "retained query" },
  { action: "Review invalid tokens", id: "U0-STATE-004", text: "no guessed chord" },
  { action: "Export JSON", id: "U0-STATE-007", text: "Editing and export" },
  { action: "Export JSON", id: "U0-STATE-008", text: "quota" },
  { action: "View corruption details", id: "U0-STATE-009", text: "not replaced" },
  { action: "Resume audio", id: "U0-STATE-015", text: "editing still works" },
  { action: "Export chart", id: "U0-STATE-016", text: "Editing and export" },
  { action: "Review import details", id: "U0-STATE-017", text: "not replaced" },
  { action: "Retry export", id: "U0-STATE-020", text: "alternate local format" },
] as const;
const bindings = expectedStates.map((state) => u0Binding(state.id, "TR-U0-EMPTY-ERROR"));
const stylePaths = [
  "src/styles/reset.css",
  "src/styles/tokens.css",
  "src/styles/primitives.css",
  "src/styles/ui-foundations.css",
  "src/styles/ui-forms.css",
  "src/styles/ui-navigation.css",
  "src/styles/ui-structured.css",
  "src/styles/ui-overlays.css",
] as const;

let artifact: U0ArtifactServer;
let harness: U0CompiledBrowserHarness;

test.beforeAll(async () => {
  artifact = await createU0ArtifactServer();
  harness = await createU0BrowserHarness({
    entry: "tests/e2e/u0-interaction-harness.tsx",
    rootId: "u0-interaction-root",
    stylePaths,
    title: "U0 nonhappy state harness",
  });
});

test.afterAll(async () => {
  await harness.close();
  await artifact.close();
});

test("U0-STATE-001 U0-STATE-002 U0-STATE-003 U0-STATE-004 U0-STATE-007 U0-STATE-008 U0-STATE-009 U0-STATE-015 U0-STATE-016 U0-STATE-017 U0-STATE-020 preserve user data and expose one safe recovery action", async ({ browserName, page }, testInfo) => {
  test.setTimeout(300_000);
  const diagnostics = captureU0PageDiagnostics(page);
  const observations: Record<string, unknown> = {};
  let failure: string | null = null;

  try {
    expect(testInfo.retry).toBe(0);
    await openU0BrowserHarness(page, harness, {
      readySelector: '[data-u0-harness-ready="system-states"]',
      scenario: "system-states",
      viewport,
    });

    const observed: Array<Record<string, unknown>> = [];
    for (const expectedState of expectedStates) {
      const state = page.locator(`[data-u0-state-id="${expectedState.id}"]`);
      await expect(state).toContainText(expectedState.text, { ignoreCase: true });
      await expect(state.locator('[data-state-preservation="true"]')).toBeVisible();
      const preservation = await state.getAttribute("data-preservation");
      const safeAction = await state.getAttribute("data-safe-action");
      expect(safeAction).toBe(expectedState.action);
      expect(preservation?.length ?? 0).toBeGreaterThan(10);
      const action = state.getByRole("button", { name: expectedState.action });
      await expect(action).toBeVisible();
      await expect(action).toBeEnabled();
      await action.click();
      await expect(state).toHaveAttribute("data-preservation", preservation ?? "");
      observed.push({ id: expectedState.id, preservation, safeAction });
    }

    const ledger = JSON.parse(await page.locator("#u0-event-ledger").innerText()) as Array<Record<string, unknown>>;
    const actionStateIds = ledger.map((entry) => entry["stateId"]).filter((id): id is string => typeof id === "string");
    expect(actionStateIds).toEqual(expectedStates.map((state) => state.id));
    observations["nonhappyStates"] = observed;
    observations["safeActionSequence"] = actionStateIds;
    observations["claimBoundary"] = {
      automated: "U0 presentation keeps source text/document/recovery claims visible while dispatching only safe local action boundaries.",
      notClaimed: "Later-package adapter success, storage recovery, audio unlock, import, or export execution.",
    };
    observations["compiledHarness"] = {
      bundleBytes: harness.bundleBytes,
      bundleSha256: harness.bundleSha256,
      entry: "tests/e2e/u0-interaction-harness.tsx",
    };
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
  } catch (error) {
    failure = evidenceError(error);
    throw error;
  } finally {
    await writeU0EvidenceCell({
      artifact,
      bindings,
      browserName,
      cellId: "u0-nonhappy-preservation-safe-actions",
      diagnostics,
      environment: { scenario: "compiled-system-state-presentations" },
      error: failure,
      observations,
      outcome: failure === null ? "pass" : "fail",
      page,
      testInfo,
      viewport,
    });
  }
});
