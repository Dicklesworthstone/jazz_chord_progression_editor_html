import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let server: Server, base: string, root: string;
let errors: string[], requests: { url: string; userAgent: string | undefined; allowed: boolean }[];
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "my-charts-native-source-probes-"));
  execFileSync("bun", [resolve("tests/support/build-my-charts-storage-probes.ts"), root], { cwd: process.cwd(), stdio: "pipe" });
  const variants = new Map<string, Buffer>();
  for (const name of ["baseline", "cas-removed", "early-receipt", "outside-transaction-delete", "empty-generation-reset", "generation-wrap"]) {
    variants.set(`/${name}.html`, await readFile(join(root, `${name}.html`)));
  }
  server = createServer((request, response) => {
    const html = variants.get(request.url ?? ""); response.writeHead(html === undefined ? 404 : 200, { "Content-Type": "text/html;charset=utf-8" }); response.end(html ?? "");
  });
  await new Promise<void>(done => { server.listen(0, "127.0.0.1", done); });
  const address = server.address(); if (address === null || typeof address === "string") throw new Error("Native probe address unavailable");
  base = `http://127.0.0.1:${String(address.port)}`;
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); });
test.beforeEach(async ({ context, page }) => {
  errors = []; requests = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await context.route("**/*", async route => {
    const request = route.request(), allowed = request.isNavigationRequest() && request.url().startsWith(base + "/");
    requests.push({ url: request.url(), userAgent: request.headers()["user-agent"], allowed });
    if (allowed) await route.continue(); else await route.abort();
  });
});
test.afterEach(async ({ browser }, info) => {
  await info.attach("native-storage-environment", { contentType: "application/json", body: JSON.stringify({ browser: browser.version(), errors, requests,
    sources: JSON.parse(await readFile(join(root, "source-report.json"), "utf8")) as unknown }) });
  expect(errors).toEqual([]); expect(requests.every(row => row.allowed && row.userAgent === "OpenAI File Downloader, XaiImageApiFetch/1.0")).toBe(true);
});
for (const name of ["populated-cas", "empty-aba", "failed-remove", "record-limit", "generation-limit"] as const) {
  test(`real adapter satisfies the independent ${name} law`, async ({ page }, info) => {
    await page.goto(base + "/baseline.html");
    const result = await page.evaluate(name => window.runMyChartsStorageProbe(name), name);
    await info.attach("native-storage-law", { contentType: "application/json", body: JSON.stringify(result) });
    expect(result).toMatchObject({ ok: true, name });
  });
}
for (const [variant, name, law] of [
  ["cas-removed", "populated-cas", "populated-cas-refuses-stale"],
  ["early-receipt", "failed-remove", "failed-remove-requires-transaction-receipt"],
  ["outside-transaction-delete", "failed-remove", "failed-remove-preserves-both-records"],
  ["empty-generation-reset", "empty-aba", "empty-generation-monotone"],
  ["generation-wrap", "generation-limit", "generation-exhaustion-refused"],
] as const) test(`unchanged native law rejects actual ${variant} source fault`, async ({ page, browser }, info) => {
  // A second context supplies the honest baseline immediately before this
  // mutant; neither variant inherits a database from the other.
  const clean = await browser.newContext({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
  let baseline: unknown;
  try {
    await clean.route("**/*", async route => {
      const request = route.request(), allowed = request.isNavigationRequest() && request.url() === base + "/baseline.html";
      requests.push({ url: request.url(), userAgent: request.headers()["user-agent"], allowed });
      if (allowed) await route.continue(); else await route.abort();
    });
    const positive = await clean.newPage();
    positive.on("pageerror", error => errors.push(error.message));
    positive.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await positive.goto(base + "/baseline.html");
    baseline = await positive.evaluate(name => window.runMyChartsStorageProbe(name), name);
    await info.attach("native-source-fault-baseline", { contentType: "application/json", body: JSON.stringify({ variant, baseline }) });
    // Close the page explicitly before its context: Playwright's automatic
    // context-close screenshot injects an inline stylesheet in WebKit. Keep
    // this harness's style CSP intact and retain the runner's ordinary traces.
    await positive.close();
    expect(baseline).toMatchObject({ ok: true, name });
  } finally { await clean.close(); }
  await page.goto(base + `/${variant}.html`);
  const mutant = await page.evaluate(name => window.runMyChartsStorageProbe(name), name);
  await info.attach("native-source-fault-law", { contentType: "application/json", body: JSON.stringify({ variant, baseline, mutant }) });
  expect(mutant).toMatchObject({ ok: false, name, kind: "assertion", law });
});
