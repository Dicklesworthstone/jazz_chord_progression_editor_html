import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createStudioCompositionOverState } from "../../src/application/studio-controller";
import { loopArrangementFixture } from "../support/loop-arrangement-fixture";
import { createMidiExportDownloadStart, type MidiExportDownloadAnchor } from "../../src/ui/midi-export-delivery";

const cleanup={objectUrlsCreated:1,objectUrlsRevoked:1,outstandingOwnedResources:0};
function setup(deferred=false,deferredDelivery=false) {
 const f=loopArrangementFixture(),downloads:Uint8Array[]=[];
 let finish:((digest:string)=>void)|undefined;
 let deliveryDone:(()=>void)|undefined;
 const composition=createStudioCompositionOverState(f.state,f.dependencies,{
  midiExportHashBytes:bytes=>deferred?new Promise<string>(resolve=>{finish=resolve;}):Promise.resolve(createHash("sha256").update(bytes).digest("hex")),
  midiExportDelivery:request=>{downloads.push(request.privateBytes);return {completion:deferredDelivery?new Promise<typeof cleanup>(resolve=>{deliveryDone=()=>{resolve(cleanup);};}):Promise.resolve(cleanup)};},
 });
 const service=composition.performedMidi;if(service===null)throw new Error("Unwired service");
 return {composition,service,downloads,deliveryDone:()=>{if(!deliveryDone)throw new Error("Missing delivery");deliveryDone();},finish:()=>{if(!finish)throw new Error("Missing hash request");finish("a".repeat(64));}};
}
test("real composition prepares chosen section and hands off one MIDI without history mutation",async()=>{
 const {composition,service,downloads}=setup(),before=composition.readApplicationState();
 const section=before.document.sections[1];if(!section)throw new Error("fixture");
 const ready=await service.prepare(section.id);expect(ready.state).toBe("ready");expect(ready.bars).toBe(1);expect(ready.notes).toBeGreaterThan(0);
 expect((await service.download()).state).toBe("delivered");await service.download();expect(downloads.length).toBe(1);
 expect([...downloads[0]?.slice(0,14)??[]]).toEqual([77,84,104,100,0,0,0,6,0,1,0,3,3,192]);
 expect(composition.readApplicationState()).toBe(before);
});
test("source edit invalidates ready bytes before any delivery side effect",async()=>{
 const {composition,service,downloads}=setup();expect((await service.prepare(null)).state).toBe("ready");
 expect(composition.controller.setTitle("Changed").ok).toBe(true);expect(service.read().state).toBe("stale");
 expect((await service.download()).state).toBe("stale");expect(downloads).toEqual([]);
});
test("canceled hashing cannot resurrect a preparation",async()=>{
 const {service,finish,downloads}=setup(true),pending=service.prepare(null);
 expect(service.read().state).toBe("preparing");service.cancel();finish();await pending;
 expect(service.read().state).toBe("idle");await service.download();expect(downloads).toEqual([]);
});
test("chart edit during hashing refuses the original snapshot",async()=>{
 const {composition,service,finish,downloads}=setup(true),pending=service.prepare(null);
 expect(composition.controller.setTitle("New revision").ok).toBe(true);finish();
 expect((await pending).state).toBe("stale");await service.download();expect(downloads).toEqual([]);
});
test("unsupported groove and nonexistent passage never fall back or download",async()=>{
 const {composition,service,downloads}=setup();
 expect((await service.prepare("deleted-section")).state).toBe("stale");
 expect(composition.controller.setPerformanceStyle("block-chords@1").ok).toBe(true);
 const result=await service.prepare(null);expect(result.state).toBe("refused");expect(result.message).toContain("Ballad comp");expect(downloads).toEqual([]);
});

test("a newly mounted subscriber sees pending delivery complete after the old subscriber leaves",async()=>{
 const {service,deliveryDone}=setup(false,true);await service.prepare(null);
 const oldStates:string[]=[],newStates:string[]=[];
 const old=service.subscribe(()=>{oldStates.push(service.read().state);});
 const pending=service.download();old();service.cancel();expect(service.read().state).toBe("delivering");
 const fresh=service.subscribe(()=>{newStates.push(service.read().state);});
 deliveryDone();await pending;fresh();
 expect(oldStates).toEqual(["delivering"]);expect(newStates).toEqual(["delivered"]);
 service.cancel();expect(newStates).toEqual(["delivered"]);
});

for (const fault of ["click", "remove"] as const) {
 test(`performed MIDI reports ${fault} failure through the real download adapter and permits a fresh download`,async()=>{
  const f=loopArrangementFixture(),urls=new Set<string>(),anchors=new Set<MidiExportDownloadAnchor>();
  let injected=true,activations=0,allocations=0;
  const composition=createStudioCompositionOverState(f.state,f.dependencies,{
   midiExportHashBytes:bytes=>Promise.resolve(createHash("sha256").update(bytes).digest("hex")),
   midiExportDelivery:createMidiExportDownloadStart({
    createObjectUrl:()=>{const url=`blob:midi-${String(++allocations)}`;urls.add(url);return url;},
    revokeObjectUrl:url=>{urls.delete(url);},
    createAnchor:()=>{
     const anchor:MidiExportDownloadAnchor={href:"",download:"",click:()=>{
      if(injected&&fault==="click")throw new Error("Browser activation failed");activations+=1;
     },remove:()=>{if(injected&&fault==="remove")throw new Error("Browser removal failed");anchors.delete(anchor);}};
     return anchor;
    },
    attachToDocument:anchor=>{anchors.add(anchor);},
   }),
  });
  const service=composition.performedMidi;if(service===null)throw new Error("Unwired MIDI service");
  const before=composition.readApplicationState();
  expect((await service.prepare(null)).state).toBe("ready");
  const failed=await service.download();expect(failed.state).toBe("refused");
  expect(failed.message).toContain(fault==="click"?"could not complete":"cleanup could not be confirmed");
  expect(urls.size).toBe(0);expect(anchors.size).toBe(fault==="remove"?1:0);
  expect(activations).toBe(fault==="remove"?1:0);
  await service.download();expect(allocations).toBe(1);
  injected=false;for(const anchor of anchors)anchor.remove();
  expect((await service.prepare(null)).state).toBe("ready");
  expect((await service.download()).state).toBe("delivered");
  expect(urls.size).toBe(0);expect(anchors.size).toBe(0);
  expect(activations).toBe(fault==="remove"?2:1);
  expect(composition.readApplicationState()).toBe(before);
 });
}
