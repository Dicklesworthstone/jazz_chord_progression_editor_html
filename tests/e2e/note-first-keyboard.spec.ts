import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {decodeDocumentShape} from "../../src/domain";
import {observeNativeSources} from "../support/u5-native-audio";
const artifact=resolve(process.env["JCPE_KEYBOARD_ARTIFACT"]??"jazz_chord_progression_editor.html"),url=pathToFileURL(artifact).href;
const hash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",hasTouch:true,contextOptions:{reducedMotion:"reduce"}});
async function exported(page:Page){
 await page.locator("#studio-export-json").click();const pending=page.waitForEvent("download");await page.locator("#studio-lifecycle-download").click();const d=await pending;expect(await d.failure()).toBeNull();
 const bytes=readFileSync(await d.path()),decoded=decodeDocumentShape(JSON.parse(bytes.toString("utf8")));if(!decoded.ok)throw new Error(JSON.stringify(decoded.errors));
 await page.getByRole("button",{name:"Close JSON export",exact:true}).click();return {document:decoded.value,bytes};
}
async function open(page:Page,load=true){if(load){await page.goto(url);await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");}await page.locator("#studio-open-command-lane").click();await page.getByText("Start from notes",{exact:true}).click();return page.getByRole("region",{name:"Note-first entry"});}
for(const [width,theme] of [[320,"dark"],[1280,"light"]] as const)test(`tactile voicing entry, native audition and exact Add/Undo ${String(width)} ${theme}`,async({page,browser},info)=>{
 const errors:string[]=[],requests:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{if(route.request().isNavigationRequest()&&route.request().url()===url)await route.continue();else{requests.push(route.request().url());await route.abort();}});
 try{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme});await page.goto(url);await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");const before=await exported(page),panel=await open(page,false);await observeNativeSources(page);
  const octave=panel.getByLabel("Keyboard octave"),notes=panel.getByLabel("Voicing notes");
  const add=async(note:string)=>{const key=panel.getByRole("button",{name:`Add ${note}`,exact:true});if(width===320)await key.tap();else await key.click();};
  await add("A3");await octave.selectOption("4");await panel.getByRole("button",{name:"Add C4",exact:true}).focus();await page.keyboard.press("Space");await add("E4");await add("G4");await octave.selectOption("3");await add("A3");
  await expect(notes).toHaveValue("A3 C4 E4 G4 A3");await expect(panel).toContainText("5 of 16 note occurrences");
  expect(await page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBe(0);
  await octave.selectOption("4");await panel.getByLabel("New black-key spelling").selectOption("flats");await expect(notes).toHaveValue("A3 C4 E4 G4 A3");await add("Db4");await expect(notes).toHaveValue("A3 C4 E4 G4 A3 Db4");
  await panel.getByRole("button",{name:"Remove note 6: Db4",exact:true}).click();await expect(panel.getByRole("button",{name:"Remove note 5: A3",exact:true})).toBeFocused();await expect(notes).toHaveValue("A3 C4 E4 G4 A3");
  const boxes=await panel.locator(".studio-note-keyboard__keys button").evaluateAll(keys=>keys.map(k=>{const b=k.getBoundingClientRect();return {width:b.width,height:b.height};}));expect(boxes).toHaveLength(12);expect(boxes.every(b=>b.width>=44&&b.height>=44)).toBe(true);
  expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  expect((await new AxeBuilder({page}).include(".studio-note-first").analyze()).violations).toEqual([]);
  if(info.project.name==="chromium")await panel.locator(".studio-note-keyboard__scroll").screenshot({path:info.outputPath("keyboard.png")});
  await panel.getByRole("radio",{name:/C6\/A — exact spelling/}).check();await panel.getByLabel("Add one full bar to").selectOption({index:1});
  await panel.getByRole("button",{name:"Hear exact notes",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
  await panel.getByRole("button",{name:"Release notes",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().futureAttacks??-1)).toBe(0);
  await panel.getByRole("button",{name:"Add bar from notes",exact:true}).click();await expect(panel).toContainText("Added one bar");await page.getByRole("button",{name:"Close the command lane",exact:true}).click();
  const after=await exported(page),event=after.document.sections[0]?.measures.at(-1)?.events[0];
  expect(event?.voicing).toEqual({mode:"manual",bassPolicy:"included",pitches:[{step:"A",alter:0,octave:3},{step:"C",alter:0,octave:4},{step:"E",alter:0,octave:4},{step:"G",alter:0,octave:4},{step:"A",alter:0,octave:3}]});
  await page.locator("#studio-undo").click();expect((await exported(page)).document).toEqual(before.document);await page.locator("#studio-redo").click();expect((await exported(page)).document).toEqual(after.document);
  expect(errors).toEqual([]);expect(requests).toEqual([]);await info.attach("keyboard-document",{body:after.bytes,contentType:"application/json"});
 }finally{await info.attach("keyboard-evidence",{body:JSON.stringify({hash,width,theme,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
test("keyboard respects typed spelling, invalid drafts, occurrence bounds and focused removal",async({page,browser},info)=>{
 const errors:string[]=[],requests:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{if(route.request().isNavigationRequest()&&route.request().url()===url)await route.continue();else{requests.push(route.request().url());await route.abort();}});
 try{
  await page.setViewportSize({width:320,height:568});const panel=await open(page),notes=panel.getByLabel("Voicing notes"),octave=panel.getByLabel("Keyboard octave");
  await notes.fill("C#4 F##4 Gbb4");await octave.selectOption("4");await panel.getByLabel("New black-key spelling").selectOption("flats");await panel.getByRole("button",{name:"Add Db4",exact:true}).tap();await expect(notes).toHaveValue("C#4 F##4 Gbb4 Db4");
  await notes.fill("C4 unfinished");await panel.getByRole("button",{name:"Add E4",exact:true}).tap();await expect(notes).toHaveValue("C4 unfinished");await expect(panel).toContainText("Finish or clear the typed notes");
  await panel.getByRole("button",{name:"Clear draft notes",exact:true}).click();await expect(notes).toHaveValue("");await expect(octave).toBeFocused();
  await notes.fill(Array.from({length:15},()=>"C4").join(" "));await panel.getByRole("button",{name:"Add C4",exact:true}).tap();await expect(panel).toContainText("16 of 16 note occurrences");await expect(panel.locator(".studio-note-keyboard__keys button:enabled")).toHaveCount(0);
  await panel.getByRole("button",{name:"Remove note 8: C4",exact:true}).click();await expect(panel.getByRole("button",{name:"Remove note 8: C4",exact:true})).toBeFocused();await expect(panel.locator(".studio-note-keyboard__keys button:enabled")).toHaveCount(12);
  await panel.getByRole("button",{name:"Clear draft notes",exact:true}).click();await octave.selectOption("9");await expect(panel.getByRole("button",{name:"Add Ab9",exact:true})).toBeDisabled();await expect(panel.getByRole("button",{name:"Add G9",exact:true})).toBeEnabled();
  await octave.selectOption("-1");await panel.getByRole("button",{name:"Add C-1",exact:true}).tap();await expect(notes).toHaveValue("C-1");await panel.getByRole("button",{name:"Remove note 1: C-1",exact:true}).click();await expect(octave).toBeFocused();
  expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(errors).toEqual([]);expect(requests).toEqual([]);
 }finally{await info.attach("keyboard-boundary-evidence",{body:JSON.stringify({hash,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
