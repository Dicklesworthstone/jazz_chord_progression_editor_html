import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import type {
  A1BrowserReadResult,
  A1BrowserWriteResult,
  A1RecoveryBrowserHarness,
} from "../../src/test-support/a1-recovery-browser-harness";

/**
 * TR-A1-BROWSER-RELOAD: real-browser recovery reload evidence. The
 * production recovery service runs over real IndexedDB and localStorage in
 * the page; `page.reload()` in the same context proves genuine cross-load
 * recovery, corruption fallback, the localStorage fallback path, and the
 * visibility-change flush. Logged records carry revisions, hashes, and
 * adapter kinds — never chart text.
 */

const HARNESS_URL = "https://a1-recovery.evidence.localhost/";
const DOCUMENT_WIRE = "doc-a1-reload-evidence";

type HarnessWindow = Window &
  typeof globalThis & {
    __JCPE_A1_RECOVERY_EVIDENCE__?: A1RecoveryBrowserHarness;
  };

let harnessBundle = "";

test.beforeAll(() => {
  const directory = mkdtempSync(resolve(tmpdir(), "a1-recovery-"));
  const outputPath = resolve(directory, "a1-recovery-browser-harness.js");
  execFileSync("bun", ["scripts/bundle-a1-recovery-harness.ts", outputPath], {
    cwd: resolve(import.meta.dirname, "../.."),
    stdio: "pipe",
  });
  harnessBundle = readFileSync(outputPath, "utf8");
  if (harnessBundle.includes("</script")) {
    throw new Error("A1_RECOVERY_BUNDLE_INLINE_UNSAFE");
  }
});

async function openHarnessPage(page: Page): Promise<void> {
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    if (
      request.isNavigationRequest() &&
      request.method() === "GET" &&
      request.url() === HARNESS_URL
    ) {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: { "cache-control": "no-store" },
        body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><title>A1 recovery evidence</title></head><body><script>${harnessBundle}</script></body></html>`,
      });
    } else {
      await route.abort("blockedbyclient");
    }
  });
  const response = await page.goto(HARNESS_URL, { waitUntil: "load" });
  expect(response?.status()).toBe(200);
}

async function writePhase(
  page: Page,
  revision: number,
  useLocalStorageOnly = false,
): Promise<A1BrowserWriteResult> {
  return await page.evaluate(
    async ([wire, targetRevision, localOnly]) => {
      const scope = globalThis as HarnessWindow;
      const harness = scope.__JCPE_A1_RECOVERY_EVIDENCE__;
      if (harness === undefined) throw new Error("A1_HARNESS_MISSING");
      return await harness.writePhase(
        wire,
        targetRevision,
        localOnly,
      );
    },
    [DOCUMENT_WIRE, revision, useLocalStorageOnly] as const,
  );
}

async function readPhase(
  page: Page,
  sessionEdited: boolean,
  useLocalStorageOnly = false,
): Promise<A1BrowserReadResult> {
  return await page.evaluate(
    async ([wire, edited, localOnly]) => {
      const scope = globalThis as HarnessWindow;
      const harness = scope.__JCPE_A1_RECOVERY_EVIDENCE__;
      if (harness === undefined) throw new Error("A1_HARNESS_MISSING");
      return await harness.readPhase(
        wire,
        edited,
        localOnly,
      );
    },
    [DOCUMENT_WIRE, sessionEdited, useLocalStorageOnly] as const,
  );
}

test("recovery written before a reload is offered from real IndexedDB after it", async ({
  page,
}) => {
  await openHarnessPage(page);
  const written = await writePhase(page, 7);
  expect(written.adapter).toBe("indexeddb");
  expect(written.receipt?.outcome).toBe("written");
  expect(written.cleanRevision).toBe(7);

  await page.reload({ waitUntil: "load" });
  const report = await readPhase(page, false);
  expect(report.adapter).toBe("indexeddb");
  expect(report.disposition).toBe("open-current-automatically");
  expect(report.currentOutcome).toBe("valid");
  expect(report.currentRevision).toBe(7);

  const editedReport = await readPhase(page, true);
  expect(editedReport.disposition).toBe("offer-keep-discard");
});

test("a corrupt current envelope after reload offers the valid previous copy", async ({
  page,
}) => {
  await openHarnessPage(page);
  const written = await writePhase(page, 11);
  expect(written.receipt?.outcome).toBe("written");
  const corrupted = await page.evaluate(async (wire) => {
    const scope = globalThis as HarnessWindow;
    const harness = scope.__JCPE_A1_RECOVERY_EVIDENCE__;
    if (harness === undefined) throw new Error("A1_HARNESS_MISSING");
    return await harness.corruptCurrentPhase(wire);
  }, DOCUMENT_WIRE);
  expect(corrupted).toBe(true);

  await page.reload({ waitUntil: "load" });
  const report = await readPhase(page, false);
  expect(report.disposition).toBe("offer-previous");
  expect(report.currentOutcome).toBe("corrupt");
  expect(report.currentReasonCode).toBe("recovery.checksum_mismatch");
  expect(report.previousOutcome).toBe("valid");
  expect(report.previousRevision).toBe(11);
});

test("the bounded localStorage fallback also survives a reload", async ({
  page,
}) => {
  await openHarnessPage(page);
  const written = await writePhase(page, 5, true);
  expect(written.adapter).toBe("localstorage");
  expect(written.receipt?.outcome).toBe("written");

  await page.reload({ waitUntil: "load" });
  const report = await readPhase(page, false, true);
  expect(report.adapter).toBe("localstorage");
  expect(report.disposition).toBe("open-current-automatically");
  expect(report.currentRevision).toBe(5);
});

test("a visibility change flushes one best-effort write through the real event", async ({
  page,
}) => {
  await openHarnessPage(page);
  const flushed = await page.evaluate(
    async ([wire, revision]) => {
      const scope = globalThis as HarnessWindow;
      const harness = scope.__JCPE_A1_RECOVERY_EVIDENCE__;
      if (harness === undefined) throw new Error("A1_HARNESS_MISSING");
      return await harness.visibilityFlushPhase(
        wire,
        revision,
      );
    },
    [DOCUMENT_WIRE, 21] as const,
  );
  expect(flushed.receipt?.outcome).toBe("written");
  expect(flushed.cleanRevision).toBe(21);

  await page.reload({ waitUntil: "load" });
  const report = await readPhase(page, false);
  expect(report.currentRevision).toBe(21);
});
