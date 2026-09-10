import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {inflateSync,deflateSync} from "node:zlib";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with {type:"json"};
const artifact=resolve(process.env["JCPE_QR_ARTIFACT"]??"jazz_chord_progression_editor.html"),url=pathToFileURL(artifact).href,hash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
const first=fixture.sections[0],measure=first?.measures[0],event=measure?.events[0];if(first===undefined||measure===undefined||event===undefined)throw new Error("Missing reviewed exact fixture");
const small={...fixture,title:"Exact pocket voicing",description:"",sections:[{...first,annotation:"",measures:[{...measure,events:[{...event,annotation:"",duration:{numerator:4,denominator:1}}]}]}]};
const compact=(text:string):string=>text.replace(/"(?:\\.|[^"\\])*"|\s+/gu,token=>token.startsWith('"')?token:"");
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
// Playwright 1.61.1's WebKit screenshot preparation injects `body {}`,
// violating the app's hash CSP. Ask the same live WebKit target for pixels
// directly; no DOM/style mutation, CSP bypass, error filtering, or SVG repaint.
// This version-bound test adapter fails closed if the private protocol changes.
async function webkitPixels(page:Page,rect:{x:number;y:number;width:number;height:number},path:string):Promise<void>{
 const installed:unknown=JSON.parse(readFileSync("node_modules/playwright-core/package.json","utf8"));
 if(installed===null||typeof installed!=="object"||!("version" in installed)||installed.version!=="1.61.1")throw new Error("Review WebKit snapshot protocol for the installed Playwright version");
 const local=page as unknown as {_connection:{toImpl:(p:Page)=>{delegate:{_session:{send:(method:string,args:unknown)=>Promise<unknown>}}}}};
 const result=await local._connection.toImpl(page).delegate._session.send("Page.snapshotRect",{...rect,coordinateSystem:"Viewport",omitDeviceScaleFactor:true});
 if(result===null||typeof result!=="object"||!("dataURL" in result)||typeof result.dataURL!=="string"||!result.dataURL.startsWith("data:image/png;base64,"))throw new Error("WebKit did not return rendered PNG pixels");
 writeFileSync(path,Buffer.from(result.dataURL.slice("data:image/png;base64,".length),"base64"));
}
async function exported(page:Page,alreadyOpen=false){if(!alreadyOpen)await page.locator("#studio-export-json").click();const pending=page.waitForEvent("download");await page.locator("#studio-lifecycle-download").click();const d=await pending;expect(await d.failure()).toBeNull();const bytes=readFileSync(await d.path());await page.getByRole("button",{name:"Close JSON export",exact:true}).click();return bytes;}
for(const theme of ["light","dark"] as const)for(const [width,height] of [[320,900],[1280,900],[844,390]] as const)test(`exact QR image to fresh receiver ${theme} ${String(width)}x${String(height)}`,async({page,context,browser,browserName},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[],monitor=(p:Page):void=>{p.on("pageerror",e=>errors.push(e.message));p.on("console",m=>{if(m.type()==="error")errors.push(m.text());});};monitor(page);context.on("page",monitor);
 await context.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url().split("#")[0]===url;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 const source=width===320?small:fixture;const sourceWire=JSON.stringify({...source,playback:{...source.playback,masterVolume:0}}).replace('"masterVolume":0','"masterVolume":-0');let proof:unknown=null;
 try{
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height});await page.goto(url+"#zdoc=2."+Buffer.from(sourceWire).toString("base64url"));await expect(page.locator("#studio-document-title")).toHaveValue(source.title);
  const before=await exported(page);expect(compact(before.toString("utf8"))).toContain('"masterVolume":-0');await page.locator("#studio-copy-share-link").click();await expect(page.locator("#studio-exact-share-dialog").getByRole("heading")).toBeFocused();await page.locator("#studio-exact-share-qr").focus();await page.keyboard.press("Enter");
  const image=page.getByRole("img",{name:"QR code for the exact chart",exact:true});await expect(image).toBeVisible();
  await image.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{resolve();}))));
  const viewBox=await image.getAttribute("viewBox"),extent=Number(viewBox?.split(" ")[2]),box=await image.boundingBox();if(box===null)throw new Error("No image geometry");expect(box.height).toBe(box.width);const dialogBox=await page.locator("#studio-exact-share-dialog").boundingBox();if(dialogBox===null)throw new Error("No dialog geometry");expect(box.y).toBeGreaterThanOrEqual(Math.max(0,dialogBox.y));expect(box.y+box.height).toBeLessThanOrEqual(Math.min(height,dialogBox.y+dialogBox.height));const moduleSize=box.width/extent;expect(Number.isInteger(moduleSize)).toBe(true);expect(moduleSize).toBeGreaterThanOrEqual(2);
  const png=info.outputPath("exact-qr.png");if(browserName==="webkit")await webkitPixels(page,box,png);else await image.screenshot({path:png,scale:"css"});
  const parsed:unknown=JSON.parse(execFileSync("python3",["tests/support/qr-image-proof.py",png,String(4*moduleSize),String(box.width)],{encoding:"utf8"}));
  if(parsed===null||typeof parsed!=="object"||!("url"in parsed)||typeof parsed.url!=="string")throw new Error("Independent decoder receipt missing");proof=parsed;
  const link=new URL(parsed.url);expect(link.origin).toBe("https://jazzchords.org");expect(link.hash).toMatch(/^#zdoc=3\./u);expect(parsed.url.length).toBeLessThanOrEqual(1190);
  const decoded=inflateSync(Buffer.from(link.hash.slice(8),"base64url")).toString("utf8");expect(decoded).toBe(compact(before.toString("utf8")));
  expect((await new AxeBuilder({page}).include("#studio-exact-share-dialog").analyze()).violations).toEqual([]);expect(await page.locator(".studio-exact-share").evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  const receiver=await context.newPage();await receiver.setViewportSize({width,height});await receiver.goto(url+link.hash);await expect(receiver.locator("#studio-document-title")).toHaveValue(source.title);const after=await exported(receiver);expect(after).toEqual(before);await receiver.close();
  await page.keyboard.press("Escape");await expect(page.locator("#studio-copy-share-link")).toBeFocused();await expect(image).toHaveCount(0);
  await page.locator("#studio-document-title").fill("Fresh revision");await page.locator("#studio-document-title").press("Tab");await page.locator("#studio-copy-share-link").click();await expect(image).toHaveCount(0);await page.locator("#studio-exact-share-qr").click();await expect(image).toBeVisible();
  expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
  await info.attach("qr-document",{body:after,contentType:"application/json"});
 }finally{await info.attach("qr-evidence",{body:JSON.stringify({hash,width,theme,browser:browser.version(),proof,errors,requests}),contentType:"application/json"});}
});

test("dense and oversized QR retain fallbacks; malformed compressed startup never substitutes a chart",async({page,context,browser},info)=>{
 const errors:string[]=[],requests:string[]=[],monitor=(p:Page):void=>{p.on("pageerror",e=>errors.push(e.message));p.on("console",m=>{if(m.type()==="error")errors.push(m.text());});};monitor(page);context.on("page",monitor);
 await context.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url().split("#")[0]===url;if(!allowed)requests.push(route.request().url());if(allowed)await route.continue();else await route.abort();});
 try{
  await page.setViewportSize({width:320,height:900});await page.goto(url+"#zdoc=2."+Buffer.from(JSON.stringify(fixture)).toString("base64url"));await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);await page.locator("#studio-copy-share-link").click();await page.locator("#studio-exact-share-qr").click();await expect(page.getByText("QR is too dense for this screen. Use a larger screen, copy the exact link, or download JSON.",{exact:true})).toBeVisible();await expect(page.getByRole("img",{name:"QR code for the exact chart",exact:true})).toHaveCount(0);await expect(page.locator("#studio-exact-share-copy")).toBeEnabled();
  let seed=0x13572468;const description=Array.from({length:1800},()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return String.fromCharCode(33+(seed>>>0)%90);}).join("");const big={...fixture,title:"Oversized exact chart",description};
  await page.goto(url+"#zdoc=2."+Buffer.from(JSON.stringify(big)).toString("base64url"));await page.reload();await expect(page.locator("#studio-document-title")).toHaveValue(big.title);await page.locator("#studio-copy-share-link").click();await page.locator("#studio-exact-share-qr").click();await expect(page.locator(".studio-exact-qr")).toContainText("QR compression was unavailable or exceeded");await expect(page.locator("#studio-exact-share-copy")).toBeEnabled();await page.locator("#studio-exact-share-json").click();expect(JSON.parse((await exported(page,true)).toString("utf8"))).toEqual(big);
  for(const payload of ["bad",deflateSync(Buffer.from("x".repeat(100000))).toString("base64url")]){
   const receiver=await context.newPage();await receiver.goto(url+"#zdoc=3."+payload);await expect(receiver.getByText(/The share link could not be read:/u)).toBeVisible();await expect(receiver.locator(".studio-chord-card")).toHaveCount(0);await receiver.close();
  }
  expect(errors).toEqual([]);expect(requests).toEqual([]);
 }finally{await info.attach("qr-refusal-evidence",{body:JSON.stringify({hash,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
