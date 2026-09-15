import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { openStudio, captureDiagnostics, expectCleanDiagnostics } from "./u1-chart-kit";
import { observeNativeSources } from "../support/u5-native-audio";
import { batchChordFile } from "../support/midi-batch-fixtures";

// Exact independent M0 golden: C major at 0..480; Dm7 at 480..960,
// source channel 4, velocity 80. Dm7 also admits F6/D.
const source = Buffer.from("4D546864000000060000000101E04D54726B0000004800FF510307A12000FF58040402180800933C6400406400436483603C0000400000430000FF51030F424000933E5000415000455000485083603E0000410000450000480000FF2F00", "hex");
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });
for (const width of [320, 1280]) test(`M1 source review preserves notes and owns preview at ${String(width)}px`, async ({ page, browser }, info) => {
  const diagnostics = captureDiagnostics(page);
  const requests: string[] = [];
  page.on("request", request => { if (!request.isNavigationRequest()) requests.push(request.url()); });
  await page.setViewportSize({ width, height: 900 });
  await openStudio(page);
  if (width === 320) await page.locator("#studio-open-library-sheet").click();
  const panel = page.getByTestId(width === 320 ? "midi-import-sheet" : "midi-import-rail");
  const revision = await page.locator(".studio-document-status__revision").textContent();
  const file = panel.getByTestId("midi-import-file");
  await file.setInputFiles({ name: "literal-source.mid", mimeType: "audio/midi", buffer: source });
  await expect(panel.getByTestId("midi-import-auto")).toBeVisible();
  await expect(panel.getByTestId("midi-import-advanced")).not.toHaveAttribute("open");
  await panel.getByTestId("midi-import-advanced-summary").click();
  const chart = await panel.getByTestId("midi-import-chart-text").textContent();
  const reviewButton = panel.getByTestId("midi-import-review-source").first();
  await reviewButton.click();
  const review = panel.getByTestId("midi-import-source-review");
  await expect(review).toBeFocused();
  await expect(review).toContainText("4 note occurrences across 1 track");
  await expect(review.getByTestId("midi-import-source-pitch")).toHaveText(["D4 (MIDI 62)", "F4 (MIDI 65)", "A4 (MIDI 69)", "C5 (MIDI 72)"]);
  await review.locator("summary").click();
  await expect(review.locator("li").first()).toContainText("channel 4 · ticks 480–960 · velocity 80");
  await expect(review).toContainText("Original timing, dynamics and pedals are not reproduced");
  await observeNativeSources(page);
  const all = review.getByTestId("midi-import-source-all");
  await all.focus(); await all.press("Enter");
  await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().sounding ?? 0)).toBeGreaterThan(0);
  const sounding = await page.evaluate(() => window.u5NativeSourceCounts?.());
  const stop = review.getByTestId("midi-import-source-stop");
  await stop.focus(); await stop.press("Enter");
  await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
  const stopped = await page.evaluate(() => window.u5NativeSourceCounts?.());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.u5NativeSourceCounts?.())).toEqual(stopped);
  const axe = await new AxeBuilder({ page }).include(`[data-testid="midi-import-${width === 320 ? "sheet" : "rail"}"]`).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // Axe uses a temporary page. Restore the app's foreground before taking
  // the viewport screenshot; an element crop hides the scrollable panel.
  await page.bringToFront();
  // WebKit's screenshot preparation injects an inline `body {}` style,
  // violating this artifact's hash CSP. Keep its real error gate intact;
  // capture visual artifacts in Chromium while all engines run assertions.
  if (info.project.name === "chromium") await page.screenshot({ path: info.outputPath("source-review.png") });
  // Alternative changes replace the preview identity and cannot retain old notes.
  await panel.getByTestId("midi-import-alternative-picker").first().selectOption({ label: "F6/D" });
  await expect(review).toHaveCount(0);
  await expect(panel.getByTestId("midi-import-chart-text")).toContainText("F6/D");
  await reviewButton.click();
  await expect(review.getByTestId("midi-import-source-pitch")).toHaveText(["D4 (MIDI 62)", "F4 (MIDI 65)", "A4 (MIDI 69)", "C5 (MIDI 72)"]);
  await panel.getByTestId("midi-import-track-include").first().uncheck();
  await expect(review).toHaveCount(0);
  await panel.getByTestId("midi-import-track-include").first().check();
  await reviewButton.click();
  await expect(review).toBeVisible();
  await file.setInputFiles({ name: "replacement.mid", mimeType: "audio/midi", buffer: Buffer.from(batchChordFile()) });
  await expect(review).toHaveCount(0);
  expect(await page.locator(".studio-document-status__revision").textContent()).toBe(revision);
  await expect(page.locator("#studio-undo")).toBeDisabled();
  await expect(page.locator(".studio-chord-card")).toHaveCount(0);
  expectCleanDiagnostics(diagnostics); expect(requests).toEqual([]);
  await info.attach("source-review-proof", { body: JSON.stringify({ width, browser: browser.version(), artifact: createHash("sha256").update(readFileSync("jazz_chord_progression_editor.html")).digest("hex"), revision, chart, sounding, stopped, diagnostics, requests }), contentType: "application/json" });
});

test("M1 unwritten silence is reviewable without inventing a source pitch", async ({ page }) => {
  const diagnostics = captureDiagnostics(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await openStudio(page);
  await page.locator("#studio-open-library-sheet").click();
  const panel = page.getByTestId("midi-import-sheet");
  await panel.getByTestId("midi-import-file").setInputFiles({ name: "leading-silence.mid", mimeType: "audio/midi", buffer: Buffer.from(batchChordFile({ leadingTicks: 1920 })) });
  await expect(panel.getByTestId("midi-import-auto")).toBeVisible();
  await panel.getByTestId("midi-import-advanced-summary").click();
  await expect(panel.getByTestId("midi-import-alternative-picker").first()).toBeDisabled();
  const trigger = panel.getByTestId("midi-import-review-source").first();
  await trigger.click();
  const review = panel.getByTestId("midi-import-source-review");
  await expect(review).toBeFocused();
  await expect(review).toContainText("0 note occurrences across 0 tracks");
  await expect(review.getByTestId("midi-import-source-all")).toBeDisabled();
  await expect(review.getByTestId("midi-import-source-pitch")).toHaveCount(0);
  await review.getByRole("button", { name: "Close source review", exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("#studio-undo")).toBeDisabled();
  expectCleanDiagnostics(diagnostics);
});
