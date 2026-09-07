import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CHART_FOCUS_PROFILES } from "../fixtures/chart-focus";
import { observeNativeSources } from "../support/u5-native-audio";

const artifactPath = resolve(process.env["JCPE_FOCUS_ARTIFACT"] ?? "jazz_chord_progression_editor.html");
const artifact = readFileSync(artifactPath);
const artifactHash = createHash("sha256").update(artifact).digest("hex");
const fileUrl = pathToFileURL(artifactPath).href;
const rawDraft = '; 🎷 é\n| D♭maj7:2 H7:2 |';
let server: Server;
let httpUrl: string;
declare global { interface Window { chartFocusContextCount?: number } }

test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });
test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(artifact);
  });
  await new Promise<void>(done => { server.listen(0, "127.0.0.1", done); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("missing loopback address");
  httpUrl = `http://127.0.0.1:${String(address.port)}/`;
});
test.afterAll(async () => { await new Promise<void>((done, reject) => { server.close(error => { if (error) reject(error); else done(); }); }); });

async function boot(page: Page, url: string) {
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
  await expect(page.locator(".studio-chord-card").first()).toBeVisible();
  return { errors, requests };
}

async function chartState(page: Page) {
  return page.evaluate(() => ({
    ids: Array.from(document.querySelectorAll(".studio-chord-card"), element => element.getAttribute("data-chord-id")),
    selected: Array.from(document.querySelectorAll('.studio-chord-card[data-selected="true"]'), element => element.getAttribute("data-chord-id")),
    measures: Array.from(document.querySelectorAll(".studio-measure"), element => element.getAttribute("data-measure-id")),
    revision: document.querySelector(".studio-document-status__revision")?.textContent,
    undo: document.querySelector<HTMLButtonElement>("#studio-undo")?.disabled,
    redo: document.querySelector<HTMLButtonElement>("#studio-redo")?.disabled,
    layout: document.querySelector("#chart-workspace")?.getAttribute("data-chart-layout"),
    library: document.querySelector(".studio-shell")?.getAttribute("data-library-collapsed"),
    harmony: document.querySelector(".studio-shell")?.getAttribute("data-harmony-collapsed"),
  }));
}

async function reachable(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  expect(await target.evaluate(element => {
    const box = element.getBoundingClientRect();
    return [[0.5, 0.5], [0.1, 0.5], [0.9, 0.5], [0.5, 0.1], [0.5, 0.9]].every(([x = 0.5, y = 0.5]) => {
      const hit = document.elementFromPoint(box.x + box.width * x, box.y + box.height * y);
      return hit !== null && (hit === element || element.contains(hit));
    });
  })).toBe(true);
}

for (const mode of ["file", "http"] as const) {
  for (const profile of CHART_FOCUS_PROFILES) {
    test.describe(`chart focus ${mode} ${String(profile.width)}px`, () => {
      test.use({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.touch });
      test("same chart, reachable panels and reversible keyboard focus", async ({ page, browser }, info) => {
        const diagnostics = await boot(page, mode === "file" ? fileUrl : httpUrl);
        const geometry: unknown[] = [];
        try {
          const before = await chartState(page);
          expect(before.ids.length).toBeGreaterThan(0);
          expect(before.ids.every(id => typeof id === "string" && id.length > 0)).toBe(true);
          expect(before.revision).toBeTruthy(); expect(typeof before.undo).toBe("boolean");
          const workspace = page.locator("#chart-workspace");
          const widthBefore = await workspace.evaluate(element => element.clientWidth);
          const toggle = page.getByRole("button", { name: "Focus chart", exact: true });
          await toggle.focus(); await page.keyboard.press("Enter");
          const exit = page.getByRole("button", { name: "Exit focus", exact: true });
          await expect(exit).toBeFocused();
          await expect(exit).toHaveAttribute("aria-pressed", "true");
          expect(await chartState(page)).toEqual(before);
          if (profile.width >= 1280) expect(await workspace.evaluate(element => element.clientWidth)).toBeGreaterThan(widthBefore);
          const chord = page.locator(".studio-chord-card").first();
          const scroller = page.locator(".studio-chart__scroller");
          const cardBox = await chord.boundingBox(), scrollBox = await scroller.boundingBox();
          geometry.push({ card: cardBox, scroller: scrollBox, exit: await exit.boundingBox() });
          if (cardBox === null || scrollBox === null) throw new Error("missing chart bounds");
          expect(scrollBox.height).toBeGreaterThanOrEqual(cardBox.height);
          await reachable(chord); await reachable(page.locator("#studio-transport-stop")); await reachable(exit);
          const short = profile.width < 640 && profile.height < 600;
          const library = page.locator(short ? "#studio-transport-open-library" : "#studio-open-library-sheet");
          const harmony = page.locator(short ? "#studio-transport-open-harmony" : "#studio-open-harmony-sheet");
          await library.click();
          const sheet = page.getByRole("dialog", { name: "Library", exact: true });
          await expect(sheet).toBeVisible();
          const field = sheet.getByRole("textbox", { name: "Chart text", exact: true });
          await field.fill(rawDraft);
          await page.keyboard.press("Escape");
          await expect(sheet).toHaveCount(0); await expect(library).toBeFocused();
          await harmony.click();
          await expect(page.getByRole("dialog", { name: "Harmony Lens", exact: true })).toBeVisible();
          await page.keyboard.press("Escape"); await expect(harmony).toBeFocused();
          await page.locator("#studio-open-command-lane").click();
          await expect(page.getByTestId("command-lane-input")).toHaveValue(rawDraft);
          await page.keyboard.press("Escape");
          await exit.focus(); await page.keyboard.press("Space");
          await expect(toggle).toBeFocused(); await expect(toggle).toHaveAttribute("aria-pressed", "false");
          expect(await chartState(page)).toEqual(before);
          expect(await page.evaluate(() => {
            const ids = Array.from(document.querySelectorAll("[id]"), element => element.id);
            return ids.filter((id, index) => ids.indexOf(id) !== index);
          })).toEqual([]);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          expect(diagnostics.errors).toEqual([]); expect(diagnostics.requests.filter(row => !row.allowed)).toEqual([]);
        } finally {
          await info.attach("chart-focus-workflow", { contentType: "application/json", body: JSON.stringify({ artifactHash, browser: browser.version(), mode, profile, geometry, ...diagnostics }) });
        }
      });
    });
  }
}

test.describe("chart focus desktop input and reading", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });
  test("retains the rail textarea node, raw draft and caret through repeated toggles", async ({ page, browser }, info) => {
    const diagnostics = await boot(page, fileUrl);
    const field = page.locator(".studio-rail--library textarea");
    await field.fill(rawDraft);
    await field.evaluate(element => { if (!(element instanceof HTMLTextAreaElement)) throw new Error("not a textarea"); element.setSelectionRange(19, 20); });
    const node = await field.elementHandle();
    if (node === null) throw new Error("missing original draft node");
    const before = await chartState(page);
    const states = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      await page.locator("#studio-chart-focus-toggle").click();
      states.push(await node.evaluate(element => {
        if (!(element instanceof HTMLTextAreaElement)) throw new Error("original node is not a textarea");
        return { connected: element.isConnected, value: element.value, start: element.selectionStart, end: element.selectionEnd };
      }));
    }
    expect(states).toEqual(Array.from({ length: 4 }, () => ({ connected: true, value: rawDraft, start: 19, end: 20 })));
    expect(await chartState(page)).toEqual(before);
    expect(diagnostics.errors).toEqual([]);
    await info.attach("chart-focus-draft", { contentType: "application/json", body: JSON.stringify({ artifactHash, browser: browser.version(), states, ...diagnostics }) });
  });

  test("preserves a real reading anchor and top-of-chart through layout changes", async ({ page, browser }, info) => {
    const diagnostics = await boot(page, fileUrl);
    // The six-bar demo can legitimately clamp to its new bottom when widened.
    // Add a real longer chart so this case measures an interior reading anchor.
    await page.locator("#studio-open-command-lane").click();
    await page.getByTestId("command-lane-input").fill(Array.from({ length: 20 }, () => "| Dm7:2 G7:2 ").join("") + "|");
    await page.locator("#studio-command-lane-insert").click();
    await expect(page.locator(".studio-measure")).toHaveCount(26);
    const scroller = page.locator(".studio-chart__scroller");
    await scroller.evaluate(element => { element.scrollTop = Math.min(500, element.scrollHeight - element.clientHeight); });
    const anchor = await scroller.evaluate(element => {
      const top = element.getBoundingClientRect().top;
      const measure = Array.from(element.querySelectorAll(".studio-measure")).find(node => node.getBoundingClientRect().bottom > top);
      if (measure === undefined || element.scrollTop <= 0) throw new Error("no scrolled reading anchor");
      return { id: measure.getAttribute("data-measure-id"), offset: measure.getBoundingClientRect().top - top };
    });
    const rows = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.locator("#studio-chart-focus-toggle").click();
      const measured = await scroller.evaluate((element, id) => {
        const measure = Array.from(element.querySelectorAll(".studio-measure")).find(node => node.getAttribute("data-measure-id") === id);
        if (measure === undefined) throw new Error("reading measure disappeared");
        return { offset: measure.getBoundingClientRect().top - element.getBoundingClientRect().top, scroll: element.scrollTop, maximum: element.scrollHeight - element.clientHeight };
      }, anchor.id);
      rows.push(measured);
      expect(measured.scroll).toBeGreaterThan(0); expect(measured.scroll).toBeLessThan(measured.maximum);
      expect(Math.abs(measured.offset - anchor.offset)).toBeLessThanOrEqual(1);
    }
    await scroller.evaluate(element => { element.scrollTop = 0; });
    await page.locator("#studio-chart-focus-toggle").click();
    expect(await scroller.evaluate(element => element.scrollTop)).toBe(0);
    expect(diagnostics.errors).toEqual([]);
    await info.attach("chart-focus-reading", { contentType: "application/json", body: JSON.stringify({ artifactHash, browser: browser.version(), anchor, rows, ...diagnostics }) });
  });
});

for (const profile of CHART_FOCUS_PROFILES) {
  test.describe(`chart focus native transport ${String(profile.width)}px`, () => {
    test.use({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.touch });
    test("view toggles retain the persistent graph and actual Stop retires sources", async ({ page, browser }, info) => {
      await page.addInitScript(() => {
        window.chartFocusContextCount = 0;
        const Native = window.AudioContext;
        window.AudioContext = class extends Native {
          constructor(options?: AudioContextOptions) { super(options); window.chartFocusContextCount = (window.chartFocusContextCount ?? 0) + 1; }
        };
      });
      const diagnostics = await boot(page, fileUrl);
      await observeNativeSources(page);
      expect(await page.evaluate(() => window.chartFocusContextCount)).toBe(0);
      await page.locator("#studio-transport-loop").click();
      await expect(page.locator("#studio-transport-loop")).toHaveAttribute("aria-pressed", "true");
      await page.locator("#studio-transport-play").click();
      await expect(page.locator("#studio-transport-pause")).toBeEnabled();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(0);
      const rows = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.locator("#studio-chart-focus-toggle").click();
        await expect(page.locator("#studio-transport-pause")).toBeEnabled();
        expect(await page.evaluate(() => window.chartFocusContextCount)).toBe(1);
        await expect(page.locator("#studio-transport-loop")).toHaveAttribute("aria-pressed", "true");
        if (cycle % 2 === 0) await expect(page.getByTestId("transport-now-place")).toBeVisible();
        rows.push(await page.evaluate(() => window.u5NativeSourceCounts?.()));
      }
      await reachable(page.locator("#studio-transport-stop"));
      await page.locator("#studio-transport-stop").click();
      await expect(page.locator("#studio-transport-pause")).toBeDisabled();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      rows.push(await page.evaluate(() => window.u5NativeSourceCounts?.()));
      expect(diagnostics.errors).toEqual([]);
      await info.attach("chart-focus-audio", { contentType: "application/json", body: JSON.stringify({ artifactHash, browser: browser.version(), profile, rows, ...diagnostics }) });
    });
  });
}
