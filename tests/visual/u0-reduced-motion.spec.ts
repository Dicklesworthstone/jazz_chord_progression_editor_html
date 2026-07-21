import { expect, test, type Page } from "@playwright/test";

import {
  captureU0PageDiagnostics,
  captureU0Screenshot,
  createU0ArtifactServer,
  createU0GalleryServer,
  evidenceError,
  openU0Artifact,
  u0Binding,
  writeU0EvidenceCell,
  type U0ArtifactServer,
  type U0GalleryServer,
} from "../e2e/u0-browser-test-kit";

type MotionViolation = Readonly<{
  animationDuration: string;
  animationIterationCount: string;
  animationName: string;
  element: string;
  pseudo: "" | "::after" | "::before";
  scrollBehavior: string;
  transitionDuration: string;
}>;

let artifact: U0ArtifactServer;
let gallery: U0GalleryServer;

test.beforeAll(async () => {
  [artifact, gallery] = await Promise.all([
    createU0ArtifactServer(),
    createU0GalleryServer(),
  ]);
});

test.afterAll(async () => {
  await Promise.all([artifact.close(), gallery.close()]);
});

async function motionViolations(page: Page, rootSelector: string): Promise<readonly MotionViolation[]> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!(root instanceof HTMLElement)) throw new Error("U0_REDUCED_MOTION_ROOT_MISSING");
    const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
    const durationIsNonzero = (duration: string) =>
      duration.split(",").some((part) => {
        const token = part.trim();
        const value = Number.parseFloat(token);
        return Number.isFinite(value) && value !== 0;
      });
    const violations: MotionViolation[] = [];
    for (const element of elements) {
      for (const pseudo of ["", "::before", "::after"] as const) {
        const style = getComputedStyle(element, pseudo || null);
        if (
          durationIsNonzero(style.animationDuration) ||
          durationIsNonzero(style.transitionDuration) ||
          style.scrollBehavior === "smooth"
        ) {
          violations.push({
            animationDuration: style.animationDuration,
            animationIterationCount: style.animationIterationCount,
            animationName: style.animationName,
            element: element.id || element.className || element.tagName,
            pseudo,
            scrollBehavior: style.scrollBehavior,
            transitionDuration: style.transitionDuration,
          });
        }
      }
    }
    return violations;
  }, rootSelector);
}

test("U0-ENV-003 U0-PRIM-014 reduced motion removes pulse shimmer transforms and smooth scrolling while interactions remain perceivable", async ({
  browserName,
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const viewport = { width: 390, height: 844 } as const;
  const diagnostics = captureU0PageDiagnostics(page);
  const galleryPage = await page.context().newPage();
  const galleryDiagnostics = captureU0PageDiagnostics(galleryPage);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
  try {
    expect(testInfo.retry).toBe(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await galleryPage.emulateMedia({ reducedMotion: "reduce" });
    await openU0Artifact(page, artifact, viewport);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    const artifactViolations = await motionViolations(page, ".studio-shell");
    expect(artifactViolations).toEqual([]);

    const libraryTrigger = page.getByRole("button", { exact: true, name: "Library" });
    await libraryTrigger.click();
    const sheet = page.getByRole("dialog", { name: "Library" });
    await expect(sheet).toBeVisible();
    const openTransform = await sheet.evaluate((element) => getComputedStyle(element).transform);
    const openAnimationName = await sheet.evaluate(
      (element) => getComputedStyle(element).animationName,
    );
    const sheetViolations = await motionViolations(page, ".ui-sheet-layer");
    expect(sheetViolations).toEqual([]);
    expect(openTransform).toBe("none");
    expect(openAnimationName).toBe("none");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(libraryTrigger).toBeFocused();

    await galleryPage.goto(gallery.url, { waitUntil: "load" });
    await expect(galleryPage.locator('[data-u0-component-gallery="u0-component-gallery"]')).toBeVisible();
    const selector = galleryPage.locator('[data-u0-test-control="cell-selector"]');
    const galleryCases = [
      ["U0-GAL-007-REDUCED-MOTION", ".ui-skeleton__line"],
      ["U0-GAL-008-REDUCED-MOTION", ".ui-spinner__glyph"],
      ["U0-GAL-040-REDUCED-MOTION", ".ui-tooltip"],
      ["U0-GAL-044-REDUCED-MOTION", ".ui-sheet"],
      ["U0-GAL-045-REDUCED-MOTION", ".ui-toast"],
    ] as const;
    const galleryResults: Record<
      string,
      Readonly<{
        animationName: string;
        transform: string;
        violations: readonly MotionViolation[];
      }>
    > = {};
    for (const [cellId, animatedSelector] of galleryCases) {
      await selector.selectOption(cellId);
      await expect(galleryPage.locator(`article[data-fixture-id="${cellId}"]`)).toBeVisible();
      const violations = await motionViolations(
        galleryPage,
        `article[data-fixture-id="${cellId}"]`,
      );
      const animationState = await galleryPage.locator(animatedSelector).first().evaluate(
        (element) => ({
          animationName: getComputedStyle(element).animationName,
          transform: getComputedStyle(element).transform,
        }),
      );
      galleryResults[cellId] = { ...animationState, violations };
      expect(violations).toEqual([]);
      expect(animationState.animationName).toBe("none");
      expect(animationState.transform).toBe("none");
    }
    observations = {
      artifactViolations,
      galleryResults,
      galleryDiagnostics,
      openAnimationName,
      openTransform,
      reducedMotionMatches: true,
      sheetViolations,
    };
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.requests).toHaveLength(1);
    expect(galleryDiagnostics.consoleErrors).toEqual([]);
    expect(galleryDiagnostics.pageErrors).toEqual([]);
    screenshots.push(
      await captureU0Screenshot(page, testInfo, `U0-ENV-003-artifact-${browserName}`),
      await captureU0Screenshot(galleryPage, testInfo, `U0-ENV-003-gallery-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeU0EvidenceCell({
      artifact,
      bindings: [
        u0Binding("U0-ENV-003", "TR-U0-MOTION"),
        u0Binding("U0-PRIM-014", "TR-U0-MOTION"),
      ],
      browserName,
      cellId: "U0-ENV-003-reduced-motion",
      diagnostics,
      environment: { reducedMotion: true },
      error,
      observations,
      outcome: error === null ? "pass" : "fail",
      page,
      screenshots,
      testInfo,
      viewport,
    });
    await galleryPage.close();
  }
});
