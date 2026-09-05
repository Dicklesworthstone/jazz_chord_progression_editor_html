import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
const artifact = pathToFileURL(join(process.cwd(), "jazz_chord_progression_editor.html")).href;
const artifactSha256 = createHash("sha256").update(readFileSync(new URL(artifact))).digest("hex");
const diagnostics = new WeakMap<Page, { consoleErrors: string[]; pageErrors: string[]; requests: string[] }>();

test.beforeEach(async ({ page }) => {
  const observed = { consoleErrors: [] as string[], pageErrors: [] as string[], requests: [] as string[] };
  diagnostics.set(page, observed);
  page.on("pageerror", (error) => observed.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") observed.consoleErrors.push(message.text()); });
  page.on("request", (request) => observed.requests.push(request.url().startsWith("data:") ? "data:embedded" : request.url()));
  await page.route("**/*", async (route) => {
    if (route.request().url() === artifact) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await page.goto(artifact);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
});
test.afterEach(async ({ page, browser }, info) => {
  const observed = diagnostics.get(page);
  if (observed === undefined) throw new Error("IMPORT_DIAGNOSTICS_MISSING");
  await info.attach("document-import.json", { contentType: "application/json",
    body: JSON.stringify({ artifactSha256, browserVersion: browser.version(), viewport: page.viewportSize(), test: info.title, ...observed }, null, 2) });
  expect(observed.pageErrors).toEqual([]); expect(observed.consoleErrors).toEqual([]);
});

async function exportDocument(page: Page): Promise<unknown> {
  await page.locator("#studio-export-json").click();
  await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
  const delivered = page.waitForEvent("download");
  await page.locator("#studio-lifecycle-download").click();
  const download = await delivered;
  const bytes = await readFile(await download.path(), "utf8");
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Handed off to your browser");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const parsed: unknown = JSON.parse(bytes);
  return parsed;
}
async function chooseLesson(page: Page): Promise<void> {
  const rail = page.locator("#studio-progression-two-five-one");
  if (await rail.isVisible()) await rail.click();
  else {
    await page.locator("#studio-open-standards").click();
    await page.locator("#studio-progression-two-five-one-modal").click();
  }
  await expect(page.getByRole("dialog", { name: "Load this lesson?" })).toBeVisible();
}
async function confirm(page: Page): Promise<void> {
  await page.locator("#studio-replacement-confirm").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Chart replaced. Undo restores the previous chart.")).toBeVisible();
}
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`U5 New/lesson ${String(viewport.width)}px`, () => {
    test.use({ viewport });
    test("New cancellation preserves exact JSON; confirmed New is one exact Undo/Redo boundary", async ({ page }) => {
      const original = await exportDocument(page);
      await page.locator("#studio-new-chart").click();
      await expect(page.getByRole("dialog", { name: "Start a new chart?" })).toBeVisible();
      await page.locator("#studio-replacement-cancel").click();
      await expect(page.locator("#studio-new-chart")).toBeFocused();
      expect(await exportDocument(page)).toEqual(original);
      await page.locator("#studio-new-chart").click(); await confirm(page);
      const blank = await exportDocument(page);
      expect(blank).toMatchObject({ title: "Untitled Chart", sections: [{ measures: [{ events: [] }] }] });
      await page.locator("#studio-undo").click(); expect(await exportDocument(page)).toEqual(original);
      await page.locator("#studio-redo").click(); expect(await exportDocument(page)).toEqual(blank);
    });
    test("lesson pick keeps the current chart until Confirm and installs its exact title, tempo, groove and changes", async ({ page }) => {
      const original = await exportDocument(page);
      await chooseLesson(page);
      await page.locator("#studio-replacement-cancel").click(); expect(await exportDocument(page)).toEqual(original);
      await chooseLesson(page); await confirm(page);
      const lesson = await exportDocument(page);
      expect(lesson).toMatchObject({ title: "ii–V–I in C", tempoBpm: 132, playback: { grooveStyleId: "medium-swing@1" },
        sections: [{ measures: [
          { events: [{ chord: { sourceText: "Dm7" }, duration: { numerator: 4, denominator: 1 } }] },
          { events: [{ chord: { sourceText: "G7" }, duration: { numerator: 4, denominator: 1 } }] },
          { events: [{ chord: { sourceText: "Cmaj7" }, duration: { numerator: 4, denominator: 1 } }] },
          { events: [{ chord: { sourceText: "Cmaj7" }, duration: { numerator: 4, denominator: 1 } }] },
        ] }] });
      await page.locator("#studio-undo").click(); expect(await exportDocument(page)).toEqual(original);
    });
    for (const origin of ["new", "lesson"] as const) for (const state of ["playing", "paused"] as const) {
      test(`${origin} replacement retires real ${state} playback before publishing and Undo restores the chart`, async ({ page }) => {
        const original = await exportDocument(page);
        await page.locator("#studio-transport-play").click();
        await expect(page.locator("#studio-transport-pause")).toBeEnabled();
        if (state === "paused") {
          await page.locator("#studio-transport-pause").click();
          await expect(page.locator("#studio-transport-play")).toBeEnabled();
        }
        if (origin === "new") await page.locator("#studio-new-chart").click(); else await chooseLesson(page);
        await confirm(page);
        await expect(page.locator("#studio-transport-pause")).toBeDisabled();
        const replaced = await exportDocument(page);
        expect(replaced).toMatchObject({ title: origin === "new" ? "Untitled Chart" : "ii–V–I in C" });
        await page.locator("#studio-undo").click(); expect(await exportDocument(page)).toEqual(original);
      });
    }
    test("export-first hands off the current chart and does not execute the pending replacement", async ({ page }) => {
      await page.locator("#studio-document-title").fill("Keep before replacement");
      await page.locator("#studio-document-title").press("Enter");
      await page.locator("#studio-new-chart").click();
      await page.locator("#studio-replacement-export-first").click();
      await expect(page.getByRole("dialog", { name: "Export chart as JSON" })).toBeVisible();
      await page.keyboard.press("Escape");
      expect(await exportDocument(page)).toMatchObject({ title: "Keep before replacement" });
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  });
}
