import {expect,test} from "bun:test";
import {createStudioCompositionOverState} from "../../src/application/studio-controller";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
import {parseStableId,type StableIdFactory} from "../../src/domain";
import {createStudioAudio,type StudioAudioPort} from "../../src/application/studio-audio";
import {createFakeAudioPlatform} from "../../src/test-support/fake-audio-platform";
const named=(name:string,acknowledgeEnharmonic=false)=>({name,customLabel:"",acknowledgeEnharmonic});
function setup(){const f=loopArrangementFixture();return createStudioCompositionOverState(f.state,f.dependencies);}
test("notes insert one full Manual bar in the explicitly chosen section, with one exact Undo and Redo",()=>{
  const c=setup(),before=c.readApplicationState(),controller=c.controller;
  const text="A3 C4 E4 G4 A3",draft=controller.readNoteFirst(text);
  const result=controller.insertNoteFirst(draft.source,text,named("C6/A"),"loop-section-1");
  expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.refusal.message);
  const after=c.readApplicationState();expect(after.document.sections[0]).toEqual(before.document.sections[0]);
  const bar=after.document.sections[1]?.measures[1],event=bar?.events[0];
  expect(bar?.completion).toEqual({kind:"complete"});expect([event?.duration.numerator,event?.duration.denominator]).toEqual([4,1]);
  expect(event?.chord.sourceText).toBe("C6/A");expect(event?.voicing.mode).toBe("manual");
  if(event?.voicing.mode!=="manual")throw new Error("Expected Manual");
  expect(event.voicing.pitches).toEqual([{step:"A",alter:0,octave:3},{step:"C",alter:0,octave:4},{step:"E",alter:0,octave:4},{step:"G",alter:0,octave:4},{step:"A",alter:0,octave:3}]);
  expect(after.revision).toBe(before.revision+1);
  expect(controller.undo().ok).toBe(true);expect(c.readApplicationState().document).toEqual(before.document);
  expect(controller.redo().ok).toBe(true);expect(c.readApplicationState().document).toEqual(after.document);
});
test("enharmonic naming requires acknowledgement and still preserves original spellings",()=>{
  const c=setup(),text="C#4 F4 G#4",draft=c.controller.readNoteFirst(text),before=c.readApplicationState();
  expect(c.controller.insertNoteFirst(draft.source,text,named("Db"),"loop-section-0").ok).toBe(false);
  expect(c.readApplicationState().document).toBe(before.document);expect(c.readApplicationState().history).toBe(before.history);
  expect(c.controller.insertNoteFirst(draft.source,text,named("Db",true),"loop-section-0").ok).toBe(true);
  const event=c.readApplicationState().document.sections[0]?.measures[1]?.events[0];
  expect(event?.chord.kind).toBe("custom");expect(event?.chord.sourceText).toBe("Db");if(event?.voicing.mode!=="manual")throw new Error("Expected Manual");
  expect(event.voicing.pitches).toEqual([{step:"C",alter:1,octave:4},{step:"F",alter:0,octave:4},{step:"G",alter:1,octave:4}]);
});
test("Custom remains available for a no-match cluster and preserves duplicated occurrences",()=>{
  const c=setup(),text="C4 C#4 D4 C4",draft=c.controller.readNoteFirst(text);
  expect(c.controller.insertNoteFirst(draft.source,text,{name:null,customLabel:"Close cluster",acknowledgeEnharmonic:false},"loop-section-0").ok).toBe(true);
  const event=c.readApplicationState().document.sections[0]?.measures[1]?.events[0];
  expect(event?.chord.kind).toBe("custom");expect(event?.chord.sourceText).toBe("Close cluster");
  if(event?.voicing.mode!=="manual")throw new Error("Expected Manual");expect(event.voicing.pitches.length).toBe(4);
});
test("stale revision, wrong document, missing destination and forged naming choices are atomic refusals",()=>{
  const c=setup(),text="A3 C4 E4 G4",draft=c.controller.readNoteFirst(text);
  for(const [source,choice,section]of [
    [{...draft.source,documentId:"different"},named("Am7"),"loop-section-0"],
    [draft.source,named("Am7"),"missing"],
    [draft.source,named("Cmaj7"),"loop-section-0"],
  ] as const){const before=c.readApplicationState();expect(c.controller.insertNoteFirst(source,text,choice,section).ok).toBe(false);expect(c.readApplicationState().document).toBe(before.document);expect(c.readApplicationState().history).toBe(before.history);}
  expect(c.controller.setTitle("Changed").ok).toBe(true);const before=c.readApplicationState();
  expect(c.controller.insertNoteFirst(draft.source,text,named("Am7"),"loop-section-0").ok).toBe(false);
  expect(c.readApplicationState().document).toBe(before.document);expect(c.readApplicationState().history).toBe(before.history);
});
test("ID collisions refuse before publication and retain history",()=>{
  const f=loopArrangementFixture();
  const stableIdFactory:StableIdFactory={next:kind=>{
    const id=parseStableId(kind,"loop-measure-0");
    return id.ok?{ok:true,value:id.value,source:"deterministic-test"}:{ok:false,refusal:{code:"id.factory_exhausted",kind,path:["id"]}};
  }};
  const c=createStudioCompositionOverState(f.state,{...f.dependencies,stableIdFactory}),before=c.readApplicationState();
  const draft=c.controller.readNoteFirst("C4 E4 G4");
  expect(c.controller.insertNoteFirst(draft.source,draft.text,named("C"),"loop-section-0").ok).toBe(false);
  expect(c.readApplicationState().document).toBe(before.document);expect(c.readApplicationState().history).toBe(before.history);
});
test("note preview passes exact occurrences and its stale release cannot cancel another preview",async()=>{
  const f=loopArrangementFixture(),audio=createStudioAudio(createFakeAudioPlatform().platform),starts:number[][]=[];
  const port:StudioAudioPort={...audio,startPreview(...args){starts.push([...args[3]]);return audio.startPreview(...args);}};
  const c=createStudioCompositionOverState(f.state,f.dependencies,{audio:port}),controller=c.controller,before=c.readApplicationState();
  const gesture={kind:"trusted-pointer",trusted:true,sequence:1} as const;
  const until=async(predicate:()=>boolean)=>{for(let i=0;i<400&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,10));expect(predicate()).toBe(true);};
  try{
    expect(controller.previewNoteFirst("A3 C4 E4 G4 A3",gesture).ok).toBe(true);
    await until(()=>starts.length===1);expect(starts).toEqual([[57,60,64,67,57]]);
    await controller.releaseNoteFirst();
    expect(controller.previewPitches([72],{...gesture,sequence:2}).ok).toBe(true);
    await until(()=>audio.inspect().engine.previewNonreleasingVoiceCount===1);
    await controller.releaseNoteFirst();expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
    expect(c.readApplicationState().document).toBe(before.document);expect(c.readApplicationState().history).toBe(before.history);
  }finally{await audio.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}});}
},30000);
