import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { Locator, Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const styles = [
  "src/styles/reset.css",
  "src/styles/tokens.css",
  "src/styles/primitives.css",
  "src/styles/ui-foundations.css",
  "src/styles/ui-forms.css",
  "src/styles/ui-structured.css",
] as const;
let bundlePath: string;
let temporaryRoot: string;

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-u0-target-size-"));
  await execFileAsync(
    process.env["BUN_BINARY"] ?? "bun",
    [
      "build",
      "--target=browser",
      "--outdir",
      temporaryRoot,
      "tests/e2e/u0-target-size-harness.ts",
    ],
    { cwd: root },
  );
  bundlePath = join(temporaryRoot, "u0-target-size-harness.js");
});

test.afterAll(async () => {
  await rm(temporaryRoot, { force: true, recursive: true });
});

async function mountHarness(page: Page): Promise<void> {
  await page.setContent(`
    <style>
      body { padding: 16px; }
      [data-target-probe] { margin-block: 8px; max-inline-size: 640px; }
    </style>
    <div id="u0-target-size-root"></div>
  `);
  for (const stylesheet of styles) {
    await page.addStyleTag({ path: join(root, stylesheet) });
  }
  await page.addScriptTag({ path: bundlePath, type: "module" });
  await expect(page.locator('[data-target-size-ready="true"]')).toHaveCount(1);
}

function target(page: Page, probe: string, selector: string): Locator {
  return page
    .locator(`[data-target-probe="${probe}"]`)
    .locator(selector)
    .first();
}

async function expectTargetFloor(
  locator: Locator,
  name: string,
  floor: number,
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, `${name} must render`).not.toBeNull();
  if (box === null) return;
  expect(box.width, `${name} inline target`).toBeGreaterThanOrEqual(floor);
  expect(box.height, `${name} block target`).toBeGreaterThanOrEqual(floor);
}

function defaultTargets(page: Page): ReadonlyArray<readonly [string, Locator]> {
  return [
    ["default Button", target(page, "default-button", ".ui-button")],
    ["IconButton", target(page, "icon-button", ".ui-icon-button")],
    [
      "Disclosure trigger",
      target(page, "disclosure", ".ui-disclosure__trigger"),
    ],
    ["LinkButton", target(page, "link-button", ".ui-link-button")],
    ["Input", target(page, "input", ".ui-input")],
    ["Textarea", target(page, "textarea", ".ui-form-control")],
    ["Listbox option", target(page, "listbox", ".ui-option")],
    ["Checkbox label", target(page, "checkbox", ".ui-check-control")],
    ["Radio option", target(page, "radio", ".ui-radio-option")],
    ["Switch", target(page, "switch", ".ui-switch")],
    ["Slider", target(page, "slider", ".ui-slider__input")],
    ["Toggle", target(page, "toggle", ".ui-toggle")],
    ["DataTable sort", target(page, "table", ".ui-data-table__sort")],
    ["Tree item", target(page, "tree", ".ui-tree__item")],
    ["Tree expansion", target(page, "tree", ".ui-tree__marker")],
    [
      "Resizable collapse",
      target(page, "panels", ".ui-resizable-panels__panel button"),
    ],
    [
      "Resizable numeric",
      target(page, "panels", ".ui-resizable-panels__numeric input"),
    ],
    [
      "Resizable separator",
      target(page, "panels", ".ui-resizable-panels__separator"),
    ],
    [
      "Timeline primary",
      target(page, "timeline", ".ui-timeline-lane__item > button"),
    ],
    [
      "Timeline arrow",
      target(page, "timeline", 'button[aria-label="Move later"]'),
    ],
  ];
}

async function expectEightPixelSeparatorGrip(page: Page): Promise<void> {
  const gripWidth = await target(
    page,
    "panels",
    ".ui-resizable-panels__separator",
  ).evaluate((element) =>
    element.ownerDocument.defaultView
      ?.getComputedStyle(element, "::before")
      .getPropertyValue("width"),
  );
  expect(gripWidth).toBe("8px");
}

test("proves 24 px defaults, a 44 px primary action, and the 8 px resize grip", async ({
  page,
}) => {
  await mountHarness(page);

  await expectTargetFloor(
    target(page, "primary-button", ".ui-button"),
    "primary Button",
    44,
  );
  for (const [name, locator] of defaultTargets(page)) {
    await expectTargetFloor(locator, name, 24);
  }
  await expectEightPixelSeparatorGrip(page);

  const spacer = await target(page, "tree", ".ui-tree__spacer").boundingBox();
  expect(spacer).not.toBeNull();
  expect(spacer?.width).toBe(24);
  expect(spacer?.height).toBe(24);
});

test("proves every scoped coarse-pointer target is at least 44 px without inflating the Tree spacer", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { height: 900, width: 1280 },
  });
  try {
    const page = await context.newPage();
    await mountHarness(page);
    expect(
      await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
    ).toBe(true);

    await expectTargetFloor(
      target(page, "primary-button", ".ui-button"),
      "coarse primary Button",
      44,
    );
    for (const [name, locator] of defaultTargets(page)) {
      await expectTargetFloor(locator, `coarse ${name}`, 44);
    }
    await expectEightPixelSeparatorGrip(page);

    const spacer = await target(page, "tree", ".ui-tree__spacer").boundingBox();
    expect(spacer).not.toBeNull();
    expect(spacer?.width).toBe(24);
    expect(spacer?.height).toBe(24);

    const badge = await target(page, "non-target", ".ui-badge").boundingBox();
    expect(badge).not.toBeNull();
    expect(badge?.width).toBeLessThan(44);
    expect(badge?.height).toBeLessThan(44);
  } finally {
    await context.close();
  }
});
