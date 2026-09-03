/**
 * E0 stage-5 real-browser download proof
 * (jcpe-milestone-reliable-studio-l3a.8.2): the PRODUCTION section-10
 * start primitive, bundled from src/export by the pinned Bun toolchain,
 * runs in a real browser behind a genuine user click. The proof asserts:
 * the browser download's bytes are byte-identical to the reviewed
 * canonical-JSON golden; the suggested filename is the binding's; the
 * handed-off receipt reports exactly one object URL created and revoked
 * with zero outstanding owned resources; a gesture-less programmatic call
 * observes the real `navigator.userActivation` probe and refuses with no
 * download; and the page stays free of console and page errors.
 */
import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();

const GOLDEN_PATH = join(
  root,
  "tests/fixtures/interchange/goldens/minimal.changes.json",
);
const EXPECTED_FILENAME = "minimal.changes.json";

let server: Server | null = null;
let baseUrl = "";
let temporaryRoot = "";
let goldenText = "";

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "jcpe-e0-delivery-"));
  const bundlePath = join(temporaryRoot, "harness.js");
  await execFileAsync(
    process.env["BUN_BINARY"] ?? "bun",
    [
      "build",
      "tests/e2e/e0-delivery-harness-entry.ts",
      "--format=iife",
      `--outfile=${bundlePath}`,
    ],
    { cwd: root },
  );
  const bundle = await readFile(bundlePath, "utf8");
  goldenText = await readFile(GOLDEN_PATH, "utf8");

  const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>E0 delivery harness</title></head>
<body>
<button id="deliver" type="button">Download</button>
<script>${bundle}</script>
<script>
  (function () {
    /* Bytes are prepared at load time; the click handler only starts the
     * delivery — nothing encodes inside the activation interval. */
    var goldenText = ${JSON.stringify(goldenText)};
    var bytes = new TextEncoder().encode(goldenText);
    var binding = Object.freeze({
      kind: "canonical-json",
      sourceDocumentId: "document-e0-minimal",
      filename: ${JSON.stringify(EXPECTED_FILENAME)},
      byteLength: bytes.byteLength,
      semanticDocumentHash: "${"e".repeat(64)}",
    });
    window.__e0Request = Object.freeze({
      binding: binding,
      privateBytes: bytes,
      preference: "download-only",
    });
    document.getElementById("deliver").addEventListener("click", function () {
      var envelope = window.__e0StartPreparedExportDelivery(window.__e0Request);
      envelope.completion.then(function (receipt) {
        window.__e0Receipt = receipt;
      });
    });
    /* Gesture-less probe witness: a load-time timer runs with NO user
     * activation (a Playwright evaluate would carry a synthetic gesture,
     * so the negative must originate in the page itself). */
    setTimeout(function () {
      window.__e0ProbePresent = typeof navigator !== "undefined" && !!navigator.userActivation;
      window.__e0ProbeActive = window.__e0ProbePresent ? navigator.userActivation.isActive : null;
      var envelope = window.__e0StartPreparedExportDelivery(window.__e0Request);
      envelope.completion.then(function (receipt) {
        window.__e0AutoReceipt = receipt;
      });
    }, 0);
  })();
</script>
</body>
</html>`;

  server = createServer((request, response) => {
    if (request.url === "/" || request.url === "/index.html") {
      response.writeHead(200, { "content-type": "text/html;charset=utf-8" });
      response.end(page);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolveListen) => {
    server?.listen(0, "127.0.0.1", () => {
      resolveListen();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("SERVER_ADDRESS_UNAVAILABLE");
  }
  baseUrl = `http://127.0.0.1:${String(address.port)}/`;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClose) => {
    if (server === null) {
      resolveClose();
      return;
    }
    server.close(() => {
      resolveClose();
    });
  });
  if (temporaryRoot !== "") {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

function captureDiagnostics(page: Page): {
  consoleErrors: string[];
  pageErrors: string[];
} {
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

test("a real click delivers the golden bytes with exact cleanup evidence", async ({ page }) => {
  const diagnostics = captureDiagnostics(page);
  await page.goto(baseUrl, { waitUntil: "load" });

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#deliver").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(EXPECTED_FILENAME);
  const savedPath = join(temporaryRoot, "delivered.changes.json");
  await download.saveAs(savedPath);
  const delivered = await readFile(savedPath, "utf8");
  expect(delivered).toBe(goldenText);

  const receipt = await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>)["__e0Receipt"],
  );
  const receiptValue = (await receipt.jsonValue()) as Readonly<
    Record<string, unknown>
  >;
  expect(receiptValue["ok"]).toBe(true);
  expect(receiptValue["outcome"]).toBe("handed-off");
  expect(receiptValue["channel"]).toBe("object-url-download");
  expect(receiptValue["bytesOffered"]).toBe(
    new TextEncoder().encode(goldenText).byteLength,
  );
  expect(receiptValue["cleanup"]).toBe("complete");
  expect(receiptValue["objectUrlsCreated"]).toBe(1);
  expect(receiptValue["objectUrlsRevoked"]).toBe(1);
  expect(receiptValue["outstandingOwnedResources"]).toBe(0);

  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
});

test("a gesture-less call is judged by the REAL activation probe", async ({ page }) => {
  const diagnostics = captureDiagnostics(page);
  await page.goto(baseUrl, { waitUntil: "load" });

  let downloadSeen = false;
  page.on("download", () => {
    downloadSeen = true;
  });

  const receiptHandle = await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>)["__e0AutoReceipt"],
  );
  const receipt = (await receiptHandle.jsonValue()) as Readonly<
    Record<string, unknown>
  >;
  const probe = (await page.evaluate(() => ({
    present: (window as unknown as Record<string, unknown>)["__e0ProbePresent"],
    active: (window as unknown as Record<string, unknown>)["__e0ProbeActive"],
  }))) as Readonly<{ present: unknown; active: unknown }>;

  /* The law is observation-relative: refuse exactly when the probe
   * observes false. Chromium and Firefox report no activation for a
   * load-time timer and MUST refuse with no download; Playwright's
   * WebKit reports userActivation.isActive === true at bare page load
   * (measured 2026-09-03, probe recorded in-page), so on that platform
   * the same call lawfully proceeds — asserted as such rather than
   * skipped, so a future WebKit that stops granting load-time
   * activation flips this arm automatically. */
  expect(probe.present).toBe(true);
  if (probe.active === false) {
    expect(receipt["ok"]).toBe(false);
    expect(receipt["outcome"]).toBe("failed");
    expect(receipt["code"]).toBe("export.delivery_user_gesture_required");
    expect(receipt["outstandingOwnedResources"]).toBe(0);
    await page.waitForTimeout(250);
    expect(downloadSeen).toBe(false);
  } else {
    expect(probe.active).toBe(true);
    expect(receipt["ok"]).toBe(true);
    expect(receipt["outcome"]).toBe("handed-off");
  }
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
});
