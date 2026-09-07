import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type {} from "./u5-history-limit-harness";

let directory: string;
let scriptSha256: string;
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jcpe-u5-history-native-"));
  await promisify(execFile)(process.env["BUN_BINARY"] ?? "bun", ["build", "--target=browser", "--outdir", directory,
    "tests/e2e/u5-history-limit-harness.tsx"]);
  const script = await readFile(join(directory, "u5-history-limit-harness.js"), "utf8");
  scriptSha256 = createHash("sha256").update(script).digest("hex");
  const styles = await Promise.all(["tokens", "reset", "primitives", "ui-foundations", "ui-forms", "ui-navigation",
    "ui-overlays", "ui-structured", "app", "studio", "responsive"].map(name => readFile(join("src/styles", `${name}.css`), "utf8")));
  await writeFile(join(directory, "index.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>History boundary proof</title><style>' +
    styles.join("\n") + '</style></head><body><script type="module">' + script.replaceAll("</script", "<\\/script") + '</script></body></html>');
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) for (const events of [4096, 6144] as const) {
  test.describe(`U5 actual history boundary ${String(viewport.width)}px ${String(events)} events`, () => {
    test.use({ viewport });
    test("real size controls consent, inert cancel, exact Undo, and honest export-first", async ({ page, browser }, info) => {
      const errors: string[] = [], requests: string[] = [], downloads: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("request", request => requests.push(request.url()));
      page.on("download", download => downloads.push(download.suggestedFilename()));
      const url = pathToFileURL(join(directory, "index.html")).href;
      await page.route("**/*", route => route.request().url() === url ? route.continue() : route.abort("blockedbyclient"));
      await page.goto(url);
      await page.evaluate(events => window.u5HistoryLimit.boot(events), events);
      const before = await page.evaluate(() => window.u5HistoryLimit.read());
      expect(before).toMatchObject({ cap: 16_777_216, initialized: false, exactOriginal: true, capability: { usable: true } });
      expect(before.originalRetainedBytes > before.cap).toBe(events === 6144);
      await page.locator("#studio-new-chart").click();
      expect((await page.evaluate(() => window.u5HistoryLimit.read())).dialogs)
        .toEqual([events === 6144 ? "history-limit" : "new-document"]);
      const confirm = page.locator("#studio-replacement-confirm");
      const consent = page.getByRole("checkbox", { name: "I understand this replacement cannot be undone" });
      if (events === 6144) {
        await expect(confirm).toBeDisabled();
        await expect(page.getByRole("alert")).toContainText("cannot be undone");
        await consent.check(); await expect(confirm).toBeEnabled();
      } else { await expect(consent).toHaveCount(0); await expect(confirm).toBeEnabled(); }
      await page.locator("#studio-replacement-cancel").click();
      await expect(page.locator("#studio-new-chart")).toBeFocused();
      expect(await page.evaluate(() => window.u5HistoryLimit.read())).toMatchObject({ exactOriginal: true,
        originalObject: true, originalHistory: true, originalBookmarks: true, originalExport: true, revision: 0 });
      await page.locator("#studio-new-chart").click();
      if (events === 6144) {
        await expect(consent).not.toBeChecked(); await expect(confirm).toBeDisabled();
        await page.locator("#studio-replacement-export-first").click();
        await expect(page.getByRole("dialog", { name: "Export chart as JSON" })).toBeVisible();
        await expect(page.getByRole("alert")).toContainText("export.canonical_bytes_exceeded");
        await expect(page.locator("#studio-lifecycle-download")).toBeDisabled();
        expect(downloads).toEqual([]);
        expect(await page.evaluate(() => window.u5HistoryLimit.read())).toMatchObject({ exactOriginal: true,
          originalObject: true, originalHistory: true, originalExport: true, revision: 0 });
        await page.keyboard.press("Escape");
        await expect(page.locator("#studio-export-json")).toBeFocused();
        await page.locator("#studio-new-chart").click();
        await expect(consent).not.toBeChecked(); await expect(confirm).toBeDisabled(); await consent.check();
      }
      await confirm.click(); await expect(page.getByRole("dialog")).toHaveCount(0);
      const replaced = await page.evaluate(() => window.u5HistoryLimit.read());
      expect(replaced).toMatchObject({ title: "Untitled Chart", revision: 1, originalExport: true,
        transition: "idle", undoCount: events === 6144 ? 0 : 1, initialized: false });
      if (events === 6144) await expect(page.getByRole("status")).toContainText("Undo is unavailable at this history boundary");
      await page.locator("#history-undo").click();
      const afterUndo = await page.evaluate(() => window.u5HistoryLimit.read());
      expect(afterUndo.exactOriginal).toBe(events === 4096);
      if (events === 6144) {
        // Honest success twin: the newly created small chart uses the same
        // real export service and browser download adapter successfully.
        await page.locator("#studio-export-json").click();
        await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
        const delivery = page.waitForEvent("download"); await page.locator("#studio-lifecycle-download").click();
        const download = await delivery;
        expect(JSON.parse(await readFile(await download.path(), "utf8"))).toMatchObject({ title: "Untitled Chart" });
        await expect(page.getByRole("status")).toContainText("Handed off to your browser");
      }
      await info.attach("real-history-boundary.json", { contentType: "application/json", body: JSON.stringify({
        scriptSha256, browserVersion: browser.version(), viewport, events, before, replaced, afterUndo, errors, requests, downloads,
      }) });
      // Firefox does not emit a network request event for file navigation.
      // Prove the actual document loaded and reject every non-document request;
      // the native interaction assertions above remain identical in all engines.
      expect(page.url()).toBe(url);
      expect(requests.filter(request => request !== url)).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
