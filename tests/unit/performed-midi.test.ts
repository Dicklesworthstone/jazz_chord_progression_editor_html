import { expect, test } from "bun:test";
import fixture from "../fixtures/performed-midi/cases.json";
import { beatValueToMidiTicks, makeBeatDuration, makeBeatPosition, makeBeatRange, parseStableId } from "../../src/domain";
import { exportPerformedMidi, type PerformedMidiRequest } from "../../src/export";
import { compilePerformancePlan, type PlaybackEvent, type PlaybackPlan, type PerformanceEventProvenance } from "../../src/playback";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { loopArrangementFixture } from "../support/loop-arrangement-fixture";

function position(ticks:number) { const r=makeBeatPosition({numerator:ticks,denominator:960});if(!r.ok)throw new Error(r.refusal.code);return r.value; }
function duration(ticks:number) { const r=makeBeatDuration({numerator:ticks,denominator:960});if(!r.ok)throw new Error(r.refusal.code);return r.value; }
function id(text:string) {const r=parseStableId("event",text);if(!r.ok)throw new Error(r.refusal.code);return r.value;}
function sourcePlan():PlaybackPlan {const r=compileStudioPlaybackPlan(loopArrangementFixture().state.document);if(!r.ok)throw new Error(r.refusal.code);return r.plan;}
function request(transpose=0):PerformedMidiRequest {
 const base=sourcePlan(), template=base.events[0];if(template===undefined)throw new Error("fixture");
 const events:PlaybackEvent[]=[],provenance:PerformanceEventProvenance[]=[];
 for(const key of ["a","b","c","d"]) {
  const rows=fixture.notes.filter(n=>n.event===key),first=rows[0];if(first===undefined)throw new Error("fixture");
  // Deliberately authored performed velocity, beyond P0's literal-96 static type.
  events.push({...template,eventId:id(key),startTick:first.start,startBeat:position(first.start),durationTicks:first.gate,durationBeats:duration(first.gate),gateDurationTicks:first.gate,gateDurationBeats:duration(first.gate),midiPitches:rows.map(n=>n.pitch+transpose),velocity:first.velocity} as unknown as PlaybackEvent);
  provenance.push({eventId:id(key),sourceEventId:template.eventId,role:first.role==="bass"?"bass":"comp"});
 }
 return {plan:{...base,tempoBpm:120,totalTicks:beatValueToMidiTicks(position(3840)),totalBeats:position(3840),events},provenance,title:"Exact performance",markers:[{tick:0,text:"A"},{tick:0,text:"Cmaj7"},{tick:1440,text:"Dm7"}]};
}

type DecodedNote={track:number;tick:number;on:boolean;note:number;velocity:number;channel:number};
/** Independent byte cursor, not any production export/import helper. */
function decode(bytes:Uint8Array) {
 let at=0;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const read=(n:number):number[]=>{const value=[...bytes.slice(at,at+n)];at+=n;return value;};
 const u32=()=>{const value=view.getUint32(at);at+=4;return value;};
 const variable=()=>{let value=0;for(let i=0;i<4;i++){const b=bytes[at++];if(b===undefined)throw new Error("EOF");value=value*128+(b&127);if(b<128)return value;}throw new Error("VLQ overflow");};
 expect(read(4)).toEqual([77,84,104,100]);expect(u32()).toBe(6);expect(read(6)).toEqual([0,1,0,3,3,192]);
 const notes:DecodedNote[]=[],metas:{track:number;tick:number;type:number;data:number[]}[]=[];
 for(let track=0;track<3;track++) {
  expect(read(4)).toEqual([77,84,114,107]);const length=u32(),end=at+length;let tick=0;
  while(at<end){tick+=variable();const status=bytes[at++];if(status===undefined)throw new Error("EOF");
   if(status===255){const type=bytes[at++];if(type===undefined)throw new Error("EOF");const data=read(variable());metas.push({track,tick,type,data});}
   else {const note=bytes[at++],velocity=bytes[at++];if(note===undefined||velocity===undefined)throw new Error("EOF");expect([128,144]).toContain(status&240);notes.push({track,tick,on:(status&240)===144,note,velocity,channel:status&15});}
  }
  expect(at).toBe(end);
 }
 expect(at).toBe(bytes.length);return {notes,metas};
}

test("independent SMF reader preserves authored role, occurrence, gate, velocity and markers",()=>{
 const r=exportPerformedMidi(request());expect(r.ok).toBe(true);if(!r.ok)return;
 const parsed=decode(r.bytes);
 const expected=fixture.notes.flatMap(n=>[
  {track:n.role==="bass"?1:2,tick:n.start,on:true,note:n.pitch,velocity:n.velocity,channel:n.channel},
  {track:n.role==="bass"?1:2,tick:n.start+n.gate,on:false,note:n.pitch,velocity:0,channel:n.channel}
 ]).sort((a,b)=>a.track-b.track||a.tick-b.tick||Number(a.on)-Number(b.on));
 expect(parsed.notes).toEqual(expected);
 expect(parsed.metas.filter(m=>m.type===47).map(m=>m.tick)).toEqual([3840,3840,3840]);
 expect(parsed.metas.find(m=>m.type===81)?.data).toEqual([7,161,32]);
 expect(parsed.metas.filter(m=>m.type===6).map(m=>[m.tick,new TextDecoder().decode(new Uint8Array(m.data))])).toEqual([[0,"A"],[0,"Cmaj7"],[1440,"Dm7"]]);
 expect(r.evidence).toMatchObject({attacks:4,pitches:6,messages:12});
 expect(r.tempoErrorNumerator).toBe(0);
 expect(parsed.notes.filter(n=>n.track===1&&n.tick===960).map(n=>n.on)).toEqual([false,true]);
});
test("transposition changes notes and preserves every timing and velocity",()=>{
 const a=exportPerformedMidi(request()),b=exportPerformedMidi(request(2));if(!a.ok||!b.ok)throw new Error("fixture refused");
 expect(decode(b.bytes).notes).toEqual(decode(a.bytes).notes.map(n=>({...n,note:n.note+2})));
});
function unisons(count:number):PerformedMidiRequest {
 const r=request(),first=r.plan.events[0];if(first===undefined)throw new Error("fixture");
 return {...r,plan:{...r.plan,events:[{...first,midiPitches:Array.from({length:count},()=>60)} as unknown as PlaybackEvent]},provenance:[{eventId:first.eventId,sourceEventId:first.eventId,role:"comp"}]};
}
test("15 unisons keep separate channels and 16 refuse without partial bytes",()=>{
 const ok=exportPerformedMidi(unisons(15));if(!ok.ok)throw new Error(ok.code);
 expect(decode(ok.bytes).notes.filter(n=>n.on).map(n=>n.channel)).toEqual(fixture.allocatedChannels);
 expect(exportPerformedMidi(unisons(16))).toMatchObject({ok:false,code:"performed-midi.channels"});
});
test("role lanes stay separate even when cross-role notes only touch at a boundary",()=>{
 const r=request(),a=r.plan.events[0],c=r.plan.events[2];if(!a||!c)throw new Error("fixture");
 const result=exportPerformedMidi({...r,plan:{...r.plan,events:[a,c]},provenance:[{eventId:a.eventId,sourceEventId:a.eventId,role:"comp"},{eventId:c.eventId,sourceEventId:c.eventId,role:"bass"}]});
 if(!result.ok)throw new Error(result.code);
 const on=decode(result.bytes).notes.filter(n=>n.on);expect(on.find(n=>n.track===1)?.channel).toBe(0);expect(on.find(n=>n.track===2)?.channel).toBe(1);
});
test("invalid mirrors, velocity, provenance, text and limits refuse",()=>{
 const r=request(),first=r.plan.events[0];if(!first)throw new Error("fixture");
 for(const patch of [{gateDurationTicks:455},{velocity:128},{startTick:NaN},{midiPitches:[128]}]) {
  expect(exportPerformedMidi({...r,plan:{...r.plan,events:[{...first,...patch} as unknown as PlaybackEvent]}}).ok).toBe(false);
 }
 expect(exportPerformedMidi({...r,provenance:[]})).toMatchObject({ok:false,code:"performed-midi.invalid"});
 expect(exportPerformedMidi({...r,title:"bad\ntext"}).ok).toBe(false);
 expect(exportPerformedMidi({...r,plan:{...r.plan,events:Array.from({length:1025},()=>first)}})).toMatchObject({ok:false,code:"performed-midi.limit"});
});
test("real performance compiler carries explicit source and role without changing its plan",()=>{
 const base=sourcePlan(),r=compilePerformancePlan({plan:base,styleId:"ballad-comp@1",compContinuityVersion:2});if(!r.ok)throw new Error(r.refusal.code);
 expect(r.eventProvenance.length).toBe(r.plan.events.length);
 expect(new Set(r.eventProvenance.map(p=>p.role))).toEqual(new Set(["bass","comp"]));
 for(const p of r.eventProvenance){expect(base.events.some(e=>e.eventId===p.sourceEventId)).toBe(true);expect(r.plan.events.some(e=>e.eventId===p.eventId)).toBe(true);}
 const exported=exportPerformedMidi({plan:r.plan,provenance:r.eventProvenance,title:"Real band",markers:[]});expect(exported.ok).toBe(true);
});

test("a chosen passage rebases every onset and all track ends exactly once",()=>{
 const r=request(),range=makeBeatRange(position(960),position(3840));if(!range.ok)throw new Error("fixture");
 const result=exportPerformedMidi({...r,markers:[{tick:960,text:"Passage"}],plan:{...r.plan,events:r.plan.events.slice(2),loop:range.value,loopTicks:{start:beatValueToMidiTicks(position(960)),end:beatValueToMidiTicks(position(3840))}}});
 if(!result.ok)throw new Error(result.code);
 const parsed=decode(result.bytes);
 expect(parsed.notes.filter(n=>n.on).map(n=>[n.track,n.tick,n.note,n.velocity])).toEqual([[1,0,60,103],[2,480,64,72]]);
 expect(parsed.metas.filter(m=>m.type===47).map(m=>m.tick)).toEqual([2880,2880,2880]);
 expect(parsed.metas.find(m=>m.type===6)?.tick).toBe(0);
});
