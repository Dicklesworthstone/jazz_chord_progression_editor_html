import {expect,test} from "bun:test";
import {decodeDocumentShape} from "../../src/domain";
import {validateDocumentSemantics} from "../../src/application/document-validation";
import {compileStudioPlaybackPlan,studioSectionLoopRange} from "../../src/application/studio-playback";
import {projectPlaybackPlanLoop} from "../../src/playback";
import {createDryPianoRenderer,dryPianoEnvelope,dryPianoFrame} from "../../src/audio/dry-piano-render";
import {loadConcertGrandRenderer} from "../../src/audio/dsp-renderer";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
import fixture from "../fixtures/short-piano-wav/cases.json";
const controls={cancelled:()=>false,progress:()=>{}};
function plan(count=1,tempo=120,octave=4,rest=false,maximumGate=false,bars=1){
 const base=loopArrangementFixture().state.document,s=base.sections[0],m=s?.measures[0],e=m?.events[0];if(s===undefined||m===undefined||e===undefined)throw new Error("Fixture");
 const pitches=Array.from({length:count},()=>({step:"C",alter:0,octave}));
 const completion=maximumGate?{kind:"incomplete",expectedDuration:{numerator:161,denominator:40},reason:"Exact four-second gate fixture"}:m.completion;
 const raw={...base,tempoBpm:tempo,meter:maximumGate?{beatsPerBar:5,beatUnit:4}:base.meter,
  sections:[{...s,measures:[
   ...(rest?[{...m,id:"leading-rest",events:[],completion:{kind:"empty"}}]:[]),
   {...m,completion,events:[{...e,duration:maximumGate?{numerator:161,denominator:40}:e.duration,
    chord:{kind:"custom",sourceText:"C notes",label:"C notes",pitchNames:[{step:"C",alter:0}],bass:null},
    voicing:{mode:"manual",bassPolicy:"included",pitches},
   }]},
  ]}],
 };
 let source:unknown=raw;
 if(bars>1){const section=raw.sections[0],measure=section?.measures[0];if(section===undefined||measure===undefined)throw new Error("Fixture bar");source={...raw,sections:[{...section,measures:Array.from({length:bars},(_v,i)=>({...measure,id:`max-bar-${String(i)}`,events:measure.events.map(e=>({...e,id:`max-event-${String(i)}`}))}))}]};}
 const d=decodeDocumentShape(source);if(!d.ok)throw new Error(JSON.stringify(d.errors));const v=validateDocumentSemantics(d.value);if(!v.ok)throw new Error(JSON.stringify(v.errors));const p=compileStudioPlaybackPlan(v.value);if(!p.ok)throw new Error(p.refusal.message);return p.plan;
}
test("independent rational frames and attack/release table",()=>{
 for(const c of fixture.timing){expect(dryPianoFrame(c.startTick,c.tempo)).toBe(c.startFrame);expect(dryPianoFrame(c.startTick+c.gateTicks,c.tempo)-dryPianoFrame(c.startTick,c.tempo)).toBe(c.gateFrames);}
 for(const c of fixture.envelope)expect(dryPianoEnvelope(c.index,c.gate)).toBe(c.gain);
});
test("serialized approved hybrid route exactly matches synchronous PCM at all admitted register extremes",async()=>{
 const r=await loadConcertGrandRenderer(),exclusive=r.renderNoteExclusive;if(exclusive===undefined)throw new Error("No serialized piano");
 for(const midi of [21,60,108]){
  const expected=r.renderNote(midi,96,32000,4.2),actual=await exclusive(midi,96,32000,4.2,()=>false);if(expected===null||actual===null)throw new Error("Admitted render refused");
  expect(actual.frameCount).toBe(expected.frameCount);expect(Buffer.from(actual.left.buffer).equals(Buffer.from(expected.left.buffer))).toBe(true);expect(Buffer.from(actual.right.buffer).equals(Buffer.from(expected.right.buffer))).toBe(true);expect(actual.frameCount).toBeLessThanOrEqual(134400);
 }
 expect(await exclusive(60,96,32000,4.2,()=>true)).toBeNull();
},30000);
test("actual dry PCM preserves a delayed onset, exact duration, peak ceiling and duplicate superposition",async()=>{
 const render=createDryPianoRenderer(()=>Promise.resolve()),one=await render(plan(1,120,4,true),controls),two=await render(plan(2,120,4,true),controls);
 if(!one.ok||!two.ok)throw new Error("Real piano refused");
 expect(one.left.length).toBe(134400);expect(one.right.length).toBe(134400);expect(one.left.slice(0,64000).every(n=>n===0)).toBe(true);expect(one.right.slice(0,64000).every(n=>n===0)).toBe(true);
 expect(one.left.slice(64100,65000).some(n=>n!==0)).toBe(true);expect(one.left.slice(134000).every(n=>n===0)).toBe(true);
 // Independent Hann-windowed Goertzel check on the final 32 kHz dry PCM.
 const power=(hz:number):number=>{const coefficient=2*Math.cos(2*Math.PI*hz/32000);let previous=0,older=0;for(let i=0;i<16384;i++){const value=(one.left[74880+i]??0)*(0.5-0.5*Math.cos(2*Math.PI*i/16383))+coefficient*previous-older;older=previous;previous=value;}return previous*previous+older*older-coefficient*previous*older;};
 const middleC=261.6255653005986;expect(power(middleC)).toBeGreaterThan(3*power(middleC/2**(0.5/12)));expect(power(middleC)).toBeGreaterThan(3*power(middleC*2**(0.5/12)));
 expect(two.evidence.plannedNotes).toBe(2);expect(two.evidence.finishedNotes).toBe(2);
 for(const i of [64100,64500,65000,70000,80000])expect((two.left[i]??0)/two.peakReduction).toBeCloseTo(2*(one.left[i]??0)/one.peakReduction,5);
 expect(two.left.every(n=>Number.isFinite(n)&&Math.abs(n)<=0.900001)).toBe(true);expect(two.evidence.peakOwnedPcmBytes).toBeLessThanOrEqual(5222400);
 expect(two.evidence.scannedFrames).toBe(134400);expect(two.evidence.scaledFrames).toBe(134400);
},30000);
test("section projection starts at zero and keeps its own exact notes",async()=>{
 const doc=loopArrangementFixture().state.document,p=compileStudioPlaybackPlan(doc),range=studioSectionLoopRange(doc,"loop-section-1");if(!p.ok||range===null)throw new Error("Fixture");const projected=projectPlaybackPlanLoop(p.plan,range);if(!projected.ok)throw new Error(projected.refusal.code);
 const result=await createDryPianoRenderer(()=>Promise.resolve())(projected.plan,controls);if(!result.ok)throw new Error(result.message);expect(result.left.length).toBe(38400);expect(result.evidence.finishedNotes).toBe(4);expect(result.left.slice(100,900).some(n=>n!==0)).toBe(true);
},30000);
test("cancel during the largest individual note's first mix chunk releases ownership before another job",async()=>{
 let yields=0,cancelled=false;const render=createDryPianoRenderer(()=>{yields+=1;if(yields===2)cancelled=true;return Promise.resolve();});
 const result=await render(plan(1,60,4,false,true),{cancelled:()=>cancelled,progress:()=>{}});expect(result.ok).toBe(false);expect(result.evidence.termination).toBe("cancelled");expect(result.evidence.generatedFrames).toBeGreaterThan(32000);expect(result.evidence.mixedFrames).toBe(16384);expect(result.evidence.finishedNotes).toBe(0);expect("left"in result).toBe(false);
 cancelled=false;const next=await render(plan(),controls);expect(next.ok).toBe(true);
},30000);
test("unsupported register, duration and overlong gates refuse before note rendering",async()=>{
 const render=createDryPianoRenderer(()=>Promise.resolve());for(const p of [plan(1,120,-1),plan(1,20,4,true),plan(1,40)]){const r=await render(p,controls);expect(r.ok).toBe(false);expect(r.evidence.generatedFrames).toBe(0);expect(r.evidence.termination).toBe("refused");}
});

test("maximum admitted passage renders all 64 occurrences within declared deterministic PCM/work bounds",async()=>{
 const result=await createDryPianoRenderer(()=>Promise.resolve())(plan(16,60,4,false,false,4),controls);if(!result.ok)throw new Error(result.message);
 expect(result.left.length).toBe(518400);expect(result.evidence.plannedNotes).toBe(64);expect(result.evidence.finishedNotes).toBe(64);expect(result.evidence.generatedFrames).toBeLessThanOrEqual(8601600);expect(result.evidence.mixedFrames).toBe(result.evidence.generatedFrames);expect(result.evidence.scannedFrames).toBe(518400);expect(result.evidence.scaledFrames).toBe(518400);expect(result.evidence.peakOwnedPcmBytes).toBeLessThanOrEqual(5222400);expect(result.evidence.termination).toBe("complete");
},30000);
