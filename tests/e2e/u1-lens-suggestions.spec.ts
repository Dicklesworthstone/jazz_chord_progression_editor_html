import { expect, test } from "@playwright/test";

import {
  captureDiagnostics,
  cards,
  expectCleanDiagnostics,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * The Harmony Lens's continuation section: plural next-chord options with
 * typed explanations, and an Add that travels the one staged quick-entry
 * path — so the appended chord is undoable exactly like a typed one.
 */

test.describe("Lens continuation options", () => {
  test("an empty chart shows no continuation section", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await expect(page.getByTestId("lens-continuation-rail")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("after | Dm7 G7 | the options follow G7, and Add appends undoably", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm7 G7 |");
    await expect(cards(page)).toHaveCount(2);

    const section = page.getByTestId("lens-continuation-rail");
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
    await expect(section).toContainText("After G7");
    await expect(section).toContainText("Cmaj7");
    // Options are plural and explained; the copy never claims a verdict.
    await expect(section).not.toContainText(/\bbest\b/i);

    await section
      .getByRole("button", { name: "Add Cmaj7" })
      .first()
      .click();
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).nth(2)).toContainText("Cmaj7");

    // The options now follow the chord that was just added.
    await expect(section).toContainText("After Cmaj7");

    await page.locator("#studio-undo").click();
    await expect(cards(page)).toHaveCount(2);
    await expect(section).toContainText("After G7");
    expectCleanDiagnostics(diagnostics);
  });

  test("the key picker sets a minor key the Lens reads, clears it, and undoes", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Cm7 Fm7 |");
    await expect(cards(page)).toHaveCount(2);

    const key = page.getByRole("combobox", { name: "Key" });
    await expect(key).toHaveValue("");
    await key.selectOption({ label: "C minor" });
    await expect(key).toHaveValue("C/0/natural-minor");

    // In C minor, Cm7 is the tonic and leads to the key's own iv.
    await cards(page).nth(0).click();
    const detail = page.locator(".studio-chord-detail").first();
    await expect(detail.locator(".studio-chord-detail__roman")).toHaveText("i7");
    await expect(detail).toContainText("the minor home");
    await expect(page.locator('[id^="studio-detail-hear-"]').first()).toHaveText(/Fm7/);

    await key.selectOption({ label: "No key" });
    await expect(key).toHaveValue("");
    await page.locator("#studio-undo").click();
    await expect(key).toHaveValue("C/0/natural-minor");
    expectCleanDiagnostics(diagnostics);
  });
});
