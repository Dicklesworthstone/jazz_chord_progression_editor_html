import { expect, test } from "@playwright/test";

import {
  captureDiagnostics,
  declareIncompleteMeasure,
  expectCleanDiagnostics,
  installListenerProbe,
  listenerCounts,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

/**
 * L-TOUCH-01 owner. The confirmed legacy failure was touch listeners that
 * suppressed taps and multiplied with document mutation. Every assertion here
 * runs against the real generated artifact in a real browser.
 */

test.describe("L-TOUCH-01 chart touch behaviour", () => {
  test("U1-INT-016 a touch shorter than the drag threshold stays a tap", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { height: 844, width: 390 },
    });
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      await typeAndInsert(page, "Dm9:2 G13:2");

      // A plain tap still selects: the legacy failure suppressed this.
      await page.locator(".studio-chord-card").first().click();
      await expect(page.getByTestId("chart-selection-status")).toContainText(
        "1 chord selected",
      );

      // Seven CSS pixels is below the reviewed eight-pixel threshold, so no
      // drag session may start and the chart must be unchanged.
      const handle = page.getByTestId("chord-drag-handle").first();
      await page.evaluate(() => {
        const target = document.querySelector<HTMLElement>(
          '[data-testid="chord-drag-handle"]',
        );
        if (target === null) throw new Error("U1_TOUCH_NO_HANDLE");
        const options = { bubbles: true, pointerId: 1, pointerType: "touch" };
        target.dispatchEvent(
          new PointerEvent("pointerdown", { ...options, clientX: 10, clientY: 10 }),
        );
        target.dispatchEvent(
          new PointerEvent("pointermove", { ...options, clientX: 17, clientY: 10 }),
        );
        target.dispatchEvent(
          new PointerEvent("pointerup", { ...options, clientX: 17, clientY: 10 }),
        );
      });

      await expect(handle).toHaveAttribute("data-dragging", "false");
      await expect(page.locator(".studio-chord-card")).toHaveCount(2);
      await expect(page.getByTestId("chart-edit-refusal")).toHaveCount(0);
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-INT-024 chart listeners do not multiply across repeated document mutation", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { height: 844, width: 390 },
    });
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await installListenerProbe(page);
      await openStudio(page);
      await typeAndInsert(page, "Dm9:2 G13:2");

      const settled = await listenerCounts(page);
      const sectionId = await page
        .locator(".studio-section")
        .first()
        .getAttribute("id");
      void sectionId;

      // Ten commit/undo cycles mutate the document twenty times.
      for (let cycle = 0; cycle < 10; cycle += 1) {
        await page.locator('[id^="studio-append-measure-"]').first().click();
        await page.locator("#studio-undo").click();
      }
      await expect(page.locator(".studio-measure")).toHaveCount(1);

      const after = await listenerCounts(page);
      for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "keydown", "click"]) {
        expect(after[type] ?? 0, `${type} listener total`).toBe(
          settled[type] ?? 0,
        );
      }
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-INT-019 a cancelled drag releases capture and dispatches nothing", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { height: 844, width: 390 },
    });
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await installListenerProbe(page);
      await openStudio(page);
      await typeAndInsert(page, "Dm9:2 G13:2");
      const before = await listenerCounts(page);

      const handle = page.getByTestId("chord-drag-handle").first();
      await page.evaluate(() => {
        const target = document.querySelector<HTMLElement>(
          '[data-testid="chord-drag-handle"]',
        );
        if (target === null) throw new Error("U1_TOUCH_NO_HANDLE");
        const options = { bubbles: true, pointerId: 1, pointerType: "touch" };
        target.dispatchEvent(
          new PointerEvent("pointerdown", { ...options, clientX: 10, clientY: 10 }),
        );
        target.dispatchEvent(
          new PointerEvent("pointermove", { ...options, clientX: 60, clientY: 10 }),
        );
      });
      await expect(handle).toHaveAttribute("data-dragging", "true");

      await page.evaluate(() => {
        const target = document.querySelector<HTMLElement>(
          '[data-testid="chord-drag-handle"]',
        );
        target?.dispatchEvent(
          new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }),
        );
      });

      await expect(handle).toHaveAttribute("data-dragging", "false");
      const after = await listenerCounts(page);
      for (const type of ["pointermove", "pointerup", "pointercancel"]) {
        expect(after[type] ?? 0, `${type} listener total`).toBe(
          before[type] ?? 0,
        );
      }
      await expect(page.locator(".studio-chord-card")).toHaveCount(2);
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-INT-022 each chord card owns exactly three static listeners", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { height: 844, width: 390 },
    });
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await installListenerProbe(page);
      await openStudio(page);
      await typeAndInsert(page, "C:1 D:1 E:1 F:1");
      await expect(page.locator(".studio-chord-card")).toHaveCount(4);

      // "Static" means with no inline editor open and no drag session active.
      // Every control inside a card — the drag handle, the More trigger, and
      // every menu item — is delegated to these three, so the count cannot
      // grow as the card gains controls.
      const perCard = await page.evaluate(() => {
        const counts = (
          window as unknown as {
            __listenerCounts: (selector?: string) => Record<string, number>;
          }
        ).__listenerCounts;
        return [...document.querySelectorAll(".studio-chord-card")].map(
          (card, index) => {
            card.setAttribute("data-probe-index", String(index));
            const scoped = counts(`[data-probe-index="${String(index)}"]`);
            card.removeAttribute("data-probe-index");
            return Object.values(scoped).reduce((sum, n) => sum + n, 0);
          },
        );
      });
      expect(perCard).toEqual([3, 3, 3, 3]);

      // Opening a card menu adds nine menu items and still no listener.
      await page
        .locator(".studio-chord-card")
        .first()
        .getByTestId("chord-card-more")
        .click();
      await expect(page.getByTestId("chord-card-menu")).toBeVisible();
      const withMenu = await page.evaluate(() => {
        const counts = (
          window as unknown as {
            __listenerCounts: (selector?: string) => Record<string, number>;
          }
        ).__listenerCounts;
        const card = document.querySelector(".studio-chord-card");
        card?.setAttribute("data-probe-index", "0");
        const scoped = counts('[data-probe-index="0"]');
        card?.removeAttribute("data-probe-index");
        return Object.values(scoped).reduce((sum, n) => sum + n, 0);
      });
      expect(withMenu).toBe(3);
      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("every chart operation stays reachable without a pointer", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { height: 844, width: 390 },
    });
    const page = await context.newPage();
    const diagnostics = captureDiagnostics(page);
    try {
      await openStudio(page);
      await typeAndInsert(page, "Dm9:2 G13:2");

      const cards = page.locator(".studio-chord-card");
      await cards.nth(0).focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("chart-selection-status")).toContainText(
        "1 chord selected",
      );

      await page.keyboard.press("Alt+ArrowLeft");
      await expect(cards.nth(0)).toContainText("G13");

      await page.keyboard.press("F2");
      await expect(page.getByTestId("inline-symbol-editor")).toBeVisible();
      await page.keyboard.press("Escape");

      expectCleanDiagnostics(diagnostics);
    } finally {
      await context.close();
    }
  });

  test("U1-INT-044 U1-EDIT-014 every declared chart shortcut publishes its own row, and an A0 refusal is shown verbatim", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");
    const cards = page.locator(".studio-chord-card");
    await cards.nth(0).focus();

    // Alt+B is U1-OP-023: it publishes the section boundary, undoably.
    await page.keyboard.press("Alt+b");
    await expect(page.getByTestId("section-boundary-label")).toContainText(
      "Voice leading continues across this boundary",
    );
    await page.locator("#studio-undo").click();
    await expect(page.getByTestId("section-boundary-label")).toContainText(
      "Voice leading resets at this boundary",
    );

    // Alt+I appends a measure; Alt+K then splits the section before it.
    await cards.nth(0).focus();
    await page.keyboard.press("Alt+i");
    await expect(page.locator(".studio-measure")).toHaveCount(2);
    await page.locator('[id^="studio-target-measure-"]').last().click();
    await page.locator("#chart-workspace").focus();
    await page.keyboard.press("Alt+k");
    await expect(page.locator(".studio-section")).toHaveCount(2);

    // Alt+L joins them back, restoring the single section.
    await page.locator("#chart-workspace").focus();
    await page.keyboard.press("Alt+l");
    await expect(page.locator(".studio-section")).toHaveCount(1);

    // Alt+C declares the aimed measure's own completion. The appended measure
    // is already empty, so there is nothing to declare and A0's refusal is
    // surfaced verbatim rather than rewritten into a U1 code or hidden.
    await page.locator('[id^="studio-target-measure-"]').last().click();
    await page.locator("#chart-workspace").focus();
    await page.keyboard.press("Alt+c");
    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "command.payload_invalid",
    );
    expectCleanDiagnostics(diagnostics);
  });

  test("U1-OP-012 Alt+M moves the selection to the insertion point", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "Dm9:2 G13:2");
    const cards = page.locator(".studio-chord-card");

    // A second, empty measure becomes the named destination.
    await page.locator('[id^="studio-append-measure-"]').first().click();
    await expect(page.locator(".studio-measure")).toHaveCount(2);
    await page.locator('[id^="studio-target-measure-"]').last().click();

    await cards.nth(1).click();
    await expect(page.getByTestId("chart-selection-status")).toContainText(
      "1 chord selected",
    );
    await cards.nth(1).focus();
    await page.keyboard.press("Alt+m");

    // Emptying half of the source bar is never silent: the move stops and asks
    // for an explicit reason before anything is published.
    await expect(page.getByTestId("chart-edit-refusal")).toHaveAttribute(
      "data-code",
      "u1.completion_reason_required",
    );
    await declareIncompleteMeasure(page, "Second half moved on");

    // The chord moved into the destination the insertion point already named.
    const measures = page.locator(".studio-measure");
    await expect(measures.nth(0).locator(".studio-chord-card")).toHaveCount(1);
    await expect(measures.nth(1).locator(".studio-chord-card")).toHaveCount(1);
    await expect(measures.nth(1)).toContainText("G13");
    expectCleanDiagnostics(diagnostics);
  });
});
