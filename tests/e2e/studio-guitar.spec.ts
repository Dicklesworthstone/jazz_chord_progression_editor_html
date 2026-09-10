import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with {type:"json"};
import {observeNativeSources} from "../support/u5-native-audio";
const artifact=resolve(process.env["JCPE_GUITAR_ARTIFACT"]??"jazz_chord_progression_editor.html"),fileUrl=pathToFileURL(artifact).href;
const hash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
const pitches=[[{step:"E",alter:0,octave:4},{step:"E",alter:0,octave:4}],[{step:"E",alter:0,octave:2},{step:"F",alter:0,octave:2}]];
const document={...fixture,title:"Exact guitar fixtures",sections:fixture.sections.map(section=>{
  const measures=section.measures.map(measure=>{
    const events=measure.events.map((event,i)=>{
      const notes=pitches[i];if(notes===undefined)throw new Error("Fixture notes absent");
      const label=i===0?"Double E":"Low semitone";
      return {...event,chord:{kind:"custom",sourceText:label,label,pitchNames:notes.map(p=>({step:p.step,alter:p.alter})),bass:null},voicing:{mode:"manual",bassPolicy:"included",pitches:notes}};
    });
    return {...measure,events};
  });
  return {...section,measures};
})};
const url=fileUrl+"#zdoc=2."+Buffer.from(JSON.stringify(document)).toString("base64url");
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
async function open(page:Page,width:number,height:number){
  if(width===320)await page.locator(height<600?"#studio-transport-open-harmony":"#studio-open-harmony-sheet").click();
  await page.getByRole("button",{name:"Choose voicing / Edit chord",exact:true}).click();
  const summary=page.getByText("On guitar — exact voicing",{exact:true});await summary.focus();await page.keyboard.press("Enter");
  return page.getByRole("region",{name:"Exact guitar positions"});
}
for(const {width,height} of [{width:320,height:568},{width:320,height:900},{width:1280,height:900}])test(`exact guitar positions, unisons and impossible register at ${String(width)}x${String(height)}`,async({page,browser},info)=>{
  const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url().split("#")[0]===fileUrl;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
  try{
    await page.setViewportSize({width,height});await page.goto(url);await expect(page.locator("#studio-document-title")).toHaveValue(document.title);
    await page.locator(".studio-chord-card").first().click();await page.locator("#studio-transport-stop").click();
    const before=await page.locator(".studio-document-status__revision").textContent();
    const panel=await open(page,width,height);await expect(panel).toContainText("Exact positions for this voicing");
    const rows=panel.locator("tbody tr");await expect(rows).toHaveCount(2);
    expect(await rows.nth(0).locator("th, td").allTextContents()).toEqual(["1. E4","2","5"]);expect(await rows.nth(1).locator("th, td").allTextContents()).toEqual(["2. E4","1","Open"]);
    await expect(panel.getByRole("img")).toHaveAttribute("aria-label",/mute, mute, mute, mute, 5, 0/);
    await panel.getByRole("button",{name:"Position 2",exact:true}).click();
    const played=await rows.evaluateAll(elements=>elements.map(e=>Array.from(e.children,c=>c.textContent)));
    for(const row of played){const tuning=[64,59,55,50,45,40],string=Number(row[1]),fret=row[2]==="Open"?0:Number(row[2]);expect((tuning[string-1]??-100)+fret).toBe(64);}
    expect(new Set(played.map(row=>row[1])).size).toBe(2);
    await observeNativeSources(page);await panel.getByRole("button",{name:"Hear these exact notes",exact:true}).focus();await page.keyboard.press("Enter");
    await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
    await panel.getByRole("button",{name:"Release notes",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
    expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include(".studio-guitar").analyze()).violations).toEqual([]);
    await page.getByRole("button",{name:"Close chord inspector",exact:true}).click();
    await page.locator(".studio-chord-card").nth(1).click();await page.locator("#studio-transport-stop").click();
    const impossible=await open(page,width,height);await expect(impossible).toContainText("No supported position");await expect(impossible.getByRole("table")).toHaveCount(0);
    expect(await page.locator(".studio-document-status__revision").textContent()).toBe(before);
    expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
  }finally{await info.attach("guitar-evidence",{body:JSON.stringify({hash,width,height,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
