import { expect, test, type Page, type TestInfo } from "@playwright/test";

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
  type U0TraceBinding,
} from "./u0-browser-test-kit";

const viewport = { height: 900, width: 1280 } as const;
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

async function entries(page: Page): Promise<Array<Record<string, unknown>>> {
  return JSON.parse(await page.locator("#u0-event-ledger").innerText()) as Array<Record<string, unknown>>;
}

async function runOverlayEvidence(
  page: Page,
  browserName: string,
  testInfo: TestInfo,
  cellId: string,
  bindings: readonly U0TraceBinding[],
  run: (observations: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const diagnostics = captureU0PageDiagnostics(page);
  const observations: Record<string, unknown> = {
    compiledHarness: {
      bundleBytes: harness.bundleBytes,
      bundleSha256: harness.bundleSha256,
      entry: "tests/e2e/u0-interaction-harness.tsx",
    },
  };
  let failure: string | null = null;
  try {
    expect(testInfo.retry).toBe(0);
    await openU0BrowserHarness(page, harness, {
      readySelector: '[data-u0-harness-ready="overlays"]',
      scenario: "overlays",
      viewport,
    });
    await run(observations);
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
      cellId,
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
}

test.beforeAll(async () => {
  artifact = await createU0ArtifactServer();
  harness = await createU0BrowserHarness({
    entry: "tests/e2e/u0-interaction-harness.tsx",
    rootId: "u0-interaction-root",
    stylePaths,
    title: "U0 overlay behavior harness",
  });
});

test.afterAll(async () => {
  await harness.close();
  await artifact.close();
});

test("U0-OVR-001 U0-OVR-003 U0-OVR-004 U0-OVR-005 U0-CANCEL-004 keep one modal inert scope and preserve the document on Close or Cancel", async ({ browserName, page }, testInfo) => {
  await runOverlayEvidence(page, browserName, testInfo, "u0-overlay-modal-close-cancel", [
    u0Binding("U0-OVR-001", "TR-U0-OVERLAY"),
    u0Binding("U0-OVR-003", "TR-U0-OVERLAY"),
    u0Binding("U0-OVR-004", "TR-U0-OVERLAY"),
    u0Binding("U0-OVR-005", "TR-U0-OVERLAY"),
    u0Binding("U0-CANCEL-004", "TR-U0-OVERLAY"),
  ], async (observations) => {
    const trigger = page.locator("#dialog-trigger");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Edit chord" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#dialog-cancel")).toBeFocused();
    await expect(page.locator("#overlay-background")).toHaveAttribute("aria-hidden", "true");
    expect(await page.locator("#overlay-background").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
    expect(await page.locator('[aria-modal="true"]').count()).toBe(1);
    await page.locator("#dialog-cancel").click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator("[data-authoritative-document]")).toHaveAttribute("data-authoritative-document", "Cmaj7 | Dm7 G7");

    await trigger.click();
    await page.getByRole("button", { name: "Close editing dialog" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    const dismissals = (await entries(page)).filter((entry) => entry["componentId"] === "editing-dialog" && entry["action"] === "dismiss");
    expect(dismissals).toHaveLength(1);
    observations["modal"] = {
      authoritativeDocument: "Cmaj7 | Dm7 G7",
      closeDismissals: dismissals,
      exactFocusReturn: await page.locator(":focus").getAttribute("id"),
      initialFocus: "dialog-cancel",
      modalCount: 1,
    };
  });
});

test("U0-OVR-002 U0-OVR-009 U0-OVR-010 U0-CANCEL-003 dismiss only the top menu, popover, or tooltip without stealing valid focus", async ({ browserName, page }, testInfo) => {
  await runOverlayEvidence(page, browserName, testInfo, "u0-overlay-topmost-transients", [
    u0Binding("U0-OVR-002", "TR-U0-OVERLAY"),
    u0Binding("U0-OVR-009", "TR-U0-OVERLAY"),
    u0Binding("U0-OVR-010", "TR-U0-OVERLAY"),
    u0Binding("U0-CANCEL-003", "TR-U0-OVERLAY"),
  ], async (observations) => {
    const menuTrigger = page.locator("#overlay-menu-trigger");
    await menuTrigger.click();
    await expect(page.getByRole("menu", { name: "Overlay action menu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Overlay action menu" })).toHaveCount(0);
    await expect(menuTrigger).toBeFocused();

    await page.locator("#dialog-trigger").click();
    const dialog = page.getByRole("dialog", { name: "Edit chord" });
    await page.locator("#nested-popover-trigger").click();
    await expect(page.getByRole("dialog", { name: "Nested options" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Nested options" })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(page.locator("#nested-popover-trigger")).toBeFocused();
    await page.getByRole("button", { name: "Close editing dialog" }).click();

    await page.locator("#standalone-popover-trigger").click();
    await expect(page.getByRole("dialog", { name: "Standalone options" })).toBeVisible();
    await page.locator("#outside-focus-target").focus();
    await page.locator("#outside-focus-target").click();
    await expect(page.getByRole("dialog", { name: "Standalone options" })).toHaveCount(0);
    await expect(page.locator("#outside-focus-target")).toBeFocused();

    const tooltipTrigger = page.locator("#tooltip-trigger");
    await tooltipTrigger.focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(tooltipTrigger).toBeFocused();
    await expect(page.locator("[data-authoritative-document]")).toHaveAttribute("data-authoritative-document", "Cmaj7 | Dm7 G7");

    const ledger = await entries(page);
    const outsideCancels = ledger.filter((entry) => entry["componentId"] === "standalone-popover" && entry["phase"] === "cancel");
    expect(outsideCancels).toHaveLength(1);
    observations["transients"] = {
      menuFocusReturn: "overlay-menu-trigger",
      nestedDialogRemained: true,
      outsideCancels,
      outsideFocusRetained: "outside-focus-target",
      tooltipFocusRetained: "tooltip-trigger",
    };
  });
});

test("U0-OVR-006 U0-REF-003 U0-STALE-004 refuse a stale owner on open and use the declared fallback after trigger deletion", async ({ browserName, page }, testInfo) => {
  await runOverlayEvidence(page, browserName, testInfo, "u0-overlay-stale-owner", [
    u0Binding("U0-OVR-006", "TR-U0-OVERLAY"),
    u0Binding("U0-REF-003", "TR-U0-OVERLAY"),
    u0Binding("U0-STALE-004", "TR-U0-OVERLAY"),
  ], async (observations) => {
    await page.locator("#stale-open-probe").click();
    await expect(page.getByRole("dialog", { name: "Stale owner" })).toHaveCount(0);
    await expect.poll(async () => (await entries(page)).some(
      (entry) => entry["componentId"] === "stale-owner-dialog" && entry["code"] === "ui.stale_owner",
    )).toBe(true);
    let ledger = await entries(page);
    const openRefusal = [...ledger].reverse().find((entry) => entry["componentId"] === "stale-owner-dialog" && entry["code"] === "ui.stale_owner");
    expect(openRefusal).toBeDefined();

    await page.locator("#dialog-trigger").click();
    await page.locator("#remove-trigger-and-close").click();
    await expect(page.locator("#workflow-fallback")).toBeFocused();
    await expect.poll(async () => (await entries(page)).some(
      (entry) => entry["componentId"] === "editing-dialog" && entry["code"] === "ui.stale_owner",
    )).toBe(true);
    ledger = await entries(page);
    const closeRefusal = [...ledger].reverse().find((entry) => entry["componentId"] === "editing-dialog" && entry["code"] === "ui.stale_owner");
    expect(closeRefusal).toBeDefined();
    observations["staleOwner"] = {
      closeRefusal,
      fallbackFocus: await page.locator(":focus").getAttribute("id"),
      openRefusal,
      preservedDocument: await page.locator("[data-authoritative-document]").getAttribute("data-authoritative-document"),
    };
  });
});

test("U0-OVR-007 U0-OVR-008 U0-OVR-012 U0-REF-001 arbitrate one modal, a nonmodal mobile descendant, and exact dismissal-depth bounds", async ({ browserName, page }, testInfo) => {
  await runOverlayEvidence(page, browserName, testInfo, "u0-overlay-limits-mobile-sheet", [
    u0Binding("U0-OVR-007", "TR-U0-OVERLAY"),
    u0Binding("U0-OVR-008", "TR-U0-OVERLAY"),
    u0Binding("U0-OVR-012", "TR-U0-OVERLAY"),
    u0Binding("U0-REF-001", "TR-U0-OVERLAY"),
  ], async (observations) => {
    await page.locator("#dialog-trigger").click();
    await page.locator("#sheet-trigger").click();
    const sheet = page.getByRole("complementary", { name: "Mobile details" });
    await expect(sheet, JSON.stringify(await entries(page))).toBeVisible();
    expect(await page.locator('[aria-modal="true"]').count()).toBe(1);
    await page.getByRole("button", { name: "Close mobile details" }).click();
    await expect(sheet).toHaveCount(0);

    await page.locator("#second-dialog-trigger").click();
    await expect(page.getByRole("dialog", { name: "Second modal" })).toHaveCount(0);
    await expect.poll(async () => (await entries(page)).some(
      (entry) => entry["componentId"] === "second-dialog" && entry["code"] === "ui.modal_scope_limit",
    )).toBe(true);
    let ledger = await entries(page);
    const modalRefusal = [...ledger].reverse().find((entry) => entry["componentId"] === "second-dialog" && entry["code"] === "ui.modal_scope_limit");
    expect(modalRefusal).toBeDefined();
    await page.getByRole("button", { name: "Close editing dialog" }).click();

    await page.locator("#limit-preflight").click();
    ledger = await entries(page);
    const limitProbe = [...ledger].reverse().find((entry) => entry["action"] === "limit-preflight");
    expect(limitProbe).toMatchObject({
      exactAncestorsAccepted: true,
      mobileSheetAsNonmodalDescendantAccepted: true,
      modalCode: "ui.modal_scope_limit",
      overflowCode: "ui.dismiss_depth_limit",
    });
    observations["limits"] = { limitProbe, modalRefusal, simultaneousModalCount: 1 };
  });
});

test("U0-OVR-011 gives the alert dialog a named consequence and least-destructive initial focus", async ({ browserName, page }, testInfo) => {
  await runOverlayEvidence(page, browserName, testInfo, "u0-overlay-alert-safe-default", [
    u0Binding("U0-OVR-011", "TR-U0-OVERLAY"),
  ], async (observations) => {
    const trigger = page.locator("#alert-trigger");
    await trigger.click();
    const alert = page.getByRole("alertdialog", { name: "Delete chart?" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Exported files remain preserved");
    await expect(page.locator("#alert-cancel")).toBeFocused();
    await expect(page.locator("#alert-confirm")).not.toBeFocused();
    await page.locator("#alert-cancel").click();
    await expect(alert).toHaveCount(0);
    await expect(trigger).toBeFocused();
    observations["alertDialog"] = {
      consequenceNamed: true,
      initialFocus: "alert-cancel",
      preservationNamed: true,
      triggerRestored: true,
    };
  });
});

test("U0-REF-002 keeps visible Close and Cancel affordances on every rendered dismissible dialog", async ({ browserName, page }, testInfo) => {
  await runOverlayEvidence(page, browserName, testInfo, "u0-overlay-visible-dismiss-affordances", [
    u0Binding("U0-REF-002", "TR-U0-OVERLAY"),
  ], async (observations) => {
    await page.locator("#invalid-dismissibility-probe").click();
    const refusal = [...await entries(page)].reverse().find((entry) => entry["action"] === "invalid-dismissibility-refusal");
    expect(refusal).toMatchObject({ code: "ui.description_invalid", path: ["closeLabel"] });
    await page.locator("#dialog-trigger").click();
    const dialog = page.getByRole("dialog", { name: "Edit chord" });
    const close = dialog.getByRole("button", { name: "Close editing dialog" });
    const cancel = dialog.getByRole("button", { name: "Cancel changes" });
    await expect(close).toBeVisible();
    await expect(cancel).toBeVisible();
    await expect(close).toBeEnabled();
    await expect(cancel).toBeEnabled();
    observations["negativeBoundary"] = {
      claim: "The typed production Dialog always materializes a visible named Close; this composed workflow additionally requires and renders Cancel.",
      malformedExpectedRefusal: "ui.description_invalid",
      malformedObservedRefusal: refusal,
      renderedCancelCount: await cancel.count(),
      renderedCloseCount: await close.count(),
    };
  });
});
