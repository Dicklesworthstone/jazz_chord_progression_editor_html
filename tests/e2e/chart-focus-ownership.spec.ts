import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const artifactPath = resolve(process.env["JCPE_FOCUS_ARTIFACT"] ?? "jazz_chord_progression_editor.html");
const artifactHash = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
const url = pathToFileURL(artifactPath).href;
declare global { interface Window { chartFocusGlobalListeners?: () => readonly string[] } }
test.use({ viewport: { width: 1440, height: 1000 }, userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });

test("repeated presentation changes retain native global listener and chart ownership", async ({ page, browser }, info) => {
  const errors: string[] = [], requests: string[] = [];
  page.on("pageerror", error => { errors.push(error.message); });
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", async route => {
    requests.push(route.request().url());
    if (route.request().isNavigationRequest() && route.request().url() === url) await route.continue(); else await route.abort();
  });
  await page.addInitScript(() => {
    type Registered = { target: EventTarget; type: string; callback: EventListenerOrEventListenerObject | null; capture: boolean };
    const active: Registered[] = [];
    const nativeAdd: unknown = Reflect.get(EventTarget.prototype, "addEventListener");
    const nativeRemove: unknown = Reflect.get(EventTarget.prototype, "removeEventListener");
    if (typeof nativeAdd !== "function" || typeof nativeRemove !== "function") throw new Error("native listener methods missing");
    EventTarget.prototype.addEventListener = function (type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      Reflect.apply(nativeAdd, this, [type, callback, options]);
      if (this !== window && this !== document) return;
      const capture = typeof options === "boolean" ? options : options?.capture ?? false;
      if (callback !== null && !active.some(row => row.target === this && row.type === type && row.callback === callback && row.capture === capture)) active.push({ target: this, type, callback, capture });
    };
    EventTarget.prototype.removeEventListener = function (type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
      Reflect.apply(nativeRemove, this, [type, callback, options]);
      const capture = typeof options === "boolean" ? options : options?.capture ?? false;
      const index = active.findIndex(row => row.target === this && row.type === type && row.callback === callback && row.capture === capture);
      if (index >= 0) active.splice(index, 1);
    };
    window.chartFocusGlobalListeners = () => active.map(row => `${row.target === window ? "window" : "document"}:${row.type}:${String(row.capture)}`).sort();
  });
  await page.goto(url);
  await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
  await expect(page.locator(".studio-chord-card")).toHaveCount(10);
  const chart = await page.locator("#chart-workspace").elementHandle();
  if (chart === null) throw new Error("missing chart node");
  const before = await page.evaluate(() => window.chartFocusGlobalListeners?.());
  expect(before?.length).toBeGreaterThan(0);
  const samples = [];
  for (let cycle = 0; cycle < 12; cycle++) {
    await page.locator("#studio-chart-focus-toggle").click();
    expect(await chart.evaluate(element => element.isConnected && element === document.querySelector("#chart-workspace"))).toBe(true);
    const listeners = await page.evaluate(() => window.chartFocusGlobalListeners?.());
    samples.push(listeners);
    expect(listeners).toEqual(before);
  }
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("#studio-chart-focus-toggle")).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
  expect(requests.filter(request => request !== url)).toEqual([]);
  await info.attach("chart-focus-native-ownership", { contentType: "application/json", body: JSON.stringify({ artifactHash, browser: browser.version(), before, samples, errors, requests }) });
});
