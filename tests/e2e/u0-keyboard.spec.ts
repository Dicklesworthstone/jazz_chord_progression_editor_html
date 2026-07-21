import { expect, test, type Locator } from "@playwright/test";

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
  u0Binding("U0-CANCEL-002", "TR-U0-KEYBOARD"),
  u0Binding("U0-CANCEL-005", "TR-U0-KEYBOARD"),
  u0Binding("U0-ENV-004", "TR-U0-KEYBOARD"),
  u0Binding("U0-PRIM-005", "TR-U0-KEYBOARD"),
  u0Binding("U0-PRIM-006", "TR-U0-KEYBOARD"),
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

test.use({ hasTouch: true });

async function ledger(locator: Locator): Promise<Array<Record<string, unknown>>> {
  return JSON.parse(await locator.innerText()) as Array<Record<string, unknown>>;
}

test.beforeAll(async () => {
  artifact = await createU0ArtifactServer();
  harness = await createU0BrowserHarness({
    entry: "tests/e2e/u0-interaction-harness.tsx",
    rootId: "u0-interaction-root",
    stylePaths,
    title: "U0 keyboard interaction harness",
  });
});

test.afterAll(async () => {
  await harness.close();
  await artifact.close();
});

test("U0-CANCEL-002 U0-CANCEL-005 U0-ENV-004 U0-PRIM-005 U0-PRIM-006 execute native, roving, typeahead, nontrap, and cancellation keyboard paths", async ({ browserName, page }, testInfo) => {
  test.setTimeout(300_000);
  const diagnostics = captureU0PageDiagnostics(page);
  const observations: Record<string, unknown> = {};
  let failure: string | null = null;

  try {
    expect(testInfo.retry).toBe(0);
    await openU0BrowserHarness(page, harness, {
      readySelector: '[data-u0-harness-ready="keyboard"]',
      scenario: "keyboard",
      viewport,
    });
    const eventLedger = page.locator("#u0-event-ledger");

    const harmonyTab = page.getByRole("tab", { name: "Harmony" });
    const rhythmTab = page.getByRole("tab", { name: "Rhythm" });
    await harmonyTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(rhythmTab).toBeFocused();
    await expect(harmonyTab).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(rhythmTab).toHaveAttribute("aria-selected", "true");

    await page.locator("#toolbar-cut").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#toolbar-paste")).toBeFocused();

    const majorOption = page.getByRole("option", { name: "Major" });
    await majorOption.focus();
    await page.keyboard.press("m");
    const mixolydianOption = page.getByRole("option", { name: "Mixolydian" });
    await expect(mixolydianOption).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(mixolydianOption).toHaveAttribute("aria-selected", "true");

    await page.locator("#keyboard-menu-trigger").click();
    await expect(page.getByRole("menu", { name: "Keyboard menu" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Alpha voicing" })).toBeFocused();
    await page.keyboard.press("c");
    await expect(page.getByRole("menuitem", { name: "Charlie voicing" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("menu", { name: "Keyboard menu" })).toHaveCount(0);
    const focusAfterMenuTab = await page.locator(":focus").getAttribute("id");
    expect(focusAfterMenuTab).not.toBe("keyboard-menu-trigger");

    await page.locator("#accordion-one").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#accordion-three")).toBeFocused();

    const dominantFamily = page.getByRole("treeitem", { name: "Dominant family" });
    await dominantFamily.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("treeitem", { name: "Altered dominant" })).toBeFocused();
    await page.keyboard.press("l");
    await expect(page.getByRole("treeitem", { name: "Lydian dominant" })).toBeFocused();

    const timelineItems = page.locator("#keyboard-timeline > ol > li > button");
    await timelineItems.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(timelineItems.nth(1)).toBeFocused();

    const slider = page.getByRole("slider", { name: "Swing amount" });
    await slider.focus();
    await page.keyboard.down("ArrowRight");
    await expect(slider).not.toHaveValue("40");
    await page.keyboard.press("Escape");
    await page.keyboard.up("ArrowRight");
    await expect(slider).toHaveValue("40");
    const escapeLedger = await ledger(eventLedger);
    const escapeCancel = [...escapeLedger].reverse().find((entry) => entry["componentId"] === "keyboard-slider" && entry["phase"] === "cancel");
    expect(escapeCancel?.["source"]).toBe("keyboard");
    expect(escapeCancel?.["value"]).toBe(40);

    await slider.focus();
    await page.keyboard.down("ArrowRight");
    await page.keyboard.press("F8");
    await page.keyboard.up("ArrowRight");
    await expect(page.locator('[data-slider-unmounted="true"]')).toBeVisible();
    const unmountLedger = await ledger(eventLedger);
    const unmountCancel = [...unmountLedger].reverse().find((entry) => entry["componentId"] === "keyboard-slider" && entry["phase"] === "cancel");
    expect(unmountCancel?.["source"]).toBe("programmatic");
    expect(unmountCancel?.["value"]).toBe(40);

    const separator = page.getByRole("separator", { name: "Resize adjacent panels" });
    const separatorBox = await separator.boundingBox();
    expect(separatorBox).not.toBeNull();
    if (separatorBox === null) throw new Error("U0_KEYBOARD_SEPARATOR_BOX_MISSING");
    const sizesBeforePointerCancel = (await ledger(eventLedger)).filter((entry) => entry["componentId"] === "keyboard-panels" && entry["phase"] === "commit").length;
    await page.mouse.move(separatorBox.x + separatorBox.width / 2, separatorBox.y + separatorBox.height / 2);
    await page.mouse.down();
    await separator.dispatchEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" });
    await page.mouse.up();
    const sizesAfterPointerCancel = (await ledger(eventLedger)).filter((entry) => entry["componentId"] === "keyboard-panels" && entry["phase"] === "commit").length;
    expect(sizesAfterPointerCancel).toBe(sizesBeforePointerCancel);
    expect(await separator.evaluate((element) => element.hasPointerCapture(1))).toBe(false);

    await expect(page.locator("#keyboard-panels input[type=number]")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Move earlier" })).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Move later" })).toHaveCount(3);
    const targetBox = await page.locator("#keyboard-menu-trigger").boundingBox();
    expect(targetBox).not.toBeNull();
    expect(targetBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    observations["interactionSummary"] = {
      eventCount: (await ledger(eventLedger)).length,
      focusAfterMenuTab,
      pointerCaptureReleased: true,
      resizableCommitCountAfterCancel: sizesAfterPointerCancel,
      sliderEscapeCancel: escapeCancel,
      sliderUnmountCancel: unmountCancel,
      targetBox,
    };
    observations["claimBoundary"] = {
      automated: "Three-engine DOM keyboard, focus, cancellation, and pointer-capture observation.",
      manualDeviceEvidence: "Q0 coarse-pointer device and assistive-technology confirmation pending.",
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
      cellId: "u0-keyboard-roving-cancellation",
      diagnostics,
      environment: { coarsePointerClaim: "manual-pending", scenario: "compiled-production-primitives" },
      error: failure,
      observations,
      outcome: failure === null ? "pass" : "fail",
      page,
      testInfo,
      viewport,
    });
  }
});
