import { expect, test } from "@playwright/test";

import {
  captureDiagnostics,
  cards,
  declareIncompleteMeasure,
  expectCleanDiagnostics,
  focusCard,
  openStudio,
  showTeachingView,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * Owner-reported regressions, 2026-07-30:
 *
 * 1. Clear used a native `confirm()` dialog. It is now an owned two-step
 *    control: first press arms, second press clears, and no browser dialog
 *    ever opens.
 * 2. Clear followed by a library click left a permanently blank bar 1 with
 *    the inserted bars appended behind it, and the blank bar had no removal
 *    affordance at all.
 *
 * Plus the two surfaces that closed the gaps this hunt exposed: an empty
 * bar's own Remove tool, the first tempo control, and the split-at-bar
 * one-click fix on a duration overfill (jcpe-aacz).
 */

test.describe("owned Clear confirmation", () => {
  test("Clear arms on the first press and never opens a native dialog", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    let nativeDialogs = 0;
    page.on("dialog", (dialog) => {
      nativeDialogs += 1;
      void dialog.dismiss();
    });

    await openStudio(page);
    await typeAndInsert(page, "| Cmaj7 | Fmaj7 |");
    await expect(cards(page)).toHaveCount(2);

    const clear = page.locator("#studio-clear-chart");
    await clear.click();
    // Armed, not performed: the chart is untouched and the label says so.
    await expect(clear).toHaveText(/Really clear\?/);
    await expect(cards(page)).toHaveCount(2);

    await clear.click();
    await expect(cards(page)).toHaveCount(0);
    await expect(clear).toHaveText(/^Clear$/);

    // One undoable command: a single Undo restores both chords.
    await page.locator("#studio-undo").click();
    await expect(cards(page)).toHaveCount(2);

    expect(nativeDialogs).toBe(0);
    expectCleanDiagnostics(diagnostics);
  });
});

test.describe("pristine fill after Clear", () => {
  test("a library progression fills bar 1 instead of skipping it", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Cmaj7 | Fmaj7 |");

    const clear = page.locator("#studio-clear-chart");
    await clear.click();
    await clear.click();
    await expect(cards(page)).toHaveCount(0);

    const entry = page.locator("#studio-progression-rhythm-turnaround");
    await entry.scrollIntoViewIfNeeded();
    await entry.click();

    // Eight two-chord bars; the first written measure holds the first two.
    await expect(cards(page)).toHaveCount(16);
    const perMeasure = await page.evaluate(() =>
      [...document.querySelectorAll("[data-measure-id]")].map(
        (measure) => measure.querySelectorAll(".studio-chord-card").length,
      ),
    );
    expect(perMeasure).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    expectCleanDiagnostics(diagnostics);
  });

  test("typing after Clear also fills bar 1", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Cmaj7 |");
    const clear = page.locator("#studio-clear-chart");
    await clear.click();
    await clear.click();
    await expect(cards(page)).toHaveCount(0);

    await typeAndInsert(page, "| Am7 D7 | Gmaj7 |");
    await expect(cards(page)).toHaveCount(3);
    const perMeasure = await page.evaluate(() =>
      [...document.querySelectorAll("[data-measure-id]")].map(
        (measure) => measure.querySelectorAll(".studio-chord-card").length,
      ),
    );
    expect(perMeasure).toEqual([2, 1]);
    expectCleanDiagnostics(diagnostics);
  });
});

test.describe("empty-measure removal", () => {
  test("an empty bar offers its own Remove tool; the last bar never does", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Cmaj7 |");
    await expect(cards(page)).toHaveCount(1);

    // The sole bar is populated: no delete tool anywhere.
    await expect(page.locator("[id^='studio-delete-measure-']")).toHaveCount(0);

    // Insert an empty bar ahead of it; that bar can now remove itself.
    await page.locator("[id^='studio-insert-before-']").first().click();
    const remover = page.locator("[id^='studio-delete-measure-']");
    await expect(remover).toHaveCount(1);
    await expect(remover).toHaveText(/Remove empty measure 1/);

    await remover.click();
    await expect(page.locator("[data-measure-id]")).toHaveCount(1);
    await expect(cards(page)).toHaveCount(1);

    // Undoable like every other document edit.
    await page.locator("#studio-undo").click();
    await expect(page.locator("[data-measure-id]")).toHaveCount(2);
    expectCleanDiagnostics(diagnostics);
  });
});

test.describe("tempo control", () => {
  test("the tempo field commits, refuses out-of-range, and feeds the transport", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const input = page.locator("#studio-tempo-input-rail");
    await input.scrollIntoViewIfNeeded();
    await input.fill("140");
    await page.locator("#studio-apply-tempo-rail").click();
    await expect(page.locator("#studio-tempo-feedback-rail")).toContainText(
      "Tempo committed",
    );
    await expect(page.locator("#transport-bar")).toContainText("140 BPM");

    await input.fill("999");
    await page.locator("#studio-apply-tempo-rail").click();
    const feedback = page.locator("#studio-tempo-feedback-rail");
    await expect(feedback).toContainText("Tempo must be between");
    // The committed tempo is untouched by the refused draft.
    await expect(page.locator("#transport-bar")).toContainText("140 BPM");

    // Undo returns the seeded tempo and the field follows the document.
    await page.locator("#studio-undo").click();
    await expect(input).toHaveValue("105");
    expectCleanDiagnostics(diagnostics);
  });
});

test.describe("split-at-bar one-click fix", () => {
  test("a duration overfill offers Split this bar here, and it works", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    /*
     * focusCard moves the roving focus through the real keyboard path;
     * a bare .focus() moves DOM focus without telling U1, and the fix
     * button derives its split boundary from the roving focus.
     */
    await focusCard(page, 0);
    await page.keyboard.press("Alt+t");
    const editor = page.getByTestId("duration-editor");
    await expect(editor).toBeVisible();
    await editor.fill("3");
    await page.keyboard.press("Enter");

    const refusal = page.getByTestId("chart-edit-refusal");
    await expect(refusal).toHaveAttribute(
      "data-code",
      "u1.duration_overfills_measure",
    );
    // jcpe-yvni: every named remedy is its own control, including Cancel.
    await expect(page.locator("#studio-move-following")).toBeVisible();
    await expect(page.locator("#studio-shorten-duration")).toBeVisible();
    await expect(page.locator("#studio-cancel-pending-edit")).toBeVisible();
    await expect(page.locator("#studio-split-at-bar")).toBeVisible();

    await page.locator("#studio-split-at-bar").click();
    /*
     * Splitting a full bar mid-way leaves two short bars, and a short bar
     * is never declared in passing: the reason dialog interrupts, and the
     * typed reason resumes the exact split (U1-CMP-019).
     */
    await declareIncompleteMeasure(page, "Split to give the opening chord room");
    // The bar is split before G13: two measures, one chord each, and the
    // refusal is resolved rather than lingering over a changed chart.
    await expect(page.locator("[data-measure-id]")).toHaveCount(2);
    const perMeasure = await page.evaluate(() =>
      [...document.querySelectorAll("[data-measure-id]")].map(
        (measure) => measure.querySelectorAll(".studio-chord-card").length,
      ),
    );
    expect(perMeasure).toEqual([1, 1]);
    await expect(refusal).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });
});
