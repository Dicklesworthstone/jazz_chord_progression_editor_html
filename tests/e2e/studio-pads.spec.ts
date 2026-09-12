import {expect,test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with {type:"json"};
import {observeNativeSources} from "../support/u5-native-audio";
const artifact=resolve(process.env["JCPE_PADS_ARTIFACT"]??"jazz_chord_progression_editor.html"),fileUrl=pathToFileURL(artifact).href;
const hash=createHash("sha256").update(readFileSync(artifact)).digest("hex"),base=fixture.sections[0],measure=base?.measures[0],event=measure?.events[0];
if(base===undefined||measure===undefined||event===undefined)throw new Error("Missing independent document skeleton");
const pitches=[{step:"C",alter:0,octave:4},{step:"C",alter:0,octave:4},{step:"E",alter:0,octave:4}];
const document={...fixture,title:"Touch pad fixtures",sections:[{...base,name:"Seventeen pads",measures:Array.from({length:17},(_v,i)=>({...measure,id:`pad-bar-${String(i)}`,completion:{kind:"complete"},events:[{...event,id:`pad-event-${String(i)}`,duration:{numerator:4,denominator:1},chord:{kind:"custom",sourceText:`Pad ${String(i+1)}`,label:`Pad ${String(i+1)}`,pitchNames:pitches.map(p=>({step:p.step,alter:p.alter})),bass:null},voicing:{mode:"manual",bassPolicy:"included",pitches}}]}))}]};
const url=fileUrl;
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
for(const [ownerKey,otherKey] of [["Space","Enter"],["Enter","Space"],["Enter","NumpadEnter"],["NumpadEnter","Enter"]] as const)test(`pad releases only its owning key: ${ownerKey} held across ${otherKey}`,async({page,browser},info)=>{
 const errors:string[]=[],requests:string[]=[],phases:{phase:string;counts:unknown}[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{if(route.request().isNavigationRequest()&&route.request().url()===fileUrl)await route.continue();else{requests.push(route.request().url());await route.abort();}});
 try{
  await page.goto(fileUrl);await page.locator("#studio-import-chart").click();await page.locator("#studio-import-file").setInputFiles({name:"pads.changes.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(document))});
  await page.locator("#studio-import-commit").click();await page.locator("#studio-import-confirm").click();await expect(page.locator("#studio-document-title")).toHaveValue(document.title);
  const before=await page.locator(".studio-document-status__revision").textContent();await page.locator("#studio-open-command-lane").click();await page.getByText("Play chord pads",{exact:true}).click();
  const pad=page.getByRole("region",{name:"Exact chord pads"}).locator(".studio-pads__pad").first();await observeNativeSources(page);await pad.focus();await page.keyboard.down(ownerKey);
  await expect(pad).toHaveAttribute("aria-pressed","true");await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().sounding??0)).toBeGreaterThan(0);
  const heldCounts=await page.evaluate(()=>window.u5NativeSourceCounts?.());phases.push({phase:"owner-down",counts:heldCounts});
  await page.keyboard.down(otherKey);await page.keyboard.up(otherKey);phases.push({phase:"other-released",counts:await page.evaluate(()=>window.u5NativeSourceCounts?.())});
  await expect(pad).toHaveAttribute("aria-pressed","true");expect(await page.evaluate(()=>window.u5NativeSourceCounts?.().sounding??0)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.u5NativeSourceCounts?.().started)).toBe(heldCounts?.started);
  await page.keyboard.up(ownerKey);await expect(pad).toHaveAttribute("aria-pressed","false");await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
  phases.push({phase:"owner-released",counts:await page.evaluate(()=>window.u5NativeSourceCounts?.())});expect(await page.locator(".studio-document-status__revision").textContent()).toBe(before);expect(errors).toEqual([]);expect(requests).toEqual([]);
 }finally{await info.attach("pads-key-ownership-evidence",{body:JSON.stringify({hash,browser:browser.version(),ownerKey,otherKey,errors,requests,phases,inputs:"Real browser keyboard input and native audio sources; no physical-device or listening claim."}),contentType:"application/json"});}
});
for(const theme of ["light","dark"] as const)for(const width of [320,1280])test(`held pads ${theme} ${String(width)}px`,async({page,browser},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];const onsets:{input:string;milliseconds:number}[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url().split("#")[0]===fileUrl;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 try{
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:900});await page.goto(url);
  await page.locator("#studio-import-chart").click();await page.locator("#studio-import-file").setInputFiles({name:"pads.changes.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(document))});
  await page.locator("#studio-import-commit").click();await page.locator("#studio-import-confirm").click();await expect(page.locator("#studio-document-title")).toHaveValue(document.title);
  const before=await page.locator(".studio-document-status__revision").textContent();await page.locator("#studio-open-command-lane").click();
  await page.getByText("Play chord pads",{exact:true}).focus();await page.keyboard.press("Enter");const panel=page.getByRole("region",{name:"Exact chord pads"}),pads=panel.locator(".studio-pads__pad");
  await expect(pads).toHaveCount(16);await expect(panel).toContainText("Page 1 of 2 · 17 chords");await expect(pads.first()).toContainText("C4 · C4 · E4");
  await observeNativeSources(page);await pads.first().scrollIntoViewIfNeeded();const box=await pads.first().boundingBox();if(box===null)throw new Error("No pad hit target");expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);const start=Date.now();await page.mouse.down();
  await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);onsets.push({input:"cold-mouse-observed",milliseconds:Date.now()-start});
  await expect(pads.first()).toHaveAttribute("aria-pressed","true");await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});await expect(pads.first()).toHaveAttribute("aria-pressed","false");
  const started=await page.evaluate(()=>window.u5NativeSourceCounts?.().started??0);await pads.nth(1).focus();const warm=Date.now();await page.keyboard.down("Space");
  await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(started);onsets.push({input:"warm-keyboard-observed",milliseconds:Date.now()-warm});
  await page.keyboard.up("Space");await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
  await pads.nth(2).focus();await page.keyboard.down("Enter");await expect(pads.nth(2)).toHaveAttribute("aria-pressed","true");
  await panel.getByRole("button",{name:"Next pad page",exact:true}).click();await page.keyboard.up("Enter");
  await expect(pads).toHaveCount(1);await expect(pads.first()).toContainText("Pad 17");await expect(panel).toContainText("Page 2 of 2 · 17 chords");
  await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
  await panel.getByRole("button",{name:"Release pads",exact:true}).click();
  expect((await new AxeBuilder({page}).include(".studio-pads").analyze()).violations).toEqual([]);expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.getByText("Play chord pads",{exact:true}).click();expect(await page.locator(".studio-document-status__revision").textContent()).toBe(before);expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
 }finally{await info.attach("pads-evidence",{body:JSON.stringify({hash,width,theme,browser:browser.version(),errors,requests,onsets,measurement:"Desktop browser automation; not physical phone latency"}),contentType:"application/json"});}
});
test("pad cancellation, real focus loss and repeated click activation",async({page,browser},info)=>{
 const errors:string[]=[],requests:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{if(route.request().isNavigationRequest()&&route.request().url()===fileUrl)await route.continue();else{requests.push(route.request().url());await route.abort();}});
 try{
  await page.setViewportSize({width:320,height:900});await page.goto(fileUrl);await page.locator("#studio-open-command-lane").click();await page.getByText("Play chord pads",{exact:true}).click();
  const panel=page.getByRole("region",{name:"Exact chord pads"}),pad=panel.locator(".studio-pads__pad").first();await observeNativeSources(page);
  await pad.evaluate(e=>{e.addEventListener("pointerdown",event=>{if(event instanceof PointerEvent)e.setAttribute("data-test-pointer",String(event.pointerId));},{once:true});});
  await pad.scrollIntoViewIfNeeded();const box=await pad.boundingBox();if(box===null)throw new Error("No pad");await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
  await pad.dispatchEvent("pointercancel",{pointerId:Number(await pad.getAttribute("data-test-pointer"))});await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
  let started=await page.evaluate(()=>window.u5NativeSourceCounts?.().started??0);await pad.focus();await page.keyboard.down("Enter");
  await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(started);await page.keyboard.press("Tab");await page.keyboard.up("Enter");
  await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
  for(let i=0;i<2;i++){started=await page.evaluate(()=>window.u5NativeSourceCounts?.().started??0);await pad.evaluate(e=>{if(e instanceof HTMLElement)e.click();});await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(started);}
  await panel.getByRole("button",{name:"Release pads",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
  expect(errors).toEqual([]);expect(requests).toEqual([]);
 }finally{await info.attach("pads-lifecycle-evidence",{body:JSON.stringify({hash,browser:browser.version(),errors,requests,inputs:"Real mouse/key/focus events; injected pointercancel and programmatic AT-style clicks. No screen-reader or physical-phone claim."}),contentType:"application/json"});}
});
