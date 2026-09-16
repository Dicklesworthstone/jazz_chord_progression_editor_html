import {expect,test,type Page} from "@playwright/test";
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
  const midiPending=page.waitForEvent("download");await panel.getByRole("button",{name:"Download rhythm MIDI",exact:true}).click();const midi=await midiPending;expect(midi.suggestedFilename()).toBe("JazzChords.org-comp-rhythm.mid");expect(await midi.failure()).toBeNull();
  const midiBytes=readFileSync(await midi.path());expect(createHash("sha256").update(midiBytes).digest("hex")).toBe(digest);expect([...midiBytes.subarray(0,14)]).toEqual([77,84,104,100,0,0,0,6,0,1,0,3,3,192]);
  await panel.getByText("Save or open a rhythm recipe",{exact:true}).click();const recipePending=page.waitForEvent("download");await panel.getByRole("button",{name:"Download rhythm recipe",exact:true}).click();const recipe=await recipePending;expect(recipe.suggestedFilename()).toBe("JazzChords.org-comp-recipe.json");expect(await recipe.failure()).toBeNull();
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

async function openRhythm(page:Page){
 await page.locator("#studio-open-command-lane").click();await page.getByText("Make a comping rhythm",{exact:true}).focus();await page.keyboard.press("Enter");
 const panel=page.getByRole("region",{name:"Authored comping rhythm"});await expect(panel).toBeVisible();return panel;
}
async function chartBytes(page:Page){
 await page.locator("#studio-export-json").click();const pending=page.waitForEvent("download");await page.locator("#studio-lifecycle-download").click();const file=await pending;expect(await file.failure()).toBeNull();
 const bytes=readFileSync(await file.path());await page.getByRole("button",{name:"Close JSON export",exact:true}).click();return bytes;
}
/** Independent byte reader checks native downloads, not the production MIDI parser. */
function rhythmMessages(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=14;const messages:number[][]=[];
 expect([...bytes.slice(0,14)]).toEqual([77,84,104,100,0,0,0,6,0,1,0,3,3,192]);
 const byte=():number=>{const n=bytes[at++];if(n===undefined)throw new Error("MIDI EOF");return n;};
 const vlq=():number=>{let n=0;for(let i=0;i<4;i++){const b=byte();n=n*128+(b&127);if(b<128)return n;}throw new Error("MIDI VLQ");};
 for(let track=0;track<3;track++){
  expect([...bytes.slice(at,at+4)]).toEqual([77,84,114,107]);at+=4;const end=at+4+view.getUint32(at);at+=4;let tick=0;
  while(at<end){tick+=vlq();const status=byte();if(status===255){byte();const size=vlq();at+=size;}else{expect([128,144]).toContain(status&240);messages.push([track,tick,status&240,byte(),byte()]);}}
  expect(at).toBe(end);
 }
 expect(at).toBe(bytes.length);return messages.sort((a,b)=>(a[1]??0)-(b[1]??0)||(a[3]??0)-(b[3]??0));
}
for(const width of [320,1280])for(const scenario of ["whole recipe","new chart passage"] as const)test(`comping input ownership: ${scenario} ${String(width)}`,async({page,browser},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url().split("#")[0]===fileUrl;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 try{
  await page.setViewportSize({width,height:900});await page.goto(url);await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
  if(scenario==="whole recipe"){
   const before=await chartBytes(page),panel=await openRhythm(page);await panel.getByRole("button",{name:"Charleston",exact:true}).click();
   await panel.getByText("Save or open a rhythm recipe",{exact:true}).click();const input=panel.getByLabel("Paste recipe JSON"),apply=panel.getByRole("button",{name:"Apply recipe to session",exact:true});
   const desired={schema:"changes.comp-recipe.v1",slots:[0,0,2,0,0,0,2,0,0,0,2,0,0,0,2,0],gateTicks:120};
   const exact=JSON.stringify(desired).padEnd(2048," ");expect(Buffer.byteLength(exact)).toBe(2048);
   await input.focus();await page.keyboard.insertText(exact);await expect(input).toHaveValue(exact);await expect(apply).toBeEnabled();
   await input.fill("");await input.focus();await page.keyboard.insertText(exact+"{}");
   await expect(apply).toBeDisabled();await expect(panel.getByRole("status")).toContainText("at most 2,048 bytes");await expect(input).toHaveValue(exact+"{}");
   if(info.project.name==="chromium"){await panel.getByRole("status").scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("whole-recipe-refused.png")});}
   await expect(panel.locator('.studio-comping__grid [aria-pressed="true"]')).toHaveCount(2);await expect(panel.getByLabel("Maximum note length")).toHaveValue("240");
   await input.fill("");await input.focus();await page.keyboard.insertText(exact);await apply.click();await expect(panel.locator('.studio-comping__grid [aria-pressed="true"]')).toHaveCount(4);await expect(panel.getByLabel("Maximum note length")).toHaveValue("120");
   const pending=page.waitForEvent("download");await panel.getByRole("button",{name:"Download rhythm recipe",exact:true}).click();const recipe=await pending;expect(await recipe.failure()).toBeNull();const bytes=readFileSync(await recipe.path());expect(JSON.parse(bytes.toString("utf8"))).toEqual(desired);
   await info.attach("whole-recipe-download",{body:bytes,contentType:"application/json"});
   expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
   await page.getByRole("button",{name:"Close the command lane",exact:true}).click();expect(await chartBytes(page)).toEqual(before);
  }else{
   const first=fixture.sections[0],second=fixture.sections[1];if(first===undefined||second===undefined)throw new Error("Missing authored sections");
   const chart={...fixture,id:"comping-replacement-chart",title:"Replacement comping chart",sections:[first,{...second,measures:first.measures.map((m,i)=>({...m,id:`replacement-measure-${String(i)}`,events:m.events.map((e,j)=>({...e,id:`replacement-event-${String(j)}`}))}))}]};
   await observeNativeSources(page);let panel=await openRhythm(page);await panel.getByRole("combobox",{name:"Passage",exact:true}).selectOption(first.id);await panel.getByRole("button",{name:"Charleston",exact:true}).click();await panel.getByLabel("Maximum note length").selectOption("120");
   await panel.getByRole("button",{name:"Prepare rhythm MIDI",exact:true}).click();await expect(panel).toContainText("2 attacks · 8 note occurrences");
   await page.getByRole("button",{name:"Close the command lane",exact:true}).click();await page.locator("#studio-document-title").fill("Same chart renamed");await page.locator("#studio-document-title").press("Tab");
   panel=await openRhythm(page);await expect(panel.getByRole("combobox",{name:"Passage",exact:true})).toHaveValue(first.id);await expect(panel.getByLabel("Maximum note length")).toHaveValue("120");
   await page.getByRole("button",{name:"Close the command lane",exact:true}).click();
   await page.locator("#studio-import-chart").click();await page.locator("#studio-import-file").setInputFiles({name:"another-chart.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(chart))});await page.locator("#studio-import-commit").click();await page.locator("#studio-import-confirm").click();
   await expect(page.locator("#studio-document-title")).toHaveValue(chart.title);const before=await chartBytes(page);panel=await openRhythm(page);
   await expect(panel.getByRole("combobox",{name:"Passage",exact:true})).toHaveValue("");await expect(panel.getByLabel("Maximum note length")).toHaveValue("120");await expect(panel.locator('.studio-comping__grid [aria-pressed="true"]')).toHaveCount(2);
   await expect(panel.getByRole("button",{name:"Download rhythm MIDI",exact:true})).toBeDisabled();
   if(info.project.name==="chromium"){await panel.getByRole("combobox",{name:"Passage",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("new-chart-whole-passage.png")});}
   await panel.getByRole("button",{name:"Hear rhythm",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
   await panel.getByRole("button",{name:"Stop rhythm",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().futureAttacks??-1)).toBe(0);
   await panel.getByRole("button",{name:"Prepare rhythm MIDI",exact:true}).click();await expect(panel).toContainText("4 attacks · 16 note occurrences");const digest=await panel.getAttribute("data-artifact-sha256");
   const pending=page.waitForEvent("download");await panel.getByRole("button",{name:"Download rhythm MIDI",exact:true}).click();const midi=await pending;expect(await midi.failure()).toBeNull();const bytes=readFileSync(await midi.path());expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
   const expected=[0,1440,3840,5280].flatMap(t=>[false,true].flatMap(off=>[49,49,49,64].map(p=>[2,t+(off?120:0),off?128:144,p,off?0:t%3840===0?112:80])));
   expect(rhythmMessages(bytes)).toEqual(expected);await info.attach("replacement-rhythm-midi",{body:bytes,contentType:"audio/midi"});
   expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.getByRole("button",{name:"Close the command lane",exact:true}).click();expect(await chartBytes(page)).toEqual(before);
  }
  expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
 }finally{await info.attach("comping-input-evidence",{body:JSON.stringify({hash,width,scenario,browser:browser.version(),errors,requests,nativeSources:await page.evaluate(()=>window.u5NativeSourceCounts?.()??null),measurement:"Native browser automation; not physical phone or human listening proof"}),contentType:"application/json"});}
});
