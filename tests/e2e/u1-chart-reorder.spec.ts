import { expect, test } from "@playwright/test";

import {
  activateMenuItem,
  cards,
  declareIncompleteMeasure,
  captureDiagnostics,
  chordIds,
  expectCleanDiagnostics,
  openCardMenu,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * Declared evidence owner for `U1-TRACE-IDENTITY`.
 *
 * Chart nodes are keyed by stable domain identity, never by array position. A
 * reorder preserves the focused and selected identity, and the confirmed
 * legacy failure — index identity drifting after a reorder — must not recur.
 */
test.describe("U1-TRACE-IDENTITY stable identity across reorder", () => {
  test("U1-EDIT-007 every card is keyed by a stable domain identity", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    const ids = await chordIds(page);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) {
      // An array-position key would be a bare integer; these are domain ids.
      expect(id).not.toMatch(/^\d+$/u);
      expect(id.length).toBeGreaterThan(1);
    }
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-053 a reorder moves symbols but keeps identities", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    const before = await chordIds(page);
    const [firstId, secondId] = before;

    await cards(page).nth(1).click();
    await expect(page.locator("#studio-move-previous")).toBeEnabled();
    await page.locator("#studio-move-previous").click();

    await expect(cards(page).nth(0)).toContainText("G13");
    await expect(cards(page).nth(1)).toContainText("Dm9");

    // The identities travelled with their chords; none was reallocated.
    const after = await chordIds(page);
    expect(after).toEqual([secondId, firstId]);
    // The moved chord keeps its selection.
    await expect(cards(page).nth(0)).toHaveAttribute("data-selected", "true");
    expectCleanDiagnostics(diagnostics);
  });

  test("a same-measure reorder never changes the measure total", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await cards(page).nth(1).click();
    await page.locator("#studio-move-previous").click();

    await expect(
      page.locator(".studio-measure").getByText("Exactly full", { exact: true }),
    ).toBeVisible();
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-013 Move following chords relocates only the tail", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");
    await page.locator('[id^="studio-append-measure-"]').first().click();
    await expect(page.locator(".studio-measure")).toHaveCount(2);

    const before = await chordIds(page);
    await openCardMenu(page, 0);
    await activateMenuItem(page, "Move following chords to the next measure");

    // Moving the tail out leaves both bars half full. Nothing is rebalanced
    // silently: the operation stops and asks for an explicit reason first.
    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "u1.completion_reason_required",
    );
    await declareIncompleteMeasure(page, "Split across two bars");

    const measures = page.locator(".studio-measure");
    await expect(measures.nth(0).locator(".studio-chord-card")).toHaveCount(1);
    await expect(measures.nth(1).locator(".studio-chord-card")).toHaveCount(1);
    await expect(measures.nth(1)).toContainText("G13");
    // No beat was lost and no identity was reallocated.
    expect(await chordIds(page)).toEqual(before);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-016 splitting a section preserves measure identities", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");
    await page.locator('[id^="studio-append-measure-"]').first().click();
    await expect(page.locator(".studio-measure")).toHaveCount(2);

    const measureIds = await page.evaluate(() =>
      [...document.querySelectorAll("[data-measure-id]")].map(
        (node) => node.getAttribute("data-measure-id") ?? "",
      ),
    );
    const chordsBefore = await chordIds(page);

    await page.locator('[id^="studio-split-section-"]').first().click();

    await expect(page.locator(".studio-section")).toHaveCount(2);
    // Both measures survive with their exact identities, in the same order.
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll("[data-measure-id]")].map(
          (node) => node.getAttribute("data-measure-id") ?? "",
        ),
      ),
    ).toEqual(measureIds);
    expect(await chordIds(page)).toEqual(chordsBefore);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-017 joining sections restores one section and its order", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");
    await page.locator('[id^="studio-append-measure-"]').first().click();
    const measureIds = await page.evaluate(() =>
      [...document.querySelectorAll("[data-measure-id]")].map(
        (node) => node.getAttribute("data-measure-id") ?? "",
      ),
    );
    await page.locator('[id^="studio-split-section-"]').first().click();
    await expect(page.locator(".studio-section")).toHaveCount(2);

    await page.locator('[id^="studio-section-boundary-"]').first().click();
    await page.locator('[id^="studio-join-sections-"]').first().click();

    await expect(page.locator(".studio-section")).toHaveCount(1);
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll("[data-measure-id]")].map(
          (node) => node.getAttribute("data-measure-id") ?? "",
        ),
      ),
    ).toEqual(measureIds);
    expectCleanDiagnostics(diagnostics);
  });

  test("visible insertion targets append measures and sections", async ({
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

  test("renaming a section and toggling its boundary stay undoable", async ({
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

    // U1-CMP-020: the menu names both boundaries instead of toggling blindly.
    await page.locator('[id^="studio-section-boundary-"]').first().click();
    const boundaryMenu = page.getByTestId("section-boundary-menu");
    await expect(boundaryMenu).toBeVisible();
    await expect(
      boundaryMenu.getByRole("menuitemradio", { name: "Reset voice leading" }),
    ).toHaveAttribute("aria-checked", "true");
    await boundaryMenu
      .getByRole("menuitemradio", { name: "Continue voice leading" })
      .click();
    await expect(boundaryMenu).toHaveCount(0);
    await expect(page.getByTestId("section-boundary-label")).toContainText(
      "Voice leading continues across this boundary",
    );

    await page.locator("#studio-undo").click();
    await expect(page.getByTestId("section-boundary-label")).toContainText(
      "Voice leading resets at this boundary",
    );
    expectCleanDiagnostics(diagnostics);
  });
});
