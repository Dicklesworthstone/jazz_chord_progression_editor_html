import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {decodeDocumentShape} from "../../src/domain";
import {observeNativeSources} from "../support/u5-native-audio";
const artifact=resolve(process.env["JCPE_DRAFT_GUITAR_ARTIFACT"]??"jazz_chord_progression_editor.html"),url=pathToFileURL(artifact).href;
const hash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",hasTouch:true,contextOptions:{reducedMotion:"reduce"}});
async function exported(page:Page){
 await page.locator("#studio-export-json").click();const pending=page.waitForEvent("download");await page.locator("#studio-lifecycle-download").click();const d=await pending;expect(await d.failure()).toBeNull();
 const bytes=readFileSync(await d.path()),decoded=decodeDocumentShape(JSON.parse(bytes.toString("utf8")));if(!decoded.ok)throw new Error(JSON.stringify(decoded.errors));
 await page.getByRole("button",{name:"Close JSON export",exact:true}).click();return {document:decoded.value,bytes};
}
async function open(page:Page,load=true){if(load){await page.goto(url);await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");}await page.locator("#studio-open-command-lane").click();await page.getByText("Start from notes",{exact:true}).click();return page.getByRole("region",{name:"Note-first entry"});}
async function openGuitar(page:Page){const summary=page.getByText("On guitar — draft notes",{exact:true});await summary.focus();await page.keyboard.press("Enter");return page.getByRole("region",{name:"Draft guitar positions"});}
for(const [width,theme] of [[320,"dark"],[1280,"light"]] as const)test(`draft guitar exact notes, live edits and native Add Undo ${String(width)} ${theme}`,async({page,browser},info)=>{
 const errors:string[]=[],requests:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{if(route.request().isNavigationRequest()&&route.request().url()===url)await route.continue();else{requests.push(route.request().url());await route.abort();}});
 try{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme});await page.goto(url);await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
  const before=await exported(page),panel=await open(page,false),notes=panel.getByLabel("Voicing notes");await observeNativeSources(page);
  await panel.getByLabel("Keyboard octave").selectOption("4");const e4=panel.getByRole("button",{name:"Add E4",exact:true});
  if(width===320){await e4.tap();await e4.tap();}else{await e4.focus();await page.keyboard.press("Space");await page.keyboard.press("Space");}
  await expect(notes).toHaveValue("E4 E4");await expect(panel.locator(".studio-note-first-guitar table")).toHaveCount(0);
  const guitar=await openGuitar(page),rows=guitar.locator("tbody tr");await expect(rows).toHaveCount(2);
  expect(await rows.nth(0).locator("th, td").allTextContents()).toEqual(["1. E4","2","5"]);expect(await rows.nth(1).locator("th, td").allTextContents()).toEqual(["2. E4","1","Open"]);
  await guitar.getByRole("button",{name:"Position 2",exact:true}).click();await expect(guitar.getByRole("button",{name:"Position 2",exact:true})).toHaveAttribute("aria-pressed","true");
  await panel.getByRole("button",{name:"Add G4",exact:true}).click();await expect(rows).toHaveCount(3);await expect(guitar.getByRole("button",{name:"Position 1",exact:true})).toHaveAttribute("aria-pressed","true");
  await panel.getByRole("button",{name:"Remove note 3: G4",exact:true}).click();await expect(rows).toHaveCount(2);
  await notes.fill("E4 Fb4");await expect(panel.locator(".studio-note-first-guitar")).toHaveCount(0);
  await panel.getByRole("button",{name:"Find chord names",exact:true}).click();await openGuitar(page);await expect(rows).toHaveCount(2);
  expect(await rows.nth(1).locator("th, td").allTextContents()).toEqual(["2. Fb4","1","Open"]);
  await expect(guitar.getByRole("img")).toHaveAttribute("aria-label",/mute, mute, mute, mute, 5, 0/);
  expect(await page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBe(0);
  expect((await new AxeBuilder({page}).include(".studio-note-first-guitar").analyze()).violations).toEqual([]);expect(await guitar.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  if(info.project.name==="chromium")await guitar.screenshot({path:info.outputPath("draft-guitar.png")});
  await guitar.getByRole("button",{name:"Hear these exact notes",exact:true}).focus();await page.keyboard.press("Enter");await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
  await page.getByText("On guitar — draft notes",{exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
  await openGuitar(page);await expect(rows).toHaveCount(2);
  await panel.getByRole("radio",{name:"Custom voicing",exact:true}).check();await panel.getByLabel("Custom label",{exact:true}).fill("Guitar unisons");await panel.getByLabel("Add one full bar to").selectOption({index:1});
  await panel.getByRole("button",{name:"Add bar from notes",exact:true}).click();await expect(panel).toContainText("Added one bar");await page.getByRole("button",{name:"Close the command lane",exact:true}).click();
  const after=await exported(page),event=after.document.sections[0]?.measures.at(-1)?.events[0];
  expect(event?.voicing).toEqual({mode:"manual",bassPolicy:"included",pitches:[{step:"E",alter:0,octave:4},{step:"F",alter:-1,octave:4}]});
  expect(after.document.sections[0]?.measures.length).toBe((before.document.sections[0]?.measures.length??0)+1);
  await page.locator("#studio-undo").click();expect((await exported(page)).document).toEqual(before.document);await page.locator("#studio-redo").click();expect((await exported(page)).document).toEqual(after.document);
  expect(errors).toEqual([]);expect(requests).toEqual([]);await info.attach("draft-guitar-document",{body:after.bytes,contentType:"application/json"});
 }finally{await info.attach("draft-guitar-evidence",{body:JSON.stringify({hash,width,theme,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
test("draft guitar hides stale source after real songbook insertion and refuses impossible drafts",async({page,browser},info)=>{
 const errors:string[]=[],requests:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{if(route.request().isNavigationRequest()&&route.request().url()===url)await route.continue();else{requests.push(route.request().url());await route.abort();}});
 try{
  await page.setViewportSize({width:320,height:568});const panel=await open(page),notes=panel.getByLabel("Voicing notes");
  await notes.fill("E4 E4");await panel.getByRole("button",{name:"Find chord names",exact:true}).click();const guitar=await openGuitar(page);await expect(guitar.getByRole("table")).toBeVisible();
  await page.getByText("Import a ChordPro grid",{exact:true}).click();const songbook=page.getByRole("region",{name:"ChordPro songbook import"});
  await songbook.getByRole("button",{name:"Use example grid",exact:true}).click();await songbook.getByRole("button",{name:"Preview songbook",exact:true}).click();await songbook.getByRole("checkbox").check();await songbook.getByRole("button",{name:"Add song as new section",exact:true}).click();
  await expect(songbook.getByRole("status")).toContainText("Added the song as one new section");await expect(guitar).toContainText("The chart changed");await expect(guitar.getByRole("table")).toHaveCount(0);await expect(guitar.getByRole("button",{name:"Hear these exact notes",exact:true})).toHaveCount(0);
  await panel.getByRole("button",{name:"Analyze again",exact:true}).click();await expect(guitar.getByRole("table")).toBeVisible();
  await notes.fill("E4 F");await expect(panel.locator(".studio-note-first-guitar")).toHaveCount(0);await panel.getByRole("button",{name:"Find chord names",exact:true}).click();await expect(panel.locator(".studio-note-first-guitar")).toHaveCount(0);
  for(const text of ["E2 F2","E4 E4 E4 E4 E4 E4 E4"]){await notes.fill(text);await panel.getByRole("button",{name:"Find chord names",exact:true}).click();await openGuitar(page);await expect(guitar).toContainText("No supported position");await expect(guitar.getByRole("table")).toHaveCount(0);await expect(notes).toHaveValue(text);}
  expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(errors).toEqual([]);expect(requests).toEqual([]);
 }finally{await info.attach("draft-guitar-boundary-evidence",{body:JSON.stringify({hash,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
