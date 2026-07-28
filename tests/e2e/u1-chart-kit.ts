import { expect, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Shared harness for the U1 chart evidence owners named in
 * `tests/fixtures/editing/trace-ledger.json`. Every helper drives the real
 * generated artifact in a real browser; nothing here mocks the application,
 * the controller, or the DOM.
 */

export type PageDiagnostics = Readonly<{
  consoleErrors: string[];
  pageErrors: string[];
}>;

export function captureDiagnostics(page: Page): PageDiagnostics {
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

export function expectCleanDiagnostics(diagnostics: PageDiagnostics): void {
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
}

function artifactUrl(): string {
  return pathToFileURL(
    join(process.cwd(), "jazz_chord_progression_editor.html"),
  ).href;
}

export async function openStudio(page: Page): Promise<void> {
  await page.goto(artifactUrl(), { waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  /*
   * First open seeds the reviewed starter chart through real commands
   * (jcpe-b20t). These specs author their own charts against the pristine
   * studio, so the kit unwinds the seed the way a user would: pressing
   * Undo until history is exhausted. Asserting the seeded state first
   * keeps every spec run an incidental witness that the seed landed.
   */
  await expect(page.locator(".studio-chord-card").first()).toBeVisible();
  const undo = page.locator("#studio-undo");
  for (let press = 0; press < 6 && (await undo.isEnabled()); press += 1) {
    await undo.click();
  }
  await expect(page.locator(".studio-chord-card")).toHaveCount(0);
  await expect(undo).toBeDisabled();
}

/**
 * Enter the teaching view the way a user does. The reading view keeps
 * per-measure telemetry and bar tooling out of the engraved chart
 * (jcpe-t8xh); specs that assert fill labels or drive bar tools flip the
 * real toggle first.
 */
export async function showTeachingView(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Teaching view" });
  if (await toggle.first().isVisible()) {
    await toggle.first().click();
    await expect(page.getByTestId("chart-view-mode")).toHaveText(
      "Teaching view",
    );
  }
}

/** Type chart text and publish it through the real atomic command. */
export async function typeAndInsert(page: Page, text: string): Promise<void> {
  const field = page.getByTestId("quick-entry-field");
  if (!(await field.first().isVisible())) {
    await page.locator("#studio-open-library-sheet").click();
  }
  const visible = field.filter({ visible: true }).first();
  await visible.fill(text);
  await page
    .locator("#studio-quick-entry-insert")
    .filter({ visible: true })
    .first()
    .click();
  const close = page.getByRole("button", { name: /^Close / });
  if (await close.first().isVisible()) await close.first().click();
}

/**
 * Declare a short measure through U1-CMP-019. An operation interrupted by a
 * reason-required refusal opens the dialog itself, because that declaration is
 * the only way the operation can continue; nothing is declared until Confirm.
 */
export async function declareIncompleteMeasure(
  page: Page,
  reason: string,
): Promise<void> {
  const field = page.getByTestId("incomplete-reason-field");
  await expect(field).toBeVisible();
  await field.fill(reason);
  await page.locator("#studio-confirm-incomplete").click();
  await expect(field).toHaveCount(0);
}

export function cards(page: Page): Locator {
  return page.locator(".studio-chord-card");
}

/** The stable domain identity each card is keyed by, in visual order. */
export async function chordIds(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-chord-id]")].map(
      (node) => node.getAttribute("data-chord-id") ?? "",
    ),
  );
}

/**
 * Move the chart's single tab stop to a card the way a user does: focus the
 * chart, press Home to return the roving focus to the first card, then step
 * right. Calling `.focus()` alone moves DOM focus without telling U1, and U1
 * deliberately never reads `document.activeElement`.
 */
export async function focusCard(page: Page, index: number): Promise<void> {
  await cards(page).first().focus();
  await page.keyboard.press("Home");
  for (let step = 0; step < index; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(cards(page).nth(index)).toHaveAttribute("tabindex", "0");
}

/** Open one card's More menu through its visible trigger. */
export async function openCardMenu(page: Page, index: number): Promise<void> {
  await cards(page).nth(index).getByTestId("chord-card-more").click();
  await expect(page.getByTestId("chord-card-menu")).toBeVisible();
}

export async function activateMenuItem(page: Page, label: string): Promise<void> {
  await page
    .getByTestId("chord-card-menu")
    .getByRole("menuitem", { name: label })
    .click();
}

export type ListenerCounts = Readonly<Record<string, number>>;

/**
 * Count listeners still attached to nodes the document holds. A raw
 * add-minus-remove tally would over-count listeners on discarded nodes, which
 * is not the legacy failure: L-TOUCH-01 was listeners multiplying on surviving
 * nodes. This probe measures exactly that, and can also be scoped to one
 * subtree so a per-card budget is directly measurable.
 */
export async function installListenerProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Entry = { target: EventTarget; type: string; active: boolean };
    const records: Entry[] = [];
    const proto = EventTarget.prototype;
    /* eslint-disable @typescript-eslint/unbound-method */
    const add = proto.addEventListener;
    const remove = proto.removeEventListener;
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
    proto.addEventListener = patchedAdd;
    proto.removeEventListener = patchedRemove;

    const live = (node: EventTarget): boolean =>
      node === window ||
      node === document ||
      (node instanceof Node && document.contains(node));

    Object.defineProperty(window, "__listenerCounts", {
      value: (selector?: string) => {
        const counts: globalThis.Record<string, number> = {};
        const root =
          selector === undefined
            ? null
            : document.querySelector<HTMLElement>(selector);
        for (const record of records) {
          if (!record.active) continue;
          const node = record.target;
          if (!live(node)) continue;
          if (root !== null) {
            if (!(node instanceof Node) || !root.contains(node)) continue;
          }
          counts[record.type] = (counts[record.type] ?? 0) + 1;
        }
        return counts;
      },
    });
  });
}

export async function listenerCounts(
  page: Page,
  selector?: string,
): Promise<ListenerCounts> {
  return page.evaluate(
    (scope) =>
      (
        window as unknown as {
          __listenerCounts: (selector?: string) => Record<string, number>;
        }
      ).__listenerCounts(scope),
    selector,
  );
}
