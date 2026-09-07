import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import fixture from "../fixtures/exact-share/document.changes.json" with { type: "json" };
import { observeNativeSources } from "../support/u5-native-audio";

const UA = "OpenAI File Downloader, XaiImageApiFetch/1.0";
const artifactPath = resolve("jazz_chord_progression_editor.html"), bytes = readFileSync(artifactPath);
const artifactHash = createHash("sha256").update(bytes).digest("hex");
const fragment = '#zdoc=2.' + Buffer.from(JSON.stringify(fixture)).toString('base64url');
let server: Server, url: string;
const wireRequests: { path: string; userAgent: string }[] = [];
type Diagnostics = { errors: string[]; requests: { url: string; allowed: boolean }[] };
declare global { interface Window {
  shareObjectUrls?: () => Readonly<{ created: number; revoked: number; outstanding: number }>;
  shareClipboardRelease?: () => void;
  shareClipboardCalls?: number;
  shareClipboardSettled?: boolean;
} }
test.use({ userAgent: UA });
test.beforeAll(async () => {
  server = createServer((request,response) => {
    if(wireRequests.length>=256) throw new Error("Unexpected request bound exceeded");
    wireRequests.push({path:request.url??"",userAgent:request.headers['user-agent']??""});
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(bytes);
  });
  await new Promise<void>(done => { server.listen(0,'127.0.0.1',done); });
  const address = server.address();if(address===null || typeof address==='string')throw new Error('Missing local server');
  url=`http://127.0.0.1:${String(address.port)}/`;
});
test.afterAll(async()=>{await new Promise<void>((done,reject)=>{server.close(error=>{if(error)reject(error);else done();});});});
async function observe(context: BrowserContext, diagnostics: Diagnostics) {
  const monitor = (page:Page)=>{
    page.on('pageerror',error=>diagnostics.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')diagnostics.errors.push(message.text());});
  };
  for(const page of context.pages())monitor(page);context.on('page',monitor);
  await context.route('**/*',async route=>{
    const request=route.request(),base=request.url().split('#')[0];
    const allowed=request.isNavigationRequest() && (base===url || base===pathToFileURL(artifactPath).href);
    diagnostics.requests.push({url:allowed?'<artifact>':request.url(),allowed});
    if(allowed)await route.continue();else await route.abort();
  });
  await context.addInitScript(()=>{
    const active=new Set<string>();let created=0,revoked=0;
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);active.add(url);created++;return url;};
    URL.revokeObjectURL=url=>{revoke(url);if(active.delete(url))revoked++;};
    window.shareObjectUrls=()=>({created,revoked,outstanding:active.size});
  });
}
async function exported(page:Page){
  await page.locator('#studio-export-json').click();
  const delivery=page.waitForEvent('download');await page.locator('#studio-lifecycle-download').click();
  const received=await delivery,raw=await readFile(await received.path());
  await expect(page.getByRole('dialog',{name:'Export chart as JSON',exact:true}).getByRole('status')).toContainText('Handed off to your browser.');
  await page.keyboard.press('Escape');
  const document:unknown=JSON.parse(raw.toString('utf8'));return document;
}
for(const mode of ['file','http'] as const)for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  test(`fresh isolated ${mode} recipient ${String(viewport.width)}px keeps the full chart and releases native resources`,async({browser},info)=>{
    const diagnostics:Diagnostics={errors:[],requests:[]};
    const options={userAgent:UA,viewport,hasTouch:viewport.width<640,serviceWorkers:'block' as const};
    const source=await browser.newContext(options),recipient=await browser.newContext(options);
    const requestStart=wireRequests.length;
    try{
      await observe(source,diagnostics);await observe(recipient,diagnostics);
      const base=mode==='file'?pathToFileURL(artifactPath).href:url;
      const first=await source.newPage();await first.goto(base+fragment);
      await expect(first.locator('#studio-document-title')).toHaveValue(fixture.title);
      await first.locator('#studio-copy-share-link').click();
      const field=first.locator('#studio-exact-share-url');await field.focus();
      expect(await field.evaluate(el=>el instanceof HTMLTextAreaElement && el.selectionEnd-el.selectionStart===el.value.length)).toBe(true);
      const shared=await field.inputValue();await first.keyboard.press('Escape');
      const second=await recipient.newPage();await second.goto(mode==='http'?shared:base+new URL(shared).hash);
      await expect(second.locator('#studio-document-title')).toHaveValue(fixture.title);
      await expect(second.locator('#studio-recovery-keep')).toHaveCount(0);
      expect(await exported(second)).toEqual(fixture);
      expect(await second.evaluate(()=>window.shareObjectUrls?.())).toEqual({created:1,revoked:1,outstanding:0});
      await observeNativeSources(second);await second.locator('#studio-transport-play').click();
      await expect(second.locator('#studio-transport-pause')).toBeEnabled();
      await expect.poll(()=>second.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
      await second.locator('#studio-transport-stop').click();
      await expect.poll(()=>second.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
      const objects=await second.evaluate(()=>window.shareObjectUrls?.());expect(objects?.created).toBeGreaterThanOrEqual(1);
      expect(objects?.revoked).toBe(objects?.created);expect(objects?.outstanding).toBe(0);
      const wire=wireRequests.slice(requestStart);expect(wire.every(request=>request.path==='/' && request.userAgent===UA)).toBe(true);
      if(mode==='http')expect(wire.length).toBeGreaterThanOrEqual(2);
      await info.attach('fresh-context-transfer',{contentType:'application/json',body:JSON.stringify({artifactHash,browser:browser.version(),mode,viewport,
        objects,wire,audio:await second.evaluate(()=>window.u5NativeSourceCounts?.()),...diagnostics})});
      expect(diagnostics.errors).toEqual([]);expect(diagnostics.requests.filter(request=>!request.allowed)).toEqual([]);
    }finally{
      await source.close();await recipient.close();
    }
  });
}
for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  test.describe(`native clipboard lifetime ${String(viewport.width)}px`,()=>{
    test.use({viewport,hasTouch:viewport.width<640});
    test('Cancel, edit and reopen retire a pending native result and a fresh copy succeeds',async({context,page,browserName,browser},info)=>{
      const diagnostics:Diagnostics={errors:[],requests:[]};await observe(context,diagnostics);
      if(browserName==='chromium')await context.grantPermissions(['clipboard-read','clipboard-write']);
      await context.addInitScript(()=>{
        const clipboard=navigator.clipboard;
        const write=clipboard.writeText.bind(clipboard);window.shareClipboardCalls=0;window.shareClipboardSettled=false;
        Object.defineProperty(clipboard,'writeText',{configurable:true,value:(text:string)=>{
          window.shareClipboardCalls=(window.shareClipboardCalls??0)+1;
          const native=write(text);
          if(window.shareClipboardCalls!==1)return native;
          // The actual native side effect completes; only its receipt is held
          // to exercise the application's lifetime guard without a fake write.
          return new Promise<void>((resolve,reject)=>{
            native.then(()=>{window.shareClipboardSettled=true;window.shareClipboardRelease=resolve;},(error:unknown)=>{
              window.shareClipboardSettled=true;window.shareClipboardRelease=()=>{reject(error instanceof Error ? error : new Error("Native clipboard refused", {cause:error}));};
            });
          });
        }});
      });
      await page.goto(url+fragment);await expect(page.locator('#studio-document-title')).toHaveValue(fixture.title);
      await page.locator('#studio-copy-share-link').click();await page.locator('#studio-exact-share-copy').click();
      await expect.poll(()=>page.evaluate(()=>window.shareClipboardSettled)).toBe(true);
      await expect(page.locator('#studio-exact-share-copy')).toBeDisabled();
      await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('#studio-copy-share-link')).toBeFocused();
      await page.locator('#studio-document-title').fill('Edited after cancelled copy');await page.locator('#studio-document-title').press('Enter');
      const revision=await page.locator('.studio-document-status__revision').textContent();
      await page.locator('#studio-copy-share-link').click();await expect(page.locator('#studio-exact-share-copy')).toBeDisabled();
      await page.evaluate(()=>window.shareClipboardRelease?.());await expect(page.locator('#studio-exact-share-copy')).toBeEnabled();
      const dialog=page.getByRole('dialog',{name:'Share the exact chart',exact:true});await expect(dialog.getByRole('status')).toHaveCount(0);
      const link=await page.locator('#studio-exact-share-url').inputValue();
      expect(JSON.parse(Buffer.from(new URL(link).hash.slice(8),'base64url').toString('utf8'))).toEqual({...fixture,title:'Edited after cancelled copy'});
      await page.locator('#studio-exact-share-copy').click();await expect(dialog.getByRole('status')).toHaveText('Exact link copied.');
      expect(await page.evaluate(()=>window.shareClipboardCalls)).toBe(2);
      if(browserName==='chromium')expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(link);
      await page.keyboard.press('Escape');expect(await page.locator('.studio-document-status__revision').textContent()).toBe(revision);
      expect(await exported(page)).toEqual({...fixture,title:'Edited after cancelled copy'});
      await info.attach('native-clipboard-lifetime',{contentType:'application/json',body:JSON.stringify({artifactHash,browser:browser.version(),viewport,
        nativeCalls:await page.evaluate(()=>window.shareClipboardCalls),revision,objects:await page.evaluate(()=>window.shareObjectUrls?.()),...diagnostics})});
      expect(diagnostics.errors).toEqual([]);expect(diagnostics.requests.filter(request=>!request.allowed)).toEqual([]);
    });
  });
}
