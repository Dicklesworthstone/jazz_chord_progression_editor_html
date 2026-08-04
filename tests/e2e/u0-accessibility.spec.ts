import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  captureU0PageDiagnostics,
  createU0ArtifactServer,
  createU0GalleryServer,
  evidenceError,
  openU0Artifact,
  u0Binding,
  writeU0EvidenceCell,
  type U0ArtifactServer,
  type U0GalleryServer,
} from "./u0-browser-test-kit";

const viewport = { height: 800, width: 1280 } as const;
const effectiveZoomViewport = { height: 400, width: 640 } as const;
const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] as const;
const galleryCells = [
  "U0-GAL-001-DEFAULT",
  "U0-GAL-017-DEFAULT",
  "U0-GAL-030-FOCUS",
  "U0-GAL-042-FOCUS",
  "U0-GAL-048-DEFAULT",
  "U0-GAL-049-FOCUS",
] as const;
const bindings = [
  u0Binding("U0-ENV-001", "TR-U0-AXE"),
  u0Binding("U0-ENV-002", "TR-U0-AXE"),
  u0Binding("U0-ENV-003", "TR-U0-AXE"),
  u0Binding("U0-PRIM-003", "TR-U0-AXE"),
  u0Binding("U0-PRIM-004", "TR-U0-AXE"),
  u0Binding("U0-PRIM-005", "TR-U0-AXE"),
  u0Binding("U0-PRIM-006", "TR-U0-AXE"),
] as const;

let artifact: U0ArtifactServer;
let gallery: U0GalleryServer;

type AxeObservation = Readonly<{
  incompleteRuleIds: readonly string[];
  passRuleIds: readonly string[];
  seriousCritical: readonly string[];
  version: string;
  violations: readonly Readonly<{
    id: string;
    impact: string | null;
    nodeCount: number;
    targets: readonly unknown[];
  }>[];
}>;

async function analyze(page: Page, include?: string): Promise<AxeObservation> {
  let builder = new AxeBuilder({ page }).withTags([...axeTags]);
  if (include !== undefined) builder = builder.include(include);
  const results = await builder.analyze();
  const seriousCritical = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => violation.id);
  return {
    incompleteRuleIds: results.incomplete.map((result) => result.id).sort(),
    passRuleIds: results.passes.map((result) => result.id).sort(),
    seriousCritical,
    version: results.testEngine.version,
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      nodeCount: violation.nodes.length,
      targets: violation.nodes.map((node) => node.target),
    })),
  };
}

test.beforeAll(async () => {
  artifact = await createU0ArtifactServer();
  gallery = await createU0GalleryServer();
});

test.afterAll(async () => {
  await gallery.close();
  await artifact.close();
});

test("U0-ENV-001 U0-ENV-002 U0-ENV-003 U0-PRIM-003 U0-PRIM-004 U0-PRIM-005 U0-PRIM-006 provide axe, ariaSnapshot, focus, reflow, motion, and forced-colors smoke evidence", async ({ browserName, page }, testInfo) => {
  test.setTimeout(300_000);
  const diagnostics = captureU0PageDiagnostics(page);
  const observations: Record<string, unknown> = {};
  let failure: string | null = null;

  try {
    expect(testInfo.retry).toBe(0);
    await openU0Artifact(page, artifact, viewport);
    const releaseAxe = await analyze(page);
    observations["axe"] = {
      reviewedExceptions: [],
      release: releaseAxe,
      tags: axeTags,
    };
    expect(
      releaseAxe.seriousCritical,
      JSON.stringify(releaseAxe.violations),
    ).toEqual([]);
    const releaseAriaSnapshot = await page.locator(".studio-shell").ariaSnapshot();
    expect(releaseAriaSnapshot).toContain('heading "JazzChords.org" [level=1]');
    expect(releaseAriaSnapshot).toContain('main');

    await page.locator("body").press("Tab");
    await expect(page.locator("#skip-link")).toBeFocused();
    await page.locator("#skip-link").press("Enter");
    await expect(page.locator("#workspace")).toBeFocused();

    await page.setViewportSize(effectiveZoomViewport);
    const reflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      transportVisible: (() => {
        const transport = document.getElementById("transport-bar");
        if (transport === null) return false;
        const style = getComputedStyle(transport);
        const bounds = transport.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
      })(),
    }));
    expect(reflow.scrollWidth).toBeLessThanOrEqual(reflow.clientWidth);
    expect(reflow.transportVisible).toBe(true);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const motion = await page.evaluate(() => {
      const elements = [...document.querySelectorAll<HTMLElement>("*")];
      const activeAnimations = elements.flatMap((element) => {
        const style = getComputedStyle(element);
        return style.animationDuration !== "0s" && style.animationName !== "none"
          ? [{ animationDuration: style.animationDuration, animationName: style.animationName, id: element.id }]
          : [];
      });
      return {
        activeAnimations,
        mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      };
    });
    expect(motion.mediaMatches).toBe(true);
    expect(motion.activeAnimations).toEqual([]);
    expect(motion.scrollBehavior).not.toBe("smooth");

    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.locator("#skip-link").focus();
    const forcedColors = await page.locator("#skip-link").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        mediaMatches: matchMedia("(forced-colors: active)").matches,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(forcedColors.mediaMatches).toBe(true);
    expect(forcedColors.outlineStyle).not.toBe("none");
    expect(forcedColors.outlineWidth).not.toBe("0px");

    const galleryResponse = await page.goto(`${gallery.url}?route=u0-component-gallery&cell=${galleryCells[0]}`, { waitUntil: "load" });
    expect(galleryResponse?.status()).toBe(200);
    await page.locator('[data-u0-component-gallery="u0-component-gallery"]').waitFor({ state: "visible" });
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
    await page.setViewportSize(viewport);
    const selector = page.locator('[data-u0-test-control="cell-selector"]');
    const galleryObservations: Array<Record<string, unknown>> = [];
    for (const cellId of galleryCells) {
      await selector.selectOption(cellId);
      const specimen = page.locator(`[data-fixture-id="${cellId}"]`);
      await expect(specimen).toBeVisible();
      const axe = await analyze(page, `[data-fixture-id="${cellId}"]`);
      expect(axe.seriousCritical, `${cellId}: ${JSON.stringify(axe.violations)}`).toEqual([]);
      const ariaSnapshot = await specimen.ariaSnapshot();
      expect(ariaSnapshot.length).toBeGreaterThan(20);
      const focusableCount = await specimen.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]').count();
      expect(focusableCount).toBeGreaterThanOrEqual(cellId === "U0-GAL-048-DEFAULT" ? 0 : 1);
      galleryObservations.push({ ariaSnapshot, axe, cellId, focusableCount });
    }

    observations["axe"] = {
      reviewedExceptions: [],
      release: releaseAxe,
      tags: axeTags,
    };
    observations["screenReaderSmoke"] = {
      claim: "Playwright accessibility-tree ariaSnapshot smoke only.",
      gallery: galleryObservations,
      productionShellAriaSnapshot: releaseAriaSnapshot,
    };
    observations["environment"] = { forcedColors, motion, reflow };
    observations["manualScriptLedger"] = {
      claimBoundary: {
        automated: "Three-engine accessibility-tree, axe, keyboard focus, effective-CSS-pixel reflow, reduced-motion, and forced-colors browser checks.",
        hardwareCertification: "Not claimed.",
        pending: "Q0/manual-device evidence, including NVDA on Windows and VoiceOver on macOS/iOS, remains pending unless separately attached by a human operator.",
        zoomBoundary: "640 by 400 CSS-pixel effective viewport is an automated reflow proxy for the 1280 by 800 at 200 percent project case; manual browser-zoom confirmation remains pending.",
      },
      scripts: [
        { automatedStatus: "pass", id: "U0-MANUAL-KEYBOARD", manualDeviceStatus: "pending-Q0", steps: ["Tab to skip link", "activate skip link", "exercise gallery controls"] },
        { automatedStatus: "pass", id: "U0-MANUAL-FOCUS", manualDeviceStatus: "pending-Q0", steps: ["observe visible focus", "verify one accessibility-tree focus target"] },
        { automatedStatus: "proxy-pass", id: "U0-MANUAL-REFLOW-200", manualDeviceStatus: "pending-Q0", steps: ["set effective CSS viewport", "verify no horizontal page overflow", "verify transport visible"] },
        { automatedStatus: "pass", id: "U0-MANUAL-MOTION", manualDeviceStatus: "pending-Q0", steps: ["emulate reduced motion", "inspect active animations and scroll behavior"] },
        { automatedStatus: "pass", id: "U0-MANUAL-FORCED-COLORS", manualDeviceStatus: "pending-Q0", steps: ["emulate forced colors", "focus skip link", "inspect system-visible outline"] },
        { automatedStatus: "ariaSnapshot-pass", id: "U0-MANUAL-SCREEN-READER", manualDeviceStatus: "pending-Q0", steps: ["capture production shell tree", "capture representative gallery trees", "defer actual NVDA and VoiceOver speech confirmation"] },
      ],
    };
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
  } catch (error) {
    failure = evidenceError(error);
    throw error;
  } finally {
    await writeU0EvidenceCell({
      artifact,
      bindings,
      browserName,
      cellId: "u0-accessibility-axe-aria-manual-ledger",
      diagnostics,
      environment: {
        forcedColors: true,
        galleryCells: galleryCells.length,
        reducedMotion: true,
        screenReaderHardwareCertification: "pending-Q0",
        zoomEvidence: "effective-css-pixel-proxy-manual-pending",
      },
      error: failure,
      observations,
      outcome: failure === null ? "pass" : "fail",
      page,
      testInfo,
      viewport,
    });
  }
});
