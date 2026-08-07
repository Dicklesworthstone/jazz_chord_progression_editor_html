import { expect, test, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Short-viewport panel-trigger reachability
 * (bead jcpe-ui-nits-320-triggers-undo-audit-s9r2).
 *
 * Measured defect: at heights <= 37.49rem the sticky panel dock's
 * short-viewport escape returned the Library/Harmony triggers to static
 * flow INSIDE the chart scrollport — top=571 in a 568 px viewport,
 * unreachable by page scroll (the jcpe-osxq "reachable is not visible"
 * trap in its worst form, since no page scroll reaches it at all).
 *
 * Remedy under test: in exactly that window the always-visible transport
 * bar carries Library/Harmony icon triggers (the Sound-trigger precedent)
 * and the dock retires. On tall phones the sticky dock remains the
 * mechanism and the transport triggers stay hidden.
 *
 * These tests assert visibility from an UNSCROLLED state and assert the
 * triggers actually open their sheets. They also freeze the undo/redo
 * audit verdict: #studio-undo/#studio-redo are visible unscrolled at every
 * probed viewport (the earlier parity sweep's "absent at all widths" was a
 * selector artifact, not a product gap).
 */

function artifactUrl(): string {
  return pathToFileURL(
    join(process.cwd(), "jazz_chord_progression_editor.html"),
  ).href;
}

async function openStudio(page: Page): Promise<void> {
  await page.goto(artifactUrl(), { waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

async function expectUnscrolledVisible(
  page: Page,
  locator: Locator,
): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (box === null || viewport === null) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  const scrolled = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  expect(scrolled).toEqual({ x: 0, y: 0 });
}

test.describe("short viewport (320x568): transport carries panel triggers", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("library and harmony open from unscrolled transport triggers", async ({
    page,
  }) => {
    await openStudio(page);

    const library = page.locator("#studio-transport-open-library");
    const harmony = page.locator("#studio-transport-open-harmony");
    await expectUnscrolledVisible(page, library);
    await expectUnscrolledVisible(page, harmony);

    await expect(page.locator(".studio-mobile-panel-actions")).toBeHidden();

    await library.click();
    const librarySheet = page.locator("#studio-library-sheet");
    await expect(librarySheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(librarySheet).toBeHidden();
    /*
     * Sheet close restores focus to its declared trigger and refuses a
     * hidden one; in this window the transport trigger is that target.
     */
    await expect(library).toBeFocused();

    await harmony.click();
    const harmonySheet = page.locator("#studio-harmony-sheet");
    await expect(harmonySheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(harmonySheet).toBeHidden();
    await expect(harmony).toBeFocused();
  });

  test("undo and redo stay visible unscrolled", async ({ page }) => {
    await openStudio(page);
    await expectUnscrolledVisible(page, page.locator("#studio-undo"));
    await expectUnscrolledVisible(page, page.locator("#studio-redo"));
  });
});

test.describe("tall phone (320x844): sticky dock remains the mechanism", () => {
  test.use({ viewport: { width: 320, height: 844 } });

  test("dock triggers visible unscrolled; transport triggers retired", async ({
    page,
  }) => {
    await openStudio(page);

    await expectUnscrolledVisible(
      page,
      page.locator("#studio-open-library-sheet"),
    );
    await expectUnscrolledVisible(
      page,
      page.locator("#studio-open-harmony-sheet"),
    );
    await expect(
      page.locator("#studio-transport-open-library"),
    ).toBeHidden();
    await expect(
      page.locator("#studio-transport-open-harmony"),
    ).toBeHidden();

    await expectUnscrolledVisible(page, page.locator("#studio-undo"));
    await expectUnscrolledVisible(page, page.locator("#studio-redo"));
  });
});
