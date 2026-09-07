import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const artifactPath = resolve(process.env["JCPE_FOCUS_ARTIFACT"] ?? "jazz_chord_progression_editor.html");
const artifactHash = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
const url = pathToFileURL(artifactPath).href;
const fixture = resolve("tests/fixtures/interchange/goldens/nested.changes.json");
const expectedDocument: unknown = JSON.parse(readFileSync(fixture, "utf8"));
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });

async function boot(page: Page) {
  const errors: string[] = [], requests: { url: string; allowed: boolean }[] = [];
  page.on("pageerror", error => { errors.push(error.message); });
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", async route => {
    const allowed = route.request().isNavigationRequest() && route.request().url() === url;
    requests.push({ url: route.request().url(), allowed });
    if (allowed) await route.continue(); else await route.abort();
  });
  await page.goto(url);
  await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
  return { errors, requests };
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test.describe(`chart focus recovery ${String(viewport.width)}px`, () => {
    test.use({ viewport, hasTouch: true });
    test("native recovery and confirmation keep priority; toggling preserves exact downloaded document", async ({ page, browser }, info) => {
      const diagnostics = await boot(page);
      const geometry: unknown[] = [];
      try {
        await page.locator("#studio-import-chart").click();
        await page.locator("#studio-import-file").setInputFiles(fixture);
        await expect(page.locator("#studio-import-commit")).toBeEnabled();
        await page.locator("#studio-import-commit").click();
        await page.locator("#studio-import-confirm").click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
        await page.reload();
        await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Recovered chart opened");
        await page.locator("#studio-chart-focus-toggle").click();
        const exit = page.getByRole("button", { name: "Exit focus", exact: true });
        const chord = page.locator(".studio-chord-card").first();
        const scroller = page.locator(".studio-chart__scroller");
        const cardBox = await chord.boundingBox(), scrollBox = await scroller.boundingBox();
        geometry.push({ card: cardBox, scroller: scrollBox, exit: await exit.boundingBox() });
        if (cardBox === null || scrollBox === null) throw new Error("missing focus geometry");
        expect(scrollBox.height).toBeGreaterThanOrEqual(cardBox.height);
        await chord.scrollIntoViewIfNeeded(); await chord.tap();
        await expect(chord).toHaveAttribute("data-selected", "true");
        await page.locator("#studio-recovery-new").click();
        await expect(page.locator("#studio-replacement-confirm")).toBeVisible();
        // Native Tab must remain in the recovery dialog rather than finding Exit.
        for (let step = 0; step < 5; step++) {
          await page.keyboard.press("Tab");
          expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
        }
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator("#studio-recovery-new")).toBeFocused();
        await expect(exit).toHaveAttribute("aria-pressed", "true");
        await exit.click();
        await page.locator("#studio-export-json").click();
        await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
        const pending = page.waitForEvent("download");
        await page.locator("#studio-lifecycle-download").click();
        const downloaded: unknown = JSON.parse(await readFile(await (await pending).path(), "utf8"));
        expect(downloaded).toEqual(expectedDocument);
        await expect(page.getByRole("dialog").getByRole("status")).toContainText("Handed off to your browser");
        await page.keyboard.press("Escape");
        expect(diagnostics.errors).toEqual([]); expect(diagnostics.requests.filter(row => !row.allowed)).toEqual([]);
      } finally {
        await info.attach("chart-focus-recovery", { contentType: "application/json", body: JSON.stringify({ artifactHash, browser: browser.version(), viewport, geometry, ...diagnostics }) });
      }
    });
  });
}

test.describe("chart focus unavailable preferences and magnification", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test("200 percent CSS layout retains usable controls with storage unavailable and reduced motion", async ({ page, browser }, info) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Preferences unavailable", "SecurityError"); } });
    });
    const diagnostics = await boot(page);
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await page.locator("#studio-chart-focus-toggle").click();
    const exit = page.getByRole("button", { name: "Exit focus", exact: true });
    await expect(exit).toBeVisible();
    const card = page.locator(".studio-chord-card").first();
    await card.scrollIntoViewIfNeeded();
    const boxes = { card: await card.boundingBox(), scroller: await page.locator(".studio-chart__scroller").boundingBox(), exit: await exit.boundingBox(), stop: await page.locator("#studio-transport-stop").boundingBox() };
    if (boxes.card === null || boxes.scroller === null || boxes.exit === null || boxes.stop === null) throw new Error("missing magnified controls");
    expect(boxes.scroller.height).toBeGreaterThanOrEqual(boxes.card.height);
    for (const selector of ["#studio-chart-focus-toggle", "#studio-transport-stop"]) {
      const control = page.locator(selector);
      await control.scrollIntoViewIfNeeded();
      expect(await control.evaluate(element => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit !== null && (hit === element || element.contains(hit));
      })).toBe(true);
    }
    await page.locator("#studio-open-command-lane").click();
    await page.getByTestId("command-lane-input").fill("| Dm7:2 G7:2 |");
    await page.keyboard.press("Escape");
    await exit.click();
    await expect(page.getByRole("button", { name: "Focus chart", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(diagnostics.errors).toEqual([]); expect(diagnostics.requests.filter(row => !row.allowed)).toEqual([]);
    await info.attach("chart-focus-magnification", { contentType: "application/json", body: JSON.stringify({ artifactHash, browser: browser.version(), boxes, ...diagnostics }) });
  });
});
