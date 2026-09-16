import {verifyNativePrintPdf} from "../support/print-pdf-proof";
import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with {type:"json"};
const artifact=resolve(process.env["JCPE_PRINT_ARTIFACT"]??"jazz_chord_progression_editor.html"),url=pathToFileURL(artifact).href,hash=createHash("sha256").update(readFileSync(artifact)).digest("hex");
const section=fixture.sections[0],measure=section?.measures[0],event=measure?.events[0];if(!section||!measure||!event)throw new Error("Fixture");
const chart={...fixture,title:"Print exact Dbmaj7",sections:[{...section,name:"Forty nine bars",measures:Array.from({length:49},(_v,i)=>({...measure,id:`print-bar-${String(i)}`,completion:{kind:"complete"},events:[{...event,id:`print-event-${String(i)}`,duration:{numerator:4,denominator:1},chord:{kind:"custom",sourceText:"Dbmaj7",label:"Dbmaj7",pitchNames:[{step:"D",alter:-1}],bass:null},voicing:{mode:"manual",bassPolicy:"included",pitches:[{step:"D",alter:-1,octave:4}]}}]}))}]};
test.use({userAgent:"OpenAI File Downloader, XaiImageApiFetch/1.0",contextOptions:{reducedMotion:"reduce"}});
for(const paper of ["a4","letter"] as const)for(const width of [320,1280])test(`exact printable ${paper} ${String(width)}px`,async({page,browser,browserName},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url()===url;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 try{
  await page.emulateMedia({colorScheme:width===320?"dark":"light"});await page.setViewportSize({width,height:900});await page.goto(url);await page.locator("#studio-import-chart").click();await page.locator("#studio-import-file").setInputFiles({name:"print.changes.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(chart))});await page.locator("#studio-import-commit").click();await page.locator("#studio-import-confirm").click();await expect(page.locator("#studio-document-title")).toHaveValue(chart.title);
  const before=await page.locator(".studio-document-status__revision").textContent();await page.locator("#studio-open-command-lane").click();await page.getByText("Print chord chart",{exact:true}).click();const panel=page.getByRole("region",{name:"Printable chord chart"});await panel.getByRole("combobox",{name:"Paper",exact:true}).selectOption(paper);await panel.getByRole("button",{name:"Prepare print preview",exact:true}).click();await expect(panel).toContainText("2 pages ready");
  const svg=panel.locator("svg");expect(await svg.locator("text").evaluateAll(elements=>elements.every(e=>{if(!(e instanceof SVGGraphicsElement))return false;const box=e.getBBox();const parent=e.ownerSVGElement;if(parent===null||box.x<0||box.x+box.width>parent.viewBox.baseVal.width||box.y+box.height>parent.viewBox.baseVal.height)return false;const cell=[...parent.querySelectorAll("rect[data-source-id]")].find(r=>r.getAttribute("data-source-id")===e.getAttribute("data-source-id"));if(!(cell instanceof SVGRectElement))return true;return box.x>=cell.x.baseVal.value&&box.x+box.width<=cell.x.baseVal.value+cell.width.baseVal.value-1&&box.y+box.height<=cell.y.baseVal.value+cell.height.baseVal.value-1;}))).toBe(true);
  expect((await new AxeBuilder({page}).include(".studio-print-tool").analyze()).violations).toEqual([]);expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  const pending=page.waitForEvent("download");await panel.getByRole("button",{name:"Download page SVG",exact:true}).click();const download=await pending;expect(await download.failure()).toBeNull();const bytes=readFileSync(await download.path()),text=bytes.toString("utf8");expect(download.suggestedFilename()).toBe(`JazzChords.org-${paper}-page-1.svg`);
  const font=text.match(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/)?.[1];if(font===undefined)throw new Error("Missing embedded font");expect(Buffer.from(font,"base64").equals(readFileSync("assets/fonts/archivo-latin.woff2"))).toBe(true);
  const saved=info.outputPath("downloaded-chart.svg");await download.saveAs(saved);const standalone=await page.context().newPage(),standaloneUrl=pathToFileURL(saved).href;
  try{standalone.on("pageerror",e=>errors.push(e.message));standalone.on("console",m=>{if(m.type()==="error")errors.push(m.text());});await standalone.route("**/*",async route=>{const allowed=route.request().url()===standaloneUrl&&route.request().isNavigationRequest();requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});await standalone.goto(standaloneUrl);const parsed=await standalone.evaluate(()=>{const d=document;return{errors:d.querySelectorAll("parsererror").length,forbidden:d.querySelectorAll("script,foreignObject,iframe,image").length,text:[...d.querySelectorAll("text")].map(e=>e.textContent),width:d.documentElement.getAttribute("width"),height:d.documentElement.getAttribute("height")};});expect(parsed.errors).toBe(0);expect(parsed.forbidden).toBe(0);expect(parsed.text.filter(t=>t==="Dbmaj7 [4/1 q]").length).toBe(paper==="a4"?48:44);expect(parsed.width).toBe(paper==="a4"?"210mm":"215.9mm");expect(parsed.height).toBe(paper==="a4"?"297mm":"279.4mm");expect(await standalone.evaluate(async()=>{const fonts=await document.fonts.load("400 16px JazzChordsPrint");await document.fonts.ready;return fonts.length;})).toBe(1);await expect(standalone.locator("svg")).toBeVisible();}finally{await standalone.close();}
  if(browserName==="chromium"){await page.evaluate(()=>{window.addEventListener("beforeprint",()=>{document.documentElement.dataset["nativePrintSeen"]="yes";},{once:true});});await panel.getByRole("button",{name:"Print all pages",exact:true}).click();await expect(page.locator("html")).toHaveAttribute("data-native-print-seen","yes");}
  await page.emulateMedia({media:"print"});await expect(page.locator(".studio-print-only svg")).toHaveCount(2);await expect(page.locator("#studio-shell-background")).toBeHidden();
  if(browserName==="chromium"){const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});await info.attach(`native-${paper}-pdf`,{body:pdf,contentType:"application/pdf"});const pdfPath=info.outputPath(`native-${paper}.pdf`);writeFileSync(pdfPath,pdf);const proof=verifyNativePrintPdf(pdfPath,paper);await info.attach("native-pdf-proof",{body:JSON.stringify(proof),contentType:"application/json"});}
  await page.emulateMedia({media:"screen"});if(!(await panel.isVisible())){await page.locator("#studio-open-command-lane").click();await page.getByText("Print chord chart",{exact:true}).click();}await expect(panel.locator("svg")).toHaveCount(1);await panel.getByRole("button",{name:"Close print preview",exact:true}).click();await expect(panel.locator("svg")).toHaveCount(0);await expect(page.locator(".studio-print-only")).toHaveCount(0);expect(await page.locator(".studio-document-status__revision").textContent()).toBe(before);expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
  await info.attach("standalone-chart-svg",{body:bytes,contentType:"image/svg+xml"});
 }finally{await info.attach("print-evidence",{body:JSON.stringify({hash,paper,width,theme:width===320?"dark":"light",browser:browser.version(),errors,requests}),contentType:"application/json"});}
});

async function importPrintChart(page:Page,value:typeof chart):Promise<void>{
 await page.locator("#studio-import-chart").click();
 await page.locator("#studio-import-file").setInputFiles({name:"print-current.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(value))});
 await page.locator("#studio-import-commit").click();await page.locator("#studio-import-confirm").click();
 await expect(page.locator("#studio-document-title")).toHaveValue(value.title);
}
async function exportPrintSource(page:Page):Promise<Buffer>{
 await page.locator("#studio-export-json").click();const pending=page.waitForEvent("download");
 await page.locator("#studio-lifecycle-download").click();const download=await pending;
 expect(await download.failure()).toBeNull();const bytes=readFileSync(await download.path());
 await expect(page.locator("#studio-lifecycle-export-dialog").getByRole("status")).toContainText("Handed off to your browser.");
 await page.getByRole("button",{name:"Close JSON export",exact:true}).click();return bytes;
}
async function openPrintTool(page:Page){
 await page.locator("#studio-open-command-lane").click();await page.getByText("Print chord chart",{exact:true}).click();
 return page.getByRole("region",{name:"Printable chord chart"});
}
for(const paper of ["a4","letter"] as const)for(const width of [320,1280])test(`print selected page and current source ${paper} ${String(width)}px`,async({page,browser,browserName},info)=>{
 const errors:string[]=[],requests:{url:string;allowed:boolean}[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
 await page.route("**/*",async route=>{const allowed=route.request().isNavigationRequest()&&route.request().url()===url;requests.push({url:route.request().url(),allowed});if(allowed)await route.continue();else await route.abort();});
 try{
  await page.emulateMedia({colorScheme:width===320?"dark":"light"});await page.setViewportSize({width,height:900});await page.goto(url);
  await expect(page.locator(".studio-shell")).toHaveAttribute("data-app-ready","true");await importPrintChart(page,chart);
  const before=await exportPrintSource(page);let panel=await openPrintTool(page);
  await panel.getByRole("combobox",{name:"Paper",exact:true}).selectOption(paper);
  await panel.getByRole("button",{name:"Prepare print preview",exact:true}).click();await expect(panel).toContainText("2 pages ready");
  await panel.getByRole("combobox",{name:"Preview page",exact:true}).selectOption("1");
  const count=paper==="a4"?1:5;await expect(panel.locator("svg text").filter({hasText:"Dbmaj7 [4/1 q]"})).toHaveCount(count);
  await expect(page.locator(".studio-print-only svg")).toHaveCount(2);
  const pending=page.waitForEvent("download");await panel.getByRole("button",{name:"Download page SVG",exact:true}).click();
  const download=await pending;expect(await download.failure()).toBeNull();expect(download.suggestedFilename()).toBe(`JazzChords.org-${paper}-page-2.svg`);
  const second=readFileSync(await download.path());
  const decoded=await page.evaluate(source=>{const xml=new DOMParser().parseFromString(source,"image/svg+xml");return{errors:xml.querySelectorAll("parsererror").length,text:Array.from(xml.querySelectorAll("text"),e=>e.textContent),bars:Array.from(xml.querySelectorAll("rect[data-source-id]"),e=>e.getAttribute("data-source-id"))};},second.toString("utf8"));
  expect(decoded.errors).toBe(0);expect(decoded.text.filter(t=>t==="Dbmaj7 [4/1 q]")).toHaveLength(count);
  expect(decoded.bars).toEqual(Array.from({length:count},(_v,i)=>`print-bar-${String(49-count+i)}`));expect(decoded.text).toContain("2 / 2");
  await expect(panel.getByRole("button",{name:"Download page SVG",exact:true})).toBeDisabled();
  await expect(page.locator(".studio-print-only svg")).toHaveCount(2);
  await page.getByRole("button",{name:"Close the command lane",exact:true}).click();expect(await exportPrintSource(page)).toEqual(before);
  const title=page.locator("#studio-document-title");await title.fill("Revised print title");await title.press("Tab");
  await expect(page.locator(".studio-print-only")).toHaveCount(0);panel=await openPrintTool(page);
  await expect(panel.locator("svg")).toHaveCount(0);await expect(panel.getByRole("button",{name:"Print all pages",exact:true})).toBeDisabled();
  await expect(panel.getByRole("button",{name:"Download page SVG",exact:true})).toBeDisabled();
  await panel.getByRole("button",{name:"Prepare print preview",exact:true}).click();await expect(panel.locator("svg text").filter({hasText:"Revised print title"})).toHaveCount(1);
  await page.getByRole("button",{name:"Close the command lane",exact:true}).click();
  const replacement={...chart,title:"Replacement print title",sections:chart.sections.map(s=>({...s,name:"Replacement exact notes",measures:s.measures.map(m=>({...m,events:m.events.map(e=>({...e,chord:{...e.chord,sourceText:"F7",label:"F7",pitchNames:[{step:"F",alter:0}]},voicing:{...e.voicing,pitches:[{step:"F",alter:0,octave:4}]}}))}))}))};
  await importPrintChart(page,replacement);await expect(page.locator(".studio-print-only")).toHaveCount(0);
  const replacementSource=await exportPrintSource(page);panel=await openPrintTool(page);await expect(panel.locator("svg")).toHaveCount(0);
  await expect(panel.getByRole("button",{name:"Print all pages",exact:true})).toBeDisabled();await expect(panel.getByRole("button",{name:"Download page SVG",exact:true})).toBeDisabled();
  await panel.getByRole("button",{name:"Prepare print preview",exact:true}).click();await expect(panel).toContainText("2 pages ready");
  await expect(panel.getByRole("combobox",{name:"Preview page",exact:true})).toHaveValue("0");await expect(panel.locator("svg text").filter({hasText:"Replacement print title"})).toHaveCount(1);
  const freshPending=page.waitForEvent("download");await panel.getByRole("button",{name:"Download page SVG",exact:true}).click();const fresh=await freshPending;
  expect(await fresh.failure()).toBeNull();expect(fresh.suggestedFilename()).toBe(`JazzChords.org-${paper}-page-1.svg`);const current=readFileSync(await fresh.path());
  const text=await page.evaluate(source=>{const xml=new DOMParser().parseFromString(source,"image/svg+xml");return Array.from(xml.querySelectorAll("text"),e=>e.textContent);},current.toString("utf8"));
  expect(text).toContain("Replacement print title");expect(text).not.toContain("Revised print title");expect(text.filter(t=>t==="F7 [4/1 q]")).toHaveLength(49-count);expect(text.some(t=>t?.includes("Dbmaj7"))).toBe(false);
  expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  if(browserName==="chromium"){await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath("current-print-preview.png")});}
  await page.getByRole("button",{name:"Close the command lane",exact:true}).click();expect(await exportPrintSource(page)).toEqual(replacementSource);
  expect(errors).toEqual([]);expect(requests.every(r=>r.allowed)).toBe(true);
  await info.attach("selected-page-svg",{body:second,contentType:"image/svg+xml"});await info.attach("replacement-page-svg",{body:current,contentType:"image/svg+xml"});
 }finally{await info.attach("print-current-source-evidence",{body:JSON.stringify({hash,paper,width,browser:browser.version(),errors,requests}),contentType:"application/json"});}
});
