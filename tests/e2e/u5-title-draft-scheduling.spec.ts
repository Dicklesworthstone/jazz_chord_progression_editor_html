import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type {} from "./u5-title-draft-harness";

const root = process.cwd();
let directory: string;
let sourceSha256: string;
test.use({ viewport: { width: 390, height: 844 }, userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jcpe-u5-title-scheduling-"));
  await promisify(execFile)(process.env["BUN_BINARY"] ?? "bun", ["build", "--target=browser", "--outdir", directory,
    "tests/e2e/u5-title-draft-harness.tsx"], { cwd: root });
  sourceSha256 = createHash("sha256").update(await readFile(join(root, "src/ui/App.tsx"))).digest("hex");
});
test.afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

for (const state of ["untouched", "selected", "draft"] as const) {
  test(`external title publication preserves a ${state} field across delayed passive effects`, async ({ page, browser }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", route => route.abort("blockedbyclient"));
    await page.setContent('<!doctype html><html lang="en"><head><title>Title scheduling proof</title></head><body></body></html>');
    for (const name of ["tokens", "reset", "primitives", "ui-foundations", "ui-forms", "ui-navigation",
      "ui-overlays", "ui-structured", "app", "studio", "responsive"]) {
      await page.addStyleTag({ path: join(root, "src/styles", `${name}.css`) });
    }
    await page.addScriptTag({ path: join(directory, "u5-title-draft-harness.js"), type: "module" });
    await page.evaluate(() => { window.u5TitleScheduling.flushEffects(); });
    const title = page.locator("#studio-document-title");
    await expect(title).toHaveValue("Untitled Chart");
    if (state === "selected") {
      await title.focus();
      await title.press("ControlOrMeta+A");
    } else if (state === "draft") {
      await title.fill("My exact draft");
    }
    await page.evaluate(() => { window.u5TitleScheduling.commitExternalTitle("External title"); });
    await expect(page.getByRole("status", { name: "Document status", exact: true })).toContainText("Revision 1");
    // The untouched field must update before passive effects; focused text and
    // its native selection must remain stable until the user's next keystroke.
    await expect(title).toHaveValue(state === "untouched" ? "External title" : state === "selected" ? "Untitled Chart" : "My exact draft");
    if (state === "selected") await page.keyboard.insertText("My exact draft");
    else if (state === "untouched") await title.fill("My exact draft");
    await page.evaluate(() => { window.u5TitleScheduling.flushEffects(); });
    await expect(title).toHaveValue("My exact draft");
    expect(await page.evaluate(() => window.u5TitleScheduling.committedTitle())).toBe("External title");
    await title.press("Enter");
    await expect(title).toHaveValue("My exact draft");
    expect(await page.evaluate(() => window.u5TitleScheduling.committedTitle())).toBe("My exact draft");
    await info.attach("title-scheduling.json", { contentType: "application/json", body: JSON.stringify({
      sourceSha256, browserVersion: browser.version(), state, errors,
    }) });
    expect(errors).toEqual([]);
  });
}
