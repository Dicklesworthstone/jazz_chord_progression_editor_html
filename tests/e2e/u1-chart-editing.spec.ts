import { expect, test, type Page } from "@playwright/test";
import {
  captureDiagnostics,
  expectCleanDiagnostics,
  openStudio,
} from "./u1-chart-kit";

/** Type chart text and publish it through the real atomic command. */
async function typeAndInsert(page: Page, text: string): Promise<void> {
  const field = page.getByTestId("quick-entry-field");
  await field.fill(text);
  await page.locator("#studio-quick-entry-insert").click();
}

test.describe("U1 chart editing in the real artifact", () => {
  test("types chart text and publishes real chord cards", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    await expect(page.getByTestId("quick-entry-status")).toContainText(
      "No draft",
    );

    await page.getByTestId("quick-entry-field").fill("Dm9:2 G13:2");
    await expect(page.getByTestId("quick-entry-status")).toContainText(
      "Draft parses",
    );

    await page.locator("#studio-quick-entry-insert").click();

    const cards = page.locator(".studio-chord-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("Dm9");
    await expect(cards.nth(1)).toContainText("G13");
    await expect(cards.nth(0)).toContainText("2/1 beats");
    await expect(page.getByTestId("quick-entry-field")).toHaveValue("");
    expectCleanDiagnostics(diagnostics);
  });

  test("keeps invalid draft text exactly and reports the T0 code", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await page.getByTestId("quick-entry-field").fill("H7");
    await expect(page.getByTestId("quick-entry-status")).toContainText(
      "Draft has parse errors",
    );
    await expect(page.getByTestId("quick-entry-issues")).toBeVisible();
    await expect(page.locator("#studio-quick-entry-insert")).toBeDisabled();
    await expect(page.getByTestId("quick-entry-field")).toHaveValue("H7");
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("selects a chord and deletes it through one undoable command", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "No chord selected",
    );
    await expect(page.locator("#studio-delete-selection")).toBeDisabled();

    await page.locator(".studio-chord-card").first().click();
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "1 chord selected",
    );
    await expect(page.locator("#studio-delete-selection")).toBeEnabled();

    await page.locator("#studio-delete-selection").click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(1);
    await expect(page.locator(".studio-chord-card").first()).toContainText(
      "G13",
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("keeps the chart one tab stop and moves focus with arrow keys", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    const cards = page.locator(".studio-chord-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(3)).toHaveAttribute("tabindex", "0");
    for (const index of [0, 1, 2]) {
      await expect(cards.nth(index)).toHaveAttribute("tabindex", "-1");
    }

    await cards.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(cards.nth(1)).toHaveAttribute("tabindex", "0");
    await expect(cards.nth(0)).toHaveAttribute("tabindex", "-1");

    await page.keyboard.press("End");
    await expect(cards.nth(3)).toHaveAttribute("tabindex", "0");

    await page.keyboard.press("Home");
    await expect(cards.nth(0)).toHaveAttribute("tabindex", "0");
    expectCleanDiagnostics(diagnostics);
  });

  test("selects with the keyboard without moving the transport playhead", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:2 D:2");

    const position = page.getByTestId("transport-now-place");
    const before = await position.textContent();

    await page.locator(".studio-chord-card").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "1 chord selected",
    );
    expect(await position.textContent()).toBe(before);
    expectCleanDiagnostics(diagnostics);
  });

  test("undo restores the exact pre-insert chart", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Cmaj9:4");
    await expect(page.locator(".studio-chord-card")).toHaveCount(1);

    await page.locator("#studio-undo").click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);

    await page.locator("#studio-redo").click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(1);
    expectCleanDiagnostics(diagnostics);
  });
});
