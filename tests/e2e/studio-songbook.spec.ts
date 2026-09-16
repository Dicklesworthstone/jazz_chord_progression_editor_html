import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {decodeDocumentShape} from "../../src/domain";
import fixture from "../fixtures/chordpro-grid/cases.json" with {type:"json"};
const artifact=resolve(process.env["JCPE_SONGBOOK_ARTIFACT"]??"jazz_chord_progression_editor.html"),url=pathToFileURL(artifact).href;
const hash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
const source=readFileSync("tests/fixtures/chordpro-grid/turnaround.crd","utf8").replace("{tempo: 120}\n","");
// Hand-sized input: the first 16,384 characters are a complete, valid song.
// A browser maxlength must not hide the extra unsupported source from validation.
const boundedLines=[source];
let padding=16384-source.length;
while(padding>0){const length=Math.min(padding,1000);boundedLines.push("#"+"x".repeat(length-2));padding-=length;}
const exactSource=boundedLines.join("\n");
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
async function exported(page:Page){
 await page.locator("#studio-export-json").click();const pending=page.waitForEvent("download");await page.locator("#studio-lifecycle-download").click();const download=await pending;expect(await download.failure()).toBeNull();const bytes=readFileSync(await download.path());const json:unknown=JSON.parse(bytes.toString("utf8"));const decoded=decodeDocumentShape(json);if(!decoded.ok)throw new Error(JSON.stringify(decoded.errors));await page.getByRole("button",{name:"Close JSON export",exact:true}).click();return {document:decoded.value,bytes};
}
for(const theme of ["light","dark"] as const)for(const width of [320,1280])test(`ChordPro file and exact Add Undo Redo ${theme} ${String(width)}`,async({page,browser},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url()===url;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 try{
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:900});await page.goto(url);await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
  const before=await exported(page);await page.locator("#studio-open-command-lane").click();await page.getByText("Import a ChordPro grid",{exact:true}).focus();await page.keyboard.press("Enter");
  const panel=page.getByRole("region",{name:"ChordPro songbook import"});
  await panel.getByLabel("ChordPro text",{exact:true}).fill(source+"\n{include: https://example.org/evil}");await panel.getByRole("button",{name:"Preview songbook",exact:true}).click();await expect(panel.getByRole("status")).toContainText("Unsupported directive");await expect(panel.getByRole("button",{name:"Add song as new section",exact:true})).toHaveCount(0);
  await panel.getByLabel("ChordPro file",{exact:true}).setInputFiles({name:"turnaround.crd",mimeType:"text/plain",buffer:Buffer.from(source)});
  await expect(panel).toContainText("Flat-side study");await expect(panel.getByRole("list",{name:"Expanded songbook bars"}).locator("li")).toHaveCount(4);
  expect(await panel.getByRole("list",{name:"Expanded songbook bars"}).locator("li").allTextContents()).toEqual(fixture.positive[0]?.bars.map(b=>b.map(e=>`${String(e[0])} — ${String(e[1])} quarter ${e[1]===1?"beat":"beats"}`).join("; ")));
  await expect(panel).toContainText("1 comment lines omitted");await expect(panel.getByRole("button",{name:"Add song as new section",exact:true})).toBeDisabled();
  expect((await new AxeBuilder({page}).include(".studio-songbook").analyze()).violations).toEqual([]);expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await panel.getByRole("checkbox").check();await panel.getByRole("button",{name:"Add song as new section",exact:true}).click();await expect(panel.getByRole("status")).toContainText("Added the song as one new section");
  await page.getByRole("button",{name:"Close the command lane",exact:true}).click();const after=await exported(page),section=after.document.sections.at(-1);expect(after.document.sections.slice(0,-1)).toEqual(before.document.sections);expect(after.document.sections.length).toBe(before.document.sections.length+1);expect(section?.name).toBe("Flat-side study");expect(section?.measures.map(m=>m.events.map(e=>[e.chord.sourceText,e.duration.numerator/e.duration.denominator]))).toEqual(fixture.positive[0]?.bars);
  expect(after.document.title).toBe(before.document.title);expect(after.document.tempoBpm).toBe(before.document.tempoBpm);
  await page.locator("#studio-undo").click();expect((await exported(page)).document).toEqual(before.document);await page.locator("#studio-redo").click();expect((await exported(page)).document).toEqual(after.document);
  await page.locator("#studio-open-command-lane").click();await page.getByText("Import a ChordPro grid",{exact:true}).click();await panel.getByRole("button",{name:"Use example grid",exact:true}).click();await panel.getByRole("button",{name:"Preview songbook",exact:true}).click();await expect(panel).toContainText("My turnaround");await panel.getByRole("button",{name:"Close songbook preview",exact:true}).click();await expect(panel.getByLabel("ChordPro text",{exact:true})).toHaveValue("");
  expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);await info.attach("songbook-document",{body:after.bytes,contentType:"application/json"});
 }finally{await info.attach("songbook-evidence",{body:JSON.stringify({hash,width,theme,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});

for(const width of [320,1280])test(`songbook paste retains the complete validation boundary ${String(width)}`,async({page,browser},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url()===url;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 try{
  await page.addInitScript(()=>{
   const events:unknown[]=[];Object.defineProperty(window,"songbookInputEvidence",{value:events});
   for(const kind of ["beforeinput","input"])document.addEventListener(kind,event=>{
    const target=event.target;if(!(target instanceof HTMLTextAreaElement)||events.length>=100)return;
    const input=event instanceof InputEvent?event:null;
    events.push({kind,length:target.value.length,tail:target.value.slice(-80),maxlength:target.maxLength,inputType:input?.inputType,dataLength:input?.data?.length,trusted:event.isTrusted});
   },true);
  });
  expect(exactSource.length).toBe(16384);
  await page.setViewportSize({width,height:900});await page.goto(url);await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
  const before=await exported(page);await page.locator("#studio-open-command-lane").click();await page.getByText("Import a ChordPro grid",{exact:true}).click();
  const panel=page.getByRole("region",{name:"ChordPro songbook import"}),input=panel.getByLabel("ChordPro text",{exact:true});
  await input.focus();await page.keyboard.insertText(exactSource);
  await expect(input).toHaveValue(exactSource);await panel.getByRole("button",{name:"Preview songbook",exact:true}).click();
  await expect(panel.getByRole("list",{name:"Expanded songbook bars"}).locator("li")).toHaveCount(4);
  await panel.getByRole("checkbox").check();await expect(panel.getByRole("button",{name:"Add song as new section",exact:true})).toBeEnabled();
  await input.fill("");await input.focus();await page.keyboard.insertText(exactSource+"\n{new_song}\n{title: Must not disappear}");
  await expect(panel.getByRole("status")).toContainText("Source exceeds");
  await expect(input).toHaveValue("");await expect(panel.getByRole("button",{name:"Add song as new section",exact:true})).toHaveCount(0);
  await expect(panel.getByRole("button",{name:"Preview songbook",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Close the command lane",exact:true}).click();expect((await exported(page)).document).toEqual(before.document);
  await page.locator("#studio-open-command-lane").click();await page.getByText("Import a ChordPro grid",{exact:true}).click();
  await input.focus();await page.keyboard.insertText(exactSource);await panel.getByRole("button",{name:"Preview songbook",exact:true}).click();
  await expect(panel.getByRole("button",{name:"Add song as new section",exact:true})).toBeDisabled();
  await panel.getByRole("checkbox").check();await panel.getByRole("button",{name:"Add song as new section",exact:true}).click();
  await page.getByRole("button",{name:"Close the command lane",exact:true}).click();const after=await exported(page);
  expect(after.document.sections.slice(0,-1)).toEqual(before.document.sections);
  expect(after.document.sections.at(-1)?.measures.map(m=>m.events.map(e=>[e.chord.sourceText,e.duration.numerator/e.duration.denominator]))).toEqual(fixture.positive[0]?.bars);
  await page.locator("#studio-undo").click();expect((await exported(page)).document).toEqual(before.document);
  expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
 }finally{
  await info.attach("songbook-input-events",{body:JSON.stringify(await page.evaluate(()=>{const value:unknown=Reflect.get(window,"songbookInputEvidence");return value;})),contentType:"application/json"});
  await info.attach("songbook-paste-evidence",{body:JSON.stringify({hash,width,browser:browser.version(),errors,requests}),contentType:"application/json"});
 }
});
