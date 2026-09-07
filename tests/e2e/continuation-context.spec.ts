import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { typeAndInsert } from "./u1-chart-kit";

const artifactPath = resolve("jazz_chord_progression_editor.html");
const artifact = readFileSync(artifactPath);
const artifactHash = createHash("sha256").update(artifact).digest("hex");
const userAgent = "OpenAI File Downloader, XaiImageApiFetch/1.0";
let server: Server;
let httpUrl: string;
test.beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url !== "/") { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(artifact);
  });
  await new Promise<void>(ready => { server.listen(0, "127.0.0.1", ready); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No local artifact server address");
  httpUrl = `http://127.0.0.1:${String(address.port)}/`;
});
test.afterAll(async () => { await new Promise<void>((done, reject) => { server.close(error => { if (error) reject(error); else done(); }); }); });

async function lens(page: Page) {
  const section = page.locator('[data-testid^="lens-continuation-"]').filter({ visible: true });
  if (!(await section.first().isVisible())) {
    await page.locator("#studio-open-harmony-sheet, #studio-transport-open-harmony").filter({ visible: true }).first().click();
  }
  await expect(section.first()).toBeVisible();
  return section.first();
}
async function closeSheet(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: /^Close Harmony Lens/ }).filter({ visible: true });
  if (await close.count() > 0) await close.first().click();
}
async function clear(page: Page): Promise<void> {
  await closeSheet(page);
  const button = page.locator("#studio-clear-chart");
  await button.click(); await expect(button).toHaveText("Really clear?"); await button.press("Enter");
  await expect(page.locator(".studio-chord-card")).toHaveCount(0);
}
async function sourceView(page: Page) {
  return page.evaluate(() => ({
    revision: document.querySelector(".studio-document-status__revision")?.textContent,
    title: document.querySelector<HTMLInputElement>('[aria-label="Chart title"]')?.value,
    cards: [...document.querySelectorAll(".studio-chord-card")].map(card => ({
      id: card.getAttribute("data-chord-id"), symbol: card.querySelector(".studio-chord-card__symbol")?.textContent,
      name: card.getAttribute("aria-label"),
    })),
  }));
}

for (const mode of ["file", "http"] as const) for (const width of [1280, 390]) {
  test.describe(`${mode} ${String(width)}px continuation context`, () => {
    test.use({ viewport: { width, height: 844 }, userAgent, contextOptions: { reducedMotion: "reduce" } });
    test("real starter, contained twin and altered barrier preserve source and expose honest evidence", async ({ page, context, browser }, info) => {
      const errors: string[] = [], pageErrors: string[] = [], requests: { url: string; allowed: boolean }[] = [];
      const url = mode === "file" ? pathToFileURL(artifactPath).href : httpUrl;
      const observations: unknown[] = [];
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", error => { pageErrors.push(error.message); });
      await context.route("**/*", async route => {
        const allowed = route.request().isNavigationRequest() && route.request().url() === url;
        requests.push({ url: route.request().url(), allowed });
        if (allowed) await route.continue(); else await route.abort();
      });
      try {
        await page.goto(url);
        expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
        await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
        await expect(page.locator(".studio-chord-card")).toHaveCount(10);
        const before = await sourceView(page), starter = await lens(page);
        await expect(starter).toContainText("14 of 17 chord tones match by pitch class; 12 match the scale's spelling");
        await expect(starter).toContainText("Outside it: Eb, Bb, G#.");
        await expect(starter).toContainText("Different spellings: F##.");
        await expect(starter).toContainText("G major ties on pitch-class overlap.");
        await expect(starter).not.toContainText("sit inside");
        expect(await sourceView(page)).toEqual(before);
        observations.push({ stage: "starter", source: before, explanation: await starter.innerText() });
        await clear(page);
        await typeAndInsert(page, "| Cmaj7 Dm7 G7 |");
        const containedBefore = await sourceView(page), contained = await lens(page);
        await expect(contained).toContainText("12 of 12 chord tones match by pitch class; 12 match the scale's spelling");
        await expect(contained).not.toContainText("Outside it:");
        expect(await sourceView(page)).toEqual(containedBefore);
        observations.push({ stage: "contained", source: containedBefore, explanation: await contained.innerText() });
        await clear(page);
        await typeAndInsert(page, "| C7alt |");
        const alteredBefore = await sourceView(page), altered = await lens(page);
        await expect(altered).toContainText("No continuation reading after C7alt: its altered tones are not specified.");
        await expect(altered).toContainText("Write the alterations explicitly (for example, b9 and b5) to get a reading.");
        await expect(altered.getByRole("button", { name: /^Add / })).toHaveCount(0);
        expect(await sourceView(page)).toEqual(alteredBefore);
        observations.push({ stage: "altered", source: alteredBefore, explanation: await altered.innerText() });
        expect(errors).toEqual([]); expect(pageErrors).toEqual([]); expect(requests.filter(row => !row.allowed)).toEqual([]);
      } finally {
        await info.attach("continuation-context-evidence", { contentType: "application/json", body: JSON.stringify({
          artifactHash, browser: browser.version(), node: process.version, mode, width, observations, errors, pageErrors, requests,
        }) });
      }
    });
  });
}
