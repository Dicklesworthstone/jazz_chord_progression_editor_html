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

/**
 * Backend-free sharing: a #zdoc= fragment carries the chart locally — no
 * request leaves the page in either direction. Opening a link applies it
 * through the typed command path; a corrupted link falls back to the
 * starter chart with the refusal stated; Copy link writes the fragment to
 * the address bar (and the clipboard where the browser allows it).
 */
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
    // A shared open is not a half-applied state: undo unwinds real commands.
    await expect(page.locator("#studio-undo")).toBeEnabled();
    expectCleanDiagnostics(diagnostics);
  });

  test("a corrupted link falls back to the starter chart and says why", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await page.goto(`${artifactUrl()}#zdoc=1.%%%%`, { waitUntil: "load" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    // The starter chart seeded normally underneath the stated refusal.
    await expect(cards(page).first()).toBeVisible();
    const notice = page.locator(".studio-shell-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Share link not opened");
    await expect(notice).toContainText("base64url");
    await page.locator("#studio-dismiss-shell-notice").click();
    await expect(notice).toHaveCount(0);
    expectCleanDiagnostics(diagnostics);
  });

  test("Copy link writes the fragment to the address bar and round-trips", async ({
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
    await expect
      .poll(async () => page.evaluate(() => window.location.hash.slice(0, 8)))
      .toBe("#zdoc=1.");
    const feedback = page.locator("#studio-share-feedback");
    await expect(feedback).toContainText(/clipboard|address bar/);

    /*
     * The link the button produced reopens as the same chart. Reload
     * rather than re-goto: a same-URL hash navigation is same-document in
     * some engines and a full load in others, and this assertion is about
     * the boot path running with the fragment in place on every engine.
     */
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

  test("an empty chart refuses to share with the reason stated", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await page.locator("#studio-copy-share-link").click();
    await expect(page.locator("#studio-share-feedback")).toContainText(
      "Write at least one chord",
    );
    await expect
      .poll(async () => page.evaluate(() => window.location.hash))
      .toBe("");
    expectCleanDiagnostics(diagnostics);
  });
});
