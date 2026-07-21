import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  captureU0PageDiagnostics,
  evidenceError,
  u0Binding,
  writeU0EvidenceCell,
  type U0ArtifactServer,
} from "../e2e/u0-browser-test-kit";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const routeId = "u0-component-gallery";
const routePath = "/__tests__/u0-component-gallery";
const marker = "data-u0-component-gallery";

type GalleryFixture = Readonly<{
  components: readonly Readonly<{ id: string; name: string }>[];
  galleryCells: readonly Readonly<{
    id: string;
    componentId: string;
    state: string;
    applicability: "applicable" | "not-applicable";
  }>[];
}>;

type GalleryServer = Readonly<{
  artifact: U0ArtifactServer;
  origin: string;
}>;

const statesTraceBindings = Object.freeze([
  u0Binding("U0-CANCEL-001", "TR-U0-STATES"),
  u0Binding("U0-ENV-001", "TR-U0-STATES"),
  u0Binding("U0-PRIM-002", "TR-U0-STATES"),
  u0Binding("U0-PRIM-007", "TR-U0-STATES"),
  u0Binding("U0-PRIM-008", "TR-U0-STATES"),
  u0Binding("U0-PRIM-009", "TR-U0-STATES"),
  u0Binding("U0-PRIM-010", "TR-U0-STATES"),
  u0Binding("U0-PRIM-011", "TR-U0-STATES"),
  u0Binding("U0-PRIM-012", "TR-U0-STATES"),
  u0Binding("U0-PRIM-017", "TR-U0-STATES"),
  u0Binding("U0-PRIM-020", "TR-U0-STATES"),
  u0Binding("U0-PRIM-021", "TR-U0-STATES"),
]);

function contentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

async function buildGalleryServer(): Promise<GalleryServer> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-u0-gallery-browser-"));
  await execFileAsync(
    process.env["BUN_BINARY"] ?? "bun",
    [
      "build",
      "--target=browser",
      "--outdir",
      temporaryRoot,
      "tests/visual/u0-component-gallery.html",
    ],
    { cwd: root },
  );
  const releaseRoot = join(temporaryRoot, "release");
  await execFileAsync(
    process.env["BUN_BINARY"] ?? "bun",
    [
      "scripts/build.ts",
      "--no-publish",
      "--out-dir",
      releaseRoot,
    ],
    { cwd: root },
  );

  const assets = new Map<string, Buffer>();
  for (const entry of await readdir(temporaryRoot, { withFileTypes: true })) {
    if (entry.isFile()) {
      assets.set(entry.name, await readFile(join(temporaryRoot, entry.name)));
    }
  }
  const html = assets.get("u0-component-gallery.html");
  if (html === undefined) {
    throw new Error("U0_GALLERY_BROWSER_BUILD_MISSING_HTML");
  }
  const artifactBytes = await readFile(join(releaseRoot, "index.html"));
  assets.set("changes.html", artifactBytes);

  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const name = pathname === routePath
      ? "u0-component-gallery.html"
      : pathname === "/changes.html"
        ? "changes.html"
        : pathname.startsWith("/__tests__/")
          ? basename(pathname)
          : "";
    const asset = assets.get(name);
    if (asset === undefined) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-length": asset.byteLength,
      "content-type": contentType(name),
    });
    response.end(asset);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("U0_GALLERY_BROWSER_SERVER_ADDRESS");
  }
  const origin = `http://127.0.0.1:${String(address.port)}`;
  return {
    artifact: Object.freeze({
      artifactBytes: artifactBytes.byteLength,
      artifactSha256: createHash("sha256").update(artifactBytes).digest("hex"),
      close: async () => {
        await closeServer(server);
        await rm(temporaryRoot, { recursive: true, force: true });
      },
      origin,
      temporaryRoot,
      url: `${origin}/changes.html`,
    }),
    origin,
  };
}

const fixture = JSON.parse(
  await readFile(
    resolve(root, "tests/fixtures/ui/primitive-state-matrix.json"),
    "utf8",
  ),
) as GalleryFixture;

let galleryServer: GalleryServer;

test.beforeAll(async () => {
  galleryServer = await buildGalleryServer();
});

test.afterAll(async () => {
  await galleryServer.artifact.close();
});

test("serves the exact test route and renders the reviewed matrix in isolation", async ({
  browserName,
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const viewport = { width: 1280, height: 800 } as const;
  const diagnostics = captureU0PageDiagnostics(page);
  const networkErrors: string[] = [];
  page.on("requestfailed", (request) => {
    networkErrors.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown failure"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkErrors.push(`${String(response.status())} ${response.url()}`);
    }
  });
  let error: string | null = null;
  let observations: Readonly<Record<string, unknown>> = {};
  try {
    expect(testInfo.retry).toBe(0);
    await page.setViewportSize(viewport);
    const response = await page.goto(`${galleryServer.origin}${routePath}`, {
      waitUntil: "load",
    });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(routePath);

    const gallery = page.locator(`main[${marker}]`);
    await expect(gallery).toHaveCount(1);
    await expect(gallery).toHaveAttribute(marker, routeId);
    await expect(gallery).toHaveAttribute("data-route-id", routeId);
    await expect(page.locator("#u0-component-gallery-root")).toHaveAttribute(
      "data-u0-gallery-route",
      routeId,
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "U0 Component Gallery",
    );

    const applicable = fixture.galleryCells.filter(
      (cell) => cell.applicability === "applicable",
    );
    const notApplicable = fixture.galleryCells.filter(
      (cell) => cell.applicability === "not-applicable",
    );
    const selector = page.locator('[data-u0-test-control="cell-selector"]');
    await expect(selector.locator("option")).toHaveCount(applicable.length);
    const applicableCellIds = await selector.locator("option").evaluateAll(
      (options) => options.map((option) => (option as HTMLOptionElement).value),
    );
    expect(applicableCellIds).toEqual(applicable.map((cell) => cell.id));
    const notApplicableItems = page.locator("[data-u0-gallery-not-applicable-id]");
    await expect(notApplicableItems).toHaveCount(notApplicable.length);
    const notApplicableCellIds = await notApplicableItems.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-u0-gallery-not-applicable-id")),
    );
    expect(notApplicableCellIds).toEqual(notApplicable.map((cell) => cell.id));

    const componentNames = new Map(
      fixture.components.map((component) => [component.id, component.name]),
    );
    const renderedCells = browserName === "chromium"
      ? applicable
      : applicable.filter((cell) => cell.state === "default");
    expect(renderedCells).toHaveLength(
      browserName === "chromium" ? applicable.length : fixture.components.length,
    );
    const expectedObservations = renderedCells.map((cell) => ({
      articleCount: 1,
      componentId: cell.componentId,
      fixtureId: cell.id,
      headingIncludesComponent: true,
      selectedValue: cell.id,
      state: cell.state,
    }));
    const renderedCellObservations = await selector.evaluate(async (element, cells) => {
      const select = element as HTMLSelectElement;
      const observed: Array<{
        articleCount: number;
        componentId: string | null;
        fixtureId: string | null;
        headingIncludesComponent: boolean;
        selectedValue: string;
        state: string | null;
      }> = [];
      for (const cell of cells) {
        select.value = cell.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise<void>((resolveTurn) => {
          window.setTimeout(resolveTurn, 0);
        });
        const articles = document.querySelectorAll<HTMLElement>(
          "article[data-fixture-id]",
        );
        const active = articles[0];
        const heading = active?.querySelector("#u0-gallery-specimen-heading");
        observed.push({
          articleCount: articles.length,
          componentId: active?.getAttribute("data-component-id") ?? null,
          fixtureId: active?.getAttribute("data-fixture-id") ?? null,
          headingIncludesComponent:
            heading !== null && heading !== undefined &&
            heading.textContent.includes(cell.componentName),
          selectedValue: select.value,
          state: active?.getAttribute("data-state") ?? null,
        });
      }
      return observed;
    }, renderedCells.map((cell) => ({
      componentName: componentNames.get(cell.componentId) ?? cell.componentId,
      id: cell.id,
    })));
    expect(renderedCellObservations).toEqual(expectedObservations);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(networkErrors).toEqual([]);
    expect(diagnostics.requests.length).toBeGreaterThan(0);
    expect(
      diagnostics.requests.every((request) =>
        ["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname)
      ),
    ).toBe(true);

    observations = {
      applicableCellIds,
      browserTraversal: browserName === "chromium"
        ? "all-applicable-cells"
        : "one-default-cell-per-component",
      claimBoundary:
        "Every engine observes the exact applicable and reviewed-not-applicable DOM inventory. Chromium activates every applicable specimen; Firefox and WebKit activate one default specimen per component. These observations establish the reviewed TR-U0-STATES gallery representation; they do not substitute for separate browser-environment or production-preflight proofs.",
      componentCount: fixture.components.length,
      galleryCellCount: fixture.galleryCells.length,
      notApplicableCellIds,
      renderedCellObservations,
    };
  } catch (caught) {
    error = evidenceError(caught);
    throw caught;
  } finally {
    await writeU0EvidenceCell({
      artifact: galleryServer.artifact,
      bindings: statesTraceBindings,
      browserName,
      cellId: "TR-U0-STATES-component-gallery",
      diagnostics,
      environment: {
        forcedColors: false,
        reducedMotion: false,
        traversal: browserName === "chromium"
          ? "all-applicable-cells"
          : "one-default-cell-per-component",
      },
      error,
      observations,
      outcome: error === null ? "pass" : "fail",
      page,
      testInfo,
      viewport,
    });
  }
});

test("proves Field relationships, Tree pointer semantics, and the default resize hit box", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => {
    browserErrors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  await page.goto(`${galleryServer.origin}${routePath}`, { waitUntil: "load" });
  const selector = page.locator('[data-u0-test-control="cell-selector"]');

  await selector.selectOption("U0-GAL-015-ERROR");
  const fieldControl = page.getByRole("textbox", { name: "Field error example" });
  const fieldLabel = page.locator('label:has-text("Field error example")');
  const fieldDescription = page.getByText("A deterministic field description.");
  const fieldError = page.getByText("Retain the raw value and correct the error.");
  const [labelId, descriptionId, errorId] = await Promise.all([
    fieldLabel.getAttribute("id"),
    fieldDescription.getAttribute("id"),
    fieldError.getAttribute("id"),
  ]);
  expect(labelId).not.toBeNull();
  expect(descriptionId).not.toBeNull();
  expect(errorId).not.toBeNull();
  await expect(fieldLabel).toHaveAttribute("for", await fieldControl.getAttribute("id") ?? "");
  await expect(fieldControl).toHaveAttribute("aria-labelledby", labelId ?? "");
  await expect(fieldControl).toHaveAttribute(
    "aria-describedby",
    `${descriptionId ?? ""} ${errorId ?? ""}`,
  );
  await expect(fieldControl).toHaveAttribute("aria-errormessage", errorId ?? "");
  await expect(fieldControl).toHaveAttribute("aria-invalid", "true");
  await expect(fieldControl).toHaveAttribute("aria-required", "true");

  const eventOutput = page.locator("[data-u0-gallery-last-event-value]");
  await selector.selectOption("U0-GAL-049-DEFAULT");
  const collapsedTree = page.getByRole("tree", { name: "Tree default example" });
  await expect(collapsedTree).toHaveAttribute("aria-multiselectable", "true");
  const collapsedRoot = collapsedTree.getByRole("treeitem", {
    exact: true,
    name: "Section A",
  });
  await expect(collapsedRoot).toHaveAttribute("aria-expanded", "false");
  await collapsedRoot.locator("[data-tree-expansion-control]").click();
  await expect(eventOutput).toHaveAttribute("data-u0-gallery-last-event-value", "expand");
  await collapsedRoot.getByText("Section A", { exact: true }).click();
  await expect(eventOutput).toHaveAttribute("data-u0-gallery-last-event-value", "activate");

  await selector.selectOption("U0-GAL-049-ACTIVE");
  const expandedTree = page.getByRole("tree", { name: "Tree active example" });
  await expect(expandedTree).toHaveAttribute("aria-multiselectable", "true");
  await expect(expandedTree.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(2);
  const expandedRoot = expandedTree.getByRole("treeitem", {
    exact: true,
    name: "Section A",
  });
  await expect(expandedRoot).toHaveAttribute("aria-expanded", "true");
  await expandedRoot.locator("[data-tree-expansion-control]").click();
  await expect(eventOutput).toHaveAttribute("data-u0-gallery-last-event-value", "collapse");

  await selector.selectOption("U0-GAL-050-DEFAULT");
  const separator = page.getByRole("separator", { name: "Resize adjacent panels" });
  const separatorBox = await separator.boundingBox();
  expect(separatorBox).not.toBeNull();
  expect(separatorBox?.width ?? 0).toBeGreaterThanOrEqual(24);
  expect(separatorBox?.height ?? 0).toBeGreaterThanOrEqual(24);
  await expect(separator).toHaveAttribute("aria-orientation", "horizontal");
  await expect(separator).toHaveAttribute("tabindex", "0");
  expect(browserErrors).toEqual([]);
});

test("keeps the production shell hosts in flattened release DOM order", async ({ page }) => {
  await page.goto(`${galleryServer.origin}/changes.html`, { waitUntil: "load" });
  await expect(page.locator('[data-app-ready="true"]')).toHaveCount(1);
  expect(
    await page.locator("#transport-bar, #dialog-host, #notice-region, #help").evaluateAll(
      (elements) => elements.map((element) => element.id),
    ),
  ).toEqual(["transport-bar", "dialog-host", "notice-region", "help"]);
});
