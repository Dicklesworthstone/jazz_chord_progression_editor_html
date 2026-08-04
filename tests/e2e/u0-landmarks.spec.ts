import { expect, test } from "@playwright/test";

import {
  captureU0PageDiagnostics,
  createU0ArtifactServer,
  createU0BrowserHarness,
  evidenceError,
  openU0Artifact,
  openU0BrowserHarness,
  u0Binding,
  writeU0EvidenceCell,
  type U0ArtifactServer,
  type U0CompiledBrowserHarness,
} from "./u0-browser-test-kit";

/* jcpe-v2r-shell-i9up: 880px — above the v2 chord-detail rail threshold
 * (820px) and below the library rail (1280px), keeping the old intent of
 * "harmony rail visible, library rail collapsed". */
const viewport = { height: 1024, width: 880 } as const;
const bindings = [
  u0Binding("U0-PRIM-003", "TR-U0-LANDMARKS"),
  u0Binding("U0-PRIM-004", "TR-U0-LANDMARKS"),
  u0Binding("U0-PRIM-018", "TR-U0-LANDMARKS"),
  u0Binding("U0-REF-010", "TR-U0-LANDMARKS"),
  u0Binding("U0-VIEW-003", "TR-U0-LANDMARKS"),
] as const;
const stylePaths = [
  "src/styles/reset.css",
  "src/styles/tokens.css",
  "src/styles/primitives.css",
  "src/styles/ui-foundations.css",
  "src/styles/ui-forms.css",
  "src/styles/ui-navigation.css",
  "src/styles/ui-structured.css",
  "src/styles/ui-overlays.css",
] as const;

let artifact: U0ArtifactServer;
let harness: U0CompiledBrowserHarness;

test.beforeAll(async () => {
  artifact = await createU0ArtifactServer();
  harness = await createU0BrowserHarness({
    entry: "tests/e2e/u0-interaction-harness.tsx",
    rootId: "u0-interaction-root",
    stylePaths,
    title: "U0 semantic primitive harness",
  });
});

test.afterAll(async () => {
  await harness.close();
  await artifact.close();
});

test("U0-PRIM-003 U0-PRIM-004 U0-PRIM-018 U0-REF-010 U0-VIEW-003 expose named landmarks, native semantics, and one valid skip target", async ({ browser, browserName, page }, testInfo) => {
  test.setTimeout(300_000);
  const diagnostics = captureU0PageDiagnostics(page);
  const observations: Record<string, unknown> = {};
  let harnessContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let failure: string | null = null;

  try {
    expect(testInfo.retry).toBe(0);
    await openU0Artifact(page, artifact, viewport);

    const landmarkContract = [
      { id: "app-header", role: "banner" },
      { id: "workspace", role: "main" },
      { id: "library-rail", name: "Library", role: "complementary" },
      { id: "chart-workspace", name: "Chart workspace", role: "region" },
      { id: "harmony-lens-rail", name: "Harmony Lens", role: "complementary" },
      { id: "transport-bar", name: "Transport", role: "region" },
    ] as const;
    const landmarks: Array<Record<string, unknown>> = [];
    for (const expected of landmarkContract) {
      const locator = page.locator(`#${expected.id}`);
      await expect(locator).toHaveCount(1);
      const roleLocator = page.getByRole(
        expected.role,
        "name" in expected
          ? { includeHidden: true, name: expected.name }
          : { includeHidden: true },
      );
      const matchingRoleCount = await roleLocator.count();
      expect(matchingRoleCount).toBeGreaterThanOrEqual(1);
      const exactElementOwnsRole = await roleLocator.evaluateAll(
        (elements, id) => elements.some((element) => element.id === id),
        expected.id,
      );
      expect(exactElementOwnsRole).toBe(true);
      const visible = await locator.isVisible();
      if (expected.id !== "library-rail") expect(visible).toBe(true);
      landmarks.push({ ...expected, exactElementOwnsRole, matchingRoleCount, visible });
    }

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const skipLink = page.locator("#skip-link");
    await expect(skipLink).toHaveAttribute("href", "#workspace");
    await page.locator("body").press("Tab");
    await expect(skipLink).toBeFocused();
    await skipLink.press("Enter");
    await expect(page.locator("#workspace")).toBeFocused();

    const domOrder = await page.evaluate((ids) => ids.map((id) => {
      const element = document.getElementById(id);
      return {
        id,
        order: element === null ? -1 : [...document.querySelectorAll("#app-header, #library-rail, #chart-workspace, #harmony-lens-rail, #transport-bar")].indexOf(element),
      };
    }), ["app-header", "library-rail", "chart-workspace", "harmony-lens-rail", "transport-bar"]);
    expect(domOrder.map((item) => item.order)).toEqual([0, 1, 2, 3, 4]);

    const chartBox = await page.locator("#chart-workspace").boundingBox();
    const transportBox = await page.locator("#transport-bar").boundingBox();
    expect(chartBox).not.toBeNull();
    expect(transportBox).not.toBeNull();
    observations["releaseShell"] = {
      chartBox,
      domOrder,
      h1Count: await page.getByRole("heading", { level: 1 }).count(),
      landmarks,
      skipTarget: await skipLink.getAttribute("href"),
      transportBox,
    };

    harnessContext = await browser.newContext({ viewport });
    const harnessPage = await harnessContext.newPage();
    const harnessDiagnostics = captureU0PageDiagnostics(harnessPage);
    await openU0BrowserHarness(harnessPage, harness, {
      readySelector: '[data-u0-harness-ready="accessibility"]',
      scenario: "accessibility",
      viewport,
    });
    const nativeSemantics = {
      button: await harnessPage.locator("button#semantic-button").evaluate((element) => element.tagName),
      input: await harnessPage.locator("input#semantic-input").evaluate((element) => element.tagName),
      meter: await harnessPage.locator("meter").evaluate((element) => element.tagName),
      progress: await harnessPage.locator("progress").evaluate((element) => element.tagName),
      select: await harnessPage.locator("select#semantic-select").evaluate((element) => element.tagName),
      table: await harnessPage.locator("table").evaluate((element) => element.tagName),
    };
    expect(Object.values(nativeSemantics)).toEqual(["BUTTON", "INPUT", "METER", "PROGRESS", "SELECT", "TABLE"]);
    await expect(harnessPage.getByRole("button", { name: "Apply chord" })).toHaveCount(1);
    await expect(harnessPage.getByRole("textbox", { name: "Chord symbol" })).toHaveCount(1);
    await expect(harnessPage.getByRole("combobox", { name: "Chord quality" })).toHaveCount(1);
    await harnessPage.locator("#invalid-icon-probe").click();
    const refusalLedger = JSON.parse(await harnessPage.locator("#u0-event-ledger").innerText()) as Array<Record<string, unknown>>;
    expect(refusalLedger.at(-1)?.["code"]).toBe("ui.accessible_name_required");
    expect(harnessDiagnostics.consoleErrors).toEqual([]);
    expect(harnessDiagnostics.pageErrors).toEqual([]);
    observations["primitiveSemantics"] = { diagnostics: harnessDiagnostics, nativeSemantics, refusalLedger };
    observations["compiledHarness"] = {
      bundleBytes: harness.bundleBytes,
      bundleSha256: harness.bundleSha256,
      entry: "tests/e2e/u0-interaction-harness.tsx",
    };

    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
  } catch (error) {
    failure = evidenceError(error);
    throw error;
  } finally {
    await harnessContext?.close();
    await writeU0EvidenceCell({
      artifact,
      bindings,
      browserName,
      cellId: "u0-landmarks-balanced-native-semantics",
      diagnostics,
      environment: { layoutMode: "balanced", scenario: "release-shell-plus-semantic-harness" },
      error: failure,
      observations,
      outcome: failure === null ? "pass" : "fail",
      page,
      testInfo,
      viewport,
    });
  }
});
