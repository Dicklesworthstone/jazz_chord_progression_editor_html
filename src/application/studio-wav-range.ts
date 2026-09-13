import {accumulateTimeline,makeBeatRange,measureCapacity,type BeatDuration,type BeatRange,type ValidatedDocument} from "../domain";

export type StudioWavExcerpt=Readonly<{startBar:number;barCount:number}>;
type WavRangeResult=Readonly<{ok:true;range:BeatRange|null}>|Readonly<{ok:false;message:string}>;

/** Resolve explicit bar numbers against the original exact timeline, before
 * full-context realization. Admission bounds all visits and temporary arrays. */
export function studioWavRange(document:ValidatedDocument,sectionId:string|null,excerpt:StudioWavExcerpt|null):WavRangeResult {
  const refuse=(message:string):WavRangeResult=>Object.freeze({ok:false,message});
  if(document.sections.length>32)return refuse("This export supports charts with up to 32 sections.");
  let bars=0,events=0,scopeStart=0,scopeBars=0,found=sectionId===null;
  for(const section of document.sections){
    if(section.id===sectionId){found=true;scopeStart=bars;scopeBars=section.measures.length;}
    bars+=section.measures.length;
    if(bars>128)return refuse("This export supports charts with up to 128 source bars.");
    for(const measure of section.measures){events+=measure.events.length;if(events>128)return refuse("This export supports charts with up to 128 source chords.");}
  }
  if(sectionId===null)scopeBars=bars;
  if(!found)return refuse("That section is no longer available. Choose a passage again.");
  const startBar=excerpt?.startBar??1,barCount=excerpt?.barCount??scopeBars;
  if(!Number.isSafeInteger(startBar)||!Number.isSafeInteger(barCount)||startBar<1||barCount<1||barCount>4||startBar>scopeBars||barCount>scopeBars-startBar+1){
    return refuse(excerpt===null?"Choose a whole chart or section of 1–4 bars, or choose specific bars.":"Choose 1–4 consecutive bars within the selected passage.");
  }
  if(sectionId===null&&excerpt===null)return Object.freeze({ok:true,range:null});
  const first=scopeStart+startBar-1,end=first+barCount;
  const before:BeatDuration[]=[],through:BeatDuration[]=[];
  let index=0;
  for(const section of document.sections)for(const measure of section.measures){
    if(index>=end)break;
    const durations=measure.completion.kind==="empty"?[measureCapacity(document.meter)]:measure.events.map(event=>event.duration);
    if(index<first)before.push(...durations);
    through.push(...durations);index++;
  }
  const left=accumulateTimeline(before),right=accumulateTimeline(through);
  if(!left.ok||!right.ok)return refuse("The selected bars have an unsupported duration.");
  const range=makeBeatRange(left.value,right.value);
  return range.ok?Object.freeze({ok:true,range:range.value}):refuse("The selected bars have no renderable duration.");
}
