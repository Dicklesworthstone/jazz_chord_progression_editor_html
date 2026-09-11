import {expect,test} from "bun:test";
import {createHash} from "node:crypto";
import {decodeDocumentShape,beatValueToMidiTicks,type ValidatedDocument} from "../../src/domain";
import {validateDocumentSemantics} from "../../src/application/document-validation";
import {studioWavRange} from "../../src/application/studio-wav-range";
import {createStudioWav} from "../../src/application/studio-wav";
import {compileStudioPlaybackPlan} from "../../src/application/studio-playback";
import {createDryPianoRenderer} from "../../src/audio/dry-piano-render";
import type {PlaybackPlan} from "../../src/playback";
import fixture from "../fixtures/wav-excerpt.json";
import source from "../fixtures/exact-share/document.changes.json";

function validate(input:unknown):ValidatedDocument {
  const decoded=decodeDocumentShape(input);if(!decoded.ok)throw new Error(JSON.stringify(decoded.errors));
  const result=validateDocumentSemantics(decoded.value);if(!result.ok)throw new Error(JSON.stringify(result.errors));return result.value;
}
function duration(ticks:number){return ticks===320?{numerator:1,denominator:3}:ticks===2400?{numerator:5,denominator:2}:{numerator:4,denominator:1};}
function chart(){
  const section=source.sections[0],manual=section?.measures[0]?.events[0],frozen=section?.measures[0]?.events[1];
  if(section===undefined||manual===undefined||frozen===undefined)throw new Error("Missing fixture");
  return validate({...source,tempoBpm:120,sections:fixture.sections.map(s=>({...section,id:s.id,name:s.id,measures:s.bars.map((bar,i)=>({
    id:`${s.id}-${String(i)}`,completion:bar.kind==="pickup"||bar.kind==="incomplete"?{kind:bar.kind,expectedDuration:duration(bar.ticks),reason:"Independent exact excerpt fixture"}:{kind:bar.kind},
    events:bar.kind==="empty"?[]:[{...(i===2?frozen:manual),id:`${s.id}-event-${String(i)}`,duration:duration(bar.ticks)}],
  }))}))});
}
function setup(document=chart()){
  const plans:PlaybackPlan[]=[],downloads:Uint8Array[]=[];
  const render=createDryPianoRenderer(()=>Promise.resolve());
  const service=createStudioWav({readDocument:()=>document,readRevision:()=>1,subscribeSource:()=>()=>{},
    render:async(plan,controls)=>{plans.push(plan);return render(plan,controls);},hashBytes:async bytes=>createHash("sha256").update(bytes).digest("hex"),
    prepareDownload:bytes=>()=>{downloads.push(bytes);return{issued:true,objectUrlsCreated:1,objectUrlsRevoked:1,outstandingOwnedResources:0};},
  });
  return{document,service,plans,downloads};
}
for(const row of fixture.accepted)test(`exact excerpt: ${row.name}`,()=>{
  const result=studioWavRange(chart(),row.sectionId,row);expect(result.ok).toBe(true);
  if(!result.ok||result.range===null)throw new Error("Missing range");
  expect(beatValueToMidiTicks(result.range.start)).toBe(row.startTick);expect(beatValueToMidiTicks(result.range.end)).toBe(row.endTick);
});
test("invalid ranges and oversize defaults refuse before any renderer call; no silent truncation",async()=>{
  const f=setup();expect(f.service.read().availableBars).toBe(6);await f.service.prepare();expect(f.service.read().state).toBe("refused");
  for(const row of [...fixture.refused,{sectionId:null,startBar:NaN,barCount:1},{sectionId:null,startBar:Infinity,barCount:1},{sectionId:null,startBar:1,barCount:NaN}]){
    f.service.setPassage(row.sectionId);f.service.setExcerpt(row);await f.service.prepare();expect(f.service.read().state).toBe("refused");expect(f.service.read().sha256).toBeNull();
  }
  expect(f.plans).toEqual([]);expect(f.downloads).toEqual([]);
});
test("later section excerpt renders real piano after leading silence and retains the whole source",async()=>{
  const f=setup(),before=JSON.stringify(f.document);f.service.setPassage("excerpt-b");f.service.setExcerpt({startBar:2,barCount:2});
  await f.service.prepare();expect(f.service.read().state).toBe("ready");f.service.download();
  const bytes=f.downloads[0];if(bytes===undefined)throw new Error("No WAV");
  // Two ordinary 4/4 bars at 120 BPM: four seconds + 200 ms, stereo PCM16.
  expect(bytes.length).toBe(537644);const data=Buffer.from(bytes);
  expect(data.readUInt32LE(24)).toBe(32000);expect(data.readUInt32LE(40)).toBe(537600);
  expect(data.subarray(44,44+64000*4).every(n=>n===0)).toBe(true);
  expect(data.subarray(44+64100*4,44+65000*4).some(n=>n!==0)).toBe(true);
  expect(JSON.stringify(f.document)).toBe(before);
  expect(f.plans[0]?.loopTicks).toEqual({start:10400,end:18080});
  expect(f.plans[0]?.events.map(e=>e.eventId)).toEqual(["excerpt-b-event-2"]);
});
test("full-context projection retains exact frozen/manual occurrences and Auto context",async()=>{
  const original=chart();const first=original.sections[0];if(first===undefined)throw new Error("Missing section");
  const auto=validate({...original,sections:original.sections.map((s,i)=>i!==1?s:{...s,measures:s.measures.map((m,j)=>j!==2?m:{...m,events:m.events.map(e=>({...e,voicing:{mode:"auto",family:"balanced",voiceCount:4,bassPolicy:"generated",range:{lowMidi:48,highMidi:72}}}))})})});
  for(const document of [original,auto]){
    const f=setup(document),full=compileStudioPlaybackPlan(document);if(!full.ok)throw new Error(full.refusal.message);
    f.service.setExcerpt({startBar:3,barCount:4});await f.service.prepare();expect(f.service.read().state).toBe("ready");
    expect(f.plans[0]?.events).toEqual(full.plan.events.filter(e=>e.startTick>=4160).map((e,ordinal)=>({...e,ordinal})));
    const manual=f.plans[0]?.events.find(e=>e.eventId==="excerpt-b-event-0");
    expect(manual?.midiPitches).toEqual([64,49,49,49]);expect(manual?.pitches.map(p=>`${p.step}${String(p.alter)}/${String(p.octave)}`)).toEqual(["E0/4","D-1/3","D-1/3","C1/3"]);
  }
});
test("short excerpts retain source compilation limits",async()=>{
  const original=chart(),section=original.sections[0],event=section?.measures[2]?.events[0];if(section===undefined||event===undefined)throw new Error("Missing source");
  const measure=(i:number)=>({id:`limit-bar-${String(i)}`,completion:{kind:"complete"},events:[{...event,id:`limit-event-${String(i)}`,duration:{numerator:4,denominator:1}}]});
  const huge=validate({...original,sections:[{...section,measures:Array.from({length:129},(_,i)=>measure(i))}]});
  const f=setup(huge);f.service.setExcerpt({startBar:1,barCount:1});await f.service.prepare();expect(f.service.read().message).toContain("128 source bars");expect(f.plans).toEqual([]);
});
