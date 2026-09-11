import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {NoteFirstGuitarPanel} from "./NoteFirstGuitarPanel";
import type { StudioController, StudioNoteFirstDraft, NoteFirstDraftEdit, NoteFirstKeyboardSpelling } from "../../application/runtime";

export type StudioNoteFirstPorts=Readonly<{
  documentId:string;revision:number;sections:readonly Readonly<{id:string;name:string}>[];
  read:StudioController["readNoteFirst"];insert:StudioController["insertNoteFirst"];
  hear:(text:string,input:"pointer"|"keyboard")=>ReturnType<StudioController["previewNoteFirst"]>;
  release:StudioController["releaseNoteFirst"];
  keys:StudioController["readNoteFirstKeyboard"];edit:StudioController["editNoteFirst"];
  guitar:StudioController["readNoteFirstGuitar"];
}>;
export function NoteFirstPanel({ports}:{ports:StudioNoteFirstPorts}){
  const [text,setText]=useState("");
  const [octave,setOctave]=useState(3),[spelling,setSpelling]=useState<NoteFirstKeyboardSpelling>("sharps");
  const keyboard=useMemo(()=>ports.keys(octave,spelling),[ports.keys,octave,spelling]);
  const octaveInput=useRef<HTMLSelectElement>(null),occurrences=useRef<HTMLOListElement>(null),removalFocus=useRef<number|null>(null);
  const [draft,setDraft]=useState<StudioNoteFirstDraft|null>(null);
  const [section,setSection]=useState("");
  const [choice,setChoice]=useState("custom");
  const [customLabel,setCustomLabel]=useState("");
  const [ack,setAck]=useState(false),[more,setMore]=useState(false),[notice,setNotice]=useState("");
  const latest=useRef(ports);latest.current=ports;
  useEffect(()=>()=>{void latest.current.release();},[]);
  useEffect(()=>{
    const index=removalFocus.current;if(index===null)return;removalFocus.current=null;
    const buttons=occurrences.current?.querySelectorAll<HTMLButtonElement>("button");
    (index>=0&&buttons!==undefined?buttons[Math.min(index,buttons.length-1)]:null)?.focus();
    if(index<0||buttons===undefined||buttons.length===0)octaveInput.current?.focus();
  },[draft,text]);
  const editDraft=(edit:NoteFirstDraftEdit):void=>{
    const result=ports.edit(text,edit);if(!result.ok){setNotice(result.message);return;}
    const next=result.value;setText(next.text);setDraft(next.text===""?null:next);setAck(false);setMore(false);
    setChoice(next.analysis.ok?next.analysis.candidates[0]?.name??"custom":"custom");
    setNotice(edit.kind==="clear"?"Draft cleared. Your chart is unchanged.":"");
    if(edit.kind!=="append")removalFocus.current=edit.kind==="remove"?edit.index:-1;
  };
  const analysis=draft?.analysis;
  const stale=draft!==null&&(draft.source.documentId!==ports.documentId||draft.source.revision!==ports.revision);
  const candidate=analysis?.ok?analysis.candidates.find(c=>c.name===choice):undefined;
  const allNames=analysis?.ok?analysis.candidates:[];
  const exactNames=allNames.filter(c=>c.spellingExact);
  const initialNames=(exactNames.length>0?exactNames:allNames).slice(0,3);
  const visibleNames=more?allNames:candidate!==undefined&&!initialNames.includes(candidate)?[...initialNames.slice(0,2),candidate]:initialNames;
  const valid=analysis?.ok===true&&!stale;
  const canAdd=valid&&ports.sections.some(s=>s.id===section)&&(choice==="custom"?customLabel.trim().length>0:candidate!==undefined&&(candidate.spellingExact||ack));
  const analyze=():void=>{
    void ports.release();const next=ports.read(text);setDraft(next);setAck(false);setMore(false);setNotice("");
    setChoice(next.analysis.ok?next.analysis.candidates[0]?.name??"custom":"custom");
  };
  return <details class="studio-note-first" onToggle={event=>{if(!event.currentTarget.open)void ports.release();}}>
    <summary>Start from notes</summary>
    <section aria-label="Note-first entry">
      <p>Know the voicing before the name? Enter up to 16 notes with octaves. We keep their spelling, order and doubles.</p>
      <label>Voicing notes<textarea class="studio-command-lane__input" rows={2} maxLength={512} spellcheck={false}
        placeholder="A3 C4 E4 G4" value={text} onInput={e=>{void ports.release();setText(e.currentTarget.value);setDraft(null);setNotice("");}} /></label>
      <fieldset class="studio-note-keyboard"><legend>Tap notes into your voicing</legend>
        <div class="studio-note-keyboard__controls">
          <label>Keyboard octave<select ref={octaveInput} value={octave} onChange={e=>{setOctave(Number(e.currentTarget.value));}}>{Array.from({length:11},(_v,i)=>i-1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <label>New black-key spelling<select value={spelling} onChange={e=>{setSpelling(e.currentTarget.value==="flats"?"flats":"sharps");}}><option value="sharps">Sharps (#)</option><option value="flats">Flats (b)</option></select></label>
        </div>
        <p>Each tap adds a note. Tap again to double it. Scroll sideways for all keys; Hear exact notes plays the voicing.</p>
        {keyboard.ok?<div class="studio-note-keyboard__scroll"><div class="studio-note-keyboard__keys">
          {keyboard.value.keys.map(key=><button key={key.note} type="button" class={key.black?"is-black":"is-white"}
            style={{left:`${String(key.column*56-(key.black?22:0))}px`}} aria-label={`Add ${key.note}`}
            disabled={key.midi===null||(analysis?.ok===true&&analysis.pitches.length>=16)} onClick={()=>{editDraft({kind:"append",note:key.note});}}>{key.note}</button>)}
        </div></div>:<p role="alert">{keyboard.message}</p>}
        {analysis?.ok?<><p>{analysis.pitches.length} of 16 note occurrences. Remove one without changing the others:</p>
          <ol ref={occurrences} class="studio-note-keyboard__notes">{analysis.normalizedText.split(" ").map((note,index)=><li key={index}><button type="button" aria-label={`Remove note ${String(index+1)}: ${note}`} onClick={()=>{editDraft({kind:"remove",index});}}>{index+1}. {note} ×</button></li>)}</ol></>:null}
        <button type="button" disabled={text.length===0} onClick={()=>{editDraft({kind:"clear"});}}>Clear draft notes</button>
      </fieldset>
      <button class="ui-button" type="button" onClick={analyze}>{stale?"Analyze again":"Find chord names"}</button>
      {analysis!==undefined&&!analysis.ok?<p role="alert">{analysis.message}</p>:null}
      {analysis?.ok?<>
        <p>Exact stored notes: <strong>{analysis.normalizedText}</strong></p>
        {stale?<p role="alert">The chart changed. Analyze again before adding these notes.</p>:null}
        {draft===null?null:<NoteFirstGuitarPanel draft={draft} stale={stale} read={ports.guitar}
          hear={input=>{const result=ports.hear(text,input);setNotice(result.ok?"Preview requested; your chart is unchanged.":result.refusal.message);}}
          release={()=>{void ports.release();}} />}
        <fieldset><legend>Choose a reading</legend>
          {visibleNames.map(c=><label key={c.name} style={{display:"block",padding:"0.5rem 0",overflowWrap:"anywhere"}}>
            <input type="radio" name="note-first-choice" value={c.name} checked={choice===c.name} onChange={()=>{setChoice(c.name);setAck(false);}} />
            {c.name} — {c.spellingExact?"exact spelling":"enharmonic reading"}. Formula: {c.formulaNotes.join(" ")}
          </label>)}
          {allNames.length>initialNames.length?<button class="ui-button" type="button" onClick={()=>{setMore(!more);}}>{more?"Fewer names":`All ${String(analysis.candidates.length)} names`}</button>:null}
          <label style={{display:"block",padding:"0.5rem 0"}}><input type="radio" name="note-first-choice" value="custom" checked={choice==="custom"} onChange={()=>{setChoice("custom");setAck(false);}} />Custom voicing</label>
          {choice==="custom"?<label>Custom label<input class="studio-command-lane__input" maxLength={64} value={customLabel} onInput={e=>{setCustomLabel(e.currentTarget.value);}} /></label>:null}
        </fieldset>
        {candidate!==undefined&&!candidate.spellingExact?<label style={{display:"block",padding:"0.5rem 0"}}><input type="checkbox" checked={ack} onChange={e=>{setAck(e.currentTarget.checked);}} />Use this name as a Custom label, keeping my exact notes.</label>:null}
        <label>Add one full bar to<select class="studio-command-lane__input" value={section} onChange={e=>{setSection(e.currentTarget.value);}}>
          <option value="">Choose a section</option>{ports.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <p>The new bar goes at the end of that section with Manual voicing. One Undo removes it.</p>
        <button class="ui-button" type="button" disabled={!valid} onClick={e=>{const result=ports.hear(text,e.detail===0?"keyboard":"pointer");setNotice(result.ok?"Preview requested; your chart is unchanged.":result.refusal.message);}}>Hear exact notes</button>
        <button class="ui-button" type="button" onClick={()=>{void ports.release();setNotice("Preview release requested.");}}>Release notes</button>
        <button class="ui-button" type="button" disabled={!canAdd} onClick={()=>{
          if(draft===null)return;void ports.release();
          const result=ports.insert(draft.source,text,{name:choice==="custom"?null:choice,customLabel,acknowledgeEnharmonic:ack},section);
          if(result.ok){setDraft(null);setText("");setNotice("Added one bar with your exact Manual voicing. Undo is available in the chart.");}
          else setNotice(result.refusal.message);
        }}>Add bar from notes</button>
      </>:null}
      <p role="status">{notice}</p>
    </section>
  </details>;
}
