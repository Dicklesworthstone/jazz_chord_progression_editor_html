import { expect, test } from "@playwright/test";

import {
  cards,
  captureDiagnostics,
  expectCleanDiagnostics,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * Declared evidence owner for `U1-TRACE-VIEW`.
 *
 * Compact and teaching views render identical musical facts; teaching adds
 * explanatory labels only and never invents an absent analysis. Toggling
 * changes no document state, no bookmark, and no revision.
 */

/** The musical facts both views must state identically. */
async function musicalFacts(
  page: import("@playwright/test").Page,
): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".studio-chord-card")].map((card) => {
      const symbol = card.querySelector(".studio-chord-card__symbol");
      const duration = card.querySelector(".studio-chord-card__duration");
      return [
        card.getAttribute("data-chord-id") ?? "",
        symbol?.textContent ?? "",
        duration?.textContent ?? "",
      ].join("|");
    }),
  );
}

async function measureFacts(
  page: import("@playwright/test").Page,
): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".studio-measure")].map((measure) => {
      const items = [...measure.querySelectorAll(".ui-key-value-list__item")];
      const wanted = items
        .map((item) => item.textContent)
        .filter(
          (text) =>
            text.startsWith("Duration") ||
            text.startsWith("Fill") ||
            text.startsWith("Capacity") ||
            text.startsWith("Position"),
        );
      return `${measure.getAttribute("data-measure-id") ?? ""}::${wanted.join("|")}`;
    }),
  );
}

test.describe("U1-TRACE-VIEW compact and teaching views", () => {
  test("U1-INT-034 both views state identical musical facts", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    await expect(page.getByTestId("chart-view-mode")).toContainText(
      "Compact view",
    );
    const compactChords = await musicalFacts(page);
    const compactMeasures = await measureFacts(page);
    await expect(page.getByTestId("chord-teaching-notes")).toHaveCount(0);

    await page.locator("#studio-toggle-view-mode").click();
    await expect(page.getByTestId("chart-view-mode")).toContainText(
      "Teaching view",
    );

    // Same symbols, same exact durations, same fill, capacity, and position.
    expect(await musicalFacts(page)).toEqual(compactChords);
    expect(await measureFacts(page)).toEqual(compactMeasures);
    // Teaching adds explanatory labels only.
    await expect(page.getByTestId("chord-teaching-notes")).toHaveCount(2);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-058 teaching never invents an absent analysis", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:4");
    await page.locator("#studio-toggle-view-mode").click();

    const notes = page.getByTestId("chord-teaching-notes").first();
    await expect(notes).toBeVisible();
    // No Roman analysis exists yet, so the absence is stated, not filled in.
    await expect(notes).toContainText("Roman numeral: not analysed yet");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-035 toggling never mutates the document", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");

    const revision = page.locator(".studio-document-status__revision");
    const before = await revision.textContent();
    const undoDisabledBefore = await page
      .locator("#studio-undo")
      .isDisabled();

    await page.locator("#studio-toggle-view-mode").click();
    await page.locator("#studio-toggle-view-mode").click();

    expect(await revision.textContent()).toBe(before);
    expect(await page.locator("#studio-undo").isDisabled()).toBe(
      undoDisabledBefore,
    );
    await expect(page.getByTestId("chart-view-mode")).toContainText(
      "Compact view",
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-036 toggling never mutates bookmarks", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    await cards(page).nth(1).click();
    await page.locator("#studio-select-range").click();
    await cards(page).nth(0).focus();
    await page.locator("#studio-range-set-start").click();
    await cards(page).nth(2).focus();
    await page.locator("#studio-range-set-end").click();
    const rangeBefore = await page.getByTestId("range-status").textContent();

    await page.locator("#studio-toggle-view-mode").click();

    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "1 chord selected",
    );
    await expect(cards(page).nth(1)).toHaveAttribute("data-selected", "true");
    expect(await page.getByTestId("range-status").textContent()).toBe(
      rangeBefore,
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-012 focus survives a view-mode toggle", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    await cards(page).nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(cards(page).nth(2)).toHaveAttribute("tabindex", "0");
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute("data-chord-id") ?? null,
    );

    await page.locator("#studio-toggle-view-mode").click();

    // The same event id keeps the tab stop across the re-render.
    await expect(cards(page).nth(2)).toHaveAttribute("tabindex", "0");
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector('.studio-chord-card[tabindex="0"]')
            ?.getAttribute("data-chord-id") ?? null,
      ),
    ).toBe(focused);
    expectCleanDiagnostics(diagnostics);
  });

  test("Alt+V toggles the view from the chart region", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:4");

    await cards(page).first().focus();
    await page.keyboard.press("Alt+v");
    await expect(page.getByTestId("chart-view-mode")).toContainText(
      "Teaching view",
    );

    await page.keyboard.press("Alt+v");
    await expect(page.getByTestId("chart-view-mode")).toContainText(
      "Compact view",
    );
    expectCleanDiagnostics(diagnostics);
  });
});
