import { expect, test } from "@playwright/test";

import {
  captureU0PageDiagnostics,
  captureU0Screenshot,
  createU0ArtifactServer,
  evidenceError,
  openU0Artifact,
  u0Binding,
  writeU0EvidenceCell,
  type U0ArtifactServer,
} from "./u0-browser-test-kit";

let artifact: U0ArtifactServer;

test.beforeAll(async () => {
  artifact = await createU0ArtifactServer();
});

test.afterAll(async () => {
  await artifact.close();
});

test("U0-ENV-008 U0-VIEW-001 U0-REF-004 U0-REF-005 actual 320 CSS px reflows without device guesses or zoom blocking", async ({
  browserName,
  page,
}, testInfo) => {
  const viewport = { width: 320, height: 568 } as const;
  const diagnostics = captureU0PageDiagnostics(page);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
  try {
    expect(testInfo.retry).toBe(0);
    await openU0Artifact(page, artifact, { width: 1280, height: 800 });
    await page.locator(".studio-shell").evaluate((element) => {
      element.setAttribute("data-u0-reflow-identity", "retained");
    });
    await page.setViewportSize(viewport);
    await expect(page.locator(".studio-shell")).toHaveAttribute(
      "data-u0-reflow-identity",
      "retained",
    );
    await expect(page.locator("#library-rail")).toBeHidden();
    await expect(page.locator("#harmony-lens-rail")).toBeHidden();
    await expect(page.getByRole("button", { exact: true, name: "Library" })).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Harmony Lens" })).toBeVisible();

    const observed = await page.evaluate(() => {
      const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      const scriptText = Array.from(document.scripts, (script) => script.textContent).join("\n");
      const keyboard = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        key: "+",
      });
      const wheel = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -1,
      });
      window.dispatchEvent(keyboard);
      window.dispatchEvent(wheel);
      const transport = document.querySelector("#transport-bar")?.getBoundingClientRect();
      return {
        clientWidth: document.documentElement.clientWidth,
        hasNavigatorUserAgentLayoutGuess: /navigator\s*\.\s*userAgent/u.test(scriptText),
        hasScreenWidthLayoutGuess: /(?:window\s*\.\s*)?screen\s*\.\s*(?:avail)?width/u.test(scriptText),
        keyboardZoomPrevented: keyboard.defaultPrevented,
        scrollWidth: document.documentElement.scrollWidth,
        transportBottom: transport?.bottom ?? Number.POSITIVE_INFINITY,
        viewportHeight: window.innerHeight,
        viewportMeta: viewportMeta?.content ?? null,
        wheelZoomPrevented: wheel.defaultPrevented,
      };
    });
    observations = observed;
    expect(observed.clientWidth).toBe(320);
    expect(observed.scrollWidth).toBeLessThanOrEqual(320);
    expect(observed.transportBottom).toBeLessThanOrEqual(observed.viewportHeight + 1);
    expect(observed.hasNavigatorUserAgentLayoutGuess).toBe(false);
    expect(observed.hasScreenWidthLayoutGuess).toBe(false);
    expect(observed.viewportMeta).not.toContain("maximum-scale");
    expect(observed.viewportMeta).not.toContain("user-scalable=no");
    expect(observed.keyboardZoomPrevented).toBe(false);
    expect(observed.wheelZoomPrevented).toBe(false);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.requests).toHaveLength(1);
    screenshots.push(
      await captureU0Screenshot(page, testInfo, `U0-ENV-008-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeU0EvidenceCell({
      artifact,
      bindings: [
        u0Binding("U0-ENV-008", "TR-U0-REFLOW"),
        u0Binding("U0-VIEW-001", "TR-U0-REFLOW"),
        u0Binding("U0-REF-004", "TR-U0-REFLOW"),
        u0Binding("U0-REF-005", "TR-U0-REFLOW"),
      ],
      browserName,
      cellId: "U0-ENV-008-actual-320-reflow",
      diagnostics,
      environment: { actualCssViewport: true, browserZoomPercent: 100 },
      error,
      observations,
      outcome: error === null ? "pass" : "fail",
      page,
      screenshots,
      testInfo,
      viewport,
    });
  }
});

test("U0-ENV-001 separate 200-percent scale and effective CSS viewport evidence remains operable", async ({
  browserName,
  page,
}, testInfo) => {
  const viewport = { width: 1280, height: 800 } as const;
  const diagnostics = captureU0PageDiagnostics(page);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
  let pageScaleMethod = "not-available-for-engine";
  try {
    expect(testInfo.retry).toBe(0);
    await openU0Artifact(page, artifact, viewport);
    let scaleObservation: Readonly<Record<string, number | null>> = {};
    if (browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
      pageScaleMethod = "Chromium CDP Emulation.setPageScaleFactor";
      scaleObservation = await page.evaluate(() => ({
        devicePixelRatio: window.devicePixelRatio,
        innerWidth: window.innerWidth,
        visualScale: window.visualViewport?.scale ?? null,
        visualWidth: window.visualViewport?.width ?? null,
      }));
      expect(scaleObservation["visualScale"]).toBe(2);
      await session.send("Emulation.resetPageScaleFactor");
    }

    await page.setViewportSize({ width: 640, height: 400 });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    const effective = await page.evaluate(() => {
      const transport = document.querySelector("#transport-bar")?.getBoundingClientRect();
      const visible = (selector: string) => {
        const element = document.querySelector(selector);
        return element instanceof HTMLElement && getComputedStyle(element).display !== "none";
      };
      return {
        clientWidth: document.documentElement.clientWidth,
        harmonyRailVisible: visible("#harmony-lens-rail"),
        harmonyTriggerVisible: visible("#studio-open-harmony-sheet"),
        libraryRailVisible: visible("#library-rail"),
        libraryTriggerVisible: visible("#studio-open-library-sheet"),
        scrollWidth: document.documentElement.scrollWidth,
        transportBottom: transport?.bottom ?? Number.POSITIVE_INFINITY,
        viewportHeight: window.innerHeight,
      };
    });
    observations = {
      claimBoundary:
        "Playwright cannot drive browser-chrome page zoom. Chromium additionally records page scale; every engine proves the separate 640x400 effective CSS viewport expected from 1280x800 at 200 percent.",
      effectiveCssViewport: effective,
      pageScaleMethod,
      scaleObservation,
    };
    expect(effective.clientWidth).toBe(640);
    expect(effective.scrollWidth).toBeLessThanOrEqual(640);
    expect(effective.libraryRailVisible).toBe(false);
    expect(effective.libraryTriggerVisible).toBe(true);
    /* jcpe-v2r-shell-i9up: at 640 effective CSS px the v2 chord-detail rail
     * (threshold 820px) is a sheet; operability is its visible trigger. */
    expect(effective.harmonyRailVisible).toBe(false);
    expect(effective.harmonyTriggerVisible).toBe(true);
    expect(effective.transportBottom).toBeLessThanOrEqual(effective.viewportHeight + 1);
    await expect(page.getByRole("textbox", { name: "Chart title" })).toBeEditable();
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.requests).toHaveLength(1);
    screenshots.push(
      await captureU0Screenshot(page, testInfo, `U0-ENV-001-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeU0EvidenceCell({
      artifact,
      bindings: [
        u0Binding("U0-ENV-001", "TR-U0-REFLOW"),
      ],
      browserName,
      cellId: "U0-ENV-001-200-percent-zoom",
      diagnostics,
      environment: { effectiveCssHeight: 400, effectiveCssWidth: 640, pageScaleMethod },
      error,
      observations,
      outcome: error === null ? "pass" : "fail",
      page,
      screenshots,
      testInfo,
      viewport,
    });
  }
});
