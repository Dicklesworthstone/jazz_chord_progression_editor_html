import {expect,test} from "bun:test";
import {createHash} from "node:crypto";
import {createStudioCompositionOverState} from "../../src/application/studio-controller";
import {createDryPianoRenderer} from "../../src/audio/dry-piano-render";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
function setup(pause:"none"|"render"|"hash"="none",cleanup=true){
 const f=loopArrangementFixture(),downloads:Uint8Array[]=[];let prepared=0,yields=0,release:(()=>void)|undefined,reached:(()=>void)|undefined;
 const paused=new Promise<void>(resolve=>{reached=resolve;});
 const gate=()=>new Promise<void>(resolve=>{release=resolve;reached?.();});
 const composition=createStudioCompositionOverState(f.state,f.dependencies,{
  dryPianoRender:createDryPianoRenderer(()=>{yields++;return pause==="render"&&yields===1?gate():Promise.resolve();}),
  midiExportHashBytes:async bytes=>{if(pause==="hash")await gate();return createHash("sha256").update(bytes).digest("hex");},
  prepareWavDownload:bytes=>{prepared++;return()=>{downloads.push(bytes);return{issued:true,objectUrlsCreated:1,objectUrlsRevoked:cleanup?1:0,outstandingOwnedResources:cleanup?0:1};};},
 });
 const service=composition.wav;if(service===null)throw new Error("WAV is unwired");
 return{composition,service,downloads,paused,prepared:()=>prepared,resume:()=>{if(release===undefined)throw new Error("No pending operation");release();}};
}
test("composition renders actual piano despite a different live instrument and downloads one exact WAV without dirty-state mutation",async()=>{
 const f=setup(),before=f.composition.readApplicationState();expect(before.document.playback.instrumentId).toBe("analog-poly");
 f.service.setPassage("loop-section-1");await f.service.prepare();expect(f.service.read().state).toBe("ready");expect(f.service.read().byteLength).toBe(153644);
 const digest=f.service.read().sha256;if(digest===null)throw new Error("Missing fingerprint");f.service.download();f.service.download();expect(f.service.read().state).toBe("delivered");expect(f.downloads.length).toBe(1);
 const bytes=f.downloads[0];if(bytes===undefined)throw new Error("Missing WAV");expect(Buffer.from(bytes.subarray(0,4)).toString()).toBe("RIFF");expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
 expect(f.composition.readApplicationState()).toBe(before);
});
for(const pause of ["render","hash"] as const){
 test(`cancel during ${pause} keeps ownership until completion and cannot resurrect bytes`,async()=>{
  const f=setup(pause),pending=f.service.prepare();await f.paused;f.service.cancel();expect(f.service.read().busy).toBe(true);expect(f.service.read().state).toBe("cancelling");
  await f.service.prepare();expect(f.prepared()).toBe(0);f.resume();await pending;expect(f.service.read().busy).toBe(false);expect(f.service.read().state).toBe("idle");expect(f.prepared()).toBe(0);f.service.download();expect(f.downloads).toEqual([]);
 });
 test(`source edit during ${pause} retires the original job`,async()=>{
  const f=setup(pause),pending=f.service.prepare();await f.paused;expect(f.composition.controller.setTitle("New source").ok).toBe(true);f.resume();await pending;
  expect(f.service.read().state).toBe("stale");expect(f.service.read().byteLength).toBe(0);expect(f.prepared()).toBe(0);f.service.download();expect(f.downloads).toEqual([]);
 });
}
test("passage change cancels pending source and permits a fresh section after it relinquishes ownership",async()=>{
 const f=setup("render"),pending=f.service.prepare();await f.paused;f.service.setPassage("loop-section-1");f.resume();await pending;await f.service.prepare();expect(f.service.read().state).toBe("ready");expect(f.service.read().byteLength).toBe(153644);
});
test("ready bytes become stale synchronously when the source revision changes",async()=>{
 const f=setup();await f.service.prepare();expect(f.service.read().state).toBe("ready");expect(f.composition.controller.setTitle("Edited").ok).toBe(true);expect(f.service.read().state).toBe("stale");f.service.download();expect(f.downloads).toEqual([]);expect(f.service.read().sha256).toBeNull();
});
test("unknown section and failed resource cleanup are explicit refusals",async()=>{
 const f=setup("none",false);f.service.setPassage("missing");await f.service.prepare();expect(f.service.read().state).toBe("refused");expect(f.prepared()).toBe(0);
 f.service.setPassage(null);await f.service.prepare();f.service.download();expect(f.service.read().state).toBe("refused");expect(f.service.read().message).toContain("cleanup");expect(f.downloads.length).toBe(1);
});

for(const pause of ["render","hash"] as const){
 test(`excerpt change during ${pause} clears bytes without overlapping the current job`,async()=>{
  const f=setup(pause),pending=f.service.prepare();await f.paused;
  f.service.setExcerpt({startBar:2,barCount:1});expect(f.service.read().busy).toBe(true);
  await f.service.prepare();expect(f.prepared()).toBe(0);f.resume();await pending;
  expect(f.service.read().state).toBe("idle");expect(f.service.read().sha256).toBeNull();
  f.service.download();expect(f.downloads).toEqual([]);
 });
}
test("ready excerpt changes invalidate the old file and section selection resets explicit bars",async()=>{
 const f=setup();await f.service.prepare();expect(f.service.read().state).toBe("ready");
 const choice={startBar:2,barCount:1};f.service.setExcerpt(choice);choice.startBar=1;
 expect(f.service.read().excerpt).toEqual({startBar:2,barCount:1});expect(f.service.read().sha256).toBeNull();
 f.service.download();expect(f.downloads).toEqual([]);await f.service.prepare();expect(f.service.read().byteLength).toBe(153644);
 f.service.setPassage("loop-section-1");expect(f.service.read().excerpt).toBeNull();expect(f.service.read().availableBars).toBe(1);
});
