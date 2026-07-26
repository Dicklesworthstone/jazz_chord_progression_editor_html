import { expect, test, type Page } from "@playwright/test";

import {
  cards,
  captureDiagnostics,
  expectCleanDiagnostics,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * Declared evidence for U1-INT-037 … U1-INT-041 in
 * `tests/fixtures/editing/interaction-state-matrix.json`.
 *
 * The reviewed matrix names five viewports and states the same requirement at
 * each: the chart region and every chord-card action stay operable, and no
 * primary action hides behind hover. Each viewport here drives the real
 * generated artifact and authors a chart through the surface it actually
 * renders at that width, so a layout that merely exists but cannot be used
 * fails rather than passes.
 */

const VIEWPORTS = [
  { caseId: "U1-INT-037", height: 568, id: "U1-VP-320", mode: "compact", width: 320 },
  { caseId: "U1-INT-038", height: 844, id: "U1-VP-390", mode: "compact", width: 390 },
  { caseId: "U1-INT-039", height: 1024, id: "U1-VP-768", mode: "medium", width: 768 },
  { caseId: "U1-INT-040", height: 800, id: "U1-VP-1280", mode: "wide", width: 1280 },
  { caseId: "U1-INT-041", height: 900, id: "U1-VP-1440", mode: "wide", width: 1440 },
] as const;

/**
 * A control is operable only if it is visible and enabled without a pointer
 * ever resting on it. Playwright reports visibility from layout and paint, so
 * a control revealed only by `:hover` is not visible until hovered — asserting
 * before any hover is exactly the no-hover requirement.
 */
async function expectOperable(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector).filter({ visible: true }).first();
  await expect(control, `${selector} is visible`).toBeVisible();
  await expect(control, `${selector} is enabled`).toBeEnabled();
}

test.describe("U1 responsive matrix over the real artifact", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.caseId} ${viewport.id} chart authoring stays operable at ${String(viewport.width)} CSS pixels`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        hasTouch: viewport.mode === "compact",
        isMobile: viewport.mode === "compact",
        viewport: { height: viewport.height, width: viewport.width },
      });
      const page = await context.newPage();
      const diagnostics = captureDiagnostics(page);
      try {
        await openStudio(page);

        // Authoring works at this width, not merely renders.
        await typeAndInsert(page, "Dm9:2 G13:2");
        await expect(cards(page)).toHaveCount(2);

        // The chart region and its primary actions, with no hover first.
        await expectOperable(page, "#chart-workspace");
        await expectOperable(page, "#studio-insert-section");
        await expectOperable(page, "#studio-select-range");
        await expectOperable(page, "#studio-toggle-view-mode");
        await expectOperable(page, '[id^="studio-append-measure-"]');
        await expectOperable(page, '[id^="studio-target-measure-"]');

        // Every chord-card action is reachable through the card's own menu,
        // which opens from a real control rather than a hover affordance.
        const card = cards(page).first();
        await expect(card).toBeVisible();
        await card.getByTestId("chord-card-more").click();
        const menu = page.getByTestId("chord-card-menu");
        await expect(menu).toBeVisible();
        await expect(menu.getByRole("menuitem")).toHaveCount(12);
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);

        // The keyboard path is intact at this width too.
        await card.focus();
        await page.keyboard.press("F2");
        await expect(page.getByTestId("inline-symbol-editor")).toBeVisible();
        await page.keyboard.press("Escape");

        // The transport stays present and honestly disabled.
        await expect(page.locator("#studio-transport-play")).toBeVisible();
        await expect(page.locator("#studio-transport-play")).toBeDisabled();
        expectCleanDiagnostics(diagnostics);
      } finally {
        await context.close();
      }
    });
  }
});
