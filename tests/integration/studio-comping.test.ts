import type {PlaybackPlan} from "../../src/playback";
import {expect,test} from "bun:test";
import {createHash} from "node:crypto";
import {createStudioCompositionOverState} from "../../src/application/studio-controller";
import {createStudioAudio,type StudioAudioPort} from "../../src/application/studio-audio";
import {createFakeAudioPlatform} from "../../src/test-support/fake-audio-platform";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
const cleanup={objectUrlsCreated:1,objectUrlsRevoked:1,outstandingOwnedResources:0};
function setup(deferred=false,audio?:StudioAudioPort){
 const f=loopArrangementFixture(),downloads:Uint8Array[]=[],recipes:string[]=[];let finish:((hash:string)=>void)|undefined;
 const composition=createStudioCompositionOverState(f.state,f.dependencies,{
  ...(audio===undefined?{}:{audio}),
  midiExportHashBytes:bytes=>deferred?new Promise<string>(resolve=>{finish=resolve;}):Promise.resolve(createHash("sha256").update(bytes).digest("hex")),
  midiExportDelivery:r=>{downloads.push(r.privateBytes);return {completion:Promise.resolve(cleanup)};},
  prepareCompRecipeDownload:(text)=>()=>{recipes.push(text);return true;},
 });const service=composition.comping;if(service===null)throw new Error("Missing rhythm service");
 return {composition,service,downloads,recipes,finish:()=>{if(finish===undefined)throw new Error("No pending hash");finish("a".repeat(64));}};
}
/** Separate SMF reader observes attacks/gates, with no production MIDI decoder. */
function notes(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=14;const out:{track:number;tick:number;on:boolean;pitch:number;velocity:number}[]=[];
 const byte=():number=>{const n=bytes[at++];if(n===undefined)throw new Error("EOF");return n;};
 const vlq=():number=>{let n=0;for(let i=0;i<4;i++){const b=byte();n=n*128+(b&127);if(b<128)return n;}throw new Error("VLQ");};
 for(let track=0;track<3;track++){expect([...bytes.slice(at,at+4)]).toEqual([77,84,114,107]);at+=4;const end=at+4+view.getUint32(at);at+=4;let tick=0;
  while(at<end){tick+=vlq();const status=byte();if(status===255){byte();const length=vlq();at+=length;}else{const pitch=byte(),velocity=byte();out.push({track,tick,on:(status&240)===144,pitch,velocity});}}expect(at).toBe(end);
 }expect(at).toBe(bytes.length);return out;
}
test("actual composition shares exact rhythm with MIDI and keeps chart/history untouched",async()=>{
 const {composition,service,downloads,recipes}=setup(),before=composition.readApplicationState();
 service.setPassage("loop-section-1");service.setPreset(2);await service.prepareMidi();expect(service.read().state).toBe("ready");
 expect(service.read()).toMatchObject({attacks:2,notes:8});await service.downloadMidi();await service.downloadMidi();expect(downloads.length).toBe(1);
 const bytes=downloads[0];if(bytes===undefined)throw new Error("No MIDI");
 const expected=[{tick:0,gate:240,velocity:112},{tick:1440,gate:240,velocity:80}].flatMap(e=>[false,true].map(off=>[62,65,69,72].map(pitch=>({track:2,tick:e.tick+(off?e.gate:0),on:!off,pitch,velocity:off?0:e.velocity})))).flat();
 expect(notes(bytes)).toEqual(expected);
 service.downloadRecipe();expect(JSON.parse(recipes[0]??"null")).toEqual(service.read().recipe);
 expect(composition.readApplicationState()).toBe(before);
});
test("canceled or edited inputs cannot resurrect hashed bytes",async()=>{
 for(const operation of ["stop","slot","gate","preset","passage","document"]){
  const {composition,service,finish,downloads}=setup(true),pending=service.prepareMidi();expect(service.read().state).toBe("preparing");
  if(operation==="stop")await service.stop();else if(operation==="slot")service.setSlot(0);else if(operation==="gate")service.setGate(120);else if(operation==="preset")service.setPreset(1);else if(operation==="passage")service.setPassage("loop-section-1");else composition.controller.setTitle("Edited");
  finish();await pending;expect(service.read().state).not.toBe("ready");await service.downloadMidi();expect(downloads).toEqual([]);
 }
});
test("ready bytes refuse a later chart edit; unsupported passage and silent draft stay explicit",async()=>{
 const {composition,service,downloads}=setup();await service.prepareMidi();composition.controller.setTitle("Changed");expect(service.read().state).toBe("stale");await service.downloadMidi();expect(downloads).toEqual([]);
 service.setPassage("missing");await service.prepareMidi();expect(service.read().state).toBe("refused");service.setPassage(null);
 const silent={schema:"changes.comp-recipe.v1",slots:Array.from({length:16},()=>0),gateTicks:240} as const;service.previewRecipe(JSON.stringify(silent));service.applyRecipe();await service.prepareMidi();
 expect(service.read().state).toBe("refused");expect(service.read().message).toContain("No notes");expect(service.read().recipe).toEqual(silent);
 service.previewRecipe('{"malicious":true}');service.applyRecipe();expect(service.read().recipe).toEqual(silent);
 service.setPreset(0);await service.prepareMidi();expect(service.read().state).toBe("ready");
});
test("real preview owner releases this rhythm and preserves a newer unrelated preview",async()=>{
 const audio=createStudioAudio(createFakeAudioPlatform().platform),plans:PlaybackPlan[]=[];
 const port:StudioAudioPort={...audio,startPreview(...args){if(args[5]!==undefined)plans.push(args[5].plan);return audio.startPreview(...args);}};
 const {composition,service}=setup(false,port);
 try{
  await service.hear({kind:"trusted-keyboard",trusted:true,sequence:1});expect(service.read().message).toContain("Playing one pass");
  expect(plans[0]?.events.map((e):readonly unknown[]=>[e.startTick,e.gateDurationTicks,e.velocity,e.midiPitches])).toEqual([0,960,1920,2880,3840,4800,5760,6720].map((t,i)=>[t,240,i%4===0?112:80,i<4?[60,64,67,71]:[62,65,69,72]]));
  expect(audio.transportService.readPreviewStatus().status).toBe("running");await service.stop();expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
  await service.hear({kind:"trusted-keyboard",trusted:true,sequence:2});
  const unrelated=plans[0];if(unrelated===undefined)throw new Error("Missing preview plan");
  expect((await composition.controller.previewPlaybackPlan(unrelated,{kind:"trusted-keyboard",trusted:true,sequence:3})).ok).toBe(true);
  await service.stop();
  expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
  await composition.controller.releasePreviewPitches();expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
 }finally{await audio.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}});}
},30000);
test("Stop or a source edit during real preparation prevents a late rhythm attack",async()=>{
 for(const action of ["stop","edit"]){
  const audio=createStudioAudio(createFakeAudioPlatform().platform);let unblock:(()=>void)|undefined,entered:(()=>void)|undefined,starts=0;
  const hold=new Promise<void>(resolve=>{unblock=resolve;}),preparing=new Promise<void>(resolve=>{entered=resolve;});
  const port:StudioAudioPort={...audio,async prepareInstrument(...args){entered?.();await hold;return audio.prepareInstrument(...args);},startPreview(...args){starts+=1;return audio.startPreview(...args);}};
  const {composition,service}=setup(false,port);
  try{
   const pending=service.hear({kind:"trusted-keyboard",trusted:true,sequence:1});await preparing;
   if(action==="stop")await service.stop();else expect(composition.controller.setTitle("Changed during sample preparation").ok).toBe(true);
   if(unblock===undefined)throw new Error("No preparation latch");unblock();await pending;
   expect({action,starts}).toEqual({action,starts:0});expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
   expect(service.read().message).not.toContain("Playing one pass");
  }finally{await audio.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}});}
 }
},30000);
test("recipe files are bounded before reading and late reads cannot replace newer input",async()=>{
 const {service}=setup();let reads=0,finish:((text:string)=>void)|undefined;
 await service.previewRecipeFile({size:2049,text:()=>{reads+=1;return Promise.resolve("{}");}});expect(reads).toBe(0);expect(service.read().importDraft).toBeNull();
 const pending=service.previewRecipeFile({size:100,text:()=>new Promise(resolve=>{finish=resolve;})});
 const recipe={schema:"changes.comp-recipe.v1",slots:Array.from({length:16},()=>2),gateTicks:120} as const;
 service.previewRecipe(JSON.stringify(recipe));if(finish===undefined)throw new Error("No file read");finish("{}");await pending;
 expect(service.read().importDraft).toEqual(recipe);service.applyRecipe();expect(service.read().recipe).toEqual(recipe);
 const stopped=service.previewRecipeFile({size:100,text:()=>new Promise(resolve=>{finish=resolve;})});await service.stop();finish(JSON.stringify(recipe));await stopped;
 expect(service.read().importDraft).toBeNull();
 await service.previewRecipeFile({size:100,text:()=>Promise.reject(new Error("read failed"))});expect(service.read().message).toContain("could not be read");
});
