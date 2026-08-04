import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  captureU0PageDiagnostics,
  captureU0Screenshot,
  createU0ArtifactServer,
  evidenceError,
  openU0Artifact,
  u0Binding,
  writeU0EvidenceCell,
  type U0ArtifactServer,
  type U0TraceBinding,
  type U0Viewport,
} from "../e2e/u0-browser-test-kit";

type ShellCase = Readonly<{
  bindings: readonly U0TraceBinding[];
  id: `U0-VIEW-00${1 | 2 | 3 | 4 | 5}`;
  mode: "balanced" | "compact" | "wide";
  viewport: U0Viewport;
}>;

const cases: readonly ShellCase[] = [
  {
    bindings: [
      u0Binding("U0-VIEW-003", "TR-U0-SHELL"),
      u0Binding("U0-PRIM-012", "TR-U0-SHELL"),
    ],
    id: "U0-VIEW-003",
    mode: "balanced",
    /* jcpe-v2r-gates-xaib: the v2 chord-detail rail begins at 820px. */
    viewport: { width: 900, height: 1024 },
  },
  {
    bindings: [u0Binding("U0-VIEW-004", "TR-U0-SHELL")],
    id: "U0-VIEW-004",
    mode: "wide",
    viewport: { width: 1280, height: 800 },
  },
  {
    bindings: [u0Binding("U0-VIEW-005", "TR-U0-SHELL")],
    id: "U0-VIEW-005",
    mode: "wide",
    viewport: { width: 1440, height: 900 },
  },
] as const;

type ShellObservation = Readonly<{
  chart: DOMRectJson;
  clientWidth: number;
  harmonyRail: DOMRectJson | null;
  harmonyTriggerVisible: boolean;
  libraryRail: DOMRectJson | null;
  libraryTokenPx: number;
  libraryTriggerVisible: boolean;
  mode: "balanced" | "compact" | "wide";
  harmonyTokenPx: number;
  scrollHeight: number;
  scrollWidth: number;
  shell: DOMRectJson;
  transport: DOMRectJson;
  transportControlNames: string[];
  transportFactKeys: string[];
  viewportHeight: number;
}>;

type DOMRectJson = Readonly<{
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}>;

async function observeShell(page: Page): Promise<ShellObservation> {
  return page.evaluate(() => {
    const shell = document.querySelector(".studio-shell");
    const chart = document.querySelector(".studio-chart");
    const transport = document.querySelector(".studio-transport");
    if (!(shell instanceof HTMLElement) || !(chart instanceof HTMLElement) ||
        !(transport instanceof HTMLElement)) {
      throw new Error("U0_RESPONSIVE_SHELL_REQUIRED_REGION_MISSING");
    }
    const visible = (element: Element | null): element is HTMLElement =>
      element instanceof HTMLElement && getComputedStyle(element).display !== "none";
    const libraryRail = document.querySelector("#library-rail");
    const harmonyRail = document.querySelector("#harmony-lens-rail");
    const libraryTrigger = document.querySelector("#studio-open-library-sheet");
    const harmonyTrigger = document.querySelector("#studio-open-harmony-sheet");
    const rootStyle = getComputedStyle(document.documentElement);
    const px = (name: string) => {
      const token = rootStyle.getPropertyValue(name).trim();
      const value = Number.parseFloat(token);
      return token.endsWith("rem")
        ? value * Number.parseFloat(rootStyle.fontSize)
        : value;
    };
    const width = document.documentElement.clientWidth;
    return {
      chart: {
        bottom: chart.getBoundingClientRect().bottom,
        height: chart.getBoundingClientRect().height,
        left: chart.getBoundingClientRect().left,
        right: chart.getBoundingClientRect().right,
        top: chart.getBoundingClientRect().top,
        width: chart.getBoundingClientRect().width,
      },
      clientWidth: width,
      harmonyRail: visible(harmonyRail) ? {
        bottom: harmonyRail.getBoundingClientRect().bottom,
        height: harmonyRail.getBoundingClientRect().height,
        left: harmonyRail.getBoundingClientRect().left,
        right: harmonyRail.getBoundingClientRect().right,
        top: harmonyRail.getBoundingClientRect().top,
        width: harmonyRail.getBoundingClientRect().width,
      } : null,
      harmonyTokenPx: px("--rail-harmony-inline"),
      harmonyTriggerVisible: visible(harmonyTrigger),
      libraryRail: visible(libraryRail) ? {
        bottom: libraryRail.getBoundingClientRect().bottom,
        height: libraryRail.getBoundingClientRect().height,
        left: libraryRail.getBoundingClientRect().left,
        right: libraryRail.getBoundingClientRect().right,
        top: libraryRail.getBoundingClientRect().top,
        width: libraryRail.getBoundingClientRect().width,
      } : null,
      libraryTokenPx: px("--rail-library-inline"),
      libraryTriggerVisible: visible(libraryTrigger),
      /* jcpe-v2r-gates-xaib: v2 thresholds — 820px detail rail, 1280px library. */
      mode: width < 820 ? "compact" : width < 1280 ? "balanced" : "wide",
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      shell: {
        bottom: shell.getBoundingClientRect().bottom,
        height: shell.getBoundingClientRect().height,
        left: shell.getBoundingClientRect().left,
        right: shell.getBoundingClientRect().right,
        top: shell.getBoundingClientRect().top,
        width: shell.getBoundingClientRect().width,
      },
      transport: {
        bottom: transport.getBoundingClientRect().bottom,
        height: transport.getBoundingClientRect().height,
        left: transport.getBoundingClientRect().left,
        right: transport.getBoundingClientRect().right,
        top: transport.getBoundingClientRect().top,
        width: transport.getBoundingClientRect().width,
      },
      transportControlNames: Array.from(
        transport.querySelectorAll<HTMLButtonElement>("button"),
        (button) => button.getAttribute("aria-label") ?? button.textContent.trim(),
      ),
      transportFactKeys: Array.from(
        transport.querySelectorAll<HTMLElement>("dt"),
        (item) => item.textContent.trim(),
      ),
      viewportHeight: window.innerHeight,
    };
  });
}

async function proveShellCase(
  page: Page,
  testInfo: TestInfo,
  browserName: string,
  artifact: U0ArtifactServer,
  shellCase: ShellCase,
): Promise<void> {
  const diagnostics = captureU0PageDiagnostics(page);
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  const screenshots = [];
  try {
    expect(testInfo.retry).toBe(0);
    await openU0Artifact(page, artifact, shellCase.viewport);
    const observed = await observeShell(page);
    observations = observed;

    expect(observed.clientWidth).toBe(shellCase.viewport.width);
    expect(observed.mode).toBe(shellCase.mode);
    expect(observed.scrollWidth).toBeLessThanOrEqual(observed.clientWidth);
    expect(observed.shell.left).toBeGreaterThanOrEqual(0);
    expect(observed.shell.right).toBeLessThanOrEqual(observed.clientWidth + 1);
    expect(observed.transport.left).toBeGreaterThanOrEqual(0);
    expect(observed.transport.right).toBeLessThanOrEqual(observed.clientWidth + 1);
    expect(observed.transport.top).toBeGreaterThanOrEqual(0);
    expect(observed.transport.bottom).toBeLessThanOrEqual(observed.viewportHeight + 1);
    expect(observed.chart.width).toBeGreaterThan(0);
    expect(observed.chart.height).toBeGreaterThan(0);

    if (shellCase.mode === "compact") {
      expect(observed.libraryRail).toBeNull();
      expect(observed.harmonyRail).toBeNull();
      expect(observed.libraryTriggerVisible).toBe(true);
      expect(observed.harmonyTriggerVisible).toBe(true);
    } else if (shellCase.mode === "balanced") {
      expect(observed.libraryRail).toBeNull();
      expect(observed.harmonyRail).not.toBeNull();
      expect(observed.libraryTriggerVisible).toBe(true);
      expect(observed.harmonyTriggerVisible).toBe(false);
      expect(observed.chart.width).toBeGreaterThan(observed.harmonyRail?.width ?? Infinity);
    } else {
      expect(observed.libraryRail).not.toBeNull();
      expect(observed.harmonyRail).not.toBeNull();
      expect(observed.libraryTriggerVisible).toBe(false);
      expect(observed.harmonyTriggerVisible).toBe(false);
      expect(observed.chart.width).toBeGreaterThan(observed.libraryRail?.width ?? Infinity);
      expect(observed.chart.width).toBeGreaterThan(observed.harmonyRail?.width ?? Infinity);
      expect(Math.abs((observed.libraryRail?.width ?? 0) - observed.libraryTokenPx)).toBeLessThanOrEqual(1);
      expect(Math.abs((observed.harmonyRail?.width ?? 0) - observed.harmonyTokenPx)).toBeLessThanOrEqual(1);
    }

    // Exactly the wired controls (jcpe-v2r-gates-xaib): V2R-8 wired the
    // previous/next chord steppers, so they are real capability now; loop
    // remains unwired and must stay absent rather than advertised dead.
    expect(observed.transportControlNames).toEqual(expect.arrayContaining([
      "Previous chord",
      "Play",
      "Pause",
      "Stop",
      "Next chord",
    ]));
    expect(
      observed.transportControlNames.filter((name) => /loop/iu.test(name)),
    ).toEqual([]);
    // The V2R-8 footer replaced the dt fact list with labeled now-blocks.
    expect(observed.transportFactKeys).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.requests).toHaveLength(1);
    screenshots.push(
      await captureU0Screenshot(page, testInfo, `${shellCase.id}-${browserName}`),
    );
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeU0EvidenceCell({
      artifact,
      bindings: shellCase.bindings,
      browserName,
      cellId: `${shellCase.id}-responsive-shell`,
      diagnostics,
      environment: {
        expectedMode: shellCase.mode,
        forcedColors: false,
        reducedMotion: false,
      },
      error,
      observations,
      outcome: error === null ? "pass" : "fail",
      page,
      screenshots,
      testInfo,
      viewport: shellCase.viewport,
    });
  }
}

let artifact: U0ArtifactServer;

test.beforeAll(async () => {
  artifact = await createU0ArtifactServer();
});

test.afterAll(async () => {
  await artifact.close();
});

for (const shellCase of cases) {
  test(`${shellCase.id}${shellCase.id === "U0-VIEW-003" ? " U0-PRIM-012" : ""} real built shell matches its reviewed responsive mode`, async ({
    browserName,
    page,
  }, testInfo) => {
    await proveShellCase(page, testInfo, browserName, artifact, shellCase);
  });
}
