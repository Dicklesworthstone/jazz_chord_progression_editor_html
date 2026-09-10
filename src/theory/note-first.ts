import { makeSpelledPitch, projectSpelledPitch, SPELLING_STEP_ORDER, type ChordSpec, type SpelledPitch, type SpelledPitchClass } from "../domain";
import { parseChordSymbol, formatChordSymbol } from "./chord-symbol";
import { resolveChord } from "./chord-resolution";
import { REVERSE_CHORD_TEMPLATES } from "./reverse-chord-templates";

export type NoteFirstCandidate = Readonly<{
  name: string;
  chord: ChordSpec;
  spellingExact: boolean;
  formulaNotes: readonly string[];
  templateId: string;
}>;
type Evidence = Readonly<{roots:number;cells:number;retained:number}>;
export type NoteFirstAnalysis = Readonly<{evidence:Evidence}> & (
  Readonly<{ok:false;code:"note-first.empty"|"note-first.limit"|"note-first.pitch-invalid";message:string}> |
  Readonly<{ok:true;pitches:readonly SpelledPitch[];midi:readonly number[];normalizedText:string;candidates:readonly NoteFirstCandidate[]}>
);
const SUFFIXES:Readonly<Record<string,string>>=Object.freeze({
  "base-major":"", "base-minor":"m", "base-diminished":"dim", "base-augmented":"aug", "base-sus2":"sus2", "base-sus4":"sus4",
  "sixth-major":"6", "sixth-minor":"m6", "seventh-major":"maj7", "seventh-dominant":"7", "seventh-minor":"m7",
  "seventh-minor-major":"mMaj7", "seventh-half-diminished":"m7b5", "seventh-diminished":"dim7", "seventh-augmented-major":"aug(maj7)", "extension-suspended-dominant":"7sus4",
});
const templates=REVERSE_CHORD_TEMPLATES.filter(t=>Object.hasOwn(SUFFIXES,t.formulaRuleId));
function name(pitch:SpelledPitchClass):string {return pitch.step+(pitch.alter<0?"b".repeat(-pitch.alter):"#".repeat(pitch.alter));}
function alteration(text:string):number {
  if(text===""||text==="♮")return 0;
  if(text==="#"||text==="♯")return 1;
  if(text==="##"||text==="♯♯"||text==="x")return 2;
  return text.length===1?-1:-2;
}
/** Finite naming alternatives; pitch-class equivalence never becomes exact spelling. */
export function analyzeNoteFirst(text:string):NoteFirstAnalysis {
  let roots=0,cells=0,retained=0;
  const evidence=():Evidence=>Object.freeze({roots,cells,retained});
  const refuse=(code:Extract<NoteFirstAnalysis,{ok:false}>["code"],message:string):NoteFirstAnalysis=>Object.freeze({ok:false,code,message,evidence:evidence()});
  if(typeof text!=="string"||text.length>512||Array.from(text).length>256)return refuse("note-first.limit","Use at most 256 characters and 16 notes.");
  if(text.trim()==="")return refuse("note-first.empty","Enter notes with octaves, for example A3 C4 E4 G4.");
  const tokens=text.trim().split(/[\s,]+/u).filter(token=>token.length>0);
  if(tokens.length>16)return refuse("note-first.limit","A voicing can contain at most 16 note occurrences, including duplicates.");
  const pitches:SpelledPitch[]=[],midi:number[]=[];
  let mask=0;
  for(const token of tokens){
    const parsed=/^([A-Ga-g])(#|##|b|bb|x|♯|♯♯|♭|♭♭|♮)?([+-]?\d{1,2})$/u.exec(token);
    if(parsed===null)return refuse("note-first.pitch-invalid",`“${token}” is not a supported spelled note with an octave.`);
    const made=makeSpelledPitch({step:(parsed[1]??"").toUpperCase(),alter:alteration(parsed[2]??""),octave:Number(parsed[3])});
    if(!made.ok)return refuse("note-first.pitch-invalid",`“${token}” is outside the supported spelling range.`);
    const projected=projectSpelledPitch(made.value);
    if(!projected.ok)return refuse("note-first.pitch-invalid",`“${token}” is outside MIDI notes 0–127.`);
    pitches.push(made.value);midi.push(projected.value.midi);mask|=1<<projected.value.pitchClass;
  }
  const bassIndex=midi.indexOf(Math.min(...midi)),bass=pitches[bassIndex],bassMidi=midi[bassIndex];
  if(bass===undefined||bassMidi===undefined)return refuse("note-first.empty","Enter at least one note.");
  const inputSpellings=new Set(pitches.map(name));
  const ranked:{candidate:NoteFirstCandidate;rootPosition:boolean;complexity:number;template:number}[]=[];
  if(templates.length>32)return refuse("note-first.limit","The reviewed naming vocabulary exceeds its declared bound.");
  for(const step of SPELLING_STEP_ORDER)for(const alter of [-2,-1,0,1,2]){
    roots+=1;
    const root=makeSpelledPitch({step,alter,octave:4});if(!root.ok)continue;
    const projection=projectSpelledPitch(root.value);if(!projection.ok)continue;
    const pc=projection.value.pitchClass;
    for(let index=0;index<templates.length;index++){
      cells+=1;if(cells>1120)return refuse("note-first.limit","The naming search reached its deterministic limit.");
      const template=templates[index];if(template===undefined||(mask&(1<<pc))===0)continue;
      let candidateMask=0;for(const offset of template.pitchClassOffsets)candidateMask|=1<<((pc+offset)%12);
      if(candidateMask!==mask)continue;
      const rootPosition=pc===bassMidi%12;
      const symbol=name(root.value)+(SUFFIXES[template.formulaRuleId]??"")+(rootPosition?"":"/"+name(bass));
      const parsed=parseChordSymbol(symbol,"ascii");if(!parsed.ok)continue;
      const resolved=resolveChord(parsed.chord);if(!resolved.ok)continue;
      const realization=resolved.value.realizations[0];
      let resolvedMask=0;for(const tone of realization.pitchClasses)resolvedMask|=1<<tone;
      if(resolvedMask!==mask)continue;
      const expected=realization.spelledPitchNames.map(name),set=new Set(expected);
      const spellingExact=set.size===inputSpellings.size&&[...inputSpellings].every(p=>set.has(p));
      const formatted=formatChordSymbol(parsed.chord,"ascii");if(!formatted.ok)continue;
      const candidate=Object.freeze({name:formatted.canonicalText,chord:parsed.chord,spellingExact,formulaNotes:Object.freeze(expected),templateId:template.id});
      ranked.push({candidate,rootPosition,complexity:Math.abs(alter),template:index});retained+=1;
    }
  }
  ranked.sort((a,b)=>Number(b.candidate.spellingExact)-Number(a.candidate.spellingExact)||Number(b.rootPosition)-Number(a.rootPosition)||a.complexity-b.complexity||a.template-b.template||(a.candidate.name<b.candidate.name?-1:a.candidate.name>b.candidate.name?1:0));
  return Object.freeze({ok:true,pitches:Object.freeze(pitches),midi:Object.freeze(midi),normalizedText:pitches.map(p=>name(p)+String(p.octave)).join(" "),candidates:Object.freeze(ranked.map(r=>r.candidate)),evidence:evidence()});
}
