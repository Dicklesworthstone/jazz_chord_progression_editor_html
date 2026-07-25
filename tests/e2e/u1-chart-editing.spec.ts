import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type PageDiagnostics = Readonly<{
  consoleErrors: string[];
  pageErrors: string[];
}>;

function captureDiagnostics(page: Page): PageDiagnostics {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
}

function artifactUrl(): string {
  return pathToFileURL(
    join(process.cwd(), "jazz_chord_progression_editor.html"),
  ).href;
}

async function openStudio(page: Page): Promise<void> {
  await page.goto(artifactUrl(), { waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

function expectCleanDiagnostics(diagnostics: PageDiagnostics): void {
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
}

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
    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "u1.completion_reason_required",
    );
    await expect(page.locator(".studio-chord-card")).toHaveCount(2);
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
    await expect(cards.nth(0)).toHaveAttribute("tabindex", "0");
    for (const index of [1, 2, 3]) {
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

    const position = page.locator(".studio-transport__facts");
    const before = await position.textContent();

    await page.locator(".studio-chord-card").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "1 chord selected",
    );
    expect(await position.textContent()).toBe(before);
    expectCleanDiagnostics(diagnostics);
  });

  test("appends measures and sections through visible insertion targets", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await expect(page.locator(".studio-measure")).toHaveCount(1);
    await page.locator('[id^="studio-append-measure-"]').first().click();
    await expect(page.locator(".studio-measure")).toHaveCount(2);

    await page.locator('[id^="studio-insert-before-"]').first().click();
    await expect(page.locator(".studio-measure")).toHaveCount(3);

    await page.locator("#studio-insert-section").click();
    await expect(page.locator(".studio-section")).toHaveCount(2);
    expectCleanDiagnostics(diagnostics);
  });

  test("reorders a chord inside its measure without changing the total", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    const cards = page.locator(".studio-chord-card");
    await cards.nth(1).click();
    await expect(page.locator("#studio-move-previous")).toBeEnabled();
    await page.locator("#studio-move-previous").click();

    await expect(cards.nth(0)).toContainText("G13");
    await expect(cards.nth(1)).toContainText("Dm9");
    await expect(
      page.locator(".studio-measure").getByText("Exactly full", { exact: true }),
    ).toBeVisible();
    expectCleanDiagnostics(diagnostics);
  });

  test("edits a chord symbol inline and keeps its exact duration", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    const cards = page.locator(".studio-chord-card");
    await cards.nth(0).focus();
    await page.keyboard.press("F2");
    const editor = page.getByTestId("inline-symbol-editor");
    await expect(editor).toBeVisible();

    await editor.fill("Dm11");
    await page.keyboard.press("Enter");
    await expect(editor).toHaveCount(0);
    await expect(cards.nth(0)).toContainText("Dm11");
    await expect(cards.nth(0)).toContainText("2/1 beats");
    await expect(
      page.locator(".studio-measure").getByText("Exactly full", { exact: true }),
    ).toBeVisible();
    expectCleanDiagnostics(diagnostics);
  });

  test("Escape restores the exact prior symbol text", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Cmaj9:4");

    const card = page.locator(".studio-chord-card").first();
    await card.focus();
    await page.keyboard.press("F2");
    await page.getByTestId("inline-symbol-editor").fill("nonsense");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("inline-symbol-editor")).toHaveCount(0);
    await expect(card).toContainText("Cmaj9");
    expectCleanDiagnostics(diagnostics);
  });

  test("an unparsable inline symbol refuses and preserves the chord", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Cmaj9:4");

    const card = page.locator(".studio-chord-card").first();
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

  test("states the measure fill and refuses an overfilling duration", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    const card = page.locator(".studio-chord-card").first();
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

  test("a shorter duration commits only with an explicit reason", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    const card = page.locator(".studio-chord-card").first();
    await card.focus();
    await page.keyboard.press("Alt+t");
    await page.getByTestId("duration-editor").fill("1");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "u1.completion_reason_required",
    );
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

  test("renames a section and toggles its voice-leading boundary", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    await expect(page.getByTestId("section-boundary-label")).toContainText(
      "Voice leading resets at this boundary",
    );

    const nameField = page.getByTestId("section-name-field");
    await nameField.fill("Head");
    await nameField.blur();
    await expect(page.locator(".studio-section h3")).toContainText("Head");

    const note = page.getByTestId("section-annotation-field");
    await note.fill("Swing eighths");
    await note.blur();
    await expect(note).toHaveValue("Swing eighths");

    await page.locator('[id^="studio-section-boundary-"]').first().click();
    await expect(page.getByTestId("section-boundary-label")).toContainText(
      "Voice leading continues across this boundary",
    );

    await page.locator("#studio-undo").click();
    await expect(page.getByTestId("section-boundary-label")).toContainText(
      "Voice leading resets at this boundary",
    );
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
