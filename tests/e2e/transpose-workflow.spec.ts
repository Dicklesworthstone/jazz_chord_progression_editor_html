import { expect, test } from "@playwright/test";

import {
  captureDiagnostics,
  cards,
  expectCleanDiagnostics,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * Transpose to a named key through the real dialog: the key list follows the
 * chart's mode (minor charts reach G♯, D♯ and A♯ minor, major charts keep
 * the flat-side majors), the preview names the key change and the moved
 * chords, Transpose is one undoable step, and Undo restores the chart.
 */

test.describe("Transpose to a key", () => {
  test("a C minor chart moves to G♯ minor, spelled with sharps, and Undo restores it", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Cm7 | Fm7 | G7 | Cm7 |");
    await expect(cards(page)).toHaveCount(4);
    const key = page.getByRole("combobox", { name: "Key" });
    await key.selectOption({ label: "C minor" });

    await page.locator("#studio-chart-transpose").click();
    const dialog = page.getByRole("dialog", { name: "Transpose the chart" });
    await dialog.getByRole("radio", { name: "To key" }).check();
    const newKey = dialog.locator("#studio-transpose-key");
    const labels = await newKey.locator("option").allInnerTexts();
    expect(labels).toEqual(expect.arrayContaining(["G♯", "D♯", "A♯"]));
    expect(labels).not.toContain("D♭");
    await newKey.selectOption({ label: "G♯" });
    await expect(dialog).toContainText("Key: C natural minor → G♯ natural minor");
    await expect(dialog).toContainText("Cm7 → G#m7");
    await dialog.locator("#studio-transpose-apply").click();

    await expect(cards(page).nth(0)).toContainText("G#m7");
    await expect(cards(page).nth(2)).toContainText("D#7");
    await expect(key).toHaveValue("G/1/natural-minor");
    await page.locator("#studio-undo").click();
    await expect(cards(page).nth(0)).toContainText("Cm7");
    await expect(key).toHaveValue("C/0/natural-minor");
    expectCleanDiagnostics(diagnostics);
  });

  test("a major chart keeps the major tonics (D♭, no G♯)", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm7 G7 | Cmaj7 |");
    await page.getByRole("combobox", { name: "Key" }).selectOption({ label: "C major" });
    await page.locator("#studio-chart-transpose").click();
    const dialog = page.getByRole("dialog", { name: "Transpose the chart" });
    await dialog.getByRole("radio", { name: "To key" }).check();
    const labels = await dialog.locator("#studio-transpose-key option").allInnerTexts();
    expect(labels).toContain("D♭");
    expect(labels).not.toContain("G♯");
    expectCleanDiagnostics(diagnostics);
  });
});
