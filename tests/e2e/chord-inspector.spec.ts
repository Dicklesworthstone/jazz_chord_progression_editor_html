import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
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

    test("symbol and structure share an audible unapplied draft with one Undo", async ({ page }) => {
      await boot(page, mode); await observeNativeSources(page);
      const before = await state(page), dialog = await open(page, viewport.width);
      await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
      await dialog.getByRole("tab", { name: "Structure", exact: true }).click();
      await dialog.getByRole("combobox", { name: "Root letter", exact: true }).selectOption("D");
      await expect(dialog.getByRole("textbox", { name: "Chord symbol", exact: true })).toHaveValue("Dmaj7");
      await expect(dialog.getByText(/^Draft notes:/)).not.toContainText("Unavailable");
      await expect(dialog.getByText(/^Draft notes:/)).toContainText(/D\d/);
      await dialog.getByRole("tab", { name: "Symbol", exact: true }).click();
      await expect(dialog.getByRole("region", { name: "Unsaved inspector draft" })).toHaveCount(0);
      await expect(dialog.getByRole("textbox", { name: "Chord symbol", exact: true })).toHaveValue("Dmaj7");
      await dialog.getByRole("button", { name: "Hear symbol draft", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("Preview started");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(0);
      expect(await state(page)).toEqual(before);
      await dialog.getByRole("button", { name: "Release preview", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await expect(dialog.locator(".studio-inspector-summary")).toContainText("Dmaj7");
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
      await page.locator("#studio-undo").click();
      await expect(page.locator(".studio-chord-card").first()).toContainText("Cmaj7"); clean();
    });

    test("pointer and keyboard release retire held native sources", async ({ page }) => {
      await boot(page, mode); await observeNativeSources(page);
      const before = await state(page), dialog = await open(page, viewport.width);
      const hold = dialog.getByRole("button", { name: "Hold to hear", exact: true });
      await hold.scrollIntoViewIfNeeded();
      const box = await hold.boundingBox(); if (box === null) throw new Error("Missing hold control");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await expect(hold).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(0);
      await page.mouse.up();
      await expect(hold).toHaveAttribute("aria-pressed", "false");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      const started = await page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0);
      await hold.focus(); await page.keyboard.down("Space");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(started);
      await page.keyboard.up("Space");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      expect(await state(page)).toEqual(before); clean();
    });

    test("structured modifiers stay explicit and invalid drafts remain editable", async ({ page }) => {
      await boot(page, mode); const before = await state(page), dialog = await open(page, viewport.width);
      await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
      await dialog.getByRole("tab", { name: "Symbol", exact: true }).click();
      const symbol = dialog.getByRole("textbox", { name: "Chord symbol", exact: true });
      await symbol.fill("G7");
      await dialog.getByRole("tab", { name: "Structure", exact: true }).click();
      await dialog.getByRole("checkbox", { name: "b9", exact: true }).check();
      await dialog.getByRole("checkbox", { name: "#11", exact: true }).check();
      await dialog.getByRole("checkbox", { name: "Omit 5", exact: true }).check();
      await dialog.getByRole("checkbox", { name: "Slash bass", exact: true }).check();
      await dialog.getByRole("combobox", { name: "Bass letter", exact: true }).selectOption("D");
      await dialog.getByRole("combobox", { name: "Bass accidental", exact: true }).selectOption("-1");
      await expect(symbol).toHaveValue(/G7.*b9.*#11.*no5.*\/Db/);
      await dialog.getByRole("tab", { name: "Symbol", exact: true }).click();
      // T0 §3.2 permits ASCII spaces after a modifier comma, never trailing
      // spaces. These otherwise identical legal forms straddle the bound.
      const oversized = `G7(no5,${" ".repeat(245)}add9)`;
      await symbol.fill(oversized);
      await expect(symbol).toHaveValue(oversized);
      await expect(symbol).toHaveAttribute("aria-invalid", "true");
      await expect(dialog.getByText(/^Draft notes:/)).toHaveText("Draft notes: Unavailable");
      await expect(dialog.getByText(/^Canonical:/)).toHaveText("Canonical: Unavailable");
      await expect(dialog.getByRole("button", { name: "Hear symbol draft", exact: true })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Hold to hear", exact: true })).toBeDisabled();
      await expect(dialog.getByText("Keep the symbol within 256 code points. Your draft is unchanged.", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      expect(await state(page)).toEqual(before);
      await expect(symbol).toHaveValue(oversized);
      const maximum = `G7(no5,${" ".repeat(244)}add9)`;
      await symbol.fill(maximum);
      await expect(symbol).toHaveValue(maximum);
      await expect(symbol).toHaveAttribute("aria-invalid", "false");
      await expect(dialog.getByText(/^Draft notes:/)).not.toContainText("Unavailable");
      await expect(dialog.getByRole("button", { name: "Hear symbol draft", exact: true })).toBeEnabled();
      await symbol.fill("G7(!?)"); await symbol.press("Tab");
      await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await expect(symbol).toHaveValue("G7(!?)"); expect(await state(page)).toEqual(before);
      await page.keyboard.press("Escape");
      await expect(dialog.getByRole("region", { name: "Unsaved inspector draft" })).toBeVisible();
      await dialog.getByRole("button", { name: "Discard and continue", exact: true }).click();
      await expect(dialog).toHaveCount(0); clean();
    });

    test("preview release leaves the band running and global Stop retires both", async ({ page }) => {
      await boot(page, mode); await observeNativeSources(page);
      await page.locator("#studio-transport-play").click();
      await expect(page.locator("#studio-transport-pause")).toBeEnabled();
      const dialog = await open(page, viewport.width);
      await dialog.getByRole("button", { name: "Hear balanced", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("Preview started");
      await dialog.getByRole("button", { name: "Release preview", exact: true }).click();
      await expect(page.locator("#studio-transport-pause")).toBeEnabled();
      const started = await page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0);
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(started);
      await dialog.getByRole("button", { name: "Stop all audio", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      await expect(page.locator("#studio-transport-pause")).toBeDisabled(); clean();
    });

    if (viewport.width === 390) for (const interaction of ["pointer", "keyboard"] as const) {
      test(`U5 playback preserves a ${interaction} panel gesture across chord boundaries`, async ({ page }, info) => {
        await boot(page, mode); await observeNativeSources(page);
        await page.locator("#studio-transport-play").click();
        await expect(page.locator("#studio-transport-pause")).toBeEnabled();
        const trigger = page.locator("#studio-open-harmony-sheet");
        await trigger.scrollIntoViewIfNeeded();
        if (interaction === "pointer") await trigger.hover();
        else await trigger.focus();
        const position = await trigger.boundingBox();
        expect(position).not.toBeNull();
        const playing = () => page.locator('.studio-chord-card[data-playing="true"]').getAttribute("data-chord-id");
        const boundaries: string[] = [];
        for (let boundary = 0; boundary < 2; boundary += 1) {
          const before = await playing();
          await expect.poll(playing).not.toBe(before);
          const after = await playing();
          expect(after).not.toBeNull();
          boundaries.push(after ?? "missing");
          expect(await trigger.boundingBox()).toEqual(position);
        }
        if (interaction === "pointer") await trigger.click();
        else await trigger.press("Enter");
        await expect(page.getByRole("dialog", { name: "Harmony Lens", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Choose voicing / Edit chord", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Edit chord", exact: true });
        await expect(dialog).toBeVisible();
        const scroll = () => page.locator("#chart-workspace").evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }));
        const whileEditing = await scroll(), before = await playing();
        await expect.poll(playing).not.toBe(before);
        expect(await scroll()).toEqual(whileEditing);
        await dialog.getByRole("button", { name: "Stop all audio", exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
        await info.attach("playback-panel-gesture", { contentType: "application/json", body: JSON.stringify({ interaction, position, boundaries, whileEditing }) });
        clean();
      });
    }

    test("every advanced tab has a valid accessible panel and keyboard route", async ({ page }, info) => {
      await boot(page, mode); const dialog = await open(page, viewport.width);
      await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
      const violations = [];
      // This standalone app has no frames. Use the full same-page axe.run
      // rules without spawning a blank merge page for every tab (the first
      // trace spent most of its 30-second budget repeatedly doing that).
      expect(page.frames()).toHaveLength(1);
      for (const name of ["Symbol", "Structure", "Timing", "Voicing", "Harmony", "Motion", "Notes"]) {
        await dialog.getByRole("tab", { name, exact: true }).click();
        const panel = dialog.getByRole("tabpanel"); await expect(panel).toBeVisible();
        await expect(panel).toHaveAttribute("aria-labelledby", `inspector-tab-${name}`);
        const axe = await new AxeBuilder({ page }).setLegacyMode(true).include("#studio-chord-inspector").analyze();
        violations.push(...axe.violations.map(violation => ({ tab: name, ...violation })));
      }
      await info.attach("inspector-accessibility", { contentType: "application/json", body: JSON.stringify(violations) });
      expect(violations).toEqual([]);
      await dialog.getByRole("tab", { name: "Notes", exact: true }).focus();
      await page.keyboard.press("Home"); await expect(dialog.getByRole("tab", { name: "Symbol", exact: true })).toBeFocused();
      await page.keyboard.press("End"); await expect(dialog.getByRole("tab", { name: "Notes", exact: true })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); clean();
    });

    test("a native source-start failure leaves an actionable preview error and a fresh gesture recovers", async ({ page }) => {
      await boot(page, mode); await observeNativeSources(page);
      const before = await state(page), dialog = await open(page, viewport.width);
      await page.evaluate(() => {
        // Captured only to restore the native method, never called without its receiver.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const original = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function () {
          AudioBufferSourceNode.prototype.start = original;
          throw new DOMException("Injected native source admission failure", "InvalidStateError");
        };
      });
      await dialog.getByRole("button", { name: "Hear balanced", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("refused");
      expect(await state(page)).toEqual(before);
      await dialog.getByRole("button", { name: "Stop all audio", exact: true }).click();
      await dialog.getByRole("button", { name: "Hear balanced", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("Preview started");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(0);
      await dialog.getByRole("button", { name: "Release preview", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      expect(await state(page)).toEqual(before); clean();
    });

    test("boundary notes and literal Unicode survive editing, recovery, and native JSON download", async ({ page }) => {
      await boot(page, mode);
      const fixture = resolve("tests/fixtures/u2/inspector-exact-data.changes.json");
      await page.locator("#studio-import-chart").click();
      await page.locator("#studio-import-file").setInputFiles(fixture);
      await expect(page.locator("#studio-import-commit")).toBeEnabled();
      await page.locator("#studio-import-commit").click(); await page.locator("#studio-import-confirm").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.locator(".studio-chord-card").first().click();
      const dialog = await open(page, viewport.width);
      await expect(dialog.locator(".studio-inspector-summary")).toContainText("G9 · C-1");
      await observeNativeSources(page);
      await dialog.getByRole("button", { name: "Hear current chord", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("Preview started");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThanOrEqual(16);
      await dialog.getByRole("button", { name: "Release preview", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
      await expect(dialog.locator(".studio-inspector-notes > li")).toHaveCount(16);
      await expect(dialog.getByRole("button", { name: "Add note", exact: true })).toBeDisabled();
      await dialog.getByRole("tab", { name: "Notes", exact: true }).click();
      const annotation = dialog.getByRole("textbox", { name: "Chord annotation", exact: true });
      const text = "<i>retain</i>" + "🎹".repeat(1987);
      await annotation.fill(text + "🎹"); await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await expect(annotation).toHaveValue(text + "🎹"); await expect(annotation).toHaveAttribute("aria-invalid", "true");
      await annotation.fill(text); await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("Applied.");
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
      await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
      await page.reload(); await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Recovered chart opened");
      await page.locator("#studio-export-json").click(); await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
      const pending = page.waitForEvent("download"); await page.locator("#studio-lifecycle-download").click();
      const file = await (await pending).path();
      const actual: unknown = JSON.parse(await readFile(file, "utf8"));
      // The independent specimen changes only this literal annotation.
      const expected: unknown = JSON.parse(readFileSync(fixture, "utf8").replace("<b>retain</b>", "<i>retain</i>"));
      expect(actual).toEqual(expected);
      await expect(page.getByRole("dialog").getByRole("status")).toContainText("Handed off to your browser");
      await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); clean();
    });

    test("piano announces actual tensions and the non-formula slash bass", async ({ page }) => {
      await boot(page, mode);
      await page.locator("#studio-import-chart").click();
      await page.locator("#studio-import-file").setInputFiles(resolve("tests/fixtures/u2/inspector-piano-roles.changes.json"));
      await expect(page.locator("#studio-import-commit")).toBeEnabled();
      await page.locator("#studio-import-commit").click(); await page.locator("#studio-import-confirm").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.locator(".studio-chord-card").first().click(); await page.locator("#studio-transport-stop").click();
      const before = await state(page), dialog = await open(page, viewport.width);
      await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
      for (const [midi, name, role] of [[49, "Db3, Bass Note", "bass"], [68, "Ab4, Flat Ninth Tension", "tension"],
        [73, "C#5, Sharp Eleventh Tension", "tension"]] as const) {
        const key = dialog.locator(`#inspector-piano-${String(midi)}`);
        await expect(key).toHaveAccessibleName(`Add ${name}, MIDI ${String(midi)}`);
        await expect(key).toHaveAttribute("data-role", role);
        await expect(key).toHaveAttribute("data-active", "true");
      }
      await expect(dialog.locator("#inspector-piano-61")).toHaveAttribute("data-role", "none");
      const flatNinth = dialog.locator("#inspector-piano-68");
      await flatNinth.focus(); await page.keyboard.press("ArrowRight");
      await expect(dialog.locator("#inspector-piano-69")).toBeFocused();
      await page.keyboard.press("ArrowLeft"); await expect(flatNinth).toBeFocused();
      await observeNativeSources(page);
      await dialog.getByRole("button", { name: "Hear current chord", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("Preview started");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThanOrEqual(6);
      await dialog.getByRole("button", { name: "Release preview", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      expect(await state(page)).toEqual(before); clean();
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

    test("Custom exact notes require explicit symbol and Auto replacement decisions", async ({ page }) => {
      await boot(page, mode);
      await page.locator("#studio-import-chart").click();
      // A Custom label may look parseable while its exact notes mean something
      // else. Keep it Custom until the user explicitly edits and confirms it.
      const specimen = readFileSync(resolve("tests/fixtures/u2/inspector-exact-data.changes.json"), "utf8")
        .replaceAll("C and G, exact registers", "G7");
      await page.locator("#studio-import-file").setInputFiles({ name: "custom-label.changes.json", mimeType: "application/json", buffer: Buffer.from(specimen) });
      await expect(page.locator("#studio-import-commit")).toBeEnabled();
      await page.locator("#studio-import-commit").click(); await page.locator("#studio-import-confirm").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.locator(".studio-chord-card").first().click();
      const dialog = await open(page, viewport.width), original = await dialog.locator(".studio-inspector-summary").textContent();
      await expect(dialog.getByRole("button", { name: "Use balanced Auto", exact: true })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
      await dialog.getByRole("tab", { name: "Symbol", exact: true }).click();
      await expect(dialog.getByText(/^Canonical:/)).toHaveText("Canonical: Unavailable");
      await expect(dialog.getByRole("textbox", { name: "Chord symbol", exact: true })).toHaveValue("G7");
      await dialog.getByRole("textbox", { name: "Chord symbol", exact: true }).fill("Cmaj7");
      await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await expect(dialog.getByRole("region", { name: "Confirm stored note replacement" })).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel change", exact: true }).click();
      expect(await dialog.locator(".studio-inspector-summary").textContent()).toBe(original);
      await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await dialog.getByRole("button", { name: "Confirm change", exact: true }).click();
      await expect(dialog.locator(".studio-inspector-summary")).toContainText("Cmaj7");
      await dialog.getByRole("tab", { name: "Voicing", exact: true }).click();
      await expect(dialog.locator(".studio-inspector-notes > li")).toHaveCount(16);
      const exact = await dialog.locator(".studio-inspector-summary").textContent();
      await dialog.getByRole("button", { name: "Use balanced Auto", exact: true }).click();
      await dialog.getByRole("button", { name: "Cancel change", exact: true }).click();
      expect(await dialog.locator(".studio-inspector-summary").textContent()).toBe(exact);
      await dialog.getByRole("button", { name: "Use balanced Auto", exact: true }).click();
      await dialog.getByRole("button", { name: "Confirm change", exact: true }).click();
      await expect(dialog.locator(".studio-inspector-summary")).toContainText("auto");
      await expect(dialog.locator(".studio-inspector-notes > li")).toHaveCount(4);
      await page.keyboard.press("Escape"); await page.locator("#studio-undo").click();
      await open(page, viewport.width);
      expect(await dialog.locator(".studio-inspector-summary").textContent()).toBe(exact);
      await page.keyboard.press("Escape"); await page.locator("#studio-undo").click();
      await open(page, viewport.width);
      expect(await dialog.locator(".studio-inspector-summary").textContent()).toBe(original);
      clean();
    });

    test("fractional duration requires an incomplete-bar reason and preserves exact Undo", async ({ page }) => {
      await boot(page, mode);
      const dialog = await open(page, viewport.width), original = await dialog.locator(".studio-inspector-summary").textContent();
      await dialog.getByRole("button", { name: "Advanced chord controls", exact: true }).click();
      await dialog.getByRole("tab", { name: "Timing", exact: true }).click();
      const duration = dialog.getByRole("textbox", { name: "Exact duration in quarter-note beats", exact: true });
      await expect(duration).toHaveValue("2/1");
      await duration.fill("3/2"); await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await expect(dialog.getByRole("alert")).toBeVisible();
      await expect(duration).toHaveValue("3/2");
      expect(await dialog.locator(".studio-inspector-summary").textContent()).toBe(original);
      await dialog.getByRole("textbox", { name: "Reason if the bar becomes incomplete", exact: true }).fill("Leave an exact half-beat rest");
      await dialog.getByRole("button", { name: "Apply draft", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText("Applied.");
      await expect(duration).toHaveValue("3/2");
      await page.keyboard.press("Escape"); await page.locator("#studio-undo").click();
      await open(page, viewport.width);
      expect(await dialog.locator(".studio-inspector-summary").textContent()).toBe(original);
      clean();
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
      await list.first().getByRole("spinbutton").fill("10");
      await expect(dialog.getByRole("alert")).toBeVisible();
      await expect(dialog.locator('.studio-inspector-piano [data-active="true"]')).toHaveCount(0);
      await expect(dialog.locator(".studio-inspector-piano-role")).toHaveCount(0);
      await expect(dialog.locator('#inspector-piano-60')).toHaveAttribute("data-role", "none");
      await dialog.getByRole("button", { name: "Discard draft", exact: true }).click();
      await expect(dialog.locator('.studio-inspector-piano [data-active="true"]')).not.toHaveCount(0);
      await dialog.getByRole("combobox", { name: "Piano register", exact: true }).selectOption("120");
      await expect(dialog.locator("#inspector-piano-127")).toBeVisible(); clean();
    });
  });
}
