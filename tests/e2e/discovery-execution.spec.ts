import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DiscoveryBrowserApi } from "./discovery-execution-harness";

declare global { interface Window { __JCPE_DISCOVERY__: DiscoveryBrowserApi } }
const runId = process.env["JCPE_DISCOVERY_RUN_ID"];
if (runId === undefined || !/^[a-z0-9-]{8,64}$/u.test(runId)) throw new Error("Missing discovery evidence run");
const directory = resolve(import.meta.dirname, "../../test-results/discovery-execution-runs", runId);
const code = await readFile(resolve(directory, "harness.js"), "utf8");
const bundleSha256 = createHash("sha256").update(code).digest("hex");
if (bundleSha256 !== process.env["JCPE_DISCOVERY_BUNDLE_SHA256"]) throw new Error("Discovery harness bytes changed");
const style = "body{margin:0;background:#101820;color:#eef3f5;font:18px system-ui}main{max-width:920px;margin:auto;padding:20px}label{display:block;margin:12px 0}input,button{font:inherit;min-height:44px;box-sizing:border-box}input:not([type=checkbox]){display:block;width:100%;max-width:500px}button{padding:8px 14px}.controls{display:flex;flex-wrap:wrap;gap:8px}output{display:block;padding:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:28px}";
const hash = (text: string): string => createHash("sha256").update(text).digest("base64");
// Match the production build's embedded-WASM permission; JavaScript eval and
// remote scripts remain forbidden. The actual audio module contains WASM.
// Playwright 1.61.1 synchronizes WebKit screenshots by inserting exactly
// "body {}" (coreBundle.js/inPagePrepareForScreenshots). Authorize that inert
// rule by its exact hash in THIS harness only; no console errors are filtered.
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash(code)}' 'wasm-unsafe-eval'; style-src 'sha256-${hash(style)}' 'sha256-${hash("body {}")}' ; style-src-attr 'none'; img-src data:; connect-src 'none'"><link rel="icon" href="data:,"><title>Discovery execution proof</title><style>${style}</style></head><body><script>${code}</script></body></html>`;
const url = "https://discovery.evidence.localhost/";
const agent = "OpenAI File Downloader, XaiImageApiFetch/1.0";
type Snapshot = ReturnType<DiscoveryBrowserApi["snapshot"]>;
const snapshot = async (page: Page): Promise<Snapshot> => await page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot());
const scenarios = ["apply-undo", "edit-during-search", "stop-during-search", "edit-during-retirement", "stop-during-retirement"] as const;

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  for (const scenario of scenarios) {
    test(`${String(viewport.width)} ${scenario}`, async ({ page, browser, browserName }, info) => {
      await page.setViewportSize(viewport);
      const requests: { method: string; url: string; userAgent: string | undefined }[] = [];
      const consoleMessages: { type: string; text: string }[] = [], pageErrors: string[] = [];
      const observations: { phase: string; actual: Snapshot }[] = [];
      page.on("request", request => requests.push({ method: request.method(), url: request.url(), userAgent: request.headers()["user-agent"] }));
      page.on("console", message => consoleMessages.push({ type: message.type(), text: message.text() }));
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.route("**/*", async route => {
        if (route.request().url() !== url) { await route.abort("blockedbyclient"); return; }
        await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      });
      const observe = async (phase: string): Promise<Snapshot> => {
        const actual = await snapshot(page); observations.push({ phase, actual }); return actual;
      };
      const retired = async (): Promise<void> => {
        await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().audio.engine.progressionNonreleasingVoiceCount)).toBe(0);
        await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().audio.engine.previewNonreleasingVoiceCount)).toBe(0);
      };
      let booted = false;
      try {
        await page.goto(url);
        await expect(page.getByRole("heading", { name: "Discovery execution proof" })).toBeVisible(); booted = true;
        const before = await observe("before");
        expect(before.revision).toBe(5); expect(before.historyEntries).toBe(2);
        await page.getByRole("button", { name: "Play & preview", exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().audio.engine.previewNonreleasingVoiceCount)).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().audio.engine.progressionNonreleasingVoiceCount)).toBeGreaterThan(0);
        const playing = await observe("playing");
        expect(playing.native.contexts).toBe(1); expect(playing.errors).toEqual([]);

        if (scenario === "edit-during-search" || scenario === "stop-during-search") {
          await page.getByRole("button", { name: "Long search", exact: true }).click();
          await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().job.status)).toBe("running");
          // Running precedes the first MessageChannel turn. Exercise input
          // during actual search work, not the startup scheduling interval.
          await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().expansions)).toBeGreaterThan(0);
          await page.getByLabel("Scratch note", { exact: true }).fill("Input remains responsive");
          const busy = await observe("busy");
          expect(busy.inputWhileBusy).toBe(true); expect(busy.expansions).toBeGreaterThan(0);
          expect(busy.expansions).toBeLessThan(16384); expect(busy.native.messagePorts).toBe(2);
          if (scenario === "edit-during-search") {
            await page.getByLabel("Chart title", { exact: true }).fill("An edit during discovery");
            await page.getByRole("button", { name: "Edit title", exact: true }).click();
          } else await page.getByRole("button", { name: "Stop", exact: true }).click();
          // Poll the unchanged predicate in one browser turn. Transferring two
          // multi-megabyte journals exhausted the polling deadline even when
          // both snapshots already said stale/finished. Named observations
          // below still retain the complete journal and all evidence fields.
          await expect.poll(() => page.evaluate(() => {
            const current = window.__JCPE_DISCOVERY__.snapshot();
            return current.startResult?.ok === true && current.job.status === "finished";
          })).toBe(true);
          const ended = await observe("search-ended");
          expect(ended.startResult?.ok && ended.startResult.result.kind).toBe(scenario === "edit-during-search" ? "stale" : "cancelled");
          expect(ended.expansions).toBeLessThan(16384);
          expect(ended.revision).toBe(scenario === "edit-during-search" ? 6 : 5);
          expect(ended.historyEntries).toBe(scenario === "edit-during-search" ? 3 : 2);
          if (scenario === "edit-during-search") {
            expect(ended.document.title).toBe("An edit during discovery");
            await page.getByRole("button", { name: "Stop", exact: true }).click();
          } else expect(ended.documentBytes).toBe(before.documentBytes);
        } else {
          if (scenario !== "apply-undo") await page.getByLabel("Hold Apply after real Stop", { exact: true }).check();
          await page.getByRole("button", { name: "Find option", exact: true }).click();
          await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().job.status)).toBe("ready");
          const ready = await observe("ready");
          expect(ready.expansions).toBe(3); expect(ready.startResult?.ok && ready.startResult.result.kind).toBe("complete");
          expect(ready.documentBytes).toBe(before.documentBytes); expect(ready.historyEntries).toBe(2);
          await page.getByRole("button", { name: "Apply option", exact: true }).click();
          if (scenario !== "apply-undo") {
            await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().native.retirementHeld)).toBe(true);
            await retired();
            const held = await observe("retirement-held");
            expect(held.job.publicationAttempts).toBe(1); expect(held.job.retainedBytes).toBeGreaterThan(0);
            expect(held.documentBytes).toBe(before.documentBytes);
            if (scenario === "edit-during-retirement") {
              await page.getByLabel("Chart title", { exact: true }).fill("A newer edit wins");
              await page.getByRole("button", { name: "Edit title", exact: true }).click();
            } else {
              await page.getByRole("button", { name: "Stop", exact: true }).click();
              const cancelled = await observe("cancelled-with-owned-retirement");
              expect(cancelled.job.publicationAttempts).toBe(1); expect(cancelled.job.retainedBytes).toBeGreaterThan(0);
            }
            await page.getByRole("button", { name: "Continue Apply", exact: true }).click();
          }
          await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().applyResult?.kind)).toBe(
            scenario === "apply-undo" ? "committed" : scenario === "edit-during-retirement" ? "stale" : "cancelled");
          const applied = await observe("apply-ended");
          expect(applied.revision).toBe(scenario === "stop-during-retirement" ? 5 : 6);
          expect(applied.historyEntries).toBe(scenario === "stop-during-retirement" ? 2 : 3);
          if (scenario === "apply-undo") {
            expect(applied.document.sections.flatMap(section => section.measures.flatMap(measure => measure.events))
              .find(event => event.id === "share-event-frozen")?.annotation).toBe("Keep the written line.");
            await page.getByRole("button", { name: "Undo", exact: true }).click();
            const undone = await observe("undone");
            expect(undone.documentBytes).toBe(before.documentBytes); expect(undone.revision).toBe(7); expect(undone.historyEntries).toBe(2);
          } else if (scenario === "edit-during-retirement") expect(applied.document.title).toBe("A newer edit wins");
          else expect(applied.documentBytes).toBe(before.documentBytes);
        }
        await retired();
        const final = await observe("final");
        expect(final.recovery).toEqual(before.recovery); expect(final.exportRevision).toBe(4);
        expect(final.pendingRequests).toEqual([]); expect(final.job.retainedBytes).toBe(0);
        expect(final.job.publicationAttempts).toBe(0); expect(final.job.scheduledCallbacks).toBe(0);
        expect(final.native.messagePorts).toBe(0); expect(final.native.messageHandlers).toBe(0);
        expect(final.native.postedMessages).toBeGreaterThan(0); expect(final.native.deliveredMessages).toBeGreaterThan(0);
        expect(final.errors).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        // Keep the real caret; no additional hiding stylesheet is authorized.
        await page.screenshot({ path: info.outputPath("scenario.png"), fullPage: true, caret: "initial" });
      } finally {
        if (booted) {
          await page.evaluate(async () => { await window.__JCPE_DISCOVERY__.dispose(); });
          await expect.poll(() => page.evaluate(() => window.__JCPE_DISCOVERY__.snapshot().job.publicationAttempts)).toBe(0);
          const cleaned = await observe("disposed");
          await writeFile(info.outputPath("observations.json"), JSON.stringify({ schema: "changes.evidence.discovery-native.v1",
            runId, scenario, viewport, browserName, browserVersion: browser.version(), nodeVersion: process.version,
            bundleSha256, inputDigest: process.env["JCPE_DISCOVERY_INPUT_DIGEST"], retry: info.retry,
            requests, consoleMessages, pageErrors, observations }, null, 2) + "\n");
          expect(cleaned.errors).toEqual([]); expect(cleaned.audio.transport.state).toBe("disposed");
          expect(cleaned.native.contextListeners).toBe(0); expect(cleaned.native.intervals).toBe(0);
          expect(cleaned.native.uiListeners).toBe(0); expect(cleaned.native.messagePorts).toBe(0);
          expect(cleaned.job.listeners).toBe(0); expect(cleaned.job.retainedBytes).toBe(0);
          expect(cleaned.audio.engine.retainedVoiceCount).toBe(0);
          expect(cleaned.audio.engine.contextState).toBe("closed");
          expect(cleaned.audio.engine.persistentEdgeCount).toBe(0);
          expect(cleaned.audio.engine.registryIndexCounts.totalReferences).toBe(0);
          expect(pageErrors).toEqual([]);
          expect(consoleMessages.filter(message => message.type === "warning" || message.type === "error")).toEqual([]);
          expect(requests).toEqual([{ method: "GET", url, userAgent: agent }]);
        }
      }
    });
  }
}
