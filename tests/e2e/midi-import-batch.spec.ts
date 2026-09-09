import { expect, test } from "@playwright/test";
import { batchChordFile } from "../support/midi-batch-fixtures";
import { captureDiagnostics, expectCleanDiagnostics, openStudio } from "./u1-chart-kit";

test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
for (const width of [1280, 390]) {
  test(`local candidate comparison, explicit Add and Undo at ${String(width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const diagnostics = captureDiagnostics(page);
    const requests: string[] = [];
    await page.route(/^https?:/, async (route) => { requests.push(route.request().url()); await route.abort(); });
    await openStudio(page);
    if (width === 390) await page.locator("#studio-open-library-sheet, #studio-transport-open-library").filter({ visible: true }).first().click();
    const input = page.getByTestId("midi-import-file").filter({ visible: true }).first();
    const payload = (name: string, bars = 1) => ({ name, mimeType: "audio/midi", buffer: Buffer.from(batchChordFile({ bars })) });
    await input.setInputFiles([
      payload("candidate.mid"), payload("candidate.mid", 30),
      { name: "broken.mid", mimeType: "audio/midi", buffer: Buffer.from([1, 2]) },
    ]);
    const comparison = page.getByTestId("midi-import-candidates").filter({ visible: true }).first();
    await expect(comparison).toBeVisible();
    const recommended = comparison.getByTestId("midi-import-candidate-1");
    await expect(recommended).toHaveAttribute("aria-pressed", "true");
    await expect(recommended).toContainText("Recommended · 62 points");
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    const alternative = comparison.getByTestId("midi-import-candidate-0");
    await alternative.focus();
    await page.keyboard.press("Enter");
    await expect(alternative).toHaveAttribute("aria-pressed", "true");
    await expect(recommended).toHaveAttribute("aria-pressed", "false");
    const buttonBounds = await alternative.boundingBox();
    expect(buttonBounds?.height).toBeGreaterThanOrEqual(44);
    await comparison.getByText("Why this score?", { exact: true }).first().click();
    await expect(comparison).toContainText("completeness is unknown");
    await page.getByRole("button", { name: "Add to the chart", exact: true }).filter({ visible: true }).click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(1);
    await expect(comparison).toHaveCount(0);
    const notice = await page.getByTestId("midi-import-status").filter({ visible: true }).innerText();
    if (width === 390) await page.getByRole("button", { name: /^Close / }).filter({ visible: true }).first().click();
    const undo = page.locator("#studio-undo");
    const undoCount = notice.includes("one edit") ? 1 : Number(/added as (\d+) edits/.exec(notice)?.[1]);
    expect(Number.isInteger(undoCount)).toBe(true);
    expect(undoCount).toBeGreaterThan(0);
    expect(undoCount).toBeLessThanOrEqual(8);
    for (let index = 0; index < undoCount; index++) await undo.click();
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    if (width === 390) await page.locator("#studio-open-library-sheet, #studio-transport-open-library").filter({ visible: true }).first().click();
    await input.setInputFiles(Array.from({ length: 6 }, (_, index) => payload(`${String(index)}.mid`)));
    await expect(page.getByTestId("midi-import-status").filter({ visible: true })).toHaveText("Choose between one and five MIDI files.");
    await expect(page.getByRole("button", { name: "Add to the chart", exact: true }).filter({ visible: true })).toHaveCount(0);
    await input.setInputFiles([payload("same.mid"), payload("same.mid")]);
    await expect(comparison.getByTestId("midi-import-candidate-0")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Discard comparison", exact: true }).filter({ visible: true }).click();
    await expect(comparison).toHaveCount(0);
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    // Delay completion of a REAL local File read, rather than replacing its
    // bytes/decoder. This deterministically exposes the Cancel race.
    await page.evaluate(() => {
      const state = window as Window & { batchReadNames?: string[]; releaseBatchRead?: () => void };
      state.batchReadNames = [];
      const read = Reflect.get(File.prototype, "arrayBuffer");
      const pending = new Promise<void>((resolve) => { state.releaseBatchRead = resolve; });
      File.prototype.arrayBuffer = async function () {
        state.batchReadNames?.push(this.name);
        const bytes = await read.call(this);
        if (this.name === "slow.mid") await pending;
        return bytes;
      };
    });
    await input.setInputFiles([payload("slow.mid"), payload("never-read.mid")]);
    await page.getByRole("button", { name: "Cancel comparison", exact: true }).filter({ visible: true }).click();
    await page.evaluate(async () => {
      (window as Window & { releaseBatchRead?: () => void }).releaseBatchRead?.();
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); });
    });
    await expect(page.getByTestId("midi-import-status").filter({ visible: true })).toHaveText("No file chosen.");
    expect(await page.evaluate(() => (window as Window & { batchReadNames?: string[] }).batchReadNames)).toEqual(["slow.mid"]);
    await expect(comparison).toHaveCount(0);
    expect(requests).toEqual([]);
    expectCleanDiagnostics(diagnostics);
    await testInfo.attach("batch-import-evidence", { body: JSON.stringify({ width, notice, undoCount, buttonBounds, requests, diagnostics }), contentType: "application/json" });
  });
}
