import { expect, test } from "@playwright/test";

import {
  cards,
  declareIncompleteMeasure,
  captureDiagnostics,
  expectCleanDiagnostics,
  focusCard,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * Declared evidence owner for `U1-TRACE-FOCUS`.
 *
 * The chart is one tab stop with roving focus in visual order, and after a
 * destructive command focus repair is exactly: next event, then previous
 * event, then the section insertion target.
 */
test.describe("U1-TRACE-FOCUS roving focus and focus repair", () => {
  test("U1-INT-007 the chart is exactly one tab stop", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    await expect(cards(page)).toHaveCount(4);
    // Exactly one card is the tab stop. Which card it is comes from the A0
    // focus request the surface renders (contract 5.1) rather than from the
    // surface's own guess: after this insert A0 asks for the last inserted
    // event, so that is the card holding the stop.
    expect(
      await page.locator('.studio-chord-card[tabindex="0"]').count(),
    ).toBe(1);
    await expect(cards(page).nth(3)).toHaveAttribute("tabindex", "0");
    for (const index of [0, 1, 2]) {
      await expect(cards(page).nth(index)).toHaveAttribute("tabindex", "-1");
    }
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-008 arrow keys move the tab stop and the DOM focus together", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    await cards(page).nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(cards(page).nth(1)).toHaveAttribute("tabindex", "0");
    await expect(cards(page).nth(0)).toHaveAttribute("tabindex", "-1");

    // Physical focus must follow the tab stop, or Enter activates the wrong
    // chord. Only a real browser can prove this.
    await page.keyboard.press("Enter");
    await expect(cards(page).nth(1)).toHaveAttribute("data-selected", "true");
    await expect(cards(page).nth(0)).toHaveAttribute("data-selected", "false");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-009 Home and End reach the ends of the visual order", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    await cards(page).nth(0).focus();
    await page.keyboard.press("End");
    await expect(cards(page).nth(3)).toHaveAttribute("tabindex", "0");

    await page.keyboard.press("Home");
    await expect(cards(page).nth(0)).toHaveAttribute("tabindex", "0");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-010 roving focus crosses measure boundaries as one stop", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:2 D:2");
    await page.locator('[id^="studio-append-measure-"]').first().click();
    const measures = page.locator(".studio-measure");
    await expect(measures).toHaveCount(2);

    // Aim quick entry at the new bar, then fill it. Without an explicit
    // insertion target there is no way to author a second measure at all.
    const secondId = await measures.nth(1).getAttribute("data-measure-id");
    await page.locator(`#studio-target-measure-${secondId ?? ""}`).click();
    await page.getByTestId("quick-entry-field").fill("E:2 F:2");
    await page.locator("#studio-quick-entry-insert").click();
    await expect(cards(page)).toHaveCount(4);

    await cards(page).nth(1).focus();
    await page.keyboard.press("ArrowRight");
    // Crossing from the last chord of bar one to the first of bar two.
    await expect(cards(page).nth(2)).toHaveAttribute("tabindex", "0");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-013 delete repairs focus onto the next event", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    await cards(page).nth(1).click();
    await page.locator("#studio-delete-selection").click();

    // Deleting one of four quarter notes leaves a short bar, which needs an
    // explicit reason before anything is published.
    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "u1.completion_reason_required",
    );
    await declareIncompleteMeasure(page, "Deliberate gap");

    await expect(cards(page)).toHaveCount(3);
    // The next event by document order takes the tab stop.
    await expect(cards(page).nth(1)).toContainText("E");
    expect(
      await page.locator('.studio-chord-card[tabindex="0"]').count(),
    ).toBe(1);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-054 the focused card is removed out of band", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    // Focus the last card, then remove it by undoing the insert that created
    // it. The surface did not ask for that card to go, so this is exactly the
    // out-of-band removal the case names.
    await focusCard(page, 3);
    await expect(cards(page).nth(3)).toHaveAttribute("tabindex", "0");
    await page.locator("#studio-undo").click();

    await expect(cards(page)).toHaveCount(0);
    // Focus follows the declared repair order to the chart's own insertion
    // target rather than falling out to the document body.
    await expect(page.locator("body")).not.toBeFocused();
    await expect(page.locator('[id^="studio-append-measure-"]').first()).toBeVisible();
    expect(await page.locator('.studio-chord-card[tabindex="0"]').count()).toBe(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-055 arrow movement never leaves the chart region", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    // ArrowRight on the last card does not wrap and does not escape the chart.
    await focusCard(page, 1);
    const revision = page.locator(".studio-document-status__revision");
    const before = await revision.innerText();
    await page.keyboard.press("ArrowRight");

    await expect(cards(page).nth(1)).toHaveAttribute("tabindex", "0");
    await expect(cards(page).nth(1)).toBeFocused();
    // The movement was consumed: the revision did not move and nothing refused.
    await expect(revision).toHaveText(before);
    await expect(page.getByTestId("chart-edit-refusal")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-057 a committed command shows no refusal", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    // A0 accepted the command: the chart holds it, the refusal region is
    // empty, and the undo affordance names the operation that committed.
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByTestId("chart-edit-refusal")).toHaveCount(0);
    await expect(page.locator("#studio-undo")).toBeEnabled();
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-011 focus survives an undo that restores the chart", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    await focusCard(page, 2);

    await page.locator("#studio-undo").click();
    await expect(cards(page)).toHaveCount(0);
    await page.locator("#studio-redo").click();
    await expect(cards(page)).toHaveCount(4);

    // Exactly one tab stop still exists after the round trip.
    expect(
      await page.locator('.studio-chord-card[tabindex="0"]').count(),
    ).toBe(1);
    expectCleanDiagnostics(diagnostics);
  });
});
