import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Announcement = Readonly<{ kind: "focus" | "status" | "alert"; text: string }>;
declare global { interface Window { u5Announcements?: readonly Announcement[]; u5StopAnnouncements?: () => void } }
const artifact = pathToFileURL(resolve("jazz_chord_progression_editor.html")).href;
const artifactSha256 = createHash("sha256").update(readFileSync(new URL(artifact))).digest("hex");
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) for (const format of ["json", "text"] as const) {
  test.describe(`U5 export announcements ${format} ${String(viewport.width)}px`, () => {
    test.use({ viewport });
    test("a refused owner announces once, then a fresh successful export retires the old error", async ({ page, browser }, info) => {
      const errors: string[] = [], requests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.route("**/*", async route => {
        requests.push(route.request().url());
        if (route.request().isNavigationRequest() && route.request().url() === artifact) await route.continue();
        else await route.abort();
      });
      await page.goto(artifact);
      await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
      await page.evaluate(() => {
        const entries: Announcement[] = [];
        const record = (entry: Announcement) => { if (entries.length < 256) entries.push(entry); };
        const focus = (event: FocusEvent) => {
          const element = event.target;
          if (element instanceof HTMLElement && element.matches('h2') && element.closest('[role="dialog"]') !== null) {
            record({ kind: "focus", text: element.textContent });
          }
        };
        const observer = new MutationObserver(records => {
          const regions = new Set<Element>();
          const collect = (node: Node) => {
            const element = node instanceof Element ? node : node.parentElement;
            if (element === null) return;
            const owner = element.closest('[role="status"], [role="alert"]');
            if (owner !== null) regions.add(owner);
            for (const child of element.querySelectorAll('[role="status"], [role="alert"]')) regions.add(child);
          };
          for (const mutation of records) {
            if (mutation.type === "characterData") collect(mutation.target);
            else for (const added of mutation.addedNodes) collect(added);
          }
          for (const region of regions) {
            const role = region.getAttribute("role"), text = region.textContent.trim();
            if (region.isConnected && text !== "" && (role === "status" || role === "alert")) record({ kind: role, text });
          }
        });
        document.addEventListener("focusin", focus);
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        window.u5Announcements = entries;
        window.u5StopAnnouncements = () => { observer.disconnect(); document.removeEventListener("focusin", focus); };
      });
      const trigger = page.locator(`#studio-export-${format}`);
      const title = format === "json" ? "Export chart as JSON" : "Export chart as text";
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      try {
        await trigger.click(); await expect(dialog).toBeVisible();
        await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
        await trigger.evaluate(element => { element.setAttribute("hidden", ""); });
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole("alert").filter({ hasText: "ui.stale_owner" })).toHaveCount(1);
        await expect(page.locator("#studio-document-title")).toBeFocused();
        await trigger.evaluate(element => { element.removeAttribute("hidden"); });
        await trigger.click(); await expect(dialog).toBeVisible();
        const delivered = page.waitForEvent("download");
        await page.locator("#studio-lifecycle-download").click();
        const download = await delivered, bytes = await readFile(await download.path());
        expect(bytes.length).toBeGreaterThan(0);
        await expect(dialog.getByRole("status")).toContainText("Handed off to your browser.");
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
        await expect(page.getByRole("alert").filter({ hasText: "ui.stale_owner" })).toHaveCount(0);
        await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
        const entries = await page.evaluate(() => window.u5Announcements ?? []);
        expect(entries.length).toBeLessThan(256);
        // These are observed DOM announcements/focus events, not a claim about
        // an unobserved screen reader's speech queue or human acceptance.
        expect(entries.filter(entry => entry.kind === "focus" && entry.text === title)).toHaveLength(2);
        expect(entries.filter(entry => entry.kind === "alert" && entry.text.includes("ui.stale_owner"))).toHaveLength(1);
        expect(entries.filter(entry => entry.kind === "status" && entry.text.startsWith("Handed off to your browser."))).toHaveLength(1);
        expect(errors).toEqual([]); expect(requests.filter(url => url !== artifact)).toEqual([]);
      } finally {
        const entries = await page.evaluate(() => { window.u5StopAnnouncements?.(); return window.u5Announcements ?? []; });
        await info.attach("lifecycle-announcements", { contentType: "application/json", body: JSON.stringify({ artifactSha256,
          browserVersion: browser.version(), viewport, format, entries, errors, requests }) });
      }
    });
  });
}
