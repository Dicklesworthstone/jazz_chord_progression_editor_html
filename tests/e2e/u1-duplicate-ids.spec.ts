import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { captureDiagnostics, expectCleanDiagnostics } from "./u1-chart-kit";

/**
 * jcpe-ph6d: while a panel sheet is open, its rail must not mount a second
 * copy of the same panel content. The 2026-07-29 audit measured 69 duplicate
 * document ids with the library sheet open (quick entry, palette chips, and
 * the progression library), which breaks label/for and aria references
 * document-wide. The law proven here is stronger than the fix: at no point —
 * closed, library sheet open, harmony sheet open, or after close and a
 * resize back to rail widths — does the document contain ANY duplicate id.
 */

const PHONE = { height: 844, width: 390 } as const;
const DESKTOP = { height: 800, width: 1280 } as const;

function artifactUrl(): string {
  return pathToFileURL(
    join(process.cwd(), "jazz_chord_progression_editor.html"),
  ).href;
}

async function openAt(
  page: Page,
  viewport: Readonly<{ height: number; width: number }>,
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(artifactUrl(), { waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

async function duplicateIds(page: Page): Promise<readonly string[]> {
  return await page.evaluate(() => {
    const counts = new Map<string, number>();
    for (const element of Array.from(document.querySelectorAll("[id]"))) {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([id, count]) => `${id} x${String(count)}`)
      .sort();
  });
}

test("the library sheet never duplicates a document id", async ({ page }) => {
  const diagnostics = captureDiagnostics(page);
  await openAt(page, PHONE);
  expect(await duplicateIds(page)).toEqual([]);

  await page.locator("#studio-open-library-sheet").click();
  await expect(page.getByRole("button", { name: "Close Library" })).toBeVisible();
  expect(await duplicateIds(page)).toEqual([]);

  await page.getByRole("button", { name: "Close Library" }).click();
  expect(await duplicateIds(page)).toEqual([]);
  expectCleanDiagnostics(diagnostics);
});

test("the harmony sheet never duplicates a document id", async ({ page }) => {
  const diagnostics = captureDiagnostics(page);
  await openAt(page, PHONE);

  await page.locator("#studio-open-harmony-sheet").click();
  await expect(
    page.getByRole("button", { name: "Close Harmony Lens" }),
  ).toBeVisible();
  expect(await duplicateIds(page)).toEqual([]);

  await page.getByRole("button", { name: "Close Harmony Lens" }).click();
  expect(await duplicateIds(page)).toEqual([]);
  expectCleanDiagnostics(diagnostics);
});

test("rail content returns intact after its sheet closes", async ({
  page,
}) => {
  const diagnostics = captureDiagnostics(page);
  await openAt(page, PHONE);
  await page.locator("#studio-open-library-sheet").click();
  await expect(
    page.locator('[data-panel-context="sheet"] #studio-quick-entry-field'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Library" }).click();

  await page.setViewportSize(DESKTOP);
  const railField = page.locator("#studio-quick-entry-field");
  await expect(railField).toHaveCount(1);
  await expect(railField).toBeVisible();
  expect(await duplicateIds(page)).toEqual([]);
  expectCleanDiagnostics(diagnostics);
});
