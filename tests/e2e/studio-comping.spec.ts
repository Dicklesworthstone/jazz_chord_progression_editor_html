import {expect,test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with {type:"json"};
import {observeNativeSources} from "../support/u5-native-audio";
const artifact=resolve(process.env["JCPE_COMPING_ARTIFACT"]??"jazz_chord_progression_editor.html"),fileUrl=pathToFileURL(artifact).href;
const hash=createHash("sha256").update(readFileSync(artifact)).digest("hex"),url=fileUrl+"#zdoc=2."+Buffer.from(JSON.stringify(fixture)).toString("base64url");
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
for(const colorScheme of ["light","dark"] as const)for(const {width,height} of [{width:320,height:568},{width:320,height:900},{width:1280,height:900}])test(`authored rhythm audio, recipe and MIDI at ${String(width)}x${String(height)} ${colorScheme}`,async({page,browser},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url().split("#")[0]===fileUrl;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 try{
  await page.emulateMedia({colorScheme});await page.setViewportSize({width,height});await page.goto(url);await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
  const before=await page.locator(".studio-document-status__revision").textContent();await observeNativeSources(page);
  await page.locator("#studio-open-command-lane").click();const summary=page.getByText("Make a comping rhythm",{exact:true});await summary.focus();await page.keyboard.press("Enter");
  const panel=page.getByRole("region",{name:"Authored comping rhythm"});await expect(panel).toContainText("Ordinary Play");
  await panel.getByRole("button",{name:"Charleston",exact:true}).click();await panel.getByLabel("Maximum note length").selectOption("480");
  const contrasts=await panel.locator("button:enabled, select:enabled").evaluateAll(elements=>{
    const luminance=(color:string):number=>{const rgb=color.match(/[\d.]+/g)?.slice(0,3).map(Number);if(rgb===undefined||rgb.length!==3)throw new Error("Non-RGB control color");
      return rgb.reduce((sum,c,i)=>{const v=c/255;return sum+(i===0?.2126:i===1?.7152:.0722)*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);},0);};
    return elements.map(element=>{const style=getComputedStyle(element),a=luminance(style.color),b=luminance(style.backgroundColor);return {label:element.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
  });
  expect(contrasts.filter(c=>c.ratio<4.5)).toEqual([]);
  await expect(panel.locator(".studio-comping__grid button")).toHaveCount(16);await expect(panel).toContainText("Strong");
  await panel.getByRole("button",{name:"Hear rhythm",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
  await panel.getByRole("button",{name:"Stop rhythm",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().futureAttacks??-1)).toBe(0);
  await panel.getByRole("button",{name:"Prepare rhythm MIDI",exact:true}).click();await expect(panel.getByRole("button",{name:"Download rhythm MIDI",exact:true})).toBeEnabled();
  await expect(panel).toContainText("2 attacks · 8 note occurrences");const digest=await panel.getAttribute("data-artifact-sha256");
  const midiPending=page.waitForEvent("download");await panel.getByRole("button",{name:"Download rhythm MIDI",exact:true}).click();const midi=await midiPending;expect(midi.suggestedFilename()).toBe("changes-comp-rhythm.mid");expect(await midi.failure()).toBeNull();
  const midiBytes=readFileSync(await midi.path());expect(createHash("sha256").update(midiBytes).digest("hex")).toBe(digest);expect([...midiBytes.subarray(0,14)]).toEqual([77,84,104,100,0,0,0,6,0,1,0,3,3,192]);
  await panel.getByText("Save or open a rhythm recipe",{exact:true}).click();const recipePending=page.waitForEvent("download");await panel.getByRole("button",{name:"Download rhythm recipe",exact:true}).click();const recipe=await recipePending;expect(recipe.suggestedFilename()).toBe("changes-comp-recipe.json");expect(await recipe.failure()).toBeNull();
  const json=readFileSync(await recipe.path(),"utf8"),expected={schema:"changes.comp-recipe.v1",slots:[3,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0],gateTicks:480};expect(JSON.parse(json)).toEqual(expected);
  await panel.getByLabel("Paste recipe JSON").fill('{"invalid":true}');await expect(panel.getByRole("button",{name:"Apply recipe to session",exact:true})).toBeDisabled();
  await panel.getByLabel("Paste recipe JSON").fill(JSON.stringify({...expected,slots:Array(16).fill(0)}));await panel.getByRole("button",{name:"Apply recipe to session",exact:true}).click();await panel.getByRole("button",{name:"Prepare rhythm MIDI",exact:true}).click();await expect(panel).toContainText("No notes fall on the active slots");
  await expect(panel.locator('.studio-comping__grid [aria-pressed="true"]')).toHaveCount(0);
  await panel.getByLabel("Open recipe file").setInputFiles({name:"too-large.json",mimeType:"application/json",buffer:Buffer.alloc(2049,32)});await expect(panel).toContainText("at most 2,048 bytes");
  await panel.getByLabel("Open recipe file").setInputFiles({name:"saved-recipe.json",mimeType:"application/json",buffer:Buffer.from(json)});await expect(panel).toContainText("Valid recipe preview");await panel.getByRole("button",{name:"Apply recipe to session",exact:true}).click();await expect(panel.locator('.studio-comping__grid [aria-pressed="true"]')).toHaveCount(2);
  expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);const axe=await new AxeBuilder({page}).include(".studio-comping").analyze();expect(axe.violations).toEqual([]);
  await page.getByRole("button",{name:"Close the command lane",exact:true}).click();expect(await page.locator(".studio-document-status__revision").textContent()).toBe(before);
  expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
  await info.attach("rhythm-midi",{body:midiBytes,contentType:"audio/midi"});await info.attach("rhythm-recipe",{body:json,contentType:"application/json"});
 }finally{await info.attach("rhythm-evidence",{body:JSON.stringify({hash,width,height,colorScheme,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
