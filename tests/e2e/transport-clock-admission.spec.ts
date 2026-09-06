import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { observeNativeSources } from "../support/u5-native-audio";

declare global { interface Window { admissionClockJump?: { nativeTime: number; reportedTime: number } } }
const bytes = readFileSync(join(process.cwd(), "jazz_chord_progression_editor.html"), "utf8");
const artifact = pathToFileURL(join(process.cwd(), "jazz_chord_progression_editor.html")).href;
const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
// Locate the real engine admission frame in the minified artifact. This only
// identifies the native clock fault-injection point; it supplies no outcome.
const marker = '"voiceBatchesValidated",1';
const position = bytes.indexOf(marker);
if (position < 0 || bytes.indexOf(marker, position + 1) >= 0) throw new Error("ATTACK_ADMISSION_MARKER_INVALID");
const start = bytes.lastIndexOf("function ", position);
const frame = /^function ([A-Za-z_$][A-Za-z0-9_$]*)\(/u.exec(bytes.slice(start))?.[1];
if (frame === undefined) throw new Error("ATTACK_ADMISSION_FRAME_MISSING");

test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`native attack admission ${String(viewport.width)}px`, () => {
    test.use({ viewport });
    for (const instrument of ["organ", "ukulele"]) test(`${instrument} survives a clock advance at engine admission`, async ({ page, browser }, info) => {
      const consoleErrors: string[] = []; const pageErrors: string[] = []; const requests: string[] = [];
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", error => pageErrors.push(error.message));
      page.on("request", request => requests.push(request.url().startsWith("data:") ? "data:embedded" : request.url()));
      await page.route("**/*", async route => {
        if (route.request().url() === artifact) await route.continue();
        else await route.abort("blockedbyclient");
      });
      try {
        await page.goto(artifact);
        await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
        const desktopInstrument = page.locator("#studio-transport-instrument");
        if (await desktopInstrument.isVisible()) await desktopInstrument.selectOption(instrument);
        else {
          await page.locator("#studio-open-sound-sheet").click();
          await page.locator("#studio-transport-instrument-sheet").selectOption(instrument);
          await page.keyboard.press("Escape");
        }
        await observeNativeSources(page);
        await page.evaluate(frameName => {
          const original = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "currentTime");
          if (original === undefined) throw new Error("NATIVE_CLOCK_MISSING");
          const readClock: unknown = Reflect.get(original, "get");
          if (typeof readClock !== "function") throw new Error("NATIVE_CLOCK_GETTER_MISSING");
          const escaped = frameName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
          const inAttack = new RegExp(`(?:^|[\\s.])${escaped}(?:[\\s(@])`, "u");
          Object.defineProperty(BaseAudioContext.prototype, "currentTime", { ...original, get() {
            const nativeTime: unknown = Reflect.apply(readClock, this, []);
            if (typeof nativeTime !== "number") throw new Error("NATIVE_CLOCK_INVALID");
            if (inAttack.test(new Error().stack ?? "")) {
              Object.defineProperty(BaseAudioContext.prototype, "currentTime", original);
              const reportedTime = nativeTime + 0.04;
              window.admissionClockJump = { nativeTime, reportedTime };
              return reportedTime;
            }
            return nativeTime;
          } });
        }, frame);
        await page.locator("#studio-transport-play").click();
        await expect(page.locator("#studio-transport-pause")).toBeEnabled();
        await expect.poll(() => page.evaluate(() => window.admissionClockJump !== undefined)).toBe(true);
        await page.waitForTimeout(1000);
        await expect(page.locator("#studio-transport-status-detail")).toContainText("Playing");
        const jump = await page.evaluate(() => window.admissionClockJump);
        if (jump === undefined) throw new Error("CLOCK_ADVANCE_NOT_EXERCISED");
        expect(jump.reportedTime - jump.nativeTime).toBeCloseTo(0.04, 8);
        const beforeStop = await page.evaluate(() => window.u5NativeSourceCounts?.());
        expect(beforeStop?.started).toBeGreaterThan(0);
        await page.locator("#studio-transport-stop").click();
        await expect(page.locator("#studio-transport-pause")).toBeDisabled();
        await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
        const afterStop = await page.evaluate(() => window.u5NativeSourceCounts?.());
        await page.locator("#studio-transport-play").click();
        await expect(page.locator("#studio-transport-pause")).toBeEnabled();
        await page.locator("#studio-transport-stop").click();
        await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
        await info.attach("admission-clock-and-sources.json", { contentType: "application/json", body: JSON.stringify({ jump, beforeStop, afterStop }) });
      } finally {
        const observed = await page.evaluate(() => ({ jump: window.admissionClockJump,
          sources: window.u5NativeSourceCounts?.(), status: document.getElementById("studio-transport-status-detail")?.textContent }));
        await info.attach("admission-browser-diagnostics.json", { contentType: "application/json",
          body: JSON.stringify({ artifactSha256, instrument, frame, viewport, browserVersion: browser.version(), consoleErrors, pageErrors, requests, observed }) });
        expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]);
      }
    });
  });
}
