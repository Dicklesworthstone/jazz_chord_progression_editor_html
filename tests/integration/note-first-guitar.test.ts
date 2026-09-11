import {expect,test} from "bun:test";
import packet from "../fixtures/note-first-guitar/cases.json";
import {createStudioCompositionOverState} from "../../src/application/studio-controller";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
import {createStudioAudio,type StudioAudioPort} from "../../src/application/studio-audio";
import {createFakeAudioPlatform} from "../../src/test-support/fake-audio-platform";
const setup=()=>{const f=loopArrangementFixture();return createStudioCompositionOverState(f.state,f.dependencies);};
const label=(p:{step:string;alter:number;octave:number})=>p.step+(p.alter<0?"b".repeat(-p.alter):"#".repeat(p.alter))+String(p.octave);
test("draft guitar read preserves independent occurrences, written spelling, register and finite search bounds",()=>{
  const c=setup(),before=c.readApplicationState(),source={documentId:before.document.id,revision:before.revision};
  for(const row of packet.cases){
    if(row.status!=="positions"&&row.status!=="no-position")throw new Error("Invalid fixture status");
    const result=c.controller.readNoteFirstGuitar(source,row.text);expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.message);
    const view=result.value,search=view.search;
    expect(view.source).toEqual(source);expect(view.text).toBe(row.text);expect(search.status).toBe(row.status);
    expect(search.pitches.map(label)).toEqual(row.text.split(" "));expect(search.midi).toEqual(row.midi);
    if(row.firstFrets!==undefined)expect(search.positions[0]?.frets).toEqual(row.firstFrets);
    expect(search.positions.length).toBeLessThanOrEqual(3);expect(search.evidence.states).toBeLessThanOrEqual(1957);expect(search.evidence.trials).toBeLessThanOrEqual(7422);
    expect(search.evidence.termination).toBe("complete");
    for(const position of search.positions){
      expect(position.assignments).toHaveLength(row.midi.length);expect(new Set(position.assignments.map(a=>a.string)).size).toBe(row.midi.length);
      for(const [i,a] of position.assignments.entries()){
        const expectedNote=row.text.split(" ")[i],expectedMidi=row.midi[i];
        if(expectedNote===undefined||expectedMidi===undefined)throw new Error("Extra occurrence not in fixture");
        expect(a.occurrence).toBe(i);expect(label(a.pitch)).toBe(expectedNote);expect(a.midi).toBe(expectedMidi);
        expect(([64,59,55,50,45,40][a.string-1]??-100)+a.fret).toBe(expectedMidi);expect(a.fret).toBeGreaterThanOrEqual(0);expect(a.fret).toBeLessThanOrEqual(20);
      }
    }
    expect(c.controller.readNoteFirstGuitar(source,row.text)).toEqual(result);expect(c.readApplicationState()).toBe(before);
  }
  for(const text of packet.invalid){expect(c.controller.readNoteFirstGuitar(source,text).ok).toBe(false);expect(c.readApplicationState()).toBe(before);}
});
test("draft guitar refuses mismatched document or revision and rebinds only to explicit fresh analysis",()=>{
  const c=setup(),draft=c.controller.readNoteFirst("E4 Fb4"),before=c.readApplicationState();
  expect(c.controller.readNoteFirstGuitar({...draft.source,documentId:"different-document"},draft.text).ok).toBe(false);
  expect(c.controller.readNoteFirstGuitar({...draft.source,revision:draft.source.revision+1},draft.text).ok).toBe(false);
  expect(c.readApplicationState()).toBe(before);expect(c.controller.setTitle("Changed source").ok).toBe(true);
  expect(c.controller.readNoteFirstGuitar(draft.source,draft.text).ok).toBe(false);
  const fresh=c.controller.readNoteFirst(draft.text),view=c.controller.readNoteFirstGuitar(fresh.source,fresh.text);expect(view.ok).toBe(true);
  if(!view.ok)throw new Error(view.message);expect(view.value.search.pitches.map(label)).toEqual(["E4","Fb4"]);
});
test("draft guitar and note-first audition use exact draft notes without replacing or releasing another preview",async()=>{
  const f=loopArrangementFixture(),audio=createStudioAudio(createFakeAudioPlatform().platform),starts:number[][]=[];
  const port:StudioAudioPort={...audio,startPreview(...args){starts.push([...args[3]]);return audio.startPreview(...args);}};
  const c=createStudioCompositionOverState(f.state,f.dependencies,{audio:port});
  try{
    const before=c.readApplicationState(),draft=c.controller.readNoteFirst("E4 Fb4");
    expect(c.controller.previewPitches([72],{kind:"trusted-keyboard",trusted:true,sequence:1}).ok).toBe(true);
    for(let i=0;i<100&&starts.length===0;i++)await new Promise(resolve=>setTimeout(resolve,10));expect(starts).toEqual([[72]]);
    const view=c.controller.readNoteFirstGuitar(draft.source,draft.text);if(!view.ok)throw new Error(view.message);
    expect(view.value.search.midi).toEqual([64,64]);expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
    expect((await c.controller.releaseNoteFirst()).ok).toBe(true);expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
    await c.controller.releasePreviewPitches();
    expect(c.controller.previewNoteFirst(draft.text,{kind:"trusted-keyboard",trusted:true,sequence:2}).ok).toBe(true);
    for(let i=0;i<100&&starts.length<2;i++)await new Promise(resolve=>setTimeout(resolve,10));expect(starts).toEqual([[72],[64,64]]);
    expect((await c.controller.releaseNoteFirst()).ok).toBe(true);expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
    expect(c.readApplicationState().document).toBe(before.document);expect(c.readApplicationState().history).toBe(before.history);
  }finally{await audio.transportService.submitTransportCommand({commandRequestId:999,payload:{kind:"dispose-transport",reason:"page-teardown"}});}
},30000);
