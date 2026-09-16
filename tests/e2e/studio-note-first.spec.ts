import {expect,test,type Page} from "@playwright/test";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {decodeDocumentShape} from "../../src/domain";
import {observeNativeSources} from "../support/u5-native-audio";
const artifact=resolve(process.env["JCPE_NOTE_FIRST_ARTIFACT"]??"jazz_chord_progression_editor.html"),url=pathToFileURL(artifact).href;
const hash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
async function exported(page:Page){
  await page.locator("#studio-export-json").click();
  const pending=page.waitForEvent("download");await page.locator("#studio-lifecycle-download").click();
  const download=await pending;expect(await download.failure()).toBeNull();
  const bytes=readFileSync(await download.path());const json:unknown=JSON.parse(bytes.toString("utf8"));
  const decoded=decodeDocumentShape(json);if(!decoded.ok)throw new Error(JSON.stringify(decoded.errors));
  await expect(page.locator("#studio-lifecycle-export-dialog").getByRole("status")).toContainText("Handed off to your browser.");
  await page.getByRole("button",{name:"Close JSON export",exact:true}).click();return {document:decoded.value,bytes};
}
for(const width of [320,1280])test(`note-first exact audio and Manual bar roundtrip at ${String(width)}px`,async({page,browser},info)=>{
  const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url()===url;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
  try{
    await page.setViewportSize({width,height:900});await page.goto(url);await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
    const before=await exported(page);await observeNativeSources(page);
    await page.locator("#studio-open-command-lane").click();
    const summary=page.getByText("Start from notes",{exact:true});await summary.focus();await page.keyboard.press("Enter");
    const panel=page.getByRole("region",{name:"Note-first entry"});
    await panel.getByLabel("Voicing notes").fill("C#4 F4 G#4");await panel.getByRole("button",{name:"Find chord names",exact:true}).click();
    await expect(panel).toContainText("enharmonic reading");await expect(panel).toContainText("Use this name as a Custom label");
    await panel.getByLabel("Add one full bar to").selectOption({index:1});
    await expect(panel.getByRole("button",{name:"Add bar from notes",exact:true})).toBeDisabled();
    await panel.getByLabel("Voicing notes").fill("A3 C4 E4 G4 A3");await panel.getByRole("button",{name:"Find chord names",exact:true}).click();
    await expect(panel).toContainText("Am7 — exact spelling");await expect(panel).toContainText("C6/A — exact spelling");
    await panel.getByRole("button",{name:/^All [0-9]+ names$/}).click();
    const alternative=panel.locator('input[type="radio"]:not([value="custom"])').last();
    await alternative.check();const selectedName=await alternative.inputValue();
    await panel.getByRole("button",{name:"Fewer names",exact:true}).click();
    await expect(panel.locator('input[type="radio"]:checked')).toBeVisible();
    expect(await panel.locator('input[type="radio"]:checked').inputValue()).toBe(selectedName);
    await panel.getByRole("radio",{name:/C6\/A — exact spelling/}).check();
    await panel.getByRole("button",{name:"Hear exact notes",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
    await panel.getByRole("button",{name:"Release notes",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().futureAttacks??-1)).toBe(0);
    expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await panel.getByRole("button",{name:"Add bar from notes",exact:true}).click();await expect(panel).toContainText("Added one bar");
    await expect(panel.getByLabel("Voicing notes")).toBeFocused();
    await page.getByRole("button",{name:"Close the command lane",exact:true}).click();
    const after=await exported(page),first=after.document.sections[0],oldFirst=before.document.sections[0];
    expect(first?.measures.length).toBe((oldFirst?.measures.length??0)+1);
    const inserted=first?.measures.at(-1)?.events[0];expect(inserted?.chord.sourceText).toBe("C6/A");
    if(inserted?.voicing.mode!=="manual")throw new Error("Expected stored Manual voicing");
    expect(inserted.voicing.pitches).toEqual([{step:"A",alter:0,octave:3},{step:"C",alter:0,octave:4},{step:"E",alter:0,octave:4},{step:"G",alter:0,octave:4},{step:"A",alter:0,octave:3}]);
    await page.locator("#studio-undo").click();expect((await exported(page)).document).toEqual(before.document);
    await page.locator("#studio-redo").click();expect((await exported(page)).document).toEqual(after.document);
    await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
    await page.reload();await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
    // Shell readiness precedes the asynchronous storage probe. Opening Export
    // during that probe counts as session intent and correctly prevents auto-open.
    await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Recovered chart opened");
    expect((await exported(page)).document).toEqual(after.document);
    expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
    await info.attach("note-first-portable-document",{body:after.bytes,contentType:"application/json"});
  }finally{await info.attach("note-first-evidence",{body:JSON.stringify({hash,width,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});

for(const width of [320,1280])for(const field of ["notes","Custom label"] as const)test(`complete note-first input: ${field} at ${String(width)}px`,async({page,browser},info)=>{
  const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url()===url;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
  try{
    await page.setViewportSize({width,height:900});await page.goto(url);await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
    const before=await exported(page);await observeNativeSources(page);
    await page.locator("#studio-open-command-lane").click();await page.getByText("Start from notes",{exact:true}).click();
    const panel=page.getByRole("region",{name:"Note-first entry"}),notes=panel.getByLabel("Voicing notes"),find=panel.getByRole("button",{name:"Find chord names",exact:true});
    const text=field==="notes"?"A3 C4 E4 G4 A3":"C#4 F##4 Gbb4 C#4",label="🎹".repeat(64);
    const exact=text.padEnd(256," ");expect(Array.from(exact)).toHaveLength(256);
    await notes.focus();await page.keyboard.insertText(exact);await expect(notes).toHaveValue(exact);await find.click();await expect(panel).toContainText(`Exact stored notes: ${text}`);
    await panel.getByLabel("Add one full bar to").selectOption({index:1});
    if(field==="notes"){
      const whole=text.padEnd(512," ")+"B4";
      await notes.fill("");await notes.focus();await page.keyboard.insertText(whole);await find.click();
      await expect(panel.getByRole("alert")).toHaveText("Use at most 256 characters and 16 notes.");
      // The old parser already refused; the field must also retain the rejected source.
      await expect(notes).toHaveValue(whole);await expect(panel.getByRole("button",{name:"Add bar from notes",exact:true})).toHaveCount(0);
      await expect(panel.getByRole("button",{name:"Hear exact notes",exact:true})).toHaveCount(0);
      if(info.project.name==="chromium"){await notes.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("whole-notes-refused.png")});}
      await panel.getByRole("button",{name:"Clear draft notes",exact:true}).click();await expect(notes).toHaveValue("");
      await notes.focus();await page.keyboard.insertText(exact);await find.click();
      await panel.getByRole("radio",{name:/C6\/A — exact spelling/}).check();
    }else{
      await panel.getByRole("radio",{name:"Custom voicing",exact:true}).check();const input=panel.getByLabel("Custom label",{exact:true});
      for(const suffix of ["X","🎵"]){
        const whole=label+suffix;expect(Array.from(whole)).toHaveLength(65);
        await input.fill("");await input.focus();await page.keyboard.insertText(whole);
        await panel.getByRole("button",{name:"Add bar from notes",exact:true}).click();
        await expect(panel.getByRole("status")).toHaveText("Give this Custom voicing a label of 1–64 characters without control characters.");
        await expect(input).toHaveValue(whole);await expect(notes).toHaveValue(exact);
      }
      if(info.project.name==="chromium"){await panel.getByRole("status").scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("whole-label-refused.png")});}
      await input.fill("");await input.focus();await page.keyboard.insertText(label);await expect(input).toHaveValue(label);
    }
    expect(await page.evaluate(()=>window.u5NativeSourceCounts?.().started??-1)).toBe(0);
    expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await panel.getByRole("button",{name:"Add bar from notes",exact:true}).click();await expect(panel).toContainText("Added one bar");await expect(notes).toBeFocused();
    await page.getByRole("button",{name:"Close the command lane",exact:true}).click();const after=await exported(page),section=after.document.sections[0],event=section?.measures.at(-1)?.events[0];
    expect(section?.measures.length).toBe((before.document.sections[0]?.measures.length??0)+1);
    expect(event?.chord.sourceText).toBe(field==="notes"?"C6/A":label);
    const pitches=field==="notes"?[{step:"A",alter:0,octave:3},{step:"C",alter:0,octave:4},{step:"E",alter:0,octave:4},{step:"G",alter:0,octave:4},{step:"A",alter:0,octave:3}]
      :[{step:"C",alter:1,octave:4},{step:"F",alter:2,octave:4},{step:"G",alter:-2,octave:4},{step:"C",alter:1,octave:4}];
    expect(event?.voicing).toEqual({mode:"manual",bassPolicy:"included",pitches});
    await page.locator("#studio-undo").click();expect((await exported(page)).document).toEqual(before.document);
    await page.locator("#studio-redo").click();expect((await exported(page)).document).toEqual(after.document);
    await info.attach("complete-input-document",{body:after.bytes,contentType:"application/json"});
    expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
  }finally{await info.attach("complete-input-evidence",{body:JSON.stringify({hash,width,field,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});

for(const width of [320,1280])for(const reading of ["custom","enharmonic"] as const)test(`note-first ${reading} labels preserve exact notes at ${String(width)}px`,async({page,browser},info)=>{
  const errors:string[]=[],requests:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.route("**/*",async route=>{if(route.request().isNavigationRequest()&&route.request().url()===url)await route.continue();else{requests.push(route.request().url());await route.abort();}});
  try{
    await page.setViewportSize({width,height:900});await page.goto(url);await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");
    const before=await exported(page);
    await page.locator("#studio-open-command-lane").click();await page.getByText("Start from notes",{exact:true}).click();
    const panel=page.getByRole("region",{name:"Note-first entry"}),notes=panel.getByLabel("Voicing notes");
    await notes.fill(reading==="custom"?"C#4 F##4 Gbb4 C#4":"C#4 F4 G#4 C#4");await panel.getByRole("button",{name:"Find chord names",exact:true}).click();
    const label=reading==="custom"?"🎹".repeat(64):"Db";
    await panel.getByLabel("Add one full bar to").selectOption({index:1});
    if(reading==="custom"){
      await panel.getByRole("radio",{name:"Custom voicing",exact:true}).check();
      const labelInput=panel.getByLabel("Custom label",{exact:true});
      // Actual text entry must honor the same code-point limit as application validation.
      await labelInput.pressSequentially(label);await expect(labelInput).toHaveValue(label);
    }else{
      await panel.getByRole("radio",{name:/^Db — enharmonic reading/}).check();
      await expect(panel.getByRole("button",{name:"Add bar from notes",exact:true})).toBeDisabled();
      await panel.getByLabel("Use this name as a Custom label, keeping my exact notes.",{exact:true}).check();
    }
    const add=panel.getByRole("button",{name:"Add bar from notes",exact:true});await add.focus();await page.keyboard.press("Enter");
    await expect(panel).toContainText("Added one bar");await expect(notes).toBeFocused();await expect(notes).toHaveValue("");
    await page.getByRole("button",{name:"Close the command lane",exact:true}).click();
    const after=await exported(page),event=after.document.sections[0]?.measures.at(-1)?.events[0];
    expect(event?.chord.kind).toBe("custom");if(event?.chord.kind!=="custom")throw new Error("Expected Custom chord");
    expect(event.chord.label).toBe(label);expect(event.chord.sourceText).toBe(label);
    const pitches=reading==="custom"
      ?[{step:"C",alter:1,octave:4},{step:"F",alter:2,octave:4},{step:"G",alter:-2,octave:4},{step:"C",alter:1,octave:4}]
      :[{step:"C",alter:1,octave:4},{step:"F",alter:0,octave:4},{step:"G",alter:1,octave:4},{step:"C",alter:1,octave:4}];
    expect(event.voicing).toEqual({mode:"manual",bassPolicy:"included",pitches});
    expect(event.chord.pitchNames).toEqual(pitches.map(({step,alter})=>({step,alter})));
    await page.locator("#studio-undo").click();expect((await exported(page)).document).toEqual(before.document);
    await page.locator("#studio-redo").click();expect((await exported(page)).document).toEqual(after.document);
    await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");await page.reload();
    await expect(page.locator("#studio-recovery-notice-title")).toHaveText("Recovered chart opened");
    expect((await exported(page)).document).toEqual(after.document);
    expect(errors).toEqual([]);expect(requests).toEqual([]);
    await info.attach("custom-note-first-document",{body:after.bytes,contentType:"application/json"});
  }finally{await info.attach("custom-note-first-evidence",{body:JSON.stringify({hash,width,reading,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
