import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const artifact=resolve(process.env["JCPE_PERFORMED_ARTIFACT"]??"jazz_chord_progression_editor.html");
const url=pathToFileURL(artifact).href;
const artifactHash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
for(const width of [320,1280])test(`performed section MIDI downloads exact bytes at ${String(width)}px`,async({page,browser},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url()===url;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 try{
  await page.setViewportSize({width,height:900});await page.goto(url);
  await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
  // The shell renders before the recovery probe seeds the untouched demo.
  // This banner appears only after all starter commands have completed.
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  const revision=await page.locator(".studio-document-status__revision").textContent();
  await page.locator("#studio-export-midi").click();
  const summary=page.getByText("Export performed arrangement",{exact:true});await summary.focus();await page.keyboard.press("Enter");
  const panel=page.getByRole("region",{name:"Performed arrangement MIDI"});
  await expect(panel).toBeVisible();
  const select=panel.getByLabel("Passage",{exact:true});
  await select.selectOption({index:1});
  await panel.getByRole("button",{name:"Prepare performed MIDI",exact:true}).click();
  await expect(panel).toContainText("Performed MIDI is ready");
  await panel.getByRole("button",{name:"Cancel preparation",exact:true}).click();
  await expect(panel.getByRole("button",{name:"Download performed MIDI",exact:true})).toBeDisabled();
  await panel.getByRole("button",{name:"Prepare performed MIDI",exact:true}).click();
  await expect(panel).toContainText("Performed MIDI is ready");
  const sha256=await panel.getAttribute("data-artifact-sha256");
  const pending=page.waitForEvent("download");
  await panel.getByRole("button",{name:"Download performed MIDI",exact:true}).click();
  const download=await pending;
  const downloaded=await download.path();
  expect(await download.failure()).toBeNull();
  const bytes=readFileSync(downloaded);expect([...bytes.subarray(0,14)]).toEqual([77,84,104,100,0,0,0,6,0,1,0,3,3,192]);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
  expect(download.suggestedFilename()).toMatch(/^changes-performed-.*\.mid$/);
  await expect(panel).toContainText("handed to browser downloads");
  expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  expect(await page.locator(".studio-document-status__revision").textContent()).toBe(revision);
  expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
  await info.attach("performed-midi-file",{body:bytes,contentType:"audio/midi"});
 }finally{await info.attach("performed-midi-evidence",{body:JSON.stringify({artifactHash,browser:browser.version(),width,errors,requests}),contentType:"application/json"});}
});

declare global {
 interface Window {
  midiDownloadProof?: { created:number;revoked:number;active:Set<string>;clicks:number;faults:number;cleanup:()=>void };
 }
}
for(const fault of ["click","remove"] as const)for(const width of [320,1280])test(`performed MIDI ${fault} failure cleans up honestly and recovers at ${String(width)}px`,async({page,browser},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[],downloads:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 page.on("download",download=>downloads.push(download.suggestedFilename()));
 await page.route("**/*",async route=>{
  const request=route.request(),allowed=request.isNavigationRequest()&&request.url()===url&&request.method()==="GET"&&request.frame()===page.mainFrame()&&requests.length===0;
  requests.push({url:request.url(),allowed});if(allowed)await route.continue();else await route.abort();
 });
 try{
  await page.setViewportSize({width,height:900});await page.goto(url);
  await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
  // The shell renders before the recovery probe seeds the untouched demo.
  // This banner appears only after all starter commands have completed.
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  const revision=await page.locator(".studio-document-status__revision").textContent();
  await page.evaluate(failure=>{
   const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
   const click:unknown=Reflect.get(HTMLAnchorElement.prototype,"click"),remove:unknown=Reflect.get(Element.prototype,"remove");
   if(typeof click!=="function"||typeof remove!=="function")throw new Error("Missing native DOM methods");
   const state={created:0,revoked:0,active:new Set<string>(),clicks:0,faults:0,cleanup:()=>{
    URL.createObjectURL=create;URL.revokeObjectURL=revoke;
    Object.defineProperty(HTMLAnchorElement.prototype,"click",{value:click,writable:true,configurable:true});
    Object.defineProperty(Element.prototype,"remove",{value:remove,writable:true,configurable:true});
    for(const anchor of document.querySelectorAll<HTMLAnchorElement>('a[download^="changes-performed-"]'))anchor.remove();
   }};
   window.midiDownloadProof=state;
   URL.createObjectURL=function(blob){const result=create.call(URL,blob);if(blob instanceof Blob&&blob.type==="audio/midi"){state.created+=1;state.active.add(result);}return result;};
   URL.revokeObjectURL=function(value){revoke.call(URL,value);if(state.active.delete(value))state.revoked+=1;};
   HTMLAnchorElement.prototype.click=function(){
    if(this.download.startsWith("changes-performed-")){
     if(failure==="click"&&state.faults===0){state.faults+=1;throw new Error("Injected MIDI click failure");}
     state.clicks+=1;
    }
    Reflect.apply(click,this,[]);
   };
   Element.prototype.remove=function(){
    if(this instanceof HTMLAnchorElement&&this.download.startsWith("changes-performed-")&&failure==="remove"&&state.faults===0){state.faults+=1;throw new Error("Injected MIDI remove failure");}
    Reflect.apply(remove,this,[]);
   };
  },fault);
  await page.locator("#studio-export-midi").click();
  await page.getByText("Export performed arrangement",{exact:true}).click();
  const panel=page.getByRole("region",{name:"Performed arrangement MIDI"});
  await panel.getByLabel("Passage",{exact:true}).selectOption({index:1});
  const prepare=panel.getByRole("button",{name:"Prepare performed MIDI",exact:true}),downloadButton=panel.getByRole("button",{name:"Download performed MIDI",exact:true});
  await prepare.click();await expect(panel).toContainText("Performed MIDI is ready");
  const firstDownload=fault==="remove"?page.waitForEvent("download"):null;
  await downloadButton.focus();await page.keyboard.press("Enter");
  await expect(panel).toContainText(fault==="click"?"could not complete this download":"cleanup could not be confirmed");
  await expect(downloadButton).toBeDisabled();
  if(firstDownload!==null)expect(await (await firstDownload).failure()).toBeNull();
  const snapshot=()=>page.evaluate(()=>{
   const state=window.midiDownloadProof;if(state===undefined)throw new Error("Missing native instrumentation");
   return {created:state.created,revoked:state.revoked,active:state.active.size,clicks:state.clicks,faults:state.faults,anchors:document.querySelectorAll('a[download^="changes-performed-"]').length};
  });
  const failed=await snapshot();
  expect(failed).toEqual({created:1,revoked:1,active:0,clicks:fault==="remove"?1:0,faults:1,anchors:fault==="remove"?1:0});
  await prepare.click();await expect(panel).toContainText("Performed MIDI is ready");
  const sha256=await panel.getAttribute("data-artifact-sha256"),pending=page.waitForEvent("download");
  await downloadButton.click();const download=await pending;
  expect(await download.failure()).toBeNull();
  const bytes=readFileSync(await download.path());expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
  expect([...bytes.subarray(0,14)]).toEqual([77,84,104,100,0,0,0,6,0,1,0,3,3,192]);
  await expect(panel).toContainText("handed to browser downloads");
  const recovered=await snapshot();
  expect(recovered).toEqual({...failed,created:2,revoked:2,clicks:failed.clicks+1});
  expect(downloads).toHaveLength(fault==="remove"?2:1);
  expect(await page.locator(".studio-document-status__revision").textContent()).toBe(revision);
  expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  expect(errors).toEqual([]);expect(requests.every(request=>request.allowed)).toBe(true);expect(requests.length).toBeLessThanOrEqual(1);
  await info.attach("native-midi-cleanup",{body:JSON.stringify({artifactHash,browser:browser.version(),width,fault,failed,recovered,downloads,sha256}),contentType:"application/json"});
  await info.attach("recovered-midi",{body:bytes,contentType:"audio/midi"});
 }finally{
  await info.attach("native-midi-errors",{body:JSON.stringify({errors,requests}),contentType:"application/json"});
  await page.evaluate(()=>window.midiDownloadProof?.cleanup());
 }
});
