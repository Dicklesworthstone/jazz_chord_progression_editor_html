import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
const artifact = pathToFileURL(join(process.cwd(), "jazz_chord_progression_editor.html")).href;
const artifactSha256 = createHash("sha256").update(readFileSync(new URL(artifact))).digest("hex");
const pageDiagnostics = new WeakMap<Page, {
  pageErrors: string[];
  consoleErrors: string[];
  requests: { method: string; url: string; type: string }[];
}>();

test.beforeEach(({ page }) => {
  const diagnostic = { pageErrors: [] as string[], consoleErrors: [] as string[],
    requests: [] as { method: string; url: string; type: string }[] };
  pageDiagnostics.set(page, diagnostic);
  page.on("pageerror", (error) => diagnostic.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostic.consoleErrors.push(message.text());
  });
  page.on("request", (request) => diagnostic.requests.push({ method: request.method(),
    url: request.url().startsWith("data:") ? "data:embedded" : request.url(), type: request.resourceType() }));
});

test.afterEach(async ({ page, browser }, info) => {
  const diagnostic = pageDiagnostics.get(page);
  if (diagnostic === undefined) throw new Error("U5_DIAGNOSTICS_MISSING");
  await info.attach("u5-browser-diagnostics.json", { contentType: "application/json",
    body: JSON.stringify({ artifactSha256, browserVersion: browser.version(), viewport: page.viewportSize(),
      test: info.title, ...diagnostic }, null, 2) });
  expect(diagnostic.pageErrors).toEqual([]);
  expect(diagnostic.consoleErrors).toEqual([]);
});

async function retitle(page: Page, title: string): Promise<void> {
  const input = page.locator("#studio-document-title");
  await input.fill(title);
  await input.press("Enter");
  await expect.poll(async () => (await recoveryEntries(page)).some(([key, value]) =>
    key.endsWith(":current") && value.includes(JSON.stringify(title)))).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: /^Recovered locally at /u })).toBeVisible();
}

async function recoveryEntries(page: Page): Promise<[string, string][]> {
  return await page.evaluate(async () => await new Promise<[string, string][]>((resolve, reject) => {
    const request = indexedDB.open("changes-recovery", 1);
    request.onerror = () => { reject(request.error ?? new Error("IndexedDB open failed")); };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("recovery-envelopes", "readonly");
      const rows: [string, string][] = [];
      const cursor = transaction.objectStore("recovery-envelopes").openCursor();
      cursor.onsuccess = () => {
        const value = cursor.result;
        if (value !== null) {
          if (typeof value.key === "string" && typeof value.value === "string") rows.push([value.key, value.value]);
          value.continue();
        }
      };
      transaction.oncomplete = () => { db.close(); resolve(rows); };
      transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("IndexedDB transaction failed")); };
    };
  }));
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`U5 real recovery ${String(viewport.width)}px`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      await page.route("**/*", async (route) => {
        if (route.request().url() === artifact) await route.continue();
        else await route.abort("blockedbyclient");
      });
      await page.goto(artifact);
      await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    });

    test("an unanswered recovery offer survives two reloads and multiple write windows", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await retitle(page, "Keep these exact bytes");
      const before = await recoveryEntries(page);
      await page.reload();
      await expect(page.locator("#studio-recovery-keep")).toBeVisible();
      await page.waitForTimeout(2_500);
      expect(await recoveryEntries(page)).toEqual(before);
      await page.reload();
      await expect(page.locator("#studio-recovery-keep")).toBeVisible();
      await page.locator("#studio-recovery-keep").click();
      await expect(page.locator("#studio-document-title")).toHaveValue("Keep these exact bytes");
      await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
      expect(errors).toEqual([]);
    });

    test("corrupted current recovery visibly offers the real previous envelope", async ({ page }) => {
      await retitle(page, "Previous valid chart");
      await retitle(page, "Latest valid chart");
      const before = await recoveryEntries(page);
      const currentKey = before.find(([key]) => key.endsWith(":current"))?.[0];
      if (currentKey === undefined) throw new Error("CURRENT_RECOVERY_MISSING");
      await page.evaluate(async (key) => { await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("changes-recovery", 1);
        request.onerror = () => { reject(request.error ?? new Error("IndexedDB open failed")); };
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("recovery-envelopes", "readwrite");
          transaction.objectStore("recovery-envelopes").put("{corrupt", key);
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("IndexedDB transaction failed")); };
        };
      }); }, currentKey);
      await page.reload();
      await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Previous recovery copy found");
      await expect(page.locator("#studio-recovery-notice-body")).toContainText("latest recovery copy could not be read");
      await page.locator("#studio-recovery-keep").click();
      await expect(page.locator("#studio-document-title")).toHaveValue("Previous valid chart");
    });

    test("a real quota refusal keeps edits pending and leaves JSON export available", async ({ page }) => {
      await page.evaluate(() => {
        const original = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, "put");
        if (original === undefined) throw new Error("IDB_PUT_DESCRIPTOR_MISSING");
        IDBObjectStore.prototype.put = function () {
          Object.defineProperty(IDBObjectStore.prototype, "put", original);
          throw new DOMException("Storage quota exhausted by failure test", "QuotaExceededError");
        };
      });
      await page.locator("#studio-document-title").fill("Pending after quota");
      await page.locator("#studio-document-title").press("Enter");
      await expect(page.getByRole("status").filter({ hasText: /^Changes pending recovery$/u })).toBeVisible();
      await expect(page.getByText(/Recovery unavailable — export recommended \(recovery.quota_exceeded\)/u)).toBeVisible();
      await expect(page.locator("#studio-document-title")).toHaveValue("Pending after quota");
      expect(await recoveryEntries(page)).toEqual([]);
      await page.locator("#studio-export-json").click();
      await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
      await page.keyboard.press("Escape");
      await retitle(page, "Storage works on the next edit");
      await expect(page.getByRole("status").filter({ hasText: /^Recovered locally at /u })).toBeVisible();
      expect((await recoveryEntries(page)).length).toBeGreaterThan(0);
    });

    test("failed Discard retains its offer and exact storage bytes, then succeeds on retry", async ({ page }) => {
      await retitle(page, "Cannot discard yet");
      const before = await recoveryEntries(page);
      await page.reload();
      await expect(page.locator("#studio-recovery-keep")).toBeVisible();
      await page.evaluate(() => {
        const original = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, "delete");
        if (original === undefined) throw new Error("IDB_DELETE_DESCRIPTOR_MISSING");
        IDBObjectStore.prototype.delete = function () {
          Object.defineProperty(IDBObjectStore.prototype, "delete", original);
          throw new DOMException("Denied by failure test", "NotAllowedError");
        };
      });
      await page.locator("#studio-recovery-discard").click();
      await expect(page.getByRole("alert")).toContainText("could not be discarded");
      await expect(page.locator("#studio-recovery-keep")).toBeEnabled();
      expect(await recoveryEntries(page)).toEqual(before);
      await page.locator("#studio-recovery-discard").click();
      await expect(page.locator("#studio-recovery-keep")).toHaveCount(0);
      // The workspace location deliberately survives without chart payloads;
      // removing it would revive a different, older document on the next boot.
      expect(await recoveryEntries(page)).toEqual([["changes.studio-recovery-location.v1:current",
        JSON.stringify({ schema: "changes.studio-recovery-location.v1", documentId: "studio-document-1" })]]);
      await page.reload();
      await page.waitForTimeout(600);
      await expect(page.locator("#studio-recovery-keep")).toHaveCount(0);
    });
  });
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`U5 JSON export ${String(viewport.width)}px`, () => {
    test.use({ viewport });
    test("real JSON download preserves the chart, records exact delivery, and restores focus", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(artifact);
      await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
      await retitle(page, "Portable chart proof");
      await page.locator("#studio-export-json").click();
      const dialog = page.getByRole("dialog", { name: "Export chart as JSON" });
      await expect(dialog).toBeVisible();
      await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
      const downloadEvent = page.waitForEvent("download");
      await page.locator("#studio-lifecycle-download").click();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toBe("Portable chart proof.changes.json");
      const path = await download.path();
      const bytes = await readFile(path);
      const parsed: unknown = JSON.parse(bytes.toString("utf8"));
      expect(parsed).toMatchObject({ schema: "changes.progression.v2", title: "Portable chart proof",
        meter: { beatsPerBar: 4, beatUnit: 4 } });
      await expect(dialog.getByRole("status")).toContainText("Handed off to your browser");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // Capture visuals separately: Playwright 1.61.1's WebKit screenshot
      // preparation injects `body {}`, which this app's CSP correctly blocks.
      // The behavior test retains the strict zero-console-error assertion.
      await expect(page.getByText(/^Exported at revision /u)).toBeVisible();
      const stored = (await recoveryEntries(page)).find(([key]) => key.startsWith("changes.recovery-export-binding.v1:"));
      expect(stored).toBeDefined();
      const binding: unknown = JSON.parse(stored?.[1] ?? "{}");
      expect(binding).toMatchObject({ artifactByteLength: bytes.length,
        artifactSha256: createHash("sha256").update(bytes).digest("hex") });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.locator("#studio-export-json")).toBeFocused();
      await expect(page.locator("#studio-document-title")).toHaveValue("Portable chart proof");
      expect(errors).toEqual([]);
    });

    test("Cancel and a real browser delivery failure leave the export marker alone", async ({ page }) => {
      const downloads: string[] = [];
      page.on("download", (download) => downloads.push(download.suggestedFilename()));
      await page.goto(artifact);
      await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
      const title = await page.locator("#studio-document-title").inputValue();
      await page.locator("#studio-export-json").click();
      await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
      await page.keyboard.press("Escape");
      expect(downloads).toEqual([]);
      await expect(page.getByText(/^Exported at revision /u)).toHaveCount(0);
      await page.evaluate(() => {
        URL.createObjectURL = () => { throw new DOMException("Resource creation denied", "NotAllowedError"); };
      });
      await page.locator("#studio-export-json").click();
      await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
      await page.locator("#studio-lifecycle-download").click();
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText("export.delivery_activation_failed");
      await expect(page.getByText(/^Exported at revision /u)).toHaveCount(0);
      expect(downloads).toEqual([]);
      await expect(page.locator("#studio-document-title")).toHaveValue(title);
      await page.keyboard.press("Escape");
      await expect(page.locator("#studio-export-json")).toBeFocused();
    });
  });
}
