import { analyzeNoteFirst, type NoteFirstAnalysis } from "../theory";
import { makeCustomChordSpec, type ChordSpec, type CustomChordSpec, type SpelledPitch } from "../domain";

export type StudioNoteFirstSource = Readonly<{documentId:string;revision:number}>;
export type StudioNoteFirstDraft = Readonly<{source:StudioNoteFirstSource;text:string;analysis:NoteFirstAnalysis}>;
export type StudioNoteFirstChoice = Readonly<{name:string|null;customLabel:string;acknowledgeEnharmonic:boolean}>;
export function readNoteFirstDraft(source:StudioNoteFirstSource,text:string):StudioNoteFirstDraft {
  return Object.freeze({source:Object.freeze({...source}),text,analysis:analyzeNoteFirst(text)});
}
/** Recompute the naming choice; a caller-supplied analysis cannot authorize insertion. */
export function resolveNoteFirstChoice(text:string,choice:StudioNoteFirstChoice):
  Readonly<{ok:true;chord:ChordSpec|CustomChordSpec;pitches:readonly SpelledPitch[]}>|Readonly<{ok:false;message:string}> {
  const result=analyzeNoteFirst(text);
  if(!result.ok)return result;
  if(choice.name!==null){
    const candidate=result.candidates.find(c=>c.name===choice.name);
    if(candidate===undefined)return {ok:false,message:"That name is not a reading of these notes. Analyze the notes again."};
    if(!candidate.spellingExact&&!choice.acknowledgeEnharmonic)return {ok:false,message:"Acknowledge the different formula spelling before using this name. Your stored notes will stay exact."};
    if(candidate.spellingExact)return {ok:true,chord:candidate.chord,pitches:result.pitches};
    // F3 requires literal formula spelling for parsed Manual chords. An
    // acknowledged enharmonic name is a Custom label, never a forged AST.
    const custom=makeCustomChordSpec({kind:"custom",sourceText:candidate.name,label:candidate.name,pitchNames:result.pitches,bass:null});
    return custom.ok?{ok:true,chord:custom.value,pitches:result.pitches}:{ok:false,message:"The Custom reading could not be validated."};
  }
  const label=choice.customLabel.trim();
  let count=0,control=false;
  for(const character of label){count+=1;const code=character.codePointAt(0)??0;if(code<32||code===127)control=true;}
  if(count===0||count>64||control)return {ok:false,message:"Give this Custom voicing a label of 1–64 characters without control characters."};
  const made=makeCustomChordSpec({kind:"custom",sourceText:label,label,pitchNames:result.pitches,bass:null});
  if(!made.ok)return {ok:false,message:"The Custom chord could not be validated."};
  return {ok:true,chord:made.value,pitches:result.pitches};
}
