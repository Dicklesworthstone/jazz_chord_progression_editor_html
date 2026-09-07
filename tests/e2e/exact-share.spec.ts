import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import fixture from "../fixtures/exact-share/document.changes.json" with { type: "json" };
import { observeNativeSources } from "../support/u5-native-audio";

declare global { interface Window { exactShareAudioContexts?: number } }
const artifactPath = resolve("jazz_chord_progression_editor.html"), artifact = readFileSync(artifactPath);
const artifactHash = createHash("sha256").update(artifact).digest("hex");
const fixtureHash = createHash("sha256").update(readFileSync(resolve("tests/fixtures/exact-share/document.changes.json"))).digest("hex");
const fragment = `#zdoc=2.${Buffer.from(JSON.stringify(fixture)).toString("base64url")}`;
let server: Server, httpUrl: string;
let errors: string[], requests: { url: string; allowed: boolean }[];
test.use({ userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", contextOptions: { reducedMotion: "reduce" } });
test.beforeAll(async () => {
  server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(artifact); });
  await new Promise<void>(done => { server.listen(0,"127.0.0.1",done); });
  const address = server.address(); if(address===null || typeof address==="string") throw new Error("No loopback address");
  httpUrl=`http://127.0.0.1:${String(address.port)}/`;
});
test.afterAll(async () => { await new Promise<void>((done,reject) => { server.close(error => { if(error)reject(error);else done(); }); }); });
test.beforeEach(async ({ context }) => {
  errors=[];requests=[];
  for(const page of context.pages()) monitor(page);
  context.on("page", monitor);
  await context.route("**/*",async route => {
    const url=route.request().url(),base=url.split("#")[0];
    const allowed=route.request().isNavigationRequest() && (base===httpUrl || base===pathToFileURL(artifactPath).href);
    requests.push({url,allowed});if(allowed)await route.continue();else await route.abort();
  });
  await context.addInitScript(() => {
    window.exactShareAudioContexts=0;
    const Native=window.AudioContext;
    window.AudioContext=class extends Native { constructor(options?:AudioContextOptions) {
      super(options);window.exactShareAudioContexts=(window.exactShareAudioContexts??0)+1;
    } };
  });
});
function monitor(page: Page) {
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
}
test.afterEach(async ({ page,browser },info)=>{
  await info.attach("exact-share-diagnostics",{contentType:"application/json",body:JSON.stringify({artifactHash,fixtureHash,
    browser:browser.version(),viewport:page.viewportSize(),errors,requests,
    audio:await page.evaluate(()=>window.u5NativeSourceCounts?.()).catch(()=>null)})});
  expect(errors).toEqual([]);expect(requests.filter(request=>!request.allowed)).toEqual([]);
});
async function downloadJson(page: Page) {
  await page.locator("#studio-export-json").click();
  return finishDownload(page);
}
async function finishDownload(page: Page) {
  const dialog=page.getByRole("dialog",{name:"Export chart as JSON",exact:true});await expect(dialog).toBeVisible();
  const delivered=page.waitForEvent("download");await page.locator("#studio-lifecycle-download").click();
  const download=await delivered,bytes=await readFile(await download.path());
  await expect(dialog.getByRole("status")).toContainText("Handed off to your browser.");
  await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);
  const document: unknown = JSON.parse(bytes.toString("utf8"));
  return {filename:download.suggestedFilename(),bytes:bytes.length,document};
}
for(const mode of ["file","http"] as const)for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568}]){
  test.describe(`exact sharing ${mode} ${String(viewport.width)}px`,()=>{
    test.use({viewport,hasTouch:viewport.width<640});
    const base=()=>mode==="file"?pathToFileURL(artifactPath).href:httpUrl;
    test("exact link preserves the voiced chart through another real startup, download and native Play/Stop",async({page,context,browserName},info)=>{
      await page.goto(base()+fragment);await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      expect(await page.evaluate(()=>window.exactShareAudioContexts)).toBe(0);
      if(browserName==="chromium" && mode==="http")await context.grantPermissions(["clipboard-read","clipboard-write"]);
      await page.locator("#studio-copy-share-link").click();
      const dialog=page.getByRole("dialog",{name:"Share the exact chart",exact:true});await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading",{name:"Share the exact chart",exact:true})).toBeFocused();
      await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
      const url=await page.locator("#studio-exact-share-url").inputValue();
      expect(url.startsWith(mode==="file"?"https://jazzchords.org/#zdoc=2.":base()+"#zdoc=2.")).toBe(true);
      expect(JSON.parse(Buffer.from(new URL(url).hash.slice(8),"base64url").toString("utf8"))).toEqual(fixture);
      await page.locator("#studio-exact-share-copy").click();
      await expect(dialog.getByRole("status")).toContainText(/Exact link copied|Clipboard access was unavailable/u);
      const outcome=await dialog.getByRole("status").textContent();
      if(browserName==="chromium" && mode==="http")expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(url);
      // Native selection remains usable when this browser refuses clipboard.
      await page.locator("#studio-exact-share-url").focus();await page.keyboard.press("ControlOrMeta+A");
      expect(await page.locator("#studio-exact-share-url").evaluate(element=>element instanceof HTMLTextAreaElement && element.selectionEnd-element.selectionStart)).toBe(url.length);
      await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);
      await expect(page.locator("#studio-copy-share-link")).toBeFocused();
      const recipient=await context.newPage();
      // A downloaded studio opens the same exact fragment locally; the copied
      // file-mode URL above correctly points at the public app, never a path.
      await recipient.goto(mode==="http"?url:base()+new URL(url).hash);
      await expect(recipient.locator("#studio-document-title")).toHaveValue(fixture.title);
      expect(await recipient.evaluate(()=>window.exactShareAudioContexts)).toBe(0);
      const exported=await downloadJson(recipient);expect(exported.document).toEqual(fixture);
      await recipient.locator("#studio-undo").click();await expect(recipient.locator("#studio-document-title")).toHaveValue("Untitled Chart");
      await recipient.locator("#studio-redo").click();await expect(recipient.locator("#studio-document-title")).toHaveValue(fixture.title);
      await observeNativeSources(recipient);await recipient.locator("#studio-transport-play").click();
      await expect(recipient.locator("#studio-transport-pause")).toBeEnabled();
      await expect.poll(()=>recipient.evaluate(()=>window.u5NativeSourceCounts?.().started??0)).toBeGreaterThan(0);
      await recipient.locator("#studio-transport-stop").click();
      await expect.poll(()=>recipient.evaluate(()=>window.u5NativeSourceCounts?.())).toMatchObject({sounding:0,futureAttacks:0});
      expect(await recipient.evaluate(()=>window.exactShareAudioContexts)).toBe(1);
      await info.attach("exact-share-transfer",{contentType:"application/json",body:JSON.stringify({outcome,fragmentChars:new URL(url).hash.length,
        exported,audio:await recipient.evaluate(()=>window.u5NativeSourceCounts?.())})});
      await recipient.close();
    });
    test("large exact JSON fallback is explicit, lossless and returns focus without nested dialogs",async({page},info)=>{
      await page.goto(base());await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
      const large={...fixture,description:"🎹".repeat(2000)};
      await page.locator("#studio-import-chart").click();
      await page.locator("#studio-import-file").setInputFiles({name:"large.changes.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(large))});
      await page.locator("#studio-import-commit").click();await page.locator("#studio-import-confirm").click();
      await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      const downloads:string[]=[];page.on("download",d=>downloads.push(d.suggestedFilename()));
      await page.locator("#studio-copy-share-link").click();const share=page.getByRole("dialog",{name:"Share the exact chart",exact:true});
      await expect(share.getByRole("alert")).toContainText("too large");await expect(page.locator("#studio-exact-share-url")).toHaveCount(0);
      expect(downloads).toEqual([]);await page.locator("#studio-exact-share-json").click();
      await expect(share).toHaveCount(0);await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
      const exported=await finishDownload(page);expect(exported.document).toEqual(large);expect(downloads).toHaveLength(1);
      await expect(page.locator("#studio-export-json")).toBeFocused();
      await info.attach("exact-fallback",{contentType:"application/json",body:JSON.stringify({filename:exported.filename,bytes:exported.bytes,downloads})});
    });
    test("Share traps focus, respects small layouts and preserves chart state on Cancel",async({page},info)=>{
      await page.goto(base()+fragment);await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      await page.locator("#studio-copy-share-link").click();const dialog=page.getByRole("dialog",{name:"Share the exact chart",exact:true});
      await expect(dialog).toBeVisible();const route:string[]=[];
      for(let i=0;i<10;i++){await page.keyboard.press(i<5?"Tab":"Shift+Tab");expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);route.push(await page.evaluate(()=>document.activeElement?.id??"missing"));}
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
      const axe=await new AxeBuilder({page}).setLegacyMode(true).include("#studio-exact-share-dialog").analyze();expect(axe.violations).toEqual([]);
      await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);await expect(page.locator("#studio-copy-share-link")).toBeFocused();
      const exported=await downloadJson(page);expect(exported.document).toEqual(fixture);
      await info.attach("exact-share-focus",{contentType:"application/json",body:JSON.stringify({route,violations:axe.violations})});
    });
  });
}

for (const mode of ["file", "http"] as const) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`exact startup ${mode} ${String(viewport.width)}px`, () => {
    test.use({ viewport, hasTouch: viewport.width < 640 });
    const base = () => mode === "file" ? pathToFileURL(artifactPath).href : httpUrl;
    test("refused exact source never seeds a demo or initializes audio", async ({ page }) => {
      const duplicate = JSON.stringify(fixture).replace('"numerator":5', '"numerator":5,"\\u006eumerator":5');
      await page.goto(base() + '#zdoc=2.' + Buffer.from(duplicate).toString("base64url"));
      await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
      await expect(page.locator(".studio-shell-notice")).toContainText("duplicate");
      await expect(page.locator("#studio-document-title")).toHaveValue("Untitled Chart");
      await expect(page.locator(".studio-chord-card")).toHaveCount(0);
      await expect(page.locator("#studio-undo")).toBeDisabled();
      expect(await page.evaluate(() => window.exactShareAudioContexts)).toBe(0);
      // A subsequent explicit sharing gesture still sees the empty chart.
      await page.locator("#studio-copy-share-link").click();
      const link = await page.locator("#studio-exact-share-url").inputValue();
      expect(new URL(link).hash.startsWith("#zdoc=2.")).toBe(true);
    });
    test("explicit exact startup keeps stored recovery as a choice and Keep restores its real bytes", async ({ page }, info) => {
      await page.goto(base()); await expect(page.locator("#studio-document-title")).toHaveValue("Deacon Blues");
      await page.locator("#studio-document-title").fill("Stored before exact link");
      await page.locator("#studio-document-title").press("Enter");
      await expect(page.locator("#studio-recovery-status")).toContainText("Recovered locally at");
      const stored = await downloadJson(page);
      await page.goto(base() + fragment); await page.reload();
      await expect(page.locator("#studio-recovery-keep")).toBeVisible();
      await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
      expect(await page.evaluate(() => window.exactShareAudioContexts)).toBe(0);
      await page.locator("#studio-recovery-keep").click();
      await expect(page.locator("#studio-document-title")).toHaveValue("Stored before exact link");
      const restored = await downloadJson(page); expect(restored.document).toEqual(stored.document);
      await info.attach("exact-share-recovery", { contentType: "application/json", body: JSON.stringify({ stored, restored }) });
    });
  });
}

test.describe("exact share 200% equivalent layout", () => {
  test.use({ viewport: { width: 640, height: 450 } });
  test("keyboard and exact link remain usable with reduced motion at half the desktop CSS viewport", async ({ page }, info) => {
    await page.goto(pathToFileURL(artifactPath).href + fragment);
    await expect(page.locator("#studio-document-title")).toHaveValue(fixture.title);
    await page.locator("#studio-copy-share-link").focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Share the exact chart", exact: true });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("#studio-exact-share-url").focus(); await page.keyboard.press("ControlOrMeta+A");
    const selected = await page.locator("#studio-exact-share-url").evaluate(el => el instanceof HTMLTextAreaElement && el.selectionEnd - el.selectionStart === el.value.length);
    expect(selected).toBe(true);
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include("#studio-exact-share-dialog").analyze();
    expect(axe.violations).toEqual([]);
    await page.keyboard.press("Escape"); await expect(page.locator("#studio-copy-share-link")).toBeFocused();
    await info.attach("exact-share-zoom", { contentType: "application/json", body: JSON.stringify({ selected, violations: axe.violations }) });
  });
});
