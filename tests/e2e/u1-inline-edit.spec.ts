import { expect, test } from "@playwright/test";

import {
  activateMenuItem,
  cards,
  captureDiagnostics,
  expectCleanDiagnostics,
  openCardMenu,
  openStudio,
  showTeachingView,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * Declared evidence owner for `U1-TRACE-INLINE`.
 *
 * Inline symbol editing commits only on a successful parse, Escape restores
 * the exact prior source text, blur neither commits nor coerces, and every
 * duration edit states the resulting measure fill with explicit resolutions.
 */
test.describe("U1-TRACE-INLINE inline symbol and duration editing", () => {
  test("U1-EDIT-011 a valid symbol commits and keeps the exact duration", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await cards(page).nth(0).focus();
    await page.keyboard.press("F2");
    const editor = page.getByTestId("inline-symbol-editor");
    await expect(editor).toBeVisible();

    await editor.fill("Dm11");
    await page.keyboard.press("Enter");
    await expect(editor).toHaveCount(0);
    await expect(cards(page).nth(0)).toContainText("Dm11");
    await expect(cards(page).nth(0)).toContainText("2/1 beats");
    await expect(
      page.locator(".studio-measure").getByText("Exactly full", { exact: true }),
    ).toBeVisible();
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-055 Escape restores the exact prior symbol text", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Cmaj9:4");

    const card = cards(page).first();
    await card.focus();
    await page.keyboard.press("F2");
    await page.getByTestId("inline-symbol-editor").fill("nonsense");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("inline-symbol-editor")).toHaveCount(0);
    await expect(card).toContainText("Cmaj9");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-038 an unparsable symbol refuses and preserves the chord", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Cmaj9:4");

    const card = cards(page).first();
    await card.focus();
    await page.keyboard.press("F2");
    await page.getByTestId("inline-symbol-editor").fill("H7");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "u1.symbol_draft_invalid",
    );
    await expect(card).toContainText("Cmaj9");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-039 blur neither commits nor coerces a dirty draft", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Cmaj9:4");

    const card = cards(page).first();
    await card.focus();
    await page.keyboard.press("F2");
    await page.getByTestId("inline-symbol-editor").fill("H7");
    await page.locator("#studio-insert-section").focus();

    // Blur is completely inert: the draft is neither committed nor coerced,
    // the editor stays open holding the exact typed text, the stored chord is
    // unchanged, and no refusal is raised because nothing was dispatched.
    await expect(page.getByTestId("inline-symbol-editor")).toHaveValue("H7");
    await expect(card).toHaveAttribute(
      "aria-label",
      "Chord 1: Cmaj9, 4/1 beats",
    );
    await expect(page.getByTestId("chart-edit-refusal")).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-040 an overfilling duration states its resolutions", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    const card = cards(page).first();
    await card.focus();
    await page.keyboard.press("Alt+t");
    const editor = page.getByTestId("duration-editor");
    await expect(editor).toBeVisible();

    await editor.fill("3");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "u1.duration_overfills_measure",
    );
    await expect(page.getByTestId("chart-edit-refusal")).toContainText(
      "Move following chords into the next measure",
    );
    await expect(card).toContainText("2/1 beats");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-042 a shorter duration commits only with a reason", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    const card = cards(page).first();
    await card.focus();
    await page.keyboard.press("Alt+t");
    await page.getByTestId("duration-editor").fill("1");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "u1.completion_reason_required",
    );
    // U1-CMP-019: the refusal opens the dialog, and Confirm stays disabled
    // until a reason exists, so a short bar is never declared in passing.
    const reason = page.getByTestId("incomplete-reason-field");
    await expect(reason).toBeVisible();
    await expect(page.locator("#studio-confirm-incomplete")).toBeDisabled();

    await reason.fill("Anacrusis");
    await page.locator("#studio-confirm-incomplete").click();

    await expect(page.getByTestId("chart-edit-refusal")).toHaveCount(0);
    await expect(card).toContainText("1/1 beats");
    await expect(
      page
        .locator(".studio-measure")
        .getByText("Shorter than the bar", { exact: true }),
    ).toBeVisible();
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-014 splitting a duration keeps the exact bar total", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await cards(page).nth(0).focus();
    await page.keyboard.press("Alt+s");
    const editor = page.getByTestId("split-editor");
    await expect(editor).toBeVisible();
    await editor.fill("1");
    await page.keyboard.press("Enter");

    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).nth(0)).toContainText("Dm9");
    await expect(cards(page).nth(0)).toContainText("1/1 beats");
    await expect(cards(page).nth(1)).toContainText("Dm9");
    await expect(cards(page).nth(1)).toContainText("1/1 beats");
    await expect(
      page.locator(".studio-measure").getByText("Exactly full", { exact: true }),
    ).toBeVisible();
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-045 a split that does not sum refuses", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await cards(page).nth(0).focus();
    await page.keyboard.press("Alt+s");
    await page.getByTestId("split-editor").fill("5");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "u1.split_partition_invalid",
    );
    await expect(cards(page)).toHaveCount(2);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-015 joining two equal chords yields one exact span", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 Dm9:2");

    await openCardMenu(page, 0);
    await activateMenuItem(page, "Join with next");

    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).nth(0)).toContainText("4/1 beats");
    await expect(
      page.locator(".studio-measure").getByText("Exactly full", { exact: true }),
    ).toBeVisible();
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-043 Join with next is disabled for a trailing chord", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await openCardMenu(page, 1);
    const item = page
      .getByTestId("chord-card-menu")
      .getByRole("menuitem", { name: "Join with next" });
    // The reason is stated rather than the item vanishing.
    await expect(item).toHaveAttribute("aria-disabled", "true");
    await expect(item).toHaveAttribute(
      "title",
      "This chord has no following chord to join.",
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("switching away from a dirty draft prompts before anything moves", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await cards(page).nth(0).focus();
    await page.keyboard.press("F2");
    await page.getByTestId("inline-symbol-editor").fill("Dm11");
    // Activating the next card is a switch away from an unapplied draft.
    await cards(page).nth(1).click();

    const prompt = page.getByTestId("dirty-draft-prompt");
    await expect(prompt).toBeVisible();
    // The interrupted selection has not happened and nothing was published.
    await expect(page.getByTestId("inline-symbol-editor")).toHaveValue("Dm11");
    await expect(cards(page).nth(0)).toHaveAttribute(
      "aria-label",
      "Chord 1: Dm9, 2/1 beats",
    );
    await expect(cards(page).nth(1)).toHaveAttribute("data-selected", "false");

    // Continue editing dismisses the prompt and leaves the draft untouched.
    await prompt.getByRole("button", { name: "Continue editing" }).click();
    await expect(prompt).toHaveCount(0);
    await expect(page.getByTestId("inline-symbol-editor")).toHaveValue("Dm11");
    await expect(cards(page).nth(1)).toHaveAttribute("data-selected", "false");
    expectCleanDiagnostics(diagnostics);
  });

  test("Discard drops the draft and then performs the interrupted action", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await cards(page).nth(0).focus();
    await page.keyboard.press("F2");
    await page.getByTestId("inline-symbol-editor").fill("Dm11");
    await cards(page).nth(1).click();
    await page
      .getByTestId("dirty-draft-prompt")
      .getByRole("button", { name: "Discard" })
      .click();

    // The stored symbol is exactly what it was; the draft was never written.
    await expect(page.getByTestId("inline-symbol-editor")).toHaveCount(0);
    await expect(cards(page).nth(0)).toContainText("Dm9");
    // The interrupted selection ran only after the prompt was answered.
    await expect(cards(page).nth(1)).toHaveAttribute("data-selected", "true");
    expectCleanDiagnostics(diagnostics);
  });

  test("Apply commits the draft and then performs the interrupted action", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await cards(page).nth(0).focus();
    await page.keyboard.press("F2");
    await page.getByTestId("inline-symbol-editor").fill("Dm11");
    await cards(page).nth(1).click();
    await page
      .getByTestId("dirty-draft-prompt")
      .getByRole("button", { name: "Apply" })
      .click();

    await expect(page.getByTestId("inline-symbol-editor")).toHaveCount(0);
    await expect(cards(page).nth(0)).toContainText("Dm11");
    await expect(cards(page).nth(0)).toContainText("2/1 beats");
    await expect(cards(page).nth(1)).toHaveAttribute("data-selected", "true");
    expectCleanDiagnostics(diagnostics);
  });

  test("a draft typed back to its stored text is not dirty", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await showTeachingView(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await cards(page).nth(0).focus();
    await page.keyboard.press("F2");
    const editor = page.getByTestId("inline-symbol-editor");
    await editor.fill("Dm11");
    await editor.fill("Dm9");
    await cards(page).nth(1).click();

    // Nothing changed, so nothing is prompted and the action is immediate.
    await expect(page.getByTestId("dirty-draft-prompt")).toHaveCount(0);
    await expect(cards(page).nth(1)).toHaveAttribute("data-selected", "true");
    expectCleanDiagnostics(diagnostics);
  });
});
