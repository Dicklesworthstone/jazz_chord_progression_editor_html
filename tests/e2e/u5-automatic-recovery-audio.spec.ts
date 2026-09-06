import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { observeNativeSources } from "../support/u5-native-audio";

declare global { interface Window { u5RecoveredAudioContexts?: number } }
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
const artifact = pathToFileURL(join(process.cwd(), "jazz_chord_progression_editor.html")).href;
const artifactSha256 = createHash("sha256").update(readFileSync(new URL(artifact))).digest("hex");

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`U5 recovered native playback ${String(viewport.width)}px`, () => {
    test.use({ viewport });
    test("automatic opening stays silent until real Play, and both Stop cycles retire native sources", async ({ page, browser }, info) => {
      const errors: string[] = []; const requests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("request", request => requests.push(request.url().startsWith("data:") ? "data:embedded" : request.url()));
      await page.route("**/*", async route => {
        if (route.request().url() === artifact) await route.continue();
        else await route.abort("blockedbyclient");
      });
      await page.addInitScript(() => {
        window.u5RecoveredAudioContexts = 0;
        const Native = window.AudioContext;
        window.AudioContext = class extends Native {
          constructor(options?: AudioContextOptions) {
            super(options);
            window.u5RecoveredAudioContexts = (window.u5RecoveredAudioContexts ?? 0) + 1;
          }
        };
      });
      await page.goto(artifact);
      await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
      await page.locator("#studio-document-title").fill("Recovered native playback");
      await page.locator("#studio-document-title").press("Enter");
      await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
      await page.reload();
      await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Recovered chart opened");
      await expect(page.locator("#studio-document-title")).toHaveValue("Recovered native playback");
      expect(await page.evaluate(() => window.u5RecoveredAudioContexts)).toBe(0);
      await observeNativeSources(page);
      const cycles = [];
      for (let cycle = 0; cycle < 2; cycle++) {
        await page.locator("#studio-transport-play").click();
        await expect(page.locator("#studio-transport-pause")).toBeEnabled();
        expect(await page.evaluate(() => window.u5RecoveredAudioContexts)).toBe(1);
        await page.locator("#studio-transport-stop").click();
        await expect(page.locator("#studio-transport-pause")).toBeDisabled();
        await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
        const counts = await page.evaluate(() => window.u5NativeSourceCounts?.());
        expect(counts?.started).toBeGreaterThan(0); cycles.push(counts);
      }
      await info.attach("automatic-native-playback.json", { contentType: "application/json", body: JSON.stringify({
        artifactSha256, browserVersion: browser.version(), viewport, cycles, errors, requests,
      }, null, 2) });
      expect(errors).toEqual([]);
    });
  });
}
