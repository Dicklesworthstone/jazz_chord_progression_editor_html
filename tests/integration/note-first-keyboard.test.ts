import {expect,test} from "bun:test";
import fixtures from "../fixtures/note-first-keyboard/cases.json";
import {createStudioCompositionOverState} from "../../src/application/studio-controller";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
import type {NoteFirstDraftEdit} from "../../src/application/note-first-keyboard-contract";
import {createStudioAudio,type StudioAudioPort} from "../../src/application/studio-audio";
import {createFakeAudioPlatform} from "../../src/test-support/fake-audio-platform";
const setup=()=>{const f=loopArrangementFixture();return createStudioCompositionOverState(f.state,f.dependencies);};
function edit(row:{kind:string;note?:string;index?:number}):NoteFirstDraftEdit{
 if(row.kind==="append"&&typeof row.note==="string")return {kind:"append",note:row.note};
 if(row.kind==="remove"&&typeof row.index==="number")return {kind:"remove",index:row.index};
 if(row.kind==="clear")return {kind:"clear"};throw new Error("Malformed independent fixture");
}
test("keyboard selectors match independent written/MIDI tables, physical positions and disabled boundaries",()=>{
 const c=setup(),before=c.readApplicationState();
 for(const row of fixtures.keys)for(const spelling of ["sharps","flats"] as const){
  const result=c.controller.readNoteFirstKeyboard(row.octave,spelling);expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.message);
  expect(result.value.keys.map(k=>k.note)).toEqual(row[spelling]);expect(result.value.keys.map(k=>k.midi)).toEqual(row.midi);
  expect(result.value.keys.map(k=>k.column)).toEqual(fixtures.columns);expect(result.value.keys.map(k=>k.black)).toEqual(fixtures.black);
  expect(Object.isFrozen(result.value.keys)).toBe(true);
 }
 for(const octave of [-2,10,3.5,NaN,Infinity])expect(c.controller.readNoteFirstKeyboard(octave,"sharps").ok).toBe(false);
 for(let octave=-1;octave<9;octave++){
  const result=c.controller.readNoteFirstKeyboard(octave,"sharps");if(!result.ok)throw new Error(result.message);
  expect(result.value.keys.map(k=>k.midi)).toEqual(Array.from({length:12},(_v,i)=>12*(octave+1)+i));
 }
 expect(c.readApplicationState()).toBe(before);
});
test("draft edits retain exact order, spelling and doubles without document/history/recovery publication",()=>{
 const c=setup(),before=c.readApplicationState();
 for(const row of fixtures.edits){
  const result=c.controller.editNoteFirst(row.input,edit(row));expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.message);
  expect(result.value.text).toBe(row.output);expect(result.value.source).toEqual({documentId:before.document.id,revision:before.revision});
  expect(result.value.analysis.ok?result.value.analysis.midi:[]).toEqual(row.midi);expect(c.readApplicationState()).toBe(before);
 }
 for(const row of fixtures.refusals){expect(c.controller.editNoteFirst(row.input,edit(row)).ok).toBe(false);expect(c.readApplicationState()).toBe(before);}
 for(const index of [NaN,Infinity,.5])expect(c.controller.editNoteFirst("C4",{kind:"remove",index}).ok).toBe(false);
 const fifteen=Array.from({length:15},()=>"C4").join(" "),sixteen=c.controller.editNoteFirst(fifteen,{kind:"append",note:"C4"});
 expect(sixteen.ok).toBe(true);if(!sixteen.ok)throw new Error(sixteen.message);expect(sixteen.value.analysis.ok&&sixteen.value.analysis.pitches.length).toBe(16);
 expect(c.controller.editNoteFirst(sixteen.value.text,{kind:"append",note:"D4"}).ok).toBe(false);
});
test("keyboard-built voicing uses current source, exact Manual insertion and one Undo/Redo",()=>{
 const c=setup();let text="";
 for(const note of ["A3","C4","E4","G4","A3"]){const result=c.controller.editNoteFirst(text,{kind:"append",note});if(!result.ok)throw new Error(result.message);text=result.value.text;}
 const old=c.controller.readNoteFirst(text);c.controller.setTitle("New source");
 const before=c.readApplicationState(),choice={name:"C6/A",customLabel:"",acknowledgeEnharmonic:false};
 expect(c.controller.insertNoteFirst(old.source,text,choice,"loop-section-0").ok).toBe(false);
 const fresh=c.controller.editNoteFirst(text,{kind:"remove",index:4});if(!fresh.ok)throw new Error(fresh.message);
 expect(fresh.value.source.revision).toBe(before.revision);
 expect(c.controller.insertNoteFirst(fresh.value.source,fresh.value.text,choice,"loop-section-0").ok).toBe(true);
 const after=c.readApplicationState(),event=after.document.sections[0]?.measures[1]?.events[0];
 expect(event?.voicing).toEqual({mode:"manual",bassPolicy:"included",pitches:[{step:"A",alter:0,octave:3},{step:"C",alter:0,octave:4},{step:"E",alter:0,octave:4},{step:"G",alter:0,octave:4}]});
 expect(c.controller.undo().ok).toBe(true);expect(c.readApplicationState().document).toEqual(before.document);
 expect(c.controller.redo().ok).toBe(true);expect(c.readApplicationState().document).toEqual(after.document);
});
test("a keyboard draft edit cancels pending owned audition, but preserves a newer unrelated preview",async()=>{
 const f=loopArrangementFixture(),audio=createStudioAudio(createFakeAudioPlatform().platform);
 let entered:(()=>void)|undefined,finish:(()=>void)|undefined,starts=0;
 const preparing=new Promise<void>(resolve=>{entered=resolve;}),hold=new Promise<void>(resolve=>{finish=resolve;});
 const port:StudioAudioPort={...audio,async prepareInstrument(...args){entered?.();await hold;return audio.prepareInstrument(...args);},startPreview(...args){starts++;return audio.startPreview(...args);}};
 const c=createStudioCompositionOverState(f.state,f.dependencies,{audio:port});
 try{
  expect(c.controller.previewNoteFirst("C4 E4 G4",{kind:"trusted-keyboard",trusted:true,sequence:1}).ok).toBe(true);await preparing;
  expect(c.controller.editNoteFirst("C4 E4 G4",{kind:"append",note:"B4"}).ok).toBe(true);finish?.();
  for(let i=0;i<20;i++)await new Promise(resolve=>setTimeout(resolve,10));expect(starts).toBe(0);
  expect(c.controller.previewPitches([72],{kind:"trusted-keyboard",trusted:true,sequence:2}).ok).toBe(true);
  for(let i=0;i<100&&audio.inspect().engine.previewNonreleasingVoiceCount===0;i++)await new Promise(resolve=>setTimeout(resolve,10));
  expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
  c.controller.editNoteFirst("C4",{kind:"clear"});expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
  await c.controller.releasePreviewPitches();expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
 }finally{finish?.();await audio.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}});}
},30000);
