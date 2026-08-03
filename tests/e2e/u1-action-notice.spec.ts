import { expect, test } from "@playwright/test";

import {
  cards,
  captureDiagnostics,
  expectCleanDiagnostics,
  focusCard,
  openStudio,
  showTeachingView,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * jcpe-disi.3: every landed mutation names itself in the action notice with
 * a real Undo one press away, and a refused intent never produces a lying
 * sentence. The notice region always exists (aria-live needs a stable
 * region); content appears only after the document revision advances.
 */
test.describe("jcpe-disi.3 labeled-undo action notice", () => {
  test("a delete names the chord and bar, and its Undo restores the chart", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:1 G13:1 C6:1 A7:1 |");

    const notice = page.getByTestId("action-notice");
    await expect(notice).toHaveAttribute("aria-live", "polite");
    await expect(notice).toHaveAttribute("data-empty", "false");
    await expect(notice).toContainText("Inserted the draft into the chart");

    await focusCard(page, 3);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Delete");
    await expect(notice).toContainText("Deleted A7 from bar 1");
    await expect(cards(page)).toHaveCount(3);

    await page.locator("#studio-action-undo").click();
    await expect(cards(page)).toHaveCount(4);
    // Undoing clears the sentence — it would otherwise describe undone work.
    await expect(notice).toHaveAttribute("data-empty", "true");
    expectCleanDiagnostics(diagnostics);
  });

  test("duplicate and menu delete speak; dismiss clears without acting", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");

    const notice = page.getByTestId("action-notice");
    await focusCard(page, 0);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { exact: true, name: "Duplicate selection" }).click();
    await expect(notice).toContainText("Duplicated Dm9 from bar 1");

    const countAfterDuplicate = await cards(page).count();
    await page.locator("#studio-action-dismiss").click();
    await expect(notice).toHaveAttribute("data-empty", "true");
    await expect(cards(page)).toHaveCount(countAfterDuplicate);

    await cards(page).nth(0).getByTestId("chord-card-delete").click();
    await expect(notice).toContainText("Deleted Dm9 from bar 1");
    expectCleanDiagnostics(diagnostics);
  });

  test("a refused duration edit leaves the notice silent", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "| Dm9:2 G13:2 |");

    // Clear anything the insert announced.
    await page.locator("#studio-action-dismiss").click();
    const notice = page.getByTestId("action-notice");
    await expect(notice).toHaveAttribute("data-empty", "true");

    // Overfill the bar: 7 beats into a 4/4 measure refuses with remedies.
    await focusCard(page, 0);
    await page.keyboard.press("Alt+t");
    const editor = page.getByTestId("duration-editor");
    await editor.fill("5");
    await page.keyboard.press("Enter");

    // The refusal surface speaks; the action notice must not.
    await expect(notice).toHaveAttribute("data-empty", "true");
    expectCleanDiagnostics(diagnostics);
  });
});
