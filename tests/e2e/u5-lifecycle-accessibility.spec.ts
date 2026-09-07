import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const artifact = pathToFileURL(resolve("jazz_chord_progression_editor.html")).href;
const artifactSha256 = createHash("sha256").update(readFileSync(new URL(artifact))).digest("hex");
const diagnostics = new WeakMap<Page, { errors: string[]; requests: string[] }>();
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
test.beforeEach(async ({ page }) => {
  const observed = { errors: [] as string[], requests: [] as string[] };
  diagnostics.set(page, observed);
  page.on("pageerror", error => observed.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") observed.errors.push(message.text()); });
  await page.route("**/*", async route => {
    observed.requests.push(route.request().url());
    if (route.request().isNavigationRequest() && route.request().url() === artifact) await route.continue();
    else await route.abort();
  });
  await page.goto(artifact);
  await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
});
test.afterEach(async ({ page, browser }, info) => {
  const observed = diagnostics.get(page);
  await info.attach("lifecycle-accessibility-diagnostics", { contentType: "application/json",
    body: JSON.stringify({ artifactSha256, browserVersion: browser.version(), viewport: page.viewportSize(), ...observed }) });
  expect(observed?.errors).toEqual([]);
  expect(observed?.requests.filter(url => url !== artifact)).toEqual([]);
});

const workflows = [
  { trigger: "studio-new-chart", title: "Start a new chart?" },
  { trigger: "studio-import-chart", title: "Import a chart" },
  { trigger: "studio-export-json", title: "Export chart as JSON" },
  { trigger: "studio-export-text", title: "Export chart as text" },
] as const;
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`U5 lifecycle accessibility ${String(viewport.width)}px`, () => {
    test.use({ viewport });
    for (const workflow of workflows) test(`${workflow.title} has one named modal, trapped focus and an exact return`, async ({ page }, info) => {
      const trigger = page.locator(`#${workflow.trigger}`);
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: workflow.title, exact: true });
      await expect(dialog).toBeVisible();
      await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
      await expect(dialog.getByRole("heading", { name: workflow.title, exact: true })).toBeFocused();
      const focusedInside = () => dialog.evaluate(element => element.contains(document.activeElement));
      const route: string[] = [];
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press(step < 6 ? "Tab" : "Shift+Tab");
        expect(await focusedInside()).toBe(true);
        route.push(await page.evaluate(() => document.activeElement?.id ?? "missing"));
      }
      // Exercise native inert behavior, including programmatic focus attempts.
      await page.locator("#studio-document-title").evaluate(element => { element.focus(); });
      expect(await focusedInside()).toBe(true);
      const selector = `#${await dialog.getAttribute("id") ?? "missing"}`;
      expect(page.frames()).toHaveLength(1);
      const axe = await new AxeBuilder({ page }).setLegacyMode(true).include(selector).analyze();
      await info.attach("lifecycle-accessibility", { contentType: "application/json", body: JSON.stringify({ route, violations: axe.violations }) });
      expect(axe.violations).toEqual([]);
      if (workflow.trigger === "studio-import-chart") {
        await dialog.getByRole("textbox", { name: "Paste chart JSON or text", exact: true }).fill("{");
        await page.locator("#studio-import-preview-text").click();
        await expect(dialog.getByRole("alert")).toHaveCount(1);
        await expect(dialog.getByRole("alert")).toContainText("import.json_syntax_invalid");
        await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
        const refused = await new AxeBuilder({ page }).setLegacyMode(true).include(selector).analyze();
        await info.attach("lifecycle-refusal-accessibility", { contentType: "application/json", body: JSON.stringify(refused.violations) });
        expect(refused.violations).toEqual([]);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
    });
  });
}
