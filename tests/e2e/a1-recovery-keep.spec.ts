/**
 * A1 user-visible recovery proof against the REAL generated artifact
 * (jcpe-milestone-reliable-studio-l3a.2 step 4): a titled edit persists
 * through the production recovery service (real browser storage), a
 * reload of the SAME context surfaces the reviewed Keep/Discard offer,
 * Keep restores the edited title through the transactional replacement
 * channel (boot-time X1 retirement is the vacuous locked-transport law),
 * and the frozen-vocabulary status line reports "Recovered locally at".
 * Discard is proven too: the offer clears and the seeded chart stands.
 * A pristine open shows NO recovery surface at all.
 */
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RECOVERED_TITLE = "Recovery Proof Chart";

function artifactUrl(): string {
  return pathToFileURL(
    join(process.cwd(), "jazz_chord_progression_editor.html"),
  ).href;
}

async function openStudio(page: Page): Promise<void> {
  await page.goto(artifactUrl(), { waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

async function retitleChart(page: Page, title: string): Promise<void> {
  const input = page.locator("#studio-document-title");
  await input.click();
  await input.fill(title);
  await input.press("Enter");
  await expect(input).toHaveValue(title);
}

test("a pristine open offers no recovery surface", async ({ page }) => {
  await openStudio(page);
  await expect(page.locator("#studio-recovery-keep")).toHaveCount(0);
  await expect(page.locator("#studio-recovery-status")).toHaveCount(0);
});

test("edit -> reload -> Keep restores the chart through the production channel", async ({ page }) => {
  await openStudio(page);
  await retitleChart(page, RECOVERED_TITLE);
  /* the recovery service's own scheduler (400ms idle / 2s max) persists
   * the mutation; give it real time plus margin */
  await page.waitForTimeout(3_000);

  await page.reload({ waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();

  /* the reviewed matrix offers Keep/Discard (the boot session has
   * already edited via the starter seed, so no silent auto-open) */
  const keep = page.locator("#studio-recovery-keep");
  await expect(keep).toBeVisible();
  /* the freshly booted session shows the seeded title, not the edit */
  await expect(page.locator("#studio-document-title")).not.toHaveValue(
    RECOVERED_TITLE,
  );

  await keep.click();

  /* Keep rode the replacement channel: the edited title is back and the
   * status line speaks the frozen vocabulary */
  await expect(page.locator("#studio-document-title")).toHaveValue(
    RECOVERED_TITLE,
  );
  await expect(page.locator("#studio-recovery-status")).toContainText(
    "Recovered locally at",
  );
  await expect(page.locator("#studio-recovery-keep")).toHaveCount(0);
});

test("edit -> reload -> Discard clears the offer and keeps the seeded chart", async ({ page }) => {
  await openStudio(page);
  await retitleChart(page, RECOVERED_TITLE);
  await page.waitForTimeout(3_000);

  await page.reload({ waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await expect(page.locator("#studio-recovery-keep")).toBeVisible();

  await page.locator("#studio-recovery-discard").click();
  await expect(page.locator("#studio-recovery-keep")).toHaveCount(0);
  await expect(page.locator("#studio-document-title")).not.toHaveValue(
    RECOVERED_TITLE,
  );

  /* the discard was durable: another reload offers nothing */
  await page.reload({ waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator("#studio-recovery-keep")).toHaveCount(0);
});
