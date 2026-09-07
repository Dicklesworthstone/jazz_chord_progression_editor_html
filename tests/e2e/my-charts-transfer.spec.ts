import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with { type: "json" };
import { observeNativeSources } from "../support/u5-native-audio";

const ua = "OpenAI File Downloader, XaiImageApiFetch/1.0";
const path = resolve("jazz_chord_progression_editor.html"), artifact = readFileSync(path), fileUrl = pathToFileURL(path).href;
const artifactHash = createHash("sha256").update(artifact).digest("hex");
const share = (title = fixture.title) => `#zdoc=2.${Buffer.from(JSON.stringify({ ...fixture, title })).toString("base64url")}`;
let server: Server, httpUrl: string, errors: string[], requests: { url: string; allowed: boolean; userAgent: string | undefined }[];
test.use({ userAgent: ua, contextOptions: { reducedMotion: "reduce" } });
test.beforeAll(async () => {
  server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html;charset=utf-8" }); response.end(artifact); });
  await new Promise<void>(resolve => { server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (address === null || typeof address === "string") throw new Error("No transfer server");
  httpUrl = `http://127.0.0.1:${String(address.port)}/`;
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); });
async function monitor(context: BrowserContext) {
  const watch = (page: Page) => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  };
  for (const page of context.pages()) watch(page); context.on("page", watch);
  await context.route("**/*", async route => {
    const request = route.request(), base = request.url().split("#")[0];
    const allowed = request.isNavigationRequest() && (base === httpUrl || base === fileUrl);
    requests.push({ url: request.url(), userAgent: request.headers()["user-agent"], allowed });
    if (allowed) await route.continue(); else await route.abort();
  });
}


test.beforeEach(async ({ context }) => { errors = []; requests = []; await monitor(context); });
test.afterEach(async ({ browser, page }, info) => {
  await info.attach("collection-transfer-environment", { contentType: "application/json", body: JSON.stringify({ artifactHash,
    browser: browser.version(), viewport: page.viewportSize(), errors, requests }) });
  expect(errors).toEqual([]); expect(requests.every(row => row.allowed && row.userAgent === ua)).toBe(true);
});
async function download(page: Page, selector: string) {
  const pending = page.waitForEvent("download"); await page.locator(selector).click();
  const file = await pending; return readFile(await file.path());
}
async function collection(page: Page) {
  await page.locator("#studio-my-charts-open").click(); await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
}
async function selected(page: Page, title: string) {
  await page.locator(".studio-my-charts__row").filter({ has: page.getByText(title, { exact: true }) }).click();
}
async function twoCharts(page: Page) {
  await collection(page); await page.locator("#studio-my-charts-keep").click(); await expect(page.locator(".studio-my-charts__row")).toHaveCount(1);
  await page.locator(".studio-my-charts__row").click(); await page.locator("#studio-my-charts-duplicate").click();
  await expect(page.locator(".studio-my-charts__row")).toHaveCount(2); await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
  await page.locator('.studio-my-charts__row[aria-pressed="false"]').click();
  await page.locator("#studio-my-charts-title").fill("Second kept chart"); await page.locator("#studio-my-charts-rename").click();
  await expect(page.locator(".studio-my-charts__row").filter({ hasText: "Second kept chart" })).toBeVisible();
  await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
  const second = await download(page, "#studio-my-charts-download-selected"), backup = await download(page, "#studio-my-charts-backup");
  return { second: JSON.parse(second.toString("utf8")) as unknown, backup };
}
async function openKept(page: Page, title: string, unsaved = true) {
  await selected(page, title); await page.locator("#studio-my-charts-load").click();
  await expect(page.locator("#studio-import-commit")).toBeEnabled(); await page.locator("#studio-import-commit").click();
  if (unsaved) {
    await expect(page.locator("#studio-import-confirm")).toBeEnabled(); await page.locator("#studio-import-confirm").click();
  } else await expect(page.locator("#studio-import-confirm")).toHaveCount(0);
  await expect(page.locator("#studio-document-title")).toHaveValue(title);
}
function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) { const array: unknown[] = value; return array.map(withoutIds); }
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id").map(([key, child]: [string, unknown]) => [key, withoutIds(child)]));
}
function withTitle(value: unknown, title: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected complete chart");
  return { ...value, title };
}
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("changes-my-charts", 1);
      request.onsuccess = () => { resolve(request.result); }; request.onerror = () => { reject(request.error ?? new Error("Snapshot open failed")); };
    });
    try {
      const transaction = database.transaction(["index", "documents"], "readonly");
      const completed = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => { resolve(); }; transaction.onabort = () => { reject(transaction.error ?? new Error("Snapshot aborted")); };
      });
      const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        request.onsuccess = () => { resolve(request.result); }; request.onerror = () => { reject(request.error ?? new Error("Snapshot read failed")); };
      });
      const index: IDBRequest<unknown> = transaction.objectStore("index").get("current"), documents: IDBRequest<unknown[]> = transaction.objectStore("documents").getAll();
      const [manifest, keys, payloads] = await Promise.all([read(index), read(transaction.objectStore("documents").getAllKeys()), read(documents)]);
      await completed; return { manifest, keys, payloads };
    } finally { database.close(); }
  });
}
async function abortNextManifest(page: Page) {
  await page.evaluate(() => {
    const native: unknown = Reflect.get(IDBObjectStore.prototype, "put");
    const isWriter = (value: unknown): value is IDBObjectStore["put"] => typeof value === "function";
    if (!isWriter(native)) throw new Error("Native writer unavailable");
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const request = key === undefined ? native.call(this, value) : native.call(this, value, key);
      if (this.transaction.db.name === "changes-my-charts" && this.name === "index") {
        IDBObjectStore.prototype.put = native; this.transaction.abort();
      }
      return request;
    };
  });
}

for (const mode of ["file", "http"] as const) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test.describe(`independent collection ${mode} ${String(viewport.width)}px`, () => {
    test.use({ viewport, hasTouch: viewport.width < 640 });
    const base = () => mode === "file" ? fileUrl : httpUrl;
    test("native two-chart backup restores exact bytes into a genuinely fresh browser context", async ({ page, browser }, info) => {
      await page.goto(base() + share()); const source = await twoCharts(page);
      expect(withoutIds(source.second)).toEqual(withoutIds({ ...fixture, title: "Second kept chart" }));
      expect(source.second).not.toEqual({ ...fixture, title: "Second kept chart" });
      const recipientContext = await browser.newContext({ userAgent: ua, viewport, hasTouch: viewport.width < 640,
        reducedMotion: "reduce", locale: "en-US", timezoneId: "UTC", serviceWorkers: "block" });
      await monitor(recipientContext);
      try {
        const recipient = await recipientContext.newPage(); await recipient.goto(base() + share("Recipient current chart"));
        await expect(recipient.locator("#studio-document-title")).toHaveValue("Recipient current chart");
        await collection(recipient); await expect(recipient.locator(".studio-my-charts__row")).toHaveCount(0);
        await recipient.locator("#studio-my-charts-restore-file").setInputFiles({ name: "portable.changes-library.json", mimeType: "application/json", buffer: source.backup });
        await expect(recipient.locator("#studio-my-charts-restore-heading")).toBeFocused();
        await expect(recipient.getByText("2 additions · 0 already identical · 0 conflicts.", { exact: true })).toBeVisible();
        await expect(recipient.locator("#studio-document-title")).toHaveValue("Recipient current chart");
        await recipient.locator("#studio-my-charts-restore-confirm").click(); await expect(recipient.locator(".studio-my-charts__row")).toHaveCount(2);
        await expect(recipient.locator("#studio-my-charts-keep")).toBeEnabled();
        const roundTrip = await download(recipient, "#studio-my-charts-backup"); expect(roundTrip.equals(source.backup)).toBe(true);
        await selected(recipient, "Second kept chart"); const chart = await download(recipient, "#studio-my-charts-download-selected");
        const actual: unknown = JSON.parse(chart.toString("utf8")); expect(actual).toEqual(source.second);
        await info.attach("collection-fresh-context", { contentType: "application/json", body: JSON.stringify({ sourceSecond: source.second, actual,
          sourceBackupSha256: createHash("sha256").update(source.backup).digest("hex"), restoredBackupSha256: createHash("sha256").update(roundTrip).digest("hex"), bytes: roundTrip.length }) });
        await recipient.close();
      } finally { await recipientContext.close(); }
    });
    test("dirty playing chart switches, reloads the right recovery and leaves kept copies untouched", async ({ page }, info) => {
      await page.goto(base() + share()); const kept = await twoCharts(page); await page.keyboard.press("Escape");
      await observeNativeSources(page); await page.locator(".studio-chord-card").first().click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().sounding ?? 0)).toBeGreaterThan(0);
      await collection(page); await selected(page, fixture.title); await page.locator("#studio-my-charts-load").click();
      await expect(page.locator("#studio-import-commit")).toBeEnabled(); await page.locator("#studio-import-commit").click();
      await expect(page.locator("#studio-import-confirm")).toBeEnabled();
      const preview = await page.evaluate(() => window.u5NativeSourceCounts?.()); expect(preview?.sounding).toBeGreaterThan(0);
      await page.locator("#studio-import-confirm").click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      const title = page.locator("#studio-document-title"); await title.fill("Unsaved current draft"); await title.press("Enter");
      await page.locator("#studio-transport-play").click();
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(preview?.started ?? 0);
      await collection(page); await openKept(page, "Second kept chart");
      await expect.poll(() => page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
      const audio = await page.evaluate(() => window.u5NativeSourceCounts?.());
      await title.fill("Recovered second edit"); await title.press("Enter");
      await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
      await page.evaluate(() => { const url = new URL(location.href); url.hash = ""; history.replaceState(null, "", url.href); });
      await page.reload(); await expect(title).toHaveValue("Recovered second edit");
      await page.locator("#studio-export-json").click(); const recoveredFile = await download(page, "#studio-lifecycle-download");
      const recovered: unknown = JSON.parse(recoveredFile.toString("utf8")); expect(recovered).toEqual(withTitle(kept.second, "Recovered second edit"));
      // Native file delivery precedes E0's export-marker/recovery receipt.
      // Dismiss only once the existing workflow says handoff has settled.
      await expect(page.locator("#studio-lifecycle-export-dialog").getByRole("status")).toContainText("Handed off to your browser.");
      await page.keyboard.press("Escape"); await expect(page.locator("#studio-lifecycle-export-dialog")).toHaveCount(0);
      await collection(page);
      await expect(page.locator(".studio-my-charts__row")).toHaveCount(2);
      await expect(page.locator(".studio-my-charts__row").filter({ hasText: "Recovered second edit" })).toHaveCount(0);
      const afterRecovery = await download(page, "#studio-my-charts-backup"); expect(afterRecovery.equals(kept.backup)).toBe(true);
      await openKept(page, fixture.title, false); await page.locator("#studio-undo").click(); await expect(title).toHaveValue("Recovered second edit");
      await info.attach("collection-dirty-recovery", { contentType: "application/json", body: JSON.stringify({ keptSecond: kept.second, recovered, preview, audio,
        backupBeforeSha256: createHash("sha256").update(kept.backup).digest("hex"), backupAfterSha256: createHash("sha256").update(afterRecovery).digest("hex") }) });
    });
    test("cancelled and interrupted Remove and Restore preserve native bytes before successful twins", async ({ page }, info) => {
      await page.goto(base() + share()); const kept = await twoCharts(page), before = await snapshot(page);
      await page.locator("#studio-my-charts-remove").click(); await expect(page.locator("#studio-my-charts-confirm-heading")).toBeFocused();
      await page.locator("#studio-my-charts-confirm-cancel").click(); expect(await snapshot(page)).toEqual(before);
      await page.locator("#studio-my-charts-remove").click(); await abortNextManifest(page); await page.locator("#studio-my-charts-confirm").click();
      await expect(page.getByRole("alert")).toContainText("transaction was cancelled"); expect(await snapshot(page)).toEqual(before);
      await page.locator("#studio-my-charts-refresh").click(); await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
      await selected(page, "Second kept chart"); await page.locator("#studio-my-charts-remove").click(); await page.locator("#studio-my-charts-confirm").click();
      await expect(page.locator(".studio-my-charts__row")).toHaveCount(1); await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
      const removed = await snapshot(page); expect(removed.payloads).toHaveLength(1);
      expect(removed.payloads.map(value => typeof value === "string" ? JSON.parse(value) as unknown : value)).toEqual([fixture]);
      const file = { name: "restore.changes-library.json", mimeType: "application/json", buffer: kept.backup };
      await page.locator("#studio-my-charts-restore-file").setInputFiles(file); await expect(page.locator("#studio-my-charts-restore-confirm")).toBeEnabled();
      await abortNextManifest(page); await page.locator("#studio-my-charts-restore-confirm").click();
      await expect(page.getByRole("alert")).toContainText("transaction was cancelled"); expect(await snapshot(page)).toEqual(removed);
      await page.locator("#studio-my-charts-refresh").click(); await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
      await page.locator("#studio-my-charts-restore-file").setInputFiles(file); await expect(page.locator("#studio-my-charts-restore-confirm")).toBeEnabled();
      await page.locator("#studio-my-charts-restore-confirm").click(); await expect(page.locator(".studio-my-charts__row")).toHaveCount(2);
      await expect(page.locator("#studio-my-charts-keep")).toBeEnabled();
      const restored = await download(page, "#studio-my-charts-backup"); expect(restored.equals(kept.backup)).toBe(true);
      await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      await info.attach("collection-native-removal-restore", { contentType: "application/json", body: JSON.stringify({ before, removed, after: await snapshot(page),
        sourceBackupSha256: createHash("sha256").update(kept.backup).digest("hex"), restoredBackupSha256: createHash("sha256").update(restored).digest("hex") }) });
    });
  });
}

for (const mode of ["file", "http"] as const) test.describe(`populated tabs ${mode}`, () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("a stale real tab cannot rename over a newer populated collection", async ({ page, context }, info) => {
    const base = mode === "file" ? fileUrl : httpUrl;
    await page.goto(base + share()); await twoCharts(page); const before = await snapshot(page);
    const second = await context.newPage();
    try {
      await second.goto(base + share()); await collection(second); await expect(second.locator(".studio-my-charts__row")).toHaveCount(2);
      await selected(second, "Second kept chart");
      await page.locator("#studio-my-charts-keep").click(); await expect(page.locator(".studio-my-charts__row")).toHaveCount(3);
      await expect(page.locator("#studio-my-charts-keep")).toBeEnabled(); const winner = await snapshot(page);
      await second.locator("#studio-my-charts-title").fill("Stale tab rename"); await second.locator("#studio-my-charts-rename").click();
      await expect(second.getByRole("alert")).toContainText("another tab"); expect(await snapshot(second)).toEqual(winner);
      await expect(second.locator("#studio-my-charts-backup")).toBeDisabled();
      await second.locator("#studio-my-charts-refresh").click(); await expect(second.locator(".studio-my-charts__row")).toHaveCount(3);
      await expect(second.locator("#studio-my-charts-keep")).toBeEnabled(); await selected(second, "Second kept chart");
      await second.locator("#studio-my-charts-title").fill("Explicit rename after refresh"); await second.locator("#studio-my-charts-rename").click();
      await expect(second.locator(".studio-my-charts__row").filter({ hasText: "Explicit rename after refresh" })).toBeVisible();
      await expect(second.locator("#studio-my-charts-keep")).toBeEnabled(); const after = await snapshot(second);
      expect(after.payloads).toHaveLength(3); await expect(second.locator("#studio-document-title")).toHaveValue(fixture.title);
      await info.attach("collection-populated-tabs", { contentType: "application/json", body: JSON.stringify({ before, winner, after }) });
    } finally { await second.close(); }
  });
});
