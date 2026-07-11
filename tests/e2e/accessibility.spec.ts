import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

type BrowserMode = "file" | "http";

type AxeFinding = {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: Array<{
    target: unknown;
    failureSummary: string | null;
  }>;
};

type AccessibilityEvidence = {
  schemaVersion: 1;
  traceId: "F0-ACCESSIBILITY-BASELINE";
  scope: string;
  mode: BrowserMode;
  browser: { name: string; version: string };
  artifactSha256: string;
  viewport: { width: 320; height: 568 };
  outcome: "pass" | "fail";
  error?: string;
  structure: {
    h1: number;
    banner: number;
    main: number;
    namedComplementary: number;
    contentinfo: number;
  };
  skipLink: {
    receivedKeyboardFocus: boolean;
    transferredFocusToMain: boolean;
  };
  responsive: {
    clientWidth: number;
    scrollWidth: number;
    horizontalOverflow: boolean;
  };
  media: {
    reducedMotion: boolean;
    forcedColors: boolean;
    focusVisible: boolean;
    focusOutlineStyle: string;
    focusOutlineWidth: string;
    focusedTransform: string;
    transitionDuration: string;
  };
  axe: {
    version: string;
    tags: string[];
    permittedExceptions: [];
    violations: AxeFinding[];
    incompleteRuleIds: string[];
    passRuleIds: string[];
  };
};

const axeTags = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
] as const;

function createEvidence(
  mode: BrowserMode,
  browserName: string,
  browserVersion: string,
  artifactSha256: string,
): AccessibilityEvidence {
  return {
    schemaVersion: 1,
    traceId: "F0-ACCESSIBILITY-BASELINE",
    scope:
      "Automated F0 shell baseline only; this does not replace the Q0 manual and full-product accessibility proof.",
    mode,
    browser: { name: browserName, version: browserVersion },
    artifactSha256,
    viewport: { width: 320, height: 568 },
    outcome: "fail",
    structure: {
      h1: 0,
      banner: 0,
      main: 0,
      namedComplementary: 0,
      contentinfo: 0,
    },
    skipLink: {
      receivedKeyboardFocus: false,
      transferredFocusToMain: false,
    },
    responsive: {
      clientWidth: 0,
      scrollWidth: 0,
      horizontalOverflow: true,
    },
    media: {
      reducedMotion: false,
      forcedColors: false,
      focusVisible: false,
      focusOutlineStyle: "",
      focusOutlineWidth: "",
      focusedTransform: "",
      transitionDuration: "",
    },
    axe: {
      version: "unknown",
      tags: [...axeTags],
      permittedExceptions: [],
      violations: [],
      incompleteRuleIds: [],
      passRuleIds: [],
    },
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function withArtifactServer(
  artifact: Uint8Array,
  run: (target: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/changes.html") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": artifact.byteLength,
        "content-type": "text/html; charset=utf-8",
      });
      response.end(artifact);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("Accessibility server did not expose an IPv4 address.");
  }

  try {
    await run(`http://127.0.0.1:${String(address.port)}/changes.html`);
  } finally {
    await closeServer(server);
  }
}

async function runAccessibilityCell(
  page: Page,
  mode: BrowserMode,
  target: string,
  artifactSha256: string,
  browserName: string,
  browserVersion: string,
  testInfo: TestInfo,
): Promise<void> {
  const evidence = createEvidence(
    mode,
    browserName,
    browserVersion,
    artifactSha256,
  );

  try {
    const response = await page.goto(target, { waitUntil: "load" });
    if (mode === "http") expect(response?.status()).toBe(200);
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();

    evidence.structure = {
      h1: await page.getByRole("heading", { level: 1 }).count(),
      banner: await page.getByRole("banner").count(),
      main: await page.getByRole("main").count(),
      namedComplementary: await page
        .getByRole("complementary", { name: "Studio foundation" })
        .count(),
      contentinfo: await page.getByRole("contentinfo").count(),
    };
    expect(evidence.structure).toEqual({
      h1: 1,
      banner: 1,
      main: 1,
      namedComplementary: 1,
      contentinfo: 1,
    });

    const axeResults = await new AxeBuilder({ page })
      .withTags([...axeTags])
      .analyze();
    evidence.axe = {
      version: axeResults.testEngine.version,
      tags: [...axeTags],
      permittedExceptions: [],
      violations: axeResults.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? null,
        help: violation.help,
        helpUrl: violation.helpUrl,
        tags: [...violation.tags].sort(),
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          failureSummary: node.failureSummary ?? null,
        })),
      })),
      incompleteRuleIds: axeResults.incomplete
        .map((result) => result.id)
        .sort(),
      passRuleIds: axeResults.passes.map((result) => result.id).sort(),
    };
    const unreviewedHighImpact = evidence.axe.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );
    expect(unreviewedHighImpact).toEqual([]);

    const skipLink = page.getByRole("link", { name: "Skip to workspace" });
    const main = page.getByRole("main");
    await page.keyboard.press("Tab");
    evidence.skipLink.receivedKeyboardFocus = await skipLink.evaluate(
      (element) => element === document.activeElement,
    );
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press("Enter");
    evidence.skipLink.transferredFocusToMain = await main.evaluate(
      (element) => element === document.activeElement,
    );
    await expect(main).toBeFocused();

    await page.setViewportSize({ width: 320, height: 568 });
    evidence.responsive = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    }));
    expect(evidence.responsive.clientWidth).toBe(320);
    expect(evidence.responsive.horizontalOverflow).toBe(false);

    await page.emulateMedia({
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    await page.reload({ waitUntil: "load" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    evidence.media = await skipLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        forcedColors: matchMedia("(forced-colors: active)").matches,
        focusVisible: element.matches(":focus-visible"),
        focusOutlineStyle: style.outlineStyle,
        focusOutlineWidth: style.outlineWidth,
        focusedTransform: style.transform,
        transitionDuration: style.transitionDuration,
      };
    });
    expect(evidence.media.reducedMotion).toBe(true);
    expect(evidence.media.forcedColors).toBe(true);
    expect(evidence.media.focusVisible).toBe(true);
    expect(evidence.media.focusOutlineStyle).not.toBe("none");
    expect(Number.parseFloat(evidence.media.focusOutlineWidth)).toBeGreaterThanOrEqual(
      2,
    );

    evidence.outcome = "pass";
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await testInfo.attach(`accessibility-${browserName}-${mode}.json`, {
      body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
      contentType: "application/json",
    });
  }
}

test.describe("F0 automated accessibility baseline", () => {
  for (const mode of ["file", "http"] as const) {
    test(`${mode} shell has accessible structure and resilient focus`, async ({
      browserName,
      page,
    }, testInfo) => {
      const artifactPath = join(
        process.cwd(),
        "jazz_chord_progression_editor.html",
      );
      const artifact = new Uint8Array(await readFile(artifactPath));
      const artifactSha256 = createHash("sha256")
        .update(artifact)
        .digest("hex");
      const browserVersion = page.context().browser()?.version() ?? "unknown";

      if (mode === "file") {
        const copyPath = testInfo.outputPath(
          "Changes ü # accessibility",
          "jazz chord progression editor.html",
        );
        await mkdir(dirname(copyPath), { recursive: true });
        await copyFile(artifactPath, copyPath);
        await runAccessibilityCell(
          page,
          mode,
          pathToFileURL(copyPath).href,
          artifactSha256,
          browserName,
          browserVersion,
          testInfo,
        );
      } else {
        await withArtifactServer(artifact, async (target) => {
          await runAccessibilityCell(
            page,
            mode,
            target,
            artifactSha256,
            browserName,
            browserVersion,
            testInfo,
          );
        });
      }
    });
  }
});
