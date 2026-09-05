import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";

type RuntimeCase = {
  id: string;
  mode: string;
  fixture?: string;
  expectedDetected?: boolean;
  expectedDisposition?: string;
  expectedResponseStatus?: number;
  expectedEvent?: string;
};

type RuntimeCases = {
  runtimeCases: RuntimeCase[];
};

type NegativeEvidence = {
  schemaVersion: 1;
  traceId: "F0-NETWORK-02";
  caseId: string;
  fixture: string;
  outcome: "pass" | "fail";
  detected: string[];
  requests: Array<{
    url: string;
    disposition: "allowed-document" | "blocked";
  }>;
  console: Array<{ type: string; text: string }>;
  pageErrors: string[];
  pages: number;
  workers: string[];
  webSockets: string[];
  status?: number;
};

type ConstructorSignals = {
  workers: string[];
  webSockets: string[];
};

const cases = JSON.parse(
  await readFile(
    "tests/fixtures/foundation/static-cases.json",
    "utf8",
  ),
) as RuntimeCases;

const negativeCases = cases.runtimeCases.filter(
  (item) => item.mode === "http-no-csp-negative-control",
);

const fixtureBodies: Record<string, string> = {
  "external-image": '<img src="https://example.invalid/probe.png" alt="">',
  "relative-script": '<script src="./chunk.js"></script>',
  "http-404": "<p>Deliberate not-found response</p>",
  "throw-error": '<script>throw new Error("CONTROL_PAGE_ERROR")</script>',
  "console-error": '<script>console.error("CONTROL_CONSOLE_ERROR")</script>',
  popup: '<script>window.open("about:blank", "_blank")</script>',
  worker:
    '<script>new Worker(URL.createObjectURL(new Blob(["setInterval(() => {}, 1000)"], { type: "text/javascript" })))</script>',
  websocket: '<script>new WebSocket("ws://127.0.0.1:1/control")</script>',
};

function fixtureHtml(fixture: string): string {
  const body = fixtureBodies[fixture];
  if (body === undefined) {
    throw new Error(`Unknown negative-control fixture: ${fixture}`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Offline harness control</title></head><body>${body}</body></html>`;
}

async function listen(server: Server): Promise<number> {
  // This host's ephemeral range starts at 1024. Port 0 selected 6665 in a
  // real Firefox failure: the browser refused the port before the negative
  // fixture ran. Bind in the high range, with bounded address-in-use handling.
  const first = 49152 + process.pid % 8192;
  for (let attempt = 0; attempt < 32; attempt++) {
    const port = first + attempt;
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      const onError = (cause: NodeJS.ErrnoException): void => {
        server.off("listening", onListening); resolve(cause);
      };
      const onListening = (): void => { server.off("error", onError); resolve(null); };
      server.once("error", onError); server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    });
    if (error === null) return port;
    if (error.code !== "EADDRINUSE") throw error;
  }
  throw new Error("Negative-control server could not bind a browser-safe port after 32 attempts.");
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function waitForDetection(
  runtimeCase: RuntimeCase,
  page: Page,
  context: BrowserContext,
  evidence: NegativeEvidence,
): Promise<void> {
  switch (runtimeCase.expectedEvent) {
    case "pageerror":
      await expect.poll(() => evidence.pageErrors.length).toBeGreaterThan(0);
      evidence.detected.push("pageerror");
      break;
    case "console":
      await expect
        .poll(() => evidence.console.some((item) => item.type === "error"))
        .toBe(true);
      evidence.detected.push("console");
      break;
    case "page":
      await expect.poll(() => context.pages().length).toBeGreaterThan(1);
      evidence.detected.push("page");
      break;
    case "worker":
      await expect.poll(() => evidence.workers.length).toBeGreaterThan(0);
      evidence.detected.push("worker");
      break;
    case "websocket":
      await expect.poll(() => evidence.webSockets.length).toBeGreaterThan(0);
      evidence.detected.push("websocket");
      break;
    case undefined:
      if (runtimeCase.expectedResponseStatus !== undefined) {
        expect(evidence.status).toBe(runtimeCase.expectedResponseStatus);
        evidence.detected.push("response-status");
      } else {
        await expect
          .poll(() =>
            evidence.requests.some((item) => item.disposition === "blocked"),
          )
          .toBe(true);
        evidence.detected.push("blocked-request");
      }
      break;
    default:
      throw new Error(`Unsupported expected event: ${runtimeCase.expectedEvent}`);
  }

  await expect(page).toHaveTitle("Offline harness control");
}

async function installConstructorMonitor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const signals: ConstructorSignals = { workers: [], webSockets: [] };
    Object.defineProperty(globalThis, "__JCPE_CONSTRUCTOR_SIGNALS__", {
      configurable: false,
      enumerable: false,
      value: signals,
      writable: false,
    });

    const OriginalWorker = globalThis.Worker;
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: new Proxy(OriginalWorker, {
        construct(target, argumentsList, newTarget) {
          signals.workers.push(String(argumentsList[0]));
          const instance: object = Reflect.construct(
            target,
            argumentsList,
            newTarget,
          ) as object;
          return instance;
        },
      }),
      writable: true,
    });

    const OriginalWebSocket = globalThis.WebSocket;
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: new Proxy(OriginalWebSocket, {
        construct(target, argumentsList, newTarget) {
          signals.webSockets.push(String(argumentsList[0]));
          const instance: object = Reflect.construct(
            target,
            argumentsList,
            newTarget,
          ) as object;
          return instance;
        },
      }),
      writable: true,
    });
  });
}

async function readConstructorSignals(page: Page): Promise<ConstructorSignals> {
  return await page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __JCPE_CONSTRUCTOR_SIGNALS__?: ConstructorSignals;
    };
    return scope.__JCPE_CONSTRUCTOR_SIGNALS__ ?? {
      workers: [],
      webSockets: [],
    };
  });
}

test.describe("F0 no-network harness negative controls", () => {
  expect(negativeCases.map((item) => item.id).sort()).toEqual([
    "runtime-negative-bad-response",
    "runtime-negative-console-error",
    "runtime-negative-external-request",
    "runtime-negative-page-error",
    "runtime-negative-popup",
    "runtime-negative-sidecar",
    "runtime-negative-websocket",
    "runtime-negative-worker",
  ]);

  for (const runtimeCase of negativeCases) {
    test(`${runtimeCase.id} is detected without relying on CSP`, async ({
      browser,
    }, testInfo) => {
      const fixture = runtimeCase.fixture;
      if (fixture === undefined) {
        throw new Error(`${runtimeCase.id} does not name a fixture.`);
      }
      const html = fixtureHtml(fixture);
      const expectedStatus = runtimeCase.expectedResponseStatus ?? 200;
      const server = createServer((request, response) => {
        if (request.method === "GET" && request.url === "/negative.html") {
          response.writeHead(expectedStatus, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          });
          response.end(html);
          return;
        }
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("negative control");
      });
      const port = await listen(server);
      const target = `http://127.0.0.1:${String(port)}/negative.html`;
      const evidence: NegativeEvidence = {
        schemaVersion: 1,
        traceId: "F0-NETWORK-02",
        caseId: runtimeCase.id,
        fixture,
        outcome: "fail",
        detected: [],
        requests: [],
        console: [],
        pageErrors: [],
        pages: 0,
        workers: [],
        webSockets: [],
      };
      const context = await browser.newContext({
        userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0",
        bypassCSP: false,
        serviceWorkers: "block",
      });
      let page: Page | undefined;

      await context.route("**/*", async (route) => {
        const request = route.request();
        const allow =
          request.isNavigationRequest() &&
          request.method() === "GET" &&
          request.url() === target;
        evidence.requests.push({
          url: request.url() === target ? "<control>" : request.url(),
          disposition: allow ? "allowed-document" : "blocked",
        });
        if (allow) await route.continue();
        else await route.abort("blockedbyclient");
      });

      try {
        page = await context.newPage();
        await installConstructorMonitor(page);
        page.on("console", (message) => {
          evidence.console.push({ type: message.type(), text: message.text() });
        });
        page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
        page.on("worker", (worker) => evidence.workers.push(worker.url()));
        page.on("websocket", (socket) => evidence.webSockets.push(socket.url()));

        const response = await page.goto(target, { waitUntil: "load" });
        if (response !== null) evidence.status = response.status();
        const signals = await readConstructorSignals(page);
        if (evidence.workers.length === 0) {
          evidence.workers.push(
            ...signals.workers.map((url) =>
              url.startsWith("blob:") ? "constructor:<blob>" : `constructor:${url}`,
            ),
          );
        }
        if (evidence.webSockets.length === 0) {
          evidence.webSockets.push(
            ...signals.webSockets.map((url) => `constructor:${url}`),
          );
        }
        await waitForDetection(runtimeCase, page, context, evidence);

        if (runtimeCase.expectedDisposition === "blocked") {
          expect(
            evidence.requests.some((item) => item.disposition === "blocked"),
          ).toBe(true);
        }
        expect(runtimeCase.expectedDetected).toBe(true);
        evidence.outcome = "pass";
      } finally {
        evidence.pages = context.pages().length;
        await testInfo.attach(`${runtimeCase.id}.json`, {
          body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
          contentType: "application/json",
        });
        await context.close();
        await closeServer(server);
      }
    });
  }
});
