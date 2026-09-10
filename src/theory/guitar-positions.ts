import {makeSpelledPitch,projectSpelledPitch,type SpelledPitch} from "../domain";

export const STANDARD_GUITAR_TUNING=Object.freeze([40,45,50,55,59,64] as const);
export type GuitarAssignment=Readonly<{occurrence:number;string:number;fret:number;pitch:SpelledPitch;midi:number}>;
export type GuitarPosition=Readonly<{
  /** Low E (string 6) first; null means mute. */
  frets:readonly (number|null)[];assignments:readonly GuitarAssignment[];
  span:number;highestFret:number;fretSum:number;
}>;
export type GuitarPositionSearch=Readonly<{
  status:"positions"|"no-position"|"unavailable";message:string;
  pitches:readonly SpelledPitch[];midi:readonly number[];positions:readonly GuitarPosition[];
  evidence:Readonly<{states:number;trials:number;completeAssignments:number;uniquePositions:number;retained:number;termination:"complete"|"input-refused"|"limit"}>;
}>;
function arrayInput(value:unknown):boolean{return Array.isArray(value);}
function compare(a:GuitarPosition,b:GuitarPosition):number{
  const rank=a.span-b.span||a.highestFret-b.highestFret||a.fretSum-b.fretSum;
  if(rank!==0)return rank;
  for(let i=0;i<6;i++){const difference=(a.frets[i]??21)-(b.frets[i]??21);if(difference!==0)return difference;}
  return 0;
}
/** Complete finite string assignment, preserving every written occurrence. */
export function findExactGuitarPositions(input:readonly SpelledPitch[]):GuitarPositionSearch {
  const pitches:SpelledPitch[]=[],midi:number[]=[],positions:GuitarPosition[]=[],seen=new Set<string>();
  let states=0,trials=0,completeAssignments=0;
  const result=(status:GuitarPositionSearch["status"],message:string,termination:GuitarPositionSearch["evidence"]["termination"]):GuitarPositionSearch=>Object.freeze({
    status,message,pitches:Object.freeze(pitches),midi:Object.freeze(midi),positions:Object.freeze(positions),
    evidence:Object.freeze({states,trials,completeAssignments,uniquePositions:seen.size,retained:positions.length,termination}),
  });
  if(!arrayInput(input)||input.length===0||input.length>16)return result("unavailable","Choose a voicing with 1–16 exact notes.","input-refused");
  for(const pitch of input){
    const made=makeSpelledPitch(pitch);if(!made.ok)return result("unavailable","A note has an unsupported spelling or octave.","input-refused");
    const projected=projectSpelledPitch(made.value);if(!projected.ok)return result("unavailable","A note is outside MIDI 0–127.","input-refused");
    pitches.push(made.value);midi.push(projected.value.midi);
  }
  if(pitches.length>6)return result("no-position","No supported position: more than six simultaneous notes require more than six strings.","complete");
  const picked:number[]=[],frets:(number|null)[]=Array.from({length:6},()=>null);
  const visit=(depth:number,used:number):boolean=>{
    if(states===1957)return false;states+=1;
    if(depth===pitches.length){
      completeAssignments+=1;const key=frets.map(f=>f===null?"x":String(f)).join(",");
      if(seen.has(key))return true;seen.add(key);
      const positive=frets.filter((f):f is number=>f!==null&&f>0);
      const highestFret=positive.length===0?0:Math.max(...positive);
      const span=positive.length===0?0:highestFret-Math.min(...positive);
      const assignments:GuitarAssignment[]=[];
      for(let occurrence=0;occurrence<pitches.length;occurrence++){
        const stringIndex=picked[occurrence],pitch=pitches[occurrence],note=midi[occurrence];
        if(stringIndex===undefined||pitch===undefined||note===undefined)throw new Error("Incomplete guitar assignment");
        const fret=frets[stringIndex];if(fret===null||fret===undefined)throw new Error("Missing guitar fret");
        assignments.push(Object.freeze({occurrence,string:6-stringIndex,fret,pitch,midi:note}));
      }
      positions.push(Object.freeze({frets:Object.freeze([...frets]),assignments:Object.freeze(assignments),span,highestFret,fretSum:positive.reduce((a,b)=>a+b,0)}));
      positions.sort(compare);if(positions.length>3)positions.pop();return true;
    }
    const note=midi[depth];if(note===undefined)return false;
    for(let stringIndex=0;stringIndex<6;stringIndex++){
      if(trials===7422)return false;trials+=1;
      if((used&(1<<stringIndex))!==0)continue;
      const open=STANDARD_GUITAR_TUNING[stringIndex];if(open===undefined)continue;
      const fret=note-open;if(fret<0||fret>20)continue;
      picked[depth]=stringIndex;frets[stringIndex]=fret;
      const completed=visit(depth+1,used|(1<<stringIndex));frets[stringIndex]=null;
      if(!completed)return false;
    }
    return true;
  };
  const completed=visit(0,0);
  if(!completed){positions.length=0;return result("unavailable","The finite position search reached its declared limit.","limit");}
  return result(positions.length>0?"positions":"no-position",positions.length>0?"Exact positions for this voicing.":"No supported position in standard tuning at frets 0–20. Your notes are unchanged.","complete");
}
