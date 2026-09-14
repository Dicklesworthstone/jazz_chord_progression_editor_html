import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const artifact = resolve("jazz_chord_progression_editor.html");
const url = pathToFileURL(artifact).href;
const hash = createHash("sha256").update(readFileSync(artifact)).digest("hex");
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });

test("keyboard seeks preserve a fractional paused playhead", async ({ page, browser }, info) => {
  const errors: string[] = [];
  const requests: string[] = [];
  const positions: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", async route => {
    if (route.request().isNavigationRequest() && route.request().url() === url) await route.continue();
    else { requests.push(route.request().url()); await route.abort(); }
  });
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    // Empty-startup recovery seeds the starter chart asynchronously. Capture
    // its revision only once the transport can play that completed chart.
    await expect(page.locator("#studio-transport-play")).toBeEnabled();
    const revision = await page.locator(".studio-document-status__revision").textContent();
    await page.locator("#studio-transport-play").click();
    await expect(page.locator("#transport-bar")).toHaveAttribute("data-audio-state", "playing");
    await page.locator("#studio-transport-pause").click();
    await expect(page.locator("#transport-bar")).toHaveAttribute("data-audio-state", "paused");
    const slider = page.locator("#studio-transport-scrub");
    const bounds = await slider.boundingBox();
    if (bounds === null) throw new Error("Missing scrubber bounds");
    const priorPosition = await slider.getAttribute("aria-valuetext");
    await slider.click({ position: { x: bounds.width / 7, y: bounds.height / 2 } });
    // The real pointer adapter quantizes to 960 PPQ. Read its settled exact
    // value, then independently add one whole beat without rounding it.
    await expect(slider).not.toHaveAttribute("aria-valuetext", priorPosition ?? "");
    await expect(slider).toHaveAttribute("aria-valuetext", /\([1-9]\d*\/\d+ beats\)/u);
    const before = await slider.getAttribute("aria-valuetext");
    const match = /\((\d+)\/(\d+) beats\)/u.exec(before ?? "");
    if (match?.[1] === undefined || match[2] === undefined) throw new Error("Missing exact playhead");
    const n = Number(match[1]), d = Number(match[2]);
    expect(d).toBeGreaterThan(2);
    positions.push(before ?? "");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuetext", new RegExp(`\\(${String(n + d)}/${String(d)} beats\\)`, "u"));
    expect(Number(await slider.getAttribute("aria-valuenow"))).toBe((n + d) / d);
    positions.push(await slider.getAttribute("aria-valuetext") ?? "");
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuetext", before ?? "");
    await page.keyboard.press("Space");
    await expect(page.locator("#transport-bar")).toHaveAttribute("data-audio-state", "paused");
    await page.locator("#studio-transport-stop").click();
    await expect(page.locator("#transport-bar")).toHaveAttribute("data-audio-state", "ready");
    expect(await page.locator(".studio-document-status__revision").textContent()).toBe(revision);
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  } finally {
    await info.attach("exact-keyboard-seek", { body: JSON.stringify({ hash, browser: browser.version(), positions, errors, requests }), contentType: "application/json" });
  }
});
