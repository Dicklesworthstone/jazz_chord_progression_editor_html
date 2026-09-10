import {expect,test} from "bun:test";
import {decodeDocumentShape} from "../../src/domain";
import {validateDocumentSemantics} from "../../src/application/document-validation";
import {buildStudioPadCatalog,projectStudioPads} from "../../src/application/studio-pads";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
import fixture from "../fixtures/touch-chord-pads/cases.json";
function documentWith(count:number,rows:readonly (readonly (string|number)[])[]=[["C",0,4],["E",0,4],["G",0,4]]){
 const base=loopArrangementFixture().state.document,section=base.sections[0],measure=section?.measures[0],event=measure?.events[0];if(section===undefined||measure===undefined||event===undefined)throw new Error("Fixture");
 const pitches=rows.map(([step,alter,octave])=>({step,alter,octave}));
 const candidate={...base,sections:[{...section,measures:Array.from({length:count},(_v,i)=>({...measure,id:`pad-bar-${String(i)}`,events:[{...event,id:`pad-chord-${String(i)}`,chord:{kind:"custom",sourceText:"Exact pad",label:"Exact pad",pitchNames:pitches.map(p=>({step:p.step,alter:p.alter})),bass:null},voicing:{mode:"manual",bassPolicy:"included",pitches}}]}))}]};
 const decoded=decodeDocumentShape(candidate);if(!decoded.ok)throw new Error(JSON.stringify(decoded.errors));const valid=validateDocumentSemantics(decoded.value);if(!valid.ok)throw new Error(JSON.stringify(valid.errors));return valid.value;
}
for(const f of fixture.notes)test(`pads literal projection ${f.id}`,()=>{
 const document=documentWith(1,f.pitches),catalog=buildStudioPadCatalog(document);if(!catalog.ok)throw new Error(catalog.message);
 expect(catalog.entries[0]?.event.midiPitches.map((n):number=>n)).toEqual(f.midi);expect(catalog.entries[0]?.event.pitches.map((p):readonly (string|number)[]=>[p.step,p.alter,p.octave])).toEqual(f.pitches);
 expect(catalog.evidence).toEqual({sections:1,measures:1,events:1,pitches:f.midi.length,termination:"complete"});expect(Object.isFrozen(catalog.entries)).toBe(true);
});
for(const f of fixture.pages)test(`pads ${String(f.count)} events retain every page occurrence`,()=>{
 const document=documentWith(f.count),catalog=buildStudioPadCatalog(document);if(!catalog.ok)throw new Error(catalog.message);
 const all:string[]=[];for(let page=0;page<f.sizes.length;page++){const result=projectStudioPads(catalog,document.id,7,null,page);if(!result.ok)throw new Error(result.message);const size=f.sizes[page];if(size===undefined)throw new Error("Missing fixture page size");expect(result.value.pads.length).toBe(size);expect(result.value.total).toBe(f.count);all.push(...result.value.pads.map(p=>p.source.eventId));expect(result.value.pads.every(p=>p.source.revision===7)).toBe(true);}
 expect(all).toEqual(Array.from({length:f.count},(_v,i)=>`pad-chord-${String(i)}`));expect(new Set(all).size).toBe(f.count);
 expect(projectStudioPads(catalog,document.id,7,null,f.sizes.length).ok).toBe(false);expect(projectStudioPads(catalog,document.id,7,"missing",0).ok).toBe(false);
});
test("129 bars refuse before compiling; invalid page indices never coerce",()=>{
 const document=documentWith(129),catalog=buildStudioPadCatalog(document);expect(catalog.ok).toBe(false);expect(catalog.evidence).toEqual({sections:1,measures:0,events:0,pitches:0,termination:"input-refused"});
 const good=buildStudioPadCatalog(documentWith(1));for(const page of [-1,NaN,0.5,Infinity])expect(projectStudioPads(good,document.id,0,null,page).ok).toBe(false);
});
test("octave transposition and inverse keep source occurrence order",()=>{
 const rows=[["D",-1,3],["D",-1,3],["C",1,3]] as const;
 const before=buildStudioPadCatalog(documentWith(1,rows)),up=buildStudioPadCatalog(documentWith(1,rows.map(p=>[p[0],p[1],p[2]+1]))),back=buildStudioPadCatalog(documentWith(1,rows));
 if(!before.ok||!up.ok||!back.ok)throw new Error("Projection refused");expect(up.entries[0]?.event.midiPitches.map((n):number=>n)).toEqual([61,61,61]);expect(back.entries).toEqual(before.entries);
});
test("section and chord budgets admit their exact limits and refuse the next item",()=>{
 const base=documentWith(1),section=base.sections[0],measure=section?.measures[0],event=measure?.events[0];if(section===undefined||measure===undefined||event===undefined)throw new Error("Fixture");
 const publish=(input:unknown)=>{const decoded=decodeDocumentShape(input);if(!decoded.ok)throw new Error(JSON.stringify(decoded.errors));const valid=validateDocumentSemantics(decoded.value);if(!valid.ok)throw new Error(JSON.stringify(valid.errors));return valid.value;};
 for(const count of [32,33]){
  const d=publish({...base,sections:Array.from({length:count},(_v,i)=>({...section,id:`section-${String(i)}`,measures:[{...measure,id:`measure-${String(i)}`,events:[{...event,id:`event-${String(i)}`}]}]}))});
  const result=buildStudioPadCatalog(d);expect(result.ok).toBe(count===32);expect(result.evidence.events).toBe(count===32?32:0);
 }
 for(const count of [128,129]){
  const d=publish({...base,sections:[{...section,measures:Array.from({length:Math.ceil(count/2)},(_v,i)=>{
   const remaining=Math.min(2,count-2*i);return {...measure,id:`measure-${String(i)}`,events:Array.from({length:remaining},(_w,j)=>({...event,id:`event-${String(i*2+j)}`,duration:{numerator:remaining===2?2:4,denominator:1}}))};
  })}]});
  const result=buildStudioPadCatalog(d);expect(result.ok).toBe(count===128);expect(result.evidence.events).toBe(128);expect(result.evidence.pitches).toBe(count===128?384:0);
 }
});
