import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const stylePaths = [
  "tokens.css",
  "reset.css",
  "primitives.css",
  "ui-foundations.css",
  "ui-forms.css",
  "ui-navigation.css",
  "ui-overlays.css",
  "ui-structured.css",
  "app.css",
  "studio.css",
  "responsive.css",
].map((filename) => join(root, "src", "styles", filename));

type PageDiagnostics = Readonly<{
  consoleErrors: string[];
  pageErrors: string[];
}>;

type ResponsiveProof = Readonly<{
  afterWidth: number;
  beforeWidth: number;
  railId: string;
  sheetName: "Harmony Lens" | "Library";
  triggerId: string;
}>;

let bundlePath: string;
let temporaryRoot: string;

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-u0-stale-owner-"));
  await execFileAsync(
    process.env["BUN_BINARY"] ?? "bun",
    [
      "build",
      "--target=browser",
      "--outdir",
      temporaryRoot,
      "tests/e2e/u0-responsive-stale-owner-harness.ts",
    ],
    { cwd: root },
  );
  bundlePath = join(temporaryRoot, "u0-responsive-stale-owner-harness.js");
});

test.afterAll(async () => {
  await rm(temporaryRoot, { force: true, recursive: true });
});

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

async function openHarness(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ height: 800, width });
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Responsive stale-owner proof</title>
      </head>
      <body><div id="u0-responsive-stale-owner-root"></div></body>
    </html>`);
  for (const path of stylePaths) {
    await page.addStyleTag({ path });
  }
  await page.addScriptTag({ path: bundlePath, type: "module" });
  await expect(page.locator('[data-harness-ready="true"]')).toHaveCount(1);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

async function settleResponsiveObservers(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

async function proveStaleOwnerDismissal(
  page: Page,
  proof: ResponsiveProof,
): Promise<void> {
  const harness = page.locator("#u0-responsive-stale-owner-harness");
  const background = page.locator("#studio-shell-background");
  const trigger = page.locator(`#${proof.triggerId}`);
  const rail = page.locator(`#${proof.railId}`);
  const workspace = page.locator("#workspace");
  const sheet = page.getByRole("dialog", { name: proof.sheetName });

  await expect(trigger).toBeVisible();
  await expect(rail).toBeHidden();
  await trigger.click();

  await expect(sheet).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(harness).toHaveAttribute("data-dismissal-count", "0");
  await expect(harness).toHaveAttribute("data-refusal-count", "0");
  await expect(background).toHaveAttribute("inert", "");
  await expect(background).toHaveAttribute("aria-hidden", "true");

  await page.setViewportSize({ height: 800, width: proof.afterWidth });

  await expect(harness).toHaveAttribute("data-dismissal-count", "1");
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".ui-sheet-layer")).toHaveCount(0);
  await expect(background).not.toHaveAttribute("inert");
  await expect(background).not.toHaveAttribute("aria-hidden");
  await expect(background).not.toHaveAttribute("data-ui-inert-owner");
  await expect(rail).toBeVisible();
  await expect(trigger).toBeHidden();
  await expect(workspace).toBeVisible();
  await expect(workspace).toBeFocused();
  await expect(trigger).not.toBeFocused();
  await expect(harness).toHaveAttribute("data-refusal-count", "1");

  await settleResponsiveObservers(page);
  await expect(harness).toHaveAttribute("data-dismissal-count", "1");
  await expect(harness).toHaveAttribute("data-refusal-count", "1");
}

test.describe("responsive overlay owner retirement", () => {
  /* jcpe-v2r-shell-i9up: the v2 redesign moved the rail thresholds to the
   * prototype's 820px (chord-detail rail) and 1280px (library rail). The
   * retirement law itself is unchanged. */
  test("retires the compact Harmony sheet once when the 820px rail appears", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    const proof: ResponsiveProof = {
      afterWidth: 821,
      beforeWidth: 819,
      railId: "harmony-lens-rail",
      sheetName: "Harmony Lens",
      triggerId: "studio-open-harmony-sheet",
    };
    await openHarness(page, proof.beforeWidth);
    await proveStaleOwnerDismissal(page, proof);
    expect(diagnostics).toEqual({ consoleErrors: [], pageErrors: [] });
  });

  test("retires the Library sheet once when the 1280px rail appears", async ({
    page,
  }) => {
    const diagnostics = captureDiagnostics(page);
    const proof: ResponsiveProof = {
      afterWidth: 1_281,
      beforeWidth: 1_279,
      railId: "library-rail",
      sheetName: "Library",
      triggerId: "studio-open-library-sheet",
    };
    await openHarness(page, proof.beforeWidth);
    await proveStaleOwnerDismissal(page, proof);
    expect(diagnostics).toEqual({ consoleErrors: [], pageErrors: [] });
  });
});
