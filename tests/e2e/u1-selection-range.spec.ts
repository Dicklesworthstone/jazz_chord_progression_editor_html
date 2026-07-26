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
 * Declared evidence owner for `U1-TRACE-BOOKMARKS`.
 *
 * Selection, insertion point, range, and playhead are four independent values
 * with independent owners. The touch range mode must expose Set start, Set
 * end, both exact beat fields, Done, and Cancel — every one reachable without
 * a drag.
 */

const TOUCH = {
  hasTouch: true,
  isMobile: true,
  viewport: { height: 844, width: 390 },
} as const;

async function enterRangeMode(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.locator("#studio-select-range").click();
  await expect(page.getByTestId("range-selection-bar")).toBeVisible();
}


test.describe("U1-TRACE-BOOKMARKS selection, range, and the playhead", () => {
  test("U1-INT-001 selecting a chord never moves the playhead", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:2 D:2");

    const position = page.locator(".studio-transport__facts");
    const before = await position.textContent();

    await cards(page).first().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "1 chord selected",
    );
    expect(await position.textContent()).toBe(before);
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OPC-025 Shift+Arrow extends the selection", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    await cards(page).first().click();
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "1 chord selected",
    );

    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "2 chords selected",
    );
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "3 chords selected",
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-027 range mode exposes every action without a drag", async ({
    browser,
  }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      await typeAndInsert(page, "C:1 D:1 E:1 F:1");
      await enterRangeMode(page);

      // Every mandated affordance is a real, visible, enabled control.
      for (const id of [
        "#studio-range-set-start",
        "#studio-range-set-end",
        "#studio-range-done",
        "#studio-range-cancel",
      ]) {
        await expect(page.locator(id)).toBeVisible();
        await expect(page.locator(id)).toBeEnabled();
      }
      await expect(page.getByTestId("range-start-beat")).toBeVisible();
      await expect(page.getByTestId("range-end-beat")).toBeVisible();
      // U1-CMP-023: two boundary handles, and both are operable without a drag.
      const handles = page.getByTestId("range-boundary-handle");
      await expect(handles).toHaveCount(2);
      await focusCard(page, 1);
      await page.locator("#studio-range-handle-start").click();
      await focusCard(page, 2);
      await page.locator("#studio-range-handle-end").click();
      await expect(page.getByTestId("range-status")).toContainText(
        "Range 1/1 to 3/1 beats",
      );
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-CMP-023 dragging a boundary handle onto a card sets that edge", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:2 D:2");
    await enterRangeMode(page);
    await focusCard(page, 0);
    await page.locator("#studio-range-set-start").click();

    // The optional pointer enhancement: drag the end handle onto a card.
    const handle = page.locator("#studio-range-handle-end");
    await handle.dragTo(cards(page).nth(1));

    // Exactly one edge moved, and the click that ends the drag did not also
    // re-run the handle's own keyboard equivalent.
    await expect(page.getByTestId("range-status")).toContainText(
      "Range 0/1 to 4/1 beats",
    );
    await expect(handle).toHaveAttribute("data-dragging", "false");
    await expect(cards(page).nth(1)).toHaveAttribute("data-in-range", "true");
    // The drag set a bookmark only; it never changed the selection.
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "No chord selected",
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-CMP-023 a movement below the drag threshold stays a tap", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:2 D:2");
    await enterRangeMode(page);
    await focusCard(page, 1);

    // Four CSS pixels is under the reviewed eight-pixel threshold, so this is
    // still a tap: the handle's own activation sets the edge from the focused
    // card, and no drag session is ever reported.
    const handle = page.locator("#studio-range-handle-start");
    await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>(
        "#studio-range-handle-start",
      );
      if (target === null) throw new Error("U1_RANGE_NO_HANDLE");
      const options = { bubbles: true, pointerId: 1, pointerType: "mouse" };
      target.dispatchEvent(
        new PointerEvent("pointerdown", { ...options, clientX: 10, clientY: 10 }),
      );
      target.dispatchEvent(
        new PointerEvent("pointermove", { ...options, clientX: 14, clientY: 10 }),
      );
      target.dispatchEvent(
        new PointerEvent("pointerup", { ...options, clientX: 14, clientY: 10 }),
      );
    });
    await expect(handle).toHaveAttribute("data-dragging", "false");

    // The tap does act: it sets the start edge from the focused card, which on
    // its own spans no beats until the other boundary is set.
    await handle.click();
    await expect(page.getByTestId("range-status")).toContainText(
      "Range spans no beats yet",
    );
    await page.locator("#studio-range-set-end").click();
    await expect(page.getByTestId("range-status")).toContainText(
      "Range 2/1 to 4/1 beats",
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("the declared range-scope keys act from the range bar", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");
    await enterRangeMode(page);

    // Home and End set the two edges from the focused card; Escape clears the
    // range. All three act only from the bar's own controls.
    await focusCard(page, 0);
    await page.locator("#studio-range-set-start").focus();
    await page.keyboard.press("Home");
    await focusCard(page, 2);
    await page.locator("#studio-range-set-end").focus();
    await page.keyboard.press("End");
    await expect(page.getByTestId("range-status")).toContainText(
      "Range 0/1 to 3/1 beats",
    );

    await page.locator("#studio-range-set-end").focus();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("range-status")).toContainText("No range set");
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-INT-028 U1-INT-029 Set start and Set end use the focused card", async ({
    browser,
  }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      await typeAndInsert(page, "C:1 D:1 E:1 F:1");
      await enterRangeMode(page);

      await focusCard(page, 0);
      await page.locator("#studio-range-set-start").click();
      await focusCard(page, 1);
      await page.locator("#studio-range-set-end").click();

      await expect(page.getByTestId("range-status")).toContainText(
        "Range 0/1 to 2/1 beats",
      );
      // Setting a range never changes the selection.
      await expect(page.getByTestId("chart-selection-status")).toContainText(
        "No chord selected",
      );
      await expect(cards(page).nth(0)).toHaveAttribute("data-in-range", "true");
      await expect(cards(page).nth(1)).toHaveAttribute("data-in-range", "true");
      await expect(cards(page).nth(2)).toHaveAttribute("data-in-range", "false");
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-INT-030 a beat field stores the exact rational value", async ({
    browser,
  }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      // Half-beat spans make 5/2 a real boundary rather than a rounded one.
      await typeAndInsert(page, "C:1/2 D:1/2 E:1/2 F:1/2 G:1/2 A:1/2 B:1/2 C:1/2");
      await enterRangeMode(page);

      await page.getByTestId("range-start-beat").fill("1/2");
      await page.getByTestId("range-start-beat").press("Enter");
      await page.getByTestId("range-end-beat").fill("5/2");
      await page.getByTestId("range-end-beat").press("Enter");

      // Exactly as typed: no decimal, no rounding, no renormalisation.
      await expect(page.getByTestId("range-status")).toContainText(
        "Range 1/2 to 5/2 beats",
      );
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-INT-031 an unparsable beat field refuses and keeps the range", async ({
    browser,
  }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      await typeAndInsert(page, "C:1 D:1 E:1 F:1");
      await enterRangeMode(page);

      await page.getByTestId("range-start-beat").fill("0");
      await page.getByTestId("range-start-beat").press("Enter");
      await page.getByTestId("range-end-beat").fill("2");
      await page.getByTestId("range-end-beat").press("Enter");
      await expect(page.getByTestId("range-status")).toContainText(
        "Range 0/1 to 2/1 beats",
      );

      await page.getByTestId("range-end-beat").fill("5..2");
      await page.getByTestId("range-end-beat").press("Enter");

      await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
        "data-code",
        "u1.range_boundary_invalid",
      );
      // The prior range is intact.
      await expect(page.getByTestId("range-status")).toContainText(
        "Range 0/1 to 2/1 beats",
      );
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-INT-032 unordered endpoints refuse", async ({ browser }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      await typeAndInsert(page, "C:1 D:1 E:1 F:1");
      await enterRangeMode(page);

      await focusCard(page, 2);
      await page.locator("#studio-range-set-start").click();
      await focusCard(page, 0);
      await page.locator("#studio-range-set-end").click();

      await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
        "data-code",
        "u1.range_endpoints_unordered",
      );
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-INT-033 Cancel restores the exact prior range", async ({
    browser,
  }) => {
    const context = await browser.newContext(TOUCH);
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      await typeAndInsert(page, "C:1 D:1 E:1 F:1");

      // Establish a range, close the mode, then reopen and change it.
      await enterRangeMode(page);
      await focusCard(page, 0);
      await page.locator("#studio-range-set-start").click();
      await focusCard(page, 1);
      await page.locator("#studio-range-set-end").click();
      await expect(page.getByTestId("range-status")).toContainText(
        "Range 0/1 to 2/1 beats",
      );
      await page.locator("#studio-range-done").click();

      await enterRangeMode(page);
      await focusCard(page, 3);
      await page.locator("#studio-range-set-end").click();
      await expect(page.getByTestId("range-status")).toContainText(
        "Range 0/1 to 4/1 beats",
      );

      await page.locator("#studio-range-cancel").click();
      await expect(page.getByTestId("range-selection-bar")).toHaveCount(0);
      // The range returns to exactly what it was when the mode opened.
      await expect(cards(page).nth(1)).toHaveAttribute("data-in-range", "true");
      await expect(cards(page).nth(2)).toHaveAttribute("data-in-range", "false");
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-INT-004 a range never changes the selection", async ({ page }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "C:1 D:1 E:1 F:1");

    await cards(page).nth(3).click();
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "1 chord selected",
    );

    await page.locator("#studio-select-range").click();
    await focusCard(page, 0);
    await page.locator("#studio-range-set-start").click();
    await focusCard(page, 1);
    await page.locator("#studio-range-set-end").click();

    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "1 chord selected",
    );
    await expect(cards(page).nth(3)).toHaveAttribute("data-selected", "true");
    expectCleanDiagnostics(diagnostics);
  });
});
