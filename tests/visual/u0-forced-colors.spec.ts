import { expect, test, type Page } from "@playwright/test";

import {
  captureU0PageDiagnostics,
  captureU0Screenshot,
  createU0ArtifactServer,
  createU0GalleryServer,
  evidenceError,
  openU0Artifact,
  u0Binding,
  writeU0EvidenceCell,
  type U0ArtifactServer,
  type U0GalleryServer,
} from "../e2e/u0-browser-test-kit";

let artifact: U0ArtifactServer;
let gallery: U0GalleryServer;

test.beforeAll(async () => {
  [artifact, gallery] = await Promise.all([
    createU0ArtifactServer(),
    createU0GalleryServer(),
  ]);
});

test.afterAll(async () => {
  await Promise.all([artifact.close(), gallery.close()]);
});

async function galleryObservation(page: Page, cellId: string, selector: string) {
  const cellSelector = page.locator('[data-u0-test-control="cell-selector"]');
  await cellSelector.selectOption(cellId);
  const cell = page.locator(`article[data-fixture-id="${cellId}"]`);
  await expect(cell).toBeVisible();
  return cell.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      ariaChecked: element.getAttribute("aria-checked"),
      ariaInvalid: element.getAttribute("aria-invalid"),
      ariaPressed: element.getAttribute("aria-pressed") ??
        element.querySelector("[aria-pressed]")?.getAttribute("aria-pressed") ?? null,
      ariaSelected: element.getAttribute("aria-selected"),
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      color: style.color,
      dataSelected: element.getAttribute("data-selected"),
      checked: element instanceof HTMLInputElement ? element.checked : null,
      indeterminate: element instanceof HTMLInputElement ? element.indeterminate : null,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
}

test("U0-ENV-002 U0-PRIM-013 U0-PRIM-019 forced colors preserve focus selection error playhead and overlay boundaries", async ({
  browserName,
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const viewport = { width: 390, height: 844 } as const;
  const diagnostics = captureU0PageDiagnostics(page);
  const galleryPage = await page.context().newPage();
  const galleryDiagnostics = captureU0PageDiagnostics(galleryPage);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
  try {
    expect(testInfo.retry).toBe(0);
    await page.emulateMedia({ forcedColors: "active" });
    await galleryPage.emulateMedia({ forcedColors: "active" });
    await openU0Artifact(page, artifact, viewport);
    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);

    const title = page.getByRole("textbox", { name: "Chart title" });
    await title.fill("X".repeat(257));
    await page.getByRole("button", { name: "Apply title" }).click();
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await title.focus();
    const artifactStyles = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("#studio-document-title");
      const alert = document.querySelector<HTMLElement>('[role="alert"]');
      if (input === null || alert === null) throw new Error("U0_FORCED_COLOR_ERROR_STATE_MISSING");
      const inputStyle = getComputedStyle(input);
      const alertStyle = getComputedStyle(alert);
      return {
        alert: {
          borderStyle: alertStyle.borderStyle,
          borderWidth: alertStyle.borderWidth,
          text: alert.textContent.trim(),
        },
        focus: {
          outlineStyle: inputStyle.outlineStyle,
          outlineWidth: inputStyle.outlineWidth,
        },
        invalid: input.getAttribute("aria-invalid"),
      };
    });
    expect(artifactStyles.invalid).toBe("true");
    expect(artifactStyles.alert.text.length).toBeGreaterThan(0);
    expect(artifactStyles.focus.outlineStyle).not.toBe("none");
    expect(Number.parseFloat(artifactStyles.focus.outlineWidth)).toBeGreaterThanOrEqual(2);

    await page.getByRole("button", { exact: true, name: "Library" }).click();
    const dialog = page.getByRole("dialog", { name: "Library" });
    const dialogStyle = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderStyle: style.borderStyle,
        borderWidths: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ],
      };
    });
    expect(dialogStyle.borderStyle).not.toBe("none");
    expect(
      dialogStyle.borderWidths.some((width) => Number.parseFloat(width) >= 1),
      "the edge facing retained chart context remains visibly bounded",
    ).toBe(true);

    await galleryPage.goto(gallery.url, { waitUntil: "load" });
    await expect(galleryPage.locator('[data-u0-component-gallery="u0-component-gallery"]')).toBeVisible();
    const checkbox = await galleryObservation(
      galleryPage,
      "U0-GAL-023-FORCED-COLORS",
      'input.ui-checkbox, [role="checkbox"]',
    );
    const timeline = await galleryObservation(
      galleryPage,
      "U0-GAL-051-ACTIVE",
      '.ui-timeline-lane__item[data-selected="true"]',
    );
    const field = await galleryObservation(
      galleryPage,
      "U0-GAL-015-ERROR",
      '.ui-input[aria-invalid="true"]',
    );
    const galleryDialog = await galleryObservation(
      galleryPage,
      "U0-GAL-042-FORCED-COLORS",
      '[role="dialog"]',
    );
    expect(checkbox.checked).toBe(true);
    expect(checkbox.indeterminate).toBe(false);
    expect(timeline.dataSelected).toBe("true");
    expect(timeline.ariaPressed).toBe("true");
    expect(timeline.borderStyle).not.toBe("none");
    expect(field.ariaInvalid).toBe("true");
    expect(field.borderStyle).not.toBe("none");
    expect(galleryDialog.borderStyle).not.toBe("none");

    observations = {
      artifactStyles,
      checkbox,
      dialogStyle,
      field,
      galleryDialog,
      galleryDiagnostics,
      timeline,
    };
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.requests).toHaveLength(1);
    expect(galleryDiagnostics.consoleErrors).toEqual([]);
    expect(galleryDiagnostics.pageErrors).toEqual([]);
    screenshots.push(
      await captureU0Screenshot(page, testInfo, `U0-ENV-002-artifact-${browserName}`),
      await captureU0Screenshot(galleryPage, testInfo, `U0-ENV-002-gallery-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeU0EvidenceCell({
      artifact,
      bindings: [
        u0Binding("U0-ENV-002", "TR-U0-FORCED"),
        u0Binding("U0-PRIM-013", "TR-U0-FORCED"),
        u0Binding("U0-PRIM-019", "TR-U0-FORCED"),
      ],
      browserName,
      cellId: "U0-ENV-002-forced-colors",
      diagnostics,
      environment: { forcedColors: true },
      error,
      observations,
      outcome: error === null ? "pass" : "fail",
      page,
      screenshots,
      testInfo,
      viewport,
    });
    await galleryPage.close();
  }
});

test("U0-ENV-007 prefers-contrast-more strengthens separation without changing semantic order", async ({
  browserName,
  page,
}, testInfo) => {
  const viewport = { width: 1280, height: 800 } as const;
  const diagnostics = captureU0PageDiagnostics(page);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots: Awaited<ReturnType<typeof captureU0Screenshot>>[] = [];
  let emulationSupported = false;
  try {
    expect(testInfo.retry).toBe(0);
    await openU0Artifact(page, artifact, viewport);
    const before = await page.evaluate(() => ({
      borderColor: getComputedStyle(document.querySelector(".studio-chart-summary") as Element).borderColor,
      order: Array.from(
        document.querySelectorAll("#app-header, #library-rail, #chart-workspace, #harmony-lens-rail, #transport-bar"),
        (element) => element.id,
      ),
      textColor: getComputedStyle(document.querySelector(".studio-quick-entry__hint") as Element).color,
    }));
    if (browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-contrast", value: "more" }],
      });
      emulationSupported = true;
    }
    const active = await page.evaluate(() => matchMedia("(prefers-contrast: more)").matches);
    const after = await page.evaluate(() => ({
      borderColor: getComputedStyle(document.querySelector(".studio-chart-summary") as Element).borderColor,
      order: Array.from(
        document.querySelectorAll("#app-header, #library-rail, #chart-workspace, #harmony-lens-rail, #transport-bar"),
        (element) => element.id,
      ),
      textColor: getComputedStyle(document.querySelector(".studio-quick-entry__hint") as Element).color,
    }));
    if (emulationSupported) {
      expect(active).toBe(true);
      expect(after.borderColor).not.toBe(before.borderColor);
      expect(after.textColor).not.toBe(before.textColor);
    }
    expect(after.order).toEqual(before.order);
    observations = {
      active,
      after,
      before,
      emulationSupported,
      limitation: emulationSupported
        ? null
        : "Playwright 1.61.1 has no prefers-contrast emulation for this engine; semantic-order stability is observed, while dynamic style activation remains Chromium-only.",
    };
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.requests).toHaveLength(1);
    screenshots.push(
      await captureU0Screenshot(page, testInfo, `U0-ENV-007-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeU0EvidenceCell({
      artifact,
      bindings: [u0Binding("U0-ENV-007", "TR-U0-FORCED")],
      browserName,
      cellId: "U0-ENV-007-prefers-contrast",
      diagnostics,
      environment: { emulationSupported, prefersContrastMore: emulationSupported },
      error,
      observations,
      outcome: error === null ? "pass" : "fail",
      page,
      screenshots,
      testInfo,
      viewport,
    });
  }
});
