import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Mobile Sound-sheet parity (bead jcpe-mobile-ui-parity-ts5i).
 *
 * Owner report (2026-08-07, verbatim): "you can't select the instrument or
 * groove at all from the mobile interface. The mobile UI *MUST* expose *ALL*
 * the same functionality." The measured defect: below 71.875rem the footer
 * settings cluster (instrument, groove, tempo, volume, mute) was
 * `display: none`, and the Library-panel fallback buried the groove picker
 * ~3.5k px deep in a ~750 px sheet viewport (the jcpe-osxq class) while
 * carrying no instrument or volume control at all.
 *
 * These tests assert the remedy from an UNSCROLLED state — auto-scroll must
 * never be what makes them pass — and assert STATE-level effect: the footer
 * cluster's controls stay in the DOM (hidden) at phone widths with values
 * bound to the same view model, so a sheet-driven change must be visible in
 * the footer control's value. A UI that opens a sheet but drops the change
 * fails here.
 */

type PageDiagnostics = Readonly<{
  consoleErrors: string[];
  pageErrors: string[];
}>;

function captureDiagnostics(page: Page): PageDiagnostics {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
}

function artifactUrl(): string {
  return pathToFileURL(
    join(process.cwd(), "jazz_chord_progression_editor.html"),
  ).href;
}

async function openStudio(page: Page): Promise<void> {
  await page.goto(artifactUrl(), { waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

function expectCleanDiagnostics(diagnostics: PageDiagnostics): void {
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
}

const PHONE_VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "narrow phone", width: 320, height: 568 },
  { name: "tablet gap", width: 1000, height: 800 },
] as const;

for (const viewport of PHONE_VIEWPORTS) {
  test.describe(`sound sheet at ${viewport.name} (${String(viewport.width)}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("exposes instrument, groove, tempo, and volume without scrolling", async ({
      page,
    }) => {
      const diagnostics = captureDiagnostics(page);
      await openStudio(page);

      // The trigger must be actionable from the unscrolled landing state.
      const trigger = page.locator("#studio-open-sound-sheet");
      await expect(trigger).toBeVisible();
      const triggerBox = await trigger.boundingBox();
      expect(triggerBox).not.toBeNull();
      expect(triggerBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
        viewport.height,
      );
      const scrollBefore = await page.evaluate(() => window.scrollY);
      expect(scrollBefore).toBe(0);

      await trigger.click();

      // Every retired footer control reopens inside the sheet, in view.
      for (const id of [
        "#studio-transport-instrument-sheet",
        "#studio-transport-groove-sheet",
        "#studio-transport-tempo-up-sheet",
        "#studio-transport-volume-sheet",
        "#studio-transport-mute-sheet",
      ]) {
        await expect(page.locator(id)).toBeVisible();
      }

      // Instrument change: the sheet select drives the shared view model —
      // the footer's (hidden) select must adopt the same value.
      const sheetInstrument = page.locator(
        "#studio-transport-instrument-sheet",
      );
      const footerInstrument = page.locator("#studio-transport-instrument");
      const initialInstrument = await footerInstrument.inputValue();
      const nextInstrument = await sheetInstrument.evaluate(
        (element, current) => {
          const select = element as HTMLSelectElement;
          const candidate = Array.from(select.options)
            .map((option) => option.value)
            .find((value) => value !== current);
          if (candidate === undefined) {
            throw new Error("SOUND_SHEET_NO_ALTERNATE_INSTRUMENT");
          }
          return candidate;
        },
        initialInstrument,
      );
      await sheetInstrument.selectOption(nextInstrument);
      await expect(footerInstrument).toHaveValue(nextInstrument);

      // Groove change: same law.
      const sheetGroove = page.locator("#studio-transport-groove-sheet");
      const footerGroove = page.locator("#studio-transport-groove");
      const initialGroove = await footerGroove.inputValue();
      const nextGroove = await sheetGroove.evaluate((element, current) => {
        const select = element as HTMLSelectElement;
        const candidate = Array.from(select.options)
          .map((option) => option.value)
          .find((value) => value !== current);
        if (candidate === undefined) {
          throw new Error("SOUND_SHEET_NO_ALTERNATE_GROOVE");
        }
        return candidate;
      }, initialGroove);
      await sheetGroove.selectOption(nextGroove);
      await expect(footerGroove).toHaveValue(nextGroove);

      // Dismissal returns focus to the trigger (SheetDrawer focus law).
      await page.keyboard.press("Escape");
      await expect(
        page.locator("#studio-transport-instrument-sheet"),
      ).toHaveCount(0);
      await expect(trigger).toBeFocused();

      expectCleanDiagnostics(diagnostics);
    });
  });
}

test.describe("sound trigger retires when the footer cluster is visible", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("desktop keeps the inline settings and hides the trigger", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);
    await expect(page.locator("#studio-transport-instrument")).toBeVisible();
    await expect(page.locator("#studio-open-sound-sheet")).toBeHidden();
    expectCleanDiagnostics(diagnostics);
  });
});
