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

const viewport = { height: 900, width: 1280 } as const;
const bindings = [
  u0Binding("U0-OVR-001", "TR-U0-FOCUS"),
  u0Binding("U0-OVR-002", "TR-U0-FOCUS"),
  u0Binding("U0-OVR-003", "TR-U0-FOCUS"),
  u0Binding("U0-OVR-004", "TR-U0-FOCUS"),
  u0Binding("U0-OVR-005", "TR-U0-FOCUS"),
  u0Binding("U0-OVR-006", "TR-U0-FOCUS"),
  u0Binding("U0-PRIM-006", "TR-U0-FOCUS"),
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
    title: "U0 focus restoration harness",
  });
});

test.afterAll(async () => {
  await harness.close();
  await artifact.close();
});

test("U0-OVR-001 U0-OVR-002 U0-OVR-003 U0-OVR-004 U0-OVR-005 U0-OVR-006 U0-PRIM-006 enforce modal entry, topmost dismissal, exact return, and stale fallback focus", async ({ browserName, page }, testInfo) => {
  test.setTimeout(300_000);
  const diagnostics = captureU0PageDiagnostics(page);
  const observations: Record<string, unknown> = {};
  let failure: string | null = null;

  try {
    expect(testInfo.retry).toBe(0);
    await openU0BrowserHarness(page, harness, {
      readySelector: '[data-u0-harness-ready="overlays"]',
      scenario: "overlays",
      viewport,
    });

    const trigger = page.locator("#dialog-trigger");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Edit chord" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#dialog-cancel")).toBeFocused();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(await page.locator('[aria-modal="true"]').count()).toBe(1);
    expect(await page.locator("#overlay-background").evaluate((element) => ({
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: (element as HTMLElement).inert,
    }))).toEqual({ ariaHidden: "true", inert: true });

    await page.keyboard.press("Shift+Tab");
    expect(await dialog.locator(":focus").count()).toBe(1);
    await page.keyboard.press("Tab");
    expect(await dialog.locator(":focus").count()).toBe(1);

    await page.locator("#nested-popover-trigger").click();
    await expect(page.getByRole("dialog", { name: "Nested options" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Nested options" })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(page.locator("#nested-popover-trigger")).toBeFocused();

    await page.getByRole("button", { name: "Close editing dialog" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    const exactReturnId = await page.locator(":focus").getAttribute("id");

    await trigger.click();
    await page.locator("#dialog-cancel").click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator("[data-authoritative-document]")).toHaveAttribute("data-authoritative-document", "Cmaj7 | Dm7 G7");

    await trigger.click();
    await page.locator("#remove-trigger-and-close").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#workflow-fallback")).toBeFocused();
    const staleReturnId = await page.locator(":focus").getAttribute("id");
    const entries = JSON.parse(await page.locator("#u0-event-ledger").innerText()) as Array<Record<string, unknown>>;
    const staleDiagnostic = [...entries].reverse().find((entry) => entry["code"] === "ui.stale_owner");
    expect(staleDiagnostic).toBeDefined();

    observations["focusSequence"] = {
      exactReturnId,
      initialFocusId: "dialog-cancel",
      staleDiagnostic,
      staleReturnId,
      topmostPopoverDismissedWithoutDialogDismissal: true,
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
      cellId: "u0-focus-entry-exact-stale-fallback",
      diagnostics,
      environment: { scenario: "compiled-production-overlays" },
      error: failure,
      observations,
      outcome: failure === null ? "pass" : "fail",
      page,
      testInfo,
      viewport,
    });
  }
});
