import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
const artifact = pathToFileURL(join(process.cwd(), "jazz_chord_progression_editor.html")).href;
const fixture = join(process.cwd(), "tests/fixtures/interchange/goldens/nested.changes.json");
const canonical = readFileSync(fixture, "utf8");
const expectedDocument: unknown = JSON.parse(canonical);
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
    body: JSON.stringify({ artifactSha256, fixtureSha256: createHash("sha256").update(canonical).digest("hex"),
      browserVersion: browser.version(), viewport: page.viewportSize(), test: info.title, ...observed }, null, 2) });
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
async function previewFile(page: Page): Promise<void> {
  await page.locator("#studio-import-chart").click();
  await page.locator("#studio-import-file").setInputFiles(fixture);
  await expect(page.getByRole("region", { name: "Import preview" })).toContainText("1 Manual; 1 Frozen; 1 Custom");
  await expect(page.locator("#studio-import-commit")).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function replacePreview(page: Page): Promise<void> {
  await page.locator("#studio-import-commit").click();
  await expect(page.getByRole("dialog", { name: "Replace the current chart?" })).toBeVisible();
  await page.locator("#studio-import-confirm").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#studio-document-title")).toHaveValue("Nested Canonical Order");
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`U5 document import ${String(viewport.width)}px`, () => {
    test.use({ viewport });
    test("local file preview and Cancel are inert; confirmed import exports exactly and Undo restores the chart", async ({ page }) => {
      const original = await exportDocument(page);
      if (typeof original !== "object" || original === null) throw new Error("EXPORT_DOCUMENT_MISSING");
      await page.locator("#studio-document-title").fill("Before import");
      await page.locator("#studio-document-title").press("Enter");
      await previewFile(page);
      await expect(page.locator("#studio-document-title")).toHaveValue("Before import");
      await page.locator("#studio-import-commit").click();
      await expect(page.getByRole("dialog", { name: "Replace the current chart?" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#studio-import-chart")).toBeFocused();
      expect(await exportDocument(page)).toEqual({ ...original, title: "Before import" });
      // Make this a dirty-chart replacement even after the successful export.
      await page.locator("#studio-document-title").fill("Before import, edited");
      await page.locator("#studio-document-title").press("Enter");
      await previewFile(page); await replacePreview(page);
      await expect(page.getByText(/^Exported at revision /u)).toHaveCount(0);
      expect(await exportDocument(page)).toEqual(expectedDocument);
      await page.locator("#studio-undo").click();
      await expect(page.locator("#studio-document-title")).toHaveValue("Before import, edited");
      // The whole old document returns, with only the independently authored title edit.
      expect(await exportDocument(page)).toEqual({ ...original, title: "Before import, edited" });
    });

    test("a pasted canonical file larger than the widget draft bound keeps every byte of document data", async ({ page }) => {
      expect(canonical.length).toBeGreaterThan(4096);
      await page.locator("#studio-import-chart").click();
      // Exercise the real browser ClipboardEvent/DataTransfer adapter and the
      // owned widget's paste handler, including data beyond its typed draft cap.
      await page.locator("#studio-import-paste").evaluate((element, text) => {
        const clipboard = new DataTransfer(); clipboard.setData("text/plain", text);
        element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
      }, canonical);
      await expect(page.locator("#studio-import-commit")).toBeEnabled();
      await replacePreview(page);
      expect(await exportDocument(page)).toEqual(expectedDocument);
    });

    test("imported document ID survives cold reload, Keep, and Discard without reviving an older chart", async ({ page }) => {
      await page.locator("#studio-document-title").fill("Older starter recovery");
      await page.locator("#studio-document-title").press("Enter");
      await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
      await previewFile(page); await replacePreview(page);
      await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
      await page.reload();
      await expect(page.locator("#studio-recovery-keep")).toBeVisible();
      await page.locator("#studio-recovery-keep").click();
      await expect(page.locator("#studio-document-title")).toHaveValue("Nested Canonical Order");
      expect(await exportDocument(page)).toEqual(expectedDocument);
      await page.reload(); await expect(page.locator("#studio-recovery-discard")).toBeVisible();
      await page.locator("#studio-recovery-discard").click();
      await expect(page.locator("#studio-recovery-discard")).toHaveCount(0);
      await page.reload();
      await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
      // Span the maximum write window as well as startup's async storage read.
      await page.waitForTimeout(2_500);
      await expect(page.locator("#studio-recovery-keep")).toHaveCount(0);
    });

    test("legacy reports preserve Manual notes and text goes to Quick entry without replacing", async ({ page }) => {
      const source = JSON.stringify({ name: "Legacy manual chart", sections: [{ name: "A", chords: [
        { name: "Cmaj7", root: "C", type: "maj7", notes: ["C3", "E3", "G3", "B3"], annotation: "Keep me" },
      ] }] });
      await page.locator("#studio-import-chart").click();
      await page.locator("#studio-import-paste").fill(source);
      await page.locator("#studio-import-preview-text").click();
      await expect(page.getByRole("region", { name: "preserved", exact: true })).toContainText("legacy.preserved.manual_notes");
      await page.locator("#studio-import-commit").click(); await page.locator("#studio-import-confirm").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await exportDocument(page)).toMatchObject({ title: "Legacy manual chart", sections: [{ measures: [{ events: [{
        annotation: "Keep me", voicing: { mode: "manual", pitches: [
          { step: "C", alter: 0, octave: 3 }, { step: "E", alter: 0, octave: 3 },
          { step: "G", alter: 0, octave: 3 }, { step: "B", alter: 0, octave: 3 },
        ] },
      }] }] }] });
      await page.locator("#studio-import-chart").click();
      await page.locator("#studio-import-paste").fill("[Bridge]\n| Dm7 G7 | Cmaj7 |");
      await page.locator("#studio-import-preview-text").click();
      await expect(page.locator("#studio-import-commit")).toHaveCount(0);
      await page.locator("#studio-import-stage-text").click();
      await expect(page.locator("#studio-document-title")).toHaveValue("Legacy manual chart");
      if (!(await page.locator("#studio-quick-entry-field").isVisible())) await page.locator("#studio-open-library-sheet").click();
      await expect(page.locator("#studio-quick-entry-field")).toHaveValue("[Bridge]\n| Dm7 G7 | Cmaj7 |");
    });

    for (const state of ["playing", "paused"] as const) {
      test(`confirmed import retires real ${state} playback before installing the candidate`, async ({ page }) => {
        await page.locator("#studio-transport-play").click();
        await expect(page.locator("#studio-transport-pause")).toBeEnabled();
        if (state === "paused") {
          await page.locator("#studio-transport-pause").click();
          await expect(page.locator("#studio-transport-play")).toBeEnabled();
          await expect(page.locator("#studio-transport-stop")).toBeEnabled();
        }
        await previewFile(page);
        await expect(page.locator("#studio-document-title")).not.toHaveValue("Nested Canonical Order");
        await replacePreview(page);
        await expect(page.locator("#studio-transport-stop")).toBeDisabled();
        await expect(page.locator("#studio-transport-pause")).toBeDisabled();
        expect(await exportDocument(page)).toEqual(expectedDocument);
      });
    }
  });
}
