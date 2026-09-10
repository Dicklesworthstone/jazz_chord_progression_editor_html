import {expect,test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with {type:"json"};
import {observeNativeSources} from "../support/u5-native-audio";
const artifact=resolve(process.env["JCPE_WAV_ARTIFACT"]??"jazz_chord_progression_editor.html"),url=pathToFileURL(artifact).href,hash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
const section=fixture.sections[0],measure=section?.measures[0],event=measure?.events[0];if(section===undefined||measure===undefined||event===undefined)throw new Error("Missing document fixture");
const pitches=[{step:"C",alter:0,octave:4},{step:"C",alter:0,octave:4}];
const chart={...fixture,title:"Dry piano with leading silence",tempoBpm:120,sections:[{...section,name:"Piano passage",measures:[{...measure,id:"wav-rest",completion:{kind:"empty"},events:[]},{...measure,completion:{kind:"complete"},events:[{...event,duration:{numerator:4,denominator:1},chord:{kind:"custom",sourceText:"Two Cs",label:"Two Cs",pitchNames:[{step:"C",alter:0}],bass:null},voicing:{mode:"manual",bassPolicy:"included",pitches}}]}]}]};
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
for(const theme of ["light","dark"] as const)for(const width of [320,1280])test(`dry piano native WAV ${theme} ${String(width)}px`,async({page,browser},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];let renderMs=0;
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url()===url;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 try{
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:900});await page.goto(url);
  await page.locator("#studio-import-chart").click();await page.locator("#studio-import-file").setInputFiles({name:"piano.changes.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(chart))});await page.locator("#studio-import-commit").click();await page.locator("#studio-import-confirm").click();
  await expect(page.locator("#studio-document-title")).toHaveValue(chart.title);const revision=await page.locator(".studio-document-status__revision").textContent();await observeNativeSources(page);
  await page.evaluate(()=>{let created=0;const Native=window.AudioContext;window.AudioContext=new Proxy(Native,{construct(target,args,newTarget){created++;document.documentElement.dataset["wavAudioContexts"]=String(created);const context:unknown=Reflect.construct(target,args,newTarget);if(!(context instanceof Native))throw new Error("Invalid native context");return context;}});document.documentElement.dataset["wavAudioContexts"]="0";});
  await page.locator("#studio-open-command-lane").click();const summary=page.getByText("Download piano audio",{exact:true});await summary.focus();await page.keyboard.press("Enter");
  const panel=page.getByRole("region",{name:"Dry piano WAV"}),prepare=panel.getByRole("button",{name:"Prepare piano WAV",exact:true}),downloadButton=panel.getByRole("button",{name:"Download piano WAV",exact:true});
  await expect(panel).toBeVisible();await prepare.click();await expect(downloadButton).toBeEnabled();await panel.getByRole("button",{name:"Cancel piano WAV",exact:true}).click();await expect(downloadButton).toBeDisabled();
  const start=Date.now();await prepare.click();await expect(downloadButton).toBeEnabled();renderMs=Date.now()-start;const digest=await panel.getAttribute("data-artifact-sha256");
  const pending=page.waitForEvent("download");await downloadButton.click();const download=await pending;expect(await download.failure()).toBeNull();expect(download.suggestedFilename()).toBe("changes-dry-piano.wav");
  const bytes=readFileSync(await download.path());expect(bytes.length).toBe(537644);expect(bytes.toString("ascii",0,4)).toBe("RIFF");expect(bytes.toString("ascii",8,12)).toBe("WAVE");expect(bytes.readUInt32LE(4)).toBe(bytes.length-8);expect(bytes.readUInt16LE(20)).toBe(1);expect(bytes.readUInt16LE(22)).toBe(2);expect(bytes.readUInt32LE(24)).toBe(32000);expect(bytes.readUInt32LE(28)).toBe(128000);expect(bytes.readUInt16LE(32)).toBe(4);expect(bytes.readUInt16LE(34)).toBe(16);expect(bytes.readUInt32LE(40)).toBe(537600);
  expect(bytes.subarray(44,44+64000*4).every(n=>n===0)).toBe(true);expect(bytes.subarray(44+64100*4,44+65000*4).some(n=>n!==0)).toBe(true);expect(bytes.subarray(44+134000*4).every(n=>n===0)).toBe(true);
  let peak=0;for(let i=44;i<bytes.length;i+=2)peak=Math.max(peak,Math.abs(bytes.readInt16LE(i)));expect(peak).toBeLessThanOrEqual(29492);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);await expect(downloadButton).toBeDisabled();await expect(panel).toContainText("handed to browser downloads");
  expect(await page.locator("html").getAttribute("data-wav-audio-contexts")).toBe("0");expect(await page.evaluate(()=>window.u5NativeSourceCounts?.())).toEqual({started:0,sounding:0,futureAttacks:0});expect((await new AxeBuilder({page}).include(".studio-wav").analyze()).violations).toEqual([]);expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  expect(await page.locator(".studio-document-status__revision").textContent()).toBe(revision);expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
  await info.attach("piano-wav",{body:bytes,contentType:"audio/wav"});
 }finally{await info.attach("wav-evidence",{body:JSON.stringify({hash,browser:browser.version(),theme,width,renderMs,errors,requests,measurement:"Desktop browser automation, not physical phone memory or listening proof"}),contentType:"application/json"});}
});
