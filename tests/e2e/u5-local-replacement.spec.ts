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
type NativeSourceCounts = Readonly<{ started: number; sounding: number; futureAttacks: number }>;
declare global { interface Window { u5NativeSourceCounts?: () => NativeSourceCounts } }
async function observeNativeSources(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sources = new Map<AudioScheduledSourceNode, { start: number; stop: number | null; ended: boolean }>();
    const record = (source: AudioScheduledSourceNode, when: number) => {
      const row = { start: when, stop: null, ended: false };
      sources.set(source, row);
      source.addEventListener("ended", () => { row.ended = true; }, { once: true });
    };
    const captureMethod = (prototype: object, name: string) => {
      const method: unknown = Reflect.get(prototype, name);
      if (typeof method !== "function") throw new Error(`NATIVE_AUDIO_METHOD_MISSING:${name}`);
      return (receiver: AudioScheduledSourceNode, args: readonly number[]) => { Reflect.apply(method, receiver, args); };
    };
    const bufferStart = captureMethod(AudioBufferSourceNode.prototype, "start");
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      bufferStart(this, duration === undefined ? [when, offset] : [when, offset, duration]);
      record(this, when);
    };
    const oscillatorStart = captureMethod(OscillatorNode.prototype, "start");
    OscillatorNode.prototype.start = function (when = 0) { oscillatorStart(this, [when]); record(this, when); };
    for (const prototype of [AudioBufferSourceNode.prototype, OscillatorNode.prototype]) {
      const stop = captureMethod(prototype, "stop");
      prototype.stop = function (when = 0) {
        stop(this, [when]);
        const row = sources.get(this);
        if (row !== undefined) row.stop = when;
      };
    }
    window.u5NativeSourceCounts = () => {
      let sounding = 0; let futureAttacks = 0;
      for (const [source, row] of sources) {
        if (row.ended) continue;
        const now = source.context.currentTime;
        if (row.start <= now && (row.stop === null || row.stop > now)) sounding++;
        if (row.start > now && (row.stop === null || row.stop > row.start)) futureAttacks++;
      }
      return { started: sources.size, sounding, futureAttacks };
    };
  });
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
      const rail = page.locator("#studio-progression-two-five-one");
      if (await rail.isVisible()) await rail.click();
      else {
        await page.locator("#studio-open-standards").click();
        await page.locator("#studio-progression-two-five-one-modal").click();
      }
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator("#studio-document-title")).toHaveValue("ii–V–I in C");
      await expect(page.locator("#chart-workspace")).toBeFocused();
    });
    test("lesson pick keeps the current chart until Confirm and installs its exact title, tempo, groove and changes", async ({ page }) => {
      const original = await exportDocument(page);
      await chooseLesson(page);
      const owner = page.locator(viewport.width >= 1280 ? "#studio-progression-two-five-one" : "#studio-open-standards");
      await page.locator("#studio-replacement-cancel").click();
      await expect(owner).toBeFocused();
      expect(await exportDocument(page)).toEqual(original);
      await chooseLesson(page); await confirm(page);
      await expect(owner).toBeFocused();
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
    test("a disappearing lesson owner preserves the chart and exposes the focus refusal", async ({ page }) => {
      const original = await exportDocument(page);
      await chooseLesson(page);
      const ownerId = viewport.width >= 1280 ? "studio-progression-two-five-one" : "studio-open-standards";
      await page.evaluate(id => {
        const owner = document.getElementById(id);
        if (owner === null) throw new Error("LESSON_OWNER_MISSING");
        owner.hidden = true;
      }, ownerId);
      // U0 dismisses an unavailable owner before another user gesture.
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("alert").filter({ hasText: "ui.stale_owner" })).toBeVisible();
      await expect(page.locator("#studio-document-title")).toBeFocused();
      expect(await exportDocument(page)).toEqual(original);
    });
    test("losing the lesson owner during Confirm preserves the chart and a new lesson request works", async ({ page }) => {
      const original = await exportDocument(page);
      await page.locator("#studio-transport-play").click();
      await expect(page.locator("#studio-transport-pause")).toBeEnabled();
      await chooseLesson(page);
      const ownerId = viewport.width >= 1280 ? "studio-progression-two-five-one" : "studio-open-standards";
      await page.evaluate(id => {
        const owner = document.getElementById(id);
        const confirm = document.getElementById("studio-replacement-confirm");
        if (owner === null || !(confirm instanceof HTMLButtonElement)) throw new Error("CONFIRMATION_CONTROL_MISSING");
        // Remove the owner in the same event task that starts real retirement.
        confirm.click();
        owner.hidden = true;
      }, ownerId);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("alert").filter({ hasText: "ui.stale_owner" })).toBeVisible();
      expect(await exportDocument(page)).toEqual(original);
      await page.evaluate(id => { const owner = document.getElementById(id); if (owner !== null) owner.hidden = false; }, ownerId);
      await chooseLesson(page); await confirm(page);
      expect(await exportDocument(page)).toMatchObject({ title: "ii–V–I in C" });
      await page.locator("#studio-undo").click(); expect(await exportDocument(page)).toEqual(original);
    });
    test("a refused native audio-clock read reconciles safely and permits a fresh lesson replacement", async ({ page }, info) => {
      const original = await exportDocument(page);
      await observeNativeSources(page);
      await page.locator("#studio-transport-play").click();
      await expect(page.locator("#studio-transport-pause")).toBeEnabled();
      await chooseLesson(page);
      await page.evaluate(() => {
        const originalClock = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "currentTime");
        const confirm = document.getElementById("studio-replacement-confirm");
        if (originalClock?.get === undefined || !(confirm instanceof HTMLButtonElement)) throw new Error("NATIVE_CLOCK_OR_CONFIRM_MISSING");
        // Arm on the real scheduler's timer cancellation, immediately before
        // X1 reads its retirement time. Earlier display-clock reads stay real.
        const originalClear = window.clearInterval;
        window.clearInterval = id => {
          originalClear.call(window, id);
          window.clearInterval = originalClear;
          Object.defineProperty(BaseAudioContext.prototype, "currentTime", { ...originalClock, get() {
            Object.defineProperty(BaseAudioContext.prototype, "currentTime", originalClock);
            return Number.NaN;
          } });
        };
        confirm.click();
      });
      await expect(page.getByRole("alert").filter({ hasText: "Playback was safely stopped" })).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      const sourceCounts = await page.evaluate(() => window.u5NativeSourceCounts?.());
      if (sourceCounts === undefined) throw new Error("NATIVE_SOURCE_OBSERVATION_MISSING");
      expect(sourceCounts.started).toBeGreaterThan(0);
      await info.attach("native-reconciliation-sources.json", { contentType: "application/json", body: JSON.stringify(sourceCounts) });
      await expect(page.locator("#studio-replacement-cancel")).toBeEnabled();
      await page.locator("#studio-replacement-cancel").click();
      await expect(page.locator("#studio-transport-pause")).toBeDisabled();
      expect(await exportDocument(page)).toEqual(original);
      await chooseLesson(page); await confirm(page);
      expect(await exportDocument(page)).toMatchObject({ title: "ii–V–I in C" });
      await page.locator("#studio-transport-play").click();
      await expect(page.locator("#studio-transport-pause")).toBeEnabled();
      await page.locator("#studio-transport-stop").click();
      await expect(page.locator("#studio-transport-pause")).toBeDisabled();
      await page.locator("#studio-undo").click(); expect(await exportDocument(page)).toEqual(original);
    });
    test("export-first remains available after recovery and does not execute the pending replacement", async ({ page }) => {
      await page.locator("#studio-document-title").fill("Keep before replacement");
      await page.locator("#studio-document-title").press("Enter");
      await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
      await page.locator("#studio-new-chart").click();
      await page.locator("#studio-replacement-export-first").click();
      await expect(page.getByRole("dialog", { name: "Export chart as JSON" })).toBeVisible();
      await page.keyboard.press("Escape");
      expect(await exportDocument(page)).toMatchObject({ title: "Keep before replacement" });
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  });
}
