import {
  expect,
  test,
  type Browser,
  type Page,
  type Request,
  type TestInfo,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createStandaloneCellEvidence,
  diagnosticId,
  writeStandaloneCellEvidence,
  type AssertionOutcome,
  type BrowserMode,
  type ConsoleEvidence,
  type EvidenceFinding,
  type RequestEvidence,
  type StandaloneDiagnostics,
} from "./evidence";

type FoundationContract = {
  artifact: {
    canonicalOutput: string;
    compatMode: string;
  };
  browserModes: Array<{ id: BrowserMode }>;
  browserProjects: string[];
  expectedHeading: string;
  requiredReadyMarker: string;
};

type PackageMetadata = { version: string };

const contract = JSON.parse(
  await readFile(
    "tests/fixtures/foundation/foundation-contract.json",
    "utf8",
  ),
) as FoundationContract;
const playwrightMetadata = JSON.parse(
  await readFile("node_modules/@playwright/test/package.json", "utf8"),
) as PackageMetadata;

function normalizeUrl(url: string, target: string): string {
  if (url === target) return "<artifact>";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "127.0.0.1") {
      return `${parsed.protocol}//127.0.0.1:<port>${parsed.pathname}`;
    }
  } catch {
    // Preserve an unparseable URL verbatim in the evidence record.
  }
  return url;
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
    throw new Error("Offline test server did not expose an IPv4 address.");
  }

  try {
    await run(`http://127.0.0.1:${String(address.port)}/changes.html`);
  } finally {
    await closeServer(server);
  }
}

function failedAssertions(
  assertions: Record<string, AssertionOutcome>,
): string[] {
  return Object.entries(assertions)
    .filter(([, outcome]) => outcome === "fail")
    .map(([name]) => name)
    .sort();
}

function collectFindings(
  assertions: Record<string, AssertionOutcome>,
  diagnostics: StandaloneDiagnostics,
  failureMessage: string | undefined,
): EvidenceFinding[] {
  const findings: EvidenceFinding[] = [];
  if (failureMessage !== undefined) {
    findings.push({
      code: "CELL_ASSERTION_FAILED",
      message: failureMessage,
      diagnosticIds: failedAssertions(assertions),
    });
  }
  const blocked = diagnostics.requests.filter(
    (request) => request.disposition === "blocked",
  );
  if (blocked.length > 0) {
    findings.push({
      code: "FORBIDDEN_REQUEST",
      message: `${String(blocked.length)} request(s) were blocked by the offline harness.`,
      diagnosticIds: blocked.map((request) => request.id),
    });
  }
  const failed = diagnostics.requests.filter(
    (request) => request.failure !== undefined,
  );
  if (failed.length > 0) {
    findings.push({
      code: "REQUEST_FAILURE",
      message: `${String(failed.length)} request(s) reported transport failure.`,
      diagnosticIds: failed.map((request) => request.id),
    });
  }
  const unexpectedConsole = diagnostics.console.filter((message) =>
    ["assert", "error", "warning"].includes(message.type),
  );
  if (unexpectedConsole.length > 0) {
    findings.push({
      code: "UNEXPECTED_CONSOLE",
      message: `${String(unexpectedConsole.length)} console assertion/error/warning message(s).`,
      diagnosticIds: unexpectedConsole.map((message) => message.id),
    });
  }
  const simpleGroups: Array<[string, string, string[]]> = [
    ["PAGE_ERROR", "Page errors were recorded.", diagnostics.pageErrors],
    ["WEB_ERROR", "Browser-level errors were recorded.", diagnostics.webErrors],
    ["WORKER_CREATED", "A worker was created.", diagnostics.workers],
    ["WEBSOCKET_OPENED", "A WebSocket was opened.", diagnostics.webSockets],
    ["DIALOG_OPENED", "A dialog was opened.", diagnostics.dialogs],
    ["RESOURCE_LOADED", "A sidecar resource entry was recorded.", diagnostics.resourceEntries],
  ];
  for (const [code, message, values] of simpleGroups) {
    if (values.length > 0) {
      findings.push({ code, message, diagnosticIds: [...values] });
    }
  }
  if (diagnostics.pages.length !== 1) {
    findings.push({
      code: "UNEXPECTED_PAGE_COUNT",
      message: `Expected one page; recorded ${String(diagnostics.pages.length)}.`,
      diagnosticIds: [...diagnostics.pages],
    });
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code));
}

async function resourcesFor(page: Page): Promise<string[]> {
  return await page
    .evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .sort(),
    )
    .catch(() => [] as string[]);
}

async function runOfflineCell(
  browser: Browser,
  browserName: string,
  mode: BrowserMode,
  target: string,
  artifactHash: string,
  artifactBytes: number,
  testInfo: TestInfo,
): Promise<void> {
  const requests: RequestEvidence[] = [];
  const requestIndex = new Map<Request, RequestEvidence>();
  const consoleMessages: ConsoleEvidence[] = [];
  const pageErrors: string[] = [];
  const webErrors: string[] = [];
  const workers: string[] = [];
  const webSockets: string[] = [];
  const dialogs: string[] = [];
  let requestSequence = 0;
  let consoleSequence = 0;
  let allowedDocumentCount = 0;
  let failureMessage: string | undefined;
  const assertions: Record<string, AssertionOutcome> = {
    compatMode: "fail",
    expectedHeading: "fail",
    generatedTitle: "fail",
    httpStatus: mode === "file" ? "pass" : "fail",
    mainDocumentCount: "fail",
    noBlockedRequests: "fail",
    noDialogs: "fail",
    noPageErrors: "fail",
    noResources: "fail",
    noUnexpectedConsole: "fail",
    noWebSockets: "fail",
    noWorkers: "fail",
    ready: "fail",
    singlePage: "fail",
  };

  const context = await browser.newContext({
    bypassCSP: false,
    serviceWorkers: "block",
  });
  context.on("serviceworker", (worker) => workers.push(`service:${worker.url()}`));
  context.on("weberror", (error) => webErrors.push(error.error().message));
  context.on("page", (observedPage) => {
    observedPage.on("console", (message) => {
      const location = message.location();
      consoleMessages.push({
        id: diagnosticId("console", ++consoleSequence),
        sequence: consoleSequence,
        type: message.type(),
        text: message.text(),
        ...(location.url
          ? {
              location: `${normalizeUrl(location.url, target)}:${String(location.lineNumber)}`,
            }
          : {}),
      });
    });
    observedPage.on("pageerror", (error) => pageErrors.push(error.message));
    observedPage.on("crash", () => pageErrors.push("PAGE_CRASH"));
    observedPage.on("dialog", (dialog) => {
      dialogs.push(`${dialog.type()}:${dialog.message()}`);
      void dialog.dismiss();
    });
    observedPage.on("worker", (worker) => workers.push(worker.url()));
    observedPage.on("websocket", (socket) => webSockets.push(socket.url()));
  });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const isAllowed =
      allowedDocumentCount < 1 &&
      request.isNavigationRequest() &&
      request.method() === "GET" &&
      request.url() === target &&
      request.frame() === request.frame().page().mainFrame() &&
      context.pages().length === 1;
    const evidence: RequestEvidence = {
      id: diagnosticId("request", ++requestSequence),
      sequence: requestSequence,
      method: request.method(),
      normalizedUrl: normalizeUrl(request.url(), target),
      resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(),
      disposition: isAllowed ? "allowed-document" : "blocked",
    };
    requests.push(evidence);
    requestIndex.set(request, evidence);
    if (isAllowed) {
      allowedDocumentCount += 1;
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
  context.on("response", (response) => {
    const evidence = requestIndex.get(response.request());
    if (evidence !== undefined) evidence.status = response.status();
  });
  context.on("requestfailed", (request) => {
    const evidence = requestIndex.get(request);
    const failure = request.failure();
    if (evidence !== undefined && failure !== null) {
      evidence.failure = failure.errorText;
    }
  });
  const page = await context.newPage();

  try {
    const response = await page.goto(target, { waitUntil: "load" });
    if (mode === "http") {
      expect(response?.status()).toBe(200);
      assertions["httpStatus"] = "pass";
    }
    await expect(
      page.getByRole("heading", { level: 1, name: contract.expectedHeading }),
    ).toBeVisible();
    assertions["expectedHeading"] = "pass";
    await expect(page.locator(contract.requiredReadyMarker)).toBeVisible();
    assertions["ready"] = "pass";
    await expect(page).toHaveTitle("Changes — Jazz Progression Studio");
    assertions["generatedTitle"] = "pass";
    expect(await page.evaluate(() => document.compatMode)).toBe(
      contract.artifact.compatMode,
    );
    assertions["compatMode"] = "pass";

    const resources = await resourcesFor(page);
    expect(resources).toEqual([]);
    assertions["noResources"] = "pass";
    if (mode === "http") {
      expect(requests).toHaveLength(1);
      expect(allowedDocumentCount).toBe(1);
    } else {
      expect(requests.length).toBeLessThanOrEqual(1);
      expect(allowedDocumentCount).toBe(requests.length);
    }
    assertions["mainDocumentCount"] = "pass";
    expect(requests.filter((item) => item.disposition === "blocked")).toEqual([]);
    assertions["noBlockedRequests"] = "pass";
    expect(
      consoleMessages.filter((item) =>
        ["assert", "error", "warning"].includes(item.type),
      ),
    ).toEqual([]);
    assertions["noUnexpectedConsole"] = "pass";
    expect(pageErrors).toEqual([]);
    expect(webErrors).toEqual([]);
    assertions["noPageErrors"] = "pass";
    expect(workers).toEqual([]);
    assertions["noWorkers"] = "pass";
    expect(webSockets).toEqual([]);
    assertions["noWebSockets"] = "pass";
    expect(dialogs).toEqual([]);
    assertions["noDialogs"] = "pass";
    expect(context.pages()).toHaveLength(1);
    assertions["singlePage"] = "pass";
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const diagnostics: StandaloneDiagnostics = {
      requests,
      console: consoleMessages,
      pageErrors,
      webErrors,
      workers,
      webSockets,
      dialogs,
      pages: context.pages().map((item) => normalizeUrl(item.url(), target)),
      resourceEntries: await resourcesFor(page),
    };
    const findings = collectFindings(assertions, diagnostics, failureMessage);
    const outcome =
      findings.length === 0 && failedAssertions(assertions).length === 0
        ? "pass"
        : "fail";
    const evidence = createStandaloneCellEvidence({
      browser: browserName,
      browserVersion: browser.version(),
      mode,
      toolVersion: playwrightMetadata.version,
      artifactHash,
      artifactBytes,
      outcome,
      assertions,
      findings,
      diagnostics,
    });
    try {
      await writeStandaloneCellEvidence(evidence, {
        writerId: `w${String(testInfo.workerIndex)}-r${String(testInfo.retry)}`,
      });
      await testInfo.attach(`standalone-${browserName}-${mode}.json`, {
        body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
        contentType: "application/json",
      });
    } finally {
      await context.close();
    }
  }
}

test.describe("F0 standalone no-network matrix", () => {
  const modes = contract.browserModes.map((item) => item.id);
  for (const mode of modes) {
    test(`${mode} artifact reaches ready with no sidecar or network request`, async ({
      browser,
      browserName,
    }, testInfo) => {
      expect(contract.browserProjects).toContain(browserName);
      const artifactPath = join(
        process.cwd(),
        contract.artifact.canonicalOutput,
      );
      const artifact = new Uint8Array(await readFile(artifactPath));
      const artifactHash = createHash("sha256").update(artifact).digest("hex");

      if (mode === "file") {
        const copyPath = testInfo.outputPath(
          "Changes ü # offline",
          "jazz chord progression editor.html",
        );
        await mkdir(dirname(copyPath), { recursive: true });
        await copyFile(artifactPath, copyPath);
        await runOfflineCell(
          browser,
          browserName,
          mode,
          pathToFileURL(copyPath).href,
          artifactHash,
          artifact.byteLength,
          testInfo,
        );
      } else {
        await withArtifactServer(artifact, async (target) => {
          await runOfflineCell(
            browser,
            browserName,
            mode,
            target,
            artifactHash,
            artifact.byteLength,
            testInfo,
          );
        });
      }
    });
  }
});
