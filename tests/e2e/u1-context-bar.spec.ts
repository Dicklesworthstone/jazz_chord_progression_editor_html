import { expect, test } from "@playwright/test";

import {
  cards,
  captureDiagnostics,
  expectCleanDiagnostics,
  focusCard,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * jcpe-disi.6: the context action bar exists exactly while something is
 * chosen, carries the selection sentence plus the verbs that apply, and its
 * names never collide with the top toolbar's role+name queries.
 */
test.describe("jcpe-disi.6 context action bar", () => {
  test("appears with a selection, verbs act, and it leaves with the selection", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:1 G13:1 C6:1 A7:1 |");

    // The bar is ALWAYS mounted (census law); inactive it hides and yields
    // its width, so "appears" means becomes visible, never mounts.
    const bar = page.getByTestId("context-action-bar");
    await expect(bar).toBeHidden();

    // The insert's own notice outranks the selection sentence (it carries
    // the live Undo), so dismissing it is part of the journey.
    await page.locator("#studio-action-dismiss").click();
    await cards(page).nth(1).click();
    await expect(bar).toBeVisible();
    await expect(page.getByTestId("action-notice")).toContainText(
      "1 chord selected",
    );

    // Single selection offers Duration; a real verb round-trips with Undo.
    await expect(bar.getByRole("button", { name: "Duration" })).toBeEnabled();
    await bar.getByRole("button", { exact: true, name: "Delete" }).click();
    await expect(cards(page)).toHaveCount(3);
    await page.locator("#studio-undo").click();
    await expect(cards(page)).toHaveCount(4);

    // Selection survives the undo, so the bar stays — its lifecycle is the
    // selection's lifecycle, nothing else's.
    await focusCard(page, 0);
    await page.keyboard.press("Enter");
    await expect(bar).toBeVisible();
    expectCleanDiagnostics(diagnostics);
  });

  test("a range selection drops Duration and the layout survives 320px", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Dm9:1 G13:1 C6:1 A7:1 |");

    await page.locator("#studio-action-dismiss").click();
    await cards(page).nth(0).click();
    await cards(page).nth(2).click({ modifiers: ["Shift"] });
    const bar = page.getByTestId("context-action-bar");
    await expect(bar).toBeVisible();
    await expect(page.getByTestId("action-notice")).toContainText(
      "3 chords selected",
    );
    // Plural selections keep Duration mounted (census law) but disabled.
    await expect(bar.getByRole("button", { name: "Duration" })).toBeDisabled();

    // The 320 px law: the page never scrolls horizontally.
    await page.setViewportSize({ height: 800, width: 320 });
    await expect(bar).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Move a range: three chords shift one slot later in one command.
    await bar.getByRole("button", { name: "Move later" }).click();
    await expect(page.getByTestId("action-notice")).toContainText(
      "Moved 3 chords later",
    );
    await page.locator("#studio-undo").click();
    expectCleanDiagnostics(diagnostics);
  });
});
