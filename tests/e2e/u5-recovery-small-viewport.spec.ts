import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const artifact = pathToFileURL(join(process.cwd(), "jazz_chord_progression_editor.html")).href;
const artifactSha256 = createHash("sha256").update(readFileSync(new URL(artifact))).digest("hex");
const fixture = join(process.cwd(), "tests/fixtures/interchange/goldens/nested.changes.json");
const expectedDocument: unknown = JSON.parse(readFileSync(fixture, "utf8"));

async function expectReachable(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  const blocked = await target.evaluate(element => {
    const box = element.getBoundingClientRect();
    // Center and axis edges detect clipping while remaining inside both
    // rectangular cards and the circular Play button's actual hit shape.
    return [[0.5, 0.5], [0.1, 0.5], [0.9, 0.5], [0.5, 0.1], [0.5, 0.9]].flatMap(([x = 0.5, y = 0.5]) => {
      const hit = document.elementFromPoint(box.x + box.width * x, box.y + box.height * y);
      return hit !== null && (hit === element || element.contains(hit)) ? []
        : [{ x, y, target: element.id || element.getAttribute("class"), hit: hit?.id || hit?.getAttribute("class") || null }];
    });
  });
  expect(blocked).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const cell of [
  { width: 320, height: 568, hasTouch: false },
  { width: 320, height: 568, hasTouch: true },
  { width: 390, height: 844, hasTouch: true },
  { width: 1280, height: 900, hasTouch: false },
]) {
  test.describe(`U5 recovered chart space ${String(cell.width)}x${String(cell.height)} ${cell.hasTouch ? "touch" : "pointer"}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.hasTouch,
      userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });

    test("recovery leaves room for a whole chord and preserves reachable choices, focus and exact JSON", async ({ page, browser }, info) => {
      const errors: string[] = []; const requests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("request", request => requests.push(request.url().startsWith("data:") ? "data:embedded" : request.url()));
      await page.route("**/*", async route => {
        if (route.request().url() === artifact) await route.continue();
        else await route.abort("blockedbyclient");
      });
      const dimensions: unknown[] = [];
      try {
        await page.goto(artifact);
        await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
        await page.locator("#studio-import-chart").click();
        await page.locator("#studio-import-file").setInputFiles(fixture);
        await expect(page.locator("#studio-import-commit")).toBeEnabled();
        await page.locator("#studio-import-commit").click();
        await page.locator("#studio-import-confirm").click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
        await page.reload();
        await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Recovered chart opened");
        await expect(page.locator("#studio-document-title")).toHaveValue("Nested Canonical Order");

        const chord = page.locator(".studio-chord-card").first();
        const scrollport = page.locator(".studio-chart__scroller");
        const chordBox = await chord.boundingBox(); const scrollBox = await scrollport.boundingBox();
        dimensions.push({ phase: "opened", chord: chordBox, scrollport: scrollBox });
        expect(chordBox).not.toBeNull(); expect(scrollBox).not.toBeNull();
        if (chordBox === null || scrollBox === null) throw new Error("CHART_BOUNDS_MISSING");
        // A whole actual card must fit; the 320x568 baseline has a 0px scrollport.
        expect(scrollBox.height).toBeGreaterThanOrEqual(chordBox.height);
        if (cell.width < 640) {
          const frame = page.locator(".studio-shell__frame");
          // Reset only the observation position. The proof must use native
          // input: scrollIntoView can also move an overflow:hidden ancestor.
          await frame.evaluate(element => { element.scrollTop = 0; });
          expect(await frame.evaluate(element => element.scrollTop)).toBe(0);
          await page.mouse.move(8, 8);
          await page.mouse.wheel(0, 320);
          await expect.poll(() => frame.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
          dimensions.push({ phase: "native-wheel", frameScrollTop: await frame.evaluate(element => element.scrollTop) });
        }
        await expectReachable(page, chord);
        if (cell.hasTouch) await chord.tap(); else await chord.click();
        await expect(chord).toHaveAttribute("data-selected", "true");
        dimensions.push({ phase: "selected", chord: await chord.boundingBox(), scrollport: await scrollport.boundingBox() });
        await expectReachable(page, page.locator("#studio-transport-play"));
        await expectReachable(page, page.locator("#studio-recovery-discard"));
        await expectReachable(page, page.locator("#studio-recovery-new"));
        await page.locator("#studio-recovery-new").click();
        await expect(page.locator("#studio-replacement-confirm")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator("#studio-recovery-new")).toBeFocused();
        await expectReachable(page, page.locator("#studio-recovery-new"));

        await page.locator("#studio-export-json").click();
        await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
        const downloadEvent = page.waitForEvent("download");
        await page.locator("#studio-lifecycle-download").click();
        const path = await (await downloadEvent).path();
        const downloaded: unknown = JSON.parse(await readFile(path, "utf8"));
        expect(downloaded).toEqual(expectedDocument);
        // File arrival precedes export-marker settlement; dismissal stays
        // blocked until the application finishes that handoff.
        await expect(page.getByRole("dialog").getByRole("status")).toContainText("Handed off to your browser");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expectReachable(page, chord);
      } finally {
        await info.attach("recovery-chart-space.json", { contentType: "application/json", body: JSON.stringify({
          artifactSha256, browserVersion: browser.version(), cell, dimensions, errors, requests,
        }, null, 2) });
        expect(errors).toEqual([]);
      }
    });
  });
}
