import { expect, test } from "@playwright/test";

import {
  captureDiagnostics,
  expectCleanDiagnostics,
  openStudio,
} from "./u1-chart-kit";

/**
 * The groove picker (groove expansion, 2026-07-30).
 *
 * Session state with a visible control: the picker lists every declared
 * performance style, the default is the studio's ballad, choosing another
 * persists in the radio state, and a library entry applies its own reviewed
 * groove when loaded. All of it without a document edit — Undo stays
 * whatever the chart's history says it is.
 */

test.describe("groove picker", () => {
  test("lists every declared style with the ballad default checked", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const picker = page.locator("#studio-groove-picker-rail");
    await picker.scrollIntoViewIfNeeded();
    const radios = picker.getByRole("radio");
    await expect(radios).toHaveCount(5);
    await expect(
      picker.getByRole("radio", { name: "Ballad" }),
    ).toHaveAttribute("aria-checked", "true");
    for (const label of [
      "Medium swing",
      "Bossa nova",
      "Straight eighths",
      "Block chords",
    ]) {
      await expect(
        picker.getByRole("radio", { name: label }),
      ).toHaveAttribute("aria-checked", "false");
    }
    expectCleanDiagnostics(diagnostics);
  });

  test("choosing a style persists and never edits the document", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const undo = page.locator("#studio-undo");
    await expect(undo).toBeDisabled();

    const picker = page.locator("#studio-groove-picker-rail");
    await picker.scrollIntoViewIfNeeded();
    await picker.getByRole("radio", { name: "Bossa nova" }).click();
    await expect(
      picker.getByRole("radio", { name: "Bossa nova" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      picker.getByRole("radio", { name: "Ballad" }),
    ).toHaveAttribute("aria-checked", "false");

    // Session state: the empty chart still has nothing to undo.
    await expect(undo).toBeDisabled();
    expectCleanDiagnostics(diagnostics);
  });

  test("a library entry applies its own reviewed groove", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const entry = page.locator("#studio-progression-modal-planing");
    await entry.scrollIntoViewIfNeeded();
    await entry.click();

    const picker = page.locator("#studio-groove-picker-rail");
    await picker.scrollIntoViewIfNeeded();
    // modal-planing is reviewed as a bossa entry.
    await expect(
      picker.getByRole("radio", { name: "Bossa nova" }),
    ).toHaveAttribute("aria-checked", "true");
    expectCleanDiagnostics(diagnostics);
  });
});
