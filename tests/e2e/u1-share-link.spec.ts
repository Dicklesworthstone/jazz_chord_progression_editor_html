import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { encodeShareFragment } from "../../src/application/studio-share";
import {
  captureDiagnostics,
  cards,
  expectCleanDiagnostics,
  openStudio,
  typeAndInsert,
} from "./u1-chart-kit";

function artifactUrl(): string {
  return pathToFileURL(
    join(process.cwd(), "jazz_chord_progression_editor.html"),
  ).href;
}

/** Legacy-v1 reading and current exact sharing through the native UI. */
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
test.describe("share links", () => {
  test("a share link opens as the shared chart with tempo and groove", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    const encoded = encodeShareFragment({
      chartText: "| Dm7:2/1 G7:2/1 | Cmaj7:4/1 |",
      grooveStyleId: "straight-eighths@1",
      tempoBpm: 140,
      title: "Shared Reference",
    });
    if (!encoded.ok) throw new Error(encoded.message);

    await page.goto(`${artifactUrl()}${encoded.value}`, {
      waitUntil: "load",
    });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await expect(cards(page)).toHaveCount(3);
    await expect(page.locator("#studio-document-title")).toHaveValue(
      "Shared Reference",
    );
    await expect(page.locator("#transport-bar")).toContainText("140 BPM");
    await expect(
      page
        .locator("#studio-groove-picker-rail")
        .getByRole("radio", { name: "Straight eighths" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".studio-shell-notice")).toContainText("older link omits exact voicings");
    // A shared open is not a half-applied state: undo unwinds real commands.
    await expect(page.locator("#studio-undo")).toBeEnabled();
    expectCleanDiagnostics(diagnostics);
  });

  test("a corrupted link preserves the blank workspace and says why", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await page.goto(`${artifactUrl()}#zdoc=1.%%%%`, { waitUntil: "load" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator("#studio-document-title")).toHaveValue("Untitled Chart");
    await expect(page.locator("#studio-undo")).toBeDisabled();
    const notice = page.locator(".studio-shell-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Share link");
    await expect(notice).toContainText("base64url");
    await page.locator("#studio-dismiss-shell-notice").click();
    await expect(notice).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("exact sharing retains chart and groove without changing the address bar", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await typeAndInsert(page, "| Am7 D7 | Gmaj7 |");
    /*
     * jcpe-jnnu: the groove is a document setting, so the picked style must
     * survive the whole copy → reload cycle through the fragment and the
     * document field rather than evaporating with the session.
     */
    await page
      .locator("#studio-groove-picker-rail")
      .getByRole("radio", { name: "Bossa nova" })
      .click();

    await page.locator("#studio-copy-share-link").click();
    const dialog = page.getByRole("dialog", { name: "Share the exact chart", exact: true });
    await expect(dialog).toBeVisible();
    const link = await page.locator("#studio-exact-share-url").inputValue();
    expect(new URL(link).hash.startsWith("#zdoc=2.")).toBe(true);
    expect(await page.evaluate(() => window.location.hash)).toBe("");
    await page.keyboard.press("Escape");
    await page.goto(`${artifactUrl()}${new URL(link).hash}`);
    await page.reload({ waitUntil: "load" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await expect(cards(page)).toHaveCount(3);
    await expect(
      page
        .locator("#studio-groove-picker-rail")
        .getByRole("radio", { name: "Bossa nova" }),
    ).toHaveAttribute("aria-checked", "true");
    expectCleanDiagnostics(diagnostics);
  });

  test("an empty chart has an exact share link without inventing content", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await page.locator("#studio-copy-share-link").click();
    const dialog = page.getByRole("dialog", { name: "Share the exact chart", exact: true });
    await expect(dialog).toBeVisible();
    const link = await page.locator("#studio-exact-share-url").inputValue();
    expect(new URL(link).hash.startsWith("#zdoc=2.")).toBe(true);
    expect(await page.evaluate(() => window.location.hash)).toBe("");
    await page.keyboard.press("Escape");
    await page.goto(`${artifactUrl()}${new URL(link).hash}`); await page.reload();
    await expect(cards(page)).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });
});
