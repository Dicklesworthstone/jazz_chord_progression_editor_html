import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with {type:"json"};
import {observeNativeSources} from "../support/u5-native-audio";
const artifact=resolve(process.env["JCPE_REGISTER_ARTIFACT"]??"jazz_chord_progression_editor.html"),fileUrl=pathToFileURL(artifact).href;
const hash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
const pitches=[[{step:"D",alter:-1,octave:2},{step:"C",alter:1,octave:2},{step:"E",alter:0,octave:2}],Array.from({length:8},()=>({step:"E",alter:0,octave:2}))];
const document={...fixture,title:"Exact register fixtures",sections:fixture.sections.map(section=>({...section,measures:section.measures.map(measure=>({...measure,events:measure.events.map((event,i)=>{
  const notes=pitches[i];if(notes===undefined)throw new Error("Missing independent pitches");const label=i===0?"Low exact notes":"Eight E notes";
  return {...event,chord:{kind:"custom",sourceText:label,label,pitchNames:notes.map(p=>({step:p.step,alter:p.alter})),bass:null},voicing:{mode:"manual",bassPolicy:"included",pitches:notes}};
})}))}))};
const url=fileUrl+"#zdoc=2."+Buffer.from(JSON.stringify(document)).toString("base64url");
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
async function open(page:Page,width:number,height:number){
  if(width===320)await page.locator(height<600?"#studio-transport-open-harmony":"#studio-open-harmony-sheet").click();
  await page.getByRole("button",{name:"Choose voicing / Edit chord",exact:true}).click();
  await page.getByRole("button",{name:"Advanced chord controls",exact:true}).click();
  await page.getByRole("tab",{name:"Motion",exact:true}).click();
  await page.getByText("Register and spacing",{exact:true}).focus();await page.keyboard.press("Enter");
  return page.getByRole("region",{name:"Exact register observations"});
}
for(const theme of ["light","dark"] as const)for(const {width,height} of [{width:320,height:568},{width:1280,height:900}])test(`exact register facts ${theme} ${String(width)}x${String(height)}`,async({page,browser},info)=>{
  const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url().split("#")[0]===fileUrl;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
  try{
    await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height});await page.goto(url);
    await expect(page.locator("#studio-document-title")).toHaveValue(document.title);
    await page.locator(".studio-chord-card").first().click();await page.locator("#studio-transport-stop").click();
    const before=await page.locator(".studio-document-status__revision").textContent();
    const panel=await open(page,width,height);await expect(panel).toContainText("Range: MIDI 37–40 · span: 3 semitones");
    await expect(panel).toContainText("3 of 3 notes below C3");
    expect(await panel.locator("tbody tr").allTextContents()).toEqual(["1Db237","2C#237","3E240"]);
    await expect(panel.getByRole("region",{name:"Exact unison pairs",exact:true})).toContainText("#1 Db2 and #2 C#2 · 0 semitones");
    await expect(panel.getByRole("region",{name:"Pairs 1–4 semitones apart, both below C3",exact:true}).locator("li")).toHaveCount(2);
    await observeNativeSources(page);await panel.getByRole("button",{name:"Hear observed notes",exact:true}).focus();await page.keyboard.press("Enter");
    await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
    await panel.getByRole("button",{name:"Release observed notes",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
    expect((await new AxeBuilder({page}).include(".studio-register").analyze()).violations).toEqual([]);
    expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await page.getByRole("button",{name:"Close chord inspector",exact:true}).click();
    await page.locator(".studio-chord-card").nth(1).click();await page.locator("#studio-transport-stop").click();
    const large=await open(page,width,height);await expect(large.locator("tbody tr")).toHaveCount(8);
    const unisons=large.getByRole("region",{name:"Exact unison pairs",exact:true});await expect(unisons).toContainText("28");await expect(unisons.locator("li")).toHaveCount(8);
    await large.getByRole("button",{name:"Show all pairs",exact:true}).click();await expect(unisons.locator("li")).toHaveCount(28);
    await large.getByRole("button",{name:"Show first eight pairs per group",exact:true}).click();await expect(unisons.locator("li")).toHaveCount(8);
    await expect(page.getByRole("tabpanel",{name:"Motion",exact:true})).toContainText("three to seven distinct pitches");
    expect(await page.locator(".studio-document-status__revision").textContent()).toBe(before);expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
  }finally{await info.attach("register-evidence",{body:JSON.stringify({hash,width,height,theme,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
