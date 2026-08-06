import { expect, test } from "@playwright/test";

import {
  captureDiagnostics,
  expectCleanDiagnostics,
  openStudio,
} from "./u1-chart-kit";

/**
 * The groove picker (groove expansion 2026-07-30, amended by jcpe-jnnu).
 *
 * The groove is a document setting: the picker lists every declared
 * performance style with the ballad default checked, choosing another lands
 * ONE undoable "Set groove" edit whose undo audibly restores the previous
 * groove, and a library entry applies its own reviewed groove when loaded —
 * so the choice travels with the chart through share links and recovery.
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
    await expect(radios).toHaveCount(7);
    await expect(
      picker.getByRole("radio", { name: "Ballad" }),
    ).toHaveAttribute("aria-checked", "true");
    for (const label of [
      "Medium swing",
      "Bossa nova",
      "Straight eighths",
      "Syncopated sixteenths",
      "Uptempo swing",
      "Block chords",
    ]) {
      await expect(
        picker.getByRole("radio", { name: label }),
      ).toHaveAttribute("aria-checked", "false");
    }
    expectCleanDiagnostics(diagnostics);
  });

  test("choosing a style is one undoable document edit", async ({
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

    // jcpe-jnnu: the groove is a document setting — the pick landed exactly
    // one undoable edit, and undo audibly restores the previous groove.
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(
      picker.getByRole("radio", { name: "Ballad" }),
    ).toHaveAttribute("aria-checked", "true");
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

/*
 * The master-volume fader (owner report 2026-08-04, post-ship polish): a
 * POINTER drag moves a local draft (the thumb follows the pointer through
 * mid-drag re-renders) and commits exactly ONE undoable edit on release.
 * Discrete keyboard ticks stay one-command-per-press — the tempo stepper's
 * law — because text-field coalescing is contractually unavailable to
 * settings commands (SetDocumentSettingsCommand = CommandEnvelope<null>).
 */
test.describe("master volume fader", () => {
  test("a pointer drag lands exactly one undoable edit and the thumb follows", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const undo = page.locator("#studio-undo");
    await expect(undo).toBeDisabled();

    const slider = page.locator("#studio-transport-volume");
    await slider.scrollIntoViewIfNeeded();
    const before = await slider.inputValue();
    const box = await slider.boundingBox();
    if (box === null) throw new Error("volume slider has no box");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.9, y);
    await page.mouse.down();
    /* Several drag samples in one engagement: only the draft moves. */
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 4 });
    await expect(undo).toBeDisabled();
    await page.mouse.move(box.x + box.width * 0.35, y, { steps: 4 });
    await page.mouse.up();

    const after = await slider.inputValue();
    expect(after).not.toBe(before);
    /* Release committed exactly one edit; one undo restores the old mix. */
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(slider).toHaveValue(before);
    await expect(undo).toBeDisabled();
    expectCleanDiagnostics(diagnostics);
  });
});
