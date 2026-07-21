import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
let bundlePath: string;
let temporaryRoot: string;

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-u0-rail-focus-"));
  await execFileAsync(
    process.env["BUN_BINARY"] ?? "bun",
    [
      "build",
      "--target=browser",
      "--outdir",
      temporaryRoot,
      "tests/e2e/u0-rail-focus-harness.ts",
    ],
    { cwd: root },
  );
  bundlePath = join(temporaryRoot, "u0-rail-focus-harness.js");
});

test.afterAll(async () => {
  await rm(temporaryRoot, { force: true, recursive: true });
});

test("persistent rail toggles retain DOM identity and keyboard focus", async ({
  page,
}) => {
  await page.setContent('<div id="u0-rail-focus-root"></div>');
  await page.addScriptTag({ path: bundlePath, type: "module" });
  await expect(page.locator('[data-rail-focus-ready="true"]')).toHaveCount(1);

  const collapseLibrary = page.getByRole("button", {
    name: "Collapse Library",
  });
  await collapseLibrary.evaluate((element) => {
    element.setAttribute("data-stable-probe", "library");
  });
  await collapseLibrary.focus();
  await page.keyboard.press("Enter");

  const expandLibrary = page.getByRole("button", { name: "Expand Library" });
  await expect(expandLibrary).toHaveAttribute("data-stable-probe", "library");
  await expect(expandLibrary).toHaveAttribute("aria-expanded", "false");
  await expect(expandLibrary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(collapseLibrary).toHaveAttribute("aria-expanded", "true");
  await expect(collapseLibrary).toBeFocused();

  const collapseHarmony = page.getByRole("button", {
    name: "Collapse Harmony Lens",
  });
  await collapseHarmony.evaluate((element) => {
    element.setAttribute("data-stable-probe", "harmony");
  });
  await collapseHarmony.focus();
  await page.keyboard.press("Enter");

  const expandHarmony = page.getByRole("button", {
    name: "Expand Harmony Lens",
  });
  await expect(expandHarmony).toHaveAttribute("data-stable-probe", "harmony");
  await expect(expandHarmony).toHaveAttribute("aria-expanded", "false");
  await expect(expandHarmony).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(collapseHarmony).toHaveAttribute("aria-expanded", "true");
  await expect(collapseHarmony).toBeFocused();
});
