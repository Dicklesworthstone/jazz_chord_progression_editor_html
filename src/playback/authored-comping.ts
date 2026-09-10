import { beatValueToMidiTicks, makeBeatDuration, makeBeatPosition, makeSpelledPitch, parseStableId, projectSpelledPitch, type BeatDuration, type BeatPosition } from "../domain";
import type { PlaybackEvent, PlaybackPlan } from "./playback-plan-contract";
import type { PerformanceEventProvenance } from "./performance/performance-plan-contract";
import { performanceVelocity } from "./performance/performance-velocity";

export type CompRecipe = Readonly<{schema:"changes.comp-recipe.v1";slots:readonly number[];gateTicks:120|240|480}>;
export const COMP_PRESETS:readonly Readonly<{name:string;recipe:CompRecipe}>[]=Object.freeze([
  {name:"Quarter pulse",slots:[3,0,0,0,2,0,0,0,2,0,0,0,2,0,0,0]},
  {name:"Offbeats",slots:[0,0,2,0,0,0,2,0,0,0,2,0,0,0,2,0]},
  {name:"Charleston",slots:[3,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0]},
].map(p=>Object.freeze({name:p.name,recipe:Object.freeze({schema:"changes.comp-recipe.v1",slots:Object.freeze(p.slots),gateTicks:240})})));

export function decodeCompRecipe(value:unknown):CompRecipe|null {
  if(typeof value!=="object"||value===null||Array.isArray(value))return null;
  const r=value as Readonly<Record<string,unknown>>;
  if(Object.keys(r).length!==3||Object.keys(r).some(k=>k!=="schema"&&k!=="slots"&&k!=="gateTicks")||r["schema"]!=="changes.comp-recipe.v1"||!Array.isArray(r["slots"])||r["slots"].length!==16)return null;
  const slots:unknown[]=Array.from(r["slots"]),gate=r["gateTicks"];
  if(!slots.every(v=>typeof v==="number"&&Number.isInteger(v)&&v>=0&&v<=3)||(gate!==120&&gate!==240&&gate!==480))return null;
  return Object.freeze({schema:"changes.comp-recipe.v1",slots:Object.freeze(slots as number[]),gateTicks:gate});
}
export function parseCompRecipe(text:string):CompRecipe|null {
  if(text.length>2048||new TextEncoder().encode(text).length>2048)return null;
  try{return decodeCompRecipe(JSON.parse(text));}catch{return null;}
}
export type CompEvidence=Readonly<{sourceChecked:number;slotsVisited:number;cursorAdvances:number;attacks:number;pitchOccurrences:number}>;
export type CompResult=Readonly<{evidence:CompEvidence}>&(
  Readonly<{ok:true;plan:PlaybackPlan;provenance:readonly PerformanceEventProvenance[];recipe:CompRecipe}>|
  Readonly<{ok:false;code:"comp.recipe"|"comp.passage"|"comp.source"|"comp.limit"|"comp.empty"}>
);
function exact(value:BeatPosition|BeatDuration,ticks:number):boolean {
  return Number.isSafeInteger(value.numerator)&&value.numerator>=0&&Number.isSafeInteger(value.denominator)&&value.denominator>0
    &&960%value.denominator===0&&value.numerator*(960/value.denominator)===ticks;
}
function validPpq(value:number):boolean{return value===960;}
function integer(value:number):boolean{return Number.isSafeInteger(value)&&value>=0;}
/** Explicit authored-arrival policy. Never run built-in comp or loop articulation afterward. */
export function compileAuthoredComping(plan:PlaybackPlan,input:unknown,start:number,end:number):CompResult {
  let sourceChecked=0,slotsVisited=0,cursorAdvances=0,pitchOccurrences=0;
  const events:PlaybackEvent[]=[],provenance:PerformanceEventProvenance[]=[];
  const evidence=():CompEvidence=>Object.freeze({sourceChecked,slotsVisited,cursorAdvances,attacks:events.length,pitchOccurrences});
  const refuse=(code:Extract<CompResult,{ok:false}>["code"]):CompResult=>Object.freeze({ok:false,code,evidence:evidence()});
  const recipe=decodeCompRecipe(input);if(recipe===null)return refuse("comp.recipe");
  if(!integer(start)||!integer(end)||end<=start||(end-start)%3840!==0||end-start>15360||end>plan.totalTicks
    ||plan.meter.beatsPerBar!==4||plan.meter.beatUnit!==4||plan.loop!==null||plan.loopTicks!==null)return refuse("comp.passage");
  if(plan.events.length>128)return refuse("comp.limit");
  if(!integer(plan.totalTicks)||!exact(plan.totalBeats,plan.totalTicks)||!validPpq(plan.midiPpq)||!Number.isInteger(plan.tempoBpm)||plan.tempoBpm<20||plan.tempoBpm>400)return refuse("comp.source");
  let previousEnd=0;
  const ids=new Set<string>();
  for(const e of plan.events){
    sourceChecked+=1;
    if(!integer(e.startTick)||!integer(e.durationTicks)||e.durationTicks===0||e.startTick<previousEnd||e.startTick+e.durationTicks>plan.totalTicks
      ||!exact(e.startBeat,e.startTick)||!exact(e.durationBeats,e.durationTicks)||!exact(e.sourceStartBeat,e.sourceStartTick)||!exact(e.sourceDurationBeats,e.sourceDurationTicks)
      ||e.pitches.length<1||e.pitches.length>16||e.pitches.length!==e.midiPitches.length||ids.has(e.eventId))return refuse("comp.source");
    ids.add(e.eventId);previousEnd=e.startTick+e.durationTicks;
    for(let i=0;i<e.pitches.length;i++){const pitch=e.pitches[i];if(pitch===undefined)return refuse("comp.source");const made=makeSpelledPitch(pitch);if(!made.ok)return refuse("comp.source");const p=projectSpelledPitch(made.value);if(!p.ok||p.value.midi!==e.midiPitches[i])return refuse("comp.source");}
  }
  const attacks:number[]=[];
  for(let tick=0;tick<end-start;tick+=240){slotsVisited+=1;if((recipe.slots[(tick/240)%16]??0)>0)attacks.push(tick);}
  let cursor=0;
  for(let attack=0;attack<attacks.length;attack+=1){
    const relative=attacks[attack];if(relative===undefined)return refuse("comp.source");
    const level=recipe.slots[(relative/240)%16]??0;
    const absolute=start+relative;
    while(cursor<plan.events.length){const e=plan.events[cursor];if(e===undefined||e.startTick+e.durationTicks>absolute)break;cursor+=1;cursorAdvances+=1;}
    const source=plan.events[cursor];if(source===undefined||source.startTick>absolute)continue;
    const next=attacks[attack+1]??(end-start);
    const gate=Math.min(recipe.gateTicks,source.startTick+source.durationTicks-absolute,end-absolute,next-relative);
    const position=makeBeatPosition({numerator:relative,denominator:960}),duration=makeBeatDuration({numerator:gate,denominator:960});
    const offsetTicks=absolute-source.sourceStartTick,offset=offsetTicks===0?null:makeBeatDuration({numerator:offsetTicks,denominator:960});
    const id=parseStableId("event",`comp-grid-${String(events.length)}`);
    if(!position.ok||!duration.ok||!id.ok||(offset!==null&&!offset.ok))return refuse("comp.source");
    pitchOccurrences+=source.pitches.length;if(pitchOccurrences>1024||events.length===64)return refuse("comp.limit");
    const pitchCopies=source.pitches.map(p=>Object.freeze({...p})) as unknown as PlaybackEvent["pitches"];
    const midiCopies=Object.freeze([...source.midiPitches] as const);
    events.push(Object.freeze({...source,ordinal:events.length,eventId:id.value,startBeat:position.value,startTick:beatValueToMidiTicks(position.value),
      durationBeats:duration.value,durationTicks:beatValueToMidiTicks(duration.value),gateDurationBeats:duration.value,gateDurationTicks:beatValueToMidiTicks(duration.value),
      sourceOffsetBeats:offset?.value??null,sourceOffsetTicks:offset===null?null:beatValueToMidiTicks(offset.value),
      pitches:Object.freeze(pitchCopies),midiPitches:midiCopies,velocity:performanceVelocity([0,48,80,112][level]??0),articulation:"ordinary"}));
    provenance.push(Object.freeze({eventId:id.value,sourceEventId:source.eventId,role:"comp"}));
  }
  if(events.length===0)return refuse("comp.empty");
  const total=makeBeatPosition({numerator:end-start,denominator:960});if(!total.ok)return refuse("comp.passage");
  return Object.freeze({ok:true,plan:Object.freeze({...plan,events:Object.freeze(events),totalBeats:total.value,totalTicks:beatValueToMidiTicks(total.value),loop:null,loopTicks:null}),provenance:Object.freeze(provenance),recipe,evidence:evidence()});
}
