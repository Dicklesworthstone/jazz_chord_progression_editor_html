import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { batchChordFile } from "../support/midi-batch-fixtures";
import type {} from "./midi-audition-release-harness";
let directory: string, sourceHash: string;
test.use({ viewport: { width: 1280, height: 900 }, userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jcpe-midi-release-"));
  await promisify(execFile)("bun", ["build", "--target=browser", "--outdir", directory, "tests/e2e/midi-audition-release-harness.tsx"]);
  sourceHash = createHash("sha256").update(await readFile("src/ui/App.tsx")).digest("hex");
});
for (const outcome of ["success", "refusal", "throw", "replacement"] as const) {
  test(`MIDI audition release acknowledgement: ${outcome}`, async ({ page, browser }, info) => {
    const errors: string[] = [], requests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent('<!doctype html><html lang="en"><head><title>JazzChords.org release proof</title></head><body></body></html>');
    for (const name of ["tokens", "reset", "primitives", "ui-foundations", "ui-forms", "ui-navigation", "ui-overlays", "ui-structured", "app", "studio", "responsive"])
      await page.addStyleTag({ path: join("src/styles", name + ".css") });
    await page.addScriptTag({ path: join(directory, "midi-audition-release-harness.js"), type: "module" });
    const panel = page.getByTestId("midi-import-rail"), file = panel.getByTestId("midi-import-file");
    await file.setInputFiles({ name: "first.mid", mimeType: "audio/midi", buffer: Buffer.from(batchChordFile({ bars: 4 })) });
    const button = panel.getByTestId("midi-import-audition");
    await expect(button).toHaveText("Audition the first bars");
    const revision = await page.evaluate(() => window.midiReleaseProof.revision());
    await button.click();
    await expect(panel).toContainText("Auditioning the first bars");
    await page.evaluate(() => window.midiReleaseProof.arm());
    await button.click();
    if (outcome === "replacement") {
      await file.setInputFiles({ name: "replacement.mid", mimeType: "audio/midi", buffer: Buffer.from(batchChordFile({ bars: 4, transpose: 2 })) });
      await expect(button).toHaveText("Audition the first bars");
      await button.click(); await expect(panel).toContainText("Auditioning the first bars");
      await page.evaluate(() => window.midiReleaseProof.settle("refusal"));
      await expect(button).toHaveText("Stop the audition");
      await expect(panel).not.toContainText("Release refused");
      await button.click();
    } else {
      if (outcome !== "success") {
        await expect(button).toHaveText("Stop the audition");
        await expect(panel).not.toContainText("Audition stopped.");
      }
      await page.evaluate(value => window.midiReleaseProof.settle(value), outcome);
      if (outcome !== "success") {
        await expect(button).toHaveText("Stop the audition");
        await expect(panel).toContainText(/release.*failed|Release refused/i);
        await button.click();
      }
    }
    await expect(button).toHaveText("Audition the first bars");
    await expect(panel).toContainText("Audition stopped. Your chart is unchanged.");
    expect(await page.evaluate(() => window.midiReleaseProof.voices())).toBe(0);
    expect(await page.evaluate(() => window.midiReleaseProof.revision())).toBe(revision);
    expect(errors).toEqual([]); expect(requests).toEqual([]);
    await info.attach("release-proof", { contentType: "application/json", body: JSON.stringify({ outcome, sourceHash, browser: browser.version(), errors, requests }) });
  });
}
