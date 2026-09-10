import {projectSpelledPitch} from "../domain";
import type {PlaybackPlan} from "../playback";
import {loadConcertGrandRenderer} from "./dsp-renderer";
export const DRY_PIANO_RATE=32000,DRY_PIANO_TAIL=6400,DRY_PIANO_MAX_FRAMES=518400;
export type DryPianoEvidence=Readonly<{plannedNotes:number;finishedNotes:number;generatedFrames:number;mixedFrames:number;scannedFrames:number;scaledFrames:number;yields:number;peakOwnedPcmBytes:number;termination:"complete"|"refused"|"cancelled"}>;
export type DryPianoResult=Readonly<{ok:true;left:Float32Array<ArrayBuffer>;right:Float32Array<ArrayBuffer>;sampleRate:32000;peakReduction:number;evidence:DryPianoEvidence}>|Readonly<{ok:false;message:string;evidence:DryPianoEvidence}>;
export type DryPianoControls=Readonly<{cancelled:()=>boolean;progress:(done:number,total:number)=>void}>;
export type DryPianoRenderPort=(plan:PlaybackPlan,controls:DryPianoControls)=>Promise<DryPianoResult>;
export function dryPianoFrame(tick:number,tempo:number):number{return Math.floor(tick*60*DRY_PIANO_RATE/(tempo*960)+0.5);}
export function dryPianoEnvelope(index:number,gate:number):number{
  return index>=gate+DRY_PIANO_TAIL-1?0:Math.min(1,index/64)*Math.max(0,1-Math.max(0,index-gate)/DRY_PIANO_TAIL);
}
const matches=(value:unknown,expected:number):boolean=>value===expected;
/** No graph creation or audible scheduling: bounded exact hybrid PCM only. */
export function createDryPianoRenderer(yieldTask:()=>Promise<void>):DryPianoRenderPort {
  let busy=false;
  return async(plan,controls)=>{
    const work={plannedNotes:0,finishedNotes:0,generatedFrames:0,mixedFrames:0,scannedFrames:0,scaledFrames:0,yields:0,peakOwnedPcmBytes:0};
    const evidence=(termination:DryPianoEvidence["termination"]):DryPianoEvidence=>Object.freeze({...work,termination});
    const refusal=(message:string):DryPianoResult=>Object.freeze({ok:false,message,evidence:evidence(controls.cancelled()?"cancelled":"refused")});
    if(busy)return refusal("The previous piano render is still releasing its buffers.");
    busy=true;
    try{
      if(controls.cancelled())return refusal("Piano render cancelled.");
      const rangeStart=plan.loopTicks?.start??0,rangeEnd=plan.loopTicks?.end??plan.totalTicks;
      if(!Number.isSafeInteger(rangeStart)||!Number.isSafeInteger(rangeEnd)||rangeStart<0||rangeEnd<=rangeStart||rangeEnd>plan.totalTicks)return refusal("The passage range is invalid.");
      if(!Number.isSafeInteger(plan.tempoBpm)||plan.tempoBpm<20||plan.tempoBpm>400||!matches(plan.midiPpq,960)||!Number.isSafeInteger(plan.totalTicks)||plan.totalTicks<=0||(rangeEnd-rangeStart)*60>16*plan.tempoBpm*960||plan.events.length<1||plan.events.length>32)return refusal("Choose a passage of at most 16 seconds and 32 attacks.");
      let previousEnd=rangeStart;
      const prepared:Readonly<{event:PlaybackPlan["events"][number];start:number;gate:number}>[]=[];
      for(const event of plan.events){
        if(!Number.isSafeInteger(event.startTick)||!Number.isSafeInteger(event.durationTicks)||!Number.isSafeInteger(event.gateDurationTicks)||event.startTick<previousEnd||event.durationTicks<1||event.gateDurationTicks<1||event.gateDurationTicks>event.durationTicks||event.startTick+event.durationTicks>rangeEnd||event.gateDurationTicks*60>4*plan.tempoBpm*960||!matches(event.velocity,96)||event.pitches.length<1||event.pitches.length>16||event.pitches.length!==event.midiPitches.length)return refusal("A chord's exact timing, gate or notes are outside this piano render's limits.");
        previousEnd=event.startTick+event.durationTicks;
        for(let i=0;i<event.pitches.length;i++){
          const pitch=event.pitches[i],midi=event.midiPitches[i];if(pitch===undefined||midi===undefined)return refusal("Missing exact note occurrence.");
          const p=projectSpelledPitch(pitch);if(!p.ok||p.value.midi!==midi||midi<21||midi>108)return refusal("Dry piano WAV supports MIDI 21–108. No notes were transposed or removed.");
          work.plannedNotes+=1;if(work.plannedNotes>64)return refusal("Choose a passage with at most 64 note occurrences.");
        }
        const start=dryPianoFrame(event.startTick-rangeStart,plan.tempoBpm),gate=dryPianoFrame(event.startTick-rangeStart+event.gateDurationTicks,plan.tempoBpm)-start;
        if(gate<1||gate>128000)return refusal("A note gate exceeds four seconds.");prepared.push(Object.freeze({event,start,gate}));
      }
      const renderer=await loadConcertGrandRenderer();if(controls.cancelled())return refusal("Piano render cancelled.");
      const render=renderer.renderNoteExclusive;if(render===undefined)return refusal("The approved piano renderer cannot reserve its working memory.");
      const frames=dryPianoFrame(rangeEnd-rangeStart,plan.tempoBpm)+DRY_PIANO_TAIL;
      if(frames>DRY_PIANO_MAX_FRAMES)return refusal("The passage exceeds the output frame limit.");
      const left=new Float32Array(frames),right=new Float32Array(frames),outputBytes=left.byteLength+right.byteLength;work.peakOwnedPcmBytes=outputBytes;
      const yieldAndCheck=async():Promise<boolean>=>{work.yields+=1;await yieldTask();return controls.cancelled();};
      for(const item of prepared)for(const midi of item.event.midiPitches){
        if(await yieldAndCheck())return refusal("Piano render cancelled.");
        const pcm=await render(midi,96,DRY_PIANO_RATE,(item.gate+DRY_PIANO_TAIL)/DRY_PIANO_RATE,controls.cancelled);
        if(controls.cancelled())return refusal("Piano render cancelled.");
        if(pcm===null||pcm.sampleRateHz!==DRY_PIANO_RATE||pcm.frameCount<1||pcm.frameCount>item.gate+DRY_PIANO_TAIL||pcm.left.length!==pcm.frameCount||pcm.right.length!==pcm.frameCount)return refusal("The piano could not render these exact notes.");
        work.generatedFrames+=pcm.frameCount;work.peakOwnedPcmBytes=Math.max(work.peakOwnedPcmBytes,outputBytes+pcm.left.byteLength+pcm.right.byteLength);
        for(let offset=0;offset<pcm.frameCount;offset+=16384){
          const end=Math.min(offset+16384,pcm.frameCount);
          for(let i=offset;i<end;i++){
            const l=pcm.left[i],r=pcm.right[i],at=item.start+i;if(l===undefined||r===undefined||!Number.isFinite(l)||!Number.isFinite(r)||at>=frames)return refusal("The piano returned invalid PCM; no file was prepared.");
            const gain=dryPianoEnvelope(i,item.gate);left[at]=(left[at]??0)+l*gain;right[at]=(right[at]??0)+r*gain;work.mixedFrames+=1;
          }
          if(await yieldAndCheck())return refusal("Piano render cancelled.");
        }
        work.finishedNotes+=1;controls.progress(work.finishedNotes,work.plannedNotes);
      }
      let peak=0;
      for(let offset=0;offset<frames;offset+=16384){for(let i=offset;i<Math.min(offset+16384,frames);i++){peak=Math.max(peak,Math.abs(left[i]??0),Math.abs(right[i]??0));work.scannedFrames+=1;}if(await yieldAndCheck())return refusal("Piano render cancelled.");}
      if(!Number.isFinite(peak)||peak===0)return refusal("The rendered passage contains no usable signal.");
      const peakReduction=Math.min(1,0.9/peak);
      for(let offset=0;offset<frames;offset+=16384){for(let i=offset;i<Math.min(offset+16384,frames);i++){left[i]=(left[i]??0)*peakReduction;right[i]=(right[i]??0)*peakReduction;work.scaledFrames+=1;}if(await yieldAndCheck())return refusal("Piano render cancelled.");}
      return Object.freeze({ok:true,left,right,sampleRate:DRY_PIANO_RATE,peakReduction,evidence:evidence("complete")});
    }catch{return refusal("The piano render failed. Your chart is unchanged.");}
    finally{busy=false;}
  };
}
