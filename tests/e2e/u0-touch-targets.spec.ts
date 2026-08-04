import { expect, test, type Locator, type Page } from "@playwright/test";

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
} from "./u0-browser-test-kit";

type TargetMeasurement = Readonly<{
  height: number;
  name: string;
  width: number;
}>;

type HitOwnership = Readonly<{
  centerOwned: boolean;
  height: number;
  name: string;
  width: number;
}>;

const stylePaths = [
  "src/styles/reset.css",
  "src/styles/tokens.css",
  "src/styles/primitives.css",
  "src/styles/ui-foundations.css",
  "src/styles/ui-forms.css",
  "src/styles/ui-structured.css",
] as const;

let artifact: U0ArtifactServer;
let harness: U0CompiledBrowserHarness;

test.beforeAll(async () => {
  [artifact, harness] = await Promise.all([
    createU0ArtifactServer(),
    createU0BrowserHarness({
      entry: "tests/e2e/u0-target-size-harness.ts",
      rootId: "u0-target-size-root",
      stylePaths,
      title: "U0 target-size evidence",
    }),
  ]);
});

test.afterAll(async () => {
  await Promise.all([artifact.close(), harness.close()]);
});

function target(page: Page, probe: string, selector: string): Locator {
  return page.locator(`[data-target-probe="${probe}"]`).locator(selector).first();
}

function primitiveTargets(page: Page): readonly (readonly [string, Locator])[] {
  return [
    ["primary Button", target(page, "primary-button", ".ui-button")],
    ["default Button", target(page, "default-button", ".ui-button")],
    ["IconButton", target(page, "icon-button", ".ui-icon-button")],
    ["Disclosure", target(page, "disclosure", ".ui-disclosure__trigger")],
    ["LinkButton", target(page, "link-button", ".ui-link-button")],
    ["Input", target(page, "input", ".ui-input")],
    ["Textarea", target(page, "textarea", ".ui-form-control")],
    ["Listbox option", target(page, "listbox", ".ui-option")],
    ["Checkbox", target(page, "checkbox", ".ui-check-control")],
    ["Radio", target(page, "radio", ".ui-radio-option")],
    ["Switch", target(page, "switch", ".ui-switch")],
    ["Slider", target(page, "slider", ".ui-slider__input")],
    ["Toggle", target(page, "toggle", ".ui-toggle")],
    ["DataTable sort", target(page, "table", ".ui-data-table__sort")],
    ["Tree item", target(page, "tree", ".ui-tree__item")],
    ["Tree expansion", target(page, "tree", ".ui-tree__marker")],
    ["Resizable collapse", target(page, "panels", ".ui-resizable-panels__panel button")],
    ["Resizable numeric", target(page, "panels", ".ui-resizable-panels__numeric input")],
    ["Resizable separator", target(page, "panels", ".ui-resizable-panels__separator")],
    ["Timeline primary", target(page, "timeline", ".ui-timeline-lane__item > button")],
    ["Timeline alternative", target(page, "timeline", 'button[aria-label="Move later"]')],
  ] as const;
}

async function measureTargets(
  targets: readonly (readonly [string, Locator])[],
): Promise<readonly TargetMeasurement[]> {
  const measurements: TargetMeasurement[] = [];
  for (const [name, locator] of targets) {
    const box = await locator.boundingBox();
    expect(box, `${name} must render`).not.toBeNull();
    if (box !== null) measurements.push({ height: box.height, name, width: box.width });
  }
  return measurements;
}

async function proveCenterOwnership(
  targets: readonly (readonly [string, Locator])[],
): Promise<readonly HitOwnership[]> {
  const results: HitOwnership[] = [];
  for (const [name, locator] of targets) {
    await locator.scrollIntoViewIfNeeded();
    results.push(await locator.evaluate((element, targetName) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return {
        centerOwned: hit !== null && (hit === element || element.contains(hit)),
        height: box.height,
        name: targetName,
        width: box.width,
      };
    }, name));
  }
  return results;
}

async function nonNestedOverlaps(page: Page, selector: string) {
  return page.evaluate((targetSelector) => {
    /**
     * A control scrolled outside a clipping ancestor cannot be pressed at that
     * position, so overlap is measured against the visible rectangle rather
     * than the raw layout box. Without this, any scrollable region would
     * report a false overlap as soon as its content grew past one screen.
     */
    const visibleRect = (element: HTMLElement): DOMRect => {
      let rect = element.getBoundingClientRect();
      let ancestor = element.parentElement;
      while (ancestor !== null) {
        const style = getComputedStyle(ancestor);
        const clips = ["auto", "scroll", "hidden", "clip"].some(
          (value) =>
            style.overflowX === value || style.overflowY === value,
        );
        if (clips) {
          const bounds = ancestor.getBoundingClientRect();
          const left = Math.max(rect.left, bounds.left);
          const top = Math.max(rect.top, bounds.top);
          const right = Math.min(rect.right, bounds.right);
          const bottom = Math.min(rect.bottom, bounds.bottom);
          rect = new DOMRect(
            left,
            top,
            Math.max(0, right - left),
            Math.max(0, bottom - top),
          );
        }
        ancestor = ancestor.parentElement;
      }
      return rect;
    };
    const targets = Array.from(document.querySelectorAll<HTMLElement>(targetSelector))
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = visibleRect(element);
        return style.display !== "none" && style.visibility !== "hidden" &&
          box.width > 0 && box.height > 0;
      });
    const overlaps: Array<Readonly<{ first: string; second: string }>> = [];
    for (let firstIndex = 0; firstIndex < targets.length; firstIndex += 1) {
      const first = targets[firstIndex];
      if (first === undefined) continue;
      const firstBox = visibleRect(first);
      for (let secondIndex = firstIndex + 1; secondIndex < targets.length; secondIndex += 1) {
        const second = targets[secondIndex];
        if (second === undefined || first.contains(second) || second.contains(first)) continue;
        const secondBox = visibleRect(second);
        const overlapsInline = Math.min(firstBox.right, secondBox.right) -
          Math.max(firstBox.left, secondBox.left);
        const overlapsBlock = Math.min(firstBox.bottom, secondBox.bottom) -
          Math.max(firstBox.top, secondBox.top);
        if (overlapsInline > 0.5 && overlapsBlock > 0.5) {
          overlaps.push({
            first: first.id || first.getAttribute("aria-label") || first.tagName,
            second: second.id || second.getAttribute("aria-label") || second.tagName,
          });
        }
      }
    }
    return overlaps;
  }, selector);
}

test("U0-ENV-004 U0-PRIM-015 U0-PRIM-016 enforces 24 and 44 CSS px target policies with complete alternatives", async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(300_000);
  const viewport = { width: 1280, height: 900 } as const;
  const defaultContext = await browser.newContext({ viewport });
  const coarseContext = await browser.newContext({ hasTouch: true, viewport });
  const defaultPage = await defaultContext.newPage();
  const coarseHarnessPage = await coarseContext.newPage();
  const artifactPage = await coarseContext.newPage();
  const diagnostics = captureU0PageDiagnostics(artifactPage);
  const defaultHarnessDiagnostics = captureU0PageDiagnostics(defaultPage);
  const coarseHarnessDiagnostics = captureU0PageDiagnostics(coarseHarnessPage);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
  try {
    expect(testInfo.retry).toBe(0);
    await openU0BrowserHarness(defaultPage, harness, {
      readySelector: '[data-target-size-ready="true"]',
      scenario: "default-targets",
      viewport,
    });
    await defaultPage.addStyleTag({
      content: '[data-target-probe] { margin-block: 8px; max-inline-size: 640px; }',
    });
    const defaultMeasurements = await measureTargets(primitiveTargets(defaultPage));
    for (const measurement of defaultMeasurements) {
      const floor = measurement.name === "primary Button" ? 44 : 24;
      expect(measurement.width, `${measurement.name} default width`).toBeGreaterThanOrEqual(floor);
      expect(measurement.height, `${measurement.name} default height`).toBeGreaterThanOrEqual(floor);
    }
    const defaultPrimary = defaultMeasurements.find((item) => item.name === "primary Button");
    expect(defaultPrimary?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(defaultPrimary?.height ?? 0).toBeGreaterThanOrEqual(44);

    await openU0BrowserHarness(coarseHarnessPage, harness, {
      readySelector: '[data-target-size-ready="true"]',
      scenario: "coarse-targets",
      viewport,
    });
    await coarseHarnessPage.addStyleTag({
      content: '[data-target-probe] { margin-block: 8px; max-inline-size: 640px; }',
    });
    expect(
      await coarseHarnessPage.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);
    const coarseMeasurements = await measureTargets(primitiveTargets(coarseHarnessPage));
    for (const measurement of coarseMeasurements) {
      expect(measurement.width, `${measurement.name} coarse width`).toBeGreaterThanOrEqual(44);
      expect(measurement.height, `${measurement.name} coarse height`).toBeGreaterThanOrEqual(44);
    }
    const separatorGrip = await target(
      coarseHarnessPage,
      "panels",
      ".ui-resizable-panels__separator",
    ).evaluate((element) => getComputedStyle(element, "::before").width);
    expect(separatorGrip).toBe("8px");
    await expect(target(coarseHarnessPage, "panels", ".ui-resizable-panels__numeric input")).toBeVisible();
    await expect(target(coarseHarnessPage, "timeline", 'button[aria-label="Move later"]')).toBeVisible();
    const primitiveHitOwnership = await proveCenterOwnership(
      primitiveTargets(coarseHarnessPage),
    );
    expect(
      primitiveHitOwnership.filter((item) => !item.centerOwned),
      "every primitive target center belongs to that target",
    ).toEqual([]);
    const primitiveNonNestedOverlaps = await nonNestedOverlaps(
      coarseHarnessPage,
      '[data-target-probe] button, [data-target-probe] input, [data-target-probe] textarea, [data-target-probe] select, [data-target-probe] a[href], [data-target-probe] [role="option"], [data-target-probe] [role="treeitem"], [data-target-probe] [role="separator"], [data-target-probe] [data-tree-expansion-control]',
    );
    expect(primitiveNonNestedOverlaps).toEqual([]);

    await openU0Artifact(artifactPage, artifact, viewport);
    expect(await artifactPage.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const applicationTargets = await artifactPage.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.studio-shell button, .studio-shell input, .studio-shell select, .studio-shell textarea, .studio-shell a[href]',
        ),
      ).filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" &&
          box.bottom > 0 && box.right > 0 && box.left < window.innerWidth &&
          box.top < window.innerHeight;
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
    for (const applicationTarget of applicationTargets) {
      expect(applicationTarget.width, `${applicationTarget.id} coarse width`).toBeGreaterThanOrEqual(44);
      expect(applicationTarget.height, `${applicationTarget.id} coarse height`).toBeGreaterThanOrEqual(44);
    }
    /*
     * The ownership law hunts covered or overlapping controls, not content
     * that has scrolled beneath the sticky transport bar: the seeded first-
     * open chart (jcpe-b20t) makes the page taller than one viewport, so
     * each target is measured in its scrolled-into-view position. A center
     * that still resolves to another element there is a genuine defect.
     */
    const applicationHitOwnership = await artifactPage.evaluate(() => {
      const measurements = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.studio-shell button, .studio-shell input, .studio-shell select, .studio-shell textarea, .studio-shell a[href]',
        ),
      ).filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" &&
          box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 &&
          box.left < window.innerWidth && box.top < window.innerHeight;
      }).map((element) => {
        element.scrollIntoView({ block: "center", inline: "nearest" });
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          centerOwned: hit !== null && (hit === element || element.contains(hit)),
          id: element.id,
        };
      });
      window.scrollTo(0, 0);
      return measurements;
    });
    expect(
      applicationHitOwnership.filter((item) => !item.centerOwned),
      "every application target center belongs to that target",
    ).toEqual([]);
    const applicationNonNestedOverlaps = await nonNestedOverlaps(
      artifactPage,
      '.studio-shell button, .studio-shell input, .studio-shell select, .studio-shell textarea, .studio-shell a[href]',
    );
    expect(applicationNonNestedOverlaps).toEqual([]);
    observations = {
      applicationHitOwnership,
      applicationNonNestedOverlaps,
      applicationTargets,
      coarseHarnessDiagnostics,
      coarseMeasurements,
      defaultHarnessDiagnostics,
      defaultMeasurements,
      harness: {
        bytes: harness.bundleBytes,
        sha256: harness.bundleSha256,
      },
      projectNearMissPolicy:
        "A primary target measuring only the external 24px floor is absent; the rendered primary specimen is asserted at the stricter 44px project floor.",
      primitiveHitOwnership,
      primitiveNonNestedOverlaps,
      nestedCompositePolicy:
        "Nested Tree expansion marker geometry is excluded from pairwise rectangle rejection because the outer treeitem reserves the marker subtree; stopPropagation and separate center-hit ownership prove deterministic expand versus activate routing.",
      separatorGrip,
    };
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.requests).toHaveLength(1);
    expect(defaultHarnessDiagnostics.consoleErrors).toEqual([]);
    expect(defaultHarnessDiagnostics.pageErrors).toEqual([]);
    expect(coarseHarnessDiagnostics.consoleErrors).toEqual([]);
    expect(coarseHarnessDiagnostics.pageErrors).toEqual([]);
    screenshots.push(
      await captureU0Screenshot(artifactPage, testInfo, `U0-ENV-004-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeU0EvidenceCell({
      artifact,
      bindings: [
        u0Binding("U0-ENV-004", "TR-U0-TOUCH"),
        u0Binding("U0-PRIM-015", "TR-U0-TOUCH"),
        u0Binding("U0-PRIM-016", "TR-U0-TOUCH"),
      ],
      browserName,
      cellId: "U0-ENV-004-touch-targets",
      diagnostics,
      environment: { coarsePointer: true, hasTouch: true, hover: false },
      error,
      observations,
      outcome: error === null ? "pass" : "fail",
      page: artifactPage,
      screenshots,
      testInfo,
      viewport,
    });
    await Promise.all([defaultContext.close(), coarseContext.close()]);
  }
});
