import { expect, test, type Locator } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const artifact = resolve("jazz_chord_progression_editor.html");
const hash = createHash("sha256").update(readFileSync(artifact)).digest("hex");
const url = pathToFileURL(artifact).href;
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });

async function contained(dialog: Locator): Promise<void> {
  const geometry = await dialog.evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth, scroll: element.scrollLeft }));
  expect(geometry.content).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.scroll).toBe(0);
}

async function reachable(key: Locator): Promise<void> {
  await expect(key).toBeInViewport();
  expect(await key.evaluate(element => {
    const box = element.getBoundingClientRect();
    // The lower white-key face avoids its neighboring black-key overlap.
    const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 12);
    return hit !== null && element.contains(hit);
  })).toBe(true);
}

for (const width of [320, 1280]) test(`inspector scrolls only its tabs and piano at ${String(width)}px`, async ({ page, browser, browserName }, info) => {
  const errors: string[] = [], requests: { url: string; allowed: boolean }[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/*", async route => {
    const allowed = route.request().isNavigationRequest() && route.request().url() === url;
    requests.push({ url: route.request().url(), allowed });
    if (allowed) await route.continue(); else await route.abort();
  });
  try {
    await page.goto(url);
    await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
    await page.locator(".studio-chord-card").first().click();
    await page.locator("#studio-transport-stop").click();
    const before = await page.locator(".studio-document-status__revision").textContent();
    const open = async () => {
      if (width === 320) await page.locator("#studio-open-harmony-sheet").click();
      await page.getByRole("button", { name: "Choose voicing / Edit chord", exact: true }).click();
    };
    await open();
    const dialog = page.getByRole("dialog", { name: "Edit chord", exact: true });
    await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
    await contained(dialog);
    await dialog.getByRole("tab", { name: "Voicing", exact: true }).focus();
    await page.keyboard.press("Home");
    for (const name of ["Symbol", "Structure", "Timing", "Voicing", "Harmony", "Motion", "Notes"]) {
      await expect(dialog.getByRole("tab", { name, exact: true })).toBeFocused();
      await expect(dialog.getByRole("tabpanel", { name, exact: true })).toBeVisible();
      await contained(dialog);
      await page.keyboard.press("ArrowRight");
    }
    await dialog.getByRole("tab", { name: "Voicing", exact: true }).click();
    const first = dialog.locator("#inspector-piano-36"), last = dialog.locator("#inspector-piano-84");
    await first.focus(); await first.scrollIntoViewIfNeeded(); await reachable(first);
    await page.keyboard.press("End"); await expect(last).toBeFocused(); await reachable(last);
    expect(await dialog.locator(".studio-inspector-piano-scroll").evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await contained(dialog);
    if (browserName === "chromium") await page.screenshot({ path: info.outputPath("piano-last-key.png") });
    await page.keyboard.press("Home"); await expect(first).toBeFocused(); await reachable(first);
    if (browserName === "chromium") await page.screenshot({ path: info.outputPath("piano-first-key.png") });
    const rows = dialog.locator(".studio-inspector-notes > li"), count = await rows.count();
    await page.keyboard.press("Enter"); await expect(rows).toHaveCount(count + 1);
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("region", { name: "Unsaved inspector draft" })).toBeVisible();
    await dialog.getByRole("button", { name: "Continue editing", exact: true }).click();
    await expect(rows).toHaveCount(count + 1);
    await dialog.getByRole("button", { name: "Discard draft", exact: true }).click();
    await expect(rows).toHaveCount(count);
    await dialog.getByRole("button", { name: "Close chord inspector", exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(page.locator("#chart-workspace")).toBeFocused();
    await open(); await expect(dialog).toBeVisible(); await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0); await expect(page.locator("#chart-workspace")).toBeFocused();
    await expect(page.locator(".studio-shell-notice")).toHaveCount(0);
    expect(await page.locator(".studio-document-status__revision").textContent()).toBe(before);
    expect(errors).toEqual([]); expect(requests.every(request => request.allowed)).toBe(true);
  } finally {
    await info.attach("inspector-layout", { body: JSON.stringify({ hash, width, browser: browser.version(), errors, requests }), contentType: "application/json" });
  }
});
