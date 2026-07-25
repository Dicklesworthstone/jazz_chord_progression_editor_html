import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * L-TOUCH-01 owner. The confirmed legacy failure was touch listeners that
 * suppressed taps and multiplied with document mutation. Every assertion here
 * runs against the real generated artifact in a real browser.
 */

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

/**
 * Count listeners that are still attached to nodes the document still holds.
 * A raw add-minus-remove tally would over-count listeners on discarded nodes,
 * which is not the legacy failure: L-TOUCH-01 was listeners multiplying on
 * surviving nodes. This probe measures exactly that.
 */
async function installListenerProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Record = { target: EventTarget; type: string; active: boolean };
    const records: Record[] = [];
    const target = EventTarget.prototype;
    /* eslint-disable @typescript-eslint/unbound-method */
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    /* eslint-enable @typescript-eslint/unbound-method */
    function patchedAdd(
      this: EventTarget,
      ...args: Parameters<typeof add>
    ): void {
      const [type] = args;
      if (typeof type === "string") {
        records.push({ active: true, target: this, type });
      }
      add.apply(this, args);
    }
    function patchedRemove(
      this: EventTarget,
      ...args: Parameters<typeof remove>
    ): void {
      const [type] = args;
      if (typeof type === "string") {
        for (let index = records.length - 1; index >= 0; index -= 1) {
          const record = records[index];
          if (
            record !== undefined &&
            record.active &&
            record.target === this &&
            record.type === type
          ) {
            record.active = false;
            break;
          }
        }
      }
      remove.apply(this, args);
    }
    target.addEventListener = patchedAdd;
    target.removeEventListener = patchedRemove;
    Object.defineProperty(window, "__listenerCounts", {
      value: () => {
        const counts: Record0 = {};
        for (const record of records) {
          if (!record.active) continue;
          const node = record.target;
          const live =
            node === window ||
            node === document ||
            (node instanceof Node && document.contains(node));
          if (!live) continue;
          counts[record.type] = (counts[record.type] ?? 0) + 1;
        }
        return counts;
      },
    });
    type Record0 = globalThis.Record<string, number>;
  });
}

async function listenerCounts(
  page: Page,
): Promise<Readonly<Record<string, number>>> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __listenerCounts: () => Record<string, number>;
        }
      ).__listenerCounts(),
  );
}

/** On a mobile viewport the Library lives in a sheet; open it before typing. */
async function typeAndInsert(page: Page, text: string): Promise<void> {
  const field = page.getByTestId("quick-entry-field");
  if (!(await field.first().isVisible())) {
    await page.locator("#studio-open-library-sheet").click();
  }
  const visibleField = field.filter({ visible: true }).first();
  await visibleField.fill(text);
  await page
    .locator("#studio-quick-entry-insert")
    .filter({ visible: true })
    .first()
    .click();
  const close = page.getByRole("button", { name: /^Close / });
  if (await close.first().isVisible()) await close.first().click();
}

test.describe("L-TOUCH-01 chart touch behaviour", () => {
  test("a touch shorter than the drag threshold stays a tap", async ({
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

  test("chart listeners do not multiply across repeated document mutation", async ({
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

  test("a cancelled drag releases capture and dispatches nothing", async ({
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
});
