import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type {} from "./midi-export-dismissal-harness";
let directory: string, url: string;
const sourceHashes: Record<string, string> = {};
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jcpe-midi-dismissal-"));
  await promisify(execFile)("bun", ["build", "--target=browser", "--outdir", directory, "tests/e2e/midi-export-dismissal-harness.tsx"]);
  await writeFile(join(directory, "index.html"), '<!doctype html><html lang="en"><head><title>JazzChords.org export proof</title></head><body></body></html>');
  url = pathToFileURL(join(directory, "index.html")).href;
  for (const path of ["src/ui/App.tsx", "src/ui/studio/StudioShell.tsx", "src/application/studio-midi-export.ts"])
    sourceHashes[path] = createHash("sha256").update(await readFile(path)).digest("hex");
});
for (const width of [320, 1280]) for (const scenario of ["hash cancellation", "reopen during hash", "delivery dismissal", "cleanup failure"] as const) {
  test(`MIDI export ${scenario} at ${String(width)}px`, async ({ page, browser }, info) => {
    const errors: string[] = [], requests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", route => {
      if (route.request().url() === url && route.request().isNavigationRequest()) return route.continue();
      requests.push(route.request().url()); return route.abort();
    });
    try {
      await page.setViewportSize({ width, height: 900 }); await page.goto(url);
      for (const name of ["tokens", "reset", "primitives", "ui-foundations", "ui-forms", "ui-navigation", "ui-overlays", "ui-structured", "app", "studio", "responsive"])
        await page.addStyleTag({ path: join("src/styles", name + ".css") });
      await page.addScriptTag({ path: join(directory, "midi-export-dismissal-harness.js"), type: "module" });
      await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready", "true");
      const revision = await page.evaluate(() => window.midiDismissalProof.revision());
      if (scenario === "hash cancellation" || scenario === "reopen during hash") await page.evaluate(() => { window.midiDismissalProof.holdHash(); });
      await page.locator("#studio-export-midi").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      if (scenario === "hash cancellation" || scenario === "reopen during hash") {
        expect(await page.evaluate(() => window.midiDismissalProof.state())).toBe("preparing");
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
        await expect(page.locator("#studio-export-midi")).toBeFocused();
        if (scenario === "reopen during hash") {
          await page.locator("#studio-export-midi").click();
          await expect(page.getByText("Another export is already being prepared; let it finish first.", { exact: true })).toBeVisible();
          await expect(dialog).toHaveCount(0);
        }
        await page.evaluate(() => window.midiDismissalProof.finishHash());
        await expect.poll(() => page.evaluate(() => window.midiDismissalProof.state())).toBe("empty");
        await expect(dialog).toHaveCount(0);
        await page.locator("#studio-export-midi").click(); await expect(dialog).toBeVisible();
      }
      if (scenario === "cleanup failure") await page.evaluate(() => { window.midiDismissalProof.failCleanup(); });
      for (let round = 0; round < (scenario === "cleanup failure" ? 2 : 1); round++) {
        if (round > 0) { await page.locator("#studio-export-midi").click(); await expect(dialog).toBeVisible(); }
      await dialog.getByRole("button", { name: "Generate the MIDI file", exact: true }).click();
      const digest = await dialog.getByTestId(`studio-midi-export-hash-${width < 640 ? "sheet" : "dialog"}`).textContent();
      const downloading = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "Download this file", exact: true }).click();
      const download = await downloading;
      const bytes = await readFile(await download.path());
      expect(await download.failure()).toBeNull(); expect(bytes.subarray(0, 4).toString()).toBe("MThd");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
      await expect(dialog).toContainText("Handing the file to the browser");
      expect(await page.evaluate(() => window.midiDismissalProof.state())).toBe("delivering");
      await expect(dialog.getByRole("button", { name: /^Close/ })).toBeDisabled();
      await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
      expect(await page.evaluate(() => window.midiDismissalProof.state())).toBe("delivering");
      await page.evaluate(() => window.midiDismissalProof.finishDelivery());
      if (scenario === "cleanup failure" && round === 0) {
        await expect(dialog).toContainText("u7.delivery_cleanup_failed");
        await expect(dialog).toContainText("cleanup could not be proven");
      } else {
        await expect(dialog).toContainText("was handed to the browser");
      }
      expect(await page.evaluate(() => window.midiDismissalProof.urls())).toEqual({ created: round + 1, revoked: round + 1 });
      await dialog.getByRole("button", { name: "Done", exact: true }).click(); await expect(dialog).toHaveCount(0);
      await expect(page.locator("#studio-export-midi")).toBeFocused();
      expect(await page.evaluate(() => window.midiDismissalProof.state())).toBe("empty");
      }
      expect(await page.evaluate(() => window.midiDismissalProof.revision())).toBe(revision);
      expect(errors).toEqual([]); expect(requests).toEqual([]);
    } finally {
      await info.attach("export-dismissal-proof", { contentType: "application/json", body: JSON.stringify({ scenario, width, sourceHashes, browser: browser.version(), errors, requests }) });
    }
  });
}
