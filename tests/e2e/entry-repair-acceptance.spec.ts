import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const artifactPath = resolve("jazz_chord_progression_editor.html");
const artifactUrl = pathToFileURL(artifactPath).href;
const artifactHash = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
const original = '; 🎷 é\n| D♭maj7:2 H7:2 |';
const repaired = '; 🎷 é\n| D♭maj7:2 G7:2 |';

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test.describe(`entry repair acceptance ${String(viewport.width)}px`, () => {
    test.use({ viewport, hasTouch: true, reducedMotion: "reduce", userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
    test("reduced keyboard space preserves source selection, usable Cancel and the chart", async ({ page, context, browser }, info) => {
      const errors: string[] = [];
      const requests: { url: string; allowed: boolean }[] = [];
      const geometry: unknown[] = [];
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", error => { errors.push(error.message); });
      await context.route("**/*", async route => {
        const allowed = route.request().isNavigationRequest() && route.request().url() === artifactUrl;
        requests.push({ url: route.request().url(), allowed });
        if (allowed) await route.continue(); else await route.abort();
      });
      try {
        await page.goto(artifactUrl);
        await expect(page.locator(".studio-chord-card").first()).toBeVisible();
        const before = await page.evaluate(() => ({
          cards: Array.from(document.querySelectorAll(".studio-chord-card"), node => node.getAttribute("data-chord-id")),
          revision: document.querySelector(".studio-document-status__revision")?.textContent,
          undoDisabled: document.querySelector<HTMLButtonElement>("#studio-undo")?.disabled,
          redoDisabled: document.querySelector<HTMLButtonElement>("#studio-redo")?.disabled,
        }));
        expect(before.cards.length).toBeGreaterThan(0);
        expect(before.cards.every(id => typeof id === "string" && id.length > 0)).toBe(true);
        expect(typeof before.undoDisabled).toBe("boolean");
        expect(typeof before.redoDisabled).toBe("boolean");
        expect(before.revision).toBeTruthy();
        await page.locator("#studio-open-command-lane").click();
        const field = page.getByTestId("command-lane-input");
        await field.fill(original);
        await page.getByRole("button", { name: /^Repair H:/ }).click();
        // A real layout resize represents the space taken by a phone keyboard;
        // this is not a claim to drive an operating system's keyboard or IME UI.
        await page.setViewportSize({ width: viewport.width, height: 320 });
        await expect(field).toBeFocused();
        const source = await field.evaluate(element => {
          if (!(element instanceof HTMLTextAreaElement)) throw new Error("missing textarea");
          return { start: element.selectionStart, end: element.selectionEnd,
            text: element.value.slice(element.selectionStart, element.selectionEnd) };
        });
        expect(source).toEqual({ start: 19, end: 20, text: "H" });
        await page.keyboard.insertText("G");
        await expect(field).toHaveValue(repaired);
        const cancel = page.getByRole("button", { name: "Cancel repair", exact: true });
        await cancel.click();
        await expect(field).toHaveValue(original);
        await expect(field).toBeFocused();
        geometry.push({ field: await field.boundingBox(), viewport: page.viewportSize() });
        const fieldBox = await field.boundingBox();
        expect(fieldBox).not.toBeNull();
        if (fieldBox === null) throw new Error("missing field geometry");
        expect(fieldBox.y).toBeGreaterThanOrEqual(0);
        expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(320);
        await page.setViewportSize(viewport);
        await field.press("Escape");
        await expect(field).toHaveCount(0);
        await expect(page.locator("#studio-open-command-lane")).toBeFocused();
        const after = await page.evaluate(() => ({
          cards: Array.from(document.querySelectorAll(".studio-chord-card"), node => node.getAttribute("data-chord-id")),
          revision: document.querySelector(".studio-document-status__revision")?.textContent,
          undoDisabled: document.querySelector<HTMLButtonElement>("#studio-undo")?.disabled,
          redoDisabled: document.querySelector<HTMLButtonElement>("#studio-redo")?.disabled,
        }));
        expect(after).toEqual(before);
        expect(errors).toEqual([]);
        expect(requests.filter(row => !row.allowed)).toEqual([]);
      } finally {
        await info.attach("entry-repair-keyboard-space", { contentType: "application/json", body: JSON.stringify({ artifactHash, browser: browser.version(), viewport, geometry, errors, requests }) });
      }
    });
  });
}
