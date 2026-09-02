import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

/**
 * jcpe-j4hj mid-run reproduction: while a run is playing, switch instruments
 * and verify the run survives the swap on the deployed-equivalent artifact.
 */

const ARTIFACT = process.env["J4HJ_URL"] ?? `file://${resolve("jazz_chord_progression_editor.html")}`;

async function audioState(page: Page): Promise<string> {
  return page.evaluate(() => {
    return (
      document
        .querySelector("#transport-bar")
        ?.getAttribute("data-audio-state") ?? "missing"
    );
  });
}

async function transportText(page: Page): Promise<string> {
  return page.evaluate(() => {
    return document.querySelector("#transport-bar")?.textContent ?? "";
  });
}

test("mid-run instrument swaps keep the run alive", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto(ARTIFACT);
  const closeTour = page.getByRole("button", { name: "Close the tour" });
  if (await closeTour.isVisible().catch(() => false)) {
    await closeTour.click();
  }
  const field = page.locator("#studio-quick-entry-field");
  await field.click();
  await field.fill("| Cmaj7 | Fmaj7 | Dm7 G7 | Cmaj7 | Cmaj7 | Fmaj7 | Dm7 G7 | Cmaj7 |");
  await field.press("Enter");
  await page.waitForTimeout(500);

  const outcomes: Record<string, string> = {};
  for (const startInstrument of ["mellow-keys", "concert-grand"]) {
    for (const target of ["flute", "clarinet", "dreadnought-guitar", "blues-guitar", "ukulele"]) {
      if (target === startInstrument) continue;
      const label = `${startInstrument}→${target}`;
      await page.selectOption("#studio-transport-instrument", startInstrument, { timeout: 15_000 });
      await page.waitForTimeout(250);
      const playButton = page.locator("#studio-transport-play");
      await expect(playButton).toBeEnabled({ timeout: 15_000 });
      await playButton.click({ timeout: 15_000 });
      const deadline = Date.now() + 25_000;
      let state = await audioState(page);
      while (state !== "playing" && state !== "failed" && Date.now() < deadline) {
        await page.waitForTimeout(200);
        state = await audioState(page);
      }
      if (state !== "playing") {
        const detail = await transportText(page);
        outcomes[label] = `start-failed: ${state}: ${detail.slice(0, 180)}`;
        continue;
      }
      await page.waitForTimeout(600);
      /* the mid-run swap */
      await page.selectOption("#studio-transport-instrument", target, { timeout: 15_000 });
      await page.waitForTimeout(3000);
      const after = await audioState(page);
      if (after === "playing") {
        outcomes[label] = "survived";
      } else {
        const text = await transportText(page);
        outcomes[label] = `${after}: ${text.slice(0, 200)}`;
      }
      await page.locator("#studio-transport-stop").click({ timeout: 15_000 }).catch(() => undefined);
      const stopDeadline = Date.now() + 15_000;
      let settled = await audioState(page);
      while (settled !== "ready" && settled !== "unavailable" && settled !== "failed" && Date.now() < stopDeadline) {
        await page.waitForTimeout(150);
        settled = await audioState(page);
      }
      await page.waitForTimeout(500);
    }
  }
  console.log("J4HJ-MIDRUN " + JSON.stringify(outcomes, null, 2));
  const failures = Object.entries(outcomes).filter(([, outcome]) => outcome !== "survived");
  expect(failures, JSON.stringify(outcomes, null, 2)).toEqual([]);
});
