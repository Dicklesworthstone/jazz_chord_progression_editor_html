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
const statusIds = [
  "U0-STATE-004", "U0-STATE-005", "U0-STATE-006", "U0-STATE-007",
  "U0-STATE-008", "U0-STATE-009", "U0-STATE-010", "U0-STATE-011",
  "U0-STATE-012", "U0-STATE-013", "U0-STATE-014", "U0-STATE-015",
  "U0-STATE-016", "U0-STATE-018", "U0-STATE-019", "U0-STATE-020",
] as const;
const bindings = [
  u0Binding("U0-STALE-001", "TR-U0-STATUS"),
  ...statusIds.map((id) => u0Binding(id, "TR-U0-STATUS")),
] as const;
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
    title: "U0 system status harness",
  });
});

test.afterAll(async () => {
  await harness.close();
  await artifact.close();
});

test("U0-STALE-001 U0-STATE-004 U0-STATE-005 U0-STATE-006 U0-STATE-007 U0-STATE-008 U0-STATE-009 U0-STATE-010 U0-STATE-011 U0-STATE-012 U0-STATE-013 U0-STATE-014 U0-STATE-015 U0-STATE-016 U0-STATE-018 U0-STATE-019 U0-STATE-020 expose restrained live status, preservation, and a safe next action", async ({ browserName, page }, testInfo) => {
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

    const analysis = page.locator("#current-analysis-status");
    const staleProbe = page.locator("#stale-analysis-result");
    const analysisBefore = await analysis.innerText();
    await staleProbe.focus();
    await staleProbe.click();
    await expect(staleProbe).toBeFocused();
    await expect(analysis).toHaveText(analysisBefore);

    const stateObservations: Array<Record<string, unknown>> = [];
    for (const id of statusIds) {
      const state = page.locator(`[data-u0-state-id="${id}"]`);
      await expect(state).toHaveCount(1);
      const live = state.locator('[role="status"], [role="alert"]');
      await expect(live).toHaveCount(1);
      const liveMode = await live.getAttribute("aria-live");
      expect(["polite", "assertive"]).toContain(liveMode);
      const preservation = await state.getAttribute("data-preservation");
      const safeAction = await state.getAttribute("data-safe-action");
      expect(preservation?.length ?? 0).toBeGreaterThan(10);
      expect(safeAction?.length ?? 0).toBeGreaterThan(2);
      const action = state.getByRole("button", { name: safeAction ?? "missing" });
      await expect(action).toBeVisible();
      await expect(action).toBeEnabled();
      await action.click();
      stateObservations.push({ id, liveMode, preservation, safeAction });
    }

    const duplicate = page.locator('[data-u0-state-id="U0-STATE-019"] [data-duplicate-count]');
    await expect(duplicate).toHaveAttribute("data-duplicate-count", "3");
    await expect(duplicate).toHaveAttribute("data-sequence", "19");
    const ledger = JSON.parse(await page.locator("#u0-event-ledger").innerText()) as Array<Record<string, unknown>>;
    const staleEvent = ledger.find((entry) => entry["action"] === "ignored-stale-presentation");
    expect(staleEvent).toMatchObject({ currentRevision: 3, preserved: analysisBefore, tokenRevision: 2 });
    expect(ledger.filter((entry) => typeof entry["stateId"] === "string")).toHaveLength(statusIds.length);

    observations["states"] = stateObservations;
    observations["stalePresentation"] = {
      analysisAfter: await analysis.innerText(),
      analysisBefore,
      event: staleEvent,
      focusAfter: await page.locator(":focus").getAttribute("id"),
    };
    observations["claimBoundary"] = {
      automated: "Fixture-authored U0 view-state, live-region, preservation, and intent-boundary behavior.",
      adapterIntegration: "Owned by later storage, audio, analysis, import, and export packages; not claimed here.",
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
      cellId: "u0-system-status-live-preservation-actions",
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
