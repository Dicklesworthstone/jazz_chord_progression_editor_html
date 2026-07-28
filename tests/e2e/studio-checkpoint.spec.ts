import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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

test.describe("interactive studio checkpoint", () => {
  test("commits, refuses, resets, undoes, and redoes titles through the real document controller", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await openStudio(page);

    const title = page.getByRole("textbox", { name: "Chart title" });
    const apply = page.getByRole("button", { name: "Apply title" });
    const reset = page.getByRole("button", { name: "Reset" });

    /*
     * First open now carries the seeded starter chart (jcpe-b20t): its
     * title is committed at revision 3, so the checkpoint's title flow
     * starts from the seeded value rather than the pristine default.
     */
    await expect(title).toHaveValue("Deacon Blues");
    await expect(apply).toBeDisabled();
    await title.fill("Blue in Green");
    await expect(apply).toBeEnabled();
    await apply.click();

    await expect(title).toHaveValue("Blue in Green");
    await expect(page.getByText("Not exported", { exact: true })).toBeVisible();
    await expect(page.getByText("Revision 4", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Title committed as an undoable document change."),
    ).toBeVisible();

    const refusedDraft = "X".repeat(257);
    await title.fill(refusedDraft);
    await apply.click();
    await expect(title).toHaveValue(refusedDraft);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Revision 4", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/A refused title leaves “Blue in Green” unchanged\./u),
    ).toBeVisible();

    await reset.click();
    await expect(title).toHaveValue("Blue in Green");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(title).toHaveValue("Deacon Blues");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(title).toHaveValue("Blue in Green");

    expectCleanDiagnostics(diagnostics);
  });

  test("cycles both persistent rails and keeps unavailable transport honest", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openStudio(page);

    await expect(
      page.getByRole("complementary", { name: "Library" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Harmony Lens" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Collapse Library" }).click();
    const expandLibrary = page.getByRole("button", { name: "Expand Library" });
    await expect(expandLibrary).toBeVisible();
    await expandLibrary.click();
    await expect(
      page.getByRole("button", { name: "Collapse Library" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Collapse Harmony Lens" }).click();
    const expandHarmony = page.getByRole("button", {
      name: "Expand Harmony Lens",
    });
    await expect(expandHarmony).toBeVisible();
    await expandHarmony.click();

    await expect(page.getByText("Audio off", { exact: true })).toBeVisible();
    /*
     * The seeded starter chart (jcpe-b20t) gives the transport something to
     * play from the first paint: Play is enabled while Pause and Stop stay
     * disabled at idle. The controls that exist are exactly the wired ones;
     * unwired previous/next/loop must not render at all.
     */
    await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();
    for (const name of ["Pause", "Stop"]) {
      await expect(page.getByRole("button", { name })).toBeDisabled();
    }
    for (const name of ["Previous chord", "Next chord", "Loop progression"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(page.locator(".studio-chord-card")).toHaveCount(24);
    /*
     * The pristine empty-measure statement remains reachable and honest:
     * undoing the seed away restores the empty studio and its hint.
     */
    const undo = page.locator("#studio-undo");
    for (let press = 0; press < 6 && (await undo.isEnabled()); press += 1) {
      await undo.click();
    }
    await expect(page.getByText("Empty measure", { exact: true })).toBeVisible();
    await expect(
      page
        .locator(".studio-measure")
        .getByText("Type chart text to fill this bar.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".studio-chord-card")).toHaveCount(0);
    for (const name of ["Play", "Pause", "Stop"]) {
      await expect(page.getByRole("button", { name })).toBeDisabled();
    }

    expectCleanDiagnostics(diagnostics);
  });

  test("opens one mobile sheet at a time and restores focus after Escape and backdrop dismissal", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openStudio(page);

    const libraryTrigger = page.getByRole("button", { name: "Library" });
    const harmonyTrigger = page.getByRole("button", { name: "Harmony Lens" });
    await libraryTrigger.click();

    const librarySheet = page.getByRole("dialog", { name: "Library" });
    await expect(librarySheet).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.locator("#studio-shell-background")).toHaveAttribute(
      "inert",
      "",
    );
    await page.keyboard.press("Escape");
    await expect(librarySheet).toHaveCount(0);
    await expect(libraryTrigger).toBeFocused();

    await harmonyTrigger.click();
    const harmonySheet = page.getByRole("dialog", { name: "Harmony Lens" });
    await expect(harmonySheet).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);

    const bounds = await Promise.all([
      harmonySheet.boundingBox(),
      page.locator(".studio-transport").boundingBox(),
    ]);
    expect(bounds[0]).not.toBeNull();
    expect(bounds[1]).not.toBeNull();
    if (bounds[0] !== null && bounds[1] !== null) {
      expect(bounds[0].y + bounds[0].height).toBeLessThanOrEqual(
        bounds[1].y + 1,
      );
    }

    const harmonyBackdrop = page.locator(".ui-sheet-backdrop");
    await expect(harmonyBackdrop).not.toHaveAttribute("inert");
    await harmonyBackdrop.click({
      position: { x: 16, y: 16 },
    });
    await expect(harmonySheet).toHaveCount(0);
    await expect(harmonyTrigger).toBeFocused();

    expectCleanDiagnostics(diagnostics);
  });

  test("fits every required checkpoint viewport without horizontal page overflow", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    const viewports = [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await openStudio(page);
      const fit = await page.evaluate(() => {
        const transport = document.querySelector(".studio-transport");
        const transportRect = transport?.getBoundingClientRect() ?? null;
        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          transportBottom: transportRect?.bottom ?? Number.POSITIVE_INFINITY,
          transportTop: transportRect?.top ?? Number.NEGATIVE_INFINITY,
          viewportHeight: window.innerHeight,
        };
      });
      expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
      expect(fit.transportTop).toBeGreaterThanOrEqual(0);
      expect(fit.transportBottom).toBeLessThanOrEqual(fit.viewportHeight + 1);
    }

    expectCleanDiagnostics(diagnostics);
  });
});
