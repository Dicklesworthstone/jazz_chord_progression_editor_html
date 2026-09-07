import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with { type: "json" };
import { observeNativeSources } from "../support/u5-native-audio";

declare global { interface Window { myChartsUrls?: { created: number; revoked: number }; myChartsFault?: "quota" | "abort-manifest" | null;
  myChartsConnections?: () => { opened: number; closed: number; outstanding: number } } }
const artifactPath = resolve("jazz_chord_progression_editor.html"), artifact = readFileSync(artifactPath);
const artifactHash = createHash("sha256").update(artifact).digest("hex");
const fixtureHash = createHash("sha256").update(readFileSync(resolve("tests/fixtures/my-charts/cases.json"))).digest("hex");
const fragment = `#zdoc=2.${Buffer.from(JSON.stringify(fixture)).toString("base64url")}`;
let server: Server, httpUrl: string;
let errors: string[], requests: { url: string; allowed: boolean; userAgent: string | undefined }[];
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });
test.beforeAll(async () => {
  server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(artifact); });
  await new Promise<void>(done => { server.listen(0, "127.0.0.1", done); });
  const address = server.address(); if (address === null || typeof address === "string") throw new Error("Missing loopback address");
  httpUrl = `http://127.0.0.1:${String(address.port)}/`;
});
test.afterAll(async () => { await new Promise<void>((done, reject) => { server.close(error => { if (error) reject(error); else done(); }); }); });
function monitor(page: Page) {
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
}
test.beforeEach(async ({ context }) => {
  errors = []; requests = [];
  for (const page of context.pages()) monitor(page);
  context.on("page", monitor);
  await context.route("**/*", async route => {
    const request = route.request(), url = request.url(), base = url.split("#")[0];
    const allowed = request.isNavigationRequest() && (base === httpUrl || base === pathToFileURL(artifactPath).href);
    requests.push({ url, allowed, userAgent: request.headers()["user-agent"] });
    if (allowed) await route.continue(); else await route.abort();
  });
  await context.addInitScript(() => {
    window.myChartsUrls = { created: 0, revoked: 0 };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = value => { if (window.myChartsUrls) window.myChartsUrls.created++; return create(value); };
    URL.revokeObjectURL = url => { if (window.myChartsUrls) window.myChartsUrls.revoked++; revoke(url); };
    const connections = new Set<IDBDatabase>(); let opened = 0, closed = 0;
    const nativeOpen = indexedDB.open.bind(indexedDB), nativeClose: unknown = Reflect.get(IDBDatabase.prototype, "close");
    if (typeof nativeClose !== "function") throw new Error("Missing native close");
    indexedDB.open = (name, version) => {
      const request = version === undefined ? nativeOpen(name) : nativeOpen(name, version);
      if (name === "changes-my-charts") request.addEventListener("success", () => { opened++; connections.add(request.result); }, { once: true });
      return request;
    };
    IDBDatabase.prototype.close = function () {
      Reflect.apply(nativeClose, this, []);
      if (connections.delete(this)) closed++;
    };
    window.myChartsConnections = () => ({ opened, closed, outstanding: connections.size });
    const add: unknown = Reflect.get(IDBObjectStore.prototype, "add"), put: unknown = Reflect.get(IDBObjectStore.prototype, "put");
    // These two methods are captured directly from the native object-store
    // prototype, whose add/put contract returns a key request even while pending.
    const isNativeWriter = (method: unknown): method is IDBObjectStore["add"] => typeof method === "function";
    if (!isNativeWriter(add) || !isNativeWriter(put)) throw new Error("Missing native IndexedDB methods");
    IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
      if (this.transaction.db.name === "changes-my-charts" && window.myChartsFault === "quota") {
        window.myChartsFault = null; throw new DOMException("Independent native transaction quota fault", "QuotaExceededError");
      }
      return key === undefined ? add.call(this, value) : add.call(this, value, key);
    };
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const result = key === undefined ? put.call(this, value) : put.call(this, value, key);
      if (this.transaction.db.name === "changes-my-charts" && this.name === "index" && window.myChartsFault === "abort-manifest") {
        window.myChartsFault = null; this.transaction.abort();
      }
      return result;
    };
  });
});
test.afterEach(async ({ page, browser }, info) => {
  await info.attach("my-charts-diagnostics", { contentType: "application/json", body: JSON.stringify({ artifactHash, fixtureHash,
    browser: browser.version(), viewport: page.viewportSize(), errors, requests,
    urls: await page.evaluate(() => window.myChartsUrls).catch(() => null),
    connections: await page.evaluate(() => window.myChartsConnections?.()).catch(() => null),
    audio: await page.evaluate(() => window.u5NativeSourceCounts?.()).catch(() => null) }) });
  expect(errors).toEqual([]); expect(requests.filter(row => !row.allowed)).toEqual([]);
  expect(await page.evaluate(() => window.myChartsConnections?.().outstanding)).toBe(0);
  for (const row of requests) expect(row.userAgent).toBe("OpenAI File Downloader, XaiImageApiFetch/1.0");
});
async function inspect(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const request = indexedDB.open("changes-my-charts", 1);
      request.onsuccess = () => { done(request.result); }; request.onerror = () => { fail(request.error ?? new Error("Native open failed")); };
    });
    try {
      const transaction = db.transaction(["index", "documents"], "readonly");
      const done = new Promise<void>((resolve, reject) => { transaction.oncomplete = () => { resolve(); }; transaction.onabort = () => { reject(transaction.error ?? new Error("Native read aborted")); }; });
      const index: IDBRequest<unknown> = transaction.objectStore("index").get("current");
      const keys = transaction.objectStore("documents").getAllKeys(), documents: IDBRequest<unknown[]> = transaction.objectStore("documents").getAll();
      const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        request.onsuccess = () => { resolve(request.result); }; request.onerror = () => { reject(request.error ?? new Error("Native read failed")); };
      });
      const [rawIndex, payloadKeys, payloads] = await Promise.all([read(index), read(keys), read(documents)]);
      await done;
      return { rawIndex: rawIndex ?? null, payloadKeys, payloads };
    } finally { db.close(); }
  });
}
async function open(page: Page) {
  await page.locator("#studio-my-charts-open").click();
  await expect(page.getByRole("dialog", { name: "My Charts", exact: true })).toBeVisible();
  await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
}
async function keep(page: Page, count: number) {
  await page.locator("#studio-my-charts-keep").click();
  await expect(page.locator(".studio-my-charts__row")).toHaveCount(count);
  await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
}
async function download(page: Page, button: string) {
  const pending = page.waitForEvent("download"); await page.locator(button).click();
  const delivered = await pending, bytes = await readFile(await delivered.path());
  return { bytes, filename: delivered.suggestedFilename() };
}
function backupDocuments(text: string): unknown[] {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || !("records" in value) || !Array.isArray(value.records)) throw new Error("Invalid actual backup");
  const records: unknown[] = value.records;
  return records.map(row => {
    if (typeof row !== "object" || row === null || !("documentText" in row) || typeof row.documentText !== "string") throw new Error("Missing actual document text");
    const document: unknown = JSON.parse(row.documentText); return document;
  });
}
async function checkLayout(page: Page) {
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).include("#studio-my-charts-dialog").analyze();
  expect(axe.violations).toEqual([]); return axe;
}

for (const mode of ["file", "http"] as const) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test.describe(`My Charts ${mode} ${String(viewport.width)}px`, () => {
    test.use({ viewport, hasTouch: viewport.width < 640 });
    const base = () => mode === "file" ? pathToFileURL(artifactPath).href : httpUrl;
    test("keeps and renames exact charts with native JSON and backup downloads", async ({ page }, info) => {
      await page.goto(base() + fragment); await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      await open(page); await keep(page, 1); await page.locator(".studio-my-charts__row").click();
      const before = await inspect(page);
      await page.locator("#studio-my-charts-title").fill("Kept <title> 🎹"); await page.locator("#studio-my-charts-rename").click();
      await expect(page.locator(".studio-my-charts__row")).toContainText("Kept <title> 🎹");
      await page.locator("#studio-my-charts-duplicate").click(); await expect(page.locator(".studio-my-charts__row")).toHaveCount(2);
      await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
      const chart = await download(page, "#studio-my-charts-download-selected");
      const actual: unknown = JSON.parse(chart.bytes.toString("utf8")); expect(actual).toEqual({ ...fixture, title: "Kept <title> 🎹" });
      const backup = await download(page, "#studio-my-charts-backup"); expect(backup.filename).toBe("my-charts.changes-library.json");
      const documents = backupDocuments(backup.bytes.toString("utf8")); expect(documents).toHaveLength(2); expect(documents[0]).not.toEqual(documents[1]);
      const axe = await checkLayout(page), after = await inspect(page);
      await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "My Charts", exact: true })).toHaveCount(0);
      await expect(page.locator("#studio-my-charts-open")).toBeFocused(); await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      const urls = await page.evaluate(() => window.myChartsUrls); expect(urls).toEqual({ created: 2, revoked: 2 });
      await info.attach("collection-exact-downloads", { contentType: "application/json", body: JSON.stringify({ before, after, documents, actual, urls, axe }) });
    });
    test("restores with explicit same-record conflict decisions and preserves cancelled work", async ({ page }, info) => {
      await page.goto(base() + fragment); await open(page); await keep(page, 1);
      const backup = await download(page, "#studio-my-charts-backup");
      await page.locator(".studio-my-charts__row").click(); await page.locator("#studio-my-charts-title").fill("Keep local version");
      await page.locator("#studio-my-charts-rename").click(); await expect(page.locator(".studio-my-charts__row")).toContainText("Keep local version");
      const before = await inspect(page);
      const file = { name: "my-charts.changes-library.json", mimeType: "application/json", buffer: backup.bytes };
      await page.locator("#studio-my-charts-restore-file").setInputFiles(file);
      await expect(page.locator("#studio-my-charts-restore-heading")).toBeFocused();
      await expect(page.locator("#studio-my-charts-restore-confirm")).toBeDisabled();
      expect(await inspect(page)).toEqual(before);
      await page.locator("#studio-my-charts-restore-cancel").click(); expect(await inspect(page)).toEqual(before);
      await page.locator("#studio-my-charts-restore-file").setInputFiles(file);
      await page.getByLabel("Use backup copy:", { exact: false }).check();
      await page.locator("#studio-my-charts-restore-confirm").click(); await expect(page.locator(".studio-my-charts__row")).toContainText(fixture.title);
      await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
      const restored = await inspect(page);
      expect(restored.payloads.map(value => typeof value === "string" ? JSON.parse(value) as unknown : value)).toEqual([fixture]);
      await page.locator("#studio-my-charts-restore-file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from([0xff, 0xfe]) });
      await expect(page.getByRole("alert")).toContainText("unreadable"); expect(await inspect(page)).toEqual(restored);
      await info.attach("collection-restore-conflict", { contentType: "application/json", body: JSON.stringify({ before, restored }) });
    });
    test("two real pages refuse a stale collection writer and retain the winning chart", async ({ page, context }, info) => {
      await page.goto(base() + fragment); await open(page);
      const second = await context.newPage(); await second.goto(base() + fragment); await open(second);
      await keep(page, 1); const committed = await inspect(page);
      await second.locator("#studio-my-charts-keep").click(); await expect(second.getByRole("alert")).toContainText("another tab");
      expect(await inspect(second)).toEqual(committed);
      await expect(second.locator("#studio-my-charts-backup")).toBeDisabled();
      await second.locator("#studio-my-charts-refresh").click(); await expect(second.locator(".studio-my-charts__row")).toHaveCount(1);
      await expect(second.locator("#studio-my-charts-keep")).toBeEnabled(); await keep(second, 2);
      const after = await inspect(page); expect(after.payloads).toHaveLength(2);
      await info.attach("collection-native-cas", { contentType: "application/json", body: JSON.stringify({ committed, after }) });
      await second.close();
    });
    test("native quota and interrupted manifest transactions preserve every committed byte", async ({ page }, info) => {
      await page.goto(base() + fragment); await open(page); await keep(page, 1); const before = await inspect(page);
      for (const fault of ["quota", "abort-manifest"] as const) {
        await page.evaluate(value => { window.myChartsFault = value; }, fault);
        await page.locator("#studio-my-charts-keep").click(); await expect(page.getByRole("alert")).toBeVisible();
        expect(await inspect(page)).toEqual(before); expect(await page.evaluate(() => window.myChartsFault)).toBeNull();
        await page.locator("#studio-my-charts-refresh").click(); await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
      }
      await keep(page, 2); const after = await inspect(page);
      await info.attach("collection-native-abort", { contentType: "application/json", body: JSON.stringify({ before, after }) });
    });
    test("corrupt stored bytes refuse collection writes and retain the real current JSON escape", async ({ page }, info) => {
      await page.goto(base() + fragment); await open(page); await keep(page, 1);
      await page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("changes-my-charts", 1);
          request.onsuccess = () => { resolve(request.result); }; request.onerror = () => { reject(request.error ?? new Error("Open failed")); };
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = database.transaction("documents", "readwrite");
            tx.oncomplete = () => { resolve(); }; tx.onabort = () => { reject(tx.error ?? new Error("Corruption fixture aborted")); };
            const store = tx.objectStore("documents"), keys = store.getAllKeys();
            keys.onsuccess = () => { const key = keys.result[0]; if (key === undefined) { tx.abort(); return; } store.put("{independently corrupted", key); };
          });
        } finally { database.close(); }
      });
      const corrupt = await inspect(page); await page.locator("#studio-my-charts-refresh").click();
      await expect(page.getByRole("alert")).toContainText("unreadable"); await expect(page.locator("#studio-my-charts-keep")).toBeDisabled();
      expect(await inspect(page)).toEqual(corrupt);
      await page.locator("#studio-my-charts-current-json").click();
      const exported = await download(page, "#studio-lifecycle-download");
      const actual: unknown = JSON.parse(exported.bytes.toString("utf8")); expect(actual).toEqual(fixture);
      await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      await info.attach("collection-native-corruption", { contentType: "application/json", body: JSON.stringify({ corrupt, actual }) });
    });
    test("a denied native storage boundary leaves the current chart export working", async ({ page }, info) => {
      await page.goto(base() + fragment); await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      await page.evaluate(() => {
        const original = indexedDB.open.bind(indexedDB);
        indexedDB.open = (name, version) => {
          if (name === "changes-my-charts") throw new DOMException("Independent denied-storage control", "SecurityError");
          return version === undefined ? original(name) : original(name, version);
        };
      });
      await page.locator("#studio-my-charts-open").click(); await expect(page.getByRole("alert")).toContainText("unavailable in this browser");
      await expect(page.locator("#studio-my-charts-keep")).toBeDisabled(); await page.locator("#studio-my-charts-current-json").click();
      const exported = await download(page, "#studio-lifecycle-download");
      const actual: unknown = JSON.parse(exported.bytes.toString("utf8")); expect(actual).toEqual(fixture);
      await info.attach("collection-denied-boundary", { contentType: "application/json", body: JSON.stringify({ actual }) });
    });
    test("opening a kept chart stops real audio before replacement and Undo restores the previous chart", async ({ page }, info) => {
      await page.goto(base() + fragment); await open(page); await keep(page, 1); await page.locator(".studio-my-charts__row").click();
      await page.locator("#studio-my-charts-title").fill("Open the kept chart"); await page.locator("#studio-my-charts-rename").click();
      await expect(page.locator(".studio-my-charts__row")).toContainText("Open the kept chart"); await page.keyboard.press("Escape");
      await observeNativeSources(page); await page.locator("#studio-transport-play").click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(0);
      await open(page); await page.locator(".studio-my-charts__row").click(); await page.locator("#studio-my-charts-load").click();
      await expect(page.locator("#studio-import-commit")).toBeEnabled();
      await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      await page.locator("#studio-import-commit").click(); await expect(page.getByRole("dialog", { name: "Replace the current chart?", exact: true })).toBeVisible();
      await page.locator("#studio-import-confirm").click(); await expect(page.locator("#studio-document-title")).toHaveValue("Open the kept chart");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      await page.locator("#studio-undo").click(); await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      await info.attach("collection-native-open-audio", { contentType: "application/json", body: JSON.stringify({ expected: fixture,
        audio: await page.evaluate(() => window.u5NativeSourceCounts?.()), storage: await inspect(page) }) });
    });
  });
}

test.describe("My Charts 200-percent equivalent layout", () => {
  test.use({ viewport: { width: 640, height: 450 }, hasTouch: false });
  test("keyboard search and cancellation preserve a readable local collection", async ({ page }, info) => {
    await page.goto(httpUrl + fragment); await page.locator("#studio-my-charts-open").focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "My Charts", exact: true })).toBeFocused();
    await expect(page.locator("#studio-my-charts-keep")).toBeEnabled(); await keep(page, 1);
    await page.locator("#studio-my-charts-search").fill("not present"); await expect(page.locator(".studio-my-charts__row")).toHaveCount(0);
    await page.locator("#studio-my-charts-search").fill("C major"); await expect(page.locator(".studio-my-charts__row")).toHaveCount(1);
    const axe = await checkLayout(page); await page.keyboard.press("Escape"); await expect(page.locator("#studio-my-charts-open")).toBeFocused();
    await info.attach("collection-keyboard-layout", { contentType: "application/json", body: JSON.stringify({ axe, storage: await inspect(page) }) });
  });
});
