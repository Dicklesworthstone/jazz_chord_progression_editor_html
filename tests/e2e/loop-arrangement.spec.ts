import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { LoopArrangementBrowserApi } from "./loop-arrangement-harness";

declare global { interface Window { __JCPE_LOOP__: LoopArrangementBrowserApi } }
const path = resolve(process.env["JCPE_LOOP_HARNESS"] ?? "test-results/loop-arrangement/index.html");
const html = readFileSync(path), sha256 = createHash("sha256").update(html).digest("hex");
test.use({ screenshot: "off" });
const userAgent = "OpenAI File Downloader, XaiImageApiFetch/1.0";
let server: Server, httpUrl: string;
test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.writeHead(request.url === "/" ? 200 : 404, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    response.end(request.url === "/" ? html : "");
  });
  await new Promise<void>(resolve => { server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing loopback address");
  httpUrl = `http://127.0.0.1:${String(address.port)}/`;
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); });
async function snapshot(page: Page) { return page.evaluate(() => window.__JCPE_LOOP__.snapshot()); }

for (const mode of ["file", "http"] as const) for (const width of [1280, 390]) test.describe(`${mode} ${String(width)}px band loop`, () => {
  test.use({ viewport: { width, height: 844 }, userAgent, contextOptions: { reducedMotion: "reduce" } });
  test("real studio repeats bass/comp, changes section/groove/instrument and stops all sources", async ({ page, context, browser }, info) => {
    test.setTimeout(60_000);
    const errors: string[] = [], pageErrors: string[] = [], requests: { url: string; allowed: boolean }[] = [];
    const stages: { name: string; snapshot: Awaited<ReturnType<typeof snapshot>> }[] = [];
    let completed = false;
    const url = mode === "file" ? pathToFileURL(path).href : httpUrl;
    page.on("console", message => { if (message.type() === "error" || message.type() === "warning") errors.push(message.text()); });
    page.on("pageerror", error => { pageErrors.push(error.message); });
    await context.route("**/*", async route => {
      const allowed = route.request().isNavigationRequest() && route.request().url() === url;
      requests.push({ url: route.request().url(), allowed });
      if (allowed) await route.continue(); else await route.abort();
    });
    const observe = async (name: string) => { const value = await snapshot(page); stages.push({ name, snapshot: value }); return value; };
    try {
      await page.goto(url); await expect(page.locator(".studio-chord-card")).toHaveCount(2);
      const before = await observe("boot");
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      await page.locator("#studio-transport-loop").click();
      await page.locator("#studio-transport-play").click();
      await expect.poll(() => page.evaluate(() => window.__JCPE_LOOP__.snapshot().view.transport.status)).toBe("playing");
      const started = await observe("play");
      const plan = started.bindings[0]?.plan; if (!plan) throw new Error("Missing actual plan handoff");
      expect(plan.loopTicks).toEqual({ start: 0, end: 7680 });
      expect(plan.events.some(event => event.midiPitches.length === 1)).toBe(true);
      expect(plan.events.some(event => event.midiPitches.length > 1 && event.durationTicks < 960)).toBe(true);
      const last = plan.events.at(-1); if (!last) throw new Error("Missing last arranged event");
      // Poll only the scalar being checked. Transferring the entire voice
      // history on every poll can consume seconds in the browser protocol
      // and delay the very control interaction this test needs to observe.
      await expect.poll(() => page.evaluate(eventId => {
        const value = window.__JCPE_LOOP__.snapshot();
        return new Set(value.audio.engine.debugEvents.filter(e => e.kind === "voice-attack" && e.eventId === eventId).map(e => e.scheduledTimeSeconds)).size;
      }, last.eventId), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
      const repeated = await observe("three-passes");
      for (const event of plan.events) {
        const attacks = repeated.audio.engine.debugEvents.filter(e => e.kind === "voice-attack" && e.eventId === event.eventId);
        const times = [...new Set(attacks.map(e => e.scheduledTimeSeconds))].sort((a, b) => Number(a) - Number(b));
        expect(times.length).toBeGreaterThanOrEqual(3);
        for (const time of times.slice(0, 3)) {
          expect(attacks.filter(e => e.scheduledTimeSeconds === time).map(e => e.midiPitch).sort((a, b) => Number(a) - Number(b)))
            .toEqual([...event.midiPitches].sort((a, b) => a - b));
          for (const midi of event.midiPitches) expect(repeated.starts.some(start =>
            Math.abs(start.when - Number(time)) < 0.001 && Math.abs(69 + 12 * Math.log2(start.frequency / 440) - midi) < 0.001)).toBe(true);
        }
        // X1's accepted lateStartMarginSeconds amendment can delay native
        // attacks without changing this exact plan or loop epoch. Raw native
        // timestamps remain attached; they are performance observations.
        expect((Number(plan.loopTicks?.end) - Number(plan.loopTicks?.start)) / 960 * 60 / plan.tempoBpm).toBe(2);
      }
      expect(repeated.view.revision).toBe(before.view.revision); expect(repeated.view.history).toEqual(before.view.history);
      await page.getByTestId("section-loop-loop-section-1").click();
      await expect.poll(() => page.evaluate(() => window.__JCPE_LOOP__.snapshot().audio.transport.loop?.start.numerator)).toBe(4);
      const section = await observe("section");
      const sectionPlan = section.bindings.at(-1)?.plan; if (!sectionPlan) throw new Error("Missing live section binding");
      expect(sectionPlan.events.every(e => e.sectionId === "loop-section-1")).toBe(true);
      expect(sectionPlan.events.length).toBeGreaterThan(2);
      // The persistent transport exposes compact settings under its existing
      // disclosure on narrow screens. Drive its real controls when visible.
      const settings = page.getByRole("button", { name: /Sound settings/ }).filter({ visible: true });
      if (!(await page.getByRole("combobox", { name: "Groove", exact: true }).filter({ visible: true }).count()) && await settings.count()) await settings.first().click();
      await page.getByRole("combobox", { name: "Groove", exact: true }).filter({ visible: true }).first().selectOption("bossa-nova@1");
      await expect.poll(() => page.evaluate(() => window.__JCPE_LOOP__.snapshot().bindings.at(-1)?.action)).toBe("groove");
      const groove = await observe("live-groove");
      const groovePlan = groove.bindings.at(-1)?.plan; if (!groovePlan) throw new Error("Missing groove binding");
      expect(groovePlan.loopTicks).toEqual(sectionPlan.loopTicks); expect(groovePlan.events).not.toEqual(sectionPlan.events);
      expect(groovePlan.events.some(e => e.midiPitches.length === 1)).toBe(true);
      await page.getByRole("combobox", { name: "Instrument", exact: true }).filter({ visible: true }).first().selectOption("vibraphone");
      await expect.poll(() => page.evaluate(() => window.__JCPE_LOOP__.snapshot().audio.transport.instrumentId)).toBe("vibraphone");
      const close = page.getByRole("button", { name: /^Close / }).filter({ visible: true }); if (await close.count()) await close.first().click();
      await page.locator("#studio-transport-stop").click();
      await expect.poll(() => page.evaluate(() => window.__JCPE_LOOP__.snapshot().outcomes.filter(o => o.action === "stop").length)).toBeGreaterThan(0);
      const stopped = await observe("stopped");
      const stop = [...stopped.outcomes].reverse().find(o => o.action === "stop")?.outcome;
      expect(stop?.termination).toBe("receipt"); if (stop?.termination === "receipt") expect(stop.noFutureAttackPostcondition).toBe(true);
      await page.waitForTimeout(350);
      const quiet = await observe("after-stop"); expect(quiet.starts.length).toBe(stopped.starts.length);
      expect(quiet.audio.engine.nonreleasingVoiceCount).toBe(0); expect(quiet.nativeContexts).toBe(1);
      await page.evaluate(() => window.__JCPE_LOOP__.dispose());
      const disposed = await observe("disposed");
      expect(disposed.audio.transport.state).toBe("disposed"); expect(disposed.audio.engine.contextState).toBe("closed");
      expect(disposed.audio.engine.retainedVoiceCount).toBe(0); expect(disposed.audio.engine.persistentEdgeCount).toBe(0);
      expect(disposed.audio.engine.registryIndexCounts.totalReferences).toBe(0); expect(disposed.nativeListeners).toBe(0);
      expect(disposed.outcomes.every(row => row.outcome.termination === "receipt")).toBe(true);
      expect(errors).toEqual([]); expect(pageErrors).toEqual([]); expect(requests.filter(r => !r.allowed)).toEqual([]);
      completed = true;
    } finally {
      // Success already records the fully asserted disposed snapshot. On a
      // failure retain a final observation where possible, and still attach
      // the preceding evidence if the browser/context has already stopped.
      if (!completed && !page.isClosed()) {
        try { await observe("final"); }
        catch (error) { errors.push(`Failure snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`); }
      }
      await info.attach("loop-arrangement-evidence", { body: JSON.stringify({ schema: "changes.loop-arrangement.native.v1", mode, width,
        sha256, sourceDigest: process.env["JCPE_LOOP_INPUT_DIGEST"], browser: browser.version(), node: process.version,
        retry: info.retry, errors, pageErrors, requests, stages }), contentType: "application/json" });
    }
  });
});
