import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { observeNativeSources } from "../support/u5-native-audio";

const artifactPath = resolve(process.env["JCPE_U2_ARTIFACT"] ?? "jazz_chord_progression_editor.html");
const artifact = readFileSync(artifactPath), artifactHash = createHash("sha256").update(artifact).digest("hex");
let server: Server, httpUrl: string;
type Diagnostics = { errors: string[]; requests: { url: string; allowed: boolean }[] };
let diagnostics: Diagnostics;
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });
test.beforeAll(async () => {
  server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(artifact); });
  await new Promise<void>(done => { server.listen(0, "127.0.0.1", done); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing loopback address");
  httpUrl = `http://127.0.0.1:${String(address.port)}/`;
});
test.afterAll(async () => { await new Promise<void>((done, reject) => { server.close(error => { if (error) reject(error); else done(); }); }); });
test.beforeEach(({ page }) => {
  diagnostics = { errors: [], requests: [] };
  page.on("pageerror", error => { diagnostics.errors.push(error.message); });
  page.on("console", message => { if (message.type() === "error") diagnostics.errors.push(message.text()); });
});
test.afterEach(async ({ page, browser }, info) => {
  await info.attach("inspector-diagnostics", { contentType: "application/json", body: JSON.stringify({ artifactHash,
    browser: browser.version(), viewport: page.viewportSize(), ...diagnostics,
    audio: await page.evaluate(() => window.u5NativeSourceCounts?.()).catch(() => null) }) });
});

async function boot(page: Page, mode: "file" | "http") {
  const url = mode === "file" ? pathToFileURL(artifactPath).href : httpUrl;
  await page.route("**/*", async route => {
    const allowed = route.request().isNavigationRequest() && route.request().url() === url;
    diagnostics.requests.push({ url: route.request().url(), allowed });
    if (allowed) await route.continue(); else await route.abort();
  });
  await page.goto(url);
  await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
  await page.locator(".studio-chord-card").first().click();
  await page.locator("#studio-transport-stop").click();
}
async function open(page: Page, width: number) {
  if (width < 1150) await page.locator(width === 320 ? "#studio-transport-open-harmony" : "#studio-open-harmony-sheet").click();
  await page.getByRole("button", { name: "Choose voicing / Edit chord", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit chord", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  return page.getByRole("dialog", { name: "Edit chord", exact: true });
}
async function state(page: Page) {
  return page.evaluate(() => ({ revision: document.querySelector(".studio-document-status__revision")?.textContent,
    ids: Array.from(document.querySelectorAll(".studio-chord-card"), element => element.getAttribute("data-chord-id")),
    selected: Array.from(document.querySelectorAll('.studio-chord-card[data-selected="true"]'), element => element.getAttribute("data-chord-id")),
    undoDisabled: document.querySelector<HTMLButtonElement>("#studio-undo")?.disabled }));
}
function clean() { expect(diagnostics.errors).toEqual([]); expect(diagnostics.requests.filter(request => !request.allowed)).toEqual([]); }

for (const mode of ["file", "http"] as const) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test.describe(`inspector ${mode} ${String(viewport.width)}px`, () => {
    test.use({ viewport, hasTouch: viewport.width < 640 });
    test("real choice preview and release leave the chart intact", async ({ page }) => {
      await boot(page, mode); await observeNativeSources(page);
      const before = await state(page), dialog = await open(page, viewport.width);
      const hear = dialog.getByRole("button", { name: "Hear balanced", exact: true });
      await expect(hear).toBeEnabled(); await hear.click();
      await expect(dialog.getByRole("status")).toContainText("Preview started");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(0);
      expect(await state(page)).toEqual(before);
      await dialog.getByRole("button", { name: "Release preview", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      await dialog.getByRole("button", { name: "Stop all audio", exact: true }).click();
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
      await expect(page.locator("#chart-workspace")).toBeFocused();
      clean();
    });

    test("Keep uses the existing Undo and restores the exact previous voicing", async ({ page }) => {
      await boot(page, mode);
      const dialog = await open(page, viewport.width), before = await dialog.locator(".studio-inspector-summary").textContent();
      const ids = (await state(page)).ids;
      await dialog.getByRole("button", { name: "Keep balanced notes", exact: true }).click();
      await expect(dialog.locator(".studio-inspector-summary")).toContainText("frozen");
      const frozen = await dialog.locator(".studio-inspector-summary").textContent();
      await page.keyboard.press("Escape"); await page.locator("#studio-undo").click();
      await open(page, viewport.width);
      expect(await dialog.locator(".studio-inspector-summary").textContent()).toBe(before);
      await page.keyboard.press("Escape"); await page.locator("#studio-redo").click();
      await open(page, viewport.width);
      expect(await dialog.locator(".studio-inspector-summary").textContent()).toBe(frozen);
      expect((await state(page)).ids).toEqual(ids); clean();
    });

    test("dirty annotations require an explicit decision and render markup as text", async ({ page }) => {
      await boot(page, mode);
      const before = await state(page), dialog = await open(page, viewport.width);
      await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
      await dialog.getByRole("tab", { name: "Notes", exact: true }).click();
      const field = dialog.getByRole("textbox", { name: "Chord annotation", exact: true });
      const text = '<img src="invalid" onerror="throw new Error(1)"> 🎹';
      await field.fill(text);
      await page.keyboard.press("Escape");
      await expect(dialog.getByRole("region", { name: "Unsaved inspector draft" })).toBeVisible();
      expect(await state(page)).toEqual(before);
      await dialog.getByRole("button", { name: "Continue editing", exact: true }).click();
      await expect(field).toHaveValue(text);
      await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("Applied.");
      expect(await dialog.locator('img[src="invalid"]').count()).toBe(0);
      await page.keyboard.press("Escape"); await open(page, viewport.width);
      await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
      await dialog.getByRole("tab", { name: "Notes", exact: true }).click();
      await expect(field).toHaveValue(text); clean();
    });

    test("piano and list retain an exact duplicate occurrence and accessible geometry", async ({ page }) => {
      await boot(page, mode);
      const dialog = await open(page, viewport.width);
      await dialog.getByRole("button", { name: "Edit exact notes", exact: true }).click();
      const list = dialog.locator(".studio-inspector-notes > li"), count = await list.count();
      expect(count).toBeGreaterThan(0);
      const first = list.first(), step = await first.getByRole("combobox").first().inputValue();
      const alter = await first.getByRole("combobox").nth(1).inputValue(), octave = await first.getByRole("spinbutton").inputValue();
      await dialog.getByRole("button", { name: "Add note", exact: true }).click();
      const added = list.last();
      await added.getByRole("combobox").first().selectOption(step);
      await added.getByRole("combobox").nth(1).selectOption(alter);
      await added.getByRole("spinbutton").fill(octave);
      await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await expect(dialog.locator(".studio-inspector-summary")).toContainText("manual");
      await expect(list).toHaveCount(count + 1);
      expect(await list.last().getByRole("spinbutton").inputValue()).toBe(octave);
      const c = dialog.locator("#inspector-piano-48"), cs = dialog.locator("#inspector-piano-49"), d = dialog.locator("#inspector-piano-50");
      const boxes = await Promise.all([c.boundingBox(), cs.boundingBox(), d.boundingBox()]);
      const [cBox, csBox, dBox] = boxes;
      if (cBox === null || csBox === null || dBox === null) throw new Error("Missing piano geometry");
      expect(cBox.x).toBeLessThan(csBox.x); expect(csBox.x).toBeLessThan(dBox.x); expect(csBox.width).toBeGreaterThanOrEqual(44);
      await c.focus(); await page.keyboard.press("ArrowRight"); await expect(cs).toBeFocused();
      await dialog.getByRole("combobox", { name: "Piano register", exact: true }).selectOption("120");
      await expect(dialog.locator("#inspector-piano-127")).toBeVisible(); clean();
    });
  });
}
