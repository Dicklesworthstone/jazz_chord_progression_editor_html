import {expect,test} from "bun:test";
import fixture from "../fixtures/authored-comping/cases.json";
import {beatValueToMidiTicks,makeBeatPosition,makeBeatDuration,makeSpelledPitch,parseStableId,projectSpelledPitch} from "../../src/domain";
import {compileAuthoredComping,decodeCompRecipe,parseCompRecipe,type PlaybackEvent,type PlaybackPlan} from "../../src/playback";
import {compileStudioPlaybackPlan} from "../../src/application/studio-playback";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
function position(t:number){const r=makeBeatPosition({numerator:t,denominator:960});if(!r.ok)throw new Error("position");return r.value;}
function duration(t:number){const r=makeBeatDuration({numerator:t,denominator:960});if(!r.ok)throw new Error("duration");return r.value;}
const compiled=compileStudioPlaybackPlan(loopArrangementFixture().state.document);if(!compiled.ok)throw new Error("base");
const base=compiled.plan,template=base.events[0];if(template===undefined)throw new Error("event");
function plan(c:typeof fixture.cases[number],transpose=0):PlaybackPlan{
  const events=c.source.map((row,ordinal)=>{
    const [start,ticks,name,notes]=row;if(typeof start!=="number"||typeof ticks!=="number"||typeof name!=="string"||!Array.isArray(notes))throw new Error("row");
    const id=parseStableId("event",name);if(!id.ok)throw new Error("id");
    const pitches=notes.map(n=>{if(typeof n!=="number")throw new Error("note");const value=n+transpose,classes=["C","C","D","D","E","F","F","G","G","A","A","B"],alter=[0,1,0,1,0,0,1,0,1,0,1,0];
      const step=classes[value%12],accidental=alter[value%12];if(step===undefined||accidental===undefined)throw new Error("pitch class");const p=makeSpelledPitch({step,alter:accidental,octave:Math.floor(value/12)-1});if(!p.ok)throw new Error("pitch");return p.value;});
    return {...template,ordinal,sourceOrdinal:ordinal,eventId:id.value,sourceStartBeat:position(start),sourceStartTick:start,sourceDurationBeats:duration(ticks),sourceDurationTicks:ticks,sourceOffsetBeats:null,sourceOffsetTicks:null,
      startBeat:position(start),startTick:start,durationBeats:duration(ticks),durationTicks:ticks,gateDurationBeats:duration(ticks),gateDurationTicks:ticks,pitches,midiPitches:notes.map(n=>n+transpose)} as unknown as PlaybackEvent;
  });const end=(c.start??0)+c.bars*3840;
  return {...base,tempoBpm:120,events,totalTicks:beatValueToMidiTicks(position(end)),totalBeats:position(end),loop:null,loopTicks:null};
}
for(const c of fixture.cases)test(`authored comping: ${c.id}`,()=>{
  const input=plan(c),before=JSON.stringify(input),recipe={schema:"changes.comp-recipe.v1",slots:c.slots,gateTicks:c.gate};
  const r=compileAuthoredComping(input,recipe,c.start??0,(c.start??0)+c.bars*3840);
  if(c.refusal!==undefined){expect(r.ok).toBe(false);if(!r.ok)expect<string>(r.code).toBe(c.refusal);return;}
  expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.code);
  expect(r.plan.events.map((e,i):readonly unknown[]=>[e.startTick,e.gateDurationTicks,e.velocity,r.provenance[i]?.sourceEventId])).toEqual(c.expected);
  for(const [i,e] of r.plan.events.entries()){
    const source=input.events.find(s=>s.eventId===r.provenance[i]?.sourceEventId);if(source===undefined)throw new Error("Missing source provenance");expect(e.pitches).toEqual(source.pitches);expect(e.midiPitches).toEqual(source.midiPitches);
    expect(Object.isFrozen(e.pitches)).toBe(true);expect(e.pitches.every(Object.isFrozen)).toBe(true);
    expect([...e.midiPitches]).toEqual(e.pitches.map(p=>{const q=projectSpelledPitch(p);if(!q.ok)throw new Error("projection");return q.value.midi;}));
  }
  expect(JSON.stringify(input)).toBe(before);expect(r.evidence.slotsVisited).toBe(c.bars*16);expect(r.evidence.cursorAdvances).toBeLessThanOrEqual(c.source.length);
  const transposed=compileAuthoredComping(plan(c,2),recipe,c.start??0,(c.start??0)+c.bars*3840);if(!transposed.ok)throw new Error(transposed.code);
  expect(transposed.plan.events.map((e):readonly unknown[]=>[e.startTick,e.gateDurationTicks,e.velocity,e.midiPitches])).toEqual(r.plan.events.map(e=>[e.startTick,e.gateDurationTicks,e.velocity,e.midiPitches.map(p=>p+2)]));
});
test("recipe decoder rejects coercion, extra fields, nonfinite and oversize input",()=>{
 const r={schema:"changes.comp-recipe.v1",slots:Array.from({length:16},()=>1),gateTicks:240} as const;expect(decodeCompRecipe(r)).not.toBeNull();
 for(const bad of [{...r,extra:true},{...r,slots:[1]},{...r,slots:Array(16)},{...r,gateTicks:241},{...r,slots:Array(16).fill("1")},{...r,slots:Array(16).fill(NaN)},null])expect(decodeCompRecipe(bad)).toBeNull();
 expect(parseCompRecipe(" ".repeat(2049)+JSON.stringify(r))).toBeNull();expect(parseCompRecipe('{"schema":')).toBeNull();expect(parseCompRecipe(JSON.stringify(r))).toEqual(r);
});
test("four-bar dense bound and source/selection near misses",()=>{
 const c=fixture.cases[0];if(c===undefined)throw new Error("fixture");const input=plan({...c,bars:4,source:[[0,15360,"a",Array(16).fill(60)]]});
 const recipe={schema:"changes.comp-recipe.v1",slots:Array(16).fill(3),gateTicks:480};const r=compileAuthoredComping(input,recipe,0,15360);
 expect(r.ok).toBe(true);expect(r.evidence).toMatchObject({slotsVisited:64,attacks:64,pitchOccurrences:1024});
 for(const [s,e] of [[0,19200],[0,3839],[-1,3839],[1,3840]])expect(compileAuthoredComping(input,recipe,s??0,e??0).ok).toBe(false);
 const first=input.events[0];if(first===undefined)throw new Error("fixture");
 for(const bad of [{...input,events:[first,first]},{...input,events:[{...first,startTick:1}]},{...input,events:[{...first,midiPitches:[61]}]},{...input,events:Array(129).fill(first)}])expect(compileAuthoredComping(bad as PlaybackPlan,recipe,0,3840).ok).toBe(false);
});
test("enharmonic written occurrences stay separate and immutable",()=>{
 const c=fixture.cases[0];if(c===undefined)throw new Error("fixture");const input=plan({...c,source:[[0,3840,"a",[49,49,49]]]});
 const pitches=[{step:"D",alter:-1,octave:3},{step:"D",alter:-1,octave:3},{step:"C",alter:1,octave:3}].map(p=>{const r=makeSpelledPitch(p);if(!r.ok)throw new Error("pitch");return r.value;});
 const first=input.events[0];if(first===undefined)throw new Error("event");
 const [firstPitch,...restPitches]=pitches;if(firstPitch===undefined)throw new Error("Missing first pitch");
 const source={...input,events:[{...first,pitches:[firstPitch,...restPitches] as const}]};
 const result=compileAuthoredComping(source,{schema:"changes.comp-recipe.v1",slots:c.slots,gateTicks:240},0,3840);
 if(!result.ok)throw new Error(result.code);expect(result.evidence.pitchOccurrences).toBe(12);
 for(const e of result.plan.events){expect([...e.pitches]).toEqual(pitches);expect<readonly number[]>(e.midiPitches).toEqual([49,49,49]);}
});
