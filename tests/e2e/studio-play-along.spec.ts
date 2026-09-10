import { expect, test } from "@playwright/test";
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
} }
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
    await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
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
