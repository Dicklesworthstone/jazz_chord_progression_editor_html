import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSmfBytes } from "../support/midi-export-test-kit";

test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0" });

type AudioObservation = { starts: number; ended: number; nonzeroBuffers: number };
declare global {
  interface Window { continuityAudio: AudioObservation }
}

/** Independent exhaustive edit-path cost for four-note MIDI arrivals. */
function alignment(from: readonly number[], to: readonly number[]): readonly [number, number] {
  if (from.length === 0) return [12 * to.length, to.length];
  if (to.length === 0) return [12 * from.length, from.length];
  const match = alignment(from.slice(1), to.slice(1));
  const leave = alignment(from.slice(1), to);
  const enter = alignment(from, to.slice(1));
  const choices: [number, number][] = [
    [match[0] + Math.abs((from[0] ?? -128) - (to[0] ?? 128)), match[1]],
    [leave[0] + 12, leave[1] + 1], [enter[0] + 12, enter[1] + 1],
  ];
  choices.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const best = choices[0];
  if (!best) throw new Error("Missing MIDI alignment");
  return best;
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`Deacon Blues really plays, stops and downloads continuous MIDI at ${String(viewport.width)}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", (request) => requests.push(request.url()));
    await page.addInitScript(() => {
      const observation: AudioObservation = { starts: 0, ended: 0, nonzeroBuffers: 0 };
      window.continuityAudio = observation;
      const start: unknown = Object.getOwnPropertyDescriptor(AudioBufferSourceNode.prototype, "start")?.value;
      if (typeof start !== "function") throw new Error("Native buffer-source start is unavailable");
      AudioBufferSourceNode.prototype.start = function (...args) {
        observation.starts += 1;
        this.addEventListener("ended", () => { observation.ended += 1; }, { once: true });
        const buffer = this.buffer;
        if (buffer !== null) {
          const samples = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i += Math.max(1, Math.floor(samples.length / 1024))) {
            if (Math.abs(samples[i] ?? 0) > 0.00001) { observation.nonzeroBuffers += 1; break; }
          }
        }
        Reflect.apply(start, this, args);
      };
    });
    const artifact = resolve("jazz_chord_progression_editor.html");
    // WebKit's transport-offline flag blocks file navigation itself. Block
    // every network request explicitly while allowing the local main file.
    await page.route(/^https?:/u, (route) => route.abort("internetdisconnected"));
    await page.goto(`file://${artifact}`);
    await expect(page.locator("main")).toBeVisible();
    const tour = page.getByRole("button", { name: "Close the tour", exact: true });
    if (await tour.isVisible()) await tour.click();
    await page.locator("#studio-transport-play").click();
    await expect(page.locator("#transport-bar")).toHaveAttribute("data-audio-state", "playing", { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => window.continuityAudio.nonzeroBuffers)).toBeGreaterThan(0);
    await page.locator("#studio-transport-stop").click();
    await expect(page.locator("#transport-bar")).toHaveAttribute("data-audio-state", "ready", { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => {
      const audio = window.continuityAudio;
      return audio.starts - audio.ended;
    }), { timeout: 10_000 }).toBe(0);
    await page.getByRole("button", { name: "Export MIDI", exact: true }).click();
    const generate = page.getByRole("button", { name: "Generate the MIDI file", exact: true });
    if (await generate.count() > 0) await generate.first().click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download/i }).first().click();
    const download = await downloading;
    const path = testInfo.outputPath("deacon-blues.mid");
    await download.saveAs(path);
    const bytes = await readFile(path);
    const parsed = parseSmfBytes(bytes);
    const byTick = new Map<number, number[]>();
    for (const track of parsed.tracks) for (const event of track) {
      if (event["kind"] !== "on") continue;
      const tick = event["tick"];
      const note = event["note"];
      if (typeof tick !== "number" || typeof note !== "number") throw new Error("Invalid note");
      const notes = byTick.get(tick) ?? [];
      notes.push(note); byTick.set(tick, notes);
    }
    const notes = [...byTick.entries()].sort(([a], [b]) => a - b).map(([tick, pitches]) => ({ tick, pitches: pitches.sort((a, b) => a - b) }));
    expect(notes.map((event) => event.tick)).toEqual([0,1920,3840,5760,7680,9600,11520,13440,15360,19200]);
    const allowed = [[0,4,7,11],[11,2,7,9],[10,2,5,9],[9,0,5,7],[2,6,9,1],[1,4,9,11],
      [0,4,7,11],[11,2,7,9],[3,7,10,2],[4,8,11,2,7]];
    let cost = 0;
    let gaps = 0;
    notes.forEach((event, index) => {
      expect(event.pitches).toHaveLength(4);
      for (const note of event.pitches) expect(allowed[index]).toContain(note % 12);
      const previous = notes[index - 1];
      if (previous) { const edge = alignment(previous.pitches, event.pitches); cost += edge[0]; gaps += edge[1]; }
    });
    expect(gaps).toBe(0);
    expect(cost).toBeLessThanOrEqual(60); // nine changes, against the old 201 / 14-gap failure
    expect(errors).toEqual([]);
    expect(requests.filter((url) => /^https?:/u.test(url))).toEqual([]);
    const audio = await page.evaluate(() => window.continuityAudio);
    await testInfo.attach("voice-leading-evidence", { contentType: "application/json", body: JSON.stringify({
      viewport, browser: testInfo.project.name, artifactSha256: createHash("sha256").update(await readFile(artifact)).digest("hex"),
      midiSha256: createHash("sha256").update(bytes).digest("hex"), notes, cost, gaps, audio, requests, errors,
    }, null, 2) });
  });
}
