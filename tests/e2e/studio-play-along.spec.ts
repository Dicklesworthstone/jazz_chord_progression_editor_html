import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { observeNativeSources } from "../support/u5-native-audio";
const path = resolve(process.env["JCPE_FOCUS_ARTIFACT"] ?? "jazz_chord_progression_editor.html");
const url = pathToFileURL(path).href;
const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
declare global { interface Window {
  playAlongObserved?: {status:string;current:string;next:string;started:number}[];
  stopPlayAlongObserver?: () => void;
  playAlongMasterPeak?: () => number;
} }
// Observe actual destination PCM for worklet-backed instruments, which do
// not create AudioScheduledSourceNodes. The native graph remains connected.
async function observeMasterOutput(page: Page) {
  await page.evaluate(() => {
    const method: unknown = Reflect.get(AudioNode.prototype, "connect");
    if (typeof method !== "function") throw new Error("NATIVE_CONNECT_MISSING");
    const original = method;
    const taps = new Map<BaseAudioContext, AnalyserNode>();
    function connect(this: AudioNode, target: AudioNode, output?: number, input?: number): AudioNode;
    function connect(this: AudioNode, target: AudioParam, output?: number): void;
    function connect(this: AudioNode, target: AudioNode | AudioParam, output?: number, input?: number): AudioNode | void {
      if (target instanceof AudioDestinationNode) {
        let tap = taps.get(this.context);
        if (tap === undefined) {
          tap = this.context.createAnalyser();
          tap.fftSize = 2048;
          Reflect.apply(original, tap, [target]);
          taps.set(this.context, tap);
        }
        Reflect.apply(original, this, [tap, output ?? 0, input ?? 0]);
        return target;
      }
      Reflect.apply(original, this, target instanceof AudioNode ? [target, output ?? 0, input ?? 0] : [target, output ?? 0]);
      if (target instanceof AudioNode) return target;
    }
    AudioNode.prototype.connect = connect;
    const samples = new Float32Array(2048);
    window.playAlongMasterPeak = () => {
      let peak = 0;
      for (const tap of taps.values()) {
        tap.getFloatTimeDomainData(samples);
        for (const value of samples) peak = Math.max(peak, Math.abs(value));
      }
      return peak;
    };
  });
}

test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
for (const width of [320,1280]) test(`play along through real audio at ${String(width)}px`,async ({page,browser},info) => {
  await page.setViewportSize({width,height:800});
  const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  await page.route("**/*",async route=>{
    const allowed=route.request().isNavigationRequest() && route.request().url()===url;
    requests.push({url:route.request().url(),allowed});
    if(allowed)await route.continue();else await route.abort();
  });
  try {
    await page.goto(url);
    await expect(page.locator(".studio-demo-banner")).toBeVisible();
    // This observer checks native scheduled sources, so choose its actual
    // oscillator instrument explicitly before freezing document authority.
    if (width === 320) await page.locator("#studio-open-sound-sheet").click();
    await page.getByRole("combobox", { name: "Instrument", exact: true }).filter({ visible: true }).selectOption("analog-poly");
    if (width === 320) await page.keyboard.press("Escape");
    await observeNativeSources(page);
    const revision=await page.locator(".studio-document-status__revision").textContent();
    await page.locator("#studio-chart-focus-toggle").focus();await page.keyboard.press("Enter");
    await page.getByRole("button",{name:"Follow playback",exact:true}).click();
    const display=page.getByRole("region",{name:"Play-along display"});
    await expect(display).toBeVisible();
    await expect(display).toContainText("Press Play");
    // Observe transitions in-page before Play. Driver round trips must not miss
    // a valid sub-second label while waiting for a native-source observation.
    await display.evaluate(element => {
      const rows: NonNullable<Window["playAlongObserved"]> = [];
      window.playAlongObserved = rows;
      const observe = (): void => {
        const row = {status:element.querySelector(".studio-play-along__heading p")?.textContent ?? "",
          current:element.querySelector(".studio-play-along__current")?.textContent ?? "",
          next:element.querySelector(".studio-play-along__next")?.textContent ?? "",
          started:window.u5NativeSourceCounts?.().started ?? 0};
        const prior = rows.at(-1);
        if (rows.length < 256 && (prior?.status !== row.status || prior.current !== row.current || prior.next !== row.next || (prior.started === 0 && row.started > 0))) rows.push(row);
      };
      const observer = new MutationObserver(observe);
      observer.observe(element,{childList:true,subtree:true,characterData:true});
      window.stopPlayAlongObserver = () => { observer.disconnect(); };
      observe();
    });
    await page.locator("#studio-transport-play").click();
    await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started ?? 0)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => {
      const rows = (window.playAlongObserved ?? []).filter(row => row.status === "Play along" && row.started > 0);
      const opening = rows.findIndex(row => row.current === "Cmaj7" && row.next === "Next: Bm7#5");
      const arriving = rows.findIndex((row,index) => index > opening && row.current === "Bm7#5");
      return opening >= 0 && arriving > opening;
    })).toBe(true);
    await page.locator("#studio-transport-pause").click();
    await expect(display).toContainText("Paused");
    await expect(display).toContainText("Chart beat");
    expect(await page.locator(".studio-document-status__revision").textContent()).toBe(revision);
    expect(await display.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    await display.getByRole("button",{name:"Stop",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().futureAttacks ?? -1)).toBe(0);
    await display.getByRole("button",{name:"Exit Focus",exact:true}).focus();await page.keyboard.press("Enter");
    await expect(display).toHaveCount(0);
    await expect(page.locator("#studio-chart-focus-toggle")).toBeFocused();
    expect(errors).toEqual([]);expect(requests.every(request=>request.allowed)).toBe(true);
  } finally {
    const observed = await page.evaluate(() => { window.stopPlayAlongObserver?.(); return window.playAlongObserved ?? []; });
    await info.attach("play-along-evidence",{body:JSON.stringify({sha256,browser:browser.version(),width,errors,requests,observed}),contentType:"application/json"});
  }
});


for (const { width, touch } of [{ width: 320, touch: false }, { width: 320, touch: true }, { width: 1280, touch: false }]) {
  test.describe(`starting cues with ${touch ? "touch" : "pointer"}`, () => {
    test.use({ hasTouch: touch });
    test(`stopped seek updates the starting cue at ${String(width)}px`, async ({ page, browser, browserName }, info) => {
  const errors: string[] = [], requests: string[] = [];
  const cues: unknown[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", async route => {
    if (route.request().isNavigationRequest() && route.request().url() === url) await route.continue();
    else { requests.push(route.request().url()); await route.abort(); }
  });
  try {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 800 });
    await page.goto(url);
    await expect(page.locator(".studio-demo-banner")).toBeVisible();
    await expect(page.locator("#studio-transport-play")).toBeEnabled();
    await observeNativeSources(page);
    await observeMasterOutput(page);
    const revision = await page.locator(".studio-document-status__revision").textContent();
    await page.locator("#studio-chart-focus-toggle").click();
    await page.getByRole("button", { name: "Follow playback", exact: true }).click();
    const display = page.getByRole("region", { name: "Play-along display" });
    const geometry = await page.locator("#transport-bar").evaluate(transport => {
      const bounds = transport.getBoundingClientRect();
      const controls = [...transport.querySelectorAll<HTMLElement>("button, [role=slider]")]
        .filter(element => element.getClientRects().length > 0)
        .map(element => {
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return { id: element.id, x: box.x, y: box.y, width: box.width, height: box.height,
            inside: box.top >= bounds.top && box.bottom <= bounds.bottom && box.left >= 0 && box.right <= innerWidth,
            receivesPointer: hit !== null && (hit === element || element.contains(hit)) };
        });
      return { transport: { top: bounds.top, height: bounds.height }, controls };
    });
    cues.push({ geometry });
    expect(geometry.controls.length).toBeGreaterThan(4);
    expect(geometry.controls.filter(control => control.id !== "studio-transport-scrub").every(control => control.inside && control.receivesPointer)).toBe(true);
    expect(geometry.controls.every(control => control.receivesPointer)).toBe(true);
    if (touch) expect(geometry.controls.every(control => control.width >= 44 && control.height >= 44)).toBe(true);
    // The compact Focus footer must retain its full settings via the sheet.
    await page.locator("#studio-open-sound-sheet").click();
    await expect(page.locator("#studio-transport-instrument-sheet")).toBeVisible();
    await expect(page.locator("#studio-transport-mute-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#studio-open-sound-sheet")).toBeFocused();
    await page.locator("#studio-transport-play").click();
    await expect.poll(() => page.evaluate(() => window.playAlongMasterPeak?.() ?? 0)).toBeGreaterThan(0.005);
    await display.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.locator("#transport-bar")).toHaveAttribute("data-audio-state", "ready");
    await expect(display.locator(".studio-play-along__current")).toHaveText("Cmaj7");
    const scrub = page.locator("#studio-transport-scrub");
    await scrub.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(scrub).toHaveAttribute("aria-valuenow", "2");
    cues.push({ position: await scrub.getAttribute("aria-valuetext"), display: await display.textContent() });
    await expect(display.locator(".studio-play-along__current")).toHaveText("Bm7#5");
    await expect(display.locator(".studio-play-along__next")).toHaveText("Next: Bbmaj7");
    await expect(display).toContainText("Starting position");
    await expect(display).toContainText("Chart beat 3 of 4");
    expect(await page.evaluate(() => window.u5NativeSourceCounts?.())).toMatchObject({ sounding: 0, futureAttacks: 0 });
    await expect.poll(() => page.evaluate(() => window.playAlongMasterPeak?.() ?? 1)).toBeLessThan(0.00001);
    await page.keyboard.press("End");
    await expect(display.locator(".studio-play-along__current")).toHaveText("—");
    await page.keyboard.press("Home");
    await expect(display.locator(".studio-play-along__current")).toHaveText("Cmaj7");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.locator("#studio-transport-play").click();
    await expect(page.locator("#transport-bar")).toHaveAttribute("data-audio-state", "playing");
    await page.locator("#studio-transport-pause").click();
    await expect(display).toContainText("Paused");
    await scrub.focus(); await page.keyboard.press("Home");
    await expect(scrub).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("ArrowRight");
    await expect(scrub).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("ArrowRight");
    await expect(scrub).toHaveAttribute("aria-valuenow", "2");
    await page.keyboard.press("PageUp");
    await expect(display.locator(".studio-play-along__current")).toHaveText("Am7#5");
    await display.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(display).toContainText("Starting position");
    await expect(display.locator(".studio-play-along__current")).toHaveText("Bm7#5");
    expect(await page.locator(".studio-document-status__revision").textContent()).toBe(revision);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (browserName === "chromium") await page.screenshot({ path: info.outputPath("ready-cue.png") });
    await display.getByRole("button", { name: "Exit Focus", exact: true }).focus(); await page.keyboard.press("Enter");
    await expect(display).toHaveCount(0);
    await expect(page.locator("#studio-chart-focus-toggle")).toBeFocused();
    expect(errors).toEqual([]); expect(requests).toEqual([]);
  } finally { await info.attach("ready-cue-evidence", { contentType: "application/json", body: JSON.stringify({ sha256, browser: browser.version(), width, touch, errors, requests, cues }) }); }
});

  });
}
