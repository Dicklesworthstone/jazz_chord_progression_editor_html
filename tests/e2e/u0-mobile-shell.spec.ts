import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  captureU0PageDiagnostics,
  captureU0Screenshot,
  createU0ArtifactServer,
  createU0BrowserHarness,
  evidenceError,
  openU0Artifact,
  openU0BrowserHarness,
  u0Binding,
  writeU0EvidenceCell,
  type U0ArtifactServer,
  type U0CompiledBrowserHarness,
  type U0TraceBinding,
  type U0Viewport,
} from "./u0-browser-test-kit";

const interactionStylePaths = [
  "src/styles/reset.css",
  "src/styles/tokens.css",
  "src/styles/primitives.css",
  "src/styles/ui-foundations.css",
  "src/styles/ui-forms.css",
  "src/styles/ui-navigation.css",
  "src/styles/ui-structured.css",
  "src/styles/ui-overlays.css",
] as const;

type MobileObservation = Readonly<{
  chart: Readonly<{ left: number; right: number; width: number }>;
  closeTarget: Readonly<{ bottom: number; height: number; left: number; right: number; top: number; width: number }>;
  contextRevealPx: number;
  dialogCount: number;
  sheet: Readonly<{ bottom: number; height: number; left: number; right: number; top: number; width: number }>;
  transport: Readonly<{ bottom: number; height: number; left: number; right: number; top: number; width: number }>;
}>;

async function observeOpenSheet(page: Page, name: "Harmony Lens" | "Library"): Promise<MobileObservation> {
  return page.evaluate((sheetName) => {
    const chart = document.querySelector("#chart-workspace");
    const transport = document.querySelector("#transport-bar");
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
    const sheet = dialogs.find((candidate) => {
      const labelledBy = candidate.getAttribute("aria-labelledby");
      return labelledBy !== null &&
        document.getElementById(labelledBy)?.textContent.trim() === sheetName;
    });
    const close = sheet?.querySelector<HTMLElement>("button");
    if (!(chart instanceof HTMLElement) || !(transport instanceof HTMLElement) ||
        sheet === undefined || close === null || close === undefined) {
      throw new Error("U0_MOBILE_SHEET_OBSERVATION_MISSING");
    }
    const jsonRect = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      return {
        bottom: box.bottom,
        height: box.height,
        left: box.left,
        right: box.right,
        top: box.top,
        width: box.width,
      };
    };
    const chartRect = chart.getBoundingClientRect();
    const sheetRect = jsonRect(sheet);
    return {
      chart: { left: chartRect.left, right: chartRect.right, width: chartRect.width },
      closeTarget: jsonRect(close),
      contextRevealPx: sheetName === "Library"
        ? Math.max(0, window.innerWidth - sheetRect.right)
        : Math.max(0, sheetRect.top),
      dialogCount: dialogs.length,
      sheet: sheetRect,
      transport: jsonRect(transport),
    };
  }, name);
}

async function writeCell(
  page: Page,
  testInfo: TestInfo,
  artifact: U0ArtifactServer,
  browserName: string,
  input: Readonly<{
    bindings: readonly U0TraceBinding[];
    cellId: string;
    diagnostics: ReturnType<typeof captureU0PageDiagnostics>;
    environment: Readonly<Record<string, boolean | number | string | null>>;
    error: string | null;
    observations: Readonly<Record<string, unknown>>;
    screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[];
    viewport: U0Viewport;
  }>,
): Promise<void> {
  await writeU0EvidenceCell({
    artifact,
    bindings: input.bindings,
    browserName,
    cellId: input.cellId,
    diagnostics: input.diagnostics,
    environment: input.environment,
    error: input.error,
    observations: input.observations,
    outcome: input.error === null ? "pass" : "fail",
    page,
    screenshots: input.screenshots,
    testInfo,
    viewport: input.viewport,
  });
}

let artifact: U0ArtifactServer;
let interactionHarness: U0CompiledBrowserHarness;

test.beforeAll(async () => {
  [artifact, interactionHarness] = await Promise.all([
    createU0ArtifactServer(),
    createU0BrowserHarness({
      entry: "tests/e2e/u0-interaction-harness.tsx",
      rootId: "u0-interaction-root",
      stylePaths: interactionStylePaths,
      title: "U0 mobile interaction evidence",
    }),
  ]);
});

test.afterAll(async () => {
  await Promise.all([artifact.close(), interactionHarness.close()]);
});

for (const mobileCase of [
  {
    id: "U0-VIEW-001",
    viewport: { width: 320, height: 568 },
    bindings: [
      u0Binding("U0-VIEW-001", "TR-U0-MOBILE"),
      u0Binding("U0-REF-009", "TR-U0-MOBILE"),
    ],
  },
  {
    id: "U0-VIEW-002",
    viewport: { width: 390, height: 844 },
    bindings: [
      u0Binding("U0-VIEW-002", "TR-U0-MOBILE"),
      u0Binding("U0-REF-009", "TR-U0-MOBILE"),
    ],
  },
] as const) {
  test(`${mobileCase.id} U0-REF-009 sheets retain chart context and never obscure transport`, async ({
    browserName,
    page,
  }, testInfo) => {
    const diagnostics = captureU0PageDiagnostics(page);
    let error: string | null = null;
    let observations: Readonly<Record<string, unknown>> = {};
    const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
    try {
      expect(testInfo.retry).toBe(0);
      await openU0Artifact(page, artifact, mobileCase.viewport);
      const title = page.getByRole("textbox", { name: "Chart title" });
      await title.focus();
      await title.fill("Keyboard-only mobile draft");
      await expect(title).toHaveValue("Keyboard-only mobile draft");
      await expect(page.getByText("Revision 0", { exact: true })).toBeVisible();

      const observationsBySheet: Record<string, MobileObservation> = {};
      for (const name of ["Library", "Harmony Lens"] as const) {
        const trigger = page.getByRole("button", { exact: true, name });
        await expect(trigger).toBeVisible();
        await trigger.click();
        const sheet = page.getByRole("dialog", { name });
        await expect(sheet).toBeVisible();
        await expect(sheet).toHaveAttribute("aria-modal", "true");
        const observed = await observeOpenSheet(page, name);
        observationsBySheet[name] = observed;
        expect(observed.dialogCount).toBe(1);
        expect(observed.contextRevealPx).toBeGreaterThanOrEqual(48);
        expect(observed.sheet.bottom).toBeLessThanOrEqual(observed.transport.top + 1);
        expect(observed.closeTarget.width).toBeGreaterThanOrEqual(24);
        expect(observed.closeTarget.height).toBeGreaterThanOrEqual(24);
        await page.getByRole("button", { name: `Close ${name}` }).click();
        await expect(sheet).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
      observations = { observationsBySheet };
      expect(diagnostics.consoleErrors).toEqual([]);
      expect(diagnostics.pageErrors).toEqual([]);
      expect(diagnostics.requests).toHaveLength(1);
      screenshots.push(
        await captureU0Screenshot(page, testInfo, `${mobileCase.id}-${browserName}-closed`),
      );
    } catch (caught) {
      error = evidenceError(caught);
      throw caught;
    } finally {
      await writeCell(page, testInfo, artifact, browserName, {
        bindings: mobileCase.bindings,
        cellId: `${mobileCase.id}-mobile-shell`,
        diagnostics,
        environment: { coarsePointer: false, safeAreaOverride: false },
        error,
        observations,
        screenshots,
        viewport: mobileCase.viewport,
      });
    }
  });
}

test("U0-ENV-004 coarse-pointer mobile keeps primary actions at 44 CSS px and exposes complete non-drag alternatives", async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(300_000);
  const viewport = { width: 390, height: 844 } as const;
  const context = await browser.newContext({ hasTouch: true, viewport });
  const page = await context.newPage();
  const harnessPage = await context.newPage();
  const diagnostics = captureU0PageDiagnostics(page);
  const harnessDiagnostics = captureU0PageDiagnostics(harnessPage);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
  try {
    expect(testInfo.retry).toBe(0);
    await openU0Artifact(page, artifact, viewport);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const primaryTargets = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(
        "#studio-apply-title, #studio-reset-title, #studio-open-library-sheet, #studio-open-harmony-sheet, #transport-bar button",
      )).filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" &&
          box.width > 0 && box.height > 0;
      }).map((element) => {
        const box = element.getBoundingClientRect();
        return {
          height: box.height,
          id: element.id,
          name: element.getAttribute("aria-label") ?? element.textContent.trim(),
          width: box.width,
        };
      }),
    );
    expect(primaryTargets.length).toBeGreaterThanOrEqual(10);
    for (const target of primaryTargets) {
      expect(target.width, `${target.id || target.name} coarse width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.id || target.name} coarse height`).toBeGreaterThanOrEqual(44);
    }

    await openU0BrowserHarness(harnessPage, interactionHarness, {
      readySelector: '[data-u0-harness-ready="keyboard"]',
      scenario: "keyboard",
      viewport,
    });
    const alternativeLocators = [
      harnessPage.locator(".ui-resizable-panels__numeric input").first(),
      harnessPage.getByRole("button", { name: "Move later" }).first(),
    ] as const;
    const alternatives: Array<Readonly<{ height: number; name: string; width: number }>> = [];
    for (const locator of alternativeLocators) {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      alternatives.push({
        height: box?.height ?? 0,
        name: await locator.getAttribute("aria-label") ?? "numeric resize control",
        width: box?.width ?? 0,
      });
    }
    for (const alternative of alternatives) {
      expect(alternative.width, `${alternative.name} coarse width`).toBeGreaterThanOrEqual(44);
      expect(alternative.height, `${alternative.name} coarse height`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator('[draggable="true"]').count()).toBe(0);
    observations = {
      alternatives,
      compiledHarness: {
        bytes: interactionHarness.bundleBytes,
        sha256: interactionHarness.bundleSha256,
      },
      harnessDiagnostics,
      primaryTargets,
    };
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.requests).toHaveLength(1);
    expect(harnessDiagnostics.consoleErrors).toEqual([]);
    expect(harnessDiagnostics.pageErrors).toEqual([]);
    screenshots.push(
      await captureU0Screenshot(page, testInfo, `U0-ENV-004-mobile-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeCell(page, testInfo, artifact, browserName, {
      bindings: [u0Binding("U0-ENV-004", "TR-U0-MOBILE")],
      cellId: "U0-ENV-004-mobile-coarse-pointer",
      diagnostics,
      environment: { coarsePointer: true, hasTouch: true, hover: false },
      error,
      observations,
      screenshots,
      viewport,
    });
    await context.close();
  }
});

test("U0-OVR-008 mobile sheet opened from an active dialog remains a named nonmodal descendant with one modal scope", async ({
  browserName,
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const viewport = { width: 390, height: 844 } as const;
  const diagnostics = captureU0PageDiagnostics(page);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  try {
    expect(testInfo.retry).toBe(0);
    await openU0BrowserHarness(page, interactionHarness, {
      readySelector: '[data-u0-harness-ready="overlays"]',
      scenario: "overlays",
      viewport,
    });
    await page.locator("#dialog-trigger").click();
    await page.locator("#sheet-trigger").click();
    const dialog = page.getByRole("dialog", { name: "Edit chord" });
    const sheet = page.getByRole("complementary", { name: "Mobile details" });
    const close = page.getByRole("button", { name: "Close mobile details" });
    await expect(dialog).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(close).toBeVisible();
    expect(await page.locator('[aria-modal="true"]').count()).toBe(1);
    const closeBox = await close.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(24);
    expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(24);
    await close.click();
    await expect(sheet).toHaveCount(0);
    await expect(dialog).toBeVisible();
    observations = {
      closeBox,
      compiledHarness: {
        bytes: interactionHarness.bundleBytes,
        sha256: interactionHarness.bundleSha256,
      },
      modalCount: 1,
      policy: "The mobile sheet is a named nonmodal descendant of the one active modal dialog.",
    };
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeCell(page, testInfo, artifact, browserName, {
      bindings: [u0Binding("U0-OVR-008", "TR-U0-MOBILE")],
      cellId: "U0-OVR-008-mobile-modal-arbitration",
      diagnostics,
      environment: { mobileViewport: true, nestedSheetMode: "nonmodal" },
      error,
      observations,
      screenshots: [],
      viewport,
    });
  }
});

test("U0-ENV-005 nonzero safe-area insets keep header sheet and transport controls reachable", async ({
  browserName,
  page,
}, testInfo) => {
  const viewport = { width: 390, height: 844 } as const;
  const diagnostics = captureU0PageDiagnostics(page);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
  let cdpApplied = false;
  try {
    expect(testInfo.retry).toBe(0);
    if (browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { bottom: 23, left: 13, right: 17, top: 31 },
      });
      cdpApplied = true;
    }
    await openU0Artifact(page, artifact, viewport);
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
    const headerPaddingTop = await page.locator(".studio-header").evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).paddingTop),
    );
    const transportPaddingBottom = await page.locator("#transport-bar").evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).paddingBottom),
    );
    await page.getByRole("button", { exact: true, name: "Library" }).click();
    const sheetHeader = page.locator(".ui-sheet__header");
    const sheetPaddingTop = await sheetHeader.evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).paddingTop),
    );
    const closeBox = await page.getByRole("button", { name: "Close Library" }).boundingBox();
    observations = {
      cdpApplied,
      closeBox,
      headerPaddingTop,
      sheetPaddingTop,
      transportPaddingBottom,
      viewportMeta,
      limitation: cdpApplied
        ? null
        : "Playwright exposes no safe-area override for this engine; source declarations remain covered but nonzero runtime values are Chromium-only.",
    };
    expect(viewportMeta).toContain("viewport-fit=cover");
    if (cdpApplied) {
      expect(headerPaddingTop).toBeGreaterThanOrEqual(31);
      expect(sheetPaddingTop).toBeGreaterThanOrEqual(31);
      expect(transportPaddingBottom).toBeGreaterThanOrEqual(23);
    }
    expect(closeBox).not.toBeNull();
    expect(closeBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((closeBox?.x ?? Infinity) + (closeBox?.width ?? Infinity)).toBeLessThanOrEqual(viewport.width + 1);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    screenshots.push(
      await captureU0Screenshot(page, testInfo, `U0-ENV-005-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeCell(page, testInfo, artifact, browserName, {
      bindings: [u0Binding("U0-ENV-005", "TR-U0-MOBILE")],
      cellId: "U0-ENV-005-safe-area",
      diagnostics,
      environment: { cdpApplied, safeAreaBottom: 23, safeAreaLeft: 13, safeAreaRight: 17, safeAreaTop: 31 },
      error,
      observations,
      screenshots,
      viewport,
    });
  }
});

test("U0-ENV-006 virtual-keyboard viewport contraction preserves draft authority and operability", async ({
  browserName,
  page,
}, testInfo) => {
  const viewport = { width: 390, height: 844 } as const;
  const diagnostics = captureU0PageDiagnostics(page);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
  try {
    expect(testInfo.retry).toBe(0);
    await openU0Artifact(page, artifact, viewport);
    const title = page.getByRole("textbox", { name: "Chart title" });
    await title.fill("Uncommitted keyboard draft");
    await title.focus();
    await page.setViewportSize({ width: 390, height: 568 });
    await title.scrollIntoViewIfNeeded();
    const titleBox = await title.boundingBox();
    const transportBox = await page.locator("#transport-bar").boundingBox();
    await expect(title).toHaveValue("Uncommitted keyboard draft");
    await expect(page.getByText("Revision 0", { exact: true })).toBeVisible();
    await page.getByRole("button", { exact: true, name: "Library" }).click();
    const close = page.getByRole("button", { name: "Close Library" });
    await expect(close).toBeVisible();
    await close.click();
    await expect(title).toHaveValue("Uncommitted keyboard draft");
    observations = {
      contractedViewport: { height: 568, width: 390 },
      method: "focused-input plus real CSS viewport-height contraction; no OS virtual-keyboard API is available in Playwright",
      titleBox,
      transportBox,
    };
    expect(titleBox).not.toBeNull();
    expect(titleBox?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((titleBox?.y ?? Infinity) + (titleBox?.height ?? Infinity)).toBeLessThanOrEqual(568);
    expect(transportBox).not.toBeNull();
    expect((transportBox?.y ?? Infinity) + (transportBox?.height ?? Infinity)).toBeLessThanOrEqual(569);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    screenshots.push(
      await captureU0Screenshot(page, testInfo, `U0-ENV-006-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeCell(page, testInfo, artifact, browserName, {
      bindings: [u0Binding("U0-ENV-006", "TR-U0-MOBILE")],
      cellId: "U0-ENV-006-virtual-keyboard",
      diagnostics,
      environment: { contractedHeight: 568, initialHeight: 844, simulatedOsKeyboard: false },
      error,
      observations,
      screenshots,
      viewport,
    });
  }
});
