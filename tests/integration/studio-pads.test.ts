import {expect,test} from "bun:test";
import {createStudioCompositionOverState} from "../../src/application/studio-controller";
import {createStudioAudio,type StudioAudioPort} from "../../src/application/studio-audio";
import {createFakeAudioPlatform} from "../../src/test-support/fake-audio-platform";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
const gesture=(sequence:number)=>({kind:"trusted-keyboard",trusted:true,sequence} as const);
function setup(deferred=false){
 const f=loopArrangementFixture(),audio=createStudioAudio(createFakeAudioPlatform().platform),starts:{midi:readonly number[];gate:number}[]=[],prepared:number[]=[];
 const barriers:(()=>void)[]=[],arrivals:(()=>void)[]=[];
 const port:StudioAudioPort={...audio,async prepareInstrument(...args){prepared.push(...args[1].map(n=>n.gateSeconds??-1));if(deferred)await new Promise<void>(resolve=>{barriers.push(resolve);arrivals.shift()?.();});return audio.prepareInstrument(...args);},startPreview(...args){starts.push({midi:[...args[3]],gate:args[4]});return audio.startPreview(...args);}};
 const c=createStudioCompositionOverState(f.state,f.dependencies,{audio:port});
 const source=(eventId="loop-event-0")=>({documentId:c.readApplicationState().document.id,revision:c.readApplicationState().revision,eventId});
 return {c,audio,starts,prepared,source,wait:()=>barriers.length>0?Promise.resolve():new Promise<void>(resolve=>arrivals.push(resolve)),finish:()=>{const release=barriers.shift();if(release===undefined)throw new Error("Missing prepare barrier");release();},dispose:()=>audio.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}})};
}
test("held and tapped pads submit exact gates/notes without chart or selection edits",async()=>{
 const x=setup();try{
  const before=x.c.readApplicationState(),view=x.c.controller.readPads(null,0);expect(view.ok).toBe(true);
  const held=x.c.controller.pressPad(x.source(),gesture(1),true);expect((await held.completion).ok).toBe(true);expect(x.starts).toEqual([{midi:[60,64,67,71],gate:8}]);expect(x.prepared).toEqual([8,8,8,8]);
  await x.c.controller.releasePad(held.id);expect(x.audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
  const tap=x.c.controller.pressPad(x.source("loop-event-1"),gesture(2),false);expect((await tap.completion).ok).toBe(true);expect(x.starts[1]).toEqual({midi:[62,65,69,72],gate:1.2});await x.c.controller.releasePad(tap.id);
  const after=x.c.readApplicationState();expect(after.document).toBe(before.document);expect(after.history).toBe(before.history);expect(after.bookmarks.selection).toEqual(before.bookmarks.selection);
 }finally{await x.dispose();}
},30000);
for(const operation of ["release","edit","stop"] as const)test(`pending pad ${operation} prevents late attack`,async()=>{
 const x=setup(true);try{
  const pending=x.c.controller.pressPad(x.source(),gesture(1),true);await x.wait();
  if(operation==="release")await x.c.controller.releasePad(pending.id);else if(operation==="edit")expect(x.c.controller.setTitle("Edited").ok).toBe(true);else expect(x.c.controller.stopProgression().ok).toBe(true);
  x.finish();expect((await pending.completion).ok).toBe(false);expect(x.starts).toEqual([]);expect(x.audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
 }finally{await x.dispose();}
},30000);
test("old request release cannot retire its replacement or unrelated preview",async()=>{
 const x=setup();try{
  const a=x.c.controller.pressPad(x.source(),gesture(1),true);await a.completion;
  const b=x.c.controller.pressPad(x.source("loop-event-1"),gesture(2),true);expect((await b.completion).ok).toBe(true);
  await x.c.controller.releasePad(a.id);expect(x.audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
  const view=x.c.controller.readInspector("loop-event-0");if(!view.ok)throw new Error(view.message);
  expect(x.c.controller.selectEvent("loop-event-0").ok).toBe(true);
  expect((await x.c.controller.previewInspector(view.value.source,{kind:"current"},gesture(4))).ok).toBe(true);
  await x.c.controller.releasePad(b.id);expect(x.audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
  await x.c.controller.releaseInspectorPreview(view.value.source);expect(x.audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
 }finally{await x.dispose();}
},30000);
test("stale, foreign and absent pad sources refuse without a start",async()=>{
 const x=setup();try{const before=x.source();x.c.controller.setTitle("Changed");for(const source of [before,{...x.source(),documentId:"wrong"},x.source("absent")])expect((await x.c.controller.pressPad(source,gesture(1),true).completion).ok).toBe(false);expect(x.starts).toEqual([]);}finally{await x.dispose();}
});
test("literal duplicate voices survive actual held submission",async()=>{
 const x=setup();try{
  expect(x.c.controller.selectEvent("loop-event-0").ok).toBe(true);
  expect(x.c.controller.applyInspectorChange(x.source(),{kind:"manual",bassPolicy:"included",pitches:[{step:"C",alter:0,octave:4},{step:"C",alter:0,octave:4},{step:"E",alter:0,octave:4}]}).ok).toBe(true);
  const p=x.c.controller.pressPad(x.source(),gesture(1),true);expect((await p.completion).ok).toBe(true);expect(x.starts).toEqual([{midi:[60,60,64],gate:8}]);await x.c.controller.releasePad(p.id);
 }finally{await x.dispose();}
});
test("a newer press cancels pending preparation before either promise resolves",async()=>{
 const f=loopArrangementFixture(),audio=createStudioAudio(createFakeAudioPlatform().platform),starts:number[][]=[];
 let arriveA:()=>void=()=>{},arriveB:()=>void=()=>{},finishA:()=>void=()=>{},finishB:()=>void=()=>{},calls=0;
 const readyA=new Promise<void>(r=>{arriveA=r;}),readyB=new Promise<void>(r=>{arriveB=r;});
 const port:StudioAudioPort={...audio,async prepareInstrument(...args){calls+=1;if(calls===1)await new Promise<void>(r=>{finishA=r;arriveA();});else await new Promise<void>(r=>{finishB=r;arriveB();});return audio.prepareInstrument(...args);},startPreview(...args){starts.push([...args[3]]);return audio.startPreview(...args);}};
 const c=createStudioCompositionOverState(f.state,f.dependencies,{audio:port}),source=(eventId:string)=>({documentId:f.state.document.id,revision:f.state.revision,eventId});
 try{
  const a=c.controller.pressPad(source("loop-event-0"),gesture(1),true);await readyA;
  const b=c.controller.pressPad(source("loop-event-1"),gesture(2),true);await readyB;
  finishA();expect((await a.completion).ok).toBe(false);finishB();expect((await b.completion).ok).toBe(true);
  await c.controller.releasePad(a.id);expect(starts).toEqual([[62,65,69,72]]);expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
  await c.controller.releasePad(b.id);expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
 }finally{await audio.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}});}
},30000);
