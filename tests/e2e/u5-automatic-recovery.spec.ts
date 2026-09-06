import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { encodeShareFragment } from "../../src/application/studio-share";

declare global { interface Window {
  u5StartupAudioContexts?: number;
  u5ReleaseRecoveryProbe?: () => void;
} }

test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });
const artifact = pathToFileURL(join(process.cwd(), "jazz_chord_progression_editor.html")).href;
const artifactSha256 = createHash("sha256").update(readFileSync(new URL(artifact))).digest("hex");
const fixture = join(process.cwd(), "tests/fixtures/interchange/goldens/nested.changes.json");
const expectedDocument: unknown = JSON.parse(readFileSync(fixture, "utf8"));
const diagnostics = new WeakMap<Page, { errors: string[]; requests: string[] }>();

test.beforeEach(async ({ page }) => {
  const observed = { errors: [] as string[], requests: [] as string[] };
  diagnostics.set(page, observed);
  page.on("pageerror", error => observed.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") observed.errors.push(message.text()); });
  page.on("request", request => observed.requests.push(request.url().startsWith("data:") ? "data:embedded" : request.url()));
  await page.route("**/*", async route => {
    if (route.request().url().split("#")[0] === artifact) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    window.u5StartupAudioContexts = 0;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        window.u5StartupAudioContexts = (window.u5StartupAudioContexts ?? 0) + 1;
      }
    };
  });
  await page.goto(artifact);
  await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
});

test.afterEach(async ({ page, browser }, info) => {
  const observed = diagnostics.get(page);
  if (observed === undefined) throw new Error("DIAGNOSTICS_MISSING");
  const audioContexts = await page.evaluate(() => window.u5StartupAudioContexts);
  await info.attach("automatic-recovery.json", { contentType: "application/json", body: JSON.stringify({
    artifactSha256, browserVersion: browser.version(), viewport: page.viewportSize(), audioContexts, ...observed,
  }, null, 2) });
  expect(audioContexts).toBe(0);
  expect(observed.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function stored(page: Page): Promise<[string, string][]> {
  return page.evaluate(async () => new Promise<[string, string][]>((resolve, reject) => {
    const request = indexedDB.open("changes-recovery", 1);
    request.onerror = () => { reject(request.error ?? new Error("OPEN_FAILED")); };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("recovery-envelopes", "readonly");
      const cursor = tx.objectStore("recovery-envelopes").openCursor();
      const entries: [string, string][] = [];
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (row === null) return;
        if (typeof row.key === "string" && typeof row.value === "string") entries.push([row.key, row.value]);
        row.continue();
      };
      tx.oncomplete = () => { db.close(); resolve(entries); };
      tx.onerror = () => { db.close(); reject(tx.error ?? new Error("READ_FAILED")); };
    };
  }));
}

async function prepareRecovery(page: Page): Promise<void> {
  await page.locator("#studio-import-chart").click();
  await page.locator("#studio-import-file").setInputFiles(fixture);
  await expect(page.locator("#studio-import-commit")).toBeEnabled();
  await page.locator("#studio-import-commit").click();
  await page.locator("#studio-import-confirm").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
}

async function exportDocument(page: Page): Promise<unknown> {
  await page.locator("#studio-export-json").click();
  await expect(page.locator("#studio-lifecycle-download")).toBeEnabled();
  const pending = page.waitForEvent("download");
  await page.locator("#studio-lifecycle-download").click();
  const download = await pending;
  const result: unknown = JSON.parse(await readFile(await download.path(), "utf8"));
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Handed off to your browser");
  await page.keyboard.press("Escape");
  return result;
}

async function expectAutomatic(page: Page): Promise<void> {
  await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Recovered chart opened");
  await expect(page.locator("#studio-document-title")).toHaveValue("Nested Canonical Order");
  await expect(page.locator("#studio-recovery-keep")).toHaveCount(0);
  await expect(page.locator("#studio-recovery-new")).toBeVisible();
  await expect(page.locator("#studio-recovery-discard")).toHaveText("Discard local copy");
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`U5 automatic recovery ${String(viewport.width)}px`, () => {
    test.use({ viewport });

    test("current opens exactly without audio; failed Discard preserves bytes and retry survives reload", async ({ page }, info) => {
      await prepareRecovery(page);
      await page.reload(); await expectAutomatic(page);
      expect(await exportDocument(page)).toEqual(expectedDocument);
      await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
      const before = await stored(page);
      await page.evaluate(() => {
        const nativeDelete = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, "delete");
        if (nativeDelete === undefined) throw new Error("DELETE_DESCRIPTOR_MISSING");
        IDBObjectStore.prototype.delete = function () {
          Object.defineProperty(IDBObjectStore.prototype, "delete", nativeDelete);
          throw new DOMException("Native deletion failure control", "NotAllowedError");
        };
      });
      await page.locator("#studio-recovery-discard").click();
      await expect(page.getByRole("alert")).toContainText("could not be discarded");
      expect(await stored(page)).toEqual(before);
      await expectAutomatic(page);
      await page.locator("#studio-recovery-discard").click();
      await expect(page.locator("#studio-recovery-discard")).toHaveCount(0);
      expect(await exportDocument(page)).toEqual(expectedDocument);
      await page.waitForTimeout(2_500);
      expect((await stored(page)).filter(([key]) => key.startsWith("changes.recovery.v1:"))).toEqual([]);
      await info.attach("discard-storage.json", { contentType: "application/json", body: JSON.stringify({ before, after: await stored(page) }) });
      await page.reload();
      await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
      await expect(page.locator("#studio-recovery-notice-title")).toHaveCount(0);
    });

    test("automatic New uses confirmation, restores Cancel focus, and preserves exact Undo", async ({ page }) => {
      await prepareRecovery(page); await page.reload(); await expectAutomatic(page);
      await page.locator("#studio-recovery-new").click();
      await expect(page.getByRole("dialog", { name: "Start a new chart?" })).toBeVisible();
      await page.locator("#studio-replacement-cancel").click();
      await expect(page.locator("#studio-recovery-new")).toBeFocused();
      expect(await exportDocument(page)).toEqual(expectedDocument);
      // Export made this revision clean. Make two real edits that restore the
      // literal chart but leave a newer, unexported revision needing consent.
      await page.locator("#studio-document-title").fill("New confirmation control");
      await page.locator("#studio-document-title").press("Enter");
      await page.locator("#studio-document-title").fill("Nested Canonical Order");
      await page.locator("#studio-document-title").press("Enter");
      await page.locator("#studio-recovery-new").click();
      await page.locator("#studio-replacement-confirm").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator("#studio-recovery-notice-title")).toHaveCount(0);
      await expect(page.locator("#studio-document-title")).toHaveValue("Untitled Chart");
      await page.locator("#studio-undo").click();
      expect(await exportDocument(page)).toEqual(expectedDocument);
    });

    for (const draftKind of ["quick-entry", "title"] as const) test(`an actual pending IndexedDB open preserves a ${draftKind} draft`, async ({ page }, info) => {
      await prepareRecovery(page);
      const before = await stored(page);
      await page.addInitScript(() => {
        const nativeOpen = indexedDB.open.bind(indexedDB);
        const descriptor = Object.getOwnPropertyDescriptor(IDBFactory.prototype, "open");
        if (descriptor === undefined) throw new Error("OPEN_DESCRIPTOR_MISSING");
        IDBFactory.prototype.open = function (name, version) {
          const request = version === undefined ? nativeOpen(name) : nativeOpen(name, version);
          if (name === "changes-recovery") {
            Object.defineProperty(IDBFactory.prototype, "open", descriptor);
            // Delay only delivery of the real browser's success event. The
            // request, database, reads and stored envelopes remain native.
            request.addEventListener("success", event => {
              event.stopImmediatePropagation();
              window.u5ReleaseRecoveryProbe = () => { request.onsuccess?.call(request, event); };
            }, { once: true });
          }
          return request;
        };
      });
      await page.reload();
      await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => typeof window.u5ReleaseRecoveryProbe)).toBe("function");
      await expect(page.locator("#studio-document-title")).toHaveValue("Untitled Chart");
      const draft = page.locator(draftKind === "title" ? "#studio-document-title" : "#studio-quick-entry-field");
      if (!await draft.isVisible()) await page.locator("#studio-open-library-sheet").click();
      await draft.fill("Dm7 G7");
      await page.evaluate(() => window.u5ReleaseRecoveryProbe?.());
      await expect(page.locator("#studio-recovery-keep")).toBeAttached();
      await expect(draft).toHaveValue("Dm7 G7");
      if (await page.getByRole("dialog").count() > 0) await page.keyboard.press("Escape");
      await expect(page.locator("#studio-document-title")).toHaveValue(draftKind === "title" ? "Dm7 G7" : "Untitled Chart");
      await page.waitForTimeout(2_500);
      expect(await stored(page)).toEqual(before);
      await info.attach("pending-probe-storage.json", { contentType: "application/json", body: JSON.stringify(before) });
    });

    test("an explicit shared chart keeps priority over valid current recovery", async ({ page }) => {
      await prepareRecovery(page);
      const before = await stored(page);
      const shared = encodeShareFragment({ chartText: "| Dm7:2/1 G7:2/1 | Cmaj7:4/1 |",
        grooveStyleId: "straight-eighths@1", tempoBpm: 140, title: "Explicit shared chart" });
      if (!shared.ok) throw new Error(shared.message);
      await page.goto(`${artifact}${shared.value}`); await page.reload();
      await expect(page.locator("#studio-recovery-keep")).toBeVisible();
      await expect(page.locator("#studio-document-title")).toHaveValue("Explicit shared chart");
      expect(await stored(page)).toEqual(before);
      await page.locator("#studio-recovery-keep").click();
      expect(await exportDocument(page)).toEqual(expectedDocument);
    });
  });
}
