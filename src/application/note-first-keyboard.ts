import {makeSpelledPitch,projectSpelledPitch} from "../domain";
import {analyzeNoteFirst} from "../theory";
import type {StudioInspectorResult} from "./studio-inspector";
import type {NoteFirstDraftEdit,NoteFirstKeyboard,NoteFirstKeyboardKey} from "./note-first-keyboard-contract";
const WHITE=["C","D","E","F","G","A","B"] as const;
/** Presentation positions are independent of pitch projection; no enharmonic repair. */
export function readNoteFirstKeyboard(octave:number,spelling:unknown):StudioInspectorResult<NoteFirstKeyboard>{
  if(!Number.isInteger(octave)||octave< -1||octave>9||(spelling!=="sharps"&&spelling!=="flats"))return {ok:false,code:"note-first.keyboard-range",message:"Choose an octave from -1 to 9 and sharp or flat black-key spelling."};
  const keys:NoteFirstKeyboardKey[]=[];
  const add=(step:string,alter:number,black:boolean,column:number):void=>{
    const note=step+(alter===1?"#":alter===-1?"b":"")+String(octave);
    const pitch=makeSpelledPitch({step,alter,octave}),projected=pitch.ok?projectSpelledPitch(pitch.value):null;
    keys.push(Object.freeze({note,black,column,midi:projected?.ok===true?projected.value.midi:null}));
  };
  WHITE.forEach((step,column)=>{
    add(step,0,false,column);
    if(step==="E"||step==="B")return;
    const next=WHITE[column+1];if(next===undefined)return;
    add(spelling==="sharps"?step:next,spelling==="sharps"?1:-1,true,column+1);
  });
  return {ok:true,value:Object.freeze({octave,spelling,keys:Object.freeze(keys)})};
}
/** Existing parser is the sole authority; edits operate on exact occurrences. */
export function editNoteFirstText(text:string,edit:NoteFirstDraftEdit):StudioInspectorResult<string>{
  if(edit.kind==="clear")return {ok:true,value:""};
  const current=analyzeNoteFirst(text);
  if(!current.ok&&current.code!=="note-first.empty")return {ok:false,code:current.code,message:"Finish or clear the typed notes before editing with the keyboard. Your draft is unchanged."};
  const notes=current.ok?current.normalizedText.split(" "):[];
  if(edit.kind==="append"){
    if(notes.length>=16)return {ok:false,code:"note-first.limit",message:"All 16 note slots are used. Remove an occurrence before adding another."};
    const added=analyzeNoteFirst(edit.note);
    if(!added.ok||added.pitches.length!==1)return {ok:false,code:"note-first.pitch-invalid",message:"Choose one supported note with an octave. Your draft is unchanged."};
    notes.push(added.normalizedText);
  }else{
    if(!Number.isInteger(edit.index)||edit.index<0||edit.index>=notes.length)return {ok:false,code:"note-first.occurrence",message:"That note occurrence is no longer available. Your draft is unchanged."};
    notes.splice(edit.index,1);
  }
  return {ok:true,value:notes.join(" ")};
}
