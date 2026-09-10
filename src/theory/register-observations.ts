import {makeSpelledPitch,projectSpelledPitch,type SpelledPitch} from "../domain";

export type RegisterNote=Readonly<{occurrence:number;pitch:SpelledPitch;midi:number}>;
export type RegisterPair=Readonly<{first:number;second:number;semitones:number}>;
export type RegisterObservations=Readonly<{
  notes:readonly RegisterNote[];minimumMidi:number;maximumMidi:number;span:number;belowC3:number;
  unisons:readonly RegisterPair[];lowClosePairs:readonly RegisterPair[];
}>;
export type RegisterObservationResult=Readonly<{
  ok:true;value:RegisterObservations;evidence:RegisterEvidence;
}>|Readonly<{ok:false;message:string;evidence:RegisterEvidence}>;
type RegisterEvidence=Readonly<{pitchValidations:number;pairVisits:number;retainedRecords:number;termination:"complete"|"input-refused"}>;
function objectInput(value:unknown):boolean{return value!==null&&typeof value==="object";}
function arrayInput(value:unknown):boolean{return Array.isArray(value);}
/** Descriptive exact-occurrence facts; no voice assignment or quality ranking. */
export function observeVoicingRegister(input:readonly SpelledPitch[]):RegisterObservationResult {
  let pitchValidations=0,pairVisits=0;
  const refuse=(message:string):RegisterObservationResult=>Object.freeze({ok:false,message,evidence:Object.freeze({pitchValidations,pairVisits,retainedRecords:0,termination:"input-refused"})});
  if(!arrayInput(input)||input.length===0||input.length>16)return refuse("Choose a voicing with 1–16 exact notes.");
  const notes:RegisterNote[]=[],unisons:RegisterPair[]=[],lowClosePairs:RegisterPair[]=[];
  let minimumMidi=127,maximumMidi=0,belowC3=0;
  for(let occurrence=0;occurrence<input.length;occurrence++){
    pitchValidations+=1;
    const candidate=input[occurrence];
    if(candidate===undefined||!objectInput(candidate))return refuse("A note has an unsupported spelling or octave.");
    const made=makeSpelledPitch(candidate);if(!made.ok)return refuse("A note has an unsupported spelling or octave.");
    const projected=projectSpelledPitch(made.value);if(!projected.ok)return refuse("A note is outside MIDI 0–127.");
    const midi=projected.value.midi;
    notes.push(Object.freeze({occurrence,pitch:made.value,midi}));
    minimumMidi=Math.min(minimumMidi,midi);maximumMidi=Math.max(maximumMidi,midi);
    if(midi<48)belowC3+=1;
  }
  for(let first=0;first<notes.length;first++)for(let second=first+1;second<notes.length;second++){
    const a=notes[first],b=notes[second];if(a===undefined||b===undefined)throw new Error("Missing validated occurrence");
    pairVisits+=1;const semitones=Math.abs(a.midi-b.midi);
    if(semitones===0)unisons.push(Object.freeze({first,second,semitones}));
    else if(a.midi<48&&b.midi<48&&semitones<=4)lowClosePairs.push(Object.freeze({first,second,semitones}));
  }
  return Object.freeze({ok:true,value:Object.freeze({notes:Object.freeze(notes),minimumMidi,maximumMidi,span:maximumMidi-minimumMidi,belowC3,unisons:Object.freeze(unisons),lowClosePairs:Object.freeze(lowClosePairs)}),
    evidence:Object.freeze({pitchValidations,pairVisits,retainedRecords:notes.length+unisons.length+lowClosePairs.length,termination:"complete"})});
}
