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

async function importCanonicalFile(page: Page, file: string): Promise<void> {
  await page.locator("#studio-import-chart").click();
  await page.locator("#studio-import-file").setInputFiles(join(process.cwd(), file));
  await expect(page.locator("#studio-import-commit")).toBeEnabled();
  await page.locator("#studio-import-commit").click();
  await page.locator("#studio-import-confirm").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function downloadJson(page: Page): Promise<unknown> {
  await page.locator("#studio-export-json").click();
  await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
  const pending = page.waitForEvent("download");
  await page.locator("#studio-lifecycle-download").click();
  const download = await pending;
  const bytes = await readFile(await download.path(), "utf8");
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Handed off to your browser");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const parsed: unknown = JSON.parse(bytes);
  return parsed;
}

async function invalidateRecoveredChordSemantics(page: Page, slots: readonly string[]): Promise<void> {
  const rows = (await recoveryEntries(page)).filter(([key]) => key.startsWith("changes.recovery.v1:") &&
    slots.some(slot => key.endsWith(`:${slot}`)));
  expect(rows).toHaveLength(slots.length);
  await page.evaluate(async entries => {
    // Independent checksum implementation from A1's sorted-key JSON law.
    function canonical(value: unknown): string {
      if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
      if (typeof value === "object" && value !== null) return `{${Object.keys(value).sort().map(key =>
        `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`).join(",")}}`;
      return JSON.stringify(value);
    }
    const replacements: [string, string][] = [];
    for (const [key, bytes] of entries) {
      // Fixture boundary only: preserve every field except the deliberately
      // contradicted chord root and the correctly recomputed envelope checksum.
      const envelope = JSON.parse(bytes) as { checksum?: string; document: {
        sections: { measures: { events: { chord: { root: { step: string } } }[] }[] }[];
      } };
      const chord = envelope.document.sections[0]?.measures[0]?.events[0]?.chord;
      if (chord === undefined) throw new Error("RECOVERY_CHORD_MISSING");
      chord.root.step = chord.root.step === "D" ? "E" : "D";
      delete envelope.checksum;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(envelope)));
      envelope.checksum = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
      replacements.push([key, JSON.stringify(envelope)]);
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("changes-recovery", 1);
      request.onerror = () => { reject(request.error ?? new Error("OPEN_FAILED")); };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("recovery-envelopes", "readwrite");
        for (const [key, bytes] of replacements) tx.objectStore("recovery-envelopes").put(bytes, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error ?? new Error("WRITE_FAILED")); };
      };
    });
  }, rows);
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

    test("checksum-valid semantic corruption offers the exact previous chart without overwriting either stored copy", async ({ page }, info) => {
      await retitle(page, "Previous semantic control");
      await retitle(page, "Invalid current semantic control");
      const previous = (await recoveryEntries(page)).find(([key]) => key.startsWith("changes.recovery.v1:") && key.endsWith(":previous"));
      if (previous === undefined) throw new Error("PREVIOUS_MISSING");
      const previousEnvelope = JSON.parse(previous[1]) as { document: unknown };
      await invalidateRecoveredChordSemantics(page, ["current"]);
      const before = await recoveryEntries(page);
      await page.reload();
      await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Previous recovery copy found");
      await expect(page.getByText(/current recovery copy did not pass document validation/u)).toContainText("import.candidate_semantic_invalid");
      await page.waitForTimeout(2_500);
      expect(await recoveryEntries(page)).toEqual(before);
      await page.reload();
      await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Previous recovery copy found");
      await page.locator("#studio-recovery-keep").click();
      await expect(page.locator("#studio-document-title")).toHaveValue("Previous semantic control");
      expect(await downloadJson(page)).toEqual(previousEnvelope.document);
      await info.attach("semantic-recovery-storage.json", { contentType: "application/json",
        body: JSON.stringify({ beforeKeep: before, afterKeep: await recoveryEntries(page) }, null, 2) });
    });

    test("two checksum-valid but semantically invalid copies produce a nonblocking diagnostic and preserve editing/export", async ({ page }) => {
      await retitle(page, "Invalid previous");
      await retitle(page, "Invalid current");
      await invalidateRecoveredChordSemantics(page, ["current", "previous"]);
      const before = await recoveryEntries(page);
      await page.reload();
      await expect(page.getByText(/Neither local recovery copy could be opened/u)).toContainText("import.candidate_semantic_invalid");
      await expect(page.locator("#studio-recovery-keep")).toHaveCount(0);
      await page.waitForTimeout(2_500);
      expect(await recoveryEntries(page)).toEqual(before);
      await retitle(page, "Editing after invalid recovery");
      expect(await downloadJson(page)).toMatchObject({ title: "Editing after invalid recovery" });
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

  test.describe(`U5 text export ${String(viewport.width)}px`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      await page.route("**/*", async route => {
        if (route.request().url() === artifact) await route.continue();
        else await route.abort("blockedbyclient");
      });
      await page.goto(artifact);
      await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    });

    test("real text download discloses losses, preserves exact chart values and keeps the older JSON marker", async ({ page }, info) => {
      await importCanonicalFile(page, "tests/fixtures/lifecycle-dialogs/text-export-document.json");
      const source = await downloadJson(page);
      if (typeof source !== "object" || source === null) throw new Error("SOURCE_DOCUMENT_MISSING");
      await retitle(page, "Text after JSON");
      await expect(page.getByText("Changed since export", { exact: true })).toBeVisible();
      const bindings = (await recoveryEntries(page)).filter(([key]) => key.startsWith("changes.recovery-export-binding.v1:"));
      expect(bindings).toHaveLength(1);
      await page.locator("#studio-export-text").click();
      const dialog = page.getByRole("dialog", { name: "Export chart as text" });
      await expect(dialog).toBeVisible();
      const losses = dialog.getByRole("region", { name: "Text export losses" });
      await expect(losses).toContainText("Exact Manual pitches and octaves: 1");
      await expect(losses).toContainText("Exact Frozen pitches, octaves, and generator metadata: 1");
      await expect(losses).toContainText("Section key overrides: 1");
      await expect(losses).toContainText("Original chord-symbol aliases (replaced by canonical spellings): 1");
      const pending = page.waitForEvent("download");
      await page.locator("#studio-lifecycle-download").click();
      const download = await pending;
      expect(download.suggestedFilename()).toBe("Text after JSON.changes.txt");
      const bytes = await readFile(await download.path(), "utf8");
      const literal = await readFile(join(process.cwd(), "tests/fixtures/lifecycle-dialogs/text-export-expected.txt"), "utf8");
      const expected = literal.slice(literal.indexOf("\n"));
      expect(bytes).toBe('@title "Text after JSON"' + expected);
      await info.attach("downloaded-chart.txt", { contentType: "text/plain", body: bytes });
      await expect(dialog.getByRole("status")).toContainText("Handed off to your browser");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await recoveryEntries(page)).filter(([key]) => key.startsWith("changes.recovery-export-binding.v1:"))).toEqual(bindings);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.locator("#studio-export-text")).toBeFocused();
      await expect(page.getByText("Changed since export", { exact: true })).toBeVisible();
      expect(await downloadJson(page)).toEqual({ ...source, title: "Text after JSON" });
      await page.locator("#studio-undo").click();
      await expect(page.locator("#studio-document-title")).toHaveValue('Text "round trip"');
    });

    test("Cancel and real URL allocation failure leave text undelivered and the marker untouched", async ({ page }) => {
      const downloads: string[] = [];
      page.on("download", download => downloads.push(download.suggestedFilename()));
      await page.locator("#studio-export-text").click();
      await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
      await page.keyboard.press("Escape");
      await expect(page.locator("#studio-export-text")).toBeFocused();
      expect(downloads).toEqual([]);
      await page.evaluate(() => {
        URL.createObjectURL = () => { throw new DOMException("Resource creation denied", "NotAllowedError"); };
      });
      await page.locator("#studio-export-text").click();
      await page.locator("#studio-lifecycle-download").click();
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText("export.delivery_activation_failed");
      await expect(page.getByText(/^Exported at revision /u)).toHaveCount(0);
      expect(downloads).toEqual([]);
      expect((await recoveryEntries(page)).filter(([key]) => key.startsWith("changes.recovery-export-binding.v1:"))).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.locator("#studio-export-text")).toBeFocused();
    });

    test("unsupported Custom harmony refuses at its exact path and JSON still preserves it", async ({ page }) => {
      await importCanonicalFile(page, "tests/fixtures/interchange/goldens/nested.changes.json");
      await page.locator("#studio-export-text").click();
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText("export.text.custom_chord_unsupported");
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText('["sections",0,"measures",1,"events",0,"chord"]');
      await expect(page.locator("#studio-lifecycle-download")).toBeDisabled();
      await page.keyboard.press("Escape");
      const expected: unknown = JSON.parse(await readFile(join(process.cwd(), "tests/fixtures/interchange/goldens/nested.changes.json"), "utf8"));
      expect(await downloadJson(page)).toEqual(expected);
    });
  });
}
