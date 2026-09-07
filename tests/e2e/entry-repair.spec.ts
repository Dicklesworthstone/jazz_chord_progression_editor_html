import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const artifactPath = resolve(process.env["JCPE_ENTRY_ARTIFACT"] ?? "jazz_chord_progression_editor.html");
const artifact = readFileSync(artifactPath);
const artifactHash = createHash("sha256").update(artifact).digest("hex");
const draft = '; 🎷 é\n| D♭maj7:2 H7:2 |';
const repaired = '; 🎷 é\n| D♭maj7:2 G7:2 |';
let server: Server;
let httpUrl: string;

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(artifact);
  });
  await new Promise<void>(resolveListening => { server.listen(0, "127.0.0.1", resolveListening); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("missing server address");
  httpUrl = `http://127.0.0.1:${String(address.port)}/`;
});
test.afterAll(async () => { await new Promise<void>((done, reject) => { server.close(error => { if (error) reject(error); else done(); }); }); });

async function blankStudio(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await expect(page.locator(".studio-chord-card").first()).toBeVisible();
  // Clear is the actual user-facing empty-chart operation. Unwinding three
  // unrelated starter-history entries made setup dominate the repair deadline.
  const clear = page.locator("#studio-clear-chart");
  await clear.click();
  await expect(clear).toHaveText("Really clear?");
  // Keyboard confirmation avoids waiting on pointer/layout stability beyond
  // the real five-second confirmation window on WebKit.
  await clear.press("Enter");
  await expect(page.locator(".studio-chord-card")).toHaveCount(0);
  await expect(page.locator("#studio-undo")).toBeEnabled();
}

async function selection(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate(element => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error("entry is not multiline");
    return { start: element.selectionStart, end: element.selectionEnd,
      text: element.value.slice(element.selectionStart, element.selectionEnd), focused: document.activeElement === element };
  });
}

for (const mode of ["file", "http"] as const) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 568 }, { width: 390, height: 844 }]) {
    test.describe(`${mode} ${String(viewport.width)}px entry repair`, () => {
      test.use({ viewport, hasTouch: viewport.width < 600, userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });

      for (const workflow of ["cancel", "commit"] as const) {
        test(`${workflow}: exact multiline source and atomic history`, async ({ page, context, browser }, info) => {
          const consoleErrors: string[] = [], pageErrors: string[] = [];
          const requests: { url: string; allowed: boolean }[] = [];
          const url = mode === "http" ? httpUrl : pathToFileURL(artifactPath).href;
          page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
          page.on("pageerror", error => { pageErrors.push(error.message); });
          await context.route("**/*", async route => {
            const allowed = route.request().isNavigationRequest() && route.request().url() === url;
            requests.push({ url: route.request().url(), allowed });
            if (allowed) await route.continue(); else await route.abort();
          });
          try {
            await blankStudio(page, url);
            const beforeIds = await page.locator(".studio-measure").evaluateAll(elements => elements.map(element => element.getAttribute("data-measure-id")));
            await page.locator("#studio-open-command-lane").click();
            const field = page.getByTestId("command-lane-input");
            await field.fill(draft);
            await expect(field).toHaveValue(draft);
            await expect(page.locator("#studio-command-lane-insert")).toBeDisabled();
            const error = page.getByRole("button", { name: /^Repair H:/ });
            await expect(error).toContainText("Repair");
            await error.focus();
            await page.keyboard.press("Enter");
            expect(await selection(page, "command-lane-input")).toEqual({ start: 19, end: 20, text: "H", focused: true });
            await page.keyboard.insertText("G");
            await expect(field).toHaveValue(repaired);
            await expect(page.locator(".studio-chord-card")).toHaveCount(0);
            if (workflow === "cancel") {
              // The overlay must let this Escape reach the repair first.
              await page.keyboard.press("Escape");
              await expect(field).toBeVisible();
              await expect(field).toHaveValue(draft);
              expect(await selection(page, "command-lane-input")).toEqual({ start: 19, end: 20, text: "H", focused: true });
              await page.getByRole("button", { name: /^Next error/ }).click();
              await page.keyboard.insertText("G");
              await expect(field).toHaveValue(repaired);
              await expect(page.locator(".studio-chord-card")).toHaveCount(0);
            } else {
              await page.getByRole("button", { name: "Keep repair", exact: true }).click();
              await expect(field).toBeFocused();
              await expect(field).toHaveValue(repaired);
              await expect(page.getByRole("button", { name: "Cancel repair", exact: true })).toHaveCount(0);
              await expect(page.getByTestId("command-lane-tokens")).toContainText("2/1 beats");
              await page.locator("#studio-command-lane-insert").click();
              await expect(page.locator(".studio-chord-card")).toHaveCount(2);
              await page.locator("#studio-undo").click();
              await expect(page.locator(".studio-chord-card")).toHaveCount(0);
              expect(await page.locator(".studio-measure").evaluateAll(elements => elements.map(element => element.getAttribute("data-measure-id")))).toEqual(beforeIds);
              // The pre-existing Clear command remains undoable after exactly one
              // Undo removes the new insertion. No repair added a history entry.
              await expect(page.locator("#studio-undo")).toBeEnabled();
            }
            expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]);
            expect(requests.filter(row => !row.allowed)).toEqual([]);
          } finally {
            await info.attach("entry-repair-evidence", { contentType: "application/json", body: JSON.stringify({ artifactHash, browser: browser.version(), mode, viewport, consoleErrors, pageErrors, requests }) });
          }
        });
      }
    });
  }
}

test.describe("entry repair keyboard ownership", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
  for (const surface of ["command", "library"] as const) {
    test(`${surface}: stale spans and composition never publish or dismiss`, async ({ page }) => {
      await blankStudio(page, pathToFileURL(artifactPath).href);
      if (surface === "command") await page.locator("#studio-open-command-lane").click();
      const id = surface === "command" ? "command-lane-input" : "quick-entry-field";
      const field = page.getByTestId(id);
      const scope = surface === "command" ? page.locator(".studio-command-lane") : page.locator(".studio-quick-entry");
      await field.fill("C7:2 H7:2");
      // Plant the stale DOM value and activate the real button in one event turn.
      // Otherwise a legitimate intervening render can restore the current draft
      // before the click, so the test no longer presents stale input at all.
      const staleSelection = await scope.getByRole("button", { name: /^Repair H:/ }).evaluate((button, fieldId) => {
        const input = document.querySelector(`[data-testid="${fieldId}"]`);
        if (!(input instanceof HTMLTextAreaElement) || !(button instanceof HTMLButtonElement)) throw new Error("missing repair controls");
        const original = input.value;
        input.value = "D7:2 H7:2";
        const before = { start: input.selectionStart, end: input.selectionEnd, focused: document.activeElement === input };
        button.click();
        const after = { start: input.selectionStart, end: input.selectionEnd, focused: document.activeElement === input };
        // Confine the out-of-band perturbation to this negative control. Leaving
        // it installed lets a render interrupt WebKit's next native fill.
        input.value = original;
        return { before, after };
      }, id);
      expect(staleSelection.after).toEqual(staleSelection.before);
      await expect(scope.getByRole("button", { name: "Cancel repair", exact: true })).toHaveCount(0);
      await expect(field).toHaveValue("C7:2 H7:2");
      await scope.getByRole("button", { name: /^Repair H:/ }).click();
      await field.dispatchEvent("compositionstart", { data: "G" });
      await field.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, bubbles: true });
      await field.dispatchEvent("keydown", { key: "Escape", code: "Escape", isComposing: true, bubbles: true });
      await expect(field).toBeVisible();
      await expect(scope.getByRole("button", { name: "Cancel repair", exact: true })).toBeDisabled();
      await expect(page.locator(".studio-chord-card")).toHaveCount(0);
      await field.dispatchEvent("compositionend", { data: "G" });
      await field.press("Escape");
      await expect(field).toHaveValue("C7:2 H7:2");
      await expect(scope.getByRole("button", { name: "Cancel repair", exact: true })).toHaveCount(0);
      // Normal Escape still closes the dialog / clears the rail outside a repair.
      await field.press("Escape");
      if (surface === "command") await expect(field).toHaveCount(0);
      else await expect(field).toHaveValue("");
    });
  }
  test("Library repair selects literal text, inserts once, and preserves Undo", async ({ page }) => {
    await blankStudio(page, pathToFileURL(artifactPath).href);
    const field = page.getByTestId("quick-entry-field");
    const scope = page.locator(".studio-quick-entry");
    await field.fill(draft);
    await scope.getByRole("button", { name: /^Repair H:/ }).click();
    expect(await selection(page, "quick-entry-field")).toEqual({ start: 19, end: 20, text: "H", focused: true });
    await page.keyboard.insertText("G");
    await expect(field).toHaveValue(repaired);
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    await scope.getByRole("button", { name: "Keep repair", exact: true }).click();
    await page.locator("#studio-quick-entry-insert").click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(2);
    await page.locator("#studio-undo").click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    await expect(page.locator("#studio-undo")).toBeEnabled();
  });

  test("200% layout retains reachable repair controls and selected source", async ({ page }) => {
    await blankStudio(page, pathToFileURL(artifactPath).href);
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await page.locator("#studio-open-command-lane").click();
    await page.getByTestId("command-lane-input").fill(draft);
    await page.getByRole("button", { name: /^Next error/ }).click();
    expect(await selection(page, "command-lane-input")).toEqual({ start: 19, end: 20, text: "H", focused: true });
    await page.keyboard.insertText("G");
    await page.getByRole("button", { name: "Cancel repair", exact: true }).click();
    await expect(page.getByTestId("command-lane-input")).toHaveValue(draft);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("Next error remains reachable when recovered rows reach the render limit", async ({ page }) => {
    await blankStudio(page, pathToFileURL(artifactPath).href);
    await page.locator("#studio-open-command-lane").click();
    const field = page.getByTestId("command-lane-input");
    const longDraft = Array.from({ length: 2048 }, () => "C").join(" ");
    await field.fill(longDraft);
    await expect(page.locator(".studio-command-lane__truncation")).toBeVisible();
    await page.getByRole("button", { name: /^Next error/ }).click();
    const selected = await selection(page, "command-lane-input");
    expect(selected.focused).toBe(true);
    expect(selected.end).toBeGreaterThan(selected.start);
    await expect(page.locator(".studio-command-lane .studio-entry-repair")).toContainText("explicit durations");
    await expect(page.locator("#studio-command-lane-insert")).toBeDisabled();
    await expect(field).toHaveValue(longDraft);
  });

  test("cancel cannot overwrite an edit made through the other entry surface", async ({ page }) => {
    await blankStudio(page, pathToFileURL(artifactPath).href);
    const library = page.locator(".studio-quick-entry");
    const field = page.getByTestId("quick-entry-field");
    await field.fill("C7:2 H7:2");
    await library.getByRole("button", { name: /^Repair H:/ }).click();
    await page.keyboard.insertText("G");
    await expect(field).toHaveValue("C7:2 G7:2");
    await page.locator("#studio-open-command-lane").click();
    await page.getByTestId("command-lane-input").fill("D7:4");
    await page.getByTestId("command-lane-input").press("Escape");
    await expect(field).toHaveValue("D7:4");
    // Continuing to type here does not grant an old repair ownership of the
    // intervening edit made in the command lane.
    await field.fill("E7:4");
    await library.getByRole("button", { name: "Cancel repair", exact: true }).click();
    await expect(field).toHaveValue("E7:4");
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
  });

  test("overfilled source selects the whole bar and cannot publish until repaired", async ({ page }) => {
    await blankStudio(page, pathToFileURL(artifactPath).href);
    await page.locator("#studio-open-command-lane").click();
    const field = page.getByTestId("command-lane-input");
    await field.fill("| C7:3 G7:2 |");
    await expect(page.locator("#studio-command-lane-insert")).toBeDisabled();
    await page.getByRole("button", { name: /^Next error/ }).click();
    expect(await selection(page, "command-lane-input")).toEqual({ start: 0, end: 13, text: "| C7:3 G7:2 |", focused: true });
    await page.keyboard.insertText("| C7:2 G7:2 |");
    await expect(field).toHaveValue("| C7:2 G7:2 |");
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    await page.locator("#studio-command-lane-insert").click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(2);
    await page.locator("#studio-undo").click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
  });

  test("draft limit preserves the last exact accepted draft and states refusal", async ({ page }) => {
    await blankStudio(page, pathToFileURL(artifactPath).href);
    await page.locator("#studio-open-command-lane").click();
    const field = page.getByTestId("command-lane-input");
    // Eleven literal code points plus 4085 comment characters: no parser oracle.
    const atLimit = "; " + "x".repeat(4085) + "\n| C7:4 |";
    expect(Array.from(atLimit)).toHaveLength(4096);
    const original = atLimit.replace("C7", "H7");
    await field.fill(original);
    await page.getByRole("button", { name: /^Next error/ }).click();
    await page.keyboard.insertText("C");
    await expect(field).toHaveValue(atLimit);
    await expect(page.locator("#studio-command-lane-insert")).toBeEnabled();
    await field.fill(atLimit + "x");
    await expect(page.locator(".studio-command-lane__refusal")).toContainText("4,096 Unicode code points");
    await expect(field).toHaveValue(atLimit);
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel repair", exact: true }).click();
    await expect(field).toHaveValue(original);
    await field.fill("| D7:4 |");
    await expect(field).toHaveValue("| D7:4 |");
    await expect(page.locator(".studio-command-lane__refusal")).toHaveCount(0);
  });

  test("native composition listeners are released when the command lane closes", async ({ page }, info) => {
    await page.addInitScript(() => {
      // Capture the native methods; .call(this, ...) below preserves each receiver.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalAdd = EventTarget.prototype.addEventListener;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalRemove = EventTarget.prototype.removeEventListener;
      let active = 0;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === "compositionstart" || type === "compositionend") active += 1;
        originalAdd.call(this, type, listener, options);
      };
      EventTarget.prototype.removeEventListener = function(type, listener, options) {
        if (type === "compositionstart" || type === "compositionend") active -= 1;
        originalRemove.call(this, type, listener, options);
      };
      Object.defineProperty(window, "__entryCompositionListeners", { get: () => active });
    });
    await blankStudio(page, pathToFileURL(artifactPath).href);
    const count = async (): Promise<number> => page.evaluate(() => Number(Reflect.get(window, "__entryCompositionListeners")));
    const baseline = await count();
    expect(baseline).toBeGreaterThanOrEqual(2);
    const counts = [baseline];
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await page.locator("#studio-open-command-lane").click();
      await expect.poll(count).toBe(baseline + 2);
      counts.push(await count());
      await page.getByTestId("command-lane-input").press("Escape");
      await expect.poll(count).toBe(baseline);
      counts.push(await count());
    }
    await info.attach("native-listener-counts", { contentType: "application/json", body: JSON.stringify({ artifactHash, counts }) });
  });
});
